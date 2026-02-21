/**
 * Session routes: POST /sessions (create + JWT issuance),
 * GET /sessions (list active), DELETE /sessions/:id (revoke),
 * PUT /sessions/:id/renew (token renewal with 5 safety checks),
 * POST /sessions/:id/wallets (add wallet),
 * DELETE /sessions/:id/wallets/:walletId (remove wallet),
 * PATCH /sessions/:id/wallets/:walletId/default (set default),
 * GET /sessions/:id/wallets (list wallets).
 *
 * CRUD routes are protected by masterAuth middleware at the server level.
 * Renewal route is protected by sessionAuth (session's own token).
 *
 * v26.4: Multi-wallet session model via session_wallets junction table.
 *
 * @see docs/52-auth-redesign.md
 * @see docs/37-rest-api-complete-spec.md
 */

import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import { createHash } from 'node:crypto';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { eq, and, isNull, gt, sql } from 'drizzle-orm';
import { WAIaaSError, type EventBus } from '@waiaas/core';
import type { JwtSecretManager, JwtPayload } from '../../infrastructure/jwt/index.js';
import { generateId } from '../../infrastructure/database/id.js';
import { wallets, sessions, sessionWallets } from '../../infrastructure/database/schema.js';
import type * as schema from '../../infrastructure/database/schema.js';
import type { DaemonConfig } from '../../infrastructure/config/loader.js';
import type { NotificationService } from '../../notifications/notification-service.js';
import {
  CreateSessionRequestOpenAPI,
  SessionCreateResponseSchema,
  SessionListItemSchema,
  SessionRevokeResponseSchema,
  SessionRenewResponseSchema,
  SessionWalletSchema,
  SessionWalletListSchema,
  SessionDefaultWalletSchema,
  buildErrorResponses,
  openApiValidationHook,
} from './openapi-schemas.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SessionRouteDeps {
  db: BetterSQLite3Database<typeof schema>;
  jwtSecretManager: JwtSecretManager;
  config: DaemonConfig;
  notificationService?: NotificationService;
  eventBus?: EventBus;
}

// ---------------------------------------------------------------------------
// Route definitions
// ---------------------------------------------------------------------------

const createSessionRoute = createRoute({
  method: 'post',
  path: '/sessions',
  tags: ['Sessions'],
  summary: 'Create a new session',
  request: {
    body: {
      content: {
        'application/json': { schema: CreateSessionRequestOpenAPI },
      },
    },
  },
  responses: {
    201: {
      description: 'Session created with JWT token',
      content: { 'application/json': { schema: SessionCreateResponseSchema } },
    },
    ...buildErrorResponses(['WALLET_NOT_FOUND', 'SESSION_LIMIT_EXCEEDED']),
  },
});

const listSessionsRoute = createRoute({
  method: 'get',
  path: '/sessions',
  tags: ['Sessions'],
  summary: 'List active sessions',
  request: {
    query: z.object({
      walletId: z.string().uuid().optional(),
    }),
  },
  responses: {
    200: {
      description: 'List of active sessions',
      content: { 'application/json': { schema: z.array(SessionListItemSchema) } },
    },
    ...buildErrorResponses(['WALLET_NOT_FOUND']),
  },
});

const revokeSessionRoute = createRoute({
  method: 'delete',
  path: '/sessions/{id}',
  tags: ['Sessions'],
  summary: 'Revoke a session',
  request: {
    params: z.object({ id: z.string().uuid() }),
  },
  responses: {
    200: {
      description: 'Session revoked',
      content: { 'application/json': { schema: SessionRevokeResponseSchema } },
    },
    ...buildErrorResponses(['SESSION_NOT_FOUND']),
  },
});

