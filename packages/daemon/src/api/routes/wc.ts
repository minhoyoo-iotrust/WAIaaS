/**
 * WalletConnect route handlers:
 *
 * masterAuth (admin-only):
 *   POST   /v1/wallets/:id/wc/pair         - Create WC pairing and generate QR code
 *   GET    /v1/wallets/:id/wc/session       - Get current WC session info
 *   DELETE /v1/wallets/:id/wc/session       - Disconnect WC session
 *   GET    /v1/wallets/:id/wc/pair/status   - Poll pairing progress status
 *
 * sessionAuth (JWT session-scoped, walletId from JWT):
 *   POST   /v1/wallet/wc/pair              - Create WC pairing (session)
 *   GET    /v1/wallet/wc/session            - Get WC session info (session)
 *   DELETE /v1/wallet/wc/session            - Disconnect WC session (session)
 *   GET    /v1/wallet/wc/pair/status        - Poll pairing status (session)
 *
 * WC endpoints return 503 if WalletConnect is not configured (project_id missing).
 *
 * @see packages/daemon/src/services/wc-session-service.ts
 */

import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { WAIaaSError } from '@waiaas/core';
import type { WcSessionService, WcServiceRef } from '../../services/wc-session-service.js';
import type * as schema from '../../infrastructure/database/schema.js';
import {
  WcPairingResponseSchema,
  WcSessionResponseSchema,
  WcPairingStatusResponseSchema,
  WcDisconnectResponseSchema,
  buildErrorResponses,
  openApiValidationHook,
} from './openapi-schemas.js';

// ---------------------------------------------------------------------------
// Deps
// ---------------------------------------------------------------------------

export interface WcRouteDeps {
  db: BetterSQLite3Database<typeof schema>;
  wcServiceRef: WcServiceRef;
}

/** Guard: throw WC_NOT_CONFIGURED if service is null, return non-null service. */
function requireWcService(ref: WcServiceRef): WcSessionService {
  if (!ref.current) throw new WAIaaSError('WC_NOT_CONFIGURED');
  return ref.current;
}

// ---------------------------------------------------------------------------
// Route definitions
// ---------------------------------------------------------------------------

const createPairingRoute = createRoute({
  method: 'post',
  path: '/wallets/{id}/wc/pair',
  tags: ['WalletConnect'],
  summary: 'Create WC pairing and generate QR code',
  request: {
    params: z.object({ id: z.string().uuid() }),
  },
  responses: {
    200: {
      description: 'Pairing URI and QR code generated',
      content: { 'application/json': { schema: WcPairingResponseSchema } },
    },
    ...buildErrorResponses(['WALLET_NOT_FOUND', 'WC_NOT_CONFIGURED', 'WC_SESSION_EXISTS']),
  },
});

const getSessionRoute = createRoute({
  method: 'get',
  path: '/wallets/{id}/wc/session',
  tags: ['WalletConnect'],
  summary: 'Get current WC session info',
  request: {
    params: z.object({ id: z.string().uuid() }),
  },
  responses: {
    200: {
      description: 'Active WC session info',
      content: { 'application/json': { schema: WcSessionResponseSchema } },
    },
    ...buildErrorResponses(['WALLET_NOT_FOUND', 'WC_SESSION_NOT_FOUND']),
  },
});

const deleteSessionRoute = createRoute({
  method: 'delete',
  path: '/wallets/{id}/wc/session',
  tags: ['WalletConnect'],
  summary: 'Disconnect WC session',
  request: {
    params: z.object({ id: z.string().uuid() }),
  },
  responses: {
    200: {
      description: 'Session disconnected',
      content: { 'application/json': { schema: WcDisconnectResponseSchema } },
    },
    ...buildErrorResponses(['WALLET_NOT_FOUND', 'WC_NOT_CONFIGURED', 'WC_SESSION_NOT_FOUND']),
  },
});

