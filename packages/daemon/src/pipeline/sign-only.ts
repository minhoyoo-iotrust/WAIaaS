/**
 * Sign-only pipeline module.
 *
 * Provides executeSignOnly() -- a standalone pipeline for signing external
 * unsigned transactions after policy evaluation. Unlike the 6-stage send
 * pipeline (stages.ts), this pipeline does NOT submit to chain.
 *
 * 10-step pipeline:
 * 1. Parse unsigned tx (adapter.parseTransaction)
 * 2. Map ParsedOperation[] to TransactionParam[] (for policy engine)
 * 3. Generate UUID v7 transaction ID
 * 4. INSERT DB record (type='SIGN', status='PENDING')
 * 5. Policy evaluation (evaluateAndReserve / evaluateBatch / evaluate)
 * 6. Check policy result (deny if !allowed)
 * 7. Check tier (DELAY/APPROVAL -> immediate rejection)
 * 8. Update tier on transaction row
 * 9. Sign (keyStore.decrypt -> adapter.signExternalTransaction -> keyStore.release)
 * 10. Update status='SIGNED', return result
 *
 * @see docs/32-pipeline-design.md
 */

import { eq } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type { Database as SQLiteDatabase } from 'better-sqlite3';
import {
  WAIaaSError,
  type IChainAdapter,
  type IPolicyEngine,
  type ParsedTransaction,
  type ParsedOperation,
  type SignedTransaction,
  type EventBus,
} from '@waiaas/core';
import { transactions } from '../infrastructure/database/schema.js';
import { generateId } from '../infrastructure/database/id.js';
import type { LocalKeyStore } from '../infrastructure/keystore/keystore.js';
import type * as schema from '../infrastructure/database/schema.js';
import { DatabasePolicyEngine } from './database-policy-engine.js';
import type { NotificationService } from '../notifications/notification-service.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SignOnlyDeps {
  db: BetterSQLite3Database<typeof schema>;
  sqlite?: SQLiteDatabase;
  adapter: IChainAdapter;
  keyStore: LocalKeyStore;
  policyEngine: IPolicyEngine;
  masterPassword: string;
  notificationService?: NotificationService;
  eventBus?: EventBus;
}

export interface SignOnlyRequest {
  transaction: string; // base64 (Solana) or 0x-hex (EVM)
  chain: string;
  network?: string;
}

export interface SignOnlyResult {
  id: string; // Transaction ID (UUID v7)
  signedTransaction: string;
  txHash?: string;
  operations: Array<{
    type: string;
    to?: string;
    amount?: string;
    token?: string;
    programId?: string;
    method?: string;
  }>;
  policyResult: {
    tier: string;
  };
}

// ---------------------------------------------------------------------------
// TransactionParam for policy engine (mirrors stages.ts interface)
// ---------------------------------------------------------------------------

interface TransactionParam {
  type: string;
  amount: string;
  toAddress: string;
  chain: string;
  network?: string;
  tokenAddress?: string;
  contractAddress?: string;
  selector?: string;
  spenderAddress?: string;
  approveAmount?: string;
}

// ---------------------------------------------------------------------------
// Helper: map ParsedOperation to TransactionParam
// ---------------------------------------------------------------------------

/**
 * Convert a ParsedOperation (from adapter parser) to a TransactionParam
 * (for policy engine evaluation).
 *
 * Mapping:
 * - NATIVE_TRANSFER -> TRANSFER (WHITELIST, SPENDING_LIMIT)
 * - TOKEN_TRANSFER -> TOKEN_TRANSFER (WHITELIST, ALLOWED_TOKENS, SPENDING_LIMIT)
 * - CONTRACT_CALL -> CONTRACT_CALL (CONTRACT_WHITELIST, METHOD_WHITELIST)
 * - APPROVE -> APPROVE (APPROVED_SPENDERS, APPROVE_AMOUNT_LIMIT, APPROVE_TIER_OVERRIDE)
 * - UNKNOWN -> CONTRACT_CALL (CONTRACT_WHITELIST default deny for unknown)
 */
