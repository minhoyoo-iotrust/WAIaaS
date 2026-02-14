/**
 * Transaction routes: POST /v1/transactions/send, GET /v1/transactions/:id,
 * POST /v1/transactions/:id/approve, POST /v1/transactions/:id/reject,
 * POST /v1/transactions/:id/cancel.
 *
 * POST /v1/transactions/send:
 *   - Requires sessionAuth (Authorization: Bearer wai_sess_<token>),
 *     applied at server level in createApp()
 *   - Parses body with SendTransactionRequestSchema
 *   - Stage 1 runs synchronously (DB INSERT -> returns 201 with txId)
 *   - Stages 2-6 run asynchronously (fire-and-forget with error catching)
 *
 * GET /v1/transactions/:id:
 *   - Requires sessionAuth
 *   - Returns transaction status JSON
 *   - 404 if not found
 *
 * v1.2: Wallet identification via JWT walletId from sessionAuth context.
 *
 * @see docs/37-rest-api-complete-spec.md
 */

import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import { eq, and, inArray, lt, desc } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type { Database as SQLiteDatabase } from 'better-sqlite3';
import { WAIaaSError } from '@waiaas/core';
import type { ChainType, NetworkType, EnvironmentType, IPolicyEngine } from '@waiaas/core';
import type { AdapterPool } from '../../infrastructure/adapter-pool.js';
import { resolveRpcUrl } from '../../infrastructure/adapter-pool.js';
import type { DaemonConfig } from '../../infrastructure/config/loader.js';
import { wallets, transactions } from '../../infrastructure/database/schema.js';
import type { LocalKeyStore } from '../../infrastructure/keystore/keystore.js';
import type * as schema from '../../infrastructure/database/schema.js';
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
import {
  TransactionRequestOpenAPI,
  TransferRequestOpenAPI,
  TokenTransferRequestOpenAPI,
  ContractCallRequestOpenAPI,
  ApproveRequestOpenAPI,
  BatchRequestOpenAPI,
  SendTransactionRequestOpenAPI,
  TxSendResponseSchema,
  TxDetailResponseSchema,
  TxListResponseSchema,
  TxPendingListResponseSchema,
  TxApproveResponseSchema,
  TxRejectResponseSchema,
  TxCancelResponseSchema,
  buildErrorResponses,
  openApiValidationHook,
} from './openapi-schemas.js';

export interface TransactionRouteDeps {
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
}

// ---------------------------------------------------------------------------
// Route definitions
// ---------------------------------------------------------------------------

const sendTransactionRoute = createRoute({
  method: 'post',
  path: '/transactions/send',
  tags: ['Transactions'],
  summary: 'Send a transaction',
  request: {
    body: {
      content: {
        'application/json': { schema: TransactionRequestOpenAPI },
      },
    },
  },
  responses: {
    201: {
      description: 'Transaction submitted to pipeline',
      content: { 'application/json': { schema: TxSendResponseSchema } },
    },
    ...buildErrorResponses(['WALLET_NOT_FOUND']),
  },
});

const getTransactionRoute = createRoute({
  method: 'get',
  path: '/transactions/{id}',
  tags: ['Transactions'],
  summary: 'Get transaction details',
  request: {
    params: z.object({ id: z.string().uuid() }),
  },
  responses: {
    200: {
      description: 'Transaction details',
      content: { 'application/json': { schema: TxDetailResponseSchema } },
    },
    ...buildErrorResponses(['TX_NOT_FOUND']),
  },
});

const approveTransactionRoute = createRoute({
  method: 'post',
  path: '/transactions/{id}/approve',
  tags: ['Transactions'],
  summary: 'Approve a pending transaction (ownerAuth)',
  request: {
    params: z.object({ id: z.string().uuid() }),
  },
  responses: {
    200: {
      description: 'Transaction approved',
      content: { 'application/json': { schema: TxApproveResponseSchema } },
    },
    ...buildErrorResponses(['TX_NOT_FOUND']),
  },
});

const rejectTransactionRoute = createRoute({
  method: 'post',
  path: '/transactions/{id}/reject',
  tags: ['Transactions'],
  summary: 'Reject a pending transaction (ownerAuth)',
  request: {
    params: z.object({ id: z.string().uuid() }),
  },
  responses: {
    200: {
      description: 'Transaction rejected',
      content: { 'application/json': { schema: TxRejectResponseSchema } },
    },
    ...buildErrorResponses(['TX_NOT_FOUND']),
  },
});

