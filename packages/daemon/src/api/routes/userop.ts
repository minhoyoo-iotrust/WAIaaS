/**
 * UserOp routes: POST /v1/wallets/:id/userop/build
 *
 * Build an unsigned ERC-4337 v0.7 UserOperation from a TransactionRequest.
 * The response contains sender, nonce, callData, factory/factoryData, entryPoint,
 * and buildId -- but NO gas or paymaster fields (platform fills those).
 *
 * masterAuth required for /wallets/:id/* paths (applied at server level).
 *
 * @since v31.2 Phase 339
 * @see REQUIREMENTS.md BUILD-01..BUILD-11, DATA-01..DATA-04
 */

import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import { eq } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type { Database as SQLiteDatabase } from 'better-sqlite3';
import {
  WAIaaSError,
  UserOpBuildRequestSchema,
  UserOpBuildResponseSchema,
} from '@waiaas/core';
import type { EvmNetworkType, IMetricsCounter } from '@waiaas/core';
import { wallets, useropBuilds } from '../../infrastructure/database/schema.js';
import type * as schema from '../../infrastructure/database/schema.js';
import type { LocalKeyStore } from '../../infrastructure/keystore/keystore.js';
import type { MasterPasswordRef } from '../middleware/master-auth.js';
import { buildUserOpCalls } from '../../pipeline/stages.js';
import { SmartAccountService } from '../../infrastructure/smart-account/smart-account-service.js';
import { resolveRpcUrl } from '../../infrastructure/adapter-pool.js';
import { privateKeyToAccount } from 'viem/accounts';
import { createPublicClient, http, toHex, type Hex } from 'viem';
import {
  entryPoint07Address,
  entryPoint07Abi,
} from 'viem/account-abstraction';
import { generateId } from '../../infrastructure/database/id.js';
import {
  buildErrorResponses,
  openApiValidationHook,
} from './openapi-schemas.js';

// ---------------------------------------------------------------------------
// Deps interface
// ---------------------------------------------------------------------------

