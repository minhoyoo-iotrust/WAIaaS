/**
 * CoinGeckoForexProvider unit tests.
 *
 * Tests the CoinGecko tether vs_currencies API-based forex rate provider.
 * Uses vi.fn() to mock global fetch.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CoinGeckoForexProvider } from '../infrastructure/oracle/coingecko-forex.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mockFetchSuccess(data: unknown) {
  return vi.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve(data),
  });
}

function mockFetchError(status: number) {
  return vi.fn().mockResolvedValue({
    ok: false,
    status,
    statusText: 'Rate Limited',
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('CoinGeckoForexProvider', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.useRealTimers();
  });

  // -------------------------------------------------------------------------
  // Normal operation
  // -------------------------------------------------------------------------

  it('getRates([KRW, JPY]) -- 정상 응답 시 Map에 2개 rate 반환', async () => {
    globalThis.fetch = mockFetchSuccess({
      tether: { krw: 1450.12, jpy: 150.5 },
    }) as typeof fetch;

    const provider = new CoinGeckoForexProvider('test-api-key');
    const rates = await provider.getRates(['KRW', 'JPY']);

    expect(rates.size).toBe(2);
    expect(rates.get('KRW')).toBe(1450.12);
    expect(rates.get('JPY')).toBe(150.5);

    // Verify API call
    expect(globalThis.fetch).toHaveBeenCalledOnce();
    const callUrl = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(callUrl).toContain('ids=tether');
    expect(callUrl).toContain('vs_currencies=krw,jpy');
  });

  it('getRates -- API 키 헤더 전송 확인', async () => {
    globalThis.fetch = mockFetchSuccess({ tether: { eur: 0.93 } }) as typeof fetch;

    const provider = new CoinGeckoForexProvider('my-secret-key');
    await provider.getRates(['EUR']);

    const callOptions = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0][1] as RequestInit;
    expect(callOptions.headers).toEqual({ 'x-cg-demo-api-key': 'my-secret-key' });
  });

  // -------------------------------------------------------------------------
  // Graceful degradation
  // -------------------------------------------------------------------------

  it('API 키 없으면 빈 Map 반환 (throw하지 않음)', async () => {
    const provider = new CoinGeckoForexProvider('');
    const rates = await provider.getRates(['KRW', 'JPY']);

    expect(rates.size).toBe(0);
  });

  it('빈 currencies 배열 시 빈 Map 반환', async () => {
    const provider = new CoinGeckoForexProvider('test-key');
    const rates = await provider.getRates([]);

    expect(rates.size).toBe(0);
  });

  // -------------------------------------------------------------------------
  // Error handling
  // -------------------------------------------------------------------------

  it('HTTP 오류 시 throw', async () => {
    globalThis.fetch = mockFetchError(429) as typeof fetch;

    const provider = new CoinGeckoForexProvider('test-key');

    await expect(provider.getRates(['KRW'])).rejects.toThrow('CoinGecko forex API error: 429');
  });

  // -------------------------------------------------------------------------
  // Partial responses
  // -------------------------------------------------------------------------

  it('일부 통화만 응답에 포함된 경우 해당 통화만 반환', async () => {
    globalThis.fetch = mockFetchSuccess({
      tether: { krw: 1450, /* jpy missing */ },
    }) as typeof fetch;

    const provider = new CoinGeckoForexProvider('test-key');
    const rates = await provider.getRates(['KRW', 'JPY']);

    expect(rates.size).toBe(1);
    expect(rates.get('KRW')).toBe(1450);
    expect(rates.has('JPY')).toBe(false);
  });

  it('tether 데이터 없는 응답 시 빈 Map', async () => {
    globalThis.fetch = mockFetchSuccess({}) as typeof fetch;

    const provider = new CoinGeckoForexProvider('test-key');
    const rates = await provider.getRates(['KRW']);

    expect(rates.size).toBe(0);
  });

  it('rate가 0이거나 음수인 경우 무시', async () => {
    globalThis.fetch = mockFetchSuccess({
      tether: { krw: 0, jpy: -1, eur: 0.93 },
    }) as typeof fetch;

    const provider = new CoinGeckoForexProvider('test-key');
    const rates = await provider.getRates(['KRW', 'JPY', 'EUR']);

    expect(rates.size).toBe(1);
    expect(rates.get('EUR')).toBe(0.93);
  });
});
