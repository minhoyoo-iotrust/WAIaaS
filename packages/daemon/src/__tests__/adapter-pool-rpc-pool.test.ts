/**
 * AdapterPool + RpcPool integration tests.
 *
 * Tests cover:
 * 1. AdapterPool with RpcPool resolves URL from pool
 * 2. AdapterPool without RpcPool uses provided rpcUrl (backward compat)
 * 3. AdapterPool with RpcPool falls back to provided rpcUrl when pool has no network
 * 4. configKeyToNetwork mapping (config key -> network name)
 * 5. Config.toml single URL seeds pool as first priority
 * 6. reportRpcFailure/reportRpcSuccess delegate to pool
 *
 * Separate from adapter-pool.test.ts to avoid mock conflicts.
 *
 * @see Phase 261-01
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RpcPool, BUILT_IN_RPC_DEFAULTS } from '@waiaas/core';

// ---- Mock SolanaAdapter ----
const mockSolanaConnect = vi.fn().mockResolvedValue(undefined);
const mockSolanaDisconnect = vi.fn().mockResolvedValue(undefined);

class MockSolanaAdapter {
  chain = 'solana' as const;
  network: string;
  constructor(network: string) {
    this.network = network;
  }
  connect = mockSolanaConnect;
  disconnect = mockSolanaDisconnect;
  isConnected = vi.fn().mockReturnValue(true);
}

vi.mock('@waiaas/adapter-solana', () => ({
  SolanaAdapter: MockSolanaAdapter,
}));

// ---- Mock EvmAdapter ----
const mockEvmConnect = vi.fn().mockResolvedValue(undefined);
const mockEvmDisconnect = vi.fn().mockResolvedValue(undefined);

class MockEvmAdapter {
  chain = 'ethereum' as const;
  network: string;
  viemChain: unknown;
  nativeSymbol: string;
  nativeName: string;
  constructor(network: string, viemChain: unknown, nativeSymbol: string, nativeName: string) {
    this.network = network;
    this.viemChain = viemChain;
    this.nativeSymbol = nativeSymbol;
    this.nativeName = nativeName;
  }
  connect = mockEvmConnect;
  disconnect = mockEvmDisconnect;
  isConnected = vi.fn().mockReturnValue(true);
}

vi.mock('@waiaas/adapter-evm', () => ({
  EvmAdapter: MockEvmAdapter,
  EVM_CHAIN_MAP: {
    'ethereum-mainnet': { viemChain: { id: 1 }, chainId: 1, nativeSymbol: 'ETH', nativeName: 'Ether' },
    'ethereum-sepolia': { viemChain: { id: 11155111 }, chainId: 11155111, nativeSymbol: 'ETH', nativeName: 'Ether' },
    'polygon-mainnet': { viemChain: { id: 137 }, chainId: 137, nativeSymbol: 'POL', nativeName: 'POL' },
    'polygon-amoy': { viemChain: { id: 80002 }, chainId: 80002, nativeSymbol: 'POL', nativeName: 'POL' },
    'arbitrum-mainnet': { viemChain: { id: 42161 }, chainId: 42161, nativeSymbol: 'ETH', nativeName: 'Ether' },
    'arbitrum-sepolia': { viemChain: { id: 421614 }, chainId: 421614, nativeSymbol: 'ETH', nativeName: 'Ether' },
    'optimism-mainnet': { viemChain: { id: 10 }, chainId: 10, nativeSymbol: 'ETH', nativeName: 'Ether' },
    'optimism-sepolia': { viemChain: { id: 11155420 }, chainId: 11155420, nativeSymbol: 'ETH', nativeName: 'Ether' },
    'base-mainnet': { viemChain: { id: 8453 }, chainId: 8453, nativeSymbol: 'ETH', nativeName: 'Ether' },
    'base-sepolia': { viemChain: { id: 84532 }, chainId: 84532, nativeSymbol: 'ETH', nativeName: 'Ether' },
  },
}));

import { AdapterPool, configKeyToNetwork } from '../infrastructure/adapter-pool.js';

// ─── Test 1: AdapterPool with RpcPool resolves URL from pool ────────────

describe('AdapterPool with RpcPool', () => {
  beforeEach(() => {
    mockSolanaConnect.mockClear();
    mockSolanaDisconnect.mockClear();
    mockEvmConnect.mockClear();
    mockEvmDisconnect.mockClear();
  });

  it('resolves URL from RpcPool when available', async () => {
    const rpcPool = new RpcPool();
    rpcPool.register('devnet', ['https://pool-devnet.example.com']);

    const pool = new AdapterPool(rpcPool);
    const adapter = await pool.resolve('solana', 'devnet');

    expect(adapter).toBeInstanceOf(MockSolanaAdapter);
    expect(mockSolanaConnect).toHaveBeenCalledWith('https://pool-devnet.example.com');
  });

  it('resolves EVM URL from RpcPool', async () => {
    const rpcPool = new RpcPool();
    rpcPool.register('ethereum-sepolia', ['https://pool-sepolia.example.com']);

    const pool = new AdapterPool(rpcPool);
    const adapter = await pool.resolve('ethereum', 'ethereum-sepolia');

    expect(adapter).toBeInstanceOf(MockEvmAdapter);
    expect(mockEvmConnect).toHaveBeenCalledWith('https://pool-sepolia.example.com');
  });

  it('pool getter returns the RpcPool instance', () => {
    const rpcPool = new RpcPool();
    const pool = new AdapterPool(rpcPool);
    expect(pool.pool).toBe(rpcPool);
  });

  it('pool getter returns undefined when no RpcPool', () => {
    const pool = new AdapterPool();
    expect(pool.pool).toBeUndefined();
  });
});

// ─── Test 2: AdapterPool without RpcPool (backward compat) ─────────────

describe('AdapterPool without RpcPool (backward compat)', () => {
  beforeEach(() => {
    mockSolanaConnect.mockClear();
    mockEvmConnect.mockClear();
  });

  it('uses provided rpcUrl when no RpcPool is set', async () => {
    const pool = new AdapterPool();
    const adapter = await pool.resolve('solana', 'devnet', 'https://custom.rpc');

    expect(adapter).toBeInstanceOf(MockSolanaAdapter);
    expect(mockSolanaConnect).toHaveBeenCalledWith('https://custom.rpc');
  });

  it('uses provided rpcUrl for EVM when no RpcPool', async () => {
    const pool = new AdapterPool();
    const adapter = await pool.resolve('ethereum', 'ethereum-sepolia', 'https://custom-sepolia.rpc');

    expect(adapter).toBeInstanceOf(MockEvmAdapter);
    expect(mockEvmConnect).toHaveBeenCalledWith('https://custom-sepolia.rpc');
  });
});

// ─── Test 3: RpcPool fallback to provided rpcUrl ────────────────────────

describe('AdapterPool RpcPool fallback', () => {
  beforeEach(() => {
    mockSolanaConnect.mockClear();
  });

  it('falls back to provided rpcUrl when pool has no network registered', async () => {
    const rpcPool = new RpcPool(); // empty pool
    const pool = new AdapterPool(rpcPool);

    const adapter = await pool.resolve('solana', 'devnet', 'https://fallback.rpc');

    expect(adapter).toBeInstanceOf(MockSolanaAdapter);
    expect(mockSolanaConnect).toHaveBeenCalledWith('https://fallback.rpc');
  });

  it('falls back to empty string when pool has no network and no rpcUrl provided', async () => {
    const rpcPool = new RpcPool(); // empty pool
    const pool = new AdapterPool(rpcPool);

    const adapter = await pool.resolve('solana', 'devnet');

    expect(adapter).toBeInstanceOf(MockSolanaAdapter);
    expect(mockSolanaConnect).toHaveBeenCalledWith('');
  });
});

// ─── Test 4: configKeyToNetwork mapping ─────────────────────────────────

describe('configKeyToNetwork', () => {
  it('maps solana_mainnet -> mainnet', () => {
    expect(configKeyToNetwork('solana_mainnet')).toBe('mainnet');
  });

  it('maps solana_devnet -> devnet', () => {
    expect(configKeyToNetwork('solana_devnet')).toBe('devnet');
  });

  it('maps solana_testnet -> testnet', () => {
    expect(configKeyToNetwork('solana_testnet')).toBe('testnet');
  });

  it('maps evm_ethereum_sepolia -> ethereum-sepolia', () => {
    expect(configKeyToNetwork('evm_ethereum_sepolia')).toBe('ethereum-sepolia');
  });

  it('maps evm_polygon_amoy -> polygon-amoy', () => {
    expect(configKeyToNetwork('evm_polygon_amoy')).toBe('polygon-amoy');
  });

  it('maps evm_base_mainnet -> base-mainnet', () => {
    expect(configKeyToNetwork('evm_base_mainnet')).toBe('base-mainnet');
  });

  it('maps evm_arbitrum_sepolia -> arbitrum-sepolia', () => {
    expect(configKeyToNetwork('evm_arbitrum_sepolia')).toBe('arbitrum-sepolia');
  });

  it('maps evm_optimism_mainnet -> optimism-mainnet', () => {
    expect(configKeyToNetwork('evm_optimism_mainnet')).toBe('optimism-mainnet');
  });

  it('returns null for evm_default_network (skip)', () => {
    expect(configKeyToNetwork('evm_default_network')).toBeNull();
  });

  it('returns null for solana_ws_devnet (WebSocket key, skip)', () => {
    expect(configKeyToNetwork('solana_ws_devnet')).toBeNull();
  });

  it('returns null for solana_ws_mainnet (WebSocket key, skip)', () => {
    expect(configKeyToNetwork('solana_ws_mainnet')).toBeNull();
  });

  it('returns null for unknown keys without solana_/evm_ prefix', () => {
    expect(configKeyToNetwork('unknown_key')).toBeNull();
  });
});

// ─── Test 5: Config.toml URL seeds pool as first priority ───────────────

describe('Config.toml URL priority seeding', () => {
  it('config URL takes priority over built-in defaults', () => {
    const rpcPool = new RpcPool();

    // Seed config URL first (highest priority)
    rpcPool.register('devnet', ['https://my-custom.rpc']);

    // Then register built-in defaults (lower priority)
    for (const [network, urls] of Object.entries(BUILT_IN_RPC_DEFAULTS)) {
      rpcPool.register(network, [...urls]);
    }

    // getUrl returns highest-priority URL
    expect(rpcPool.getUrl('devnet')).toBe('https://my-custom.rpc');
  });

  it('built-in defaults are available for networks without config URL', () => {
    const rpcPool = new RpcPool();

    // Only seed config for devnet
    rpcPool.register('devnet', ['https://my-custom.rpc']);

    // Register all built-in defaults
    for (const [network, urls] of Object.entries(BUILT_IN_RPC_DEFAULTS)) {
      rpcPool.register(network, [...urls]);
    }

    // Seeded network uses config URL
    expect(rpcPool.getUrl('devnet')).toBe('https://my-custom.rpc');

    // Non-seeded networks use built-in defaults
    expect(rpcPool.getUrl('ethereum-sepolia')).toBe('https://sepolia.drpc.org');
  });

  it('config URL is not duplicated if same as built-in default', () => {
    const rpcPool = new RpcPool();

    // Config has same URL as built-in default
    rpcPool.register('devnet', ['https://api.devnet.solana.com']);

    // Register built-in defaults (which includes the same URL)
    for (const [network, urls] of Object.entries(BUILT_IN_RPC_DEFAULTS)) {
      rpcPool.register(network, [...urls]);
    }

    // Verify devnet has correct count (no duplication of matching URLs)
    const status = rpcPool.getStatus('devnet');
    const uniqueUrls = new Set(status.map((s) => s.url));
    expect(uniqueUrls.size).toBe(status.length); // no duplicates
  });
});

// ─── Test 6: reportRpcFailure/reportRpcSuccess delegation ───────────────

describe('AdapterPool RPC failure/success reporting', () => {
  it('reportRpcFailure delegates to pool.reportFailure', () => {
    const rpcPool = new RpcPool();
    rpcPool.register('devnet', ['https://url1.rpc', 'https://url2.rpc']);

    const pool = new AdapterPool(rpcPool);
    pool.reportRpcFailure('devnet', 'https://url1.rpc');

    const status = rpcPool.getStatus('devnet');
    expect(status[0]!.failureCount).toBe(1);
    expect(status[0]!.status).toBe('cooldown');
    expect(status[1]!.failureCount).toBe(0);
    expect(status[1]!.status).toBe('available');
  });

  it('reportRpcSuccess delegates to pool.reportSuccess', () => {
    const rpcPool = new RpcPool();
    rpcPool.register('devnet', ['https://url1.rpc']);

    // First fail, then succeed
    rpcPool.reportFailure('devnet', 'https://url1.rpc');
    expect(rpcPool.getStatus('devnet')[0]!.failureCount).toBe(1);

    const pool = new AdapterPool(rpcPool);
    pool.reportRpcSuccess('devnet', 'https://url1.rpc');

    expect(rpcPool.getStatus('devnet')[0]!.failureCount).toBe(0);
    expect(rpcPool.getStatus('devnet')[0]!.status).toBe('available');
  });

  it('reportRpcFailure is no-op without RpcPool', () => {
    const pool = new AdapterPool();
    // Should not throw
    expect(() => pool.reportRpcFailure('devnet', 'https://url.rpc')).not.toThrow();
  });

  it('reportRpcSuccess is no-op without RpcPool', () => {
    const pool = new AdapterPool();
    // Should not throw
    expect(() => pool.reportRpcSuccess('devnet', 'https://url.rpc')).not.toThrow();
  });
});
