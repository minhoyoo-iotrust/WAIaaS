/**
 * Oracle infrastructure module barrel export.
 *
 * Re-exports price age classification, cache utilities, error classes,
 * Pyth oracle, CoinGecko oracle, and feed/platform ID helpers.
 */

export {
  classifyPriceAge,
  PriceAgeEnum,
  PRICE_AGE_THRESHOLDS,
  PRICE_AGES,
  type PriceAge,
} from './price-age.js';

export { InMemoryPriceCache, buildCacheKey, resolveNetwork } from './price-cache.js';

export { PriceNotAvailableError, CoinGeckoNotConfiguredError, ForexNotAvailableError } from './oracle-errors.js';

export { PythOracle } from './pyth-oracle.js';

export {
  PYTH_FEED_IDS,
  getFeedId,
  getNativeFeedId,
} from './pyth-feed-ids.js';

export { CoinGeckoOracle } from './coingecko-oracle.js';

export {
  COINGECKO_PLATFORM_MAP,
  getCoinGeckoPlatform,
  type CoinGeckoPlatform,
} from './coingecko-platform-ids.js';

export { OracleChain, type OracleChainDeps } from './oracle-chain.js';

// v1.5.3 Forex rate service
export { CoinGeckoForexProvider } from './coingecko-forex.js';
export { ForexRateService, type ForexRateServiceDeps } from './forex-rate-service.js';
export { CURRENCY_META, getCurrencyMeta, type CurrencyMeta } from './forex-currencies.js';
