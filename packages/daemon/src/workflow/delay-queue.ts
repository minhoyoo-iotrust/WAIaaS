/**
 * DelayQueue - manages DELAY tier transaction cooldown lifecycle.
 *
 * The DELAY tier is the second layer of the 3-tier security model.
 * Transactions above a configurable threshold must wait before execution,
 * giving the owner time to cancel suspicious activity.
 *
 * Lifecycle: PENDING -> QUEUED (with cooldown) -> EXECUTING (auto-execute after expiry)
 *                                              -> CANCELLED (owner cancels during cooldown)
 *
 * Uses BEGIN IMMEDIATE for processExpired to prevent concurrent processing
 * of the same transaction.
 *
 * @see docs/33-time-lock-approval-mechanism.md
 */

import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type { Database as SQLiteDatabase } from 'better-sqlite3';
import { WAIaaSError } from '@waiaas/core';
import type * as schema from '../infrastructure/database/schema.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DelayQueueDeps {
  db: BetterSQLite3Database<typeof schema>;
  sqlite: SQLiteDatabase;
}

export interface QueueResult {
  queuedAt: number;
  expiresAt: number;
}

export interface ExpiredTransaction {
  txId: string;
  agentId: string;
}

// ---------------------------------------------------------------------------
// DelayQueue
// ---------------------------------------------------------------------------

/**
 * Manages DELAY tier transaction cooldown: queue, cancel, auto-execute.
 *
 * Constructor takes dual DB pattern (Drizzle + raw better-sqlite3) same as
 * DatabasePolicyEngine for BEGIN IMMEDIATE support.
 */
export class DelayQueue {
  private readonly sqlite: SQLiteDatabase;

  constructor(deps: DelayQueueDeps) {
    this.sqlite = deps.sqlite;
  }

  // -------------------------------------------------------------------------
  // queueDelay
  // -------------------------------------------------------------------------

  /**
   * Queue a transaction for DELAY tier cooldown.
   *
   * Sets status to QUEUED, records queuedAt timestamp and delaySeconds in metadata.
   *
   * @param txId - Transaction ID to queue
   * @param delaySeconds - Cooldown duration in seconds
   * @returns { queuedAt, expiresAt } timestamps (Unix seconds)
   */
  queueDelay(txId: string, delaySeconds: number): QueueResult {
    const queuedAt = Math.floor(Date.now() / 1000);
    const expiresAt = queuedAt + delaySeconds;

    // Read existing metadata and merge delaySeconds
    const existing = this.sqlite
      .prepare('SELECT metadata FROM transactions WHERE id = ?')
      .get(txId) as { metadata: string | null } | undefined;

    let metadata: Record<string, unknown> = {};
    if (existing?.metadata) {
      try {
        metadata = JSON.parse(existing.metadata) as Record<string, unknown>;
      } catch {
        // ignore parse errors, start fresh
      }
    }
    metadata.delaySeconds = delaySeconds;

    this.sqlite
      .prepare(
        `UPDATE transactions
         SET status = 'QUEUED', queued_at = ?, metadata = ?
         WHERE id = ?`,
      )
      .run(queuedAt, JSON.stringify(metadata), txId);

    return { queuedAt, expiresAt };
  }

  // -------------------------------------------------------------------------
  // cancelDelay
  // -------------------------------------------------------------------------

  /**
   * Cancel a QUEUED transaction during its cooldown window.
   *
   * Sets status to CANCELLED and clears reserved_amount.
   *
   * @param txId - Transaction ID to cancel
   * @throws WAIaaSError TX_NOT_FOUND if transaction doesn't exist
   * @throws WAIaaSError TX_ALREADY_PROCESSED if transaction is not QUEUED
   */
  cancelDelay(txId: string): void {
    const row = this.sqlite
      .prepare('SELECT id, status FROM transactions WHERE id = ?')
      .get(txId) as { id: string; status: string } | undefined;

    if (!row) {
      throw new WAIaaSError('TX_NOT_FOUND', {
        message: `Transaction ${txId} not found`,
      });
    }

    if (row.status !== 'QUEUED') {
      throw new WAIaaSError('TX_ALREADY_PROCESSED', {
        message: `Transaction ${txId} is ${row.status}, not QUEUED`,
      });
    }

    this.sqlite
      .prepare(
        `UPDATE transactions
         SET status = 'CANCELLED', reserved_amount = NULL
         WHERE id = ?`,
      )
      .run(txId);
  }

  // -------------------------------------------------------------------------
  // processExpired
  // -------------------------------------------------------------------------

  /**
   * Find and transition expired QUEUED transactions to EXECUTING.
   *
   * Uses BEGIN IMMEDIATE to prevent concurrent processing of the same transaction.
   * Reads delaySeconds from metadata JSON to calculate expiry.
   *
   * @param now - Current time in Unix seconds
   * @returns Array of { txId, agentId } for pipeline to execute stages 5-6
   */
  processExpired(now: number): ExpiredTransaction[] {
    const sqlite = this.sqlite;

    const txn = sqlite.transaction(() => {
      // Select QUEUED transactions whose cooldown has elapsed.
      // delaySeconds is stored in metadata JSON.
      // Expiry check: queued_at + JSON_EXTRACT(metadata, '$.delaySeconds') <= now
      const rows = sqlite
        .prepare(
          `SELECT id, agent_id
           FROM transactions
           WHERE status = 'QUEUED'
             AND queued_at IS NOT NULL
             AND metadata IS NOT NULL
             AND (queued_at + CAST(JSON_EXTRACT(metadata, '$.delaySeconds') AS INTEGER)) <= ?`,
        )
        .all(now) as Array<{ id: string; agent_id: string }>;

      if (rows.length === 0) {
        return [];
      }

      // Transition each expired transaction to EXECUTING
      const updateStmt = sqlite.prepare(
        `UPDATE transactions SET status = 'EXECUTING' WHERE id = ? AND status = 'QUEUED'`,
      );

      const result: ExpiredTransaction[] = [];
      for (const row of rows) {
        const changes = updateStmt.run(row.id);
        // Only include if we actually updated (guard against concurrent processing)
        if (changes.changes > 0) {
          result.push({ txId: row.id, agentId: row.agent_id });
        }
      }

      return result;
    });

    // Execute with IMMEDIATE isolation
    return txn.immediate();
  }

  // -------------------------------------------------------------------------
  // isExpired
  // -------------------------------------------------------------------------

  /**
   * Check if a QUEUED transaction's cooldown has elapsed.
   *
   * @param txId - Transaction ID to check
   * @returns true if cooldown has elapsed, false otherwise
   */
  isExpired(txId: string): boolean {
    const row = this.sqlite
      .prepare('SELECT queued_at, metadata FROM transactions WHERE id = ? AND status = ?')
      .get(txId, 'QUEUED') as { queued_at: number | null; metadata: string | null } | undefined;

    if (!row || !row.queued_at || !row.metadata) {
      return false;
    }

    let metadata: Record<string, unknown>;
    try {
      metadata = JSON.parse(row.metadata) as Record<string, unknown>;
    } catch {
      return false;
    }

    const delaySeconds = metadata.delaySeconds as number;
    if (typeof delaySeconds !== 'number') {
      return false;
    }

    const now = Math.floor(Date.now() / 1000);
    return (row.queued_at + delaySeconds) <= now;
  }
}
