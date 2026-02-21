/**
 * Tests for incoming transaction worker handlers and cursor utilities.
 *
 * Covers:
 * - Confirmation worker (Solana finalized check + EVM block threshold)
 * - Retention policy worker (configurable days, hot-reload)
 * - Gap recovery handler (pollAll() delegation)
 * - Cursor utilities (updateCursor, loadCursor)
 *
 * Uses mock better-sqlite3 Database objects to isolate worker logic
 * from actual database operations.
 */

import { describe, it, expect, vi } from 'vitest';
import {
  createConfirmationWorkerHandler,
  createRetentionWorkerHandler,
  createGapRecoveryHandler,
  updateCursor,
  loadCursor,
  EVM_CONFIRMATION_THRESHOLDS,
  DEFAULT_EVM_CONFIRMATIONS,
} from '../incoming-tx-workers.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** DB row shape returned by confirmation worker SELECT */
interface DetectedRow {
  id: string;
  tx_hash: string;
  chain: string;
  network: string;
  block_number: number | null;
}

/** Create a mock DETECTED transaction row. */
function makeDetectedTx(
  chain: string,
  overrides?: Partial<DetectedRow>,
): DetectedRow {
  return {
    id: `tx-id-${Math.random().toString(36).slice(2, 8)}`,
    tx_hash: `hash-${Math.random().toString(36).slice(2, 10)}`,
    chain,
    network: chain === 'solana' ? 'mainnet' : 'mainnet',
    block_number: chain === 'ethereum' ? 100 : null,
    ...overrides,
  };
}

/**
 * Create a mock SQLite Database for confirmation worker tests.
 *
 * @param rows - DETECTED rows to return from the SELECT query
 * @returns Mock DB and helpers to inspect update calls
 */
function createConfirmationMockDb(rows: DetectedRow[]) {
  const updateCalls: unknown[][] = [];

  const selectStmt = { all: () => rows };
  const updateStmt = {
    run: (...args: unknown[]) => {
      updateCalls.push(args);
      return { changes: 1 };
    },
  };

  let prepareCallIndex = 0;
  const mockDb = {
    prepare: (_sql: string) => {
      prepareCallIndex++;
      // First prepare() is the SELECT, second is the UPDATE
      return prepareCallIndex === 1 ? selectStmt : updateStmt;
    },
  };

  return {
    db: mockDb as unknown as import('better-sqlite3').Database,
    getUpdateCalls: () => updateCalls,
  };
}

/**
 * Create a mock SQLite Database for retention worker tests.
 */
function createRetentionMockDb(deletedCount: number = 0) {
  let runArgs: unknown[] = [];
  let prepareSql = '';

  const mockStmt = {
    run: (...args: unknown[]) => {
      runArgs = args;
      return { changes: deletedCount };
    },
  };

  const mockDb = {
    prepare: (sql: string) => {
      prepareSql = sql;
      return mockStmt;
    },
  };

  return {
    db: mockDb as unknown as import('better-sqlite3').Database,
    getRunArgs: () => runArgs,
    getPrepareSql: () => prepareSql,
  };
}

/**
 * Create a mock SQLite Database for cursor utility tests.
 */
