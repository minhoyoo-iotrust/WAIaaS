/**
 * ERC-8128 Routes: POST /v1/erc8128/sign + POST /v1/erc8128/verify
 *
 * HTTP message signing using RFC 9421 + EIP-191 Ethereum signatures.
 *
 * Sign flow:
 * 1. Feature gate check (erc8128.enabled)
 * 2. Wallet resolution + EVM chain verification
 * 3. Domain policy evaluation (ERC8128_ALLOWED_DOMAINS -- default deny)
 * 4. Per-domain rate limit check
 * 5. Private key decryption + signHttpMessage
 * 6. Key material zeroing + notification
 *
 * Verify flow:
 * 1. Feature gate check
 * 2. verifyHttpSignature (address recovery + expiry)
 *
 * @see packages/core/src/erc8128 (signing engine from Phase 327)
 * @see packages/daemon/src/services/erc8128/erc8128-domain-policy.ts (domain evaluator)
 */

import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import { eq, or, and, isNull, desc } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { WAIaaSError, NETWORK_TO_CAIP2, type NetworkType, erc8128 as erc8128Core } from '@waiaas/core';
import type { EventBus } from '@waiaas/core';
import type { MasterPasswordRef } from '../middleware/master-auth.js';
import { wallets, policies } from '../../infrastructure/database/schema.js';
import type * as schema from '../../infrastructure/database/schema.js';
import type { LocalKeyStore } from '../../infrastructure/keystore/keystore.js';
import { evaluateErc8128Domain, checkErc8128RateLimit } from '../../services/erc8128/erc8128-domain-policy.js';
import type { NotificationService } from '../../notifications/notification-service.js';
import type { SettingsService } from '../../infrastructure/settings/settings-service.js';
import { buildErrorResponses, openApiValidationHook } from './openapi-schemas.js';
import { resolveWalletId } from '../helpers/resolve-wallet-id.js';
import { resolveNetwork } from '../../pipeline/network-resolver.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Erc8128RouteDeps {
  db: BetterSQLite3Database<typeof schema>;
  keyStore: LocalKeyStore;
  masterPassword: string;
  passwordRef?: MasterPasswordRef;
  notificationService?: NotificationService;
  settingsService?: SettingsService;
  eventBus?: EventBus;
}

// ---------------------------------------------------------------------------
// Route definitions
// ---------------------------------------------------------------------------

const erc8128SignRoute = createRoute({
  method: 'post',
  path: '/erc8128/sign',
  tags: ['ERC-8128'],
  summary: 'Sign HTTP request with ERC-8128',
  description:
    'Generate RFC 9421 Signature-Input + Signature + Content-Digest headers ' +
    'for an HTTP request, using the wallet\'s EVM private key with EIP-191 signing.',
  request: {
    body: {
      content: {
        'application/json': {
          schema: z.object({
            url: z.string().url(),
            method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']).default('GET'),
            headers: z.record(z.string()).optional(),
            body: z.string().optional(),
            walletId: z.string().uuid().optional().describe('Target wallet ID (auto-resolved if session has single wallet)'),
            network: z.string().optional().describe('EVM network for chainId resolution (e.g., ethereum-mainnet)'),
            preset: z.enum(['minimal', 'standard', 'strict']).optional(),
            ttlSec: z.number().int().min(10).max(3600).optional(),
            nonce: z.union([z.string(), z.literal(false)]).optional(),
            coveredComponents: z.array(z.string()).optional(),
          }),
        },
      },
    },
  },
  responses: {
    200: {
      description: 'Signature headers for the HTTP request',
      content: {
        'application/json': {
          schema: z.object({
            signatureInput: z.string(),
            signature: z.string(),
            contentDigest: z.string().optional(),
            keyid: z.string(),
            algorithm: z.string(),
            created: z.number(),
            expires: z.number(),
            coveredComponents: z.array(z.string()),
          }),
        },
      },
    },
    ...buildErrorResponses([
      'ERC8128_DISABLED',
      'ERC8128_DOMAIN_NOT_ALLOWED',
      'ERC8128_RATE_LIMITED',
      'WALLET_NOT_FOUND',
      'UNSUPPORTED_CHAIN',
    ]),
  },
});

