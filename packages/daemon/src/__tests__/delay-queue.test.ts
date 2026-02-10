/**
 * TDD tests for DelayQueue.
 *
 * Tests DELAY tier transaction lifecycle: queue with cooldown,
 * cancel during wait, auto-execute after expiry.
 *
 * Uses in-memory SQLite + Drizzle (same pattern as database-policy-engine.test.ts).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createDatabase, pushSchema } from '../infrastructure/database/index.js';
import type { DatabaseConnection } from '../infrastructure/database/index.js';
import { agents } from '../infrastructure/database/schema.js';
import { generateId } from '../infrastructure/database/id.js';
import { WAIaaSError } from '@waiaas/core';
import { DelayQueue } from '../workflow/delay-queue.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let conn: DatabaseConnection;
let queue: DelayQueue;
let agentId: string;

async function insertTestAgent(): Promise<string> {
  const id = generateId();
  const now = new Date(Math.floor(Date.now() / 1000) * 1000);
  await conn.db.insert(agents).values({
    id,
    name: 'test-agent',
    chain: 'solana',
    network: 'devnet',
    publicKey: `pk-${id}`,
    status: 'ACTIVE',
    createdAt: now,
    updatedAt: now,
  });
  return id;
}

function insertTransaction(overrides: {
  agentId: string;
  status?: string;
  amount?: string;
  reservedAmount?: string | null;
}): string {
  const id = generateId();
  const now = Math.floor(Date.now() / 1000);
  conn.sqlite
    .prepare(
      `INSERT INTO transactions (id, agent_id, chain, type, amount, to_address, status, reserved_amount, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      id,
      overrides.agentId,
      'solana',
      'TRANSFER',
      overrides.amount ?? '1000000000',
      'Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr',
      overrides.status ?? 'PENDING',
      overrides.reservedAmount ?? null,
      now,
    );
  return id;
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(async () => {
  conn = createDatabase(':memory:');
  pushSchema(conn.sqlite);
  queue = new DelayQueue({ db: conn.db, sqlite: conn.sqlite });
  agentId = await insertTestAgent();
});

afterEach(() => {
  conn.sqlite.close();
});

// ---------------------------------------------------------------------------
// queueDelay tests
// ---------------------------------------------------------------------------

describe('DelayQueue - queueDelay', () => {
  it('should set QUEUED status, queuedAt, and metadata with delaySeconds', () => {
    const txId = insertTransaction({ agentId, status: 'PENDING' });
    const delaySeconds = 300;

    const result = queue.queueDelay(txId, delaySeconds);

    expect(result.queuedAt).toBeTypeOf('number');
    expect(result.expiresAt).toBe(result.queuedAt + delaySeconds);

    // Verify DB state
    const row = conn.sqlite
      .prepare('SELECT status, queued_at, metadata FROM transactions WHERE id = ?')
      .get(txId) as { status: string; queued_at: number; metadata: string };

    expect(row.status).toBe('QUEUED');
    expect(row.queued_at).toBe(result.queuedAt);

    const metadata = JSON.parse(row.metadata);
    expect(metadata.delaySeconds).toBe(delaySeconds);
  });
});

// ---------------------------------------------------------------------------
// cancelDelay tests
// ---------------------------------------------------------------------------

describe('DelayQueue - cancelDelay', () => {
  it('should cancel a QUEUED transaction and set status to CANCELLED', () => {
    const txId = insertTransaction({ agentId, status: 'PENDING', reservedAmount: '1000000000' });
    queue.queueDelay(txId, 300);

    queue.cancelDelay(txId);

    const row = conn.sqlite
      .prepare('SELECT status, reserved_amount FROM transactions WHERE id = ?')
      .get(txId) as { status: string; reserved_amount: string | null };

    expect(row.status).toBe('CANCELLED');
    expect(row.reserved_amount).toBeNull();
  });

  it('should throw TX_ALREADY_PROCESSED when cancelling a non-QUEUED transaction', () => {
    const txId = insertTransaction({ agentId, status: 'CONFIRMED' });

    expect(() => queue.cancelDelay(txId)).toThrow(WAIaaSError);
    try {
      queue.cancelDelay(txId);
    } catch (err) {
      expect((err as WAIaaSError).code).toBe('TX_ALREADY_PROCESSED');
    }
  });

  it('should throw TX_NOT_FOUND when cancelling a non-existent transaction', () => {
    expect(() => queue.cancelDelay('non-existent-id')).toThrow(WAIaaSError);
    try {
      queue.cancelDelay('non-existent-id');
    } catch (err) {
      expect((err as WAIaaSError).code).toBe('TX_NOT_FOUND');
    }
  });

  it('should clear reserved_amount on cancellation', () => {
    const txId = insertTransaction({
      agentId,
      status: 'PENDING',
      reservedAmount: '5000000000',
    });
    queue.queueDelay(txId, 300);

    // Verify reserved_amount still set after queuing
    const before = conn.sqlite
      .prepare('SELECT reserved_amount FROM transactions WHERE id = ?')
      .get(txId) as { reserved_amount: string | null };
    expect(before.reserved_amount).toBe('5000000000');

    queue.cancelDelay(txId);

    const after = conn.sqlite
      .prepare('SELECT reserved_amount FROM transactions WHERE id = ?')
      .get(txId) as { reserved_amount: string | null };
    expect(after.reserved_amount).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// processExpired tests
// ---------------------------------------------------------------------------

describe('DelayQueue - processExpired', () => {
  it('should return expired QUEUED transactions and set them to EXECUTING', () => {
    const txId = insertTransaction({ agentId, status: 'PENDING' });
    // Queue with 60 second delay
    queue.queueDelay(txId, 60);

    // Manually set queuedAt to 120 seconds ago so it's expired
    const pastTime = Math.floor(Date.now() / 1000) - 120;
    conn.sqlite
      .prepare('UPDATE transactions SET queued_at = ? WHERE id = ?')
      .run(pastTime, txId);

    const now = Math.floor(Date.now() / 1000);
    const expired = queue.processExpired(now);

    expect(expired).toHaveLength(1);
    expect(expired[0].txId).toBe(txId);
    expect(expired[0].agentId).toBe(agentId);

    // Verify DB status changed to EXECUTING
    const row = conn.sqlite
      .prepare('SELECT status FROM transactions WHERE id = ?')
      .get(txId) as { status: string };
    expect(row.status).toBe('EXECUTING');
  });

  it('should ignore QUEUED transactions whose cooldown has not elapsed', () => {
    const txId = insertTransaction({ agentId, status: 'PENDING' });
    // Queue with 600 second delay (10 minutes into the future)
    queue.queueDelay(txId, 600);

    const now = Math.floor(Date.now() / 1000);
    const expired = queue.processExpired(now);

    expect(expired).toHaveLength(0);

    // Verify status still QUEUED
    const row = conn.sqlite
      .prepare('SELECT status FROM transactions WHERE id = ?')
      .get(txId) as { status: string };
    expect(row.status).toBe('QUEUED');
  });

  it('should be idempotent -- already EXECUTING transactions are not returned', () => {
    const txId = insertTransaction({ agentId, status: 'PENDING' });
    queue.queueDelay(txId, 60);

    // Force expire
    const pastTime = Math.floor(Date.now() / 1000) - 120;
    conn.sqlite
      .prepare('UPDATE transactions SET queued_at = ? WHERE id = ?')
      .run(pastTime, txId);

    const now = Math.floor(Date.now() / 1000);

    // First call: should return expired
    const first = queue.processExpired(now);
    expect(first).toHaveLength(1);

    // Second call: already EXECUTING, should not return
    const second = queue.processExpired(now);
    expect(second).toHaveLength(0);
  });

  it('should handle multiple expired transactions from different agents', async () => {
    const agentId2 = await insertTestAgent();

    const txId1 = insertTransaction({ agentId, status: 'PENDING' });
    const txId2 = insertTransaction({ agentId: agentId2, status: 'PENDING' });

    queue.queueDelay(txId1, 60);
    queue.queueDelay(txId2, 60);

    // Force both to expire
    const pastTime = Math.floor(Date.now() / 1000) - 120;
    conn.sqlite
      .prepare('UPDATE transactions SET queued_at = ? WHERE id IN (?, ?)')
      .run(pastTime, txId1, txId2);

    const now = Math.floor(Date.now() / 1000);
    const expired = queue.processExpired(now);

    expect(expired).toHaveLength(2);
    const txIds = expired.map((e) => e.txId);
    expect(txIds).toContain(txId1);
    expect(txIds).toContain(txId2);
  });
});

// ---------------------------------------------------------------------------
// isExpired tests
// ---------------------------------------------------------------------------

describe('DelayQueue - isExpired', () => {
  it('should return true when cooldown has elapsed', () => {
    const txId = insertTransaction({ agentId, status: 'PENDING' });
    queue.queueDelay(txId, 60);

    // Set queuedAt to 120 seconds ago
    const pastTime = Math.floor(Date.now() / 1000) - 120;
    conn.sqlite
      .prepare('UPDATE transactions SET queued_at = ? WHERE id = ?')
      .run(pastTime, txId);

    expect(queue.isExpired(txId)).toBe(true);
  });

  it('should return false when cooldown has not elapsed', () => {
    const txId = insertTransaction({ agentId, status: 'PENDING' });
    queue.queueDelay(txId, 600);

    expect(queue.isExpired(txId)).toBe(false);
  });
});
