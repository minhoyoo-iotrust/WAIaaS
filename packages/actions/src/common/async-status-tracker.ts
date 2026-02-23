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
export interface AsyncTrackingResult {
  state: 'PENDING' | 'COMPLETED' | 'FAILED' | 'TIMEOUT';
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
