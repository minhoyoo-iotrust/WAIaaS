/**
 * Hyperliquid query routes (GET endpoints, no pipeline).
 *
 * Action endpoints (POST) go through the generic /v1/actions/hyperliquid_perp/:action route.
 * These query endpoints call MarketData directly for read-only operations.
 *
 * @see HDESIGN-05: REST API design
 */

import { Hono } from 'hono';
import type { HyperliquidMarketData } from '@waiaas/actions';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type * as schema from '../../infrastructure/database/schema.js';
import { wallets } from '../../infrastructure/database/schema.js';
import { eq } from 'drizzle-orm';
import { WAIaaSError } from '@waiaas/core';
import type { Hex } from 'viem';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface HyperliquidRouteDeps {
  db: BetterSQLite3Database<typeof schema>;
  marketData: HyperliquidMarketData | null;
}

// ---------------------------------------------------------------------------
// Helper: resolve wallet address
// ---------------------------------------------------------------------------

async function resolveWalletAddress(
  db: BetterSQLite3Database<typeof schema>,
  walletId: string,
): Promise<string> {
  const wallet = await db
    .select({ publicKey: wallets.publicKey })
    .from(wallets)
    .where(eq(wallets.id, walletId))
    .get();
  if (!wallet) {
    throw new WAIaaSError('WALLET_NOT_FOUND', {
      message: `Wallet ${walletId} not found`,
    });
  }
  return wallet.publicKey;
}

function ensureMarketData(md: HyperliquidMarketData | null): HyperliquidMarketData {
  if (!md) {
    throw new WAIaaSError('ACTION_VALIDATION_FAILED', {
      message: 'Hyperliquid integration is not enabled',
    });
  }
  return md;
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

export function createHyperliquidRoutes(deps: HyperliquidRouteDeps) {
  const app = new Hono();

  // GET /v1/wallets/:walletId/hyperliquid/positions
  app.get('/v1/wallets/:walletId/hyperliquid/positions', async (c) => {
    const md = ensureMarketData(deps.marketData);
    const walletId = c.req.param('walletId');
    const subAccount = c.req.query('subAccount');
    const address = await resolveWalletAddress(deps.db, walletId);
    const positions = await md.getPositions(address as Hex, subAccount as Hex | undefined);
    return c.json({ positions });
  });

  // GET /v1/wallets/:walletId/hyperliquid/orders
  app.get('/v1/wallets/:walletId/hyperliquid/orders', async (c) => {
    const md = ensureMarketData(deps.marketData);
    const walletId = c.req.param('walletId');
    const subAccount = c.req.query('subAccount');
    const address = await resolveWalletAddress(deps.db, walletId);
    const orders = await md.getOpenOrders(address as Hex, subAccount as Hex | undefined);
    return c.json({ orders });
  });

  // GET /v1/hyperliquid/markets
  app.get('/v1/hyperliquid/markets', async (c) => {
    const md = ensureMarketData(deps.marketData);
    const markets = await md.getMarkets();
    return c.json({ markets });
  });

  // GET /v1/hyperliquid/funding-rates
  app.get('/v1/hyperliquid/funding-rates', async (c) => {
    const md = ensureMarketData(deps.marketData);
    const market = c.req.query('market');
    if (!market) {
      throw new WAIaaSError('ACTION_VALIDATION_FAILED', {
        message: 'market query parameter is required',
      });
    }
    const startTime = c.req.query('startTime');
    const start = startTime ? parseInt(startTime, 10) : 0;
    const rates = await md.getFundingHistory(market, start);
    return c.json({ rates });
  });

  // GET /v1/wallets/:walletId/hyperliquid/account
  app.get('/v1/wallets/:walletId/hyperliquid/account', async (c) => {
    const md = ensureMarketData(deps.marketData);
    const walletId = c.req.param('walletId');
    const address = await resolveWalletAddress(deps.db, walletId);
    const state = await md.getAccountState(address as Hex);
    return c.json({ state });
  });

  // GET /v1/wallets/:walletId/hyperliquid/fills
  app.get('/v1/wallets/:walletId/hyperliquid/fills', async (c) => {
    const md = ensureMarketData(deps.marketData);
    const walletId = c.req.param('walletId');
    const limitStr = c.req.query('limit');
    const address = await resolveWalletAddress(deps.db, walletId);
    const limit = limitStr ? parseInt(limitStr, 10) : undefined;
    const fills = await md.getUserFills(address as Hex, limit);
    return c.json({ fills });
  });

  return app;
}
