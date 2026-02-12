/**
 * Schema push + incremental migration runner for daemon SQLite database.
 *
 * Creates all 9 tables with indexes, foreign keys, and CHECK constraints
 * using CREATE TABLE IF NOT EXISTS statements. After initial schema creation,
 * runs incremental migrations via runMigrations() for ALTER TABLE changes.
 *
 * v1.4+: DB schema changes MUST use ALTER TABLE incremental migrations (MIG-01~06).
 * DB deletion and recreation is prohibited.
 *
 * @see docs/25-sqlite-schema.md
 * @see docs/65-migration-strategy.md
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
  NOTIFICATION_LOG_STATUSES,
} from '@waiaas/core';

// ---------------------------------------------------------------------------
// Utility: build CHECK IN clause from SSoT arrays
// ---------------------------------------------------------------------------

const inList = (values: readonly string[]) => values.map((v) => `'${v}'`).join(', ');

// ---------------------------------------------------------------------------
// DDL statements for all 9 tables
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

    // Table 8: notification_logs
    `CREATE TABLE IF NOT EXISTS notification_logs (
  id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  agent_id TEXT,
  channel TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN (${inList(NOTIFICATION_LOG_STATUSES)})),
  error TEXT,
  created_at INTEGER NOT NULL
)`,

    // Table 9: schema_version
    `CREATE TABLE IF NOT EXISTS schema_version (
  version INTEGER PRIMARY KEY,
  applied_at INTEGER NOT NULL,
  description TEXT NOT NULL
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

    // notification_logs indexes
    'CREATE INDEX IF NOT EXISTS idx_notification_logs_event_type ON notification_logs(event_type)',
    'CREATE INDEX IF NOT EXISTS idx_notification_logs_agent_id ON notification_logs(agent_id)',
    'CREATE INDEX IF NOT EXISTS idx_notification_logs_status ON notification_logs(status)',
    'CREATE INDEX IF NOT EXISTS idx_notification_logs_created_at ON notification_logs(created_at)',
  ];
}

// ---------------------------------------------------------------------------
// Migration runner (v1.4+ incremental ALTER TABLE migrations)
// ---------------------------------------------------------------------------

/** A single incremental migration (ALTER TABLE, CREATE INDEX, etc.). */
export interface Migration {
  /** Monotonically increasing version number (must be > 1, since version 1 = initial schema). */
  version: number;
  /** Human-readable description for schema_version table. */
  description: string;
  /**
   * If true, runMigrations will NOT wrap up() in BEGIN/COMMIT.
   * The up() function manages its own PRAGMA foreign_keys=OFF + BEGIN/COMMIT.
   * Use for table recreation (12-step) migrations that require foreign_keys disabled.
   */
  managesOwnTransaction?: boolean;
  /** DDL statements to execute. Runs inside a transaction (unless managesOwnTransaction). */
  up: (sqlite: Database) => void;
}

/**
 * Global migration registry. v1.4 migrations will be added here in subsequent phases.
 * Each migration's version must be unique and greater than 1.
 */
export const MIGRATIONS: Migration[] = [];

// ---------------------------------------------------------------------------
// v2: Expand agents.network CHECK to include EVM networks
// ---------------------------------------------------------------------------
// SQLite cannot ALTER CHECK constraints, so we use 12-step table recreation.
// This requires PRAGMA foreign_keys=OFF (handled by managesOwnTransaction).

MIGRATIONS.push({
  version: 2,
  description: 'Expand agents network CHECK to include EVM networks',
  managesOwnTransaction: true,
  up: (sqlite) => {
    // Step 1: Begin transaction (foreign_keys already OFF via runner)
    sqlite.exec('BEGIN');

    try {
      // Step 2: Create new agents table with expanded CHECK (uses SSoT arrays)
      sqlite.exec(`CREATE TABLE agents_new (
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
)`);

      // Step 3: Copy existing data
      sqlite.exec('INSERT INTO agents_new SELECT * FROM agents');

      // Step 4: Drop old table
      sqlite.exec('DROP TABLE agents');

      // Step 5: Rename new table
      sqlite.exec('ALTER TABLE agents_new RENAME TO agents');

      // Step 6: Recreate indexes
      sqlite.exec(
        'CREATE UNIQUE INDEX IF NOT EXISTS idx_agents_public_key ON agents(public_key)',
      );
      sqlite.exec(
        'CREATE INDEX IF NOT EXISTS idx_agents_status ON agents(status)',
      );
      sqlite.exec(
        'CREATE INDEX IF NOT EXISTS idx_agents_chain_network ON agents(chain, network)',
      );
      sqlite.exec(
        'CREATE INDEX IF NOT EXISTS idx_agents_owner_address ON agents(owner_address)',
      );

      // Step 7: Commit transaction
      sqlite.exec('COMMIT');
    } catch (err) {
      sqlite.exec('ROLLBACK');
      throw err;
    }

    // Step 8: Re-enable foreign keys to run integrity check
    sqlite.pragma('foreign_keys = ON');

    // Step 9: Verify FK integrity
    const fkErrors = sqlite.pragma('foreign_key_check') as unknown[];
    if (fkErrors.length > 0) {
      throw new Error(
        `FK integrity check failed after v2 migration: ${JSON.stringify(fkErrors)}`,
      );
    }

    // Note: Runner will also set foreign_keys = ON after we return,
    // but we set it here to run the integrity check with FK enabled.
  },
});

