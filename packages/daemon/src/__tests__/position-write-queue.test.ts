/**
 * Unit tests for PositionWriteQueue.
 *
 * Tests: enqueue/dedup, flush, ON CONFLICT DO UPDATE, batch limits, clear.
 * @see LEND-03
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { PositionWriteQueue } from '../services/defi/position-write-queue.js';
import { createDatabase, pushSchema } from '../infrastructure/database/index.js';
import type { PositionUpdate } from '@waiaas/core';
import type { Database as DatabaseType } from 'better-sqlite3';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeUpdate(overrides: Partial<PositionUpdate> = {}): PositionUpdate {
  return {
    walletId: 'wallet-1',
    category: 'LENDING',
    provider: 'aave-v3',
    chain: 'ethereum',
    network: 'ethereum-mainnet',
    assetId: '0xtoken',
    amount: '100.0',
    amountUsd: 100,
    metadata: { healthFactor: 1.5 },
    status: 'ACTIVE',
    openedAt: Math.floor(Date.now() / 1000),
    closedAt: null,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('PositionWriteQueue', () => {
  let sqlite: DatabaseType;
  let queue: PositionWriteQueue;

  beforeEach(() => {
    const conn = createDatabase(':memory:');
    sqlite = conn.sqlite;
    pushSchema(sqlite);

    // Insert a test wallet (FK requirement)
    sqlite
      .prepare(
        "INSERT INTO wallets (id, name, chain, environment, public_key, status, created_at, updated_at) VALUES (?, 'test', 'ethereum', 'testnet', '0xabc', 'ACTIVE', 0, 0)",
      )
      .run('wallet-1');

    queue = new PositionWriteQueue();
  });

  afterEach(() => {
    sqlite.close();
  });

  it('enqueues and deduplicates by composite key (last write wins)', () => {
    queue.enqueue(makeUpdate({ amount: '100' }));
    queue.enqueue(makeUpdate({ amount: '200' })); // same composite key
    expect(queue.size).toBe(1);
  });

  it('enqueues items with different keys', () => {
    queue.enqueue(makeUpdate({ walletId: 'wallet-1' }));
    queue.enqueue(makeUpdate({ walletId: 'wallet-2' }));
    expect(queue.size).toBe(2);
  });

  it('flushes to defi_positions table with ON CONFLICT DO UPDATE', () => {
    queue.enqueue(makeUpdate());
    const flushed = queue.flush(sqlite);
    expect(flushed).toBe(1);
    expect(queue.size).toBe(0);

    const rows = sqlite.prepare('SELECT * FROM defi_positions').all() as Array<Record<string, unknown>>;
    expect(rows).toHaveLength(1);
    expect(rows[0]!.wallet_id).toBe('wallet-1');
    expect(rows[0]!.amount).toBe('100.0');
    expect(rows[0]!.category).toBe('LENDING');
    expect(rows[0]!.provider).toBe('aave-v3');
  });

  it('updates existing position on conflict (last write wins)', () => {
    queue.enqueue(makeUpdate({ amount: '100' }));
    queue.flush(sqlite);

    // Same composite key, different amount
    queue.enqueue(makeUpdate({ amount: '200' }));
    queue.flush(sqlite);

    const rows = sqlite.prepare('SELECT amount FROM defi_positions').all() as Array<{ amount: string }>;
    expect(rows).toHaveLength(1);
    expect(rows[0]!.amount).toBe('200');
  });

  it('returns 0 when queue is empty', () => {
    const flushed = queue.flush(sqlite);
    expect(flushed).toBe(0);
  });

  it('handles MAX_BATCH limit (100)', () => {
    // Enqueue 150 items with unique keys
    for (let i = 0; i < 150; i++) {
      queue.enqueue(makeUpdate({ assetId: `token-${i}` }));
    }
    expect(queue.size).toBe(150);

    const first = queue.flush(sqlite);
    expect(first).toBe(100);
    expect(queue.size).toBe(50);

    const second = queue.flush(sqlite);
    expect(second).toBe(50);
    expect(queue.size).toBe(0);
  });

  it('clear() empties the queue', () => {
    queue.enqueue(makeUpdate());
    queue.enqueue(makeUpdate({ walletId: 'wallet-2' }));
    expect(queue.size).toBe(2);

    queue.clear();
    expect(queue.size).toBe(0);
  });
});
