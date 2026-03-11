/**
 * PolymarketMarketData: Caching service for Gamma API market data.
 *
 * Provides in-memory 30s TTL cache with stale-on-error fallback.
 * Satisfies the NegRiskResolver interface via isNegRisk() method.
 *
 * @see design doc 80, Section 12 (cache strategy)
 */
import type { PolymarketGammaClient } from './gamma-client.js';
import type { GammaMarket, GammaEvent, MarketFilter } from './market-schemas.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

export interface ResolutionStatus {
  resolved: boolean;
  winningOutcome?: string;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class PolymarketMarketData {
  private readonly cache = new Map<string, CacheEntry<unknown>>();

  constructor(
    private readonly gammaClient: PolymarketGammaClient,
    private readonly cacheTtlMs: number = 30_000,
  ) {}

  /**
   * Get filtered market list (cached by filter hash).
   */
  async getMarkets(filter?: MarketFilter): Promise<GammaMarket[]> {
    const key = `markets:${JSON.stringify(filter ?? {})}`;
    return this.withCache(key, () => this.gammaClient.getMarkets(filter));
  }

  /**
   * Get single market by conditionId (cached).
   */
  async getMarket(conditionId: string): Promise<GammaMarket> {
    const key = `market:${conditionId}`;
    return this.withCache(key, () => this.gammaClient.getMarket(conditionId));
  }

  /**
   * Get events with optional pagination (cached by filter hash).
   */
  async getEvents(filter?: { limit?: number; offset?: number }): Promise<GammaEvent[]> {
    const key = `events:${JSON.stringify(filter ?? {})}`;
    return this.withCache(key, () => this.gammaClient.getEvents(filter));
  }

  /**
   * Search markets by keyword (no cache, direct passthrough).
   */
  async searchMarkets(query: string, limit?: number): Promise<GammaMarket[]> {
    return this.gammaClient.searchMarkets(query, limit);
  }

  /**
   * Check if a market uses Neg Risk (multi-outcome).
   * Satisfies NegRiskResolver interface: (conditionId) => Promise<boolean>
   */
  async isNegRisk(conditionId: string): Promise<boolean> {
    const market = await this.getMarket(conditionId);
    return market.neg_risk;
  }

  /**
   * Get resolution status for a market.
   * Returns resolved=true when market is closed and has a winning token.
   */
  async getResolutionStatus(conditionId: string): Promise<ResolutionStatus> {
    const market = await this.getMarket(conditionId);

    if (!market.closed) {
      return { resolved: false };
    }

    // Find winning token (price === "1" or winner === true)
    const winningToken = market.tokens.find(
      (t) => t.winner === true || t.price === '1',
    );

    return {
      resolved: true,
      winningOutcome: winningToken?.outcome,
    };
  }

  /**
   * Clear all cached data. Useful for testing.
   */
  clearCache(): void {
    this.cache.clear();
  }

  // -------------------------------------------------------------------------
  // Private: Cache with stale-on-error
  // -------------------------------------------------------------------------

  private async withCache<T>(key: string, fetcher: () => Promise<T>): Promise<T> {
    const now = Date.now();
    const entry = this.cache.get(key) as CacheEntry<T> | undefined;

    // Cache hit (not expired)
    if (entry && entry.expiresAt > now) {
      return entry.data;
    }

    // Try to fetch fresh data
    try {
      const data = await fetcher();
      this.cache.set(key, { data, expiresAt: now + this.cacheTtlMs });
      return data;
    } catch (err) {
      // Stale-on-error: return expired cache if available
      if (entry) {
        return entry.data;
      }
      throw err;
    }
  }
}
