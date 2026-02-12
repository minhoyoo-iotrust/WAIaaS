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
  // Note: pushSchema() runs global MIGRATIONS (including v2), so after setup
  // schema_version has versions [1, 2] and getMaxVersion() returns 2.
  // All test migration versions use 10+ to avoid conflicts with real migrations.

  it('should return { applied: 0, skipped: 0 } for empty migrations array', () => {
    const result = runMigrations(sqlite, []);
    expect(result).toEqual({ applied: 0, skipped: 0 });
    expect(getMaxVersion()).toBe(2); // v1 (initial) + v2 (EVM network CHECK)
  });

  it('should execute new migrations sequentially', () => {
    const migrations: Migration[] = [
      {
        version: 10,
        description: 'Add test_column to agents',
        up: (db) => {
          db.exec('ALTER TABLE agents ADD COLUMN test_col_v10 TEXT');
        },
      },
      {
        version: 11,
        description: 'Add another test_column to agents',
        up: (db) => {
          db.exec('ALTER TABLE agents ADD COLUMN test_col_v11 TEXT');
        },
      },
    ];

    const result = runMigrations(sqlite, migrations);
    expect(result).toEqual({ applied: 2, skipped: 0 });
    expect(getMaxVersion()).toBe(11);
    expect(getVersions()).toContain(10);
    expect(getVersions()).toContain(11);

    // Verify columns were actually added
    const columns = sqlite.prepare("PRAGMA table_info('agents')").all() as Array<{ name: string }>;
    const colNames = columns.map((c) => c.name);
    expect(colNames).toContain('test_col_v10');
    expect(colNames).toContain('test_col_v11');
  });

  it('should skip already-applied migrations', () => {
    const migrations: Migration[] = [
      {
        version: 10,
        description: 'Add test_column to agents',
        up: (db) => {
          db.exec('ALTER TABLE agents ADD COLUMN test_col_skip TEXT');
        },
      },
      {
        version: 11,
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
    expect(getMaxVersion()).toBe(11);
  });

  it('should rollback failed migration and not execute subsequent ones', () => {
    const migrations: Migration[] = [
      {
        version: 10,
        description: 'Failing migration',
        up: () => {
          throw new Error('Intentional migration failure');
        },
      },
      {
        version: 11,
        description: 'Should not be reached',
        up: (db) => {
          db.exec('ALTER TABLE agents ADD COLUMN should_not_exist TEXT');
        },
      },
    ];

    expect(() => runMigrations(sqlite, migrations)).toThrow(
      /Migration v10.*failed.*Intentional migration failure/,
    );

    // version 10 should NOT be recorded (max stays at 2 from pushSchema)
    expect(getMaxVersion()).toBe(2);

    // version 11 should NOT have been executed
    const columns = sqlite.prepare("PRAGMA table_info('agents')").all() as Array<{ name: string }>;
    const colNames = columns.map((c) => c.name);
    expect(colNames).not.toContain('should_not_exist');
  });

  it('should execute migrations in ascending version order regardless of array order', () => {
    const executionOrder: number[] = [];

    const migrations: Migration[] = [
      {
        version: 12,
        description: 'Twelfth',
        up: (db) => {
          executionOrder.push(12);
          db.exec('ALTER TABLE agents ADD COLUMN order_v12 TEXT');
        },
      },
      {
        version: 10,
        description: 'Tenth',
        up: (db) => {
          executionOrder.push(10);
          db.exec('ALTER TABLE agents ADD COLUMN order_v10 TEXT');
        },
      },
      {
        version: 11,
        description: 'Eleventh',
        up: (db) => {
          executionOrder.push(11);
          db.exec('ALTER TABLE agents ADD COLUMN order_v11 TEXT');
        },
      },
    ];

    const result = runMigrations(sqlite, migrations);
    expect(result).toEqual({ applied: 3, skipped: 0 });
    expect(executionOrder).toEqual([10, 11, 12]);
    expect(getVersions()).toContain(10);
    expect(getVersions()).toContain(11);
    expect(getVersions()).toContain(12);
  });

  it('should skip version 1 and 2 migrations (already applied from pushSchema)', () => {
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
        description: 'Should be skipped (pushSchema runs v2)',
        up: () => {
          throw new Error('Should not execute');
        },
      },
      {
        version: 10,
        description: 'Should execute',
        up: (db) => {
          db.exec('ALTER TABLE agents ADD COLUMN v1_skip_test TEXT');
        },
      },
    ];

    const result = runMigrations(sqlite, migrations);
    expect(result).toEqual({ applied: 1, skipped: 2 });
    expect(getMaxVersion()).toBe(10);
  });

  it('should record description in schema_version for applied migrations', () => {
    const migrations: Migration[] = [
      {
        version: 10,
        description: 'Add token_balances table',
        up: (db) => {
          db.exec('ALTER TABLE agents ADD COLUMN desc_test TEXT');
        },
      },
    ];

    runMigrations(sqlite, migrations);

    const row = sqlite
      .prepare('SELECT description FROM schema_version WHERE version = 10')
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
        version: 20,
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

    // schema_version should record version 20
    expect(getMaxVersion()).toBe(20);
  });

  it('should still allow retry after failure and restore foreign_keys', () => {
    const migrations: Migration[] = [
      {
        version: 20,
        description: 'Failing self-managed migration',
        managesOwnTransaction: true,
        up: () => {
          throw new Error('Intentional self-managed failure');
        },
      },
    ];

    // Should throw the migration error
    expect(() => runMigrations(sqlite, migrations)).toThrow(
      /Migration v20.*failed.*Intentional self-managed failure/,
    );

    // Version 20 should NOT be recorded (max stays at 2 from pushSchema)
    expect(getMaxVersion()).toBe(2);

    // foreign_keys should be restored to ON (1)
    const fkAfter = sqlite.pragma('foreign_keys') as Array<{ foreign_keys: number }>;
    expect(fkAfter[0]!.foreign_keys).toBe(1);
  });
});

