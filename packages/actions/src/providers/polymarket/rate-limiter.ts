/**
 * PolymarketRateLimiter: Simple sliding-window request rate limiter.
 *
 * Tracks request timestamps in a ring buffer and blocks when the window is full.
 * Default: 10 requests per second (conservative, design doc 12.5).
 *
 * @see design doc 80, Section 12.5
 */
import { PM_DEFAULTS } from './config.js';

export class PolymarketRateLimiter {
  private readonly timestamps: number[] = [];

  constructor(
    private readonly maxRequests: number = PM_DEFAULTS.RATE_LIMIT_MAX_REQUESTS,
    private readonly windowMs: number = PM_DEFAULTS.RATE_LIMIT_WINDOW_MS,
  ) {}

  /**
   * Acquire a request slot. Resolves immediately when under limit.
   * Waits until a slot becomes available when at limit.
   */
  async acquire(): Promise<void> {
    this.pruneExpired();

    if (this.timestamps.length < this.maxRequests) {
      this.timestamps.push(Date.now());
      return;
    }

    // Window is full -- wait for oldest request to expire
    const oldest = this.timestamps[0]!;
    const waitMs = this.windowMs - (Date.now() - oldest);
    if (waitMs > 0) {
      await new Promise<void>((resolve) => setTimeout(resolve, waitMs));
    }

    this.pruneExpired();
    this.timestamps.push(Date.now());
  }

  /** Current number of requests in the active window. */
  get currentCount(): number {
    this.pruneExpired();
    return this.timestamps.length;
  }

  /** Reset for testing. */
  reset(): void {
    this.timestamps.length = 0;
  }

  /** Remove timestamps outside the current window. */
  private pruneExpired(): void {
    const cutoff = Date.now() - this.windowMs;
    while (this.timestamps.length > 0 && this.timestamps[0]! <= cutoff) {
      this.timestamps.shift();
    }
  }
}
