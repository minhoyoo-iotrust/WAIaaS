/**
 * Tests for Hyperliquid REST query routes.
 *
 * Covers all 10 GET endpoints + disabled/wallet-not-found error paths.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';
import { createHyperliquidRoutes, type HyperliquidRouteDeps } from '../api/routes/hyperliquid.js';

// ---------------------------------------------------------------------------
// Mock DB
// ---------------------------------------------------------------------------

function createMockDb(wallet = { publicKey: '0xWALLET' }) {
  return {
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          get: vi.fn().mockReturnValue(wallet),
        }),
      }),
    }),
  };
}

// ---------------------------------------------------------------------------
// Mock MarketData
// ---------------------------------------------------------------------------

function createMockMarketData() {
  return {
    getPositions: vi.fn().mockResolvedValue([{ coin: 'ETH', size: '1.5' }]),
    getOpenOrders: vi.fn().mockResolvedValue([{ oid: 1, coin: 'BTC' }]),
    getMarkets: vi.fn().mockResolvedValue([{ name: 'ETH-USD' }]),
    getFundingHistory: vi.fn().mockResolvedValue([{ time: 1000, fundingRate: '0.001' }]),
    getAccountState: vi.fn().mockResolvedValue({ marginSummary: { accountValue: '10000' } }),
    getUserFills: vi.fn().mockResolvedValue([{ coin: 'ETH', px: '3000', sz: '0.5' }]),
    getSpotBalances: vi.fn().mockResolvedValue([{ coin: 'USDC', hold: '5000' }]),
    getSpotMarkets: vi.fn().mockResolvedValue([{ name: 'ETH/USDC' }]),
    getSubAccounts: vi.fn().mockResolvedValue([{ address: '0xSUB1' }]),
    getSubAccountPositions: vi.fn().mockResolvedValue([{ coin: 'BTC', size: '0.1' }]),
  };
}

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function createApp(deps: HyperliquidRouteDeps) {
  const app = new Hono();
  app.route('', createHyperliquidRoutes(deps));
  return app;
}

async function fetchJson(app: Hono, path: string) {
  const res = await app.fetch(new Request(`http://localhost${path}`));
  const text = await res.text();
  let json: Record<string, unknown> = {};
  try { json = JSON.parse(text); } catch { json = { _raw: text }; }
  return { status: res.status, json };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Hyperliquid query routes', () => {
  let db: ReturnType<typeof createMockDb>;
  let marketData: ReturnType<typeof createMockMarketData>;

  beforeEach(() => {
    db = createMockDb();
    marketData = createMockMarketData();
  });

  describe('when marketData is null (disabled)', () => {
    it('returns error for positions', async () => {
      const app = createApp({ db: db as never, marketData: null });
      const { status } = await fetchJson(app, '/v1/wallets/wlt-1/hyperliquid/positions');
      expect(status).toBeGreaterThanOrEqual(400);
    });

    it('returns error for markets', async () => {
      const app = createApp({ db: db as never, marketData: null });
      const { status } = await fetchJson(app, '/v1/hyperliquid/markets');
      expect(status).toBeGreaterThanOrEqual(400);
    });

    it('returns error for funding-rates', async () => {
      const app = createApp({ db: db as never, marketData: null });
      const { status } = await fetchJson(app, '/v1/hyperliquid/funding-rates?market=ETH');
      expect(status).toBeGreaterThanOrEqual(400);
    });
  });

  describe('wallet not found', () => {
    it('returns error when wallet does not exist', async () => {
      const notFoundDb = createMockDb();
      notFoundDb.select = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            get: vi.fn().mockReturnValue(undefined),
          }),
        }),
      });
      const app = createApp({ db: notFoundDb as never, marketData: marketData as never });
      const { status } = await fetchJson(app, '/v1/wallets/nonexistent/hyperliquid/positions');
      expect(status).toBe(500);
    });
  });

  describe('when marketData is enabled', () => {
    it('GET /v1/wallets/:id/hyperliquid/positions returns positions', async () => {
      const app = createApp({ db: db as never, marketData: marketData as never });
      const { status, json } = await fetchJson(app, '/v1/wallets/wlt-1/hyperliquid/positions');
      expect(status).toBe(200);
      expect(json.positions).toHaveLength(1);
      expect(marketData.getPositions).toHaveBeenCalledWith('0xWALLET', undefined);
    });

    it('GET /v1/wallets/:id/hyperliquid/positions?subAccount=0xSUB passes subAccount', async () => {
      const app = createApp({ db: db as never, marketData: marketData as never });
      const { status } = await fetchJson(app, '/v1/wallets/wlt-1/hyperliquid/positions?subAccount=0xSUB');
      expect(status).toBe(200);
      expect(marketData.getPositions).toHaveBeenCalledWith('0xWALLET', '0xSUB');
    });

    it('GET /v1/wallets/:id/hyperliquid/orders returns open orders', async () => {
      const app = createApp({ db: db as never, marketData: marketData as never });
      const { status, json } = await fetchJson(app, '/v1/wallets/wlt-1/hyperliquid/orders');
      expect(status).toBe(200);
      expect(json.orders).toHaveLength(1);
      expect(marketData.getOpenOrders).toHaveBeenCalledWith('0xWALLET', undefined);
    });

    it('GET /v1/wallets/:id/hyperliquid/orders?subAccount=0xS passes subAccount', async () => {
      const app = createApp({ db: db as never, marketData: marketData as never });
      await fetchJson(app, '/v1/wallets/wlt-1/hyperliquid/orders?subAccount=0xS');
      expect(marketData.getOpenOrders).toHaveBeenCalledWith('0xWALLET', '0xS');
    });

    it('GET /v1/hyperliquid/markets returns market list', async () => {
      const app = createApp({ db: db as never, marketData: marketData as never });
      const { status, json } = await fetchJson(app, '/v1/hyperliquid/markets');
      expect(status).toBe(200);
      expect(json.markets).toHaveLength(1);
    });

    it('GET /v1/hyperliquid/funding-rates?market=ETH returns funding rates', async () => {
      const app = createApp({ db: db as never, marketData: marketData as never });
      const { status, json } = await fetchJson(app, '/v1/hyperliquid/funding-rates?market=ETH');
      expect(status).toBe(200);
      expect(json.rates).toHaveLength(1);
      expect(marketData.getFundingHistory).toHaveBeenCalledWith('ETH', 0);
    });

    it('GET /v1/hyperliquid/funding-rates?market=ETH&startTime=500 passes startTime', async () => {
      const app = createApp({ db: db as never, marketData: marketData as never });
      await fetchJson(app, '/v1/hyperliquid/funding-rates?market=ETH&startTime=500');
      expect(marketData.getFundingHistory).toHaveBeenCalledWith('ETH', 500);
    });

    it('GET /v1/hyperliquid/funding-rates without market returns error', async () => {
      const app = createApp({ db: db as never, marketData: marketData as never });
      const { status } = await fetchJson(app, '/v1/hyperliquid/funding-rates');
      expect(status).toBeGreaterThanOrEqual(400);
    });

    it('GET /v1/wallets/:id/hyperliquid/account returns account state', async () => {
      const app = createApp({ db: db as never, marketData: marketData as never });
      const { status, json } = await fetchJson(app, '/v1/wallets/wlt-1/hyperliquid/account');
      expect(status).toBe(200);
      expect(json.state).toBeDefined();
      expect(marketData.getAccountState).toHaveBeenCalledWith('0xWALLET');
    });

    it('GET /v1/wallets/:id/hyperliquid/fills returns user fills', async () => {
      const app = createApp({ db: db as never, marketData: marketData as never });
      const { status, json } = await fetchJson(app, '/v1/wallets/wlt-1/hyperliquid/fills');
      expect(status).toBe(200);
      expect(json.fills).toHaveLength(1);
      expect(marketData.getUserFills).toHaveBeenCalledWith('0xWALLET', undefined);
    });

    it('GET /v1/wallets/:id/hyperliquid/fills?limit=10 passes limit', async () => {
      const app = createApp({ db: db as never, marketData: marketData as never });
      await fetchJson(app, '/v1/wallets/wlt-1/hyperliquid/fills?limit=10');
      expect(marketData.getUserFills).toHaveBeenCalledWith('0xWALLET', 10);
    });

    it('GET /v1/wallets/:id/hyperliquid/spot/balances returns spot balances', async () => {
      const app = createApp({ db: db as never, marketData: marketData as never });
      const { status, json } = await fetchJson(app, '/v1/wallets/wlt-1/hyperliquid/spot/balances');
      expect(status).toBe(200);
      expect(json.balances).toHaveLength(1);
      expect(marketData.getSpotBalances).toHaveBeenCalledWith('0xWALLET');
    });

    it('GET /v1/hyperliquid/spot/markets returns spot markets', async () => {
      const app = createApp({ db: db as never, marketData: marketData as never });
      const { status, json } = await fetchJson(app, '/v1/hyperliquid/spot/markets');
      expect(status).toBe(200);
      expect(json.markets).toHaveLength(1);
    });

    it('GET /v1/wallets/:id/hyperliquid/sub-accounts returns sub accounts', async () => {
      const app = createApp({ db: db as never, marketData: marketData as never });
      const { status, json } = await fetchJson(app, '/v1/wallets/wlt-1/hyperliquid/sub-accounts');
      expect(status).toBe(200);
      expect(json.subAccounts).toHaveLength(1);
      expect(marketData.getSubAccounts).toHaveBeenCalledWith('0xWALLET');
    });

    it('GET /v1/wallets/:id/hyperliquid/sub-accounts/:sub/positions returns sub positions', async () => {
      const app = createApp({ db: db as never, marketData: marketData as never });
      const { status, json } = await fetchJson(app, '/v1/wallets/wlt-1/hyperliquid/sub-accounts/0xSUB1/positions');
      expect(status).toBe(200);
      expect(json.positions).toHaveLength(1);
      expect(marketData.getSubAccountPositions).toHaveBeenCalledWith('0xWALLET', '0xSUB1');
    });
  });
});
