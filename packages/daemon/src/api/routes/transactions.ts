/**
 * Transaction routes: POST /v1/transactions/send and GET /v1/transactions/:id.
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
 * v1.2: Agent identification via JWT agentId from sessionAuth context.
 *
 * @see docs/37-rest-api-complete-spec.md
 */

import { Hono } from 'hono';
import { eq } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type { Database as SQLiteDatabase } from 'better-sqlite3';
import { WAIaaSError, SendTransactionRequestSchema } from '@waiaas/core';
import type { IChainAdapter, IPolicyEngine } from '@waiaas/core';
import { agents, transactions } from '../../infrastructure/database/schema.js';
import { generateId } from '../../infrastructure/database/id.js';
import type { LocalKeyStore } from '../../infrastructure/keystore/keystore.js';
import type * as schema from '../../infrastructure/database/schema.js';
import {
  stage2Auth,
  stage3Policy,
  stage4Wait,
  stage5Execute,
  stage6Confirm,
} from '../../pipeline/stages.js';
import type { PipelineContext } from '../../pipeline/stages.js';
import type { ApprovalWorkflow } from '../../workflow/approval-workflow.js';
import type { DelayQueue } from '../../workflow/delay-queue.js';
import type { OwnerLifecycleService } from '../../workflow/owner-state.js';

export interface TransactionRouteDeps {
  db: BetterSQLite3Database<typeof schema>;
  adapter: IChainAdapter;
  keyStore: LocalKeyStore;
  policyEngine: IPolicyEngine;
  masterPassword: string;
  approvalWorkflow?: ApprovalWorkflow;
  delayQueue?: DelayQueue;
  ownerLifecycle?: OwnerLifecycleService;
  sqlite?: SQLiteDatabase;
}

/**
 * Create transaction route sub-router.
 *
 * POST /transactions/send -> submits to pipeline, returns 201 with txId
 * GET /transactions/:id -> returns transaction status
 */
