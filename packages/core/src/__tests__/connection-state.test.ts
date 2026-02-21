import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  calculateDelay,
  DEFAULT_RECONNECT_CONFIG,
  reconnectLoop,
  type ConnectionState,
  type ReconnectConfig,
} from '../interfaces/connection-state.js';

// -- calculateDelay --

describe('calculateDelay', () => {
  const noJitterConfig: ReconnectConfig = {
    initialDelayMs: 1000,
    maxDelayMs: 60_000,
    maxAttempts: Infinity,
    jitterFactor: 0,
    pollingFallbackThreshold: 3,
  };

  it('returns exact exponential values with zero jitter', () => {
    expect(calculateDelay(0, noJitterConfig)).toBe(1000); // 1000 * 2^0
    expect(calculateDelay(1, noJitterConfig)).toBe(2000); // 1000 * 2^1
    expect(calculateDelay(2, noJitterConfig)).toBe(4000); // 1000 * 2^2
    expect(calculateDelay(3, noJitterConfig)).toBe(8000); // 1000 * 2^3
    expect(calculateDelay(4, noJitterConfig)).toBe(16000); // 1000 * 2^4
    expect(calculateDelay(5, noJitterConfig)).toBe(32000); // 1000 * 2^5
  });

  it('caps at maxDelayMs', () => {
    // 1000 * 2^10 = 1,024,000 > 60,000 → should cap
    expect(calculateDelay(10, noJitterConfig)).toBe(60_000);
    expect(calculateDelay(20, noJitterConfig)).toBe(60_000);
  });

  it('applies jitter within +/- jitterFactor range for attempt 0', () => {
    const config: ReconnectConfig = { ...DEFAULT_RECONNECT_CONFIG };
    // baseDelay for attempt 0 = 1000, jitter = +/-30% → range [700, 1300]
    const results: number[] = [];
    for (let i = 0; i < 100; i++) {
      results.push(calculateDelay(0, config));
    }
    // All values should be within [700, 1300]
    for (const r of results) {
      expect(r).toBeGreaterThanOrEqual(700);
      expect(r).toBeLessThanOrEqual(1300);
    }
    // At least some variation should exist (not all same value)
    const unique = new Set(results);
    expect(unique.size).toBeGreaterThan(1);
  });

  it('never returns less than 100ms (floor clamp)', () => {
    const tinyConfig: ReconnectConfig = {
      initialDelayMs: 1,
      maxDelayMs: 10,
      maxAttempts: Infinity,
      jitterFactor: 0.3,
      pollingFallbackThreshold: 3,
    };
    for (let i = 0; i < 50; i++) {
      expect(calculateDelay(0, tinyConfig)).toBeGreaterThanOrEqual(100);
    }
  });

  it('returns integer values', () => {
    for (let i = 0; i < 20; i++) {
      const result = calculateDelay(i, DEFAULT_RECONNECT_CONFIG);
      expect(Number.isInteger(result)).toBe(true);
    }
  });
});

// -- DEFAULT_RECONNECT_CONFIG --

describe('DEFAULT_RECONNECT_CONFIG', () => {
  it('has correct defaults', () => {
    expect(DEFAULT_RECONNECT_CONFIG).toEqual({
      initialDelayMs: 1000,
      maxDelayMs: 60_000,
      maxAttempts: Infinity,
      jitterFactor: 0.3,
      pollingFallbackThreshold: 3,
    });
  });
});

// -- reconnectLoop --