/**
 * Run incremental migrations against the database.
 *
 * - Reads the current max version from schema_version table
 * - Executes each migration with version > current in ascending order
 * - Each migration runs in its own transaction (BEGIN/COMMIT)
 * - On failure: ROLLBACK the failed migration, throw error, skip remaining
 *
 * @param sqlite - Raw better-sqlite3 database instance.
 * @param migrations - Migration list to apply. Defaults to global MIGRATIONS array.
 * @returns Count of applied and skipped migrations.
 */
export function runMigrations(
  sqlite: Database,
  migrations: Migration[] = MIGRATIONS,
): { applied: number; skipped: number } {
  // Get current schema version (pushSchema always inserts version 1)
  const row = sqlite
    .prepare('SELECT MAX(version) AS max_version FROM schema_version')
    .get() as { max_version: number | null } | undefined;
  const currentVersion = row?.max_version ?? 1;

  // Sort migrations by version ascending to guarantee order
  const sorted = [...migrations].sort((a, b) => a.version - b.version);

  let applied = 0;
  let skipped = 0;

  for (const migration of sorted) {
    if (migration.version <= currentVersion) {
      skipped++;
      continue;
    }

    if (migration.managesOwnTransaction) {
      // Migration manages its own PRAGMA + transaction (e.g. 12-step table recreation)
      // Disable foreign keys so the migration can DROP/RENAME tables
      sqlite.pragma('foreign_keys = OFF');
      try {
        migration.up(sqlite);

        // Record successful migration (up() must have committed its own transaction)
        sqlite
          .prepare(
            'INSERT INTO schema_version (version, applied_at, description) VALUES (?, ?, ?)',
          )
          .run(
            migration.version,
            Math.floor(Date.now() / 1000),
            migration.description,
          );

        applied++;
      } catch (err) {
        // Ensure foreign_keys is restored even on failure
        try {
          sqlite.pragma('foreign_keys = ON');
        } catch {
          /* best effort */
        }
        throw new Error(
          `Migration v${migration.version} (${migration.description}) failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
      // Re-enable foreign keys after successful migration
      sqlite.pragma('foreign_keys = ON');
    } else {
      // Standard migration: wrap in BEGIN/COMMIT
      sqlite.exec('BEGIN');
      try {
        migration.up(sqlite);

        // Record successful migration
        sqlite
          .prepare(
            'INSERT INTO schema_version (version, applied_at, description) VALUES (?, ?, ?)',
          )
          .run(
            migration.version,
            Math.floor(Date.now() / 1000),
            migration.description,
          );

        sqlite.exec('COMMIT');
        applied++;
      } catch (err) {
        sqlite.exec('ROLLBACK');
        throw new Error(
          `Migration v${migration.version} (${migration.description}) failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
  }

  return { applied, skipped };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Push the full schema to the database (CREATE TABLE IF NOT EXISTS + indexes).
 * Then run any pending incremental migrations.
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

    // Record schema version 1 if not already recorded
    const existing = sqlite
      .prepare('SELECT version FROM schema_version WHERE version = 1')
      .get() as { version: number } | undefined;
    if (!existing) {
      sqlite
        .prepare(
          'INSERT INTO schema_version (version, applied_at, description) VALUES (?, ?, ?)',
        )
        .run(1, Math.floor(Date.now() / 1000), 'Initial schema (9 tables)');
    }

    sqlite.exec('COMMIT');
  } catch (err) {
    sqlite.exec('ROLLBACK');
    throw err;
  }

  // Run incremental migrations after initial schema is established
  runMigrations(sqlite);
}
