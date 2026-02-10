/**
 * Session auth middleware: validates wai_sess_ Bearer tokens, checks DB session, sets context.
 *
 * Validates Authorization header format (Bearer wai_sess_...),
 * verifies JWT via JwtSecretManager (supports dual-key rotation),
 * checks session existence and revocation in SQLite,
 * and sets sessionId/agentId on Hono context.
 *
 * Factory pattern: createSessionAuth(deps) returns middleware.
 *
 * @see docs/52-auth-redesign.md
 */

import { createMiddleware } from 'hono/factory';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { eq } from 'drizzle-orm';
import { WAIaaSError } from '@waiaas/core';
import type { JwtSecretManager } from '../../infrastructure/jwt/index.js';
import type * as schema from '../../infrastructure/database/schema.js';
import { sessions } from '../../infrastructure/database/schema.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SessionAuthDeps {
  jwtSecretManager: JwtSecretManager;
  db: BetterSQLite3Database<typeof schema>;
}

// ---------------------------------------------------------------------------
// Middleware factory
// ---------------------------------------------------------------------------

export function createSessionAuth(deps: SessionAuthDeps) {
  return createMiddleware(async (c, next) => {
    // 1. Extract Authorization header
    const authHeader = c.req.header('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer wai_sess_')) {
      throw new WAIaaSError('INVALID_TOKEN', {
        message: 'Missing or invalid Authorization header. Expected: Bearer wai_sess_<token>',
      });
    }

    // 2. Extract the full token (including wai_sess_ prefix)
    const token = authHeader.slice('Bearer '.length);

    // 3. Verify JWT via JwtSecretManager (handles dual-key rotation)
    const payload = await deps.jwtSecretManager.verifyToken(token);

    // 4. Check session in DB (exists, not revoked)
    const session = deps.db
      .select()
      .from(sessions)
      .where(eq(sessions.id, payload.sub))
      .get();

    if (!session) {
      throw new WAIaaSError('SESSION_NOT_FOUND');
    }
    if (session.revokedAt !== null) {
      throw new WAIaaSError('SESSION_REVOKED');
    }

    // 5. Set context variables
    c.set('sessionId', payload.sub);
    c.set('agentId', payload.agt);

    await next();
  });
}
