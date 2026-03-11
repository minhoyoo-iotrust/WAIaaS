/**
 * Tests for PolymarketOrderbookService: orderbook, price, midpoint queries.
 *
 * Plan 371-04 Task 2: OrderbookService tests.
 */
import { describe, it, expect, vi } from 'vitest';
import { PolymarketOrderbookService } from '../orderbook-service.js';
import type { PolymarketClobClient } from '../clob-client.js';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

function createMockClobClient(overrides?: Partial<PolymarketClobClient>) {
  return {
    getOrderbook: vi.fn().mockResolvedValue({
      market: 'token-123',
      asset_id: 'token-123',
      bids: [
        { price: '0.60', size: '500' },
        { price: '0.55', size: '300' },
      ],
      asks: [
        { price: '0.65', size: '400' },
        { price: '0.70', size: '200' },
      ],
      hash: 'abc123',
      timestamp: '1700000000',
    }),
    getPrice: vi.fn().mockResolvedValue({ price: '0.62' }),
    getMidpoint: vi.fn().mockResolvedValue({ mid: '0.625' }),
    ...overrides,
  } as unknown as PolymarketClobClient;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('PolymarketOrderbookService', () => {
  describe('getOrderbook', () => {
    it('returns structured orderbook with bids and asks', async () => {
      const client = createMockClobClient();
      const service = new PolymarketOrderbookService(client);

      const result = await service.getOrderbook('token-123');

      expect(result.bids).toHaveLength(2);
      expect(result.asks).toHaveLength(2);
      expect(result.bids[0]).toEqual({ price: '0.60', size: '500' });
      expect(result.asks[0]).toEqual({ price: '0.65', size: '400' });
    });

    it('calculates spread as best_ask - best_bid', async () => {
      const client = createMockClobClient();
      const service = new PolymarketOrderbookService(client);

      const result = await service.getOrderbook('token-123');

      // 0.65 - 0.60 = 0.05
      expect(parseFloat(result.spread)).toBeCloseTo(0.05);
    });

    it('calculates midpoint as (best_bid + best_ask) / 2', async () => {
      const client = createMockClobClient();
      const service = new PolymarketOrderbookService(client);

      const result = await service.getOrderbook('token-123');

      // (0.60 + 0.65) / 2 = 0.625
      expect(parseFloat(result.midpoint)).toBeCloseTo(0.625);
    });

    it('calculates bid and ask depth', async () => {
      const client = createMockClobClient();
      const service = new PolymarketOrderbookService(client);

      const result = await service.getOrderbook('token-123');

      // bid depth: 500 + 300 = 800
      expect(parseFloat(result.depth.bidDepth)).toBeCloseTo(800);
      // ask depth: 400 + 200 = 600
      expect(parseFloat(result.depth.askDepth)).toBeCloseTo(600);
    });

    it('handles empty orderbook gracefully', async () => {
      const client = createMockClobClient({
        getOrderbook: vi.fn().mockResolvedValue({
          market: 'token-empty',
          asset_id: 'token-empty',
          bids: [],
          asks: [],
          hash: '',
          timestamp: '0',
        }),
      } as any);
      const service = new PolymarketOrderbookService(client);

      const result = await service.getOrderbook('token-empty');

      expect(result.bids).toHaveLength(0);
      expect(result.asks).toHaveLength(0);
      expect(result.spread).toBe('0');
      expect(result.midpoint).toBe('0');
      expect(result.depth.bidDepth).toBe('0');
      expect(result.depth.askDepth).toBe('0');
    });

    it('handles one-sided orderbook (bids only)', async () => {
      const client = createMockClobClient({
        getOrderbook: vi.fn().mockResolvedValue({
          market: 'token-bids',
          asset_id: 'token-bids',
          bids: [{ price: '0.50', size: '100' }],
          asks: [],
          hash: '',
          timestamp: '0',
        }),
      } as any);
      const service = new PolymarketOrderbookService(client);

      const result = await service.getOrderbook('token-bids');

      expect(result.bids).toHaveLength(1);
      expect(result.asks).toHaveLength(0);
      expect(result.spread).toBe('0');
      expect(result.midpoint).toBe('0');
    });
  });

  describe('getPrice', () => {
    it('returns price string from CLOB', async () => {
      const client = createMockClobClient();
      const service = new PolymarketOrderbookService(client);

      const price = await service.getPrice('token-123');
      expect(price).toBe('0.62');
      expect(client.getPrice).toHaveBeenCalledWith('token-123');
    });
  });

  describe('getMidpoint', () => {
    it('returns midpoint string from CLOB', async () => {
      const client = createMockClobClient();
      const service = new PolymarketOrderbookService(client);

      const midpoint = await service.getMidpoint('token-123');
      expect(midpoint).toBe('0.625');
      expect(client.getMidpoint).toHaveBeenCalledWith('token-123');
    });
  });
});
