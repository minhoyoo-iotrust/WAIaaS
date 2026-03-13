/**
 * RPC Proxy Route -- POST /v1/rpc-evm/:walletId/:chainId
 *
 * Exposes the EVM JSON-RPC proxy endpoint with sessionAuth protection.
 * Accepts single or batch JSON-RPC 2.0 requests and routes them through
 * the WAIaaS policy engine + signing pipeline.
 *
 * @see .planning/research/m31-14-rpc-proxy-ARCHITECTURE.md
 */

import { OpenAPIHono } from '@hono/zod-openapi';
import { eq } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type { Database as SQLiteDatabase } from 'better-sqlite3';
import { WAIaaSError } from '@waiaas/core';
import type { ChainType, NetworkType, IPolicyEngine, IPriceOracle, EventBus } from '@waiaas/core';
import type { AdapterPool } from '../../infrastructure/adapter-pool.js';
import { resolveRpcUrl } from '../../infrastructure/adapter-pool.js';
import type { MasterPasswordRef } from '../middleware/master-auth.js';
import type { DaemonConfig } from '../../infrastructure/config/loader.js';
import { wallets } from '../../infrastructure/database/schema.js';
import type { LocalKeyStore } from '../../infrastructure/keystore/keystore.js';
import type * as schema from '../../infrastructure/database/schema.js';
import type { ApprovalWorkflow } from '../../workflow/approval-workflow.js';
import type { DelayQueue } from '../../workflow/delay-queue.js';
import type { NotificationService } from '../../notifications/notification-service.js';
import type { SettingsService } from '../../infrastructure/settings/settings-service.js';
import type { WcSigningBridgeRef } from '../../services/wc-signing-bridge.js';
import type { ApprovalChannelRouter } from '../../services/signing-sdk/approval-channel-router.js';
import { verifyWalletAccess } from '../helpers/resolve-wallet-id.js';
import {
  parseJsonRpcBody,
  jsonRpcError,
  JSON_RPC_ERRORS,
  type JsonRpcResponse,
  type EthTransactionParams,
  RpcTransactionAdapter,
  CompletionWaiter,
  SyncPipelineExecutor,
  NonceTracker,
  RpcMethodHandlers,
  RpcPassthrough,
  RpcDispatcher,
} from '../../rpc-proxy/index.js';
import type { HandlerContext } from '../../rpc-proxy/index.js';
import { getNetworkByChainId } from '@waiaas/adapter-evm';

// -- Route Deps --------------------------------------------------------------

export interface RpcProxyRouteDeps {
  db: BetterSQLite3Database<typeof schema>;
  keyStore: LocalKeyStore;
  masterPassword: string;
  passwordRef?: MasterPasswordRef;
  adapterPool: AdapterPool;
  policyEngine: IPolicyEngine;
  config: DaemonConfig;
  settingsService?: SettingsService;
  eventBus?: EventBus;
  approvalWorkflow?: ApprovalWorkflow;
  delayQueue?: DelayQueue;
  notificationService?: NotificationService;
  priceOracle?: IPriceOracle;
  wcSigningBridgeRef?: WcSigningBridgeRef;
  approvalChannelRouter?: ApprovalChannelRouter;
  sqlite?: SQLiteDatabase;
}

// -- Constants ----------------------------------------------------------------

const MAX_BYTECODE_SIZE = 48 * 1024; // 48KB in bytes (SEC-05)

// -- from validation helper ---------------------------------------------------

/**
 * Validate and auto-fill the `from` field for signing methods.
 *
 * SEC-02: Reject if `from` doesn't match session wallet.
 * SEC-03: Auto-fill `from` when omitted.
 *
 * @returns JSON-RPC error response if validation fails, null if OK.
 * Mutates params in-place for auto-fill.
 */
export function validateAndFillFrom(
  method: string,
  params: unknown[],
  walletAddress: string,
): JsonRpcResponse | null {
  switch (method) {
    case 'eth_sendTransaction':
    case 'eth_signTransaction': {
      const txParams = (params[0] ?? {}) as EthTransactionParams;
      if (!txParams.from) {
        // SEC-03: Auto-fill
        txParams.from = walletAddress;
        params[0] = txParams;
      } else if (txParams.from.toLowerCase() !== walletAddress.toLowerCase()) {
        // SEC-02: Mismatch
        return jsonRpcError(null, JSON_RPC_ERRORS.INVALID_PARAMS, 'from address does not match session wallet');
      }
      break;
    }
    case 'personal_sign': {
      // params: [message, address]
      const address = params[1] as string | undefined;
      if (!address) {
        params[1] = walletAddress;
      } else if (address.toLowerCase() !== walletAddress.toLowerCase()) {
        return jsonRpcError(null, JSON_RPC_ERRORS.INVALID_PARAMS, 'from address does not match session wallet');
      }
      break;
    }
    case 'eth_sign': {
      // params: [address, message]
      const addr = params[0] as string | undefined;
      if (!addr) {
        params[0] = walletAddress;
      } else if (addr.toLowerCase() !== walletAddress.toLowerCase()) {
        return jsonRpcError(null, JSON_RPC_ERRORS.INVALID_PARAMS, 'from address does not match session wallet');
      }
      break;
    }
    case 'eth_signTypedData_v4': {
      // params: [address, typedData]
      const typedAddr = params[0] as string | undefined;
      if (!typedAddr) {
        params[0] = walletAddress;
      } else if (typedAddr.toLowerCase() !== walletAddress.toLowerCase()) {
        return jsonRpcError(null, JSON_RPC_ERRORS.INVALID_PARAMS, 'from address does not match session wallet');
      }
      break;
    }
    default:
      break;
  }
  return null;
}

