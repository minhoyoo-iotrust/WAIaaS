/**
 * In-memory price cache with LRU eviction and stampede prevention.
 *
 * Uses ES Map insertion order for O(1) LRU eviction (delete+set to touch).
 * No external dependencies -- v1.5 decision: 0 new npm packages.
 *
 * Terminology:
 * - TTL (5 min default): Time after which get() returns null (cache miss).
 * - staleMax (30 min default): Time after which getStale() also returns null.
 *   Between TTL and staleMax, getStale() returns the old value for fallback use.
 * - maxEntries (128 default): LRU capacity. Oldest entry evicted on overflow.
 */
import type { PriceInfo, CacheStats, ChainType, NetworkType } from '@waiaas/core';
import { nativeAssetId, tokenAssetId } from '@waiaas/core';

/** Internal cache entry wrapping a PriceInfo with timing metadata. */
interface CacheEntry {
  /** The cached price data. */
  price: PriceInfo;
  /** Unix timestamp (ms) when this entry was cached. */
  cachedAt: number;
  /** Unix timestamp (ms) when this entry expires (cachedAt + TTL). */
  expiresAt: number;
  /** Unix timestamp (ms) when stale data also expires (cachedAt + staleMax). */
  staleExpiresAt: number;
}

/**
 * Resolve NetworkType from a token's chain and optional network fields.
 *
 * Falls back to the chain's primary mainnet for backward compatibility
 * when network is not provided.
 *
 * @param chain - Chain type ('solana' | 'ethereum').
 * @param network - Optional network type. If provided, returned as-is.
 * @returns Resolved NetworkType.
 */
export function resolveNetwork(chain: ChainType, network?: NetworkType): NetworkType {
  if (network) return network;
  return chain === 'solana' ? 'mainnet' : 'ethereum-mainnet';
}

/**
 * Build a CAIP-19 cache key for a token.
 *
 * Uses nativeAssetId/tokenAssetId from @waiaas/core (Phase 231 SSoT).
 * EVM addresses are lowercased internally by tokenAssetId().
 * Solana base58 addresses are preserved by tokenAssetId().
 *
 * @param network - NetworkType (e.g., 'ethereum-mainnet', 'polygon-mainnet', 'mainnet').
 * @param address - Token address or 'native' for native token.
 * @returns CAIP-19 asset type URI as cache key.
 *
 * @example buildCacheKey('ethereum-mainnet', 'native') => 'eip155:1/slip44:60'
 * @example buildCacheKey('polygon-mainnet', '0xAddr') => 'eip155:137/erc20:0xaddr'
 * @example buildCacheKey('mainnet', 'EPjFWdd5...') => 'solana:5eykt.../token:EPjFWdd5...'
 */
export function buildCacheKey(network: NetworkType, address: string): string {
  if (address === 'native') {
    return nativeAssetId(network);
  }
  return tokenAssetId(network, address);
}

/**
 * In-memory price cache with LRU eviction and cache stampede prevention.
 *
 * - LRU: Map insertion order tracks access recency. get() does delete+set to touch.
 * - TTL: Entries expire after ttlMs. get() returns null for expired entries.
 * - Stale: getStale() returns expired-but-not-too-old entries for fallback.
 * - Stampede: getOrFetch() coalesces concurrent requests for the same key.
 */
export class InMemoryPriceCache {
  /** Default TTL: 5 minutes. */
  static readonly DEFAULT_TTL_MS = 5 * 60 * 1000;
  /** Default stale max: 30 minutes. */
  static readonly DEFAULT_STALE_MAX_MS = 30 * 60 * 1000;
  /** Default max entries: 128. */
  static readonly DEFAULT_MAX_ENTRIES = 128;

  private readonly cache = new Map<string, CacheEntry>();
  private readonly inflightRequests = new Map<string, Promise<PriceInfo>>();
  private stats = { hits: 0, misses: 0, staleHits: 0, evictions: 0 };