const erc8128VerifyRoute = createRoute({
  method: 'post',
  path: '/erc8128/verify',
  tags: ['ERC-8128'],
  summary: 'Verify ERC-8128 signed HTTP request',
  description:
    'Verify an HTTP request signed with ERC-8128 (RFC 9421 + EIP-191). ' +
    'Recovers the signer address, checks digest integrity, and validates expiry.',
  request: {
    body: {
      content: {
        'application/json': {
          schema: z.object({
            url: z.string().url(),
            method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']).default('GET'),
            headers: z.record(z.string()),
            body: z.string().optional(),
          }),
        },
      },
    },
  },
  responses: {
    200: {
      description: 'Verification result',
      content: {
        'application/json': {
          schema: z.object({
            valid: z.boolean(),
            recoveredAddress: z.string().nullable(),
            keyid: z.string(),
            error: z.string().optional(),
          }),
        },
      },
    },
    ...buildErrorResponses(['ERC8128_DISABLED']),
  },
});

// ---------------------------------------------------------------------------
// Policy resolution helper
// ---------------------------------------------------------------------------

/**
 * Resolve ERC8128_ALLOWED_DOMAINS policies with 4-level override priority.
 * Identical pattern to resolveX402DomainPolicies.
 */
function resolveErc8128DomainPolicies(
  rows: Array<{
    id: string;
    walletId: string | null;
    type: string;
    rules: string;
    priority: number;
    enabled: boolean | null;
    network: string | null;
  }>,
  walletId: string,
): Array<{
  id: string;
  walletId: string | null;
  type: string;
  rules: string;
  priority: number;
  enabled: boolean | null;
  network: string | null;
}> {
  const typeMap = new Map<string, (typeof rows)[number]>();

  // Phase 1: global + all-networks (lowest priority)
  for (const row of rows) {
    if (row.walletId === null && row.network === null) {
      typeMap.set(row.type, row);
    }
  }

  // Phase 2: global + network-specific
  for (const row of rows) {
    if (row.walletId === null && row.network !== null) {
      typeMap.set(row.type, row);
    }
  }

  // Phase 3: wallet-specific + all-networks
  for (const row of rows) {
    if (row.walletId === walletId && row.network === null) {
      typeMap.set(row.type, row);
    }
  }

  // Phase 4: wallet-specific + network-specific (highest priority)
  for (const row of rows) {
    if (row.walletId === walletId && row.network !== null) {
      typeMap.set(row.type, row);
    }
  }

  return Array.from(typeMap.values());
}

// ---------------------------------------------------------------------------
// Route factory
// ---------------------------------------------------------------------------

/**
 * Create ERC-8128 route sub-router.
 *
 * POST /erc8128/sign -> Sign HTTP request
 * POST /erc8128/verify -> Verify HTTP signature
 */