export function mapOperationToParam(
  op: ParsedOperation,
  chain: string,
  network?: string,
): TransactionParam {
  switch (op.type) {
    case 'NATIVE_TRANSFER':
      return {
        type: 'TRANSFER',
        amount: (op.amount ?? 0n).toString(),
        toAddress: op.to ?? '',
        chain,
        network,
      };

    case 'TOKEN_TRANSFER':
      return {
        type: 'TOKEN_TRANSFER',
        amount: (op.amount ?? 0n).toString(),
        toAddress: op.to ?? '',
        chain,
        network,
        tokenAddress: op.token,
      };

    case 'CONTRACT_CALL':
      return {
        type: 'CONTRACT_CALL',
        amount: '0',
        toAddress: op.programId ?? op.to ?? '',
        chain,
        network,
        contractAddress: op.programId ?? op.to,
        selector: op.method,
      };

    case 'APPROVE':
      return {
        type: 'APPROVE',
        amount: (op.amount ?? 0n).toString(),
        toAddress: op.to ?? '',
        chain,
        network,
        spenderAddress: op.to,
        approveAmount: (op.amount ?? 0n).toString(),
      };

    case 'UNKNOWN':
    default:
      // UNKNOWN operations are mapped to CONTRACT_CALL for CONTRACT_WHITELIST evaluation
      // If CONTRACT_WHITELIST is active (default), this will be denied unless the programId is whitelisted
      return {
        type: 'CONTRACT_CALL',
        amount: '0',
        toAddress: op.programId ?? op.to ?? '',
        chain,
        network,
        contractAddress: op.programId ?? op.to,
        selector: op.method,
      };
  }
}

// ---------------------------------------------------------------------------
// executeSignOnly: 10-step sign-only pipeline
// ---------------------------------------------------------------------------

/**
 * Execute the sign-only pipeline for an external unsigned transaction.
 *
 * Steps:
 * 1. Parse -> 2. Map to policy params -> 3. Generate ID -> 4. INSERT DB ->
 * 5. Evaluate policy -> 6. Check allowed -> 7. Check tier (reject DELAY/APPROVAL) ->
 * 8. Update tier -> 9. Sign -> 10. Update status='SIGNED'
 *
 * @param deps - Pipeline dependencies (db, adapter, keyStore, policyEngine, etc.)
 * @param walletId - The wallet whose key will sign
 * @param request - Sign-only request (raw tx string, chain, network)
 * @param sessionId - Optional session ID for audit trail
 * @returns SignOnlyResult with signed transaction and metadata
 */
