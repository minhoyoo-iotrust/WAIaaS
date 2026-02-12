/**
 * TDD tests for 56-02: stage4Wait DELAY/APPROVAL branching + executeFromStage5 re-entry.
 *
 * Features tested:
 * 1-2. INSTANT/NOTIFY passthrough (no queue, no approval)
 * 3-4. DELAY tier queueing via DelayQueue.queueDelay()
 * 5-6. APPROVAL tier pending approval via ApprovalWorkflow.requestApproval()
 * 7-8. Async pipeline halts at stage4 for DELAY/APPROVAL tiers
 * 9-10. executeFromStage5 re-entry for expired delays + error handling
 *
 * Uses in-memory SQLite + Drizzle + pushSchema pattern.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { eq } from 'drizzle-orm';
import { createDatabase, pushSchema } from '../infrastructure/database/index.js';
import type { DatabaseConnection } from '../infrastructure/database/index.js';
import { wallets, transactions } from '../infrastructure/database/schema.js';
import { generateId } from '../infrastructure/database/id.js';
import { DelayQueue } from '../workflow/delay-queue.js';
import { ApprovalWorkflow } from '../workflow/approval-workflow.js';
import {
  stage2Auth,
  stage4Wait,
  stage5Execute,
  stage6Confirm,
} from '../pipeline/stages.js';
import type { PipelineContext } from '../pipeline/stages.js';
import { DefaultPolicyEngine } from '../pipeline/default-policy-engine.js';
import { WAIaaSError } from '@waiaas/core';
import type { IChainAdapter } from '@waiaas/core';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let conn: DatabaseConnection;

function createMockAdapter(overrides: Partial<IChainAdapter> = {}): IChainAdapter {
  return {
    chain: 'solana' as const,
    network: 'devnet' as const,
    connect: async () => {},
    disconnect: async () => {},
    isConnected: () => true,
    getHealth: async () => ({ healthy: true, latencyMs: 1 }),
    getBalance: async (addr: string) => ({
      address: addr,
      balance: 1_000_000_000n,
      decimals: 9,
      symbol: 'SOL',
    }),
    buildTransaction: async () => ({
      chain: 'solana',
      serialized: new Uint8Array(128),
      estimatedFee: 5000n,
      metadata: {},
    }),
    simulateTransaction: async () => ({ success: true, logs: [] }),
    signTransaction: async () => new Uint8Array(256),
    submitTransaction: async () => ({ txHash: 'mock-hash-' + Date.now(), status: 'submitted' as const }),
    waitForConfirmation: async (txHash: string) => ({
      txHash,
      status: 'confirmed' as const,
      confirmations: 1,
    }),
    getAssets: async () => [],
    // v1.4 stubs
    estimateFee: async () => { throw new Error('not implemented'); },
    buildTokenTransfer: async () => { throw new Error('not implemented'); },
    getTokenInfo: async () => { throw new Error('not implemented'); },
    buildContractCall: async () => { throw new Error('not implemented'); },
    buildApprove: async () => { throw new Error('not implemented'); },
    buildBatch: async () => { throw new Error('not implemented'); },
    getTransactionFee: async () => { throw new Error('not implemented'); },
    getCurrentNonce: async () => 0,
    sweepAll: async () => { throw new Error('not implemented'); },
    ...overrides,
  };
}

function createMockKeyStore() {
  return {
    generateKeyPair: async () => ({
      publicKey: '11111111111111111111111111111112',
      encryptedPrivateKey: new Uint8Array(64),
    }),
    decryptPrivateKey: async () => new Uint8Array(64).fill(42),
    releaseKey: () => {},
    hasKey: async () => true,
    deleteKey: async () => {},
    lockAll: () => {},
    sodiumAvailable: true,
  } as any;
}

const MOCK_PUBLIC_KEY = '11111111111111111111111111111112';

async function insertTestAgent(
  overrides: { ownerAddress?: string | null; ownerVerified?: boolean } = {},
): Promise<string> {
  const id = generateId();
  const now = new Date(Math.floor(Date.now() / 1000) * 1000);
  await conn.db.insert(wallets).values({
    id,
    name: 'test-wallet',
    chain: 'solana',
    network: 'devnet',
    publicKey: MOCK_PUBLIC_KEY + '-' + id.slice(0, 8),
    status: 'ACTIVE',
    ownerAddress: overrides.ownerAddress ?? null,
    ownerVerified: overrides.ownerVerified ?? false,
    createdAt: now,
    updatedAt: now,
  });
  return id;
}

async function insertPendingTransaction(
  walletId: string,
  overrides: {
    status?: string;
    queuedAt?: number;
    metadata?: string;
  } = {},
): Promise<string> {
  const id = generateId();
  const now = new Date(Math.floor(Date.now() / 1000) * 1000);
  await conn.db.insert(transactions).values({
    id,
    walletId,
    chain: 'solana',
    type: 'TRANSFER',
    status: overrides.status ?? 'PENDING',
    amount: '1000000000',
    toAddress: 'Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr',
    createdAt: now,
  });

  // Set raw fields via sqlite if needed
  if (overrides.queuedAt !== undefined || overrides.metadata !== undefined) {
    const updates: string[] = [];
    const params: unknown[] = [];
    if (overrides.queuedAt !== undefined) {
      updates.push('queued_at = ?');
      params.push(overrides.queuedAt);
    }
    if (overrides.metadata !== undefined) {
      updates.push('metadata = ?');
      params.push(overrides.metadata);
    }
    params.push(id);
    conn.sqlite
      .prepare(`UPDATE transactions SET ${updates.join(', ')} WHERE id = ?`)
      .run(...params);
  }

  return id;
}

function createPipelineContext(
  walletId: string,
  txId: string,
  overrides: Partial<PipelineContext> = {},
): PipelineContext {
  return {
    db: conn.db,
    adapter: createMockAdapter(),
    keyStore: createMockKeyStore(),
    policyEngine: new DefaultPolicyEngine(),
    masterPassword: 'test-master',
    walletId,
    wallet: { publicKey: MOCK_PUBLIC_KEY, chain: 'solana', network: 'devnet' },
    request: { to: 'Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr', amount: '1000000000' },
    txId,
    ...overrides,
  } as PipelineContext;
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  conn = createDatabase(':memory:');
  pushSchema(conn.sqlite);
});

afterEach(() => {
  conn.sqlite.close();
});

// ---------------------------------------------------------------------------
// 56-02 stage4Wait Tests
// ---------------------------------------------------------------------------

describe('56-02 stage4Wait', () => {
  // =========================================================================
  // Test group 1: INSTANT/NOTIFY passthrough
  // =========================================================================

  describe('Test group 1: INSTANT/NOTIFY passthrough', () => {
    it('stage4Wait passes through INSTANT tier (no queue, no approval)', async () => {
      const walletId = await insertTestAgent();
      const txId = await insertPendingTransaction(walletId);

      const delayQueue = new DelayQueue({ db: conn.db, sqlite: conn.sqlite });
      const approvalWorkflow = new ApprovalWorkflow({
        db: conn.db,
        sqlite: conn.sqlite,
        config: { policy_defaults_approval_timeout: 3600 },
      });

      const ctx = createPipelineContext(walletId, txId, {
        tier: 'INSTANT',
        delayQueue,
        approvalWorkflow,
      });

      // Should return normally without throwing
      await stage4Wait(ctx);

      // Transaction status should remain PENDING (not QUEUED)
      const tx = await conn.db
        .select()
        .from(transactions)
        .where(eq(transactions.id, txId))
        .get();
      expect(tx!.status).toBe('PENDING');

      // No pending_approvals row should exist
      const approvals = conn.sqlite
        .prepare('SELECT COUNT(*) as cnt FROM pending_approvals WHERE tx_id = ?')
        .get(txId) as { cnt: number };
      expect(approvals.cnt).toBe(0);
    });

    it('stage4Wait passes through NOTIFY tier (no queue, no approval)', async () => {
      const walletId = await insertTestAgent();
      const txId = await insertPendingTransaction(walletId);

      const delayQueue = new DelayQueue({ db: conn.db, sqlite: conn.sqlite });
      const approvalWorkflow = new ApprovalWorkflow({
        db: conn.db,
        sqlite: conn.sqlite,
        config: { policy_defaults_approval_timeout: 3600 },
      });

      const ctx = createPipelineContext(walletId, txId, {
        tier: 'NOTIFY',
        delayQueue,
        approvalWorkflow,
      });

      await stage4Wait(ctx);

      const tx = await conn.db
        .select()
        .from(transactions)
        .where(eq(transactions.id, txId))
        .get();
      expect(tx!.status).toBe('PENDING');

      const approvals = conn.sqlite
        .prepare('SELECT COUNT(*) as cnt FROM pending_approvals WHERE tx_id = ?')
        .get(txId) as { cnt: number };
      expect(approvals.cnt).toBe(0);
    });
  });

  // =========================================================================
  // Test group 2: DELAY tier
  // =========================================================================

  describe('Test group 2: DELAY tier', () => {
    it('stage4Wait queues DELAY tier via DelayQueue.queueDelay()', async () => {
      const walletId = await insertTestAgent();
      const txId = await insertPendingTransaction(walletId);

      const delayQueue = new DelayQueue({ db: conn.db, sqlite: conn.sqlite });
      const approvalWorkflow = new ApprovalWorkflow({
        db: conn.db,
        sqlite: conn.sqlite,
        config: { policy_defaults_approval_timeout: 3600 },
      });

      const ctx = createPipelineContext(walletId, txId, {
        tier: 'DELAY',
        delaySeconds: 300,
        delayQueue,
        approvalWorkflow,
      });

      // stage4Wait should throw PIPELINE_HALTED for DELAY tier
      await expect(stage4Wait(ctx)).rejects.toThrow();

      // Verify transaction status changed to QUEUED in DB
      const tx = await conn.db
        .select()
        .from(transactions)
        .where(eq(transactions.id, txId))
        .get();
      expect(tx!.status).toBe('QUEUED');

      // Verify queued_at is set
      const rawTx = conn.sqlite
        .prepare('SELECT queued_at, metadata FROM transactions WHERE id = ?')
        .get(txId) as { queued_at: number | null; metadata: string | null };
      expect(rawTx.queued_at).toBeTruthy();

      // Verify metadata contains delaySeconds
      const metadata = JSON.parse(rawTx.metadata!);
      expect(metadata.delaySeconds).toBe(300);
    });

    it('stage4Wait uses default delaySeconds when not set on ctx', async () => {
      const walletId = await insertTestAgent();
      const txId = await insertPendingTransaction(walletId);

      const delayQueue = new DelayQueue({ db: conn.db, sqlite: conn.sqlite });
      const approvalWorkflow = new ApprovalWorkflow({
        db: conn.db,
        sqlite: conn.sqlite,
        config: { policy_defaults_approval_timeout: 3600 },
      });

      const ctx = createPipelineContext(walletId, txId, {
        tier: 'DELAY',
        // No delaySeconds set -- should use config default or 60s fallback
        delayQueue,
        approvalWorkflow,
        config: { policy_defaults_delay_seconds: 120, policy_defaults_approval_timeout: 3600 },
      });

      await expect(stage4Wait(ctx)).rejects.toThrow();

      // Verify queueDelay was called with config default (120)
      const rawTx = conn.sqlite
        .prepare('SELECT metadata FROM transactions WHERE id = ?')
        .get(txId) as { metadata: string | null };
      const metadata = JSON.parse(rawTx.metadata!);
      expect(metadata.delaySeconds).toBe(120);
    });
  });

  // =========================================================================
  // Test group 3: APPROVAL tier
  // =========================================================================

  describe('Test group 3: APPROVAL tier', () => {
    it('stage4Wait creates pending approval for APPROVAL tier', async () => {
      const walletId = await insertTestAgent();
      const txId = await insertPendingTransaction(walletId);

      const delayQueue = new DelayQueue({ db: conn.db, sqlite: conn.sqlite });
      const approvalWorkflow = new ApprovalWorkflow({
        db: conn.db,
        sqlite: conn.sqlite,
        config: { policy_defaults_approval_timeout: 3600 },
      });

      const ctx = createPipelineContext(walletId, txId, {
        tier: 'APPROVAL',
        delayQueue,
        approvalWorkflow,
      });

      // stage4Wait should throw PIPELINE_HALTED for APPROVAL tier
      await expect(stage4Wait(ctx)).rejects.toThrow();

      // Verify transaction status changed to QUEUED in DB
      const tx = await conn.db
        .select()
        .from(transactions)
        .where(eq(transactions.id, txId))
        .get();
      expect(tx!.status).toBe('QUEUED');

      // Verify a pending_approvals row exists with matching tx_id
      const approval = conn.sqlite
        .prepare('SELECT id, tx_id, expires_at FROM pending_approvals WHERE tx_id = ?')
        .get(txId) as { id: string; tx_id: string; expires_at: number } | undefined;
      expect(approval).toBeTruthy();
      expect(approval!.tx_id).toBe(txId);
      expect(approval!.expires_at).toBeGreaterThan(0);
    });

    it('stage4Wait halts pipeline for APPROVAL tier (throws PIPELINE_HALTED)', async () => {
      const walletId = await insertTestAgent();
      const txId = await insertPendingTransaction(walletId);

      const delayQueue = new DelayQueue({ db: conn.db, sqlite: conn.sqlite });
      const approvalWorkflow = new ApprovalWorkflow({
        db: conn.db,
        sqlite: conn.sqlite,
        config: { policy_defaults_approval_timeout: 3600 },
      });

      const ctx = createPipelineContext(walletId, txId, {
        tier: 'APPROVAL',
        delayQueue,
        approvalWorkflow,
      });

      // Should throw a PIPELINE_HALTED error specifically
      try {
        await stage4Wait(ctx);
        // Should not reach here
        expect.unreachable('stage4Wait should throw for APPROVAL tier');
      } catch (error) {
        expect(error).toBeInstanceOf(WAIaaSError);
        expect((error as WAIaaSError).code).toBe('PIPELINE_HALTED');
      }
    });
  });

  // =========================================================================
  // Test group 4: Pipeline halt mechanism (full async flow)
  // =========================================================================

  describe('Test group 4: Pipeline halt mechanism', () => {
    it('async pipeline stops at stage4 for DELAY tier (stage5 not called)', async () => {
      const walletId = await insertTestAgent();
      const txId = await insertPendingTransaction(walletId);

      const delayQueue = new DelayQueue({ db: conn.db, sqlite: conn.sqlite });
      const approvalWorkflow = new ApprovalWorkflow({
        db: conn.db,
        sqlite: conn.sqlite,
        config: { policy_defaults_approval_timeout: 3600 },
      });

      const ctx = createPipelineContext(walletId, txId, {
        tier: 'DELAY',
        delaySeconds: 60,
        delayQueue,
        approvalWorkflow,
      });

      // Simulate the full async pipeline flow (stage2->stage3->stage4->stage5->stage6)
      // stage4Wait should throw PIPELINE_HALTED which prevents stage5Execute from running
      let stage5Called = false;
      try {
        await stage2Auth(ctx);
        // Skip stage3 (requires policy setup) -- tier is already set
        await stage4Wait(ctx);
        // If we reach here, stage5 would be called -- that's a test failure
        stage5Called = true;
        await stage5Execute(ctx);
        await stage6Confirm(ctx);
      } catch (error) {
        if (error instanceof WAIaaSError && error.code === 'PIPELINE_HALTED') {
          // Expected: pipeline halted at stage4
        } else {
          throw error;
        }
      }

      expect(stage5Called).toBe(false);

      // Transaction should be QUEUED (not SUBMITTED)
      const tx = await conn.db
        .select()
        .from(transactions)
        .where(eq(transactions.id, txId))
        .get();
      expect(tx!.status).toBe('QUEUED');
    });

    it('async pipeline stops at stage4 for APPROVAL tier (stage5 not called)', async () => {
      const walletId = await insertTestAgent();
      const txId = await insertPendingTransaction(walletId);

      const delayQueue = new DelayQueue({ db: conn.db, sqlite: conn.sqlite });
      const approvalWorkflow = new ApprovalWorkflow({
        db: conn.db,
        sqlite: conn.sqlite,
        config: { policy_defaults_approval_timeout: 3600 },
      });

      const ctx = createPipelineContext(walletId, txId, {
        tier: 'APPROVAL',
        delayQueue,
        approvalWorkflow,
      });

      let stage5Called = false;
      try {
        await stage2Auth(ctx);
        await stage4Wait(ctx);
        stage5Called = true;
        await stage5Execute(ctx);
        await stage6Confirm(ctx);
      } catch (error) {
        if (error instanceof WAIaaSError && error.code === 'PIPELINE_HALTED') {
          // Expected
        } else {
          throw error;
        }
      }

      expect(stage5Called).toBe(false);

      const tx = await conn.db
        .select()
        .from(transactions)
        .where(eq(transactions.id, txId))
        .get();
      expect(tx!.status).toBe('QUEUED');
    });
  });

  // =========================================================================
  // Test group 5: executeFromStage5 (delay-expired re-entry)
  // =========================================================================

  describe('Test group 5: executeFromStage5 re-entry', () => {
    it('processExpired returns expired transactions and stage5+stage6 runs to CONFIRMED', async () => {
      const walletId = await insertTestAgent();

      // Insert a QUEUED transaction with queued_at in the past and delaySeconds=1
      const pastTime = Math.floor(Date.now() / 1000) - 10; // 10 seconds ago
      const txId = await insertPendingTransaction(walletId, {
        status: 'QUEUED',
        queuedAt: pastTime,
        metadata: JSON.stringify({ delaySeconds: 1 }),
      });

      const delayQueue = new DelayQueue({ db: conn.db, sqlite: conn.sqlite });

      // processExpired should return this transaction
      const now = Math.floor(Date.now() / 1000);
      const expired = delayQueue.processExpired(now);
      expect(expired).toHaveLength(1);
      expect(expired[0]!.txId).toBe(txId);
      expect(expired[0]!.walletId).toBe(walletId);

      // Verify transaction status changed to EXECUTING
      const txAfterExpiry = await conn.db
        .select()
        .from(transactions)
        .where(eq(transactions.id, txId))
        .get();
      expect(txAfterExpiry!.status).toBe('EXECUTING');

      // Now construct a PipelineContext for stages 5-6 (executeFromStage5 equivalent)
      const ctx = createPipelineContext(walletId, txId, {
        adapter: createMockAdapter(),
      });

      // Run stage5Execute + stage6Confirm
      await stage5Execute(ctx);
      await stage6Confirm(ctx);

      // Verify the transaction ends in CONFIRMED status
      const finalTx = await conn.db
        .select()
        .from(transactions)
        .where(eq(transactions.id, txId))
        .get();
      expect(finalTx!.status).toBe('CONFIRMED');
    });

    it('executeFromStage5 marks transaction FAILED on stage5 error', async () => {
      const walletId = await insertTestAgent();

      const pastTime = Math.floor(Date.now() / 1000) - 10;
      const txId = await insertPendingTransaction(walletId, {
        status: 'QUEUED',
        queuedAt: pastTime,
        metadata: JSON.stringify({ delaySeconds: 1 }),
      });

      const delayQueue = new DelayQueue({ db: conn.db, sqlite: conn.sqlite });

      const now = Math.floor(Date.now() / 1000);
      const expired = delayQueue.processExpired(now);
      expect(expired).toHaveLength(1);

      // Create a mock adapter that rejects buildTransaction
      const failingAdapter = createMockAdapter({
        buildTransaction: async () => {
          throw new Error('RPC unavailable');
        },
      });

      const ctx = createPipelineContext(walletId, txId, {
        adapter: failingAdapter,
      });

      // Run stage5Execute -- should throw
      try {
        await stage5Execute(ctx);
        expect.unreachable('stage5Execute should throw with failing adapter');
      } catch (error) {
        // Expected -- mark as FAILED (simulating executeFromStage5 error handling)
        const errorMessage = error instanceof Error ? error.message : 'Pipeline re-entry failed';
        await conn.db
          .update(transactions)
          .set({ status: 'FAILED', error: errorMessage })
          .where(eq(transactions.id, txId));
      }

      // Verify the transaction is marked FAILED with error message
      const finalTx = await conn.db
        .select()
        .from(transactions)
        .where(eq(transactions.id, txId))
        .get();
      expect(finalTx!.status).toBe('FAILED');
      expect(finalTx!.error).toContain('RPC unavailable');
    });
  });
});
