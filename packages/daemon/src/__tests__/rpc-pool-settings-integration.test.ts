/**
 * RPC Pool Settings Integration tests.
 *
 * Tests cover the full pipeline:
 * 1. rpc_pool.* SettingDefinitions registration and CRUD
 * 2. RpcPool.replaceNetwork() atomic replacement
 * 3. HotReloadOrchestrator rpc_pool.* dispatch and URL priority merging
 *
 * Uses in-memory SQLite with pushSchema for a fresh DB per test.
 *
 * @see Phase 262-01
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Database as DatabaseType } from 'better-sqlite3';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { RpcPool, BUILT_IN_RPC_DEFAULTS } from '@waiaas/core';
import { createDatabase, pushSchema } from '../infrastructure/database/index.js';
import type * as schema from '../infrastructure/database/schema.js';
import { DaemonConfigSchema } from '../infrastructure/config/loader.js';
import type { DaemonConfig } from '../infrastructure/config/loader.js';
import { SETTING_DEFINITIONS, SETTING_CATEGORIES } from '../infrastructure/settings/setting-keys.js';
import { SettingsService } from '../infrastructure/settings/settings-service.js';
import { HotReloadOrchestrator } from '../infrastructure/settings/hot-reload.js';

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const TEST_MASTER_PASSWORD = 'test-master-password';

/** All 15 network keys matching BUILT_IN_RPC_DEFAULTS */
const ALL_NETWORK_KEYS = [
  'solana-mainnet', 'solana-devnet', 'solana-testnet',
  'ethereum-mainnet', 'ethereum-sepolia',
  'arbitrum-mainnet', 'arbitrum-sepolia',
  'optimism-mainnet', 'optimism-sepolia',
  'base-mainnet', 'base-sepolia',
  'polygon-mainnet', 'polygon-amoy',
  'hyperevm-mainnet', 'hyperevm-testnet',
] as const;

function createTestDb(): { sqlite: DatabaseType; db: BetterSQLite3Database<typeof schema> } {
  const conn = createDatabase(':memory:');
  pushSchema(conn.sqlite);
  return conn;
}

function createTestConfig(overrides?: Partial<Record<string, unknown>>): DaemonConfig {
  return DaemonConfigSchema.parse(overrides ?? {});
}

// ---------------------------------------------------------------------------
// 1. rpc_pool.* SettingDefinitions
// ---------------------------------------------------------------------------

describe('rpc_pool.* SettingDefinitions', () => {
  it('rpc_pool category is registered in SETTING_CATEGORIES', () => {
    expect((SETTING_CATEGORIES as readonly string[]).includes('rpc_pool')).toBe(true);
  });

  it('18 rpc_pool.* keys are registered in SETTING_DEFINITIONS', () => {
    const poolDefs = SETTING_DEFINITIONS.filter((d) => d.category === 'rpc_pool');
    expect(poolDefs).toHaveLength(18);

    const keys = poolDefs.map((d) => d.key);
    for (const network of ALL_NETWORK_KEYS) {
      expect(keys).toContain(`rpc_pool.${network}`);
    }
  });

  it('all rpc_pool.* definitions have defaultValue "[]" and isCredential false', () => {
    const poolDefs = SETTING_DEFINITIONS.filter((d) => d.category === 'rpc_pool');
    for (const def of poolDefs) {
      expect(def.defaultValue).toBe('[]');
      expect(def.isCredential).toBe(false);
    }
  });

  it('SettingsService.get() returns default "[]" for rpc_pool.* keys', () => {
    const { sqlite, db } = createTestDb();
    const ss = new SettingsService({ db, config: createTestConfig(), masterPassword: TEST_MASTER_PASSWORD });

    expect(ss.get('rpc_pool.solana-mainnet')).toBe('[]');
    expect(ss.get('rpc_pool.ethereum-sepolia')).toBe('[]');

    sqlite.close();
  });

  it('SettingsService.set() stores JSON array and get() restores it', () => {
    const { sqlite, db } = createTestDb();
    const ss = new SettingsService({ db, config: createTestConfig(), masterPassword: TEST_MASTER_PASSWORD });

    const urls = '["https://custom.rpc.com","https://another.rpc.com"]';
    ss.set('rpc_pool.solana-mainnet', urls);
    expect(ss.get('rpc_pool.solana-mainnet')).toBe(urls);

    sqlite.close();
  });
});

// ---------------------------------------------------------------------------
// 2. RpcPool.replaceNetwork()
// ---------------------------------------------------------------------------

