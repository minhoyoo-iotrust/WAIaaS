/**
 * Wallet ID resolution helper: resolves walletId from request parameters.
 *
 * Priority order:
 *   1. bodyWalletId (explicit POST/PUT body parameter)
 *   2. c.req.query('walletId') (GET/DELETE query parameter)
 *
 * If neither is provided, auto-resolve:
 *   - Query session_wallets for the session
 *   - If exactly 1 wallet -> use it (single-wallet DX convenience)
 *   - If 0 or 2+ wallets -> throw WALLET_ID_REQUIRED
 *
 * After resolution, validates that the session has access to the wallet
 * by checking session_wallets junction table.
 *
 * @see Phase 279 -- remove default wallet concept
 */

import type { Context } from 'hono';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { eq, and } from 'drizzle-orm';
import { WAIaaSError } from '@waiaas/core';
import { sessionWallets } from '../../infrastructure/database/schema.js';

/**
 * Resolve wallet ID from request context with 2-priority + auto-resolve + session access check.
 *
 * @param c - Hono request context (must have sessionId set by sessionAuth)
 * @param db - Drizzle database instance
 * @param bodyWalletId - Optional walletId from request body (highest priority)
 * @returns Resolved wallet ID string
 * @throws WAIaaSError('WALLET_ID_REQUIRED') if no walletId and session has 0 or 2+ wallets
 * @throws WAIaaSError('WALLET_ACCESS_DENIED') if session does not have access to the wallet
 */
export function resolveWalletId(
  c: Context,
  db: BetterSQLite3Database<any>,
  bodyWalletId?: string,
): string {
  // Priority 1: explicit body parameter
  // Priority 2: query parameter
  const walletId = bodyWalletId || c.req.query('walletId');

  const sessionId = c.get('sessionId' as never) as string;

  if (!walletId) {
    // Auto-resolve: query all wallets linked to this session
    const links = db
      .select({ walletId: sessionWallets.walletId })
      .from(sessionWallets)
      .where(eq(sessionWallets.sessionId, sessionId))
      .all();

    if (links.length === 1) {
      // Single wallet in session -> auto-resolve
      return links[0]!.walletId;
    }

    // 0 or 2+ wallets -> walletId is required
    throw new WAIaaSError('WALLET_ID_REQUIRED', {
      message: links.length === 0
        ? 'No wallets linked to this session'
        : `Session has ${links.length} wallets — specify walletId`,
    });
  }

  // Verify session has access to this wallet via session_wallets junction table
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

/**
 * Verify that a session has access to a specific wallet via session_wallets junction table.
 *
 * Used when the walletId comes from a different source (e.g., transaction record)
 * rather than from request parameters.
 *
 * @param sessionId - Session ID to check
 * @param walletId - Wallet ID to verify access for
 * @param db - Drizzle database instance
 * @throws WAIaaSError('WALLET_ACCESS_DENIED') if session does not have access to the wallet
 */
export function verifyWalletAccess(
  sessionId: string,
  walletId: string,
  db: BetterSQLite3Database<any>,
): void {
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
}