export function erc8128Routes(deps: Erc8128RouteDeps): OpenAPIHono {
  const router = new OpenAPIHono({ defaultHook: openApiValidationHook });

  // -------------------------------------------------------------------------
  // POST /erc8128/sign
  // -------------------------------------------------------------------------
  router.openapi(erc8128SignRoute, async (c) => {
    // 1. Feature gate
    const enabled = deps.settingsService?.get('erc8128.enabled');
    if (enabled !== 'true') {
      throw new WAIaaSError('ERC8128_DISABLED', {
        message: 'ERC-8128 signed HTTP requests are disabled',
      });
    }

    // 2. Parse request + resolve walletId
    const body = c.req.valid('json');
    const walletId = resolveWalletId(c, deps.db, body.walletId);

    // 3. Extract target domain
    const targetDomain = new URL(body.url).hostname;

    // 4. Load ERC8128_ALLOWED_DOMAINS policies
    const policyRows = deps.db
      .select()
      .from(policies)
      .where(
        and(
          or(eq(policies.walletId, walletId), isNull(policies.walletId)),
          eq(policies.type, 'ERC8128_ALLOWED_DOMAINS'),
          eq(policies.enabled, true),
        ),
      )
      .orderBy(desc(policies.priority))
      .all();

    // 5. 4-level override resolution
    const resolvedPolicies = resolveErc8128DomainPolicies(policyRows, walletId);

    // 6. Evaluate domain policy
    const domainResult = evaluateErc8128Domain(resolvedPolicies, targetDomain, deps.settingsService);
    if (domainResult && !domainResult.allowed) {
      void deps.notificationService?.notify('ERC8128_DOMAIN_BLOCKED', walletId, {
        domain: targetDomain,
        reason: domainResult.reason ?? 'Domain not allowed',
      });
      throw new WAIaaSError('ERC8128_DOMAIN_NOT_ALLOWED', {
        message: domainResult.reason ?? `Domain '${targetDomain}' not allowed for ERC-8128 signing`,
      });
    }

    // 7. Rate limit check
    const rateLimitRpm = (() => {
      // Check policy rules for rate_limit_rpm
      const policy = resolvedPolicies.find((p) => p.type === 'ERC8128_ALLOWED_DOMAINS');
      if (policy) {
        try {
          const rules = JSON.parse(policy.rules) as { rate_limit_rpm?: number };
          if (rules.rate_limit_rpm) return rules.rate_limit_rpm;
        } catch { /* ignore parse errors */ }
      }
      // Fallback to settings
      const settingVal = deps.settingsService?.get('erc8128.default_rate_limit_rpm');
      return settingVal ? parseInt(settingVal, 10) || 60 : 60;
    })();

    if (!checkErc8128RateLimit(targetDomain, rateLimitRpm)) {
      throw new WAIaaSError('ERC8128_RATE_LIMITED', {
        message: `Rate limit exceeded for domain '${targetDomain}' (${rateLimitRpm} requests/min)`,
      });
    }

    // 8. Look up wallet + verify EVM chain
    const wallet = deps.db.select().from(wallets).where(eq(wallets.id, walletId)).get();
    if (!wallet) {
      throw new WAIaaSError('WALLET_NOT_FOUND', {
        message: `Wallet '${walletId}' not found`,
      });
    }

    if (wallet.chain !== 'ethereum') {
      throw new WAIaaSError('UNSUPPORTED_CHAIN', {
        message: 'ERC-8128 signing is only supported for EVM wallets',
      });
    }

    // 9. Resolve network + chainId
    const resolvedNetwork = body.network
      ? body.network as NetworkType
      : resolveNetwork(
          undefined,
          wallet.environment as 'mainnet' | 'testnet',
          'ethereum',
        );

    const caip2 = NETWORK_TO_CAIP2[resolvedNetwork];
    if (!caip2) {
      throw new WAIaaSError('UNSUPPORTED_CHAIN', {
        message: `Cannot determine chainId for network '${resolvedNetwork}'`,
      });
    }
    const chainId = parseInt(caip2.split(':')[1]!, 10);

    // 10. Decrypt private key
    const pkBytes = await deps.keyStore.decryptPrivateKey(
      walletId,
      deps.passwordRef?.password ?? deps.masterPassword,
    );

    try {
      const privateKey = `0x${Buffer.from(pkBytes).toString('hex')}` as `0x${string}`;

      // 11. Read settings defaults
      const preset = body.preset ??
        (deps.settingsService?.get('erc8128.default_preset') as 'minimal' | 'standard' | 'strict' || 'standard');
      const ttlSec = body.ttlSec ??
        (parseInt(deps.settingsService?.get('erc8128.default_ttl_sec') ?? '300', 10) || 300);
      const nonce = body.nonce ??
        (deps.settingsService?.get('erc8128.default_nonce') === 'false' ? false : undefined);

      // 12. Sign HTTP message
      const result = await erc8128Core.signHttpMessage({
        method: body.method ?? 'GET',
        url: body.url,
        headers: body.headers ?? {},
        body: body.body,
        privateKey,
        chainId,
        address: wallet.publicKey,
        preset,
        ttlSec,
        nonce,
        coveredComponents: body.coveredComponents,
      });

      // 13. Fire success notification
      void deps.notificationService?.notify('ERC8128_SIGNATURE_CREATED', walletId, {
        domain: targetDomain,
        method: body.method ?? 'GET',
        preset,
      });

      // 14. Return result
      return c.json({
        signatureInput: result.headers['Signature-Input'],
        signature: result.headers['Signature'],
        contentDigest: result.headers['Content-Digest'],
        keyid: result.keyid,
        algorithm: result.algorithm,
        created: result.created,
        expires: result.expires,
        coveredComponents: result.coveredComponents,
      }, 200);
    } finally {
      // 15. Zero-fill private key material
      pkBytes.fill(0);
    }
  });

  // -------------------------------------------------------------------------
  // POST /erc8128/verify
  // -------------------------------------------------------------------------
  router.openapi(erc8128VerifyRoute, async (c) => {
    // 1. Feature gate
    const enabled = deps.settingsService?.get('erc8128.enabled');
    if (enabled !== 'true') {
      throw new WAIaaSError('ERC8128_DISABLED', {
        message: 'ERC-8128 signed HTTP requests are disabled',
      });
    }

    // 2. Parse request
    const body = c.req.valid('json');

    // 3. Verify signature
    const result = await erc8128Core.verifyHttpSignature({
      method: body.method ?? 'GET',
      url: body.url,
      headers: body.headers,
      body: body.body,
    });

    // 4. Return result
    return c.json({
      valid: result.valid,
      recoveredAddress: result.recoveredAddress,
      keyid: result.keyid,
      error: result.error,
    }, 200);
  });

  return router;
}
