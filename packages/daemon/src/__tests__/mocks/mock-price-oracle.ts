/**
 * M9: MockPriceOracle implementing IPriceOracle.
 *
 * vi.fn()-based mock for Contract Tests (CT-6) and extension tests.
 * All 4 IPriceOracle methods are implemented as vi.fn() spies,
 * enabling call count/argument verification in tests.
 *
 * Source enum uses 'cache' (valid PriceInfo source value) to distinguish
 * from real oracles while remaining schema-compliant.
 */
import { vi } from 'vitest';
import type { IPriceOracle, PriceInfo, CacheStats, TokenRef, ChainType } from '@waiaas/core';

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

/** Default price info returned when no override is set. */
const DEFAULT_PRICE: PriceInfo = {
  usdPrice: 184.0,
  source: 'cache',
  confidence: 0.99,
  isStale: false,
  fetchedAt: Date.now(),
  expiresAt: Date.now() + 5 * 60 * 1000,
};

/** Default native prices by chain. */
const NATIVE_DEFAULTS: Record<string, number> = {
  solana: 184.0,
  ethereum: 3400.0,
};

// ---------------------------------------------------------------------------
// MockPriceOracle
// ---------------------------------------------------------------------------

/**
 * Mock IPriceOracle with vi.fn() spies and configurable prices.
 *
 * Usage:
 * ```ts
 * const oracle = createMockPriceOracle();
 * oracle.setPrice('solana', 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', { usdPrice: 1.0 });
 * oracle.setNativePrice('solana', { usdPrice: 200.0 });
 *
 * const price = await oracle.getPrice({ address: '...', decimals: 6, chain: 'solana' });
 * expect(oracle.getPrice).toHaveBeenCalledOnce();
 * ```
 */
export class MockPriceOracle implements IPriceOracle {
  private prices = new Map<string, PriceInfo>();
  private nativePrices = new Map<string, PriceInfo>();

  // vi.fn() spies for call verification
  getPrice = vi.fn(async (token: TokenRef): Promise<PriceInfo> => {
    const key = `${token.chain}:${token.address}`;
    return this.prices.get(key) ?? this.freshDefault(DEFAULT_PRICE.usdPrice);
  });

  getPrices = vi.fn(async (tokens: TokenRef[]): Promise<Map<string, PriceInfo>> => {
    const result = new Map<string, PriceInfo>();
    for (const token of tokens) {
      const key = `${token.chain}:${token.address}`;
      result.set(key, this.prices.get(key) ?? this.freshDefault(DEFAULT_PRICE.usdPrice));
    }
    return result;
  });

  getNativePrice = vi.fn(async (chain: ChainType): Promise<PriceInfo> => {
    return this.nativePrices.get(chain) ?? this.freshDefault(
      NATIVE_DEFAULTS[chain] ?? DEFAULT_PRICE.usdPrice,
    );
  });

  getCacheStats = vi.fn((): CacheStats => ({
    hits: 0,
    misses: 0,
    staleHits: 0,
    size: this.prices.size,
    evictions: 0,
  }));

  // ---------------------------------------------------------------------------
  // Test helpers
  // ---------------------------------------------------------------------------

  /**
   * Set price for a specific token.
   *
   * @param chain - Chain type.
   * @param address - Token address.
   * @param price - Partial PriceInfo overrides.
   */
  setPrice(chain: ChainType, address: string, price: Partial<PriceInfo>): void {
    this.prices.set(`${chain}:${address}`, this.freshDefault(price.usdPrice ?? DEFAULT_PRICE.usdPrice, price));
  }

  /**
   * Set native token price for a chain.
   *
   * @param chain - Chain type.
   * @param price - Partial PriceInfo overrides.
   */
  setNativePrice(chain: ChainType, price: Partial<PriceInfo>): void {
    this.nativePrices.set(chain, this.freshDefault(price.usdPrice ?? NATIVE_DEFAULTS[chain] ?? DEFAULT_PRICE.usdPrice, price));
  }

  /** Reset all state: prices, native prices, and vi.fn() call history. */
  reset(): void {
    this.prices.clear();
    this.nativePrices.clear();
    this.getPrice.mockClear();
    this.getPrices.mockClear();
    this.getNativePrice.mockClear();
    this.getCacheStats.mockClear();
  }

  // ---------------------------------------------------------------------------
  // Private
  // ---------------------------------------------------------------------------

  /** Create a fresh PriceInfo with current timestamps. */
  private freshDefault(usdPrice: number, overrides?: Partial<PriceInfo>): PriceInfo {
    const now = Date.now();
    return {
      ...DEFAULT_PRICE,
      usdPrice,
      fetchedAt: now,
      expiresAt: now + 5 * 60 * 1000,
      ...overrides,
    };
  }
}

/**
 * Factory function for MockPriceOracle.
 *
 * @returns A new MockPriceOracle instance.
 */
export function createMockPriceOracle(): MockPriceOracle {
  return new MockPriceOracle();
}
