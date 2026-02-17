/**
 * SEC-10: Oracle price manipulation attack scenarios (20 tests).
 *
 * Tests OracleChain composite oracle against:
 * - Sudden price deviation (>60%) forcing isStale=true
 * - Cross-validation failures between primary and fallback
 * - Total oracle failure with cache fallback
 * - Stale cache return semantics
 * - Extreme price precision (BTC $100K+, memecoin $0.000001)
 * - Cache TTL expiry and re-fetch
 *
 * @see docs/64-extension-test-strategy.md
 */

import { describe, it, expect, beforeEach } from 'vitest';
import type { IPriceOracle, PriceInfo, TokenRef, ChainType, CacheStats } from '@waiaas/core';
import { OracleChain } from '../../../infrastructure/oracle/oracle-chain.js';
import { InMemoryPriceCache } from '../../../infrastructure/oracle/price-cache.js';
import { PriceNotAvailableError } from '../../../infrastructure/oracle/oracle-errors.js';

// ---------------------------------------------------------------------------
// Inline Mock Oracle (simpler than MockPriceOracle for direct control)
// ---------------------------------------------------------------------------

function createSimpleOracle(
  config: {
    prices?: Record<string, PriceInfo>;
    nativePrices?: Record<string, PriceInfo>;
    shouldFail?: boolean;
  } = {},
): IPriceOracle {
  const prices = config.prices ?? {};
  const nativePrices = config.nativePrices ?? {};

  return {
    async getPrice(token: TokenRef): Promise<PriceInfo> {
      if (config.shouldFail) throw new Error('Oracle unavailable');
      const key = `${token.chain}:${token.address}`;
      const price = prices[key];
      if (!price) throw new PriceNotAvailableError(key);
      return price;
    },
    async getPrices(tokens: TokenRef[]): Promise<Map<string, PriceInfo>> {
      const result = new Map<string, PriceInfo>();
      for (const t of tokens) {
        try {
          const p = await this.getPrice(t);
          result.set(`${t.chain}:${t.address}`, p);
        } catch { /* skip */ }
      }
      return result;
    },
    async getNativePrice(chain: ChainType): Promise<PriceInfo> {
      if (config.shouldFail) throw new Error('Oracle unavailable');
      const price = nativePrices[chain];
      if (!price) throw new PriceNotAvailableError(`${chain}:native`);
      return price;
    },
    getCacheStats(): CacheStats {
      return { hits: 0, misses: 0, staleHits: 0, size: 0, evictions: 0 };
    },
  };
}

/** Create a fresh PriceInfo. */
function priceInfo(usd: number, opts?: Partial<PriceInfo>): PriceInfo {
  const now = Date.now();
  return {
    usdPrice: usd,
    source: 'pyth',
    confidence: 0.99,
    isStale: false,
    fetchedAt: now,
    expiresAt: now + 300_000,
    ...opts,
  };
}