const pairingStatusRoute = createRoute({
  method: 'get',
  path: '/wallets/{id}/wc/pair/status',
  tags: ['WalletConnect'],
  summary: 'Poll pairing progress status',
  request: {
    params: z.object({ id: z.string().uuid() }),
  },
  responses: {
    200: {
      description: 'Pairing status',
      content: { 'application/json': { schema: WcPairingStatusResponseSchema } },
    },
    ...buildErrorResponses(['WALLET_NOT_FOUND']),
  },
});

// ---------------------------------------------------------------------------
// Session-scoped route definitions (walletId from JWT, no :id param)
// ---------------------------------------------------------------------------

const sessionCreatePairingRoute = createRoute({
  method: 'post',
  path: '/wallet/wc/pair',
  tags: ['WalletConnect'],
  summary: 'Create WC pairing and generate QR code (session)',
  responses: {
    200: {
      description: 'Pairing URI and QR code generated',
      content: { 'application/json': { schema: WcPairingResponseSchema } },
    },
    ...buildErrorResponses(['WALLET_NOT_FOUND', 'WC_NOT_CONFIGURED', 'WC_SESSION_EXISTS']),
  },
});

const sessionGetSessionRoute = createRoute({
  method: 'get',
  path: '/wallet/wc/session',
  tags: ['WalletConnect'],
  summary: 'Get current WC session info (session)',
  responses: {
    200: {
      description: 'Active WC session info',
      content: { 'application/json': { schema: WcSessionResponseSchema } },
    },
    ...buildErrorResponses(['WALLET_NOT_FOUND', 'WC_SESSION_NOT_FOUND']),
  },
});

const sessionDeleteSessionRoute = createRoute({
  method: 'delete',
  path: '/wallet/wc/session',
  tags: ['WalletConnect'],
  summary: 'Disconnect WC session (session)',
  responses: {
    200: {
      description: 'Session disconnected',
      content: { 'application/json': { schema: WcDisconnectResponseSchema } },
    },
    ...buildErrorResponses(['WALLET_NOT_FOUND', 'WC_NOT_CONFIGURED', 'WC_SESSION_NOT_FOUND']),
  },
});

const sessionPairingStatusRoute = createRoute({
  method: 'get',
  path: '/wallet/wc/pair/status',
  tags: ['WalletConnect'],
  summary: 'Poll pairing progress status (session)',
  responses: {
    200: {
      description: 'Pairing status',
      content: { 'application/json': { schema: WcPairingStatusResponseSchema } },
    },
    ...buildErrorResponses(['WALLET_NOT_FOUND']),
  },
});

// ---------------------------------------------------------------------------
// Route factory (masterAuth)
// ---------------------------------------------------------------------------

/**
 * Create WalletConnect route sub-router (masterAuth, walletId from URL param).
 *
 * POST   /wallets/:id/wc/pair       -> create pairing, return QR code
 * GET    /wallets/:id/wc/session     -> get session info
 * DELETE /wallets/:id/wc/session     -> disconnect session
 * GET    /wallets/:id/wc/pair/status -> poll pairing status
 */