export interface UserOpRouteDeps {
  db: BetterSQLite3Database<typeof schema>;
  sqlite: SQLiteDatabase;
  keyStore: LocalKeyStore;
  masterPassword: string;
  /** Mutable ref for live password updates. Takes precedence over masterPassword. */
  passwordRef?: MasterPasswordRef;
  /** RPC config map (chain_network -> url). */
  rpcConfig?: Record<string, string>;
  metricsCounter?: IMetricsCounter;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Build data TTL in seconds (10 minutes). */
const BUILD_TTL_SECONDS = 600;

// ---------------------------------------------------------------------------
// Route definitions (OpenAPI)
// ---------------------------------------------------------------------------

const buildUserOpRoute = createRoute({
  method: 'post',
  path: '/wallets/{id}/userop/build',
  tags: ['UserOp'],
  summary: 'Build an unsigned UserOperation',
  description:
    'Converts a TransactionRequest into an unsigned ERC-4337 v0.7 UserOperation skeleton. ' +
    'The response contains sender, nonce, callData, entryPoint, and buildId. ' +
    'Gas and paymaster fields are intentionally omitted -- the platform must fill them.',
  request: {
    params: z.object({ id: z.string().uuid() }),
    body: {
      content: {
        'application/json': { schema: UserOpBuildRequestSchema },
      },
    },
  },
  responses: {
    200: {
      description: 'Unsigned UserOp skeleton',
      content: { 'application/json': { schema: UserOpBuildResponseSchema } },
    },
    ...buildErrorResponses([
      'WALLET_NOT_FOUND',
      'ACTION_VALIDATION_FAILED',
    ]),
  },
});

// ---------------------------------------------------------------------------
// Route factory
// ---------------------------------------------------------------------------

export function userOpRoutes(deps: UserOpRouteDeps) {
  const app = new OpenAPIHono({ defaultHook: openApiValidationHook });

  app.openapi(buildUserOpRoute, async (c) => {
    const walletId = c.req.param('id');

    // -----------------------------------------------------------------------
    // 1. Load wallet from DB
    // -----------------------------------------------------------------------
    const wallet = deps.db
      .select()
      .from(wallets)
      .where(eq(wallets.id, walletId))
      .get();

    if (!wallet) {
      throw new WAIaaSError('WALLET_NOT_FOUND');
    }

    // -----------------------------------------------------------------------
    // 2. Validate: must be EVM Smart Account
    // -----------------------------------------------------------------------
    if (wallet.accountType !== 'smart') {
      throw new WAIaaSError('ACTION_VALIDATION_FAILED', {
        message: 'UserOp Build is only available for Smart Account wallets (accountType=smart).',
      });
    }

    if (wallet.chain !== 'ethereum') {
      throw new WAIaaSError('ACTION_VALIDATION_FAILED', {
        message: 'UserOp Build is only available for EVM wallets. Solana wallets are not supported.',
      });
    }

    // -----------------------------------------------------------------------
    // 3. Parse request body
    // -----------------------------------------------------------------------
    const body = c.req.valid('json');
    const { request, network } = body;

    // -----------------------------------------------------------------------
    // 4. Resolve RPC URL
    // -----------------------------------------------------------------------
    const rpcConfig = deps.rpcConfig ?? {};
    const rpcUrl = resolveRpcUrl(rpcConfig, 'ethereum', network);
    if (!rpcUrl) {
      throw new WAIaaSError('CHAIN_ERROR', {
        message: `No RPC URL configured for network ${network}. Configure rpc.evm_* in config.toml.`,
      });
    }

    // -----------------------------------------------------------------------
    // 5. Create publicClient + SmartAccount
    // -----------------------------------------------------------------------
    const effectivePassword = deps.passwordRef?.password ?? deps.masterPassword;

    // Decrypt signer key
    let privateKey: Uint8Array | null = null;
    try {
      privateKey = await deps.keyStore.decryptPrivateKey(walletId, effectivePassword);
      const hexKey = toHex(privateKey);
      const localAccount = privateKeyToAccount(hexKey as Hex);

      // Resolve viem Chain from EVM_CHAIN_MAP
      const { EVM_CHAIN_MAP } = await import('@waiaas/adapter-evm');
      const chainEntry = EVM_CHAIN_MAP[network as EvmNetworkType];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const publicClient = createPublicClient({
        chain: chainEntry?.viemChain,
        transport: http(rpcUrl),
      }) as any;

      const smartAccountService = new SmartAccountService();
      const smartAccountInfo = await smartAccountService.createSmartAccount({
        owner: localAccount,
        client: publicClient,
      });

      const sender = smartAccountInfo.address;
      const entryPoint = smartAccountInfo.entryPoint;

      // -------------------------------------------------------------------
      // 6. Read nonce from EntryPoint v0.7 contract (no Bundler needed)
      // -------------------------------------------------------------------
      const nonceRaw = await publicClient.readContract({
        address: entryPoint07Address,
        abi: entryPoint07Abi,
        functionName: 'getNonce',
        args: [sender, 0n],
      });
      const nonce = toHex(nonceRaw as bigint);

      // -------------------------------------------------------------------
      // 7. Build callData from TransactionRequest
      // -------------------------------------------------------------------
      const calls = buildUserOpCalls(request, wallet.publicKey);
      const callData = await smartAccountInfo.account.encodeCalls(
        calls.map((c) => ({ to: c.to, value: c.value, data: c.data })),
      );

      // -------------------------------------------------------------------
      // 8. Factory detection for undeployed accounts (BUILD-07, BUILD-08)
      // -------------------------------------------------------------------
      let factory: string | null = null;
      let factoryData: string | null = null;

      if (!wallet.deployed) {
        // Check if already deployed on-chain
        const code = await publicClient.getCode({ address: sender });
        const isDeployedOnChain = code !== undefined && code !== '0x' && code.length > 2;

        if (isDeployedOnChain) {
          // Update deployed status in DB
          deps.db
            .update(wallets)
            .set({ deployed: true })
            .where(eq(wallets.id, walletId))
            .run();
        } else {
          // Get factory args for initCode
          const factoryArgs = await smartAccountInfo.account.getFactoryArgs();
          if (factoryArgs) {
            factory = factoryArgs.factory ?? null;
            factoryData = factoryArgs.factoryData ?? null;
          }
        }
      }

      // -------------------------------------------------------------------
      // 9. Persist build data (BUILD-09, DATA-01)
      // -------------------------------------------------------------------
      const buildId = generateId();
      const now = Math.floor(Date.now() / 1000);
      const expiresAt = now + BUILD_TTL_SECONDS;

      deps.db
        .insert(useropBuilds)
        .values({
          id: buildId,
          walletId,
          sender,
          nonce,
          callData,
          entryPoint,
          createdAt: new Date(now * 1000),
          expiresAt: new Date(expiresAt * 1000),
          used: 0,
        })
        .run();

      // -------------------------------------------------------------------
      // 10. Return unsigned UserOp skeleton (BUILD-03, BUILD-11)
      // -------------------------------------------------------------------
      return c.json({
        sender,
        nonce,
        callData,
        factory,
        factoryData,
        entryPoint,
        buildId,
      }, 200);
    } finally {
      // Always release key (zero-fill guarded memory)
      if (privateKey) {
        try {
          deps.keyStore.releaseKey(privateKey);
        } catch {
          // Ignore release errors
        }
      }
    }
  });

  return app;
}
