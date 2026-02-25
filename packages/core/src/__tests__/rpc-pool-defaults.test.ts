import { describe, it, expect } from 'vitest';
import { BUILT_IN_RPC_DEFAULTS } from '../rpc/built-in-defaults.js';
import { RpcPool } from '../rpc/rpc-pool.js';

// ─── Constants ────────────────────────────────────────────────

const MAINNET_KEYS = [
  'mainnet',
  'ethereum-mainnet',
  'arbitrum-mainnet',
  'optimism-mainnet',
  'base-mainnet',
  'polygon-mainnet',
] as const;

const TESTNET_KEYS = [
  'devnet',
  'testnet',
  'ethereum-sepolia',
  'arbitrum-sepolia',
  'optimism-sepolia',
  'base-sepolia',
  'polygon-amoy',
] as const;

const ALL_KEYS = [...MAINNET_KEYS, ...TESTNET_KEYS];

// ─── Data Integrity Tests ─────────────────────────────────────

describe('BUILT_IN_RPC_DEFAULTS', () => {
  it('has exactly 13 network keys', () => {
    expect(Object.keys(BUILT_IN_RPC_DEFAULTS)).toHaveLength(13);
  });

  it('contains all 6 mainnet keys', () => {
    for (const key of MAINNET_KEYS) {
      expect(BUILT_IN_RPC_DEFAULTS).toHaveProperty(key);
    }
  });

  it('contains all 7 testnet keys', () => {
    for (const key of TESTNET_KEYS) {
      expect(BUILT_IN_RPC_DEFAULTS).toHaveProperty(key);
    }
  });

  it('every URL starts with https://', () => {
    for (const [network, urls] of Object.entries(BUILT_IN_RPC_DEFAULTS)) {
      for (const url of urls) {
        expect(url, `${network}: ${url}`).toMatch(/^https:\/\//);
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

  it('contains only the expected 13 keys (no extras)', () => {
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

  it('registers all 13 networks', () => {
    const pool = RpcPool.createWithDefaults();
    expect(pool.getNetworks()).toHaveLength(13);
  });

  it('hasNetwork returns true for all 13 networks', () => {
    const pool = RpcPool.createWithDefaults();
    for (const key of ALL_KEYS) {
      expect(pool.hasNetwork(key), `hasNetwork('${key}')`).toBe(true);
    }
  });

  it('getUrl returns first URL (highest priority) for mainnet', () => {
    const pool = RpcPool.createWithDefaults();
    expect(pool.getUrl('mainnet')).toBe('https://api.mainnet-beta.solana.com');
  });

  it('getUrl returns first URL for ethereum-mainnet', () => {
    const pool = RpcPool.createWithDefaults();
    expect(pool.getUrl('ethereum-mainnet')).toBe('https://eth.drpc.org');
  });

  it('falls back to second URL after first failure', () => {
    let now = 0;
    const pool = RpcPool.createWithDefaults({ nowFn: () => now });

    const firstUrl = pool.getUrl('mainnet');
    expect(firstUrl).toBe('https://api.mainnet-beta.solana.com');

    pool.reportFailure('mainnet', firstUrl);

    const secondUrl = pool.getUrl('mainnet');
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

    const firstUrl = pool.getUrl('mainnet');
    pool.reportFailure('mainnet', firstUrl);

    // At 29s, first URL should still be in cooldown
    now = 29_999;
    expect(pool.getUrl('mainnet')).toBe('https://rpc.ankr.com/solana');

    // At 30s, first URL should be available again (30_000ms cooldown)
    now = 30_000;
    expect(pool.getUrl('mainnet')).toBe('https://api.mainnet-beta.solana.com');
  });

  it('respects custom maxCooldownMs', () => {
    let now = 0;
    const pool = RpcPool.createWithDefaults({
      baseCooldownMs: 10_000,
      maxCooldownMs: 20_000,
      nowFn: () => now,
    });

    const firstUrl = pool.getUrl('mainnet');
    // Failure 1: 10_000ms cooldown
    pool.reportFailure('mainnet', firstUrl);
    now = 10_000;
    expect(pool.getUrl('mainnet')).toBe(firstUrl);

    // Failure 2: 20_000ms cooldown (10_000 * 2^1 = 20_000, capped at max)
    pool.reportFailure('mainnet', firstUrl);
    now += 20_000;
    expect(pool.getUrl('mainnet')).toBe(firstUrl);

    // Failure 3: still 20_000ms cooldown (capped)
    pool.reportFailure('mainnet', firstUrl);
    now += 20_000;
    expect(pool.getUrl('mainnet')).toBe(firstUrl);
  });
});

// ─── Merge with Custom Registration Tests ─────────────────────

describe('additional registrations merge with defaults', () => {
  it('custom URL is appended after defaults', () => {
    const pool = RpcPool.createWithDefaults();
    pool.register('mainnet', ['https://custom.rpc.com']);

    // Default URLs still have higher priority
    expect(pool.getUrl('mainnet')).toBe('https://api.mainnet-beta.solana.com');

    // Custom URL is accessible via status
    const status = pool.getStatus('mainnet');
    const urls = status.map((s) => s.url);
    expect(urls).toContain('https://custom.rpc.com');
    expect(urls.length).toBe(4); // 3 defaults + 1 custom
  });

  it('duplicate default URLs are not re-added', () => {
    const pool = RpcPool.createWithDefaults();
    pool.register('mainnet', ['https://api.mainnet-beta.solana.com']);

    const status = pool.getStatus('mainnet');
    expect(status).toHaveLength(3); // Still 3, duplicate ignored
  });

  it('new network can be registered alongside defaults', () => {
    const pool = RpcPool.createWithDefaults();
    pool.register('custom-network', ['https://custom.example.com']);

    expect(pool.getNetworks()).toHaveLength(14); // 13 defaults + 1 custom
    expect(pool.getUrl('custom-network')).toBe('https://custom.example.com');
  });
});
