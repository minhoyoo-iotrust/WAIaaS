/**
 * TDD tests for Owner 3-State Machine.
 *
 * Tests resolveOwnerState(), OwnerLifecycleService (setOwner, removeOwner,
 * markOwnerVerified), and downgradeIfNoOwner() logic.
 *
 * Uses in-memory SQLite + Drizzle (same pattern as delay-queue.test.ts).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createDatabase, pushSchema } from '../infrastructure/database/index.js';
import type { DatabaseConnection } from '../infrastructure/database/index.js';
import { agents } from '../infrastructure/database/schema.js';
import { generateId } from '../infrastructure/database/id.js';
import { WAIaaSError } from '@waiaas/core';
import {
  resolveOwnerState,
  OwnerLifecycleService,
  downgradeIfNoOwner,
} from '../workflow/owner-state.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let conn: DatabaseConnection;
let lifecycle: OwnerLifecycleService;

async function insertTestAgent(overrides?: {
  ownerAddress?: string | null;
  ownerVerified?: boolean;
}): Promise<string> {
  const id = generateId();
  const now = new Date(Math.floor(Date.now() / 1000) * 1000);
  await conn.db.insert(agents).values({
    id,
    name: 'test-agent',
    chain: 'solana',
    network: 'devnet',
    publicKey: `pk-${id}`,
    status: 'ACTIVE',
    ownerAddress: overrides?.ownerAddress ?? null,
    ownerVerified: overrides?.ownerVerified ?? false,
    createdAt: now,
    updatedAt: now,
  });
  return id;
}

function getAgent(agentId: string) {
  return conn.sqlite
    .prepare('SELECT owner_address, owner_verified, updated_at FROM agents WHERE id = ?')
    .get(agentId) as {
    owner_address: string | null;
    owner_verified: number;
    updated_at: number;
  } | undefined;
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(async () => {
  conn = createDatabase(':memory:');
  pushSchema(conn.sqlite);
  lifecycle = new OwnerLifecycleService({ db: conn.db, sqlite: conn.sqlite });
});

afterEach(() => {
  conn.sqlite.close();
});

// ---------------------------------------------------------------------------
// resolveOwnerState tests
// ---------------------------------------------------------------------------

describe('resolveOwnerState', () => {
  it('should return NONE when ownerAddress is null', () => {
    expect(resolveOwnerState({ ownerAddress: null, ownerVerified: false })).toBe('NONE');
  });

  it('should return GRACE when ownerAddress is set and ownerVerified is false', () => {
    expect(
      resolveOwnerState({ ownerAddress: 'SomeAddress123', ownerVerified: false }),
    ).toBe('GRACE');
  });

  it('should return LOCKED when ownerAddress is set and ownerVerified is true', () => {
    expect(
      resolveOwnerState({ ownerAddress: 'SomeAddress123', ownerVerified: true }),
    ).toBe('LOCKED');
  });
});

// ---------------------------------------------------------------------------
// OwnerLifecycleService - setOwner
// ---------------------------------------------------------------------------

describe('OwnerLifecycleService - setOwner', () => {
  it('should set ownerAddress in NONE state', async () => {
    const agentId = await insertTestAgent(); // NONE state (no owner)

    lifecycle.setOwner(agentId, 'OwnerWalletAddress123');

    const row = getAgent(agentId);
    expect(row!.owner_address).toBe('OwnerWalletAddress123');
    expect(row!.owner_verified).toBe(0); // false
  });

  it('should update ownerAddress in GRACE state (change allowed)', async () => {
    const agentId = await insertTestAgent({
      ownerAddress: 'OldAddress',
      ownerVerified: false,
    });

    lifecycle.setOwner(agentId, 'NewAddress');

    const row = getAgent(agentId);
    expect(row!.owner_address).toBe('NewAddress');
    expect(row!.owner_verified).toBe(0);
  });

  it('should throw OWNER_ALREADY_CONNECTED in LOCKED state', async () => {
    const agentId = await insertTestAgent({
      ownerAddress: 'LockedOwner',
      ownerVerified: true,
    });

    expect(() => lifecycle.setOwner(agentId, 'NewOwner')).toThrow(WAIaaSError);
    try {
      lifecycle.setOwner(agentId, 'NewOwner');
    } catch (err) {
      expect((err as WAIaaSError).code).toBe('OWNER_ALREADY_CONNECTED');
    }
  });
});

// ---------------------------------------------------------------------------
// OwnerLifecycleService - removeOwner
// ---------------------------------------------------------------------------

describe('OwnerLifecycleService - removeOwner', () => {
  it('should clear ownerAddress in GRACE state', async () => {
    const agentId = await insertTestAgent({
      ownerAddress: 'GraceOwner',
      ownerVerified: false,
    });

    lifecycle.removeOwner(agentId);

    const row = getAgent(agentId);
    expect(row!.owner_address).toBeNull();
    expect(row!.owner_verified).toBe(0);
  });

  it('should throw OWNER_ALREADY_CONNECTED in LOCKED state', async () => {
    const agentId = await insertTestAgent({
      ownerAddress: 'LockedOwner',
      ownerVerified: true,
    });

    expect(() => lifecycle.removeOwner(agentId)).toThrow(WAIaaSError);
    try {
      lifecycle.removeOwner(agentId);
    } catch (err) {
      expect((err as WAIaaSError).code).toBe('OWNER_ALREADY_CONNECTED');
    }
  });

  it('should be a no-op in NONE state (already no owner)', async () => {
    const agentId = await insertTestAgent(); // NONE state

    // Should not throw
    lifecycle.removeOwner(agentId);

    const row = getAgent(agentId);
    expect(row!.owner_address).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// OwnerLifecycleService - markOwnerVerified
// ---------------------------------------------------------------------------

describe('OwnerLifecycleService - markOwnerVerified', () => {
  it('should transition from GRACE to LOCKED', async () => {
    const agentId = await insertTestAgent({
      ownerAddress: 'GraceOwner',
      ownerVerified: false,
    });

    lifecycle.markOwnerVerified(agentId);

    const row = getAgent(agentId);
    expect(row!.owner_verified).toBe(1); // true
    expect(row!.owner_address).toBe('GraceOwner');
  });

  it('should be a no-op in LOCKED state (already verified)', async () => {
    const agentId = await insertTestAgent({
      ownerAddress: 'LockedOwner',
      ownerVerified: true,
    });

    // Should not throw
    lifecycle.markOwnerVerified(agentId);

    const row = getAgent(agentId);
    expect(row!.owner_verified).toBe(1);
  });

  it('should throw OWNER_NOT_CONNECTED in NONE state', async () => {
    const agentId = await insertTestAgent(); // NONE state

    expect(() => lifecycle.markOwnerVerified(agentId)).toThrow(WAIaaSError);
    try {
      lifecycle.markOwnerVerified(agentId);
    } catch (err) {
      expect((err as WAIaaSError).code).toBe('OWNER_NOT_CONNECTED');
    }
  });
});

// ---------------------------------------------------------------------------
// downgradeIfNoOwner tests
// ---------------------------------------------------------------------------

describe('downgradeIfNoOwner', () => {
  it('should downgrade APPROVAL to DELAY when owner state is NONE', () => {
    const result = downgradeIfNoOwner({ ownerAddress: null, ownerVerified: false }, 'APPROVAL');
    expect(result.tier).toBe('DELAY');
    expect(result.downgraded).toBe(true);
  });

  it('should keep APPROVAL when owner state is GRACE', () => {
    const result = downgradeIfNoOwner(
      { ownerAddress: 'SomeOwner', ownerVerified: false },
      'APPROVAL',
    );
    expect(result.tier).toBe('APPROVAL');
    expect(result.downgraded).toBe(false);
  });

  it('should keep APPROVAL when owner state is LOCKED', () => {
    const result = downgradeIfNoOwner(
      { ownerAddress: 'SomeOwner', ownerVerified: true },
      'APPROVAL',
    );
    expect(result.tier).toBe('APPROVAL');
    expect(result.downgraded).toBe(false);
  });

  it('should keep DELAY unchanged regardless of owner state', () => {
    const result = downgradeIfNoOwner({ ownerAddress: null, ownerVerified: false }, 'DELAY');
    expect(result.tier).toBe('DELAY');
    expect(result.downgraded).toBe(false);
  });

  it('should keep INSTANT unchanged regardless of owner state', () => {
    const result = downgradeIfNoOwner({ ownerAddress: null, ownerVerified: false }, 'INSTANT');
    expect(result.tier).toBe('INSTANT');
    expect(result.downgraded).toBe(false);
  });

  it('should keep NOTIFY unchanged regardless of owner state', () => {
    const result = downgradeIfNoOwner({ ownerAddress: null, ownerVerified: false }, 'NOTIFY');
    expect(result.tier).toBe('NOTIFY');
    expect(result.downgraded).toBe(false);
  });
});
