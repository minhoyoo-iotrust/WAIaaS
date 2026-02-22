/**
 * OracleChain unit tests: 3-stage fallback + cross-validation + cache.
 *
 * OracleChain implements IPriceOracle as composite oracle:
 * Primary (Pyth) -> Fallback (CoinGecko, optional) -> Stale Cache.
 *
 * Cross-validation: When both primary and fallback succeed,
 * deviation > threshold (5%) degrades result to isStale=true.
 *
 * Tests use mock IPriceOracle instances for primary and fallback.
 *
 * Cache keys are CAIP-19 format (Phase 232 migration).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { IPriceOracle, TokenRef, PriceInfo } from '@waiaas/core';
import { InMemoryPriceCache, buildCacheKey } from '../infrastructure/oracle/price-cache.js';
import { PriceNotAvailableError } from '../infrastructure/oracle/oracle-errors.js';
import { OracleChain } from '../infrastructure/oracle/oracle-chain.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createMockOracle(overrides?: Partial<IPriceOracle>): IPriceOracle {
  return {
    getPrice: vi.fn().mockRejectedValue(new Error('not implemented')),
    getPrices: vi.fn().mockResolvedValue(new Map()),
    getNativePrice: vi.fn().mockRejectedValue(new Error('not implemented')),
    getCacheStats: vi.fn().mockReturnValue({ hits: 0, misses: 0, staleHits: 0, size: 0, evictions: 0 }),
    ...overrides,
  };
}

function buildPrice(usdPrice: number, source: 'pyth' | 'coingecko' | 'cache' = 'pyth'): PriceInfo {
  const now = Date.now();
  return {
    usdPrice,
    source,
    fetchedAt: now,
    expiresAt: now + 300_000,
    isStale: false,
  };
}

const SOL_TOKEN: TokenRef = {
  address: 'native',
  decimals: 9,
  chain: 'solana',
  network: 'mainnet',
};

const ETH_TOKEN: TokenRef = {
  address: 'native',
  decimals: 18,
  chain: 'ethereum',
  network: 'ethereum-mainnet',
};

const _USDC_TOKEN: TokenRef = {
  address: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
  symbol: 'USDC',
  decimals: 6,
  chain: 'solana',
  network: 'mainnet',
};

// CAIP-19 cache keys for test assertions
const SOL_CACHE_KEY = buildCacheKey('mainnet', 'native');         // solana:5eykt.../slip44:501
const ETH_CACHE_KEY = buildCacheKey('ethereum-mainnet', 'native'); // eip155:1/slip44:60

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('OracleChain', () => {
  let cache: InMemoryPriceCache;

  beforeEach(() => {
    // Short TTL (100ms) and stale max (5s) for test convenience
    cache = new InMemoryPriceCache(100, 5000, 128);
  });

  // -------------------------------------------------------------------------
  // 1. Primary success -> return + cache
  // -------------------------------------------------------------------------

  it('Primary 성공 -> Primary 가격 반환 + 캐시 저장', async () => {
    const primaryPrice = buildPrice(150, 'pyth');
    const primary = createMockOracle({
      getPrice: vi.fn().mockResolvedValue(primaryPrice),
    });

    const chain = new OracleChain({ primary, cache });
    const result = await chain.getPrice(SOL_TOKEN);

    expect(result.usdPrice).toBe(150);
    expect(result.source).toBe('pyth');
    expect(result.isStale).toBe(false);

    // Verify cache was populated with CAIP-19 key
    const cached = cache.get(SOL_CACHE_KEY);
    expect(cached).not.toBeNull();
    expect(cached!.usdPrice).toBe(150);
  });

  // -------------------------------------------------------------------------
  // 2. Primary fail + Fallback success -> Fallback price
  // -------------------------------------------------------------------------

  it('Primary 실패 + Fallback 성공 -> Fallback 가격 반환', async () => {
    const primary = createMockOracle({
      getPrice: vi.fn().mockRejectedValue(new PriceNotAvailableError(SOL_CACHE_KEY)),
    });
    const fallbackPrice = buildPrice(148, 'coingecko');
    const fallback = createMockOracle({
      getPrice: vi.fn().mockResolvedValue(fallbackPrice),
    });

    const chain = new OracleChain({ primary, fallback, cache });
    const result = await chain.getPrice(SOL_TOKEN);

    expect(result.usdPrice).toBe(148);
    expect(result.source).toBe('coingecko');
  });

  // -------------------------------------------------------------------------
  // 3. Primary fail + No fallback -> Stale cache
  // -------------------------------------------------------------------------

  it('Primary 실패 + Fallback 없음 -> Stale 캐시 fallback', async () => {
    // Seed stale cache entry with CAIP-19 key
    cache.set(SOL_CACHE_KEY, buildPrice(145, 'pyth'));
    // Wait for TTL to expire
    await new Promise((r) => setTimeout(r, 150));

    const primary = createMockOracle({
      getPrice: vi.fn().mockRejectedValue(new PriceNotAvailableError(SOL_CACHE_KEY)),
    });

    const chain = new OracleChain({ primary, cache });
    const result = await chain.getPrice(SOL_TOKEN);

    expect(result.usdPrice).toBe(145);
    expect(result.isStale).toBe(true);
  });

  // -------------------------------------------------------------------------
  // 4. Primary fail + Fallback fail -> Stale cache
  // -------------------------------------------------------------------------

  it('Primary 실패 + Fallback 실패 -> Stale 캐시 fallback', async () => {
    // Seed stale cache entry with CAIP-19 key
    cache.set(SOL_CACHE_KEY, buildPrice(140, 'pyth'));
    // Wait for TTL to expire
    await new Promise((r) => setTimeout(r, 150));

    const primary = createMockOracle({
      getPrice: vi.fn().mockRejectedValue(new Error('Pyth API timeout')),
    });
    const fallback = createMockOracle({
      getPrice: vi.fn().mockRejectedValue(new Error('CoinGecko 429')),
    });

    const chain = new OracleChain({ primary, fallback, cache });
    const result = await chain.getPrice(SOL_TOKEN);

    expect(result.usdPrice).toBe(140);
    expect(result.isStale).toBe(true);
  });

  // -------------------------------------------------------------------------
  // 5. All fail + No stale -> PriceNotAvailableError
  // -------------------------------------------------------------------------

  it('모든 실패 + Stale 캐시 없음 -> PriceNotAvailableError throw', async () => {
    const primary = createMockOracle({
      getPrice: vi.fn().mockRejectedValue(new PriceNotAvailableError(SOL_CACHE_KEY)),
    });
    const fallback = createMockOracle({
      getPrice: vi.fn().mockRejectedValue(new Error('CoinGecko down')),
    });

    const chain = new OracleChain({ primary, fallback, cache });

    await expect(chain.getPrice(SOL_TOKEN)).rejects.toThrow(PriceNotAvailableError);
  });

  // -------------------------------------------------------------------------
  // 6. Cross-validation: deviation <= 5% -> adopt (isStale=false)
  // -------------------------------------------------------------------------

  it('교차 검증: 편차 <= 5% -> Primary 가격 채택 (isStale=false)', async () => {
    const primary = createMockOracle({
      getPrice: vi.fn().mockResolvedValue(buildPrice(100, 'pyth')),
    });
    const fallback = createMockOracle({
      getPrice: vi.fn().mockResolvedValue(buildPrice(103, 'coingecko')),
    });

    const chain = new OracleChain({ primary, fallback, cache });
    const result = await chain.getPrice(SOL_TOKEN);

    expect(result.usdPrice).toBe(100);
    expect(result.source).toBe('pyth');
    expect(result.isStale).toBe(false);
  });

  // -------------------------------------------------------------------------
  // 7. Cross-validation: deviation > 5% -> degrade (isStale=true)
  // -------------------------------------------------------------------------

  it('교차 검증: 편차 > 5% -> STALE 격하 (isStale=true)', async () => {
    const primary = createMockOracle({
      getPrice: vi.fn().mockResolvedValue(buildPrice(100, 'pyth')),
    });
    const fallback = createMockOracle({
      getPrice: vi.fn().mockResolvedValue(buildPrice(120, 'coingecko')),
    });

    const chain = new OracleChain({ primary, fallback, cache });
    const result = await chain.getPrice(SOL_TOKEN);

    expect(result.usdPrice).toBe(100);
    expect(result.source).toBe('pyth');
    expect(result.isStale).toBe(true);
  });

  // -------------------------------------------------------------------------
  // 8. Cross-validation: exactly 5% -> adopt (boundary)
  // -------------------------------------------------------------------------

  it('교차 검증: 정확히 5% -> 채택 (isStale=false)', async () => {
    const primary = createMockOracle({
      getPrice: vi.fn().mockResolvedValue(buildPrice(100, 'pyth')),
    });
    const fallback = createMockOracle({
      getPrice: vi.fn().mockResolvedValue(buildPrice(105, 'coingecko')),
    });

    const chain = new OracleChain({ primary, fallback, cache });
    const result = await chain.getPrice(SOL_TOKEN);

    expect(result.usdPrice).toBe(100);
    expect(result.isStale).toBe(false);
  });

  // -------------------------------------------------------------------------
  // 9. Cross-validation: just over 5% -> degrade (boundary)
  // -------------------------------------------------------------------------

  it('교차 검증: 정확히 5% 초과 -> 격하 (isStale=true)', async () => {
    const primary = createMockOracle({
      getPrice: vi.fn().mockResolvedValue(buildPrice(100, 'pyth')),
    });
    const fallback = createMockOracle({
      getPrice: vi.fn().mockResolvedValue(buildPrice(105.01, 'coingecko')),
    });

    const chain = new OracleChain({ primary, fallback, cache });
    const result = await chain.getPrice(SOL_TOKEN);

    expect(result.usdPrice).toBe(100);
    expect(result.isStale).toBe(true);
  });

  // -------------------------------------------------------------------------
  // 10. No fallback -> skip cross-validation
  // -------------------------------------------------------------------------

  it('Fallback 없으면 교차 검증 스킵', async () => {
    const primary = createMockOracle({
      getPrice: vi.fn().mockResolvedValue(buildPrice(100, 'pyth')),
    });

    const chain = new OracleChain({ primary, cache });
    const result = await chain.getPrice(SOL_TOKEN);

    expect(result.usdPrice).toBe(100);
    expect(result.isStale).toBe(false);
  });

  // -------------------------------------------------------------------------
  // 11. Cross-validation: fallback error -> trust primary
  // -------------------------------------------------------------------------

  it('교차 검증 시 Fallback 실패 -> Primary 가격 신뢰', async () => {
    const primary = createMockOracle({
      getPrice: vi.fn().mockResolvedValue(buildPrice(100, 'pyth')),
    });
    const fallback = createMockOracle({
      getPrice: vi.fn().mockRejectedValue(new Error('CoinGecko timeout')),
    });

    const chain = new OracleChain({ primary, fallback, cache });
    const result = await chain.getPrice(SOL_TOKEN);

    expect(result.usdPrice).toBe(100);
    expect(result.source).toBe('pyth');
    expect(result.isStale).toBe(false);
  });

  // -------------------------------------------------------------------------
  // 12. getPrices() batch query with CAIP-19 keys
  // -------------------------------------------------------------------------

  it('getPrices() - 여러 토큰 배치 조회 (CAIP-19 키)', async () => {
    const primary = createMockOracle({
      getPrice: vi.fn()
        .mockResolvedValueOnce(buildPrice(150, 'pyth'))   // SOL
        .mockResolvedValueOnce(buildPrice(3500, 'pyth')), // ETH
    });

    const chain = new OracleChain({ primary, cache });
    const result = await chain.getPrices([SOL_TOKEN, ETH_TOKEN]);

    expect(result.size).toBe(2);
    expect(result.get(SOL_CACHE_KEY)?.usdPrice).toBe(150);
    expect(result.get(ETH_CACHE_KEY)?.usdPrice).toBe(3500);
  });

  // -------------------------------------------------------------------------
  // 13. getNativePrice() delegation
  // -------------------------------------------------------------------------

  it('getNativePrice() - 네이티브 토큰 가격 조회 위임', async () => {
    const primary = createMockOracle({
      getPrice: vi.fn().mockResolvedValue(buildPrice(150, 'pyth')),
    });

    const chain = new OracleChain({ primary, cache });
    const result = await chain.getNativePrice('solana');

    expect(result.usdPrice).toBe(150);
    expect(result.source).toBe('pyth');
    // Verify getPrice was called with native token including network
    expect(primary.getPrice).toHaveBeenCalledWith(
      expect.objectContaining({ address: 'native', chain: 'solana', decimals: 9, network: 'mainnet' }),
    );
  });

  // -------------------------------------------------------------------------
  // 14. getCacheStats() returns cache stats
  // -------------------------------------------------------------------------

  it('getCacheStats() - InMemoryPriceCache의 stats 반환', () => {
    const primary = createMockOracle();
    const chain = new OracleChain({ primary, cache });

    const stats = chain.getCacheStats();
    expect(stats).toEqual(expect.objectContaining({
      hits: expect.any(Number),
      misses: expect.any(Number),
      staleHits: expect.any(Number),
      size: expect.any(Number),
      evictions: expect.any(Number),
    }));
  });

  // -------------------------------------------------------------------------
  // 15. Cache hit -> skip API call (CAIP-19 key)
  // -------------------------------------------------------------------------

  it('캐시 히트 시 API 호출 건너뜀 (CAIP-19 키)', async () => {
    // Seed fresh cache entry with CAIP-19 key
    cache.set(SOL_CACHE_KEY, buildPrice(155, 'pyth'));

    const primary = createMockOracle({
      getPrice: vi.fn().mockResolvedValue(buildPrice(160, 'pyth')),
    });

    const chain = new OracleChain({ primary, cache });
    const result = await chain.getPrice(SOL_TOKEN);

    // Should return cached value, not fresh one
    expect(result.usdPrice).toBe(155);
    // Primary should NOT have been called
    expect(primary.getPrice).not.toHaveBeenCalled();
  });
});
