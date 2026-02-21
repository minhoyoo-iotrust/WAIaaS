/**
 * KillSwitchService 6-step cascade tests.
 *
 * Tests:
 * - executeCascade() revokes all active sessions
 * - executeCascade() cancels PENDING/QUEUED/EXECUTING transactions
 * - executeCascade() suspends all ACTIVE wallets
 * - executeCascade() sends notification (mock)
 * - executeCascade() inserts audit log entry
 * - activateWithCascade() success (ACTIVE -> SUSPENDED + cascade)
 * - activateWithCascade() failure (already SUSPENDED)
 * - escalateWithCascade() success/failure
 *
 * @see packages/daemon/src/services/kill-switch-service.ts
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createDatabase } from '../infrastructure/database/connection.js';
import type { Database as DatabaseType } from 'better-sqlite3';
import { KillSwitchService } from '../services/kill-switch-service.js';

describe('KillSwitchService cascade', () => {
  let db: DatabaseType;
  let service: KillSwitchService;
  let mockNotify: ReturnType<typeof vi.fn>;
  let mockNotificationService: { notify: ReturnType<typeof vi.fn> };
  let mockEventBus: { emit: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    const conn = createDatabase(':memory:');
    db = conn.sqlite;

    // Create required tables
    db.exec(`
      CREATE TABLE IF NOT EXISTS key_value_store (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        token_hash TEXT NOT NULL,
        expires_at INTEGER NOT NULL,
        revoked_at INTEGER,
        renewal_count INTEGER NOT NULL DEFAULT 0,
        max_renewals INTEGER NOT NULL DEFAULT 30,
        absolute_expires_at INTEGER NOT NULL,
        created_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS session_wallets (
        session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
        wallet_id TEXT NOT NULL REFERENCES wallets(id) ON DELETE CASCADE,
        is_default INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL,
        PRIMARY KEY (session_id, wallet_id)
      );
      CREATE TABLE IF NOT EXISTS transactions (
        id TEXT PRIMARY KEY,
        wallet_id TEXT NOT NULL,
        chain TEXT NOT NULL,
        type TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'PENDING',
        amount TEXT,
        to_address TEXT,
        error TEXT,
        created_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS wallets (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        chain TEXT NOT NULL,
        environment TEXT NOT NULL,
        public_key TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'ACTIVE',
        suspended_at INTEGER,
        suspension_reason TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS audit_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp INTEGER NOT NULL,
        event_type TEXT NOT NULL,
        actor TEXT NOT NULL,
        details TEXT NOT NULL,
        severity TEXT NOT NULL DEFAULT 'info',
        wallet_id TEXT,
        session_id TEXT,
        tx_id TEXT,
        ip_address TEXT
      );
    `);

    // Initialize kill switch state
    const now = Math.floor(Date.now() / 1000);
    db.prepare(
      'INSERT INTO key_value_store (key, value, updated_at) VALUES (?, ?, ?)',
    ).run('kill_switch_state', 'ACTIVE', now);

    // Insert test data
    const futureTime = now + 3600;

    // Wallets: 2 ACTIVE, 1 SUSPENDED (should remain unchanged)
    // (must be inserted before session_wallets due to FK constraint)
    db.prepare(
      'INSERT INTO wallets (id, name, chain, environment, public_key, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    ).run('wallet-1', 'test-wallet-1', 'solana', 'testnet', 'pk1', 'ACTIVE', now, now);
    db.prepare(
      'INSERT INTO wallets (id, name, chain, environment, public_key, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    ).run('wallet-2', 'test-wallet-2', 'ethereum', 'testnet', 'pk2', 'ACTIVE', now, now);
    db.prepare(
      'INSERT INTO wallets (id, name, chain, environment, public_key, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    ).run('wallet-3', 'test-wallet-3', 'solana', 'testnet', 'pk3', 'SUSPENDED', now, now);

    // 2 active sessions
    db.prepare(
      'INSERT INTO sessions (id, token_hash, expires_at, absolute_expires_at, created_at) VALUES (?, ?, ?, ?, ?)',
    ).run('sess-1', 'hash1', futureTime, futureTime, now);
    db.prepare(
      'INSERT INTO session_wallets (session_id, wallet_id, is_default, created_at) VALUES (?, ?, 1, ?)',
    ).run('sess-1', 'wallet-1', now);
    db.prepare(
      'INSERT INTO sessions (id, token_hash, expires_at, absolute_expires_at, created_at) VALUES (?, ?, ?, ?, ?)',
    ).run('sess-2', 'hash2', futureTime, futureTime, now);
    db.prepare(
      'INSERT INTO session_wallets (session_id, wallet_id, is_default, created_at) VALUES (?, ?, 1, ?)',
    ).run('sess-2', 'wallet-2', now);
    // 1 already revoked session (should remain unchanged)
    db.prepare(
      'INSERT INTO sessions (id, token_hash, expires_at, revoked_at, absolute_expires_at, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    ).run('sess-3', 'hash3', futureTime, now - 100, futureTime, now);
    db.prepare(
      'INSERT INTO session_wallets (session_id, wallet_id, is_default, created_at) VALUES (?, ?, 1, ?)',
    ).run('sess-3', 'wallet-1', now);

    // Transactions: PENDING, QUEUED, EXECUTING, CONFIRMED (should not be cancelled)
    db.prepare(
      'INSERT INTO transactions (id, wallet_id, chain, type, status, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    ).run('tx-1', 'wallet-1', 'solana', 'TRANSFER', 'PENDING', now);
    db.prepare(
      'INSERT INTO transactions (id, wallet_id, chain, type, status, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    ).run('tx-2', 'wallet-1', 'solana', 'TRANSFER', 'QUEUED', now);
    db.prepare(
      'INSERT INTO transactions (id, wallet_id, chain, type, status, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    ).run('tx-3', 'wallet-2', 'ethereum', 'TOKEN_TRANSFER', 'EXECUTING', now);
    db.prepare(
      'INSERT INTO transactions (id, wallet_id, chain, type, status, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    ).run('tx-4', 'wallet-1', 'solana', 'TRANSFER', 'CONFIRMED', now);

    // Create mocks
    mockNotify = vi.fn().mockResolvedValue(undefined);
    mockNotificationService = { notify: mockNotify };
    mockEventBus = { emit: vi.fn() };

    service = new KillSwitchService({
      sqlite: db,
      notificationService: mockNotificationService as any,
      eventBus: mockEventBus as any,
    });
  });

  afterEach(() => {
    try {
      db.close();
    } catch {
      /* already closed */
    }
  });

  // -----------------------------------------------------------------------
  // executeCascade()
  // -----------------------------------------------------------------------

  describe('executeCascade()', () => {
    it('Step 1: revokes all active sessions (sets revoked_at)', async () => {
      await service.executeCascade('admin');

      const sessions = db.prepare('SELECT id, revoked_at FROM sessions ORDER BY id').all() as Array<{
        id: string;
        revoked_at: number | null;
      }>;

      // sess-1 and sess-2 should now have revoked_at set
      expect(sessions.find((s) => s.id === 'sess-1')?.revoked_at).toBeTypeOf('number');
      expect(sessions.find((s) => s.id === 'sess-2')?.revoked_at).toBeTypeOf('number');
      // sess-3 was already revoked -- its revoked_at should be updated too since
      // the query is WHERE revoked_at IS NULL, sess-3 already had revoked_at
      const sess3 = sessions.find((s) => s.id === 'sess-3');
      expect(sess3?.revoked_at).toBeTypeOf('number');
    });

    it('Step 2: cancels PENDING/QUEUED/EXECUTING transactions', async () => {
      await service.executeCascade('admin');

      const txs = db
        .prepare('SELECT id, status, error FROM transactions ORDER BY id')
        .all() as Array<{ id: string; status: string; error: string | null }>;

      expect(txs.find((t) => t.id === 'tx-1')?.status).toBe('CANCELLED');
      expect(txs.find((t) => t.id === 'tx-1')?.error).toBe('Kill switch activated');
      expect(txs.find((t) => t.id === 'tx-2')?.status).toBe('CANCELLED');
      expect(txs.find((t) => t.id === 'tx-3')?.status).toBe('CANCELLED');
      // CONFIRMED transaction should NOT be cancelled
      expect(txs.find((t) => t.id === 'tx-4')?.status).toBe('CONFIRMED');
    });

    it('Step 3: suspends all ACTIVE wallets', async () => {
      await service.executeCascade('admin');

      const allWallets = db
        .prepare('SELECT id, status, suspended_at, suspension_reason FROM wallets ORDER BY id')
        .all() as Array<{
          id: string;
          status: string;
          suspended_at: number | null;
          suspension_reason: string | null;
        }>;

      // wallet-1 and wallet-2 were ACTIVE -> should be SUSPENDED
      expect(allWallets.find((w) => w.id === 'wallet-1')?.status).toBe('SUSPENDED');
      expect(allWallets.find((w) => w.id === 'wallet-1')?.suspended_at).toBeTypeOf('number');
      expect(allWallets.find((w) => w.id === 'wallet-1')?.suspension_reason).toBe('Kill switch activated');
      expect(allWallets.find((w) => w.id === 'wallet-2')?.status).toBe('SUSPENDED');
      // wallet-3 was already SUSPENDED -> should remain SUSPENDED (not overwritten)
      expect(allWallets.find((w) => w.id === 'wallet-3')?.status).toBe('SUSPENDED');
    });

    it('Step 5: sends KILL_SWITCH_ACTIVATED notification', async () => {
      await service.executeCascade('admin');

      expect(mockNotify).toHaveBeenCalledWith(
        'KILL_SWITCH_ACTIVATED',
        'system',
        { activatedBy: 'admin' },
      );
    });

    it('Step 6: inserts audit log entry with critical severity', async () => {
      await service.executeCascade('admin');

      const logs = db
        .prepare("SELECT event_type, actor, severity, details FROM audit_log WHERE event_type = 'KILL_SWITCH_ACTIVATED'")
        .all() as Array<{
          event_type: string;
          actor: string;
          severity: string;
          details: string;
        }>;

      expect(logs).toHaveLength(1);
      expect(logs[0].actor).toBe('admin');
      expect(logs[0].severity).toBe('critical');
      const details = JSON.parse(logs[0].details);
      expect(details.action).toBe('kill_switch_activated');
      expect(details.activatedBy).toBe('admin');
    });

    it('emits kill-switch:state-changed event', async () => {
      await service.executeCascade('owner-addr');

      expect(mockEventBus.emit).toHaveBeenCalledWith(
        'kill-switch:state-changed',
        expect.objectContaining({
          state: 'SUSPENDED',
          previousState: 'ACTIVE',
          activatedBy: 'owner-addr',
        }),
      );
    });
  });

  // -----------------------------------------------------------------------
  // activateWithCascade()
  // -----------------------------------------------------------------------

  describe('activateWithCascade()', () => {
    it('success: ACTIVE -> SUSPENDED + cascade executed', () => {
      const result = service.activateWithCascade('master');
      expect(result.success).toBe(true);
      expect(result.error).toBeUndefined();

      // Verify state changed
      expect(service.getState().state).toBe('SUSPENDED');

      // Cascade runs async, but notification should be called
      // (fire-and-forget, so just check it was called)
      expect(mockNotify).toHaveBeenCalled();
    });

    it('failure: already SUSPENDED -> returns error', () => {
      service.activateWithCascade('master');
      const result = service.activateWithCascade('other-admin');
      expect(result.success).toBe(false);
      expect(result.error).toContain('SUSPENDED');
    });

    it('failure: already LOCKED -> returns error', () => {
      service.activate('master');
      service.escalate('master');
      const result = service.activateWithCascade('other');
      expect(result.success).toBe(false);
      expect(result.error).toContain('LOCKED');
    });
  });

  // -----------------------------------------------------------------------
  // escalateWithCascade()
  // -----------------------------------------------------------------------

  describe('escalateWithCascade()', () => {
    it('success: SUSPENDED -> LOCKED + notification + audit log', () => {
      service.activate('master');
      const result = service.escalateWithCascade('security-bot');
      expect(result.success).toBe(true);

      // Verify state
      expect(service.getState().state).toBe('LOCKED');

      // Notification sent
      expect(mockNotify).toHaveBeenCalledWith(
        'KILL_SWITCH_ESCALATED',
        'system',
        { escalatedBy: 'security-bot' },
      );

      // Audit log
      const logs = db
        .prepare("SELECT event_type, actor, severity FROM audit_log WHERE event_type = 'KILL_SWITCH_ESCALATED'")
        .all() as Array<{ event_type: string; actor: string; severity: string }>;
      expect(logs).toHaveLength(1);
      expect(logs[0].actor).toBe('security-bot');
      expect(logs[0].severity).toBe('critical');

      // EventBus
      expect(mockEventBus.emit).toHaveBeenCalledWith(
        'kill-switch:state-changed',
        expect.objectContaining({
          state: 'LOCKED',
          previousState: 'SUSPENDED',
          activatedBy: 'security-bot',
        }),
      );
    });

    it('failure: from ACTIVE -> cannot escalate', () => {
      const result = service.escalateWithCascade('master');
      expect(result.success).toBe(false);
      expect(result.error).toContain('ACTIVE');
    });

    it('failure: already LOCKED -> cannot escalate', () => {
      service.activate('master');
      service.escalate('master');
      const result = service.escalateWithCascade('other');
      expect(result.success).toBe(false);
      expect(result.error).toContain('LOCKED');
    });
  });

  // -----------------------------------------------------------------------
  // Cascade with no notification service
  // -----------------------------------------------------------------------

  describe('cascade without optional deps', () => {
    it('works without notificationService', async () => {
      const svc = new KillSwitchService({ sqlite: db });
      // Should not throw
      await svc.executeCascade('admin');

      // Verify cascade steps still executed
      const tx = db.prepare("SELECT status FROM transactions WHERE id = 'tx-1'").get() as { status: string };
      expect(tx.status).toBe('CANCELLED');
    });

    it('works without eventBus', () => {
      const svc = new KillSwitchService({ sqlite: db });
      const result = svc.activateWithCascade('admin');
      expect(result.success).toBe(true);
    });
  });
});
