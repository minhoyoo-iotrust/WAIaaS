/**
 * Async Status Tracker interface and types for DeFi async operations.
 *
 * IAsyncStatusTracker defines the contract for polling-based status tracking
 * of asynchronous blockchain operations (bridge transfers, unstaking, gas conditions).
 *
 * AsyncPollingService (daemon) uses these interfaces to generically poll
 * registered trackers at configurable intervals.
 *
 * @see internal/objectives/m28-00-defi-basic-protocol-design.md (DEFI-04 ASNC-01)
 */

import { z } from 'zod';

// ---------------------------------------------------------------------------
// Bridge status values (6-value enum for transactions.bridge_status column)
// ---------------------------------------------------------------------------

/**
 * All possible bridge_status values for the transactions table.
 * Used as SSoT for DB CHECK constraint and Zod schema.
 */
export const BRIDGE_STATUS_VALUES = [
  'PENDING',
  'COMPLETED',
  'FAILED',
  'BRIDGE_MONITORING',
  'TIMEOUT',
  'REFUNDED',
  'PARTIALLY_FILLED',
  'FILLED',
  'CANCELED',
  'SETTLED',
  'EXPIRED',
] as const;

/** Bridge status type derived from BRIDGE_STATUS_VALUES SSoT array. */
export type BridgeStatus = (typeof BRIDGE_STATUS_VALUES)[number];

/** Zod schema for bridge status validation (SSoT pattern). */
export const BridgeStatusEnum = z.enum(BRIDGE_STATUS_VALUES);

// ---------------------------------------------------------------------------
// Async tracking result
// ---------------------------------------------------------------------------

/**
 * Result returned by IAsyncStatusTracker.checkStatus().
 *
 * - state: current tracking state (PENDING continues polling, others are terminal or timeout)
 * - details: optional tracker-specific metadata merged into bridge_metadata
 * - nextIntervalOverride: optional override for next poll interval (ms)
 */
// ---------------------------------------------------------------------------
// Async tracking state values (9-state for external action tracking)
// ---------------------------------------------------------------------------

/**
 * All possible AsyncTrackingResult state values (9-state).
 * Superset of original 4-state (PENDING/COMPLETED/FAILED/TIMEOUT) with
 * 5 new states for off-chain action tracking:
 * - PARTIALLY_FILLED: order partially executed, continue polling
 * - FILLED: order fully executed
 * - CANCELED: order canceled
 * - SETTLED: trade settled (post-fill confirmation)
 * - EXPIRED: order expired
 */
export const ASYNC_TRACKING_STATE_VALUES = [
  'PENDING',
  'COMPLETED',
  'FAILED',
  'TIMEOUT',
  'PARTIALLY_FILLED',
  'FILLED',
  'CANCELED',
  'SETTLED',
  'EXPIRED',
] as const;

/** Async tracking state type (9-value union). */
export type AsyncTrackingState = (typeof ASYNC_TRACKING_STATE_VALUES)[number];

/** Zod schema for async tracking state validation. */
export const AsyncTrackingStateEnum = z.enum(ASYNC_TRACKING_STATE_VALUES);

/**
 * Check if a state is terminal (no more polling needed).
 * Terminal: COMPLETED, FILLED, SETTLED, CANCELED, EXPIRED, FAILED, TIMEOUT
 * Non-terminal: PENDING, PARTIALLY_FILLED (continue polling)
 */
export function isTerminalState(state: string): boolean {
  const terminals = new Set<string>([
    'COMPLETED', 'FILLED', 'SETTLED', 'CANCELED', 'EXPIRED', 'FAILED', 'TIMEOUT',
  ]);
  return terminals.has(state);
}

/**
 * Check if a state should continue polling.
 * Continue: PENDING, PARTIALLY_FILLED
 * Stop: all terminal states
 */
export function isContinuePolling(state: string): boolean {
  return state === 'PENDING' || state === 'PARTIALLY_FILLED';
}

export interface AsyncTrackingResult {
  state: AsyncTrackingState;
  details?: Record<string, unknown>;
  nextIntervalOverride?: number;
}

// ---------------------------------------------------------------------------
// IAsyncStatusTracker interface
// ---------------------------------------------------------------------------

/**
 * Contract for async status tracking implementations.
 *
 * Each tracker monitors a specific type of async operation:
 * - BridgeStatusTracker: cross-chain bridge transfer completion
 * - UnstakeStatusTracker: staking withdrawal completion
 * - GasConditionTracker: gas price condition satisfaction
 *
 * Trackers are registered with AsyncPollingService which calls checkStatus()
 * at pollIntervalMs intervals, up to maxAttempts times.
 */
export interface IAsyncStatusTracker {
  /** Check the current status of an async operation. */
  checkStatus(txId: string, metadata: Record<string, unknown>): Promise<AsyncTrackingResult>;

  /** Tracker name used for registration and lookup (e.g., 'bridge', 'unstake', 'gas-condition'). */
  readonly name: string;

  /** Maximum number of poll attempts before timeout transition. */
  readonly maxAttempts: number;

  /** Polling interval in milliseconds between checkStatus() calls. */
  readonly pollIntervalMs: number;

  /**
   * State transition when maxAttempts is exceeded:
   * - 'TIMEOUT': Mark bridge_status as TIMEOUT (terminal)
   * - 'BRIDGE_MONITORING': Transition to reduced-frequency monitoring
   * - 'CANCELLED': Cancel the transaction (for GAS_WAITING timeout)
   */
  readonly timeoutTransition: 'TIMEOUT' | 'BRIDGE_MONITORING' | 'CANCELLED';
}
