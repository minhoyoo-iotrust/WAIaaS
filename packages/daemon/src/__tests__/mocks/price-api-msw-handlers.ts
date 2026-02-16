/**
 * M7: Price API msw handlers (Pyth Hermes + CoinGecko Demo API).
 *
 * Intercepts external price API HTTP requests with canned responses
 * for deterministic testing. Supports configurable prices, error
 * scenarios, and both single and batch queries.
 */
import { http, HttpResponse } from 'msw';

// ---------------------------------------------------------------------------
// Pyth Hermes handlers
// ---------------------------------------------------------------------------

/** Feed price override shape. */
interface PythFeedOverride {
  price: string;
  conf: string;
  expo: number;
}

/**
 * Create Pyth Hermes API msw handlers.
 *
 * Intercepts GET /v2/updates/price/latest and returns canned price feeds.
 * Override specific feed IDs with custom price/conf/expo values.
 *
 * @param overrides - Map of feed ID to price data overrides.
 */
export function createPythHandlers(
  overrides?: { feeds?: Record<string, PythFeedOverride> },
) {
  return [
    http.get('https://hermes.pyth.network/v2/updates/price/latest', ({ request }) => {
      const url = new URL(request.url);
      const ids = url.searchParams.getAll('ids[]');

      const now = Math.floor(Date.now() / 1000);

      const parsed = ids.map((id) => {
        // Strip leading 0x if present (real API returns without 0x prefix)
        const cleanId = id.startsWith('0x') ? id.slice(2) : id;
        const feed = overrides?.feeds?.[cleanId];

        const priceData = feed
          ? { price: feed.price, conf: feed.conf, expo: feed.expo, publish_time: now }
          : { price: '18413602312', conf: '17716632', expo: -8, publish_time: now };

        return {
          id: cleanId,
          price: priceData,
          ema_price: { ...priceData },
          metadata: {
            slot: 290000000,
            proof_available_time: now,
            prev_publish_time: now - 1,
          },
        };
      });

      return HttpResponse.json({ parsed });
    }),
  ];
}

// ---------------------------------------------------------------------------
// CoinGecko Demo API handlers
// ---------------------------------------------------------------------------

/** CoinGecko price override shape. */
interface CoinGeckoPriceOverride {
  usd: number;
}

/**
 * Create CoinGecko Demo API msw handlers.
 *
 * Intercepts token_price and simple/price endpoints with configurable
 * USD prices per address/coin ID.
 *
 * @param overrides - Map of address/coin ID to USD price overrides.
 */
export function createCoinGeckoHandlers(
  overrides?: { prices?: Record<string, CoinGeckoPriceOverride> },
) {
  return [
    // Token price: /simple/token_price/{platform}
    http.get('https://api.coingecko.com/api/v3/simple/token_price/:platform', ({ request }) => {
      const url = new URL(request.url);
      const addresses = url.searchParams.get('contract_addresses')?.split(',') ?? [];

      const now = Math.floor(Date.now() / 1000);
      const result: Record<string, { usd: number; last_updated_at: number }> = {};

      for (const addr of addresses) {
        result[addr] = {
          usd: overrides?.prices?.[addr]?.usd ?? 1.0,
          last_updated_at: now,
        };
      }

      return HttpResponse.json(result);
    }),

    // Native price: /simple/price
    http.get('https://api.coingecko.com/api/v3/simple/price', ({ request }) => {
      const url = new URL(request.url);
      const ids = url.searchParams.get('ids')?.split(',') ?? [];

      const now = Math.floor(Date.now() / 1000);
      const result: Record<string, { usd: number; last_updated_at: number }> = {};

      // Default native prices by coin ID
      const defaults: Record<string, number> = {
        solana: 184.0,
        ethereum: 3400.0,
      };

      for (const id of ids) {
        result[id] = {
          usd: overrides?.prices?.[id]?.usd ?? defaults[id] ?? 1.0,
          last_updated_at: now,
        };
      }

      return HttpResponse.json(result);
    }),
  ];
}

// ---------------------------------------------------------------------------
// Error handlers
// ---------------------------------------------------------------------------

/**
 * Create error scenario handlers for both Pyth and CoinGecko APIs.
 *
 * @param pythStatus - HTTP status for Pyth error (default: 503).
 * @param coingeckoStatus - HTTP status for CoinGecko error (default: 429).
 */
export function createPriceApiErrorHandlers(pythStatus = 503, coingeckoStatus = 429) {
  return [
    http.get('https://hermes.pyth.network/v2/updates/price/latest', () =>
      HttpResponse.json(
        { error: 'Service unavailable' },
        { status: pythStatus },
      ),
    ),
    http.get('https://api.coingecko.com/api/v3/simple/token_price/:platform', () =>
      HttpResponse.json(
        { status: { error_code: coingeckoStatus, error_message: 'Rate limited' } },
        { status: coingeckoStatus },
      ),
    ),
    http.get('https://api.coingecko.com/api/v3/simple/price', () =>
      HttpResponse.json(
        { status: { error_code: coingeckoStatus, error_message: 'Rate limited' } },
        { status: coingeckoStatus },
      ),
    ),
  ];
}

// ---------------------------------------------------------------------------
// Convenience exports
// ---------------------------------------------------------------------------

/** Default Pyth handlers with SOL/USD canned response. */
export const pythHandlers = createPythHandlers();

/** Default CoinGecko handlers with SOL/ETH native + 1.0 token defaults. */
export const coingeckoHandlers = createCoinGeckoHandlers();

/** Combined default price API handlers (Pyth + CoinGecko). */
export const priceApiHandlers = [...pythHandlers, ...coingeckoHandlers];
