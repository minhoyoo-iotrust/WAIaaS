/**
 * Tests for Hyperliquid SDK methods: Perp, Spot, Sub-account, and DCent Swap.
 *
 * Verifies:
 * - Correct REST API endpoints / action provider calls
 * - Parameters forwarded correctly
 * - Response values returned
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { WAIaaSClient } from '../client.js';

function createMockJwt(sessionId: string): string {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({ sessionId, walletId: 'wallet-1' })).toString('base64url');
  const signature = 'mock-signature';
  return `${header}.${payload}.${signature}`;
}

function mockResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('WAIaaSClient Hyperliquid & DCent methods', () => {
  const mockToken = createMockJwt('sess-hl-001');
  let fetchSpy: ReturnType<typeof vi.fn>;
  let client: WAIaaSClient;

  const actionResponse = { transactionId: 'tx-1', status: 'pending' };

  beforeEach(() => {
    fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    client = new WAIaaSClient({
      baseUrl: 'http://localhost:3000',
      sessionToken: mockToken,
      retryOptions: { maxRetries: 0 },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ---------------------------------------------------------------------------
  // DCent Swap convenience methods
  // ---------------------------------------------------------------------------

  describe('getDcentQuotes()', () => {
    it('calls executeAction with dcent_swap / get_quotes', async () => {
      fetchSpy.mockResolvedValue(mockResponse(actionResponse));
      await client.getDcentQuotes({ network: 'ethereum-mainnet', fromToken: '0xA', toToken: '0xB', amount: '1' });
      const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
      expect(url).toBe('http://localhost:3000/v1/actions/dcent_swap/get_quotes');
      expect(JSON.parse(init.body as string)).toMatchObject({ params: { fromToken: '0xA', toToken: '0xB', amount: '1' } });
    });
  });

  describe('dcentDexSwap()', () => {
    it('calls executeAction with dcent_swap / dex_swap', async () => {
      fetchSpy.mockResolvedValue(mockResponse(actionResponse));
      await client.dcentDexSwap({ network: 'ethereum-mainnet', fromToken: '0xA', toToken: '0xB', amount: '1', slippage: 0.5 });
      const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
      expect(url).toBe('http://localhost:3000/v1/actions/dcent_swap/dex_swap');
      expect(JSON.parse(init.body as string)).toMatchObject({ params: { fromToken: '0xA', toToken: '0xB', amount: '1', slippage: 0.5 } });
    });
  });

  // ---------------------------------------------------------------------------
  // Hyperliquid Perp convenience methods
  // ---------------------------------------------------------------------------

  describe('Hyperliquid Perp actions', () => {
    const perpCases = [
      { method: 'hlOpenPosition' as const, action: 'hl_open_position' },
      { method: 'hlClosePosition' as const, action: 'hl_close_position' },
      { method: 'hlPlaceOrder' as const, action: 'hl_place_order' },
      { method: 'hlCancelOrder' as const, action: 'hl_cancel_order' },
      { method: 'hlSetLeverage' as const, action: 'hl_set_leverage' },
      { method: 'hlSetMarginMode' as const, action: 'hl_set_margin_mode' },
      { method: 'hlTransferUsdc' as const, action: 'hl_transfer_usdc' },
    ] as const;

    for (const { method, action } of perpCases) {
      it(`${method}() calls hyperliquid_perp / ${action}`, async () => {
        fetchSpy.mockResolvedValue(mockResponse(actionResponse));
        await client[method]('wlt-1', { market: 'ETH' });
        const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
        expect(url).toBe(`http://localhost:3000/v1/actions/hyperliquid_perp/${action}`);
        expect(JSON.parse(init.body as string)).toMatchObject({ walletId: 'wlt-1', params: { market: 'ETH' } });
      });
    }
  });

  // ---------------------------------------------------------------------------
  // Hyperliquid Perp query methods
  // ---------------------------------------------------------------------------

  describe('Hyperliquid Perp queries', () => {
    it('hlGetPositions() calls GET /v1/wallets/:id/hyperliquid/positions', async () => {
      fetchSpy.mockResolvedValue(mockResponse({ positions: [] }));
      await client.hlGetPositions('wlt-1');
      expect(fetchSpy.mock.calls[0]?.[0]).toBe('http://localhost:3000/v1/wallets/wlt-1/hyperliquid/positions');
    });

    it('hlGetOpenOrders() calls GET /v1/wallets/:id/hyperliquid/orders', async () => {
      fetchSpy.mockResolvedValue(mockResponse({ orders: [] }));
      await client.hlGetOpenOrders('wlt-1');
      expect(fetchSpy.mock.calls[0]?.[0]).toBe('http://localhost:3000/v1/wallets/wlt-1/hyperliquid/orders');
    });

    it('hlGetMarkets() calls GET /v1/hyperliquid/markets', async () => {
      fetchSpy.mockResolvedValue(mockResponse({ markets: [] }));
      await client.hlGetMarkets();
      expect(fetchSpy.mock.calls[0]?.[0]).toBe('http://localhost:3000/v1/hyperliquid/markets');
    });

    it('hlGetFundingRates() calls GET /v1/hyperliquid/funding-rates with query params', async () => {
      fetchSpy.mockResolvedValue(mockResponse({ rates: [] }));
      await client.hlGetFundingRates('ETH', 1000);
      const url = fetchSpy.mock.calls[0]?.[0] as string;
      expect(url).toContain('/v1/hyperliquid/funding-rates');
      expect(url).toContain('market=ETH');
      expect(url).toContain('startTime=1000');
    });

    it('hlGetFundingRates() works without startTime', async () => {
      fetchSpy.mockResolvedValue(mockResponse({ rates: [] }));
      await client.hlGetFundingRates('BTC');
      const url = fetchSpy.mock.calls[0]?.[0] as string;
      expect(url).toContain('market=BTC');
      expect(url).not.toContain('startTime');
    });

    it('hlGetAccountState() calls GET /v1/wallets/:id/hyperliquid/account', async () => {
      fetchSpy.mockResolvedValue(mockResponse({ equity: '10000' }));
      await client.hlGetAccountState('wlt-1');
      expect(fetchSpy.mock.calls[0]?.[0]).toBe('http://localhost:3000/v1/wallets/wlt-1/hyperliquid/account');
    });

    it('hlGetTradeHistory() calls GET /v1/wallets/:id/hyperliquid/fills', async () => {
      fetchSpy.mockResolvedValue(mockResponse({ fills: [] }));
      await client.hlGetTradeHistory('wlt-1', 50);
      const url = fetchSpy.mock.calls[0]?.[0] as string;
      expect(url).toBe('http://localhost:3000/v1/wallets/wlt-1/hyperliquid/fills?limit=50');
    });

    it('hlGetTradeHistory() works without limit', async () => {
      fetchSpy.mockResolvedValue(mockResponse({ fills: [] }));
      await client.hlGetTradeHistory('wlt-1');
      expect(fetchSpy.mock.calls[0]?.[0]).toBe('http://localhost:3000/v1/wallets/wlt-1/hyperliquid/fills');
    });
  });

  // ---------------------------------------------------------------------------
  // Hyperliquid Spot convenience methods
  // ---------------------------------------------------------------------------

  describe('Hyperliquid Spot actions', () => {
    const spotCases = [
      { method: 'hlSpotBuy' as const, action: 'hl_spot_buy' },
      { method: 'hlSpotSell' as const, action: 'hl_spot_sell' },
      { method: 'hlSpotCancel' as const, action: 'hl_spot_cancel' },
    ] as const;

    for (const { method, action } of spotCases) {
      it(`${method}() calls hyperliquid_spot / ${action}`, async () => {
        fetchSpy.mockResolvedValue(mockResponse(actionResponse));
        await client[method]('wlt-2', { token: 'HYPE' });
        const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
        expect(url).toBe(`http://localhost:3000/v1/actions/hyperliquid_spot/${action}`);
        expect(JSON.parse(init.body as string)).toMatchObject({ walletId: 'wlt-2', params: { token: 'HYPE' } });
      });
    }
  });

  describe('Hyperliquid Spot queries', () => {
    it('hlGetSpotBalances() calls GET /v1/wallets/:id/hyperliquid/spot/balances', async () => {
      fetchSpy.mockResolvedValue(mockResponse({ balances: [] }));
      await client.hlGetSpotBalances('wlt-2');
      expect(fetchSpy.mock.calls[0]?.[0]).toBe('http://localhost:3000/v1/wallets/wlt-2/hyperliquid/spot/balances');
    });

    it('hlGetSpotMarkets() calls GET /v1/hyperliquid/spot/markets', async () => {
      fetchSpy.mockResolvedValue(mockResponse({ markets: [] }));
      await client.hlGetSpotMarkets();
      expect(fetchSpy.mock.calls[0]?.[0]).toBe('http://localhost:3000/v1/hyperliquid/spot/markets');
    });
  });

  // ---------------------------------------------------------------------------
  // Hyperliquid Sub-account convenience methods
  // ---------------------------------------------------------------------------

  describe('Hyperliquid Sub-account actions', () => {
    it('hlCreateSubAccount() calls hyperliquid_sub / hl_create_sub_account', async () => {
      fetchSpy.mockResolvedValue(mockResponse(actionResponse));
      await client.hlCreateSubAccount('wlt-3', { name: 'sub1' });
      const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
      expect(url).toBe('http://localhost:3000/v1/actions/hyperliquid_sub/hl_create_sub_account');
      expect(JSON.parse(init.body as string)).toMatchObject({ walletId: 'wlt-3', params: { name: 'sub1' } });
    });

    it('hlSubTransfer() calls hyperliquid_sub / hl_sub_transfer', async () => {
      fetchSpy.mockResolvedValue(mockResponse(actionResponse));
      await client.hlSubTransfer('wlt-3', { subAccount: '0xabc', amount: '100', direction: 'deposit' });
      const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
      expect(url).toBe('http://localhost:3000/v1/actions/hyperliquid_sub/hl_sub_transfer');
      expect(JSON.parse(init.body as string)).toMatchObject({ walletId: 'wlt-3', params: { subAccount: '0xabc', amount: '100', direction: 'deposit' } });
    });
  });

  describe('Hyperliquid Sub-account queries', () => {
    it('hlListSubAccounts() calls GET /v1/wallets/:id/hyperliquid/sub-accounts', async () => {
      fetchSpy.mockResolvedValue(mockResponse({ subAccounts: [] }));
      await client.hlListSubAccounts('wlt-3');
      expect(fetchSpy.mock.calls[0]?.[0]).toBe('http://localhost:3000/v1/wallets/wlt-3/hyperliquid/sub-accounts');
    });

    it('hlGetSubPositions() calls GET /v1/wallets/:id/hyperliquid/sub-accounts/:sub/positions', async () => {
      fetchSpy.mockResolvedValue(mockResponse({ positions: [] }));
      await client.hlGetSubPositions('wlt-3', '0xabc');
      expect(fetchSpy.mock.calls[0]?.[0]).toBe('http://localhost:3000/v1/wallets/wlt-3/hyperliquid/sub-accounts/0xabc/positions');
    });
  });
});