describe('RpcPool.replaceNetwork()', () => {
  it('replaces existing URLs completely', () => {
    const pool = new RpcPool();
    pool.register('solana-mainnet', ['https://a.com', 'https://b.com']);

    pool.replaceNetwork('solana-mainnet', ['https://x.com', 'https://y.com']);

    expect(pool.getUrl('solana-mainnet')).toBe('https://x.com');
    const status = pool.getStatus('solana-mainnet');
    expect(status).toHaveLength(2);
    expect(status.map((s) => s.url)).toEqual(['https://x.com', 'https://y.com']);
  });

  it('empty array removes the network', () => {
    const pool = new RpcPool();
    pool.register('solana-mainnet', ['https://a.com']);
    expect(pool.hasNetwork('solana-mainnet')).toBe(true);

    pool.replaceNetwork('solana-mainnet', []);
    expect(pool.hasNetwork('solana-mainnet')).toBe(false);
  });

  it('cooldown state is cleared after replacement', () => {
    const now = 0;
    const pool = new RpcPool({ nowFn: () => now });
    pool.register('solana-mainnet', ['https://a.com', 'https://b.com']);

    // Put first URL into cooldown
    pool.reportFailure('solana-mainnet', 'https://a.com');
    const statusBefore = pool.getStatus('solana-mainnet');
    expect(statusBefore[0]!.status).toBe('cooldown');

    // Replace -- all entries should be fresh
    pool.replaceNetwork('solana-mainnet', ['https://a.com', 'https://c.com']);
    const statusAfter = pool.getStatus('solana-mainnet');
    expect(statusAfter[0]!.status).toBe('available');
    expect(statusAfter[0]!.failureCount).toBe(0);
    expect(statusAfter[1]!.status).toBe('available');
    expect(statusAfter[1]!.failureCount).toBe(0);
  });

  it('works on a network that was never registered', () => {
    const pool = new RpcPool();
    expect(pool.hasNetwork('custom')).toBe(false);

    pool.replaceNetwork('custom', ['https://new.com']);
    expect(pool.hasNetwork('custom')).toBe(true);
    expect(pool.getUrl('custom')).toBe('https://new.com');
  });
});

// ---------------------------------------------------------------------------
// 3. HotReloadOrchestrator rpc_pool.* dispatch
// ---------------------------------------------------------------------------

