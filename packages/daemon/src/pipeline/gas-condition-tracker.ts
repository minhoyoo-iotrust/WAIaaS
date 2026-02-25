/**
 * GasConditionTracker - IAsyncStatusTracker for gas price condition evaluation.
 *
 * Monitors GAS_WAITING transactions and checks if current on-chain gas prices
 * satisfy the user-specified gas condition (maxGasPrice, maxPriorityFee).
 *
 * Chain-specific RPC queries:
 * - EVM: eth_gasPrice + eth_maxPriorityFeePerGas via JSON-RPC
 * - Solana: getRecentPrioritizationFees via JSON-RPC
 *
 * Uses raw fetch (no adapter dependency) with RPC URL from bridgeMetadata
 * (stored at GAS_WAITING entry time in stage3_5GasCondition).
 *
 * Batch evaluation: one RPC call per chain, evaluate all waiting txs.
 * Timeout: checked via metadata.gasConditionCreatedAt + timeout.
 *
 * @see packages/actions/src/common/async-status-tracker.ts (IAsyncStatusTracker)
 * @see 258-CONTEXT.md (architecture)
 */

import type { IAsyncStatusTracker, AsyncTrackingResult } from '@waiaas/actions';

// ---------------------------------------------------------------------------
// RPC query helpers (raw fetch, no adapter dependency)
// ---------------------------------------------------------------------------

/** Cache of recent gas price results per RPC URL (reduces redundant calls). */
const gasPriceCache = new Map<string, { gasPrice: bigint; priorityFee: bigint; fetchedAt: number }>();

/** Cache TTL in ms -- gas prices change per block (~12s EVM, ~0.4s Solana). */
const CACHE_TTL_MS = 10_000;

/**
 * JSON-RPC helper: POST a single JSON-RPC call to the given URL.
 * Returns the `result` field from the JSON-RPC response.
 */
async function jsonRpc(url: string, method: string, params: unknown[] = []): Promise<unknown> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method,
      params,
    }),
    signal: AbortSignal.timeout(5_000),
  });
  if (!res.ok) {
    throw new Error(`RPC ${method} failed: ${res.status} ${res.statusText}`);
  }
  const json = (await res.json()) as { result?: unknown; error?: { message: string } };
  if (json.error) {
    throw new Error(`RPC ${method} error: ${json.error.message}`);
  }
  return json.result;
}

/**
 * Query EVM gas prices: eth_gasPrice + eth_maxPriorityFeePerGas.
 * Returns { gasPrice, priorityFee } in wei (bigint).
 *
 * eth_maxPriorityFeePerGas may not be supported on all chains (e.g., pre-EIP-1559).
 * Falls back to 0n if the method fails.
 */
async function queryEvmGasPrice(rpcUrl: string): Promise<{ gasPrice: bigint; priorityFee: bigint }> {
  // Check cache
  const cached = gasPriceCache.get(rpcUrl);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return { gasPrice: cached.gasPrice, priorityFee: cached.priorityFee };
  }

  const gasPriceHex = (await jsonRpc(rpcUrl, 'eth_gasPrice')) as string;
  const gasPrice = BigInt(gasPriceHex);

  let priorityFee = 0n;
  try {
    const priorityFeeHex = (await jsonRpc(rpcUrl, 'eth_maxPriorityFeePerGas')) as string;
    priorityFee = BigInt(priorityFeeHex);
  } catch {
    // Pre-EIP-1559 chain or method not supported -- priorityFee stays 0
  }

  gasPriceCache.set(rpcUrl, { gasPrice, priorityFee, fetchedAt: Date.now() });
  return { gasPrice, priorityFee };
}

/**
 * Query Solana prioritization fees: getRecentPrioritizationFees.
 * Returns median prioritization fee in micro-lamports as bigint.
 *
 * The fee is returned as gasPrice for comparison with maxGasPrice.
 * priorityFee is always 0n for Solana (single fee model).
 */
async function querySolanaGasPrice(rpcUrl: string): Promise<{ gasPrice: bigint; priorityFee: bigint }> {
  // Check cache
  const cached = gasPriceCache.get(rpcUrl);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return { gasPrice: cached.gasPrice, priorityFee: cached.priorityFee };
  }

  const result = (await jsonRpc(rpcUrl, 'getRecentPrioritizationFees')) as Array<{
    prioritizationFee: number;
    slot: number;
  }>;

  // Calculate median fee from recent slots
  let medianFee = 0n;
  if (result && result.length > 0) {
    const fees = result.map((r) => r.prioritizationFee).sort((a, b) => a - b);
    const mid = Math.floor(fees.length / 2);
    medianFee = BigInt(fees.length % 2 !== 0 ? fees[mid]! : Math.floor((fees[mid - 1]! + fees[mid]!) / 2));
  }

  gasPriceCache.set(rpcUrl, { gasPrice: medianFee, priorityFee: 0n, fetchedAt: Date.now() });
  return { gasPrice: medianFee, priorityFee: 0n };
}

