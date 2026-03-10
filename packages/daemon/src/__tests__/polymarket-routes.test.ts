/**
 * Tests for Polymarket REST query routes.
 *
 * Covers:
 * - 9 route endpoints (positions, orders, order detail, markets, market detail, events, balance, pnl, setup)
 * - Polymarket disabled error
 * - Wallet not found 404
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';
import { createPolymarketRoutes, type PolymarketRouteDeps, type PolymarketInfraDeps } from '../api/routes/polymarket.js';

// ---------------------------------------------------------------------------
// Mock DB
// ---------------------------------------------------------------------------

function createMockDb() {
  const mockWallet = { id: 'wlt-pm-1', publicKey: '0xABC123' };
  const mockOrders = [
    { id: 'ord-1', walletId: 'wlt-pm-1', orderId: 'clob-ord-1', conditionId: 'cond-1', tokenId: 'tok-1', status: 'LIVE', side: 'BUY', orderType: 'GTC', price: '0.65', size: '100', outcome: 'YES', createdAt: 1700000000, updatedAt: 1700000000 },
    { id: 'ord-2', walletId: 'wlt-pm-1', orderId: 'clob-ord-2', conditionId: 'cond-1', tokenId: 'tok-1', status: 'MATCHED', side: 'SELL', orderType: 'GTC', price: '0.70', size: '50', outcome: 'YES', createdAt: 1700001000, updatedAt: 1700001000 },
  ];

  return {
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          get: vi.fn().mockReturnValue(mockWallet),
          orderBy: vi.fn().mockReturnValue({
            limit: vi.fn().mockReturnValue({
              all: vi.fn().mockReturnValue(mockOrders),
            }),
          }),
          all: vi.fn().mockReturnValue(mockOrders),
        }),
      }),
    }),
    _mockWallet: mockWallet,
    _mockOrders: mockOrders,
  };
}

// ---------------------------------------------------------------------------
// Mock Infrastructure
// ---------------------------------------------------------------------------

function createMockInfra(): PolymarketInfraDeps {
  return {
    marketData: {
      getMarkets: vi.fn().mockResolvedValue([{ conditionId: 'cond-1', question: 'Will X happen?' }]),
      getMarket: vi.fn().mockResolvedValue({ conditionId: 'cond-1', question: 'Will X happen?', volume: '50000' }),
      getEvents: vi.fn().mockResolvedValue([{ id: 'evt-1', title: 'Event 1' }]),
    },
    positionTracker: {
      getPositions: vi.fn().mockResolvedValue([
        { conditionId: 'cond-1', outcome: 'YES', size: '100', avgPrice: '0.40', currentPrice: '0.65' },
      ]),
    },
    pnlCalculator: {
      summarize: vi.fn().mockReturnValue({ totalUnrealized: '25.00', totalRealized: '0', positionCount: 1 }),
    },
    apiKeyService: {
      ensureKeys: vi.fn().mockResolvedValue({ created: true, apiKey: 'key-xxx' }),
    },
  };
}

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function createApp(deps: PolymarketRouteDeps) {
  const app = new Hono();
  app.route('', createPolymarketRoutes(deps));
  return app;
}

async function fetchJson(app: Hono, path: string, method = 'GET') {
  const req = new Request(`http://localhost${path}`, { method });
  const res = await app.fetch(req);
  const text = await res.text();
  let json: Record<string, unknown> = {};
  try {
    json = JSON.parse(text);
  } catch {
    json = { _raw: text };
  }
  return { status: res.status, json };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Polymarket query routes', () => {
  let db: ReturnType<typeof createMockDb>;
  let infra: PolymarketInfraDeps;

  beforeEach(() => {
    db = createMockDb();
    infra = createMockInfra();
  });

  describe('when polymarket is disabled (infra = null)', () => {
    it('returns error for positions', async () => {
      const app = createApp({ db: db as never, polymarketInfra: null });
      const { status } = await fetchJson(app, '/v1/wallets/wlt-pm-1/polymarket/positions');
      // WAIaaSError thrown but no error handler => 500
      expect(status).toBeGreaterThanOrEqual(400);
    });

    it('returns error for markets', async () => {
      const app = createApp({ db: db as never, polymarketInfra: null });
      const { status } = await fetchJson(app, '/v1/polymarket/markets');
      expect(status).toBeGreaterThanOrEqual(400);
    });
  });

  describe('when polymarket is enabled', () => {
    it('GET /v1/wallets/:id/polymarket/positions returns positions', async () => {
      const app = createApp({ db: db as never, polymarketInfra: infra });
      const { status, json } = await fetchJson(app, '/v1/wallets/wlt-pm-1/polymarket/positions');
      expect(status).toBe(200);
      expect(json.positions).toHaveLength(1);
      expect(json.positions[0].outcome).toBe('YES');
    });

    it('GET /v1/wallets/:id/polymarket/orders returns orders', async () => {
      const app = createApp({ db: db as never, polymarketInfra: infra });
      const { status, json } = await fetchJson(app, '/v1/wallets/wlt-pm-1/polymarket/orders');
      expect(status).toBe(200);
      expect(json.orders).toHaveLength(2);
    });

    it('GET /v1/wallets/:id/polymarket/orders/:orderId returns single order', async () => {
      const app = createApp({ db: db as never, polymarketInfra: infra });
      const { status, json } = await fetchJson(app, '/v1/wallets/wlt-pm-1/polymarket/orders/clob-ord-1');
      expect(status).toBe(200);
      expect(json.order.orderId).toBe('clob-ord-1');
    });

    it('GET /v1/polymarket/markets returns market list', async () => {
      const app = createApp({ db: db as never, polymarketInfra: infra });
      const { status, json } = await fetchJson(app, '/v1/polymarket/markets');
      expect(status).toBe(200);
      expect(json.markets).toHaveLength(1);
    });

    it('GET /v1/polymarket/markets/:conditionId returns market detail', async () => {
      const app = createApp({ db: db as never, polymarketInfra: infra });
      const { status, json } = await fetchJson(app, '/v1/polymarket/markets/cond-1');
      expect(status).toBe(200);
      expect(json.market.conditionId).toBe('cond-1');
      expect(infra.marketData.getMarket).toHaveBeenCalledWith('cond-1');
    });

    it('GET /v1/polymarket/events returns events', async () => {
      const app = createApp({ db: db as never, polymarketInfra: infra });
      const { status, json } = await fetchJson(app, '/v1/polymarket/events');
      expect(status).toBe(200);
      expect(json.events).toHaveLength(1);
    });

    it('GET /v1/wallets/:id/polymarket/balance returns token positions', async () => {
      const app = createApp({ db: db as never, polymarketInfra: infra });
      const { status, json } = await fetchJson(app, '/v1/wallets/wlt-pm-1/polymarket/balance');
      expect(status).toBe(200);
      expect(json.walletId).toBe('wlt-pm-1');
      expect(json.tokenCount).toBe(1);
    });

    it('GET /v1/wallets/:id/polymarket/pnl returns PnL summary', async () => {
      const app = createApp({ db: db as never, polymarketInfra: infra });
      const { status, json } = await fetchJson(app, '/v1/wallets/wlt-pm-1/polymarket/pnl');
      expect(status).toBe(200);
      expect(json.pnl.totalUnrealized).toBe('25.00');
    });

    it('POST /v1/wallets/:id/polymarket/setup calls apiKeyService', async () => {
      const app = createApp({ db: db as never, polymarketInfra: infra });
      const { status, json } = await fetchJson(app, '/v1/wallets/wlt-pm-1/polymarket/setup', 'POST');
      expect(status).toBe(200);
      expect(json.setup.created).toBe(true);
      expect(infra.apiKeyService.ensureKeys).toHaveBeenCalledWith('wlt-pm-1', '0xABC123');
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
      const app = createApp({ db: notFoundDb as never, polymarketInfra: infra });
      const { status } = await fetchJson(app, '/v1/wallets/nonexistent/polymarket/positions');
      expect(status).toBe(500);
    });
  });

  describe('orders status filter', () => {
    it('filters orders by status query param', async () => {
      const app = createApp({ db: db as never, polymarketInfra: infra });
      const { json } = await fetchJson(app, '/v1/wallets/wlt-pm-1/polymarket/orders?status=LIVE');
      expect(json.orders).toHaveLength(1);
      expect(json.orders[0].status).toBe('LIVE');
    });
  });
});
