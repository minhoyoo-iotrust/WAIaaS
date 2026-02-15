/**
 * ForexRateService: IForexRateService implementation with caching.
 *
 * Uses CoinGeckoForexProvider for rate fetching and a dedicated
 * InMemoryPriceCache instance (30-minute TTL) for caching.
 *
 * Cache key pattern: `forex:USD/{currency}` -- avoids collision with
 * crypto cache keys (`chain:address`).
 *
 * Graceful fallback: getRate() returns null on any error (caller shows USD).
 * getRates() omits failed currencies from result Map.
 */
import type { CurrencyCode, ForexRate, IForexRateService, PriceInfo } from '@waiaas/core';
import type { CoinGeckoForexProvider } from './coingecko-forex.js';
import type { InMemoryPriceCache } from './price-cache.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Dependency injection for ForexRateService. */
export interface ForexRateServiceDeps {
  /** CoinGecko forex rate provider. */
  forexProvider: CoinGeckoForexProvider;
  /** Dedicated cache instance (30-min TTL, separate from crypto cache). */
  cache: InMemoryPriceCache;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Cache key prefix for forex rates. */
const FOREX_KEY_PREFIX = 'forex:USD/';

/** ForexRate TTL in milliseconds (30 minutes). */
const FOREX_TTL_MS = 30 * 60 * 1000;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build cache key for a forex rate. */
function forexCacheKey(currency: CurrencyCode): string {
  return `${FOREX_KEY_PREFIX}${currency}`;
}

/** Convert a PriceInfo (from cache) back to ForexRate. */
function priceInfoToForexRate(
  to: CurrencyCode,
  price: PriceInfo,
  source: 'coingecko' | 'cache',
): ForexRate {
  return {
    from: 'USD',
    to,
    rate: price.usdPrice, // We store rate in usdPrice field
    source,
    fetchedAt: price.fetchedAt,
    expiresAt: price.expiresAt,
  };
}

/** Create a PriceInfo wrapper for storing a forex rate in the cache. */
function rateToPriceInfo(rate: number): PriceInfo {
  const now = Date.now();
  return {
    usdPrice: rate, // Store exchange rate in usdPrice field
    source: 'coingecko',
    fetchedAt: now,
    expiresAt: now + FOREX_TTL_MS,
    isStale: false,
  };
}

// ---------------------------------------------------------------------------
// ForexRateService
// ---------------------------------------------------------------------------

/**
 * Forex rate service with CoinGecko provider and InMemoryPriceCache.
 *
 * - getRate('USD') returns rate=1 immediately (no API call).
 * - getRate(other) checks cache first, then fetches from CoinGecko.
 * - All errors caught and returned as null (graceful fallback).
 */
export class ForexRateService implements IForexRateService {
  private readonly provider: CoinGeckoForexProvider;
  private readonly cache: InMemoryPriceCache;

  constructor(deps: ForexRateServiceDeps) {
    this.provider = deps.forexProvider;
    this.cache = deps.cache;
  }

  /**
   * Get exchange rate from USD to target currency.
   *
   * @param to - Target currency code.
   * @returns ForexRate or null on failure (graceful fallback).
   */
  async getRate(to: CurrencyCode): Promise<ForexRate | null> {
    try {
      // USD -> USD is always 1 (no API call needed)
      if (to === 'USD') {
        const now = Date.now();
        return {
          from: 'USD',
          to: 'USD',
          rate: 1,
          source: 'cache',
          fetchedAt: now,
          expiresAt: now + FOREX_TTL_MS,
        };
      }

      const cacheKey = forexCacheKey(to);

      // Check cache first
      const cached = this.cache.get(cacheKey);
      if (cached) {
        return priceInfoToForexRate(to, cached, 'cache');
      }

      // Fetch from CoinGecko
      const rates = await this.provider.getRates([to]);
      const rate = rates.get(to);

      if (rate === undefined) {
        return null;
      }

      // Store in cache
      const priceInfo = rateToPriceInfo(rate);
      this.cache.set(cacheKey, priceInfo);

      return priceInfoToForexRate(to, priceInfo, 'coingecko');
    } catch {
      // Graceful fallback: any error -> null
      return null;
    }
  }

  /**
   * Get exchange rates for multiple currencies.
   *
   * Batch-optimized: only fetches cache-miss currencies from CoinGecko.
   *
   * @param currencies - Array of target currency codes.
   * @returns Map from currency code to ForexRate. Missing rates omitted.
   */
  async getRates(currencies: CurrencyCode[]): Promise<Map<CurrencyCode, ForexRate>> {
    const result = new Map<CurrencyCode, ForexRate>();
    const toFetch: CurrencyCode[] = [];

    // Phase 1: Check cache, collect misses
    for (const currency of currencies) {
      if (currency === 'USD') {
        const now = Date.now();
        result.set('USD', {
          from: 'USD',
          to: 'USD',
          rate: 1,
          source: 'cache',
          fetchedAt: now,
          expiresAt: now + FOREX_TTL_MS,
        });
        continue;
      }

      const cached = this.cache.get(forexCacheKey(currency));
      if (cached) {
        result.set(currency, priceInfoToForexRate(currency, cached, 'cache'));
      } else {
        toFetch.push(currency);
      }
    }

    // Phase 2: Batch fetch cache misses
    if (toFetch.length > 0) {
      try {
        const rates = await this.provider.getRates(toFetch);
        for (const currency of toFetch) {
          const rate = rates.get(currency);
          if (rate !== undefined) {
            const priceInfo = rateToPriceInfo(rate);
            this.cache.set(forexCacheKey(currency), priceInfo);
            result.set(currency, priceInfoToForexRate(currency, priceInfo, 'coingecko'));
          }
        }
      } catch {
        // Graceful: batch fetch failure -> cached results only
      }
    }

    return result;
  }
}
