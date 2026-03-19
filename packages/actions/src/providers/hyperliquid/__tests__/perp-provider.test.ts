/**
 * Tests for HyperliquidPerpProvider.
 *
 * Verifies all 7 actions, IPerpProvider queries, and getSpendingAmount.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HyperliquidPerpProvider } from '../perp-provider.js';
import type { HyperliquidExchangeClient } from '../exchange-client.js';
import type { HyperliquidMarketData } from '../market-data.js';
import type { ActionContext, PositionQueryContext } from '@waiaas/core';

function makeEvmCtx(walletId: string = 'wallet-001', chain: 'ethereum' | 'solana' = 'ethereum'): PositionQueryContext {
  return { walletId, walletAddress: `0x${walletId}`, chain, networks: chain === 'ethereum' ? ['ethereum-mainnet'] : ['solana-mainnet'], environment: 'mainnet', rpcUrls: {} };
}

// ---------------------------------------------------------------------------
// Mock factories
// ---------------------------------------------------------------------------

function createMockClient() {
  return {
    exchange: vi.fn().mockResolvedValue({
      status: 'ok',
      response: { type: 'order', data: { statuses: [{ resting: { oid: 42 } }] } },
    }),
    info: vi.fn(),
  } as unknown as HyperliquidExchangeClient;
}

function createMockMarketData() {
  return {
    getMarkets: vi.fn().mockResolvedValue([
      { name: 'ETH', szDecimals: 3, maxLeverage: 50 },
      { name: 'BTC', szDecimals: 5, maxLeverage: 50 },
    ]),
    getAllMidPrices: vi.fn().mockResolvedValue({ ETH: '2000', BTC: '40000' }),
    getPositions: vi.fn().mockResolvedValue([
      {
        coin: 'ETH',
        szi: '1.5',
        entryPx: '2000',
        leverage: { type: 'cross', value: 10 },
        unrealizedPnl: '50',
        marginUsed: '300',
        liquidationPx: '1800',
      },
    ]),
    getOpenOrders: vi.fn().mockResolvedValue([
      { coin: 'ETH', side: 'B', limitPx: '1900', sz: '0.5', oid: 123 },
      { coin: 'ETH', side: 'A', limitPx: '2100', sz: '0.3', oid: 456 },
    ]),
    getAccountState: vi.fn().mockResolvedValue({
      marginSummary: {
        accountValue: '10000',
        totalNtlPos: '5000',
        totalRawUsd: '5000',
        totalMarginUsed: '3000',
      },
      assetPositions: [],
    }),
    getFundingHistory: vi.fn().mockResolvedValue([]),
    getUserFills: vi.fn().mockResolvedValue([]),
    getSubAccounts: vi.fn().mockResolvedValue([]),
    getSpotState: vi.fn().mockResolvedValue({}),
  } as unknown as HyperliquidMarketData;
}

const TEST_PRIVATE_KEY = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';

function createContext(): ActionContext {
  return {
    walletAddress: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
    chain: 'ethereum',
    walletId: 'wallet-001',
    sessionId: 'session-001',
    privateKey: TEST_PRIVATE_KEY,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('HyperliquidPerpProvider', () => {
  let client: ReturnType<typeof createMockClient>;
  let marketData: ReturnType<typeof createMockMarketData>;
  let provider: HyperliquidPerpProvider;

  beforeEach(() => {
    client = createMockClient();
    marketData = createMockMarketData();
    provider = new HyperliquidPerpProvider(
      client as unknown as HyperliquidExchangeClient,
      marketData as unknown as HyperliquidMarketData,
      true, // mainnet
    );
  });

  // -------------------------------------------------------------------------
  // Metadata
  // -------------------------------------------------------------------------

  describe('metadata', () => {
    it('has correct name and requiresSigningKey', () => {
      expect(provider.metadata.name).toBe('hyperliquid_perp');
      expect(provider.metadata.requiresSigningKey).toBe(true);
      expect(provider.metadata.mcpExpose).toBe(true);
      expect(provider.metadata.chains).toContain('ethereum');
    });

    it('exposes 7 actions', () => {
      expect(provider.actions).toHaveLength(7);
      const names = provider.actions.map((a) => a.name);
      expect(names).toContain('hl_open_position');
      expect(names).toContain('hl_close_position');
      expect(names).toContain('hl_place_order');
      expect(names).toContain('hl_cancel_order');
      expect(names).toContain('hl_set_leverage');
      expect(names).toContain('hl_set_margin_mode');
      expect(names).toContain('hl_transfer_usdc');
    });

    it('has correct risk levels per HDESIGN-07', () => {
      const actionMap = new Map(provider.actions.map((a) => [a.name, a]));
      expect(actionMap.get('hl_open_position')?.riskLevel).toBe('high');
      expect(actionMap.get('hl_open_position')?.defaultTier).toBe('APPROVAL');
      expect(actionMap.get('hl_close_position')?.riskLevel).toBe('medium');
      expect(actionMap.get('hl_close_position')?.defaultTier).toBe('DELAY');
      expect(actionMap.get('hl_place_order')?.riskLevel).toBe('high');
      expect(actionMap.get('hl_cancel_order')?.riskLevel).toBe('low');
      expect(actionMap.get('hl_cancel_order')?.defaultTier).toBe('INSTANT');
      expect(actionMap.get('hl_set_leverage')?.defaultTier).toBe('DELAY');
      expect(actionMap.get('hl_set_margin_mode')?.defaultTier).toBe('DELAY');
      expect(actionMap.get('hl_transfer_usdc')?.defaultTier).toBe('DELAY');
    });
  });

  // -------------------------------------------------------------------------
  // resolve() - hl_open_position
  // -------------------------------------------------------------------------

  describe('hl_open_position', () => {
    it('resolves market order with ApiDirectResult', async () => {
      const result = await provider.resolve('hl_open_position', {
        market: 'ETH',
        side: 'BUY',
        size: '1.0',
        orderType: 'MARKET',
      }, createContext());

      expect(result.__apiDirect).toBe(true);
      expect(result.provider).toBe('hyperliquid_perp');
      expect(result.action).toBe('hl_open_position');
      expect(result.status).toBe('success');
      expect(result.metadata?.market).toBe('ETH');
      expect(result.metadata?.side).toBe('BUY');
      expect(result.metadata?.size).toBe('1.0');
      expect((client as any).exchange).toHaveBeenCalledOnce();
    });

    it('resolves limit order with price', async () => {
      const result = await provider.resolve('hl_open_position', {
        market: 'ETH',
        side: 'BUY',
        size: '1.0',
        price: '2000',
        orderType: 'LIMIT',
        tif: 'GTC',
      }, createContext());

      expect(result.__apiDirect).toBe(true);
      expect(result.metadata?.price).toBe('2000');
    });

    it('throws without privateKey', async () => {
      const ctx = createContext();
      delete (ctx as any).privateKey;

      await expect(
        provider.resolve('hl_open_position', {
          market: 'ETH',
          side: 'BUY',
          size: '1.0',
          orderType: 'MARKET',
        }, ctx),
      ).rejects.toThrow('Private key is required');
    });

    it('throws for unknown market', async () => {
      (marketData.getMarkets as ReturnType<typeof vi.fn>).mockResolvedValue([]);

      await expect(
        provider.resolve('hl_open_position', {
          market: 'UNKNOWN',
          side: 'BUY',
          size: '1',
          orderType: 'MARKET',
        }, createContext()),
      ).rejects.toThrow('Unknown market: UNKNOWN');
    });
  });

  // -------------------------------------------------------------------------
  // resolve() - hl_close_position
  // -------------------------------------------------------------------------

  describe('hl_close_position', () => {
    it('resolves position close', async () => {
      const result = await provider.resolve('hl_close_position', {
        market: 'ETH',
      }, createContext());

      expect(result.__apiDirect).toBe(true);
      expect(result.action).toBe('hl_close_position');
      expect(result.metadata?.market).toBe('ETH');
      expect(result.metadata?.side).toBe('SELL'); // Close LONG = SELL
    });

    it('throws if no open position', async () => {
      (marketData.getPositions as ReturnType<typeof vi.fn>).mockResolvedValue([]);

      await expect(
        provider.resolve('hl_close_position', { market: 'ETH' }, createContext()),
      ).rejects.toThrow('No open position for ETH');
    });
  });

  // -------------------------------------------------------------------------
  // resolve() - hl_place_order (Stop-Loss, Take-Profit)
  // -------------------------------------------------------------------------

  describe('hl_place_order', () => {
    it('resolves stop-loss order', async () => {
      const result = await provider.resolve('hl_place_order', {
        market: 'ETH',
        side: 'SELL',
        size: '1.0',
        triggerPrice: '1800',
        orderType: 'STOP_MARKET',
      }, createContext());

      expect(result.__apiDirect).toBe(true);
      expect(result.action).toBe('hl_place_order');
      expect(result.metadata?.price).toBe('1800');
    });

    it('resolves take-profit order', async () => {
      const result = await provider.resolve('hl_place_order', {
        market: 'ETH',
        side: 'SELL',
        size: '1.0',
        triggerPrice: '2200',
        orderType: 'TAKE_PROFIT',
      }, createContext());

      expect(result.__apiDirect).toBe(true);
      expect(result.metadata?.price).toBe('2200');
    });
  });

  // -------------------------------------------------------------------------
  // resolve() - hl_cancel_order
  // -------------------------------------------------------------------------

  describe('hl_cancel_order', () => {
    it('cancels single order by oid', async () => {
      const result = await provider.resolve('hl_cancel_order', {
        market: 'ETH',
        oid: 12345,
      }, createContext());

      expect(result.__apiDirect).toBe(true);
      expect(result.action).toBe('hl_cancel_order');
      const exchangeCall = (client as any).exchange.mock.calls[0][0];
      expect(exchangeCall.action.type).toBe('cancel');
    });

    it('cancels all orders for market when no oid/cloid', async () => {
      const result = await provider.resolve('hl_cancel_order', {
        market: 'ETH',
      }, createContext());

      expect(result.__apiDirect).toBe(true);
      const exchangeCall = (client as any).exchange.mock.calls[0][0];
      expect(exchangeCall.action.type).toBe('cancel');
      expect(exchangeCall.action.cancels).toHaveLength(2); // Both ETH orders
    });

    it('returns success with 0 cancelled when no open orders', async () => {
      (marketData.getOpenOrders as ReturnType<typeof vi.fn>).mockResolvedValue([]);

      const result = await provider.resolve('hl_cancel_order', {
        market: 'ETH',
      }, createContext());

      expect(result.__apiDirect).toBe(true);
      expect(result.data.cancelled).toBe(0);
      expect((client as any).exchange).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // resolve() - hl_set_leverage
  // -------------------------------------------------------------------------

  describe('hl_set_leverage', () => {
    it('resolves leverage update', async () => {
      const result = await provider.resolve('hl_set_leverage', {
        asset: 4,
        leverage: 10,
        isCross: true,
      }, createContext());

      expect(result.__apiDirect).toBe(true);
      expect(result.action).toBe('hl_set_leverage');
    });
  });

  // -------------------------------------------------------------------------
  // resolve() - hl_set_margin_mode
  // -------------------------------------------------------------------------

  describe('hl_set_margin_mode', () => {
    it('resolves margin mode change', async () => {
      const result = await provider.resolve('hl_set_margin_mode', {
        asset: 4,
        mode: 'ISOLATED',
      }, createContext());

      expect(result.__apiDirect).toBe(true);
      expect(result.action).toBe('hl_set_margin_mode');
    });
  });

  // -------------------------------------------------------------------------
  // resolve() - hl_transfer_usdc
  // -------------------------------------------------------------------------

  describe('hl_transfer_usdc', () => {
    it('resolves USDC transfer to perp', async () => {
      const result = await provider.resolve('hl_transfer_usdc', {
        amount: '100',
        toPerp: true,
      }, createContext());

      expect(result.__apiDirect).toBe(true);
      expect(result.action).toBe('hl_transfer_usdc');
      expect(result.metadata?.side).toBe('SPOT_TO_PERP');
    });

    it('resolves USDC transfer to spot', async () => {
      const result = await provider.resolve('hl_transfer_usdc', {
        amount: '50',
        toPerp: false,
      }, createContext());

      expect(result.__apiDirect).toBe(true);
      expect(result.metadata?.side).toBe('PERP_TO_SPOT');
    });
  });

  // -------------------------------------------------------------------------
  // resolve() - unknown action
  // -------------------------------------------------------------------------

  it('throws for unknown action', async () => {
    await expect(
      provider.resolve('unknown_action', {}, createContext()),
    ).rejects.toThrow('Unknown action: unknown_action');
  });

  // -------------------------------------------------------------------------
  // getSpendingAmount()
  // -------------------------------------------------------------------------

  describe('getSpendingAmount', () => {
    it('returns margin-based amount for hl_open_position', async () => {
      const result = await provider.getSpendingAmount('hl_open_position', {
        market: 'ETH',
        side: 'BUY',
        size: '1',
        price: '2000',
        orderType: 'LIMIT',
        leverage: 10,
      });

      // margin = 1 * 2000 / 10 = 200 USDC -> 200_000000n
      expect(result.amount).toBe(200_000000n);
      expect(result.asset).toBe('USDC');
    });

    it('returns $0 for hl_close_position', async () => {
      const result = await provider.getSpendingAmount('hl_close_position', { market: 'ETH' });
      expect(result.amount).toBe(0n);
    });

    it('returns $0 for hl_cancel_order', async () => {
      const result = await provider.getSpendingAmount('hl_cancel_order', { market: 'ETH' });
      expect(result.amount).toBe(0n);
    });

    it('returns amount for hl_transfer_usdc', async () => {
      const result = await provider.getSpendingAmount('hl_transfer_usdc', {
        amount: '100',
        toPerp: true,
      });
      expect(result.amount).toBe(100_000000n);
      expect(result.asset).toBe('USDC');
    });

    it('returns $0 for hl_set_leverage', async () => {
      const result = await provider.getSpendingAmount('hl_set_leverage', {
        asset: 4,
        leverage: 10,
        isCross: true,
      });
      expect(result.amount).toBe(0n);
    });

    it('uses mid price for market order spending', async () => {
      const result = await provider.getSpendingAmount('hl_open_position', {
        market: 'ETH',
        side: 'BUY',
        size: '1',
        orderType: 'MARKET',
      });

      // Market order: mid price = 2000, default leverage = 1
      // margin = 1 * 2000 / 1 = 2000 USDC -> 2000_000000n
      expect(result.amount).toBe(2000_000000n);
    });
  });

  // -------------------------------------------------------------------------
  // IPerpProvider queries
  // -------------------------------------------------------------------------

  describe('IPerpProvider queries', () => {
    it('getPosition returns mapped PerpPositionSummary', async () => {
      const positions = await provider.getPosition('wallet-001', createContext());
      expect(positions).toHaveLength(1);
      expect(positions[0]!.market).toBe('ETH');
      expect(positions[0]!.direction).toBe('LONG');
      expect(positions[0]!.size).toBe('1.5');
      expect(positions[0]!.entryPrice).toBe(2000);
      expect(positions[0]!.leverage).toBe(10);
    });

    it('getMarginInfo returns mapped MarginInfo', async () => {
      const info = await provider.getMarginInfo('wallet-001', createContext());
      expect(info.totalMargin).toBe(10000);
      expect(info.freeMargin).toBe(7000);
      expect(info.status).toBe('warning'); // marginRatio = 3000/10000 = 0.30
    });

    it('getMarkets returns mapped PerpMarketInfo', async () => {
      const markets = await provider.getMarkets('ethereum');
      expect(markets).toHaveLength(2);
      expect(markets[0]!.market).toBe('ETH');
      expect(markets[0]!.maxLeverage).toBe(50);
      expect(markets[0]!.oraclePrice).toBe(2000);
    });

    it('getMarkets returns empty for non-ethereum chain', async () => {
      const markets = await provider.getMarkets('solana');
      expect(markets).toHaveLength(0);
    });

    it('getPosition returns empty on error', async () => {
      (marketData.getPositions as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('fail'));
      const positions = await provider.getPosition('w1', createContext());
      expect(positions).toHaveLength(0);
    });
  });

  // -------------------------------------------------------------------------
  // IPositionProvider duck-type methods
  // -------------------------------------------------------------------------

  describe('IPositionProvider', () => {
    it('getProviderName returns hyperliquid_perp', () => {
      expect(provider.getProviderName()).toBe('hyperliquid_perp');
    });

    it('getSupportedCategories returns [PERP]', () => {
      expect(provider.getSupportedCategories()).toEqual(['PERP']);
    });

    it('getPositions with long ETH position returns correct PositionUpdate', async () => {
      (marketData.getPositions as ReturnType<typeof vi.fn>).mockResolvedValue([
        {
          coin: 'ETH',
          szi: '1.5',
          entryPx: '2000',
          leverage: { type: 'cross', value: 10 },
          unrealizedPnl: '50',
          marginUsed: '300',
          liquidationPx: '1800',
        },
      ]);
      (marketData.getAllMidPrices as ReturnType<typeof vi.fn>).mockResolvedValue({ ETH: '2100', BTC: '40000' });

      const positions = await provider.getPositions(makeEvmCtx());

      expect(positions).toHaveLength(1);
      const pos = positions[0]!;
      expect(pos.walletId).toBe('wallet-001');
      expect(pos.category).toBe('PERP');
      expect(pos.provider).toBe('hyperliquid_perp');
      expect(pos.chain).toBe('ethereum');
      expect(pos.network).toBe('ethereum-mainnet');
      expect(pos.assetId).toBeNull();
      expect(pos.amount).toBe('1.5');
      expect(pos.status).toBe('ACTIVE');
      expect(pos.metadata.market).toBe('ETH');
      expect(pos.metadata.side).toBe('LONG');
      expect(pos.metadata.entryPrice).toBe(2000);
      expect(pos.metadata.markPrice).toBe(2100);
      expect(pos.metadata.leverage).toBe(10);
      expect(pos.metadata.unrealizedPnl).toBe(50);
      expect(pos.metadata.liquidationPrice).toBe(1800);
      expect(pos.metadata.marginUsed).toBe(300);
    });

    it('getPositions with short BTC position returns side SHORT', async () => {
      (marketData.getPositions as ReturnType<typeof vi.fn>).mockResolvedValue([
        {
          coin: 'BTC',
          szi: '-0.5',
          entryPx: '42000',
          leverage: { type: 'isolated', value: 5 },
          unrealizedPnl: '-200',
          marginUsed: '4200',
          liquidationPx: '45000',
        },
      ]);
      (marketData.getAllMidPrices as ReturnType<typeof vi.fn>).mockResolvedValue({ BTC: '41000' });

      const positions = await provider.getPositions(makeEvmCtx());

      expect(positions).toHaveLength(1);
      const pos = positions[0]!;
      expect(pos.metadata.side).toBe('SHORT');
      expect(pos.amount).toBe('0.5');
      expect(pos.metadata.markPrice).toBe(41000);
    });

    it('getPositions with empty positions returns []', async () => {
      (marketData.getPositions as ReturnType<typeof vi.fn>).mockResolvedValue([]);

      const positions = await provider.getPositions(makeEvmCtx());
      expect(positions).toEqual([]);
    });

    it('getPositions on API error returns []', async () => {
      (marketData.getPositions as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('API down'));

      const positions = await provider.getPositions(makeEvmCtx());
      expect(positions).toEqual([]);
    });

    it('getPositions calculates amountUsd from markPrice', async () => {
      (marketData.getPositions as ReturnType<typeof vi.fn>).mockResolvedValue([
        {
          coin: 'ETH',
          szi: '2.0',
          entryPx: '2000',
          leverage: { type: 'cross', value: 10 },
          unrealizedPnl: '100',
          marginUsed: '400',
          liquidationPx: '1800',
        },
      ]);
      (marketData.getAllMidPrices as ReturnType<typeof vi.fn>).mockResolvedValue({ ETH: '2500' });

      const positions = await provider.getPositions(makeEvmCtx());
      expect(positions[0]!.amountUsd).toBe(5000); // abs(2.0) * 2500
    });

    it('getPositions returns [] for solana wallet (chain guard)', async () => {
      const positions = await provider.getPositions(makeEvmCtx('wallet-001', 'solana'));
      expect(positions).toEqual([]);
    });

    it('getPositions returns amountUsd null when no mid price', async () => {
      (marketData.getPositions as ReturnType<typeof vi.fn>).mockResolvedValue([
        {
          coin: 'DOGE',
          szi: '1000',
          entryPx: '0.08',
          leverage: { type: 'cross', value: 5 },
        },
      ]);
      (marketData.getAllMidPrices as ReturnType<typeof vi.fn>).mockResolvedValue({});

      const positions = await provider.getPositions(makeEvmCtx());
      expect(positions[0]!.amountUsd).toBeNull();
    });
  });
});