// ---------------------------------------------------------------------------
// GasConditionTracker
// ---------------------------------------------------------------------------

export class GasConditionTracker implements IAsyncStatusTracker {
  readonly name = 'gas-condition';
  readonly maxAttempts = 7200;        // 7200 x 30s = 60 hours (max_timeout_sec = 86400)
  readonly pollIntervalMs = 30_000;   // 30 seconds (overridden by gas_condition.poll_interval_sec)
  readonly timeoutTransition = 'CANCELLED' as const;

  /**
   * Check if gas condition is met for a GAS_WAITING transaction.
   *
   * Reads gasCondition from bridgeMetadata, queries RPC for current gas price,
   * and compares against the user-specified thresholds.
   *
   * Returns:
   * - COMPLETED: gas condition met (current price <= threshold)
   * - TIMEOUT: gasConditionCreatedAt + timeout exceeded
   * - PENDING: not yet met, continue polling
   */
  async checkStatus(_txId: string, metadata: Record<string, unknown>): Promise<AsyncTrackingResult> {
    // Parse gas condition from metadata
    const gasCondition = metadata.gasCondition as
      | { maxGasPrice?: string; maxPriorityFee?: string; timeout?: number }
      | undefined;

    if (!gasCondition) {
      // No gas condition in metadata -- should not happen, but handle gracefully
      return {
        state: 'COMPLETED',
        details: {
          reason: 'no-gas-condition',
          notificationEvent: 'TX_GAS_CONDITION_MET',
        },
      };
    }

    // Check timeout first
    const createdAt = metadata.gasConditionCreatedAt as number | undefined;
    const timeoutSec = gasCondition.timeout ?? 3600;
    if (createdAt) {
      const elapsed = (Date.now() - createdAt) / 1000;
      if (elapsed >= timeoutSec) {
        return {
          state: 'TIMEOUT',
          details: {
            reason: 'timeout',
            elapsed: Math.round(elapsed),
            timeoutSec,
            notificationEvent: 'TX_GAS_CONDITION_TIMEOUT',
          },
        };
      }
    }

    // Determine chain and RPC URL from metadata
    const chain = metadata.chain as string | undefined;
    const rpcUrl = metadata.rpcUrl as string | undefined;

    if (!rpcUrl) {
      // No RPC URL -- cannot query, remain pending
      return {
        state: 'PENDING',
        details: { reason: 'no-rpc-url' },
      };
    }

    try {
      // Query current gas price based on chain
      const { gasPrice, priorityFee } = chain === 'solana'
        ? await querySolanaGasPrice(rpcUrl)
        : await queryEvmGasPrice(rpcUrl);

      // Evaluate gas condition
      let conditionMet = true;

      if (gasCondition.maxGasPrice) {
        const threshold = BigInt(gasCondition.maxGasPrice);
        if (gasPrice > threshold) {
          conditionMet = false;
        }
      }

      if (gasCondition.maxPriorityFee && conditionMet) {
        const threshold = BigInt(gasCondition.maxPriorityFee);
        if (priorityFee > threshold) {
          conditionMet = false;
        }
      }

      if (conditionMet) {
        return {
          state: 'COMPLETED',
          details: {
            reason: 'condition-met',
            currentGasPrice: gasPrice.toString(),
            currentPriorityFee: priorityFee.toString(),
            notificationEvent: 'TX_GAS_CONDITION_MET',
          },
        };
      }

      // Not yet met -- report current prices
      return {
        state: 'PENDING',
        details: {
          currentGasPrice: gasPrice.toString(),
          currentPriorityFee: priorityFee.toString(),
        },
      };
    } catch (err) {
      // RPC error -- remain pending (error isolation in AsyncPollingService)
      return {
        state: 'PENDING',
        details: {
          reason: 'rpc-error',
          error: err instanceof Error ? err.message : String(err),
        },
      };
    }
  }
}

// Export for testing
export { queryEvmGasPrice, querySolanaGasPrice, gasPriceCache, jsonRpc };
