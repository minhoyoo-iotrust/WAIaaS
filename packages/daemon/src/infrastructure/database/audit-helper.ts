/**
 * Best-effort audit log insertion helper.
 *
 * Provides a type-safe wrapper around raw SQL INSERT for the audit_log table.
 * Failures are silently swallowed -- audit logging must NEVER block main logic.
 *
 * @see .planning/milestones/v30.0-phases/305/DESIGN-SPEC.md (OPS-02 section 7)
 */

import type { Database as SQLiteDatabase } from 'better-sqlite3';
import type { AuditEventType, AuditSeverity } from '@waiaas/core';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AuditEntry {
  eventType: AuditEventType;
  actor: string;
  walletId?: string;
  sessionId?: string;
  txId?: string;
  details: Record<string, unknown>;
  severity: AuditSeverity;
  ipAddress?: string;
}

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

/**
 * Insert an audit log entry with best-effort semantics.
 *
 * - Sets timestamp to current epoch seconds automatically.
 * - Swallows all errors: audit log failure must never interrupt main logic.
 * - Uses raw SQL for minimal overhead (no Drizzle ORM).
 */
export function insertAuditLog(sqlite: SQLiteDatabase, entry: AuditEntry): void {
  try {
    const now = Math.floor(Date.now() / 1000);
    sqlite
      .prepare(
        'INSERT INTO audit_log (timestamp, event_type, actor, wallet_id, session_id, tx_id, details, severity, ip_address) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      )
      .run(
        now,
        entry.eventType,
        entry.actor,
        entry.walletId ?? null,
        entry.sessionId ?? null,
        entry.txId ?? null,
        JSON.stringify(entry.details),
        entry.severity,
        entry.ipAddress ?? null,
      );
  } catch {
    // Best-effort: audit log failure must never block main logic
  }
}
