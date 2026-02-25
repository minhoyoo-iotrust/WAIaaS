/**
 * Integration tests for gas-condition pipeline flow in AsyncPollingService.
 *
 * Tests cover:
 * 1. Gas-condition COMPLETED: status transitions GAS_WAITING -> PENDING
 * 2. Gas-condition COMPLETED: emits TX_GAS_CONDITION_MET notification
 * 3. Gas-condition COMPLETED: calls resumePipeline callback
 * 4. Gas-condition COMPLETED: does NOT release reservation
 * 5. Gas-condition CANCELLED (timeout): transaction status -> CANCELLED
 * 6. Gas-condition PENDING: only updates bridgeMetadata
 * 7. Gas-condition TIMEOUT via handleTimeout: cancels transaction
 * 8. Settings keys exist in SETTING_DEFINITIONS
 *
 * Uses in-memory SQLite + full schema + AsyncPollingService.
 */

import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import type { Database as DatabaseType } from 'better-sqlite3';
import { createDatabase, pushSchema } from '../infrastructure/database/index.js';
import { AsyncPollingService } from '../services/async-polling-service.js';
import type { IAsyncStatusTracker, AsyncTrackingResult } from '@waiaas/actions';
import { SETTING_DEFINITIONS, getSettingDefinition } from '../infrastructure/settings/setting-keys.js';

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

function insertTestWallet(walletId: string = 'w-gas-test'): void {
  const ts = nowTs();
  sqlite.prepare(
    `INSERT OR IGNORE INTO wallets (id, name, chain, environment, public_key, status, created_at, updated_at)
     VALUES (?, 'gas-test', 'ethereum', 'testnet', ?, 'ACTIVE', ?, ?)`,
  ).run(walletId, `pk-${walletId}`, ts, ts);
}

function insertGasWaitingTx(
  txId: string,
  bridgeMetadata: string = '{}',
  walletId: string = 'w-gas-test',
): void {
  const ts = nowTs();
  insertTestWallet(walletId);
  sqlite.prepare(
    `INSERT INTO transactions (id, wallet_id, chain, type, status, created_at, bridge_metadata, amount, to_address)
     VALUES (?, ?, 'ethereum', 'TRANSFER', 'GAS_WAITING', ?, ?, '1000000000', '0x1234567890123456789012345678901234567890')`,
  ).run(txId, walletId, ts, bridgeMetadata);
}

function getTx(txId: string): Record<string, unknown> {
  return sqlite.prepare('SELECT * FROM transactions WHERE id = ?').get(txId) as Record<string, unknown>;
}

function createGasConditionTracker(checkStatusResult: AsyncTrackingResult): IAsyncStatusTracker {
  return {
    name: 'gas-condition',
    maxAttempts: 7200,
    pollIntervalMs: 30_000,
    timeoutTransition: 'CANCELLED' as const,
    checkStatus: vi.fn().mockResolvedValue(checkStatusResult),
  };
}

// ---------------------------------------------------------------------------
// Tests: Gas-condition COMPLETED handling
// ---------------------------------------------------------------------------

