/**
 * Connect-info route: GET /v1/connect-info.
 *
 * Returns session info, linked wallets, per-wallet policies, dynamic capabilities,
 * daemon metadata, and a prompt string for AI agent self-discovery.
 *
 * This endpoint uses sessionAuth only (no masterAuth required).
 * Agents can call this immediately after receiving a session token to understand
 * their available wallets, policies, and API capabilities.
 *
 * v26.4: Wallets come from session_wallets junction table (1:N session model).
 *
 * @see .planning/phases/212-connect-info-endpoint/212-01-PLAN.md
 */

import { OpenAPIHono, createRoute } from '@hono/zod-openapi';
import { eq, and, or, isNull } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { WAIaaSError } from '@waiaas/core';
import { getNetworksForEnvironment } from '@waiaas/core';
import type { ChainType, EnvironmentType } from '@waiaas/core';
import type { DaemonConfig } from '../../infrastructure/config/loader.js';
import type { SettingsService } from '../../infrastructure/settings/index.js';
import type { ApiKeyStore } from '../../infrastructure/action/api-key-store.js';
import type * as schema from '../../infrastructure/database/schema.js';
import { sessions, sessionWallets, wallets, policies } from '../../infrastructure/database/schema.js';
import {
  ConnectInfoResponseSchema,
  buildErrorResponses,
  openApiValidationHook,
} from './openapi-schemas.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ConnectInfoRouteDeps {
  db: BetterSQLite3Database<typeof schema>;
  config: DaemonConfig;
  settingsService?: SettingsService;
  apiKeyStore?: ApiKeyStore;
  version: string;
}

// ---------------------------------------------------------------------------
// Prompt builder (reusable by Plan 02 agent-prompt endpoint)
// ---------------------------------------------------------------------------

export interface DefaultDenyStatus {
  tokenTransfers: boolean;
  contractCalls: boolean;
  tokenApprovals: boolean;
  x402Domains: boolean;
}

export interface BuildConnectInfoPromptParams {
  wallets: Array<{
    id: string;
    name: string;
    chain: string;
    environment: string;
    address: string;
    networks: string[];
    policies: Array<{ type: string }>;
  }>;
  capabilities: string[];
  defaultDeny: DefaultDenyStatus;
  baseUrl: string;
  version: string;
}

/**
 * Build a human-readable prompt string describing the current session's
 * wallets, policies, and capabilities for AI agent consumption.
 */