const cancelTransactionRoute = createRoute({
  method: 'post',
  path: '/transactions/{id}/cancel',
  tags: ['Transactions'],
  summary: 'Cancel a delayed transaction (sessionAuth)',
  request: {
    params: z.object({ id: z.string().uuid() }),
  },
  responses: {
    200: {
      description: 'Transaction cancelled',
      content: { 'application/json': { schema: TxCancelResponseSchema } },
    },
    ...buildErrorResponses(['TX_NOT_FOUND']),
  },
});

const listTransactionsRoute = createRoute({
  method: 'get',
  path: '/transactions',
  tags: ['Transactions'],
  summary: 'List transactions',
  request: {
    query: z.object({
      limit: z.coerce.number().int().min(1).max(100).default(20).optional(),
      cursor: z.string().uuid().optional(),
    }),
  },
  responses: {
    200: {
      description: 'Paginated transaction list',
      content: { 'application/json': { schema: TxListResponseSchema } },
    },
  },
});

const pendingTransactionsRoute = createRoute({
  method: 'get',
  path: '/transactions/pending',
  tags: ['Transactions'],
  summary: 'List pending transactions',
  responses: {
    200: {
      description: 'Pending transactions (PENDING/QUEUED)',
      content: { 'application/json': { schema: TxPendingListResponseSchema } },
    },
  },
});

// ---------------------------------------------------------------------------
// Route factory
// ---------------------------------------------------------------------------

/**
 * Create transaction route sub-router.
 *
 * POST /transactions/send -> submits to pipeline, returns 201 with txId
 * GET  /transactions -> list transactions with cursor pagination
 * GET  /transactions/pending -> list QUEUED/DELAYED/PENDING_APPROVAL txs
 * GET  /transactions/:id -> returns transaction status
 * POST /transactions/:id/approve -> approve pending tx (ownerAuth)
 * POST /transactions/:id/reject -> reject pending tx (ownerAuth)
 * POST /transactions/:id/cancel -> cancel delayed tx (sessionAuth)
 */
