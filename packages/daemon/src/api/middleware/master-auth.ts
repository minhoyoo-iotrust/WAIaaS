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

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface MasterAuthDeps {
  masterPasswordHash: string; // Argon2id hash stored during daemon init
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

    // Verify password against stored Argon2id hash
    const isValid = await argon2.verify(deps.masterPasswordHash, password);

    if (!isValid) {
      throw new WAIaaSError('INVALID_MASTER_PASSWORD', {
        message: 'Invalid master password',
      });
    }

    await next();
  });
}
