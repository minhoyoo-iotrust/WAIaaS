import { describe, it, expect } from 'vitest';
import { BUILT_IN_RPC_DEFAULTS } from '../rpc/built-in-defaults.js';
import { RpcPool } from '../rpc/rpc-pool.js';

// ─── Constants ────────────────────────────────────────────────

const MAINNET_KEYS = [
  'solana-mainnet',
  'ethereum-mainnet',
  'arbitrum-mainnet',
  'optimism-mainnet',
  'base-mainnet',
  'polygon-mainnet',
  'hyperevm-mainnet',
  'xrpl-mainnet',
] as const;

const TESTNET_KEYS = [
  'solana-devnet',
  'solana-testnet',
  'ethereum-sepolia',
  'arbitrum-sepolia',
  'optimism-sepolia',
  'base-sepolia',
  'polygon-amoy',
  'hyperevm-testnet',
  'xrpl-testnet',
  'xrpl-devnet',
] as const;

const ALL_KEYS = [...MAINNET_KEYS, ...TESTNET_KEYS];

// ─── Data Integrity Tests ─────────────────────────────────────

describe('BUILT_IN_RPC_DEFAULTS', () => {
  it('has exactly 18 network keys', () => {
    expect(Object.keys(BUILT_IN_RPC_DEFAULTS)).toHaveLength(18);
  });

  it('contains all 8 mainnet keys', () => {
    for (const key of MAINNET_KEYS) {
      expect(BUILT_IN_RPC_DEFAULTS).toHaveProperty(key);
    }
  });

  it('contains all 10 testnet keys', () => {
    for (const key of TESTNET_KEYS) {
      expect(BUILT_IN_RPC_DEFAULTS).toHaveProperty(key);
    }
  });

  it('every URL starts with https:// or wss://', () => {
    for (const [network, urls] of Object.entries(BUILT_IN_RPC_DEFAULTS)) {
      for (const url of urls) {
        expect(url, `${network}: ${url}`).toMatch(/^(https|wss):\/\//);
      }
    }
  });

  it('every network has at least 1 URL', () => {
    for (const [network, urls] of Object.entries(BUILT_IN_RPC_DEFAULTS)) {
      expect(urls.length, `${network} should have at least 1 URL`).toBeGreaterThanOrEqual(1);
    }
  });

  it('no duplicate URLs within the same network', () => {
    for (const [network, urls] of Object.entries(BUILT_IN_RPC_DEFAULTS)) {
      const unique = new Set(urls);
      expect(unique.size, `${network} has duplicate URLs`).toBe(urls.length);
    }
  });

  it('contains only the expected 18 keys (no extras)', () => {
    const keys = Object.keys(BUILT_IN_RPC_DEFAULTS).sort();
    expect(keys).toEqual([...ALL_KEYS].sort());
  });
});

// ─── createWithDefaults() Integration Tests ───────────────────

describe('RpcPool.createWithDefaults()', () => {
  it('returns an RpcPool instance', () => {
    const pool = RpcPool.createWithDefaults();
    expect(pool).toBeInstanceOf(RpcPool);
  });

  it('registers all 18 networks', () => {
    const pool = RpcPool.createWithDefaults();
    expect(pool.getNetworks()).toHaveLength(18);
  });

  it('hasNetwork returns true for all 18 networks', () => {
    const pool = RpcPool.createWithDefaults();
    for (const key of ALL_KEYS) {
      expect(pool.hasNetwork(key), `hasNetwork('${key}')`).toBe(true);
    }
  });

  it('getUrl returns first URL (highest priority) for solana-mainnet', () => {
    const pool = RpcPool.createWithDefaults();
    expect(pool.getUrl('solana-mainnet')).toBe('https://api.mainnet-beta.solana.com');
  });

  it('getUrl returns first URL for ethereum-mainnet', () => {
    const pool = RpcPool.createWithDefaults();
    expect(pool.getUrl('ethereum-mainnet')).toBe('https://eth.drpc.org');
  });

  it('falls back to second URL after first failure', () => {
    const now = 0;
    const pool = RpcPool.createWithDefaults({ nowFn: () => now });

    const firstUrl = pool.getUrl('solana-mainnet');
    expect(firstUrl).toBe('https://api.mainnet-beta.solana.com');

    pool.reportFailure('solana-mainnet', firstUrl);

    const secondUrl = pool.getUrl('solana-mainnet');
    expect(secondUrl).toBe('https://rpc.ankr.com/solana');
  });
});

// ─── Custom Options Tests ─────────────────────────────────────

describe('createWithDefaults with custom options', () => {
  it('respects custom baseCooldownMs', () => {
    let now = 0;
    const pool = RpcPool.createWithDefaults({
      baseCooldownMs: 30_000,
      nowFn: () => now,
    });

    const firstUrl = pool.getUrl('solana-mainnet');
    pool.reportFailure('solana-mainnet', firstUrl);

    // At 29s, first URL should still be in cooldown
    now = 29_999;
    expect(pool.getUrl('solana-mainnet')).toBe('https://rpc.ankr.com/solana');

    // At 30s, first URL should be available again (30_000ms cooldown)
    now = 30_000;
    expect(pool.getUrl('solana-mainnet')).toBe('https://api.mainnet-beta.solana.com');
  });

  it('respects custom maxCooldownMs', () => {
    let now = 0;
    const pool = RpcPool.createWithDefaults({
      baseCooldownMs: 10_000,
      maxCooldownMs: 20_000,
      nowFn: () => now,
    });

    const firstUrl = pool.getUrl('solana-mainnet');
    // Failure 1: 10_000ms cooldown
    pool.reportFailure('solana-mainnet', firstUrl);
    now = 10_000;
    expect(pool.getUrl('solana-mainnet')).toBe(firstUrl);

    // Failure 2: 20_000ms cooldown (10_000 * 2^1 = 20_000, capped at max)
    pool.reportFailure('solana-mainnet', firstUrl);
    now += 20_000;
    expect(pool.getUrl('solana-mainnet')).toBe(firstUrl);

    // Failure 3: still 20_000ms cooldown (capped)
    pool.reportFailure('solana-mainnet', firstUrl);
    now += 20_000;
    expect(pool.getUrl('solana-mainnet')).toBe(firstUrl);
  });
});

// ─── Merge with Custom Registration Tests ─────────────────────

describe('additional registrations merge with defaults', () => {
  it('custom URL is appended after defaults', () => {
    const pool = RpcPool.createWithDefaults();
    pool.register('solana-mainnet', ['https://custom.rpc.com']);

    // Default URLs still have higher priority
    expect(pool.getUrl('solana-mainnet')).toBe('https://api.mainnet-beta.solana.com');

    // Custom URL is accessible via status
    const status = pool.getStatus('solana-mainnet');
    const urls = status.map((s) => s.url);
    expect(urls).toContain('https://custom.rpc.com');
    expect(urls.length).toBe(4); // 3 defaults + 1 custom
  });

  it('duplicate default URLs are not re-added', () => {
    const pool = RpcPool.createWithDefaults();
    pool.register('solana-mainnet', ['https://api.mainnet-beta.solana.com']);

    const status = pool.getStatus('solana-mainnet');
    expect(status).toHaveLength(3); // Still 3, duplicate ignored
  });

  it('new network can be registered alongside defaults', () => {
    const pool = RpcPool.createWithDefaults();
    pool.register('custom-network', ['https://custom.example.com']);

    expect(pool.getNetworks()).toHaveLength(19); // 18 defaults + 1 custom
    expect(pool.getUrl('custom-network')).toBe('https://custom.example.com');
  });
});