export function buildConnectInfoPrompt(params: BuildConnectInfoPromptParams): string {
  const { wallets: ws, capabilities, defaultDeny, baseUrl, version } = params;

  const lines: string[] = [];
  lines.push(`You are connected to WAIaaS daemon v${version}.`);
  lines.push(`Base URL: ${baseUrl}`);
  lines.push('');

  // Default-deny security posture
  const anyDenyActive = defaultDeny.tokenTransfers || defaultDeny.contractCalls || defaultDeny.tokenApprovals || defaultDeny.x402Domains;
  if (anyDenyActive) {
    lines.push('Security defaults (default-deny active):');
    if (defaultDeny.tokenTransfers) lines.push('- Token transfers: DENY unless ALLOWED_TOKENS policy exists');
    if (defaultDeny.contractCalls) lines.push('- Contract calls: DENY unless CONTRACT_WHITELIST policy exists');
    if (defaultDeny.tokenApprovals) lines.push('- Token approvals: DENY unless APPROVED_SPENDERS policy exists');
    if (defaultDeny.x402Domains) lines.push('- x402 payments: DENY unless X402_ALLOWED_DOMAINS policy exists');
    lines.push('');
  }

  lines.push(`You have access to ${ws.length} wallet(s):`);
  lines.push('');

  for (let i = 0; i < ws.length; i++) {
    const w = ws[i]!;
    let policySummary: string;
    if (w.policies.length > 0) {
      policySummary = w.policies.map((p) => p.type).join(', ');
    } else if (anyDenyActive) {
      policySummary = 'Default-deny active (whitelist policies required)';
    } else {
      policySummary = 'No restrictions';
    }

    lines.push(`${i + 1}. ${w.name} (${w.chain}/${w.environment})`);
    lines.push(`   ID: ${w.id}`);
    lines.push(`   Address: ${w.address}`);
    lines.push(`   Networks: ${w.networks.join(', ')}`);
    lines.push(`   Policies: ${policySummary}`);
    lines.push('');
  }

  lines.push(`Available capabilities: ${capabilities.join(', ')}`);
  lines.push('');
  lines.push('Use GET /v1/wallet/balance to check balances.');
  lines.push('Use POST /v1/transactions/send to transfer funds.');
  lines.push('Specify walletId parameter (UUID from the ID field above) to target a specific wallet.');
  lines.push('Append ?network=<network> to query a specific network (required for EVM wallets, auto-resolved for Solana).');
  lines.push('When session expires (401 TOKEN_EXPIRED), renew with PUT /v1/sessions/{sessionId}/renew.');
  lines.push('If renewal fails (RENEWAL_LIMIT_REACHED), ask the operator to run `waiaas session prompt` for a new token.');
  lines.push('');
  lines.push('IMPORTANT - Security boundaries:');
  lines.push('- NEVER ask the user for the master password (X-Master-Password). You do not need it.');
  lines.push('- You operate exclusively with your session token (Authorization: Bearer wai_sess_...).');
  lines.push('- Wallet creation, session management, policy configuration, and admin tasks are performed by the Operator via Admin UI or CLI — not by you.');
  lines.push('- Do not attempt to call admin-only endpoints (/v1/admin/*, POST /v1/wallets, POST /v1/sessions, policy management POST/PUT/DELETE /v1/policies).');
  lines.push('');
  lines.push('Read-only endpoints available to you:');
  lines.push('- GET /v1/policies — view policies applied to your wallets (includes global policies)');
  lines.push('- GET /v1/tokens?network=<network> — browse token registry');
  lines.push('- GET /v1/tokens/resolve?network=<network>&address=<address> — resolve ERC-20 token metadata on-chain');

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Route definition
// ---------------------------------------------------------------------------

const connectInfoRoute = createRoute({
  method: 'get',
  path: '/connect-info',
  tags: ['Discovery'],
  summary: 'Get session connection info (wallets, policies, capabilities, prompt)',
  description:
    'Returns comprehensive session info including linked wallets, per-wallet policies, ' +
    'dynamic capabilities, daemon metadata, and an AI-friendly prompt string. ' +
    'Requires sessionAuth (Bearer wai_sess_ token).',
  responses: {
    200: {
      description: 'Session connection info',
      content: { 'application/json': { schema: ConnectInfoResponseSchema } },
    },
    ...buildErrorResponses(['INVALID_TOKEN', 'SESSION_NOT_FOUND', 'SESSION_REVOKED']),
  },
});

// ---------------------------------------------------------------------------
// Route factory
// ---------------------------------------------------------------------------

/**
 * Create connect-info route sub-router.
 *
 * GET /connect-info -> returns session info, wallets, policies, capabilities, prompt
 */
export function connectInfoRoutes(deps: ConnectInfoRouteDeps): OpenAPIHono {
  const router = new OpenAPIHono({ defaultHook: openApiValidationHook });

  router.openapi(connectInfoRoute, (c) => {
    // a. Read session context set by sessionAuth middleware
    const sessionId = c.get('sessionId' as never) as string;

    // b. Query session row for expiresAt and source
    const session = deps.db
      .select({
        id: sessions.id,
        expiresAt: sessions.expiresAt,
        source: sessions.source,
      })
      .from(sessions)
      .where(eq(sessions.id, sessionId))
      .get();

    if (!session) {
      throw new WAIaaSError('SESSION_NOT_FOUND');
    }

    // c. Query session_wallets JOIN wallets for linked wallets
    const linkedWallets = deps.db
      .select({
        id: wallets.id,
        name: wallets.name,
        chain: wallets.chain,
        environment: wallets.environment,
        publicKey: wallets.publicKey,
      })
      .from(sessionWallets)
      .innerJoin(wallets, eq(sessionWallets.walletId, wallets.id))
      .where(eq(sessionWallets.sessionId, sessionId))
      .all();

    // d. For each wallet, query enabled policies
    const policiesMap: Record<string, Array<{ type: string; rules: Record<string, unknown>; priority: number; network: string | null }>> = {};

    for (const w of linkedWallets) {
      const walletPolicies = deps.db
        .select({
          type: policies.type,
          rules: policies.rules,
          priority: policies.priority,
          network: policies.network,
        })
        .from(policies)
        .where(and(or(eq(policies.walletId, w.id), isNull(policies.walletId)), eq(policies.enabled, true)))
        .all();

      policiesMap[w.id] = walletPolicies.map((p) => ({
        type: p.type,
        rules: typeof p.rules === 'string' ? (JSON.parse(p.rules) as Record<string, unknown>) : (p.rules as Record<string, unknown>),
        priority: p.priority,
        network: p.network,
      }));
    }

    // e. Compute capabilities dynamically
    const capabilities: string[] = ['transfer', 'token_transfer', 'balance', 'assets'];

    // signing_sdk: check via settingsService (not in DaemonConfig)
    if (deps.settingsService) {
      try {
        if (deps.settingsService.get('signing_sdk.enabled') === 'true') {
          capabilities.push('sign');
        }
      } catch {
        // Setting key not found -- signing not available
      }
    }

    // actions: check if apiKeyStore has any keys
    if (deps.apiKeyStore) {
      try {
        const keys = deps.apiKeyStore.listAll();
        if (keys.some((k) => k.hasKey)) {
          capabilities.push('actions');
        }
      } catch {
        // API key store not available
      }
    }

    // x402: check config
    if (deps.config.x402?.enabled === true) {
      capabilities.push('x402');
    }

    // f. Build daemon info
    const host = c.req.header('Host') ?? 'localhost:3100';
    const protocol = c.req.header('X-Forwarded-Proto') ?? 'http';
    const baseUrl = `${protocol}://${host}`;

    // g. Read default-deny toggles
    const defaultDeny: DefaultDenyStatus = {
      tokenTransfers: deps.settingsService?.get('policy.default_deny_tokens') !== 'false',
      contractCalls: deps.settingsService?.get('policy.default_deny_contracts') !== 'false',
      tokenApprovals: deps.settingsService?.get('policy.default_deny_spenders') !== 'false',
      x402Domains: deps.settingsService?.get('policy.default_deny_x402_domains') !== 'false',
    };

    // h. Build prompt
    const promptWallets = linkedWallets.map((w) => {
      const networks = getNetworksForEnvironment(
        w.chain as ChainType,
        w.environment as EnvironmentType,
      );
      return {
        id: w.id,
        name: w.name,
        chain: w.chain,
        environment: w.environment!,
        address: w.publicKey,
        networks: networks.map((n) => n),
        policies: policiesMap[w.id] ?? [],
      };
    });

    const prompt = buildConnectInfoPrompt({
      wallets: promptWallets,
      capabilities,
      defaultDeny,
      baseUrl,
      version: deps.version,
    });

    // i. Return response
    const expiresAtSec = session.expiresAt instanceof Date
      ? Math.floor(session.expiresAt.getTime() / 1000)
      : (session.expiresAt as number);

    return c.json({
      session: {
        id: session.id,
        expiresAt: expiresAtSec,
        source: session.source as 'api' | 'mcp',
      },
      wallets: linkedWallets.map((w) => {
        const networks = getNetworksForEnvironment(
          w.chain as ChainType,
          w.environment as EnvironmentType,
        );
        return {
          id: w.id,
          name: w.name,
          chain: w.chain,
          environment: w.environment!,
          address: w.publicKey,
          availableNetworks: networks.map((n) => n),
        };
      }),
      policies: policiesMap,
      capabilities,
      defaultDeny,
      daemon: {
        version: deps.version,
        baseUrl,
      },
      prompt,
    }, 200);
  });

  return router;
}
