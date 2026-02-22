/**
 * Pyth Hermes feed ID hardcoded mappings.
 *
 * Maps CAIP-19 cache keys to Pyth price feed IDs (hex, no 0x prefix).
 * Keys are generated programmatically via nativeAssetId/tokenAssetId
 * to ensure consistency with buildCacheKey() output.
 *
 * These feed IDs are chain-agnostic -- Pyth uses the same feed for SOL/USD
 * regardless of whether the query comes from Solana or EVM context.
 *
 * Only major tokens are hardcoded. Tokens without a feed ID will trigger
 * PriceNotAvailableError in PythOracle, causing OracleChain to fall back
 * to CoinGecko.
 *
 * Feed IDs verified via Pyth Hermes /v2/price_feeds API (2026-02-15).
 */
import type { NetworkType } from '@waiaas/core';
import { nativeAssetId, tokenAssetId } from '@waiaas/core';

// ---------------------------------------------------------------------------
// Feed ID Map: CAIP-19 cacheKey -> Pyth feed ID (hex, no 0x)
// ---------------------------------------------------------------------------

/** Hardcoded Pyth price feed IDs for major tokens (keyed by CAIP-19 asset type). */
export const PYTH_FEED_IDS: ReadonlyMap<string, string> = new Map([
  // Native tokens
  [nativeAssetId('mainnet'),          'ef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d'],  // SOL/USD
  [nativeAssetId('ethereum-mainnet'), 'ff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace'],  // ETH/USD

  // Solana SPL tokens
  [tokenAssetId('mainnet', 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'), 'eaa020c61cc479712813461ce153894a96a6c00b21ed0cfc2798d1f9a9e9c94a'], // USDC/USD
  [tokenAssetId('mainnet', 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB'), '2b89b9dc8fdf9f34709a5b106b472f0f39bb6ca9ce04b0fd7f2e971688e2e53b'],  // USDT/USD
]);

// ---------------------------------------------------------------------------
// Native token -> feed ID mapping
// ---------------------------------------------------------------------------

/** Map from NetworkType to the native token's Pyth feed ID. */
const NATIVE_FEED_MAP: ReadonlyMap<NetworkType, string> = new Map([
  ['mainnet',          'ef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d'],  // SOL/USD
  ['ethereum-mainnet', 'ff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace'],  // ETH/USD
]);

// ---------------------------------------------------------------------------
// Public helpers
// ---------------------------------------------------------------------------

/**
 * Look up a Pyth feed ID by cache key.
 *
 * @param cacheKey - CAIP-19 cache key (e.g. 'solana:5eykt.../slip44:501').
 * @returns Feed ID hex string (no 0x prefix) or undefined if not registered.
 */
export function getFeedId(cacheKey: string): string | undefined {
  return PYTH_FEED_IDS.get(cacheKey);
}

/**
 * Get the Pyth feed ID for a network's native token.
 *
 * @param network - Network type (e.g., 'mainnet' for Solana, 'ethereum-mainnet' for Ethereum).
 * @returns Feed ID hex string or undefined if network not supported.
 */
export function getNativeFeedId(network: NetworkType): string | undefined {
  return NATIVE_FEED_MAP.get(network);
}