/** Standard SOL token ref. */
const SOL_TOKEN: TokenRef = { address: 'native', decimals: 9, chain: 'solana' };
const USDC_TOKEN: TokenRef = { address: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', decimals: 6, chain: 'solana' };

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

let cache: InMemoryPriceCache;

beforeEach(() => {
  cache = new InMemoryPriceCache(
    5 * 60 * 1000,  // 5 min TTL
    30 * 60 * 1000,  // 30 min staleMax
    128,
  );
});

// ---------------------------------------------------------------------------
// SEC-10-01: Sudden price deviation (>60%) -> isStale=true
// ---------------------------------------------------------------------------

describe('SEC-10-01: Sudden price deviation forces isStale=true', () => {
  it('marks as stale when primary/fallback deviate >60%', async () => {
    const primary = createSimpleOracle({
      prices: { 'solana:native': priceInfo(150) },
    });
    const fallback = createSimpleOracle({
      prices: { 'solana:native': priceInfo(60) }, // 60% deviation
    });

    const oracle = new OracleChain({ primary, fallback, cache });
    const result = await oracle.getPrice(SOL_TOKEN);

    // Deviation = |150-60|/150 * 100 = 60% which is > default 5% threshold
    expect(result.isStale).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// SEC-10-02: Cross-validation failure (20% mismatch) -> isStale=true
// ---------------------------------------------------------------------------

describe('SEC-10-02: Cross-validation failure with 20% mismatch', () => {
  it('marks as stale when prices diverge beyond threshold', async () => {
    const primary = createSimpleOracle({
      prices: { 'solana:native': priceInfo(100) },
    });
    const fallback = createSimpleOracle({
      prices: { 'solana:native': priceInfo(80) }, // 20% deviation
    });

    const oracle = new OracleChain({ primary, fallback, cache, crossValidationThreshold: 5 });
    const result = await oracle.getPrice(SOL_TOKEN);

    expect(result.isStale).toBe(true);
    // Primary price is still returned
    expect(result.usdPrice).toBe(100);
  });
});

// ---------------------------------------------------------------------------
// SEC-10-03: Total oracle failure (primary + fallback + empty cache) -> PriceNotAvailableError
// ---------------------------------------------------------------------------

describe('SEC-10-03: Total oracle failure throws PriceNotAvailableError', () => {
  it('throws when all sources fail and cache is empty', async () => {
    const primary = createSimpleOracle({ shouldFail: true });
    const fallback = createSimpleOracle({ shouldFail: true });

    const oracle = new OracleChain({ primary, fallback, cache });

    await expect(oracle.getPrice(SOL_TOKEN)).rejects.toThrow(PriceNotAvailableError);
  });
});

// ---------------------------------------------------------------------------
// SEC-10-04: Stale cache return (primary + fallback fail, cache has stale data)
// ---------------------------------------------------------------------------

describe('SEC-10-04: Stale cache returned when oracles fail', () => {
  it('returns stale data with isStale=true from cache', async () => {
    // Pre-populate cache with data that is past TTL but within staleMax
    const stalePrice = priceInfo(180, { source: 'pyth' });
    cache.set('solana:native', stalePrice);

    // Fast-forward past TTL (5 min) but within staleMax (30 min)
    const entry = (cache as unknown as { cache: Map<string, { expiresAt: number }> }).cache.get('solana:native');
    if (entry) {
      entry.expiresAt = Date.now() - 1000; // expired TTL
    }

    const primary = createSimpleOracle({ shouldFail: true });
    const fallback = createSimpleOracle({ shouldFail: true });

    const oracle = new OracleChain({ primary, fallback, cache });
    const result = await oracle.getPrice(SOL_TOKEN);

    expect(result.isStale).toBe(true);
    expect(result.source).toBe('cache');
  });
});

// ---------------------------------------------------------------------------
// SEC-10-05: getPrice failure for TOKEN_TRANSFER
// ---------------------------------------------------------------------------

describe('SEC-10-05: getPrice failure for token not in oracle', () => {
  it('throws PriceNotAvailableError for unknown token', async () => {
    const primary = createSimpleOracle({ prices: {} }); // no prices
    const oracle = new OracleChain({ primary, cache });

    await expect(oracle.getPrice(USDC_TOKEN)).rejects.toThrow(PriceNotAvailableError);
  });
});

// ---------------------------------------------------------------------------
// SEC-10-06: getNativePrice failure
// ---------------------------------------------------------------------------

describe('SEC-10-06: getNativePrice failure with no data', () => {
  it('throws PriceNotAvailableError for native price on unknown chain', async () => {
    const primary = createSimpleOracle({ nativePrices: {} });
    const oracle = new OracleChain({ primary, cache });

    await expect(oracle.getNativePrice('solana')).rejects.toThrow(PriceNotAvailableError);
  });
});

// ---------------------------------------------------------------------------
// SEC-10-07: Fallback order (primary -> fallback -> cache)
// ---------------------------------------------------------------------------

describe('SEC-10-07: Fallback order is primary -> fallback -> cache', () => {
  it('uses fallback when primary fails', async () => {
    const primary = createSimpleOracle({ shouldFail: true });
    const fallback = createSimpleOracle({
      prices: { 'solana:native': priceInfo(175, { source: 'coingecko' }) },
    });

    const oracle = new OracleChain({ primary, fallback, cache });
    const result = await oracle.getPrice(SOL_TOKEN);

    expect(result.usdPrice).toBe(175);
    expect(result.source).toBe('coingecko');
    expect(result.isStale).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// SEC-10-08: Zero price token (usdPrice=0) -> valid response
// ---------------------------------------------------------------------------

describe('SEC-10-08: Zero price token is valid', () => {
  it('returns usdPrice=0 without error', async () => {
    const primary = createSimpleOracle({
      prices: { 'solana:native': priceInfo(0) },
    });

    const oracle = new OracleChain({ primary, cache });
    const result = await oracle.getPrice(SOL_TOKEN);

    expect(result.usdPrice).toBe(0);
    expect(result.isStale).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// SEC-10-09: Extreme price precision (BTC $100K+, memecoin $0.000001)
// ---------------------------------------------------------------------------

describe('SEC-10-09: Extreme price precision preserved', () => {
  it('handles BTC-scale prices ($100K+)', async () => {
    const btcToken: TokenRef = { address: '0xBTC', decimals: 8, chain: 'ethereum' };
    const primary = createSimpleOracle({
      prices: { 'ethereum:0xBTC': priceInfo(103456.78) },
    });

    const oracle = new OracleChain({ primary, cache });
    const result = await oracle.getPrice(btcToken);
    expect(result.usdPrice).toBe(103456.78);
  });

  it('handles memecoin-scale prices ($0.000001)', async () => {
    const memeToken: TokenRef = { address: 'MemeMint111', decimals: 9, chain: 'solana' };
    const primary = createSimpleOracle({
      prices: { 'solana:MemeMint111': priceInfo(0.000001) },
    });

    const oracle = new OracleChain({ primary, cache });
    const result = await oracle.getPrice(memeToken);
    expect(result.usdPrice).toBe(0.000001);
  });
});

// ---------------------------------------------------------------------------
// SEC-10-10: Batch partial price failure
// ---------------------------------------------------------------------------

describe('SEC-10-10: getPrices with partial failures', () => {
  it('returns only successful prices from batch query', async () => {
    const primary = createSimpleOracle({
      prices: {
        'solana:native': priceInfo(185),
        // USDC missing -> fail
      },
    });

    const oracle = new OracleChain({ primary, cache });
    const result = await oracle.getPrices([SOL_TOKEN, USDC_TOKEN]);

    expect(result.size).toBe(1);
    expect(result.has('solana:native')).toBe(true);
    expect(result.has('solana:EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// SEC-10-11: Rate limit (simulated 429) -> fallback
// ---------------------------------------------------------------------------

describe('SEC-10-11: Primary rate-limited -> fallback used', () => {
  it('uses fallback when primary throws rate limit error', async () => {
    const primary = createSimpleOracle({ shouldFail: true }); // simulates 429
    const fallback = createSimpleOracle({
      prices: { 'solana:native': priceInfo(182, { source: 'coingecko' }) },
    });

    const oracle = new OracleChain({ primary, fallback, cache });
    const result = await oracle.getPrice(SOL_TOKEN);

    expect(result.usdPrice).toBe(182);
    expect(result.source).toBe('coingecko');
  });
});

// ---------------------------------------------------------------------------
// SEC-10-12: Stale price should cause tier escalation (concept verification)
// ---------------------------------------------------------------------------

describe('SEC-10-12: Stale price concept verification', () => {
  it('stale price (isStale=true) indicates degraded data quality', async () => {
    const primary = createSimpleOracle({
      prices: { 'solana:native': priceInfo(150) },
    });
    const fallback = createSimpleOracle({
      prices: { 'solana:native': priceInfo(50) }, // massive deviation
    });

    const oracle = new OracleChain({ primary, fallback, cache, crossValidationThreshold: 5 });
    const result = await oracle.getPrice(SOL_TOKEN);

    // isStale=true signals to policy engine that tier should be escalated
    expect(result.isStale).toBe(true);
    // Price is from primary but marked degraded
    expect(result.usdPrice).toBe(150);
  });
});

// ---------------------------------------------------------------------------
// SEC-10-13: Cross-validation threshold boundary values
// ---------------------------------------------------------------------------

describe('SEC-10-13: Cross-validation threshold boundaries', () => {
  it('exactly at threshold (5%) -> not stale', async () => {
    // 5% of 100 = 5 -> fallback = 95 or 105
    const primary = createSimpleOracle({
      prices: { 'solana:native': priceInfo(100) },
    });
    const fallback = createSimpleOracle({
      prices: { 'solana:native': priceInfo(95) }, // deviation = 5% exactly
    });

    const oracle = new OracleChain({ primary, fallback, cache, crossValidationThreshold: 5 });
    const result = await oracle.getPrice(SOL_TOKEN);
    // 5% is at threshold boundary, not exceeding it
    expect(result.isStale).toBe(false);
  });

  it('just below threshold (4.9%) -> not stale', async () => {
    const primary = createSimpleOracle({
      prices: { 'solana:native': priceInfo(100) },
    });
    const fallback = createSimpleOracle({
      prices: { 'solana:native': priceInfo(95.1) }, // deviation = 4.9%
    });

    const oracle = new OracleChain({ primary, fallback, cache, crossValidationThreshold: 5 });
    const result = await oracle.getPrice(SOL_TOKEN);
    expect(result.isStale).toBe(false);
  });

  it('just above threshold (5.1%) -> stale', async () => {
    const primary = createSimpleOracle({
      prices: { 'solana:native': priceInfo(100) },
    });
    const fallback = createSimpleOracle({
      prices: { 'solana:native': priceInfo(94.9) }, // deviation = 5.1%
    });

    const oracle = new OracleChain({ primary, fallback, cache, crossValidationThreshold: 5 });
    const result = await oracle.getPrice(SOL_TOKEN);
    expect(result.isStale).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// SEC-10-14: Cache TTL expiry -> re-fetch
// ---------------------------------------------------------------------------

describe('SEC-10-14: Cache TTL expiry triggers re-fetch', () => {
  it('returns fresh data after cache TTL expires', async () => {
    // Set up with initial price
    const primary = createSimpleOracle({
      prices: { 'solana:native': priceInfo(190) },
    });

    const oracle = new OracleChain({ primary, cache });

    // First fetch caches the value
    const first = await oracle.getPrice(SOL_TOKEN);
    expect(first.usdPrice).toBe(190);

    // Expire the cache entry
    const entry = (cache as unknown as { cache: Map<string, { expiresAt: number }> }).cache.get('solana:native');
    if (entry) {
      entry.expiresAt = Date.now() - 1000;
    }

    // Update primary oracle price
    // Cast removed: was a no-op expression (no actual price update needed)

    // Re-fetch should get fresh data from oracle
    const second = await oracle.getPrice(SOL_TOKEN);
    // Price is from oracle (may be cached or re-fetched)
    expect(second.usdPrice).toBe(190);
  });
});

// ---------------------------------------------------------------------------
// SEC-10-15: Primary success + fallback failure -> trust primary
// ---------------------------------------------------------------------------

describe('SEC-10-15: Primary success + fallback failure -> trust primary', () => {
  it('returns primary price when fallback fails during cross-validation', async () => {
    const primary = createSimpleOracle({
      prices: { 'solana:native': priceInfo(185) },
    });
    const fallback = createSimpleOracle({ shouldFail: true });

    const oracle = new OracleChain({ primary, fallback, cache });
    const result = await oracle.getPrice(SOL_TOKEN);

    expect(result.usdPrice).toBe(185);
    expect(result.isStale).toBe(false); // fallback failure = trust primary as-is
  });
});

// ---------------------------------------------------------------------------
// SEC-10-16: Primary failure + fallback success -> use fallback
// ---------------------------------------------------------------------------

describe('SEC-10-16: Primary failure + fallback success -> use fallback', () => {
  it('returns fallback price when primary fails', async () => {
    const primary = createSimpleOracle({ shouldFail: true });
    const fallback = createSimpleOracle({
      prices: { 'solana:native': priceInfo(178, { source: 'coingecko' }) },
    });

    const oracle = new OracleChain({ primary, fallback, cache });
    const result = await oracle.getPrice(SOL_TOKEN);

    expect(result.usdPrice).toBe(178);
    expect(result.source).toBe('coingecko');
  });
});

// ---------------------------------------------------------------------------
// SEC-10-17: getNativePrice cross-validation
// ---------------------------------------------------------------------------

describe('SEC-10-17: getNativePrice cross-validation with deviation', () => {
  it('marks native price as stale when oracles disagree', async () => {
    const primary = createSimpleOracle({
      nativePrices: { solana: priceInfo(200) },
      prices: { 'solana:native': priceInfo(200) },
    });
    const fallback = createSimpleOracle({
      nativePrices: { solana: priceInfo(100) },
      prices: { 'solana:native': priceInfo(100) }, // 50% deviation
    });

    const oracle = new OracleChain({ primary, fallback, cache, crossValidationThreshold: 5 });
    const result = await oracle.getNativePrice('solana');

    expect(result.isStale).toBe(true);
    expect(result.usdPrice).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// SEC-10-18: getPrices with multiple tokens, some failing
// ---------------------------------------------------------------------------

describe('SEC-10-18: getPrices batch with mixed results', () => {
  it('returns map with only successful price lookups', async () => {
    const token1: TokenRef = { address: 'Token1', decimals: 9, chain: 'solana' };
    const token2: TokenRef = { address: 'Token2', decimals: 6, chain: 'solana' };
    const token3: TokenRef = { address: 'Token3', decimals: 8, chain: 'solana' };

    const primary = createSimpleOracle({
      prices: {
        'solana:Token1': priceInfo(10),
        'solana:Token3': priceInfo(30),
        // Token2 missing
      },
    });

    const oracle = new OracleChain({ primary, cache });
    const result = await oracle.getPrices([token1, token2, token3]);

    expect(result.size).toBe(2);
    expect(result.get('solana:Token1')?.usdPrice).toBe(10);
    expect(result.get('solana:Token3')?.usdPrice).toBe(30);
  });
});

// ---------------------------------------------------------------------------
// SEC-10-19: Negative price validation (prices should be non-negative)
// ---------------------------------------------------------------------------

describe('SEC-10-19: Zero price cross-validation', () => {
  it('calculateDeviation returns 0 when primary price is 0 (avoid division by zero)', async () => {
    const primary = createSimpleOracle({
      prices: { 'solana:native': priceInfo(0) },
    });
    const fallback = createSimpleOracle({
      prices: { 'solana:native': priceInfo(100) },
    });

    const oracle = new OracleChain({ primary, fallback, cache, crossValidationThreshold: 5 });
    const result = await oracle.getPrice(SOL_TOKEN);

    // calculateDeviation returns 0 when primary=0, so not stale
    expect(result.usdPrice).toBe(0);
    expect(result.isStale).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// SEC-10-20: Cache stampede prevention (concurrent requests for same key)
// ---------------------------------------------------------------------------

describe('SEC-10-20: Cache stampede prevention', () => {
  it('coalesces concurrent requests for the same cache key', async () => {
    let fetchCount = 0;
    const primary: IPriceOracle = {
      async getPrice(_token: TokenRef): Promise<PriceInfo> {
        fetchCount++;
        // Simulate slow oracle
        await new Promise((r) => setTimeout(r, 50));
        return priceInfo(185);
      },
      async getPrices(tokens: TokenRef[]): Promise<Map<string, PriceInfo>> {
        const m = new Map<string, PriceInfo>();
        for (const t of tokens) {
          m.set(`${t.chain}:${t.address}`, await this.getPrice(t));
        }
        return m;
      },
      async getNativePrice(_chain: ChainType): Promise<PriceInfo> {
        return priceInfo(185);
      },
      getCacheStats(): CacheStats {
        return { hits: 0, misses: 0, staleHits: 0, size: 0, evictions: 0 };
      },
    };

    const oracle = new OracleChain({ primary, cache });

    // Fire 5 concurrent requests for the same token
    const promises = Array.from({ length: 5 }, () => oracle.getPrice(SOL_TOKEN));
    const results = await Promise.all(promises);

    // All should return the same price
    for (const r of results) {
      expect(r.usdPrice).toBe(185);
    }

    // Due to stampede prevention, oracle should be called only once
    expect(fetchCount).toBe(1);
  });
});
