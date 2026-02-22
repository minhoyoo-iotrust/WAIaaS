/**
 * Tests for IncomingTxQueue.
 *
 * Covers: Map-based dedup by txHash:walletId, batch flush with
 * ON CONFLICT DO NOTHING, overflow protection (MAX_QUEUE_SIZE),
 * drain for graceful shutdown, and edge cases.
 *
 * Uses a mock better-sqlite3 Database to verify SQL statements
 * and parameter values without requiring a real SQLite instance.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { IncomingTransaction } from '@waiaas/core';
import { IncomingTxQueue } from '../incoming-tx-queue.js';

// ---------------------------------------------------------------------------
// Mock generateId to return predictable IDs
// ---------------------------------------------------------------------------

let idCounter = 0;
vi.mock('../../../infrastructure/database/id.js', () => ({
  generateId: () => `uuid-${++idCounter}`,
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let txCounter = 0;

/**
 * Factory for IncomingTransaction with sensible defaults.
 * Each call produces a unique txHash to prevent unintentional dedup.
 */
function makeTx(overrides?: Partial<IncomingTransaction>): IncomingTransaction {
  txCounter++;
  return {
    id: '', // Will be replaced by generateId in flush
    walletId: 'wallet-1',
    chain: 'solana',
    network: 'mainnet',
    txHash: `tx-hash-${txCounter}`,
    fromAddress: 'from-addr-1',
    amount: '1000000',
    tokenAddress: null,
    status: 'DETECTED',
    blockNumber: null,
    detectedAt: Math.floor(Date.now() / 1000),
    confirmedAt: null,
    isSuspicious: false,
    ...overrides,
  };
}

/**
 * Create a mock better-sqlite3 Database.
 *
 * @param changesOverride - Function that returns `changes` value per stmt.run() call.
 *   By default returns 1 (row inserted). Return 0 to simulate ON CONFLICT skip.
 */
