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
  TransactionRequestSchema,
  type IChainAdapter,
  type IPolicyEngine,
  type PolicyTier,
  type UnsignedTransaction,
  type SubmitResult,
  type SendTransactionRequest,
  type TransactionRequest,
  type BatchRequest,
} from '@waiaas/core';
import { agents, transactions } from '../infrastructure/database/schema.js';
import { generateId } from '../infrastructure/database/id.js';
import type { LocalKeyStore } from '../infrastructure/keystore/keystore.js';
import type * as schema from '../infrastructure/database/schema.js';
import { DatabasePolicyEngine } from './database-policy-engine.js';
import { downgradeIfNoOwner } from '../workflow/owner-state.js';
import type { DelayQueue } from '../workflow/delay-queue.js';
import type { ApprovalWorkflow } from '../workflow/approval-workflow.js';
import type { NotificationService } from '../notifications/notification-service.js';

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
  request: SendTransactionRequest | TransactionRequest;
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
  // v1.3.4: notification service for pipeline event triggers
  notificationService?: NotificationService;
}

// ---------------------------------------------------------------------------
// Helper: safe request field accessors for union type
// ---------------------------------------------------------------------------

/** Safely extract `amount` from SendTransactionRequest | TransactionRequest. */
function getRequestAmount(req: SendTransactionRequest | TransactionRequest): string {
  if ('amount' in req && typeof req.amount === 'string') return req.amount;
  return '0';
}

/** Safely extract `to` from SendTransactionRequest | TransactionRequest. */
function getRequestTo(req: SendTransactionRequest | TransactionRequest): string {
  if ('to' in req && typeof req.to === 'string') return req.to;
  return '';
}

/** Safely extract `memo` from SendTransactionRequest | TransactionRequest. */
function getRequestMemo(req: SendTransactionRequest | TransactionRequest): string | undefined {
  if ('memo' in req && typeof req.memo === 'string') return req.memo;
  return undefined;
}

// ---------------------------------------------------------------------------
// Helper: build type-specific TransactionParam for policy evaluation
// ---------------------------------------------------------------------------

interface TransactionParam {
  type: string;
  amount: string;
  toAddress: string;
  chain: string;
  tokenAddress?: string;
  contractAddress?: string;
  selector?: string;
  spenderAddress?: string;
  approveAmount?: string;
}

function buildTransactionParam(
  req: SendTransactionRequest | TransactionRequest,
  txType: string,
  chain: string,
): TransactionParam {
  switch (txType) {
    case 'TOKEN_TRANSFER': {
      const r = req as { to: string; amount: string; token: { address: string } };
      return {
        type: 'TOKEN_TRANSFER',
        amount: r.amount,
        toAddress: r.to,
        chain,
        tokenAddress: r.token.address,
      };
    }
    case 'CONTRACT_CALL': {
      const r = req as { to: string; calldata?: string; value?: string };
      return {
        type: 'CONTRACT_CALL',
        amount: r.value ?? '0',
        toAddress: r.to,
        chain,
        contractAddress: r.to,
        selector: r.calldata?.slice(0, 10),
      };
    }
    case 'APPROVE': {
      const r = req as { spender: string; amount: string };
      return {
        type: 'APPROVE',
        amount: r.amount,
        toAddress: r.spender,
        chain,
        spenderAddress: r.spender,
        approveAmount: r.amount,
      };
    }
    case 'TRANSFER':
    default: {
      const r = req as { to: string; amount: string };
      return {
        type: 'TRANSFER',
        amount: r.amount,
        toAddress: r.to,
        chain,
      };
    }
  }
}

// ---------------------------------------------------------------------------
// Stage 1: Validate + DB INSERT
// ---------------------------------------------------------------------------

