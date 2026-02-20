/**
 * Wallet ID resolution helper: resolves walletId from request parameters with 3-priority fallback.
 *
 * Priority order:
 *   1. bodyWalletId (explicit POST/PUT body parameter)
 *   2. c.req.query('walletId') (GET/DELETE query parameter)
 *   3. c.get('defaultWalletId') (session-auth middleware default wallet)
 *
 * After resolution, validates that the session has access to the wallet
 * by checking session_wallets junction table.
 *
 * @see Phase 211 -- API wallet selection
 */

import type { Context } from 'hono';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { eq, and } from 'drizzle-orm';
import { WAIaaSError } from '@waiaas/core';
import { sessionWallets } from '../../infrastructure/database/schema.js';

/**
 * Resolve wallet ID from request context with 3-priority fallback + session access check.
 *
 * @param c - Hono request context (must have sessionId and defaultWalletId set by sessionAuth)
 * @param db - Drizzle database instance
 * @param bodyWalletId - Optional walletId from request body (highest priority)
 * @returns Resolved wallet ID string
 * @throws WAIaaSError('WALLET_ACCESS_DENIED') if session does not have access to the wallet
 */
export function resolveWalletId(
  c: Context,
  db: BetterSQLite3Database,
  bodyWalletId?: string,
): string {
  // Priority 1: explicit body parameter
  // Priority 2: query parameter
  // Priority 3: default wallet from session-auth middleware
  const walletId =
    bodyWalletId ||
    c.req.query('walletId') ||
    (c.get('defaultWalletId' as never) as string | undefined);

  if (!walletId) {
    throw new WAIaaSError('WALLET_ACCESS_DENIED', {
      message: 'No wallet ID provided and no default wallet available',
    });
  }

  // Verify session has access to this wallet via session_wallets junction table
  const sessionId = c.get('sessionId' as never) as string;
  const link = db
    .select()
    .from(sessionWallets)
    .where(
      and(
        eq(sessionWallets.sessionId, sessionId),
        eq(sessionWallets.walletId, walletId),
      ),
    )
    .get();

  if (!link) {
    throw new WAIaaSError('WALLET_ACCESS_DENIED');
  }

  return walletId;
}
