/**
 * Admin action routes: POST /v1/admin/actions/:provider/:action.
 *
 * Separate from `/v1/actions/*` (sessionAuth) to allow Admin UI (masterAuth)
 * to execute actions directly. Admin context bypasses session_wallets access
 * check since admin has full wallet access.
 *
 * @see #273 — Admin UI ERC-8004 에이전트 등록 시 sessionAuth 인증 실패
 */

import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import { eq } from 'drizzle-orm';
import { WAIaaSError, isApiDirectResult } from '@waiaas/core';
import type { ChainType, NetworkType, EnvironmentType, IPolicyEngine } from '@waiaas/core';
import { resolveChainId } from '../helpers/resolve-chain-id.js';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type { Database as SQLiteDatabase } from 'better-sqlite3';
import type { ActionProviderRegistry } from '../../infrastructure/action/action-provider-registry.js';
import type { AdapterPool } from '../../infrastructure/adapter-pool.js';
import { resolveRpcUrl } from '../../infrastructure/adapter-pool.js';
import type { MasterPasswordRef } from '../middleware/master-auth.js';
import type { DaemonConfig } from '../../infrastructure/config/loader.js';
import type { LocalKeyStore } from '../../infrastructure/keystore/keystore.js';
import type * as schema from '../../infrastructure/database/schema.js';
import { wallets, transactions } from '../../infrastructure/database/schema.js';
import {
  stage1Validate,
  stage2Auth,
  stage3Policy,
  stageGasCondition,
  stage4Wait,
  stage5Execute,
  stage6Confirm,
  getRequestTo,
} from '../../pipeline/stages.js';
import type { PipelineContext } from '../../pipeline/stages.js';
import { resolveNetwork } from '../../pipeline/network-resolver.js';
import type { ApprovalWorkflow } from '../../workflow/approval-workflow.js';
import type { DelayQueue } from '../../workflow/delay-queue.js';
import type { NotificationService } from '../../notifications/notification-service.js';
import type { IPriceOracle } from '@waiaas/core';
import type { SettingsService } from '../../infrastructure/settings/settings-service.js';
import {
  TxSendResponseSchema,
  buildErrorResponses,
  openApiValidationHook,
} from './openapi-schemas.js';

// ---------------------------------------------------------------------------
// Dependencies (subset of ActionRouteDeps -- no session-related deps)
// ---------------------------------------------------------------------------

export interface AdminActionRouteDeps {
  registry: ActionProviderRegistry;
  db: BetterSQLite3Database<typeof schema>;
  adapterPool: AdapterPool;
  config: DaemonConfig;
  keyStore: LocalKeyStore;
  policyEngine: IPolicyEngine;
  masterPassword: string;
  passwordRef?: MasterPasswordRef;
  approvalWorkflow?: ApprovalWorkflow;
  delayQueue?: DelayQueue;
  sqlite?: SQLiteDatabase;
  notificationService?: NotificationService;
  priceOracle?: IPriceOracle;
  settingsService: SettingsService;
  wcSigningBridgeRef?: import('../../services/wc-signing-bridge.js').WcSigningBridgeRef;
  approvalChannelRouter?: import('../../services/signing-sdk/approval-channel-router.js').ApprovalChannelRouter;
  eventBus?: import('@waiaas/core').EventBus;
  reputationCache?: import('../../services/erc8004/reputation-cache-service.js').ReputationCacheService;
  // v32.0: contract name registry for notification enrichment
  contractNameRegistry?: import('@waiaas/core').ContractNameRegistry;
}

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

const AdminActionExecuteRequestSchema = z
  .object({
    params: z.record(z.unknown()).optional().default({}),
    network: z.string().optional(),
    walletId: z.string().uuid().describe('Target wallet ID (required for admin context)'),
  })
  .openapi('AdminActionExecuteRequest');

// ---------------------------------------------------------------------------
// Route definitions
// ---------------------------------------------------------------------------

const adminExecuteActionRoute = createRoute({
  method: 'post',
  path: '/admin/actions/{provider}/{action}',
  tags: ['Admin', 'Actions'],
  summary: 'Execute an action via provider (admin context)',
  description:
    'Admin-only action execution. Bypasses session-based wallet access check. Requires masterAuth.',
  request: {
    params: z.object({
      provider: z.string(),
      action: z.string(),
    }),
    body: {
      content: {
        'application/json': { schema: AdminActionExecuteRequestSchema },
      },
    },
  },
  responses: {
    201: {
      description: 'Action submitted to pipeline',
      content: { 'application/json': { schema: TxSendResponseSchema } },
    },
    ...buildErrorResponses([
      'ACTION_NOT_FOUND',
      'API_KEY_REQUIRED',
      'ACTION_VALIDATION_FAILED',
      'ACTION_RESOLVE_FAILED',
      'ACTION_RETURN_INVALID',
      'WALLET_NOT_FOUND',
    ]),
  },
});

// ---------------------------------------------------------------------------
// Route factory
// ---------------------------------------------------------------------------

