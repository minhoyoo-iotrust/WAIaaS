/**
 * Session routes: POST /sessions (create + JWT issuance),
 * GET /sessions (list active), DELETE /sessions/:id (revoke),
 * PUT /sessions/:id/renew (token renewal with 5 safety checks).
 *
 * CRUD routes are protected by masterAuth middleware at the server level.
 * Renewal route is protected by sessionAuth (session's own token).
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
import { wallets, sessions } from '../../infrastructure/database/schema.js';
import type * as schema from '../../infrastructure/database/schema.js';
import type { DaemonConfig } from '../../infrastructure/config/loader.js';
import type { NotificationService } from '../../notifications/notification-service.js';
import {
  CreateSessionRequestOpenAPI,
  SessionCreateResponseSchema,
  SessionListItemSchema,
  SessionRevokeResponseSchema,
  SessionRenewResponseSchema,
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
// Route factory
// ---------------------------------------------------------------------------

/**
 * Create session route sub-router.
 *
 * POST /sessions         -> create session + JWT issuance (201)
 * GET /sessions          -> list active sessions for wallet (200)
 * DELETE /sessions/:id   -> revoke session (200)
 * PUT /sessions/:id/renew -> renew session token (200)
 */
export function sessionRoutes(deps: SessionRouteDeps): OpenAPIHono {
  const router = new OpenAPIHono({ defaultHook: openApiValidationHook });

  // -------------------------------------------------------------------------
  // POST /sessions -- create a new session
  // -------------------------------------------------------------------------
  router.openapi(createSessionRoute, async (c) => {
    const parsed = c.req.valid('json');

    // Verify wallet exists
    const wallet = deps.db
      .select()
      .from(wallets)
      .where(eq(wallets.id, parsed.walletId))
      .get();

    if (!wallet) {
      throw new WAIaaSError('WALLET_NOT_FOUND');
    }

    // Check active session count for this wallet
    const nowSec = Math.floor(Date.now() / 1000);
    const nowDate = new Date(nowSec * 1000);

    const activeCountResult = deps.db
      .select({ count: sql<number>`count(*)` })
      .from(sessions)
      .where(
        and(
          eq(sessions.walletId, parsed.walletId),
          isNull(sessions.revokedAt),
          gt(sessions.expiresAt, nowDate),
        ),
      )
      .get();

    const activeCount = activeCountResult?.count ?? 0;
    const maxSessions = deps.config.security.max_sessions_per_wallet;

    if (activeCount >= maxSessions) {
      throw new WAIaaSError('SESSION_LIMIT_EXCEEDED', {
        message: `Wallet has ${activeCount} active sessions (max: ${maxSessions})`,
      });
    }

    // Generate session ID
    const sessionId = generateId();

    // Compute TTL and expiry timestamps
    const ttl = parsed.ttl ?? deps.config.security.session_ttl;
    const expiresAt = nowSec + ttl;
    const absoluteExpiresAt = nowSec + 30 * 86400; // 30 days absolute lifetime

    // Create JWT payload and sign token
    const jwtPayload: JwtPayload = {
      sub: sessionId,
      wlt: parsed.walletId,
      iat: nowSec,
      exp: expiresAt,
    };
    const token = await deps.jwtSecretManager.signToken(jwtPayload);

    // Compute token hash for storage (never store raw token)
    const tokenHash = createHash('sha256').update(token).digest('hex');

    // Insert session into DB
    deps.db.insert(sessions).values({
      id: sessionId,
      walletId: parsed.walletId,
      tokenHash,
      expiresAt: new Date(expiresAt * 1000),
      absoluteExpiresAt: new Date(absoluteExpiresAt * 1000),
      createdAt: new Date(nowSec * 1000),
      renewalCount: 0,
      maxRenewals: 30,
      constraints: parsed.constraints ? JSON.stringify(parsed.constraints) : null,
    }).run();

    // Fire-and-forget: notify session creation
    void deps.notificationService?.notify('SESSION_CREATED', parsed.walletId, {
      sessionId,
    });

    // v1.6: emit wallet:activity SESSION_CREATED event
    deps.eventBus?.emit('wallet:activity', {
      walletId: parsed.walletId,
      activity: 'SESSION_CREATED',
      details: { sessionId },
      timestamp: Math.floor(Date.now() / 1000),
    });

    return c.json(
      {
        id: sessionId,
        token,
        expiresAt,
        walletId: parsed.walletId,
      },
      201,
    );
  });

  // -------------------------------------------------------------------------
  // GET /sessions -- list active sessions for a wallet
  // -------------------------------------------------------------------------
  router.openapi(listSessionsRoute, (c) => {
    const { walletId } = c.req.valid('query');

    const conditions = [isNull(sessions.revokedAt)];
    if (walletId) {
      conditions.push(eq(sessions.walletId, walletId));
    }

    const rows = deps.db
      .select({
        id: sessions.id,
        walletId: sessions.walletId,
        expiresAt: sessions.expiresAt,
        absoluteExpiresAt: sessions.absoluteExpiresAt,
        createdAt: sessions.createdAt,
        renewalCount: sessions.renewalCount,
        maxRenewals: sessions.maxRenewals,
        lastRenewedAt: sessions.lastRenewedAt,
        walletName: wallets.name,
      })
      .from(sessions)
      .leftJoin(wallets, eq(sessions.walletId, wallets.id))
      .where(and(...conditions))
      .orderBy(sql`${sessions.createdAt} DESC`)
      .all();

    const nowSec = Math.floor(Date.now() / 1000);

    const result = rows.map((row) => {
      const expiresAtSec = Math.floor(row.expiresAt.getTime() / 1000);
      const status = expiresAtSec < nowSec ? 'EXPIRED' : 'ACTIVE';

      return {
        id: row.id,
        walletId: row.walletId,
        walletName: row.walletName ?? null,
        status,
        renewalCount: row.renewalCount,
        maxRenewals: row.maxRenewals,
        expiresAt: expiresAtSec,
        absoluteExpiresAt: Math.floor(row.absoluteExpiresAt.getTime() / 1000),
        createdAt: Math.floor(row.createdAt.getTime() / 1000),
        lastRenewedAt: row.lastRenewedAt
          ? Math.floor(row.lastRenewedAt.getTime() / 1000)
          : null,
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

    // ----- Issue new token -----
    const newTtl = currentTtl;
    const newExpiresAt = Math.min(nowSec + newTtl, absoluteExpiresAtSec);

    const newPayload: JwtPayload = {
      sub: sessionId,
      wlt: session.walletId,
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

  return router;
}