const renewSessionRoute = createRoute({
  method: 'put',
  path: '/sessions/{id}/renew',
  tags: ['Sessions'],
  summary: 'Renew session token',
  request: {
    params: z.object({ id: z.string().uuid() }),
  },
  responses: {
    200: {
      description: 'Session renewed with new token',
      content: { 'application/json': { schema: SessionRenewResponseSchema } },
    },
    ...buildErrorResponses([
      'SESSION_NOT_FOUND',
      'SESSION_REVOKED',
      'SESSION_RENEWAL_MISMATCH',
      'RENEWAL_LIMIT_REACHED',
      'SESSION_ABSOLUTE_LIFETIME_EXCEEDED',
      'RENEWAL_TOO_EARLY',
    ]),
  },
});

// ---------------------------------------------------------------------------
// Session-Wallet Management Route Definitions (v26.4)
// ---------------------------------------------------------------------------

const addWalletRoute = createRoute({
  method: 'post',
  path: '/sessions/{id}/wallets',
  tags: ['Sessions'],
  summary: 'Add wallet to session',
  request: {
    params: z.object({ id: z.string().uuid() }),
    body: { content: { 'application/json': { schema: z.object({ walletId: z.string().uuid() }) } } },
  },
  responses: {
    201: {
      description: 'Wallet added',
      content: { 'application/json': { schema: SessionWalletSchema } },
    },
    ...buildErrorResponses(['SESSION_NOT_FOUND', 'WALLET_NOT_FOUND', 'WALLET_ALREADY_LINKED', 'SESSION_LIMIT_EXCEEDED']),
  },
});

const removeWalletRoute = createRoute({
  method: 'delete',
  path: '/sessions/{id}/wallets/{walletId}',
  tags: ['Sessions'],
  summary: 'Remove wallet from session',
  request: {
    params: z.object({ id: z.string().uuid(), walletId: z.string().uuid() }),
  },
  responses: {
    204: { description: 'Wallet removed' },
    ...buildErrorResponses(['SESSION_NOT_FOUND', 'CANNOT_REMOVE_DEFAULT_WALLET', 'SESSION_REQUIRES_WALLET']),
  },
});

const setDefaultWalletRoute = createRoute({
  method: 'patch',
  path: '/sessions/{id}/wallets/{walletId}/default',
  tags: ['Sessions'],
  summary: 'Set default wallet for session',
  request: {
    params: z.object({ id: z.string().uuid(), walletId: z.string().uuid() }),
  },
  responses: {
    200: {
      description: 'Default wallet changed',
      content: { 'application/json': { schema: SessionDefaultWalletSchema } },
    },
    ...buildErrorResponses(['SESSION_NOT_FOUND']),
  },
});

const listSessionWalletsRoute = createRoute({
  method: 'get',
  path: '/sessions/{id}/wallets',
  tags: ['Sessions'],
  summary: 'List wallets linked to session',
  request: {
    params: z.object({ id: z.string().uuid() }),
  },
  responses: {
    200: {
      description: 'Session wallet list',
      content: { 'application/json': { schema: SessionWalletListSchema } },
    },
    ...buildErrorResponses(['SESSION_NOT_FOUND']),
  },
});

// ---------------------------------------------------------------------------
// Route factory
// ---------------------------------------------------------------------------

/**
 * Create session route sub-router.
 *
 * POST /sessions                            -> create session + JWT issuance (201)
 * GET /sessions                             -> list active sessions for wallet (200)
 * DELETE /sessions/:id                      -> revoke session (200)
 * PUT /sessions/:id/renew                   -> renew session token (200)
 * POST /sessions/:id/wallets                -> add wallet to session (201)
 * DELETE /sessions/:id/wallets/:walletId    -> remove wallet from session (204)
 * PATCH /sessions/:id/wallets/:wId/default  -> set default wallet (200)
 * GET /sessions/:id/wallets                 -> list session wallets (200)
 */
