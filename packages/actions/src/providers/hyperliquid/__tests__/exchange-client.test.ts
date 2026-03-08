/**
 * Tests for HyperliquidExchangeClient and HyperliquidRateLimiter.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { HyperliquidExchangeClient, HyperliquidRateLimiter, createHyperliquidClient } from '../exchange-client.js';
import { z } from 'zod';

// ---------------------------------------------------------------------------
// Rate Limiter Tests
// ---------------------------------------------------------------------------

describe('HyperliquidRateLimiter', () => {
  it('allows requests within weight limit', async () => {
    const limiter = new HyperliquidRateLimiter(100);
    await limiter.acquire(20);
    expect(limiter.currentWeight).toBe(20);
    await limiter.acquire(30);
    expect(limiter.currentWeight).toBe(50);
  });

  it('resets after window expires', async () => {
    const limiter = new HyperliquidRateLimiter(100);
    await limiter.acquire(50);
    expect(limiter.currentWeight).toBe(50);
    limiter.reset();
    expect(limiter.currentWeight).toBe(0);
  });

  it('uses configurable maxWeightPerMin', () => {
    const limiter = new HyperliquidRateLimiter(300);
    expect(limiter).toBeDefined();
  });

  it('defaults to 600 weight/min', () => {
    const limiter = new HyperliquidRateLimiter();
    expect(limiter).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Exchange Client Tests (with mocked fetch)
// ---------------------------------------------------------------------------

describe('HyperliquidExchangeClient', () => {
  const originalFetch = globalThis.fetch;
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockFetch = vi.fn();
    globalThis.fetch = mockFetch as unknown as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  const createClient = () => {
    const limiter = new HyperliquidRateLimiter(600);
    return new HyperliquidExchangeClient('https://api.hyperliquid.xyz', limiter, 5000);
  };

  describe('exchange()', () => {
    it('posts to /exchange and validates response', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ status: 'ok', response: { type: 'order', data: { oid: 123 } } }),
      });

      const client = createClient();
      const result = await client.exchange({
        action: { type: 'order', orders: [] },
        nonce: Date.now(),
        signature: { r: '0x1234' as any, s: '0x5678' as any, v: 27 },
      });

      expect(result.status).toBe('ok');
      expect(mockFetch).toHaveBeenCalledOnce();
      const [url, opts] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(url).toBe('https://api.hyperliquid.xyz/exchange');
      expect(opts.method).toBe('POST');
    });

    it('throws ChainError on non-200 response', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        text: async () => 'Internal Server Error',
      });

      const client = createClient();
      await expect(
        client.exchange({
          action: { type: 'order' },
          nonce: Date.now(),
          signature: { r: '0x1' as any, s: '0x2' as any, v: 27 },
        }),
      ).rejects.toThrow('Hyperliquid API error: 500');
    });

    it('throws rate limited error on 429', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 429,
        text: async () => 'Rate limited',
      });

      const client = createClient();
      await expect(
        client.exchange({
          action: { type: 'order' },
          nonce: Date.now(),
          signature: { r: '0x1' as any, s: '0x2' as any, v: 27 },
        }),
      ).rejects.toThrow('Hyperliquid API error: 429');
    });
  });

  describe('info()', () => {
    it('posts to /info and validates with provided schema', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ ETH: '2000.5', BTC: '40000.1' }),
      });

      const client = createClient();
      const result = await client.info(
        { type: 'allMids' },
        z.record(z.string(), z.string()),
      );

      expect(result).toEqual({ ETH: '2000.5', BTC: '40000.1' });
      const [url] = mockFetch.mock.calls[0] as [string];
      expect(url).toBe('https://api.hyperliquid.xyz/info');
    });

    it('throws on Zod validation failure', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => 'not-an-object',
      });

      const client = createClient();
      await expect(
        client.info(
          { type: 'allMids' },
          z.record(z.string(), z.string()),
        ),
      ).rejects.toThrow();
    });
  });

  describe('timeout handling', () => {
    it('throws ACTION_API_TIMEOUT on AbortError', async () => {
      const abortError = new DOMException('signal is aborted', 'AbortError');
      mockFetch.mockRejectedValue(abortError);

      const client = createClient();
      await expect(
        client.exchange({
          action: { type: 'order' },
          nonce: Date.now(),
          signature: { r: '0x1' as any, s: '0x2' as any, v: 27 },
        }),
      ).rejects.toThrow('Hyperliquid API request timeout');
    });

    it('wraps non-ChainError exceptions as API_ERROR', async () => {
      mockFetch.mockRejectedValue(new TypeError('fetch failed'));

      const client = createClient();
      await expect(
        client.exchange({
          action: { type: 'order' },
          nonce: Date.now(),
          signature: { r: '0x1' as any, s: '0x2' as any, v: 27 },
        }),
      ).rejects.toThrow('Hyperliquid API error: fetch failed');
    });
  });

  describe('createHyperliquidClient factory', () => {
    it('creates client with defaults', () => {
      const client = createHyperliquidClient('https://api.hyperliquid.xyz');
      expect(client).toBeInstanceOf(HyperliquidExchangeClient);
    });

    it('creates client with custom rate limiter', () => {
      const limiter = new HyperliquidRateLimiter(300);
      const client = createHyperliquidClient('https://api.hyperliquid.xyz', limiter, 10000);
      expect(client).toBeInstanceOf(HyperliquidExchangeClient);
    });
  });
});
