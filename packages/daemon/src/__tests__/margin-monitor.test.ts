/**
 * Unit tests for MarginMonitor.
 *
 * Tests: severity classification, alert emission, cooldown, adaptive polling,
 * on-demand PositionTracker sync, cooldown recovery, EventBus emission.
 * @see PERP-03, PERP-04
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MarginMonitor } from '../services/monitoring/margin-monitor.js';
import { createDatabase, pushSchema } from '../infrastructure/database/index.js';
import type { Database as DatabaseType } from 'better-sqlite3';

// ---------------------------------------------------------------------------
// Mock types
// ---------------------------------------------------------------------------

interface MockNotificationService {
  notify: ReturnType<typeof vi.fn>;
}

interface MockPositionTracker {
  syncCategory: ReturnType<typeof vi.fn>;
}

interface MockEventBus {
  emit: ReturnType<typeof vi.fn>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let positionCounter = 0;

function insertPosition(
  sqlite: DatabaseType,
  walletId: string,
  marginRatio: number,
  market?: string,
  positionId?: string,
): string {
  positionCounter++;
  const id = positionId ?? `pos-${positionCounter}`;
  const now = Math.floor(Date.now() / 1000);
  sqlite
    .prepare(
      `INSERT INTO defi_positions (id, wallet_id, category, provider, chain, amount, metadata, status, opened_at, last_synced_at, created_at, updated_at)
       VALUES (?, ?, 'PERP', 'drift', 'solana', '100', ?, 'ACTIVE', ?, ?, ?, ?)`,
    )
    .run(
      id,
      walletId,
      JSON.stringify({ marginRatio, market: market ?? 'SOL-PERP', direction: 'LONG' }),
      now,
      now,
      now,
      now,
    );
  return id;
}

function updatePositionMargin(sqlite: DatabaseType, positionId: string, marginRatio: number): void {
  const now = Math.floor(Date.now() / 1000);
  sqlite
    .prepare('UPDATE defi_positions SET metadata = ?, updated_at = ? WHERE id = ?')
    .run(JSON.stringify({ marginRatio, market: 'SOL-PERP', direction: 'LONG' }), now, positionId);
}

function insertTestWallet(sqlite: DatabaseType, walletId: string): void {
  sqlite
    .prepare(
      "INSERT INTO wallets (id, name, chain, environment, public_key, status, created_at, updated_at) VALUES (?, 'test', 'solana', 'mainnet', ?, 'ACTIVE', 0, 0)",
    )
    .run(walletId, `pk-${walletId}`);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('MarginMonitor', () => {
  let sqlite: DatabaseType;
  let mockNotification: MockNotificationService;
  let mockTracker: MockPositionTracker;
  let mockEventBus: MockEventBus;
  let monitor: MarginMonitor;

  beforeEach(() => {
    vi.useFakeTimers();
    positionCounter = 0;

    const conn = createDatabase(':memory:');
    sqlite = conn.sqlite;
    pushSchema(sqlite);
    insertTestWallet(sqlite, 'wallet-1');

    mockNotification = { notify: vi.fn().mockResolvedValue(undefined) };
    mockTracker = { syncCategory: vi.fn().mockResolvedValue(undefined) };
    mockEventBus = { emit: vi.fn() };

    monitor = new MarginMonitor({
      sqlite,
      notificationService: mockNotification as unknown as import('../notifications/notification-service.js').NotificationService,
      positionTracker: mockTracker as unknown as import('../services/defi/position-tracker.js').PositionTracker,
      eventBus: mockEventBus as unknown as import('@waiaas/core').EventBus,
    });
  });

  afterEach(() => {
    monitor.stop();
    sqlite.close();
    vi.useRealTimers();
  });

  // -----------------------------------------------------------------------
  // Severity classification
  // -----------------------------------------------------------------------

  describe('severity classification', () => {
    it('classifies marginRatio >= 0.30 as SAFE', async () => {
      insertPosition(sqlite, 'wallet-1', 0.35);
      await monitor.checkAllPositions();
      expect(monitor.getCurrentSeverity()).toBe('SAFE');
    });

    it('classifies marginRatio 0.15-0.30 as WARNING', async () => {
      insertPosition(sqlite, 'wallet-1', 0.20);
      await monitor.checkAllPositions();
      expect(monitor.getCurrentSeverity()).toBe('WARNING');
    });

    it('classifies marginRatio 0.10-0.15 as DANGER', async () => {
      insertPosition(sqlite, 'wallet-1', 0.12);
      await monitor.checkAllPositions();
      expect(monitor.getCurrentSeverity()).toBe('DANGER');
    });

    it('classifies marginRatio < 0.10 as CRITICAL', async () => {
      insertPosition(sqlite, 'wallet-1', 0.05);
      await monitor.checkAllPositions();
      expect(monitor.getCurrentSeverity()).toBe('CRITICAL');
    });
  });

  // -----------------------------------------------------------------------
  // Alert emission
  // -----------------------------------------------------------------------

  describe('alert emission', () => {
    it('sends MARGIN_WARNING for WARNING severity', async () => {
      insertPosition(sqlite, 'wallet-1', 0.20);
      await monitor.checkAllPositions();
      expect(mockNotification.notify).toHaveBeenCalledWith(
        'MARGIN_WARNING',
        'wallet-1',
        expect.objectContaining({ marginRatio: '20.0' }),
      );
    });

    it('sends LIQUIDATION_IMMINENT for CRITICAL severity', async () => {
      insertPosition(sqlite, 'wallet-1', 0.05);
      await monitor.checkAllPositions();
      expect(mockNotification.notify).toHaveBeenCalledWith(
        'LIQUIDATION_IMMINENT',
        'wallet-1',
        expect.objectContaining({ marginRatio: '5.0' }),
      );
    });

    it('applies 4h cooldown for WARNING/DANGER alerts', async () => {
      insertPosition(sqlite, 'wallet-1', 0.12); // DANGER

      // First check: should alert
      await monitor.checkAllPositions();
      expect(mockNotification.notify).toHaveBeenCalledTimes(1);

      // Second check immediately: should NOT alert (cooldown active)
      await monitor.checkAllPositions();
      expect(mockNotification.notify).toHaveBeenCalledTimes(1);

      // Advance time by 4 hours + 1ms
      vi.advanceTimersByTime(4 * 60 * 60 * 1000 + 1);

      // Third check: should alert again (cooldown expired)
      await monitor.checkAllPositions();
      expect(mockNotification.notify).toHaveBeenCalledTimes(2);
    });

    it('does NOT apply cooldown for CRITICAL', async () => {
      insertPosition(sqlite, 'wallet-1', 0.05); // CRITICAL

      await monitor.checkAllPositions();
      expect(mockNotification.notify).toHaveBeenCalledTimes(1);

      // Second check immediately: should STILL alert (no cooldown for CRITICAL)
      await monitor.checkAllPositions();
      expect(mockNotification.notify).toHaveBeenCalledTimes(2);
    });
  });

  // -----------------------------------------------------------------------
  // EventBus emission
  // -----------------------------------------------------------------------

  describe('EventBus emission', () => {
    it('emits perp:margin-warning for WARNING severity', async () => {
      insertPosition(sqlite, 'wallet-1', 0.20, 'SOL-PERP');
      await monitor.checkAllPositions();
      expect(mockEventBus.emit).toHaveBeenCalledWith(
        'perp:margin-warning',
        expect.objectContaining({
          walletId: 'wallet-1',
          severity: 'WARNING',
          market: 'SOL-PERP',
          provider: 'drift',
        }),
      );
    });

    it('emits perp:margin-warning for CRITICAL severity', async () => {
      insertPosition(sqlite, 'wallet-1', 0.05, 'ETH-PERP');
      await monitor.checkAllPositions();
      expect(mockEventBus.emit).toHaveBeenCalledWith(
        'perp:margin-warning',
        expect.objectContaining({
          walletId: 'wallet-1',
          severity: 'CRITICAL',
          market: 'ETH-PERP',
          provider: 'drift',
        }),
      );
    });
  });

  // -----------------------------------------------------------------------
  // Cooldown recovery
  // -----------------------------------------------------------------------

  describe('cooldown recovery', () => {
    it('clears cooldown when severity returns to SAFE', async () => {
      const posId = insertPosition(sqlite, 'wallet-1', 0.12); // DANGER

      // First check: alert, sets cooldown
      await monitor.checkAllPositions();
      expect(mockNotification.notify).toHaveBeenCalledTimes(1);
      expect(monitor.getCooldownMapSize()).toBe(1);

      // Recover to SAFE
      updatePositionMargin(sqlite, posId, 0.35);
      await monitor.checkAllPositions();
      expect(monitor.getCooldownMapSize()).toBe(0); // cooldown cleared

      // Drop back to DANGER
      updatePositionMargin(sqlite, posId, 0.12);
      await monitor.checkAllPositions();
      // Should alert again because cooldown was cleared on recovery
      expect(mockNotification.notify).toHaveBeenCalledTimes(2);
    });
  });

  // -----------------------------------------------------------------------
  // Adaptive polling
  // -----------------------------------------------------------------------

  describe('adaptive polling', () => {
    it('schedules next check at SAFE interval (300s) by default', () => {
      const setTimeoutSpy = vi.spyOn(global, 'setTimeout');
      monitor.start();
      // First setTimeout should be 300_000 (SAFE interval)
      expect(setTimeoutSpy).toHaveBeenCalledWith(expect.any(Function), 300_000);
      setTimeoutSpy.mockRestore();
    });

    it('shortens interval when severity changes to WARNING', async () => {
      insertPosition(sqlite, 'wallet-1', 0.20); // WARNING
      monitor.start();

      // Advance past first SAFE interval (300s)
      const setTimeoutSpy = vi.spyOn(global, 'setTimeout');
      await vi.advanceTimersByTimeAsync(300_000);

      // After check, severity becomes WARNING -> next interval should be 60_000
      const lastCall = setTimeoutSpy.mock.calls[setTimeoutSpy.mock.calls.length - 1];
      expect(lastCall?.[1]).toBe(60_000);
      setTimeoutSpy.mockRestore();
    });
  });

  // -----------------------------------------------------------------------
  // On-demand sync
  // -----------------------------------------------------------------------

  describe('on-demand sync (#455: removed to avoid RPC 429 flood)', () => {
    it('does NOT request PositionTracker sync on DANGER', async () => {
      insertPosition(sqlite, 'wallet-1', 0.12); // DANGER
      await monitor.checkAllPositions();
      expect(mockTracker.syncCategory).not.toHaveBeenCalled();
    });

    it('does NOT request PositionTracker sync on CRITICAL', async () => {
      insertPosition(sqlite, 'wallet-1', 0.05); // CRITICAL
      await monitor.checkAllPositions();
      expect(mockTracker.syncCategory).not.toHaveBeenCalled();
    });

    it('does NOT request sync for SAFE/WARNING', async () => {
      insertPosition(sqlite, 'wallet-1', 0.20); // WARNING
      await monitor.checkAllPositions();
      expect(mockTracker.syncCategory).not.toHaveBeenCalled();
    });
  });
});
