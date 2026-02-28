/**
 * Integration tests: RPC Pool routing through the adapter resolution chain.
 *
 * Tests the full RPC resolution chain: RpcPool -> AdapterPool -> Adapter.connect()
 * Covers Solana/EVM pool routing, fallback behavior, failure rotation, and cooldown reset.
 *
 * Separate from adapter-pool-rpc-pool.test.ts to focus on end-to-end routing
 * rather than unit-level AdapterPool/configKeyToNetwork behavior.
 *
 * @see Phase 261-02
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RpcPool } from '@waiaas/core';

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
    'ethereum-sepolia': { viemChain: { id: 11155111 }, chainId: 11155111, nativeSymbol: 'ETH', nativeName: 'Ether' },
    'base-mainnet': { viemChain: { id: 8453 }, chainId: 8453, nativeSymbol: 'ETH', nativeName: 'Ether' },
  },
}));

import { AdapterPool } from '../infrastructure/adapter-pool.js';

// ─── 1. Solana adapter resolves via RpcPool ─────────────────────────────

describe('Solana adapter resolves via RpcPool', () => {
  beforeEach(() => {
    mockSolanaConnect.mockClear();
    mockSolanaDisconnect.mockClear();
  });

  it('connects with highest-priority URL from pool', async () => {
    const rpcPool = new RpcPool();
    rpcPool.register('solana-devnet', [
      'https://devnet-primary.example.com',
      'https://devnet-secondary.example.com',
    ]);

    const pool = new AdapterPool(rpcPool);
    const adapter = await pool.resolve('solana', 'solana-devnet');

    expect(adapter).toBeInstanceOf(MockSolanaAdapter);
    expect(mockSolanaConnect).toHaveBeenCalledWith('https://devnet-primary.example.com');
  });

  it('ignores provided rpcUrl fallback when pool has the network', async () => {
    const rpcPool = new RpcPool();
    rpcPool.register('solana-devnet', ['https://pool-url.example.com']);

    const pool = new AdapterPool(rpcPool);
    await pool.resolve('solana', 'solana-devnet', 'https://fallback-should-be-ignored.rpc');

    // Pool URL takes priority over provided fallback
    expect(mockSolanaConnect).toHaveBeenCalledWith('https://pool-url.example.com');
  });
});

// ─── 2. EVM adapter resolves via RpcPool ────────────────────────────────

describe('EVM adapter resolves via RpcPool', () => {
  beforeEach(() => {
    mockEvmConnect.mockClear();
    mockEvmDisconnect.mockClear();
  });

  it('connects with highest-priority URL from pool', async () => {
    const rpcPool = new RpcPool();
    rpcPool.register('ethereum-sepolia', [
      'https://sepolia-primary.example.com',
      'https://sepolia-secondary.example.com',
    ]);

    const pool = new AdapterPool(rpcPool);
    const adapter = await pool.resolve('ethereum', 'ethereum-sepolia');

    expect(adapter).toBeInstanceOf(MockEvmAdapter);
    expect(mockEvmConnect).toHaveBeenCalledWith('https://sepolia-primary.example.com');
  });

  it('connects EVM base-mainnet via pool', async () => {
    const rpcPool = new RpcPool();
    rpcPool.register('base-mainnet', ['https://base-rpc.example.com']);

    const pool = new AdapterPool(rpcPool);
    const adapter = await pool.resolve('ethereum', 'base-mainnet');

    expect(adapter).toBeInstanceOf(MockEvmAdapter);
    expect(mockEvmConnect).toHaveBeenCalledWith('https://base-rpc.example.com');
  });
});

// ─── 3. Fallback to rpcUrl when pool has no network ─────────────────────

describe('Fallback to rpcUrl when pool has no network', () => {
  beforeEach(() => {
    mockSolanaConnect.mockClear();
    mockEvmConnect.mockClear();
  });

  it('Solana: falls back to provided rpcUrl for unregistered network', async () => {
    const rpcPool = new RpcPool();
    rpcPool.register('solana-devnet', ['https://devnet.example.com']); // only devnet registered

    const pool = new AdapterPool(rpcPool);
    // Request mainnet which is NOT registered in pool
    const adapter = await pool.resolve('solana', 'solana-mainnet', 'https://my-mainnet-fallback.rpc');

    expect(adapter).toBeInstanceOf(MockSolanaAdapter);
    expect(mockSolanaConnect).toHaveBeenCalledWith('https://my-mainnet-fallback.rpc');
  });

  it('EVM: falls back to provided rpcUrl for unknown network', async () => {
    const rpcPool = new RpcPool();
    // Pool has ethereum-sepolia, but we'll request base-mainnet which IS in EVM_CHAIN_MAP
    // but NOT in the pool
    rpcPool.register('ethereum-sepolia', ['https://sepolia.example.com']);

    const pool = new AdapterPool(rpcPool);
    const adapter = await pool.resolve('ethereum', 'base-mainnet', 'https://base-fallback.rpc');

    expect(adapter).toBeInstanceOf(MockEvmAdapter);
    expect(mockEvmConnect).toHaveBeenCalledWith('https://base-fallback.rpc');
  });

  it('falls back to empty string when pool has no network and no rpcUrl', async () => {
    const rpcPool = new RpcPool(); // empty pool
    const pool = new AdapterPool(rpcPool);

    await pool.resolve('solana', 'solana-devnet');

    expect(mockSolanaConnect).toHaveBeenCalledWith('');
  });
});

// ─── 4. Pool URL rotation after failure report ──────────────────────────

describe('Pool URL rotation after failure report', () => {
  beforeEach(() => {
    mockSolanaConnect.mockClear();
    mockSolanaDisconnect.mockClear();
  });

  it('rotates to second URL after first URL failure and cooldown', async () => {
    const now = 1000;
    const rpcPool = new RpcPool({
      baseCooldownMs: 60_000,
      nowFn: () => now,
    });

    rpcPool.register('solana-devnet', [
      'https://url-1.rpc',
      'https://url-2.rpc',
    ]);

    const adapterPool = new AdapterPool(rpcPool);

    // First resolve -> URL-1 (highest priority)
    const adapter1 = await adapterPool.resolve('solana', 'solana-devnet');
    expect(mockSolanaConnect).toHaveBeenCalledWith('https://url-1.rpc');
    expect(adapter1).toBeInstanceOf(MockSolanaAdapter);

    // Report failure on URL-1
    adapterPool.reportRpcFailure('solana-devnet', 'https://url-1.rpc');

    // Verify URL-1 is in cooldown
    const status = rpcPool.getStatus('solana-devnet');
    expect(status[0]!.status).toBe('cooldown');
    expect(status[1]!.status).toBe('available');

    // Evict cached adapter so next resolve creates a fresh one
    await adapterPool.evict('solana', 'solana-devnet');
    mockSolanaConnect.mockClear();

    // Second resolve -> should get URL-2 (URL-1 is in cooldown)
    const adapter2 = await adapterPool.resolve('solana', 'solana-devnet');
    expect(mockSolanaConnect).toHaveBeenCalledWith('https://url-2.rpc');
    expect(adapter2).toBeInstanceOf(MockSolanaAdapter);
  });

  it('returns to first URL after cooldown expires', async () => {
    let now = 1000;
    const rpcPool = new RpcPool({
      baseCooldownMs: 60_000,
      nowFn: () => now,
    });

    rpcPool.register('solana-devnet', [
      'https://url-1.rpc',
      'https://url-2.rpc',
    ]);

    const adapterPool = new AdapterPool(rpcPool);

    // Resolve -> URL-1
    await adapterPool.resolve('solana', 'solana-devnet');
    expect(mockSolanaConnect).toHaveBeenCalledWith('https://url-1.rpc');

    // Fail URL-1
    adapterPool.reportRpcFailure('solana-devnet', 'https://url-1.rpc');

    // Advance time past cooldown
    now += 70_000;

    // Evict and re-resolve
    await adapterPool.evict('solana', 'solana-devnet');
    mockSolanaConnect.mockClear();

    // URL-1 cooldown expired -> URL-1 should be first again
    await adapterPool.resolve('solana', 'solana-devnet');
    expect(mockSolanaConnect).toHaveBeenCalledWith('https://url-1.rpc');
  });
});

// ─── 5. Hot-reload: reset clears cooldown ───────────────────────────────

describe('RpcPool reset clears cooldown for hot-reload', () => {
  it('reset makes failed URL available again immediately', () => {
    const now = 1000;
    const rpcPool = new RpcPool({
      baseCooldownMs: 60_000,
      nowFn: () => now,
    });

    rpcPool.register('solana-devnet', [
      'https://url-1.rpc',
      'https://url-2.rpc',
    ]);

    // Put URL-1 in cooldown
    rpcPool.reportFailure('solana-devnet', 'https://url-1.rpc');
    expect(rpcPool.getStatus('solana-devnet')[0]!.status).toBe('cooldown');
    expect(rpcPool.getUrl('solana-devnet')).toBe('https://url-2.rpc'); // URL-1 skipped

    // Reset cooldown (simulates hot-reload behavior)
    rpcPool.reset('solana-devnet');

    // URL-1 should be available again (first in priority)
    expect(rpcPool.getStatus('solana-devnet')[0]!.status).toBe('available');
    expect(rpcPool.getStatus('solana-devnet')[0]!.failureCount).toBe(0);
    expect(rpcPool.getUrl('solana-devnet')).toBe('https://url-1.rpc');
  });

  it('hasNetwork returns true for registered networks', () => {
    const rpcPool = new RpcPool();
    rpcPool.register('solana-devnet', ['https://url.rpc']);

    expect(rpcPool.hasNetwork('solana-devnet')).toBe(true);
    expect(rpcPool.hasNetwork('solana-mainnet')).toBe(false);
  });

  it('reset on non-existent network is a no-op', () => {
    const rpcPool = new RpcPool();
    // Should not throw
    expect(() => rpcPool.reset('nonexistent')).not.toThrow();
  });
});
