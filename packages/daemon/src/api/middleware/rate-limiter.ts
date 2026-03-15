/**
 * In-memory sliding-window rate limiter with 3-tier Hono middleware factories.
 *
 * Architecture:
 * - SlidingWindowRateLimiter: generic sliding-window counter with TTL auto-cleanup
 * - createIpRateLimiter: IP-based global rate limit (all endpoints)
 * - createSessionRateLimiter: session-based rate limit (sessionAuth endpoints)
 * - createTxRateLimiter: transaction-specific rate limit (POST /v1/transactions, /v1/actions)
 *
 * All three read limit values from SettingsService on each request (hot-reload).
 * Expired window entries are automatically cleaned every 60 seconds.
 *
 * @see packages/daemon/src/infrastructure/settings/setting-keys.ts for rate_limit_* keys
 */

import { createMiddleware } from 'hono/factory';
import type { SettingsService } from '../../infrastructure/settings/index.js';

// ---------------------------------------------------------------------------
// SlidingWindowRateLimiter
// ---------------------------------------------------------------------------

interface SlidingWindowOpts {
  /** Cleanup interval in ms (default 60_000) */
  cleanupIntervalMs?: number;
}

interface CheckResult {
  allowed: boolean;
  remaining: number;
  retryAfterSec: number;
}

export class SlidingWindowRateLimiter {
  private buckets = new Map<string, { timestamps: number[] }>();
  private cleanupTimer: ReturnType<typeof setInterval>;

  constructor(opts: SlidingWindowOpts = {}) {
    const interval = opts.cleanupIntervalMs ?? 60_000;
    this.cleanupTimer = setInterval(() => this.cleanup(), interval);
    // Unref so the timer doesn't keep the process alive
    if (typeof this.cleanupTimer === 'object' && 'unref' in this.cleanupTimer) {
      this.cleanupTimer.unref();
    }
  }

  /**
   * Check if a request is allowed under the sliding window.
   *
   * @param key - Rate limit key (IP, session ID, etc.)
   * @param limit - Max requests per window
   * @param windowMs - Window duration in ms (default 60_000 = 1 minute)
   */
  check(key: string, limit: number, windowMs = 60_000): CheckResult {
    const now = Date.now();
    const cutoff = now - windowMs;

    let bucket = this.buckets.get(key);
    if (!bucket) {
      bucket = { timestamps: [] };
      this.buckets.set(key, bucket);
    }

    // Remove timestamps outside the window
    bucket.timestamps = bucket.timestamps.filter((t) => t > cutoff);

    if (bucket.timestamps.length < limit) {
      bucket.timestamps.push(now);
      return {
        allowed: true,
        remaining: limit - bucket.timestamps.length,
        retryAfterSec: 0,
      };
    }

    // Rate limited: calculate when the oldest entry in the window will expire
    const oldest = bucket.timestamps[0]!;
    const retryAfterMs = oldest + windowMs - now;
    return {
      allowed: false,
      remaining: 0,
      retryAfterSec: Math.ceil(retryAfterMs / 1000),
    };
  }

  /** Remove buckets whose ALL timestamps are expired. */
  cleanup(): void {
    const cutoff = Date.now() - 60_000;
    for (const [key, bucket] of this.buckets) {
      bucket.timestamps = bucket.timestamps.filter((t) => t > cutoff);
      if (bucket.timestamps.length === 0) {
        this.buckets.delete(key);
      }
    }
  }

  /** Stop the cleanup timer. */
  destroy(): void {
    clearInterval(this.cleanupTimer);
  }

  /** Number of active keys (for testing). */
  get size(): number {
    return this.buckets.size;
  }
}

// ---------------------------------------------------------------------------
// Middleware deps
// ---------------------------------------------------------------------------

interface RateLimiterDeps {
  settingsService: SettingsService;
}

// ---------------------------------------------------------------------------
// Helper: return 429 JSON response with Retry-After header
// ---------------------------------------------------------------------------

function rateLimit429(c: { header: (name: string, value: string) => void; json: (data: unknown, status: number) => Response }, retryAfterSec: number, message: string): Response {
  c.header('Retry-After', String(retryAfterSec));
  return c.json(
    {
      code: 'RATE_LIMITED',
      message,
      retryable: true,
    },
    429,
  );
}

// ---------------------------------------------------------------------------
// IP rate limiter (global, all endpoints)
// ---------------------------------------------------------------------------

export function createIpRateLimiter(deps: RateLimiterDeps) {
  const limiter = new SlidingWindowRateLimiter();

  return createMiddleware(async (c, next) => {
    const ip =
      c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ||
      c.req.header('x-real-ip') ||
      'unknown';

    const limit = parseInt(deps.settingsService.get('security.rate_limit_global_ip_rpm'), 10) || 1000;
    const result = limiter.check(ip, limit);

    if (!result.allowed) {
      return rateLimit429(c, result.retryAfterSec, 'IP rate limit exceeded');
    }

    await next();
  });
}

// ---------------------------------------------------------------------------
// Session rate limiter (session-authed endpoints)
// ---------------------------------------------------------------------------

export function createSessionRateLimiter(deps: RateLimiterDeps) {
  const limiter = new SlidingWindowRateLimiter();

  return createMiddleware(async (c, next) => {
    const sessionId = (c.get as (key: string) => string | undefined)('sessionId');
    if (!sessionId) {
      await next();
      return;
    }

    const limit = parseInt(deps.settingsService.get('security.rate_limit_session_rpm'), 10) || 300;
    const result = limiter.check(sessionId, limit);

    if (!result.allowed) {
      return rateLimit429(c, result.retryAfterSec, 'Session rate limit exceeded');
    }

    await next();
  });
}

// ---------------------------------------------------------------------------
// TX rate limiter (transaction submission endpoints)
// ---------------------------------------------------------------------------

export function createTxRateLimiter(deps: RateLimiterDeps) {
  const limiter = new SlidingWindowRateLimiter();

  return createMiddleware(async (c, next) => {
    const sessionId = (c.get as (key: string) => string | undefined)('sessionId');
    if (!sessionId) {
      await next();
      return;
    }

    const limit = parseInt(deps.settingsService.get('security.rate_limit_tx_rpm'), 10) || 10;
    const result = limiter.check(sessionId, limit);

    if (!result.allowed) {
      return rateLimit429(c, result.retryAfterSec, 'Transaction rate limit exceeded');
    }

    await next();
  });
}
