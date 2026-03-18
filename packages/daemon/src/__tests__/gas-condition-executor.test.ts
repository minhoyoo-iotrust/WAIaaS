/**
 * Gas Conditional Executor supplementary tests.
 *
 * Extends gas-condition-tracker.test.ts with:
 * - Gas price cache TTL verification
 * - Empty Solana prioritization fees response
 * - Exact boundary conditions (gasPrice == maxGasPrice)
 * - Multiple sequential checkStatus calls with cache
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  GasConditionTracker,
  gasPriceCache,
  queryEvmGasPrice,
} from '../pipeline/gas-condition-tracker.js';

// ---------------------------------------------------------------------------
// Mock fetch
// ---------------------------------------------------------------------------

const originalFetch = globalThis.fetch;

function mockFetchWithCounting() {
  let callCount = 0;
  globalThis.fetch = vi.fn().mockImplementation(async () => {
    callCount++;
    return {
      ok: true,
      json: async () => ({
        jsonrpc: '2.0', id: 1,
        result: '0x2540be400', // 10 Gwei
      }),
    };
  });
  return { getCallCount: () => callCount };
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

let tracker: GasConditionTracker;

beforeEach(() => {
  tracker = new GasConditionTracker();
  gasPriceCache.clear();
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  gasPriceCache.clear();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Gas Conditional Executor: cache TTL', () => {
  it('reuses cached gas price within TTL window', async () => {
    const { getCallCount } = mockFetchWithCounting();

    const meta = {
      gasCondition: { maxGasPrice: '50000000000' },
      gasConditionCreatedAt: Date.now(),
      chain: 'ethereum',
      rpcUrl: 'https://eth.rpc.test',
    };

    // First call
    await tracker.checkStatus('tx-1', meta);
    const firstCallCount = getCallCount();

    // Second call (within cache TTL) -- should not fetch again
    await tracker.checkStatus('tx-2', meta);
    const secondCallCount = getCallCount();

    // fetch was called for first call but not second (cached)
    expect(firstCallCount).toBeGreaterThan(0);
    expect(secondCallCount).toBe(firstCallCount);
  });

  it('fetches again after cache expiry', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        jsonrpc: '2.0', id: 1,
        result: '0x2540be400', // 10 Gwei
      }),
    });

    const rpcUrl = 'https://eth.rpc.test';

    // Populate cache with expired entry
    gasPriceCache.set(rpcUrl, {
      gasPrice: 10_000_000_000n,
      priorityFee: 0n,
      fetchedAt: Date.now() - 20_000, // 20 seconds ago (>10s TTL)
    });

    // queryEvmGasPrice should fetch again
    const result = await queryEvmGasPrice(rpcUrl);
    expect(result.gasPrice).toBe(10_000_000_000n);
    expect(globalThis.fetch).toHaveBeenCalled();
  });
});

describe('Gas Conditional Executor: boundary conditions', () => {
  it('returns COMPLETED when gasPrice exactly equals maxGasPrice', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        jsonrpc: '2.0', id: 1,
        result: '0x2540be400', // 10 Gwei (exactly matches threshold)
      }),
    });

    const result = await tracker.checkStatus('tx-1', {
      gasCondition: { maxGasPrice: '10000000000' }, // 10 Gwei
      gasConditionCreatedAt: Date.now(),
      chain: 'ethereum',
      rpcUrl: 'https://eth.rpc.test',
    });

    expect(result.state).toBe('COMPLETED');
    expect(result.details?.reason).toBe('condition-met');
  });

  it('returns PENDING when gasPrice is 1 wei above maxGasPrice', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        jsonrpc: '2.0', id: 1,
        result: '0x' + (10_000_000_001n).toString(16), // 10 Gwei + 1 wei
      }),
    });

    const result = await tracker.checkStatus('tx-1', {
      gasCondition: { maxGasPrice: '10000000000' }, // 10 Gwei
      gasConditionCreatedAt: Date.now(),
      chain: 'ethereum',
      rpcUrl: 'https://eth.rpc.test',
    });

    expect(result.state).toBe('PENDING');
  });
});

describe('Gas Conditional Executor: Solana edge cases', () => {
  it('handles empty prioritization fees array (returns 0n gasPrice)', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        jsonrpc: '2.0', id: 1,
        result: [], // No recent prioritization fees
      }),
    });

    const result = await tracker.checkStatus('tx-1', {
      gasCondition: { maxGasPrice: '1000' },
      gasConditionCreatedAt: Date.now(),
      chain: 'solana',
      rpcUrl: 'https://sol.rpc.test',
    });

    // Empty fees -> median = 0 -> 0 <= 1000 -> COMPLETED
    expect(result.state).toBe('COMPLETED');
  });

  it('handles single-element prioritization fees array', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        jsonrpc: '2.0', id: 1,
        result: [{ prioritizationFee: 500, slot: 1 }],
      }),
    });

    const result = await tracker.checkStatus('tx-1', {
      gasCondition: { maxGasPrice: '1000' },
      gasConditionCreatedAt: Date.now(),
      chain: 'solana',
      rpcUrl: 'https://sol.rpc.test',
    });

    // Single fee = 500 <= 1000 -> COMPLETED
    expect(result.state).toBe('COMPLETED');
  });
});

describe('Gas Conditional Executor: timeout at exact boundary', () => {
  it('returns TIMEOUT when elapsed exactly equals timeout', async () => {
    const timeoutSec = 3600;
    const createdAt = Date.now() - timeoutSec * 1000;

    const result = await tracker.checkStatus('tx-1', {
      gasCondition: { maxGasPrice: '50000000000', timeout: timeoutSec },
      gasConditionCreatedAt: createdAt,
      chain: 'ethereum',
      rpcUrl: 'https://eth.rpc.test',
    });

    expect(result.state).toBe('TIMEOUT');
  });
});
