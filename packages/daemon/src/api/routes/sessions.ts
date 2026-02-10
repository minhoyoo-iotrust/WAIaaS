/**
 * Session CRUD routes: POST /sessions (create + JWT issuance),
 * GET /sessions (list active), DELETE /sessions/:id (revoke).
 *
 * All routes are protected by masterAuth middleware at the server level.
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
 * POST /sessions   -> create session + JWT issuance (201)
 * GET /sessions    -> list active sessions for agent (200)
 * DELETE /sessions/:id -> revoke session (200)
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

  return router;
}
