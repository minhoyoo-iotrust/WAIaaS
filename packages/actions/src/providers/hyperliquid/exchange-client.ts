/**
 * HyperliquidExchangeClient: REST client for Exchange + Info API.
 * HyperliquidRateLimiter: Weight-based rate limiter.
 *
 * @see HDESIGN-03: ExchangeClient shared structure
 */
import { ChainError } from '@waiaas/core';
import { z } from 'zod';
import { INFO_WEIGHTS, HL_DEFAULTS, HL_ERRORS } from './config.js';
import { ExchangeResponseSchema, type ExchangeResponse } from './schemas.js';
import type { Hex } from 'viem';

// ---------------------------------------------------------------------------
// Rate Limiter
// ---------------------------------------------------------------------------

/**
 * Weight-based rate limiter for Hyperliquid API.
 * Hyperliquid official limit: 1200 weight/min per IP.
 * Default: 600 weight/min (50% conservative).
 */
export class HyperliquidRateLimiter {
  private totalWeight = 0;
  private windowStart = Date.now();

  constructor(private readonly maxWeightPerMin: number = HL_DEFAULTS.RATE_LIMIT_WEIGHT_PER_MIN) {}

  /**
   * Acquire weight capacity. Waits if over limit.
   */
  async acquire(weight: number): Promise<void> {
    const now = Date.now();
    if (now - this.windowStart > 60_000) {
      this.totalWeight = 0;
      this.windowStart = now;
    }
    if (this.totalWeight + weight > this.maxWeightPerMin) {
      const waitMs = 60_000 - (now - this.windowStart);
      if (waitMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, waitMs));
      }
      this.totalWeight = 0;
      this.windowStart = Date.now();
    }
    this.totalWeight += weight;
  }

  /** Get current weight usage (for monitoring). */
  get currentWeight(): number {
    return this.totalWeight;
  }

  /** Reset for testing. */
  reset(): void {
    this.totalWeight = 0;
    this.windowStart = Date.now();
  }
}

// ---------------------------------------------------------------------------
// Exchange Client
// ---------------------------------------------------------------------------

export interface ExchangeRequest {
  action: Record<string, unknown>;
  nonce: number;
  signature: { r: Hex; s: Hex; v: number };
  vaultAddress?: Hex;
}

export interface InfoRequest {
  type: string;
  [key: string]: unknown;
}

/**
 * REST client for Hyperliquid Exchange and Info endpoints.
 * Wraps POST /exchange and POST /info with Zod validation and rate limiting.
 */
export class HyperliquidExchangeClient {
  constructor(
    private readonly apiUrl: string,
    private readonly rateLimiter: HyperliquidRateLimiter,
    private readonly timeoutMs: number = HL_DEFAULTS.REQUEST_TIMEOUT_MS,
  ) {}

  /**
   * Submit a signed trading action to /exchange.
   */
  async exchange(request: ExchangeRequest): Promise<ExchangeResponse> {
    await this.rateLimiter.acquire(1);
    return this.post('/exchange', request, ExchangeResponseSchema);
  }

  /**
   * Query the /info endpoint with weight-based rate limiting.
   */
  async info<T>(request: InfoRequest, schema: z.ZodType<T>): Promise<T> {
    const weight = INFO_WEIGHTS[request.type] ?? 2;
    await this.rateLimiter.acquire(weight);
    return this.post('/info', request, schema);
  }

  /**
   * HTTP POST with timeout, Zod validation, and error mapping.
   */
  private async post<T>(path: string, body: unknown, schema: z.ZodType<T>): Promise<T> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(`${this.apiUrl}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!response.ok) {
        const text = await response.text().catch(() => '');
        const code = response.status === 429 ? HL_ERRORS.RATE_LIMITED : HL_ERRORS.API_ERROR;
        throw new ChainError(code, 'HYPERLIQUID', {
          message: `Hyperliquid API error: ${response.status} ${text}`,
        });
      }

      const json = await response.json();
      return schema.parse(json);
    } catch (err) {
      if (err instanceof ChainError) throw err;
      if ((err as Error).name === 'AbortError') {
        throw new ChainError('ACTION_API_TIMEOUT', 'HYPERLIQUID', {
          message: 'Hyperliquid API request timeout',
        });
      }
      throw new ChainError(HL_ERRORS.API_ERROR, 'HYPERLIQUID', {
        message: `Hyperliquid API error: ${(err as Error).message}`,
      });
    } finally {
      clearTimeout(timeout);
    }
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Create a configured HyperliquidExchangeClient.
 */
export function createHyperliquidClient(
  apiUrl: string,
  rateLimiter?: HyperliquidRateLimiter,
  timeoutMs?: number,
): HyperliquidExchangeClient {
  const limiter = rateLimiter ?? new HyperliquidRateLimiter();
  return new HyperliquidExchangeClient(apiUrl, limiter, timeoutMs);
}
