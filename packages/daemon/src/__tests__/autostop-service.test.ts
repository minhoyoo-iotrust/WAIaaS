/**
 * AutoStopService unit tests: 4 rules + EventBus subscription + wallet suspension.
 *
 * Tests cover:
 * - ConsecutiveFailuresRule (AUTO-01): 5-consecutive failure suspension, success reset, cross-wallet independence
 * - UnusualActivityRule (AUTO-02): Sliding window frequency detection, window expiry
 * - IdleTimeoutRule (AUTO-03): Idle session auto-revocation
 * - ManualTrigger (AUTO-04): KillSwitch cascade invocation
 * - EventBus integration: Listener registration, timer cleanup
 * - suspendWallet: Idempotent suspension, audit log insertion
 * - updateConfig: Runtime threshold changes
 *
 * @see packages/daemon/src/services/autostop-service.ts
 * @see packages/daemon/src/services/autostop-rules.ts
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createDatabase } from '../infrastructure/database/connection.js';
import type { Database as DatabaseType } from 'better-sqlite3';
import { EventBus } from '@waiaas/core';
import { KillSwitchService } from '../services/kill-switch-service.js';
import { AutoStopService } from '../services/autostop-service.js';
import type { NotificationService } from '../notifications/notification-service.js';

// ---------------------------------------------------------------------------
// Helper: create in-memory DB with required tables
// ---------------------------------------------------------------------------

function createTestDb(): DatabaseType {
  const conn = createDatabase(':memory:');
  const db = conn.sqlite;

  // wallets table
  db.exec(`CREATE TABLE IF NOT EXISTS wallets (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    chain TEXT NOT NULL,
    environment TEXT NOT NULL DEFAULT 'testnet',
    default_network TEXT,
    public_key TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'ACTIVE',
    owner_address TEXT,
    owner_verified INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    suspended_at INTEGER,
    suspension_reason TEXT
  )`);

  // sessions table (v26.4: wallet_id moved to session_wallets)
  db.exec(`CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    token_hash TEXT NOT NULL,
    expires_at INTEGER NOT NULL,
    constraints TEXT,
    usage_stats TEXT,
    revoked_at INTEGER,
    renewal_count INTEGER NOT NULL DEFAULT 0,
    max_renewals INTEGER NOT NULL DEFAULT 30,
    last_renewed_at INTEGER,
    absolute_expires_at INTEGER NOT NULL,
    created_at INTEGER NOT NULL
  )`);

  // session_wallets junction table (v26.4)
  db.exec(`CREATE TABLE IF NOT EXISTS session_wallets (
    session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    wallet_id TEXT NOT NULL REFERENCES wallets(id) ON DELETE CASCADE,
    is_default INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    PRIMARY KEY (session_id, wallet_id)
  )`);

  // audit_log table
  db.exec(`CREATE TABLE IF NOT EXISTS audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp INTEGER NOT NULL,
    event_type TEXT NOT NULL,
    actor TEXT NOT NULL,
    wallet_id TEXT,
    session_id TEXT,
    tx_id TEXT,
    details TEXT NOT NULL,
    severity TEXT NOT NULL DEFAULT 'info',
    ip_address TEXT
  )`);

  // key_value_store table (for KillSwitchService)
  db.exec(`CREATE TABLE IF NOT EXISTS key_value_store (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at INTEGER NOT NULL
  )`);

  // transactions table (for KillSwitchService cascade)
  db.exec(`CREATE TABLE IF NOT EXISTS transactions (
    id TEXT PRIMARY KEY,
    wallet_id TEXT NOT NULL,
    session_id TEXT,
    chain TEXT NOT NULL,
    tx_hash TEXT,
    type TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'PENDING',
    created_at INTEGER NOT NULL,
    error TEXT,
    network TEXT
  )`);

  return db;
}

// ---------------------------------------------------------------------------
// Helper: insert test wallet
// ---------------------------------------------------------------------------

function insertWallet(db: DatabaseType, id: string, status = 'ACTIVE'): void {
  const now = Math.floor(Date.now() / 1000);
  db.prepare(
    'INSERT INTO wallets (id, name, chain, environment, public_key, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
  ).run(id, `wallet-${id}`, 'solana', 'testnet', `pk-${id}`, status, now, now);
}

// ---------------------------------------------------------------------------
// Helper: insert test session
// ---------------------------------------------------------------------------

function insertSession(db: DatabaseType, id: string, walletId: string): void {
  const now = Math.floor(Date.now() / 1000);
  db.prepare(
    'INSERT INTO sessions (id, token_hash, expires_at, absolute_expires_at, created_at) VALUES (?, ?, ?, ?, ?)',
  ).run(id, `hash-${id}`, now + 3600, now + 86400, now);
  db.prepare(
    'INSERT INTO session_wallets (session_id, wallet_id, is_default, created_at) VALUES (?, ?, 1, ?)',
  ).run(id, walletId, now);
}

// ---------------------------------------------------------------------------
// Helper: get wallet status from DB
// ---------------------------------------------------------------------------

function getWalletStatus(db: DatabaseType, id: string): string | undefined {
  const row = db.prepare('SELECT status FROM wallets WHERE id = ?').get(id) as
    | { status: string }
    | undefined;
  return row?.status;
}

// ---------------------------------------------------------------------------
// Helper: check if session is revoked
// ---------------------------------------------------------------------------

function isSessionRevoked(db: DatabaseType, id: string): boolean {
  const row = db.prepare('SELECT revoked_at FROM sessions WHERE id = ?').get(id) as
    | { revoked_at: number | null }
    | undefined;
  return row?.revoked_at != null;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AutoStopService', () => {
  let db: DatabaseType;
  let eventBus: EventBus;
  let killSwitchService: KillSwitchService;
  let mockNotify: ReturnType<typeof vi.fn>;
  let mockNotificationService: NotificationService;
  let service: AutoStopService;

  beforeEach(() => {
    db = createTestDb();
    eventBus = new EventBus();

    // Initialize KillSwitchService
    const now = Math.floor(Date.now() / 1000);
    db.prepare(
      'INSERT INTO key_value_store (key, value, updated_at) VALUES (?, ?, ?)',
    ).run('kill_switch_state', 'ACTIVE', now);
    killSwitchService = new KillSwitchService({ sqlite: db, eventBus });

    // Mock NotificationService
    mockNotify = vi.fn().mockResolvedValue(undefined);
    mockNotificationService = { notify: mockNotify } as unknown as NotificationService;

    // AutoStopService with short intervals for testing
    service = new AutoStopService({
      sqlite: db,
      eventBus,
      killSwitchService,
      notificationService: mockNotificationService,
      config: {
        consecutiveFailuresThreshold: 5,
        unusualActivityThreshold: 20,
        unusualActivityWindowSec: 300,
        idleTimeoutSec: 3600,
        idleCheckIntervalSec: 60,
        enabled: true,
      },
    });
  });

  afterEach(() => {
    service.stop();
    try {
      db.close();
    } catch {
      /* already closed */
    }
    vi.restoreAllMocks();
  });

  // -----------------------------------------------------------------------
  // ConsecutiveFailuresRule (AUTO-01)
  // -----------------------------------------------------------------------

  describe('ConsecutiveFailuresRule', () => {
    it('5회 연속 transaction:failed -> 월렛 SUSPENDED', () => {
      const walletId = 'wallet-fail-5';
      insertWallet(db, walletId);

      service.start();

      const now = Math.floor(Date.now() / 1000);
      for (let i = 0; i < 5; i++) {
        eventBus.emit('transaction:failed', {
          walletId,
          txId: `tx-${i}`,
          error: 'insufficient funds',
          type: 'TRANSFER',
          timestamp: now + i,
        });
      }

      expect(getWalletStatus(db, walletId)).toBe('SUSPENDED');
    });

    it('4회 실패 + 1회 성공 + 4회 실패 -> 정지 안 됨', () => {
      const walletId = 'wallet-reset';
      insertWallet(db, walletId);

      service.start();

      const now = Math.floor(Date.now() / 1000);

      // 4 failures
      for (let i = 0; i < 4; i++) {
        eventBus.emit('transaction:failed', {
          walletId,
          txId: `tx-fail-${i}`,
          error: 'error',
          type: 'TRANSFER',
          timestamp: now + i,
        });
      }

      // 1 success -- resets counter
      eventBus.emit('transaction:completed', {
        walletId,
        txId: 'tx-success',
        txHash: '0xabc',
        type: 'TRANSFER',
        timestamp: now + 4,
      });

      // 4 more failures -- total is only 4 after reset, not 8
      for (let i = 0; i < 4; i++) {
        eventBus.emit('transaction:failed', {
          walletId,
          txId: `tx-fail2-${i}`,
          error: 'error',
          type: 'TRANSFER',
          timestamp: now + 5 + i,
        });
      }

      expect(getWalletStatus(db, walletId)).toBe('ACTIVE');
    });

    it('5회 실패 -> 정지 후 카운터 리셋 -> 다시 5회 실패 필요', () => {
      const walletId = 'wallet-re-trigger';
      insertWallet(db, walletId);

      service.start();

      const now = Math.floor(Date.now() / 1000);

      // First 5 failures -> SUSPENDED
      for (let i = 0; i < 5; i++) {
        eventBus.emit('transaction:failed', {
          walletId,
          txId: `tx-a-${i}`,
          error: 'error',
          type: 'TRANSFER',
          timestamp: now + i,
        });
      }
      expect(getWalletStatus(db, walletId)).toBe('SUSPENDED');

      // Manually reactivate wallet (simulating admin recovery)
      db.prepare("UPDATE wallets SET status = 'ACTIVE', suspended_at = NULL, suspension_reason = NULL WHERE id = ?").run(walletId);

      // 4 more failures -- counter was reset after trigger, so should NOT re-trigger
      for (let i = 0; i < 4; i++) {
        eventBus.emit('transaction:failed', {
          walletId,
          txId: `tx-b-${i}`,
          error: 'error',
          type: 'TRANSFER',
          timestamp: now + 10 + i,
        });
      }
      expect(getWalletStatus(db, walletId)).toBe('ACTIVE');

      // 5th failure after reset -> now triggers again
      eventBus.emit('transaction:failed', {
        walletId,
        txId: 'tx-b-4',
        error: 'error',
        type: 'TRANSFER',
        timestamp: now + 14,
      });
      expect(getWalletStatus(db, walletId)).toBe('SUSPENDED');
    });

    it('서로 다른 월렛 실패 -> 각자 독립 카운팅', () => {
      const walletA = 'wallet-a';
      const walletB = 'wallet-b';
      insertWallet(db, walletA);
      insertWallet(db, walletB);

      service.start();

      const now = Math.floor(Date.now() / 1000);

      // walletA: 3 failures
      for (let i = 0; i < 3; i++) {
        eventBus.emit('transaction:failed', {
          walletId: walletA,
          txId: `tx-a-${i}`,
          error: 'error',
          type: 'TRANSFER',
          timestamp: now + i,
        });
      }

      // walletB: 5 failures
      for (let i = 0; i < 5; i++) {
        eventBus.emit('transaction:failed', {
          walletId: walletB,
          txId: `tx-b-${i}`,
          error: 'error',
          type: 'TRANSFER',
          timestamp: now + i,
        });
      }

      expect(getWalletStatus(db, walletA)).toBe('ACTIVE');
      expect(getWalletStatus(db, walletB)).toBe('SUSPENDED');
    });
  });

  // -----------------------------------------------------------------------
  // UnusualActivityRule (AUTO-02)
  // -----------------------------------------------------------------------

  describe('UnusualActivityRule', () => {
    it('윈도우 내 20회 이상 활동 -> 월렛 SUSPENDED', () => {
      const walletId = 'wallet-unusual';
      insertWallet(db, walletId);

      service.start();

      const now = Math.floor(Date.now() / 1000);

      // 20 rapid activities within the window
      for (let i = 0; i < 20; i++) {
        eventBus.emit('wallet:activity', {
          walletId,
          activity: 'TX_REQUESTED',
          timestamp: now + i,
        });
      }

      expect(getWalletStatus(db, walletId)).toBe('SUSPENDED');
    });

    it('윈도우 밖 활동은 카운트 안 됨', () => {
      const walletId = 'wallet-window';
      insertWallet(db, walletId);

      service.start();

      const now = Math.floor(Date.now() / 1000);

      // 15 activities far in the past (outside the 300-second window)
      for (let i = 0; i < 15; i++) {
        eventBus.emit('wallet:activity', {
          walletId,
          activity: 'TX_REQUESTED',
          timestamp: now - 600 + i, // 600 seconds ago
        });
      }

      // 5 recent activities within the window
      for (let i = 0; i < 5; i++) {
        eventBus.emit('wallet:activity', {
          walletId,
          activity: 'TX_REQUESTED',
          timestamp: now + i,
        });
      }

      // Only 5 activities in window -- below threshold of 20
      expect(getWalletStatus(db, walletId)).toBe('ACTIVE');
    });

    it('이상 활동 감지 시 AUTOSTOP_TRIGGERED 알림 발송', () => {
      const walletId = 'wallet-notify';
      insertWallet(db, walletId);

      service.start();

      const now = Math.floor(Date.now() / 1000);

      for (let i = 0; i < 20; i++) {
        eventBus.emit('wallet:activity', {
          walletId,
          activity: 'TX_REQUESTED',
          timestamp: now + i,
        });
      }

      expect(mockNotify).toHaveBeenCalledWith(
        'AUTO_STOP_TRIGGERED',
        walletId,
        expect.objectContaining({ walletId, reason: 'UNUSUAL_ACTIVITY', rule: 'UNUSUAL_ACTIVITY' }),
      );
    });
  });

  // -----------------------------------------------------------------------
  // IdleTimeoutRule (AUTO-03)
  // -----------------------------------------------------------------------

  describe('IdleTimeoutRule', () => {
    it('유휴 타임아웃 초과 세션 자동 해지', () => {
      vi.useFakeTimers();

      const walletId = 'wallet-idle';
      insertWallet(db, walletId);
      insertSession(db, 'session-1', walletId);

      // Create service with short idle timeout and check interval for testing
      const idleService = new AutoStopService({
        sqlite: db,
        eventBus,
        killSwitchService,
        notificationService: mockNotificationService,
        config: {
          consecutiveFailuresThreshold: 5,
          unusualActivityThreshold: 20,
          unusualActivityWindowSec: 300,
          idleTimeoutSec: 10, // 10 seconds
          idleCheckIntervalSec: 5, // check every 5 seconds
          enabled: true,
        },
      });

      const now = Math.floor(Date.now() / 1000);

      // Register session via wallet:activity SESSION_CREATED event
      idleService.start();
      eventBus.emit('wallet:activity', {
        walletId,
        activity: 'SESSION_CREATED',
        details: { sessionId: 'session-1' },
        timestamp: now,
      });

      // Advance time past idle timeout + check interval
      vi.advanceTimersByTime(15_000); // 15 seconds > 10 second timeout

      expect(isSessionRevoked(db, 'session-1')).toBe(true);

      idleService.stop();
      vi.useRealTimers();
    });

    it('활동 있는 세션은 해지 안 됨', () => {
      vi.useFakeTimers();

      const walletId = 'wallet-active-session';
      insertWallet(db, walletId);
      insertSession(db, 'session-2', walletId);

      const idleService = new AutoStopService({
        sqlite: db,
        eventBus,
        killSwitchService,
        notificationService: mockNotificationService,
        config: {
          consecutiveFailuresThreshold: 5,
          unusualActivityThreshold: 200, // high threshold to avoid unusual activity trigger
          unusualActivityWindowSec: 300,
          idleTimeoutSec: 10,
          idleCheckIntervalSec: 5,
          enabled: true,
        },
      });

      const now = Math.floor(Date.now() / 1000);

      idleService.start();

      // Register session
      eventBus.emit('wallet:activity', {
        walletId,
        activity: 'SESSION_CREATED',
        details: { sessionId: 'session-2' },
        timestamp: now,
      });

      // Advance 7 seconds
      vi.advanceTimersByTime(7_000);

      // Activity updates the last-activity time
      const updatedNow = Math.floor(Date.now() / 1000);
      eventBus.emit('wallet:activity', {
        walletId,
        activity: 'TX_REQUESTED',
        details: { sessionId: 'session-2' },
        timestamp: updatedNow,
      });

      // Advance another 7 seconds (total 14 from start, but only 7 from last activity)
      vi.advanceTimersByTime(7_000);

      // Session should NOT be revoked (only 7 seconds since last activity < 10 second timeout)
      expect(isSessionRevoked(db, 'session-2')).toBe(false);

      idleService.stop();
      vi.useRealTimers();
    });
  });

  // -----------------------------------------------------------------------
  // ManualTrigger (AUTO-04)
  // -----------------------------------------------------------------------

  describe('ManualTrigger', () => {
    it('manualTrigger 호출 -> KillSwitchService.activateWithCascade() 실행', () => {
      service.start();
      service.manualTrigger('admin');

      const state = killSwitchService.getState();
      expect(state.state).toBe('SUSPENDED');
      expect(state.activatedBy).toBe('admin');
    });

    it('manualTrigger 시 AUTOSTOP_TRIGGERED 알림 발송', () => {
      service.start();
      service.manualTrigger('admin');

      expect(mockNotify).toHaveBeenCalledWith(
        'AUTO_STOP_TRIGGERED',
        'system',
        expect.objectContaining({ walletId: 'system', rule: 'MANUAL_TRIGGER' }),
      );
    });
  });

  // -----------------------------------------------------------------------
  // EventBus integration
  // -----------------------------------------------------------------------

  describe('EventBus integration', () => {
    it('start() 후 EventBus 리스너 등록 확인', () => {
      service.start();

      expect(eventBus.listenerCount('transaction:failed')).toBeGreaterThanOrEqual(1);
      expect(eventBus.listenerCount('transaction:completed')).toBeGreaterThanOrEqual(1);
      expect(eventBus.listenerCount('wallet:activity')).toBeGreaterThanOrEqual(1);
    });

    it('stop() 후 idle check timer 정리', () => {
      vi.useFakeTimers();

      const walletId = 'wallet-timer';
      insertWallet(db, walletId);
      insertSession(db, 'session-timer', walletId);

      const timerService = new AutoStopService({
        sqlite: db,
        eventBus,
        killSwitchService,
        notificationService: mockNotificationService,
        config: {
          consecutiveFailuresThreshold: 5,
          unusualActivityThreshold: 200,
          unusualActivityWindowSec: 300,
          idleTimeoutSec: 10,
          idleCheckIntervalSec: 5,
          enabled: true,
        },
      });

      const now = Math.floor(Date.now() / 1000);

      timerService.start();

      // Register session
      eventBus.emit('wallet:activity', {
        walletId,
        activity: 'SESSION_CREATED',
        details: { sessionId: 'session-timer' },
        timestamp: now,
      });

      // Stop before timer fires
      timerService.stop();

      // Advance time way past timeout
      vi.advanceTimersByTime(60_000);

      // Session should NOT be revoked (timer was cleared)
      expect(isSessionRevoked(db, 'session-timer')).toBe(false);

      vi.useRealTimers();
    });
  });

  // -----------------------------------------------------------------------
  // suspendWallet internals
  // -----------------------------------------------------------------------

  describe('suspendWallet', () => {
    it('이미 SUSPENDED인 월렛 중복 정지 방지', () => {
      const walletId = 'wallet-already-suspended';
      insertWallet(db, walletId, 'SUSPENDED');

      service.start();

      const now = Math.floor(Date.now() / 1000);

      // 5 failures on already-suspended wallet
      for (let i = 0; i < 5; i++) {
        eventBus.emit('transaction:failed', {
          walletId,
          txId: `tx-${i}`,
          error: 'error',
          type: 'TRANSFER',
          timestamp: now + i,
        });
      }

      // Still SUSPENDED (not re-processed)
      expect(getWalletStatus(db, walletId)).toBe('SUSPENDED');

      // Notification NOT sent for already-suspended wallet
      expect(mockNotify).not.toHaveBeenCalled();
    });

    it('정지 시 audit_log에 기록', () => {
      const walletId = 'wallet-audit';
      insertWallet(db, walletId);

      service.start();

      const now = Math.floor(Date.now() / 1000);
      for (let i = 0; i < 5; i++) {
        eventBus.emit('transaction:failed', {
          walletId,
          txId: `tx-audit-${i}`,
          error: 'error',
          type: 'TRANSFER',
          timestamp: now + i,
        });
      }

      const auditRow = db
        .prepare(
          "SELECT * FROM audit_log WHERE event_type = 'AUTO_STOP_TRIGGERED' AND actor = 'autostop'",
        )
        .get() as { event_type: string; actor: string; details: string; severity: string } | undefined;

      expect(auditRow).toBeDefined();
      expect(auditRow!.event_type).toBe('AUTO_STOP_TRIGGERED');
      expect(auditRow!.actor).toBe('autostop');
      expect(auditRow!.severity).toBe('warning');

      const details = JSON.parse(auditRow!.details);
      expect(details.reason).toBe('CONSECUTIVE_FAILURES');
      expect(details.walletId).toBe(walletId);
    });
  });

  // -----------------------------------------------------------------------
  // updateConfig (AUTO-05)
  // -----------------------------------------------------------------------

  describe('updateConfig', () => {
    it('런타임 threshold 변경 후 새 threshold 적용', () => {
      const walletId = 'wallet-config';
      insertWallet(db, walletId);

      service.start();

      // Lower threshold to 3
      service.updateConfig({ consecutiveFailuresThreshold: 3 });

      const now = Math.floor(Date.now() / 1000);

      // 3 failures should now trigger suspension
      for (let i = 0; i < 3; i++) {
        eventBus.emit('transaction:failed', {
          walletId,
          txId: `tx-cfg-${i}`,
          error: 'error',
          type: 'TRANSFER',
          timestamp: now + i,
        });
      }

      expect(getWalletStatus(db, walletId)).toBe('SUSPENDED');
    });
  });

  // -----------------------------------------------------------------------
  // getStatus()
  // -----------------------------------------------------------------------

  describe('getStatus', () => {
    it('현재 규칙 엔진 상태를 반환', () => {
      service.start();

      const status = service.getStatus();
      expect(status.enabled).toBe(true);
      expect(status.config.consecutiveFailuresThreshold).toBe(5);
      expect(status.config.unusualActivityThreshold).toBe(20);
      expect(status.config.idleTimeoutSec).toBe(3600);
      expect(status.rules.consecutiveFailures.trackedWallets).toBe(0);
      expect(status.rules.unusualActivity.trackedWallets).toBe(0);
      expect(status.rules.idleTimeout.trackedSessions).toBe(0);
    });
  });

  // -----------------------------------------------------------------------
  // enabled=false
  // -----------------------------------------------------------------------

  describe('enabled=false', () => {
    it('비활성화 시 이벤트 리스너가 등록되지 않음', () => {
      const disabledService = new AutoStopService({
        sqlite: db,
        eventBus,
        killSwitchService,
        notificationService: mockNotificationService,
        config: { enabled: false },
      });

      disabledService.start();

      expect(eventBus.listenerCount('transaction:failed')).toBe(0);
      expect(eventBus.listenerCount('transaction:completed')).toBe(0);
      expect(eventBus.listenerCount('wallet:activity')).toBe(0);

      disabledService.stop();
    });
  });
});
