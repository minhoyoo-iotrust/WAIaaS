/**
 * PolymarketGammaClient: HTTP client for the Gamma API (public market metadata).
 *
 * Provides market browsing, search, event listing, and individual market detail.
 * All responses parsed through Zod schemas for type safety.
 *
 * @see design doc 80, Section 2.1
 */
import { ChainError } from '@waiaas/core';
import { PM_API_URLS, PM_DEFAULTS, PM_ERRORS } from './config.js';
import {
  GammaMarketSchema,
  GammaEventSchema,
  type GammaMarket,
  type GammaEvent,
  type MarketFilter,
} from './market-schemas.js';

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

export class PolymarketGammaClient {
  constructor(
    private readonly baseUrl: string = PM_API_URLS.GAMMA,
    private readonly timeoutMs: number = PM_DEFAULTS.REQUEST_TIMEOUT_MS,
  ) {}

  /**
   * Fetch filtered list of markets from Gamma API.
   */
  async getMarkets(filter?: MarketFilter): Promise<GammaMarket[]> {
    const params = new URLSearchParams();
    if (filter) {
      if (filter.active !== undefined) params.set('active', String(filter.active));
      if (filter.closed !== undefined) params.set('closed', String(filter.closed));
      if (filter.category) params.set('category', filter.category);
      if (filter.limit !== undefined) params.set('limit', String(filter.limit));
      if (filter.offset !== undefined) params.set('offset', String(filter.offset));
      if (filter.order) params.set('order', filter.order);
      if (filter.ascending !== undefined) params.set('ascending', String(filter.ascending));
    }
    const qs = params.toString();
    const url = `${this.baseUrl}/markets${qs ? `?${qs}` : ''}`;
    const data = await this.fetchJson(url);
    const arr = Array.isArray(data) ? data : [];
    return arr.map((item: unknown) => GammaMarketSchema.parse(item));
  }

  /**
   * Fetch a single market by conditionId.
   */
  async getMarket(conditionId: string): Promise<GammaMarket> {
    const url = `${this.baseUrl}/markets/${conditionId}`;
    const data = await this.fetchJson(url);
    return GammaMarketSchema.parse(data);
  }

  /**
   * Fetch events with optional pagination.
   */
  async getEvents(filter?: { limit?: number; offset?: number }): Promise<GammaEvent[]> {
    const params = new URLSearchParams();
    if (filter?.limit !== undefined) params.set('limit', String(filter.limit));
    if (filter?.offset !== undefined) params.set('offset', String(filter.offset));
    const qs = params.toString();
    const url = `${this.baseUrl}/events${qs ? `?${qs}` : ''}`;
    const data = await this.fetchJson(url);
    const arr = Array.isArray(data) ? data : [];
    return arr.map((item: unknown) => GammaEventSchema.parse(item));
  }

  /**
   * Search markets by keyword query.
   */
  async searchMarkets(query: string, limit?: number): Promise<GammaMarket[]> {
    const params = new URLSearchParams();
    params.set('_q', query);
    if (limit !== undefined) params.set('limit', String(limit));
    const url = `${this.baseUrl}/markets?${params.toString()}`;
    const data = await this.fetchJson(url);
    const arr = Array.isArray(data) ? data : [];
    return arr.map((item: unknown) => GammaMarketSchema.parse(item));
  }

  // -------------------------------------------------------------------------
  // Private
  // -------------------------------------------------------------------------

  private async fetchJson(url: string): Promise<unknown> {
    let response: Response;
    try {
      response = await fetch(url, {
        method: 'GET',
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (err) {
      throw new ChainError(PM_ERRORS.API_ERROR, 'POLYMARKET', {
        message: `Gamma API request failed: ${err instanceof Error ? err.message : String(err)}`,
      });
    }

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new ChainError(PM_ERRORS.API_ERROR, 'POLYMARKET', {
        message: `Gamma API HTTP ${response.status}: ${text}`,
      });
    }

    return response.json();
  }
}
