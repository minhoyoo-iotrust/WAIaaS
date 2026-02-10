/**
 * 6-stage transaction pipeline stages.
 *
 * Stage 1: Validate request + INSERT PENDING transaction (with sessionId audit trail)
 * Stage 2: Auth (sessionId passthrough from route handler)
 * Stage 3: Policy evaluation (evaluateAndReserve TOCTOU-safe + downgradeIfNoOwner)
 * Stage 4: Wait (v1.1 passthrough, INSTANT tier only)
 * Stage 5: On-chain execution (build -> simulate -> sign -> submit)
 * Stage 6: Confirmation wait
 *
 * @see docs/32-pipeline-design.md
 */

import { eq } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type { Database as SQLiteDatabase } from 'better-sqlite3';
import {
  WAIaaSError,
  SendTransactionRequestSchema,
  type IChainAdapter,
  type IPolicyEngine,
  type PolicyTier,
  type UnsignedTransaction,
  type SubmitResult,
  type SendTransactionRequest,
} from '@waiaas/core';
import { agents, transactions } from '../infrastructure/database/schema.js';
import { generateId } from '../infrastructure/database/id.js';
import type { LocalKeyStore } from '../infrastructure/keystore/keystore.js';
import type * as schema from '../infrastructure/database/schema.js';
import { DatabasePolicyEngine } from './database-policy-engine.js';
import { downgradeIfNoOwner } from '../workflow/owner-state.js';
import type { DelayQueue } from '../workflow/delay-queue.js';
import type { ApprovalWorkflow } from '../workflow/approval-workflow.js';

// ---------------------------------------------------------------------------
// Pipeline context
// ---------------------------------------------------------------------------

export interface PipelineContext {
  // Dependencies
  db: BetterSQLite3Database<typeof schema>;
  adapter: IChainAdapter;
  keyStore: LocalKeyStore;
  policyEngine: IPolicyEngine;
  masterPassword: string;
  // Request data
  agentId: string;
  agent: { publicKey: string; chain: string; network: string };
  request: SendTransactionRequest;
  // State accumulated through stages
  txId: string;
  tier?: PolicyTier;
  unsignedTx?: UnsignedTransaction;
  signedTx?: Uint8Array;
  submitResult?: SubmitResult;
  // v1.2: session + policy integration
  sessionId?: string;
  sqlite?: SQLiteDatabase;
  delaySeconds?: number;
  downgraded?: boolean;
  // v1.2: workflow dependencies for stage4Wait
  delayQueue?: DelayQueue;
  approvalWorkflow?: ApprovalWorkflow;
  config?: {
    policy_defaults_delay_seconds: number;
    policy_defaults_approval_timeout: number;
  };
}

// ---------------------------------------------------------------------------
// Stage 1: Validate + DB INSERT
// ---------------------------------------------------------------------------

export async function stage1Validate(ctx: PipelineContext): Promise<void> {
  // Validate request with Zod schema
  SendTransactionRequestSchema.parse(ctx.request);

  // Generate transaction ID
  ctx.txId = generateId();

  // INSERT PENDING transaction into DB
  const now = new Date(Math.floor(Date.now() / 1000) * 1000);

  await ctx.db.insert(transactions).values({
    id: ctx.txId,
    agentId: ctx.agentId,
    chain: ctx.agent.chain,
    type: 'TRANSFER',
    status: 'PENDING',
    amount: ctx.request.amount,
    toAddress: ctx.request.to,
    sessionId: ctx.sessionId ?? null,
    createdAt: now,
  });
}

// ---------------------------------------------------------------------------
// Stage 2: Auth (v1.1 passthrough)
// ---------------------------------------------------------------------------

export async function stage2Auth(_ctx: PipelineContext): Promise<void> {
  // sessionId is set on PipelineContext by the route handler from Hono c.get('sessionId').
  // In v1.2 this stage validates session is still active.
  // For now, the sessionAuth middleware already validated the JWT and set sessionId.
}

// ---------------------------------------------------------------------------
// Stage 3: Policy evaluation
// ---------------------------------------------------------------------------