describe('HotReloadOrchestrator rpc_pool.* dispatch', () => {
  let sqlite: DatabaseType;
  let db: BetterSQLite3Database<typeof schema>;
  let config: DaemonConfig;
  let settingsService: SettingsService;
  let rpcPool: RpcPool;
  let mockAdapterPool: any;

  beforeEach(() => {
    const conn = createTestDb();
    sqlite = conn.sqlite;
    db = conn.db;
    config = createTestConfig();
    settingsService = new SettingsService({ db, config, masterPassword: TEST_MASTER_PASSWORD });

    rpcPool = new RpcPool();
    // Seed with built-in defaults so we have a baseline
    for (const [network, urls] of Object.entries(BUILT_IN_RPC_DEFAULTS)) {
      rpcPool.register(network, [...urls]);
    }

    mockAdapterPool = {
      pool: rpcPool,
      evict: vi.fn().mockResolvedValue(undefined),
      evictAll: vi.fn().mockResolvedValue(undefined),
    };
  });

  afterEach(() => {
    try { sqlite.close(); } catch { /* ignore */ }
  });

  it('rpc_pool.* key change triggers reloadRpcPool', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const orchestrator = new HotReloadOrchestrator({
      settingsService,
      adapterPool: mockAdapterPool,
    });

    await orchestrator.handleChangedKeys(['rpc_pool.solana-mainnet']);

    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining('Hot-reload: RpcPool solana-mainnet updated'),
    );

    logSpy.mockRestore();
  });

  it('user URL takes highest priority', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});

    settingsService.set('rpc_pool.solana-devnet', '["https://custom.dev.com"]');

    const orchestrator = new HotReloadOrchestrator({
      settingsService,
      adapterPool: mockAdapterPool,
    });

    await orchestrator.handleChangedKeys(['rpc_pool.solana-devnet']);

    // User URL should be first
    expect(rpcPool.getUrl('solana-devnet')).toBe('https://custom.dev.com');

    vi.restoreAllMocks();
  });

  it('merges user + config.toml + built-in in correct priority order', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});

    // Config.toml has rpc.solana_mainnet URL
    const configWithRpc = DaemonConfigSchema.parse({
      rpc: { solana_mainnet: 'https://config-rpc.com' },
    });
    const ssWithConfig = new SettingsService({ db, config: configWithRpc, masterPassword: TEST_MASTER_PASSWORD });

    // User sets custom URL via Admin Settings
    ssWithConfig.set('rpc_pool.solana-mainnet', '["https://user-rpc.com"]');

    const orchestrator = new HotReloadOrchestrator({
      settingsService: ssWithConfig,
      adapterPool: mockAdapterPool,
    });

    await orchestrator.handleChangedKeys(['rpc_pool.solana-mainnet']);

    // Verify URL order: user -> config -> built-in
    const status = rpcPool.getStatus('solana-mainnet');
    const urls = status.map((s) => s.url);
    expect(urls[0]).toBe('https://user-rpc.com');
    expect(urls[1]).toBe('https://config-rpc.com');
    // Built-in defaults follow
    expect(urls).toContain('https://api.mainnet-beta.solana.com');

    vi.restoreAllMocks();
  });

  it('duplicate URLs are deduplicated', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});

    // User URL is same as built-in default
    settingsService.set('rpc_pool.solana-mainnet', '["https://api.mainnet-beta.solana.com"]');

    const orchestrator = new HotReloadOrchestrator({
      settingsService,
      adapterPool: mockAdapterPool,
    });

    await orchestrator.handleChangedKeys(['rpc_pool.solana-mainnet']);

    // Should not have duplicate
    const status = rpcPool.getStatus('solana-mainnet');
    const urlSet = new Set(status.map((s) => s.url));
    expect(urlSet.size).toBe(status.length);

    vi.restoreAllMocks();
  });

  it('invalid JSON is treated as empty user URL list', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});

    settingsService.set('rpc_pool.solana-mainnet', 'not-valid-json');

    const orchestrator = new HotReloadOrchestrator({
      settingsService,
      adapterPool: mockAdapterPool,
    });

    await orchestrator.handleChangedKeys(['rpc_pool.solana-mainnet']);

    // Should still have built-in defaults (no user URLs due to invalid JSON)
    const status = rpcPool.getStatus('solana-mainnet');
    expect(status.length).toBeGreaterThanOrEqual(1);
    // First URL should be a built-in default or config URL (not the invalid JSON)
    expect(status[0]!.url).toMatch(/^https:\/\//);

    vi.restoreAllMocks();
  });

  it('Solana network change evicts solana adapter', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});

    const orchestrator = new HotReloadOrchestrator({
      settingsService,
      adapterPool: mockAdapterPool,
    });

    await orchestrator.handleChangedKeys(['rpc_pool.solana-mainnet']);

    expect(mockAdapterPool.evict).toHaveBeenCalledWith('solana', 'solana-mainnet');

    vi.restoreAllMocks();
  });

  it('EVM network change evicts ethereum adapter', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});

    const orchestrator = new HotReloadOrchestrator({
      settingsService,
      adapterPool: mockAdapterPool,
    });

    await orchestrator.handleChangedKeys(['rpc_pool.ethereum-sepolia']);

    expect(mockAdapterPool.evict).toHaveBeenCalledWith('ethereum', 'ethereum-sepolia');

    vi.restoreAllMocks();
  });

  it('multiple network keys changed simultaneously are all processed', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});

    settingsService.set('rpc_pool.solana-mainnet', '["https://sol-custom.com"]');
    settingsService.set('rpc_pool.ethereum-sepolia', '["https://eth-custom.com"]');

    const orchestrator = new HotReloadOrchestrator({
      settingsService,
      adapterPool: mockAdapterPool,
    });

    await orchestrator.handleChangedKeys(['rpc_pool.solana-mainnet', 'rpc_pool.ethereum-sepolia']);

    // Both networks should have user URLs as first
    expect(rpcPool.getUrl('solana-mainnet')).toBe('https://sol-custom.com');
    expect(rpcPool.getUrl('ethereum-sepolia')).toBe('https://eth-custom.com');

    // Both adapters should be evicted
    expect(mockAdapterPool.evict).toHaveBeenCalledWith('solana', 'solana-mainnet');
    expect(mockAdapterPool.evict).toHaveBeenCalledWith('ethereum', 'ethereum-sepolia');

    vi.restoreAllMocks();
  });

  it('handles null adapterPool gracefully', async () => {
    const orchestrator = new HotReloadOrchestrator({
      settingsService,
      adapterPool: null,
    });

    // Should not throw
    await expect(
      orchestrator.handleChangedKeys(['rpc_pool.solana-mainnet']),
    ).resolves.toBeUndefined();
  });

  it('handles adapterPool without rpcPool gracefully', async () => {
    const poolWithoutRpc = {
      pool: undefined,
      evict: vi.fn().mockResolvedValue(undefined),
      evictAll: vi.fn().mockResolvedValue(undefined),
    };

    const orchestrator = new HotReloadOrchestrator({
      settingsService,
      adapterPool: poolWithoutRpc as any,
    });

    // Should not throw (early return when pool.pool is undefined)
    await expect(
      orchestrator.handleChangedKeys(['rpc_pool.solana-mainnet']),
    ).resolves.toBeUndefined();
  });

  it('rpc_pool.* change does not affect existing rpc.* handler', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});

    const orchestrator = new HotReloadOrchestrator({
      settingsService,
      adapterPool: mockAdapterPool,
    });

    // Only rpc_pool keys -- should NOT trigger rpc.* eviction logic
    mockAdapterPool.evict.mockClear();
    await orchestrator.handleChangedKeys(['rpc_pool.solana-devnet']);

    // Evict should be called exactly once (from rpc_pool handler, for solana:devnet)
    expect(mockAdapterPool.evict).toHaveBeenCalledTimes(1);
    expect(mockAdapterPool.evict).toHaveBeenCalledWith('solana', 'solana-devnet');

    vi.restoreAllMocks();
  });
});
