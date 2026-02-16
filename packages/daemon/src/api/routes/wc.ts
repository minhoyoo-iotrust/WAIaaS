/**
 * WalletConnect route handlers:
 *   POST   /v1/wallets/:id/wc/pair         - Create WC pairing and generate QR code
 *   GET    /v1/wallets/:id/wc/session       - Get current WC session info
 *   DELETE /v1/wallets/:id/wc/session       - Disconnect WC session
 *   GET    /v1/wallets/:id/wc/pair/status   - Poll pairing progress status
 *
 * All endpoints require masterAuth (admin-only).
 * WC endpoints return 503 if WalletConnect is not configured (project_id missing).
 *
 * @see packages/daemon/src/services/wc-session-service.ts
 */

import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { WAIaaSError } from '@waiaas/core';
import type { WcSessionService } from '../../services/wc-session-service.js';
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
  wcSessionService: WcSessionService;
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
// Route factory
// ---------------------------------------------------------------------------

/**
 * Create WalletConnect route sub-router.
 *
 * POST   /wallets/:id/wc/pair       -> create pairing, return QR code
 * GET    /wallets/:id/wc/session     -> get session info
 * DELETE /wallets/:id/wc/session     -> disconnect session
 * GET    /wallets/:id/wc/pair/status -> poll pairing status
 */
export function wcRoutes(deps: WcRouteDeps): OpenAPIHono {
  const router = new OpenAPIHono({ defaultHook: openApiValidationHook });
  const { db, wcSessionService } = deps;

  // -------------------------------------------------------------------------
  // POST /wallets/:id/wc/pair
  // -------------------------------------------------------------------------

  router.openapi(createPairingRoute, async (c) => {
    const { id } = c.req.valid('param');

    // Look up wallet via raw SQL (simpler, avoids Drizzle query builder complexity)
    const sqlite = (db as any).session?.client as import('better-sqlite3').Database;
    const wallet = sqlite
      .prepare('SELECT id, chain, default_network, environment FROM wallets WHERE id = ?')
      .get(id) as { id: string; chain: string; default_network: string | null; environment: string } | undefined;

    if (!wallet) {
      throw new WAIaaSError('WALLET_NOT_FOUND');
    }

    const network = wallet.default_network ?? wallet.environment;
    const result = await wcSessionService.createPairing(id, network, wallet.chain);

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

    // Verify wallet exists
    const sqlite = (db as any).session?.client as import('better-sqlite3').Database;
    const wallet = sqlite
      .prepare('SELECT id FROM wallets WHERE id = ?')
      .get(id) as { id: string } | undefined;

    if (!wallet) {
      throw new WAIaaSError('WALLET_NOT_FOUND');
    }

    const session = wcSessionService.getSessionInfo(id);
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

    // Verify wallet exists
    const sqlite = (db as any).session?.client as import('better-sqlite3').Database;
    const wallet = sqlite
      .prepare('SELECT id FROM wallets WHERE id = ?')
      .get(id) as { id: string } | undefined;

    if (!wallet) {
      throw new WAIaaSError('WALLET_NOT_FOUND');
    }

    await wcSessionService.disconnectSession(id);

    return c.json({ disconnected: true }, 200);
  });

  // -------------------------------------------------------------------------
  // GET /wallets/:id/wc/pair/status
  // -------------------------------------------------------------------------

  router.openapi(pairingStatusRoute, async (c) => {
    const { id } = c.req.valid('param');

    // Verify wallet exists
    const sqlite = (db as any).session?.client as import('better-sqlite3').Database;
    const wallet = sqlite
      .prepare('SELECT id FROM wallets WHERE id = ?')
      .get(id) as { id: string } | undefined;

    if (!wallet) {
      throw new WAIaaSError('WALLET_NOT_FOUND');
    }

    const status = wcSessionService.getPairingStatus(id);
    const session = status === 'connected' ? wcSessionService.getSessionInfo(id) : null;

    return c.json({ status, session: session ?? null }, 200);
  });

  return router;
}