  constructor(
    private readonly ttlMs: number = InMemoryPriceCache.DEFAULT_TTL_MS,
    private readonly staleMaxMs: number = InMemoryPriceCache.DEFAULT_STALE_MAX_MS,
    private readonly maxEntries: number = InMemoryPriceCache.DEFAULT_MAX_ENTRIES,
  ) {}

  /**
   * Get a cached price entry.
   *
   * Returns null if the key doesn't exist or the entry has expired past TTL.
   * On hit, performs LRU touch (delete+set to move to most recent position).
   *
   * @param key - Cache key (use buildCacheKey to generate).
   * @returns PriceInfo if cached and within TTL, null otherwise.
   */
  get(key: string): PriceInfo | null {
    const entry = this.cache.get(key);
    if (!entry) {
      this.stats.misses++;
      return null;
    }

    const now = Date.now();
    if (now >= entry.expiresAt) {
      this.stats.misses++;
      return null;
    }

    // LRU touch: delete and re-insert to move to end (most recent)
    this.cache.delete(key);
    this.cache.set(key, entry);
    this.stats.hits++;
    return entry.price;
  }

  /**
   * Get stale cached data (past TTL but within staleMax).
   *
   * Used as fallback when oracle is temporarily unavailable.
   *
   * @param key - Cache key.
   * @returns PriceInfo if within staleMax window, null otherwise.
   */
  getStale(key: string): PriceInfo | null {
    const entry = this.cache.get(key);
    if (!entry) {
      return null;
    }

    const now = Date.now();
    if (now >= entry.staleExpiresAt) {
      return null;
    }

    // Only count as staleHit if actually past TTL
    if (now >= entry.expiresAt) {
      this.stats.staleHits++;
    }
    return entry.price;
  }

  /**
   * Store a price in the cache.
   *
   * If the cache is at capacity and the key is new, the oldest entry (first
   * Map key per insertion order) is evicted.
   *
   * @param key - Cache key.
   * @param price - Price data to cache.
   */
  set(key: string, price: PriceInfo): void {
    // Evict oldest if at capacity and this is a new key
    if (this.cache.size >= this.maxEntries && !this.cache.has(key)) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey !== undefined) {
        this.cache.delete(oldestKey);
        this.stats.evictions++;
      }
    }

    const now = Date.now();
    const entry: CacheEntry = {
      price,
      cachedAt: now,
      expiresAt: now + this.ttlMs,
      staleExpiresAt: now + this.staleMaxMs,
    };

    // Delete first to ensure insertion at end (most recent position)
    this.cache.delete(key);
    this.cache.set(key, entry);
  }

  /**
   * Get a price from cache, or fetch it if not cached.
   *
   * Implements cache stampede prevention: concurrent calls for the same key
   * share a single inflight Promise. On error, the inflight is cleared so
   * subsequent calls can retry.
   *
   * @param key - Cache key.
   * @param fetcher - Async function to fetch the price on cache miss.
   * @returns The cached or freshly fetched PriceInfo.
   */
  async getOrFetch(key: string, fetcher: () => Promise<PriceInfo>): Promise<PriceInfo> {
    // 1. Cache hit
    const cached = this.get(key);
    if (cached) return cached;

    // 2. Join existing inflight request (stampede prevention)
    const inflight = this.inflightRequests.get(key);
    if (inflight) return inflight;

    // 3. Start new fetch
    const promise = fetcher()
      .then((price) => {
        this.set(key, price);
        return price;
      })
      .finally(() => {
        this.inflightRequests.delete(key);
      });

    this.inflightRequests.set(key, promise);
    return promise;
  }

  /**
   * Get cache statistics.
   *
   * @returns Current cache stats including hits, misses, staleHits, size, evictions.
   */
  getStats(): CacheStats {
    return {
      ...this.stats,
      size: this.cache.size,
    };
  }

  /**
   * Clear all cached entries and reset statistics.
   */
  clear(): void {
    this.cache.clear();
    this.inflightRequests.clear();
    this.stats = { hits: 0, misses: 0, staleHits: 0, evictions: 0 };
  }
}
