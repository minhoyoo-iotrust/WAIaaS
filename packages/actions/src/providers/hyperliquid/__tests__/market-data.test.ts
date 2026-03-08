/**
 * Tests for HyperliquidMarketData with mocked ExchangeClient.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HyperliquidMarketData } from '../market-data.js';
import type { HyperliquidExchangeClient } from '../exchange-client.js';

// ---------------------------------------------------------------------------
// Mock ExchangeClient
// ---------------------------------------------------------------------------

function createMockClient(): HyperliquidExchangeClient {
  const info = vi.fn();
  return { info, exchange: vi.fn() } as unknown as HyperliquidExchangeClient;
}

describe('HyperliquidMarketData', () => {
  let mockClient: HyperliquidExchangeClient;
  let marketData: HyperliquidMarketData;

  beforeEach(() => {
    mockClient = createMockClient();
    marketData = new HyperliquidMarketData(mockClient);
  });

  describe('getPositions', () => {
    it('returns filtered positions (non-zero szi)', async () => {
      (mockClient.info as ReturnType<typeof vi.fn>).mockResolvedValue({
        marginSummary: { accountValue: '1000', totalNtlPos: '500', totalRawUsd: '500' },
        assetPositions: [
          { type: 'oneWay', position: { coin: 'ETH', szi: '1.5', entryPx: '2000' } },
          { type: 'oneWay', position: { coin: 'BTC', szi: '0', entryPx: null } },
        ],
      });

      const positions = await marketData.getPositions('0xabc' as any);
      expect(positions).toHaveLength(1);
      expect(positions[0]!.coin).toBe('ETH');
      expect(positions[0]!.szi).toBe('1.5');
    });
  });

  describe('getOpenOrders', () => {
    it('returns open orders from client', async () => {
      const orders = [
        { coin: 'ETH', side: 'B', limitPx: '2000', sz: '1', oid: 123 },
      ];
      (mockClient.info as ReturnType<typeof vi.fn>).mockResolvedValue(orders);

      const result = await marketData.getOpenOrders('0xabc' as any);
      expect(result).toEqual(orders);
    });
  });

  describe('getMarkets', () => {
    it('returns market universe', async () => {
      (mockClient.info as ReturnType<typeof vi.fn>).mockResolvedValue({
        universe: [
          { name: 'ETH', szDecimals: 3, maxLeverage: 50 },
          { name: 'BTC', szDecimals: 5, maxLeverage: 50 },
        ],
      });

      const markets = await marketData.getMarkets();
      expect(markets).toHaveLength(2);
      expect(markets[0]!.name).toBe('ETH');
    });
  });

  describe('getAllMidPrices', () => {
    it('returns mid prices', async () => {
      (mockClient.info as ReturnType<typeof vi.fn>).mockResolvedValue({
        ETH: '2000.5',
        BTC: '40000.1',
      });

      const prices = await marketData.getAllMidPrices();
      expect(prices.ETH).toBe('2000.5');
      expect(prices.BTC).toBe('40000.1');
    });
  });

  describe('getAccountState', () => {
    it('returns clearinghouse state', async () => {
      const state = {
        marginSummary: { accountValue: '10000', totalNtlPos: '5000', totalRawUsd: '5000' },
        assetPositions: [],
      };
      (mockClient.info as ReturnType<typeof vi.fn>).mockResolvedValue(state);

      const result = await marketData.getAccountState('0xabc' as any);
      expect(result.marginSummary.accountValue).toBe('10000');
    });
  });

  describe('getUserFills', () => {
    it('returns trade fills', async () => {
      const fills = [
        { coin: 'ETH', px: '2000', sz: '1', side: 'B', time: 1234567890 },
      ];
      (mockClient.info as ReturnType<typeof vi.fn>).mockResolvedValue(fills);

      const result = await marketData.getUserFills('0xabc' as any);
      expect(result).toHaveLength(1);
    });

    it('limits results when limit provided', async () => {
      const fills = [
        { coin: 'ETH', px: '2000', sz: '1', side: 'B', time: 1 },
        { coin: 'ETH', px: '2001', sz: '2', side: 'A', time: 2 },
        { coin: 'ETH', px: '2002', sz: '3', side: 'B', time: 3 },
      ];
      (mockClient.info as ReturnType<typeof vi.fn>).mockResolvedValue(fills);

      const result = await marketData.getUserFills('0xabc' as any, 2);
      expect(result).toHaveLength(2);
    });
  });

  describe('getFundingHistory', () => {
    it('returns funding rates', async () => {
      const rates = [
        { coin: 'ETH', fundingRate: '0.0001', time: 1234567890 },
      ];
      (mockClient.info as ReturnType<typeof vi.fn>).mockResolvedValue(rates);

      const result = await marketData.getFundingHistory('ETH', 0);
      expect(result).toHaveLength(1);
      expect(result[0]!.fundingRate).toBe('0.0001');
    });
  });

  // -------------------------------------------------------------------------
  // Spot methods (Phase 350)
  // -------------------------------------------------------------------------

  describe('getSpotMarkets', () => {
    it('returns spot market universe', async () => {
      (mockClient.info as ReturnType<typeof vi.fn>).mockResolvedValue({
        universe: [
          { name: 'PURR/USDC', tokens: [0, 1], index: 0, isCanonical: true },
          { name: 'HYPE/USDC', tokens: [2, 1], index: 1, isCanonical: true },
        ],
        tokens: [
          { name: 'PURR', szDecimals: 0, weiDecimals: 18, index: 0, tokenId: '0x01', isCanonical: true },
          { name: 'USDC', szDecimals: 2, weiDecimals: 8, index: 1, tokenId: '0x02', isCanonical: true },
          { name: 'HYPE', szDecimals: 2, weiDecimals: 18, index: 2, tokenId: '0x03', isCanonical: true },
        ],
      });

      const markets = await marketData.getSpotMarkets();
      expect(markets).toHaveLength(2);
      expect(markets[0]!.name).toBe('PURR/USDC');
      expect(markets[0]!.tokens).toEqual([0, 1]);
      expect(markets[0]!.index).toBe(0);
    });
  });

  describe('getSpotBalances', () => {
    it('returns parsed spot balances', async () => {
      (mockClient.info as ReturnType<typeof vi.fn>).mockResolvedValue({
        balances: [
          { coin: 'USDC', hold: '10.5', token: 1, total: '500.0' },
          { coin: 'HYPE', hold: '0', token: 2, total: '100.0', entryNtl: '200.0' },
        ],
      });

      const balances = await marketData.getSpotBalances('0xabc' as any);
      expect(balances).toHaveLength(2);
      expect(balances[0]!.coin).toBe('USDC');
      expect(balances[0]!.total).toBe('500.0');
      expect(balances[1]!.entryNtl).toBe('200.0');
    });
  });

  describe('getSpotMeta', () => {
    it('returns full spot metadata including tokens', async () => {
      const spotMeta = {
        universe: [
          { name: 'PURR/USDC', tokens: [0, 1], index: 0 },
        ],
        tokens: [
          { name: 'PURR', szDecimals: 0, weiDecimals: 18, index: 0, tokenId: '0x01' },
          { name: 'USDC', szDecimals: 2, weiDecimals: 8, index: 1, tokenId: '0x02' },
        ],
      };
      (mockClient.info as ReturnType<typeof vi.fn>).mockResolvedValue(spotMeta);

      const result = await marketData.getSpotMeta();
      expect(result.universe).toHaveLength(1);
      expect(result.tokens).toHaveLength(2);
      expect(result.tokens[0]!.name).toBe('PURR');
    });
  });
});
