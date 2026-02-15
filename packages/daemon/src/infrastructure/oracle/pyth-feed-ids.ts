/**
 * Pyth Hermes feed ID hardcoded mappings.
 *
 * Maps cache keys (`chain:address`) to Pyth price feed IDs (hex, no 0x prefix).
 * These feed IDs are chain-agnostic -- Pyth uses the same feed for SOL/USD
 * regardless of whether the query comes from Solana or EVM context.
 *
 * Only major tokens are hardcoded. Tokens without a feed ID will trigger
 * PriceNotAvailableError in PythOracle, causing OracleChain to fall back
 * to CoinGecko.
 *
 * Feed IDs verified via Pyth Hermes /v2/price_feeds API (2026-02-15).
 */
import type { ChainType } from '@waiaas/core';

// ---------------------------------------------------------------------------
// Feed ID Map: cacheKey -> Pyth feed ID (hex, no 0x)
// ---------------------------------------------------------------------------

/** Hardcoded Pyth price feed IDs for major tokens. */
export const PYTH_FEED_IDS: ReadonlyMap<string, string> = new Map([
  // Native tokens
  ['solana:native', 'ef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d'],    // SOL/USD
  ['ethereum:native', 'ff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace'],   // ETH/USD

  // Solana SPL tokens
  ['solana:EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', 'eaa020c61cc479712813461ce153894a96a6c00b21ed0cfc2798d1f9a9e9c94a'], // USDC/USD
  ['solana:Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB', '2b89b9dc8fdf9f34709a5b106b472f0f39bb6ca9ce04b0fd7f2e971688e2e53b'],  // USDT/USD

  // BTC (chain-agnostic feed, mapped for common BTC token addresses)
  ['ethereum:native_btc', 'e62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43'], // BTC/USD
]);

// ---------------------------------------------------------------------------
// Native token -> feed ID mapping
// ---------------------------------------------------------------------------

/** Map from ChainType to the native token's Pyth feed ID. */
const NATIVE_FEED_MAP: ReadonlyMap<ChainType, string> = new Map([
  ['solana', 'ef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d'],   // SOL/USD
  ['ethereum', 'ff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace'],  // ETH/USD
]);

// ---------------------------------------------------------------------------
// Public helpers
// ---------------------------------------------------------------------------

/**
 * Look up a Pyth feed ID by cache key.
 *
 * @param cacheKey - Normalized cache key (e.g. `solana:native`, `ethereum:0xaddr`).
 * @returns Feed ID hex string (no 0x prefix) or undefined if not registered.
 */
export function getFeedId(cacheKey: string): string | undefined {
  return PYTH_FEED_IDS.get(cacheKey);
}

/**
 * Get the Pyth feed ID for a chain's native token.
 *
 * @param chain - Chain type ('solana' or 'ethereum').
 * @returns Feed ID hex string or undefined if chain not supported.
 */
export function getNativeFeedId(chain: ChainType): string | undefined {
  return NATIVE_FEED_MAP.get(chain);
}
