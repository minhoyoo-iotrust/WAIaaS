/**
 * Coverage tests for incoming-tx-workers.ts
 *
 * Tests:
 * - createConfirmationWorkerHandler: Solana finalized, EVM block confirmations
 * - createRetentionWorkerHandler: retention cleanup
 * - createGapRecoveryHandler: gap recovery with/without subscriber
 * - updateCursor / loadCursor: cursor persistence
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  createConfirmationWorkerHandler,
  createRetentionWorkerHandler,
  createGapRecoveryHandler,
  updateCursor,
  loadCursor,
  EVM_CONFIRMATION_THRESHOLDS,
  DEFAULT_EVM_CONFIRMATIONS,
} from '../services/incoming/incoming-tx-workers.js';

// ---------------------------------------------------------------------------
// Mock SQLite helpers
// ---------------------------------------------------------------------------

function createMockSqlite() {
  const runFn = vi.fn().mockReturnValue({ changes: 0 });
  const getFn = vi.fn().mockReturnValue(undefined);
  const allFn = vi.fn().mockReturnValue([]);
  const stmts = new Map<string, { run: typeof runFn; get: typeof getFn; all: typeof allFn }>();

  const prepareFn = vi.fn((sql: string) => {
    if (!stmts.has(sql)) {
      stmts.set(sql, {
        run: vi.fn().mockReturnValue({ changes: 0 }),
        get: vi.fn().mockReturnValue(undefined),
        all: vi.fn().mockReturnValue([]),
      });
    }
    return stmts.get(sql)!;
  });

  return {
    prepare: prepareFn,
    _stmts: stmts,
    _runFn: runFn,
    _getFn: getFn,
    _allFn: allFn,
  };
}

// ---------------------------------------------------------------------------
// Confirmation Worker
// ---------------------------------------------------------------------------

describe('createConfirmationWorkerHandler', () => {
  it('does nothing when no DETECTED rows exist', async () => {
    const sqlite = createMockSqlite();
    // SELECT ... WHERE status = 'DETECTED' returns empty
    const handler = createConfirmationWorkerHandler({ sqlite: sqlite as any });
    await handler();

    // Only the SELECT should have been prepared
    expect(sqlite.prepare).toHaveBeenCalledTimes(1);
  });

  it('confirms Solana tx when checkSolanaFinalized returns true', async () => {
    const sqlite = createMockSqlite();
    const checkSolanaFinalized = vi.fn().mockResolvedValue(true);

    const handler = createConfirmationWorkerHandler({
      sqlite: sqlite as any,
      checkSolanaFinalized,
    });

    // Make SELECT return a Solana DETECTED row
    const selectStmt = sqlite.prepare('SELECT id, tx_hash, chain, network, block_number FROM incoming_transactions WHERE status = \'DETECTED\'');
    selectStmt.all.mockReturnValueOnce([
      { id: 'itx-1', tx_hash: 'sig123', chain: 'solana', network: 'solana-mainnet', block_number: null },
    ]);

    await handler();

    expect(checkSolanaFinalized).toHaveBeenCalledWith('sig123');
    // UPDATE should have been called
    const updateStmt = sqlite.prepare('UPDATE incoming_transactions SET status = \'CONFIRMED\', confirmed_at = ? WHERE id = ?');
    expect(updateStmt.run).toHaveBeenCalledWith(expect.any(Number), 'itx-1');
  });

  it('does not confirm Solana tx when checkSolanaFinalized returns false', async () => {
    const sqlite = createMockSqlite();
    const checkSolanaFinalized = vi.fn().mockResolvedValue(false);

    const handler = createConfirmationWorkerHandler({
      sqlite: sqlite as any,
      checkSolanaFinalized,
    });

    const selectStmt = sqlite.prepare('SELECT id, tx_hash, chain, network, block_number FROM incoming_transactions WHERE status = \'DETECTED\'');
    selectStmt.all.mockReturnValueOnce([
      { id: 'itx-2', tx_hash: 'sig456', chain: 'solana', network: 'solana-mainnet', block_number: null },
    ]);

    await handler();

    expect(checkSolanaFinalized).toHaveBeenCalledWith('sig456');
    // UPDATE should NOT have been called
    const updateStmt = sqlite.prepare('UPDATE incoming_transactions SET status = \'CONFIRMED\', confirmed_at = ? WHERE id = ?');
    expect(updateStmt.run).not.toHaveBeenCalled();
  });

  it('skips Solana rows when no checkSolanaFinalized callback provided', async () => {
    const sqlite = createMockSqlite();

    const handler = createConfirmationWorkerHandler({ sqlite: sqlite as any });

    const selectStmt = sqlite.prepare('SELECT id, tx_hash, chain, network, block_number FROM incoming_transactions WHERE status = \'DETECTED\'');
    selectStmt.all.mockReturnValueOnce([
      { id: 'itx-3', tx_hash: 'sig789', chain: 'solana', network: 'solana-mainnet', block_number: null },
    ]);

    await handler();

    // No update should have happened
    const updateStmt = sqlite.prepare('UPDATE incoming_transactions SET status = \'CONFIRMED\', confirmed_at = ? WHERE id = ?');
    expect(updateStmt.run).not.toHaveBeenCalled();
  });

  it('confirms EVM tx when confirmations >= threshold', async () => {
    const sqlite = createMockSqlite();
    const getBlockNumber = vi.fn().mockResolvedValue(BigInt(200));

    const handler = createConfirmationWorkerHandler({
      sqlite: sqlite as any,
      getBlockNumber,
    });

    const selectStmt = sqlite.prepare('SELECT id, tx_hash, chain, network, block_number FROM incoming_transactions WHERE status = \'DETECTED\'');
    selectStmt.all.mockReturnValueOnce([
      { id: 'itx-4', tx_hash: '0xabc', chain: 'ethereum', network: 'ethereum-sepolia', block_number: 199 },
    ]);

    await handler();

    // ethereum-sepolia threshold = 1, 200 - 199 = 1 >= 1 -> confirmed
    expect(getBlockNumber).toHaveBeenCalledWith('ethereum', 'ethereum-sepolia');
    const updateStmt = sqlite.prepare('UPDATE incoming_transactions SET status = \'CONFIRMED\', confirmed_at = ? WHERE id = ?');
    expect(updateStmt.run).toHaveBeenCalledWith(expect.any(Number), 'itx-4');
  });

  it('does not confirm EVM tx when confirmations < threshold', async () => {
    const sqlite = createMockSqlite();
    const getBlockNumber = vi.fn().mockResolvedValue(BigInt(105));

    const handler = createConfirmationWorkerHandler({
      sqlite: sqlite as any,
      getBlockNumber,
    });

    const selectStmt = sqlite.prepare('SELECT id, tx_hash, chain, network, block_number FROM incoming_transactions WHERE status = \'DETECTED\'');
    selectStmt.all.mockReturnValueOnce([
      { id: 'itx-5', tx_hash: '0xdef', chain: 'ethereum', network: 'ethereum-mainnet', block_number: 100 },
    ]);

    await handler();

    // ethereum-mainnet threshold = 12, 105 - 100 = 5 < 12 -> not confirmed
    const updateStmt = sqlite.prepare('UPDATE incoming_transactions SET status = \'CONFIRMED\', confirmed_at = ? WHERE id = ?');
    expect(updateStmt.run).not.toHaveBeenCalled();
  });

  it('uses DEFAULT_EVM_CONFIRMATIONS for unknown networks', async () => {
    const sqlite = createMockSqlite();
    const getBlockNumber = vi.fn().mockResolvedValue(BigInt(200));

    const handler = createConfirmationWorkerHandler({
      sqlite: sqlite as any,
      getBlockNumber,
    });

    const selectStmt = sqlite.prepare('SELECT id, tx_hash, chain, network, block_number FROM incoming_transactions WHERE status = \'DETECTED\'');
    selectStmt.all.mockReturnValueOnce([
      { id: 'itx-6', tx_hash: '0xghi', chain: 'ethereum', network: 'unknown-network', block_number: 180 },
    ]);

    await handler();

    // Default threshold = 12, 200 - 180 = 20 >= 12 -> confirmed
    const updateStmt = sqlite.prepare('UPDATE incoming_transactions SET status = \'CONFIRMED\', confirmed_at = ? WHERE id = ?');
    expect(updateStmt.run).toHaveBeenCalledWith(expect.any(Number), 'itx-6');
  });

  it('skips EVM rows without block_number', async () => {
    const sqlite = createMockSqlite();
    const getBlockNumber = vi.fn().mockResolvedValue(BigInt(200));

    const handler = createConfirmationWorkerHandler({
      sqlite: sqlite as any,
      getBlockNumber,
    });

    const selectStmt = sqlite.prepare('SELECT id, tx_hash, chain, network, block_number FROM incoming_transactions WHERE status = \'DETECTED\'');
    selectStmt.all.mockReturnValueOnce([
      { id: 'itx-7', tx_hash: '0xjkl', chain: 'ethereum', network: 'ethereum-mainnet', block_number: null },
    ]);

    await handler();

    // Should skip (block_number is null)
    const updateStmt = sqlite.prepare('UPDATE incoming_transactions SET status = \'CONFIRMED\', confirmed_at = ? WHERE id = ?');
    expect(updateStmt.run).not.toHaveBeenCalled();
  });

  it('caches block numbers per network (avoids redundant RPC calls)', async () => {
    const sqlite = createMockSqlite();
    const getBlockNumber = vi.fn().mockResolvedValue(BigInt(200));

    const handler = createConfirmationWorkerHandler({
      sqlite: sqlite as any,
      getBlockNumber,
    });

    const selectStmt = sqlite.prepare('SELECT id, tx_hash, chain, network, block_number FROM incoming_transactions WHERE status = \'DETECTED\'');
    selectStmt.all.mockReturnValueOnce([
      { id: 'itx-8a', tx_hash: '0x1', chain: 'ethereum', network: 'ethereum-sepolia', block_number: 199 },
      { id: 'itx-8b', tx_hash: '0x2', chain: 'ethereum', network: 'ethereum-sepolia', block_number: 198 },
    ]);

    await handler();

    // Should only call getBlockNumber once for ethereum-sepolia (cached)
    expect(getBlockNumber).toHaveBeenCalledTimes(1);
  });

  it('isolates per-record errors (one failure does not block others)', async () => {
    const sqlite = createMockSqlite();
    const getBlockNumber = vi.fn()
      .mockRejectedValueOnce(new Error('RPC fail'))
      .mockResolvedValueOnce(BigInt(200));

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const handler = createConfirmationWorkerHandler({
      sqlite: sqlite as any,
      getBlockNumber,
    });

    const selectStmt = sqlite.prepare('SELECT id, tx_hash, chain, network, block_number FROM incoming_transactions WHERE status = \'DETECTED\'');
    selectStmt.all.mockReturnValueOnce([
      { id: 'itx-9a', tx_hash: '0xfail', chain: 'ethereum', network: 'ethereum-mainnet', block_number: 100 },
      { id: 'itx-9b', tx_hash: '0xok', chain: 'ethereum', network: 'ethereum-sepolia', block_number: 199 },
    ]);

    await handler();

    // Second row should still be processed
    expect(getBlockNumber).toHaveBeenCalledTimes(2);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('Confirmation check failed'),
      expect.any(Error),
    );

    warnSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// Retention Worker
// ---------------------------------------------------------------------------

describe('createRetentionWorkerHandler', () => {
  it('deletes records older than retention period', async () => {
    const sqlite = createMockSqlite();
    const getRetentionDays = vi.fn().mockReturnValue(30);

    const deleteStmt = sqlite.prepare('DELETE FROM incoming_transactions WHERE detected_at < ?');
    deleteStmt.run.mockReturnValueOnce({ changes: 5 });

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const handler = createRetentionWorkerHandler({
      sqlite: sqlite as any,
      getRetentionDays,
    });

    await handler();

    expect(getRetentionDays).toHaveBeenCalled();
    expect(deleteStmt.run).toHaveBeenCalledWith(expect.any(Number));
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining('deleted 5'),
    );

    logSpy.mockRestore();
  });

  it('does not log when no records deleted', async () => {
    const sqlite = createMockSqlite();
    const getRetentionDays = vi.fn().mockReturnValue(90);

    const deleteStmt = sqlite.prepare('DELETE FROM incoming_transactions WHERE detected_at < ?');
    deleteStmt.run.mockReturnValueOnce({ changes: 0 });

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const handler = createRetentionWorkerHandler({
      sqlite: sqlite as any,
      getRetentionDays,
    });

    await handler();

    expect(logSpy).not.toHaveBeenCalled();

    logSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// Gap Recovery Handler
// ---------------------------------------------------------------------------

describe('createGapRecoveryHandler', () => {
  it('calls pollAll on the matching subscriber', async () => {
    const pollAll = vi.fn().mockResolvedValue(undefined);
    const subscribers = new Map([
      ['solana:solana-mainnet', { subscriber: { pollAll } }],
    ]);

    const handler = createGapRecoveryHandler({ subscribers });

    await handler('solana', 'solana-mainnet', ['w1', 'w2']);

    expect(pollAll).toHaveBeenCalled();
  });

  it('skips gracefully when no subscriber for chain:network', async () => {
    const subscribers = new Map<string, { subscriber: { pollAll?: () => Promise<void> } }>();

    const handler = createGapRecoveryHandler({ subscribers });

    // Should not throw
    await expect(
      handler('solana', 'solana-devnet', ['w1']),
    ).resolves.toBeUndefined();
  });

  it('handles pollAll error gracefully', async () => {
    const pollAll = vi.fn().mockRejectedValue(new Error('poll failed'));
    const subscribers = new Map([
      ['ethereum:ethereum-mainnet', { subscriber: { pollAll } }],
    ]);

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const handler = createGapRecoveryHandler({ subscribers });

    await expect(
      handler('ethereum', 'ethereum-mainnet', ['w1']),
    ).resolves.toBeUndefined();

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('Gap recovery failed'),
      expect.any(Error),
    );

    warnSpy.mockRestore();
  });

  it('skips subscriber without pollAll method', async () => {
    const subscribers = new Map([
      ['solana:solana-mainnet', { subscriber: {} }],
    ]);

    const handler = createGapRecoveryHandler({ subscribers });

    // Should not throw when pollAll is undefined
    await expect(
      handler('solana', 'solana-mainnet', ['w1']),
    ).resolves.toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Cursor utilities
// ---------------------------------------------------------------------------

describe('updateCursor', () => {
  it('stores Solana cursor with last_signature', () => {
    const sqlite = createMockSqlite();

    updateCursor(sqlite as any, 'w1', 'solana', 'solana-mainnet', 'sig-abc');

    const stmt = sqlite.prepare.mock.results[0]!.value;
    expect(stmt.run).toHaveBeenCalledWith(
      'w1',
      'solana',
      'solana-mainnet',
      'sig-abc', // last_signature
      null,      // last_block_number
      expect.any(Number), // updated_at
    );
  });

  it('stores EVM cursor with last_block_number', () => {
    const sqlite = createMockSqlite();

    updateCursor(sqlite as any, 'w2', 'ethereum', 'ethereum-mainnet', '12345');

    const stmt = sqlite.prepare.mock.results[0]!.value;
    expect(stmt.run).toHaveBeenCalledWith(
      'w2',
      'ethereum',
      'ethereum-mainnet',
      null,   // last_signature
      12345,  // last_block_number
      expect.any(Number),
    );
  });
});

describe('loadCursor', () => {
  function createSimpleSqlite(getResult: any = undefined) {
    const getFn = vi.fn().mockReturnValue(getResult);
    return {
      prepare: vi.fn().mockReturnValue({
        get: getFn,
        run: vi.fn(),
        all: vi.fn().mockReturnValue([]),
      }),
      _getFn: getFn,
    };
  }

  it('returns signature for Solana cursor', () => {
    const sqlite = createSimpleSqlite({ last_signature: 'sig-xyz', last_block_number: null });

    const result = loadCursor(sqlite as any, 'w1', 'solana', 'solana-mainnet');
    expect(result).toBe('sig-xyz');
  });

  it('returns block number string for EVM cursor', () => {
    const sqlite = createSimpleSqlite({ last_signature: null, last_block_number: 54321 });

    const result = loadCursor(sqlite as any, 'w2', 'ethereum', 'ethereum-mainnet');
    expect(result).toBe('54321');
  });

  it('returns null when no cursor exists', () => {
    const sqlite = createSimpleSqlite(undefined);

    const result = loadCursor(sqlite as any, 'w3', 'solana', 'solana-mainnet');
    expect(result).toBeNull();
  });

  it('returns null when both fields are null', () => {
    const sqlite = createSimpleSqlite({ last_signature: null, last_block_number: null });

    const result = loadCursor(sqlite as any, 'w4', 'solana', 'solana-mainnet');
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Constants export test
// ---------------------------------------------------------------------------

describe('exported constants', () => {
  it('EVM_CONFIRMATION_THRESHOLDS has correct values', () => {
    expect(EVM_CONFIRMATION_THRESHOLDS['ethereum-mainnet']).toBe(12);
    expect(EVM_CONFIRMATION_THRESHOLDS['ethereum-sepolia']).toBe(1);
    expect(EVM_CONFIRMATION_THRESHOLDS['polygon-mainnet']).toBe(128);
  });

  it('DEFAULT_EVM_CONFIRMATIONS is 12', () => {
    expect(DEFAULT_EVM_CONFIRMATIONS).toBe(12);
  });
});
