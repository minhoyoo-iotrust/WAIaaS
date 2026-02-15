import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { InMemoryPriceCache, buildCacheKey } from '../infrastructure/oracle/price-cache.js';
import type { PriceInfo } from '@waiaas/core';

/** Factory for test PriceInfo objects. */
function makePriceInfo(overrides?: Partial<PriceInfo>): PriceInfo {
  return {
    usdPrice: 150.25,
    source: 'pyth',
    fetchedAt: Date.now(),
    expiresAt: Date.now() + 300_000,
    isStale: false,
    ...overrides,
  };
}

describe('InMemoryPriceCache', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should store and retrieve a cached entry (cache hit)', () => {
    const cache = new InMemoryPriceCache();
    const price = makePriceInfo();
    cache.set('solana:SOL', price);

    const result = cache.get('solana:SOL');
    expect(result).not.toBeNull();
    expect(result!.usdPrice).toBe(150.25);
  });

  it('should return null after TTL expiration (cache miss)', () => {
    const cache = new InMemoryPriceCache();
    const price = makePriceInfo();
    cache.set('solana:SOL', price);

    // Advance past 5 min TTL
    vi.advanceTimersByTime(5 * 60 * 1000 + 1);

    const result = cache.get('solana:SOL');
    expect(result).toBeNull();
  });

  it('should return stale data via getStale when within staleMax', () => {
    const cache = new InMemoryPriceCache();
    const price = makePriceInfo();
    cache.set('solana:SOL', price);

    // Advance past TTL but within staleMax (30min)
    vi.advanceTimersByTime(10 * 60 * 1000);

    const result = cache.getStale('solana:SOL');
    expect(result).not.toBeNull();
    expect(result!.usdPrice).toBe(150.25);
  });

  it('should return null from getStale after staleMax expiration', () => {
    const cache = new InMemoryPriceCache();
    const price = makePriceInfo();
    cache.set('solana:SOL', price);

    // Advance past staleMax (30 minutes)
    vi.advanceTimersByTime(30 * 60 * 1000 + 1);

    const result = cache.getStale('solana:SOL');
    expect(result).toBeNull();
  });

  it('should evict oldest entry when LRU limit (128) is exceeded', () => {
    const cache = new InMemoryPriceCache();

    // Fill cache to capacity
    for (let i = 0; i < 128; i++) {
      cache.set(`key-${i}`, makePriceInfo({ usdPrice: i }));
    }

    // 129th entry should evict the first
    cache.set('key-128', makePriceInfo({ usdPrice: 128 }));

    expect(cache.get('key-0')).toBeNull();
    expect(cache.get('key-128')).not.toBeNull();
    expect(cache.get('key-1')).not.toBeNull(); // second oldest should survive
  });

  it('should update LRU order on get access (recently accessed items preserved)', () => {
    const cache = new InMemoryPriceCache();

    // Fill cache to capacity
    for (let i = 0; i < 128; i++) {
      cache.set(`key-${i}`, makePriceInfo({ usdPrice: i }));
    }

    // Touch key-0 to move it to most recent
    cache.get('key-0');

    // Add new entry -- should evict key-1 (now oldest), not key-0
    cache.set('key-128', makePriceInfo({ usdPrice: 128 }));

    expect(cache.get('key-0')).not.toBeNull(); // touched, should survive
    expect(cache.get('key-1')).toBeNull(); // not touched, should be evicted
  });

  it('should not call fetcher on getOrFetch cache hit', async () => {
    const cache = new InMemoryPriceCache();
    const price = makePriceInfo();
    cache.set('solana:SOL', price);

    const fetcher = vi.fn().mockResolvedValue(makePriceInfo({ usdPrice: 999 }));
    const result = await cache.getOrFetch('solana:SOL', fetcher);

    expect(fetcher).not.toHaveBeenCalled();
    expect(result.usdPrice).toBe(150.25);
  });

  it('should call fetcher and cache result on getOrFetch cache miss', async () => {
    const cache = new InMemoryPriceCache();
    const fetchedPrice = makePriceInfo({ usdPrice: 200 });
    const fetcher = vi.fn().mockResolvedValue(fetchedPrice);

    const result = await cache.getOrFetch('solana:SOL', fetcher);

    expect(fetcher).toHaveBeenCalledOnce();
    expect(result.usdPrice).toBe(200);
    // Should be cached now
    expect(cache.get('solana:SOL')!.usdPrice).toBe(200);
  });

  it('should coalesce concurrent getOrFetch calls (stampede prevention)', async () => {
    const cache = new InMemoryPriceCache();

    let resolvePromise!: (value: PriceInfo) => void;
    const fetcherPromise = new Promise<PriceInfo>((resolve) => {
      resolvePromise = resolve;
    });
    const fetcher = vi.fn().mockReturnValue(fetcherPromise);

    // Fire 3 concurrent requests
    const p1 = cache.getOrFetch('solana:SOL', fetcher);
    const p2 = cache.getOrFetch('solana:SOL', fetcher);
    const p3 = cache.getOrFetch('solana:SOL', fetcher);

    // Resolve the single fetch
    resolvePromise(makePriceInfo({ usdPrice: 100 }));

    const [r1, r2, r3] = await Promise.all([p1, p2, p3]);

    // Fetcher should only be called once
    expect(fetcher).toHaveBeenCalledOnce();
    expect(r1.usdPrice).toBe(100);
    expect(r2.usdPrice).toBe(100);
    expect(r3.usdPrice).toBe(100);
  });

  it('should release inflight on fetcher error and allow retry', async () => {
    const cache = new InMemoryPriceCache();

    const fetcher = vi.fn()
      .mockRejectedValueOnce(new Error('Network error'))
      .mockResolvedValueOnce(makePriceInfo({ usdPrice: 300 }));

    // First call should fail
    await expect(cache.getOrFetch('solana:SOL', fetcher)).rejects.toThrow('Network error');

    // Second call should succeed (inflight cleared)
    const result = await cache.getOrFetch('solana:SOL', fetcher);
    expect(result.usdPrice).toBe(300);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('should track accurate stats (hits, misses, staleHits, evictions)', () => {
    const cache = new InMemoryPriceCache(300_000, 1_800_000, 2); // maxEntries=2 for easy test
    const price = makePriceInfo();

    // Miss
    cache.get('key-a');
    // Set + hit
    cache.set('key-a', price);
    cache.get('key-a');
    // Second set
    cache.set('key-b', price);
    // Third set triggers eviction of key-a
    cache.set('key-c', price);

    // Advance past TTL for stale test
    vi.advanceTimersByTime(6 * 60 * 1000);
    cache.getStale('key-b'); // stale hit

    const stats = cache.getStats();
    expect(stats.hits).toBe(1);
    expect(stats.misses).toBe(1);
    expect(stats.staleHits).toBe(1);
    expect(stats.evictions).toBe(1);
    expect(stats.size).toBe(2);
  });

  it('should clear cache and reset stats', () => {
    const cache = new InMemoryPriceCache();
    cache.set('key-a', makePriceInfo());
    cache.set('key-b', makePriceInfo());
    cache.get('key-a');

    cache.clear();

    const stats = cache.getStats();
    expect(stats.hits).toBe(0);
    expect(stats.misses).toBe(0);
    expect(stats.staleHits).toBe(0);
    expect(stats.size).toBe(0);
    expect(stats.evictions).toBe(0);
    expect(cache.get('key-a')).toBeNull();
  });
});

describe('buildCacheKey', () => {
  it('should lowercase EVM addresses', () => {
    expect(buildCacheKey('ethereum', '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48'))
      .toBe('ethereum:0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48');
  });

  it('should preserve Solana addresses as-is', () => {
    expect(buildCacheKey('solana', 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'))
      .toBe('solana:EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
  });
});