export function transactionRoutes(deps: TransactionRouteDeps): Hono {
  const router = new Hono();

  // ---------------------------------------------------------------------------
  // POST /transactions/send
  // ---------------------------------------------------------------------------

  router.post('/transactions/send', async (c) => {
    // Get agentId from sessionAuth context (set by middleware at server level)
    const agentId = c.get('agentId' as never) as string;

    // Look up agent
    const agent = await deps.db.select().from(agents).where(eq(agents.id, agentId)).get();
    if (!agent) {
      throw new WAIaaSError('AGENT_NOT_FOUND', {
        message: `Agent '${agentId}' not found`,
      });
    }

    // Parse and validate request body
    const body = await c.req.json();
    const request = SendTransactionRequestSchema.parse(body);

    // Stage 1: Validate + INSERT PENDING (synchronous)
    const txId = generateId();
    const now = new Date(Math.floor(Date.now() / 1000) * 1000);

    await deps.db.insert(transactions).values({
      id: txId,
      agentId,
      chain: agent.chain,
      type: 'TRANSFER',
      status: 'PENDING',
      amount: request.amount,
      toAddress: request.to,
      sessionId: (c.get('sessionId' as never) as string | undefined) ?? null,
      createdAt: now,
    });

    // Return 201 immediately with txId (Stage 1 complete)
    const response = c.json(
      {
        id: txId,
        status: 'PENDING',
      },
      201,
    );

    // Stages 2-6 run asynchronously (fire-and-forget)
    const ctx: PipelineContext = {
      db: deps.db,
      adapter: deps.adapter,
      keyStore: deps.keyStore,
      policyEngine: deps.policyEngine,
      masterPassword: deps.masterPassword,
      agentId,
      agent: {
        publicKey: agent.publicKey,
        chain: agent.chain,
        network: agent.network,
      },
      request,
      txId,
      // v1.2: sessionId from Hono context (set by sessionAuth middleware)
      sessionId: c.get('sessionId' as never) as string | undefined,
      // v1.2: raw sqlite for evaluateAndReserve TOCTOU safety
      sqlite: deps.sqlite,
    };

    void (async () => {
      try {
        await stage2Auth(ctx);
        await stage3Policy(ctx);
        await stage4Wait(ctx);
        await stage5Execute(ctx);
        await stage6Confirm(ctx);
      } catch (error) {
        // If stages 2-6 fail and DB hasn't been updated yet, mark as FAILED
        try {
          const tx = await deps.db
            .select()
            .from(transactions)
            .where(eq(transactions.id, txId))
            .get();

          if (tx && tx.status !== 'CONFIRMED' && tx.status !== 'FAILED' && tx.status !== 'CANCELLED') {
            const errorMessage = error instanceof Error ? error.message : 'Pipeline execution failed';
            await deps.db
              .update(transactions)
              .set({ status: 'FAILED', error: errorMessage })
              .where(eq(transactions.id, txId));
          }
        } catch {
          // Swallow DB update errors in background
        }
      }
    })();

    return response;
  });

  // ---------------------------------------------------------------------------
  // GET /transactions/:id
  // ---------------------------------------------------------------------------

  router.get('/transactions/:id', async (c) => {
    const txId = c.req.param('id');

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

    return c.json({
      id: tx.id,
      agentId: tx.agentId,
      type: tx.type,
      status: tx.status,
      tier: tx.tier,
      chain: tx.chain,
      toAddress: tx.toAddress,
      amount: tx.amount,
      txHash: tx.txHash,
      error: tx.error,
      createdAt: tx.createdAt ? Math.floor(tx.createdAt.getTime() / 1000) : null,
    });
  });

  // ---------------------------------------------------------------------------
  // POST /transactions/:id/approve (ownerAuth)
  // ---------------------------------------------------------------------------

  if (deps.approvalWorkflow && deps.ownerLifecycle) {
    const approvalWorkflow = deps.approvalWorkflow;
    const ownerLifecycle = deps.ownerLifecycle;

    router.post('/transactions/:id/approve', async (c) => {
      const txId = c.req.param('id');

      // Verify the tx exists and get agentId for ownerAuth verification
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
        ownerLifecycle.markOwnerVerified(tx.agentId);
      } catch {
        // If markOwnerVerified fails (e.g., NONE state), don't fail the approval
      }

      return c.json({
        id: txId,
        status: 'EXECUTING',
        approvedAt: result.approvedAt,
      });
    });

    // ---------------------------------------------------------------------------
    // POST /transactions/:id/reject (ownerAuth)
    // ---------------------------------------------------------------------------

    router.post('/transactions/:id/reject', async (c) => {
      const txId = c.req.param('id');

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
        ownerLifecycle.markOwnerVerified(tx.agentId);
      } catch {
        // If markOwnerVerified fails (e.g., NONE state), don't fail the rejection
      }

      return c.json({
        id: txId,
        status: 'CANCELLED',
        rejectedAt: result.rejectedAt,
      });
    });
  }

  // ---------------------------------------------------------------------------
  // POST /transactions/:id/cancel (sessionAuth -- agent cancels own DELAY tx)
  // ---------------------------------------------------------------------------

  if (deps.delayQueue) {
    const delayQueue = deps.delayQueue;

    router.post('/transactions/:id/cancel', async (c) => {
      const txId = c.req.param('id');

      // Get agentId from sessionAuth context
      const sessionAgentId = c.get('agentId' as never) as string;

      // Verify the tx exists and belongs to this agent
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

      if (tx.agentId !== sessionAgentId) {
        throw new WAIaaSError('TX_NOT_FOUND', {
          message: `Transaction '${txId}' not found`,
        });
      }

      // Cancel the delay
      delayQueue.cancelDelay(txId);

      return c.json({
        id: txId,
        status: 'CANCELLED',
      });
    });
  }

  return router;
}
