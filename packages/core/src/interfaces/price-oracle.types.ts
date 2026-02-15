/**
 * Price Oracle types and interfaces (Zod SSoT).
 *
 * Defines TokenRef, PriceInfo, CacheStats, and IPriceOracle for the
 * v1.5 DeFi price oracle subsystem. Actual oracle implementations
 * (Pyth, CoinGecko) live in the daemon package.
 *
 * Source enum: 'pyth' | 'coingecko' | 'cache' (v1.5 decision: no chainlink/jupiter).
 */
import { z } from 'zod';
import type { ChainType } from '../enums/chain.js';
import { ChainTypeEnum } from '../enums/chain.js';

// ---------------------------------------------------------------------------
// Zod SSoT: TokenRef
// ---------------------------------------------------------------------------

/** Reference to a token for price lookup. */
export const TokenRefSchema = z.object({
  /** Token address (mint for Solana, contract for EVM). Min 1 char. */
  address: z.string().min(1, 'Token address is required'),
  /** Token symbol (optional, for display/logging). */
  symbol: z.string().optional(),
  /** Decimal places. SOL=9, ETH=18, USDC=6. Range 0-18. */
  decimals: z.number().int().min(0).max(18),
  /** Target chain. */
  chain: ChainTypeEnum,
});

/** Token reference for price lookup. Derived from TokenRefSchema via z.infer. */
export type TokenRef = z.infer<typeof TokenRefSchema>;

// ---------------------------------------------------------------------------
// Zod SSoT: PriceInfo
// ---------------------------------------------------------------------------

/** Price information returned by an oracle. */
export const PriceInfoSchema = z.object({
  /** USD price (non-negative). */
  usdPrice: z.number().nonnegative(),
  /** Price confidence ratio (0-1). Higher = more confident. Optional. */
  confidence: z.number().min(0).max(1).optional(),
  /** Data source. v1.5: pyth (primary), coingecko (fallback), cache (from cache). */
  source: z.enum(['pyth', 'coingecko', 'cache']),
  /** Unix timestamp (ms) when price was fetched. Positive integer. */
  fetchedAt: z.number().int().positive(),
  /** Unix timestamp (ms) when this price expires. Positive integer. */
  expiresAt: z.number().int().positive(),
  /**
   * Whether this price observation is past TTL.
   * Note: isStale=true means past cache TTL (>5min), NOT classifyPriceAge STALE (>30min).
   * Defaults to false.
   */
  isStale: z.boolean().default(false),
});

/** Price information from an oracle source. Derived from PriceInfoSchema via z.infer. */
export type PriceInfo = z.infer<typeof PriceInfoSchema>;

// ---------------------------------------------------------------------------
// CacheStats (plain interface for monitoring)
// ---------------------------------------------------------------------------

/** Cache statistics for monitoring and diagnostics. */
export interface CacheStats {
  /** Number of cache hits. */
  hits: number;
  /** Number of cache misses. */
  misses: number;
  /** Number of stale cache hits (expired but within staleMax). */
  staleHits: number;
  /** Current number of entries in cache. */
  size: number;
  /** Number of LRU evictions. */
  evictions: number;
}

// ---------------------------------------------------------------------------
// IPriceOracle interface
// ---------------------------------------------------------------------------

/**
 * Price oracle contract.
 *
 * Implementations: PythOracle (primary), CoinGeckoOracle (fallback),
 * OracleChain (composite with fallback + cross-validation).
 */
export interface IPriceOracle {
  /** Get price for a single token. */
  getPrice(token: TokenRef): Promise<PriceInfo>;
  /** Get prices for multiple tokens. Returns Map<cacheKey, PriceInfo>. */
  getPrices(tokens: TokenRef[]): Promise<Map<string, PriceInfo>>;
  /** Get native token price (SOL or ETH). */
  getNativePrice(chain: ChainType): Promise<PriceInfo>;
  /** Get cache statistics. */
  getCacheStats(): CacheStats;
}
