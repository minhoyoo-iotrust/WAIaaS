/**
 * CT-6: IPriceOracle Contract Test execution.
 *
 * Validates InlineMockPriceOracle against the shared contract suite.
 * OracleChain is tested in packages/daemon (requires InMemoryPriceCache).
 */
import { describe } from 'vitest';
import type { IPriceOracle, PriceInfo, CacheStats, TokenRef } from '../../interfaces/price-oracle.types.js';
import type { ChainType } from '../../enums/chain.js';
import { priceOracleContractTests } from './price-oracle.contract.js';

// ---------------------------------------------------------------------------
// InlineMockPriceOracle (no vi.fn dependency -- pure contract test mock)
// ---------------------------------------------------------------------------

const NATIVE_DEFAULTS: Record<string, number> = {
  solana: 184.0,
  ethereum: 3400.0,
};

class InlineMockPriceOracle implements IPriceOracle {
  private prices = new Map<string, PriceInfo>();
  private nativePrices = new Map<string, PriceInfo>();

  async getPrice(token: TokenRef): Promise<PriceInfo> {
    const key = `${token.chain}:${token.address}`;
    return this.prices.get(key) ?? this.freshDefault(184.0);
  }

  async getPrices(tokens: TokenRef[]): Promise<Map<string, PriceInfo>> {
    const result = new Map<string, PriceInfo>();
    for (const token of tokens) {
      const key = `${token.chain}:${token.address}`;
      result.set(key, this.prices.get(key) ?? this.freshDefault(184.0));
    }
    return result;
  }

  async getNativePrice(chain: ChainType): Promise<PriceInfo> {
    return this.nativePrices.get(chain) ?? this.freshDefault(
      NATIVE_DEFAULTS[chain] ?? 184.0,
    );
  }

  getCacheStats(): CacheStats {
    return { hits: 0, misses: 0, staleHits: 0, size: this.prices.size, evictions: 0 };
  }

  // -- test helpers --
  setPrice(chain: ChainType, address: string, price: Partial<PriceInfo>): void {
    this.prices.set(`${chain}:${address}`, this.freshDefault(price.usdPrice ?? 184.0, price));
  }

  setNativePrice(chain: ChainType, price: Partial<PriceInfo>): void {
    this.nativePrices.set(chain, this.freshDefault(price.usdPrice ?? NATIVE_DEFAULTS[chain] ?? 184.0, price));
  }

  private freshDefault(usdPrice: number, overrides?: Partial<PriceInfo>): PriceInfo {
    const now = Date.now();
    return {
      usdPrice,
      source: 'cache',
      isStale: false,
      fetchedAt: now,
      expiresAt: now + 5 * 60 * 1000,
      ...overrides,
    };
  }
}

// ---------------------------------------------------------------------------
// Run contract tests
// ---------------------------------------------------------------------------

describe('CT-6: IPriceOracle Contract Tests', () => {
  describe('InlineMockPriceOracle', () => {
    priceOracleContractTests(() => new InlineMockPriceOracle());
  });
});