function createMockDb(changesOverride?: (callIndex: number) => number) {
  let stmtRunCallIndex = 0;
  const runCalls: unknown[][] = [];
  let prepareSql = '';

  const mockStmt = {
    run: (...args: unknown[]) => {
      runCalls.push(args);
      const changes = changesOverride
        ? changesOverride(stmtRunCallIndex++)
        : 1;
      return { changes };
    },
  };

  const mockDb = {
    prepare: (sql: string) => {
      prepareSql = sql;
      return mockStmt;
    },
    transaction: (fn: (batch: IncomingTransaction[]) => IncomingTransaction[]) => {
      // Mimic better-sqlite3 transaction: returns a callable that executes fn
      return (batch: IncomingTransaction[]) => fn(batch);
    },
  };

  return {
    db: mockDb as unknown as import('better-sqlite3').Database,
    getRunCalls: () => runCalls,
    getPrepareSql: () => prepareSql,
    resetCalls: () => {
      runCalls.length = 0;
      stmtRunCallIndex = 0;
    },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('IncomingTxQueue', () => {
  let queue: IncomingTxQueue;

  beforeEach(() => {
    queue = new IncomingTxQueue();
    idCounter = 0;
    txCounter = 0;
  });

  // -----------------------------------------------------------------------
  // 1. Dedup tests
  // -----------------------------------------------------------------------

  describe('push() deduplication', () => {
    it('should deduplicate by txHash:walletId -- same key twice results in size 1', () => {
      const tx = makeTx({ txHash: 'dup-hash', walletId: 'w1' });
      queue.push(tx);
      queue.push(tx);
      expect(queue.size).toBe(1);
    });

    it('should allow same txHash with different walletId -- size 2', () => {
      queue.push(makeTx({ txHash: 'same-hash', walletId: 'w1' }));
      queue.push(makeTx({ txHash: 'same-hash', walletId: 'w2' }));
      expect(queue.size).toBe(2);
    });

    it('should allow different txHash with same walletId -- size 2', () => {
      queue.push(makeTx({ txHash: 'hash-a', walletId: 'w1' }));
      queue.push(makeTx({ txHash: 'hash-b', walletId: 'w1' }));
      expect(queue.size).toBe(2);
    });

    it('should keep the first entry when duplicate is pushed', () => {
      const first = makeTx({ txHash: 'dup', walletId: 'w1', amount: '100' });
      const second = makeTx({ txHash: 'dup', walletId: 'w1', amount: '999' });
      queue.push(first);
      queue.push(second);

      const mock = createMockDb();
      const result = queue.flush(mock.db);
      // Should have the first entry's amount, not the second
      expect(result[0]!.amount).toBe('100');
    });
  });

  // -----------------------------------------------------------------------
  // 2. Flush tests
  // -----------------------------------------------------------------------

  describe('flush()', () => {
    it('should return empty array when queue is empty', () => {
      const mock = createMockDb();
      const result = queue.flush(mock.db);
      expect(result).toEqual([]);
    });

    it('should flush 3 items, call sqlite.transaction, return 3 items, queue size 0', () => {
      const mock = createMockDb();
      queue.push(makeTx());
      queue.push(makeTx());
      queue.push(makeTx());

      const result = queue.flush(mock.db);
      expect(result).toHaveLength(3);
      expect(queue.size).toBe(0);
      expect(mock.getRunCalls()).toHaveLength(3);
    });

    it('should flush at most MAX_BATCH (100) items, leaving remainder in queue', () => {
      const mock = createMockDb();
      for (let i = 0; i < 150; i++) {
        queue.push(makeTx());
      }
      expect(queue.size).toBe(150);

      const result = queue.flush(mock.db);
      expect(result).toHaveLength(100);
      expect(queue.size).toBe(50);
    });

    it('should generate UUID v7 IDs for each item via generateId()', () => {
      const mock = createMockDb();
      queue.push(makeTx());
      queue.push(makeTx());

      const result = queue.flush(mock.db);
      expect(result[0]!.id).toBe('uuid-1');
      expect(result[1]!.id).toBe('uuid-2');
    });

    it('should pass correct parameters to stmt.run()', () => {
      const mock = createMockDb();
      const tx = makeTx({
        walletId: 'w-abc',
        chain: 'ethereum',
        network: 'ethereum-mainnet',
        txHash: 'hash-xyz',
        fromAddress: 'from-0x123',
        amount: '5000000',
        tokenAddress: '0xtoken',
        status: 'DETECTED',
        blockNumber: 42,
        detectedAt: 1700000000,
        confirmedAt: null,
        isSuspicious: true,
      });
      queue.push(tx);

      queue.flush(mock.db);
      const calls = mock.getRunCalls();
      expect(calls).toHaveLength(1);
      // Parameters: id, walletId, chain, network, txHash, fromAddress, amount, tokenAddress, status, blockNumber, detectedAt, confirmedAt, isSuspicious
      expect(calls[0]).toEqual([
        'uuid-1',       // id (generated)
        'w-abc',        // walletId
        'ethereum',     // chain
        'ethereum-mainnet', // network
        'hash-xyz',     // txHash
        'from-0x123',   // fromAddress
        '5000000',      // amount
        '0xtoken',      // tokenAddress
        'DETECTED',     // status
        42,             // blockNumber
        1700000000,     // detectedAt
        null,           // confirmedAt
        1,              // isSuspicious (boolean -> 1)
      ]);
    });

    it('should convert isSuspicious false to 0', () => {
      const mock = createMockDb();
      queue.push(makeTx({ isSuspicious: false }));
      queue.flush(mock.db);
      const calls = mock.getRunCalls();
      // Last parameter is isSuspicious
      expect(calls[0]![12]).toBe(0);
    });

    it('should convert undefined isSuspicious to 0', () => {
      const mock = createMockDb();
      const tx = makeTx();
      delete (tx as unknown as Record<string, unknown>).isSuspicious;
      queue.push(tx);
      queue.flush(mock.db);
      const calls = mock.getRunCalls();
      expect(calls[0]![12]).toBe(0);
    });
  });

  // -----------------------------------------------------------------------
  // 3. ON CONFLICT tests
  // -----------------------------------------------------------------------

  describe('ON CONFLICT handling', () => {
    it('should exclude items where stmt.run().changes === 0 from returned array', () => {
      // Items 0 and 2 inserted (changes=1), item 1 skipped (changes=0)
      const mock = createMockDb((idx) => (idx === 1 ? 0 : 1));

      queue.push(makeTx({ txHash: 'a' }));
      queue.push(makeTx({ txHash: 'b' }));
      queue.push(makeTx({ txHash: 'c' }));

      const result = queue.flush(mock.db);
      expect(result).toHaveLength(2);
      expect(result[0]!.txHash).toBe('a');
      expect(result[1]!.txHash).toBe('c');
    });

    it('should return empty array if all items conflict', () => {
      const mock = createMockDb(() => 0);

      queue.push(makeTx());
      queue.push(makeTx());

      const result = queue.flush(mock.db);
      expect(result).toHaveLength(0);
      // Queue should still be empty (items were extracted)
      expect(queue.size).toBe(0);
    });

    it('should include ON CONFLICT(tx_hash, wallet_id) DO NOTHING in INSERT SQL', () => {
      const mock = createMockDb();
      queue.push(makeTx());
      queue.flush(mock.db);

      const sql = mock.getPrepareSql();
      expect(sql).toContain('ON CONFLICT(tx_hash, wallet_id) DO NOTHING');
    });

    it('should include all 13 column names in INSERT SQL', () => {
      const mock = createMockDb();
      queue.push(makeTx());
      queue.flush(mock.db);

      const sql = mock.getPrepareSql();
      const expectedColumns = [
        'id', 'wallet_id', 'chain', 'network', 'tx_hash',
        'from_address', 'amount', 'token_address', 'status',
        'block_number', 'detected_at', 'confirmed_at', 'is_suspicious',
      ];
      for (const col of expectedColumns) {
        expect(sql).toContain(col);
      }
    });
  });

  // -----------------------------------------------------------------------
  // 4. Overflow tests
  // -----------------------------------------------------------------------

  describe('overflow protection (MAX_QUEUE_SIZE)', () => {
    it('should cap queue at 10,000 entries when pushing 10,001', () => {
      for (let i = 0; i < 10_001; i++) {
        queue.push(makeTx());
      }
      expect(queue.size).toBe(10_000);
    });

    it('should log console.warn on overflow', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      // Fill to MAX_QUEUE_SIZE
      for (let i = 0; i < 10_000; i++) {
        queue.push(makeTx());
      }
      expect(warnSpy).not.toHaveBeenCalled();

      // Push one more to trigger overflow
      queue.push(makeTx());
      expect(warnSpy).toHaveBeenCalledWith('IncomingTxQueue overflow: dropping oldest entry');

      warnSpy.mockRestore();
    });

    it('should drop the oldest entry on overflow (first-inserted is removed)', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      // Push 10,000 items, keeping track of the first
      const firstTx = makeTx({ txHash: 'first-tx' });
      queue.push(firstTx);
      for (let i = 1; i < 10_000; i++) {
        queue.push(makeTx());
      }
      expect(queue.size).toBe(10_000);

      // Push one more -- should evict 'first-tx'
      const overflowTx = makeTx({ txHash: 'overflow-tx' });
      queue.push(overflowTx);
      expect(queue.size).toBe(10_000);

      // Flush all and verify first-tx is not present
      const mock = createMockDb();
      const allInserted: IncomingTransaction[] = [];
      while (queue.size > 0) {
        allInserted.push(...queue.flush(mock.db));
      }

      const hashes = allInserted.map((tx) => tx.txHash);
      expect(hashes).not.toContain('first-tx');
      expect(hashes).toContain('overflow-tx');

      warnSpy.mockRestore();
    });
  });

  // -----------------------------------------------------------------------
  // 5. drain() tests
  // -----------------------------------------------------------------------

  describe('drain()', () => {
    it('should drain 250 items across multiple flush cycles, queue empty after', () => {
      const mock = createMockDb();
      for (let i = 0; i < 250; i++) {
        queue.push(makeTx());
      }

      const result = queue.drain(mock.db);
      expect(result).toHaveLength(250);
      expect(queue.size).toBe(0);
    });

    it('should return empty array when draining empty queue', () => {
      const mock = createMockDb();
      const result = queue.drain(mock.db);
      expect(result).toEqual([]);
    });

    it('should combine results from multiple flush cycles', () => {
      const mock = createMockDb();
      // 250 items = 3 flush cycles (100 + 100 + 50)
      for (let i = 0; i < 250; i++) {
        queue.push(makeTx());
      }

      const result = queue.drain(mock.db);
      // Should have all 250 items with unique generated IDs
      const ids = new Set(result.map((tx) => tx.id));
      expect(ids.size).toBe(250);
    });
  });

  // -----------------------------------------------------------------------
  // 6. Thread safety / single-threaded correctness tests
  // -----------------------------------------------------------------------

  describe('single-threaded correctness', () => {
    it('should only flush items present at call time (not items pushed during iteration)', () => {
      const mock = createMockDb();
      // Push 5 items
      for (let i = 0; i < 5; i++) {
        queue.push(makeTx());
      }

      // flush extracts items from Map. Since JS is single-threaded,
      // no new items can appear during flush. Verify flush count matches.
      const result = queue.flush(mock.db);
      expect(result).toHaveLength(5);
      expect(queue.size).toBe(0);
    });

    it('should handle rapid push-flush-push-flush cycles correctly', () => {
      const mock = createMockDb();

      queue.push(makeTx({ txHash: 'batch1-a' }));
      queue.push(makeTx({ txHash: 'batch1-b' }));
      const result1 = queue.flush(mock.db);
      expect(result1).toHaveLength(2);
      expect(queue.size).toBe(0);

      queue.push(makeTx({ txHash: 'batch2-a' }));
      const result2 = queue.flush(mock.db);
      expect(result2).toHaveLength(1);
      expect(result2[0]!.txHash).toBe('batch2-a');
      expect(queue.size).toBe(0);
    });
  });

  // -----------------------------------------------------------------------
  // 7. Edge cases
  // -----------------------------------------------------------------------

  describe('edge cases', () => {
    it('should handle null tokenAddress correctly', () => {
      const mock = createMockDb();
      queue.push(makeTx({ tokenAddress: null }));
      queue.flush(mock.db);
      const calls = mock.getRunCalls();
      // tokenAddress is at index 7 in the parameter list
      expect(calls[0]![7]).toBeNull();
    });

    it('should handle token transfer with tokenAddress', () => {
      const mock = createMockDb();
      queue.push(makeTx({ tokenAddress: 'So11111111111111111111111111111111111111112' }));
      queue.flush(mock.db);
      const calls = mock.getRunCalls();
      expect(calls[0]![7]).toBe('So11111111111111111111111111111111111111112');
    });

    it('should handle isSuspicious=true correctly in flush parameters', () => {
      const mock = createMockDb();
      queue.push(makeTx({ isSuspicious: true }));
      queue.flush(mock.db);
      const calls = mock.getRunCalls();
      // isSuspicious is at index 12 (last parameter)
      expect(calls[0]![12]).toBe(1);
    });

    it('should correctly extract exactly MAX_BATCH from larger queue', () => {
      const mock = createMockDb();
      // Push exactly 100 + 1 items
      for (let i = 0; i < 101; i++) {
        queue.push(makeTx());
      }

      const result = queue.flush(mock.db);
      expect(result).toHaveLength(100);
      expect(queue.size).toBe(1);

      // Second flush gets the remaining 1
      const result2 = queue.flush(mock.db);
      expect(result2).toHaveLength(1);
      expect(queue.size).toBe(0);
    });

    it('should report size 0 for newly created queue', () => {
      const freshQueue = new IncomingTxQueue();
      expect(freshQueue.size).toBe(0);
    });
  });
});
