/**
 * Rate limiter unit tests.
 *
 * Tests SlidingWindowRateLimiter core class and 3-tier Hono middleware factories:
 * - IP-based global rate limit
 * - Session-based rate limit
 * - Transaction-specific rate limit
 *
 * @see packages/daemon/src/api/middleware/rate-limiter.ts
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Hono } from 'hono';
import { ERROR_CODES } from '@waiaas/core';
import {
  SlidingWindowRateLimiter,
  createIpRateLimiter,
  createSessionRateLimiter,
  createTxRateLimiter,
} from '../api/middleware/rate-limiter.js';

// ---------------------------------------------------------------------------
// SlidingWindowRateLimiter unit tests
// ---------------------------------------------------------------------------

describe('SlidingWindowRateLimiter', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('allows requests within limit', () => {
    const limiter = new SlidingWindowRateLimiter();
    try {
      for (let i = 0; i < 3; i++) {
        const result = limiter.check('key1', 5);
        expect(result.allowed).toBe(true);
        expect(result.remaining).toBeGreaterThan(0);
      }
    } finally {
      limiter.destroy();
    }
  });

  it('blocks requests over limit', () => {
    const limiter = new SlidingWindowRateLimiter();
    try {
      // Send 5 requests (all should pass)
      for (let i = 0; i < 5; i++) {
        const result = limiter.check('key1', 5);
        expect(result.allowed).toBe(true);
      }
      // 6th should be blocked
      const result = limiter.check('key1', 5);
      expect(result.allowed).toBe(false);
      expect(result.retryAfterSec).toBeGreaterThan(0);
      expect(result.remaining).toBe(0);
    } finally {
      limiter.destroy();
    }
  });

  it('resets after window expires', () => {
    const limiter = new SlidingWindowRateLimiter();
    try {
      // Fill up the limit
      for (let i = 0; i < 5; i++) {
        limiter.check('key1', 5);
      }
      expect(limiter.check('key1', 5).allowed).toBe(false);

      // Advance past the window (60 seconds)
      vi.advanceTimersByTime(60_000);

      // Should be allowed again
      const result = limiter.check('key1', 5);
      expect(result.allowed).toBe(true);
    } finally {
      limiter.destroy();
    }
  });

  it('auto-cleans expired entries (no memory leak)', () => {
    const limiter = new SlidingWindowRateLimiter({ cleanupIntervalMs: 100 });
    try {
      limiter.check('key1', 5);
      limiter.check('key2', 5);
      expect(limiter.size).toBe(2);

      // Advance past window + cleanup interval
      vi.advanceTimersByTime(61_000);

      expect(limiter.size).toBe(0);
    } finally {
      limiter.destroy();
    }
  });
});

// ---------------------------------------------------------------------------
// RATE_LIMITED error code existence
// ---------------------------------------------------------------------------

describe('RATE_LIMITED error code', () => {
  it('exists in ERROR_CODES with httpStatus 429 and retryable true', () => {
    expect(ERROR_CODES.RATE_LIMITED).toBeDefined();
    expect(ERROR_CODES.RATE_LIMITED.httpStatus).toBe(429);
    expect(ERROR_CODES.RATE_LIMITED.retryable).toBe(true);
    expect(ERROR_CODES.RATE_LIMITED.domain).toBe('SYSTEM');
  });
});

// ---------------------------------------------------------------------------
// Middleware integration tests
// ---------------------------------------------------------------------------

function createMockSettingsService(overrides: Record<string, string> = {}) {
  const defaults: Record<string, string> = {
    'security.rate_limit_global_ip_rpm': '5',
    'security.rate_limit_session_rpm': '5',
    'security.rate_limit_tx_rpm': '3',
  };
  return {
    get: vi.fn((key: string) => overrides[key] ?? defaults[key] ?? '1000'),
  };
}

describe('createIpRateLimiter middleware', () => {
  it('returns 429 + Retry-After header when IP limit exceeded', async () => {
    const settingsService = createMockSettingsService();
    const app = new Hono();
    app.use('*', createIpRateLimiter({ settingsService: settingsService as never }));
    app.get('/health', (c) => c.text('ok'));

    // Send 5 requests (all should pass)
    for (let i = 0; i < 5; i++) {
      const res = await app.request('/health');
      expect(res.status).toBe(200);
    }

    // 6th request should be rate limited
    const res = await app.request('/health');
    expect(res.status).toBe(429);
    expect(res.headers.get('Retry-After')).toBeTruthy();
    const body = await res.json();
    expect(body.code).toBe('RATE_LIMITED');
  });

  it('passes requests within limit', async () => {
    const settingsService = createMockSettingsService();
    const app = new Hono();
    app.use('*', createIpRateLimiter({ settingsService: settingsService as never }));
    app.get('/health', (c) => c.text('ok'));

    const res = await app.request('/health');
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('ok');
  });
});

describe('createSessionRateLimiter middleware', () => {
  it('returns 429 for same session exceeding limit', async () => {
    const settingsService = createMockSettingsService();
    const app = new Hono();
    // Mock sessionAuth: set sessionId on context
    app.use('*', async (c, next) => {
      c.set('sessionId' as never, 'sess-123' as never);
      await next();
    });
    app.use('*', createSessionRateLimiter({ settingsService: settingsService as never }));
    app.get('/test', (c) => c.text('ok'));

    for (let i = 0; i < 5; i++) {
      const res = await app.request('/test');
      expect(res.status).toBe(200);
    }

    const res = await app.request('/test');
    expect(res.status).toBe(429);
  });

  it('skips requests without sessionId (no rate limit applied)', async () => {
    const settingsService = createMockSettingsService();
    const app = new Hono();
    // No sessionId set
    app.use('*', createSessionRateLimiter({ settingsService: settingsService as never }));
    app.get('/test', (c) => c.text('ok'));

    // Send more than the limit -- all should pass since no sessionId
    for (let i = 0; i < 10; i++) {
      const res = await app.request('/test');
      expect(res.status).toBe(200);
    }
  });
});

describe('createTxRateLimiter middleware', () => {
  it('returns 429 on transaction endpoint when limit exceeded', async () => {
    const settingsService = createMockSettingsService();
    const app = new Hono();
    app.use('*', async (c, next) => {
      c.set('sessionId' as never, 'sess-456' as never);
      await next();
    });
    app.use('*', createTxRateLimiter({ settingsService: settingsService as never }));
    app.post('/v1/transactions', (c) => c.text('ok'));

    for (let i = 0; i < 3; i++) {
      const res = await app.request('/v1/transactions', { method: 'POST' });
      expect(res.status).toBe(200);
    }

    const res = await app.request('/v1/transactions', { method: 'POST' });
    expect(res.status).toBe(429);
  });
});

describe('hot-reload', () => {
  it('settings change reflected on next request without restart', async () => {
    let limit = '3';
    const settingsService = {
      get: vi.fn((key: string) => {
        if (key === 'security.rate_limit_global_ip_rpm') return limit;
        return '1000';
      }),
    };

    const app = new Hono();
    app.use('*', createIpRateLimiter({ settingsService: settingsService as never }));
    app.get('/test', (c) => c.text('ok'));

    // Send 3 requests with limit=3 (all pass)
    for (let i = 0; i < 3; i++) {
      const res = await app.request('/test');
      expect(res.status).toBe(200);
    }

    // 4th request should fail with limit=3
    const res4 = await app.request('/test');
    expect(res4.status).toBe(429);

    // Now change limit to 10 -- but the sliding window still has 3 entries
    // from the same window, so next request should pass since 4 < 10
    limit = '10';
    const res5 = await app.request('/test');
    expect(res5.status).toBe(200);
  });
});