export async function executeSignOnly(
  deps: SignOnlyDeps,
  walletId: string,
  request: SignOnlyRequest,
  sessionId?: string,
): Promise<SignOnlyResult> {
  // Step 1: Parse the unsigned transaction
  let parsed: ParsedTransaction;
  try {
    parsed = await deps.adapter.parseTransaction(request.transaction);
  } catch (err) {
    throw new WAIaaSError('INVALID_TRANSACTION', {
      message: err instanceof Error ? err.message : 'Failed to parse transaction',
    });
  }

  // Fire-and-forget: notify TX_REQUESTED (never blocks pipeline)
  const firstOp = parsed.operations[0];
  void deps.notificationService?.notify('TX_REQUESTED', walletId, {
    amount: firstOp?.amount?.toString() ?? '0',
    to: firstOp?.to ?? '',
    type: 'SIGN',
    display_amount: '', // sign-only: no USD conversion
  }, { txId: 'pending', signOnly: true });

  // v1.6: emit wallet:activity TX_REQUESTED event
  deps.eventBus?.emit('wallet:activity', {
    walletId,
    activity: 'TX_REQUESTED',
    details: { signOnly: true },
    timestamp: Math.floor(Date.now() / 1000),
  });

  // Step 2: Convert ParsedOperation[] to TransactionParam[] for policy evaluation
  const txParams = parsed.operations.map((op) =>
    mapOperationToParam(op, request.chain, request.network),
  );

  // Step 3: Generate transaction ID
  const txId = generateId();
  const now = new Date(Math.floor(Date.now() / 1000) * 1000);

  // Step 4: INSERT transaction record (type='SIGN', status='PENDING')
  await deps.db.insert(transactions).values({
    id: txId,
    walletId,
    chain: request.chain,
    network: request.network ?? null,
    type: 'SIGN',
    status: 'PENDING',
    amount: firstOp?.amount?.toString() ?? null,
    toAddress: firstOp?.to ?? null,
    sessionId: sessionId ?? null,
    createdAt: now,
  });

  // Step 5: Policy evaluation (single op vs multi-op)
  let evaluation;
  if (txParams.length === 1 && deps.policyEngine instanceof DatabasePolicyEngine && deps.sqlite) {
    // Single operation: use evaluateAndReserve for TOCTOU safety
    evaluation = deps.policyEngine.evaluateAndReserve(walletId, txParams[0]!, txId);
  } else if (txParams.length > 1 && deps.policyEngine instanceof DatabasePolicyEngine) {
    // Multiple operations: use evaluateBatch
    evaluation = await deps.policyEngine.evaluateBatch(walletId, txParams);
    // For batch: manually set reserved_amount on the tx row
    if (evaluation.allowed && deps.sqlite) {
      const totalAmount = txParams.reduce((sum, p) => sum + BigInt(p.amount), 0n);
      deps.sqlite
        .prepare('UPDATE transactions SET reserved_amount = ? WHERE id = ?')
        .run(totalAmount.toString(), txId);
    }
  } else {
    evaluation = await deps.policyEngine.evaluate(walletId, txParams[0]!);
  }

  // Step 6: Check policy result
  if (!evaluation.allowed) {
    await deps.db
      .update(transactions)
      .set({ status: 'CANCELLED', error: evaluation.reason ?? 'Policy denied' })
      .where(eq(transactions.id, txId));
    throw new WAIaaSError('POLICY_DENIED', {
      message: evaluation.reason ?? 'Sign-only request denied by policy',
    });
  }

  // Step 7: DELAY/APPROVAL tier = immediate rejection for sign-only
  if (evaluation.tier === 'DELAY' || evaluation.tier === 'APPROVAL') {
    await deps.db
      .update(transactions)
      .set({
        status: 'CANCELLED',
        tier: evaluation.tier,
        error: `Sign-only does not support ${evaluation.tier} tier`,
      })
      .where(eq(transactions.id, txId));
    throw new WAIaaSError('POLICY_DENIED', {
      message: `Sign-only request requires ${evaluation.tier} tier which is not supported. Use POST /v1/transactions/send for high-value transactions.`,
    });
  }

  // Step 8: Update tier on transaction row
  await deps.db
    .update(transactions)
    .set({ tier: evaluation.tier })
    .where(eq(transactions.id, txId));

  // Step 9: Sign the transaction
  // CRITICAL: key MUST be released in finally block (see Pitfall 3)
  let signed: SignedTransaction;
  let privateKey: Uint8Array | null = null;
  try {
    privateKey = await deps.keyStore.decryptPrivateKey(walletId, deps.masterPassword);
    signed = await deps.adapter.signExternalTransaction(request.transaction, privateKey);
  } catch (err) {
    await deps.db
      .update(transactions)
      .set({ status: 'FAILED', error: err instanceof Error ? err.message : 'Signing failed' })
      .where(eq(transactions.id, txId));
    throw err instanceof WAIaaSError
      ? err
      : new WAIaaSError('CHAIN_ERROR', {
          message: err instanceof Error ? err.message : 'Failed to sign transaction',
        });
  } finally {
    if (privateKey) {
      deps.keyStore.releaseKey(privateKey);
    }
  }

  // Step 10: Update DB: status='SIGNED'
  const executedAt = new Date(Math.floor(Date.now() / 1000) * 1000);
  await deps.db
    .update(transactions)
    .set({ status: 'SIGNED', executedAt })
    .where(eq(transactions.id, txId));

  // Fire-and-forget: notify TX_SUBMITTED (sign complete, ready for external submission)
  void deps.notificationService?.notify('TX_SUBMITTED', walletId, {
    txHash: signed.txHash ?? '',
    amount: firstOp?.amount?.toString() ?? '0',
    to: firstOp?.to ?? '',
    display_amount: '', // sign-only: no USD conversion
  }, { txId, signOnly: true });

  // v1.6: emit wallet:activity TX_SUBMITTED event (sign-only complete)
  deps.eventBus?.emit('wallet:activity', {
    walletId,
    activity: 'TX_SUBMITTED',
    details: { txId, signOnly: true, txHash: signed.txHash },
    timestamp: Math.floor(Date.now() / 1000),
  });

  // Return result
  return {
    id: txId,
    signedTransaction: signed.signedTransaction,
    txHash: signed.txHash,
    operations: parsed.operations.map((op) => ({
      type: op.type,
      to: op.to,
      amount: op.amount?.toString(),
      token: op.token,
      programId: op.programId,
      method: op.method,
    })),
    policyResult: {
      tier: evaluation.tier,
    },
  };
}
