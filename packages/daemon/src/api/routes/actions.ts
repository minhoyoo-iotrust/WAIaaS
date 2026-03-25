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
import { zodToJsonSchema } from 'zod-to-json-schema';
import { WAIaaSError, isApiDirectResult } from '@waiaas/core';
import { BUILTIN_PROVIDER_METADATA } from '../../infrastructure/action/builtin-metadata.js';
import type { ChainType, NetworkType, EnvironmentType, IPolicyEngine, SignedDataAction, SignedHttpAction } from '@waiaas/core';
import { resolveChainId } from '../helpers/resolve-chain-id.js';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type { Database as SQLiteDatabase } from 'better-sqlite3';
import type { ActionProviderRegistry } from '../../infrastructure/action/action-provider-registry.js';
// ApiKeyStore removed in v29.5 (#214) -- API keys managed by SettingsService
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
import { executeDryRun } from '../../pipeline/dry-run.js';
import type { ApprovalWorkflow } from '../../workflow/approval-workflow.js';
import type { DelayQueue } from '../../workflow/delay-queue.js';
import type { OwnerLifecycleService } from '../../workflow/owner-state.js';
import type { NotificationService } from '../../notifications/notification-service.js';
import type { IPriceOracle } from '@waiaas/core';
import type { SettingsService } from '../../infrastructure/settings/settings-service.js';
import {
  TxSendResponseSchema,
  DryRunSimulationResultOpenAPI,
  buildErrorResponses,
  openApiValidationHook,
} from './openapi-schemas.js';
import { resolveWalletId } from '../helpers/resolve-wallet-id.js';
import { executeSignedDataAction, executeSignedHttpAction } from '../../pipeline/external-action-pipeline.js';
import type { ICredentialVault } from '../../infrastructure/credential/credential-vault.js';
import type { ISignerCapabilityRegistry } from '../../signing/registry.js';

// ---------------------------------------------------------------------------
// Action Route Dependencies
// ---------------------------------------------------------------------------

export interface ActionRouteDeps {
  registry: ActionProviderRegistry;
  db: BetterSQLite3Database<typeof schema>;
  adapterPool: AdapterPool;
  config: DaemonConfig;
  keyStore: LocalKeyStore;
  policyEngine: IPolicyEngine;
  masterPassword: string;
  /** Mutable ref for live password updates. Takes precedence over masterPassword. */
  passwordRef?: MasterPasswordRef;
  approvalWorkflow?: ApprovalWorkflow;
  delayQueue?: DelayQueue;
  ownerLifecycle?: OwnerLifecycleService;
  sqlite?: SQLiteDatabase;
  notificationService?: NotificationService;
  priceOracle?: IPriceOracle;
  settingsService: SettingsService;
  // v30.8: WC signing bridge + channel router for EIP-712 approval routing (Phase 321)
  wcSigningBridgeRef?: import('../../services/wc-signing-bridge.js').WcSigningBridgeRef;
  approvalChannelRouter?: import('../../services/signing-sdk/approval-channel-router.js').ApprovalChannelRouter;
  eventBus?: import('@waiaas/core').EventBus;
  // v30.8: Reputation cache for post-execution invalidation after feedback actions (INT-02)
  reputationCache?: import('../../services/erc8004/reputation-cache-service.js').ReputationCacheService;
  // v31.12: External Action pipeline dependencies (Phase 390)
  credentialVault?: ICredentialVault;
  signerRegistry?: ISignerCapabilityRegistry;
  // v32.0: contract name registry for notification enrichment
  contractNameRegistry?: import('@waiaas/core').ContractNameRegistry;
  // #455: PositionTracker for on-demand sync after action execution
  positionTracker?: import('../../services/defi/position-tracker.js').PositionTracker;
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
  inputSchema: z.record(z.unknown()).optional(),
});

