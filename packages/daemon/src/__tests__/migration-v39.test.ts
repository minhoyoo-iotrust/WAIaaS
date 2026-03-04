/**
 * Tests for DB v39 migration: ERC-8004 agent_identities + reputation_cache + approval_type + policies CHECK.
 *
 * Tests cover:
 * 1. agent_identities table creation with correct columns
 * 2. reputation_cache table creation with composite PK
 * 3. pending_approvals.approval_type column addition (default 'SIWE', CHECK)
 * 4. policies table recreation with REPUTATION_THRESHOLD in CHECK
 * 5. Data preservation during policies table recreation
 * 6. Fresh DB (pushSchema) creates all tables
 * 7. agent_identities indexes
 * 8. agent_identities.status CHECK constraint
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { LATEST_SCHEMA_VERSION, pushSchema, runMigrations } from '../infrastructure/database/migrate.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createV38Db(): InstanceType<typeof Database> {
  const sqlite = new Database(':memory:');
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');
  pushSchema(sqlite);

  // Downgrade: remove v39 artifacts to simulate a v38 DB
  // 1. Drop agent_identities and reputation_cache if they exist
  sqlite.exec('DROP TABLE IF EXISTS agent_identities');
  sqlite.exec('DROP TABLE IF EXISTS reputation_cache');

  // 2. Remove approval_type column from pending_approvals by recreating
  sqlite.exec(`CREATE TABLE pending_approvals_old AS SELECT
    id, tx_id, required_by, expires_at, approved_at, rejected_at,
    owner_signature, approval_channel, created_at FROM pending_approvals`);
  sqlite.exec('DROP TABLE pending_approvals');
  sqlite.exec(`CREATE TABLE pending_approvals (
  id TEXT PRIMARY KEY,
  tx_id TEXT NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
  required_by INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  approved_at INTEGER,
  rejected_at INTEGER,
  owner_signature TEXT,
  approval_channel TEXT DEFAULT 'rest_api',
  created_at INTEGER NOT NULL
)`);
  sqlite.exec('INSERT INTO pending_approvals SELECT * FROM pending_approvals_old');
  sqlite.exec('DROP TABLE pending_approvals_old');

  // 3. Recreate policies without REPUTATION_THRESHOLD in CHECK
  sqlite.exec(`CREATE TABLE policies_old AS SELECT * FROM policies`);
  sqlite.exec('DROP TABLE policies');
  sqlite.exec(`CREATE TABLE policies (
  id TEXT PRIMARY KEY,
  wallet_id TEXT REFERENCES wallets(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('SPENDING_LIMIT', 'WHITELIST', 'TIME_RESTRICTION', 'RATE_LIMIT', 'ALLOWED_TOKENS', 'CONTRACT_WHITELIST', 'METHOD_WHITELIST', 'APPROVED_SPENDERS', 'APPROVE_AMOUNT_LIMIT', 'APPROVE_TIER_OVERRIDE', 'ALLOWED_NETWORKS', 'X402_ALLOWED_DOMAINS', 'LENDING_LTV_LIMIT', 'LENDING_ASSET_WHITELIST', 'PERP_MAX_LEVERAGE', 'PERP_MAX_POSITION_USD', 'PERP_ALLOWED_MARKETS')),
  rules TEXT NOT NULL,
  priority INTEGER NOT NULL DEFAULT 0,
  enabled INTEGER NOT NULL DEFAULT 1,
  network TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
)`);
  sqlite.exec('INSERT INTO policies SELECT * FROM policies_old');
  sqlite.exec('DROP TABLE policies_old');

  // 4. Remove v39 from schema_version
  sqlite.exec('DELETE FROM schema_version WHERE version = 39');

  // Re-enable foreign keys
  sqlite.pragma('foreign_keys = ON');

  return sqlite;
}

function getMaxVersion(sqlite: InstanceType<typeof Database>): number {
  const row = sqlite
    .prepare('SELECT MAX(version) AS max_version FROM schema_version')
    .get() as { max_version: number };
  return row.max_version;
}

function tableExists(sqlite: InstanceType<typeof Database>, name: string): boolean {
  const row = sqlite
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?")
    .get(name) as { name: string } | undefined;
  return row !== undefined;
}

function getTableColumns(sqlite: InstanceType<typeof Database>, table: string): string[] {
  const rows = sqlite.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  return rows.map((r) => r.name);
}

function indexExists(sqlite: InstanceType<typeof Database>, name: string): boolean {
  const row = sqlite
    .prepare("SELECT name FROM sqlite_master WHERE type='index' AND name=?")
    .get(name) as { name: string } | undefined;
  return row !== undefined;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('DB v39 Migration: ERC-8004 Foundation', () => {
  let sqlite: InstanceType<typeof Database>;

  afterEach(() => {
    if (sqlite) {
      try { sqlite.close(); } catch { /* ignore */ }
    }
  });

  // Test 1: agent_identities table
  it('T1: v38 -> v39 creates agent_identities with correct columns', () => {
    sqlite = createV38Db();
    expect(tableExists(sqlite, 'agent_identities')).toBe(false);

    runMigrations(sqlite);

    expect(tableExists(sqlite, 'agent_identities')).toBe(true);
    const cols = getTableColumns(sqlite, 'agent_identities');
    expect(cols).toContain('id');
    expect(cols).toContain('wallet_id');
    expect(cols).toContain('chain_agent_id');
    expect(cols).toContain('registry_address');
    expect(cols).toContain('chain_id');
    expect(cols).toContain('agent_uri');
    expect(cols).toContain('registration_file_url');
    expect(cols).toContain('status');
    expect(cols).toContain('created_at');
    expect(cols).toContain('updated_at');
    expect(cols).toHaveLength(10);
  });

  // Test 2: reputation_cache table with composite PK
  it('T2: v38 -> v39 creates reputation_cache with composite PK', () => {
    sqlite = createV38Db();
    expect(tableExists(sqlite, 'reputation_cache')).toBe(false);

    runMigrations(sqlite);

    expect(tableExists(sqlite, 'reputation_cache')).toBe(true);
    const cols = getTableColumns(sqlite, 'reputation_cache');
    expect(cols).toContain('agent_id');
    expect(cols).toContain('registry_address');
    expect(cols).toContain('tag1');
    expect(cols).toContain('tag2');
    expect(cols).toContain('score');
    expect(cols).toContain('score_decimals');
    expect(cols).toContain('feedback_count');
    expect(cols).toContain('cached_at');
    expect(cols).toHaveLength(8);

    // Verify composite PK by inserting same key combination twice
    const ts = Math.floor(Date.now() / 1000);
    sqlite.prepare('INSERT INTO reputation_cache (agent_id, registry_address, tag1, tag2, score, score_decimals, feedback_count, cached_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run('agent1', '0x1234', '', '', 50, 0, 10, ts);
    expect(() => {
      sqlite.prepare('INSERT INTO reputation_cache (agent_id, registry_address, tag1, tag2, score, score_decimals, feedback_count, cached_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run('agent1', '0x1234', '', '', 60, 0, 20, ts);
    }).toThrow(/UNIQUE constraint failed/);
  });

  // Test 3: pending_approvals.approval_type
  it('T3: v38 -> v39 adds approval_type to pending_approvals with default SIWE and CHECK', () => {
    sqlite = createV38Db();
    const colsBefore = getTableColumns(sqlite, 'pending_approvals');
    expect(colsBefore).not.toContain('approval_type');

    runMigrations(sqlite);

    const colsAfter = getTableColumns(sqlite, 'pending_approvals');
    expect(colsAfter).toContain('approval_type');

    // Verify default value is 'SIWE'
    const info = sqlite.prepare('PRAGMA table_info(pending_approvals)').all() as { name: string; dflt_value: string | null }[];
    const atCol = info.find((c) => c.name === 'approval_type');
    expect(atCol).toBeDefined();
    expect(atCol!.dflt_value).toBe("'SIWE'");

    // Verify CHECK constraint accepts EIP712
    // Note: We can't directly insert into pending_approvals due to FK,
    // but we can check the SQL definition
    const createSql = sqlite
      .prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='pending_approvals'")
      .get() as { sql: string };
    expect(createSql.sql).toContain('SIWE');
    expect(createSql.sql).toContain('EIP712');
  });

  // Test 4: policies CHECK includes REPUTATION_THRESHOLD
  it('T4: v38 -> v39 policies CHECK constraint includes REPUTATION_THRESHOLD', () => {
    sqlite = createV38Db();

    // Verify REPUTATION_THRESHOLD is NOT in the v38 policies CHECK
    const createSqlBefore = sqlite
      .prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='policies'")
      .get() as { sql: string };
    expect(createSqlBefore.sql).not.toContain('REPUTATION_THRESHOLD');

    runMigrations(sqlite);

    const createSqlAfter = sqlite
      .prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='policies'")
      .get() as { sql: string };
    expect(createSqlAfter.sql).toContain('REPUTATION_THRESHOLD');
  });

  // Test 5: policies data preservation during recreation
  it('T5: existing policies data is preserved after table recreation', () => {
    sqlite = createV38Db();
    const ts = Math.floor(Date.now() / 1000);

    // Insert a wallet first (FK requirement)
    sqlite.exec(`INSERT INTO wallets (id, name, chain, environment, public_key, status, owner_verified, created_at, updated_at, monitor_incoming, account_type, deployed) VALUES ('w1', 'test', 'solana', 'testnet', 'pk1', 'ACTIVE', 0, ${ts}, ${ts}, 0, 'eoa', 1)`);

    // Insert a policy
    sqlite.exec(`INSERT INTO policies (id, wallet_id, type, rules, priority, enabled, created_at, updated_at) VALUES ('p1', 'w1', 'SPENDING_LIMIT', '{"instant_max":"1000"}', 0, 1, ${ts}, ${ts})`);

    runMigrations(sqlite);

    // Verify data is preserved
    const policy = sqlite.prepare('SELECT * FROM policies WHERE id = ?').get('p1') as Record<string, unknown>;
    expect(policy).toBeDefined();
    expect(policy.wallet_id).toBe('w1');
    expect(policy.type).toBe('SPENDING_LIMIT');
    expect(policy.rules).toBe('{"instant_max":"1000"}');
  });

  // Test 6: Fresh DB via pushSchema
  it('T6: fresh DB has agent_identities, reputation_cache and LATEST_SCHEMA_VERSION=39', () => {
    sqlite = new Database(':memory:');
    sqlite.pragma('journal_mode = WAL');
    sqlite.pragma('foreign_keys = ON');
    pushSchema(sqlite);

    expect(LATEST_SCHEMA_VERSION).toBe(39);
    expect(tableExists(sqlite, 'agent_identities')).toBe(true);
    expect(tableExists(sqlite, 'reputation_cache')).toBe(true);
    expect(getMaxVersion(sqlite)).toBe(39);
  });

  // Test 7: agent_identities indexes
  it('T7: agent_identities has idx_agent_identities_wallet and idx_agent_identities_chain indexes', () => {
    sqlite = new Database(':memory:');
    sqlite.pragma('journal_mode = WAL');
    sqlite.pragma('foreign_keys = ON');
    pushSchema(sqlite);

    expect(indexExists(sqlite, 'idx_agent_identities_wallet')).toBe(true);
    expect(indexExists(sqlite, 'idx_agent_identities_chain')).toBe(true);
  });

  // Test 8: agent_identities.status CHECK
  it('T8: agent_identities.status CHECK accepts PENDING/REGISTERED/WALLET_LINKED/DEREGISTERED', () => {
    sqlite = new Database(':memory:');
    sqlite.pragma('journal_mode = WAL');
    sqlite.pragma('foreign_keys = ON');
    pushSchema(sqlite);

    const ts = Math.floor(Date.now() / 1000);

    // Create wallet first (FK)
    sqlite.exec(`INSERT INTO wallets (id, name, chain, environment, public_key, status, owner_verified, created_at, updated_at, monitor_incoming, account_type, deployed) VALUES ('w1', 'test', 'ethereum', 'mainnet', 'pk1', 'ACTIVE', 0, ${ts}, ${ts}, 0, 'eoa', 1)`);

    // Valid statuses
    for (const status of ['PENDING', 'REGISTERED', 'WALLET_LINKED', 'DEREGISTERED']) {
      const id = `ai-${status}`;
      sqlite.prepare('INSERT INTO agent_identities (id, wallet_id, chain_agent_id, registry_address, chain_id, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(id, 'w1', `agent-${status}`, '0x1234', 1, status, ts, ts);
      const row = sqlite.prepare('SELECT status FROM agent_identities WHERE id = ?').get(id) as { status: string };
      expect(row.status).toBe(status);
    }

    // Invalid status should fail
    expect(() => {
      sqlite.prepare('INSERT INTO agent_identities (id, wallet_id, chain_agent_id, registry_address, chain_id, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run('ai-bad', 'w1', 'agent-bad', '0x5678', 1, 'INVALID', ts, ts);
    }).toThrow();
  });
});