export function transactionRoutes(deps: TransactionRouteDeps): OpenAPIHono {
  const router = new OpenAPIHono({ defaultHook: openApiValidationHook });

  // Register 5-type transaction request schemas as OpenAPI components.
  // These are referenced by TransactionRequestOpenAPI's oneOf $ref entries
  // but aren't directly used by route definitions, so we register them
  // explicitly to ensure they appear in GET /doc components/schemas.
  router.openAPIRegistry.register('TransferRequest', TransferRequestOpenAPI);
  router.openAPIRegistry.register('TokenTransferRequest', TokenTransferRequestOpenAPI);
  router.openAPIRegistry.register('ContractCallRequest', ContractCallRequestOpenAPI);
  router.openAPIRegistry.register('ApproveRequest', ApproveRequestOpenAPI);
  router.openAPIRegistry.register('BatchRequest', BatchRequestOpenAPI);
  router.openAPIRegistry.register('SendTransactionRequest', SendTransactionRequestOpenAPI);

  // ---------------------------------------------------------------------------
  // POST /transactions/send
  // ---------------------------------------------------------------------------

  router.openapi(sendTransactionRoute, async (c) => {
    // Get walletId from sessionAuth context (set by middleware at server level)
    const walletId = c.get('walletId' as never) as string;

    // Look up wallet
    const wallet = await deps.db.select().from(wallets).where(eq(wallets.id, walletId)).get();
    if (!wallet) {
      throw new WAIaaSError('WALLET_NOT_FOUND', {
        message: `Wallet '${walletId}' not found`,
      });
    }

    // Raw JSON body -- bypass Hono Zod validation (z.any() passthrough).
    // Actual Zod validation is delegated to stage1Validate (5-type or legacy).
    const request = await c.req.json();

    // Resolve network: request > wallet.defaultNetwork > environment default
    let resolvedNetwork: string;
    try {
      resolvedNetwork = resolveNetwork(
        request.network as NetworkType | undefined,
        wallet.defaultNetwork as NetworkType | null,
        wallet.environment as EnvironmentType,
        wallet.chain as ChainType,
      );
    } catch (err) {
      if (err instanceof Error && err.message.includes('environment')) {
        console.warn(
          `[SECURITY] Environment-network mismatch attempt: ` +
          `wallet=${walletId}, chain=${wallet.chain}, env=${wallet.environment}, ` +
          `requestedNetwork=${request.network ?? 'null'}`,
        );
        throw new WAIaaSError('ENVIRONMENT_NETWORK_MISMATCH', {
          message: err.message,
        });
      }
      throw new WAIaaSError('ACTION_VALIDATION_FAILED', {
        message: err instanceof Error ? err.message : 'Network validation failed',
      });
    }

    // Resolve adapter from pool for this wallet's chain:resolvedNetwork
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

    // Build pipeline context
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
      request,
      txId: '', // stage1Validate will assign
      sessionId: c.get('sessionId' as never) as string | undefined,
      sqlite: deps.sqlite,
      delayQueue: deps.delayQueue,
      approvalWorkflow: deps.approvalWorkflow,
      config: {
        policy_defaults_delay_seconds: deps.config.security.policy_defaults_delay_seconds,
        policy_defaults_approval_timeout: deps.config.security.policy_defaults_approval_timeout,
      },
      notificationService: deps.notificationService,
    };

    // Stage 1: Validate + DB INSERT (synchronous -- assigns ctx.txId)
    await stage1Validate(ctx);

    // Return 201 immediately with txId (Stage 1 complete)
    const response = c.json(
      {
        id: ctx.txId,
        status: 'PENDING',
      },
      201,
    );

    // Stages 2-6 run asynchronously (fire-and-forget)
    void (async () => {
      try {
        await stage2Auth(ctx);
        await stage3Policy(ctx);
        await stage4Wait(ctx);
        await stage5Execute(ctx);
        await stage6Confirm(ctx);
      } catch (error) {
        // PIPELINE_HALTED is intentional -- do NOT mark as FAILED
        // Transaction is QUEUED, waiting for delay expiry or owner approval
        if (error instanceof WAIaaSError && error.code === 'PIPELINE_HALTED') {
          return;
        }

        // If stages 2-6 fail and DB hasn't been updated yet, mark as FAILED
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

  // ---------------------------------------------------------------------------
  // GET /transactions (list with cursor pagination)
  // ---------------------------------------------------------------------------

  router.openapi(listTransactionsRoute, async (c) => {
    const walletId = c.get('walletId' as never) as string;
    const { limit: rawLimit, cursor } = c.req.valid('query');
    const limit = rawLimit ?? 20;

    // Build conditions
    const conditions = [eq(transactions.walletId, walletId)];
    if (cursor) {
      conditions.push(lt(transactions.id, cursor));
    }

    // Fetch limit + 1 to detect hasMore
    const rows = await deps.db
      .select()
      .from(transactions)
      .where(and(...conditions))
      .orderBy(desc(transactions.id))
      .limit(limit + 1);

    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor = items.length > 0 ? items[items.length - 1]!.id : null;

    return c.json(
      {
        items: items.map((tx) => ({
          id: tx.id,
          walletId: tx.walletId,
          type: tx.type,
          status: tx.status,
          tier: tx.tier,
          chain: tx.chain,
          toAddress: tx.toAddress,
          amount: tx.amount,
          txHash: tx.txHash,
          error: tx.error,
          createdAt: tx.createdAt ? Math.floor(tx.createdAt.getTime() / 1000) : null,
        })),
        cursor: hasMore ? nextCursor : null,
        hasMore,
      },
      200,
    );
  });

  // ---------------------------------------------------------------------------
  // GET /transactions/pending
  // ---------------------------------------------------------------------------

  router.openapi(pendingTransactionsRoute, async (c) => {
    const walletId = c.get('walletId' as never) as string;

    const rows = await deps.db
      .select()
      .from(transactions)
      .where(
        and(
          eq(transactions.walletId, walletId),
          inArray(transactions.status, ['PENDING', 'QUEUED']),
        ),
      )
      .orderBy(desc(transactions.id));

    return c.json(
      {
        items: rows.map((tx) => ({
          id: tx.id,
          walletId: tx.walletId,
          type: tx.type,
          status: tx.status,
          tier: tx.tier,
          chain: tx.chain,
          toAddress: tx.toAddress,
          amount: tx.amount,
          txHash: tx.txHash,
          error: tx.error,
          createdAt: tx.createdAt ? Math.floor(tx.createdAt.getTime() / 1000) : null,
        })),
      },
      200,
    );
  });

  // ---------------------------------------------------------------------------
  // GET /transactions/:id
  // ---------------------------------------------------------------------------

  router.openapi(getTransactionRoute, async (c) => {
    const { id: txId } = c.req.valid('param');

    if (!txId) {
      throw new WAIaaSError('TX_NOT_FOUND', {
        message: 'Transaction ID is required',
      });
    }

    const tx = await deps.db
      .select()
      .from(transactions)
      .where(eq(transactions.id, txId))
      .get();

    if (!tx) {
      throw new WAIaaSError('TX_NOT_FOUND', {
        message: `Transaction '${txId}' not found`,
      });
    }

    return c.json(
      {
        id: tx.id,
        walletId: tx.walletId,
        type: tx.type,
        status: tx.status,
        tier: tx.tier,
        chain: tx.chain,
        toAddress: tx.toAddress,
        amount: tx.amount,
        txHash: tx.txHash,
        error: tx.error,
        createdAt: tx.createdAt ? Math.floor(tx.createdAt.getTime() / 1000) : null,
      },
      200,
    );
  });

  // ---------------------------------------------------------------------------
  // POST /transactions/:id/approve (ownerAuth)
  // ---------------------------------------------------------------------------

  if (deps.approvalWorkflow && deps.ownerLifecycle) {
    const approvalWorkflow = deps.approvalWorkflow;
    const ownerLifecycle = deps.ownerLifecycle;

    router.openapi(approveTransactionRoute, async (c) => {
      const { id: txId } = c.req.valid('param');

      // Verify the tx exists and get walletId for ownerAuth verification
      const tx = await deps.db
        .select()
        .from(transactions)
        .where(eq(transactions.id, txId))
        .get();

      if (!tx) {
        throw new WAIaaSError('TX_NOT_FOUND', {
          message: `Transaction '${txId}' not found`,
        });
      }

      // Get owner signature from header (set by ownerAuth middleware)
      const ownerSignature = c.req.header('X-Owner-Signature') ?? '';

      // Approve the transaction
      const result = approvalWorkflow.approve(txId, ownerSignature);

      // ownerAuth success -> mark owner verified (GRACE -> LOCKED auto-transition)
      try {
        ownerLifecycle.markOwnerVerified(tx.walletId);
      } catch {
        // If markOwnerVerified fails (e.g., NONE state), don't fail the approval
      }

      return c.json(
        {
          id: txId,
          status: 'EXECUTING',
          approvedAt: result.approvedAt,
        },
        200,
      );
    });

    // ---------------------------------------------------------------------------
    // POST /transactions/:id/reject (ownerAuth)
    // ---------------------------------------------------------------------------

    router.openapi(rejectTransactionRoute, async (c) => {
      const { id: txId } = c.req.valid('param');

      // Verify the tx exists
      const tx = await deps.db
        .select()
        .from(transactions)
        .where(eq(transactions.id, txId))
        .get();

      if (!tx) {
        throw new WAIaaSError('TX_NOT_FOUND', {
          message: `Transaction '${txId}' not found`,
        });
      }

      // Reject the transaction
      const result = approvalWorkflow.reject(txId);

      // ownerAuth success -> mark owner verified (GRACE -> LOCKED auto-transition)
      try {
        ownerLifecycle.markOwnerVerified(tx.walletId);
      } catch {
        // If markOwnerVerified fails (e.g., NONE state), don't fail the rejection
      }

      return c.json(
        {
          id: txId,
          status: 'CANCELLED',
          rejectedAt: result.rejectedAt,
        },
        200,
      );
    });
  }

  // ---------------------------------------------------------------------------
  // POST /transactions/:id/cancel (sessionAuth -- wallet cancels own DELAY tx)
  // ---------------------------------------------------------------------------

  if (deps.delayQueue) {
    const delayQueue = deps.delayQueue;

    router.openapi(cancelTransactionRoute, async (c) => {
      const { id: txId } = c.req.valid('param');

      // Get walletId from sessionAuth context
      const sessionWalletId = c.get('walletId' as never) as string;

      // Verify the tx exists and belongs to this wallet
      const tx = await deps.db
        .select()
        .from(transactions)
        .where(eq(transactions.id, txId))
        .get();

      if (!tx) {
        throw new WAIaaSError('TX_NOT_FOUND', {
          message: `Transaction '${txId}' not found`,
        });
      }

      if (tx.walletId !== sessionWalletId) {
        throw new WAIaaSError('TX_NOT_FOUND', {
          message: `Transaction '${txId}' not found`,
        });
      }

      // Cancel the delay
      delayQueue.cancelDelay(txId);

      return c.json(
        {
          id: txId,
          status: 'CANCELLED',
        },
        200,
      );
    });
  }

  return router;
}
