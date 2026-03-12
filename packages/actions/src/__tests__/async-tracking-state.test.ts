/**
 * Tests for AsyncTrackingResult 9-state extension.
 *
 * Covers:
 * 1. AsyncTrackingResult 9-state values
 * 2. BRIDGE_STATUS_VALUES 11-value array
 * 3. AsyncTrackingStateEnum Zod enum parsing
 * 4. isTerminalState() utility
 * 5. isContinuePolling() utility
 * 6. Backward compat with existing 4-state subset
 *
 * Plan 389-01 Task 1
 */

import { describe, it, expect } from 'vitest';
import {
  BRIDGE_STATUS_VALUES,
  BridgeStatusEnum,
  AsyncTrackingStateEnum,
  isTerminalState,
  isContinuePolling,
} from '../common/async-status-tracker.js';
import type {
  AsyncTrackingResult,
  IAsyncStatusTracker,
} from '../common/async-status-tracker.js';

// ---------------------------------------------------------------------------
// BRIDGE_STATUS_VALUES 11-value
// ---------------------------------------------------------------------------

describe('BRIDGE_STATUS_VALUES', () => {
  it('contains 11 values', () => {
    expect(BRIDGE_STATUS_VALUES).toHaveLength(11);
  });

  it('includes original 6 values', () => {
    const original = ['PENDING', 'COMPLETED', 'FAILED', 'BRIDGE_MONITORING', 'TIMEOUT', 'REFUNDED'];
    for (const v of original) {
      expect(BRIDGE_STATUS_VALUES).toContain(v);
    }
  });

  it('includes 5 new external action values', () => {
    const newValues = ['PARTIALLY_FILLED', 'FILLED', 'CANCELED', 'SETTLED', 'EXPIRED'];
    for (const v of newValues) {
      expect(BRIDGE_STATUS_VALUES).toContain(v);
    }
  });

  it('BridgeStatusEnum parses all 11 values', () => {
    for (const v of BRIDGE_STATUS_VALUES) {
      expect(BridgeStatusEnum.safeParse(v).success).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// AsyncTrackingStateEnum 9-value
// ---------------------------------------------------------------------------

describe('AsyncTrackingStateEnum', () => {
  const allStates = [
    'PENDING', 'COMPLETED', 'FAILED', 'TIMEOUT',
    'PARTIALLY_FILLED', 'FILLED', 'CANCELED', 'SETTLED', 'EXPIRED',
  ];

  it('parses all 9 states', () => {
    for (const s of allStates) {
      expect(AsyncTrackingStateEnum.safeParse(s).success).toBe(true);
    }
  });

  it('rejects invalid state', () => {
    expect(AsyncTrackingStateEnum.safeParse('REFUNDED').success).toBe(false);
    expect(AsyncTrackingStateEnum.safeParse('BRIDGE_MONITORING').success).toBe(false);
    expect(AsyncTrackingStateEnum.safeParse('INVALID').success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// isTerminalState()
// ---------------------------------------------------------------------------

describe('isTerminalState', () => {
  it('returns true for terminal states', () => {
    const terminals = ['COMPLETED', 'FILLED', 'SETTLED', 'CANCELED', 'EXPIRED', 'FAILED', 'TIMEOUT'];
    for (const s of terminals) {
      expect(isTerminalState(s)).toBe(true);
    }
  });

  it('returns false for non-terminal states', () => {
    expect(isTerminalState('PENDING')).toBe(false);
    expect(isTerminalState('PARTIALLY_FILLED')).toBe(false);
  });

  it('returns false for unknown state', () => {
    expect(isTerminalState('UNKNOWN')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// isContinuePolling()
// ---------------------------------------------------------------------------

describe('isContinuePolling', () => {
  it('returns true for PENDING', () => {
    expect(isContinuePolling('PENDING')).toBe(true);
  });

  it('returns true for PARTIALLY_FILLED', () => {
    expect(isContinuePolling('PARTIALLY_FILLED')).toBe(true);
  });

  it('returns false for terminal states', () => {
    const terminals = ['COMPLETED', 'FILLED', 'SETTLED', 'CANCELED', 'EXPIRED', 'FAILED', 'TIMEOUT'];
    for (const s of terminals) {
      expect(isContinuePolling(s)).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------
// AsyncTrackingResult type compatibility
// ---------------------------------------------------------------------------

describe('AsyncTrackingResult type compatibility', () => {
  it('accepts original 4-state values', () => {
    const results: AsyncTrackingResult[] = [
      { state: 'PENDING' },
      { state: 'COMPLETED', details: { hash: '0x123' } },
      { state: 'FAILED', details: { error: 'timeout' } },
      { state: 'TIMEOUT' },
    ];
    expect(results).toHaveLength(4);
    expect(results[0]!.state).toBe('PENDING');
  });

  it('accepts 5 new state values', () => {
    const results: AsyncTrackingResult[] = [
      { state: 'PARTIALLY_FILLED', details: { filledPct: 50 } },
      { state: 'FILLED' },
      { state: 'CANCELED' },
      { state: 'SETTLED' },
      { state: 'EXPIRED' },
    ];
    expect(results).toHaveLength(5);
  });

  it('supports nextIntervalOverride', () => {
    const result: AsyncTrackingResult = {
      state: 'PARTIALLY_FILLED',
      nextIntervalOverride: 5000,
    };
    expect(result.nextIntervalOverride).toBe(5000);
  });
});

// ---------------------------------------------------------------------------
// IAsyncStatusTracker compat (no changes)
// ---------------------------------------------------------------------------

describe('IAsyncStatusTracker backward compat', () => {
  it('existing 4-state tracker still compiles and works', () => {
    const tracker: IAsyncStatusTracker = {
      name: 'bridge',
      maxAttempts: 240,
      pollIntervalMs: 30_000,
      timeoutTransition: 'BRIDGE_MONITORING',
      checkStatus: async () => ({ state: 'PENDING' }),
    };
    expect(tracker.name).toBe('bridge');
    expect(tracker.maxAttempts).toBe(240);
  });
});
