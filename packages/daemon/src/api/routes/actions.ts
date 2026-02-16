/**
 * Action routes: POST /v1/actions/:provider/:action, GET /v1/actions/providers.
 *
 * POST /v1/actions/:provider/:action:
 *   - Requires sessionAuth (applied at server level in createApp())
 *   - Resolves action parameters via ActionProviderRegistry.executeResolve()
 *   - Injects the resulting ContractCallRequest into the existing 6-stage pipeline
 *   - Returns 201 with txId (same pattern as POST /v1/transactions/send)
 *
 * GET /v1/actions/providers:
 *   - Requires sessionAuth
 *   - Lists registered action providers with their actions and API key status
 *
 * @see docs/62-action-provider-architecture.md
 */

import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import { eq } from 'drizzle-orm';
import { WAIaaSError } from '@waiaas/core';
import type { ChainType, NetworkType, EnvironmentType, IPolicyEngine } from '@waiaas/core';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type { Database as SQLiteDatabase } from 'better-sqlite3';
import type { ActionProviderRegistry } from '../../infrastructure/action/action-provider-registry.js';
import type { ApiKeyStore } from '../../infrastructure/action/api-key-store.js';
import type { AdapterPool } from '../../infrastructure/adapter-pool.js';
import { resolveRpcUrl } from '../../infrastructure/adapter-pool.js';
import type { DaemonConfig } from '../../infrastructure/config/loader.js';
import type { LocalKeyStore } from '../../infrastructure/keystore/keystore.js';
import type * as schema from '../../infrastructure/database/schema.js';
import { wallets, transactions } from '../../infrastructure/database/schema.js';
import {
  stage1Validate,
  stage2Auth,
  stage3Policy,
  stage4Wait,
  stage5Execute,
  stage6Confirm,
} from '../../pipeline/stages.js';
import type { PipelineContext } from '../../pipeline/stages.js';
import { resolveNetwork } from '../../pipeline/network-resolver.js';
import type { ApprovalWorkflow } from '../../workflow/approval-workflow.js';
import type { DelayQueue } from '../../workflow/delay-queue.js';
import type { OwnerLifecycleService } from '../../workflow/owner-state.js';
import type { NotificationService } from '../../notifications/notification-service.js';
import type { IPriceOracle } from '@waiaas/core';
import type { SettingsService } from '../../infrastructure/settings/settings-service.js';
import {
  TxSendResponseSchema,
  buildErrorResponses,
  openApiValidationHook,
} from './openapi-schemas.js';

// ---------------------------------------------------------------------------
// Action Route Dependencies
// ---------------------------------------------------------------------------

export interface ActionRouteDeps {
  registry: ActionProviderRegistry;
  apiKeyStore: ApiKeyStore;
  db: BetterSQLite3Database<typeof schema>;
  adapterPool: AdapterPool;
  config: DaemonConfig;
  keyStore: LocalKeyStore;
  policyEngine: IPolicyEngine;
  masterPassword: string;
  approvalWorkflow?: ApprovalWorkflow;
  delayQueue?: DelayQueue;
  ownerLifecycle?: OwnerLifecycleService;
  sqlite?: SQLiteDatabase;
  notificationService?: NotificationService;
  priceOracle?: IPriceOracle;
  settingsService?: SettingsService;
}

// ---------------------------------------------------------------------------
// OpenAPI Response Schemas
// ---------------------------------------------------------------------------

const ActionDefinitionResponseSchema = z.object({
  name: z.string(),
  description: z.string(),
  chain: z.string(),
  riskLevel: z.string(),
  defaultTier: z.string(),
});

const ProviderResponseSchema = z.object({
  name: z.string(),
  description: z.string(),
  version: z.string(),
  chains: z.array(z.string()),
  mcpExpose: z.boolean(),
  requiresApiKey: z.boolean(),
  hasApiKey: z.boolean(),
  actions: z.array(ActionDefinitionResponseSchema),
});

const ProvidersListResponseSchema = z
  .object({
    providers: z.array(ProviderResponseSchema),
  })
  .openapi('ProvidersListResponse');

const ActionExecuteRequestSchema = z
  .object({
    params: z.record(z.unknown()).optional().default({}),
    network: z.string().optional(),
  })
  .openapi('ActionExecuteRequest');

// ---------------------------------------------------------------------------
// Route definitions
// ---------------------------------------------------------------------------

const listProvidersRoute = createRoute({
  method: 'get',
  path: '/actions/providers',
  tags: ['Actions'],
  summary: 'List registered action providers',
  responses: {
    200: {
      description: 'Registered action providers with their actions',
      content: { 'application/json': { schema: ProvidersListResponseSchema } },
    },
  },
});

