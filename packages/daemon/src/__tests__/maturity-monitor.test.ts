/**
 * Unit tests for MaturityMonitor.
 *
 * Tests: maturity warning levels (7-day, 1-day, post-maturity),
 * cooldown per level, event emission, notification sending,
 * configurable warning days, non-YIELD positions ignored.
 * @see YIELD-04
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MaturityMonitor } from '../services/monitoring/maturity-monitor.js';
import { createDatabase, pushSchema } from '../infrastructure/database/index.js';
import type { Database as DatabaseType } from 'better-sqlite3';

// ---------------------------------------------------------------------------
// Mock types
// ---------------------------------------------------------------------------

interface MockNotificationService {
  notify: ReturnType<typeof vi.fn>;
}

interface MockEventBus {
  emit: ReturnType<typeof vi.fn>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let positionCounter = 0;

function insertTestWallet(sqlite: DatabaseType, walletId: string): void {
  sqlite
    .prepare(
      "INSERT INTO wallets (id, name, chain, environment, public_key, status, created_at, updated_at) VALUES (?, 'test', 'ethereum', 'testnet', ?, 'ACTIVE', 0, 0)",
    )
    .run(walletId, `pk-${walletId}`);
}

function insertYieldPosition(
  sqlite: DatabaseType,
  walletId: string,
  maturityTimestamp: number,
  opts?: { positionId?: string; marketId?: string; status?: string },
): string {
  positionCounter++;
  const id = opts?.positionId ?? `pos-${positionCounter}`;
  const now = Math.floor(Date.now() / 1000);
  const metadata = JSON.stringify({
    maturity: maturityTimestamp,
    market_id: opts?.marketId ?? 'market-1',
    token_type: 'PT',
    apy: 0.05,
  });
  sqlite
    .prepare(
      `INSERT INTO defi_positions (id, wallet_id, category, provider, chain, amount, metadata, status, opened_at, last_synced_at, created_at, updated_at)
       VALUES (?, ?, 'YIELD', 'pendle', 'ethereum', '100', ?, ?, ?, ?, ?, ?)`,
    )
    .run(id, walletId, metadata, opts?.status ?? 'ACTIVE', now, now, now, now);
  return id;
}

function insertLendingPosition(sqlite: DatabaseType, walletId: string): string {
  positionCounter++;
  const id = `pos-${positionCounter}`;
  const now = Math.floor(Date.now() / 1000);
  sqlite
    .prepare(
      `INSERT INTO defi_positions (id, wallet_id, category, provider, chain, amount, metadata, status, opened_at, last_synced_at, created_at, updated_at)
       VALUES (?, ?, 'LENDING', 'aave-v3', 'ethereum', '100', ?, 'ACTIVE', ?, ?, ?, ?)`,
    )
    .run(id, walletId, JSON.stringify({ healthFactor: 2.0 }), now, now, now, now);
  return id;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('MaturityMonitor', () => {
  let sqlite: DatabaseType;
  let mockNotification: MockNotificationService;
  let mockEventBus: MockEventBus;
  let monitor: MaturityMonitor;

  beforeEach(() => {
    vi.useFakeTimers();
    positionCounter = 0;

    const conn = createDatabase(':memory:');
    sqlite = conn.sqlite;
    pushSchema(sqlite);
    insertTestWallet(sqlite, 'wallet-1');

    mockNotification = { notify: vi.fn().mockResolvedValue(undefined) };
    mockEventBus = { emit: vi.fn() };

    monitor = new MaturityMonitor({
      sqlite,
      eventBus: mockEventBus as unknown as import('@waiaas/core').EventBus,
      notificationService: mockNotification as unknown as import('../notifications/notification-service.js').NotificationService,
      config: { pollingIntervalMs: 1000, cooldownMs: 86_400_000 },
    });
  });

  afterEach(() => {
    monitor.stop();
    sqlite.close();
    vi.useRealTimers();
  });

  // -----------------------------------------------------------------------
  // Warning levels
  // -----------------------------------------------------------------------

  describe('warning levels', () => {
    it('emits n-day warning when maturity is within warningDays', async () => {
      const nowSec = Math.floor(Date.now() / 1000);
      const maturity = nowSec + 5 * 86_400; // 5 days from now (< 7 default)
      insertYieldPosition(sqlite, 'wallet-1', maturity);

      await monitor.checkAllPositions();

      expect(mockEventBus.emit).toHaveBeenCalledWith(
        'yield:maturity-warning',
        expect.objectContaining({
          walletId: 'wallet-1',
          daysUntilMaturity: 5,
          provider: 'pendle',
        }),
      );
      expect(mockNotification.notify).toHaveBeenCalledWith(
        'MATURITY_WARNING',
        'wallet-1',
        expect.objectContaining({ daysUntilMaturity: '5' }),
      );
    });

    it('emits 1-day warning when maturity is within 1 day', async () => {
      const nowSec = Math.floor(Date.now() / 1000);
      const maturity = nowSec + 12 * 3600; // 12 hours from now
      insertYieldPosition(sqlite, 'wallet-1', maturity);

      await monitor.checkAllPositions();

      expect(mockEventBus.emit).toHaveBeenCalledWith(
        'yield:maturity-warning',
        expect.objectContaining({
          walletId: 'wallet-1',
          daysUntilMaturity: 1,
        }),
      );
    });

    it('emits post-maturity warning when maturity has passed', async () => {
      const nowSec = Math.floor(Date.now() / 1000);
      const maturity = nowSec - 86_400; // 1 day ago
      insertYieldPosition(sqlite, 'wallet-1', maturity);

      await monitor.checkAllPositions();

      expect(mockEventBus.emit).toHaveBeenCalledWith(
        'yield:maturity-warning',
        expect.objectContaining({
          walletId: 'wallet-1',
          daysUntilMaturity: 0,
        }),
      );
    });

    it('does NOT emit warning when maturity is far away', async () => {
      const nowSec = Math.floor(Date.now() / 1000);
      const maturity = nowSec + 30 * 86_400; // 30 days from now
      insertYieldPosition(sqlite, 'wallet-1', maturity);

      await monitor.checkAllPositions();

      expect(mockEventBus.emit).not.toHaveBeenCalled();
      expect(mockNotification.notify).not.toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // Cooldown
  // -----------------------------------------------------------------------

  describe('cooldown', () => {
    it('applies 24h cooldown per position per level', async () => {
      const nowSec = Math.floor(Date.now() / 1000);
      const maturity = nowSec + 3 * 86_400; // 3 days from now
      insertYieldPosition(sqlite, 'wallet-1', maturity);

      // First check: should alert
      await monitor.checkAllPositions();
      expect(mockNotification.notify).toHaveBeenCalledTimes(1);

      // Second check immediately: should NOT alert (cooldown active)
      await monitor.checkAllPositions();
      expect(mockNotification.notify).toHaveBeenCalledTimes(1);

      // Advance by 24h + 1ms
      vi.advanceTimersByTime(86_400_000 + 1);

      // Third check: should alert again (cooldown expired)
      await monitor.checkAllPositions();
      expect(mockNotification.notify).toHaveBeenCalledTimes(2);
    });

    it('tracks cooldown independently per warning level', async () => {
      const nowSec = Math.floor(Date.now() / 1000);
      // Start at 5 days (n-day warning)
      const maturity = nowSec + 5 * 86_400;
      const posId = insertYieldPosition(sqlite, 'wallet-1', maturity);

      await monitor.checkAllPositions();
      expect(mockEventBus.emit).toHaveBeenCalledTimes(1);

      // Update to 0.5 days (1-day level) — should emit new warning
      const newMaturity = Math.floor(Date.now() / 1000) + 12 * 3600;
      sqlite
        .prepare('UPDATE defi_positions SET metadata = ? WHERE id = ?')
        .run(JSON.stringify({ maturity: newMaturity, market_id: 'market-1', token_type: 'PT' }), posId);

      await monitor.checkAllPositions();
      // Different level => no cooldown => should emit
      expect(mockEventBus.emit).toHaveBeenCalledTimes(2);
    });
  });

  // -----------------------------------------------------------------------
  // Filtering
  // -----------------------------------------------------------------------

  describe('filtering', () => {
    it('ignores LENDING positions', async () => {
      insertLendingPosition(sqlite, 'wallet-1');
      await monitor.checkAllPositions();
      expect(mockEventBus.emit).not.toHaveBeenCalled();
    });

    it('ignores CLOSED YIELD positions', async () => {
      const nowSec = Math.floor(Date.now() / 1000);
      const maturity = nowSec + 3 * 86_400;
      insertYieldPosition(sqlite, 'wallet-1', maturity, { status: 'CLOSED' });
      await monitor.checkAllPositions();
      expect(mockEventBus.emit).not.toHaveBeenCalled();
    });

    it('ignores positions without maturity metadata', async () => {
      positionCounter++;
      const id = `pos-${positionCounter}`;
      const now = Math.floor(Date.now() / 1000);
      sqlite
        .prepare(
          `INSERT INTO defi_positions (id, wallet_id, category, provider, chain, amount, metadata, status, opened_at, last_synced_at, created_at, updated_at)
           VALUES (?, ?, 'YIELD', 'pendle', 'ethereum', '100', ?, 'ACTIVE', ?, ?, ?, ?)`,
        )
        .run(id, 'wallet-1', JSON.stringify({ token_type: 'PT' }), now, now, now, now);

      await monitor.checkAllPositions();
      expect(mockEventBus.emit).not.toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // Config
  // -----------------------------------------------------------------------

  describe('config', () => {
    it('uses custom warningDays via updateConfig', async () => {
      monitor.updateConfig({ maturity_warning_days: 3 });

      const nowSec = Math.floor(Date.now() / 1000);
      // 5 days out: would warn with default 7, should NOT with 3
      insertYieldPosition(sqlite, 'wallet-1', nowSec + 5 * 86_400);

      await monitor.checkAllPositions();
      expect(mockEventBus.emit).not.toHaveBeenCalled();

      // 2 days out: should warn with 3-day config
      positionCounter++;
      insertYieldPosition(sqlite, 'wallet-1', nowSec + 2 * 86_400);

      await monitor.checkAllPositions();
      expect(mockEventBus.emit).toHaveBeenCalledTimes(1);
    });
  });

  // -----------------------------------------------------------------------
  // Polling lifecycle
  // -----------------------------------------------------------------------

  describe('polling lifecycle', () => {
    it('schedules polling at configured interval', () => {
      const setTimeoutSpy = vi.spyOn(global, 'setTimeout');
      monitor.start();
      expect(setTimeoutSpy).toHaveBeenCalledWith(expect.any(Function), 1000);
      setTimeoutSpy.mockRestore();
    });

    it('stops polling on stop()', () => {
      monitor.start();
      monitor.stop();

      const setTimeoutSpy = vi.spyOn(global, 'setTimeout');
      vi.advanceTimersByTime(2000);
      // No new setTimeout should be scheduled after stop
      const monitorCalls = setTimeoutSpy.mock.calls.filter(
        (call) => call[1] === 1000,
      );
      expect(monitorCalls).toHaveLength(0);
      setTimeoutSpy.mockRestore();
    });
  });

  // -----------------------------------------------------------------------
  // Event payload
  // -----------------------------------------------------------------------

  describe('event payload', () => {
    it('includes correct fields in yield:maturity-warning event', async () => {
      const nowSec = Math.floor(Date.now() / 1000);
      const maturity = nowSec + 3 * 86_400;
      insertYieldPosition(sqlite, 'wallet-1', maturity, { marketId: 'my-market' });

      await monitor.checkAllPositions();

      expect(mockEventBus.emit).toHaveBeenCalledWith('yield:maturity-warning', {
        walletId: 'wallet-1',
        positionId: expect.stringContaining('pos-'),
        provider: 'pendle',
        marketId: 'my-market',
        daysUntilMaturity: 3,
        maturityDate: maturity,
        timestamp: expect.any(Number),
      });
    });
  });
});
