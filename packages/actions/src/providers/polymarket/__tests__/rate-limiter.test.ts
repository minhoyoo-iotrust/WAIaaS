/**
 * Tests for PolymarketRateLimiter: sliding-window request limiter.
 *
 * Plan 371-01 Task 2: RateLimiter tests.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PolymarketRateLimiter } from '../rate-limiter.js';

describe('PolymarketRateLimiter', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('allows requests under limit', async () => {
    const limiter = new PolymarketRateLimiter(10, 1000);

    // 10 requests should all resolve immediately
    for (let i = 0; i < 10; i++) {
      await limiter.acquire();
    }

    expect(limiter.currentCount).toBe(10);
  });

  it('blocks when at limit', async () => {
    const limiter = new PolymarketRateLimiter(3, 1000);

    // Fill up the window
    await limiter.acquire();
    await limiter.acquire();
    await limiter.acquire();

    // 4th request should be pending
    let resolved = false;
    const p = limiter.acquire().then(() => { resolved = true; });

    // Should not have resolved yet
    expect(resolved).toBe(false);

    // Advance time past window
    vi.advanceTimersByTime(1001);
    await p;

    expect(resolved).toBe(true);
  });

  it('resets after window expires', async () => {
    const limiter = new PolymarketRateLimiter(2, 500);

    await limiter.acquire();
    await limiter.acquire();

    // Window full -- advance past window
    vi.advanceTimersByTime(501);

    // Should be able to acquire again
    await limiter.acquire();
    expect(limiter.currentCount).toBe(1);
  });

  it('default is 10 req/s', () => {
    const limiter = new PolymarketRateLimiter();
    // Can verify by calling acquire 10 times without blocking
    const promises: Promise<void>[] = [];
    for (let i = 0; i < 10; i++) {
      promises.push(limiter.acquire());
    }
    // All should resolve
    return Promise.all(promises);
  });

  it('reset clears all state', async () => {
    const limiter = new PolymarketRateLimiter(5, 1000);

    await limiter.acquire();
    await limiter.acquire();
    expect(limiter.currentCount).toBe(2);

    limiter.reset();
    expect(limiter.currentCount).toBe(0);
  });
});
