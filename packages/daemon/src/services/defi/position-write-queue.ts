/**
 * PositionWriteQueue: Memory buffer for DeFi position upserts.
 *
 * Collects PositionUpdate items from PositionTracker sync operations
 * and batch-flushes them to defi_positions via ON CONFLICT DO UPDATE.
 * Map-based deduplication by 4-part composite key (walletId:provider:assetId:category).
 *
 * Pattern: IncomingTxQueue adaptation for upsert (DO UPDATE instead of DO NOTHING).
 * Design source: m29-00 design doc section 6.3.
 * @see LEND-03
 */

import type { Database } from 'better-sqlite3';
import type { PositionUpdate } from '@waiaas/core';
import { generateId } from '../../infrastructure/database/id.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Maximum items extracted per flush() call. */
const MAX_BATCH = 100;

/** INSERT ... ON CONFLICT DO UPDATE statement for defi_positions. */
const UPSERT_SQL = `INSERT INTO defi_positions (id, wallet_id, category, provider, chain, environment, network, asset_id, amount, amount_usd, metadata, status, opened_at, closed_at, last_synced_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(wallet_id, provider, asset_id, category) DO UPDATE SET amount=excluded.amount, amount_usd=excluded.amount_usd, metadata=excluded.metadata, status=excluded.status, environment=excluded.environment, closed_at=excluded.closed_at, last_synced_at=excluded.last_synced_at, updated_at=excluded.updated_at`;

// ---------------------------------------------------------------------------
// Internal upsert row type
// ---------------------------------------------------------------------------

interface PositionUpsert {
  id: string;
  walletId: string;
  category: string;
  provider: string;
  chain: string;
  environment: string;
  network: string | null;
  assetId: string | null;
  amount: string;
  amountUsd: number | null;
  metadata: string;
  status: string;
  openedAt: number;
  closedAt: number | null;
  lastSyncedAt: number;
  createdAt: number;
  updatedAt: number;
}

// ---------------------------------------------------------------------------
// PositionWriteQueue
// ---------------------------------------------------------------------------

export class PositionWriteQueue {
  private queue = new Map<string, PositionUpsert>();

  /** Current number of queued items. */
  get size(): number {
    return this.queue.size;
  }

  /**
   * Add a position update to the queue. Synchronous, O(1).
   *
   * Deduplicates by 4-part composite key (walletId:provider:assetId:category).
   * Last write wins for the same key.
   */
  enqueue(update: PositionUpdate): void {
    const key = `${update.walletId}:${update.provider}:${update.assetId ?? 'null'}:${update.category}`;
    const now = Math.floor(Date.now() / 1000);

    const upsert: PositionUpsert = {
      id: generateId(),
      walletId: update.walletId,
      category: update.category,
      provider: update.provider,
      chain: update.chain,
      environment: update.environment ?? 'mainnet',
      network: update.network ?? null,
      assetId: update.assetId ?? null,
      amount: update.amount,
      amountUsd: update.amountUsd ?? null,
      metadata: JSON.stringify(update.metadata),
      status: update.status,
      openedAt: update.openedAt,
      closedAt: update.closedAt ?? null,
      lastSyncedAt: now,
      createdAt: now,
      updatedAt: now,
    };

    this.queue.set(key, upsert);
  }

  /**
   * Batch-flush up to MAX_BATCH items from the queue to SQLite.
   *
   * Extracts items from the queue, upserts them atomically using a
   * SQLite IMMEDIATE transaction with ON CONFLICT DO UPDATE.
   *
   * @returns Number of items flushed.
   */
  flush(sqlite: Database): number {
    if (this.queue.size === 0) return 0;

    // Extract up to MAX_BATCH items from queue
    const batch: PositionUpsert[] = [];
    for (const [key, upsert] of this.queue) {
      batch.push(upsert);
      this.queue.delete(key);
      if (batch.length >= MAX_BATCH) break;
    }

    // Prepare statement and run in immediate transaction
    const stmt = sqlite.prepare(UPSERT_SQL);

    const insertMany = sqlite.transaction((items: PositionUpsert[]) => {
      for (const item of items) {
        stmt.run(
          item.id,
          item.walletId,
          item.category,
          item.provider,
          item.chain,
          item.environment,
          item.network,
          item.assetId,
          item.amount,
          item.amountUsd,
          item.metadata,
          item.status,
          item.openedAt,
          item.closedAt,
          item.lastSyncedAt,
          item.createdAt,
          item.updatedAt,
        );
      }
      return items.length;
    });

    return insertMany(batch);
  }

  /** Clear all queued items. */
  clear(): void {
    this.queue.clear();
  }
}
