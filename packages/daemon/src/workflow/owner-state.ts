/**
 * Owner 3-State Machine: NONE -> GRACE -> LOCKED.
 *
 * Manages the Owner lifecycle for wallets:
 * - NONE: No owner registered. APPROVAL tier auto-downgrades to DELAY.
 * - GRACE: Owner address set but not yet verified via signature.
 *   Owner can be changed/removed with masterAuth only.
 * - LOCKED: Owner verified via ownerAuth signature.
 *   Owner change requires ownerAuth; removal blocked entirely.
 *
 * Provides:
 * - resolveOwnerState(): pure function to determine state from wallet fields
 * - OwnerLifecycleService: setOwner/removeOwner/markOwnerVerified with DB ops
 * - downgradeIfNoOwner(): APPROVAL -> DELAY when no owner registered
 *
 * @see docs/34-owner-wallet-design.md
 */

import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type { Database as SQLiteDatabase } from 'better-sqlite3';
import { WAIaaSError } from '@waiaas/core';
import type * as schema from '../infrastructure/database/schema.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type OwnerState = 'NONE' | 'GRACE' | 'LOCKED';

interface WalletOwnerFields {
  ownerAddress: string | null;
  ownerVerified: boolean;
}

export interface OwnerLifecycleDeps {
  db: BetterSQLite3Database<typeof schema>;
  sqlite: SQLiteDatabase;
}

interface DowngradeResult {
  tier: string;
  downgraded: boolean;
}

// ---------------------------------------------------------------------------
// resolveOwnerState - pure function
// ---------------------------------------------------------------------------

/**
 * Determine the Owner state from wallet fields.
 *
 * Pure function, no DB access, no side effects.
 *
 * @param wallet - Wallet fields { ownerAddress, ownerVerified }
 * @returns 'NONE' | 'GRACE' | 'LOCKED'
 */
export function resolveOwnerState(wallet: WalletOwnerFields): OwnerState {
  if (wallet.ownerAddress === null || wallet.ownerAddress === undefined) {
    return 'NONE';
  }
  if (wallet.ownerVerified) {
    return 'LOCKED';
  }
  return 'GRACE';
}

// ---------------------------------------------------------------------------
// OwnerLifecycleService
// ---------------------------------------------------------------------------

interface WalletRow {
  owner_address: string | null;
  owner_verified: number; // SQLite boolean: 0 | 1
}

/**
 * Service managing Owner state transitions with DB persistence.
 */
export class OwnerLifecycleService {
  private readonly sqlite: SQLiteDatabase;

  constructor(deps: OwnerLifecycleDeps) {
    this.sqlite = deps.sqlite;
  }

  /**
   * Set the owner address for a wallet.
   *
   * - NONE or GRACE: sets ownerAddress, ownerVerified = false
   * - LOCKED: throws OWNER_ALREADY_CONNECTED
   *
   * @param walletId - Wallet ID
   * @param ownerAddress - Owner wallet address to set
   * @throws WAIaaSError OWNER_ALREADY_CONNECTED if in LOCKED state
   */
  setOwner(walletId: string, ownerAddress: string): void {
    const wallet = this.getWalletRow(walletId);

    const state = resolveOwnerState({
      ownerAddress: wallet.owner_address,
      ownerVerified: wallet.owner_verified === 1,
    });

    if (state === 'LOCKED') {
      throw new WAIaaSError('OWNER_ALREADY_CONNECTED', {
        message: 'Use ownerAuth to change owner in LOCKED state',
      });
    }

    const now = Math.floor(Date.now() / 1000);
    this.sqlite
      .prepare(
        'UPDATE wallets SET owner_address = ?, owner_verified = 0, updated_at = ? WHERE id = ?',
      )
      .run(ownerAddress, now, walletId);
  }

  /**
   * Remove the owner from a wallet.
   *
   * - GRACE: clears ownerAddress, ownerVerified = false
   * - LOCKED: throws OWNER_ALREADY_CONNECTED
   * - NONE: no-op (already no owner)
   *
   * @param walletId - Wallet ID
   * @throws WAIaaSError OWNER_ALREADY_CONNECTED if in LOCKED state
   */
  removeOwner(walletId: string): void {
    const wallet = this.getWalletRow(walletId);

    const state = resolveOwnerState({
      ownerAddress: wallet.owner_address,
      ownerVerified: wallet.owner_verified === 1,
    });

    if (state === 'LOCKED') {
      throw new WAIaaSError('OWNER_ALREADY_CONNECTED', {
        message: 'Owner removal blocked in LOCKED state',
      });
    }

    if (state === 'NONE') {
      return; // no-op
    }

    // GRACE: clear owner
    const now = Math.floor(Date.now() / 1000);
    this.sqlite
      .prepare(
        'UPDATE wallets SET owner_address = NULL, owner_verified = 0, updated_at = ? WHERE id = ?',
      )
      .run(now, walletId);
  }

  /**
   * Mark the owner as verified (GRACE -> LOCKED transition).
   *
   * Called when ownerAuth middleware succeeds on any ownerAuth-protected route.
   *
   * - GRACE: sets ownerVerified = true
   * - LOCKED: no-op (already verified)
   * - NONE: throws OWNER_NOT_CONNECTED
   *
   * @param walletId - Wallet ID
   * @throws WAIaaSError OWNER_NOT_CONNECTED if in NONE state
   */
  markOwnerVerified(walletId: string): void {
    const wallet = this.getWalletRow(walletId);

    const state = resolveOwnerState({
      ownerAddress: wallet.owner_address,
      ownerVerified: wallet.owner_verified === 1,
    });

    if (state === 'NONE') {
      throw new WAIaaSError('OWNER_NOT_CONNECTED', {
        message: 'No owner address registered for this wallet',
      });
    }

    if (state === 'LOCKED') {
      return; // already verified, no-op
    }

    // GRACE -> LOCKED
    const now = Math.floor(Date.now() / 1000);
    this.sqlite
      .prepare('UPDATE wallets SET owner_verified = 1, updated_at = ? WHERE id = ?')
      .run(now, walletId);
  }

  // -------------------------------------------------------------------------
  // Private
  // -------------------------------------------------------------------------

  private getWalletRow(walletId: string): WalletRow {
    const row = this.sqlite
      .prepare('SELECT owner_address, owner_verified FROM wallets WHERE id = ?')
      .get(walletId) as WalletRow | undefined;

    if (!row) {
      throw new WAIaaSError('WALLET_NOT_FOUND', {
        message: `Wallet '${walletId}' not found`,
      });
    }

    return row;
  }
}

// ---------------------------------------------------------------------------
// downgradeIfNoOwner
// ---------------------------------------------------------------------------

/**
 * If tier is APPROVAL and owner state is NONE, downgrade to DELAY.
 *
 * The caller should log a TX_DOWNGRADED_DELAY audit event when downgraded=true.
 *
 * @param wallet - Wallet fields for resolveOwnerState
 * @param tier - Current policy tier
 * @returns { tier, downgraded }
 */
export function downgradeIfNoOwner(wallet: WalletOwnerFields, tier: string): DowngradeResult {
  if (tier === 'APPROVAL' && resolveOwnerState(wallet) === 'NONE') {
    return { tier: 'DELAY', downgraded: true };
  }
  return { tier, downgraded: false };
}
