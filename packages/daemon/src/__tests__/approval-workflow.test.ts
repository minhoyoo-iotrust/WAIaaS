/**
 * TDD tests for ApprovalWorkflow.
 *
 * Tests APPROVAL tier owner sign-off management: requestApproval, approve,
 * reject, processExpiredApprovals with timeout resolution priority.
 *
 * Uses in-memory SQLite + Drizzle (same pattern as database-policy-engine.test.ts).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createDatabase, pushSchema } from '../infrastructure/database/index.js';
import type { DatabaseConnection } from '../infrastructure/database/index.js';
import { wallets } from '../infrastructure/database/schema.js';
import { generateId } from '../infrastructure/database/id.js';
import { WAIaaSError } from '@waiaas/core';
import { ApprovalWorkflow } from '../workflow/approval-workflow.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let conn: DatabaseConnection;
let workflow: ApprovalWorkflow;
let walletId: string;

function nowEpoch(): number {
  return Math.floor(Date.now() / 1000);
}

async function insertTestAgent(): Promise<string> {
  const id = generateId();
  const now = new Date(Math.floor(Date.now() / 1000) * 1000);
  await conn.db.insert(wallets).values({
    id,
    name: 'test-wallet',
    chain: 'solana',
    network: 'devnet',
    publicKey: generateId(), // unique per test
    status: 'ACTIVE',
    createdAt: now,
    updatedAt: now,
  });
  return id;
}

function insertTransaction(overrides: {
  walletId: string;
  status?: string;
  amount?: string;
  reservedAmount?: string | null;
  tier?: string | null;
}): string {
  const id = generateId();
  const now = nowEpoch();
  conn.sqlite
    .prepare(
      `INSERT INTO transactions (id, wallet_id, chain, type, amount, to_address, status, tier, reserved_amount, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      id,
      overrides.walletId,
      'solana',
      'TRANSFER',
      overrides.amount ?? '100000000000',
      'Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr',
      overrides.status ?? 'PENDING',
      overrides.tier ?? 'APPROVAL',
      overrides.reservedAmount ?? '100000000000',
      now,
    );
  return id;
}

function getTxStatus(txId: string): { status: string; reserved_amount: string | null } {
  return conn.sqlite
    .prepare('SELECT status, reserved_amount FROM transactions WHERE id = ?')
    .get(txId) as { status: string; reserved_amount: string | null };
}

function getApproval(txId: string): {
  id: string;
  tx_id: string;
  expires_at: number;
  approved_at: number | null;
  rejected_at: number | null;
  owner_signature: string | null;
} | undefined {
  return conn.sqlite
    .prepare(
      'SELECT id, tx_id, expires_at, approved_at, rejected_at, owner_signature FROM pending_approvals WHERE tx_id = ?',
    )
    .get(txId) as {
    id: string;
    tx_id: string;
    expires_at: number;
    approved_at: number | null;
    rejected_at: number | null;
    owner_signature: string | null;
  } | undefined;
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(async () => {
  conn = createDatabase(':memory:');
  pushSchema(conn.sqlite);
  workflow = new ApprovalWorkflow({
    db: conn.db,
    sqlite: conn.sqlite,
    config: { policy_defaults_approval_timeout: 7200 },
  });
  walletId = await insertTestAgent();
});

afterEach(() => {
  conn.sqlite.close();
});

// ---------------------------------------------------------------------------
// requestApproval tests
// ---------------------------------------------------------------------------

describe('ApprovalWorkflow - requestApproval', () => {
  it('should create pending_approvals record and set QUEUED status', () => {
    const txId = insertTransaction({ walletId });

    const result = workflow.requestApproval(txId);

    expect(result.approvalId).toBeDefined();
    expect(result.expiresAt).toBeGreaterThan(nowEpoch());

    // Transaction should be QUEUED
    const tx = getTxStatus(txId);
    expect(tx.status).toBe('QUEUED');

    // pending_approvals record should exist
    const approval = getApproval(txId);
    expect(approval).toBeDefined();
    expect(approval!.tx_id).toBe(txId);
    expect(approval!.approved_at).toBeNull();
    expect(approval!.rejected_at).toBeNull();
  });

  it('should use policy-specific timeout when provided', () => {
    const txId = insertTransaction({ walletId });

    const result = workflow.requestApproval(txId, {
      policyTimeoutSeconds: 600,
    });

    const approval = getApproval(txId);
    expect(approval).toBeDefined();
    // expiresAt should be ~now + 600 (policy timeout)
    const expectedExpires = nowEpoch() + 600;
    expect(approval!.expires_at).toBeGreaterThanOrEqual(expectedExpires - 2);
    expect(approval!.expires_at).toBeLessThanOrEqual(expectedExpires + 2);

    expect(result.expiresAt).toBeGreaterThanOrEqual(expectedExpires - 2);
    expect(result.expiresAt).toBeLessThanOrEqual(expectedExpires + 2);
  });

  it('should use config timeout when no policy timeout', () => {
    const txId = insertTransaction({ walletId });

    // No policyTimeoutSeconds provided -> config default (7200)
    workflow.requestApproval(txId);

    const approval = getApproval(txId);
    expect(approval).toBeDefined();
    const expectedExpires = nowEpoch() + 7200;
    expect(approval!.expires_at).toBeGreaterThanOrEqual(expectedExpires - 2);
    expect(approval!.expires_at).toBeLessThanOrEqual(expectedExpires + 2);
  });

  it('should use 3600 hardcoded fallback when config is undefined', () => {
    // Create workflow without config timeout
    const wf = new ApprovalWorkflow({
      db: conn.db,
      sqlite: conn.sqlite,
      config: { policy_defaults_approval_timeout: undefined as unknown as number },
    });

    const txId = insertTransaction({ walletId });
    wf.requestApproval(txId);

    const approval = getApproval(txId);
    expect(approval).toBeDefined();
    const expectedExpires = nowEpoch() + 3600;
    expect(approval!.expires_at).toBeGreaterThanOrEqual(expectedExpires - 2);
    expect(approval!.expires_at).toBeLessThanOrEqual(expectedExpires + 2);
  });
});

// ---------------------------------------------------------------------------
// approve tests
// ---------------------------------------------------------------------------

describe('ApprovalWorkflow - approve', () => {
  it('should set EXECUTING + approvedAt + ownerSignature on valid pending', () => {
    const txId = insertTransaction({ walletId });
    workflow.requestApproval(txId);

    const signature = 'owner-sig-abc123';
    const result = workflow.approve(txId, signature);

    expect(result.txId).toBe(txId);
    expect(result.approvedAt).toBeGreaterThan(0);

    // Transaction should be EXECUTING
    const tx = getTxStatus(txId);
    expect(tx.status).toBe('EXECUTING');

    // Approval record should have approvedAt + signature
    const approval = getApproval(txId);
    expect(approval!.approved_at).not.toBeNull();
    expect(approval!.owner_signature).toBe(signature);
  });

  it('should throw APPROVAL_TIMEOUT on expired approval', () => {
    const txId = insertTransaction({ walletId });
    workflow.requestApproval(txId, { policyTimeoutSeconds: 1 });

    // Force expiration by updating expiresAt to past
    conn.sqlite
      .prepare('UPDATE pending_approvals SET expires_at = ? WHERE tx_id = ?')
      .run(nowEpoch() - 100, txId);

    expect(() => workflow.approve(txId, 'sig'))
      .toThrow(WAIaaSError);

    try {
      workflow.approve(txId, 'sig');
    } catch (err) {
      expect((err as WAIaaSError).code).toBe('APPROVAL_TIMEOUT');
    }
  });

  it('should throw APPROVAL_NOT_FOUND on non-existent approval', () => {
    const fakeTxId = generateId();

    expect(() => workflow.approve(fakeTxId, 'sig'))
      .toThrow(WAIaaSError);

    try {
      workflow.approve(fakeTxId, 'sig');
    } catch (err) {
      expect((err as WAIaaSError).code).toBe('APPROVAL_NOT_FOUND');
    }
  });

  it('should clear reserved_amount on approve', () => {
    const txId = insertTransaction({ walletId, reservedAmount: '100000000000' });
    workflow.requestApproval(txId);

    workflow.approve(txId, 'sig');

    const tx = getTxStatus(txId);
    expect(tx.reserved_amount).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// reject tests
// ---------------------------------------------------------------------------

describe('ApprovalWorkflow - reject', () => {
  it('should set CANCELLED + rejectedAt on valid pending', () => {
    const txId = insertTransaction({ walletId });
    workflow.requestApproval(txId);

    const result = workflow.reject(txId);

    expect(result.txId).toBe(txId);
    expect(result.rejectedAt).toBeGreaterThan(0);

    // Transaction should be CANCELLED
    const tx = getTxStatus(txId);
    expect(tx.status).toBe('CANCELLED');

    // Approval record should have rejectedAt
    const approval = getApproval(txId);
    expect(approval!.rejected_at).not.toBeNull();
    expect(approval!.approved_at).toBeNull(); // NOT approved
  });

  it('should throw APPROVAL_NOT_FOUND on non-existent approval', () => {
    const fakeTxId = generateId();

    expect(() => workflow.reject(fakeTxId))
      .toThrow(WAIaaSError);

    try {
      workflow.reject(fakeTxId);
    } catch (err) {
      expect((err as WAIaaSError).code).toBe('APPROVAL_NOT_FOUND');
    }
  });

  it('should clear reserved_amount on reject', () => {
    const txId = insertTransaction({ walletId, reservedAmount: '100000000000' });
    workflow.requestApproval(txId);

    workflow.reject(txId);

    const tx = getTxStatus(txId);
    expect(tx.reserved_amount).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// processExpiredApprovals tests
// ---------------------------------------------------------------------------

describe('ApprovalWorkflow - processExpiredApprovals', () => {
  it('should expire timed-out approvals and set EXPIRED status', () => {
    const txId1 = insertTransaction({ walletId });
    const txId2 = insertTransaction({ walletId });

    workflow.requestApproval(txId1, { policyTimeoutSeconds: 1 });
    workflow.requestApproval(txId2, { policyTimeoutSeconds: 1 });

    // Force both to be expired
    conn.sqlite
      .prepare('UPDATE pending_approvals SET expires_at = ?')
      .run(nowEpoch() - 100);

    const count = workflow.processExpiredApprovals(nowEpoch());

    expect(count).toBe(2);

    // Both transactions should be EXPIRED
    expect(getTxStatus(txId1).status).toBe('EXPIRED');
    expect(getTxStatus(txId2).status).toBe('EXPIRED');

    // Approval records should NOT have rejectedAt set (expired != rejected)
    const approval1 = getApproval(txId1);
    expect(approval1!.rejected_at).toBeNull();
  });

  it('should ignore non-expired approvals', () => {
    const txId1 = insertTransaction({ walletId });
    const txId2 = insertTransaction({ walletId });

    workflow.requestApproval(txId1, { policyTimeoutSeconds: 99999 }); // far future
    workflow.requestApproval(txId2, { policyTimeoutSeconds: 1 });

    // Force only txId2 to be expired
    conn.sqlite
      .prepare('UPDATE pending_approvals SET expires_at = ? WHERE tx_id = ?')
      .run(nowEpoch() - 100, txId2);

    const count = workflow.processExpiredApprovals(nowEpoch());

    expect(count).toBe(1);

    // txId1 should still be QUEUED
    expect(getTxStatus(txId1).status).toBe('QUEUED');
    // txId2 should be EXPIRED
    expect(getTxStatus(txId2).status).toBe('EXPIRED');
  });

  it('should clear reserved_amount on expired transactions', () => {
    const txId = insertTransaction({ walletId, reservedAmount: '100000000000' });
    workflow.requestApproval(txId, { policyTimeoutSeconds: 1 });

    // Force expiration
    conn.sqlite
      .prepare('UPDATE pending_approvals SET expires_at = ? WHERE tx_id = ?')
      .run(nowEpoch() - 100, txId);

    workflow.processExpiredApprovals(nowEpoch());

    const tx = getTxStatus(txId);
    expect(tx.reserved_amount).toBeNull();
  });
});
