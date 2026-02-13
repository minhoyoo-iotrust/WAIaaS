/**
 * Schema push + incremental migration runner for daemon SQLite database.
 *
 * Creates all 11 tables with indexes, foreign keys, and CHECK constraints
 * using CREATE TABLE IF NOT EXISTS statements. After initial schema creation,
 * runs incremental migrations via runMigrations() for ALTER TABLE changes.
 *
 * v1.4+: DB schema changes MUST use ALTER TABLE incremental migrations (MIG-01~06).
 * DB deletion and recreation is prohibited.
 *
 * v1.4.2: agents table renamed to wallets (v3 migration). DDL uses latest
 * names (wallets, wallet_id). pushSchema records LATEST_SCHEMA_VERSION so
 * migrations are only needed for existing (pre-v3) databases.
 *
 * @see docs/25-sqlite-schema.md
 * @see docs/65-migration-strategy.md
 */

import type { Database } from 'better-sqlite3';
import {
  WALLET_STATUSES,
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
// DDL statements for all 11 tables (latest schema: wallets + wallet_id + token_registry + settings)
// ---------------------------------------------------------------------------

/**
 * The latest schema version that getCreateTableStatements() represents.
 * pushSchema() records this version for fresh databases so migrations are skipped.
 * Increment this whenever DDL statements are updated to match a new migration.
 */
export const LATEST_SCHEMA_VERSION = 5;

function getCreateTableStatements(): string[] {
  return [
    // Table 1: wallets (renamed from agents in v3)
    `CREATE TABLE IF NOT EXISTS wallets (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  chain TEXT NOT NULL CHECK (chain IN (${inList(CHAIN_TYPES)})),
  network TEXT NOT NULL CHECK (network IN (${inList(NETWORK_TYPES)})),
  public_key TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'CREATING' CHECK (status IN (${inList(WALLET_STATUSES)})),
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
)`,

    // Table 3: transactions
    `CREATE TABLE IF NOT EXISTS transactions (
  id TEXT PRIMARY KEY,
  wallet_id TEXT NOT NULL REFERENCES wallets(id) ON DELETE RESTRICT,
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
  wallet_id TEXT REFERENCES wallets(id) ON DELETE CASCADE,
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
  wallet_id TEXT,
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
  wallet_id TEXT,
  channel TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN (${inList(NOTIFICATION_LOG_STATUSES)})),
  error TEXT,
  created_at INTEGER NOT NULL
)`,

    // Table 9: token_registry
    `CREATE TABLE IF NOT EXISTS token_registry (
  id TEXT PRIMARY KEY,
  network TEXT NOT NULL,
  address TEXT NOT NULL,
  symbol TEXT NOT NULL,
  name TEXT NOT NULL,
  decimals INTEGER NOT NULL,
  source TEXT NOT NULL DEFAULT 'custom' CHECK (source IN ('builtin', 'custom')),
  created_at INTEGER NOT NULL
)`,

    // Table 10: settings
    `CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  encrypted INTEGER NOT NULL DEFAULT 0 CHECK (encrypted IN (0, 1)),
  category TEXT NOT NULL,
  updated_at INTEGER NOT NULL
)`,

    // Table 11: schema_version
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
    // wallets indexes (renamed from agents in v3)
    'CREATE UNIQUE INDEX IF NOT EXISTS idx_wallets_public_key ON wallets(public_key)',
    'CREATE INDEX IF NOT EXISTS idx_wallets_status ON wallets(status)',
    'CREATE INDEX IF NOT EXISTS idx_wallets_chain_network ON wallets(chain, network)',
    'CREATE INDEX IF NOT EXISTS idx_wallets_owner_address ON wallets(owner_address)',

    // sessions indexes
    'CREATE INDEX IF NOT EXISTS idx_sessions_wallet_id ON sessions(wallet_id)',
    'CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at)',
    'CREATE INDEX IF NOT EXISTS idx_sessions_token_hash ON sessions(token_hash)',

    // transactions indexes
    'CREATE INDEX IF NOT EXISTS idx_transactions_wallet_status ON transactions(wallet_id, status)',
    'CREATE INDEX IF NOT EXISTS idx_transactions_session_id ON transactions(session_id)',
    'CREATE UNIQUE INDEX IF NOT EXISTS idx_transactions_tx_hash ON transactions(tx_hash)',
    'CREATE INDEX IF NOT EXISTS idx_transactions_queued_at ON transactions(queued_at)',
    'CREATE INDEX IF NOT EXISTS idx_transactions_created_at ON transactions(created_at)',
    'CREATE INDEX IF NOT EXISTS idx_transactions_type ON transactions(type)',
    'CREATE INDEX IF NOT EXISTS idx_transactions_contract_address ON transactions(contract_address)',
    'CREATE INDEX IF NOT EXISTS idx_transactions_parent_id ON transactions(parent_id)',

    // policies indexes
    'CREATE INDEX IF NOT EXISTS idx_policies_wallet_enabled ON policies(wallet_id, enabled)',
    'CREATE INDEX IF NOT EXISTS idx_policies_type ON policies(type)',

    // pending_approvals indexes
    'CREATE INDEX IF NOT EXISTS idx_pending_approvals_tx_id ON pending_approvals(tx_id)',
    'CREATE INDEX IF NOT EXISTS idx_pending_approvals_expires_at ON pending_approvals(expires_at)',

    // audit_log indexes
    'CREATE INDEX IF NOT EXISTS idx_audit_log_timestamp ON audit_log(timestamp)',
    'CREATE INDEX IF NOT EXISTS idx_audit_log_event_type ON audit_log(event_type)',
    'CREATE INDEX IF NOT EXISTS idx_audit_log_wallet_id ON audit_log(wallet_id)',
    'CREATE INDEX IF NOT EXISTS idx_audit_log_severity ON audit_log(severity)',
    'CREATE INDEX IF NOT EXISTS idx_audit_log_wallet_timestamp ON audit_log(wallet_id, timestamp)',

    // notification_logs indexes
    'CREATE INDEX IF NOT EXISTS idx_notification_logs_event_type ON notification_logs(event_type)',
    'CREATE INDEX IF NOT EXISTS idx_notification_logs_wallet_id ON notification_logs(wallet_id)',
    'CREATE INDEX IF NOT EXISTS idx_notification_logs_status ON notification_logs(status)',
    'CREATE INDEX IF NOT EXISTS idx_notification_logs_created_at ON notification_logs(created_at)',

    // token_registry indexes
    'CREATE UNIQUE INDEX IF NOT EXISTS idx_token_registry_network_address ON token_registry(network, address)',
    'CREATE INDEX IF NOT EXISTS idx_token_registry_network ON token_registry(network)',

    // settings indexes
    'CREATE INDEX IF NOT EXISTS idx_settings_category ON settings(category)',
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
  status TEXT NOT NULL DEFAULT 'CREATING' CHECK (status IN (${inList(WALLET_STATUSES)})),
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

// ---------------------------------------------------------------------------
// v3: Rename agents to wallets (table, FK columns, indexes, enum data)
// ---------------------------------------------------------------------------
// Renames agents table to wallets, agent_id columns to wallet_id in 5 tables,
// recreates all affected indexes, and updates AGENT_* enum data to WALLET_*.
// Requires PRAGMA foreign_keys=OFF for table recreation (managesOwnTransaction).

MIGRATIONS.push({
  version: 3,
  description: 'Rename agents to wallets (table, FK columns, indexes, enum data)',
  managesOwnTransaction: true,
  up: (sqlite) => {
    sqlite.exec('BEGIN');

    try {
      // Step 1: Rename agents table to wallets
      sqlite.exec('ALTER TABLE agents RENAME TO wallets');

      // Step 1b: Drop old agents indexes (ALTER TABLE RENAME doesn't rename indexes)
      sqlite.exec('DROP INDEX IF EXISTS idx_agents_public_key');
      sqlite.exec('DROP INDEX IF EXISTS idx_agents_status');
      sqlite.exec('DROP INDEX IF EXISTS idx_agents_chain_network');
      sqlite.exec('DROP INDEX IF EXISTS idx_agents_owner_address');

      // Step 2: Recreate sessions with wallet_id instead of agent_id
      sqlite.exec(`CREATE TABLE sessions_new (
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
      sqlite.exec(`INSERT INTO sessions_new (id, wallet_id, token_hash, expires_at, constraints, usage_stats, revoked_at, renewal_count, max_renewals, last_renewed_at, absolute_expires_at, created_at)
  SELECT id, agent_id, token_hash, expires_at, constraints, usage_stats, revoked_at, renewal_count, max_renewals, last_renewed_at, absolute_expires_at, created_at FROM sessions`);
      sqlite.exec('DROP TABLE sessions');
      sqlite.exec('ALTER TABLE sessions_new RENAME TO sessions');

      // Step 3: Recreate transactions with wallet_id instead of agent_id
      sqlite.exec(`CREATE TABLE transactions_new (
  id TEXT PRIMARY KEY,
  wallet_id TEXT NOT NULL REFERENCES wallets(id) ON DELETE RESTRICT,
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
  parent_id TEXT REFERENCES transactions_new(id) ON DELETE CASCADE,
  batch_index INTEGER,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN (${inList(TRANSACTION_STATUSES)})),
  tier TEXT CHECK (tier IS NULL OR tier IN (${inList(POLICY_TIERS)})),
  queued_at INTEGER,
  executed_at INTEGER,
  created_at INTEGER NOT NULL,
  reserved_amount TEXT,
  error TEXT,
  metadata TEXT
)`);
      sqlite.exec(`INSERT INTO transactions_new (id, wallet_id, session_id, chain, tx_hash, type, amount, to_address, token_mint, contract_address, method_signature, spender_address, approved_amount, parent_id, batch_index, status, tier, queued_at, executed_at, created_at, reserved_amount, error, metadata)
  SELECT id, agent_id, session_id, chain, tx_hash, type, amount, to_address, token_mint, contract_address, method_signature, spender_address, approved_amount, parent_id, batch_index, status, tier, queued_at, executed_at, created_at, reserved_amount, error, metadata FROM transactions`);
      sqlite.exec('DROP TABLE transactions');
      sqlite.exec('ALTER TABLE transactions_new RENAME TO transactions');

      // Step 4: Recreate policies with wallet_id instead of agent_id
      sqlite.exec(`CREATE TABLE policies_new (
  id TEXT PRIMARY KEY,
  wallet_id TEXT REFERENCES wallets(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN (${inList(POLICY_TYPES)})),
  rules TEXT NOT NULL,
  priority INTEGER NOT NULL DEFAULT 0,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
)`);
      sqlite.exec(`INSERT INTO policies_new (id, wallet_id, type, rules, priority, enabled, created_at, updated_at)
  SELECT id, agent_id, type, rules, priority, enabled, created_at, updated_at FROM policies`);
      sqlite.exec('DROP TABLE policies');
      sqlite.exec('ALTER TABLE policies_new RENAME TO policies');

      // Step 5: Recreate audit_log with wallet_id instead of agent_id (no FK constraint)
      sqlite.exec(`CREATE TABLE audit_log_new (
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
      sqlite.exec(`INSERT INTO audit_log_new (id, timestamp, event_type, actor, wallet_id, session_id, tx_id, details, severity, ip_address)
  SELECT id, timestamp, event_type, actor, agent_id, session_id, tx_id, details, severity, ip_address FROM audit_log`);
      sqlite.exec('DROP TABLE audit_log');
      sqlite.exec('ALTER TABLE audit_log_new RENAME TO audit_log');

      // Step 6: Recreate notification_logs with wallet_id instead of agent_id (no FK constraint)
      sqlite.exec(`CREATE TABLE notification_logs_new (
  id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  wallet_id TEXT,
  channel TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN (${inList(NOTIFICATION_LOG_STATUSES)})),
  error TEXT,
  created_at INTEGER NOT NULL
)`);
      sqlite.exec(`INSERT INTO notification_logs_new (id, event_type, wallet_id, channel, status, error, created_at)
  SELECT id, event_type, agent_id, channel, status, error, created_at FROM notification_logs`);
      sqlite.exec('DROP TABLE notification_logs');
      sqlite.exec('ALTER TABLE notification_logs_new RENAME TO notification_logs');

      // Step 7: Recreate all indexes with wallet naming
      // wallets table indexes
      sqlite.exec('CREATE UNIQUE INDEX idx_wallets_public_key ON wallets(public_key)');
      sqlite.exec('CREATE INDEX idx_wallets_status ON wallets(status)');
      sqlite.exec('CREATE INDEX idx_wallets_chain_network ON wallets(chain, network)');
      sqlite.exec('CREATE INDEX idx_wallets_owner_address ON wallets(owner_address)');

      // sessions indexes (all recreated because table was dropped/recreated)
      sqlite.exec('CREATE INDEX idx_sessions_wallet_id ON sessions(wallet_id)');
      sqlite.exec('CREATE INDEX idx_sessions_expires_at ON sessions(expires_at)');
      sqlite.exec('CREATE INDEX idx_sessions_token_hash ON sessions(token_hash)');

      // transactions indexes (all recreated because table was dropped/recreated)
      sqlite.exec('CREATE INDEX idx_transactions_wallet_status ON transactions(wallet_id, status)');
      sqlite.exec('CREATE INDEX idx_transactions_session_id ON transactions(session_id)');
      sqlite.exec('CREATE UNIQUE INDEX idx_transactions_tx_hash ON transactions(tx_hash)');
      sqlite.exec('CREATE INDEX idx_transactions_queued_at ON transactions(queued_at)');
      sqlite.exec('CREATE INDEX idx_transactions_created_at ON transactions(created_at)');
      sqlite.exec('CREATE INDEX idx_transactions_type ON transactions(type)');
      sqlite.exec('CREATE INDEX idx_transactions_contract_address ON transactions(contract_address)');
      sqlite.exec('CREATE INDEX idx_transactions_parent_id ON transactions(parent_id)');

      // policies indexes (all recreated because table was dropped/recreated)
      sqlite.exec('CREATE INDEX idx_policies_wallet_enabled ON policies(wallet_id, enabled)');
      sqlite.exec('CREATE INDEX idx_policies_type ON policies(type)');

      // audit_log indexes (all recreated because table was dropped/recreated)
      sqlite.exec('CREATE INDEX idx_audit_log_timestamp ON audit_log(timestamp)');
      sqlite.exec('CREATE INDEX idx_audit_log_event_type ON audit_log(event_type)');
      sqlite.exec('CREATE INDEX idx_audit_log_wallet_id ON audit_log(wallet_id)');
      sqlite.exec('CREATE INDEX idx_audit_log_severity ON audit_log(severity)');
      sqlite.exec('CREATE INDEX idx_audit_log_wallet_timestamp ON audit_log(wallet_id, timestamp)');

      // notification_logs indexes (all recreated because table was dropped/recreated)
      sqlite.exec('CREATE INDEX idx_notification_logs_event_type ON notification_logs(event_type)');
      sqlite.exec('CREATE INDEX idx_notification_logs_wallet_id ON notification_logs(wallet_id)');
      sqlite.exec('CREATE INDEX idx_notification_logs_status ON notification_logs(status)');
      sqlite.exec('CREATE INDEX idx_notification_logs_created_at ON notification_logs(created_at)');

      // Step 8: Update audit_log.event_type AGENT_* values to WALLET_*
      sqlite.exec("UPDATE audit_log SET event_type = 'WALLET_CREATED' WHERE event_type = 'AGENT_CREATED'");
      sqlite.exec("UPDATE audit_log SET event_type = 'WALLET_ACTIVATED' WHERE event_type = 'AGENT_ACTIVATED'");
      sqlite.exec("UPDATE audit_log SET event_type = 'WALLET_SUSPENDED' WHERE event_type = 'AGENT_SUSPENDED'");
      sqlite.exec("UPDATE audit_log SET event_type = 'WALLET_TERMINATED' WHERE event_type = 'AGENT_TERMINATED'");

      // Step 9: Update notification_logs.event_type AGENT_SUSPENDED to WALLET_SUSPENDED
      sqlite.exec("UPDATE notification_logs SET event_type = 'WALLET_SUSPENDED' WHERE event_type = 'AGENT_SUSPENDED'");

      sqlite.exec('COMMIT');
    } catch (err) {
      sqlite.exec('ROLLBACK');
      throw err;
    }

    // Re-enable FK and verify integrity
    sqlite.pragma('foreign_keys = ON');
    const fkErrors = sqlite.pragma('foreign_key_check') as unknown[];
    if (fkErrors.length > 0) {
      throw new Error(
        `FK integrity check failed after v3 migration: ${JSON.stringify(fkErrors)}`,
      );
    }
  },
});

// ---------------------------------------------------------------------------
// v4: Create token_registry table for EVM token management
// ---------------------------------------------------------------------------

MIGRATIONS.push({
  version: 4,
  description: 'Create token_registry table for EVM token management',
  up: (sqlite) => {
    sqlite.exec(`CREATE TABLE IF NOT EXISTS token_registry (
  id TEXT PRIMARY KEY,
  network TEXT NOT NULL,
  address TEXT NOT NULL,
  symbol TEXT NOT NULL,
  name TEXT NOT NULL,
  decimals INTEGER NOT NULL,
  source TEXT NOT NULL DEFAULT 'custom' CHECK (source IN ('builtin', 'custom')),
  created_at INTEGER NOT NULL
)`);
    sqlite.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_token_registry_network_address ON token_registry(network, address)');
    sqlite.exec('CREATE INDEX IF NOT EXISTS idx_token_registry_network ON token_registry(network)');
  },
});

// ---------------------------------------------------------------------------
// v5: Create settings table for operational config DB storage
// ---------------------------------------------------------------------------

MIGRATIONS.push({
  version: 5,
  description: 'Create settings table for operational config DB storage',
  up: (sqlite) => {
    sqlite.exec(`CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  encrypted INTEGER NOT NULL DEFAULT 0 CHECK (encrypted IN (0, 1)),
  category TEXT NOT NULL,
  updated_at INTEGER NOT NULL
)`);
    sqlite.exec('CREATE INDEX IF NOT EXISTS idx_settings_category ON settings(category)');
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

    // Record schema version 1 if not already recorded (for existing DBs that only had v1)
    const existing = sqlite
      .prepare('SELECT version FROM schema_version WHERE version = 1')
      .get() as { version: number } | undefined;
    if (!existing) {
      // Fresh DB: record all versions up to LATEST_SCHEMA_VERSION so migrations are skipped.
      // The DDL above already represents the latest schema state.
      const ts = Math.floor(Date.now() / 1000);
      sqlite
        .prepare(
          'INSERT INTO schema_version (version, applied_at, description) VALUES (?, ?, ?)',
        )
        .run(1, ts, 'Initial schema (11 tables)');

      // Record all migration versions as already applied (DDL is up-to-date)
      for (const migration of MIGRATIONS) {
        sqlite
          .prepare(
            'INSERT OR IGNORE INTO schema_version (version, applied_at, description) VALUES (?, ?, ?)',
          )
          .run(migration.version, ts, `${migration.description} (via pushSchema)`);
      }
    }

    sqlite.exec('COMMIT');
  } catch (err) {
    sqlite.exec('ROLLBACK');
    throw err;
  }

  // Run incremental migrations for existing DBs (fresh DBs have all versions recorded)
  runMigrations(sqlite);
}
