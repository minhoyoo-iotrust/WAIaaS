/**
 * KillSwitchService: 3-state machine (ACTIVE / SUSPENDED / LOCKED)
 * with CAS (Compare-And-Swap) ACID pattern for atomic state transitions.
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

const KV_KEY_STATE = 'kill_switch_state';
const KV_KEY_ACTIVATED_AT = 'kill_switch_activated_at';
const KV_KEY_ACTIVATED_BY = 'kill_switch_activated_by';

export interface KillSwitchStateInfo {
  state: string;
  activatedAt: number | null;
  activatedBy: string | null;
}

export class KillSwitchService {
  private sqlite: Database;

  constructor(sqlite: Database) {
    this.sqlite = sqlite;
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