export function adminActionRoutes(deps: AdminActionRouteDeps): OpenAPIHono {
  const router = new OpenAPIHono({ defaultHook: openApiValidationHook });

  router.openapi(adminExecuteActionRoute, async (c) => {
    const { provider, action } = c.req.valid('param');
    const body = c.req.valid('json');
    const actionKey = `${provider}/${action}`;

    // 1. Look up action entry
    const entry = deps.registry.getAction(actionKey);
    if (!entry) {
      throw new WAIaaSError('ACTION_NOT_FOUND', {
        message: `Action '${actionKey}' not found`,
        details: { provider, action },
      });
    }

    // 2. Admin context: walletId is required from body (no session resolution)
    const walletId = body.walletId;

    // 3. Check API key requirement
    if (entry.provider.metadata.requiresApiKey) {
      if (!deps.settingsService.hasApiKey(entry.provider.metadata.name)) {
        throw new WAIaaSError('API_KEY_REQUIRED', {
          message: `Admin > Settings에서 ${entry.provider.metadata.name} API 키를 설정하세요`,
          details: { provider: entry.provider.metadata.name },
        });
      }
    }

    // 4. Look up wallet
    const wallet = await deps.db.select().from(wallets).where(eq(wallets.id, walletId)).get();
    if (!wallet) {
      throw new WAIaaSError('WALLET_NOT_FOUND', {
        message: `Wallet '${walletId}' not found`,
      });
    }
    if (wallet.status === 'TERMINATED') {
      throw new WAIaaSError('WALLET_TERMINATED');
    }

    // 5. Build ActionContext (sessionId is null for admin context)
    const actionContext = {
      walletAddress: wallet.publicKey,
      chain: wallet.chain as ChainType,
      walletId,
      sessionId: undefined,
    };

    // 6. Execute resolve via registry
    let contractCalls;
    try {
      contractCalls = await deps.registry.executeResolve(
        actionKey,
        body.params ?? {},
        actionContext,
      );
    } catch (err) {
      if (err instanceof WAIaaSError) throw err;
      const errMsg = err instanceof Error ? err.message : 'Unknown error';
      const isRpcLimit = /429|rate.?limit|too many request|freetier|not allowed|api.?key.*(invalid|required|missing)|method is not available/i.test(errMsg);
      throw new WAIaaSError('ACTION_RESOLVE_FAILED', {
        message: `Action resolve failed: ${errMsg}`,
        details: { actionKey },
        cause: err instanceof Error ? err : undefined,
        hint: isRpcLimit
          ? 'This action requires heavy RPC calls that may exceed free-tier limits. Configure a dedicated RPC endpoint via Admin Settings or config.toml [rpc] section.'
          : undefined,
      });
    }

    // 7. Resolve network
    let resolvedNetwork: string;
    try {
      resolvedNetwork = resolveNetwork(
        body.network as NetworkType | undefined,
        wallet.environment as EnvironmentType,
        wallet.chain as ChainType,
      );
    } catch (err) {
      if (err instanceof Error && err.message.includes('environment')) {
        throw new WAIaaSError('ENVIRONMENT_NETWORK_MISMATCH', {
          message: err.message,
        });
      }
      throw new WAIaaSError('ACTION_VALIDATION_FAILED', {
        message: err instanceof Error ? err.message : 'Network validation failed',
      });
    }

    // 8. Resolve adapter from pool
    const rpcUrl = resolveRpcUrl(
      deps.config.rpc,
      wallet.chain,
      resolvedNetwork,
    );
    const adapter = await deps.adapterPool.resolve(
      wallet.chain as ChainType,
      resolvedNetwork as NetworkType,
      rpcUrl,
    );

    // 9. Pipeline execution
    const walletData = {
      publicKey: wallet.publicKey,
      chain: wallet.chain,
      environment: wallet.environment,
      accountType: wallet.accountType,
      aaProvider: wallet.aaProvider,
      aaProviderApiKeyEncrypted: wallet.aaProviderApiKeyEncrypted,
      aaBundlerUrl: wallet.aaBundlerUrl,
      aaPaymasterUrl: wallet.aaPaymasterUrl,
      aaPaymasterPolicyId: wallet.aaPaymasterPolicyId,
    };
    const pipelineConfig = {
      policy_defaults_delay_seconds: deps.config.security.policy_defaults_delay_seconds,
      policy_defaults_approval_timeout: deps.config.security.policy_defaults_approval_timeout,
    };

    const pipelineResults: Array<{ id: string; status: string }> = [];

    for (const contractCall of contractCalls) {
      // v31.4: ApiDirectResult bypass -- skip pipeline for API-direct providers
      if (isApiDirectResult(contractCall)) {
        pipelineResults.push({
          id: contractCall.externalId,
          status: contractCall.status,
        });
        continue;
      }

      // Extract EIP-712 metadata from resolve result
      const eip712 = ('eip712' in contractCall ? (contractCall as { eip712?: { approvalType: 'EIP712'; typedDataJson: string; agentId: string; newWallet: string; deadline: string } }).eip712 : undefined);

      let eip712Metadata: PipelineContext['eip712Metadata'];
      if (eip712) {
        const ownerAddress = wallet.ownerAddress || '0x0000000000000000000000000000000000000000';
        const typedData = JSON.parse(eip712.typedDataJson);
        typedData.message.owner = ownerAddress;
        typedData.domain.chainId = resolveChainId(resolvedNetwork);
        eip712Metadata = {
          approvalType: 'EIP712',
          typedDataJson: JSON.stringify(typedData),
          agentId: eip712.agentId,
          newWallet: eip712.newWallet,
          deadline: eip712.deadline,
        };
      }

      const ctx: PipelineContext = {
        db: deps.db,
        adapter,
        keyStore: deps.keyStore,
        policyEngine: deps.policyEngine,
        masterPassword: deps.passwordRef?.password ?? deps.masterPassword,
        walletId,
        wallet: walletData,
        resolvedNetwork,
        resolvedRpcUrl: rpcUrl,
        request: contractCall,
        txId: '',
        sessionId: undefined, // Admin context -- no session
        sqlite: deps.sqlite,
        delayQueue: deps.delayQueue,
        approvalWorkflow: deps.approvalWorkflow,
        config: pipelineConfig,
        notificationService: deps.notificationService,
        priceOracle: deps.priceOracle,
        settingsService: deps.settingsService,
        eip712Metadata,
        wcSigningBridge: deps.wcSigningBridgeRef?.current ?? undefined,
        approvalChannelRouter: deps.approvalChannelRouter,
        eventBus: deps.eventBus,
        actionProviderKey: provider,
        actionName: action,
        actionDefaultTier: entry.action.defaultTier as import('@waiaas/core').PolicyTier,
      };

      await stage1Validate(ctx);

      // Persist action provider metadata
      const existingTx = await deps.db
        .select({ metadata: transactions.metadata })
        .from(transactions)
        .where(eq(transactions.id, ctx.txId))
        .get();
      const existingMeta = existingTx?.metadata ? JSON.parse(existingTx.metadata as string) : {};

      await deps.db
        .update(transactions)
        .set({
          metadata: JSON.stringify({ ...existingMeta, provider, action }),
        })
        .where(eq(transactions.id, ctx.txId));

      pipelineResults.push({ id: ctx.txId, status: 'PENDING' });

      // Stages 2-6 run asynchronously
      void (async () => {
        try {
          await stage2Auth(ctx);
          await stage3Policy(ctx);
          await stageGasCondition(ctx);
          await stage4Wait(ctx);
          await stage5Execute(ctx);
          await stage6Confirm(ctx);

          // ERC-8004 notification events
          if (provider === 'erc8004_agent' && deps.notificationService) {
            const params = body.params ?? {};
            const registryAddress = getRequestTo(ctx.request);
            const erc8004NotifMap: Record<string, { event: string; vars: Record<string, string> }> = {
              register_agent: {
                event: 'AGENT_REGISTERED',
                vars: {
                  chainAgentId: String(params.agentId ?? ctx.txId),
                  registryAddress,
                },
              },
              set_agent_wallet: {
                event: 'AGENT_WALLET_LINKED',
                vars: { registryAddress },
              },
              unset_agent_wallet: {
                event: 'AGENT_WALLET_UNLINKED',
                vars: { registryAddress },
              },
            };
            const notifEntry = erc8004NotifMap[action];
            if (notifEntry) {
              void deps.notificationService.notify(
                notifEntry.event as import('@waiaas/core').NotificationEventType,
                walletId,
                notifEntry.vars,
                { txId: ctx.txId },
              );
            }
          }

          // Invalidate reputation cache after feedback actions
          if (
            provider === 'erc8004_agent' &&
            (action === 'give_feedback' || action === 'revoke_feedback') &&
            deps.reputationCache
          ) {
            const targetAgentId = String((body.params ?? {}).agentId ?? '');
            if (targetAgentId) {
              deps.reputationCache.invalidate(targetAgentId);
            }
          }
        } catch (error) {
          if (error instanceof WAIaaSError && error.code === 'PIPELINE_HALTED') {
            return;
          }

          try {
            const tx = await deps.db
              .select()
              .from(transactions)
              .where(eq(transactions.id, ctx.txId))
              .get();

            if (tx && tx.status !== 'CONFIRMED' && tx.status !== 'FAILED' && tx.status !== 'CANCELLED') {
              const errorMessage = error instanceof Error ? error.message : 'Pipeline execution failed';
              await deps.db
                .update(transactions)
                .set({ status: 'FAILED', error: errorMessage })
                .where(eq(transactions.id, ctx.txId));
            }
          } catch {
            // Swallow DB update errors in background
          }
        }
      })();
    }

    const lastResult = pipelineResults[pipelineResults.length - 1]!;

    if (pipelineResults.length === 1) {
      return c.json(
        { id: lastResult.id, status: lastResult.status },
        201,
      );
    }

    return c.json(
      {
        id: lastResult.id,
        status: lastResult.status,
        pipeline: pipelineResults,
      },
      201,
    );
  });

  return router;
}