const ProviderResponseSchema = z.object({
  name: z.string(),
  description: z.string(),
  version: z.string(),
  chains: z.array(z.string()),
  mcpExpose: z.boolean(),
  requiresApiKey: z.boolean(),
  apiKeyUrl: z.string().optional(),
  hasApiKey: z.boolean(),
  enabledKey: z.string(),
  category: z.string(),
  isEnabled: z.boolean(),
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
    walletId: z.string().uuid().optional().describe('Target wallet ID (optional -- auto-resolved if session has single wallet)'),
    gasCondition: z.object({
      maxGasPrice: z.string().optional(),
      maxPriorityFee: z.string().optional(),
      timeout: z.number().int().min(60).max(86400).optional(),
    }).optional(),
  })
  .openapi('ActionExecuteRequest');

// ---------------------------------------------------------------------------
// Zod -> JSON Schema safe converter
// ---------------------------------------------------------------------------

/**
 * Convert a Zod schema to JSON Schema. Falls back to `{ type: "object" }`
 * if conversion fails (e.g., non-standard or broken schema).
 */
function safeZodToJsonSchema(inputSchema: unknown): Record<string, unknown> {
  try {
    if (
      inputSchema &&
      typeof inputSchema === 'object' &&
      typeof (inputSchema as Record<string, unknown>).safeParse === 'function'
    ) {
      return zodToJsonSchema(inputSchema as z.ZodTypeAny, { target: 'openApi3' }) as Record<string, unknown>;
    }
    return { type: 'object' };
  } catch {
    return { type: 'object' };
  }
}

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
    'Resolve action parameters into a ContractCallRequest and execute through the 6-stage pipeline. Use ?dryRun=true to simulate without executing.',
  request: {
    params: z.object({
      provider: z.string(),
      action: z.string(),
    }),
    query: z.object({
      dryRun: z.enum(['true', 'false']).optional(),
    }),
    body: {
      content: {
        'application/json': { schema: ActionExecuteRequestSchema },
      },
    },
  },
  responses: {
    200: {
      description: 'Dry-run simulation result (dryRun=true)',
      content: { 'application/json': { schema: DryRunSimulationResultOpenAPI } },
    },
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
    const registeredNames = new Set(providerMetadataList.map((m) => m.name));

    // Build a lookup from BUILTIN_PROVIDER_METADATA for category/enabledKey enrichment
    const builtinLookup = new Map(
      BUILTIN_PROVIDER_METADATA.map((b) => [b.name, b]),
    );

    const providers = providerMetadataList.map((meta) => {
      const providerActions = deps.registry.listActions(meta.name);
      const builtin = builtinLookup.get(meta.name);
      const enabledKey = meta.enabledKey ?? builtin?.enabledKey ?? meta.name;
      const category = meta.category ?? builtin?.category ?? 'Other';
      let isEnabled = false;
      try {
        isEnabled = deps.settingsService.get(`actions.${enabledKey}_enabled`) === 'true';
      } catch {
        // Setting key not registered (e.g. dynamically added provider) — default to disabled
      }
      return {
        name: meta.name,
        description: meta.description,
        version: meta.version,
        chains: meta.chains,
        mcpExpose: meta.mcpExpose,
        requiresApiKey: meta.requiresApiKey,
        ...(meta.apiKeyUrl ? { apiKeyUrl: meta.apiKeyUrl } : {}),
        hasApiKey: deps.settingsService.hasApiKey(meta.name),
        enabledKey,
        category,
        isEnabled,
        actions: providerActions.map((a) => ({
          name: a.action.name,
          description: a.action.description,
          chain: a.action.chain,
          riskLevel: a.action.riskLevel,
          defaultTier: a.action.defaultTier,
          inputSchema: safeZodToJsonSchema(a.action.inputSchema),
        })),
      };
    });

    // #354: Merge unregistered built-in providers as disabled entries
    for (const builtin of BUILTIN_PROVIDER_METADATA) {
      if (registeredNames.has(builtin.name)) continue;
      let isEnabled = false;
      try {
        isEnabled = deps.settingsService.get(`actions.${builtin.enabledKey}_enabled`) === 'true';
      } catch { /* not registered */ }
      providers.push({
        name: builtin.name,
        description: builtin.description,
        version: builtin.version,
        chains: [...builtin.chains] as ('solana' | 'ethereum')[],
        mcpExpose: builtin.mcpExpose,
        requiresApiKey: builtin.requiresApiKey,
        ...(builtin.apiKeyUrl ? { apiKeyUrl: builtin.apiKeyUrl } : {}),
        hasApiKey: deps.settingsService.hasApiKey(builtin.name),
        enabledKey: builtin.enabledKey,
        category: builtin.category,
        isEnabled,
        actions: [],
      });
    }

    return c.json({ providers }, 200);
  });

  // -------------------------------------------------------------------------
  // POST /actions/:provider/:action
  // -------------------------------------------------------------------------

  router.openapi(executeActionRoute, async (c) => {
    const { provider, action } = c.req.valid('param');
    const query = c.req.valid('query');
    const isDryRun = query.dryRun === 'true';
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

    // 2. Resolve walletId from body.walletId > query > single-wallet auto-resolve
    const walletId = resolveWalletId(c, deps.db, body.walletId);
    const sessionId = c.get('sessionId' as never) as string | undefined;

    // 3. Check API key requirement (after walletId resolution for notification context)
    if (entry.provider.metadata.requiresApiKey) {
      if (!deps.settingsService.hasApiKey(entry.provider.metadata.name)) {
        // Fire notification before throwing error
        const adminPort = deps.config.daemon?.port ?? 3000;
        const adminUrl = `http://localhost:${adminPort}/admin`;
        void deps.notificationService?.notify('ACTION_API_KEY_REQUIRED', walletId, {
          provider: entry.provider.metadata.name,
          action: actionKey,
          adminUrl,
        });
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

    // 5. Build ActionContext
    const actionContext = {
      walletAddress: wallet.publicKey,
      chain: wallet.chain as ChainType,
      walletId,
      sessionId,
    };

    // 6. Execute resolve via registry (validates input + return value)
    // Returns ContractCallRequest[] (always array, single results wrapped)
    let contractCalls;
    try {
      contractCalls = await deps.registry.executeResolve(
        actionKey,
        body.params ?? {},
        actionContext,
      );
    } catch (err) {
      // Re-throw WAIaaSError as-is (ACTION_VALIDATION_FAILED, ACTION_RETURN_INVALID, etc.)
      if (err instanceof WAIaaSError) throw err;
      // Wrap unexpected errors as ACTION_RESOLVE_FAILED
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

    // 6b. v31.12: Check for signedData/signedHttp actions (kind-based routing)
    //     These don't need network resolution or adapter -- route to external pipeline
    const hasKindedActions = contractCalls.some(
      (item: unknown) => item && typeof item === 'object' && 'kind' in item &&
        ((item as { kind: string }).kind === 'signedData' || (item as { kind: string }).kind === 'signedHttp'),
    );

    if (hasKindedActions) {
      // Ensure external action pipeline deps are available
      if (!deps.credentialVault || !deps.signerRegistry) {
        throw new WAIaaSError('EXTERNAL_ACTION_FAILED', {
          message: 'External action pipeline not configured (credentialVault/signerRegistry missing)',
        });
      }

      const pipelineResults: Array<{ id: string; status: string }> = [];
      const contractCallsForLegacy: Array<import('@waiaas/core').ContractCallRequest | import('@waiaas/core').ApiDirectResult> = [];

      for (const item of contractCalls) {
        // ApiDirectResult bypass
        if (isApiDirectResult(item)) {
          const direct = item as { externalId: string; status: string; data?: Record<string, unknown> };
          pipelineResults.push({ id: direct.externalId, status: direct.status, ...(direct.data ? { data: direct.data } : {}) });
          continue;
        }

        // Kind-based routing
        if (item && typeof item === 'object' && 'kind' in item) {
          const kind = (item as { kind: string }).kind;
          if (kind === 'signedData') {
            const externalDeps = {
              db: deps.db,
              sqlite: deps.sqlite,
              keyStore: deps.keyStore,
              credentialVault: deps.credentialVault!,
              signerRegistry: deps.signerRegistry!,
              policyEngine: deps.policyEngine,
              masterPassword: deps.passwordRef?.password ?? deps.masterPassword,
              walletId,
              wallet: { publicKey: wallet.publicKey, chain: wallet.chain, environment: wallet.environment },
              sessionId,
              settingsService: deps.settingsService,
              eventBus: deps.eventBus,
              notificationService: deps.notificationService,
              actionProviderKey: provider,
              actionName: action,
            };
            const result = await executeSignedDataAction(externalDeps, item as unknown as SignedDataAction);
            pipelineResults.push(result);
            continue;
          }
          if (kind === 'signedHttp') {
            const externalDeps = {
              db: deps.db,
              sqlite: deps.sqlite,
              keyStore: deps.keyStore,
              credentialVault: deps.credentialVault!,
              signerRegistry: deps.signerRegistry!,
              policyEngine: deps.policyEngine,
              masterPassword: deps.passwordRef?.password ?? deps.masterPassword,
              walletId,
              wallet: { publicKey: wallet.publicKey, chain: wallet.chain, environment: wallet.environment },
              sessionId,
              settingsService: deps.settingsService,
              eventBus: deps.eventBus,
              notificationService: deps.notificationService,
              actionProviderKey: provider,
              actionName: action,
            };
            const result = await executeSignedHttpAction(externalDeps, item as unknown as SignedHttpAction, entry.provider);
            pipelineResults.push(result);
            continue;
          }
        }

        // contractCall: collect for legacy pipeline
        contractCallsForLegacy.push(item);
      }

      // If all items handled by external pipeline, return immediately
      if (contractCallsForLegacy.length === 0) {
        const lastResult = pipelineResults[pipelineResults.length - 1]!;
        const lr = lastResult as Record<string, unknown>;
        if (pipelineResults.length === 1) {
          return c.json({ id: lastResult.id, status: lastResult.status, ...(lr.data ? { data: lr.data } : {}) }, 201);
        }
        return c.json({ id: lastResult.id, status: lastResult.status, ...(lr.data ? { data: lr.data } : {}), pipeline: pipelineResults }, 201);
      }

      // Otherwise, overwrite contractCalls with only the contractCall items for legacy pipeline
      contractCalls = contractCallsForLegacy;
    }

    // 7. Resolve network: body.network > getSingleNetwork auto-resolve
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

    // 8b. #325: dryRun mode — simulate without executing
    if (isDryRun) {
      // Use the first ContractCallRequest for dry-run simulation
      const firstCall = contractCalls[0];
      if (!firstCall || isApiDirectResult(firstCall)) {
        return c.json({
          success: true,
          policy: { tier: 'INSTANT', allowed: true },
          fee: null,
          balanceChanges: [],
          warnings: [{ code: 'API_DIRECT', message: 'Action uses off-chain API — no on-chain simulation available', severity: 'info' as const }],
          simulation: { success: true, logs: [], unitsConsumed: null, error: null },
          meta: { chain: wallet.chain, network: resolvedNetwork, transactionType: 'CONTRACT_CALL', durationMs: 0 },
        }, 200);
      }
      const dryRunResult = await executeDryRun(
        { db: deps.db, adapter, policyEngine: deps.policyEngine, priceOracle: deps.priceOracle, settingsService: deps.settingsService },
        walletId,
        firstCall,
        resolvedNetwork,
        { publicKey: wallet.publicKey, chain: wallet.chain, environment: wallet.environment },
      );
      return c.json(dryRunResult, 200);
    }

    // 9. Sequential pipeline execution for each ContractCallRequest
    const walletData = {
      publicKey: wallet.publicKey,
      chain: wallet.chain,
      environment: wallet.environment,
      // #251: pass AA fields for Smart Account action execution
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
          ...(contractCall.data ? { data: contractCall.data } : {}),
        });
        continue;
      }

      // Inject gasCondition into the pipeline request if provided
      const requestWithGas = body.gasCondition
        ? { ...contractCall, gasCondition: body.gasCondition }
        : contractCall;

      // Extract EIP-712 metadata from resolve result (Phase 321)
      const eip712 = ('eip712' in contractCall ? (contractCall as { eip712?: { approvalType: 'EIP712'; typedDataJson: string; agentId: string; newWallet: string; deadline: string } }).eip712 : undefined);

      // Build EIP-712 metadata for pipeline context (fill owner from wallet DB)
      let eip712Metadata: PipelineContext['eip712Metadata'];
      if (eip712) {
        // Enrich typed data with owner address and chainId from wallet
        const ownerAddress = wallet.ownerAddress || '0x0000000000000000000000000000000000000000';
        const typedData = JSON.parse(eip712.typedDataJson);
        typedData.message.owner = ownerAddress;
        // Resolve chainId from network (ethereum-mainnet -> 1, etc.)
        typedData.domain.chainId = resolveChainId(resolvedNetwork);
        eip712Metadata = {
          approvalType: 'EIP712',
          typedDataJson: JSON.stringify(typedData),
          agentId: eip712.agentId,
          newWallet: eip712.newWallet,
          deadline: eip712.deadline,
        };
      }

      // Build PipelineContext for this specific ContractCallRequest
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
        request: requestWithGas, // ContractCallRequest with optional gasCondition
        txId: '', // stage1Validate will assign
        sessionId,
        sqlite: deps.sqlite,
        delayQueue: deps.delayQueue,
        approvalWorkflow: deps.approvalWorkflow,
        config: pipelineConfig,
        notificationService: deps.notificationService,
        priceOracle: deps.priceOracle,
        settingsService: deps.settingsService,
        // v30.8: EIP-712 + WC/channel router for set_agent_wallet approval (Phase 321)
        eip712Metadata,
        wcSigningBridge: deps.wcSigningBridgeRef?.current ?? undefined,
        approvalChannelRouter: deps.approvalChannelRouter,
        eventBus: deps.eventBus,
        // v30.11 Phase 331: action tier override context
        actionProviderKey: provider,
        actionName: action,
        actionDefaultTier: entry.action.defaultTier as import('@waiaas/core').PolicyTier,
        contractNameRegistry: deps.contractNameRegistry,
      };

      // Stage 1: Validate + DB INSERT (synchronous -- assigns ctx.txId)
      await stage1Validate(ctx);

      // GAP-2 fix: Persist action provider metadata for staking position queries
      // (GET /v1/wallet/staking uses metadata LIKE '%providerKey%' to find staking txs)
      // Merge with existing metadata to preserve originalRequest (#212)
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

      // Stages 2-6 run asynchronously (fire-and-forget)
      void (async () => {
        try {
          await stage2Auth(ctx);
          await stage3Policy(ctx);
          await stageGasCondition(ctx);
          await stage4Wait(ctx);
          await stage5Execute(ctx);
          await stage6Confirm(ctx);

          // INT-01 fix: Emit ERC-8004 notification events after successful execution.
          // These 4 identity/reputation events are defined in @waiaas/core but were
          // never emitted -- wire them here in the post-execution flow.
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
              give_feedback: {
                event: 'REPUTATION_FEEDBACK_RECEIVED',
                vars: {
                  score: String(params.score ?? ''),
                  tag1: String(params.tag1 ?? ''),
                  tag2: String(params.tag2 ?? ''),
                },
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

          // INT-02 fix: Invalidate reputation cache after feedback actions complete.
          // ReputationCacheService.invalidate() exists but was never called post-execution.
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

          // #455: On-demand position sync after successful action execution.
          // Fire-and-forget: sync the wallet's positions for the relevant category.
          if (deps.positionTracker) {
            const categoryMap: Record<string, string> = {
              kamino: 'LENDING', aave_v3: 'LENDING',
              drift_perp: 'PERP', hyperliquid_perp: 'PERP', hyperliquid_spot: 'PERP',
              lido_staking: 'STAKING', jito_staking: 'STAKING',
              pendle_yield: 'YIELD',
            };
            const cat = categoryMap[provider];
            if (cat) {
              void deps.positionTracker.syncWallet(walletId, cat as import('@waiaas/core').PositionCategory);
            }
          }

          // GAP-1 fix: Enroll staking unstake transactions in async tracking
          // Lido unstake -> lido-withdrawal tracker, Jito unstake -> jito-epoch tracker
          // AsyncPollingService.pollAll() picks up bridge_status='PENDING' transactions
          if (action === 'unstake') {
            const trackerMap: Record<string, string> = {
              'lido_staking': 'lido-withdrawal',
              'jito_staking': 'jito-epoch',
            };
            const trackerName = trackerMap[provider];
            if (trackerName) {
              await deps.db
                .update(transactions)
                .set({
                  bridgeStatus: 'PENDING',
                  bridgeMetadata: JSON.stringify({
                    tracker: trackerName,
                    notificationEvent: 'STAKING_UNSTAKE_TIMEOUT',
                    enrolledAt: Date.now(),
                  }),
                })
                .where(eq(transactions.id, ctx.txId));
            }
          }

          // STS-01: Enroll Across bridge execute transactions in async tracking
          // AsyncPollingService.pollAll() picks up bridge_status='PENDING' with tracker='across-bridge'
          if (provider === 'across_bridge' && action === 'execute') {
            const confirmedTx = await deps.db
              .select()
              .from(transactions)
              .where(eq(transactions.id, ctx.txId))
              .get();
            const txHash = confirmedTx?.txHash ?? null;

            if (txHash) {
              const execParams = body.params ?? {};
              await deps.db
                .update(transactions)
                .set({
                  bridgeStatus: 'PENDING',
                  bridgeMetadata: JSON.stringify({
                    tracker: 'across-bridge',
                    txHash,
                    fromChain: String(execParams.fromChain ?? ''),
                    toChain: String(execParams.toChain ?? ''),
                    inputToken: String(execParams.inputToken ?? ''),
                    outputToken: String(execParams.outputToken ?? ''),
                    inputAmount: String(execParams.amount ?? ''),
                    notificationEvent: 'BRIDGE_COMPLETED',
                    enrolledAt: Date.now(),
                  }),
                })
                .where(eq(transactions.id, ctx.txId));
            }
          }
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
    }

    // 10. Build response
    // Backward compatible: single-element -> standard { id, status }
    // Multi-element -> { id, status, pipeline: [{id, status}...] }
    const lastResult = pipelineResults[pipelineResults.length - 1]!;
    const lr = lastResult as Record<string, unknown>;

    if (pipelineResults.length === 1) {
      return c.json(
        { id: lastResult.id, status: lastResult.status, ...(lr.data ? { data: lr.data } : {}) },
        201,
      );
    }

    return c.json(
      {
        id: lastResult.id,
        status: lastResult.status,
        ...(lr.data ? { data: lr.data } : {}),
        pipeline: pipelineResults,
      },
      201,
    );
  });

  return router;
}

// ---------------------------------------------------------------------------
// Helper: resolve EVM chainId from network identifier (Phase 321)
// ---------------------------------------------------------------------------

