/**
 * Session routes: POST /sessions (create + JWT issuance),
 * GET /sessions (list active), DELETE /sessions/:id (revoke),
 * PUT /sessions/:id/renew (token renewal with 5 safety checks),
 * POST /sessions/:id/wallets (add wallet),
 * DELETE /sessions/:id/wallets/:walletId (remove wallet),
 * GET /sessions/:id/wallets (list wallets).
 *
 * CRUD routes are protected by masterAuth middleware at the server level.
 * Renewal route is protected by sessionAuth (session's own token).
 *
 * v26.4: Multi-wallet session model via session_wallets junction table.
 * v29.3: Removed default wallet concept (no isDefault, no setDefaultWallet route).
 *
 * @see docs/52-auth-redesign.md
 * @see docs/37-rest-api-complete-spec.md
 */

import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import { createHash } from 'node:crypto';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type { Database as SQLiteDatabase } from 'better-sqlite3';
import { eq, and, isNull, sql, inArray } from 'drizzle-orm';
import { WAIaaSError, type EventBus } from '@waiaas/core';
import type { JwtSecretManager, JwtPayload } from '../../infrastructure/jwt/index.js';
import { generateId } from '../../infrastructure/database/id.js';
import { wallets, sessions, sessionWallets } from '../../infrastructure/database/schema.js';
import type * as schema from '../../infrastructure/database/schema.js';
import { insertAuditLog } from '../../infrastructure/database/audit-helper.js';
import type { DaemonConfig } from '../../infrastructure/config/loader.js';
import type { SettingsService } from '../../infrastructure/settings/settings-service.js';
import type { NotificationService } from '../../notifications/notification-service.js';
import {
  CreateSessionRequestOpenAPI,
  SessionCreateResponseSchema,
  PaginatedSessionListSchema,
  PaginationQuerySchema,
  SessionRevokeResponseSchema,
  SessionRenewResponseSchema,
  SessionRotateResponseSchema,
  SessionWalletSchema,
  SessionWalletListSchema,
  buildErrorResponses,
  openApiValidationHook,
} from './openapi-schemas.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SessionRouteDeps {
  db: BetterSQLite3Database<typeof schema>;
  sqlite?: SQLiteDatabase;
  jwtSecretManager: JwtSecretManager;
  config: DaemonConfig;
  settingsService?: SettingsService;
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
    }).merge(PaginationQuerySchema),
  },
  responses: {
    200: {
      description: 'Paginated list of active sessions',
      content: { 'application/json': { schema: PaginatedSessionListSchema } },
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
      'RENEWAL_NOT_REQUIRED',
      'RENEWAL_LIMIT_REACHED',
      'SESSION_ABSOLUTE_LIFETIME_EXCEEDED',
      'RENEWAL_TOO_EARLY',
    ]),
  },
});

