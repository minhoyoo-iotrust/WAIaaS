/**
 * CT-6: IPriceOracle Contract Test shared suite.
 *
 * Verifies that any IPriceOracle implementation returns valid PriceInfo
 * from getPrice(), getPrices(), getNativePrice(), and valid CacheStats
 * from getCacheStats().
 *
 * Both MockPriceOracle and OracleChain must pass these tests to
 * guarantee behavioral equivalence.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import type { IPriceOracle, PriceInfo, CacheStats, TokenRef } from '../../interfaces/price-oracle.types.js';
import type { ChainType } from '../../enums/chain.js';

// ---------------------------------------------------------------------------
// Standard test tokens
// ---------------------------------------------------------------------------

const CONTRACT_TEST_TOKEN: TokenRef = {
  address: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
  symbol: 'USDC',
  decimals: 6,
  chain: 'solana',
};

const CONTRACT_TEST_TOKEN_2: TokenRef = {
  address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
  symbol: 'USDC',
  decimals: 6,
  chain: 'ethereum',
};

// ---------------------------------------------------------------------------
// PriceInfo shape validation helper
// ---------------------------------------------------------------------------

function assertValidPriceInfo(info: PriceInfo): void {
  expect(info).toBeDefined();
  expect(typeof info.usdPrice).toBe('number');
  expect(info.usdPrice).toBeGreaterThanOrEqual(0);

  expect(['pyth', 'coingecko', 'cache']).toContain(info.source);

  expect(Number.isInteger(info.fetchedAt)).toBe(true);
  expect(info.fetchedAt).toBeGreaterThan(0);

  expect(Number.isInteger(info.expiresAt)).toBe(true);
  expect(info.expiresAt).toBeGreaterThanOrEqual(info.fetchedAt);

  expect(typeof info.isStale).toBe('boolean');
}

// ---------------------------------------------------------------------------
// CacheStats shape validation helper
// ---------------------------------------------------------------------------

function assertValidCacheStats(stats: CacheStats): void {
  expect(stats).toBeDefined();

  for (const field of ['hits', 'misses', 'staleHits', 'size', 'evictions'] as const) {
    expect(typeof stats[field]).toBe('number');
    expect(Number.isInteger(stats[field])).toBe(true);
    expect(stats[field]).toBeGreaterThanOrEqual(0);
  }
}

// ---------------------------------------------------------------------------
// Shared suite
// ---------------------------------------------------------------------------

/**
 * IPriceOracle contract test suite.
 *
 * @param factory - Function that returns a fresh IPriceOracle instance.
 */
export function priceOracleContractTests(
  factory: () => IPriceOracle | Promise<IPriceOracle>,
): void {
  let oracle: IPriceOracle;

  describe('IPriceOracle contract', () => {
    beforeEach(async () => {
      oracle = await factory();
    });

    // ----- getPrice -----

    describe('getPrice()', () => {
      it('returns a valid PriceInfo shape', async () => {
        const result = await oracle.getPrice(CONTRACT_TEST_TOKEN);
        assertValidPriceInfo(result);
      });

      it('PriceInfo.usdPrice is non-negative', async () => {
        const result = await oracle.getPrice(CONTRACT_TEST_TOKEN);
        expect(result.usdPrice).toBeGreaterThanOrEqual(0);
      });

      it('PriceInfo.source is a valid oracle source', async () => {
        const result = await oracle.getPrice(CONTRACT_TEST_TOKEN);
        expect(['pyth', 'coingecko', 'cache']).toContain(result.source);
      });

      it('PriceInfo.fetchedAt is a positive integer', async () => {
        const result = await oracle.getPrice(CONTRACT_TEST_TOKEN);
        expect(Number.isInteger(result.fetchedAt)).toBe(true);
        expect(result.fetchedAt).toBeGreaterThan(0);
      });

      it('PriceInfo.expiresAt >= fetchedAt', async () => {
        const result = await oracle.getPrice(CONTRACT_TEST_TOKEN);
        expect(result.expiresAt).toBeGreaterThanOrEqual(result.fetchedAt);
      });

      it('PriceInfo.isStale is a boolean', async () => {
        const result = await oracle.getPrice(CONTRACT_TEST_TOKEN);
        expect(typeof result.isStale).toBe('boolean');
      });
    });

    // ----- getPrices -----

    describe('getPrices()', () => {
      it('returns a Map<string, PriceInfo>', async () => {
        const result = await oracle.getPrices([CONTRACT_TEST_TOKEN]);
        expect(result).toBeInstanceOf(Map);
      });

      it('returns an empty Map for empty input', async () => {
        const result = await oracle.getPrices([]);
        expect(result).toBeInstanceOf(Map);
        expect(result.size).toBe(0);
      });

      it('returns PriceInfo for all requested tokens', async () => {
        const tokens = [CONTRACT_TEST_TOKEN, CONTRACT_TEST_TOKEN_2];
        const result = await oracle.getPrices(tokens);
        expect(result).toBeInstanceOf(Map);
        expect(result.size).toBe(tokens.length);

        for (const [, info] of result) {
          assertValidPriceInfo(info);
        }
      });
    });

    // ----- getNativePrice -----

    describe('getNativePrice()', () => {
      it('returns PriceInfo for solana', async () => {
        const result = await oracle.getNativePrice('solana' as ChainType);
        assertValidPriceInfo(result);
      });

      it('returns PriceInfo for ethereum', async () => {
        const result = await oracle.getNativePrice('ethereum' as ChainType);
        assertValidPriceInfo(result);
      });
    });

    // ----- getCacheStats -----

    describe('getCacheStats()', () => {
      it('returns a valid CacheStats shape', () => {
        const stats = oracle.getCacheStats();
        assertValidCacheStats(stats);
      });

      it('all fields are non-negative integers', () => {
        const stats = oracle.getCacheStats();
        for (const field of ['hits', 'misses', 'staleHits', 'size', 'evictions'] as const) {
          expect(stats[field]).toBeGreaterThanOrEqual(0);
          expect(Number.isInteger(stats[field])).toBe(true);
        }
      });
    });
  });
}
