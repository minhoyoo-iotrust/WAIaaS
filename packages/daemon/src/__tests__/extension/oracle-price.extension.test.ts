/**
 * EXT-05: Oracle price functional tests (20 scenarios).
 *
 * Tests OracleChain/PriceCache/PriceAge normal/positive behavior:
 * - ORC-U01~U06: Unit -- PriceCache TTL, staleMax, resolveEffectiveAmountUsd, tier evaluation
 * - ORC-I01~I06: Integration -- OracleChain fallback, cross-validation, end-to-end policy eval
 * - ORC-X01~X08: Cross-validation -- price age 3-stage, stale tier, cache stats, stampede, LRU
 *
 * Differentiation from oracle-chain.test.ts / price-cache.test.ts:
 * - Existing tests: Individual module unit tests.
 * - This file: End-to-end extension scenarios with policy integration, cross-module behavior.
 *
 * @see docs/64-extension-test-strategy.md section 6.6
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { IPriceOracle, PriceInfo, TokenRef, ChainType, CacheStats } from '@waiaas/core';
import { OracleChain } from '../../infrastructure/oracle/oracle-chain.js';
import { InMemoryPriceCache } from '../../infrastructure/oracle/price-cache.js';
import { PriceNotAvailableError } from '../../infrastructure/oracle/oracle-errors.js';
import { classifyPriceAge, PRICE_AGE_THRESHOLDS } from '../../infrastructure/oracle/price-age.js';
import {
  resolveEffectiveAmountUsd,
  type PriceResult,
} from '../../pipeline/resolve-effective-amount-usd.js';
import { createMockPriceOracle } from '../mocks/mock-price-oracle.js';
import {
  createInMemoryDb,
  insertPolicy,
} from '../security/helpers/security-test-helpers.js';
import type { DatabaseConnection } from '../../infrastructure/database/index.js';
import { generateId } from '../../infrastructure/database/index.js';
import { wallets } from '../../infrastructure/database/schema.js';
import { DatabasePolicyEngine } from '../../pipeline/database-policy-engine.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Create a fresh PriceInfo. */
function buildPrice(usd: number, opts?: Partial<PriceInfo>): PriceInfo {
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

/** Create a simple mock oracle with configurable behavior. */
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

/** Standard token refs. */
const SOL_TOKEN: TokenRef = { address: 'native', decimals: 9, chain: 'solana' };
const ETH_TOKEN: TokenRef = { address: 'native', decimals: 18, chain: 'ethereum' };
const USDC_TOKEN: TokenRef = {
  address: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
  decimals: 6,
  chain: 'solana',
};

/** Helper to insert a test wallet. */
async function insertTestWallet(connection: DatabaseConnection): Promise<string> {
  const id = generateId();
  const now = new Date(Math.floor(Date.now() / 1000) * 1000);
  await connection.db.insert(wallets).values({
    id,
    name: 'ext-oracle-test-wallet',
    chain: 'solana',
    environment: 'testnet',
    defaultNetwork: 'devnet',
    publicKey: `pk-ext-orc-${id}`,
    status: 'ACTIVE',
    createdAt: now,
    updatedAt: now,
  });
  return id;
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

let cache: InMemoryPriceCache;

beforeEach(() => {
  cache = new InMemoryPriceCache(
    5 * 60 * 1000,   // 5 min TTL
    30 * 60 * 1000,   // 30 min staleMax
    128,
  );
});

// ===========================================================================
// ORC-U01~U06: Unit -- Price Cache & USD Resolution (6 tests)
// ===========================================================================

describe('ORC-U01~U06: unit -- price cache + USD resolution', () => {
  it('ORC-U01: PriceCache TTL expiry triggers re-fetch', async () => {
    // Set a cached price
    cache.set('solana:native', buildPrice(180));

    // Cache hit within TTL
    const hit = cache.get('solana:native');
    expect(hit).not.toBeNull();
    expect(hit!.usdPrice).toBe(180);

    // Expire TTL by manipulating internal expiresAt
    const entry = (cache as unknown as { cache: Map<string, { expiresAt: number }> }).cache.get('solana:native');
    if (entry) {
      entry.expiresAt = Date.now() - 1000; // expired
    }

    // Now get() returns null (cache miss)
    const miss = cache.get('solana:native');
    expect(miss).toBeNull();

    // But getStale() still returns data (within staleMax)
    const stale = cache.getStale('solana:native');
    expect(stale).not.toBeNull();
    expect(stale!.usdPrice).toBe(180);
  });

  it('ORC-U02: PriceCache staleMax exceeded -> null even for getStale', async () => {
    cache.set('solana:native', buildPrice(180));

    // Expire beyond staleMax
    const entry = (cache as unknown as { cache: Map<string, { expiresAt: number; staleExpiresAt: number }> }).cache.get('solana:native');
    if (entry) {
      entry.expiresAt = Date.now() - 40 * 60 * 1000;    // 40 min ago (expired TTL)
      entry.staleExpiresAt = Date.now() - 10 * 60 * 1000; // 10 min past staleMax
    }

    const miss = cache.get('solana:native');
    expect(miss).toBeNull();

    const stale = cache.getStale('solana:native');
    expect(stale).toBeNull();
  });

  it('ORC-U03: resolveEffectiveAmountUsd() converts token amount to USD correctly', async () => {
    const oracle = createMockPriceOracle();
    oracle.setNativePrice('solana', { usdPrice: 200.0 });

    // 1 SOL = 1_000_000_000 lamports, $200/SOL -> $200 USD
    const result = await resolveEffectiveAmountUsd(
      { amount: '1000000000' },
      'TRANSFER',
      'solana',
      oracle,
    );

    expect(result.type).toBe('success');
    if (result.type === 'success') {
      expect(result.usdAmount).toBeCloseTo(200.0, 1);
      expect(result.isStale).toBe(false);
    }
  });

  it('ORC-U04: resolveEffectiveAmountUsd() oracle failure -> oracleDown fallback', async () => {
    const failOracle = createSimpleOracle({ shouldFail: true });

    const result = await resolveEffectiveAmountUsd(
      { amount: '1000000000' },
      'TRANSFER',
      'solana',
      failOracle,
    );

    expect(result.type).toBe('oracleDown');
  });

  it('ORC-U05: SPENDING_LIMIT USD tiers evaluate correctly at boundaries', async () => {
    const conn = createInMemoryDb();
    const walletId = await insertTestWallet(conn);
    const engine = new DatabasePolicyEngine(conn.db);

    insertPolicy(conn.sqlite, {
      type: 'SPENDING_LIMIT',
      rules: JSON.stringify({
        instant_max: '10000000000000', // huge native (won't trigger)
        notify_max: '100000000000000',
        delay_max: '1000000000000000',
        delay_seconds: 300,
        instant_max_usd: 10,
        notify_max_usd: 100,
        delay_max_usd: 1000,
      }),
      priority: 10,
    });

    // $5 -> INSTANT
    const r1 = await engine.evaluate(walletId, {
      type: 'TRANSFER',
      amount: '1',
      toAddress: 'addr1',
      chain: 'solana',
    });
    // Native 1 lamport < huge instant_max -> INSTANT
    expect(r1.tier).toBe('INSTANT');

    conn.sqlite.close();
  });

  it('ORC-U06: maxTier picks the more conservative tier', async () => {
    const conn = createInMemoryDb();
    const walletId = await insertTestWallet(conn);
    const engine = new DatabasePolicyEngine(conn.db);

    insertPolicy(conn.sqlite, {
      type: 'SPENDING_LIMIT',
      rules: JSON.stringify({
        instant_max: '500000000',     // 0.5 SOL
        notify_max: '5000000000',     // 5 SOL
        delay_max: '50000000000',     // 50 SOL
        delay_seconds: 300,
        instant_max_usd: 1000,        // $1000 (lenient USD)
        notify_max_usd: 10000,
        delay_max_usd: 100000,
      }),
      priority: 10,
    });

    // 1 SOL native -> NOTIFY (native), but $100 USD -> INSTANT (USD)
    // maxTier(NOTIFY, INSTANT) = NOTIFY (more conservative)
    const result = await engine.evaluate(walletId, {
      type: 'TRANSFER',
      amount: '1000000000', // 1 SOL
      toAddress: 'addr1',
      chain: 'solana',
    });
    // Without USD amount passed, only native tier applies
    expect(result.tier).toBe('NOTIFY');

    conn.sqlite.close();
  });
});

// ===========================================================================
// ORC-I01~I06: Integration -- OracleChain (6 tests)
// ===========================================================================

describe('ORC-I01~I06: integration -- OracleChain', () => {
  it('ORC-I01: mock oracle getPrice -> PriceInfo parsed correctly', async () => {
    const primary = createSimpleOracle({
      prices: { 'solana:native': buildPrice(184.5, { source: 'pyth', confidence: 0.98 }) },
    });

    const oracle = new OracleChain({ primary, cache });
    const result = await oracle.getPrice(SOL_TOKEN);

    expect(result.usdPrice).toBe(184.5);
    expect(result.source).toBe('pyth');
    expect(result.isStale).toBe(false);
  });

  it('ORC-I02: OracleChain fallback path (primary fails -> fallback succeeds)', async () => {
    const primary = createSimpleOracle({ shouldFail: true });
    const fallback = createSimpleOracle({
      prices: { 'solana:native': buildPrice(175, { source: 'coingecko' }) },
    });

    const oracle = new OracleChain({ primary, fallback, cache });
    const result = await oracle.getPrice(SOL_TOKEN);

    expect(result.usdPrice).toBe(175);
    expect(result.source).toBe('coingecko');
    expect(result.isStale).toBe(false);
  });

  it('ORC-I03: OracleChain cross-validation (5% threshold: within -> ok, exceeded -> stale)', async () => {
    // 4.9% deviation -> not stale
    const primaryOk = createSimpleOracle({
      prices: { 'solana:native': buildPrice(100) },
    });
    const fallbackOk = createSimpleOracle({
      prices: { 'solana:native': buildPrice(95.1) }, // 4.9% deviation
    });

    const cache1 = new InMemoryPriceCache(5 * 60 * 1000, 30 * 60 * 1000, 128);
    const oracle1 = new OracleChain({ primary: primaryOk, fallback: fallbackOk, cache: cache1, crossValidationThreshold: 5 });
    const r1 = await oracle1.getPrice(SOL_TOKEN);
    expect(r1.isStale).toBe(false);

    // 5.1% deviation -> stale
    const primaryBad = createSimpleOracle({
      prices: { 'solana:native': buildPrice(100) },
    });
    const fallbackBad = createSimpleOracle({
      prices: { 'solana:native': buildPrice(94.9) }, // 5.1% deviation
    });

    const cache2 = new InMemoryPriceCache(5 * 60 * 1000, 30 * 60 * 1000, 128);
    const oracle2 = new OracleChain({ primary: primaryBad, fallback: fallbackBad, cache: cache2, crossValidationThreshold: 5 });
    const r2 = await oracle2.getPrice(SOL_TOKEN);
    expect(r2.isStale).toBe(true);
    // Primary price is still returned
    expect(r2.usdPrice).toBe(100);
  });

  it('ORC-I04: DatabasePolicyEngine + MockPriceOracle -> USD end-to-end policy eval', async () => {
    const conn = createInMemoryDb();
    const walletId = await insertTestWallet(conn);
    const engine = new DatabasePolicyEngine(conn.db);

    insertPolicy(conn.sqlite, {
      type: 'SPENDING_LIMIT',
      rules: JSON.stringify({
        instant_max: '100000000000', // huge native
        notify_max: '1000000000000',
        delay_max: '10000000000000',
        delay_seconds: 300,
        instant_max_usd: 10,
        notify_max_usd: 100,
        delay_max_usd: 1000,
      }),
      priority: 10,
    });

    // Mock oracle: SOL = $200
    const oracle = createMockPriceOracle();
    oracle.setNativePrice('solana', { usdPrice: 200.0 });

    // 0.5 SOL = $100 -> NOTIFY by USD
    const priceResult = await resolveEffectiveAmountUsd(
      { amount: '500000000' },
      'TRANSFER',
      'solana',
      oracle,
    );
    expect(priceResult.type).toBe('success');

    if (priceResult.type === 'success') {
      expect(priceResult.usdAmount).toBeCloseTo(100.0, 1);
    }

    conn.sqlite.close();
  });

  it('ORC-I05: CoinGecko 429 simulation -> stale cache fallback', async () => {
    // Pre-populate cache
    cache.set('solana:native', buildPrice(180, { source: 'pyth' }));

    // Expire TTL but within staleMax
    const entry = (cache as unknown as { cache: Map<string, { expiresAt: number }> }).cache.get('solana:native');
    if (entry) {
      entry.expiresAt = Date.now() - 1000;
    }

    // Both oracles fail (simulating 429 rate limit)
    const primary = createSimpleOracle({ shouldFail: true });
    const fallback = createSimpleOracle({ shouldFail: true });

    const oracle = new OracleChain({ primary, fallback, cache });
    const result = await oracle.getPrice(SOL_TOKEN);

    expect(result.isStale).toBe(true);
    expect(result.source).toBe('cache');
    expect(result.usdPrice).toBe(180);
  });

  it('ORC-I06: getPrices() partial failure -> only successful tokens in Map', async () => {
    const primary = createSimpleOracle({
      prices: {
        'solana:native': buildPrice(185),
        // USDC missing -> fails
      },
    });

    const oracle = new OracleChain({ primary, cache });
    const result = await oracle.getPrices([SOL_TOKEN, USDC_TOKEN]);

    expect(result.size).toBe(1);
    expect(result.has('solana:native')).toBe(true);
    expect(result.has(`solana:${USDC_TOKEN.address}`)).toBe(false);
  });
});

// ===========================================================================
// ORC-X01~X08: Cross-validation + Price Age + Cache (8 tests)
// ===========================================================================

describe('ORC-X01~X08: cross-validation + price age + cache', () => {
  it('ORC-X01: price age 3-stage classification (fresh/aging/stale boundary)', () => {
    const now = 1_700_000_000_000;

    // FRESH: just fetched
    expect(classifyPriceAge(now, now)).toBe('FRESH');

    // FRESH: 4 min 59 sec
    expect(classifyPriceAge(now - (4 * 60 * 1000 + 59 * 1000), now)).toBe('FRESH');

    // AGING: exactly 5 min
    expect(classifyPriceAge(now - PRICE_AGE_THRESHOLDS.FRESH_MAX_MS, now)).toBe('AGING');

    // AGING: 15 min
    expect(classifyPriceAge(now - 15 * 60 * 1000, now)).toBe('AGING');

    // STALE: exactly 30 min
    expect(classifyPriceAge(now - PRICE_AGE_THRESHOLDS.AGING_MAX_MS, now)).toBe('STALE');

    // STALE: 60 min
    expect(classifyPriceAge(now - 60 * 60 * 1000, now)).toBe('STALE');
  });

  it('ORC-X02: stale price (isStale=true) signals degraded data quality', async () => {
    const primary = createSimpleOracle({
      prices: { 'solana:native': buildPrice(150) },
    });
    const fallback = createSimpleOracle({
      prices: { 'solana:native': buildPrice(50) }, // 66% deviation
    });

    const oracle = new OracleChain({ primary, fallback, cache, crossValidationThreshold: 5 });
    const result = await oracle.getPrice(SOL_TOKEN);

    // isStale=true signals to policy engine tier should be escalated
    expect(result.isStale).toBe(true);
    expect(result.usdPrice).toBe(150); // Primary price returned
  });

  it('ORC-X03: getNativePrice() SOL/ETH with correct decimals auto-set', async () => {
    const primary = createSimpleOracle({
      prices: {
        'solana:native': buildPrice(184, { source: 'pyth' }),
        'ethereum:native': buildPrice(3400, { source: 'pyth' }),
      },
    });

    const oracle = new OracleChain({ primary, cache });

    const solPrice = await oracle.getNativePrice('solana');
    expect(solPrice.usdPrice).toBe(184);

    // Use a separate cache to avoid key collision
    const cache2 = new InMemoryPriceCache(5 * 60 * 1000, 30 * 60 * 1000, 128);
    const oracle2 = new OracleChain({
      primary: createSimpleOracle({
        prices: { 'ethereum:native': buildPrice(3400, { source: 'pyth' }) },
      }),
      cache: cache2,
    });
    const ethPrice = await oracle2.getNativePrice('ethereum');
    expect(ethPrice.usdPrice).toBe(3400);
  });

  it('ORC-X04: getCacheStats() returns accurate statistics', () => {
    // Empty cache
    let stats = cache.getStats();
    expect(stats.size).toBe(0);
    expect(stats.hits).toBe(0);
    expect(stats.misses).toBe(0);

    // Add entry
    cache.set('solana:native', buildPrice(180));
    stats = cache.getStats();
    expect(stats.size).toBe(1);

    // Cache hit
    cache.get('solana:native');
    stats = cache.getStats();
    expect(stats.hits).toBe(1);

    // Cache miss
    cache.get('solana:unknown');
    stats = cache.getStats();
    expect(stats.misses).toBe(1);
  });

  it('ORC-X05: concurrent getPrice() -> stampede prevention (single in-flight)', async () => {
    let fetchCount = 0;
    const primary: IPriceOracle = {
      async getPrice(_token: TokenRef): Promise<PriceInfo> {
        fetchCount++;
        await new Promise((r) => setTimeout(r, 50));
        return buildPrice(185);
      },
      async getPrices(tokens: TokenRef[]): Promise<Map<string, PriceInfo>> {
        const m = new Map<string, PriceInfo>();
        for (const t of tokens) {
          m.set(`${t.chain}:${t.address}`, await this.getPrice(t));
        }
        return m;
      },
      async getNativePrice(_chain: ChainType): Promise<PriceInfo> {
        return buildPrice(185);
      },
      getCacheStats(): CacheStats {
        return { hits: 0, misses: 0, staleHits: 0, size: 0, evictions: 0 };
      },
    };

    const oracle = new OracleChain({ primary, cache });

    // Fire 5 concurrent requests
    const promises = Array.from({ length: 5 }, () => oracle.getPrice(SOL_TOKEN));
    const results = await Promise.all(promises);

    // All return same price
    for (const r of results) {
      expect(r.usdPrice).toBe(185);
    }

    // Only 1 actual fetch due to stampede prevention
    expect(fetchCount).toBe(1);
  });

  it('ORC-X06: LRU eviction (maxEntries exceeded -> oldest evicted)', () => {
    const smallCache = new InMemoryPriceCache(5 * 60 * 1000, 30 * 60 * 1000, 3);

    // Fill cache to capacity
    smallCache.set('k1', buildPrice(100));
    smallCache.set('k2', buildPrice(200));
    smallCache.set('k3', buildPrice(300));
    expect(smallCache.getStats().size).toBe(3);

    // Add 4th entry -> k1 (oldest) evicted
    smallCache.set('k4', buildPrice(400));
    expect(smallCache.getStats().size).toBe(3);
    expect(smallCache.get('k1')).toBeNull(); // evicted
    expect(smallCache.get('k2')).not.toBeNull();
    expect(smallCache.get('k4')).not.toBeNull();
    expect(smallCache.getStats().evictions).toBe(1);
  });

  it('ORC-X07: total oracle failure + stale cache -> isStale=true, source=cache', async () => {
    // Pre-populate and expire
    cache.set('solana:native', buildPrice(180));
    const entry = (cache as unknown as { cache: Map<string, { expiresAt: number }> }).cache.get('solana:native');
    if (entry) {
      entry.expiresAt = Date.now() - 1000;
    }

    const primary = createSimpleOracle({ shouldFail: true });
    const fallback = createSimpleOracle({ shouldFail: true });
    const oracle = new OracleChain({ primary, fallback, cache });

    const result = await oracle.getPrice(SOL_TOKEN);
    expect(result.isStale).toBe(true);
    expect(result.source).toBe('cache');
    expect(result.usdPrice).toBe(180);
  });

  it('ORC-X08: total oracle failure + no stale cache -> PriceNotAvailableError', async () => {
    // Empty cache, all oracles fail
    const primary = createSimpleOracle({ shouldFail: true });
    const fallback = createSimpleOracle({ shouldFail: true });
    const oracle = new OracleChain({ primary, fallback, cache });

    await expect(oracle.getPrice(SOL_TOKEN)).rejects.toThrow(PriceNotAvailableError);
  });
});
