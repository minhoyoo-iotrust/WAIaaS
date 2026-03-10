/**
 * Polymarket query routes (GET/POST endpoints, no pipeline).
 *
 * Action endpoints (POST) go through the generic /v1/actions/polymarket_order/:action route.
 * These query endpoints call PolymarketInfrastructure directly for read-only operations.
 *
 * @see design doc 80, Section 9.1
 */

import { Hono } from 'hono';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type * as schema from '../../infrastructure/database/schema.js';
import { wallets, polymarketOrders } from '../../infrastructure/database/schema.js';
import { eq, desc } from 'drizzle-orm';
import { WAIaaSError } from '@waiaas/core';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Minimal PolymarketInfrastructure shape to avoid importing full @waiaas/actions */
export interface PolymarketInfraDeps {
  marketData: {
    getMarkets(filter?: Record<string, unknown>): Promise<unknown[]>;
    getMarket(conditionId: string): Promise<unknown>;
    getEvents(filter?: Record<string, unknown>): Promise<unknown[]>;
  };
  positionTracker: {
    getPositions(walletId: string): Promise<unknown[]>;
  } | null;
  pnlCalculator: {
    summarize(positions: unknown[]): unknown;
  };
  apiKeyService: {
    ensureKeys(walletId: string, walletAddress: string): Promise<unknown>;
  };
}

export interface PolymarketRouteDeps {
  db: BetterSQLite3Database<typeof schema>;
  polymarketInfra: PolymarketInfraDeps | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function ensurePolymarketInfra(infra: PolymarketInfraDeps | null): PolymarketInfraDeps {
  if (!infra) {
    throw new WAIaaSError('ACTION_VALIDATION_FAILED', {
      message: 'Polymarket integration is not enabled',
    });
  }
  return infra;
}

async function resolveWallet(
  db: BetterSQLite3Database<typeof schema>,
  walletId: string,
): Promise<{ id: string; publicKey: string }> {
  const wallet = await db
    .select({ id: wallets.id, publicKey: wallets.publicKey })
    .from(wallets)
    .where(eq(wallets.id, walletId))
    .get();
  if (!wallet) {
    throw new WAIaaSError('WALLET_NOT_FOUND', {
      message: `Wallet ${walletId} not found`,
    });
  }
  return wallet;
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

export function createPolymarketRoutes(deps: PolymarketRouteDeps) {
  const app = new Hono();

  // GET /v1/wallets/:walletId/polymarket/positions
  app.get('/v1/wallets/:walletId/polymarket/positions', async (c) => {
    const infra = ensurePolymarketInfra(deps.polymarketInfra);
    const walletId = c.req.param('walletId');
    await resolveWallet(deps.db, walletId);
    if (!infra.positionTracker) {
      return c.json({ positions: [] });
    }
    const positions = await infra.positionTracker.getPositions(walletId);
    return c.json({ positions });
  });

  // GET /v1/wallets/:walletId/polymarket/orders
  app.get('/v1/wallets/:walletId/polymarket/orders', async (c) => {
    ensurePolymarketInfra(deps.polymarketInfra);
    const walletId = c.req.param('walletId');
    await resolveWallet(deps.db, walletId);
    const statusFilter = c.req.query('status');
    let query = deps.db
      .select()
      .from(polymarketOrders)
      .where(eq(polymarketOrders.walletId, walletId))
      .orderBy(desc(polymarketOrders.createdAt))
      .limit(50);
    const rows = await query.all();
    const filtered = statusFilter
      ? rows.filter((r) => r.status === statusFilter)
      : rows;
    return c.json({ orders: filtered });
  });

  // GET /v1/wallets/:walletId/polymarket/orders/:orderId
  app.get('/v1/wallets/:walletId/polymarket/orders/:orderId', async (c) => {
    ensurePolymarketInfra(deps.polymarketInfra);
    const walletId = c.req.param('walletId');
    const orderId = c.req.param('orderId');
    await resolveWallet(deps.db, walletId);
    const rows = await deps.db
      .select()
      .from(polymarketOrders)
      .where(eq(polymarketOrders.walletId, walletId))
      .all();
    const order = rows.find((r) => r.orderId === orderId);
    if (!order) {
      throw new WAIaaSError('ACTION_VALIDATION_FAILED', {
        message: `Order ${orderId} not found`,
      });
    }
    return c.json({ order });
  });

  // GET /v1/polymarket/markets
  app.get('/v1/polymarket/markets', async (c) => {
    const infra = ensurePolymarketInfra(deps.polymarketInfra);
    const keyword = c.req.query('keyword');
    const category = c.req.query('category');
    const status = c.req.query('status');
    const limitStr = c.req.query('limit');
    const filter: Record<string, unknown> = {};
    if (keyword) filter.keyword = keyword;
    if (category) filter.category = category;
    if (status) filter.status = status;
    if (limitStr) filter.limit = parseInt(limitStr, 10);
    const markets = await infra.marketData.getMarkets(Object.keys(filter).length > 0 ? filter : undefined);
    return c.json({ markets });
  });

  // GET /v1/polymarket/markets/:conditionId
  app.get('/v1/polymarket/markets/:conditionId', async (c) => {
    const infra = ensurePolymarketInfra(deps.polymarketInfra);
    const conditionId = c.req.param('conditionId');
    const detail = await infra.marketData.getMarket(conditionId);
    return c.json({ market: detail });
  });

  // GET /v1/polymarket/events
  app.get('/v1/polymarket/events', async (c) => {
    const infra = ensurePolymarketInfra(deps.polymarketInfra);
    const category = c.req.query('category');
    const filter: Record<string, unknown> = {};
    if (category) filter.category = category;
    const events = await infra.marketData.getEvents(Object.keys(filter).length > 0 ? filter : undefined);
    return c.json({ events });
  });

  // GET /v1/wallets/:walletId/polymarket/balance
  app.get('/v1/wallets/:walletId/polymarket/balance', async (c) => {
    const infra = ensurePolymarketInfra(deps.polymarketInfra);
    const walletId = c.req.param('walletId');
    await resolveWallet(deps.db, walletId);
    // Return positions as proxy for balance (CTF token holdings)
    const positions = infra.positionTracker
      ? await infra.positionTracker.getPositions(walletId)
      : [];
    return c.json({ walletId, positions, tokenCount: positions.length });
  });

  // GET /v1/wallets/:walletId/polymarket/pnl
  app.get('/v1/wallets/:walletId/polymarket/pnl', async (c) => {
    const infra = ensurePolymarketInfra(deps.polymarketInfra);
    const walletId = c.req.param('walletId');
    await resolveWallet(deps.db, walletId);
    const positions = infra.positionTracker
      ? await infra.positionTracker.getPositions(walletId)
      : [];
    const summary = infra.pnlCalculator.summarize(positions);
    return c.json({ walletId, pnl: summary });
  });

  // POST /v1/wallets/:walletId/polymarket/setup
  app.post('/v1/wallets/:walletId/polymarket/setup', async (c) => {
    const infra = ensurePolymarketInfra(deps.polymarketInfra);
    const walletId = c.req.param('walletId');
    const wallet = await resolveWallet(deps.db, walletId);
    const result = await infra.apiKeyService.ensureKeys(walletId, wallet.publicKey);
    return c.json({ walletId, setup: result });
  });

  return app;
}
