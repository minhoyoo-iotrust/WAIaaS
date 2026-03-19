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
import type { IPositionProvider, PositionUpdate, PositionCategory, PositionQueryContext } from '@waiaas/core';
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
    getPositions: overrides.getPositions ?? vi.fn().mockImplementation((ctx: PositionQueryContext) => Promise.resolve([{
      walletId: ctx.walletId,
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
    }] as PositionUpdate[])),
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
      getPositions: vi.fn().mockImplementation((ctx: PositionQueryContext) => {
        _callCount++;
        if (ctx.walletId === 'wallet-1') {
          throw new Error('RPC error');
        }
        return Promise.resolve([{
          walletId: ctx.walletId,
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

  it('starts immediate sync for all categories on start()', () => {
    const syncSpy = vi.spyOn(tracker, 'syncCategory');
    tracker.start();

    // All 4 categories should receive an immediate sync call
    expect(syncSpy).toHaveBeenCalledWith('LENDING');
    expect(syncSpy).toHaveBeenCalledWith('STAKING');
    expect(syncSpy).toHaveBeenCalledWith('YIELD');
    expect(syncSpy).toHaveBeenCalledWith('PERP');
    expect(syncSpy).toHaveBeenCalledTimes(4);

    syncSpy.mockRestore();
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
  // PositionQueryContext construction tests (Phase 432)
  // -------------------------------------------------------------------------

  it('syncCategory builds PositionQueryContext with correct chain/networks/environment', async () => {
    const capturedContexts: PositionQueryContext[] = [];
    const ctxProvider = makeMockProvider({
      getPositions: vi.fn().mockImplementation((ctx: PositionQueryContext) => {
        capturedContexts.push(ctx);
        return Promise.resolve([]);
      }),
    });
    tracker.registerProvider(ctxProvider);

    await tracker.syncCategory('LENDING');

    // 2 wallets in DB (both ethereum/testnet from insertTestWallet)
    expect(capturedContexts).toHaveLength(2);

    const ctx1 = capturedContexts[0]!;
    expect(ctx1.walletId).toBe('wallet-1');
    expect(ctx1.chain).toBe('ethereum');
    expect(ctx1.environment).toBe('testnet');
    expect(ctx1.networks).toBeDefined();
    expect(ctx1.networks.length).toBeGreaterThan(0);
    expect(ctx1.rpcUrls).toBeDefined();
  });

  it('syncCategory builds PositionQueryContext with rpcUrls from rpcConfig', async () => {
    const trackerWithRpc = new PositionTracker({
      sqlite,
      rpcConfig: { evm_ethereum_sepolia: 'http://localhost:8545' },
    });

    const capturedContexts: PositionQueryContext[] = [];
    const ctxProvider = makeMockProvider({
      getPositions: vi.fn().mockImplementation((ctx: PositionQueryContext) => {
        capturedContexts.push(ctx);
        return Promise.resolve([]);
      }),
    });
    trackerWithRpc.registerProvider(ctxProvider);

    await trackerWithRpc.syncCategory('LENDING');

    const ctx1 = capturedContexts[0]!;
    expect(ctx1.rpcUrls['ethereum-sepolia']).toBe('http://localhost:8545');

    trackerWithRpc.stop();
  });

  it('syncCategory resolves RPC URLs via rpcPool when provided', async () => {
    const mockRpcPool = {
      getUrl: vi.fn().mockImplementation((network: string) => {
        if (network === 'ethereum-sepolia') return 'http://pool-rpc:8545';
        throw new Error('no entry');
      }),
    } as any;

    const mockSettingsService = {
      get: vi.fn().mockReturnValue(''),
    } as any;

    const trackerWithPool = new PositionTracker({
      sqlite,
      settingsService: mockSettingsService,
      rpcPool: mockRpcPool,
    });

    const capturedContexts: PositionQueryContext[] = [];
    const ctxProvider = makeMockProvider({
      getPositions: vi.fn().mockImplementation((ctx: PositionQueryContext) => {
        capturedContexts.push(ctx);
        return Promise.resolve([]);
      }),
    });
    trackerWithPool.registerProvider(ctxProvider);

    await trackerWithPool.syncCategory('LENDING');

    const ctx1 = capturedContexts[0]!;
    expect(ctx1.rpcUrls['ethereum-sepolia']).toBe('http://pool-rpc:8545');

    trackerWithPool.stop();
  });

  it('syncCategory falls back to rpcConfig when rpcPool has no entry', async () => {
    const mockRpcPool = {
      getUrl: vi.fn().mockImplementation(() => {
        throw new Error('no entry');
      }),
    } as any;

    const mockSettingsService = {
      get: vi.fn().mockReturnValue(''),
    } as any;

    const trackerWithPool = new PositionTracker({
      sqlite,
      settingsService: mockSettingsService,
      rpcPool: mockRpcPool,
      rpcConfig: { evm_ethereum_sepolia: 'http://fallback:8545' },
    });

    const capturedContexts: PositionQueryContext[] = [];
    const ctxProvider = makeMockProvider({
      getPositions: vi.fn().mockImplementation((ctx: PositionQueryContext) => {
        capturedContexts.push(ctx);
        return Promise.resolve([]);
      }),
    });
    trackerWithPool.registerProvider(ctxProvider);

    await trackerWithPool.syncCategory('LENDING');

    const ctx1 = capturedContexts[0]!;
    expect(ctx1.rpcUrls['ethereum-sepolia']).toBe('http://fallback:8545');

    trackerWithPool.stop();
  });

  it('syncCategory uses rpcPool over rpcConfig when both are available', async () => {
    const mockRpcPool = {
      getUrl: vi.fn().mockImplementation((network: string) => {
        if (network === 'ethereum-sepolia') return 'http://pool-preferred:8545';
        throw new Error('no entry');
      }),
    } as any;

    const mockSettingsService = {
      get: vi.fn().mockReturnValue(''),
    } as any;

    const trackerWithBoth = new PositionTracker({
      sqlite,
      settingsService: mockSettingsService,
      rpcPool: mockRpcPool,
      rpcConfig: { evm_ethereum_sepolia: 'http://config-fallback:8545' },
    });

    const capturedContexts: PositionQueryContext[] = [];
    const ctxProvider = makeMockProvider({
      getPositions: vi.fn().mockImplementation((ctx: PositionQueryContext) => {
        capturedContexts.push(ctx);
        return Promise.resolve([]);
      }),
    });
    trackerWithBoth.registerProvider(ctxProvider);

    await trackerWithBoth.syncCategory('LENDING');

    const ctx1 = capturedContexts[0]!;
    // rpcPool URL should take precedence
    expect(ctx1.rpcUrls['ethereum-sepolia']).toBe('http://pool-preferred:8545');

    trackerWithBoth.stop();
  });

  it('syncCategory builds solana context for solana wallets', async () => {
    // Insert a solana wallet
    sqlite.prepare(
      "INSERT INTO wallets (id, name, chain, environment, public_key, status, created_at, updated_at) VALUES ('sol-wallet', 'sol-test', 'solana', 'mainnet', 'pk-sol', 'ACTIVE', 0, 0)",
    ).run();

    const capturedContexts: PositionQueryContext[] = [];
    const ctxProvider = makeMockProvider({
      getPositions: vi.fn().mockImplementation((ctx: PositionQueryContext) => {
        capturedContexts.push(ctx);
        return Promise.resolve([]);
      }),
    });
    tracker.registerProvider(ctxProvider);

    await tracker.syncCategory('LENDING');

    // 3 wallets: wallet-1 (eth), wallet-2 (eth), sol-wallet (sol)
    expect(capturedContexts).toHaveLength(3);
    const solCtx = capturedContexts.find((c) => c.walletId === 'sol-wallet')!;
    expect(solCtx.chain).toBe('solana');
    expect(solCtx.environment).toBe('mainnet');
    expect(solCtx.networks).toContain('solana-mainnet');
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

  // -------------------------------------------------------------------------
  // LENDING category tests (Phase 394)
  // -------------------------------------------------------------------------

  describe('LENDING category', () => {
    it('LENDING provider registration via duck-type and sync writes SUPPLY/BORROW to DB', async () => {
      const now = Math.floor(Date.now() / 1000);
      const lendingProvider = makeMockProvider({
        name: 'aave_v3',
        categories: ['LENDING'],
        getPositions: vi.fn().mockResolvedValue([
          {
            walletId: 'wallet-1',
            category: 'LENDING' as PositionCategory,
            provider: 'aave_v3',
            chain: 'ethereum',
            network: 'ethereum-mainnet',
            assetId: 'eip155:1/erc20:0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2',
            amount: '1.0',
            amountUsd: 2000,
            metadata: { positionType: 'SUPPLY', apy: 0.035, healthFactor: 1.65 },
            status: 'ACTIVE',
            openedAt: now,
          },
          {
            walletId: 'wallet-1',
            category: 'LENDING' as PositionCategory,
            provider: 'aave_v3',
            chain: 'ethereum',
            network: 'ethereum-mainnet',
            assetId: 'eip155:1/erc20:0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
            amount: '500.0',
            amountUsd: 500,
            metadata: { positionType: 'BORROW', interestRateMode: 'variable', apy: 0.05, healthFactor: 1.65 },
            status: 'ACTIVE',
            openedAt: now,
          },
        ] as PositionUpdate[]),
      });

      tracker.registerProvider(lendingProvider);
      await tracker.syncCategory('LENDING');

      expect(lendingProvider.getPositions).toHaveBeenCalled();
      const rows = sqlite.prepare("SELECT * FROM defi_positions WHERE provider = 'aave_v3'").all() as any[];
      expect(rows.length).toBeGreaterThanOrEqual(1);

      // Verify metadata with healthFactor is preserved
      const firstRow = rows[0];
      const meta = JSON.parse(firstRow.metadata);
      expect(meta.healthFactor).toBeDefined();
      expect(typeof meta.healthFactor).toBe('number');
    });

    it('LENDING and STAKING providers coexist with category isolation', async () => {
      const lendingProvider = makeMockProvider({
        name: 'aave_v3',
        categories: ['LENDING'],
        getPositions: vi.fn().mockResolvedValue([{
          walletId: 'wallet-1',
          category: 'LENDING' as PositionCategory,
          provider: 'aave_v3',
          chain: 'ethereum',
          network: 'ethereum-mainnet',
          assetId: 'eip155:1/erc20:0xweth',
          amount: '2.0',
          amountUsd: 4000,
          metadata: { positionType: 'SUPPLY', healthFactor: 2.1 },
          status: 'ACTIVE',
          openedAt: Math.floor(Date.now() / 1000),
        }] as PositionUpdate[]),
      });

      const stakingProvider = makeMockProvider({
        name: 'lido_staking',
        categories: ['STAKING'],
        getPositions: vi.fn().mockResolvedValue([{
          walletId: 'wallet-1',
          category: 'STAKING' as PositionCategory,
          provider: 'lido_staking',
          chain: 'ethereum',
          network: 'ethereum-mainnet',
          assetId: 'eip155:1/erc20:0xsteth',
          amount: '3.0',
          amountUsd: 5400,
          metadata: { token: 'stETH' },
          status: 'ACTIVE',
          openedAt: Math.floor(Date.now() / 1000),
        }] as PositionUpdate[]),
      });

      tracker.registerProvider(lendingProvider);
      tracker.registerProvider(stakingProvider);
      expect(tracker.providerCount).toBe(2);

      // Sync LENDING only
      await tracker.syncCategory('LENDING');
      expect(lendingProvider.getPositions).toHaveBeenCalled();
      expect(stakingProvider.getPositions).not.toHaveBeenCalled();

      // Sync STAKING only
      await tracker.syncCategory('STAKING');
      expect(stakingProvider.getPositions).toHaveBeenCalled();
    });

    it('LENDING duck-type auto-registration accepts plain object with 3 methods', () => {
      const duckLendingProvider = {
        getPositions: vi.fn().mockResolvedValue([]),
        getProviderName: () => 'aave_v3_duck',
        getSupportedCategories: () => ['LENDING'] as PositionCategory[],
      };

      tracker.registerProvider(duckLendingProvider as unknown as IPositionProvider);
      expect(tracker.providerCount).toBe(1);
    });
  });

  // -------------------------------------------------------------------------
  // YIELD category tests (Phase 395)
  // -------------------------------------------------------------------------

  describe('YIELD category', () => {
    it('YIELD provider registration and sync writes positions to DB', async () => {
      const now = Math.floor(Date.now() / 1000);
      const yieldProvider = makeMockProvider({
        name: 'pendle',
        categories: ['YIELD'],
        getPositions: vi.fn().mockResolvedValue([{
          walletId: 'wallet-1',
          category: 'YIELD' as PositionCategory,
          provider: 'pendle',
          chain: 'ethereum',
          network: 'ethereum-mainnet',
          assetId: 'eip155:1/erc20:0xPTAddr',
          amount: '1.0',
          amountUsd: null,
          metadata: {
            tokenType: 'PT',
            maturity: now + 86400 * 365,
            underlyingAsset: 'stETH',
            impliedApy: 0.045,
            marketAddress: '0xMarketAddr',
          },
          status: 'ACTIVE',
          openedAt: now,
        }] as PositionUpdate[]),
      });

      tracker.registerProvider(yieldProvider);
      expect(tracker.providerCount).toBe(1);

      await tracker.syncCategory('YIELD');

      expect(yieldProvider.getPositions).toHaveBeenCalled();
      const rows = sqlite.prepare("SELECT * FROM defi_positions WHERE provider = 'pendle'").all() as any[];
      expect(rows.length).toBeGreaterThanOrEqual(1);

      // Verify metadata is preserved
      const meta = JSON.parse(rows[0].metadata);
      expect(meta.tokenType).toBe('PT');
      expect(meta.impliedApy).toBe(0.045);
      expect(meta.underlyingAsset).toBe('stETH');
    });

    it('MATURED status is preserved through sync', async () => {
      const now = Math.floor(Date.now() / 1000);
      const pastMaturity = now - 86400 * 30; // 30 days ago
      const yieldProvider = makeMockProvider({
        name: 'pendle',
        categories: ['YIELD'],
        getPositions: vi.fn().mockResolvedValue([{
          walletId: 'wallet-1',
          category: 'YIELD' as PositionCategory,
          provider: 'pendle',
          chain: 'ethereum',
          network: 'ethereum-mainnet',
          assetId: 'eip155:1/erc20:0xMaturedPT',
          amount: '2.5',
          amountUsd: null,
          metadata: {
            tokenType: 'PT',
            maturity: pastMaturity,
            underlyingAsset: 'stETH',
            impliedApy: 0,
            marketAddress: '0xMaturedMarket',
          },
          status: 'MATURED',
          openedAt: now,
        }] as PositionUpdate[]),
      });

      tracker.registerProvider(yieldProvider);
      await tracker.syncCategory('YIELD');

      const rows = sqlite.prepare("SELECT * FROM defi_positions WHERE provider = 'pendle'").all() as any[];
      expect(rows.length).toBeGreaterThanOrEqual(1);
      expect(rows[0].status).toBe('MATURED');
    });

    it('YIELD provider not called for LENDING sync', async () => {
      const yieldProvider = makeMockProvider({
        name: 'pendle',
        categories: ['YIELD'],
      });

      tracker.registerProvider(yieldProvider);
      await tracker.syncCategory('LENDING');

      expect(yieldProvider.getPositions).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // PERP category tests (Phase 396 - Hyperliquid)
  // -------------------------------------------------------------------------

  describe('PERP category sync (Hyperliquid)', () => {
    it('syncs PERP positions from hyperliquid_perp provider', async () => {
      const now = Math.floor(Date.now() / 1000);
      const perpProvider = makeMockProvider({
        name: 'hyperliquid_perp',
        categories: ['PERP'],
        getPositions: vi.fn().mockResolvedValue([
          {
            walletId: 'wallet-1',
            category: 'PERP' as PositionCategory,
            provider: 'hyperliquid_perp',
            chain: 'ethereum',
            network: 'ethereum-mainnet',
            assetId: null,
            amount: '1.5',
            amountUsd: 3150,
            metadata: { market: 'ETH', side: 'LONG', entryPrice: 2000, markPrice: 2100, leverage: 10, unrealizedPnl: 150, liquidationPrice: 1800, marginUsed: 300 },
            status: 'ACTIVE',
            openedAt: now,
          },
          {
            walletId: 'wallet-1',
            category: 'PERP' as PositionCategory,
            provider: 'hyperliquid_perp',
            chain: 'ethereum',
            network: 'ethereum-mainnet',
            assetId: null,
            amount: '0.5',
            amountUsd: 20500,
            metadata: { market: 'BTC', side: 'SHORT', entryPrice: 42000, markPrice: 41000, leverage: 5, unrealizedPnl: 500, liquidationPrice: 45000, marginUsed: 4100 },
            status: 'ACTIVE',
            openedAt: now,
          },
        ] as PositionUpdate[]),
      });

      tracker.registerProvider(perpProvider);
      await tracker.syncCategory('PERP');

      expect(perpProvider.getPositions).toHaveBeenCalled();
      const rows = sqlite.prepare("SELECT * FROM defi_positions WHERE category = 'PERP' AND provider = 'hyperliquid_perp'").all() as any[];
      expect(rows.length).toBeGreaterThanOrEqual(1);
    });

    it('syncs PERP positions from both hyperliquid_perp and hyperliquid_spot providers', async () => {
      const now = Math.floor(Date.now() / 1000);

      const perpProvider = makeMockProvider({
        name: 'hyperliquid_perp',
        categories: ['PERP'],
        getPositions: vi.fn().mockResolvedValue([{
          walletId: 'wallet-1',
          category: 'PERP' as PositionCategory,
          provider: 'hyperliquid_perp',
          chain: 'ethereum',
          network: 'ethereum-mainnet',
          assetId: null,
          amount: '1.0',
          amountUsd: 2000,
          metadata: { market: 'ETH', side: 'LONG' },
          status: 'ACTIVE',
          openedAt: now,
        }] as PositionUpdate[]),
      });

      const spotProvider = makeMockProvider({
        name: 'hyperliquid_spot',
        categories: ['PERP'],
        getPositions: vi.fn().mockResolvedValue([
          {
            walletId: 'wallet-1',
            category: 'PERP' as PositionCategory,
            provider: 'hyperliquid_spot',
            chain: 'ethereum',
            network: 'ethereum-mainnet',
            assetId: null,
            amount: '100.5',
            amountUsd: 2512.5,
            metadata: { coin: 'HYPE', total: '100.5', hold: '0', tokenIndex: 1 },
            status: 'ACTIVE',
            openedAt: now,
          },
          {
            walletId: 'wallet-1',
            category: 'PERP' as PositionCategory,
            provider: 'hyperliquid_spot',
            chain: 'ethereum',
            network: 'ethereum-mainnet',
            assetId: null,
            amount: '500.0',
            amountUsd: 500,
            metadata: { coin: 'USDC', total: '500.0', hold: '50', tokenIndex: 0 },
            status: 'ACTIVE',
            openedAt: now,
          },
        ] as PositionUpdate[]),
      });

      tracker.registerProvider(perpProvider);
      tracker.registerProvider(spotProvider);
      await tracker.syncCategory('PERP');

      expect(perpProvider.getPositions).toHaveBeenCalled();
      expect(spotProvider.getPositions).toHaveBeenCalled();
      const rows = sqlite.prepare("SELECT * FROM defi_positions WHERE category = 'PERP'").all() as any[];
      expect(rows.length).toBeGreaterThanOrEqual(2); // At least 2 providers' positions
    });

    it('duck-type detection: plain object with 3 methods is accepted', async () => {
      const duckPerpProvider = {
        getPositions: vi.fn().mockResolvedValue([{
          walletId: 'wallet-1',
          category: 'PERP' as PositionCategory,
          provider: 'duck_perp',
          chain: 'ethereum',
          network: 'ethereum-mainnet',
          assetId: null,
          amount: '1.0',
          amountUsd: 2000,
          metadata: { market: 'ETH', side: 'LONG' },
          status: 'ACTIVE',
          openedAt: Math.floor(Date.now() / 1000),
        }] as PositionUpdate[]),
        getProviderName: () => 'duck_perp',
        getSupportedCategories: () => ['PERP'] as PositionCategory[],
      };

      tracker.registerProvider(duckPerpProvider as unknown as IPositionProvider);
      expect(tracker.providerCount).toBe(1);

      await tracker.syncCategory('PERP');
      expect(duckPerpProvider.getPositions).toHaveBeenCalled();
    });

    it('PERP sync does not affect LENDING providers', async () => {
      const lendingProvider = makeMockProvider({
        name: 'aave_v3',
        categories: ['LENDING'],
      });

      const perpProvider = makeMockProvider({
        name: 'hyperliquid_perp',
        categories: ['PERP'],
        getPositions: vi.fn().mockResolvedValue([]),
      });

      tracker.registerProvider(lendingProvider);
      tracker.registerProvider(perpProvider);
      await tracker.syncCategory('PERP');

      expect(perpProvider.getPositions).toHaveBeenCalled();
      expect(lendingProvider.getPositions).not.toHaveBeenCalled();
    });
  });
});
