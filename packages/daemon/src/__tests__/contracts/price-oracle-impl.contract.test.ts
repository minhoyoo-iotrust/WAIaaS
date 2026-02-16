/**
 * CT-6: IPriceOracle Contract Test -- OracleChain execution.
 *
 * Validates that OracleChain (using MockPriceOracle as primary)
 * passes the same shared contract suite as MockPriceOracle.
 *
 * OracleChain requires InMemoryPriceCache -- created fresh per test.
 */
import { describe } from 'vitest';
import { priceOracleContractTests } from '../../../../core/src/__tests__/contracts/price-oracle.contract.js';
import { MockPriceOracle } from '../mocks/mock-price-oracle.js';
import { OracleChain } from '../../infrastructure/oracle/oracle-chain.js';
import { InMemoryPriceCache } from '../../infrastructure/oracle/price-cache.js';

// ---------------------------------------------------------------------------
// Run contract tests
// ---------------------------------------------------------------------------

describe('CT-6: IPriceOracle Contract Tests (daemon implementations)', () => {
  describe('MockPriceOracle (M9)', () => {
    priceOracleContractTests(() => new MockPriceOracle());
  });

  describe('OracleChain (MockPriceOracle as primary)', () => {
    priceOracleContractTests(() => {
      const primary = new MockPriceOracle();
      const cache = new InMemoryPriceCache(
        5 * 60 * 1000, // ttlMs
        30 * 60 * 1000, // staleMaxMs
        128, // maxEntries
      );
      return new OracleChain({ primary, cache });
    });
  });
});
