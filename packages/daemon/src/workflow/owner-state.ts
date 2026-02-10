/**
 * Owner 3-State Machine: NONE -> GRACE -> LOCKED.
 *
 * Manages the Owner lifecycle for agents:
 * - NONE: No owner registered. APPROVAL tier auto-downgrades to DELAY.
 * - GRACE: Owner address set but not yet verified via signature.
 *   Owner can be changed/removed with masterAuth only.
 * - LOCKED: Owner verified via ownerAuth signature.
 *   Owner change requires ownerAuth; removal blocked entirely.
 *
 * Provides:
 * - resolveOwnerState(): pure function to determine state from agent fields
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

interface AgentOwnerFields {
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
 * Determine the Owner state from agent fields.
 *
 * Pure function, no DB access, no side effects.
 *
 * @param agent - Agent fields { ownerAddress, ownerVerified }
 * @returns 'NONE' | 'GRACE' | 'LOCKED'
 */
export function resolveOwnerState(agent: AgentOwnerFields): OwnerState {
  if (agent.ownerAddress === null || agent.ownerAddress === undefined) {
    return 'NONE';
  }
  if (agent.ownerVerified) {
    return 'LOCKED';
  }
  return 'GRACE';
}

// ---------------------------------------------------------------------------
// OwnerLifecycleService
// ---------------------------------------------------------------------------

interface AgentRow {
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
   * Set the owner address for an agent.
   *
   * - NONE or GRACE: sets ownerAddress, ownerVerified = false
   * - LOCKED: throws OWNER_ALREADY_CONNECTED
   *
   * @param agentId - Agent ID
   * @param ownerAddress - Owner wallet address to set
   * @throws WAIaaSError OWNER_ALREADY_CONNECTED if in LOCKED state
   */
  setOwner(agentId: string, ownerAddress: string): void {
    const agent = this.getAgentRow(agentId);

    const state = resolveOwnerState({
      ownerAddress: agent.owner_address,
      ownerVerified: agent.owner_verified === 1,
    });

    if (state === 'LOCKED') {
      throw new WAIaaSError('OWNER_ALREADY_CONNECTED', {
        message: 'Use ownerAuth to change owner in LOCKED state',
      });
    }

    const now = Math.floor(Date.now() / 1000);
    this.sqlite
      .prepare(
        'UPDATE agents SET owner_address = ?, owner_verified = 0, updated_at = ? WHERE id = ?',
      )
      .run(ownerAddress, now, agentId);
  }

  /**
   * Remove the owner from an agent.
   *
   * - GRACE: clears ownerAddress, ownerVerified = false
   * - LOCKED: throws OWNER_ALREADY_CONNECTED
   * - NONE: no-op (already no owner)
   *
   * @param agentId - Agent ID
   * @throws WAIaaSError OWNER_ALREADY_CONNECTED if in LOCKED state
   */
  removeOwner(agentId: string): void {
    const agent = this.getAgentRow(agentId);

    const state = resolveOwnerState({
      ownerAddress: agent.owner_address,
      ownerVerified: agent.owner_verified === 1,
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
        'UPDATE agents SET owner_address = NULL, owner_verified = 0, updated_at = ? WHERE id = ?',
      )
      .run(now, agentId);
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
   * @param agentId - Agent ID
   * @throws WAIaaSError OWNER_NOT_CONNECTED if in NONE state
   */
  markOwnerVerified(agentId: string): void {
    const agent = this.getAgentRow(agentId);

    const state = resolveOwnerState({
      ownerAddress: agent.owner_address,
      ownerVerified: agent.owner_verified === 1,
    });

    if (state === 'NONE') {
      throw new WAIaaSError('OWNER_NOT_CONNECTED', {
        message: 'No owner address registered for this agent',
      });
    }

    if (state === 'LOCKED') {
      return; // already verified, no-op
    }

    // GRACE -> LOCKED
    const now = Math.floor(Date.now() / 1000);
    this.sqlite
      .prepare('UPDATE agents SET owner_verified = 1, updated_at = ? WHERE id = ?')
      .run(now, agentId);
  }

  // -------------------------------------------------------------------------
  // Private
  // -------------------------------------------------------------------------

  private getAgentRow(agentId: string): AgentRow {
    const row = this.sqlite
      .prepare('SELECT owner_address, owner_verified FROM agents WHERE id = ?')
      .get(agentId) as AgentRow | undefined;

    if (!row) {
      throw new WAIaaSError('AGENT_NOT_FOUND', {
        message: `Agent '${agentId}' not found`,
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
 * @param agent - Agent fields for resolveOwnerState
 * @param tier - Current policy tier
 * @returns { tier, downgraded }
 */
export function downgradeIfNoOwner(agent: AgentOwnerFields, tier: string): DowngradeResult {
  if (tier === 'APPROVAL' && resolveOwnerState(agent) === 'NONE') {
    return { tier: 'DELAY', downgraded: true };
  }
  return { tier, downgraded: false };
}
