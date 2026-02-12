/**
 * AdapterPool unit tests.
 *
 * Tests cover:
 * 1. resolve('solana', 'devnet', rpcUrl) creates and returns a SolanaAdapter
 * 2. resolve('ethereum', 'ethereum-sepolia', rpcUrl) creates and returns an EvmAdapter with correct nativeSymbol/nativeName
 * 3. Two calls with same chain:network return the same instance (referential equality)
 * 4. Two calls with different networks return different instances
 * 5. disconnectAll() calls disconnect() on all cached adapters
 * 6. After disconnectAll(), next resolve creates a fresh adapter
 * 7. Resolve with unknown chain throws an error
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---- Mock SolanaAdapter ----
const mockSolanaConnect = vi.fn().mockResolvedValue(undefined);
const mockSolanaDisconnect = vi.fn().mockResolvedValue(undefined);
const mockSolanaIsConnected = vi.fn().mockReturnValue(true);

class MockSolanaAdapter {
  chain = 'solana' as const;
  network: string;
  constructor(network: string) {
    this.network = network;
  }
  connect = mockSolanaConnect;
  disconnect = mockSolanaDisconnect;
  isConnected = mockSolanaIsConnected;
}

vi.mock('@waiaas/adapter-solana', () => ({
  SolanaAdapter: MockSolanaAdapter,
}));

// ---- Mock EvmAdapter ----
const mockEvmConnect = vi.fn().mockResolvedValue(undefined);
const mockEvmDisconnect = vi.fn().mockResolvedValue(undefined);
const mockEvmIsConnected = vi.fn().mockReturnValue(true);

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
  isConnected = mockEvmIsConnected;
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

import { AdapterPool } from '../infrastructure/adapter-pool.js';

describe('AdapterPool', () => {
  let pool: AdapterPool;

  beforeEach(() => {
    pool = new AdapterPool();
    mockSolanaConnect.mockClear();
    mockSolanaDisconnect.mockClear();
    mockSolanaIsConnected.mockClear();
    mockEvmConnect.mockClear();
    mockEvmDisconnect.mockClear();
    mockEvmIsConnected.mockClear();
  });

  // Test 1: resolve Solana adapter
  it('resolve("solana", "devnet", rpcUrl) creates a SolanaAdapter', async () => {
    const adapter = await pool.resolve('solana', 'devnet', 'https://api.devnet.solana.com');

    expect(adapter).toBeInstanceOf(MockSolanaAdapter);
    expect((adapter as unknown as MockSolanaAdapter).network).toBe('devnet');
    expect(mockSolanaConnect).toHaveBeenCalledWith('https://api.devnet.solana.com');
    expect(pool.size).toBe(1);
  });

  // Test 2: resolve EVM adapter with correct nativeSymbol/nativeName from EVM_CHAIN_MAP
  it('resolve("ethereum", "ethereum-sepolia", rpcUrl) creates an EvmAdapter with correct chain config', async () => {
    const adapter = await pool.resolve('ethereum', 'ethereum-sepolia', 'https://sepolia.drpc.org');

    expect(adapter).toBeInstanceOf(MockEvmAdapter);
    const evmAdapter = adapter as unknown as MockEvmAdapter;
    expect(evmAdapter.network).toBe('ethereum-sepolia');
    expect(evmAdapter.nativeSymbol).toBe('ETH');
    expect(evmAdapter.nativeName).toBe('Ether');
    expect(evmAdapter.viemChain).toEqual({ id: 11155111 });
    expect(mockEvmConnect).toHaveBeenCalledWith('https://sepolia.drpc.org');
    expect(pool.size).toBe(1);
  });

  // Test 2b: resolve Polygon adapter gets POL nativeSymbol
  it('resolve("ethereum", "polygon-mainnet", rpcUrl) creates EvmAdapter with POL nativeSymbol', async () => {
    const adapter = await pool.resolve('ethereum', 'polygon-mainnet', 'https://polygon.drpc.org');

    const evmAdapter = adapter as unknown as MockEvmAdapter;
    expect(evmAdapter.nativeSymbol).toBe('POL');
    expect(evmAdapter.nativeName).toBe('POL');
  });

  // Test 3: same chain:network returns cached instance (referential equality)
  it('returns the same instance for identical chain:network', async () => {
    const first = await pool.resolve('solana', 'devnet', 'https://api.devnet.solana.com');
    const second = await pool.resolve('solana', 'devnet', 'https://api.devnet.solana.com');

    expect(first).toBe(second); // referential equality
    expect(mockSolanaConnect).toHaveBeenCalledTimes(1); // only created once
    expect(pool.size).toBe(1);
  });

  // Test 4: different networks return different instances
  it('returns different instances for different networks', async () => {
    const devnet = await pool.resolve('solana', 'devnet', 'https://api.devnet.solana.com');
    const mainnet = await pool.resolve('solana', 'mainnet', 'https://api.mainnet.solana.com');

    expect(devnet).not.toBe(mainnet);
    expect(pool.size).toBe(2);
  });

  // Test 4b: different chains return different instances
  it('returns different instances for different chains', async () => {
    const solana = await pool.resolve('solana', 'devnet', 'https://api.devnet.solana.com');
    const evm = await pool.resolve('ethereum', 'ethereum-sepolia', 'https://sepolia.drpc.org');

    expect(solana).not.toBe(evm);
    expect(pool.size).toBe(2);
  });

  // Test 5: disconnectAll() calls disconnect on all cached adapters
  it('disconnectAll() disconnects all cached adapters', async () => {
    await pool.resolve('solana', 'devnet', 'https://api.devnet.solana.com');
    await pool.resolve('ethereum', 'ethereum-sepolia', 'https://sepolia.drpc.org');

    expect(pool.size).toBe(2);

    await pool.disconnectAll();

    expect(mockSolanaDisconnect).toHaveBeenCalledTimes(1);
    expect(mockEvmDisconnect).toHaveBeenCalledTimes(1);
    expect(pool.size).toBe(0);
  });

  // Test 5b: disconnectAll() swallows individual disconnect errors
  it('disconnectAll() swallows individual disconnect errors', async () => {
    mockSolanaDisconnect.mockRejectedValueOnce(new Error('disconnect failed'));

    await pool.resolve('solana', 'devnet', 'https://api.devnet.solana.com');
    await pool.resolve('ethereum', 'ethereum-sepolia', 'https://sepolia.drpc.org');

    // Should not throw even if one adapter fails to disconnect
    await expect(pool.disconnectAll()).resolves.toBeUndefined();
    expect(pool.size).toBe(0);
  });

  // Test 6: after disconnectAll(), next resolve creates fresh adapter
  it('creates a fresh adapter after disconnectAll()', async () => {
    const first = await pool.resolve('solana', 'devnet', 'https://api.devnet.solana.com');
    await pool.disconnectAll();

    const second = await pool.resolve('solana', 'devnet', 'https://api.devnet.solana.com');

    expect(second).not.toBe(first); // new instance
    expect(mockSolanaConnect).toHaveBeenCalledTimes(2); // connected twice
    expect(pool.size).toBe(1);
  });

  // Test 7: unknown chain throws
  it('throws for unknown chain type', async () => {
    await expect(
      pool.resolve('bitcoin' as any, 'mainnet' as any, 'https://btc.rpc.example'),
    ).rejects.toThrow('Unsupported chain: bitcoin');
  });

  // Test 7b: unknown EVM network throws
  it('throws for unknown EVM network', async () => {
    await expect(
      pool.resolve('ethereum', 'unknown-network' as any, 'https://rpc.example'),
    ).rejects.toThrow("No EVM chain config for network 'unknown-network'");
  });
});
