/**
 * KillSwitchService: 3-state machine (ACTIVE / SUSPENDED / LOCKED)
 * with CAS (Compare-And-Swap) ACID pattern for atomic state transitions
 * and 6-step cascade execution.
 *
 * State machine:
 *   ACTIVE <---> SUSPENDED ---> LOCKED
 *   LOCKED ----> ACTIVE
 *
 * Valid transitions:
 *   ACTIVE -> SUSPENDED   (activate / suspend)
 *   SUSPENDED -> LOCKED   (escalate)
 *   SUSPENDED -> ACTIVE   (recover from suspended)
 *   LOCKED -> ACTIVE      (recover from locked)
 *
 * Invalid transitions (rejected with 409):
 *   ACTIVE -> LOCKED      (must escalate through SUSPENDED)
 *   LOCKED -> SUSPENDED   (must recover to ACTIVE first)
 *
 * 6-step cascade (on activation):
 *   1. Revoke all active sessions
 *   2. Cancel in-flight transactions (PENDING/QUEUED/EXECUTING -> CANCELLED)
 *   3. Suspend all ACTIVE wallets
 *   4. API 503 (handled by kill-switch-guard middleware)
 *   5. Send notification (KILL_SWITCH_ACTIVATED)
 *   6. Insert audit log entry (severity: critical)
 *
 * CAS ACID pattern:
 *   1. BEGIN IMMEDIATE (acquire exclusive lock)
 *   2. UPDATE ... WHERE value = expectedState (CAS check)
 *   3. If changes === 0 -> ROLLBACK (CAS failure)
 *   4. UPSERT metadata (activated_at, activated_by)
 *   5. COMMIT
 *
 * @see docs/36-killswitch-evm-freeze.md
 */

import type { Database } from 'better-sqlite3';
import type { NotificationService } from '../notifications/notification-service.js';
import type { EventBus } from '@waiaas/core';

const KV_KEY_STATE = 'kill_switch_state';
const KV_KEY_ACTIVATED_AT = 'kill_switch_activated_at';
const KV_KEY_ACTIVATED_BY = 'kill_switch_activated_by';

export interface KillSwitchStateInfo {
  state: string;
  activatedAt: number | null;
  activatedBy: string | null;
}

export interface CascadeResult {
  success: boolean;
  error?: string;
}

export class KillSwitchService {
  private sqlite: Database;
  private notificationService?: NotificationService;
  private eventBus?: EventBus;

  constructor(opts: {
    sqlite: Database;
    notificationService?: NotificationService;
    eventBus?: EventBus;
  }) {
    this.sqlite = opts.sqlite;
    this.notificationService = opts.notificationService;
    this.eventBus = opts.eventBus;
  }

  /** Get current kill switch state from key_value_store. */
  getState(): KillSwitchStateInfo {
    const stateRow = this.sqlite
      .prepare('SELECT value FROM key_value_store WHERE key = ?')
      .get(KV_KEY_STATE) as { value: string } | undefined;

    const atRow = this.sqlite
      .prepare('SELECT value FROM key_value_store WHERE key = ?')
      .get(KV_KEY_ACTIVATED_AT) as { value: string } | undefined;

    const byRow = this.sqlite
      .prepare('SELECT value FROM key_value_store WHERE key = ?')
      .get(KV_KEY_ACTIVATED_BY) as { value: string } | undefined;

    return {
      state: stateRow?.value ?? 'ACTIVE',
      activatedAt: atRow?.value ? parseInt(atRow.value, 10) : null,
      activatedBy: byRow?.value ?? null,
    };
  }

  /**
   * ACTIVE -> SUSPENDED transition (kill switch activation).
   * Returns true on success, false on CAS failure (state was not ACTIVE).
   */
  activate(activatedBy: string): boolean {
    return this.casTransition('ACTIVE', 'SUSPENDED', activatedBy);
  }

  /**
   * SUSPENDED -> LOCKED transition (severity escalation).
   * Returns true on success, false on CAS failure (state was not SUSPENDED).
   */
  escalate(escalatedBy: string): boolean {
    return this.casTransition('SUSPENDED', 'LOCKED', escalatedBy);
  }

