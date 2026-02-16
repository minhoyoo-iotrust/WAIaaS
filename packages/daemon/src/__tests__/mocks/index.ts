/**
 * Mock infrastructure barrel export.
 *
 * Provides M6-M10 mock boundaries for test isolation:
 * - M6: Jupiter API msw handlers
 * - M7: Price API msw handlers (Pyth + CoinGecko)
 * - M8: MockOnchainOracle (in-memory Pyth feed simulator)
 * - M9: MockPriceOracle (IPriceOracle vi.fn() mock)
 * - M10: MockActionProvider (IActionProvider vi.fn() mock)
 */

// M6: Jupiter API
export {
  createJupiterHandlers,
  jupiterHandlers,
  createJupiterErrorHandlers,
} from './jupiter-msw-handlers.js';

// M7: Price API (Pyth + CoinGecko)
export {
  createPythHandlers,
  createCoinGeckoHandlers,
  pythHandlers,
  coingeckoHandlers,
  priceApiHandlers,
  createPriceApiErrorHandlers,
} from './price-api-msw-handlers.js';

// M8: Onchain Oracle
export {
  MockOnchainOracle,
  createMockPythFeed,
} from './mock-onchain-oracle.js';
export type { MockPythFeed } from './mock-onchain-oracle.js';

// M9: IPriceOracle
export {
  MockPriceOracle,
  createMockPriceOracle,
} from './mock-price-oracle.js';

// M10: IActionProvider
export {
  MockActionProvider,
  createMockActionProvider,
} from './mock-action-provider.js';