describe('AsyncPollingService: gas-condition COMPLETED', () => {
  beforeEach(() => resetDb());

  it('transitions status from GAS_WAITING to PENDING on gas-condition COMPLETED', async () => {
    const metadata = JSON.stringify({
      tracker: 'gas-condition',
      pollCount: 0,
      lastPolledAt: 0,
      gasCondition: { maxGasPrice: '50000000000', timeout: 3600 },
      gasConditionCreatedAt: Date.now(),
    });
    insertGasWaitingTx('tx-gas-met', metadata);

    const tracker = createGasConditionTracker({
      state: 'COMPLETED',
      details: {
        reason: 'condition-met',
        currentGasPrice: '10000000000',
        notificationEvent: 'TX_GAS_CONDITION_MET',
      },
    });

    const service = new AsyncPollingService(db, {
      emitNotification: vi.fn(),
      resumePipeline: vi.fn(),
    });
    service.registerTracker(tracker);
    await service.pollAll();

    const tx = getTx('tx-gas-met');
    expect(tx.status).toBe('PENDING'); // GAS_WAITING -> PENDING
  });

  it('emits TX_GAS_CONDITION_MET notification', async () => {
    const metadata = JSON.stringify({
      tracker: 'gas-condition',
      pollCount: 0,
      lastPolledAt: 0,
      gasCondition: { maxGasPrice: '50000000000' },
      gasConditionCreatedAt: Date.now(),
    });
    insertGasWaitingTx('tx-gas-notif', metadata);

    const emitNotification = vi.fn();
    const tracker = createGasConditionTracker({
      state: 'COMPLETED',
      details: {
        notificationEvent: 'TX_GAS_CONDITION_MET',
        currentGasPrice: '10000000000',
      },
    });

    const service = new AsyncPollingService(db, {
      emitNotification,
      resumePipeline: vi.fn(),
    });
    service.registerTracker(tracker);
    await service.pollAll();

    expect(emitNotification).toHaveBeenCalledWith(
      'TX_GAS_CONDITION_MET',
      'w-gas-test',
      expect.objectContaining({
        txId: 'tx-gas-notif',
        notificationEvent: 'TX_GAS_CONDITION_MET',
        currentGasPrice: '10000000000',
      }),
    );
  });

  it('calls resumePipeline callback with txId and walletId', async () => {
    const metadata = JSON.stringify({
      tracker: 'gas-condition',
      pollCount: 0,
      lastPolledAt: 0,
      gasCondition: { maxGasPrice: '50000000000' },
      gasConditionCreatedAt: Date.now(),
    });
    insertGasWaitingTx('tx-gas-resume', metadata);

    const resumePipeline = vi.fn();
    const tracker = createGasConditionTracker({
      state: 'COMPLETED',
      details: { notificationEvent: 'TX_GAS_CONDITION_MET' },
    });

    const service = new AsyncPollingService(db, {
      emitNotification: vi.fn(),
      resumePipeline,
    });
    service.registerTracker(tracker);
    await service.pollAll();

    expect(resumePipeline).toHaveBeenCalledWith('tx-gas-resume', 'w-gas-test');
  });

  it('does NOT release reservation on gas-condition COMPLETED', async () => {
    const metadata = JSON.stringify({
      tracker: 'gas-condition',
      pollCount: 0,
      lastPolledAt: 0,
      gasCondition: { maxGasPrice: '50000000000' },
      gasConditionCreatedAt: Date.now(),
    });
    insertGasWaitingTx('tx-gas-no-release', metadata);

    const releaseReservation = vi.fn();
    const tracker = createGasConditionTracker({
      state: 'COMPLETED',
      details: { notificationEvent: 'TX_GAS_CONDITION_MET' },
    });

    const service = new AsyncPollingService(db, {
      emitNotification: vi.fn(),
      releaseReservation,
      resumePipeline: vi.fn(),
    });
    service.registerTracker(tracker);
    await service.pollAll();

    // Reservation should NOT be released (funds still needed for execution)
    expect(releaseReservation).not.toHaveBeenCalled();
  });

  it('does not set bridge_status for gas-condition COMPLETED', async () => {
    const metadata = JSON.stringify({
      tracker: 'gas-condition',
      pollCount: 0,
      lastPolledAt: 0,
      gasCondition: { maxGasPrice: '50000000000' },
      gasConditionCreatedAt: Date.now(),
    });
    insertGasWaitingTx('tx-gas-no-bridge', metadata);

    const tracker = createGasConditionTracker({
      state: 'COMPLETED',
      details: { notificationEvent: 'TX_GAS_CONDITION_MET' },
    });

    const service = new AsyncPollingService(db, {
      emitNotification: vi.fn(),
      resumePipeline: vi.fn(),
    });
    service.registerTracker(tracker);
    await service.pollAll();

    const tx = getTx('tx-gas-no-bridge');
    // bridge_status should remain null (gas-condition does not use bridge_status)
    expect(tx.bridge_status).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Tests: Gas-condition PENDING and TIMEOUT
// ---------------------------------------------------------------------------

describe('AsyncPollingService: gas-condition PENDING', () => {
  beforeEach(() => resetDb());

  it('updates only bridgeMetadata on PENDING result', async () => {
    const metadata = JSON.stringify({
      tracker: 'gas-condition',
      pollCount: 0,
      lastPolledAt: 0,
      gasCondition: { maxGasPrice: '10000000000' },
      gasConditionCreatedAt: Date.now(),
    });
    insertGasWaitingTx('tx-gas-pending', metadata);

    const tracker = createGasConditionTracker({
      state: 'PENDING',
      details: { currentGasPrice: '50000000000' },
    });

    const service = new AsyncPollingService(db, { emitNotification: vi.fn() });
    service.registerTracker(tracker);
    await service.pollAll();

    const tx = getTx('tx-gas-pending');
    expect(tx.status).toBe('GAS_WAITING'); // unchanged
    const updatedMeta = JSON.parse(tx.bridge_metadata as string);
    expect(updatedMeta.pollCount).toBe(1);
    expect(updatedMeta.currentGasPrice).toBe('50000000000');
  });
});

describe('AsyncPollingService: gas-condition CANCELLED (maxAttempts timeout)', () => {
  beforeEach(() => resetDb());

  it('cancels transaction when maxAttempts exceeded', async () => {
    const metadata = JSON.stringify({
      tracker: 'gas-condition',
      pollCount: 7200, // exceeds maxAttempts
      lastPolledAt: 0,
      gasCondition: { maxGasPrice: '10000000000' },
      gasConditionCreatedAt: Date.now(),
    });
    insertGasWaitingTx('tx-gas-cancel', metadata);

    const tracker = createGasConditionTracker({
      state: 'PENDING', // won't be called because maxAttempts exceeded
    });

    const emitNotification = vi.fn();
    const service = new AsyncPollingService(db, { emitNotification });
    service.registerTracker(tracker);
    await service.pollAll();

    const tx = getTx('tx-gas-cancel');
    expect(tx.status).toBe('CANCELLED');

    // checkStatus should NOT have been called (maxAttempts exceeded)
    expect(tracker.checkStatus).not.toHaveBeenCalled();

    // TX_CANCELLED notification emitted
    expect(emitNotification).toHaveBeenCalledWith('TX_CANCELLED', 'w-gas-test', expect.objectContaining({
      txId: 'tx-gas-cancel',
      reason: 'gas-condition-timeout',
      tracker: 'gas-condition',
    }));
  });
});

describe('AsyncPollingService: gas-condition TIMEOUT result', () => {
  beforeEach(() => resetDb());

  it('delegates TIMEOUT result to handleTimeout (CANCELLED)', async () => {
    const metadata = JSON.stringify({
      tracker: 'gas-condition',
      pollCount: 0,
      lastPolledAt: 0,
      gasCondition: { maxGasPrice: '10000000000', timeout: 100 },
      gasConditionCreatedAt: Date.now() - 200_000, // 200s ago
    });
    insertGasWaitingTx('tx-gas-timeout-result', metadata);

    // The tracker returns TIMEOUT (detected by checkStatus internal timeout logic)
    const tracker = createGasConditionTracker({
      state: 'TIMEOUT',
      details: { reason: 'timeout' },
    });

    const emitNotification = vi.fn();
    const service = new AsyncPollingService(db, { emitNotification });
    service.registerTracker(tracker);
    await service.pollAll();

    const tx = getTx('tx-gas-timeout-result');
    // timeoutTransition = 'CANCELLED' -> status should be CANCELLED
    expect(tx.status).toBe('CANCELLED');

    // TX_CANCELLED notification emitted on TIMEOUT -> CANCELLED
    expect(emitNotification).toHaveBeenCalledWith('TX_CANCELLED', 'w-gas-test', expect.objectContaining({
      txId: 'tx-gas-timeout-result',
      reason: 'gas-condition-timeout',
      tracker: 'gas-condition',
    }));
  });
});

// ---------------------------------------------------------------------------
// Tests: Settings keys validation
// ---------------------------------------------------------------------------

describe('gas_condition settings keys', () => {
  it('gas_condition.enabled exists with default true', () => {
    const def = getSettingDefinition('gas_condition.enabled');
    expect(def).toBeDefined();
    expect(def!.category).toBe('gas_condition');
    expect(def!.defaultValue).toBe('true');
    expect(def!.isCredential).toBe(false);
  });

  it('gas_condition.poll_interval_sec exists with default 30', () => {
    const def = getSettingDefinition('gas_condition.poll_interval_sec');
    expect(def).toBeDefined();
    expect(def!.defaultValue).toBe('30');
  });

  it('gas_condition.default_timeout_sec exists with default 3600', () => {
    const def = getSettingDefinition('gas_condition.default_timeout_sec');
    expect(def).toBeDefined();
    expect(def!.defaultValue).toBe('3600');
  });

  it('gas_condition.max_timeout_sec exists with default 86400', () => {
    const def = getSettingDefinition('gas_condition.max_timeout_sec');
    expect(def).toBeDefined();
    expect(def!.defaultValue).toBe('86400');
  });

  it('gas_condition.max_pending_count exists with default 100', () => {
    const def = getSettingDefinition('gas_condition.max_pending_count');
    expect(def).toBeDefined();
    expect(def!.defaultValue).toBe('100');
  });

  it('all 5 gas_condition keys exist in SETTING_DEFINITIONS', () => {
    const gasConditionDefs = SETTING_DEFINITIONS.filter(
      (d) => d.category === 'gas_condition',
    );
    expect(gasConditionDefs.length).toBe(5);
  });
});
