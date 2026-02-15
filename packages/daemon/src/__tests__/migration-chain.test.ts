/**
 * Migration chain tests: full-path migration from historical schema versions.
 *
 * Tests cover:
 * T-1: v5 DB -> pushSchema success (MIGR-01 regression)
 * T-2/T-6: Schema equivalence (migrated vs fresh DB)
 * T-3: v1 DB -> pushSchema success (full chain v2-v9)
 * T-4: Fresh DB -> pushSchema success (existing behavior)
 * T-5: Index completeness after migration
 * T-7: v7 network -> environment data transformation
 * T-8: v6 transactions.network backfill
 * T-9: v3 agents -> wallets naming + event transformation
 * T-10: FK integrity preservation
 * T-11: Edge cases (NULL, empty tables, suspended wallets)
 *
 * @see objectives/issues/v1.4.8-031-pushschema-index-before-migration.md
 */

import { describe, it, expect, afterEach } from 'vitest';
import type { Database as DatabaseType } from 'better-sqlite3';
import {
  createDatabase,
  pushSchema,
  LATEST_SCHEMA_VERSION,
} from '../infrastructure/database/index.js';

// ---------------------------------------------------------------------------
// Schema snapshot helpers
// ---------------------------------------------------------------------------

/**
 * Create a v1 schema database (agents table, Solana-only CHECK, agent_id FKs).
 * This is the original schema before any migrations.
 */
function createV1SchemaDatabase(): DatabaseType {
  const conn = createDatabase(':memory:');
  const db = conn.sqlite;

  db.exec('BEGIN');

  // Table 1: agents (Solana-only)
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

  // Table 2: sessions with agent_id FK
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

  // Table 3: transactions with agent_id FK
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

  // Table 4: policies with agent_id FK
  db.exec(`CREATE TABLE IF NOT EXISTS policies (
  id TEXT PRIMARY KEY,
  agent_id TEXT REFERENCES agents(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('SPENDING_LIMIT', 'WHITELIST', 'TIME_RESTRICTION', 'RATE_LIMIT')),
  rules TEXT NOT NULL,
  priority INTEGER NOT NULL DEFAULT 0,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
)`);

  // Table 5: pending_approvals
  db.exec(`CREATE TABLE IF NOT EXISTS pending_approvals (
  id TEXT PRIMARY KEY,
  tx_id TEXT NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
  required_by INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  approved_at INTEGER,
  rejected_at INTEGER,
  owner_signature TEXT,
  created_at INTEGER NOT NULL
)`);

  // Table 6: audit_log with agent_id
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

  // Table 7: key_value_store
  db.exec(`CREATE TABLE IF NOT EXISTS key_value_store (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at INTEGER NOT NULL
)`);

  // Table 8: notification_logs with agent_id
  db.exec(`CREATE TABLE IF NOT EXISTS notification_logs (
  id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  agent_id TEXT,
  channel TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('sent', 'failed')),
  error TEXT,
  created_at INTEGER NOT NULL
)`);

  // Table 9: schema_version
  db.exec(`CREATE TABLE IF NOT EXISTS schema_version (
  version INTEGER PRIMARY KEY,
  applied_at INTEGER NOT NULL,
  description TEXT NOT NULL
)`);

  // v1 indexes
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
  db.exec('CREATE INDEX IF NOT EXISTS idx_pending_approvals_tx_id ON pending_approvals(tx_id)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_pending_approvals_expires_at ON pending_approvals(expires_at)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_audit_log_timestamp ON audit_log(timestamp)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_audit_log_event_type ON audit_log(event_type)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_audit_log_agent_id ON audit_log(agent_id)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_audit_log_severity ON audit_log(severity)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_audit_log_agent_timestamp ON audit_log(agent_id, timestamp)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_notification_logs_event_type ON notification_logs(event_type)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_notification_logs_agent_id ON notification_logs(agent_id)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_notification_logs_status ON notification_logs(status)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_notification_logs_created_at ON notification_logs(created_at)');

  // Record schema version 1 only
  const ts = Math.floor(Date.now() / 1000);
  db.prepare('INSERT INTO schema_version (version, applied_at, description) VALUES (?, ?, ?)')
    .run(1, ts, 'Initial schema (v1 Solana-only)');

  db.exec('COMMIT');
  return db;
}

/**
 * Create a v5 schema database (wallets table, wallet_id FKs, token_registry, settings).
 * This is the state before the environment model migration (v6-v8).
 */