describe('reconnectLoop', () => {
  // Use fast config to keep tests snappy
  const fastConfig: ReconnectConfig = {
    initialDelayMs: 1,
    maxDelayMs: 10,
    maxAttempts: 10,
    jitterFactor: 0,
    pollingFallbackThreshold: 3,
  };

  let states: ConnectionState[];

  beforeEach(() => {
    states = [];
  });

  function onStateChange(state: ConnectionState): void {
    states.push(state);
  }

  it('transitions to WS_ACTIVE on successful connect', async () => {
    const controller = new AbortController();
    const subscriber = {
      connect: vi.fn(async () => {
      }),
      waitForDisconnect: vi.fn(async () => {
        // Abort after first successful cycle
        controller.abort();
      }),
    };

    await reconnectLoop(subscriber, fastConfig, onStateChange, controller.signal);

    expect(states).toContain('RECONNECTING');
    expect(states).toContain('WS_ACTIVE');
    expect(subscriber.connect).toHaveBeenCalledOnce();
    expect(subscriber.waitForDisconnect).toHaveBeenCalledOnce();
  });

  it('transitions to POLLING_FALLBACK after pollingFallbackThreshold consecutive failures', async () => {
    const subscriber = {
      connect: vi.fn(async () => {
        throw new Error('connection failed');
      }),
      waitForDisconnect: vi.fn(async () => {}),
    };

    const config: ReconnectConfig = {
      ...fastConfig,
      maxAttempts: 5,
      pollingFallbackThreshold: 3,
    };

    await reconnectLoop(subscriber, config, onStateChange);

    // Should see: RECONNECTING (attempt 1 fail), RECONNECTING (attempt 2 fail),
    // RECONNECTING (attempt 3 fail → POLLING_FALLBACK), ...
    expect(states.filter((s) => s === 'RECONNECTING').length).toBeGreaterThanOrEqual(3);
    expect(states).toContain('POLLING_FALLBACK');
  });

  it('resets attempt counter on successful connect', async () => {
    let connectCallCount = 0;
    const controller = new AbortController();

    const subscriber = {
      connect: vi.fn(async () => {
        connectCallCount++;
        // Call 1: fail, Call 2: fail, Call 3: succeed, Call 4: fail, Call 5: succeed (abort after)
        if (connectCallCount === 1 || connectCallCount === 2) {
          throw new Error('connection failed');
        }
        if (connectCallCount === 4) {
          throw new Error('connection failed again');
        }
        // connectCallCount 3 and 5: success
      }),
      waitForDisconnect: vi.fn(async () => {
        if (connectCallCount >= 5) {
          controller.abort();
        }
        // Returns immediately, simulating disconnect
      }),
    };

    await reconnectLoop(subscriber, { ...fastConfig, maxAttempts: 20 }, onStateChange, controller.signal);

    // After connect #3 succeeds, attempt resets to 0.
    // Connect #4 fails → attempt goes to 1 (NOT 4), which is < pollingFallbackThreshold (3)
    // Connect #5 succeeds → attempt resets to 0 again.
    // So POLLING_FALLBACK should NOT appear because counter was reset before reaching threshold.
    expect(states).toContain('WS_ACTIVE');
    // Verify WS_ACTIVE appears at least twice (both successful connects)
    const wsActiveCount = states.filter((s) => s === 'WS_ACTIVE').length;
    expect(wsActiveCount).toBeGreaterThanOrEqual(2);
    // No POLLING_FALLBACK at all -- counter never reached threshold
    expect(states).not.toContain('POLLING_FALLBACK');
  });

  it('respects AbortSignal -- aborted signal stops the loop', async () => {
    const controller = new AbortController();
    controller.abort(); // Pre-abort

    const subscriber = {
      connect: vi.fn(async () => {}),
      waitForDisconnect: vi.fn(async () => {}),
    };

    await reconnectLoop(subscriber, fastConfig, onStateChange, controller.signal);

    // Should not have called connect at all
    expect(subscriber.connect).not.toHaveBeenCalled();
    expect(states).toEqual([]);
  });

  it('respects maxAttempts -- returns after N attempts', async () => {
    const subscriber = {
      connect: vi.fn(async () => {
        throw new Error('always fails');
      }),
      waitForDisconnect: vi.fn(async () => {}),
    };

    const config: ReconnectConfig = {
      ...fastConfig,
      maxAttempts: 3,
    };

    await reconnectLoop(subscriber, config, onStateChange);

    // Should attempt exactly 3 times then give up
    expect(subscriber.connect).toHaveBeenCalledTimes(3);
  });

  it('loops back to reconnect after disconnect from waitForDisconnect', async () => {
    let connectCalls = 0;
    const controller = new AbortController();

    const subscriber = {
      connect: vi.fn(async () => {
        connectCalls++;
        if (connectCalls >= 3) {
          controller.abort();
          throw new Error('done');
        }
      }),
      waitForDisconnect: vi.fn(async () => {
        // Returns immediately, simulating disconnect
      }),
    };

    await reconnectLoop(subscriber, fastConfig, onStateChange, controller.signal);

    // Should have connected at least twice (looping after disconnect)
    expect(subscriber.connect.mock.calls.length).toBeGreaterThanOrEqual(2);
    // State sequence should show multiple RECONNECTING → WS_ACTIVE cycles
    const wsActiveCount = states.filter((s) => s === 'WS_ACTIVE').length;
    expect(wsActiveCount).toBeGreaterThanOrEqual(2);
  });

  it('calls calculateDelay with attempt-1 for backoff calculation', async () => {
    // With zero jitter, delays are deterministic: attempt 0 = 1ms, attempt 1 = 2ms, attempt 2 = 4ms
    const timingConfig: ReconnectConfig = {
      initialDelayMs: 10,
      maxDelayMs: 1000,
      maxAttempts: 3,
      jitterFactor: 0,
      pollingFallbackThreshold: 5,
    };

    const subscriber = {
      connect: vi.fn(async () => {
        throw new Error('fail');
      }),
      waitForDisconnect: vi.fn(async () => {}),
    };

    const start = Date.now();
    await reconnectLoop(subscriber, timingConfig, onStateChange);
    const elapsed = Date.now() - start;

    // With 3 failures, delays should be: 10ms (attempt-1=0) + 20ms (attempt-1=1) + (gives up after 3rd)
    // Actually 3rd failure gives up immediately, so delays = 10 + 20 = 30ms
    // With some overhead, elapsed should be > 20ms
    expect(elapsed).toBeGreaterThanOrEqual(20);
    expect(subscriber.connect).toHaveBeenCalledTimes(3);
  });
});