  /**
   * SUSPENDED -> ACTIVE transition (recovery from suspended).
   * Returns true on success, false on CAS failure (state was not SUSPENDED).
   */
  recoverFromSuspended(): boolean {
    return this.casTransitionWithClear('SUSPENDED', 'ACTIVE');
  }

  /**
   * LOCKED -> ACTIVE transition (recovery from locked).
   * Returns true on success, false on CAS failure (state was not LOCKED).
   */
  recoverFromLocked(): boolean {
    return this.casTransitionWithClear('LOCKED', 'ACTIVE');
  }

  /**
   * Ensure kill_switch_state key exists in key_value_store.
   * Sets to ACTIVE if not present. Safe to call on every startup.
   */
  ensureInitialized(): void {
    const now = Math.floor(Date.now() / 1000);
    this.sqlite
      .prepare(
        'INSERT OR IGNORE INTO key_value_store (key, value, updated_at) VALUES (?, ?, ?)',
      )
      .run(KV_KEY_STATE, 'ACTIVE', now);
  }

  // -----------------------------------------------------------------------
  // Cascade methods
  // -----------------------------------------------------------------------

  /**
   * Activate kill switch with 6-step cascade.
   * CAS activate() + executeCascade() on success.
   */
  activateWithCascade(activatedBy: string): CascadeResult {
    const success = this.activate(activatedBy);
    if (!success) {
      const current = this.getState();
      return {
        success: false,
        error: `Kill switch is already ${current.state}`,
      };
    }

    // Execute cascade (fire-and-forget for async parts like notifications)
    void this.executeCascade(activatedBy);

    return { success: true };
  }

  /**
   * Escalate kill switch with notification + audit log.
   * CAS escalate() + notification/audit on success.
   */
  escalateWithCascade(escalatedBy: string): CascadeResult {
    const success = this.escalate(escalatedBy);
    if (!success) {
      const current = this.getState();
      return {
        success: false,
        error: `Cannot escalate from ${current.state} (must be SUSPENDED)`,
      };
    }

    // Step: Send escalation notification
    void this.notificationService?.notify(
      'KILL_SWITCH_ESCALATED',
      'system',
      { escalatedBy },
    );

    // Step: Audit log
    const now = Math.floor(Date.now() / 1000);
    try {
      this.sqlite
        .prepare(
          'INSERT INTO audit_log (timestamp, event_type, actor, details, severity) VALUES (?, ?, ?, ?, ?)',
        )
        .run(
          now,
          'KILL_SWITCH_ESCALATED',
          escalatedBy,
          JSON.stringify({ action: 'kill_switch_escalated', escalatedBy }),
          'critical',
        );
    } catch {
      // Best-effort audit logging
    }

    // EventBus emit
    this.eventBus?.emit('kill-switch:state-changed', {
      state: 'LOCKED',
      previousState: 'SUSPENDED',
      activatedBy: escalatedBy,
      timestamp: now,
    });

    return { success: true };
  }

