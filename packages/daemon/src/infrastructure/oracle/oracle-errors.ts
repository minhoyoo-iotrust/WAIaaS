/**
 * Shared error classes for price oracle implementations.
 *
 * Extracted to a separate module so PythOracle and CoinGeckoOracle
 * can share error types without circular dependencies.
 */

/**
 * Thrown when a price is not available for a token from any oracle source.
 *
 * This is a normal flow error (not a bug) -- it means the oracle has no data
 * for the requested token. OracleChain handles this by trying fallback sources.
 */
export class PriceNotAvailableError extends Error {
  /**
   * @param cacheKey - Cache key or descriptive message identifying the missing price.
   */
  constructor(public readonly cacheKey: string) {
    super(`Price not available for ${cacheKey}`);
    this.name = 'PriceNotAvailableError';
  }
}

/**
 * Thrown when CoinGecko API key is not configured.
 *
 * CoinGecko Demo API requires an API key. This error is thrown at query time
 * (not construction time) to allow lazy configuration via SettingsService.
 */
export class CoinGeckoNotConfiguredError extends Error {
  constructor() {
    super('CoinGecko API key not configured');
    this.name = 'CoinGeckoNotConfiguredError';
  }
}