// -- Route factory ------------------------------------------------------------

export function rpcProxyRoutes(deps: RpcProxyRouteDeps): OpenAPIHono {
  const router = new OpenAPIHono();

  // Construct shared components once (lightweight, stateless or EventBus-based)
  // CompletionWaiter + SyncPipelineExecutor are lazy-init'd only when EventBus is available
  let syncPipeline: SyncPipelineExecutor | null = null;
  if (deps.eventBus) {
    const completionWaiter = new CompletionWaiter(deps.eventBus);
    syncPipeline = new SyncPipelineExecutor(completionWaiter, deps.settingsService);
  }
  const txAdapter = new RpcTransactionAdapter();
  const nonceTracker = new NonceTracker();
  const rpcPool = deps.adapterPool.pool ?? null;

  // RpcPassthrough needs RpcPool -- create if pool available, else stub
  const passthrough = rpcPool
    ? new RpcPassthrough(rpcPool)
    : null; // Will fail gracefully if passthrough called without pool

  const methodHandlers = syncPipeline
    ? new RpcMethodHandlers(syncPipeline, txAdapter, nonceTracker)
    : null;

  // POST /rpc-evm/:walletId/:chainId
  router.post('/rpc-evm/:walletId/:chainId', async (c) => {
    // RPC-06: Content-Type check
    const contentType = c.req.header('content-type') ?? '';
    if (!contentType.includes('application/json')) {
      return c.json(
        jsonRpcError(null, JSON_RPC_ERRORS.INVALID_REQUEST, 'Content-Type must be application/json'),
        415,
      );
    }

    // Check rpc_proxy.enabled setting
    const proxyEnabled = deps.settingsService?.get('rpc_proxy.enabled');
    if (proxyEnabled === 'false') {
      return c.json(
        jsonRpcError(null, JSON_RPC_ERRORS.SERVER_ERROR, 'RPC proxy is disabled'),
        503,
      );
    }

    // Parse JSON-RPC body
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json(
        jsonRpcError(null, JSON_RPC_ERRORS.PARSE_ERROR, 'Parse error'),
      );
    }

    const parseResult = parseJsonRpcBody(body);
    if (parseResult.type === 'error') {
      return c.json(parseResult.response);
    }

    // Resolve walletId and session access
    const walletId = c.req.param('walletId');
    const sessionId = c.get('sessionId' as never) as string;

    try {
      verifyWalletAccess(sessionId, walletId, deps.db);
    } catch (err) {
      if (err instanceof WAIaaSError) {
        return c.json(
          jsonRpcError(null, JSON_RPC_ERRORS.SERVER_ERROR, err.message),
          403,
        );
      }
      throw err;
    }

    // Resolve chainId
    const chainIdStr = c.req.param('chainId');
    const numericChainId = parseInt(chainIdStr, 10);
    if (isNaN(numericChainId)) {
      return c.json(
        jsonRpcError(null, JSON_RPC_ERRORS.INVALID_PARAMS, 'Invalid chainId: ' + chainIdStr),
      );
    }

    const resolvedNetwork = getNetworkByChainId(numericChainId);
    if (!resolvedNetwork) {
      return c.json(
        jsonRpcError(null, JSON_RPC_ERRORS.INVALID_PARAMS, 'Unknown chainId: ' + numericChainId),
      );
    }

    // Look up wallet
    const wallet = deps.db
      .select()
      .from(wallets)
      .where(eq(wallets.id, walletId))
      .get();

    if (!wallet) {
      return c.json(
        jsonRpcError(null, JSON_RPC_ERRORS.SERVER_ERROR, 'Wallet not found'),
        404,
      );
    }

    // Build HandlerContext
    const ctx: HandlerContext = {
      walletId,
      walletAddress: wallet.publicKey,
      chainId: numericChainId,
      network: resolvedNetwork,
      chain: wallet.chain,
      sessionId,
    };

    // Resolve adapter and RPC URL for pipeline
    const rpcUrl = resolveRpcUrl(
      deps.config.rpc as unknown as Record<string, string>,
      wallet.chain,
      resolvedNetwork,
    );
    const adapter = await deps.adapterPool.resolve(
      wallet.chain as ChainType,
      resolvedNetwork as NetworkType,
      rpcUrl,
    );

    // Build pipeline deps (same pattern as transactionRoutes)
    const pipelineDeps = {
      db: deps.db,
      adapter,
      keyStore: deps.keyStore,
      policyEngine: deps.policyEngine,
      masterPassword: deps.passwordRef?.password ?? deps.masterPassword,
      wallet: {
        publicKey: wallet.publicKey,
        chain: wallet.chain,
        environment: wallet.environment,
        accountType: wallet.accountType,
        aaProvider: wallet.aaProvider,
        aaProviderApiKeyEncrypted: wallet.aaProviderApiKeyEncrypted,
        aaBundlerUrl: wallet.aaBundlerUrl,
        aaPaymasterUrl: wallet.aaPaymasterUrl,
        aaPaymasterPolicyId: wallet.aaPaymasterPolicyId,
      },
      resolvedRpcUrl: rpcUrl,
      config: {
        policy_defaults_delay_seconds: deps.config.security?.policy_defaults_delay_seconds,
        policy_defaults_approval_timeout: deps.config.security?.policy_defaults_approval_timeout,
      },
      sqlite: deps.sqlite,
      delayQueue: deps.delayQueue,
      approvalWorkflow: deps.approvalWorkflow,
      notificationService: deps.notificationService,
      priceOracle: deps.priceOracle,
      settingsService: deps.settingsService,
      eventBus: deps.eventBus,
      wcSigningBridge: deps.wcSigningBridgeRef?.current ?? undefined,
      approvalChannelRouter: deps.approvalChannelRouter,
    };

    // Construct dispatcher -- requires both passthrough (RpcPool) and methodHandlers (EventBus)
    if (!passthrough || !methodHandlers) {
      return c.json(
        jsonRpcError(null, JSON_RPC_ERRORS.SERVER_ERROR, 'RPC proxy infrastructure not configured'),
        503,
      );
    }

    const dispatcher = new RpcDispatcher({
      methodHandlers,
      passthrough,
      nonceTracker,
    });

    // Apply from validation + auto-fill and bytecode size checks for single requests
    if (parseResult.type === 'single') {
      const request = parseResult.request;
      const params = (request.params ?? []) as unknown[];
      request.params = params;

      // SEC-02/SEC-03: from validation
      const fromError = validateAndFillFrom(request.method, params, wallet.publicKey);
      if (fromError) {
        return c.json({ ...fromError, id: request.id ?? null });
      }

      // SEC-05: Bytecode size limit for CONTRACT_DEPLOY
      if (request.method === 'eth_sendTransaction') {
        const bytecodeError = checkBytecodeSize(params, deps.settingsService);
        if (bytecodeError) {
          return c.json({ ...bytecodeError, id: request.id ?? null });
        }
      }

      // SEC-04: SyncPipelineExecutor sets ctx.source = 'rpc-proxy' for audit trail.
      // All signing transactions through this route are logged with source: 'rpc-proxy'.
      const response = await dispatcher.dispatch(request, ctx, pipelineDeps);
      return c.json(response);
    }

    // Batch processing
    if (parseResult.type === 'batch') {
      // Apply from validation to each signing request in the batch
      for (const request of parseResult.requests) {
        const params = (request.params ?? []) as unknown[];
        request.params = params;

        const fromError = validateAndFillFrom(request.method, params, wallet.publicKey);
        if (fromError) {
          // Return the error for the whole batch (spec-compliant: invalid batch item)
          return c.json({ ...fromError, id: request.id ?? null });
        }

        // SEC-05: Bytecode size limit
        if (request.method === 'eth_sendTransaction') {
          const bytecodeError = checkBytecodeSize(params, deps.settingsService);
          if (bytecodeError) {
            return c.json({ ...bytecodeError, id: request.id ?? null });
          }
        }
      }

      const responses = await dispatcher.dispatchBatch(parseResult.requests, ctx, pipelineDeps);
      // JSON-RPC 2.0: if all requests are notifications, return 204
      if (responses.length === 0) return c.body(null, 204);
      return c.json(responses);
    }

    // Should not reach here
    return c.json(jsonRpcError(null, JSON_RPC_ERRORS.INTERNAL_ERROR, 'Unexpected parse result'));
  });

  return router;
}

// -- Helpers ------------------------------------------------------------------

/**
 * SEC-05: Check bytecode size for CONTRACT_DEPLOY transactions.
 * Returns error response if bytecode exceeds limit, null if OK.
 */
function checkBytecodeSize(
  params: unknown[],
  settingsService?: SettingsService,
): JsonRpcResponse | null {
  const txParams = (params[0] ?? {}) as EthTransactionParams;
  if (!txParams.to && txParams.data) {
    // Remove '0x' prefix for size calculation
    const bytecodeHex = txParams.data.startsWith('0x') ? txParams.data.slice(2) : txParams.data;
    const bytecodeSize = bytecodeHex.length / 2; // 2 hex chars = 1 byte

    // Configurable limit via SettingsService
    const limitStr = settingsService?.get('rpc_proxy.max_bytecode_size');
    const limit = limitStr ? parseInt(limitStr, 10) : MAX_BYTECODE_SIZE;

    if (bytecodeSize > limit) {
      return jsonRpcError(
        null,
        JSON_RPC_ERRORS.INVALID_PARAMS,
        `Bytecode size ${bytecodeSize} bytes exceeds limit of ${limit} bytes`,
      );
    }
  }
  return null;
}
