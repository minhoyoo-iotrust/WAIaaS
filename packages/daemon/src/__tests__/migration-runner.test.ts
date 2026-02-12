/**
 * Tests for the DB migration runner (v1.4+ incremental migrations).
 *
 * Tests cover:
 * 1. Empty MIGRATIONS array -> no-op
 * 2. Sequential execution of new migrations
 * 3. Skipping already-applied migrations
 * 4. Rollback on failure + subsequent migrations not executed
 * 5. Migration order guarantee (ascending by version)
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { Database as DatabaseType } from 'better-sqlite3';
import { createDatabase, pushSchema, runMigrations, MIGRATIONS } from '../infrastructure/database/index.js';
import type { Migration } from '../infrastructure/database/index.js';

// ---------------------------------------------------------------------------
// Test setup
// ---------------------------------------------------------------------------

let sqlite: DatabaseType;

beforeEach(() => {
  const conn = createDatabase(':memory:');
  sqlite = conn.sqlite;
  pushSchema(sqlite);
});

afterEach(() => {
  try {
    sqlite.close();
  } catch {
    // already closed
  }
});

// ---------------------------------------------------------------------------
// Helper: get current max version from schema_version
// ---------------------------------------------------------------------------

function getMaxVersion(): number {
  const row = sqlite
    .prepare('SELECT MAX(version) AS max_version FROM schema_version')
    .get() as { max_version: number | null };
  return row.max_version ?? 0;
}

function getVersions(): number[] {
  const rows = sqlite
    .prepare('SELECT version FROM schema_version ORDER BY version')
    .all() as Array<{ version: number }>;
  return rows.map((r) => r.version);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Migration Runner', () => {
  it('should return { applied: 0, skipped: 0 } for empty migrations array', () => {
    const result = runMigrations(sqlite, []);
    expect(result).toEqual({ applied: 0, skipped: 0 });
    expect(getMaxVersion()).toBe(1); // only initial version 1
  });

  it('should execute version 2 and 3 migrations sequentially', () => {
    const migrations: Migration[] = [
      {
        version: 2,
        description: 'Add test_column to agents',
        up: (db) => {
          db.exec('ALTER TABLE agents ADD COLUMN test_col_v2 TEXT');
        },
      },
      {
        version: 3,
        description: 'Add another test_column to agents',
        up: (db) => {
          db.exec('ALTER TABLE agents ADD COLUMN test_col_v3 TEXT');
        },
      },
    ];

    const result = runMigrations(sqlite, migrations);
    expect(result).toEqual({ applied: 2, skipped: 0 });
    expect(getMaxVersion()).toBe(3);
    expect(getVersions()).toEqual([1, 2, 3]);

    // Verify columns were actually added
    const columns = sqlite.prepare("PRAGMA table_info('agents')").all() as Array<{ name: string }>;
    const colNames = columns.map((c) => c.name);
    expect(colNames).toContain('test_col_v2');
    expect(colNames).toContain('test_col_v3');
  });

  it('should skip already-applied migrations', () => {
    const migrations: Migration[] = [
      {
        version: 2,
        description: 'Add test_column to agents',
        up: (db) => {
          db.exec('ALTER TABLE agents ADD COLUMN test_col_skip TEXT');
        },
      },
      {
        version: 3,
        description: 'Add another column',
        up: (db) => {
          db.exec('ALTER TABLE agents ADD COLUMN test_col_skip2 TEXT');
        },
      },
    ];

    // First run: apply both
    const first = runMigrations(sqlite, migrations);
    expect(first).toEqual({ applied: 2, skipped: 0 });

    // Second run: skip both
    const second = runMigrations(sqlite, migrations);
    expect(second).toEqual({ applied: 0, skipped: 2 });
    expect(getMaxVersion()).toBe(3);
  });

  it('should rollback failed migration and not execute subsequent ones', () => {
    const migrations: Migration[] = [
      {
        version: 2,
        description: 'Failing migration',
        up: () => {
          throw new Error('Intentional migration failure');
        },
      },
      {
        version: 3,
        description: 'Should not be reached',
        up: (db) => {
          db.exec('ALTER TABLE agents ADD COLUMN should_not_exist TEXT');
        },
      },
    ];

    expect(() => runMigrations(sqlite, migrations)).toThrow(
      /Migration v2.*failed.*Intentional migration failure/,
    );

    // version 2 should NOT be recorded
    expect(getMaxVersion()).toBe(1);
    expect(getVersions()).toEqual([1]);

    // version 3 should NOT have been executed
    const columns = sqlite.prepare("PRAGMA table_info('agents')").all() as Array<{ name: string }>;
    const colNames = columns.map((c) => c.name);
    expect(colNames).not.toContain('should_not_exist');
  });

  it('should execute migrations in ascending version order regardless of array order', () => {
    const executionOrder: number[] = [];

    const migrations: Migration[] = [
      {
        version: 4,
        description: 'Fourth',
        up: (db) => {
          executionOrder.push(4);
          db.exec('ALTER TABLE agents ADD COLUMN order_v4 TEXT');
        },
      },
      {
        version: 2,
        description: 'Second',
        up: (db) => {
          executionOrder.push(2);
          db.exec('ALTER TABLE agents ADD COLUMN order_v2 TEXT');
        },
      },
      {
        version: 3,
        description: 'Third',
        up: (db) => {
          executionOrder.push(3);
          db.exec('ALTER TABLE agents ADD COLUMN order_v3 TEXT');
        },
      },
    ];

    const result = runMigrations(sqlite, migrations);
    expect(result).toEqual({ applied: 3, skipped: 0 });
    expect(executionOrder).toEqual([2, 3, 4]);
    expect(getVersions()).toEqual([1, 2, 3, 4]);
  });

  it('should skip version 1 migration (already exists from pushSchema)', () => {
    const migrations: Migration[] = [
      {
        version: 1,
        description: 'Should be skipped (pushSchema creates v1)',
        up: () => {
          throw new Error('Should not execute');
        },
      },
      {
        version: 2,
        description: 'Should execute',
        up: (db) => {
          db.exec('ALTER TABLE agents ADD COLUMN v1_skip_test TEXT');
        },
      },
    ];

    const result = runMigrations(sqlite, migrations);
    expect(result).toEqual({ applied: 1, skipped: 1 });
    expect(getMaxVersion()).toBe(2);
  });

  it('should record description in schema_version for applied migrations', () => {
    const migrations: Migration[] = [
      {
        version: 2,
        description: 'Add token_balances table',
        up: (db) => {
          db.exec('ALTER TABLE agents ADD COLUMN desc_test TEXT');
        },
      },
    ];

    runMigrations(sqlite, migrations);

    const row = sqlite
      .prepare('SELECT description FROM schema_version WHERE version = 2')
      .get() as { description: string } | undefined;
    expect(row).toBeDefined();
    expect(row!.description).toBe('Add token_balances table');
  });
});

// ---------------------------------------------------------------------------
// managesOwnTransaction + v2 migration tests (TDD RED phase for 85-01)
// ---------------------------------------------------------------------------

describe('managesOwnTransaction migrations', () => {
  it('should manage its own PRAGMA and transaction', () => {
    let fkValueInsideUp = -1;

    const migrations: Migration[] = [
      {
        version: 2,
        description: 'Self-managed PRAGMA migration',
        managesOwnTransaction: true,
        up: (db) => {
          // Capture foreign_keys value inside up() -- should be OFF (0)
          const fk = db.pragma('foreign_keys') as Array<{ foreign_keys: number }>;
          fkValueInsideUp = fk[0]!.foreign_keys;

          // Do a trivial DDL to prove the migration ran
          db.exec('BEGIN');
          db.exec('ALTER TABLE agents ADD COLUMN self_managed_test TEXT');
          db.exec('COMMIT');
        },
      },
    ];

    runMigrations(sqlite, migrations);

    // Inside up(), foreign_keys should have been OFF (0)
    expect(fkValueInsideUp).toBe(0);

    // After migration, foreign_keys should be restored to ON (1)
    const fkAfter = sqlite.pragma('foreign_keys') as Array<{ foreign_keys: number }>;
    expect(fkAfter[0]!.foreign_keys).toBe(1);

    // schema_version should record version 2
    expect(getMaxVersion()).toBe(2);
  });

  it('should still allow retry after failure and restore foreign_keys', () => {
    const migrations: Migration[] = [
      {
        version: 2,
        description: 'Failing self-managed migration',
        managesOwnTransaction: true,
        up: () => {
          throw new Error('Intentional self-managed failure');
        },
      },
    ];

    // Should throw the migration error
    expect(() => runMigrations(sqlite, migrations)).toThrow(
      /Migration v2.*failed.*Intentional self-managed failure/,
    );

    // Version 2 should NOT be recorded
    expect(getMaxVersion()).toBe(1);
    expect(getVersions()).toEqual([1]);

    // foreign_keys should be restored to ON (1)
    const fkAfter = sqlite.pragma('foreign_keys') as Array<{ foreign_keys: number }>;
    expect(fkAfter[0]!.foreign_keys).toBe(1);
  });
});

describe('v2 migration: expand agents network CHECK for EVM', () => {
  // Get v2 migration from the global MIGRATIONS array (populated in migrate.ts)
  function getV2Migration(): Migration {
    const v2 = MIGRATIONS.find((m) => m.version === 2);
    if (!v2) throw new Error('v2 migration not found in MIGRATIONS array');
    return v2;
  }

  it('should preserve existing Solana agents', () => {
    const ts = Math.floor(Date.now() / 1000);

    // Insert 3 Solana agents with different networks
    const agents = [
      { id: 'agent-sol-1', network: 'mainnet', pk: 'pk-sol-1' },
      { id: 'agent-sol-2', network: 'devnet', pk: 'pk-sol-2' },
      { id: 'agent-sol-3', network: 'testnet', pk: 'pk-sol-3' },
    ];

    for (const a of agents) {
      sqlite.prepare(
        `INSERT INTO agents (id, name, chain, network, public_key, status, owner_verified, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(a.id, `Agent ${a.network}`, 'solana', a.network, a.pk, 'ACTIVE', 0, ts, ts);
    }

    // Run v2 migration
    const v2 = getV2Migration();
    runMigrations(sqlite, [v2]);

    // All 3 agents should still exist with identical data
    const rows = sqlite
      .prepare('SELECT id, name, chain, network, public_key, status, owner_verified, created_at, updated_at FROM agents ORDER BY id')
      .all() as Array<Record<string, unknown>>;

    expect(rows).toHaveLength(3);
    for (let i = 0; i < agents.length; i++) {
      const a = agents[i]!;
      const row = rows.find((r) => r.id === a.id);
      expect(row).toBeDefined();
      expect(row!.chain).toBe('solana');
      expect(row!.network).toBe(a.network);
      expect(row!.public_key).toBe(a.pk);
      expect(row!.status).toBe('ACTIVE');
    }
  });

  it('should expand network CHECK to accept EVM networks', () => {
    const ts = Math.floor(Date.now() / 1000);

    // Run v2 migration
    const v2 = getV2Migration();
    runMigrations(sqlite, [v2]);

    // ethereum-mainnet should succeed
    expect(() => {
      sqlite.prepare(
        `INSERT INTO agents (id, name, chain, network, public_key, status, owner_verified, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run('evm-agent-1', 'EVM Agent 1', 'ethereum', 'ethereum-mainnet', 'pk-evm-1', 'CREATING', 0, ts, ts);
    }).not.toThrow();

    // polygon-amoy should succeed
    expect(() => {
      sqlite.prepare(
        `INSERT INTO agents (id, name, chain, network, public_key, status, owner_verified, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run('evm-agent-2', 'EVM Agent 2', 'ethereum', 'polygon-amoy', 'pk-evm-2', 'CREATING', 0, ts, ts);
    }).not.toThrow();

    // invalid-network should fail CHECK
    expect(() => {
      sqlite.prepare(
        `INSERT INTO agents (id, name, chain, network, public_key, status, owner_verified, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run('evm-agent-3', 'EVM Agent 3', 'ethereum', 'invalid-network', 'pk-evm-3', 'CREATING', 0, ts, ts);
    }).toThrow(/CHECK/i);
  });

  it('should pass foreign_key_check after migration', () => {
    const ts = Math.floor(Date.now() / 1000);
    const agentId = 'fk-check-agent';
    const sessionId = 'fk-check-session';
    const txId = 'fk-check-tx';

    // Insert agent, session, and transaction (FK relationships)
    sqlite.prepare(
      `INSERT INTO agents (id, name, chain, network, public_key, status, owner_verified, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(agentId, 'FK Agent', 'solana', 'mainnet', 'pk-fk-check', 'ACTIVE', 0, ts, ts);

    sqlite.prepare(
      `INSERT INTO sessions (id, agent_id, token_hash, expires_at, absolute_expires_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(sessionId, agentId, 'hash-fk-check', ts + 3600, ts + 86400, ts);

    sqlite.prepare(
      `INSERT INTO transactions (id, agent_id, session_id, chain, type, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(txId, agentId, sessionId, 'solana', 'TRANSFER', 'PENDING', ts);

    // Run v2 migration
    const v2 = getV2Migration();
    runMigrations(sqlite, [v2]);

    // FK check should pass (empty array = no violations)
    const fkErrors = sqlite.pragma('foreign_key_check') as unknown[];
    expect(fkErrors).toEqual([]);

    // Session and transaction should still reference the agent
    const session = sqlite.prepare('SELECT agent_id FROM sessions WHERE id = ?').get(sessionId) as { agent_id: string };
    expect(session.agent_id).toBe(agentId);

    const tx = sqlite.prepare('SELECT agent_id, session_id FROM transactions WHERE id = ?').get(txId) as { agent_id: string; session_id: string };
    expect(tx.agent_id).toBe(agentId);
    expect(tx.session_id).toBe(sessionId);
  });
});