function createV5SchemaDatabase(): DatabaseType {
  const conn = createDatabase(':memory:');
  const db = conn.sqlite;

  db.exec('BEGIN');

  // wallets table with network column (v5 schema, post-v3 rename)
  db.exec(`CREATE TABLE IF NOT EXISTS wallets (
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

  // sessions with wallet_id FK
  db.exec(`CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  wallet_id TEXT NOT NULL REFERENCES wallets(id) ON DELETE CASCADE,
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

  // transactions with wallet_id FK (NO network column -- v5 state)
  db.exec(`CREATE TABLE IF NOT EXISTS transactions (
  id TEXT PRIMARY KEY,
  wallet_id TEXT NOT NULL REFERENCES wallets(id) ON DELETE RESTRICT,
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

  // policies with wallet_id FK (NO network column -- v5 state)
  db.exec(`CREATE TABLE IF NOT EXISTS policies (
  id TEXT PRIMARY KEY,
  wallet_id TEXT REFERENCES wallets(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('SPENDING_LIMIT', 'WHITELIST', 'TIME_RESTRICTION', 'RATE_LIMIT', 'ALLOWED_TOKENS', 'CONTRACT_WHITELIST', 'METHOD_WHITELIST', 'APPROVED_SPENDERS', 'APPROVE_AMOUNT_LIMIT', 'APPROVE_TIER_OVERRIDE')),
  rules TEXT NOT NULL,
  priority INTEGER NOT NULL DEFAULT 0,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
)`);

  // pending_approvals
  db.exec(`CREATE TABLE IF NOT EXISTS pending_approvals (
  id TEXT PRIMARY KEY,
  tx_id TEXT NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
  required_by INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  approved_at INTEGER,
  rejected_at INTEGER,
  owner_signature TEXT,
  created_at INTEGER NOT NULL
)`);

  // audit_log
  db.exec(`CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp INTEGER NOT NULL,
  event_type TEXT NOT NULL,
  actor TEXT NOT NULL,
  wallet_id TEXT,
  session_id TEXT,
  tx_id TEXT,
  details TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'info' CHECK (severity IN ('info', 'warning', 'critical')),
  ip_address TEXT
)`);

  // key_value_store
  db.exec(`CREATE TABLE IF NOT EXISTS key_value_store (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at INTEGER NOT NULL
)`);

  // notification_logs
  db.exec(`CREATE TABLE IF NOT EXISTS notification_logs (
  id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  wallet_id TEXT,
  channel TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('sent', 'failed')),
  error TEXT,
  created_at INTEGER NOT NULL
)`);

  // token_registry (added in v4)
  db.exec(`CREATE TABLE IF NOT EXISTS token_registry (
  id TEXT PRIMARY KEY,
  network TEXT NOT NULL,
  address TEXT NOT NULL,
  symbol TEXT NOT NULL,
  name TEXT NOT NULL,
  decimals INTEGER NOT NULL,
  source TEXT NOT NULL DEFAULT 'custom' CHECK (source IN ('builtin', 'custom')),
  created_at INTEGER NOT NULL
)`);

  // settings (added in v5)
  db.exec(`CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  encrypted INTEGER NOT NULL DEFAULT 0 CHECK (encrypted IN (0, 1)),
  category TEXT NOT NULL,
  updated_at INTEGER NOT NULL
)`);

  // schema_version
  db.exec(`CREATE TABLE IF NOT EXISTS schema_version (
  version INTEGER PRIMARY KEY,
  applied_at INTEGER NOT NULL,
  description TEXT NOT NULL
)`);

  // v5 indexes
  db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_wallets_public_key ON wallets(public_key)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_wallets_status ON wallets(status)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_wallets_chain_network ON wallets(chain, network)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_wallets_owner_address ON wallets(owner_address)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_sessions_wallet_id ON sessions(wallet_id)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_sessions_token_hash ON sessions(token_hash)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_transactions_wallet_status ON transactions(wallet_id, status)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_transactions_session_id ON transactions(session_id)');
  db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_transactions_tx_hash ON transactions(tx_hash)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_transactions_queued_at ON transactions(queued_at)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_transactions_created_at ON transactions(created_at)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_transactions_type ON transactions(type)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_transactions_contract_address ON transactions(contract_address)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_transactions_parent_id ON transactions(parent_id)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_policies_wallet_enabled ON policies(wallet_id, enabled)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_policies_type ON policies(type)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_pending_approvals_tx_id ON pending_approvals(tx_id)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_pending_approvals_expires_at ON pending_approvals(expires_at)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_audit_log_timestamp ON audit_log(timestamp)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_audit_log_event_type ON audit_log(event_type)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_audit_log_wallet_id ON audit_log(wallet_id)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_audit_log_severity ON audit_log(severity)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_audit_log_wallet_timestamp ON audit_log(wallet_id, timestamp)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_notification_logs_event_type ON notification_logs(event_type)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_notification_logs_wallet_id ON notification_logs(wallet_id)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_notification_logs_status ON notification_logs(status)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_notification_logs_created_at ON notification_logs(created_at)');
  db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_token_registry_network_address ON token_registry(network, address)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_token_registry_network ON token_registry(network)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_settings_category ON settings(category)');

  // Record schema versions 1-5
  const ts = Math.floor(Date.now() / 1000);
  db.prepare('INSERT INTO schema_version (version, applied_at, description) VALUES (?, ?, ?)').run(1, ts, 'Initial schema');
  db.prepare('INSERT INTO schema_version (version, applied_at, description) VALUES (?, ?, ?)').run(2, ts, 'EVM network CHECK');
  db.prepare('INSERT INTO schema_version (version, applied_at, description) VALUES (?, ?, ?)').run(3, ts, 'Rename agents to wallets');
  db.prepare('INSERT INTO schema_version (version, applied_at, description) VALUES (?, ?, ?)').run(4, ts, 'Token registry table');
  db.prepare('INSERT INTO schema_version (version, applied_at, description) VALUES (?, ?, ?)').run(5, ts, 'Settings table');

  db.exec('COMMIT');
  return db;
}

// ---------------------------------------------------------------------------
// Helper utilities
// ---------------------------------------------------------------------------

function getTableColumns(db: DatabaseType, table: string): string[] {
  return (db.prepare(`PRAGMA table_info('${table}')`).all() as Array<{ name: string }>)
    .map((c) => c.name)
    .sort();
}

function getTableIndexes(db: DatabaseType, table: string): string[] {
  return (db.prepare(`PRAGMA index_list('${table}')`).all() as Array<{ name: string }>)
    .map((i) => i.name)
    .filter((n) => !n.startsWith('sqlite_'))
    .sort();
}

function getAllIndexNames(db: DatabaseType): string[] {
  const rows = db.prepare(
    "SELECT name FROM sqlite_master WHERE type='index' AND name NOT LIKE 'sqlite_%' ORDER BY name",
  ).all() as Array<{ name: string }>;
  return rows.map((r) => r.name);
}

function getVersions(db: DatabaseType): number[] {
  const rows = db.prepare('SELECT version FROM schema_version ORDER BY version').all() as Array<{ version: number }>;
  return rows.map((r) => r.version);
}

/** All 32 expected indexes in the latest schema. */
const EXPECTED_INDEXES = [
  'idx_audit_log_event_type',
  'idx_audit_log_severity',
  'idx_audit_log_timestamp',
  'idx_audit_log_wallet_id',
  'idx_audit_log_wallet_timestamp',
  'idx_notification_logs_created_at',
  'idx_notification_logs_event_type',
  'idx_notification_logs_status',
  'idx_notification_logs_wallet_id',
  'idx_pending_approvals_expires_at',
  'idx_pending_approvals_tx_id',
  'idx_policies_network',
  'idx_policies_type',
  'idx_policies_wallet_enabled',
  'idx_sessions_expires_at',
  'idx_sessions_token_hash',
  'idx_sessions_wallet_id',
  'idx_settings_category',
  'idx_token_registry_network',
  'idx_token_registry_network_address',
  'idx_transactions_contract_address',
  'idx_transactions_created_at',
  'idx_transactions_parent_id',
  'idx_transactions_queued_at',
  'idx_transactions_session_id',
  'idx_transactions_tx_hash',
  'idx_transactions_type',
  'idx_transactions_wallet_status',
  'idx_wallets_chain_environment',
  'idx_wallets_owner_address',
  'idx_wallets_public_key',
  'idx_wallets_status',
].sort();

const ALL_TABLES = [
  'wallets', 'sessions', 'transactions', 'policies', 'pending_approvals',
  'audit_log', 'key_value_store', 'notification_logs', 'token_registry',
  'settings', 'schema_version',
];

// ---------------------------------------------------------------------------
// T-1 ~ T-5: pushSchema on existing databases
// ---------------------------------------------------------------------------

describe('pushSchema on existing databases', () => {
  let db: DatabaseType;

  afterEach(() => {
    try { db.close(); } catch { /* already closed */ }
  });

  it('T-1: v5 DB pushSchema succeeds without error', () => {
    db = createV5SchemaDatabase();

    // Insert sample data before pushSchema
    const ts = Math.floor(Date.now() / 1000);
    db.prepare(
      `INSERT INTO wallets (id, name, chain, network, public_key, status, owner_verified, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run('w-sol-1', 'Sol Wallet', 'solana', 'devnet', 'pk-sol-1', 'ACTIVE', 0, ts, ts);

    // This should NOT throw (currently fails with "no such column: environment")
    expect(() => pushSchema(db)).not.toThrow();

    // Verify schema_version records all versions up to LATEST
    const versions = getVersions(db);
    expect(versions).toContain(LATEST_SCHEMA_VERSION);
  });

  it('T-3: v1 DB (agents) pushSchema succeeds with full migration chain', () => {
    db = createV1SchemaDatabase();

    // Insert sample agent data
    const ts = Math.floor(Date.now() / 1000);
    db.prepare(
      `INSERT INTO agents (id, name, chain, network, public_key, status, owner_verified, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run('a-sol-1', 'Agent Sol', 'solana', 'devnet', 'pk-sol-1', 'ACTIVE', 0, ts, ts);

    // pushSchema should run v2->v9 migration chain successfully
    expect(() => pushSchema(db)).not.toThrow();

    // Verify all versions recorded
    const versions = getVersions(db);
    expect(versions).toContain(LATEST_SCHEMA_VERSION);

    // Verify wallets table exists (agents renamed)
    const wallets = db.prepare('SELECT * FROM wallets').all();
    expect(wallets).toHaveLength(1);
  });

  it('T-4: fresh DB pushSchema succeeds (existing behavior)', () => {
    const conn = createDatabase(':memory:');
    db = conn.sqlite;

    expect(() => pushSchema(db)).not.toThrow();

    // All 11 tables should exist
    for (const table of ALL_TABLES) {
      const result = db.prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name=?",
      ).get(table) as { name: string } | undefined;
      expect(result).toBeDefined();
      expect(result!.name).toBe(table);
    }

    // All versions up to LATEST recorded
    const versions = getVersions(db);
    for (let v = 1; v <= LATEST_SCHEMA_VERSION; v++) {
      expect(versions).toContain(v);
    }
  });

  it('T-5: all expected indexes exist after migration', () => {
    // Test with v5 DB (requires migration)
    db = createV5SchemaDatabase();
    pushSchema(db);

    const actualIndexes = getAllIndexNames(db);
    for (const expected of EXPECTED_INDEXES) {
      expect(actualIndexes).toContain(expected);
    }
    expect(actualIndexes.length).toBeGreaterThanOrEqual(EXPECTED_INDEXES.length);
  });
});

// ---------------------------------------------------------------------------
// T-2/T-6: Migration chain schema equivalence
// ---------------------------------------------------------------------------

describe('migration chain schema equivalence', () => {
  let freshDb: DatabaseType;
  let migratedDb: DatabaseType;

  afterEach(() => {
    try { freshDb.close(); } catch { /* already closed */ }
    try { migratedDb.close(); } catch { /* already closed */ }
  });

  it('T-2: v5 migrated DB schema matches fresh DB schema', () => {
    // Fresh DB
    const connA = createDatabase(':memory:');
    freshDb = connA.sqlite;
    pushSchema(freshDb);

    // v5 migrated DB
    migratedDb = createV5SchemaDatabase();
    pushSchema(migratedDb);

    // Compare all 11 tables column names
    for (const table of ALL_TABLES) {
      const freshCols = getTableColumns(freshDb, table);
      const migratedCols = getTableColumns(migratedDb, table);
      expect(migratedCols).toEqual(freshCols);
    }

    // Compare indexes on key tables
    for (const table of ['wallets', 'transactions', 'policies', 'sessions']) {
      const freshIdx = getTableIndexes(freshDb, table);
      const migratedIdx = getTableIndexes(migratedDb, table);
      expect(migratedIdx).toEqual(freshIdx);
    }
  });

  it('T-6: v1 migrated DB schema matches fresh DB schema', () => {
    // Fresh DB
    const connA = createDatabase(':memory:');
    freshDb = connA.sqlite;
    pushSchema(freshDb);

    // v1 migrated DB
    migratedDb = createV1SchemaDatabase();
    pushSchema(migratedDb);

    // Compare all 11 tables column names
    for (const table of ALL_TABLES) {
      const freshCols = getTableColumns(freshDb, table);
      const migratedCols = getTableColumns(migratedDb, table);
      expect(migratedCols).toEqual(freshCols);
    }
  });
});

// ---------------------------------------------------------------------------
// T-7: Data transformation: v7 network to environment
// ---------------------------------------------------------------------------

describe('data transformation: v7 network to environment', () => {
  let db: DatabaseType;

  afterEach(() => {
    try { db.close(); } catch { /* already closed */ }
  });

  it('T-7a: devnet -> testnet', () => {
    db = createV5SchemaDatabase();
    const ts = Math.floor(Date.now() / 1000);

    db.prepare(
      `INSERT INTO wallets (id, name, chain, network, public_key, status, owner_verified, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run('w-sol-dn', 'Sol Devnet', 'solana', 'devnet', 'pk-sol-dn', 'ACTIVE', 0, ts, ts);

    pushSchema(db);

    const wallet = db.prepare('SELECT environment, default_network FROM wallets WHERE id = ?').get('w-sol-dn') as { environment: string; default_network: string };
    expect(wallet.environment).toBe('testnet');
    expect(wallet.default_network).toBe('devnet');
  });

  it('T-7b: ethereum-sepolia -> testnet', () => {
    db = createV5SchemaDatabase();
    const ts = Math.floor(Date.now() / 1000);

    db.prepare(
      `INSERT INTO wallets (id, name, chain, network, public_key, status, owner_verified, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run('w-eth-sep', 'Eth Sepolia', 'ethereum', 'ethereum-sepolia', 'pk-eth-sep', 'ACTIVE', 0, ts, ts);

    pushSchema(db);

    const wallet = db.prepare('SELECT environment, default_network FROM wallets WHERE id = ?').get('w-eth-sep') as { environment: string; default_network: string };
    expect(wallet.environment).toBe('testnet');
    expect(wallet.default_network).toBe('ethereum-sepolia');
  });

  it('T-7c: ethereum-mainnet -> mainnet', () => {
    db = createV5SchemaDatabase();
    const ts = Math.floor(Date.now() / 1000);

    db.prepare(
      `INSERT INTO wallets (id, name, chain, network, public_key, status, owner_verified, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run('w-eth-mn', 'Eth Mainnet', 'ethereum', 'ethereum-mainnet', 'pk-eth-mn', 'ACTIVE', 0, ts, ts);

    pushSchema(db);

    const wallet = db.prepare('SELECT environment, default_network FROM wallets WHERE id = ?').get('w-eth-mn') as { environment: string; default_network: string };
    expect(wallet.environment).toBe('mainnet');
    expect(wallet.default_network).toBe('ethereum-mainnet');
  });

  it('T-7d: polygon-amoy -> testnet', () => {
    db = createV5SchemaDatabase();
    const ts = Math.floor(Date.now() / 1000);

    db.prepare(
      `INSERT INTO wallets (id, name, chain, network, public_key, status, owner_verified, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run('w-poly-am', 'Polygon Amoy', 'ethereum', 'polygon-amoy', 'pk-poly-am', 'ACTIVE', 0, ts, ts);

    pushSchema(db);

    const wallet = db.prepare('SELECT environment, default_network FROM wallets WHERE id = ?').get('w-poly-am') as { environment: string; default_network: string };
    expect(wallet.environment).toBe('testnet');
    expect(wallet.default_network).toBe('polygon-amoy');
  });

  it('T-7e: base-mainnet -> mainnet', () => {
    db = createV5SchemaDatabase();
    const ts = Math.floor(Date.now() / 1000);

    db.prepare(
      `INSERT INTO wallets (id, name, chain, network, public_key, status, owner_verified, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run('w-base-mn', 'Base Mainnet', 'ethereum', 'base-mainnet', 'pk-base-mn', 'ACTIVE', 0, ts, ts);

    pushSchema(db);

    const wallet = db.prepare('SELECT environment, default_network FROM wallets WHERE id = ?').get('w-base-mn') as { environment: string; default_network: string };
    expect(wallet.environment).toBe('mainnet');
    expect(wallet.default_network).toBe('base-mainnet');
  });

  it('T-7f: default_network preserved after migration', () => {
    db = createV5SchemaDatabase();
    const ts = Math.floor(Date.now() / 1000);

    db.prepare(
      `INSERT INTO wallets (id, name, chain, network, public_key, status, owner_verified, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run('w-arb-sep', 'Arb Sepolia', 'ethereum', 'arbitrum-sepolia', 'pk-arb-sep', 'ACTIVE', 0, ts, ts);

    pushSchema(db);

    const wallet = db.prepare('SELECT default_network FROM wallets WHERE id = ?').get('w-arb-sep') as { default_network: string };
    expect(wallet.default_network).toBe('arbitrum-sepolia');
  });
});

// ---------------------------------------------------------------------------
// T-8: Data transformation: v6 transactions.network backfill
// ---------------------------------------------------------------------------

describe('data transformation: v6 transactions.network backfill', () => {
  let db: DatabaseType;

  afterEach(() => {
    try { db.close(); } catch { /* already closed */ }
  });

  it('T-8a: Solana transaction backfill', () => {
    db = createV5SchemaDatabase();
    const ts = Math.floor(Date.now() / 1000);

    db.prepare(
      `INSERT INTO wallets (id, name, chain, network, public_key, status, owner_verified, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run('w-sol-bf', 'Sol Backfill', 'solana', 'devnet', 'pk-sol-bf', 'ACTIVE', 0, ts, ts);

    db.prepare(
      `INSERT INTO transactions (id, wallet_id, chain, type, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run('tx-sol-bf', 'w-sol-bf', 'solana', 'TRANSFER', 'PENDING', ts);

    pushSchema(db);

    const tx = db.prepare('SELECT network FROM transactions WHERE id = ?').get('tx-sol-bf') as { network: string };
    expect(tx.network).toBe('devnet');
  });

  it('T-8b: EVM transaction backfill', () => {
    db = createV5SchemaDatabase();
    const ts = Math.floor(Date.now() / 1000);

    db.prepare(
      `INSERT INTO wallets (id, name, chain, network, public_key, status, owner_verified, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run('w-evm-bf', 'EVM Backfill', 'ethereum', 'ethereum-sepolia', 'pk-evm-bf', 'ACTIVE', 0, ts, ts);

    db.prepare(
      `INSERT INTO transactions (id, wallet_id, chain, type, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run('tx-evm-bf', 'w-evm-bf', 'ethereum', 'TRANSFER', 'PENDING', ts);

    pushSchema(db);

    const tx = db.prepare('SELECT network FROM transactions WHERE id = ?').get('tx-evm-bf') as { network: string };
    expect(tx.network).toBe('ethereum-sepolia');
  });

  it('T-8c: multiple transactions backfill (1 wallet + 5 transactions)', () => {
    db = createV5SchemaDatabase();
    const ts = Math.floor(Date.now() / 1000);

    db.prepare(
      `INSERT INTO wallets (id, name, chain, network, public_key, status, owner_verified, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run('w-multi', 'Multi TX', 'solana', 'mainnet', 'pk-multi', 'ACTIVE', 0, ts, ts);

    for (let i = 1; i <= 5; i++) {
      db.prepare(
        `INSERT INTO transactions (id, wallet_id, chain, type, status, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      ).run(`tx-multi-${i}`, 'w-multi', 'solana', 'TRANSFER', 'PENDING', ts);
    }

    pushSchema(db);

    for (let i = 1; i <= 5; i++) {
      const tx = db.prepare('SELECT network FROM transactions WHERE id = ?').get(`tx-multi-${i}`) as { network: string };
      expect(tx.network).toBe('mainnet');
    }
  });
});

// ---------------------------------------------------------------------------
// T-9: Data transformation: v3 agents to wallets
// ---------------------------------------------------------------------------

describe('data transformation: v3 agents to wallets', () => {
  let db: DatabaseType;

  afterEach(() => {
    try { db.close(); } catch { /* already closed */ }
  });

  it('T-9a: AGENT_CREATED -> WALLET_CREATED event transformation', () => {
    db = createV1SchemaDatabase();
    const ts = Math.floor(Date.now() / 1000);

    db.prepare(
      `INSERT INTO agents (id, name, chain, network, public_key, status, owner_verified, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run('a-evt-1', 'Agent Evt', 'solana', 'devnet', 'pk-evt-1', 'ACTIVE', 0, ts, ts);

    db.prepare(
      `INSERT INTO audit_log (timestamp, event_type, actor, agent_id, details)
       VALUES (?, ?, ?, ?, ?)`,
    ).run(ts, 'AGENT_CREATED', 'system', 'a-evt-1', '{}');

    pushSchema(db);

    // AGENT_CREATED should be converted to WALLET_CREATED
    const log = db.prepare("SELECT event_type FROM audit_log WHERE wallet_id = 'a-evt-1'").get() as { event_type: string };
    expect(log.event_type).toBe('WALLET_CREATED');
  });

  it('T-9b: agent_id -> wallet_id FK preserved', () => {
    db = createV1SchemaDatabase();
    const ts = Math.floor(Date.now() / 1000);

    db.prepare(
      `INSERT INTO agents (id, name, chain, network, public_key, status, owner_verified, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run('a-fk-1', 'Agent FK', 'solana', 'devnet', 'pk-fk-1', 'ACTIVE', 0, ts, ts);

    db.prepare(
      `INSERT INTO sessions (id, agent_id, token_hash, expires_at, absolute_expires_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run('sess-fk-1', 'a-fk-1', 'hash-fk-1', ts + 3600, ts + 86400, ts);

    pushSchema(db);

    // session should have wallet_id = original agent_id
    const session = db.prepare('SELECT wallet_id FROM sessions WHERE id = ?').get('sess-fk-1') as { wallet_id: string };
    expect(session.wallet_id).toBe('a-fk-1');
  });

  it('T-9c: AGENT_SUSPENDED -> WALLET_SUSPENDED notification_logs transformation', () => {
    db = createV1SchemaDatabase();
    const ts = Math.floor(Date.now() / 1000);

    db.prepare(
      `INSERT INTO notification_logs (id, event_type, agent_id, channel, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run('notif-susp-1', 'AGENT_SUSPENDED', 'a-susp', 'telegram', 'sent', ts);

    pushSchema(db);

    // AGENT_SUSPENDED should be converted to WALLET_SUSPENDED
    const notif = db.prepare('SELECT event_type FROM notification_logs WHERE id = ?').get('notif-susp-1') as { event_type: string };
    expect(notif.event_type).toBe('WALLET_SUSPENDED');
  });
});

// ---------------------------------------------------------------------------
// T-10: FK integrity preservation
// ---------------------------------------------------------------------------

describe('FK integrity preservation', () => {
  let db: DatabaseType;

  afterEach(() => {
    try { db.close(); } catch { /* already closed */ }
  });

  it('T-10a: v5 migration preserves PRAGMA foreign_key_check', () => {
    db = createV5SchemaDatabase();
    const ts = Math.floor(Date.now() / 1000);

    // Insert wallet + session + transaction + policy FK chain
    db.prepare(
      `INSERT INTO wallets (id, name, chain, network, public_key, status, owner_verified, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run('w-fk-v5', 'FK V5', 'solana', 'devnet', 'pk-fk-v5', 'ACTIVE', 0, ts, ts);

    db.prepare(
      `INSERT INTO sessions (id, wallet_id, token_hash, expires_at, absolute_expires_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run('sess-fk-v5', 'w-fk-v5', 'hash-fk-v5', ts + 3600, ts + 86400, ts);

    db.prepare(
      `INSERT INTO transactions (id, wallet_id, session_id, chain, type, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run('tx-fk-v5', 'w-fk-v5', 'sess-fk-v5', 'solana', 'TRANSFER', 'PENDING', ts);

    db.prepare(
      `INSERT INTO policies (id, wallet_id, type, rules, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run('pol-fk-v5', 'w-fk-v5', 'SPENDING_LIMIT', '{}', ts, ts);

    pushSchema(db);

    const fkErrors = db.pragma('foreign_key_check') as unknown[];
    expect(fkErrors).toEqual([]);
  });

  it('T-10b: v1 migration preserves PRAGMA foreign_key_check', () => {
    db = createV1SchemaDatabase();
    const ts = Math.floor(Date.now() / 1000);

    // Insert agent + session + transaction FK chain
    db.prepare(
      `INSERT INTO agents (id, name, chain, network, public_key, status, owner_verified, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run('a-fk-v1', 'FK V1', 'solana', 'devnet', 'pk-fk-v1', 'ACTIVE', 0, ts, ts);

    db.prepare(
      `INSERT INTO sessions (id, agent_id, token_hash, expires_at, absolute_expires_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run('sess-fk-v1', 'a-fk-v1', 'hash-fk-v1', ts + 3600, ts + 86400, ts);

    db.prepare(
      `INSERT INTO transactions (id, agent_id, session_id, chain, type, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run('tx-fk-v1', 'a-fk-v1', 'sess-fk-v1', 'solana', 'TRANSFER', 'PENDING', ts);

    pushSchema(db);

    const fkErrors = db.pragma('foreign_key_check') as unknown[];
    expect(fkErrors).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// T-11: Edge cases
// ---------------------------------------------------------------------------

describe('edge cases', () => {
  let db: DatabaseType;

  afterEach(() => {
    try { db.close(); } catch { /* already closed */ }
  });

  it('T-11a: NULL owner_address preserved after migration', () => {
    db = createV5SchemaDatabase();
    const ts = Math.floor(Date.now() / 1000);

    db.prepare(
      `INSERT INTO wallets (id, name, chain, network, public_key, status, owner_verified, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run('w-null-owner', 'No Owner', 'solana', 'devnet', 'pk-null', 'ACTIVE', 0, ts, ts);

    pushSchema(db);

    const wallet = db.prepare('SELECT owner_address FROM wallets WHERE id = ?').get('w-null-owner') as { owner_address: string | null };
    expect(wallet.owner_address).toBeNull();
  });

  it('T-11b: empty tables migration (no error)', () => {
    db = createV5SchemaDatabase();

    // No data inserted -- just empty tables
    expect(() => pushSchema(db)).not.toThrow();

    // All versions should be recorded
    const versions = getVersions(db);
    expect(versions).toContain(LATEST_SCHEMA_VERSION);
  });

  it('T-12: v9 DB -> v10 migration adds message column to notification_logs', () => {
    // Create a v5 DB (which migrates to v9 via pushSchema)
    db = createV5SchemaDatabase();
    const ts = Math.floor(Date.now() / 1000);

    // Insert notification log record (pre-v10, no message column)
    db.prepare(
      `INSERT INTO notification_logs (id, event_type, wallet_id, channel, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run('notif-pre-v10', 'TX_CONFIRMED', 'w-1', 'telegram', 'sent', ts);

    pushSchema(db);

    // Verify message column exists
    const columns = getTableColumns(db, 'notification_logs');
    expect(columns).toContain('message');

    // Verify existing record has message = NULL
    const row = db.prepare('SELECT message FROM notification_logs WHERE id = ?').get('notif-pre-v10') as { message: string | null };
    expect(row.message).toBeNull();

    // Verify LATEST_SCHEMA_VERSION is 10
    expect(LATEST_SCHEMA_VERSION).toBe(10);
  });

  it('T-13: existing notification_logs data preserved after v10 migration', () => {
    db = createV5SchemaDatabase();
    const ts = Math.floor(Date.now() / 1000);

    // Insert multiple notification log records with different statuses
    db.prepare(
      `INSERT INTO notification_logs (id, event_type, wallet_id, channel, status, error, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run('notif-sent-1', 'TX_CONFIRMED', 'w-1', 'telegram', 'sent', null, ts);

    db.prepare(
      `INSERT INTO notification_logs (id, event_type, wallet_id, channel, status, error, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run('notif-fail-1', 'TX_FAILED', 'w-2', 'discord', 'failed', 'timeout', ts);

    pushSchema(db);

    // Verify records are preserved with original data
    const sent = db.prepare('SELECT * FROM notification_logs WHERE id = ?').get('notif-sent-1') as {
      event_type: string; wallet_id: string; channel: string; status: string; error: string | null; message: string | null;
    };
    expect(sent.event_type).toBe('TX_CONFIRMED');
    expect(sent.wallet_id).toBe('w-1');
    expect(sent.channel).toBe('telegram');
    expect(sent.status).toBe('sent');
    expect(sent.error).toBeNull();
    expect(sent.message).toBeNull();

    const failed = db.prepare('SELECT * FROM notification_logs WHERE id = ?').get('notif-fail-1') as {
      event_type: string; wallet_id: string; channel: string; status: string; error: string | null; message: string | null;
    };
    expect(failed.event_type).toBe('TX_FAILED');
    expect(failed.wallet_id).toBe('w-2');
    expect(failed.channel).toBe('discord');
    expect(failed.status).toBe('failed');
    expect(failed.error).toBe('timeout');
    expect(failed.message).toBeNull();
  });

  it('T-11c: suspended wallet data preserved', () => {
    db = createV5SchemaDatabase();
    const ts = Math.floor(Date.now() / 1000);
    const suspendedAt = ts - 3600;
    const reason = 'Security incident detected';

    db.prepare(
      `INSERT INTO wallets (id, name, chain, network, public_key, status, owner_address, owner_verified, created_at, updated_at, suspended_at, suspension_reason)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run('w-susp', 'Suspended', 'solana', 'devnet', 'pk-susp', 'SUSPENDED', 'owner123', 1, ts, ts, suspendedAt, reason);

    pushSchema(db);

    const wallet = db.prepare('SELECT status, owner_address, owner_verified, suspended_at, suspension_reason FROM wallets WHERE id = ?').get('w-susp') as {
      status: string;
      owner_address: string;
      owner_verified: number;
      suspended_at: number;
      suspension_reason: string;
    };
    expect(wallet.status).toBe('SUSPENDED');
    expect(wallet.owner_address).toBe('owner123');
    expect(wallet.owner_verified).toBe(1);
    expect(wallet.suspended_at).toBe(suspendedAt);
    expect(wallet.suspension_reason).toBe(reason);
  });
});
