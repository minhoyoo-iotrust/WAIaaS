/**
 * Transaction routes: POST /v1/transactions/send and GET /v1/transactions/:id.
 *
 * POST /v1/transactions/send:
 *   - Requires X-Agent-Id header
 *   - Parses body with SendTransactionRequestSchema
 *   - Stage 1 runs synchronously (DB INSERT -> returns 201 with txId)
 *   - Stages 2-6 run asynchronously (fire-and-forget with error catching)
 *
 * GET /v1/transactions/:id:
 *   - Returns transaction status JSON
 *   - 404 if not found
 *
 * v1.1: Agent identification via X-Agent-Id header (no sessionAuth).
 *
 * @see docs/37-rest-api-complete-spec.md
 */

import { Hono } from 'hono';
import { eq } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
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

export interface TransactionRouteDeps {
  db: BetterSQLite3Database<typeof schema>;
  adapter: IChainAdapter;
  keyStore: LocalKeyStore;
  policyEngine: IPolicyEngine;
  masterPassword: string;
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
    const agentId = c.req.header('X-Agent-Id');
    if (!agentId) {
      throw new WAIaaSError('ACTION_VALIDATION_FAILED', {
        message: 'X-Agent-Id header is required',
      });
    }

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

  return router;
}
