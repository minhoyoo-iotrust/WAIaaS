/**
 * IncomingTxQueue: Memory buffer for incoming transactions.
 *
 * Collects incoming transactions from chain subscriber callbacks and
 * batch-flushes them to SQLite in periodic intervals. Prevents SQLITE_BUSY
 * contention from concurrent WebSocket callbacks.
 *
 * Features:
 * - Map-based in-memory deduplication by txHash:walletId composite key
 * - Bounded memory (MAX_QUEUE_SIZE = 10,000) with oldest-first eviction
 * - Batch INSERT with ON CONFLICT DO NOTHING for DB-level safety
 * - flush() returns only actually-inserted records
 *
 * @see docs/76-incoming-transaction-monitoring.md section 2.6
 */

import type { Database } from 'better-sqlite3';
import type { IncomingTransaction } from '@waiaas/core';
import { generateId } from '../../infrastructure/database/id.js';

/** Maximum items extracted per flush() call. */
const MAX_BATCH = 100;

/** Maximum queue size before oldest entries are evicted. */
const MAX_QUEUE_SIZE = 10_000;

/**
 * INSERT statement for incoming_transactions table.
 * 13 columns matching DB v21 schema. ON CONFLICT(tx_hash, wallet_id) DO NOTHING
 * provides DB-level dedup safety net.
 */
const INSERT_SQL = `INSERT INTO incoming_transactions (id, wallet_id, chain, network, tx_hash, from_address, amount, token_address, status, block_number, detected_at, confirmed_at, is_suspicious) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(tx_hash, wallet_id) DO NOTHING`;

export class IncomingTxQueue {
  private queue = new Map<string, IncomingTransaction>();

  /** Current number of queued items. */
  get size(): number {
    return this.queue.size;
  }

  /**
   * Add a transaction to the queue. Synchronous, O(1).
   *
   * Deduplicates by txHash:walletId composite key -- if the same key
   * already exists in the queue, the push is silently ignored.
   *
   * If queue is at MAX_QUEUE_SIZE, the oldest entry (first Map key)
   * is evicted before the new entry is added.
   */
  push(tx: IncomingTransaction): void {
    if (this.queue.size >= MAX_QUEUE_SIZE) {
      // Drop oldest entry (first key in insertion order) to prevent memory leak
      const firstKey = this.queue.keys().next().value;
      if (firstKey !== undefined) {
        this.queue.delete(firstKey);
      }
      console.warn('IncomingTxQueue overflow: dropping oldest entry');
    }

    const key = `${tx.txHash}:${tx.walletId}`;
    if (!this.queue.has(key)) {
      this.queue.set(key, tx);
    }
  }

  /**
   * Batch-flush up to MAX_BATCH items from the queue to SQLite.
   *
   * Extracts items from the queue, generates UUID v7 IDs, and inserts
   * them atomically using a SQLite transaction with ON CONFLICT DO NOTHING.
   *
   * @returns Only the actually-inserted IncomingTransaction items
   *          (excludes ON CONFLICT skipped ones).
   */
  flush(sqlite: Database): IncomingTransaction[] {
    if (this.queue.size === 0) return [];

    // Extract up to MAX_BATCH items from queue
    const batch: IncomingTransaction[] = [];
    for (const [key, tx] of this.queue) {
      batch.push(tx);
      this.queue.delete(key);
      if (batch.length >= MAX_BATCH) break;
    }

    // Prepare INSERT statement
    const stmt = sqlite.prepare(INSERT_SQL);

    // Run all inserts atomically, tracking which rows were actually inserted
    const insertMany = sqlite.transaction((txs: IncomingTransaction[]) => {
      const inserted: IncomingTransaction[] = [];
      for (const tx of txs) {
        const id = generateId();
        const result = stmt.run(
          id,
          tx.walletId,
          tx.chain,
          tx.network,
          tx.txHash,
          tx.fromAddress,
          tx.amount,
          tx.tokenAddress,
          tx.status,
          tx.blockNumber,
          tx.detectedAt,
          tx.confirmedAt,
          tx.isSuspicious ? 1 : 0,
        );
        if (result.changes > 0) {
          inserted.push({ ...tx, id });
        }
      }
      return inserted;
    });

    return insertMany(batch);
  }

  /**
   * Flush the entire queue (for graceful shutdown).
   *
   * Calls flush() in a loop until the queue is empty,
   * collecting all successfully inserted items.
   *
   * @returns All inserted IncomingTransaction items across all flush cycles.
   */
  drain(sqlite: Database): IncomingTransaction[] {
    const allInserted: IncomingTransaction[] = [];
    while (this.queue.size > 0) {
      const inserted = this.flush(sqlite);
      allInserted.push(...inserted);
    }
    return allInserted;
  }
}
