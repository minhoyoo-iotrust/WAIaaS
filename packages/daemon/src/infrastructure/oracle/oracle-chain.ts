/**
 * OracleChain: Composite IPriceOracle with 3-stage fallback + cross-validation.
 *
 * Stage 1: Primary oracle (PythOracle) -- always tried first.
 * Stage 2: Fallback oracle (CoinGeckoOracle) -- tried when primary fails;
 *          also used for cross-validation when both succeed.
 * Stage 3: Stale cache -- used when all oracles fail (within staleMax window).
 *
 * Cross-validation (when fallback is configured):
 * - Both primary and fallback succeed -> compare prices.
 * - Deviation > threshold (default 5%) -> degrade to isStale=true.
 * - Deviation <= threshold -> adopt primary price (isStale=false).
 * - Fallback failure during cross-validation -> trust primary as-is.
 *
 * Cache management: OracleChain owns InMemoryPriceCache exclusively.
 * Individual oracles (PythOracle, CoinGeckoOracle) do NOT cache internally.
 * Uses cache.getOrFetch() for stampede prevention.
 */
import type { ChainType, PriceInfo, CacheStats, IPriceOracle, TokenRef } from '@waiaas/core';
import type { InMemoryPriceCache } from './price-cache.js';
import { buildCacheKey } from './price-cache.js';
import { PriceNotAvailableError } from './oracle-errors.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Dependency injection interface for OracleChain constructor. */
export interface OracleChainDeps {
  /** Primary oracle (PythOracle). Always tried first. */
  primary: IPriceOracle;
  /** Optional fallback oracle (CoinGeckoOracle). Used for fallback + cross-validation. */
  fallback?: IPriceOracle;
  /** Shared price cache (InMemoryPriceCache). OracleChain manages cache exclusively. */
  cache: InMemoryPriceCache;
  /** Cross-validation deviation threshold in percent. Default: 5. */
  crossValidationThreshold?: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Calculate percentage deviation between two prices.
 *
 * Formula: |primary - fallback| / primary * 100
 * Returns 0 when primary is 0 (avoid division by zero).
 */
function calculateDeviation(primary: number, fallback: number): number {
  if (primary === 0) return 0;
  return (Math.abs(primary - fallback) / primary) * 100;
}

// ---------------------------------------------------------------------------
// OracleChain
// ---------------------------------------------------------------------------

/**
 * Composite price oracle with fallback chain and cross-validation.
 *
 * Implements IPriceOracle. Uses InMemoryPriceCache.getOrFetch() for
 * cache-first access with stampede prevention.
 */
export class OracleChain implements IPriceOracle {
  private readonly primary: IPriceOracle;
  private readonly fallback: IPriceOracle | undefined;
  private readonly cache: InMemoryPriceCache;
  private readonly threshold: number;

  constructor(deps: OracleChainDeps) {
    this.primary = deps.primary;
    this.fallback = deps.fallback;
    this.cache = deps.cache;
    this.threshold = deps.crossValidationThreshold ?? 5;
  }

  /**
   * Get price for a single token.
   *
   * Flow:
   * 1. Check cache (via getOrFetch stampede prevention).
   * 2. Try primary oracle (Pyth).
   * 3. If primary succeeds and fallback exists, cross-validate.
   * 4. If primary fails, try fallback oracle (CoinGecko).
   * 5. If all fail, try stale cache.
   * 6. If nothing available, throw PriceNotAvailableError.
   *
   * @param token - Token reference for price lookup.
   * @returns PriceInfo from best available source.
   * @throws PriceNotAvailableError when no source can provide a price.
   */
  async getPrice(token: TokenRef): Promise<PriceInfo> {
    const cacheKey = buildCacheKey(token.chain, token.address);

    return this.cache.getOrFetch(cacheKey, async () => {
      return this.fetchWithFallback(token, cacheKey);
    });
  }

  /**
   * Get prices for multiple tokens.
   *
   * Each token is queried individually via getPrice() (which handles
   * cache, fallback, and cross-validation per token). Failed tokens
   * are silently excluded from the result Map.
   *
   * @param tokens - Array of token references.
   * @returns Map from cache key to PriceInfo.
   */
  async getPrices(tokens: TokenRef[]): Promise<Map<string, PriceInfo>> {
    const result = new Map<string, PriceInfo>();

    const promises = tokens.map(async (token) => {
      try {
        const price = await this.getPrice(token);
        const key = buildCacheKey(token.chain, token.address);
        result.set(key, price);
      } catch {
        // Skip failed tokens
      }
    });

    await Promise.all(promises);
    return result;
  }

  /**
   * Get native token price (SOL or ETH).
   *
   * Delegates to getPrice() with address='native' and chain-appropriate decimals.
   *
   * @param chain - Chain type ('solana' or 'ethereum').
   * @returns PriceInfo for the native token.
   */
  async getNativePrice(chain: ChainType): Promise<PriceInfo> {
    const decimals = chain === 'solana' ? 9 : 18;
    return this.getPrice({ address: 'native', decimals, chain });
  }

  /**
   * Get cache statistics from InMemoryPriceCache.
   *
   * @returns Current cache hit/miss/stale/size/eviction counts.
   */
  getCacheStats(): CacheStats {
    return this.cache.getStats();
  }

  // ---------------------------------------------------------------------------
  // Private: Fetch with fallback and cross-validation
  // ---------------------------------------------------------------------------

  /**
   * Core fallback + cross-validation logic.
   *
   * Called by cache.getOrFetch() on cache miss. This function:
   * 1. Tries primary oracle.
   * 2. On primary success, cross-validates with fallback (if available).
   * 3. On primary failure, tries fallback as data source.
   * 4. On all failures, checks stale cache.
   * 5. If everything fails, throws PriceNotAvailableError.
   *
   * Note: stale fallback is handled inside the fetcher so it can
   * return stale data that gets re-cached (intentional: oracle outage survival).
   */
  private async fetchWithFallback(token: TokenRef, cacheKey: string): Promise<PriceInfo> {
    // Stage 1: Try primary oracle (Pyth)
    let primaryResult: PriceInfo | null = null;
    try {
      primaryResult = await this.primary.getPrice(token);
    } catch {
      // Primary failed, continue to fallback
    }

    // Stage 2a: Primary succeeded -> cross-validate with fallback
    if (primaryResult) {
      if (this.fallback) {
        try {
          const fallbackResult = await this.fallback.getPrice(token);
          const deviation = calculateDeviation(primaryResult.usdPrice, fallbackResult.usdPrice);
          if (deviation > this.threshold) {
            // Deviation too high -- degrade to stale
            return { ...primaryResult, isStale: true };
          }
        } catch {
          // Fallback failed during cross-validation -- trust primary as-is
        }
      }
      return primaryResult;
    }

    // Stage 2b: Primary failed -> try fallback as data source
    if (this.fallback) {
      try {
        return await this.fallback.getPrice(token);
      } catch {
        // Fallback also failed
      }
    }

    // Stage 3: All oracles failed -> try stale cache
    const stale = this.cache.getStale(cacheKey);
    if (stale) {
      return { ...stale, isStale: true, source: 'cache' as const };
    }

    // Stage 4: Nothing available
    throw new PriceNotAvailableError(cacheKey);
  }
}
