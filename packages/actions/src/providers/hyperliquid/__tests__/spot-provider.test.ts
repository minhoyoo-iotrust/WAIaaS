/**
 * Tests for HyperliquidSpotProvider.
 *
 * Verifies all 3 actions (hl_spot_buy, hl_spot_sell, hl_spot_cancel) and getSpendingAmount.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HyperliquidSpotProvider } from '../spot-provider.js';
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
      response: { type: 'order', data: { statuses: [{ resting: { oid: 100 } }] } },
    }),
    info: vi.fn(),
  } as unknown as HyperliquidExchangeClient;
}

function createMockMarketData() {
  return {
    getSpotMarkets: vi.fn().mockResolvedValue([
      { name: 'PURR/USDC', tokens: [0, 1], index: 0, isCanonical: true },
      { name: 'HYPE/USDC', tokens: [2, 1], index: 1, isCanonical: true },
    ]),
    getSpotMeta: vi.fn().mockResolvedValue({
      universe: [
        { name: 'PURR/USDC', tokens: [0, 1], index: 0, isCanonical: true },
        { name: 'HYPE/USDC', tokens: [2, 1], index: 1, isCanonical: true },
      ],
      tokens: [
        { name: 'PURR', szDecimals: 0, weiDecimals: 18, index: 0, tokenId: '0x01' },
        { name: 'USDC', szDecimals: 2, weiDecimals: 8, index: 1, tokenId: '0x02' },
        { name: 'HYPE', szDecimals: 2, weiDecimals: 18, index: 2, tokenId: '0x03' },
      ],
    }),
    getAllMidPrices: vi.fn().mockResolvedValue({
      'PURR/USDC': '0.05',
      'HYPE/USDC': '25.0',
    }),
    getOpenOrders: vi.fn().mockResolvedValue([
      { coin: 'HYPE/USDC', side: 'B', limitPx: '24.0', sz: '10', oid: 201 },
      { coin: 'HYPE/USDC', side: 'A', limitPx: '26.0', sz: '5', oid: 202 },
      { coin: 'ETH', side: 'B', limitPx: '2000', sz: '1', oid: 303 }, // Perp order, should not be cancelled
    ]),
    // Other methods for completeness
    getMarkets: vi.fn().mockResolvedValue([]),
    getPositions: vi.fn().mockResolvedValue([]),
    getAccountState: vi.fn().mockResolvedValue({ marginSummary: { accountValue: '0', totalNtlPos: '0', totalRawUsd: '0' }, assetPositions: [] }),
    getFundingHistory: vi.fn().mockResolvedValue([]),
    getUserFills: vi.fn().mockResolvedValue([]),
    getSpotBalances: vi.fn().mockResolvedValue([]),
    getSubAccounts: vi.fn().mockResolvedValue([]),
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

describe('HyperliquidSpotProvider', () => {
  let client: ReturnType<typeof createMockClient>;
  let marketData: ReturnType<typeof createMockMarketData>;
  let provider: HyperliquidSpotProvider;

  beforeEach(() => {
    client = createMockClient();
    marketData = createMockMarketData();
    provider = new HyperliquidSpotProvider(
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
      expect(provider.metadata.name).toBe('hyperliquid_spot');
      expect(provider.metadata.requiresSigningKey).toBe(true);
      expect(provider.metadata.mcpExpose).toBe(true);
      expect(provider.metadata.chains).toContain('ethereum');
    });

    it('exposes 3 actions', () => {
      expect(provider.actions).toHaveLength(3);
      const names = provider.actions.map((a) => a.name);
      expect(names).toContain('hl_spot_buy');
      expect(names).toContain('hl_spot_sell');
      expect(names).toContain('hl_spot_cancel');
    });

    it('has correct risk levels per HDESIGN-07', () => {
      const actionMap = new Map(provider.actions.map((a) => [a.name, a]));
      expect(actionMap.get('hl_spot_buy')?.riskLevel).toBe('medium');
      expect(actionMap.get('hl_spot_buy')?.defaultTier).toBe('DELAY');
      expect(actionMap.get('hl_spot_sell')?.riskLevel).toBe('low');
      expect(actionMap.get('hl_spot_sell')?.defaultTier).toBe('INSTANT');
      expect(actionMap.get('hl_spot_cancel')?.riskLevel).toBe('low');
      expect(actionMap.get('hl_spot_cancel')?.defaultTier).toBe('INSTANT');
    });
  });

  // -------------------------------------------------------------------------
  // resolve() - hl_spot_buy
  // -------------------------------------------------------------------------

  describe('hl_spot_buy', () => {
    it('resolves market order with ApiDirectResult', async () => {
      const result = await provider.resolve('hl_spot_buy', {
        market: 'HYPE/USDC',
        size: '10',
        orderType: 'MARKET',
      }, createContext());

      expect(result.__apiDirect).toBe(true);
      expect(result.provider).toBe('hyperliquid_spot');
      expect(result.action).toBe('hl_spot_buy');
      expect(result.status).toBe('success');
      expect(result.metadata?.market).toBe('HYPE/USDC');
      expect(result.metadata?.side).toBe('BUY');
      expect(result.metadata?.size).toBe('10');
      expect((client as any).exchange).toHaveBeenCalledOnce();
    });

    it('resolves limit order with price', async () => {
      const result = await provider.resolve('hl_spot_buy', {
        market: 'HYPE/USDC',
        size: '10',
        price: '24.5',
        orderType: 'LIMIT',
        tif: 'GTC',
      }, createContext());

      expect(result.__apiDirect).toBe(true);
      expect(result.metadata?.price).toBe('24.5');
    });

    it('throws for unknown market', async () => {
      (marketData.getSpotMeta as ReturnType<typeof vi.fn>).mockResolvedValue({
        universe: [],
        tokens: [],
      });

      await expect(
        provider.resolve('hl_spot_buy', {
          market: 'UNKNOWN/USDC',
          size: '1',
          orderType: 'MARKET',
        }, createContext()),
      ).rejects.toThrow('Unknown spot market: UNKNOWN/USDC');
    });

    it('throws without privateKey', async () => {
      const ctx = createContext();
      delete (ctx as any).privateKey;

      await expect(
        provider.resolve('hl_spot_buy', {
          market: 'HYPE/USDC',
          size: '10',
          orderType: 'MARKET',
        }, ctx),
      ).rejects.toThrow('Private key is required');
    });
  });

  // -------------------------------------------------------------------------
  // resolve() - hl_spot_sell
  // -------------------------------------------------------------------------

  describe('hl_spot_sell', () => {
    it('resolves with SELL side in wire', async () => {
      const result = await provider.resolve('hl_spot_sell', {
        market: 'HYPE/USDC',
        size: '5',
        orderType: 'MARKET',
      }, createContext());

      expect(result.__apiDirect).toBe(true);
      expect(result.action).toBe('hl_spot_sell');
      expect(result.metadata?.side).toBe('SELL');
      expect((client as any).exchange).toHaveBeenCalledOnce();
    });
  });

  // -------------------------------------------------------------------------
  // resolve() - hl_spot_cancel
  // -------------------------------------------------------------------------

  describe('hl_spot_cancel', () => {
    it('cancels single order by oid', async () => {
      const result = await provider.resolve('hl_spot_cancel', {
        market: 'HYPE/USDC',
        oid: 201,
      }, createContext());

      expect(result.__apiDirect).toBe(true);
      expect(result.action).toBe('hl_spot_cancel');
      const exchangeCall = (client as any).exchange.mock.calls[0][0];
      expect(exchangeCall.action.type).toBe('cancel');
    });

    it('cancels all spot orders for market when no oid/cloid', async () => {
      const result = await provider.resolve('hl_spot_cancel', {
        market: 'HYPE/USDC',
      }, createContext());

      expect(result.__apiDirect).toBe(true);
      const exchangeCall = (client as any).exchange.mock.calls[0][0];
      expect(exchangeCall.action.type).toBe('cancel');
      // Should only cancel HYPE/USDC orders, not ETH perp order
      expect(exchangeCall.action.cancels).toHaveLength(2);
    });

    it('returns success with 0 cancelled when no open orders', async () => {
      (marketData.getOpenOrders as ReturnType<typeof vi.fn>).mockResolvedValue([]);

      const result = await provider.resolve('hl_spot_cancel', {
        market: 'HYPE/USDC',
      }, createContext());

      expect(result.__apiDirect).toBe(true);
      expect(result.data.cancelled).toBe(0);
      expect((client as any).exchange).not.toHaveBeenCalled();
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
    it('returns size*price for hl_spot_buy with LIMIT', async () => {
      const result = await provider.getSpendingAmount('hl_spot_buy', {
        market: 'HYPE/USDC',
        size: '10',
        price: '25',
        orderType: 'LIMIT',
      });

      // 10 * 25 = 250 USDC -> 250_000000n
      expect(result.amount).toBe(250_000000n);
      expect(result.asset).toBe('USDC');
    });

    it('uses mid price for hl_spot_buy MARKET', async () => {
      const result = await provider.getSpendingAmount('hl_spot_buy', {
        market: 'HYPE/USDC',
        size: '10',
        orderType: 'MARKET',
      });

      // 10 * 25.0 = 250 USDC -> 250_000000n
      expect(result.amount).toBe(250_000000n);
    });

    it('returns $0 for hl_spot_sell', async () => {
      const result = await provider.getSpendingAmount('hl_spot_sell', {
        market: 'HYPE/USDC',
        size: '10',
        orderType: 'MARKET',
      });
      expect(result.amount).toBe(0n);
    });

    it('returns $0 for hl_spot_cancel', async () => {
      const result = await provider.getSpendingAmount('hl_spot_cancel', {
        market: 'HYPE/USDC',
      });
      expect(result.amount).toBe(0n);
    });
  });

  // -------------------------------------------------------------------------
  // IPositionProvider duck-type methods
  // -------------------------------------------------------------------------

  describe('IPositionProvider', () => {
    it('getProviderName returns hyperliquid_spot', () => {
      expect(provider.getProviderName()).toBe('hyperliquid_spot');
    });

    it('getSupportedCategories returns [PERP]', () => {
      expect(provider.getSupportedCategories()).toEqual(['PERP']);
    });

    it('getPositions with non-zero balances returns PositionUpdates', async () => {
      (marketData.getSpotBalances as ReturnType<typeof vi.fn>).mockResolvedValue([
        { coin: 'HYPE', hold: '0', token: 1, total: '100.5' },
        { coin: 'USDC', hold: '50', token: 0, total: '500.0' },
        { coin: 'ETH', hold: '0', token: 2, total: '0' },
      ]);
      (marketData.getAllMidPrices as ReturnType<typeof vi.fn>).mockResolvedValue({
        'HYPE/USDC': '25.0',
        'ETH': '2000',
      });

      const positions = await provider.getPositions(makeEvmCtx());

      expect(positions).toHaveLength(2); // ETH filtered out (zero total)

      const hype = positions.find((p) => p.metadata.coin === 'HYPE')!;
      expect(hype.walletId).toBe('wallet-001');
      expect(hype.category).toBe('PERP');
      expect(hype.provider).toBe('hyperliquid_spot');
      expect(hype.chain).toBe('ethereum');
      expect(hype.network).toBe('ethereum-mainnet');
      expect(hype.assetId).toBeNull();
      expect(hype.amount).toBe('100.5');
      expect(hype.amountUsd).toBe(2512.5); // 100.5 * 25.0
      expect(hype.status).toBe('ACTIVE');
      expect(hype.metadata.coin).toBe('HYPE');
      expect(hype.metadata.total).toBe('100.5');
      expect(hype.metadata.hold).toBe('0');
      expect(hype.metadata.tokenIndex).toBe(1);

      const usdc = positions.find((p) => p.metadata.coin === 'USDC')!;
      expect(usdc.amount).toBe('500.0');
      expect(usdc.amountUsd).toBe(500); // USDC = 1:1
    });

    it('getPositions filters out zero-total balances', async () => {
      (marketData.getSpotBalances as ReturnType<typeof vi.fn>).mockResolvedValue([
        { coin: 'HYPE', hold: '0', token: 1, total: '0' },
        { coin: 'ETH', hold: '0', token: 2, total: '0.0' },
      ]);
      (marketData.getAllMidPrices as ReturnType<typeof vi.fn>).mockResolvedValue({});

      const positions = await provider.getPositions(makeEvmCtx());
      expect(positions).toEqual([]);
    });

    it('getPositions returns [] on API error', async () => {
      (marketData.getSpotBalances as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('API down'));

      const positions = await provider.getPositions(makeEvmCtx());
      expect(positions).toEqual([]);
    });

    it('getPositions returns [] for solana wallet (chain guard)', async () => {
      const positions = await provider.getPositions(makeEvmCtx('wallet-001', 'solana'));
      expect(positions).toEqual([]);
    });

    it('getPositions returns amountUsd null when no mid price available', async () => {
      (marketData.getSpotBalances as ReturnType<typeof vi.fn>).mockResolvedValue([
        { coin: 'RARE', hold: '0', token: 5, total: '10.0' },
      ]);
      (marketData.getAllMidPrices as ReturnType<typeof vi.fn>).mockResolvedValue({});

      const positions = await provider.getPositions(makeEvmCtx());
      expect(positions).toHaveLength(1);
      expect(positions[0]!.amountUsd).toBeNull();
    });
  });
});
