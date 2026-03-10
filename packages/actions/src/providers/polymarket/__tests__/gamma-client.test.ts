/**
 * Tests for PolymarketGammaClient.
 *
 * @see design doc 80, Section 2.1
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PolymarketGammaClient } from '../gamma-client.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const MARKET_FIXTURE = {
  condition_id: '0xabc123',
  question: 'Will it rain tomorrow?',
  description: 'Weather prediction market',
  market_slug: 'will-it-rain',
  active: true,
  closed: false,
  neg_risk: false,
  tokens: [
    { token_id: '111', outcome: 'Yes', price: '0.65' },
    { token_id: '222', outcome: 'No', price: '0.35' },
  ],
  volume: '50000',
  liquidity: '25000',
  end_date_iso: '2026-12-31T00:00:00Z',
  image: '',
  icon: '',
  category: 'weather',
  resolution_source: 'noaa.gov',
};

const NEG_RISK_MARKET = {
  ...MARKET_FIXTURE,
  condition_id: '0xdef456',
  question: 'Who wins the election?',
  neg_risk: true,
  tokens: [
    { token_id: '333', outcome: 'Candidate A', price: '0.40' },
    { token_id: '444', outcome: 'Candidate B', price: '0.35' },
    { token_id: '555', outcome: 'Candidate C', price: '0.25' },
  ],
};

const EVENT_FIXTURE = {
  id: 'evt-1',
  title: 'US Elections 2024',
  slug: 'us-elections-2024',
  description: 'All election markets',
  category: 'politics',
  markets: [MARKET_FIXTURE, NEG_RISK_MARKET],
  neg_risk: true,
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mockFetch(data: unknown, status = 200) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(data),
    text: () => Promise.resolve(JSON.stringify(data)),
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('PolymarketGammaClient', () => {
  const BASE_URL = 'https://gamma-api.polymarket.com';
  let client: PolymarketGammaClient;
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    client = new PolymarketGammaClient(BASE_URL, 5000);
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  describe('getMarkets', () => {
    it('returns parsed market array', async () => {
      globalThis.fetch = mockFetch([MARKET_FIXTURE]) as unknown as typeof fetch;

      const markets = await client.getMarkets();

      expect(markets).toHaveLength(1);
      expect(markets[0]!.condition_id).toBe('0xabc123');
      expect(markets[0]!.question).toBe('Will it rain tomorrow?');
      expect(markets[0]!.tokens).toHaveLength(2);
    });

    it('appends filter params as query string', async () => {
      const fn = mockFetch([]);
      globalThis.fetch = fn as unknown as typeof fetch;

      await client.getMarkets({ active: true, limit: 20, category: 'politics' });

      const url = fn.mock.calls[0]![0] as string;
      expect(url).toContain('active=true');
      expect(url).toContain('limit=20');
      expect(url).toContain('category=politics');
    });

    it('handles empty response', async () => {
      globalThis.fetch = mockFetch([]) as unknown as typeof fetch;
      const markets = await client.getMarkets();
      expect(markets).toHaveLength(0);
    });
  });

  describe('getMarket', () => {
    it('returns parsed single market', async () => {
      globalThis.fetch = mockFetch(MARKET_FIXTURE) as unknown as typeof fetch;

      const market = await client.getMarket('0xabc123');

      expect(market.condition_id).toBe('0xabc123');
      expect(market.neg_risk).toBe(false);
    });

    it('fetches correct URL with conditionId', async () => {
      const fn = mockFetch(MARKET_FIXTURE);
      globalThis.fetch = fn as unknown as typeof fetch;

      await client.getMarket('0xdef456');

      const url = fn.mock.calls[0]![0] as string;
      expect(url).toBe(`${BASE_URL}/markets/0xdef456`);
    });
  });

  describe('getEvents', () => {
    it('returns parsed event array with nested markets', async () => {
      globalThis.fetch = mockFetch([EVENT_FIXTURE]) as unknown as typeof fetch;

      const events = await client.getEvents({ limit: 10 });

      expect(events).toHaveLength(1);
      expect(events[0]!.title).toBe('US Elections 2024');
      expect(events[0]!.markets).toHaveLength(2);
    });

    it('appends pagination params', async () => {
      const fn = mockFetch([]);
      globalThis.fetch = fn as unknown as typeof fetch;

      await client.getEvents({ limit: 5, offset: 10 });

      const url = fn.mock.calls[0]![0] as string;
      expect(url).toContain('limit=5');
      expect(url).toContain('offset=10');
    });
  });

  describe('searchMarkets', () => {
    it('passes query as _q param', async () => {
      const fn = mockFetch([MARKET_FIXTURE]);
      globalThis.fetch = fn as unknown as typeof fetch;

      const results = await client.searchMarkets('election', 5);

      const url = fn.mock.calls[0]![0] as string;
      expect(url).toContain('_q=election');
      expect(url).toContain('limit=5');
      expect(results).toHaveLength(1);
    });
  });

  describe('error handling', () => {
    it('throws ChainError on HTTP 4xx/5xx', async () => {
      globalThis.fetch = mockFetch('Not Found', 404) as unknown as typeof fetch;

      await expect(client.getMarkets()).rejects.toThrow(/Gamma API HTTP 404/);
    });

    it('throws ChainError on fetch failure', async () => {
      globalThis.fetch = vi.fn().mockRejectedValue(new Error('Network error')) as unknown as typeof fetch;

      await expect(client.getMarkets()).rejects.toThrow(/Gamma API request failed.*Network error/);
    });

    it('throws ChainError on timeout', async () => {
      // Simulate timeout by rejecting with AbortError
      globalThis.fetch = vi.fn().mockRejectedValue(
        new DOMException('The operation was aborted', 'AbortError'),
      ) as unknown as typeof fetch;

      await expect(client.getMarkets()).rejects.toThrow(/Gamma API request failed/);
    });
  });

  describe('neg_risk markets', () => {
    it('parses neg_risk flag correctly', async () => {
      globalThis.fetch = mockFetch([MARKET_FIXTURE, NEG_RISK_MARKET]) as unknown as typeof fetch;

      const markets = await client.getMarkets();

      expect(markets[0]!.neg_risk).toBe(false);
      expect(markets[1]!.neg_risk).toBe(true);
      expect(markets[1]!.tokens).toHaveLength(3);
    });
  });
});