// #250: Rotate session token (masterAuth)
const rotateSessionTokenRoute = createRoute({
  method: 'post',
  path: '/sessions/{id}/rotate',
  tags: ['Sessions'],
  summary: 'Rotate session token (replace token, preserve metadata)',
  request: {
    params: z.object({ id: z.string().uuid() }),
  },
  responses: {
    200: {
      description: 'Token rotated — old token immediately invalidated',
      content: { 'application/json': { schema: SessionRotateResponseSchema } },
    },
    ...buildErrorResponses(['SESSION_NOT_FOUND', 'SESSION_REVOKED']),
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
    ...buildErrorResponses(['SESSION_NOT_FOUND', 'SESSION_REQUIRES_WALLET']),
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

    // Verify all wallets exist and are active (batch query instead of N+1)
    const walletMap = new Map<string, { id: string; name: string; status: string }>();
    if (walletIds.length > 0) {
      const walletRows = deps.db
        .select()
        .from(wallets)
        .where(inArray(wallets.id, walletIds))
        .all();
      for (const w of walletRows) {
        walletMap.set(w.id, w);
      }
    }
    for (const wId of walletIds) {
      const wallet = walletMap.get(wId);
      if (!wallet) {
        throw new WAIaaSError('WALLET_NOT_FOUND');
      }
      if (wallet.status === 'TERMINATED') {
        throw new WAIaaSError('WALLET_TERMINATED');
      }
    }

    // Check active session count for each wallet (via session_wallets JOIN)
    const nowSec = Math.floor(Date.now() / 1000);
    const settingsMax = deps.settingsService?.get('security.max_sessions_per_wallet');
    const maxSessions = settingsMax ? parseInt(settingsMax, 10) : deps.config.security.max_sessions_per_wallet;

    for (const wId of walletIds) {
      // Count active sessions: not revoked AND (unlimited OR not expired)
      const activeCountResult = deps.db
        .select({ count: sql<number>`count(*)` })
        .from(sessionWallets)
        .innerJoin(sessions, eq(sessionWallets.sessionId, sessions.id))
        .where(
          and(
            eq(sessionWallets.walletId, wId),
            isNull(sessions.revokedAt),
            sql`(${sessions.expiresAt} = 0 OR ${sessions.expiresAt} > ${nowSec})`,
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

    // Compute TTL and expiry timestamps (v29.9: per-session, unlimited by default)
    const ttl = parsed.ttl; // undefined = unlimited session
    const expiresAt = ttl !== undefined ? nowSec + ttl : 0; // 0 = unlimited
    const absoluteLifetime = parsed.absoluteLifetime;
    const absoluteExpiresAt = absoluteLifetime !== undefined && absoluteLifetime > 0
      ? nowSec + absoluteLifetime
      : 0; // 0 = no absolute lifetime cap
    const maxRenewals = parsed.maxRenewals ?? 0; // 0 = unlimited renewals

    // Create JWT payload (unlimited sessions have no exp claim)
    const jwtPayload: JwtPayload = {
      sub: sessionId,
      iat: nowSec,
      exp: ttl !== undefined ? expiresAt : undefined,
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
      maxRenewals,
      constraints: parsed.constraints ? JSON.stringify(parsed.constraints) : null,
    }).run();

    // Insert session_wallets rows for each wallet
    for (const wId of walletIds) {
      deps.db.insert(sessionWallets).values({
        sessionId,
        walletId: wId,
        createdAt: new Date(nowSec * 1000),
      }).run();
    }

    // Build wallets array for response (reuse batch-fetched walletMap)
    const responseWallets = walletIds.map((wId) => {
      const w = walletMap.get(wId)!;
      return { id: w.id, name: w.name };
    });

    // Audit log: SESSION_CREATED
    if (deps.sqlite) {
      insertAuditLog(deps.sqlite, {
        eventType: 'SESSION_CREATED',
        actor: 'master',
        sessionId,
        details: { walletIds, constraints: parsed.constraints ?? null },
        severity: 'info',
      });
    }

    // Fire-and-forget: notify session creation (use first wallet as notification target)
    void deps.notificationService?.notify('SESSION_CREATED', walletIds[0]!, {
      sessionId,
    });

    // v1.6: emit wallet:activity SESSION_CREATED event
    deps.eventBus?.emit('wallet:activity', {
      walletId: walletIds[0]!,
      activity: 'SESSION_CREATED',
      details: { sessionId },
      timestamp: Math.floor(Date.now() / 1000),
    });

    return c.json(
      {
        id: sessionId,
        token,
        expiresAt,
        walletId: walletIds[0]!,
        wallets: responseWallets,
      },
      201,
    );
  });

  // -------------------------------------------------------------------------
  // GET /sessions -- list active sessions
  // -------------------------------------------------------------------------
  router.openapi(listSessionsRoute, (c) => {
    const { walletId: filterWalletId, limit: rawLimit, offset: rawOffset } = c.req.valid('query');
    const limit = rawLimit ?? 50;
    const offset = rawOffset ?? 0;

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
          tokenIssuedCount: sessions.tokenIssuedCount,
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
          tokenIssuedCount: sessions.tokenIssuedCount,
        })
        .from(sessions)
        .where(isNull(sessions.revokedAt))
        .orderBy(sql`${sessions.createdAt} DESC`)
        .all();
    }

    const nowSec = Math.floor(Date.now() / 1000);

    // Batch fetch all session-wallet links with wallet names (NQ-01: single query instead of N+1)
    const sessionIds = sessionRows.map((r) => r.id);
    const allSwRows = sessionIds.length > 0
      ? deps.db
          .select({
            sessionId: sessionWallets.sessionId,
            walletId: sessionWallets.walletId,
            walletName: wallets.name,
          })
          .from(sessionWallets)
          .leftJoin(wallets, eq(sessionWallets.walletId, wallets.id))
          .where(inArray(sessionWallets.sessionId, sessionIds))
          .all()
      : [];
    // Group by sessionId
    const swBySession = new Map<string, Array<{ id: string; name: string }>>();
    for (const sw of allSwRows) {
      const list = swBySession.get(sw.sessionId) ?? [];
      list.push({ id: sw.walletId, name: sw.walletName ?? 'Unknown' });
      swBySession.set(sw.sessionId, list);
    }

    const result = sessionRows.map((row) => {
      const expiresAtSec = Math.floor(row.expiresAt.getTime() / 1000);
      // Unlimited sessions (expiresAt=0) are always ACTIVE
      const status = expiresAtSec === 0 ? 'ACTIVE' : (expiresAtSec < nowSec ? 'EXPIRED' : 'ACTIVE');

      const walletsList = swBySession.get(row.id) ?? [];

      return {
        id: row.id,
        walletId: walletsList[0]?.id ?? '',
        walletName: walletsList[0]?.name ?? null,
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
        tokenIssuedCount: row.tokenIssuedCount ?? 1,
      };
    });

    const total = result.length;
    const paginatedData = result.slice(offset, offset + limit);

    return c.json({ data: paginatedData, total, limit, offset }, 200);
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

    // Audit log: SESSION_REVOKED
    if (deps.sqlite) {
      insertAuditLog(deps.sqlite, {
        eventType: 'SESSION_REVOKED',
        actor: 'master',
        sessionId,
        details: { sessionId, revokedAt: nowSec },
        severity: 'info',
      });
    }

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

    // ----- Check 1b: Unlimited session does not require renewal -----
    const expiresAtSec = Math.floor(session.expiresAt.getTime() / 1000);
    if (expiresAtSec === 0) {
      throw new WAIaaSError('RENEWAL_NOT_REQUIRED');
    }

    // ----- Check 2: token_hash CAS (Compare-And-Swap) -----
    if (session.tokenHash !== currentTokenHash) {
      throw new WAIaaSError('SESSION_RENEWAL_MISMATCH');
    }

    // ----- Check 3: maxRenewals limit (0 = unlimited renewals) -----
    if (session.maxRenewals > 0 && session.renewalCount >= session.maxRenewals) {
      throw new WAIaaSError('RENEWAL_LIMIT_REACHED');
    }

    // ----- Check 4: Absolute lifetime (0 = no cap) -----
    const nowSec = Math.floor(Date.now() / 1000);
    const absoluteExpiresAtSec = Math.floor(session.absoluteExpiresAt.getTime() / 1000);
    if (absoluteExpiresAtSec > 0 && nowSec >= absoluteExpiresAtSec) {
      throw new WAIaaSError('SESSION_ABSOLUTE_LIFETIME_EXCEEDED');
    }

    // ----- Check 5: 50% TTL elapsed -----
    const currentTtl = jwtPayload.exp! - jwtPayload.iat;
    const elapsed = nowSec - jwtPayload.iat;
    if (elapsed < currentTtl * 0.5) {
      throw new WAIaaSError('RENEWAL_TOO_EARLY');
    }

    // ----- Issue new token -----
    const newTtl = currentTtl;
    const newExpiresAt = absoluteExpiresAtSec > 0
      ? Math.min(nowSec + newTtl, absoluteExpiresAtSec)
      : nowSec + newTtl;

    const newPayload: JwtPayload = {
      sub: sessionId,
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
    const settingsMax = deps.settingsService?.get('security.max_sessions_per_wallet');
    const maxSessions = settingsMax ? parseInt(settingsMax, 10) : deps.config.security.max_sessions_per_wallet;

    // Count active sessions: not revoked AND (unlimited OR not expired)
    const activeCountResult = deps.db
      .select({ count: sql<number>`count(*)` })
      .from(sessionWallets)
      .innerJoin(sessions, eq(sessionWallets.sessionId, sessions.id))
      .where(
        and(
          eq(sessionWallets.walletId, walletId),
          isNull(sessions.revokedAt),
          sql`(${sessions.expiresAt} = 0 OR ${sessions.expiresAt} > ${nowSec})`,
        ),
      )
      .get();

    if ((activeCountResult?.count ?? 0) >= maxSessions) {
      throw new WAIaaSError('SESSION_LIMIT_EXCEEDED', {
        message: `Wallet ${walletId} has reached session limit (max: ${maxSessions})`,
      });
    }

    // 5. Insert
    deps.db.insert(sessionWallets).values({
      sessionId,
      walletId,
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

    // 2. Must have at least 1 wallet remaining
    const countResult = deps.db
      .select({ count: sql<number>`count(*)` })
      .from(sessionWallets)
      .where(eq(sessionWallets.sessionId, sessionId))
      .get();

    if ((countResult?.count ?? 0) <= 1) {
      throw new WAIaaSError('SESSION_REQUIRES_WALLET');
    }

    // 3. Delete
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

    return c.body(null, 204);
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
      createdAt: Math.floor(row.swCreatedAt.getTime() / 1000),
    }));

    return c.json({ wallets: walletsList }, 200);
  });

  // -------------------------------------------------------------------------
  // POST /sessions/:id/rotate -- rotate token (masterAuth, #250)
  // -------------------------------------------------------------------------
  router.openapi(rotateSessionTokenRoute, async (c) => {
    if (!deps.jwtSecretManager) {
      throw new WAIaaSError('ADAPTER_NOT_AVAILABLE', { message: 'JWT signing not available' });
    }

    const { id: sessionId } = c.req.valid('param');
    const nowSec = Math.floor(Date.now() / 1000);

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
      throw new WAIaaSError('SESSION_REVOKED');
    }

    // 2. Compute expiry — preserve original expiry (0 = unlimited)
    const expiresAtSec = Math.floor(session.expiresAt.getTime() / 1000);

    // 3. Check expiry (skip for unlimited sessions where expiresAt=0)
    if (expiresAtSec > 0 && expiresAtSec <= nowSec) {
      throw new WAIaaSError('SESSION_NOT_FOUND', { message: 'Session expired' });
    }

    // 4. Sign new JWT
    const jwtPayload: JwtPayload = {
      sub: sessionId,
      iat: nowSec,
      ...(expiresAtSec > 0 ? { exp: expiresAtSec } : {}),
    };
    const newToken = await deps.jwtSecretManager.signToken(jwtPayload);
    const newTokenHash = createHash('sha256').update(newToken).digest('hex');
    const oldTokenHash = session.tokenHash;

    // 5. Atomic CAS update — replace token hash, increment issued count
    const newCount = (session.tokenIssuedCount ?? 1) + 1;
    const result = deps.db
      .update(sessions)
      .set({
        tokenHash: newTokenHash,
        tokenIssuedCount: newCount,
      })
      .where(
        and(
          eq(sessions.id, sessionId),
          eq(sessions.tokenHash, oldTokenHash), // CAS guard
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
        expiresAt: expiresAtSec,
        tokenIssuedCount: newCount,
      },
      200,
    );
  });

  return router;
}
