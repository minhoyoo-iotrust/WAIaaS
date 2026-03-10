/**
 * Tests for Polymarket SDK methods.
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

describe('WAIaaSClient Polymarket methods', () => {
  const mockToken = createMockJwt('sess-pm-001');
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
  // CLOB Order actions
  // ---------------------------------------------------------------------------

  describe('Polymarket Order actions', () => {
    const orderCases = [
      { method: 'pmBuy' as const, action: 'pm_buy' },
      { method: 'pmSell' as const, action: 'pm_sell' },
      { method: 'pmUpdateOrder' as const, action: 'pm_update_order' },
    ] as const;

    for (const { method, action } of orderCases) {
      it(`${method}() calls polymarket_order / ${action}`, async () => {
        fetchSpy.mockResolvedValue(mockResponse(actionResponse));
        await client[method]('wlt-1', { tokenId: 'tok-abc', price: '0.65', size: '100' });
        const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
        expect(url).toBe(`http://localhost:3000/v1/actions/polymarket_order/${action}`);
        expect(JSON.parse(init.body as string)).toMatchObject({ walletId: 'wlt-1', params: { tokenId: 'tok-abc' } });
      });
    }

    it('pmCancelOrder() calls polymarket_order / pm_cancel_order', async () => {
      fetchSpy.mockResolvedValue(mockResponse(actionResponse));
      await client.pmCancelOrder('wlt-1', 'order-xyz');
      const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
      expect(url).toBe('http://localhost:3000/v1/actions/polymarket_order/pm_cancel_order');
      expect(JSON.parse(init.body as string)).toMatchObject({ walletId: 'wlt-1', params: { orderId: 'order-xyz' } });
    });

    it('pmCancelAll() calls polymarket_order / pm_cancel_all', async () => {
      fetchSpy.mockResolvedValue(mockResponse(actionResponse));
      await client.pmCancelAll('wlt-1', 'cond-123');
      const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
      expect(url).toBe('http://localhost:3000/v1/actions/polymarket_order/pm_cancel_all');
      expect(JSON.parse(init.body as string)).toMatchObject({ walletId: 'wlt-1', params: { conditionId: 'cond-123' } });
    });

    it('pmCancelAll() works without conditionId', async () => {
      fetchSpy.mockResolvedValue(mockResponse(actionResponse));
      await client.pmCancelAll('wlt-1');
      const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
      expect(JSON.parse(init.body as string).params).toEqual({});
    });
  });

  // ---------------------------------------------------------------------------
  // CTF actions
  // ---------------------------------------------------------------------------

  describe('Polymarket CTF actions', () => {
    const ctfCases = [
      { method: 'pmSplitPosition' as const, action: 'pm_split_position' },
      { method: 'pmMergePositions' as const, action: 'pm_merge_positions' },
      { method: 'pmRedeemPositions' as const, action: 'pm_redeem_positions' },
    ] as const;

    for (const { method, action } of ctfCases) {
      it(`${method}() calls polymarket_ctf / ${action}`, async () => {
        fetchSpy.mockResolvedValue(mockResponse(actionResponse));
        await client[method]('wlt-2', { conditionId: 'cond-abc', amount: '50' });
        const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
        expect(url).toBe(`http://localhost:3000/v1/actions/polymarket_ctf/${action}`);
        expect(JSON.parse(init.body as string)).toMatchObject({ walletId: 'wlt-2', params: { conditionId: 'cond-abc' } });
      });
    }
  });

  // ---------------------------------------------------------------------------
  // Query methods
  // ---------------------------------------------------------------------------

  describe('Polymarket query methods', () => {
    it('pmGetPositions() calls GET /v1/wallets/:id/polymarket/positions', async () => {
      fetchSpy.mockResolvedValue(mockResponse({ positions: [] }));
      await client.pmGetPositions('wlt-1');
      expect(fetchSpy.mock.calls[0]?.[0]).toBe('http://localhost:3000/v1/wallets/wlt-1/polymarket/positions');
    });

    it('pmGetOrders() calls GET /v1/wallets/:id/polymarket/orders', async () => {
      fetchSpy.mockResolvedValue(mockResponse({ orders: [] }));
      await client.pmGetOrders('wlt-1');
      expect(fetchSpy.mock.calls[0]?.[0]).toBe('http://localhost:3000/v1/wallets/wlt-1/polymarket/orders');
    });

    it('pmGetMarkets() calls GET /v1/polymarket/markets', async () => {
      fetchSpy.mockResolvedValue(mockResponse({ markets: [] }));
      await client.pmGetMarkets();
      expect(fetchSpy.mock.calls[0]?.[0]).toBe('http://localhost:3000/v1/polymarket/markets');
    });

    it('pmGetMarkets() passes query params', async () => {
      fetchSpy.mockResolvedValue(mockResponse({ markets: [] }));
      await client.pmGetMarkets({ keyword: 'election', limit: 10 });
      const url = fetchSpy.mock.calls[0]?.[0] as string;
      expect(url).toContain('keyword=election');
      expect(url).toContain('limit=10');
    });

    it('pmGetMarketDetail() calls GET /v1/polymarket/markets/:conditionId', async () => {
      fetchSpy.mockResolvedValue(mockResponse({ market: {} }));
      await client.pmGetMarketDetail('cond-456');
      expect(fetchSpy.mock.calls[0]?.[0]).toBe('http://localhost:3000/v1/polymarket/markets/cond-456');
    });

    it('pmGetBalance() calls GET /v1/wallets/:id/polymarket/balance', async () => {
      fetchSpy.mockResolvedValue(mockResponse({ balance: {} }));
      await client.pmGetBalance('wlt-3');
      expect(fetchSpy.mock.calls[0]?.[0]).toBe('http://localhost:3000/v1/wallets/wlt-3/polymarket/balance');
    });

    it('pmGetPnl() calls GET /v1/wallets/:id/polymarket/pnl', async () => {
      fetchSpy.mockResolvedValue(mockResponse({ pnl: {} }));
      await client.pmGetPnl('wlt-4');
      expect(fetchSpy.mock.calls[0]?.[0]).toBe('http://localhost:3000/v1/wallets/wlt-4/polymarket/pnl');
    });

    it('pmSetup() calls POST /v1/wallets/:id/polymarket/setup', async () => {
      fetchSpy.mockResolvedValue(mockResponse({ setup: { created: true } }));
      await client.pmSetup('wlt-5');
      const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
      expect(url).toBe('http://localhost:3000/v1/wallets/wlt-5/polymarket/setup');
      expect(init.method).toBe('POST');
    });
  });
});