const executeActionRoute = createRoute({
  method: 'post',
  path: '/actions/{provider}/{action}',
  tags: ['Actions'],
  summary: 'Execute an action via provider',
  description:
    'Resolve action parameters into a ContractCallRequest and execute through the 6-stage pipeline.',
  request: {
    params: z.object({
      provider: z.string(),
      action: z.string(),
    }),
    body: {
      content: {
        'application/json': { schema: ActionExecuteRequestSchema },
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

/**
 * Create action route sub-router.
 *
 * GET  /actions/providers -> list registered providers + actions
 * POST /actions/:provider/:action -> resolve + pipeline execution
 */
export function actionRoutes(deps: ActionRouteDeps): OpenAPIHono {
  const router = new OpenAPIHono({ defaultHook: openApiValidationHook });

  // -------------------------------------------------------------------------
  // GET /actions/providers
  // -------------------------------------------------------------------------

  router.openapi(listProvidersRoute, async (c) => {
    const providerMetadataList = deps.registry.listProviders();

    const providers = providerMetadataList.map((meta) => {
      const providerActions = deps.registry.listActions(meta.name);
      return {
        name: meta.name,
        description: meta.description,
        version: meta.version,
        chains: meta.chains,
        mcpExpose: meta.mcpExpose,
        requiresApiKey: meta.requiresApiKey,
        hasApiKey: deps.apiKeyStore.has(meta.name),
        actions: providerActions.map((a) => ({
          name: a.action.name,
          description: a.action.description,
          chain: a.action.chain,
          riskLevel: a.action.riskLevel,
          defaultTier: a.action.defaultTier,
        })),
      };
    });

    return c.json({ providers }, 200);
  });

  // -------------------------------------------------------------------------
  // POST /actions/:provider/:action
  // -------------------------------------------------------------------------

  router.openapi(executeActionRoute, async (c) => {
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

    // 2. Check API key requirement
    if (entry.provider.metadata.requiresApiKey) {
      if (!deps.apiKeyStore.has(entry.provider.metadata.name)) {
        throw new WAIaaSError('API_KEY_REQUIRED', {
          message: `Admin > Settings에서 ${entry.provider.metadata.name} API 키를 설정하세요`,
          details: { provider: entry.provider.metadata.name },
        });
      }
    }

    // 3. Extract session context (set by sessionAuth middleware)
    const walletId = c.get('walletId' as never) as string;
    const sessionId = c.get('sessionId' as never) as string | undefined;

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

    // 5. Build ActionContext
    const actionContext = {
      walletAddress: wallet.publicKey,
      chain: wallet.chain as ChainType,
      walletId,
      sessionId,
    };

    // 6. Execute resolve via registry (validates input + return value)
    let contractCall;
    try {
      contractCall = await deps.registry.executeResolve(
        actionKey,
        body.params ?? {},
        actionContext,
      );
    } catch (err) {
      // Re-throw WAIaaSError as-is (ACTION_VALIDATION_FAILED, ACTION_RETURN_INVALID, etc.)
      if (err instanceof WAIaaSError) throw err;
      // Wrap unexpected errors as ACTION_RESOLVE_FAILED
      throw new WAIaaSError('ACTION_RESOLVE_FAILED', {
        message: `Action resolve failed: ${err instanceof Error ? err.message : 'Unknown error'}`,
        details: { actionKey },
        cause: err instanceof Error ? err : undefined,
      });
    }

    // 7. Resolve network: body.network > wallet.defaultNetwork > environment default
    let resolvedNetwork: string;
    try {
      resolvedNetwork = resolveNetwork(
        body.network as NetworkType | undefined,
        wallet.defaultNetwork as NetworkType | null,
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
      deps.config.rpc as unknown as Record<string, string>,
      wallet.chain,
      resolvedNetwork,
    );
    const adapter = await deps.adapterPool.resolve(
      wallet.chain as ChainType,
      resolvedNetwork as NetworkType,
      rpcUrl,
    );

    // 9. Build pipeline context (inject ContractCallRequest as the request)
    const ctx: PipelineContext = {
      db: deps.db,
      adapter,
      keyStore: deps.keyStore,
      policyEngine: deps.policyEngine,
      masterPassword: deps.masterPassword,
      walletId,
      wallet: {
        publicKey: wallet.publicKey,
        chain: wallet.chain,
        environment: wallet.environment,
        defaultNetwork: wallet.defaultNetwork ?? null,
      },
      resolvedNetwork,
      request: contractCall, // ContractCallRequest with type: 'CONTRACT_CALL'
      txId: '', // stage1Validate will assign
      sessionId,
      sqlite: deps.sqlite,
      delayQueue: deps.delayQueue,
      approvalWorkflow: deps.approvalWorkflow,
      config: {
        policy_defaults_delay_seconds: deps.config.security.policy_defaults_delay_seconds,
        policy_defaults_approval_timeout: deps.config.security.policy_defaults_approval_timeout,
      },
      notificationService: deps.notificationService,
      priceOracle: deps.priceOracle,
      settingsService: deps.settingsService,
    };

    // 10. Stage 1: Validate + DB INSERT (synchronous -- assigns ctx.txId)
    await stage1Validate(ctx);

    // Return 201 immediately with txId
    const response = c.json(
      {
        id: ctx.txId,
        status: 'PENDING',
      },
      201,
    );

    // 11. Stages 2-6 run asynchronously (fire-and-forget)
    void (async () => {
      try {
        await stage2Auth(ctx);
        await stage3Policy(ctx);
        await stage4Wait(ctx);
        await stage5Execute(ctx);
        await stage6Confirm(ctx);
      } catch (error) {
        // PIPELINE_HALTED is intentional -- transaction is QUEUED
        if (error instanceof WAIaaSError && error.code === 'PIPELINE_HALTED') {
          return;
        }

        // If stages 2-6 fail, mark as FAILED
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

    return response;
  });

  return router;
}
