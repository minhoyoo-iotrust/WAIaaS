/**
 * CoinGecko Demo API oracle implementation.
 *
 * Queries CoinGecko for SPL/ERC-20 token and native token (SOL/ETH) prices.
 * Uses the Demo API with x-cg-demo-api-key header authentication.
 *
 * Rate limits: 30 calls/min (Demo tier), 10,000 calls/month.
 *
 * This oracle does NOT manage its own cache -- caching is handled by
 * OracleChain via InMemoryPriceCache (v1.5 cache responsibility decision).
 */
import type { ChainType, PriceInfo, CacheStats, IPriceOracle, TokenRef } from '@waiaas/core';
import { getCoinGeckoPlatform } from './coingecko-platform-ids.js';
import { PriceNotAvailableError, CoinGeckoNotConfiguredError } from './oracle-errors.js';
import { buildCacheKey, resolveNetwork } from './price-cache.js';

// Re-export error classes for consumer convenience
export { PriceNotAvailableError, CoinGeckoNotConfiguredError } from './oracle-errors.js';

/** CoinGecko Demo API base URL. */
const BASE_URL = 'https://api.coingecko.com/api/v3';

/** Request timeout in milliseconds. */
const TIMEOUT_MS = 5000;

/** Price TTL in milliseconds (5 minutes). */
const PRICE_TTL_MS = 5 * 60 * 1000;

/**
 * CoinGecko price oracle implementing IPriceOracle.
 *
 * Fetches prices from CoinGecko Demo API:
 * - Token prices: GET /simple/token_price/{platformId}
 * - Native prices: GET /simple/price
 *
 * Does not manage cache internally (OracleChain manages shared cache).
 */
export class CoinGeckoOracle implements IPriceOracle {
  constructor(private readonly apiKey: string) {}

  /**
   * Get price for a single token.
   *
   * @param token - Token reference with address, chain, decimals.
   * @returns PriceInfo with USD price from CoinGecko.
   * @throws CoinGeckoNotConfiguredError if API key is empty.
   * @throws PriceNotAvailableError if CoinGecko has no data for this token.
   * @throws Error on HTTP errors (429, 500, etc).
   */
  async getPrice(token: TokenRef): Promise<PriceInfo> {
    this.ensureConfigured();

    const network = resolveNetwork(token.chain, token.network);

    // Delegate native tokens to getNativePrice
    if (token.address === 'native') {
      return this.getNativePriceByNetwork(network);
    }

    const platform = getCoinGeckoPlatform(network);
    if (!platform) {
      throw new PriceNotAvailableError(
        `Unsupported network for CoinGecko: ${network}`,
      );
    }

    // EVM addresses must be lowercased for CoinGecko API
    const address = token.chain === 'ethereum'
      ? token.address.toLowerCase()
      : token.address;

    const url =
      `${BASE_URL}/simple/token_price/${platform.platformId}` +
      `?contract_addresses=${address}` +
      `&vs_currencies=usd` +
      `&include_last_updated_at=true`;

    const data = await this.fetchJson<Record<string, { usd?: number; last_updated_at?: number }>>(url);

    // CoinGecko returns EVM addresses lowercased; Solana addresses are returned as-is
    const lookupKey = token.chain === 'ethereum' ? address.toLowerCase() : address;
    const tokenData = data[lookupKey];
    if (!tokenData?.usd) {
      throw new PriceNotAvailableError(
        `CoinGecko returned no price for ${token.symbol ?? token.address} on ${network}`,
      );
    }

    return this.buildPriceInfo(tokenData.usd);
  }

  /**
   * Get prices for multiple tokens in batch.
   *
   * Groups tokens by chain and makes one API call per chain
   * (comma-separated addresses). Native tokens are queried separately.
   *
   * Individual token failures are skipped (not included in result Map).
   *
   * @param tokens - Array of token references.
   * @returns Map from cache key to PriceInfo.
   */
  async getPrices(tokens: TokenRef[]): Promise<Map<string, PriceInfo>> {
    this.ensureConfigured();

    const result = new Map<string, PriceInfo>();

    // Separate native and non-native tokens, group by resolved network
    const nativeTokens: TokenRef[] = [];
    const tokensByNetwork = new Map<string, TokenRef[]>();

    for (const token of tokens) {
      if (token.address === 'native') {
        nativeTokens.push(token);
      } else {
        const network = resolveNetwork(token.chain, token.network);
        const list = tokensByNetwork.get(network) ?? [];
        list.push(token);
        tokensByNetwork.set(network, list);
      }
    }

    // Batch query per network (comma-separated addresses)
    const batchPromises: Promise<void>[] = [];

    for (const [network, networkTokens] of tokensByNetwork) {
      batchPromises.push(
        this.fetchBatchTokenPrices(network, networkTokens, result),
      );
    }

    // Native token queries
    for (const token of nativeTokens) {
      const network = resolveNetwork(token.chain, token.network);
      batchPromises.push(
        this.getNativePriceByNetwork(network)
          .then((price) => {
            result.set(buildCacheKey(network, 'native'), price);
          })
          .catch(() => {
            // Skip failed native price queries
          }),
      );
    }

    await Promise.all(batchPromises);
    return result;
  }

