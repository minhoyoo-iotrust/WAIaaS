/**
 * PythOracle: IPriceOracle implementation using Pyth Hermes REST API.
 *
 * Fetches real-time price data from the public Pyth Hermes instance
 * (https://hermes.pyth.network) with zero-config (no API key required).
 *
 * Design decisions:
 * - No internal cache: cache management is OracleChain's responsibility.
 * - Feed IDs from hardcoded map (pyth-feed-ids.ts). Unknown tokens throw
 *   PriceNotAvailableError to trigger OracleChain's CoinGecko fallback.
 * - 5-second timeout via AbortSignal.timeout() (Node.js 22 built-in).
 * - Price conversion: Number(price) * 10^expo for USD value.
 */
import type { ChainType, PriceInfo, CacheStats, IPriceOracle, TokenRef } from '@waiaas/core';
import { buildCacheKey } from './price-cache.js';
import { getFeedId } from './pyth-feed-ids.js';
import { PriceNotAvailableError } from './oracle-errors.js';

// Re-export for backwards compatibility
export { PriceNotAvailableError } from './oracle-errors.js';

// ---------------------------------------------------------------------------
// Pyth API response types (minimal, for internal use only)
// ---------------------------------------------------------------------------

interface PythPriceFeed {
  id: string;
  price: {
    price: string;
    conf: string;
    expo: number;
    publish_time: number;
  };
  ema_price: {
    price: string;
    conf: string;
    expo: number;
    publish_time: number;
  };
}

interface PythApiResponse {
  parsed?: PythPriceFeed[];
}

// ---------------------------------------------------------------------------
// PythOracle
// ---------------------------------------------------------------------------

/**
 * Price oracle backed by the Pyth Hermes REST API.
 *
 * Implements IPriceOracle with pure API-call semantics (no caching).
 * Supports single and batch price queries via the `/v2/updates/price/latest`
 * endpoint.
 */
export class PythOracle implements IPriceOracle {
  private static readonly HERMES_BASE_URL = 'https://hermes.pyth.network';
  private static readonly TIMEOUT_MS = 5000;
  private static readonly PRICE_TTL_MS = 300_000; // 5 minutes

  /**
   * Get price for a single token.
   *
   * @param token - Token reference with address, decimals, and chain.
   * @returns PriceInfo with USD price, confidence, and metadata.
   * @throws PriceNotAvailableError if token has no registered Pyth feed ID.
   * @throws Error if Pyth API returns HTTP error or invalid response.
   */
  async getPrice(token: TokenRef): Promise<PriceInfo> {
    const cacheKey = buildCacheKey(token.chain, token.address);
    const feedId = getFeedId(cacheKey);

    if (!feedId) {
      throw new PriceNotAvailableError(cacheKey);
    }

    const url =
      `${PythOracle.HERMES_BASE_URL}/v2/updates/price/latest` +
      `?ids[]=0x${feedId}` +
      `&parsed=true`;

    const res = await fetch(url, {
      signal: AbortSignal.timeout(PythOracle.TIMEOUT_MS),
    });

    if (!res.ok) {
      throw new Error(`Pyth API error: ${res.status} ${res.statusText ?? ''}`);
    }

    const data = (await res.json()) as PythApiResponse;
    const feed = data.parsed?.[0];

    if (!feed?.price) {
      throw new Error(`Pyth API returned no price data for feed ${feedId}`);
    }

    return PythOracle.convertFeedToPrice(feed);
  }

  /**
   * Get prices for multiple tokens in a single batch API call.
   *
   * Tokens without a registered feed ID are silently skipped (they will be
   * handled by OracleChain's fallback).
   *
   * @param tokens - Array of token references.
   * @returns Map from cache key to PriceInfo for tokens that have feed IDs.
   */
  async getPrices(tokens: TokenRef[]): Promise<Map<string, PriceInfo>> {
    const result = new Map<string, PriceInfo>();

    // Build feed ID -> cacheKey reverse mapping
    const feedToCacheKey = new Map<string, string>();
    const feedIds: string[] = [];

    for (const token of tokens) {
      const cacheKey = buildCacheKey(token.chain, token.address);
      const feedId = getFeedId(cacheKey);
      if (feedId) {
        feedToCacheKey.set(feedId, cacheKey);
        feedIds.push(feedId);
      }
    }

    if (feedIds.length === 0) {
      return result;
    }

    // Build batch URL with multiple ids[] parameters
    const params = feedIds.map((id) => `ids[]=0x${id}`).join('&');
    const url =
      `${PythOracle.HERMES_BASE_URL}/v2/updates/price/latest?${params}&parsed=true`;

    const res = await fetch(url, {
      signal: AbortSignal.timeout(PythOracle.TIMEOUT_MS),
    });

    if (!res.ok) {
      throw new Error(`Pyth API error: ${res.status} ${res.statusText ?? ''}`);
    }

    const data = (await res.json()) as PythApiResponse;

    for (const feed of data.parsed ?? []) {
      if (!feed?.price) continue;

      // Reverse-map feed.id to cache key
      const cacheKey = feedToCacheKey.get(feed.id);
      if (!cacheKey) continue;

      result.set(cacheKey, PythOracle.convertFeedToPrice(feed));
    }

    return result;
  }

  /**
   * Get native token price (SOL or ETH).
   *
   * @param chain - Chain type ('solana' or 'ethereum').
   * @returns PriceInfo for the chain's native token.
   * @throws PriceNotAvailableError if chain has no native feed mapping.
   */
  async getNativePrice(chain: ChainType): Promise<PriceInfo> {
    const decimals = chain === 'solana' ? 9 : 18;
    return this.getPrice({ address: 'native', decimals, chain });
  }

  /**
   * Get cache statistics.
   *
   * PythOracle does not manage its own cache (OracleChain handles caching),
   * so all counters are zero.
   */
  getCacheStats(): CacheStats {
    return {
      hits: 0,
      misses: 0,
      staleHits: 0,
      size: 0,
      evictions: 0,
    };
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Convert a Pyth price feed to PriceInfo.
   *
   * Price formula: usdPrice = Number(price) * 10^expo
   * Confidence: 1 - (confUsd / usdPrice) clamped to [0, 1]
   */
  private static convertFeedToPrice(feed: PythPriceFeed): PriceInfo {
    const rawPrice = Number(feed.price.price);
    const expo = feed.price.expo;
    const usdPrice = rawPrice * Math.pow(10, expo);

    const rawConf = Number(feed.price.conf);
    const confUsd = rawConf * Math.pow(10, expo);
    const confidence =
      usdPrice > 0 ? Math.max(0, 1 - confUsd / usdPrice) : undefined;

    const now = Date.now();
    return {
      usdPrice,
      confidence,
      source: 'pyth' as const,
      fetchedAt: now,
      expiresAt: now + PythOracle.PRICE_TTL_MS,
      isStale: false,
    };
  }
}
