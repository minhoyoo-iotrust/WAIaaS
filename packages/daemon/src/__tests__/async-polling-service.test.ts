/**
 * AsyncPollingService tests: polling engine for async status tracking.
 *
 * Tests cover:
 * 1. Tracker registration and storage by name
 * 2. Empty result when no tracking targets in DB
 * 3. checkStatus called for PENDING bridge transactions
 * 4. Per-tracker timing skip (lastPolledAt + pollIntervalMs not elapsed)
 * 5. COMPLETED result updates bridge_status
 * 6. FAILED result updates bridge_status
 * 7. maxAttempts exceeded with timeoutTransition BRIDGE_MONITORING
 * 8. maxAttempts exceeded with timeoutTransition TIMEOUT
 * 9. maxAttempts exceeded with timeoutTransition CANCELLED
 * 10. Error isolation: one TX error does not prevent others
 * 11. GAS_WAITING transactions picked up by gas-condition tracker
 * 12. BRIDGE_MONITORING transactions picked up by polling
 *
 * @see internal/objectives/m28-00-defi-basic-protocol-design.md (DEFI-04 ASNC-02)
 */

import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import type { Database as DatabaseType } from 'better-sqlite3';
import { createDatabase, pushSchema } from '../infrastructure/database/index.js';
import { AsyncPollingService } from '../services/async-polling-service.js';
import type { IAsyncStatusTracker, AsyncTrackingResult } from '@waiaas/actions';

// ---------------------------------------------------------------------------
// Setup: in-memory DB with full schema
// ---------------------------------------------------------------------------

let sqlite: DatabaseType;
let db: ReturnType<typeof createDatabase>['db'];

function resetDb(): void {
  if (sqlite) sqlite.close();
  const conn = createDatabase(':memory:');
  sqlite = conn.sqlite;
  db = conn.db;
  pushSchema(sqlite);
}