  /**
   * Get native token price (SOL or ETH).
   *
   * Part of IPriceOracle interface. Resolves network internally from chain.
   *
   * @param chain - Chain type ('solana' or 'ethereum').
   * @returns PriceInfo with native token USD price.
   * @throws CoinGeckoNotConfiguredError if API key is empty.
   * @throws PriceNotAvailableError if chain is unsupported or no data.
   */
  async getNativePrice(chain: ChainType): Promise<PriceInfo> {
    const network = resolveNetwork(chain);
    return this.getNativePriceByNetwork(network);
  }

  /**
   * Get native token price by NetworkType.
   *
   * Internal helper used by getPrice() and getPrices() where network is already resolved.
   */
  private async getNativePriceByNetwork(network: string): Promise<PriceInfo> {
    this.ensureConfigured();

    const platform = getCoinGeckoPlatform(network);
    if (!platform) {
      throw new PriceNotAvailableError(
        `Unsupported network for CoinGecko native price: ${network}`,
      );
    }

    const url =
      `${BASE_URL}/simple/price` +
      `?ids=${platform.nativeCoinId}` +
      `&vs_currencies=usd` +
      `&include_last_updated_at=true`;

    const data = await this.fetchJson<Record<string, { usd?: number; last_updated_at?: number }>>(url);

    const coinData = data[platform.nativeCoinId];
    if (!coinData?.usd) {
      throw new PriceNotAvailableError(
        `CoinGecko returned no native price for ${network}`,
      );
    }

    return this.buildPriceInfo(coinData.usd);
  }

  /**
   * Get cache statistics.
   *
   * CoinGeckoOracle does not manage its own cache (OracleChain manages
   * the shared InMemoryPriceCache), so all counters are zero.
   */
  getCacheStats(): CacheStats {
    return { hits: 0, misses: 0, staleHits: 0, size: 0, evictions: 0 };
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /** Throw if API key is not configured. */
  private ensureConfigured(): void {
    if (!this.apiKey) {
      throw new CoinGeckoNotConfiguredError();
    }
  }

  /** Fetch JSON from CoinGecko API with timeout and API key header. */
  private async fetchJson<T>(url: string): Promise<T> {
    const res = await fetch(url, {
      headers: { 'x-cg-demo-api-key': this.apiKey },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    if (!res.ok) {
      throw new Error(`CoinGecko API error: ${res.status} ${res.statusText}`);
    }

    return res.json() as Promise<T>;
  }

  /** Build a PriceInfo with coingecko source and 5-minute TTL. */
  private buildPriceInfo(usdPrice: number): PriceInfo {
    const now = Date.now();
    return {
      usdPrice,
      source: 'coingecko',
      fetchedAt: now,
      expiresAt: now + PRICE_TTL_MS,
      isStale: false,
    };
  }

  /** Fetch batch token prices for a single network and add to result map. */
  private async fetchBatchTokenPrices(
    network: string,
    tokens: TokenRef[],
    result: Map<string, PriceInfo>,
  ): Promise<void> {
    const platform = getCoinGeckoPlatform(network);
    if (!platform) return;

    // EVM addresses must be lowercased for CoinGecko API
    const isEvm = tokens[0]?.chain === 'ethereum';
    const addresses = tokens.map((t) =>
      isEvm ? t.address.toLowerCase() : t.address,
    );

    const url =
      `${BASE_URL}/simple/token_price/${platform.platformId}` +
      `?contract_addresses=${addresses.join(',')}` +
      `&vs_currencies=usd` +
      `&include_last_updated_at=true`;

    try {
      const data = await this.fetchJson<Record<string, { usd?: number; last_updated_at?: number }>>(url);

      for (const token of tokens) {
        const addr = isEvm
          ? token.address.toLowerCase()
          : token.address;
        const tokenData = data[addr];
        if (tokenData?.usd) {
          const tokenNetwork = resolveNetwork(token.chain, token.network);
          result.set(
            buildCacheKey(tokenNetwork, token.address),
            this.buildPriceInfo(tokenData.usd),
          );
        }
      }
    } catch {
      // Skip failed batch queries (individual token failures)
    }
  }
}
