/**
 * Master auth middleware: verifies X-Master-Password header against Argon2id hash.
 *
 * Protects administrative endpoints (agent creation, policy CRUD).
 * The password is sent as plaintext in the header (localhost-only, secured by hostGuard).
 *
 * Factory pattern: createMasterAuth(deps) returns middleware.
 *
 * @see docs/52-auth-redesign.md
 */

import { createMiddleware } from 'hono/factory';
import argon2 from 'argon2';
import { WAIaaSError } from '@waiaas/core';
import type { Database as SQLiteDatabase } from 'better-sqlite3';
import { insertAuditLog } from '../../infrastructure/database/audit-helper.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Mutable ref for in-memory master password + hash, enabling hot-swap on password change. */
export interface MasterPasswordRef {
  password: string;
  hash: string;
}

export interface MasterAuthDeps {
  masterPasswordHash?: string; // Argon2id hash stored during daemon init
  /** Mutable ref for live password/hash updates. Takes precedence over masterPasswordHash. */
  passwordRef?: MasterPasswordRef;
  /** Raw SQLite for audit logging (MASTER_AUTH_FAILED). */
  sqlite?: SQLiteDatabase;
}

// ---------------------------------------------------------------------------
// Middleware factory
// ---------------------------------------------------------------------------

export function createMasterAuth(deps: MasterAuthDeps) {
  return createMiddleware(async (c, next) => {
    const password = c.req.header('X-Master-Password');

    if (!password) {
      throw new WAIaaSError('INVALID_MASTER_PASSWORD', {
        message: 'X-Master-Password header is required',
      });
    }

    // Use ref hash (live) if available, else fall back to static hash
    const hash = deps.passwordRef?.hash ?? deps.masterPasswordHash;
    if (!hash) {
      throw new WAIaaSError('INVALID_MASTER_PASSWORD', {
        message: 'Master password not configured',
      });
    }

    // Verify password against stored Argon2id hash
    const isValid = await argon2.verify(hash, password);

    if (!isValid) {
      // Audit log: MASTER_AUTH_FAILED (best-effort)
      if (deps.sqlite) {
        insertAuditLog(deps.sqlite, {
          eventType: 'MASTER_AUTH_FAILED',
          actor: 'unknown',
          details: {
            reason: 'Invalid master password',
            ip: c.req.header('x-forwarded-for') ?? 'localhost',
          },
          severity: 'critical',
          ipAddress: c.req.header('x-forwarded-for') ?? undefined,
        });
      }

      throw new WAIaaSError('INVALID_MASTER_PASSWORD', {
        message: 'Invalid master password',
      });
    }

    await next();
  });
}