  /**
   * Execute the 6-step cascade after kill switch activation.
   *
   * Steps:
   *   1. Revoke all active sessions (SET revoked_at)
   *   2. Cancel in-flight transactions (PENDING/QUEUED/EXECUTING -> CANCELLED)
   *   3. Suspend all ACTIVE wallets
   *   4. API 503 -- handled by middleware (no action needed here)
   *   5. Send notification (KILL_SWITCH_ACTIVATED)
   *   6. Insert audit log entry
   */
  async executeCascade(activatedBy: string): Promise<void> {
    const now = Math.floor(Date.now() / 1000);

    // Step 1: Revoke all active sessions
    try {
      this.sqlite
        .prepare(
          'UPDATE sessions SET revoked_at = ? WHERE revoked_at IS NULL',
        )
        .run(now);
    } catch {
      // Best-effort: continue cascade even if step fails
    }

    // Step 2: Cancel in-flight transactions
    try {
      this.sqlite
        .prepare(
          "UPDATE transactions SET status = 'CANCELLED', error = 'Kill switch activated' WHERE status IN ('PENDING', 'QUEUED', 'EXECUTING')",
        )
        .run();
    } catch {
      // Best-effort
    }

    // Step 3: Suspend all ACTIVE wallets
    try {
      this.sqlite
        .prepare(
          "UPDATE wallets SET status = 'SUSPENDED', suspended_at = ?, suspension_reason = 'Kill switch activated' WHERE status = 'ACTIVE'",
        )
        .run(now);
    } catch {
      // Best-effort
    }

    // Step 4: API 503 is handled by killSwitchGuard middleware
    // (KillSwitchService state is SUSPENDED/LOCKED -> middleware blocks)

    // Step 5: Send notification
    void this.notificationService?.notify(
      'KILL_SWITCH_ACTIVATED',
      'system',
      { activatedBy },
    );

    // Step 6: Audit log
    try {
      this.sqlite
        .prepare(
          'INSERT INTO audit_log (timestamp, event_type, actor, details, severity) VALUES (?, ?, ?, ?, ?)',
        )
        .run(
          now,
          'KILL_SWITCH_ACTIVATED',
          activatedBy,
          JSON.stringify({ action: 'kill_switch_activated', activatedBy }),
          'critical',
        );
    } catch {
      // Best-effort audit logging
    }

    // EventBus emit
    this.eventBus?.emit('kill-switch:state-changed', {
      state: 'SUSPENDED',
      previousState: 'ACTIVE',
      activatedBy,
      timestamp: now,
    });
  }

  // -----------------------------------------------------------------------
  // CAS transition internals
  // -----------------------------------------------------------------------

  /**
   * CAS transition with metadata set (for activate/escalate).
   * Sets activated_at and activated_by on success.
   */
  private casTransition(
    expectedState: string,
    newState: string,
    actorName: string,
  ): boolean {
    const now = Math.floor(Date.now() / 1000);

    try {
      this.sqlite.exec('BEGIN IMMEDIATE');

      const result = this.sqlite
        .prepare(
          'UPDATE key_value_store SET value = ?, updated_at = ? WHERE key = ? AND value = ?',
        )
        .run(newState, now, KV_KEY_STATE, expectedState);

      if (result.changes === 0) {
        this.sqlite.exec('ROLLBACK');
        return false;
      }

      // UPSERT activated_at
      this.sqlite
        .prepare(
          'INSERT INTO key_value_store (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at',
        )
        .run(KV_KEY_ACTIVATED_AT, String(now), now);

      // UPSERT activated_by
      this.sqlite
        .prepare(
          'INSERT INTO key_value_store (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at',
        )
        .run(KV_KEY_ACTIVATED_BY, actorName, now);

      this.sqlite.exec('COMMIT');
      return true;
    } catch (err) {
      try {
        this.sqlite.exec('ROLLBACK');
      } catch {
        /* best effort */
      }
      throw err;
    }
  }

  /**
   * CAS transition with metadata clear (for recovery).
   * Clears activated_at and activated_by on success.
   */
  private casTransitionWithClear(
    expectedState: string,
    newState: string,
  ): boolean {
    const now = Math.floor(Date.now() / 1000);

    try {
      this.sqlite.exec('BEGIN IMMEDIATE');

      const result = this.sqlite
        .prepare(
          'UPDATE key_value_store SET value = ?, updated_at = ? WHERE key = ? AND value = ?',
        )
        .run(newState, now, KV_KEY_STATE, expectedState);

      if (result.changes === 0) {
        this.sqlite.exec('ROLLBACK');
        return false;
      }

      // Clear activated_at and activated_by
      this.sqlite
        .prepare('DELETE FROM key_value_store WHERE key IN (?, ?)')
        .run(KV_KEY_ACTIVATED_AT, KV_KEY_ACTIVATED_BY);

      this.sqlite.exec('COMMIT');
      return true;
    } catch (err) {
      try {
        this.sqlite.exec('ROLLBACK');
      } catch {
        /* best effort */
      }
      throw err;
    }
  }
}