afterAll(() => {
  sqlite?.close();
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function nowTs(): number {
  return Math.floor(Date.now() / 1000);
}

function createMockTracker(overrides?: Partial<IAsyncStatusTracker>): IAsyncStatusTracker {
  return {
    name: 'bridge',
    maxAttempts: 240,
    pollIntervalMs: 30_000,
    timeoutTransition: 'BRIDGE_MONITORING',
    checkStatus: vi.fn().mockResolvedValue({ state: 'PENDING' } satisfies AsyncTrackingResult),
    ...overrides,
  };
}

function insertTestWallet(walletId: string = 'w-poll-test'): void {
  const ts = nowTs();
  sqlite.prepare(
    `INSERT OR IGNORE INTO wallets (id, name, chain, environment, public_key, status, created_at, updated_at)
     VALUES (?, 'poll-test', 'solana', 'testnet', ?, 'ACTIVE', ?, ?)`,
  ).run(walletId, `pk-${walletId}`, ts, ts);
}

function insertBridgeTx(
  txId: string,
  bridgeStatus: string | null,
  bridgeMetadata: string = '{}',
  opts?: { status?: string },
): void {
  const ts = nowTs();
  insertTestWallet();
  sqlite.prepare(
    `INSERT INTO transactions (id, wallet_id, chain, type, status, created_at, bridge_status, bridge_metadata)
     VALUES (?, 'w-poll-test', 'solana', 'TRANSFER', ?, ?, ?, ?)`,
  ).run(txId, opts?.status ?? 'PENDING', ts, bridgeStatus, bridgeMetadata);
}

function getTx(txId: string): Record<string, unknown> {
  return sqlite.prepare('SELECT * FROM transactions WHERE id = ?').get(txId) as Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AsyncPollingService: tracker registration', () => {
  beforeEach(() => resetDb());

  it('registerTracker stores tracker by name', () => {
    const service = new AsyncPollingService(db);
    const tracker = createMockTracker();
    service.registerTracker(tracker);
    expect(service.trackerCount).toBe(1);
  });

  it('registerTracker replaces tracker with same name', () => {
    const service = new AsyncPollingService(db);
    service.registerTracker(createMockTracker({ name: 'bridge' }));
    service.registerTracker(createMockTracker({ name: 'bridge', maxAttempts: 100 }));
    expect(service.trackerCount).toBe(1);
  });
});

describe('AsyncPollingService: pollAll empty', () => {
  beforeEach(() => resetDb());

  it('returns empty result when no tracking targets exist', async () => {
    const service = new AsyncPollingService(db);
    service.registerTracker(createMockTracker());
    const result = await service.pollAll();
    expect(result).toEqual({ polled: 0, skipped: 0, errors: 0 });
  });
});

describe('AsyncPollingService: pollAll checkStatus', () => {
  beforeEach(() => resetDb());

  it('calls checkStatus for PENDING bridge transaction', async () => {
    const metadata = JSON.stringify({ tracker: 'bridge', pollCount: 0, lastPolledAt: 0 });
    insertBridgeTx('tx-pending-1', 'PENDING', metadata);

    const tracker = createMockTracker();
    const service = new AsyncPollingService(db);
    service.registerTracker(tracker);

    const result = await service.pollAll();
    expect(result.polled).toBe(1);
    expect(tracker.checkStatus).toHaveBeenCalledOnce();
    expect(tracker.checkStatus).toHaveBeenCalledWith('tx-pending-1', expect.objectContaining({ tracker: 'bridge' }));

    // Verify bridge_metadata updated with incremented pollCount and new lastPolledAt
    const tx = getTx('tx-pending-1');
    const updatedMeta = JSON.parse(tx.bridge_metadata as string);
    expect(updatedMeta.pollCount).toBe(1);
    expect(updatedMeta.lastPolledAt).toBeGreaterThan(0);
  });

  it('skips transaction without registered tracker', async () => {
    const metadata = JSON.stringify({ tracker: 'unknown-tracker', pollCount: 0, lastPolledAt: 0 });
    insertBridgeTx('tx-no-tracker', 'PENDING', metadata);

    const service = new AsyncPollingService(db);
    // No tracker registered
    const result = await service.pollAll();
    expect(result.skipped).toBe(1);
    expect(result.polled).toBe(0);
  });
});

describe('AsyncPollingService: per-tracker timing', () => {
  beforeEach(() => resetDb());

  it('skips transaction when lastPolledAt + pollIntervalMs not elapsed', async () => {
    const recentPoll = Date.now() - 10_000; // 10s ago
    const metadata = JSON.stringify({ tracker: 'bridge', pollCount: 5, lastPolledAt: recentPoll });
    insertBridgeTx('tx-too-early', 'PENDING', metadata);

    const tracker = createMockTracker({ pollIntervalMs: 30_000 });
    const service = new AsyncPollingService(db);
    service.registerTracker(tracker);

    const result = await service.pollAll();
    expect(result.skipped).toBe(1);
    expect(result.polled).toBe(0);
    expect(tracker.checkStatus).not.toHaveBeenCalled();
  });

  it('polls transaction when lastPolledAt + pollIntervalMs has elapsed', async () => {
    const oldPoll = Date.now() - 60_000; // 60s ago
    const metadata = JSON.stringify({ tracker: 'bridge', pollCount: 5, lastPolledAt: oldPoll });
    insertBridgeTx('tx-ready', 'PENDING', metadata);

    const tracker = createMockTracker({ pollIntervalMs: 30_000 });
    const service = new AsyncPollingService(db);
    service.registerTracker(tracker);

    const result = await service.pollAll();
    expect(result.polled).toBe(1);
    expect(tracker.checkStatus).toHaveBeenCalledOnce();
  });
});

describe('AsyncPollingService: result handling', () => {
  beforeEach(() => resetDb());

  it('COMPLETED result updates bridge_status to COMPLETED', async () => {
    const metadata = JSON.stringify({ tracker: 'bridge', pollCount: 0, lastPolledAt: 0 });
    insertBridgeTx('tx-complete', 'PENDING', metadata);

    const tracker = createMockTracker({
      checkStatus: vi.fn().mockResolvedValue({
        state: 'COMPLETED',
        details: { destTxHash: '0xabc123' },
      } satisfies AsyncTrackingResult),
    });

    const service = new AsyncPollingService(db);
    service.registerTracker(tracker);
    await service.pollAll();

    const tx = getTx('tx-complete');
    expect(tx.bridge_status).toBe('COMPLETED');
    const updatedMeta = JSON.parse(tx.bridge_metadata as string);
    expect(updatedMeta.destTxHash).toBe('0xabc123');
  });

  it('FAILED result updates bridge_status to FAILED', async () => {
    const metadata = JSON.stringify({ tracker: 'bridge', pollCount: 0, lastPolledAt: 0 });
    insertBridgeTx('tx-fail', 'PENDING', metadata);

    const tracker = createMockTracker({
      checkStatus: vi.fn().mockResolvedValue({
        state: 'FAILED',
        details: { error: 'Slippage too high' },
      } satisfies AsyncTrackingResult),
    });

    const service = new AsyncPollingService(db);
    service.registerTracker(tracker);
    await service.pollAll();

    const tx = getTx('tx-fail');
    expect(tx.bridge_status).toBe('FAILED');
    const updatedMeta = JSON.parse(tx.bridge_metadata as string);
    expect(updatedMeta.error).toBe('Slippage too high');
  });

  it('PENDING result updates bridge_metadata only (not bridge_status)', async () => {
    const metadata = JSON.stringify({ tracker: 'bridge', pollCount: 0, lastPolledAt: 0 });
    insertBridgeTx('tx-still-pending', 'PENDING', metadata);

    const tracker = createMockTracker({
      checkStatus: vi.fn().mockResolvedValue({
        state: 'PENDING',
        details: { subStatus: 'CHAIN_NOT_SWITCHED' },
      } satisfies AsyncTrackingResult),
    });

    const service = new AsyncPollingService(db);
    service.registerTracker(tracker);
    await service.pollAll();

    const tx = getTx('tx-still-pending');
    expect(tx.bridge_status).toBe('PENDING'); // unchanged
    const updatedMeta = JSON.parse(tx.bridge_metadata as string);
    expect(updatedMeta.pollCount).toBe(1);
    expect(updatedMeta.subStatus).toBe('CHAIN_NOT_SWITCHED');
  });
});

describe('AsyncPollingService: maxAttempts timeout transitions', () => {
  beforeEach(() => resetDb());

  it('BRIDGE_MONITORING transition: resets pollCount and updates bridge_status', async () => {
    // pollCount 240 -> exceeds maxAttempts 240
    const metadata = JSON.stringify({ tracker: 'bridge', pollCount: 240, lastPolledAt: 0 });
    insertBridgeTx('tx-monitor', 'PENDING', metadata);

    const tracker = createMockTracker({
      maxAttempts: 240,
      timeoutTransition: 'BRIDGE_MONITORING',
    });

    const service = new AsyncPollingService(db);
    service.registerTracker(tracker);
    await service.pollAll();

    const tx = getTx('tx-monitor');
    expect(tx.bridge_status).toBe('BRIDGE_MONITORING');
    const updatedMeta = JSON.parse(tx.bridge_metadata as string);
    expect(updatedMeta.pollCount).toBe(0); // reset
    expect(updatedMeta.transitionedAt).toBeGreaterThan(0);
    // checkStatus should NOT have been called (maxAttempts exceeded before checkStatus)
    expect(tracker.checkStatus).not.toHaveBeenCalled();
  });

  it('TIMEOUT transition: marks bridge_status as TIMEOUT (terminal)', async () => {
    const metadata = JSON.stringify({ tracker: 'bridge', pollCount: 50, lastPolledAt: 0 });
    insertBridgeTx('tx-timeout', 'BRIDGE_MONITORING', metadata);

    const tracker = createMockTracker({
      name: 'bridge',
      maxAttempts: 50,
      timeoutTransition: 'TIMEOUT',
    });

    const service = new AsyncPollingService(db);
    service.registerTracker(tracker);
    await service.pollAll();

    const tx = getTx('tx-timeout');
    expect(tx.bridge_status).toBe('TIMEOUT');
  });

  it('CANCELLED transition: marks transaction status as CANCELLED', async () => {
    const metadata = JSON.stringify({ tracker: 'gas-condition', pollCount: 120, lastPolledAt: 0 });
    insertBridgeTx('tx-cancel', null, metadata, { status: 'GAS_WAITING' });

    const tracker = createMockTracker({
      name: 'gas-condition',
      maxAttempts: 120,
      timeoutTransition: 'CANCELLED',
    });

    const service = new AsyncPollingService(db);
    service.registerTracker(tracker);
    await service.pollAll();

    const tx = getTx('tx-cancel');
    expect(tx.status).toBe('CANCELLED');
  });
});

describe('AsyncPollingService: error isolation', () => {
  beforeEach(() => resetDb());

  it('one TX error does not prevent others from processing', async () => {
    const meta1 = JSON.stringify({ tracker: 'bridge', pollCount: 0, lastPolledAt: 0 });
    const meta2 = JSON.stringify({ tracker: 'bridge', pollCount: 0, lastPolledAt: 0 });
    insertBridgeTx('tx-err-1', 'PENDING', meta1);
    insertBridgeTx('tx-err-2', 'PENDING', meta2);

    let callCount = 0;
    const tracker = createMockTracker({
      checkStatus: vi.fn().mockImplementation(async () => {
        callCount++;
        if (callCount === 1) throw new Error('External API timeout');
        return { state: 'PENDING' } satisfies AsyncTrackingResult;
      }),
    });

    const service = new AsyncPollingService(db);
    service.registerTracker(tracker);

    // Suppress console.error for this test
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const result = await service.pollAll();
    consoleSpy.mockRestore();

    expect(result.errors).toBe(1);
    expect(result.polled).toBe(1);
    expect(tracker.checkStatus).toHaveBeenCalledTimes(2);
  });
});

describe('AsyncPollingService: GAS_WAITING and BRIDGE_MONITORING pickup', () => {
  beforeEach(() => resetDb());

  it('picks up GAS_WAITING transactions via gas-condition tracker', async () => {
    const metadata = JSON.stringify({ tracker: 'gas-condition', pollCount: 0, lastPolledAt: 0 });
    insertBridgeTx('tx-gas-wait', null, metadata, { status: 'GAS_WAITING' });

    const tracker = createMockTracker({
      name: 'gas-condition',
      checkStatus: vi.fn().mockResolvedValue({ state: 'PENDING' }),
    });

    const service = new AsyncPollingService(db);
    service.registerTracker(tracker);
    const result = await service.pollAll();

    expect(result.polled).toBe(1);
    expect(tracker.checkStatus).toHaveBeenCalledWith('tx-gas-wait', expect.any(Object));
  });

  it('picks up BRIDGE_MONITORING transactions', async () => {
    const metadata = JSON.stringify({ tracker: 'bridge', pollCount: 0, lastPolledAt: 0 });
    insertBridgeTx('tx-bridge-mon', 'BRIDGE_MONITORING', metadata);

    const tracker = createMockTracker();
    const service = new AsyncPollingService(db);
    service.registerTracker(tracker);
    const result = await service.pollAll();

    expect(result.polled).toBe(1);
    expect(tracker.checkStatus).toHaveBeenCalledWith('tx-bridge-mon', expect.any(Object));
  });

  it('resolveTrackerName returns gas-condition for GAS_WAITING status', async () => {
    // GAS_WAITING TX with no tracker in metadata should be resolved to 'gas-condition'
    insertBridgeTx('tx-gas-resolve', null, '{}', { status: 'GAS_WAITING' });

    const tracker = createMockTracker({
      name: 'gas-condition',
      checkStatus: vi.fn().mockResolvedValue({ state: 'PENDING' }),
    });

    const service = new AsyncPollingService(db);
    service.registerTracker(tracker);
    const result = await service.pollAll();

    expect(result.polled).toBe(1);
    expect(tracker.checkStatus).toHaveBeenCalled();
  });

  it('resolveTrackerName defaults to bridge when no tracker in metadata', async () => {
    // PENDING bridge TX with no tracker field in metadata
    insertBridgeTx('tx-default-bridge', 'PENDING', '{}');

    const tracker = createMockTracker({ name: 'bridge' });
    const service = new AsyncPollingService(db);
    service.registerTracker(tracker);
    const result = await service.pollAll();

    expect(result.polled).toBe(1);
    expect(tracker.checkStatus).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Callback tests: notifications + reservation release (DEFI-04)
// ---------------------------------------------------------------------------

describe('AsyncPollingService: callbacks', () => {
  beforeEach(() => resetDb());

  it('emits BRIDGE_COMPLETED and releases reservation on COMPLETED result', async () => {
    const metadata = JSON.stringify({ tracker: 'bridge', pollCount: 0, lastPolledAt: 0 });
    insertBridgeTx('tx-cb-complete', 'PENDING', metadata);

    const emitNotification = vi.fn();
    const releaseReservation = vi.fn();

    const tracker = createMockTracker({
      checkStatus: vi.fn().mockResolvedValue({
        state: 'COMPLETED',
        details: { destTxHash: '0xdest' },
      } satisfies AsyncTrackingResult),
    });

    const service = new AsyncPollingService(db, { emitNotification, releaseReservation });
    service.registerTracker(tracker);
    await service.pollAll();

    expect(emitNotification).toHaveBeenCalledWith(
      'BRIDGE_COMPLETED',
      'w-poll-test',
      expect.objectContaining({ txId: 'tx-cb-complete', destTxHash: '0xdest' }),
    );
    expect(releaseReservation).toHaveBeenCalledWith('tx-cb-complete');
  });

  it('emits BRIDGE_REFUNDED and releases reservation on refunded COMPLETED result', async () => {
    const metadata = JSON.stringify({ tracker: 'bridge', pollCount: 0, lastPolledAt: 0 });
    insertBridgeTx('tx-cb-refund', 'PENDING', metadata);

    const emitNotification = vi.fn();
    const releaseReservation = vi.fn();

    const tracker = createMockTracker({
      checkStatus: vi.fn().mockResolvedValue({
        state: 'COMPLETED',
        details: { refunded: true, substatusMessage: 'Refunded' },
      } satisfies AsyncTrackingResult),
    });

    const service = new AsyncPollingService(db, { emitNotification, releaseReservation });
    service.registerTracker(tracker);
    await service.pollAll();

    // bridge_status should be REFUNDED
    const tx = getTx('tx-cb-refund');
    expect(tx.bridge_status).toBe('REFUNDED');

    expect(emitNotification).toHaveBeenCalledWith(
      'BRIDGE_REFUNDED',
      'w-poll-test',
      expect.objectContaining({ txId: 'tx-cb-refund', refunded: true }),
    );
    expect(releaseReservation).toHaveBeenCalledWith('tx-cb-refund');
  });

  it('emits BRIDGE_FAILED and releases reservation on FAILED result', async () => {
    const metadata = JSON.stringify({ tracker: 'bridge', pollCount: 0, lastPolledAt: 0 });
    insertBridgeTx('tx-cb-fail', 'PENDING', metadata);

    const emitNotification = vi.fn();
    const releaseReservation = vi.fn();

    const tracker = createMockTracker({
      checkStatus: vi.fn().mockResolvedValue({
        state: 'FAILED',
        details: { error: 'Slippage' },
      } satisfies AsyncTrackingResult),
    });

    const service = new AsyncPollingService(db, { emitNotification, releaseReservation });
    service.registerTracker(tracker);
    await service.pollAll();

    expect(emitNotification).toHaveBeenCalledWith(
      'BRIDGE_FAILED',
      'w-poll-test',
      expect.objectContaining({ txId: 'tx-cb-fail', error: 'Slippage' }),
    );
    expect(releaseReservation).toHaveBeenCalledWith('tx-cb-fail');
  });

  it('emits BRIDGE_MONITORING_STARTED on BRIDGE_MONITORING transition (no reservation release)', async () => {
    const metadata = JSON.stringify({ tracker: 'bridge', pollCount: 240, lastPolledAt: 0 });
    insertBridgeTx('tx-cb-monitor', 'PENDING', metadata);

    const emitNotification = vi.fn();
    const releaseReservation = vi.fn();

    const tracker = createMockTracker({
      maxAttempts: 240,
      timeoutTransition: 'BRIDGE_MONITORING',
    });

    const service = new AsyncPollingService(db, { emitNotification, releaseReservation });
    service.registerTracker(tracker);
    await service.pollAll();

    expect(emitNotification).toHaveBeenCalledWith(
      'BRIDGE_MONITORING_STARTED',
      'w-poll-test',
      expect.objectContaining({ txId: 'tx-cb-monitor', tracker: 'bridge-monitoring' }),
    );
    // Reservation NOT released (funds in limbo)
    expect(releaseReservation).not.toHaveBeenCalled();
  });

  it('emits BRIDGE_TIMEOUT on TIMEOUT transition (no reservation release)', async () => {
    const metadata = JSON.stringify({ tracker: 'bridge-monitoring', pollCount: 264, lastPolledAt: 0 });
    insertBridgeTx('tx-cb-timeout', 'BRIDGE_MONITORING', metadata);

    const emitNotification = vi.fn();
    const releaseReservation = vi.fn();

    const tracker = createMockTracker({
      name: 'bridge-monitoring',
      maxAttempts: 264,
      timeoutTransition: 'TIMEOUT',
    });

    const service = new AsyncPollingService(db, { emitNotification, releaseReservation });
    service.registerTracker(tracker);
    await service.pollAll();

    expect(emitNotification).toHaveBeenCalledWith(
      'BRIDGE_TIMEOUT',
      'w-poll-test',
      expect.objectContaining({ txId: 'tx-cb-timeout' }),
    );
    // Reservation NOT released (funds may be in limbo)
    expect(releaseReservation).not.toHaveBeenCalled();
  });

  it('does not call callbacks when not provided', async () => {
    const metadata = JSON.stringify({ tracker: 'bridge', pollCount: 0, lastPolledAt: 0 });
    insertBridgeTx('tx-no-cb', 'PENDING', metadata);

    const tracker = createMockTracker({
      checkStatus: vi.fn().mockResolvedValue({
        state: 'COMPLETED',
        details: { destTxHash: '0xdest' },
      } satisfies AsyncTrackingResult),
    });

    // No callbacks passed — should not throw
    const service = new AsyncPollingService(db);
    service.registerTracker(tracker);
    await expect(service.pollAll()).resolves.toEqual({ polled: 1, skipped: 0, errors: 0 });
  });

  it('BRIDGE_MONITORING transition sets tracker to bridge-monitoring in metadata', async () => {
    const metadata = JSON.stringify({ tracker: 'bridge', pollCount: 240, lastPolledAt: 0 });
    insertBridgeTx('tx-cb-tracker-switch', 'PENDING', metadata);

    const tracker = createMockTracker({
      maxAttempts: 240,
      timeoutTransition: 'BRIDGE_MONITORING',
    });

    const service = new AsyncPollingService(db, { emitNotification: vi.fn(), releaseReservation: vi.fn() });
    service.registerTracker(tracker);
    await service.pollAll();

    const tx = getTx('tx-cb-tracker-switch');
    const updatedMeta = JSON.parse(tx.bridge_metadata as string);
    expect(updatedMeta.tracker).toBe('bridge-monitoring');
    expect(updatedMeta.pollCount).toBe(0);
  });
});