export function wcRoutes(deps: WcRouteDeps): OpenAPIHono {
  const router = new OpenAPIHono({ defaultHook: openApiValidationHook });
  const { db, wcServiceRef } = deps;

  // -------------------------------------------------------------------------
  // POST /wallets/:id/wc/pair
  // -------------------------------------------------------------------------

  router.openapi(createPairingRoute, async (c) => {
    const { id } = c.req.valid('param');

    // Look up wallet via raw SQL (simpler, avoids Drizzle query builder complexity)
    const sqlite = (db as any).session?.client as import('better-sqlite3').Database;
    const wallet = sqlite
      .prepare('SELECT id, chain, default_network, environment, status, owner_address FROM wallets WHERE id = ?')
      .get(id) as { id: string; chain: string; default_network: string | null; environment: string; status: string; owner_address: string | null } | undefined;

    if (!wallet) {
      throw new WAIaaSError('WALLET_NOT_FOUND');
    }
    if (wallet.status === 'TERMINATED') {
      throw new WAIaaSError('WALLET_TERMINATED');
    }
    if (!wallet.owner_address) {
      throw new WAIaaSError('OWNER_NOT_SET', {
        message: 'Owner address must be set before connecting WalletConnect',
      });
    }

    const svc = requireWcService(wcServiceRef);
    const network = wallet.default_network ?? wallet.environment;
    const result = await svc.createPairing(id, network, wallet.chain);

    return c.json(
      {
        uri: result.uri,
        qrCode: result.qrDataUrl,
        expiresAt: result.expiresAt,
      },
      200,
    );
  });

  // -------------------------------------------------------------------------
  // GET /wallets/:id/wc/session
  // -------------------------------------------------------------------------

  router.openapi(getSessionRoute, async (c) => {
    const { id } = c.req.valid('param');
    const svc = requireWcService(wcServiceRef);

    // Verify wallet exists
    const sqlite = (db as any).session?.client as import('better-sqlite3').Database;
    const wallet = sqlite
      .prepare('SELECT id FROM wallets WHERE id = ?')
      .get(id) as { id: string } | undefined;

    if (!wallet) {
      throw new WAIaaSError('WALLET_NOT_FOUND');
    }

    const session = svc.getSessionInfo(id);
    if (!session) {
      throw new WAIaaSError('WC_SESSION_NOT_FOUND');
    }

    return c.json(session, 200);
  });

  // -------------------------------------------------------------------------
  // DELETE /wallets/:id/wc/session
  // -------------------------------------------------------------------------

  router.openapi(deleteSessionRoute, async (c) => {
    const { id } = c.req.valid('param');
    const svc = requireWcService(wcServiceRef);

    // Verify wallet exists
    const sqlite = (db as any).session?.client as import('better-sqlite3').Database;
    const wallet = sqlite
      .prepare('SELECT id FROM wallets WHERE id = ?')
      .get(id) as { id: string } | undefined;

    if (!wallet) {
      throw new WAIaaSError('WALLET_NOT_FOUND');
    }

    await svc.disconnectSession(id);

    return c.json({ disconnected: true }, 200);
  });

  // -------------------------------------------------------------------------
  // GET /wallets/:id/wc/pair/status
  // -------------------------------------------------------------------------

  router.openapi(pairingStatusRoute, async (c) => {
    const { id } = c.req.valid('param');
    const svc = requireWcService(wcServiceRef);

    // Verify wallet exists
    const sqlite = (db as any).session?.client as import('better-sqlite3').Database;
    const wallet = sqlite
      .prepare('SELECT id FROM wallets WHERE id = ?')
      .get(id) as { id: string } | undefined;

    if (!wallet) {
      throw new WAIaaSError('WALLET_NOT_FOUND');
    }

    const status = svc.getPairingStatus(id);
    const session = status === 'connected' ? svc.getSessionInfo(id) : null;

    return c.json({ status, session: session ?? null }, 200);
  });

  return router;
}

// ---------------------------------------------------------------------------
// Route factory (sessionAuth -- walletId from JWT)
// ---------------------------------------------------------------------------

/**
 * Create WalletConnect session-scoped sub-router (sessionAuth, walletId from JWT).
 *
 * POST   /wallet/wc/pair       -> create pairing
 * GET    /wallet/wc/session     -> get session info
 * DELETE /wallet/wc/session     -> disconnect session
 * GET    /wallet/wc/pair/status -> poll pairing status
 */
