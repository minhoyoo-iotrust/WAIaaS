/**
 * Mock RPC Transport factory for Level 1 chain tests.
 *
 * Provides canned RPC responses in two modes:
 * - stateless: method name -> fixed response (repeatable)
 * - stateful:  queue-based sequential consumption (for multi-step flows)
 *
 * Works with vi.mock('@solana/kit') pattern from existing tests.
 */

import { vi } from 'vitest';

// ---- Types ----

export type CannedResponse = {
  method: string;
  result?: unknown; // success response value
  error?: { code: number; message: string }; // RPC error
  delay?: number; // ms delay before response
};

export interface MockRpcConfig {
  mode: 'stateless' | 'stateful';
  responses: CannedResponse[];
}

export interface MockRpcResult {
  /** Mock RPC object — use to set up vi.mock return */
  mockRpc: Record<string, ReturnType<typeof vi.fn>>;
  /** All recorded calls in order */
  calls: Array<{ method: string; params: unknown }>;
  /** Reset call history */
  resetCalls(): void;
}

// ---- Implementation ----

/**
 * Create a mock RPC config that generates vi.fn() mocks for each method.
 *
 * stateless: same method always returns the same response
 * stateful:  responses consumed sequentially from the queue
 */
export function createMockRpcConfig(config: MockRpcConfig): MockRpcResult {
  const calls: Array<{ method: string; params: unknown }> = [];
  const mockRpc: Record<string, ReturnType<typeof vi.fn>> = {};

  if (config.mode === 'stateless') {
    // Group responses by method name (first match wins for duplicates)
    const responseMap = new Map<string, CannedResponse>();
    for (const resp of config.responses) {
      if (!responseMap.has(resp.method)) {
        responseMap.set(resp.method, resp);
      }
    }

    for (const [method, resp] of responseMap) {
      mockRpc[method] = vi.fn().mockImplementation((...args: unknown[]) => {
        calls.push({ method, params: args });
        return {
          send: vi.fn().mockImplementation(async () => {
            if (resp.delay) {
              await new Promise((resolve) => setTimeout(resolve, resp.delay));
            }
            if (resp.error) {
              throw new Error(`RPC Error ${resp.error.code}: ${resp.error.message}`);
            }
            return resp.result;
          }),
        };
      });
    }
  } else {
    // stateful: queue-based
    const queue = [...config.responses];
    let queueIndex = 0;

    // Create mock functions for each unique method in the queue
    const methods = new Set(config.responses.map((r) => r.method));
    for (const method of methods) {
      mockRpc[method] = vi.fn().mockImplementation((...args: unknown[]) => {
        calls.push({ method, params: args });
        return {
          send: vi.fn().mockImplementation(async () => {
            // Find next response matching this method in queue order
            while (queueIndex < queue.length) {
              const resp = queue[queueIndex]!;
              if (resp.method === method) {
                queueIndex++;
                if (resp.delay) {
                  await new Promise((resolve) => setTimeout(resolve, resp.delay));
                }
                if (resp.error) {
                  throw new Error(`RPC Error ${resp.error.code}: ${resp.error.message}`);
                }
                return resp.result;
              }
              // If method doesn't match, skip (another method's mock will consume it)
              break;
            }
            // Fallback: no matching response in queue
            throw new Error(`Mock RPC: no queued response for ${method} at index ${queueIndex}`);
          }),
        };
      });
    }
  }

  return {
    mockRpc,
    calls,
    resetCalls() {
      calls.length = 0;
    },
  };
}
