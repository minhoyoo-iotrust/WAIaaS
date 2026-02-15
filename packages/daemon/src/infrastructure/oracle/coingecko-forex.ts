/**
 * CoinGecko-based forex rate provider.
 *
 * Queries CoinGecko's `/simple/price?ids=tether&vs_currencies=...` endpoint
 * to get USD -> fiat exchange rates. Uses USDT (tether) as USD proxy
 * since CoinGecko doesn't provide direct forex rates.
 *
 * Rate limits: Same as CoinGecko Demo API (30 calls/min, 10,000/month).
 * Shares API key with CoinGeckoOracle (crypto price oracle).
 *
 * This provider does NOT manage cache -- caching is handled by ForexRateService
 * via InMemoryPriceCache (30-minute TTL).
 */

/** CoinGecko Demo API base URL. */
const BASE_URL = 'https://api.coingecko.com/api/v3';

/** Request timeout in milliseconds. */
const TIMEOUT_MS = 5000;

/**
 * CoinGecko forex rate provider.
 *
 * Fetches fiat exchange rates using tether (USDT ~ 1 USD) as proxy.
 * GET /simple/price?ids=tether&vs_currencies=krw,jpy,eur,...
 *
 * Returns Map<currencyCode, rate> where rate is 1 USD in target currency.
 * Empty Map if API key is not configured (graceful degradation).
 */
export class CoinGeckoForexProvider {
  constructor(private readonly apiKey: string) {}

  /**
   * Fetch forex rates for multiple currencies from CoinGecko.
   *
   * @param currencies - Array of uppercase currency codes (e.g. ['KRW', 'JPY']).
   * @returns Map from currency code to exchange rate.
   * @throws Error on HTTP errors (non-2xx status).
   */
  async getRates(currencies: string[]): Promise<Map<string, number>> {
    // Graceful: no API key -> empty result (no throw)
    if (!this.apiKey) {
      return new Map();
    }

    if (currencies.length === 0) {
      return new Map();
    }

    // CoinGecko vs_currencies expects lowercase
    const vsCurrencies = currencies.map((c) => c.toLowerCase()).join(',');
    const url = `${BASE_URL}/simple/price?ids=tether&vs_currencies=${vsCurrencies}`;

    const res = await fetch(url, {
      headers: { 'x-cg-demo-api-key': this.apiKey },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    if (!res.ok) {
      throw new Error(`CoinGecko forex API error: ${res.status} ${res.statusText}`);
    }

    const data = (await res.json()) as Record<string, Record<string, number>>;
    const tetherData = data.tether ?? {};

    const result = new Map<string, number>();
    for (const curr of currencies) {
      const rate = tetherData[curr.toLowerCase()];
      if (typeof rate === 'number' && rate > 0) {
        result.set(curr, rate);
      }
    }

    return result;
  }
}
