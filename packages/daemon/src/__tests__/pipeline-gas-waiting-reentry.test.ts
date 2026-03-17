/**
 * Pipeline GAS_WAITING re-entry supplementary tests.
 *
 * Tests the GasConditionTracker checkStatus behavior for re-entry scenarios:
 * - Combined maxGasPrice + maxPriorityFee condition
 * - Solana prioritization fee evaluation
 * - Polling sequence: PENDING -> PENDING -> COMPLETED
 * - Default timeout when not specified
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  GasConditionTracker,
  gasPriceCache,
} from '../pipeline/gas-condition-tracker.js';

// ---------------------------------------------------------------------------
// Mock fetch
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
      json: async () => ({ jsonrpc: '2.0', id: 1, error: { message: `Unknown: ${method}` } }),
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

describe('GAS_WAITING re-entry: combined conditions', () => {
  it('requires both maxGasPrice AND maxPriorityFee to be met for COMPLETED', async () => {
    // Gas price meets threshold but priority fee does not
    mockFetch({
      eth_gasPrice: '0x2540be400',         // 10 Gwei (meets 50 Gwei threshold)
      eth_maxPriorityFeePerGas: '0x77359400', // 2 Gwei (exceeds 1 Gwei threshold)
    });

    const result = await tracker.checkStatus('tx-1', {
      gasCondition: {
        maxGasPrice: '50000000000',     // 50 Gwei
        maxPriorityFee: '1000000000',   // 1 Gwei
      },
      gasConditionCreatedAt: Date.now(),
      chain: 'ethereum',
      rpcUrl: 'https://eth.rpc.test',
    });

    expect(result.state).toBe('PENDING');
  });

  it('returns COMPLETED when both maxGasPrice and maxPriorityFee are met', async () => {
    mockFetch({
      eth_gasPrice: '0x2540be400',         // 10 Gwei
      eth_maxPriorityFeePerGas: '0x3b9aca00', // 1 Gwei
    });

    const result = await tracker.checkStatus('tx-1', {
      gasCondition: {
        maxGasPrice: '50000000000',     // 50 Gwei
        maxPriorityFee: '2000000000',   // 2 Gwei
      },
      gasConditionCreatedAt: Date.now(),
      chain: 'ethereum',
      rpcUrl: 'https://eth.rpc.test',
    });

    expect(result.state).toBe('COMPLETED');
    expect(result.details?.reason).toBe('condition-met');
  });
});

describe('GAS_WAITING re-entry: Solana prioritization fee', () => {
  it('returns COMPLETED when Solana priority fee meets condition', async () => {
    mockFetch({
      getRecentPrioritizationFees: [
        { prioritizationFee: 100, slot: 1 },
        { prioritizationFee: 200, slot: 2 },
        { prioritizationFee: 150, slot: 3 },
      ],
    });

    const result = await tracker.checkStatus('tx-1', {
      gasCondition: { maxGasPrice: '1000' }, // threshold: 1000 micro-lamports
      gasConditionCreatedAt: Date.now(),
      chain: 'solana',
      rpcUrl: 'https://sol.rpc.test',
    });

    // Median of [100, 150, 200] = 150, which is <= 1000
    expect(result.state).toBe('COMPLETED');
  });

  it('returns PENDING when Solana priority fee exceeds condition', async () => {
    mockFetch({
      getRecentPrioritizationFees: [
        { prioritizationFee: 5000, slot: 1 },
        { prioritizationFee: 6000, slot: 2 },
        { prioritizationFee: 7000, slot: 3 },
      ],
    });

    const result = await tracker.checkStatus('tx-1', {
      gasCondition: { maxGasPrice: '1000' }, // threshold: 1000 micro-lamports
      gasConditionCreatedAt: Date.now(),
      chain: 'solana',
      rpcUrl: 'https://sol.rpc.test',
    });

    // Median of [5000, 6000, 7000] = 6000, which is > 1000
    expect(result.state).toBe('PENDING');
  });
});

describe('GAS_WAITING re-entry: polling sequence', () => {
  it('transitions PENDING -> PENDING -> COMPLETED as gas price drops', async () => {
    // Call 1: high gas price -> PENDING
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        jsonrpc: '2.0', id: 1,
        result: '0x174876e800', // 100 Gwei
      }),
    });

    const meta = {
      gasCondition: { maxGasPrice: '20000000000' }, // 20 Gwei threshold
      gasConditionCreatedAt: Date.now(),
      chain: 'ethereum',
      rpcUrl: 'https://eth.rpc.test',
    };

    const r1 = await tracker.checkStatus('tx-1', meta);
    expect(r1.state).toBe('PENDING');

    // Clear cache for next call
    gasPriceCache.clear();

    // Call 2: still high -> PENDING
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        jsonrpc: '2.0', id: 1,
        result: '0xba43b7400', // 50 Gwei
      }),
    });

    const r2 = await tracker.checkStatus('tx-1', meta);
    expect(r2.state).toBe('PENDING');

    // Clear cache
    gasPriceCache.clear();

    // Call 3: gas drops below threshold -> COMPLETED
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        jsonrpc: '2.0', id: 1,
        result: '0x4a817c800', // 20 Gwei (equal to threshold)
      }),
    });

    const r3 = await tracker.checkStatus('tx-1', meta);
    expect(r3.state).toBe('COMPLETED');
  });
});

describe('GAS_WAITING re-entry: default timeout', () => {
  it('uses default timeout of 3600 seconds when not specified', async () => {
    const createdAt = Date.now() - 3601 * 1000; // 3601 seconds ago
    const result = await tracker.checkStatus('tx-1', {
      gasCondition: { maxGasPrice: '50000000000' },
      gasConditionCreatedAt: createdAt,
      chain: 'ethereum',
      rpcUrl: 'https://eth.rpc.test',
    });

    expect(result.state).toBe('TIMEOUT');
    expect(result.details?.timeoutSec).toBe(3600);
  });
});

describe('GAS_WAITING re-entry: RPC error isolation', () => {
  it('returns PENDING on RPC error instead of throwing', async () => {
    mockFetchError();

    const result = await tracker.checkStatus('tx-1', {
      gasCondition: { maxGasPrice: '50000000000' },
      gasConditionCreatedAt: Date.now(),
      chain: 'ethereum',
      rpcUrl: 'https://eth.rpc.test',
    });

    expect(result.state).toBe('PENDING');
    expect(result.details?.reason).toBe('rpc-error');
  });
});