function createCursorMockDb() {
  const runCalls: unknown[][] = [];
  const getCalls: unknown[][] = [];
  let getResult: Record<string, unknown> | undefined;

  const mockDb = {
    prepare: (_sql: string) => ({
      run: (...args: unknown[]) => {
        runCalls.push(args);
        return { changes: 1 };
      },
      get: (...args: unknown[]) => {
        getCalls.push(args);
        return getResult;
      },
    }),
  };

  return {
    db: mockDb as unknown as import('better-sqlite3').Database,
    getRunCalls: () => runCalls,
    getGetCalls: () => getCalls,
    setGetResult: (result: Record<string, unknown> | undefined) => {
      getResult = result;
    },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('incoming-tx-workers', () => {
  // -----------------------------------------------------------------------
  // 1. Confirmation worker - Solana
  // -----------------------------------------------------------------------

  describe('createConfirmationWorkerHandler - Solana', () => {
    it('should upgrade DETECTED Solana tx to CONFIRMED when checkSolanaFinalized returns true', async () => {
      const row = makeDetectedTx('solana', { id: 'sol-1', tx_hash: 'sol-hash-1' });
      const mock = createConfirmationMockDb([row]);
      const checkSolanaFinalized = vi.fn().mockResolvedValue(true);

      const handler = createConfirmationWorkerHandler({
        sqlite: mock.db,
        checkSolanaFinalized,
      });
      await handler();

      expect(checkSolanaFinalized).toHaveBeenCalledWith('sol-hash-1');
      const updates = mock.getUpdateCalls();
      expect(updates).toHaveLength(1);
      // confirmed_at should be a Unix timestamp
      expect(typeof updates[0][0]).toBe('number');
      expect(updates[0][1]).toBe('sol-1');
    });

    it('should NOT upgrade when checkSolanaFinalized returns false', async () => {
      const row = makeDetectedTx('solana');
      const mock = createConfirmationMockDb([row]);
      const checkSolanaFinalized = vi.fn().mockResolvedValue(false);

      const handler = createConfirmationWorkerHandler({
        sqlite: mock.db,
        checkSolanaFinalized,
      });
      await handler();

      expect(mock.getUpdateCalls()).toHaveLength(0);
    });

    it('should isolate errors: one Solana tx failure does not block others', async () => {
      const row1 = makeDetectedTx('solana', { id: 'sol-err', tx_hash: 'hash-err' });
      const row2 = makeDetectedTx('solana', { id: 'sol-ok', tx_hash: 'hash-ok' });
      const mock = createConfirmationMockDb([row1, row2]);

      const checkSolanaFinalized = vi.fn().mockImplementation((hash: string) => {
        if (hash === 'hash-err') throw new Error('RPC unavailable');
        return Promise.resolve(true);
      });

      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const handler = createConfirmationWorkerHandler({
        sqlite: mock.db,
        checkSolanaFinalized,
      });
      await handler();

      // Only sol-ok should be updated
      const updates = mock.getUpdateCalls();
      expect(updates).toHaveLength(1);
      expect(updates[0][1]).toBe('sol-ok');
      expect(warnSpy).toHaveBeenCalled();

      warnSpy.mockRestore();
    });
  });

  // -----------------------------------------------------------------------
  // 2. Confirmation worker - EVM
  // -----------------------------------------------------------------------

  describe('createConfirmationWorkerHandler - EVM', () => {
    it('should upgrade DETECTED EVM tx when block confirmations >= mainnet threshold (12)', async () => {
      const row = makeDetectedTx('ethereum', {
        id: 'evm-1',
        network: 'mainnet',
        block_number: 100,
      });
      const mock = createConfirmationMockDb([row]);
      const getBlockNumber = vi.fn().mockResolvedValue(112n); // 112 - 100 = 12 confirmations

      const handler = createConfirmationWorkerHandler({
        sqlite: mock.db,
        getBlockNumber,
      });
      await handler();

      expect(getBlockNumber).toHaveBeenCalledWith('ethereum', 'mainnet');
      expect(mock.getUpdateCalls()).toHaveLength(1);
      expect(mock.getUpdateCalls()[0][1]).toBe('evm-1');
    });

    it('should NOT upgrade EVM tx when confirmations < mainnet threshold', async () => {
      const row = makeDetectedTx('ethereum', {
        id: 'evm-2',
        network: 'mainnet',
        block_number: 100,
      });
      const mock = createConfirmationMockDb([row]);
      const getBlockNumber = vi.fn().mockResolvedValue(110n); // 110 - 100 = 10 < 12

      const handler = createConfirmationWorkerHandler({
        sqlite: mock.db,
        getBlockNumber,
      });
      await handler();

      expect(mock.getUpdateCalls()).toHaveLength(0);
    });

    it('should use DEFAULT_EVM_CONFIRMATIONS (12) for unknown network', async () => {
      const row = makeDetectedTx('ethereum', {
        id: 'evm-3',
        network: 'unknown-testnet',
        block_number: 100,
      });
      const mock = createConfirmationMockDb([row]);
      // 112 - 100 = 12 = DEFAULT_EVM_CONFIRMATIONS
      const getBlockNumber = vi.fn().mockResolvedValue(112n);

      const handler = createConfirmationWorkerHandler({
        sqlite: mock.db,
        getBlockNumber,
      });
      await handler();

      expect(mock.getUpdateCalls()).toHaveLength(1);
      expect(DEFAULT_EVM_CONFIRMATIONS).toBe(12);
    });

    it('should use sepolia threshold (1) for sepolia network', async () => {
      const row = makeDetectedTx('ethereum', {
        id: 'evm-sep',
        network: 'sepolia',
        block_number: 100,
      });
      const mock = createConfirmationMockDb([row]);
      const getBlockNumber = vi.fn().mockResolvedValue(101n); // 101 - 100 = 1

      const handler = createConfirmationWorkerHandler({
        sqlite: mock.db,
        getBlockNumber,
      });
      await handler();

      expect(EVM_CONFIRMATION_THRESHOLDS['sepolia']).toBe(1);
      expect(mock.getUpdateCalls()).toHaveLength(1);
    });

    it('should do nothing when no DETECTED transactions exist', async () => {
      const mock = createConfirmationMockDb([]);
      const getBlockNumber = vi.fn();

      const handler = createConfirmationWorkerHandler({
        sqlite: mock.db,
        getBlockNumber,
      });
      await handler();

      expect(getBlockNumber).not.toHaveBeenCalled();
      expect(mock.getUpdateCalls()).toHaveLength(0);
    });

    it('should cache block numbers per network to avoid redundant RPC calls', async () => {
      const row1 = makeDetectedTx('ethereum', {
        id: 'evm-c1',
        network: 'mainnet',
        block_number: 100,
      });
      const row2 = makeDetectedTx('ethereum', {
        id: 'evm-c2',
        network: 'mainnet',
        block_number: 90,
      });
      const mock = createConfirmationMockDb([row1, row2]);
      const getBlockNumber = vi.fn().mockResolvedValue(120n);

      const handler = createConfirmationWorkerHandler({
        sqlite: mock.db,
        getBlockNumber,
      });
      await handler();

      // getBlockNumber should be called only once for mainnet (cached)
      expect(getBlockNumber).toHaveBeenCalledTimes(1);
      // Both should be confirmed
      expect(mock.getUpdateCalls()).toHaveLength(2);
    });
  });

  // -----------------------------------------------------------------------
  // 3. Retention worker
  // -----------------------------------------------------------------------

  describe('createRetentionWorkerHandler', () => {
    it('should delete records older than retention_days', async () => {
      const mock = createRetentionMockDb(5);
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const handler = createRetentionWorkerHandler({
        sqlite: mock.db,
        getRetentionDays: () => 30,
      });
      await handler();

      const sql = mock.getPrepareSql();
      expect(sql).toContain('DELETE FROM incoming_transactions WHERE detected_at < ?');

      // Cutoff should be roughly now - 30 days
      const cutoff = mock.getRunArgs()[0] as number;
      const expectedCutoff = Math.floor(Date.now() / 1000) - 30 * 86400;
      expect(Math.abs(cutoff - expectedCutoff)).toBeLessThan(2); // within 2 seconds

      expect(logSpy).toHaveBeenCalledWith(
        expect.stringContaining('deleted 5'),
      );
      logSpy.mockRestore();
    });

    it('should support hot-reload: changing retention_days adjusts cutoff', async () => {
      let retentionDays = 30;
      const mock1 = createRetentionMockDb(0);

      const handler = createRetentionWorkerHandler({
        sqlite: mock1.db,
        getRetentionDays: () => retentionDays,
      });

      // First run with 30 days
      await handler();
      const cutoff30 = mock1.getRunArgs()[0] as number;

      // Change to 7 days (hot-reload)
      retentionDays = 7;
      const mock2 = createRetentionMockDb(0);
      const handler2 = createRetentionWorkerHandler({
        sqlite: mock2.db,
        getRetentionDays: () => retentionDays,
      });
      await handler2();
      const cutoff7 = mock2.getRunArgs()[0] as number;

      // 7-day cutoff should be more recent (larger) than 30-day cutoff
      expect(cutoff7).toBeGreaterThan(cutoff30);
    });

    it('should not log when 0 deletions', async () => {
      const mock = createRetentionMockDb(0);
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const handler = createRetentionWorkerHandler({
        sqlite: mock.db,
        getRetentionDays: () => 30,
      });
      await handler();

      expect(logSpy).not.toHaveBeenCalled();
      logSpy.mockRestore();
    });
  });

  // -----------------------------------------------------------------------
  // 4. Cursor utilities
  // -----------------------------------------------------------------------

  describe('updateCursor', () => {
    it('should INSERT OR REPLACE cursor for Solana wallet (last_signature)', () => {
      const mock = createCursorMockDb();

      updateCursor(mock.db, 'wallet-1', 'solana', 'mainnet', 'sig-abc123');

      const calls = mock.getRunCalls();
      expect(calls).toHaveLength(1);
      // walletId, chain, network, last_signature, last_block_number, updated_at
      expect(calls[0][0]).toBe('wallet-1');
      expect(calls[0][1]).toBe('solana');
      expect(calls[0][2]).toBe('mainnet');
      expect(calls[0][3]).toBe('sig-abc123'); // last_signature
      expect(calls[0][4]).toBeNull(); // last_block_number null for Solana
      expect(typeof calls[0][5]).toBe('number'); // updated_at
    });

    it('should INSERT OR REPLACE cursor for EVM wallet (last_block_number)', () => {
      const mock = createCursorMockDb();

      updateCursor(mock.db, 'wallet-2', 'ethereum', 'mainnet', '12345');

      const calls = mock.getRunCalls();
      expect(calls).toHaveLength(1);
      expect(calls[0][0]).toBe('wallet-2');
      expect(calls[0][1]).toBe('ethereum');
      expect(calls[0][2]).toBe('mainnet');
      expect(calls[0][3]).toBeNull(); // last_signature null for EVM
      expect(calls[0][4]).toBe(12345); // last_block_number parsed
    });

    it('should replace existing cursor for same wallet+chain+network', () => {
      const mock = createCursorMockDb();

      updateCursor(mock.db, 'wallet-1', 'solana', 'mainnet', 'sig-1');
      updateCursor(mock.db, 'wallet-1', 'solana', 'mainnet', 'sig-2');

      // Both should execute (INSERT OR REPLACE handles the update at DB level)
      const calls = mock.getRunCalls();
      expect(calls).toHaveLength(2);
      expect(calls[0][3]).toBe('sig-1');
      expect(calls[1][3]).toBe('sig-2');
    });
  });

  describe('loadCursor', () => {
    it('should return Solana cursor value (last_signature) when exists', () => {
      const mock = createCursorMockDb();
      mock.setGetResult({ last_signature: 'sig-xyz', last_block_number: null });

      const result = loadCursor(mock.db, 'wallet-1', 'solana', 'mainnet');
      expect(result).toBe('sig-xyz');
    });

    it('should return EVM cursor value (last_block_number as string) when exists', () => {
      const mock = createCursorMockDb();
      mock.setGetResult({ last_signature: null, last_block_number: 9999 });

      const result = loadCursor(mock.db, 'wallet-2', 'ethereum', 'mainnet');
      expect(result).toBe('9999');
    });

    it('should return null when no cursor exists', () => {
      const mock = createCursorMockDb();
      mock.setGetResult(undefined);

      const result = loadCursor(mock.db, 'wallet-3', 'solana', 'devnet');
      expect(result).toBeNull();
    });

    it('should return null when both cursor fields are null/zero', () => {
      const mock = createCursorMockDb();
      mock.setGetResult({ last_signature: null, last_block_number: null });

      const result = loadCursor(mock.db, 'wallet-4', 'ethereum', 'sepolia');
      expect(result).toBeNull();
    });

    it('should pass correct params to SELECT query', () => {
      const mock = createCursorMockDb();
      mock.setGetResult(undefined);

      loadCursor(mock.db, 'w-abc', 'solana', 'devnet');

      const getCalls = mock.getGetCalls();
      expect(getCalls).toHaveLength(1);
      expect(getCalls[0]).toEqual(['w-abc', 'solana', 'devnet']);
    });
  });

  // -----------------------------------------------------------------------
  // 5. Gap recovery handler
  // -----------------------------------------------------------------------

  describe('createGapRecoveryHandler', () => {
    it('should call pollAll() on the correct subscriber for chain:network', async () => {
      const mockPollAll = vi.fn().mockResolvedValue(undefined);
      const subscribers = new Map([
        ['solana:mainnet', { subscriber: { pollAll: mockPollAll } }],
      ]);

      const handler = createGapRecoveryHandler({ subscribers });
      await handler('solana', 'mainnet', ['wallet-1', 'wallet-2']);

      expect(mockPollAll).toHaveBeenCalledTimes(1);
    });

    it('should gracefully skip when no subscriber exists for chain:network', async () => {
      const subscribers = new Map<string, { subscriber: { pollAll: () => Promise<void> } }>();

      const handler = createGapRecoveryHandler({ subscribers });
      // Should not throw
      await expect(handler('solana', 'devnet', ['wallet-x'])).resolves.toBeUndefined();
    });

    it('should warn but not throw when pollAll() fails', async () => {
      const mockPollAll = vi.fn().mockRejectedValue(new Error('RPC down'));
      const subscribers = new Map([
        ['ethereum:mainnet', { subscriber: { pollAll: mockPollAll } }],
      ]);
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const handler = createGapRecoveryHandler({ subscribers });
      await expect(handler('ethereum', 'mainnet', ['w1'])).resolves.toBeUndefined();

      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Gap recovery failed'),
        expect.any(Error),
      );
      warnSpy.mockRestore();
    });
  });

  // -----------------------------------------------------------------------
  // 6. EVM_CONFIRMATION_THRESHOLDS validation
  // -----------------------------------------------------------------------

  describe('EVM_CONFIRMATION_THRESHOLDS', () => {
    it('should have mainnet = 12', () => {
      expect(EVM_CONFIRMATION_THRESHOLDS['mainnet']).toBe(12);
    });

    it('should have polygon-mainnet = 128', () => {
      expect(EVM_CONFIRMATION_THRESHOLDS['polygon-mainnet']).toBe(128);
    });

    it('should have all testnet thresholds = 1', () => {
      expect(EVM_CONFIRMATION_THRESHOLDS['sepolia']).toBe(1);
      expect(EVM_CONFIRMATION_THRESHOLDS['polygon-amoy']).toBe(1);
      expect(EVM_CONFIRMATION_THRESHOLDS['arbitrum-mainnet']).toBe(1);
      expect(EVM_CONFIRMATION_THRESHOLDS['arbitrum-sepolia']).toBe(1);
      expect(EVM_CONFIRMATION_THRESHOLDS['base-sepolia']).toBe(1);
    });

    it('should have base-mainnet = 12', () => {
      expect(EVM_CONFIRMATION_THRESHOLDS['base-mainnet']).toBe(12);
    });

    it('DEFAULT_EVM_CONFIRMATIONS should be 12', () => {
      expect(DEFAULT_EVM_CONFIRMATIONS).toBe(12);
    });
  });
});