export function wcSessionRoutes(deps: WcRouteDeps): OpenAPIHono {
  const router = new OpenAPIHono({ defaultHook: openApiValidationHook });
  const { db, wcServiceRef } = deps;

  // Helper: get walletId from sessionAuth JWT context
  const getWalletId = (c: any): string => {
    const walletId = c.get('walletId') as string | undefined;
    if (!walletId) throw new WAIaaSError('WALLET_NOT_FOUND');
    return walletId;
  };

  // Helper: raw SQL lookup for wallet
  const lookupWallet = (walletId: string) => {
    const sqlite = (db as any).session?.client as import('better-sqlite3').Database;
    return sqlite
      .prepare('SELECT id, chain, default_network, environment, status, owner_address FROM wallets WHERE id = ?')
      .get(walletId) as { id: string; chain: string; default_network: string | null; environment: string; status: string; owner_address: string | null } | undefined;
  };

  // -------------------------------------------------------------------------
  // POST /wallet/wc/pair
  // -------------------------------------------------------------------------

  router.openapi(sessionCreatePairingRoute, async (c) => {
    const walletId = getWalletId(c);
    const wallet = lookupWallet(walletId);
    if (!wallet) throw new WAIaaSError('WALLET_NOT_FOUND');
    if (wallet.status === 'TERMINATED') throw new WAIaaSError('WALLET_TERMINATED');
    if (!wallet.owner_address) {
      throw new WAIaaSError('OWNER_NOT_SET', {
        message: 'Owner address must be set before connecting WalletConnect',
      });
    }

    const svc = requireWcService(wcServiceRef);
    const network = wallet.default_network ?? wallet.environment;
    const result = await svc.createPairing(walletId, network, wallet.chain);

    return c.json(
      {
        uri: result.uri,
        qrCode: result.qrDataUrl,
        expiresAt: result.expiresAt,
      },
      200,
    );
  });

  // -------------------------------------------------------------------------
  // GET /wallet/wc/session
  // -------------------------------------------------------------------------

  router.openapi(sessionGetSessionRoute, async (c) => {
    const walletId = getWalletId(c);
    const svc = requireWcService(wcServiceRef);

    const sqlite = (db as any).session?.client as import('better-sqlite3').Database;
    const wallet = sqlite
      .prepare('SELECT id FROM wallets WHERE id = ?')
      .get(walletId) as { id: string } | undefined;
    if (!wallet) throw new WAIaaSError('WALLET_NOT_FOUND');

    const session = svc.getSessionInfo(walletId);
    if (!session) throw new WAIaaSError('WC_SESSION_NOT_FOUND');

    return c.json(session, 200);
  });

  // -------------------------------------------------------------------------
  // DELETE /wallet/wc/session
  // -------------------------------------------------------------------------

  router.openapi(sessionDeleteSessionRoute, async (c) => {
    const walletId = getWalletId(c);
    const svc = requireWcService(wcServiceRef);

    const sqlite = (db as any).session?.client as import('better-sqlite3').Database;
    const wallet = sqlite
      .prepare('SELECT id FROM wallets WHERE id = ?')
      .get(walletId) as { id: string } | undefined;
    if (!wallet) throw new WAIaaSError('WALLET_NOT_FOUND');

    await svc.disconnectSession(walletId);

    return c.json({ disconnected: true }, 200);
  });

  // -------------------------------------------------------------------------
  // GET /wallet/wc/pair/status
  // -------------------------------------------------------------------------

  router.openapi(sessionPairingStatusRoute, async (c) => {
    const walletId = getWalletId(c);
    const svc = requireWcService(wcServiceRef);

    const sqlite = (db as any).session?.client as import('better-sqlite3').Database;
    const wallet = sqlite
      .prepare('SELECT id FROM wallets WHERE id = ?')
      .get(walletId) as { id: string } | undefined;
    if (!wallet) throw new WAIaaSError('WALLET_NOT_FOUND');

    const status = svc.getPairingStatus(walletId);
    const session = status === 'connected' ? svc.getSessionInfo(walletId) : null;

    return c.json({ status, session: session ?? null }, 200);
  });

  return router;
}
