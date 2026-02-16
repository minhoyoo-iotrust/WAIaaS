/**
 * MockPriceOracle (M9) validation tests.
 *
 * Verifies that MockPriceOracle correctly implements IPriceOracle,
 * returns valid PriceInfo structures, supports test helpers, and
 * exposes vi.fn() call tracking.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { PriceInfoSchema } from '@waiaas/core';
import type { IPriceOracle, TokenRef, ChainType } from '@waiaas/core';
import { MockPriceOracle, createMockPriceOracle } from './mock-price-oracle.js';

describe('MockPriceOracle (M9)', () => {
  let oracle: MockPriceOracle;

  const SOL_TOKEN: TokenRef = { address: 'native', decimals: 9, chain: 'solana' };
  const USDC_TOKEN: TokenRef = {
    address: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
    decimals: 6,
    chain: 'solana',
    symbol: 'USDC',
  };

  beforeEach(() => {
    oracle = createMockPriceOracle();
  });

  // -------------------------------------------------------------------------
  // Interface compliance
  // -------------------------------------------------------------------------

  it('implements IPriceOracle interface', () => {
    // Type-level check: assignable to IPriceOracle
    const iface: IPriceOracle = oracle;
    expect(typeof iface.getPrice).toBe('function');
    expect(typeof iface.getPrices).toBe('function');
    expect(typeof iface.getNativePrice).toBe('function');
    expect(typeof iface.getCacheStats).toBe('function');
  });

  // -------------------------------------------------------------------------
  // getPrice()
  // -------------------------------------------------------------------------

  it('getPrice() returns a valid PriceInfo with default values', async () => {
    const price = await oracle.getPrice(USDC_TOKEN);

    // Must pass Zod schema validation
    const parsed = PriceInfoSchema.safeParse(price);
    expect(parsed.success).toBe(true);

    expect(price.usdPrice).toBe(184.0);
    expect(price.source).toBe('cache');
    expect(price.isStale).toBe(false);
    expect(price.fetchedAt).toBeGreaterThan(0);
    expect(price.expiresAt).toBeGreaterThan(price.fetchedAt);
  });

  it('getPrice() returns custom price set via setPrice()', async () => {
    oracle.setPrice('solana', USDC_TOKEN.address, { usdPrice: 1.0, source: 'coingecko' });

    const price = await oracle.getPrice(USDC_TOKEN);
    expect(price.usdPrice).toBe(1.0);
    expect(price.source).toBe('coingecko');
  });

  // -------------------------------------------------------------------------
  // getPrices()
  // -------------------------------------------------------------------------

  it('getPrices() returns a Map with entries for each token', async () => {
    oracle.setPrice('solana', USDC_TOKEN.address, { usdPrice: 1.0 });

    const result = await oracle.getPrices([SOL_TOKEN, USDC_TOKEN]);

    expect(result).toBeInstanceOf(Map);
    expect(result.size).toBe(2);

    const usdcPrice = result.get(`solana:${USDC_TOKEN.address}`);
    expect(usdcPrice).toBeDefined();
    expect(usdcPrice!.usdPrice).toBe(1.0);

    const solPrice = result.get('solana:native');
    expect(solPrice).toBeDefined();
    expect(solPrice!.usdPrice).toBe(184.0); // default
  });

  // -------------------------------------------------------------------------
  // getNativePrice()
  // -------------------------------------------------------------------------

  it('getNativePrice() returns chain-specific default prices', async () => {
    const solPrice = await oracle.getNativePrice('solana');
    expect(solPrice.usdPrice).toBe(184.0);

    const ethPrice = await oracle.getNativePrice('ethereum');
    expect(ethPrice.usdPrice).toBe(3400.0);
  });

  it('getNativePrice() returns custom price set via setNativePrice()', async () => {
    oracle.setNativePrice('solana', { usdPrice: 200.0 });

    const price = await oracle.getNativePrice('solana');
    expect(price.usdPrice).toBe(200.0);
  });

  // -------------------------------------------------------------------------
  // getCacheStats()
  // -------------------------------------------------------------------------

  it('getCacheStats() returns a valid CacheStats structure', () => {
    const stats = oracle.getCacheStats();
    expect(stats).toHaveProperty('hits');
    expect(stats).toHaveProperty('misses');
    expect(stats).toHaveProperty('staleHits');
    expect(stats).toHaveProperty('size');
    expect(stats).toHaveProperty('evictions');
    expect(typeof stats.hits).toBe('number');
  });

  it('getCacheStats() size reflects stored prices', () => {
    oracle.setPrice('solana', 'abc', { usdPrice: 1.0 });
    oracle.setPrice('ethereum', 'def', { usdPrice: 2.0 });

    const stats = oracle.getCacheStats();
    expect(stats.size).toBe(2);
  });

  // -------------------------------------------------------------------------
  // vi.fn() call verification
  // -------------------------------------------------------------------------

  it('vi.fn() tracks call count and arguments', async () => {
    await oracle.getPrice(USDC_TOKEN);
    await oracle.getPrice(SOL_TOKEN);

    expect(oracle.getPrice).toHaveBeenCalledTimes(2);
    expect(oracle.getPrice).toHaveBeenCalledWith(USDC_TOKEN);
    expect(oracle.getPrice).toHaveBeenCalledWith(SOL_TOKEN);
  });

  it('vi.fn() tracks getPrices calls', async () => {
    const tokens = [SOL_TOKEN, USDC_TOKEN];
    await oracle.getPrices(tokens);

    expect(oracle.getPrices).toHaveBeenCalledOnce();
    expect(oracle.getPrices).toHaveBeenCalledWith(tokens);
  });

  it('vi.fn() tracks getNativePrice calls', async () => {
    await oracle.getNativePrice('solana');
    await oracle.getNativePrice('ethereum');

    expect(oracle.getNativePrice).toHaveBeenCalledTimes(2);
    expect(oracle.getNativePrice).toHaveBeenCalledWith('solana');
  });

  // -------------------------------------------------------------------------
  // reset()
  // -------------------------------------------------------------------------

  it('reset() clears all state and call history', async () => {
    // Build up state
    oracle.setPrice('solana', 'abc', { usdPrice: 100.0 });
    oracle.setNativePrice('ethereum', { usdPrice: 5000.0 });
    await oracle.getPrice(SOL_TOKEN);
    await oracle.getNativePrice('solana');

    // Reset
    oracle.reset();

    // Verify prices reset to defaults
    const price = await oracle.getPrice(SOL_TOKEN);
    expect(price.usdPrice).toBe(184.0); // back to default

    // Verify call history cleared (only the post-reset call counts)
    expect(oracle.getPrice).toHaveBeenCalledTimes(1);
    expect(oracle.getNativePrice).toHaveBeenCalledTimes(0);
  });

  // -------------------------------------------------------------------------
  // Factory
  // -------------------------------------------------------------------------

  it('createMockPriceOracle() returns a fresh instance', () => {
    const a = createMockPriceOracle();
    const b = createMockPriceOracle();
    expect(a).not.toBe(b);
    expect(a).toBeInstanceOf(MockPriceOracle);
  });
});
