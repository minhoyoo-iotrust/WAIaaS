/**
 * Schema push for daemon SQLite database.
 *
 * Creates all 7 tables with indexes, foreign keys, and CHECK constraints
 * using CREATE TABLE IF NOT EXISTS statements. This approach is preferred
 * for v1.1 over drizzle-kit migrations to keep daemon startup simple.
 *
 * @see docs/25-sqlite-schema.md
 */

import type { Database } from 'better-sqlite3';
import {
  AGENT_STATUSES,
  CHAIN_TYPES,
  NETWORK_TYPES,
  TRANSACTION_STATUSES,
  TRANSACTION_TYPES,
  POLICY_TYPES,
  POLICY_TIERS,
} from '@waiaas/core';

// ---------------------------------------------------------------------------
// Utility: build CHECK IN clause from SSoT arrays
// ---------------------------------------------------------------------------

const inList = (values: readonly string[]) => values.map((v) => `'${v}'`).join(', ');

// ---------------------------------------------------------------------------
// DDL statements for all 7 tables
// ---------------------------------------------------------------------------

function getCreateTableStatements(): string[] {
  return [
    // Table 1: agents
    `CREATE TABLE IF NOT EXISTS agents (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  chain TEXT NOT NULL CHECK (chain IN (${inList(CHAIN_TYPES)})),
  network TEXT NOT NULL CHECK (network IN (${inList(NETWORK_TYPES)})),
  public_key TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'CREATING' CHECK (status IN (${inList(AGENT_STATUSES)})),
  owner_address TEXT,
  owner_verified INTEGER NOT NULL DEFAULT 0 CHECK (owner_verified IN (0, 1)),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  suspended_at INTEGER,
  suspension_reason TEXT
)`,

    // Table 2: sessions
    `CREATE TABLE IF NOT EXISTS sessions (
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
)`,

    // Table 3: transactions
    `CREATE TABLE IF NOT EXISTS transactions (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE RESTRICT,
  session_id TEXT REFERENCES sessions(id) ON DELETE SET NULL,
  chain TEXT NOT NULL,
  tx_hash TEXT,
  type TEXT NOT NULL CHECK (type IN (${inList(TRANSACTION_TYPES)})),
  amount TEXT,
  to_address TEXT,
  token_mint TEXT,
  contract_address TEXT,
  method_signature TEXT,
  spender_address TEXT,
  approved_amount TEXT,
  parent_id TEXT REFERENCES transactions(id) ON DELETE CASCADE,
  batch_index INTEGER,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN (${inList(TRANSACTION_STATUSES)})),
  tier TEXT CHECK (tier IS NULL OR tier IN (${inList(POLICY_TIERS)})),
  queued_at INTEGER,
  executed_at INTEGER,
  created_at INTEGER NOT NULL,
  reserved_amount TEXT,
  error TEXT,
  metadata TEXT
)`,

    // Table 4: policies
    `CREATE TABLE IF NOT EXISTS policies (
  id TEXT PRIMARY KEY,
  agent_id TEXT REFERENCES agents(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN (${inList(POLICY_TYPES)})),
  rules TEXT NOT NULL,
  priority INTEGER NOT NULL DEFAULT 0,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
)`,

    // Table 5: pending_approvals
    `CREATE TABLE IF NOT EXISTS pending_approvals (
  id TEXT PRIMARY KEY,
  tx_id TEXT NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
  required_by INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  approved_at INTEGER,
  rejected_at INTEGER,
  owner_signature TEXT,
  created_at INTEGER NOT NULL
)`,

    // Table 6: audit_log
    `CREATE TABLE IF NOT EXISTS audit_log (
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
)`,

    // Table 7: key_value_store
    `CREATE TABLE IF NOT EXISTS key_value_store (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at INTEGER NOT NULL
)`,
  ];
}

// ---------------------------------------------------------------------------
// Index creation statements
// ---------------------------------------------------------------------------

function getCreateIndexStatements(): string[] {
  return [
    // agents indexes
    'CREATE UNIQUE INDEX IF NOT EXISTS idx_agents_public_key ON agents(public_key)',
    'CREATE INDEX IF NOT EXISTS idx_agents_status ON agents(status)',
    'CREATE INDEX IF NOT EXISTS idx_agents_chain_network ON agents(chain, network)',
    'CREATE INDEX IF NOT EXISTS idx_agents_owner_address ON agents(owner_address)',

    // sessions indexes
    'CREATE INDEX IF NOT EXISTS idx_sessions_agent_id ON sessions(agent_id)',
    'CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at)',
    'CREATE INDEX IF NOT EXISTS idx_sessions_token_hash ON sessions(token_hash)',

    // transactions indexes
    'CREATE INDEX IF NOT EXISTS idx_transactions_agent_status ON transactions(agent_id, status)',
    'CREATE INDEX IF NOT EXISTS idx_transactions_session_id ON transactions(session_id)',
    'CREATE UNIQUE INDEX IF NOT EXISTS idx_transactions_tx_hash ON transactions(tx_hash)',
    'CREATE INDEX IF NOT EXISTS idx_transactions_queued_at ON transactions(queued_at)',
    'CREATE INDEX IF NOT EXISTS idx_transactions_created_at ON transactions(created_at)',
    'CREATE INDEX IF NOT EXISTS idx_transactions_type ON transactions(type)',
    'CREATE INDEX IF NOT EXISTS idx_transactions_contract_address ON transactions(contract_address)',
    'CREATE INDEX IF NOT EXISTS idx_transactions_parent_id ON transactions(parent_id)',

    // policies indexes
    'CREATE INDEX IF NOT EXISTS idx_policies_agent_enabled ON policies(agent_id, enabled)',
    'CREATE INDEX IF NOT EXISTS idx_policies_type ON policies(type)',

    // pending_approvals indexes
    'CREATE INDEX IF NOT EXISTS idx_pending_approvals_tx_id ON pending_approvals(tx_id)',
    'CREATE INDEX IF NOT EXISTS idx_pending_approvals_expires_at ON pending_approvals(expires_at)',

    // audit_log indexes
    'CREATE INDEX IF NOT EXISTS idx_audit_log_timestamp ON audit_log(timestamp)',
    'CREATE INDEX IF NOT EXISTS idx_audit_log_event_type ON audit_log(event_type)',
    'CREATE INDEX IF NOT EXISTS idx_audit_log_agent_id ON audit_log(agent_id)',
    'CREATE INDEX IF NOT EXISTS idx_audit_log_severity ON audit_log(severity)',
    'CREATE INDEX IF NOT EXISTS idx_audit_log_agent_timestamp ON audit_log(agent_id, timestamp)',
  ];
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Push the full schema to the database (CREATE TABLE IF NOT EXISTS + indexes).
 * Safe to call on every daemon startup -- idempotent.
 *
 * @param sqlite - Raw better-sqlite3 database instance (PRAGMAs must already be applied).
 */
export function pushSchema(sqlite: Database): void {
  const tables = getCreateTableStatements();
  const indexes = getCreateIndexStatements();

  sqlite.exec('BEGIN');
  try {
    for (const stmt of tables) {
      sqlite.exec(stmt);
    }
    for (const stmt of indexes) {
      sqlite.exec(stmt);
    }
    sqlite.exec('COMMIT');
  } catch (err) {
    sqlite.exec('ROLLBACK');
    throw err;
  }
}
