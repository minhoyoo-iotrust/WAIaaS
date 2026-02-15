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
  // Note: pushSchema() creates latest schema (wallets table) and records
  // all migration versions [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11], so getMaxVersion() returns 11.
  // All test migration versions use 12+ to avoid conflicts with real migrations.

  it('should return { applied: 0, skipped: 0 } for empty migrations array', () => {
    const result = runMigrations(sqlite, []);
    expect(result).toEqual({ applied: 0, skipped: 0 });
    expect(getMaxVersion()).toBe(11); // v1~v11 (api_keys table)
  });

  it('should execute new migrations sequentially', () => {
    const migrations: Migration[] = [
      {
        version: 12,
        description: 'Add test_column to wallets',
        up: (db) => {
          db.exec('ALTER TABLE wallets ADD COLUMN test_col_v12 TEXT');
        },
      },
      {
        version: 13,
        description: 'Add another test_column to wallets',
        up: (db) => {
          db.exec('ALTER TABLE wallets ADD COLUMN test_col_v13 TEXT');
        },
      },
    ];

    const result = runMigrations(sqlite, migrations);
    expect(result).toEqual({ applied: 2, skipped: 0 });
    expect(getMaxVersion()).toBe(13);
    expect(getVersions()).toContain(12);
    expect(getVersions()).toContain(13);

    // Verify columns were actually added
    const columns = sqlite.prepare("PRAGMA table_info('wallets')").all() as Array<{ name: string }>;
    const colNames = columns.map((c) => c.name);
    expect(colNames).toContain('test_col_v12');
    expect(colNames).toContain('test_col_v13');
  });

  it('should skip already-applied migrations', () => {
    const migrations: Migration[] = [
      {
        version: 12,
        description: 'Add test_column to wallets',
        up: (db) => {
          db.exec('ALTER TABLE wallets ADD COLUMN test_col_skip TEXT');
        },
      },
      {
        version: 13,
        description: 'Add another column',
        up: (db) => {
          db.exec('ALTER TABLE wallets ADD COLUMN test_col_skip2 TEXT');
        },
      },
    ];

    // First run: apply both
    const first = runMigrations(sqlite, migrations);
    expect(first).toEqual({ applied: 2, skipped: 0 });

    // Second run: skip both
    const second = runMigrations(sqlite, migrations);
    expect(second).toEqual({ applied: 0, skipped: 2 });
    expect(getMaxVersion()).toBe(13);
  });

  it('should rollback failed migration and not execute subsequent ones', () => {
    const migrations: Migration[] = [
      {
        version: 12,
        description: 'Failing migration',
        up: () => {
          throw new Error('Intentional migration failure');
        },
      },
      {
        version: 13,
        description: 'Should not be reached',
        up: (db) => {
          db.exec('ALTER TABLE wallets ADD COLUMN should_not_exist TEXT');
        },
      },
    ];

    expect(() => runMigrations(sqlite, migrations)).toThrow(
      /Migration v12.*failed.*Intentional migration failure/,
    );

    // version 12 should NOT be recorded (max stays at 11 from pushSchema)
    expect(getMaxVersion()).toBe(11);

    // version 12 should NOT have been executed
    const columns = sqlite.prepare("PRAGMA table_info('wallets')").all() as Array<{ name: string }>;
    const colNames = columns.map((c) => c.name);
    expect(colNames).not.toContain('should_not_exist');
  });

  it('should execute migrations in ascending version order regardless of array order', () => {
    const executionOrder: number[] = [];

    const migrations: Migration[] = [
      {
        version: 14,
        description: 'Fourteenth',
        up: (db) => {
          executionOrder.push(14);
          db.exec('ALTER TABLE wallets ADD COLUMN order_v14 TEXT');
        },
      },
      {
        version: 12,
        description: 'Twelfth',
        up: (db) => {
          executionOrder.push(12);
          db.exec('ALTER TABLE wallets ADD COLUMN order_v12 TEXT');
        },
      },
      {
        version: 13,
        description: 'Thirteenth',
        up: (db) => {
          executionOrder.push(13);
          db.exec('ALTER TABLE wallets ADD COLUMN order_v13 TEXT');
        },
      },
    ];

    const result = runMigrations(sqlite, migrations);
    expect(result).toEqual({ applied: 3, skipped: 0 });
    expect(executionOrder).toEqual([12, 13, 14]);
    expect(getVersions()).toContain(12);
    expect(getVersions()).toContain(13);
    expect(getVersions()).toContain(14);
  });

  it('should skip version 1-11 migrations (already applied from pushSchema)', () => {
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
        description: 'Should be skipped (pushSchema records v2)',
        up: () => {
          throw new Error('Should not execute');
        },
      },
      {
        version: 3,
        description: 'Should be skipped (pushSchema records v3)',
        up: () => {
          throw new Error('Should not execute');
        },
      },
      {
        version: 4,
        description: 'Should be skipped (pushSchema records v4)',
        up: () => {
          throw new Error('Should not execute');
        },
      },
      {
        version: 5,
        description: 'Should be skipped (pushSchema records v5)',
        up: () => {
          throw new Error('Should not execute');
        },
      },
      {
        version: 6,
        description: 'Should be skipped (pushSchema records v6)',
        up: () => {
          throw new Error('Should not execute');
        },
      },
      {
        version: 7,
        description: 'Should be skipped (pushSchema records v7)',
        up: () => {
          throw new Error('Should not execute');
        },
      },
      {
        version: 8,
        description: 'Should be skipped (pushSchema records v8)',
        up: () => {
          throw new Error('Should not execute');
        },
      },
      {
        version: 9,
        description: 'Should be skipped (pushSchema records v9)',
        up: () => {
          throw new Error('Should not execute');
        },
      },
      {
        version: 10,
        description: 'Should be skipped (pushSchema records v10)',
        up: () => {
          throw new Error('Should not execute');
        },
      },
      {
        version: 11,
        description: 'Should be skipped (pushSchema records v11)',
        up: () => {
          throw new Error('Should not execute');
        },
      },
      {
        version: 12,
        description: 'Should execute',
        up: (db) => {
          db.exec('ALTER TABLE wallets ADD COLUMN v1_skip_test TEXT');
        },
      },
    ];

    const result = runMigrations(sqlite, migrations);
    expect(result).toEqual({ applied: 1, skipped: 11 });
    expect(getMaxVersion()).toBe(12);
  });

  it('should record description in schema_version for applied migrations', () => {
    const migrations: Migration[] = [
      {
        version: 12,
        description: 'Add token_balances table',
        up: (db) => {
          db.exec('ALTER TABLE wallets ADD COLUMN desc_test TEXT');
        },
      },
    ];

    runMigrations(sqlite, migrations);

    const row = sqlite
      .prepare('SELECT description FROM schema_version WHERE version = 12')
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
          db.exec('ALTER TABLE wallets ADD COLUMN self_managed_test TEXT');
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

    // Version 20 should NOT be recorded (max stays at 11 from pushSchema)
    expect(getMaxVersion()).toBe(11);

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

// ---------------------------------------------------------------------------
// v3 migration tests: rename agents to wallets
// ---------------------------------------------------------------------------

describe('v3 migration: rename agents to wallets', () => {
  // These tests use a dedicated v2-applied database (agents table with v2 CHECK constraints)
  // so we can explicitly test the v3 migration path.
  let v2Sqlite: DatabaseType;

  function getV3Migration(): Migration {
    const v3 = MIGRATIONS.find((m) => m.version === 3);
    if (!v3) throw new Error('v3 migration not found in MIGRATIONS array');
    return v3;
  }

  /** Create a v2-applied DB: v1 schema + v2 migration already applied */
  function createV2Database(): DatabaseType {
    const conn = createDatabase(':memory:');
    const db = conn.sqlite;

    db.exec('BEGIN');

    // Create agents table with v2 CHECK constraints (Solana + EVM networks)
    db.exec(`CREATE TABLE IF NOT EXISTS agents (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  chain TEXT NOT NULL CHECK (chain IN ('solana', 'ethereum')),
  network TEXT NOT NULL CHECK (network IN ('mainnet', 'devnet', 'testnet', 'ethereum-mainnet', 'ethereum-sepolia', 'polygon-mainnet', 'polygon-amoy', 'arbitrum-mainnet', 'arbitrum-sepolia', 'optimism-mainnet', 'optimism-sepolia', 'base-mainnet', 'base-sepolia')),
  public_key TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'CREATING' CHECK (status IN ('CREATING', 'ACTIVE', 'SUSPENDED', 'TERMINATING', 'TERMINATED')),
  owner_address TEXT,
  owner_verified INTEGER NOT NULL DEFAULT 0 CHECK (owner_verified IN (0, 1)),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  suspended_at INTEGER,
  suspension_reason TEXT
)`);

    // Create sessions with agent_id FK
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

    // Create transactions with agent_id FK
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
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'QUEUED', 'EXECUTING', 'SUBMITTED', 'CONFIRMED', 'FAILED', 'CANCELLED', 'EXPIRED', 'PARTIAL_FAILURE')),
  tier TEXT CHECK (tier IS NULL OR tier IN ('INSTANT', 'NOTIFY', 'DELAY', 'APPROVAL')),
  queued_at INTEGER,
  executed_at INTEGER,
  created_at INTEGER NOT NULL,
  reserved_amount TEXT,
  error TEXT,
  metadata TEXT
)`);

    // Create policies with agent_id FK
    db.exec(`CREATE TABLE IF NOT EXISTS policies (
  id TEXT PRIMARY KEY,
  agent_id TEXT REFERENCES agents(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('SPENDING_LIMIT', 'WHITELIST', 'TIME_RESTRICTION', 'RATE_LIMIT', 'ALLOWED_TOKENS', 'CONTRACT_WHITELIST', 'METHOD_WHITELIST', 'APPROVED_SPENDERS', 'APPROVE_AMOUNT_LIMIT', 'APPROVE_TIER_OVERRIDE')),
  rules TEXT NOT NULL,
  priority INTEGER NOT NULL DEFAULT 0,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
)`);

    // Create audit_log with agent_id column (no FK constraint)
    db.exec(`CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp INTEGER NOT NULL,
  event_type TEXT NOT NULL,
  actor TEXT NOT NULL,
  agent_id TEXT,
  session_id TEXT,
  tx_id TEXT,
  details TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'info' CHECK (severity IN ('info', 'warning', 'critical')),
  ip_address TEXT
)`);

    // Create notification_logs with agent_id column (no FK constraint)
    db.exec(`CREATE TABLE IF NOT EXISTS notification_logs (
  id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  agent_id TEXT,
  channel TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('sent', 'failed')),
  error TEXT,
  created_at INTEGER NOT NULL
)`);

    // Create schema_version
    db.exec(`CREATE TABLE IF NOT EXISTS schema_version (
  version INTEGER PRIMARY KEY,
  applied_at INTEGER NOT NULL,
  description TEXT NOT NULL
)`);

    // Create all agent-related indexes (v2 state)
    db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_agents_public_key ON agents(public_key)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_agents_status ON agents(status)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_agents_chain_network ON agents(chain, network)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_agents_owner_address ON agents(owner_address)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_sessions_agent_id ON sessions(agent_id)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_sessions_token_hash ON sessions(token_hash)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_transactions_agent_status ON transactions(agent_id, status)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_transactions_session_id ON transactions(session_id)');
    db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_transactions_tx_hash ON transactions(tx_hash)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_transactions_queued_at ON transactions(queued_at)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_transactions_created_at ON transactions(created_at)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_transactions_type ON transactions(type)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_transactions_contract_address ON transactions(contract_address)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_transactions_parent_id ON transactions(parent_id)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_policies_agent_enabled ON policies(agent_id, enabled)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_policies_type ON policies(type)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_audit_log_timestamp ON audit_log(timestamp)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_audit_log_event_type ON audit_log(event_type)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_audit_log_agent_id ON audit_log(agent_id)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_audit_log_severity ON audit_log(severity)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_audit_log_agent_timestamp ON audit_log(agent_id, timestamp)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_notification_logs_event_type ON notification_logs(event_type)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_notification_logs_agent_id ON notification_logs(agent_id)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_notification_logs_status ON notification_logs(status)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_notification_logs_created_at ON notification_logs(created_at)');

    // Record schema versions 1 and 2
    const ts = Math.floor(Date.now() / 1000);
    db.prepare('INSERT INTO schema_version (version, applied_at, description) VALUES (?, ?, ?)')
      .run(1, ts, 'Initial schema (9 tables)');
    db.prepare('INSERT INTO schema_version (version, applied_at, description) VALUES (?, ?, ?)')
      .run(2, ts, 'Expand agents network CHECK to include EVM networks');

    db.exec('COMMIT');
    return db;
  }

  beforeEach(() => {
    v2Sqlite = createV2Database();
  });

  afterEach(() => {
    try { v2Sqlite.close(); } catch { /* already closed */ }
  });

  it('should rename agents table to wallets with all data preserved', () => {
    const ts = Math.floor(Date.now() / 1000);

    // Insert 3 agents with different chains/networks/statuses
    const agentsData = [
      { id: 'w-sol-1', name: 'Sol Wallet 1', chain: 'solana', network: 'mainnet', pk: 'pk-sol-1', status: 'ACTIVE' },
      { id: 'w-evm-1', name: 'EVM Wallet 1', chain: 'ethereum', network: 'ethereum-mainnet', pk: 'pk-evm-1', status: 'CREATING' },
      { id: 'w-sol-2', name: 'Sol Wallet 2', chain: 'solana', network: 'devnet', pk: 'pk-sol-2', status: 'SUSPENDED' },
    ];

    for (const a of agentsData) {
      v2Sqlite.prepare(
        `INSERT INTO agents (id, name, chain, network, public_key, status, owner_verified, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(a.id, a.name, a.chain, a.network, a.pk, a.status, 0, ts, ts);
    }

    // Run v3 migration
    const v3 = getV3Migration();
    runMigrations(v2Sqlite, [v3]);

    // Verify wallets table has 3 rows with identical data
    const rows = v2Sqlite
      .prepare('SELECT id, name, chain, network, public_key, status FROM wallets ORDER BY id')
      .all() as Array<Record<string, unknown>>;

    expect(rows).toHaveLength(3);
    for (const a of agentsData) {
      const row = rows.find((r) => r.id === a.id);
      expect(row).toBeDefined();
      expect(row!.name).toBe(a.name);
      expect(row!.chain).toBe(a.chain);
      expect(row!.network).toBe(a.network);
      expect(row!.public_key).toBe(a.pk);
      expect(row!.status).toBe(a.status);
    }

    // Verify agents table does NOT exist
    expect(() => {
      v2Sqlite.prepare('SELECT * FROM agents').all();
    }).toThrow(/no such table/);
  });

  it('should rename agent_id columns to wallet_id in 5 FK tables', () => {
    const ts = Math.floor(Date.now() / 1000);
    const agentId = 'fk-rename-agent';

    // Insert agent + records in all 5 FK tables
    v2Sqlite.prepare(
      `INSERT INTO agents (id, name, chain, network, public_key, status, owner_verified, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(agentId, 'FK Rename Test', 'solana', 'mainnet', 'pk-fk-rename', 'ACTIVE', 0, ts, ts);

    v2Sqlite.prepare(
      `INSERT INTO sessions (id, agent_id, token_hash, expires_at, absolute_expires_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run('sess-1', agentId, 'hash-1', ts + 3600, ts + 86400, ts);

    v2Sqlite.prepare(
      `INSERT INTO transactions (id, agent_id, chain, type, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run('tx-1', agentId, 'solana', 'TRANSFER', 'PENDING', ts);

    v2Sqlite.prepare(
      `INSERT INTO policies (id, agent_id, type, rules, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run('pol-1', agentId, 'SPENDING_LIMIT', '{}', ts, ts);

    v2Sqlite.prepare(
      `INSERT INTO audit_log (timestamp, event_type, actor, agent_id, details)
       VALUES (?, ?, ?, ?, ?)`,
    ).run(ts, 'AGENT_CREATED', 'system', agentId, '{}');

    v2Sqlite.prepare(
      `INSERT INTO notification_logs (id, event_type, agent_id, channel, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run('notif-1', 'TX_CONFIRMED', agentId, 'telegram', 'sent', ts);

    // Run v3 migration
    const v3 = getV3Migration();
    runMigrations(v2Sqlite, [v3]);

    // Verify each table has wallet_id with original agent ID value
    const session = v2Sqlite.prepare('SELECT wallet_id FROM sessions WHERE id = ?').get('sess-1') as { wallet_id: string };
    expect(session.wallet_id).toBe(agentId);

    const tx = v2Sqlite.prepare('SELECT wallet_id FROM transactions WHERE id = ?').get('tx-1') as { wallet_id: string };
    expect(tx.wallet_id).toBe(agentId);

    const policy = v2Sqlite.prepare('SELECT wallet_id FROM policies WHERE id = ?').get('pol-1') as { wallet_id: string };
    expect(policy.wallet_id).toBe(agentId);

    const audit = v2Sqlite.prepare('SELECT wallet_id FROM audit_log WHERE id = 1').get() as { wallet_id: string };
    expect(audit.wallet_id).toBe(agentId);

    const notif = v2Sqlite.prepare('SELECT wallet_id FROM notification_logs WHERE id = ?').get('notif-1') as { wallet_id: string };
    expect(notif.wallet_id).toBe(agentId);

    // Verify agent_id column does NOT exist in any of the 5 tables
    for (const table of ['sessions', 'transactions', 'policies', 'audit_log', 'notification_logs']) {
      const cols = v2Sqlite.prepare(`PRAGMA table_info('${table}')`).all() as Array<{ name: string }>;
      const colNames = cols.map((c) => c.name);
      expect(colNames).not.toContain('agent_id');
      expect(colNames).toContain('wallet_id');
    }
  });

  it('should rename all agent-related indexes to wallet pattern', () => {
    // Run v3 migration
    const v3 = getV3Migration();
    runMigrations(v2Sqlite, [v3]);

    // Collect all index names across relevant tables
    const allIndexNames: string[] = [];
    for (const table of ['wallets', 'sessions', 'transactions', 'policies', 'audit_log', 'notification_logs']) {
      const indexes = v2Sqlite.prepare(`PRAGMA index_list('${table}')`).all() as Array<{ name: string }>;
      for (const idx of indexes) {
        allIndexNames.push(idx.name);
      }
    }

    // Verify wallet-based index names exist
    expect(allIndexNames).toContain('idx_wallets_public_key');
    expect(allIndexNames).toContain('idx_wallets_status');
    expect(allIndexNames).toContain('idx_wallets_chain_network');
    expect(allIndexNames).toContain('idx_wallets_owner_address');
    expect(allIndexNames).toContain('idx_sessions_wallet_id');
    expect(allIndexNames).toContain('idx_transactions_wallet_status');
    expect(allIndexNames).toContain('idx_policies_wallet_enabled');
    expect(allIndexNames).toContain('idx_audit_log_wallet_id');
    expect(allIndexNames).toContain('idx_audit_log_wallet_timestamp');
    expect(allIndexNames).toContain('idx_notification_logs_wallet_id');

    // Verify NO agent-related index names remain
    const agentIndexes = allIndexNames.filter((n) => n.includes('_agent'));
    expect(agentIndexes).toEqual([]);
  });

  it('should update audit_log.event_type AGENT_* values to WALLET_*', () => {
    const ts = Math.floor(Date.now() / 1000);
    const agentId = 'enum-test-agent';

    v2Sqlite.prepare(
      `INSERT INTO agents (id, name, chain, network, public_key, status, owner_verified, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(agentId, 'Enum Test', 'solana', 'mainnet', 'pk-enum', 'ACTIVE', 0, ts, ts);

    // Insert 4 AGENT_* audit entries
    const agentEvents = ['AGENT_CREATED', 'AGENT_ACTIVATED', 'AGENT_SUSPENDED', 'AGENT_TERMINATED'];
    for (const evt of agentEvents) {
      v2Sqlite.prepare(
        `INSERT INTO audit_log (timestamp, event_type, actor, agent_id, details)
         VALUES (?, ?, ?, ?, ?)`,
      ).run(ts, evt, 'system', agentId, '{}');
    }

    // Insert 2 non-agent audit entries that should NOT change
    v2Sqlite.prepare(
      `INSERT INTO audit_log (timestamp, event_type, actor, details)
       VALUES (?, ?, ?, ?)`,
    ).run(ts, 'TX_REQUESTED', 'session', '{}');
    v2Sqlite.prepare(
      `INSERT INTO audit_log (timestamp, event_type, actor, details)
       VALUES (?, ?, ?, ?)`,
    ).run(ts, 'SESSION_ISSUED', 'system', '{}');

    // Run v3 migration
    const v3 = getV3Migration();
    runMigrations(v2Sqlite, [v3]);

    // Verify AGENT_* values are 0
    const agentCount = v2Sqlite
      .prepare("SELECT COUNT(*) AS cnt FROM audit_log WHERE event_type LIKE 'AGENT_%'")
      .get() as { cnt: number };
    expect(agentCount.cnt).toBe(0);

    // Verify WALLET_* values are 4
    const walletCount = v2Sqlite
      .prepare("SELECT COUNT(*) AS cnt FROM audit_log WHERE event_type LIKE 'WALLET_%'")
      .get() as { cnt: number };
    expect(walletCount.cnt).toBe(4);

    // Verify non-agent events unchanged
    const txReq = v2Sqlite
      .prepare("SELECT COUNT(*) AS cnt FROM audit_log WHERE event_type = 'TX_REQUESTED'")
      .get() as { cnt: number };
    expect(txReq.cnt).toBe(1);

    const sessIssued = v2Sqlite
      .prepare("SELECT COUNT(*) AS cnt FROM audit_log WHERE event_type = 'SESSION_ISSUED'")
      .get() as { cnt: number };
    expect(sessIssued.cnt).toBe(1);
  });

  it('should update notification_logs.event_type AGENT_SUSPENDED to WALLET_SUSPENDED', () => {
    const ts = Math.floor(Date.now() / 1000);

    // Insert 2 notification_logs: one AGENT_SUSPENDED, one TX_CONFIRMED
    v2Sqlite.prepare(
      `INSERT INTO notification_logs (id, event_type, channel, status, created_at)
       VALUES (?, ?, ?, ?, ?)`,
    ).run('notif-agent-susp', 'AGENT_SUSPENDED', 'telegram', 'sent', ts);

    v2Sqlite.prepare(
      `INSERT INTO notification_logs (id, event_type, channel, status, created_at)
       VALUES (?, ?, ?, ?, ?)`,
    ).run('notif-tx-conf', 'TX_CONFIRMED', 'telegram', 'sent', ts);

    // Run v3 migration
    const v3 = getV3Migration();
    runMigrations(v2Sqlite, [v3]);

    // Verify AGENT_SUSPENDED count is 0
    const agentSusp = v2Sqlite
      .prepare("SELECT COUNT(*) AS cnt FROM notification_logs WHERE event_type = 'AGENT_SUSPENDED'")
      .get() as { cnt: number };
    expect(agentSusp.cnt).toBe(0);

    // Verify WALLET_SUSPENDED count is 1
    const walletSusp = v2Sqlite
      .prepare("SELECT COUNT(*) AS cnt FROM notification_logs WHERE event_type = 'WALLET_SUSPENDED'")
      .get() as { cnt: number };
    expect(walletSusp.cnt).toBe(1);

    // Verify TX_CONFIRMED unchanged
    const txConf = v2Sqlite
      .prepare("SELECT COUNT(*) AS cnt FROM notification_logs WHERE event_type = 'TX_CONFIRMED'")
      .get() as { cnt: number };
    expect(txConf.cnt).toBe(1);
  });

  it('should set schema_version to 3', () => {
    // Run v3 migration
    const v3 = getV3Migration();
    runMigrations(v2Sqlite, [v3]);

    // Verify schema_version table contains version 3
    const row = v2Sqlite
      .prepare('SELECT version, applied_at, description FROM schema_version WHERE version = 3')
      .get() as { version: number; applied_at: number; description: string } | undefined;

    expect(row).toBeDefined();
    expect(row!.version).toBe(3);
    expect(row!.applied_at).toBeGreaterThan(0);
    expect(row!.description).toBeTruthy();
  });

  it('should pass foreign_key_check after migration', () => {
    const ts = Math.floor(Date.now() / 1000);
    const agentId = 'fk-v3-agent';
    const sessionId = 'fk-v3-session';
    const txId = 'fk-v3-tx';
    const policyId = 'fk-v3-policy';

    // Insert agent + session + transaction + policy (FK chain)
    v2Sqlite.prepare(
      `INSERT INTO agents (id, name, chain, network, public_key, status, owner_verified, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(agentId, 'FK V3 Agent', 'solana', 'mainnet', 'pk-fk-v3', 'ACTIVE', 0, ts, ts);

    v2Sqlite.prepare(
      `INSERT INTO sessions (id, agent_id, token_hash, expires_at, absolute_expires_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(sessionId, agentId, 'hash-fk-v3', ts + 3600, ts + 86400, ts);

    v2Sqlite.prepare(
      `INSERT INTO transactions (id, agent_id, session_id, chain, type, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(txId, agentId, sessionId, 'solana', 'TRANSFER', 'PENDING', ts);

    v2Sqlite.prepare(
      `INSERT INTO policies (id, agent_id, type, rules, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(policyId, agentId, 'SPENDING_LIMIT', '{}', ts, ts);

    // Run v3 migration
    const v3 = getV3Migration();
    runMigrations(v2Sqlite, [v3]);

    // FK check should pass (empty array = no violations)
    const fkErrors = v2Sqlite.pragma('foreign_key_check') as unknown[];
    expect(fkErrors).toEqual([]);

    // Verify session.wallet_id references wallets.id via SELECT JOIN
    const joined = v2Sqlite.prepare(
      `SELECT s.wallet_id, w.name FROM sessions s JOIN wallets w ON s.wallet_id = w.id WHERE s.id = ?`,
    ).get(sessionId) as { wallet_id: string; name: string };
    expect(joined.wallet_id).toBe(agentId);
    expect(joined.name).toBe('FK V3 Agent');
  });
});