export async function stage3Policy(ctx: PipelineContext): Promise<void> {
  let evaluation;

  // Use evaluateAndReserve for TOCTOU-safe evaluation when DatabasePolicyEngine + sqlite available
  if (ctx.policyEngine instanceof DatabasePolicyEngine && ctx.sqlite) {
    evaluation = ctx.policyEngine.evaluateAndReserve(
      ctx.agentId,
      {
        type: 'TRANSFER',
        amount: ctx.request.amount,
        toAddress: ctx.request.to,
        chain: ctx.agent.chain,
      },
      ctx.txId,
    );
  } else {
    evaluation = await ctx.policyEngine.evaluate(ctx.agentId, {
      type: 'TRANSFER',
      amount: ctx.request.amount,
      toAddress: ctx.request.to,
      chain: ctx.agent.chain,
    });
  }

  if (!evaluation.allowed) {
    // Update tx status to CANCELLED (REJECTED not in TRANSACTION_STATUSES enum)
    await ctx.db
      .update(transactions)
      .set({ status: 'CANCELLED', error: evaluation.reason ?? 'Policy denied' })
      .where(eq(transactions.id, ctx.txId));

    throw new WAIaaSError('POLICY_DENIED', {
      message: evaluation.reason ?? 'Transaction denied by policy',
    });
  }

  let tier = evaluation.tier;
  let downgraded = false;

  // Check for APPROVAL -> DELAY downgrade when no owner registered
  if (tier === 'APPROVAL') {
    const agentRow = await ctx.db.select().from(agents).where(eq(agents.id, ctx.agentId)).get();
    if (agentRow) {
      const result = downgradeIfNoOwner(
        {
          ownerAddress: agentRow.ownerAddress ?? null,
          ownerVerified: agentRow.ownerVerified ?? false,
        },
        tier,
      );
      tier = result.tier as PolicyTier;
      downgraded = result.downgraded;
    }
  }

  // Set tier and metadata on context
  ctx.tier = tier;
  ctx.downgraded = downgraded;
  if (evaluation.delaySeconds !== undefined) {
    ctx.delaySeconds = evaluation.delaySeconds;
  }

  // Update DB with tier
  await ctx.db
    .update(transactions)
    .set({ tier })
    .where(eq(transactions.id, ctx.txId));
}

// ---------------------------------------------------------------------------
// Stage 4: Wait (v1.1 passthrough)
// ---------------------------------------------------------------------------

export async function stage4Wait(_ctx: PipelineContext): Promise<void> {
  // v1.1: no-op (only INSTANT tier, no DELAY/APPROVAL)
  // In v1.2+ this will implement delay timers and approval workflows
}

// ---------------------------------------------------------------------------
// Stage 5: On-chain execution
// ---------------------------------------------------------------------------

export async function stage5Execute(ctx: PipelineContext): Promise<void> {
  // Build unsigned transaction
  ctx.unsignedTx = await ctx.adapter.buildTransaction({
    from: ctx.agent.publicKey,
    to: ctx.request.to,
    amount: BigInt(ctx.request.amount),
    memo: ctx.request.memo,
  });

  // Simulate
  const simResult = await ctx.adapter.simulateTransaction(ctx.unsignedTx);
  if (!simResult.success) {
    await ctx.db
      .update(transactions)
      .set({ status: 'FAILED', error: simResult.error ?? 'Simulation failed' })
      .where(eq(transactions.id, ctx.txId));

    throw new WAIaaSError('SIMULATION_FAILED', {
      message: simResult.error ?? 'Transaction simulation failed',
    });
  }

  // Decrypt private key, sign, and submit
  // CRITICAL: key MUST be released in finally block
  let privateKey: Uint8Array | null = null;
  try {
    privateKey = await ctx.keyStore.decryptPrivateKey(ctx.agentId, ctx.masterPassword);

    // Sign
    ctx.signedTx = await ctx.adapter.signTransaction(ctx.unsignedTx, privateKey);
  } finally {
    // Always release the key, even if sign throws
    if (privateKey) {
      ctx.keyStore.releaseKey(privateKey);
    }
  }

  // Submit
  ctx.submitResult = await ctx.adapter.submitTransaction(ctx.signedTx);

  // Update DB: SUBMITTED with txHash
  await ctx.db
    .update(transactions)
    .set({ status: 'SUBMITTED', txHash: ctx.submitResult.txHash })
    .where(eq(transactions.id, ctx.txId));
}

// ---------------------------------------------------------------------------
// Stage 6: Confirmation wait
// ---------------------------------------------------------------------------

export async function stage6Confirm(ctx: PipelineContext): Promise<void> {
  try {
    await ctx.adapter.waitForConfirmation(ctx.submitResult!.txHash, 30_000);

    // Confirmed: update DB
    const executedAt = new Date(Math.floor(Date.now() / 1000) * 1000);
    await ctx.db
      .update(transactions)
      .set({ status: 'CONFIRMED', executedAt })
      .where(eq(transactions.id, ctx.txId));
  } catch (error) {
    // Timeout or RPC error: mark FAILED
    const errorMessage =
      error instanceof Error ? error.message : 'Confirmation failed';

    await ctx.db
      .update(transactions)
      .set({ status: 'FAILED', error: errorMessage })
      .where(eq(transactions.id, ctx.txId));

    throw new WAIaaSError('CHAIN_ERROR', {
      message: errorMessage,
      cause: error instanceof Error ? error : undefined,
    });
  }
}