export function sessionRoutes(deps: SessionRouteDeps): OpenAPIHono {
  const router = new OpenAPIHono({ defaultHook: openApiValidationHook });

  // -------------------------------------------------------------------------
  // POST /sessions -- create a new session
  // -------------------------------------------------------------------------
  router.openapi(createSessionRoute, async (c) => {
    const parsed = c.req.valid('json');

    // Normalize walletId/walletIds
    const walletIds: string[] = parsed.walletIds ?? (parsed.walletId ? [parsed.walletId] : []);
    const defaultWalletId = parsed.defaultWalletId ?? walletIds[0]!;

    // Verify all wallets exist and are active
    for (const wId of walletIds) {
      const wallet = deps.db
        .select()
        .from(wallets)
        .where(eq(wallets.id, wId))
        .get();

      if (!wallet) {
        throw new WAIaaSError('WALLET_NOT_FOUND');
      }
      if (wallet.status === 'TERMINATED') {
        throw new WAIaaSError('WALLET_TERMINATED');
      }
    }

    // Check active session count for each wallet (via session_wallets JOIN)
    const nowSec = Math.floor(Date.now() / 1000);
    const nowDate = new Date(nowSec * 1000);
    const maxSessions = deps.config.security.max_sessions_per_wallet;

    for (const wId of walletIds) {
      const activeCountResult = deps.db
        .select({ count: sql<number>`count(*)` })
        .from(sessionWallets)
        .innerJoin(sessions, eq(sessionWallets.sessionId, sessions.id))
        .where(
          and(
            eq(sessionWallets.walletId, wId),
            isNull(sessions.revokedAt),
            gt(sessions.expiresAt, nowDate),
          ),
        )
        .get();

      const activeCount = activeCountResult?.count ?? 0;
      if (activeCount >= maxSessions) {
        throw new WAIaaSError('SESSION_LIMIT_EXCEEDED', {
          message: `Wallet ${wId} has reached session limit (max: ${maxSessions})`,
        });
      }
    }

    // Generate session ID
    const sessionId = generateId();

    // Compute TTL and expiry timestamps
    const ttl = parsed.ttl ?? deps.config.security.session_ttl;
    const expiresAt = nowSec + ttl;
    const absoluteExpiresAt = nowSec + deps.config.security.session_absolute_lifetime;

    // Create JWT payload with defaultWalletId
    const jwtPayload: JwtPayload = {
      sub: sessionId,
      wlt: defaultWalletId,
      iat: nowSec,
      exp: expiresAt,
    };
    const token = await deps.jwtSecretManager.signToken(jwtPayload);

    // Compute token hash for storage (never store raw token)
    const tokenHash = createHash('sha256').update(token).digest('hex');

    // Insert session into DB (no walletId column -- uses session_wallets)
    deps.db.insert(sessions).values({
      id: sessionId,
      tokenHash,
      expiresAt: new Date(expiresAt * 1000),
      absoluteExpiresAt: new Date(absoluteExpiresAt * 1000),
      createdAt: new Date(nowSec * 1000),
      renewalCount: 0,
      maxRenewals: deps.config.security.session_max_renewals,
      constraints: parsed.constraints ? JSON.stringify(parsed.constraints) : null,
    }).run();

    // Insert session_wallets rows for each wallet
    for (const wId of walletIds) {
      deps.db.insert(sessionWallets).values({
        sessionId,
        walletId: wId,
        isDefault: wId === defaultWalletId,
        createdAt: new Date(nowSec * 1000),
      }).run();
    }

    // Build wallets array for response
    const walletRows = walletIds.map((wId) => {
      const w = deps.db.select().from(wallets).where(eq(wallets.id, wId)).get()!;
      return { id: w.id, name: w.name, isDefault: wId === defaultWalletId };
    });

    // Fire-and-forget: notify session creation
    void deps.notificationService?.notify('SESSION_CREATED', defaultWalletId, {
      sessionId,
    });

    // v1.6: emit wallet:activity SESSION_CREATED event
    deps.eventBus?.emit('wallet:activity', {
      walletId: defaultWalletId,
      activity: 'SESSION_CREATED',
      details: { sessionId },
      timestamp: Math.floor(Date.now() / 1000),
    });

    return c.json(
      {
        id: sessionId,
        token,
        expiresAt,
        walletId: defaultWalletId,
        wallets: walletRows,
      },
      201,
    );
  });

  // -------------------------------------------------------------------------
  // GET /sessions -- list active sessions
  // -------------------------------------------------------------------------
  router.openapi(listSessionsRoute, (c) => {
    const { walletId: filterWalletId } = c.req.valid('query');

    // Base query: all non-revoked sessions
    let sessionRows;
    if (filterWalletId) {
      // Filter by wallet: JOIN session_wallets to find sessions linked to this wallet
      sessionRows = deps.db
        .select({
          id: sessions.id,
          expiresAt: sessions.expiresAt,
          absoluteExpiresAt: sessions.absoluteExpiresAt,
          createdAt: sessions.createdAt,
          renewalCount: sessions.renewalCount,
          maxRenewals: sessions.maxRenewals,
          lastRenewedAt: sessions.lastRenewedAt,
          source: sessions.source,
        })
        .from(sessions)
        .innerJoin(sessionWallets, eq(sessions.id, sessionWallets.sessionId))
        .where(
          and(
            isNull(sessions.revokedAt),
            eq(sessionWallets.walletId, filterWalletId),
          ),
        )
        .orderBy(sql`${sessions.createdAt} DESC`)
        .all();
    } else {
      sessionRows = deps.db
        .select({
          id: sessions.id,
          expiresAt: sessions.expiresAt,
          absoluteExpiresAt: sessions.absoluteExpiresAt,
          createdAt: sessions.createdAt,
          renewalCount: sessions.renewalCount,
          maxRenewals: sessions.maxRenewals,
          lastRenewedAt: sessions.lastRenewedAt,
          source: sessions.source,
        })
        .from(sessions)
        .where(isNull(sessions.revokedAt))
        .orderBy(sql`${sessions.createdAt} DESC`)
        .all();
    }

    const nowSec = Math.floor(Date.now() / 1000);

    const result = sessionRows.map((row) => {
      const expiresAtSec = Math.floor(row.expiresAt.getTime() / 1000);
      const status = expiresAtSec < nowSec ? 'EXPIRED' : 'ACTIVE';

      // Fetch wallets linked to this session
      const swRows = deps.db
        .select({
          walletId: sessionWallets.walletId,
          isDefault: sessionWallets.isDefault,
          walletName: wallets.name,
        })
        .from(sessionWallets)
        .leftJoin(wallets, eq(sessionWallets.walletId, wallets.id))
        .where(eq(sessionWallets.sessionId, row.id))
        .all();

      const defaultSw = swRows.find((sw) => sw.isDefault);
      const walletsList = swRows.map((sw) => ({
        id: sw.walletId,
        name: sw.walletName ?? 'Unknown',
        isDefault: sw.isDefault,
      }));

      return {
        id: row.id,
        walletId: defaultSw?.walletId ?? walletsList[0]?.id ?? '',
        walletName: defaultSw?.walletName ?? walletsList[0]?.name ?? null,
        wallets: walletsList,
        status,
        renewalCount: row.renewalCount,
        maxRenewals: row.maxRenewals,
        expiresAt: expiresAtSec,
        absoluteExpiresAt: Math.floor(row.absoluteExpiresAt.getTime() / 1000),
        createdAt: Math.floor(row.createdAt.getTime() / 1000),
        lastRenewedAt: row.lastRenewedAt
          ? Math.floor(row.lastRenewedAt.getTime() / 1000)
          : null,
        source: (row.source ?? 'api') as 'api' | 'mcp',
      };
    });

    return c.json(result, 200);
  });

  // -------------------------------------------------------------------------
  // DELETE /sessions/:id -- revoke a session
  // -------------------------------------------------------------------------
  router.openapi(revokeSessionRoute, (c) => {
    const { id: sessionId } = c.req.valid('param');

    const session = deps.db
      .select()
      .from(sessions)
      .where(eq(sessions.id, sessionId))
      .get();

    if (!session) {
      throw new WAIaaSError('SESSION_NOT_FOUND');
    }

    // Already revoked -- idempotent response
    if (session.revokedAt !== null) {
      return c.json({ id: sessionId, status: 'REVOKED', message: 'Session already revoked' }, 200);
    }

    // Revoke the session
    const nowSec = Math.floor(Date.now() / 1000);
    deps.db
      .update(sessions)
      .set({ revokedAt: new Date(nowSec * 1000) })
      .where(eq(sessions.id, sessionId))
      .run();

    return c.json({ id: sessionId, status: 'REVOKED' }, 200);
  });

  // -------------------------------------------------------------------------
  // PUT /sessions/:id/renew -- renew session token with 5 safety checks
  // -------------------------------------------------------------------------
  router.openapi(renewSessionRoute, async (c) => {
    const { id: sessionId } = c.req.valid('param');

    // Verify caller owns the session (sessionAuth sets sessionId from JWT)
    const callerSessionId = c.get('sessionId' as never) as string;
    if (sessionId !== callerSessionId) {
      throw new WAIaaSError('SESSION_NOT_FOUND', {
        message: 'Cannot renew a different session',
      });
    }

    // Extract current token from Authorization header
    const authHeader = c.req.header('Authorization');
    const currentToken = authHeader!.slice('Bearer '.length);
    const currentTokenHash = createHash('sha256').update(currentToken).digest('hex');

    // Verify JWT payload to get iat/exp for TTL calculation
    const jwtPayload = await deps.jwtSecretManager.verifyToken(currentToken);

    // ----- Check 1: Session exists and not revoked -----
    const session = deps.db
      .select()
      .from(sessions)
      .where(eq(sessions.id, sessionId))
      .get();

    if (!session) {
      throw new WAIaaSError('SESSION_NOT_FOUND');
    }
    if (session.revokedAt !== null) {
      throw new WAIaaSError('SESSION_REVOKED');
    }

    // ----- Check 2: token_hash CAS (Compare-And-Swap) -----
    if (session.tokenHash !== currentTokenHash) {
      throw new WAIaaSError('SESSION_RENEWAL_MISMATCH');
    }

    // ----- Check 3: maxRenewals limit -----
    if (session.renewalCount >= session.maxRenewals) {
      throw new WAIaaSError('RENEWAL_LIMIT_REACHED');
    }

    // ----- Check 4: Absolute lifetime -----
    const nowSec = Math.floor(Date.now() / 1000);
    const absoluteExpiresAtSec = Math.floor(session.absoluteExpiresAt.getTime() / 1000);
    if (nowSec >= absoluteExpiresAtSec) {
      throw new WAIaaSError('SESSION_ABSOLUTE_LIFETIME_EXCEEDED');
    }

    // ----- Check 5: 50% TTL elapsed -----
    const currentTtl = jwtPayload.exp - jwtPayload.iat;
    const elapsed = nowSec - jwtPayload.iat;
    if (elapsed < currentTtl * 0.5) {
      throw new WAIaaSError('RENEWAL_TOO_EARLY');
    }

    // ----- Get default wallet from session_wallets -----
    const defaultWallet = deps.db
      .select()
      .from(sessionWallets)
      .where(
        and(
          eq(sessionWallets.sessionId, sessionId),
          eq(sessionWallets.isDefault, true),
        ),
      )
      .get();

    // ----- Issue new token -----
    const newTtl = currentTtl;
    const newExpiresAt = Math.min(nowSec + newTtl, absoluteExpiresAtSec);

    const newPayload: JwtPayload = {
      sub: sessionId,
      wlt: defaultWallet!.walletId,
      iat: nowSec,
      exp: newExpiresAt,
    };
    const newToken = await deps.jwtSecretManager.signToken(newPayload);
    const newTokenHash = createHash('sha256').update(newToken).digest('hex');

    // Atomic update with CAS guard on token_hash
    const result = deps.db
      .update(sessions)
      .set({
        tokenHash: newTokenHash,
        expiresAt: new Date(newExpiresAt * 1000),
        renewalCount: session.renewalCount + 1,
        lastRenewedAt: new Date(nowSec * 1000),
      })
      .where(
        and(
          eq(sessions.id, sessionId),
          eq(sessions.tokenHash, currentTokenHash), // CAS guard
        ),
      )
      .run();

    if (result.changes === 0) {
      throw new WAIaaSError('SESSION_RENEWAL_MISMATCH');
    }

    return c.json(
      {
        id: sessionId,
        token: newToken,
        expiresAt: newExpiresAt,
        renewalCount: session.renewalCount + 1,
      },
      200,
    );
  });

  // -------------------------------------------------------------------------
  // POST /sessions/:id/wallets -- add wallet to session
  // -------------------------------------------------------------------------
  router.openapi(addWalletRoute, (c) => {
    const { id: sessionId } = c.req.valid('param');
    const { walletId } = c.req.valid('json');

    // 1. Session exists and not revoked
    const session = deps.db
      .select()
      .from(sessions)
      .where(eq(sessions.id, sessionId))
      .get();

    if (!session) {
      throw new WAIaaSError('SESSION_NOT_FOUND');
    }
    if (session.revokedAt !== null) {
      throw new WAIaaSError('SESSION_NOT_FOUND', {
        message: 'Session is revoked',
      });
    }

    // 2. Wallet exists and not terminated
    const wallet = deps.db
      .select()
      .from(wallets)
      .where(eq(wallets.id, walletId))
      .get();

    if (!wallet) {
      throw new WAIaaSError('WALLET_NOT_FOUND');
    }
    if (wallet.status === 'TERMINATED') {
      throw new WAIaaSError('WALLET_TERMINATED');
    }

    // 3. Check not already linked
    const existing = deps.db
      .select()
      .from(sessionWallets)
      .where(
        and(
          eq(sessionWallets.sessionId, sessionId),
          eq(sessionWallets.walletId, walletId),
        ),
      )
      .get();

    if (existing) {
      throw new WAIaaSError('WALLET_ALREADY_LINKED');
    }

    // 4. Check max_sessions_per_wallet limit
    const nowSec = Math.floor(Date.now() / 1000);
    const nowDate = new Date(nowSec * 1000);
    const maxSessions = deps.config.security.max_sessions_per_wallet;

    const activeCountResult = deps.db
      .select({ count: sql<number>`count(*)` })
      .from(sessionWallets)
      .innerJoin(sessions, eq(sessionWallets.sessionId, sessions.id))
      .where(
        and(
          eq(sessionWallets.walletId, walletId),
          isNull(sessions.revokedAt),
          gt(sessions.expiresAt, nowDate),
        ),
      )
      .get();

    if ((activeCountResult?.count ?? 0) >= maxSessions) {
      throw new WAIaaSError('SESSION_LIMIT_EXCEEDED', {
        message: `Wallet ${walletId} has reached session limit (max: ${maxSessions})`,
      });
    }

    // 5. Insert (is_default = false)
    deps.db.insert(sessionWallets).values({
      sessionId,
      walletId,
      isDefault: false,
      createdAt: nowDate,
    }).run();

    // Fire-and-forget: notify wallet addition
    void deps.notificationService?.notify('SESSION_WALLET_ADDED', walletId, {
      sessionId,
      walletId,
    });

    return c.json(
      {
        sessionId,
        walletId,
        isDefault: false,
        createdAt: nowSec,
      },
      201,
    );
  });

  // -------------------------------------------------------------------------
  // DELETE /sessions/:id/wallets/:walletId -- remove wallet from session
  // -------------------------------------------------------------------------
  router.openapi(removeWalletRoute, (c) => {
    const { id: sessionId, walletId } = c.req.valid('param');

    // 1. Find the session-wallet link
    const sw = deps.db
      .select()
      .from(sessionWallets)
      .where(
        and(
          eq(sessionWallets.sessionId, sessionId),
          eq(sessionWallets.walletId, walletId),
        ),
      )
      .get();

    if (!sw) {
      throw new WAIaaSError('SESSION_NOT_FOUND', {
        message: 'Wallet is not linked to this session',
      });
    }

    // 2. Cannot remove default wallet
    if (sw.isDefault) {
      throw new WAIaaSError('CANNOT_REMOVE_DEFAULT_WALLET');
    }

    // 3. Must have at least 1 wallet remaining
    const countResult = deps.db
      .select({ count: sql<number>`count(*)` })
      .from(sessionWallets)
      .where(eq(sessionWallets.sessionId, sessionId))
      .get();

    if ((countResult?.count ?? 0) <= 1) {
      throw new WAIaaSError('SESSION_REQUIRES_WALLET');
    }

    // 4. Delete
    deps.db
      .delete(sessionWallets)
      .where(
        and(
          eq(sessionWallets.sessionId, sessionId),
          eq(sessionWallets.walletId, walletId),
        ),
      )
      .run();

    // Fire-and-forget: notify wallet removal
    void deps.notificationService?.notify('SESSION_WALLET_REMOVED', walletId, {
      sessionId,
      walletId,
    });

    return new Response(null, { status: 204 }) as any;
  });

  // -------------------------------------------------------------------------
  // PATCH /sessions/:id/wallets/:walletId/default -- set default wallet
  // -------------------------------------------------------------------------
  router.openapi(setDefaultWalletRoute, (c) => {
    const { id: sessionId, walletId } = c.req.valid('param');

    // 1. Check that wallet is linked to session
    const sw = deps.db
      .select()
      .from(sessionWallets)
      .where(
        and(
          eq(sessionWallets.sessionId, sessionId),
          eq(sessionWallets.walletId, walletId),
        ),
      )
      .get();

    if (!sw) {
      throw new WAIaaSError('SESSION_NOT_FOUND', {
        message: 'Wallet is not linked to this session',
      });
    }

    // 2. Atomic swap: unset old default, set new default
    deps.db
      .update(sessionWallets)
      .set({ isDefault: false })
      .where(
        and(
          eq(sessionWallets.sessionId, sessionId),
          eq(sessionWallets.isDefault, true),
        ),
      )
      .run();

    deps.db
      .update(sessionWallets)
      .set({ isDefault: true })
      .where(
        and(
          eq(sessionWallets.sessionId, sessionId),
          eq(sessionWallets.walletId, walletId),
        ),
      )
      .run();

    return c.json(
      {
        sessionId,
        defaultWalletId: walletId,
      },
      200,
    );
  });

  // -------------------------------------------------------------------------
  // GET /sessions/:id/wallets -- list wallets linked to session
  // -------------------------------------------------------------------------
  router.openapi(listSessionWalletsRoute, (c) => {
    const { id: sessionId } = c.req.valid('param');

    // 1. Session exists
    const session = deps.db
      .select()
      .from(sessions)
      .where(eq(sessions.id, sessionId))
      .get();

    if (!session) {
      throw new WAIaaSError('SESSION_NOT_FOUND');
    }

    // 2. Join session_wallets + wallets
    const rows = deps.db
      .select({
        walletId: sessionWallets.walletId,
        isDefault: sessionWallets.isDefault,
        swCreatedAt: sessionWallets.createdAt,
        walletName: wallets.name,
        chain: wallets.chain,
      })
      .from(sessionWallets)
      .leftJoin(wallets, eq(sessionWallets.walletId, wallets.id))
      .where(eq(sessionWallets.sessionId, sessionId))
      .all();

    const walletsList = rows.map((row) => ({
      id: row.walletId,
      name: row.walletName ?? 'Unknown',
      chain: row.chain ?? 'unknown',
      isDefault: row.isDefault,
      createdAt: Math.floor(row.swCreatedAt.getTime() / 1000),
    }));

    return c.json({ wallets: walletsList }, 200);
  });

  return router;
}
