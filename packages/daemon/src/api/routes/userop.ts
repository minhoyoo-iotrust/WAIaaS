/**
 * UserOp routes: POST /v1/wallets/:id/userop/build + POST /v1/wallets/:id/userop/sign
 *
 * Build: Converts TransactionRequest into unsigned ERC-4337 v0.7 UserOperation skeleton.
 * Sign: Validates and signs a completed UserOperation (with gas/paymaster fields).
 *
 * masterAuth required for /wallets/:id/* paths (applied at server level).
 *
 * @since v31.2 Phase 339-340
 * @see REQUIREMENTS.md BUILD-01..BUILD-11, DATA-01..DATA-04, SIGN-01..SIGN-10
 */

import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import { eq } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type { Database as SQLiteDatabase } from 'better-sqlite3';
import {
  WAIaaSError,
  UserOpBuildRequestSchema,
  UserOpBuildResponseSchema,
  UserOpSignRequestSchema,
  UserOpSignResponseSchema,
} from '@waiaas/core';
import type { EvmNetworkType, IMetricsCounter, IPolicyEngine, EventBus } from '@waiaas/core';
import { wallets, useropBuilds, transactions } from '../../infrastructure/database/schema.js';
import type * as schema from '../../infrastructure/database/schema.js';
import type { LocalKeyStore } from '../../infrastructure/keystore/keystore.js';
import type { MasterPasswordRef } from '../middleware/master-auth.js';
import { buildUserOpCalls } from '../../pipeline/stages.js';
import { SmartAccountService, SOLADY_FACTORY_ADDRESS } from '../../infrastructure/smart-account/smart-account-service.js';
import { resolveRpcUrl } from '../../infrastructure/adapter-pool.js';
import { insertAuditLog } from '../../infrastructure/database/audit-helper.js';
import type { NotificationService } from '../../notifications/notification-service.js';
import { privateKeyToAccount } from 'viem/accounts';
import { createPublicClient, http, toHex, type Address, type Hex } from 'viem';
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
  /** Policy engine for sign-time evaluation (SIGN-06). */
  policyEngine?: IPolicyEngine;
  /** Notification service for TX_REQUESTED/TX_SUBMITTED (NTFY-01..04). */
  notificationService?: NotificationService;
  /** Event bus for wallet:activity events. */
  eventBus?: EventBus;
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
      'DEPRECATED_SMART_ACCOUNT',
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

    // Check for deprecated Solady factory
    if (wallet.factoryAddress?.toLowerCase() === SOLADY_FACTORY_ADDRESS.toLowerCase()) {
      throw new WAIaaSError('DEPRECATED_SMART_ACCOUNT');
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
          network,
          createdAt: new Date(now * 1000),
          expiresAt: new Date(expiresAt * 1000),
          used: 0,
        })
        .run();

      // -------------------------------------------------------------------
      // 10. Audit log + notifications (SIGN-10, NTFY-01, NTFY-02)
      // -------------------------------------------------------------------
      insertAuditLog(deps.sqlite, {
        eventType: 'USEROP_BUILD',
        actor: 'session',
        walletId,
        details: { buildId, network },
        severity: 'info',
      });

      void deps.notificationService?.notify('TX_REQUESTED', walletId, {
        amount: '0',
        to: '',
        type: 'USEROP_BUILD',
        display_amount: '',
      }, { txId: buildId, signOnly: true });

      deps.eventBus?.emit('wallet:activity', {
        walletId,
        activity: 'TX_REQUESTED',
        details: { userOpBuild: true, buildId },
        timestamp: Math.floor(Date.now() / 1000),
      });

      // -------------------------------------------------------------------
      // 11. Return unsigned UserOp skeleton (BUILD-03, BUILD-11)
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

  // =========================================================================
  // POST /v1/wallets/:id/userop/sign -- Sign a completed UserOperation
  // =========================================================================

  const signUserOpRoute = createRoute({
    method: 'post',
    path: '/wallets/{id}/userop/sign',
    tags: ['UserOp'],
    summary: 'Sign a completed UserOperation',
    description:
      'Validates and signs a completed ERC-4337 v0.7 UserOperation. ' +
      'The platform must fill gas/paymaster fields before calling this endpoint. ' +
      'Returns the signed UserOperation with signature field populated.',
    request: {
      params: z.object({ id: z.string().uuid() }),
      body: {
        content: {
          'application/json': { schema: UserOpSignRequestSchema },
        },
      },
    },
    responses: {
      200: {
        description: 'Signed UserOperation',
        content: { 'application/json': { schema: UserOpSignResponseSchema } },
      },
      ...buildErrorResponses([
        'WALLET_NOT_FOUND',
        'ACTION_VALIDATION_FAILED',
        'DEPRECATED_SMART_ACCOUNT',
        'BUILD_NOT_FOUND',
        'EXPIRED_BUILD',
        'BUILD_ALREADY_USED',
        'CALLDATA_MISMATCH',
        'SENDER_MISMATCH',
        'POLICY_DENIED',
      ]),
    },
  });

  app.openapi(signUserOpRoute, async (c) => {
    const walletId = c.req.param('id');

    // -----------------------------------------------------------------------
    // 1. Load wallet, validate smart + EVM
    // -----------------------------------------------------------------------
    const wallet = deps.db
      .select()
      .from(wallets)
      .where(eq(wallets.id, walletId))
      .get();

    if (!wallet) {
      throw new WAIaaSError('WALLET_NOT_FOUND');
    }

    if (wallet.accountType !== 'smart') {
      throw new WAIaaSError('ACTION_VALIDATION_FAILED', {
        message: 'UserOp Sign is only available for Smart Account wallets (accountType=smart).',
      });
    }

    if (wallet.chain !== 'ethereum') {
      throw new WAIaaSError('ACTION_VALIDATION_FAILED', {
        message: 'UserOp Sign is only available for EVM wallets. Solana wallets are not supported.',
      });
    }

    // Check for deprecated Solady factory
    if (wallet.factoryAddress?.toLowerCase() === SOLADY_FACTORY_ADDRESS.toLowerCase()) {
      throw new WAIaaSError('DEPRECATED_SMART_ACCOUNT');
    }

    // -----------------------------------------------------------------------
    // 2. Parse request body
    // -----------------------------------------------------------------------
    const body = c.req.valid('json');
    const { buildId, userOperation } = body;

    // -----------------------------------------------------------------------
    // 3. Look up build record and validate
    // -----------------------------------------------------------------------
    const build = deps.db
      .select()
      .from(useropBuilds)
      .where(eq(useropBuilds.id, buildId))
      .get();

    if (!build || build.walletId !== walletId) {
      throw new WAIaaSError('BUILD_NOT_FOUND');
    }

    if (build.used === 1) {
      throw new WAIaaSError('BUILD_ALREADY_USED');
    }

    const buildExpiresAtSec = build.expiresAt instanceof Date
      ? Math.floor(build.expiresAt.getTime() / 1000)
      : (build.expiresAt as number);
    const nowSec = Math.floor(Date.now() / 1000);

    if (buildExpiresAtSec < nowSec) {
      throw new WAIaaSError('EXPIRED_BUILD');
    }

    // -----------------------------------------------------------------------
    // 4. Validate callData matches build record (SIGN-04)
    // -----------------------------------------------------------------------
    if (userOperation.callData.toLowerCase() !== build.callData.toLowerCase()) {
      throw new WAIaaSError('CALLDATA_MISMATCH');
    }

    // -----------------------------------------------------------------------
    // 5. Validate sender + Create SmartAccount (SIGN-05)
    // -----------------------------------------------------------------------
    // Read network from build record (stored during Build phase, v50)
    const network = build.network as string | null;
    if (!network) {
      throw new WAIaaSError('CHAIN_ERROR', {
        message: 'Build record missing network. Re-run the build step to generate a new buildId.',
      });
    }

    const rpcConfig = deps.rpcConfig ?? {};
    const rpcUrl = resolveRpcUrl(rpcConfig, 'ethereum', network);
    if (!rpcUrl) {
      throw new WAIaaSError('CHAIN_ERROR', {
        message: `No RPC URL configured for network ${network}. Configure rpc.evm_* in config.toml.`,
      });
    }

    const effectivePassword = deps.passwordRef?.password ?? deps.masterPassword;

    let privateKey: Uint8Array | null = null;
    try {
      privateKey = await deps.keyStore.decryptPrivateKey(walletId, effectivePassword);
      const hexKey = toHex(privateKey);
      const localAccount = privateKeyToAccount(hexKey as Hex);

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

      // Validate sender matches wallet Smart Account address
      if (userOperation.sender.toLowerCase() !== smartAccountInfo.address.toLowerCase()) {
        throw new WAIaaSError('SENDER_MISMATCH');
      }

      // -------------------------------------------------------------------
      // 6. Policy evaluation (SIGN-06) -- INSTANT tier only
      // -------------------------------------------------------------------
      if (deps.policyEngine) {
        const txParam = {
          type: 'CONTRACT_CALL',
          amount: '0',
          toAddress: userOperation.sender,
          chain: 'ethereum',
          network,
          contractAddress: userOperation.sender,
        };
        const evaluation = await deps.policyEngine.evaluate(walletId, txParam);

        if (!evaluation.allowed) {
          throw new WAIaaSError('POLICY_DENIED', {
            message: evaluation.reason ?? 'UserOp sign request denied by policy',
          });
        }

        if (evaluation.tier === 'DELAY' || evaluation.tier === 'APPROVAL') {
          throw new WAIaaSError('POLICY_DENIED', {
            message: `UserOp sign does not support ${evaluation.tier} tier. Use standard transaction API for high-value operations.`,
          });
        }
      }

      // -------------------------------------------------------------------
      // 7. Sign the UserOperation (SIGN-07)
      // -------------------------------------------------------------------
      const signature = await smartAccountInfo.account.signUserOperation({
        callData: userOperation.callData as Hex,
        callGasLimit: BigInt(userOperation.callGasLimit),
        maxFeePerGas: BigInt(userOperation.maxFeePerGas),
        maxPriorityFeePerGas: BigInt(userOperation.maxPriorityFeePerGas),
        nonce: BigInt(userOperation.nonce),
        preVerificationGas: BigInt(userOperation.preVerificationGas),
        verificationGasLimit: BigInt(userOperation.verificationGasLimit),
        sender: userOperation.sender as Address,
        factory: userOperation.factory as Address | undefined,
        factoryData: userOperation.factoryData as Hex | undefined,
        paymaster: userOperation.paymaster as Address | undefined,
        paymasterData: userOperation.paymasterData as Hex | undefined,
        paymasterPostOpGasLimit: userOperation.paymasterPostOpGasLimit
          ? BigInt(userOperation.paymasterPostOpGasLimit)
          : undefined,
        paymasterVerificationGasLimit: userOperation.paymasterVerificationGasLimit
          ? BigInt(userOperation.paymasterVerificationGasLimit)
          : undefined,
        signature: '0x' as Hex,
      });

      // -------------------------------------------------------------------
      // 8. Mark build as used (SIGN-08)
      // -------------------------------------------------------------------
      deps.db
        .update(useropBuilds)
        .set({ used: 1 })
        .where(eq(useropBuilds.id, buildId))
        .run();

      // -------------------------------------------------------------------
      // 9. Insert transaction record (SIGN-09)
      // -------------------------------------------------------------------
      const txId = generateId();
      const txNow = new Date(Math.floor(Date.now() / 1000) * 1000);
      const sessionId = (c.get('sessionId' as never) as string | undefined) ?? null;

      deps.db
        .insert(transactions)
        .values({
          id: txId,
          walletId,
          chain: 'ethereum',
          network: network ?? null,
          type: 'SIGN',
          status: 'SIGNED',
          toAddress: userOperation.sender,
          sessionId,
          createdAt: txNow,
          executedAt: txNow,
        })
        .run();

      // -------------------------------------------------------------------
      // 10. Audit log (SIGN-10)
      // -------------------------------------------------------------------
      insertAuditLog(deps.sqlite, {
        eventType: 'USEROP_SIGNED',
        actor: 'session',
        walletId,
        txId,
        details: { buildId, sender: userOperation.sender, network },
        severity: 'info',
      });

      // -------------------------------------------------------------------
      // 11. Notifications (NTFY-03, NTFY-04)
      // -------------------------------------------------------------------
      void deps.notificationService?.notify('TX_SUBMITTED', walletId, {
        txHash: '',
        amount: '0',
        to: userOperation.sender,
        display_amount: '',
        network: network ?? '',
      }, { txId, signOnly: true });

      deps.eventBus?.emit('wallet:activity', {
        walletId,
        activity: 'TX_SUBMITTED',
        details: { txId, userOpSign: true, buildId },
        timestamp: Math.floor(Date.now() / 1000),
      });

      // -------------------------------------------------------------------
      // 12. Return signed UserOp (SIGN-01)
      // -------------------------------------------------------------------
      return c.json({
        signedUserOperation: {
          ...userOperation,
          signature: signature as string,
        },
        txId,
      }, 200);
    } finally {
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
