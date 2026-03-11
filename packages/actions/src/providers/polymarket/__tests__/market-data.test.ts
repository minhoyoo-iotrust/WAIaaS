/**
 * Tests for PolymarketMarketData caching service.
 *
 * @see design doc 80, Section 12
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PolymarketMarketData } from '../market-data.js';
import type { PolymarketGammaClient } from '../gamma-client.js';
import type { GammaMarket } from '../market-schemas.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const BINARY_MARKET: GammaMarket = {
  condition_id: '0xabc123',
  question: 'Will it rain?',
  description: '',
  market_slug: 'rain',
  active: true,
  closed: false,
  neg_risk: false,
  tokens: [
    { token_id: '111', outcome: 'Yes', price: '0.65' },
    { token_id: '222', outcome: 'No', price: '0.35' },
  ],
  volume: '1000',
  liquidity: '500',
  end_date_iso: '2026-12-31T00:00:00Z',
  image: '',
  icon: '',
  category: 'weather',
  resolution_source: '',
};

const NEG_RISK_MARKET: GammaMarket = {
  ...BINARY_MARKET,
  condition_id: '0xdef456',
  question: 'Who wins?',
  neg_risk: true,
  tokens: [
    { token_id: '333', outcome: 'A', price: '0.50' },
    { token_id: '444', outcome: 'B', price: '0.30' },
    { token_id: '555', outcome: 'C', price: '0.20' },
  ],
};

const RESOLVED_MARKET: GammaMarket = {
  ...BINARY_MARKET,
  condition_id: '0xresolved',
  closed: true,
  active: false,
  tokens: [
    { token_id: '666', outcome: 'Yes', price: '1', winner: true },
    { token_id: '777', outcome: 'No', price: '0', winner: false },
  ],
};

// ---------------------------------------------------------------------------
// Mock GammaClient
// ---------------------------------------------------------------------------

function createMockClient() {
  const getMarketsFn = vi.fn<() => Promise<GammaMarket[]>>().mockResolvedValue([BINARY_MARKET, NEG_RISK_MARKET]);
  const getMarketFn = vi.fn<(cid: string) => Promise<GammaMarket>>().mockImplementation((conditionId: string) => {
    if (conditionId === '0xabc123') return Promise.resolve(BINARY_MARKET);
    if (conditionId === '0xdef456') return Promise.resolve(NEG_RISK_MARKET);
    if (conditionId === '0xresolved') return Promise.resolve(RESOLVED_MARKET);
    return Promise.reject(new Error('Not found'));
  });
  const getEventsFn = vi.fn().mockResolvedValue([]);
  const searchMarketsFn = vi.fn<(q: string, l?: number) => Promise<GammaMarket[]>>().mockResolvedValue([BINARY_MARKET]);

  const client = {
    getMarkets: getMarketsFn,
    getMarket: getMarketFn,
    getEvents: getEventsFn,
    searchMarkets: searchMarketsFn,
  } as unknown as PolymarketGammaClient;

  return { client, getMarketsFn, getMarketFn, getEventsFn, searchMarketsFn };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('PolymarketMarketData', () => {
  let mock: ReturnType<typeof createMockClient>;
  let marketData: PolymarketMarketData;

  beforeEach(() => {
    mock = createMockClient();
    // Use very short TTL for testing (100ms)
    marketData = new PolymarketMarketData(mock.client, 100);
  });

  describe('cache behavior', () => {
    it('returns cached data on second call within TTL', async () => {
      await marketData.getMarkets();
      await marketData.getMarkets();

      expect(mock.getMarketsFn).toHaveBeenCalledTimes(1);
    });

    it('refreshes after TTL expires', async () => {
      await marketData.getMarkets();

      // Wait for cache to expire
      await new Promise((r) => setTimeout(r, 150));

      await marketData.getMarkets();

      expect(mock.getMarketsFn).toHaveBeenCalledTimes(2);
    });

    it('serves stale cache when GammaClient throws', async () => {
      // First call succeeds and populates cache
      await marketData.getMarket('0xabc123');

      // Wait for cache to expire
      await new Promise((r) => setTimeout(r, 150));

      // Make client fail
      mock.getMarketFn.mockRejectedValueOnce(new Error('API down'));

      // Should return stale data
      const result = await marketData.getMarket('0xabc123');
      expect(result.condition_id).toBe('0xabc123');
    });

    it('throws when GammaClient fails and no cache exists', async () => {
      mock.getMarketFn.mockRejectedValueOnce(new Error('API down'));

      await expect(marketData.getMarket('0xnocache')).rejects.toThrow('API down');
    });
  });

  describe('searchMarkets', () => {
    it('always calls GammaClient (no cache)', async () => {
      await marketData.searchMarkets('election');
      await marketData.searchMarkets('election');

      expect(mock.searchMarketsFn).toHaveBeenCalledTimes(2);
    });

    it('passes query and limit to client', async () => {
      await marketData.searchMarkets('rain', 5);

      expect(mock.searchMarketsFn).toHaveBeenCalledWith('rain', 5);
    });
  });

  describe('isNegRisk', () => {
    it('returns false for binary market', async () => {
      const result = await marketData.isNegRisk('0xabc123');
      expect(result).toBe(false);
    });

    it('returns true for neg_risk market', async () => {
      const result = await marketData.isNegRisk('0xdef456');
      expect(result).toBe(true);
    });
  });

  describe('getResolutionStatus', () => {
    it('returns resolved=false for open market', async () => {
      const status = await marketData.getResolutionStatus('0xabc123');
      expect(status.resolved).toBe(false);
      expect(status.winningOutcome).toBeUndefined();
    });

    it('returns resolved=true with winning outcome for closed market', async () => {
      const status = await marketData.getResolutionStatus('0xresolved');
      expect(status.resolved).toBe(true);
      expect(status.winningOutcome).toBe('Yes');
    });
  });

  describe('getMarket', () => {
    it('returns market detail by conditionId', async () => {
      const market = await marketData.getMarket('0xabc123');
      expect(market.question).toBe('Will it rain?');
      expect(market.tokens).toHaveLength(2);
    });
  });

  describe('getEvents', () => {
    it('delegates to GammaClient with filter', async () => {
      await marketData.getEvents({ limit: 5 });

      expect(mock.getEventsFn).toHaveBeenCalledWith({ limit: 5 });
    });
  });

  describe('clearCache', () => {
    it('clears all cached data', async () => {
      await marketData.getMarkets();
      marketData.clearCache();
      await marketData.getMarkets();

      expect(mock.getMarketsFn).toHaveBeenCalledTimes(2);
    });
  });
});
