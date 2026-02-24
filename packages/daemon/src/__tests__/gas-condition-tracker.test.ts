/**
 * GasConditionTracker unit tests.
 *
 * Tests cover:
 * 1. COMPLETED when no gasCondition in metadata (graceful handling)
 * 2. TIMEOUT when gasConditionCreatedAt + timeout exceeded
 * 3. PENDING when no rpcUrl in metadata
 * 4. COMPLETED when EVM gas price meets maxGasPrice condition
 * 5. PENDING when EVM gas price exceeds maxGasPrice
 * 6. COMPLETED when EVM priority fee meets maxPriorityFee condition
 * 7. PENDING when EVM priority fee exceeds maxPriorityFee
 * 8. COMPLETED when Solana prioritization fee meets condition
 * 9. PENDING on RPC error (error isolation)
 * 10. Tracker interface properties (name, maxAttempts, timeoutTransition)
 * 11. Gas price cache reuse within TTL
 *
 * Uses vi.fn() to mock global fetch for JSON-RPC calls.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  GasConditionTracker,
  gasPriceCache,
} from '../pipeline/gas-condition-tracker.js';

// ---------------------------------------------------------------------------
// Mock fetch helper
// ---------------------------------------------------------------------------

const originalFetch = globalThis.fetch;

function mockFetch(responses: Record<string, unknown>) {
  globalThis.fetch = vi.fn().mockImplementation(async (_url: string, opts: { body: string }) => {
    const body = JSON.parse(opts.body);
    const method = body.method as string;
    if (method in responses) {
      return {
        ok: true,
        json: async () => ({ jsonrpc: '2.0', id: 1, result: responses[method] }),
      };
    }
    return {
      ok: true,
      json: async () => ({ jsonrpc: '2.0', id: 1, error: { message: `Unknown method: ${method}` } }),
    };
  });
}

function mockFetchError() {
  globalThis.fetch = vi.fn().mockRejectedValue(new Error('Network error'));
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

describe('GasConditionTracker: interface properties', () => {
  it('has name gas-condition', () => {
    expect(tracker.name).toBe('gas-condition');
  });

  it('has timeoutTransition CANCELLED', () => {
    expect(tracker.timeoutTransition).toBe('CANCELLED');
  });

  it('has pollIntervalMs of 30 seconds', () => {
    expect(tracker.pollIntervalMs).toBe(30_000);
  });

  it('has maxAttempts of 7200', () => {
    expect(tracker.maxAttempts).toBe(7200);
  });
});

describe('GasConditionTracker: no gasCondition in metadata', () => {
  it('returns COMPLETED when metadata has no gasCondition', async () => {
    const result = await tracker.checkStatus('tx-1', {});
    expect(result.state).toBe('COMPLETED');
    expect(result.details?.reason).toBe('no-gas-condition');
    expect(result.details?.notificationEvent).toBe('TX_GAS_CONDITION_MET');
  });
});

describe('GasConditionTracker: timeout check', () => {
  it('returns TIMEOUT when elapsed > timeout', async () => {
    const createdAt = Date.now() - 4000 * 1000; // 4000 seconds ago
    const result = await tracker.checkStatus('tx-1', {
      gasCondition: { maxGasPrice: '50000000000', timeout: 3600 },
      gasConditionCreatedAt: createdAt,
      chain: 'ethereum',
      rpcUrl: 'https://eth.rpc.test',
    });
    expect(result.state).toBe('TIMEOUT');
    expect(result.details?.reason).toBe('timeout');
    expect(result.details?.timeoutSec).toBe(3600);
  });

  it('does not timeout when elapsed < timeout', async () => {
    const createdAt = Date.now() - 100 * 1000; // 100 seconds ago
    mockFetch({
      eth_gasPrice: '0x174876e800', // 100 Gwei -- higher than threshold
    });

    const result = await tracker.checkStatus('tx-1', {
      gasCondition: { maxGasPrice: '10000000000', timeout: 3600 }, // 10 Gwei threshold
      gasConditionCreatedAt: createdAt,
      chain: 'ethereum',
      rpcUrl: 'https://eth.rpc.test',
    });
    expect(result.state).toBe('PENDING');
  });
});

describe('GasConditionTracker: no rpcUrl', () => {
  it('returns PENDING when no rpcUrl in metadata', async () => {
    const result = await tracker.checkStatus('tx-1', {
      gasCondition: { maxGasPrice: '50000000000' },
      gasConditionCreatedAt: Date.now(),
      chain: 'ethereum',
    });
    expect(result.state).toBe('PENDING');
    expect(result.details?.reason).toBe('no-rpc-url');
  });
});

describe('GasConditionTracker: EVM gas price evaluation', () => {
  it('returns COMPLETED when gasPrice <= maxGasPrice', async () => {
    mockFetch({
      eth_gasPrice: '0x2540be400', // 10 Gwei
      eth_maxPriorityFeePerGas: '0x3b9aca00', // 1 Gwei
    });

    const result = await tracker.checkStatus('tx-1', {
      gasCondition: { maxGasPrice: '50000000000' }, // 50 Gwei threshold
      gasConditionCreatedAt: Date.now(),
      chain: 'ethereum',
      rpcUrl: 'https://eth.rpc.test',
    });
    expect(result.state).toBe('COMPLETED');
    expect(result.details?.reason).toBe('condition-met');
    expect(result.details?.currentGasPrice).toBe('10000000000');
    expect(result.details?.notificationEvent).toBe('TX_GAS_CONDITION_MET');
  });

  it('returns PENDING when gasPrice > maxGasPrice', async () => {
    mockFetch({
      eth_gasPrice: '0xba43b7400', // 50 Gwei
      eth_maxPriorityFeePerGas: '0x3b9aca00', // 1 Gwei
    });

    const result = await tracker.checkStatus('tx-1', {
      gasCondition: { maxGasPrice: '10000000000' }, // 10 Gwei threshold
      gasConditionCreatedAt: Date.now(),
      chain: 'ethereum',
      rpcUrl: 'https://eth.rpc.test',
    });
    expect(result.state).toBe('PENDING');
    expect(result.details?.currentGasPrice).toBe('50000000000');
  });

  it('returns COMPLETED when gasPrice matches maxGasPrice exactly', async () => {
    mockFetch({
      eth_gasPrice: '0x2540be400', // 10 Gwei
      eth_maxPriorityFeePerGas: '0x0',
    });

    const result = await tracker.checkStatus('tx-1', {
      gasCondition: { maxGasPrice: '10000000000' }, // 10 Gwei threshold -- exactly equal
      gasConditionCreatedAt: Date.now(),
      chain: 'ethereum',
      rpcUrl: 'https://eth.rpc.test',
    });
    expect(result.state).toBe('COMPLETED');
    expect(result.details?.reason).toBe('condition-met');
  });
});

describe('GasConditionTracker: EVM priority fee evaluation', () => {
  it('returns COMPLETED when both gasPrice and priorityFee meet conditions', async () => {
    mockFetch({
      eth_gasPrice: '0x2540be400', // 10 Gwei
      eth_maxPriorityFeePerGas: '0x3b9aca00', // 1 Gwei
    });

    const result = await tracker.checkStatus('tx-1', {
      gasCondition: { maxGasPrice: '50000000000', maxPriorityFee: '2000000000' }, // 50 Gwei, 2 Gwei
      gasConditionCreatedAt: Date.now(),
      chain: 'ethereum',
      rpcUrl: 'https://eth.rpc.test',
    });
    expect(result.state).toBe('COMPLETED');
    expect(result.details?.currentPriorityFee).toBe('1000000000');
  });

  it('returns PENDING when priorityFee > maxPriorityFee', async () => {
    mockFetch({
      eth_gasPrice: '0x2540be400', // 10 Gwei (under threshold)
      eth_maxPriorityFeePerGas: '0x12a05f200', // 5 Gwei (over threshold)
    });

    const result = await tracker.checkStatus('tx-1', {
      gasCondition: { maxGasPrice: '50000000000', maxPriorityFee: '2000000000' }, // 50 Gwei, 2 Gwei
      gasConditionCreatedAt: Date.now(),
      chain: 'ethereum',
      rpcUrl: 'https://eth.rpc.test',
    });
    expect(result.state).toBe('PENDING');
    expect(result.details?.currentPriorityFee).toBe('5000000000');
  });

  it('returns PENDING when gasPrice exceeds threshold even if priorityFee is ok', async () => {
    mockFetch({
      eth_gasPrice: '0xba43b7400', // 50 Gwei (over threshold)
      eth_maxPriorityFeePerGas: '0x3b9aca00', // 1 Gwei (under threshold)
    });

    const result = await tracker.checkStatus('tx-1', {
      gasCondition: { maxGasPrice: '10000000000', maxPriorityFee: '2000000000' },
      gasConditionCreatedAt: Date.now(),
      chain: 'ethereum',
      rpcUrl: 'https://eth.rpc.test',
    });
    expect(result.state).toBe('PENDING');
  });
});

describe('GasConditionTracker: Solana prioritization fee', () => {
  it('returns COMPLETED when Solana fee <= maxGasPrice', async () => {
    mockFetch({
      getRecentPrioritizationFees: [
        { prioritizationFee: 100, slot: 1 },
        { prioritizationFee: 200, slot: 2 },
        { prioritizationFee: 300, slot: 3 },
      ],
    });

    const result = await tracker.checkStatus('tx-1', {
      gasCondition: { maxGasPrice: '500' }, // 500 micro-lamports threshold
      gasConditionCreatedAt: Date.now(),
      chain: 'solana',
      rpcUrl: 'https://solana.rpc.test',
    });
    expect(result.state).toBe('COMPLETED');
    expect(result.details?.reason).toBe('condition-met');
    expect(result.details?.currentGasPrice).toBe('200'); // median of [100, 200, 300]
  });

  it('returns PENDING when Solana fee > maxGasPrice', async () => {
    mockFetch({
      getRecentPrioritizationFees: [
        { prioritizationFee: 1000, slot: 1 },
        { prioritizationFee: 2000, slot: 2 },
        { prioritizationFee: 3000, slot: 3 },
      ],
    });

    const result = await tracker.checkStatus('tx-1', {
      gasCondition: { maxGasPrice: '500' }, // 500 micro-lamports threshold
      gasConditionCreatedAt: Date.now(),
      chain: 'solana',
      rpcUrl: 'https://solana.rpc.test',
    });
    expect(result.state).toBe('PENDING');
    expect(result.details?.currentGasPrice).toBe('2000'); // median
  });

  it('returns COMPLETED when Solana returns empty fees array', async () => {
    mockFetch({
      getRecentPrioritizationFees: [],
    });

    const result = await tracker.checkStatus('tx-1', {
      gasCondition: { maxGasPrice: '500' },
      gasConditionCreatedAt: Date.now(),
      chain: 'solana',
      rpcUrl: 'https://solana.rpc.test',
    });
    // Empty array -> median = 0 -> 0 <= 500 -> COMPLETED
    expect(result.state).toBe('COMPLETED');
    expect(result.details?.currentGasPrice).toBe('0');
  });
});

describe('GasConditionTracker: RPC error handling', () => {
  it('returns PENDING on network error', async () => {
    mockFetchError();

    const result = await tracker.checkStatus('tx-1', {
      gasCondition: { maxGasPrice: '50000000000' },
      gasConditionCreatedAt: Date.now(),
      chain: 'ethereum',
      rpcUrl: 'https://eth.rpc.test',
    });
    expect(result.state).toBe('PENDING');
    expect(result.details?.reason).toBe('rpc-error');
    expect(result.details?.error).toContain('Network error');
  });
});

describe('GasConditionTracker: gas price cache', () => {
  it('reuses cached gas price within TTL', async () => {
    mockFetch({
      eth_gasPrice: '0x2540be400', // 10 Gwei
      eth_maxPriorityFeePerGas: '0x3b9aca00', // 1 Gwei
    });

    // First call -- populates cache
    await tracker.checkStatus('tx-1', {
      gasCondition: { maxGasPrice: '50000000000' },
      gasConditionCreatedAt: Date.now(),
      chain: 'ethereum',
      rpcUrl: 'https://eth.rpc.test',
    });

    // Second call -- should use cache (fetch called only for first)
    const result = await tracker.checkStatus('tx-2', {
      gasCondition: { maxGasPrice: '50000000000' },
      gasConditionCreatedAt: Date.now(),
      chain: 'ethereum',
      rpcUrl: 'https://eth.rpc.test',
    });

    expect(result.state).toBe('COMPLETED');
    // fetch should be called only once (2 RPC calls: eth_gasPrice + eth_maxPriorityFeePerGas)
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
  });
});
