/**
 * KillSwitchService unit tests: 3-state machine + CAS ACID pattern.
 *
 * Tests:
 * - getState() returns default ACTIVE
 * - activate() ACTIVE -> SUSPENDED success + metadata
 * - activate() CAS failure when already SUSPENDED
 * - escalate() SUSPENDED -> LOCKED success
 * - escalate() CAS failure when state is ACTIVE (invalid transition)
 * - recoverFromSuspended() success/failure
 * - recoverFromLocked() success/failure
 * - Invalid transitions: ACTIVE->LOCKED direct, LOCKED->SUSPENDED direct
 * - Concurrency: two activate() calls, only one succeeds
 * - ensureInitialized(): creates key if absent, ignores if present
 *
 * @see packages/daemon/src/services/kill-switch-service.ts
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createDatabase } from '../infrastructure/database/connection.js';
import type { Database as DatabaseType } from 'better-sqlite3';
import { KillSwitchService } from '../services/kill-switch-service.js';

describe('KillSwitchService', () => {
  let db: DatabaseType;
  let service: KillSwitchService;

  beforeEach(() => {
    const conn = createDatabase(':memory:');
    db = conn.sqlite;

    // Create key_value_store table (minimal schema for testing)
    db.exec(`CREATE TABLE IF NOT EXISTS key_value_store (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    )`);

    // Initialize with ACTIVE state
    const now = Math.floor(Date.now() / 1000);
    db.prepare(
      'INSERT INTO key_value_store (key, value, updated_at) VALUES (?, ?, ?)',
    ).run('kill_switch_state', 'ACTIVE', now);

    service = new KillSwitchService({ sqlite: db });
  });

  afterEach(() => {
    try {
      db.close();
    } catch {
      /* already closed */
    }
  });

  // -----------------------------------------------------------------------
  // getState()
  // -----------------------------------------------------------------------

  describe('getState()', () => {
    it('returns ACTIVE state with null metadata by default', () => {
      const state = service.getState();
      expect(state.state).toBe('ACTIVE');
      expect(state.activatedAt).toBeNull();
      expect(state.activatedBy).toBeNull();
    });

    it('returns state with metadata after activation', () => {
      service.activate('admin');
      const state = service.getState();
      expect(state.state).toBe('SUSPENDED');
      expect(state.activatedAt).toBeTypeOf('number');
      expect(state.activatedBy).toBe('admin');
    });
  });

  // -----------------------------------------------------------------------
  // activate() -- ACTIVE -> SUSPENDED
  // -----------------------------------------------------------------------

  describe('activate()', () => {
    it('ACTIVE -> SUSPENDED transition succeeds', () => {
      const result = service.activate('master');
      expect(result).toBe(true);

      const state = service.getState();
      expect(state.state).toBe('SUSPENDED');
      expect(state.activatedBy).toBe('master');
      expect(state.activatedAt).toBeTypeOf('number');
    });

    it('CAS failure when state is already SUSPENDED', () => {
      service.activate('master');
      const result = service.activate('other-admin');
      expect(result).toBe(false);

      const state = service.getState();
      expect(state.state).toBe('SUSPENDED');
      expect(state.activatedBy).toBe('master'); // First activator preserved
    });

    it('CAS failure when state is LOCKED', () => {
      service.activate('master');
      service.escalate('master');
      const result = service.activate('other');
      expect(result).toBe(false);

      const state = service.getState();
      expect(state.state).toBe('LOCKED');
    });
  });

  // -----------------------------------------------------------------------
  // escalate() -- SUSPENDED -> LOCKED
  // -----------------------------------------------------------------------

  describe('escalate()', () => {
    it('SUSPENDED -> LOCKED transition succeeds', () => {
      service.activate('master');
      const result = service.escalate('security-bot');
      expect(result).toBe(true);

      const state = service.getState();
      expect(state.state).toBe('LOCKED');
      expect(state.activatedBy).toBe('security-bot');
    });

    it('CAS failure when state is ACTIVE (invalid transition ACTIVE->LOCKED)', () => {
      const result = service.escalate('master');
      expect(result).toBe(false);

      const state = service.getState();
      expect(state.state).toBe('ACTIVE');
    });

    it('CAS failure when state is already LOCKED', () => {
      service.activate('master');
      service.escalate('master');
      const result = service.escalate('other');
      expect(result).toBe(false);

      const state = service.getState();
      expect(state.state).toBe('LOCKED');
    });
  });

  // -----------------------------------------------------------------------
  // recoverFromSuspended() -- SUSPENDED -> ACTIVE
  // -----------------------------------------------------------------------

  describe('recoverFromSuspended()', () => {
    it('SUSPENDED -> ACTIVE transition succeeds', () => {
      service.activate('master');
      const result = service.recoverFromSuspended();
      expect(result).toBe(true);

      const state = service.getState();
      expect(state.state).toBe('ACTIVE');
      expect(state.activatedAt).toBeNull();
      expect(state.activatedBy).toBeNull();
    });

    it('CAS failure when state is ACTIVE', () => {
      const result = service.recoverFromSuspended();
      expect(result).toBe(false);

      const state = service.getState();
      expect(state.state).toBe('ACTIVE');
    });

    it('CAS failure when state is LOCKED', () => {
      service.activate('master');
      service.escalate('master');
      const result = service.recoverFromSuspended();
      expect(result).toBe(false);

      const state = service.getState();
      expect(state.state).toBe('LOCKED');
    });
  });

  // -----------------------------------------------------------------------
  // recoverFromLocked() -- LOCKED -> ACTIVE
  // -----------------------------------------------------------------------

  describe('recoverFromLocked()', () => {
    it('LOCKED -> ACTIVE transition succeeds', () => {
      service.activate('master');
      service.escalate('master');
      const result = service.recoverFromLocked();
      expect(result).toBe(true);

      const state = service.getState();
      expect(state.state).toBe('ACTIVE');
      expect(state.activatedAt).toBeNull();
      expect(state.activatedBy).toBeNull();
    });

    it('CAS failure when state is ACTIVE', () => {
      const result = service.recoverFromLocked();
      expect(result).toBe(false);

      const state = service.getState();
      expect(state.state).toBe('ACTIVE');
    });

    it('CAS failure when state is SUSPENDED', () => {
      service.activate('master');
      const result = service.recoverFromLocked();
      expect(result).toBe(false);

      const state = service.getState();
      expect(state.state).toBe('SUSPENDED');
    });
  });

  // -----------------------------------------------------------------------
  // Invalid transitions
  // -----------------------------------------------------------------------

  describe('invalid transitions', () => {
    it('ACTIVE -> LOCKED directly is impossible (must go through SUSPENDED)', () => {
      // escalate() expects SUSPENDED, so from ACTIVE it returns false
      const result = service.escalate('master');
      expect(result).toBe(false);
      expect(service.getState().state).toBe('ACTIVE');
    });

    it('LOCKED -> SUSPENDED directly is impossible', () => {
      service.activate('master');
      service.escalate('master');
      // recoverFromSuspended() expects SUSPENDED, so from LOCKED it returns false
      const result = service.recoverFromSuspended();
      expect(result).toBe(false);
      expect(service.getState().state).toBe('LOCKED');
    });
  });

  // -----------------------------------------------------------------------
  // Concurrency: two activate() calls, only one succeeds
  // -----------------------------------------------------------------------

  describe('concurrency', () => {
    it('two activate() calls: only the first succeeds (CAS serialization)', () => {
      // In-memory SQLite is serialized, but CAS logic still verifies
      const result1 = service.activate('admin-1');
      const result2 = service.activate('admin-2');

      expect(result1).toBe(true);
      expect(result2).toBe(false);

      const state = service.getState();
      expect(state.state).toBe('SUSPENDED');
      expect(state.activatedBy).toBe('admin-1');
    });

    it('two escalate() calls: only the first succeeds', () => {
      service.activate('master');
      const result1 = service.escalate('bot-1');
      const result2 = service.escalate('bot-2');

      expect(result1).toBe(true);
      expect(result2).toBe(false);

      expect(service.getState().state).toBe('LOCKED');
      expect(service.getState().activatedBy).toBe('bot-1');
    });
  });

  // -----------------------------------------------------------------------
  // ensureInitialized()
  // -----------------------------------------------------------------------

  describe('ensureInitialized()', () => {
    it('creates key when it does not exist', () => {
      // Remove the key first
      db.prepare('DELETE FROM key_value_store WHERE key = ?').run(
        'kill_switch_state',
      );

      service.ensureInitialized();

      const state = service.getState();
      expect(state.state).toBe('ACTIVE');
    });

    it('does not overwrite existing value', () => {
      service.activate('master'); // ACTIVE -> SUSPENDED
      service.ensureInitialized(); // Should not reset to ACTIVE

      const state = service.getState();
      expect(state.state).toBe('SUSPENDED');
    });
  });

  // -----------------------------------------------------------------------
  // Full state machine cycle
  // -----------------------------------------------------------------------

  describe('full cycle', () => {
    it('ACTIVE -> SUSPENDED -> LOCKED -> ACTIVE round trip', () => {
      expect(service.getState().state).toBe('ACTIVE');

      // Activate
      expect(service.activate('admin')).toBe(true);
      expect(service.getState().state).toBe('SUSPENDED');

      // Escalate
      expect(service.escalate('bot')).toBe(true);
      expect(service.getState().state).toBe('LOCKED');

      // Recover from locked
      expect(service.recoverFromLocked()).toBe(true);
      expect(service.getState().state).toBe('ACTIVE');
      expect(service.getState().activatedAt).toBeNull();
      expect(service.getState().activatedBy).toBeNull();
    });

    it('ACTIVE -> SUSPENDED -> ACTIVE round trip', () => {
      expect(service.activate('admin')).toBe(true);
      expect(service.getState().state).toBe('SUSPENDED');

      expect(service.recoverFromSuspended()).toBe(true);
      expect(service.getState().state).toBe('ACTIVE');
    });
  });
});
