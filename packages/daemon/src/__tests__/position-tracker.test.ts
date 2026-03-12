/**
 * Unit tests for PositionTracker.
 *
 * Tests: provider registration, timer lifecycle, syncCategory, overlap prevention,
 * per-wallet error isolation, on-demand sync, category filtering.
 * @see LEND-03, LEND-04
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PositionTracker } from '../services/defi/position-tracker.js';
import { createDatabase, pushSchema } from '../infrastructure/database/index.js';
import type { IPositionProvider, PositionUpdate, PositionCategory } from '@waiaas/core';
import type { Database as DatabaseType } from 'better-sqlite3';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeMockProvider(overrides: Partial<{
  name: string;
  categories: PositionCategory[];
  getPositions: IPositionProvider['getPositions'];
}> = {}): IPositionProvider {
  return {
    getProviderName: () => overrides.name ?? 'mock_provider',
    getSupportedCategories: () => overrides.categories ?? (['LENDING'] as PositionCategory[]),
    getPositions: overrides.getPositions ?? vi.fn().mockResolvedValue([{
      walletId: 'wallet-1',
      category: 'LENDING' as PositionCategory,
      provider: overrides.name ?? 'mock_provider',
      chain: 'ethereum',
      network: 'ethereum-mainnet',
      assetId: '0xtoken',
      amount: '100.0',
      amountUsd: 100,
      metadata: { healthFactor: 1.5 },
      status: 'ACTIVE',
      openedAt: Math.floor(Date.now() / 1000),
      closedAt: null,
    }] as PositionUpdate[]),
  };
}

function insertTestWallet(sqlite: DatabaseType, walletId: string): void {
  sqlite
    .prepare(
      "INSERT INTO wallets (id, name, chain, environment, public_key, status, created_at, updated_at) VALUES (?, 'test', 'ethereum', 'testnet', ?, 'ACTIVE', 0, 0)",
    )
    .run(walletId, `pk-${walletId}`);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('PositionTracker', () => {
  let sqlite: DatabaseType;
  let tracker: PositionTracker;

  beforeEach(() => {
    const conn = createDatabase(':memory:');
    sqlite = conn.sqlite;
    pushSchema(sqlite);
    insertTestWallet(sqlite, 'wallet-1');
    insertTestWallet(sqlite, 'wallet-2');

    tracker = new PositionTracker({ sqlite });

    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    tracker.stop();
    sqlite.close();
  });

  it('registers and unregisters providers', () => {
    const provider = makeMockProvider();
    tracker.registerProvider(provider);
    expect(tracker.providerCount).toBe(1);

    tracker.unregisterProvider('mock_provider');
    expect(tracker.providerCount).toBe(0);
  });

  it('starts with per-category timers', () => {
    const setIntervalSpy = vi.spyOn(global, 'setInterval');
    tracker.start();
    // 4 categories = 4 timers
    expect(setIntervalSpy).toHaveBeenCalledTimes(4);
    setIntervalSpy.mockRestore();
  });

  it('stop clears all timers', () => {
    const clearIntervalSpy = vi.spyOn(global, 'clearInterval');
    tracker.start();
    tracker.stop();
    // 4 timers cleared
    expect(clearIntervalSpy).toHaveBeenCalledTimes(4);
    clearIntervalSpy.mockRestore();
  });

  it('syncCategory fetches from providers and flushes to DB', async () => {
    const provider = makeMockProvider();
    tracker.registerProvider(provider);

    await tracker.syncCategory('LENDING');

    const rows = sqlite.prepare('SELECT * FROM defi_positions').all();
    // 2 wallets * 1 position each = 2 (but same assetId, provider, category so dedup per wallet)
    expect(rows.length).toBeGreaterThanOrEqual(1);
    expect(provider.getPositions).toHaveBeenCalled();
  });

  it('prevents overlap for same category', async () => {
    vi.useRealTimers(); // real timers for promise-based overlap test

    // Create a slow provider using a deferred promise
    let resolveFirst!: (v: PositionUpdate[]) => void;
    const firstCallPromise = new Promise<PositionUpdate[]>((r) => {
      resolveFirst = r;
    });

    const getPositionsFn = vi.fn()
      .mockReturnValueOnce(firstCallPromise) // first wallet, first sync -- blocks
      .mockResolvedValue([]); // any subsequent call

    const slowProvider = makeMockProvider({ getPositions: getPositionsFn });
    tracker.registerProvider(slowProvider);

    // Start first sync (will block on first wallet)
    const firstSync = tracker.syncCategory('LENDING');

    // Allow the first sync to start (microtask)
    await new Promise<void>((r) => setTimeout(r, 10));

    // Start second sync while first is running (should be skipped due to overlap)
    const secondSync = tracker.syncCategory('LENDING');
    await secondSync; // resolves immediately (skipped)

    // Only 1 call so far (first wallet of first sync)
    expect(getPositionsFn).toHaveBeenCalledTimes(1);

    // Resolve the first sync
    resolveFirst([]);
    await firstSync;

    // After first sync completes: wallet-1 resolved + wallet-2 called
    expect(getPositionsFn).toHaveBeenCalledTimes(2);

    vi.useFakeTimers(); // restore for afterEach
  });

  it('isolates per-wallet errors', async () => {
    let _callCount = 0;
    const errorProvider = makeMockProvider({
      getPositions: vi.fn().mockImplementation((walletId: string) => {
        _callCount++;
        if (walletId === 'wallet-1') {
          throw new Error('RPC error');
        }
        return Promise.resolve([{
          walletId,
          category: 'LENDING' as PositionCategory,
          provider: 'mock_provider',
          chain: 'ethereum',
          network: 'ethereum-mainnet',
          assetId: '0xtoken',
          amount: '200.0',
          amountUsd: 200,
          metadata: {},
          status: 'ACTIVE',
          openedAt: Math.floor(Date.now() / 1000),
          closedAt: null,
        }] as PositionUpdate[]);
      }),
    });
    tracker.registerProvider(errorProvider);

    await tracker.syncCategory('LENDING');

    // wallet-2 should still have synced despite wallet-1 failing
    const rows = sqlite.prepare("SELECT * FROM defi_positions WHERE wallet_id = 'wallet-2'").all();
    expect(rows).toHaveLength(1);
  });

  it('syncCategory is callable on-demand', async () => {
    const provider = makeMockProvider();
    tracker.registerProvider(provider);

    // Call directly without start()
    await tracker.syncCategory('LENDING');

    expect(provider.getPositions).toHaveBeenCalled();
    const rows = sqlite.prepare('SELECT * FROM defi_positions').all();
    expect(rows.length).toBeGreaterThanOrEqual(1);
  });

  it('filters providers by supported categories', async () => {
    const lendingProvider = makeMockProvider({ categories: ['LENDING'] });
    tracker.registerProvider(lendingProvider);

    // Sync YIELD -- provider only supports LENDING
    await tracker.syncCategory('YIELD');

    expect(lendingProvider.getPositions).not.toHaveBeenCalled();
  });

  it('starts immediate sync for LENDING on start()', () => {
    const provider = makeMockProvider();
    tracker.registerProvider(provider);

    tracker.start();

    // getPositions should have been called immediately for LENDING
    expect(provider.getPositions).toHaveBeenCalled();
  });

  it('queueSize returns write queue size', () => {
    expect(tracker.queueSize).toBe(0);
  });

  it('uses settingsService to override LENDING interval when available', () => {
    const mockSettingsService = {
      get: vi.fn().mockReturnValue('60'),
    } as any;
    
    const trackerWithSettings = new PositionTracker({
      sqlite,
      settingsService: mockSettingsService,
    });
    
    const setIntervalSpy = vi.spyOn(global, 'setInterval');
    trackerWithSettings.start();
    
    // Should have called settingsService.get for LENDING interval
    expect(mockSettingsService.get).toHaveBeenCalledWith('actions.aave_v3_position_sync_interval_sec');
    
    // The LENDING interval should be 60 * 1000 = 60000ms
    const lendingCall = setIntervalSpy.mock.calls.find(call => call[1] === 60000);
    expect(lendingCall).toBeDefined();
    
    setIntervalSpy.mockRestore();
    trackerWithSettings.stop();
  });

  it('falls back to default interval when settingsService throws', () => {
    const mockSettingsService = {
      get: vi.fn().mockImplementation(() => { throw new Error('Unknown key'); }),
    } as any;
    
    const trackerWithSettings = new PositionTracker({
      sqlite,
      settingsService: mockSettingsService,
    });
    
    const setIntervalSpy = vi.spyOn(global, 'setInterval');
    trackerWithSettings.start();
    
    // Should still start with 4 timers despite error
    expect(setIntervalSpy).toHaveBeenCalledTimes(4);
    
    // LENDING should use default 300000ms (5 min)
    const lendingCall = setIntervalSpy.mock.calls.find(call => call[1] === 300_000);
    expect(lendingCall).toBeDefined();
    
    setIntervalSpy.mockRestore();
    trackerWithSettings.stop();
  });

  it('uses default interval when settingsService returns invalid number', () => {
    const mockSettingsService = {
      get: vi.fn().mockReturnValue('not-a-number'),
    } as any;

    const trackerWithSettings = new PositionTracker({
      sqlite,
      settingsService: mockSettingsService,
    });

    const setIntervalSpy = vi.spyOn(global, 'setInterval');
    trackerWithSettings.start();

    // LENDING should use default 300000ms since parsed value is NaN
    const lendingCall = setIntervalSpy.mock.calls.find(call => call[1] === 300_000);
    expect(lendingCall).toBeDefined();

    setIntervalSpy.mockRestore();
    trackerWithSettings.stop();
  });

  // -------------------------------------------------------------------------
  // STAKING category tests
  // -------------------------------------------------------------------------

  describe('STAKING category', () => {
    it('syncCategory(STAKING) fetches from STAKING providers and writes to DB', async () => {
      const stakingProvider = makeMockProvider({
        name: 'lido_staking',
        categories: ['STAKING'],
        getPositions: vi.fn().mockResolvedValue([{
          walletId: 'wallet-1',
          category: 'STAKING' as PositionCategory,
          provider: 'lido_staking',
          chain: 'ethereum',
          network: 'ethereum-mainnet',
          assetId: 'eip155:1/erc20:0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84',
          amount: '1.5',
          amountUsd: 2800,
          metadata: { token: 'stETH', underlyingAmount: '1.5' },
          status: 'ACTIVE',
          openedAt: Math.floor(Date.now() / 1000),
        }] as PositionUpdate[]),
      });

      tracker.registerProvider(stakingProvider);
      await tracker.syncCategory('STAKING');

      expect(stakingProvider.getPositions).toHaveBeenCalled();
      const rows = sqlite.prepare("SELECT * FROM defi_positions WHERE provider = 'lido_staking'").all();
      expect(rows.length).toBeGreaterThanOrEqual(1);
    });

    it('multiple STAKING providers synced together', async () => {
      const lidoProvider = makeMockProvider({
        name: 'lido_staking',
        categories: ['STAKING'],
        getPositions: vi.fn().mockResolvedValue([{
          walletId: 'wallet-1',
          category: 'STAKING' as PositionCategory,
          provider: 'lido_staking',
          chain: 'ethereum',
          network: 'ethereum-mainnet',
          assetId: 'eip155:1/erc20:0xsteth',
          amount: '1.0',
          amountUsd: 1800,
          metadata: { token: 'stETH' },
          status: 'ACTIVE',
          openedAt: Math.floor(Date.now() / 1000),
        }] as PositionUpdate[]),
      });

      const jitoProvider = makeMockProvider({
        name: 'jito_staking',
        categories: ['STAKING'],
        getPositions: vi.fn().mockResolvedValue([{
          walletId: 'wallet-1',
          category: 'STAKING' as PositionCategory,
          provider: 'jito_staking',
          chain: 'solana',
          network: 'solana-mainnet',
          assetId: 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp/token:jitoSOL',
          amount: '5.0',
          amountUsd: 900,
          metadata: { token: 'jitoSOL' },
          status: 'ACTIVE',
          openedAt: Math.floor(Date.now() / 1000),
        }] as PositionUpdate[]),
      });

      tracker.registerProvider(lidoProvider);
      tracker.registerProvider(jitoProvider);
      await tracker.syncCategory('STAKING');

      expect(lidoProvider.getPositions).toHaveBeenCalled();
      expect(jitoProvider.getPositions).toHaveBeenCalled();
    });

    it('STAKING provider not called for LENDING sync', async () => {
      const stakingProvider = makeMockProvider({
        name: 'lido_staking',
        categories: ['STAKING'],
      });

      tracker.registerProvider(stakingProvider);
      await tracker.syncCategory('LENDING');

      expect(stakingProvider.getPositions).not.toHaveBeenCalled();
    });

    it('duck-type detection compatible (plain object accepted by registerProvider)', () => {
      const duckProvider = {
        getPositions: vi.fn().mockResolvedValue([]),
        getProviderName: () => 'duck_staking',
        getSupportedCategories: () => ['STAKING'] as PositionCategory[],
      };

      tracker.registerProvider(duckProvider as unknown as IPositionProvider);
      expect(tracker.providerCount).toBe(1);
    });
  });
});
