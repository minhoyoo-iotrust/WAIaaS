/**
 * ForexRateService unit tests.
 *
 * Tests IForexRateService implementation with mocked CoinGeckoForexProvider
 * and real InMemoryPriceCache instance.
 *
 * Key behaviors:
 * - USD -> rate 1 without API call
 * - Cache hit -> skip provider
 * - Provider failure -> null (graceful fallback)
 * - Batch getRates with partial cache
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { CurrencyCode } from '@waiaas/core';
import { InMemoryPriceCache } from '../infrastructure/oracle/price-cache.js';
import { ForexRateService } from '../infrastructure/oracle/forex-rate-service.js';
import type { CoinGeckoForexProvider } from '../infrastructure/oracle/coingecko-forex.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createMockProvider(overrides?: Partial<CoinGeckoForexProvider>): CoinGeckoForexProvider {
  return {
    getRates: vi.fn().mockResolvedValue(new Map()),
    ...overrides,
  } as unknown as CoinGeckoForexProvider;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ForexRateService', () => {
  let cache: InMemoryPriceCache;

  beforeEach(() => {
    // Short TTL (100ms) for test convenience, stale max 5s
    cache = new InMemoryPriceCache(100, 5000, 128);
  });

  // -------------------------------------------------------------------------
  // getRate()
  // -------------------------------------------------------------------------

  describe('getRate()', () => {
    it('USD -> rate 1 즉시 반환 (provider 미호출)', async () => {
      const provider = createMockProvider();
      const service = new ForexRateService({ forexProvider: provider, cache });

      const result = await service.getRate('USD');

      expect(result).not.toBeNull();
      expect(result!.from).toBe('USD');
      expect(result!.to).toBe('USD');
      expect(result!.rate).toBe(1);
      expect(result!.source).toBe('cache');
      expect(provider.getRates).not.toHaveBeenCalled();
    });

    it('KRW -- provider 정상 -> ForexRate 반환', async () => {
      const provider = createMockProvider({
        getRates: vi.fn().mockResolvedValue(new Map([['KRW', 1450.12]])),
      });
      const service = new ForexRateService({ forexProvider: provider, cache });

      const result = await service.getRate('KRW');

      expect(result).not.toBeNull();
      expect(result!.from).toBe('USD');
      expect(result!.to).toBe('KRW');
      expect(result!.rate).toBe(1450.12);
      expect(result!.source).toBe('coingecko');
      expect(result!.fetchedAt).toBeGreaterThan(0);
      expect(result!.expiresAt).toBeGreaterThan(result!.fetchedAt);
    });

    it('캐시 히트 시 provider 미호출', async () => {
      const provider = createMockProvider({
        getRates: vi.fn().mockResolvedValue(new Map([['KRW', 1450]])),
      });
      const service = new ForexRateService({ forexProvider: provider, cache });

      // First call: populates cache
      const first = await service.getRate('KRW');
      expect(first).not.toBeNull();
      expect(provider.getRates).toHaveBeenCalledOnce();

      // Second call: should hit cache
      const second = await service.getRate('KRW');
      expect(second).not.toBeNull();
      expect(second!.rate).toBe(1450);
      expect(second!.source).toBe('cache');
      // Still only 1 call
      expect(provider.getRates).toHaveBeenCalledOnce();
    });

    it('provider 실패 시 null 반환 (graceful fallback)', async () => {
      const provider = createMockProvider({
        getRates: vi.fn().mockRejectedValue(new Error('CoinGecko 429')),
      });
      const service = new ForexRateService({ forexProvider: provider, cache });

      const result = await service.getRate('KRW');

      expect(result).toBeNull();
    });

    it('provider가 해당 통화를 반환하지 않으면 null', async () => {
      const provider = createMockProvider({
        getRates: vi.fn().mockResolvedValue(new Map()), // empty
      });
      const service = new ForexRateService({ forexProvider: provider, cache });

      const result = await service.getRate('KRW');

      expect(result).toBeNull();
    });

    it('캐시 TTL 만료 후 재조회', async () => {
      const provider = createMockProvider({
        getRates: vi.fn()
          .mockResolvedValueOnce(new Map([['KRW', 1450]]))
          .mockResolvedValueOnce(new Map([['KRW', 1455]])),
      });
      const service = new ForexRateService({ forexProvider: provider, cache });

      // First call
      const first = await service.getRate('KRW');
      expect(first!.rate).toBe(1450);

      // Wait for TTL to expire (cache TTL = 100ms)
      await new Promise((r) => setTimeout(r, 150));

      // Second call after expiry
      const second = await service.getRate('KRW');
      expect(second!.rate).toBe(1455);
      expect(provider.getRates).toHaveBeenCalledTimes(2);
    });
  });

  // -------------------------------------------------------------------------
  // getRates()
  // -------------------------------------------------------------------------

  describe('getRates()', () => {
    it('여러 통화 배치 조회', async () => {
      const provider = createMockProvider({
        getRates: vi.fn().mockResolvedValue(
          new Map<string, number>([
            ['KRW', 1450],
            ['JPY', 150],
            ['EUR', 0.93],
          ]),
        ),
      });
      const service = new ForexRateService({ forexProvider: provider, cache });

      const currencies: CurrencyCode[] = ['KRW', 'JPY', 'EUR'];
      const result = await service.getRates(currencies);

      expect(result.size).toBe(3);
      expect(result.get('KRW')!.rate).toBe(1450);
      expect(result.get('JPY')!.rate).toBe(150);
      expect(result.get('EUR')!.rate).toBe(0.93);
    });

    it('USD 포함 시 provider 호출에 USD 제외', async () => {
      const provider = createMockProvider({
        getRates: vi.fn().mockResolvedValue(new Map([['KRW', 1450]])),
      });
      const service = new ForexRateService({ forexProvider: provider, cache });

      const result = await service.getRates(['USD', 'KRW'] as CurrencyCode[]);

      expect(result.size).toBe(2);
      expect(result.get('USD')!.rate).toBe(1);
      expect(result.get('KRW')!.rate).toBe(1450);

      // Provider should be called with only KRW (not USD)
      expect(provider.getRates).toHaveBeenCalledWith(['KRW']);
    });

    it('캐시 히트 통화는 provider 호출에서 제외', async () => {
      const provider = createMockProvider({
        getRates: vi.fn()
          .mockResolvedValueOnce(new Map([['KRW', 1450]]))
          .mockResolvedValueOnce(new Map([['JPY', 150]])),
      });
      const service = new ForexRateService({ forexProvider: provider, cache });

      // Populate KRW cache
      await service.getRate('KRW');

      // Batch query: KRW (cached) + JPY (fresh)
      const result = await service.getRates(['KRW', 'JPY'] as CurrencyCode[]);

      expect(result.size).toBe(2);
      expect(result.get('KRW')!.source).toBe('cache');
      expect(result.get('JPY')!.source).toBe('coingecko');
      // Second call should only fetch JPY
      expect(provider.getRates).toHaveBeenLastCalledWith(['JPY']);
    });

    it('batch fetch 실패 시 캐시 결과만 반환', async () => {
      const provider = createMockProvider({
        getRates: vi.fn()
          .mockResolvedValueOnce(new Map([['KRW', 1450]]))
          .mockRejectedValueOnce(new Error('API down')),
      });
      const service = new ForexRateService({ forexProvider: provider, cache });

      // Populate KRW cache
      await service.getRate('KRW');

      // Batch: KRW (cached) + JPY (will fail)
      const result = await service.getRates(['KRW', 'JPY'] as CurrencyCode[]);

      expect(result.size).toBe(1);
      expect(result.get('KRW')!.rate).toBe(1450);
      expect(result.has('JPY')).toBe(false);
    });
  });
});
