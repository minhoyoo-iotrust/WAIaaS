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

import { Hono } from 'hono';
import { createHash } from 'node:crypto';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { eq, and, isNull, gt, sql } from 'drizzle-orm';
import { CreateSessionRequestSchema, WAIaaSError } from '@waiaas/core';
import type { JwtSecretManager, JwtPayload } from '../../infrastructure/jwt/index.js';
import { generateId } from '../../infrastructure/database/id.js';
import { agents, sessions } from '../../infrastructure/database/schema.js';
import type * as schema from '../../infrastructure/database/schema.js';
import type { DaemonConfig } from '../../infrastructure/config/loader.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SessionRouteDeps {
  db: BetterSQLite3Database<typeof schema>;
  jwtSecretManager: JwtSecretManager;
  config: DaemonConfig;
}

// ---------------------------------------------------------------------------
// Route factory
// ---------------------------------------------------------------------------

/**
 * Create session route sub-router.
 *
 * POST /sessions         -> create session + JWT issuance (201)
 * GET /sessions          -> list active sessions for agent (200)
 * DELETE /sessions/:id   -> revoke session (200)
 * PUT /sessions/:id/renew -> renew session token (200)
 */
export function sessionRoutes(deps: SessionRouteDeps): Hono {
  const router = new Hono();

  // -------------------------------------------------------------------------
  // POST /sessions -- create a new session
  // -------------------------------------------------------------------------
  router.post('/sessions', async (c) => {
    const body = await c.req.json();
    const parsed = CreateSessionRequestSchema.parse(body);

    // Verify agent exists
    const agent = deps.db
      .select()
      .from(agents)
      .where(eq(agents.id, parsed.agentId))
      .get();

    if (!agent) {
      throw new WAIaaSError('AGENT_NOT_FOUND');
    }

    // Check active session count for this agent
    const nowSec = Math.floor(Date.now() / 1000);
    const nowDate = new Date(nowSec * 1000);

    const activeCountResult = deps.db
      .select({ count: sql<number>`count(*)` })
      .from(sessions)
      .where(
        and(
          eq(sessions.agentId, parsed.agentId),
          isNull(sessions.revokedAt),
          gt(sessions.expiresAt, nowDate),
        ),
      )
      .get();

    const activeCount = activeCountResult?.count ?? 0;
    const maxSessions = deps.config.security.max_sessions_per_agent;

    if (activeCount >= maxSessions) {
      throw new WAIaaSError('SESSION_LIMIT_EXCEEDED', {
        message: `Agent has ${activeCount} active sessions (max: ${maxSessions})`,
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
      agt: parsed.agentId,
      iat: nowSec,
      exp: expiresAt,
    };
    const token = await deps.jwtSecretManager.signToken(jwtPayload);

    // Compute token hash for storage (never store raw token)
    const tokenHash = createHash('sha256').update(token).digest('hex');

    // Insert session into DB
    deps.db.insert(sessions).values({
      id: sessionId,
      agentId: parsed.agentId,
      tokenHash,
      expiresAt: new Date(expiresAt * 1000),
      absoluteExpiresAt: new Date(absoluteExpiresAt * 1000),
      createdAt: new Date(nowSec * 1000),
      renewalCount: 0,
      maxRenewals: 30,
      constraints: parsed.constraints ? JSON.stringify(parsed.constraints) : null,
    }).run();

    return c.json(
      {
        id: sessionId,
        token,
        expiresAt,
        agentId: parsed.agentId,
      },
      201,
    );
  });

  // -------------------------------------------------------------------------
  // GET /sessions -- list active sessions for an agent
  // -------------------------------------------------------------------------
  router.get('/sessions', (c) => {
    const agentId = c.req.query('agentId');

    if (!agentId) {
      throw new WAIaaSError('AGENT_NOT_FOUND', {
        message: 'agentId query parameter required',
      });
    }

    const rows = deps.db
      .select()
      .from(sessions)
      .where(
        and(
          eq(sessions.agentId, agentId),
          isNull(sessions.revokedAt),
        ),
      )
      .orderBy(sql`${sessions.createdAt} DESC`)
      .all();

    const nowSec = Math.floor(Date.now() / 1000);

    const result = rows.map((row) => {
      const expiresAtSec = Math.floor(row.expiresAt.getTime() / 1000);
      const status = expiresAtSec < nowSec ? 'EXPIRED' : 'ACTIVE';

      return {
        id: row.id,
        agentId: row.agentId,
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
  router.delete('/sessions/:id', (c) => {
    const sessionId = c.req.param('id');

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
  router.put('/sessions/:id/renew', async (c) => {
    const sessionId = c.req.param('id');

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
      agt: session.agentId,
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