export async function stage1Validate(ctx: PipelineContext): Promise<void> {
  // Validate request with appropriate Zod schema
  // If request has a `type` field, use discriminatedUnion schema (5-type)
  // Otherwise, use legacy SendTransactionRequestSchema (backward compat)
  const req = ctx.request;
  if ('type' in req && req.type) {
    TransactionRequestSchema.parse(req);
  } else {
    SendTransactionRequestSchema.parse(req);
  }

  // Determine transaction type from request
  const txType = ('type' in req && req.type) ? req.type : 'TRANSFER';

  // Generate transaction ID
  ctx.txId = generateId();

  // INSERT PENDING transaction into DB
  const now = new Date(Math.floor(Date.now() / 1000) * 1000);

  // Extract common and type-specific fields for DB INSERT
  const amount = 'amount' in req ? (req as { amount?: string }).amount : undefined;
  const toAddress = 'to' in req ? (req as { to?: string }).to : undefined;

  await ctx.db.insert(transactions).values({
    id: ctx.txId,
    agentId: ctx.agentId,
    chain: ctx.agent.chain,
    type: txType,
    status: 'PENDING',
    amount: amount ?? null,
    toAddress: toAddress ?? null,
    sessionId: ctx.sessionId ?? null,
    createdAt: now,
  });

  // Fire-and-forget: notify TX_REQUESTED (never blocks pipeline)
  void ctx.notificationService?.notify('TX_REQUESTED', ctx.agentId, {
    amount: amount ?? '0',
    to: toAddress ?? '',
    type: txType,
  }, { txId: ctx.txId });
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

  // Determine transaction type from request
  const req = ctx.request;
  const txType = ('type' in req && req.type) ? req.type : 'TRANSFER';

  // BATCH type uses evaluateBatch (2-stage policy evaluation)
  if (txType === 'BATCH' && ctx.policyEngine instanceof DatabasePolicyEngine) {
    const batchReq = req as BatchRequest;
    // Classify each instruction and build TransactionParam array
    const params = batchReq.instructions.map((instr) => {
      let instrType = 'TRANSFER';
      if ('spender' in instr) instrType = 'APPROVE';
      else if ('token' in instr) instrType = 'TOKEN_TRANSFER';
      else if ('programId' in instr || 'calldata' in instr) instrType = 'CONTRACT_CALL';

      return {
        type: instrType,
        amount: 'amount' in instr ? (instr as { amount?: string }).amount ?? '0' : '0',
        toAddress: 'to' in instr ? (instr as { to?: string }).to ?? '' : '',
        chain: ctx.agent.chain,
        tokenAddress: 'token' in instr ? (instr as { token?: { address: string } }).token?.address : undefined,
        contractAddress: instrType === 'CONTRACT_CALL' ? ('to' in instr ? (instr as { to?: string }).to : undefined) : undefined,
        selector: 'calldata' in instr ? (instr as { calldata?: string }).calldata?.slice(0, 10) : undefined,
        spenderAddress: 'spender' in instr ? (instr as { spender?: string }).spender : undefined,
        approveAmount: instrType === 'APPROVE' && 'amount' in instr ? (instr as { amount?: string }).amount : undefined,
      };
    });

    evaluation = await ctx.policyEngine.evaluateBatch(ctx.agentId, params);
  } else {
    // Build type-specific TransactionParam
    const txParam = buildTransactionParam(req, txType, ctx.agent.chain);

    // Use evaluateAndReserve for TOCTOU-safe evaluation when DatabasePolicyEngine + sqlite available
    if (ctx.policyEngine instanceof DatabasePolicyEngine && ctx.sqlite) {
      evaluation = ctx.policyEngine.evaluateAndReserve(
        ctx.agentId,
        txParam,
        ctx.txId,
      );
    } else {
      evaluation = await ctx.policyEngine.evaluate(ctx.agentId, txParam);
    }
  }

  if (!evaluation.allowed) {
    // Update tx status to CANCELLED (REJECTED not in TRANSACTION_STATUSES enum)
    await ctx.db
      .update(transactions)
      .set({ status: 'CANCELLED', error: evaluation.reason ?? 'Policy denied' })
      .where(eq(transactions.id, ctx.txId));

    // Fire-and-forget: notify POLICY_VIOLATION (never blocks pipeline)
    void ctx.notificationService?.notify('POLICY_VIOLATION', ctx.agentId, {
      reason: evaluation.reason ?? 'Policy denied',
      amount: getRequestAmount(ctx.request),
      to: getRequestTo(ctx.request),
    }, { txId: ctx.txId });

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
// Stage 4: Wait (DELAY/APPROVAL branching, INSTANT/NOTIFY passthrough)
// ---------------------------------------------------------------------------

export async function stage4Wait(ctx: PipelineContext): Promise<void> {
  const tier = ctx.tier;

  // INSTANT and NOTIFY: pass through to stage5
  if (tier === 'INSTANT' || tier === 'NOTIFY') {
    return;
  }

  // DELAY: queue with cooldown, halt pipeline
  if (tier === 'DELAY') {
    if (!ctx.delayQueue) {
      // Fallback: if no DelayQueue, treat as INSTANT (backward compat)
      return;
    }
    const delaySeconds = ctx.delaySeconds
      ?? ctx.config?.policy_defaults_delay_seconds
      ?? 60;
    ctx.delayQueue.queueDelay(ctx.txId, delaySeconds);

    // Halt pipeline -- transaction will be picked up by processExpired worker
    throw new WAIaaSError('PIPELINE_HALTED', {
      message: `Transaction ${ctx.txId} queued for ${delaySeconds}s delay`,
    });
  }

  // APPROVAL: create pending approval, halt pipeline
  if (tier === 'APPROVAL') {
    if (!ctx.approvalWorkflow) {
      // Fallback: if no ApprovalWorkflow, treat as INSTANT (backward compat)
      return;
    }
    ctx.approvalWorkflow.requestApproval(ctx.txId);

    // Halt pipeline -- transaction will be picked up by approve/reject/expire
    throw new WAIaaSError('PIPELINE_HALTED', {
      message: `Transaction ${ctx.txId} queued for owner approval`,
    });
  }
}

// ---------------------------------------------------------------------------
// Stage 5: On-chain execution
// ---------------------------------------------------------------------------

export async function stage5Execute(ctx: PipelineContext): Promise<void> {
  const reqAmount = getRequestAmount(ctx.request);
  const reqTo = getRequestTo(ctx.request);
  const reqMemo = getRequestMemo(ctx.request);

  // Build unsigned transaction
  ctx.unsignedTx = await ctx.adapter.buildTransaction({
    from: ctx.agent.publicKey,
    to: reqTo,
    amount: BigInt(reqAmount),
    memo: reqMemo,
  });

  // Simulate
  const simResult = await ctx.adapter.simulateTransaction(ctx.unsignedTx);
  if (!simResult.success) {
    await ctx.db
      .update(transactions)
      .set({ status: 'FAILED', error: simResult.error ?? 'Simulation failed' })
      .where(eq(transactions.id, ctx.txId));

    // Fire-and-forget: notify TX_FAILED on simulation failure (never blocks pipeline)
    void ctx.notificationService?.notify('TX_FAILED', ctx.agentId, {
      reason: simResult.error ?? 'Simulation failed',
      amount: reqAmount,
    }, { txId: ctx.txId });

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

  // Fire-and-forget: notify TX_SUBMITTED (never blocks pipeline)
  void ctx.notificationService?.notify('TX_SUBMITTED', ctx.agentId, {
    txHash: ctx.submitResult.txHash,
    amount: reqAmount,
    to: reqTo,
  }, { txId: ctx.txId });
}

// ---------------------------------------------------------------------------
// Stage 6: Confirmation wait
// ---------------------------------------------------------------------------

export async function stage6Confirm(ctx: PipelineContext): Promise<void> {
  const reqAmount = getRequestAmount(ctx.request);
  const reqTo = getRequestTo(ctx.request);

  try {
    await ctx.adapter.waitForConfirmation(ctx.submitResult!.txHash, 30_000);

    // Confirmed: update DB
    const executedAt = new Date(Math.floor(Date.now() / 1000) * 1000);
    await ctx.db
      .update(transactions)
      .set({ status: 'CONFIRMED', executedAt })
      .where(eq(transactions.id, ctx.txId));

    // Fire-and-forget: notify TX_CONFIRMED (never blocks pipeline)
    void ctx.notificationService?.notify('TX_CONFIRMED', ctx.agentId, {
      txHash: ctx.submitResult!.txHash,
      amount: reqAmount,
      to: reqTo,
    }, { txId: ctx.txId });
  } catch (error) {
    // Timeout or RPC error: mark FAILED
    const errorMessage =
      error instanceof Error ? error.message : 'Confirmation failed';

    await ctx.db
      .update(transactions)
      .set({ status: 'FAILED', error: errorMessage })
      .where(eq(transactions.id, ctx.txId));

    // Fire-and-forget: notify TX_FAILED on confirmation failure (never blocks pipeline)
    void ctx.notificationService?.notify('TX_FAILED', ctx.agentId, {
      reason: errorMessage,
      amount: reqAmount,
    }, { txId: ctx.txId });

    throw new WAIaaSError('CHAIN_ERROR', {
      message: errorMessage,
      cause: error instanceof Error ? error : undefined,
    });
  }
}