describe('v2 migration: expand agents network CHECK for EVM', () => {
  // These tests use a dedicated v1-only database (no auto-migrations)
  // so we can explicitly test the v2 migration path.
  let v1Sqlite: DatabaseType;

  function getV2Migration(): Migration {
    const v2 = MIGRATIONS.find((m) => m.version === 2);
    if (!v2) throw new Error('v2 migration not found in MIGRATIONS array');
    return v2;
  }

  /** Create a v1-only DB: pushSchema without running migrations */
  function createV1Database(): DatabaseType {
    const conn = createDatabase(':memory:');
    const db = conn.sqlite;

    // Manually push schema WITHOUT running migrations
    // (pushSchema calls runMigrations internally, so we replicate the v1 setup manually)
    db.exec('BEGIN');

    // Create all 9 tables with v1 CHECK constraints (Solana-only networks)
    db.exec(`CREATE TABLE IF NOT EXISTS agents (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  chain TEXT NOT NULL CHECK (chain IN ('solana')),
  network TEXT NOT NULL CHECK (network IN ('mainnet', 'devnet', 'testnet')),
  public_key TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'CREATING' CHECK (status IN ('CREATING', 'ACTIVE', 'SUSPENDED')),
  owner_address TEXT,
  owner_verified INTEGER NOT NULL DEFAULT 0 CHECK (owner_verified IN (0, 1)),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  suspended_at INTEGER,
  suspension_reason TEXT
)`);
    db.exec(`CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  constraints TEXT,
  usage_stats TEXT,
  revoked_at INTEGER,
  renewal_count INTEGER NOT NULL DEFAULT 0,
  max_renewals INTEGER NOT NULL DEFAULT 30,
  last_renewed_at INTEGER,
  absolute_expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
)`);
    db.exec(`CREATE TABLE IF NOT EXISTS transactions (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE RESTRICT,
  session_id TEXT REFERENCES sessions(id) ON DELETE SET NULL,
  chain TEXT NOT NULL,
  tx_hash TEXT,
  type TEXT NOT NULL CHECK (type IN ('TRANSFER', 'TOKEN_TRANSFER', 'CONTRACT_CALL', 'APPROVE', 'BATCH')),
  amount TEXT,
  to_address TEXT,
  token_mint TEXT,
  contract_address TEXT,
  method_signature TEXT,
  spender_address TEXT,
  approved_amount TEXT,
  parent_id TEXT REFERENCES transactions(id) ON DELETE CASCADE,
  batch_index INTEGER,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'QUEUED', 'APPROVED', 'REJECTED', 'EXECUTING', 'CONFIRMED', 'FAILED', 'PARTIAL_FAILURE')),
  tier TEXT CHECK (tier IS NULL OR tier IN ('INSTANT', 'STANDARD', 'APPROVAL')),
  queued_at INTEGER,
  executed_at INTEGER,
  created_at INTEGER NOT NULL,
  reserved_amount TEXT,
  error TEXT,
  metadata TEXT
)`);
    db.exec(`CREATE TABLE IF NOT EXISTS schema_version (
  version INTEGER PRIMARY KEY,
  applied_at INTEGER NOT NULL,
  description TEXT NOT NULL
)`);
    db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_agents_public_key ON agents(public_key)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_agents_status ON agents(status)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_agents_chain_network ON agents(chain, network)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_agents_owner_address ON agents(owner_address)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_sessions_agent_id ON sessions(agent_id)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_sessions_token_hash ON sessions(token_hash)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_transactions_agent_status ON transactions(agent_id, status)');
    db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_transactions_tx_hash ON transactions(tx_hash)');

    // Record schema version 1
    db.prepare('INSERT INTO schema_version (version, applied_at, description) VALUES (?, ?, ?)')
      .run(1, Math.floor(Date.now() / 1000), 'Initial schema (v1 Solana-only)');

    db.exec('COMMIT');
    return db;
  }

  beforeEach(() => {
    v1Sqlite = createV1Database();
  });

  afterEach(() => {
    try { v1Sqlite.close(); } catch { /* already closed */ }
  });

  it('should preserve existing Solana agents', () => {
    const ts = Math.floor(Date.now() / 1000);

    // Insert 3 Solana agents with different networks
    const agents = [
      { id: 'agent-sol-1', network: 'mainnet', pk: 'pk-sol-1' },
      { id: 'agent-sol-2', network: 'devnet', pk: 'pk-sol-2' },
      { id: 'agent-sol-3', network: 'testnet', pk: 'pk-sol-3' },
    ];

    for (const a of agents) {
      v1Sqlite.prepare(
        `INSERT INTO agents (id, name, chain, network, public_key, status, owner_verified, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(a.id, `Agent ${a.network}`, 'solana', a.network, a.pk, 'ACTIVE', 0, ts, ts);
    }

    // Run v2 migration on v1 DB
    const v2 = getV2Migration();
    runMigrations(v1Sqlite, [v2]);

    // All 3 agents should still exist with identical data
    const rows = v1Sqlite
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

    // Run v2 migration on v1 DB
    const v2 = getV2Migration();
    runMigrations(v1Sqlite, [v2]);

    // ethereum-mainnet should succeed
    expect(() => {
      v1Sqlite.prepare(
        `INSERT INTO agents (id, name, chain, network, public_key, status, owner_verified, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run('evm-agent-1', 'EVM Agent 1', 'ethereum', 'ethereum-mainnet', 'pk-evm-1', 'CREATING', 0, ts, ts);
    }).not.toThrow();

    // polygon-amoy should succeed
    expect(() => {
      v1Sqlite.prepare(
        `INSERT INTO agents (id, name, chain, network, public_key, status, owner_verified, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run('evm-agent-2', 'EVM Agent 2', 'ethereum', 'polygon-amoy', 'pk-evm-2', 'CREATING', 0, ts, ts);
    }).not.toThrow();

    // invalid-network should fail CHECK
    expect(() => {
      v1Sqlite.prepare(
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

    // Insert agent, session, and transaction (FK relationships) into v1 DB
    v1Sqlite.prepare(
      `INSERT INTO agents (id, name, chain, network, public_key, status, owner_verified, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(agentId, 'FK Agent', 'solana', 'mainnet', 'pk-fk-check', 'ACTIVE', 0, ts, ts);

    v1Sqlite.prepare(
      `INSERT INTO sessions (id, agent_id, token_hash, expires_at, absolute_expires_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(sessionId, agentId, 'hash-fk-check', ts + 3600, ts + 86400, ts);

    v1Sqlite.prepare(
      `INSERT INTO transactions (id, agent_id, session_id, chain, type, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(txId, agentId, sessionId, 'solana', 'TRANSFER', 'PENDING', ts);

    // Run v2 migration on v1 DB
    const v2 = getV2Migration();
    runMigrations(v1Sqlite, [v2]);

    // FK check should pass (empty array = no violations)
    const fkErrors = v1Sqlite.pragma('foreign_key_check') as unknown[];
    expect(fkErrors).toEqual([]);

    // Session and transaction should still reference the agent
    const session = v1Sqlite.prepare('SELECT agent_id FROM sessions WHERE id = ?').get(sessionId) as { agent_id: string };
    expect(session.agent_id).toBe(agentId);

    const tx = v1Sqlite.prepare('SELECT agent_id, session_id FROM transactions WHERE id = ?').get(txId) as { agent_id: string; session_id: string };
    expect(tx.agent_id).toBe(agentId);
    expect(tx.session_id).toBe(sessionId);
  });
});
