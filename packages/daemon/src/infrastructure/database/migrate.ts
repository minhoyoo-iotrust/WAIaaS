/**
 * Schema push + incremental migration runner for daemon SQLite database.
 *
 * Creates all 18 tables with indexes, foreign keys, and CHECK constraints
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
 * v1.4.6: Environment model migration:
 *   v6a (version 6): Add network column to transactions with backfill from wallets
 *   v6b (version 7): Replace wallets.network with environment + default_network (12-step)
 *   v8  (version 8): Add network column to policies (12-step)
 *
 * @see docs/25-sqlite-schema.md
 * @see docs/65-migration-strategy.md
 * @see docs/69-db-migration-v6-design.md
 * @see docs/71-policy-engine-network-extension-design.md
 */

import type { Database } from 'better-sqlite3';
import {
  WALLET_STATUSES,
  CHAIN_TYPES,
  NETWORK_TYPES,
  ENVIRONMENT_TYPES,
  TRANSACTION_STATUSES,
  TRANSACTION_TYPES,
  POLICY_TYPES,
  POLICY_TIERS,
  NOTIFICATION_LOG_STATUSES,
  INCOMING_TX_STATUSES,
} from '@waiaas/core';

// ---------------------------------------------------------------------------
// Utility: build CHECK IN clause from SSoT arrays
// ---------------------------------------------------------------------------

const inList = (values: readonly string[]) => values.map((v) => `'${v}'`).join(', ');

// ---------------------------------------------------------------------------
// DDL statements for all 18 tables (latest schema: wallets + wallet_id + session_wallets + token_registry + settings + api_keys + telegram_users + wc_sessions + wc_store + incoming_transactions + incoming_tx_cursors)
// ---------------------------------------------------------------------------

/**
 * The latest schema version that getCreateTableStatements() represents.
 * pushSchema() records this version for fresh databases so migrations are skipped.
 * Increment this whenever DDL statements are updated to match a new migration.
 */
export const LATEST_SCHEMA_VERSION = 21;

function getCreateTableStatements(): string[] {
  return [
    // Table 1: wallets (renamed from agents in v3, environment model in v6b, owner_approval_method in v18)
    `CREATE TABLE IF NOT EXISTS wallets (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  chain TEXT NOT NULL CHECK (chain IN (${inList(CHAIN_TYPES)})),
  environment TEXT NOT NULL CHECK (environment IN (${inList(ENVIRONMENT_TYPES)})),
  default_network TEXT CHECK (default_network IS NULL OR default_network IN (${inList(NETWORK_TYPES)})),
  public_key TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'CREATING' CHECK (status IN (${inList(WALLET_STATUSES)})),
  owner_address TEXT,
  owner_verified INTEGER NOT NULL DEFAULT 0 CHECK (owner_verified IN (0, 1)),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  suspended_at INTEGER,
  suspension_reason TEXT,
  monitor_incoming INTEGER NOT NULL DEFAULT 0,
  owner_approval_method TEXT CHECK (owner_approval_method IS NULL OR owner_approval_method IN ('sdk_ntfy', 'sdk_telegram', 'walletconnect', 'telegram_bot', 'rest'))
)`,

    // Table 2: sessions (v26.4: wallet_id removed, v26.5: token_issued_count added)
    `CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  constraints TEXT,
  usage_stats TEXT,
  revoked_at INTEGER,
  renewal_count INTEGER NOT NULL DEFAULT 0,
  max_renewals INTEGER NOT NULL DEFAULT 30,
  last_renewed_at INTEGER,
  absolute_expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  source TEXT NOT NULL DEFAULT 'api',
  token_issued_count INTEGER NOT NULL DEFAULT 1
)`,

    // Table 2b: session_wallets (v26.4: session-wallet junction for 1:N model)
    `CREATE TABLE IF NOT EXISTS session_wallets (
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  wallet_id TEXT NOT NULL REFERENCES wallets(id) ON DELETE CASCADE,
  is_default INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (session_id, wallet_id)
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
  amount_usd REAL,
  reserved_amount_usd REAL,
  error TEXT,
  metadata TEXT,
  network TEXT CHECK (network IS NULL OR network IN (${inList(NETWORK_TYPES)}))
)`,

    // Table 4: policies (network column added in v8)
    `CREATE TABLE IF NOT EXISTS policies (
  id TEXT PRIMARY KEY,
  wallet_id TEXT REFERENCES wallets(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN (${inList(POLICY_TYPES)})),
  rules TEXT NOT NULL,
  priority INTEGER NOT NULL DEFAULT 0,
  enabled INTEGER NOT NULL DEFAULT 1,
  network TEXT CHECK (network IS NULL OR network IN (${inList(NETWORK_TYPES)})),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
)`,

    // Table 5: pending_approvals (approval_channel added in v16)
    `CREATE TABLE IF NOT EXISTS pending_approvals (
  id TEXT PRIMARY KEY,
  tx_id TEXT NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
  required_by INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  approved_at INTEGER,
  rejected_at INTEGER,
  owner_signature TEXT,
  approval_channel TEXT DEFAULT 'rest_api',
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
  message TEXT,
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

    // Table 11: api_keys (Action Provider API key encrypted storage, v1.5)
    `CREATE TABLE IF NOT EXISTS api_keys (
  provider_name TEXT PRIMARY KEY,
  encrypted_key TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
)`,

    // Table 12: schema_version
    `CREATE TABLE IF NOT EXISTS schema_version (
  version INTEGER PRIMARY KEY,
  applied_at INTEGER NOT NULL,
  description TEXT NOT NULL
)`,

    // Table 13: telegram_users (Telegram Bot user management, v1.6)
    `CREATE TABLE IF NOT EXISTS telegram_users (
  chat_id INTEGER PRIMARY KEY,
  username TEXT,
  role TEXT NOT NULL DEFAULT 'PENDING' CHECK (role IN ('PENDING', 'ADMIN', 'READONLY')),
  registered_at INTEGER NOT NULL,
  approved_at INTEGER
)`,

    // Table 14: wc_sessions (WalletConnect session metadata, v1.6.1)
    `CREATE TABLE IF NOT EXISTS wc_sessions (
  wallet_id TEXT PRIMARY KEY REFERENCES wallets(id) ON DELETE CASCADE,
  topic TEXT NOT NULL UNIQUE,
  peer_meta TEXT,
  chain_id TEXT NOT NULL,
  owner_address TEXT NOT NULL,
  namespaces TEXT,
  expiry INTEGER NOT NULL,
  created_at INTEGER NOT NULL
)`,

    // Table 15: wc_store (WalletConnect IKeyValueStorage, v1.6.1)
    `CREATE TABLE IF NOT EXISTS wc_store (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
)`,

    // Table 16: incoming_transactions (detected incoming transfers to monitored wallets, v27.1)
    `CREATE TABLE IF NOT EXISTS incoming_transactions (
  id TEXT PRIMARY KEY,
  tx_hash TEXT NOT NULL,
  wallet_id TEXT NOT NULL REFERENCES wallets(id) ON DELETE CASCADE,
  from_address TEXT NOT NULL,
  amount TEXT NOT NULL,
  token_address TEXT,
  chain TEXT NOT NULL CHECK (chain IN (${inList(CHAIN_TYPES)})),
  network TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'DETECTED' CHECK (status IN (${inList(INCOMING_TX_STATUSES)})),
  block_number INTEGER,
  detected_at INTEGER NOT NULL,
  confirmed_at INTEGER,
  is_suspicious INTEGER NOT NULL DEFAULT 0,
  UNIQUE(tx_hash, wallet_id)
)`,

    // Table 17: incoming_tx_cursors (per-wallet cursor for gap recovery, v27.1)
    `CREATE TABLE IF NOT EXISTS incoming_tx_cursors (
  wallet_id TEXT PRIMARY KEY REFERENCES wallets(id) ON DELETE CASCADE,
  chain TEXT NOT NULL,
  network TEXT NOT NULL,
  last_signature TEXT,
  last_block_number INTEGER,
  updated_at INTEGER NOT NULL
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
    'CREATE INDEX IF NOT EXISTS idx_wallets_chain_environment ON wallets(chain, environment)',
    'CREATE INDEX IF NOT EXISTS idx_wallets_owner_address ON wallets(owner_address)',

    // sessions indexes (v26.4: idx_sessions_wallet_id removed, wallet_id moved to session_wallets)
    'CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at)',
    'CREATE INDEX IF NOT EXISTS idx_sessions_token_hash ON sessions(token_hash)',

    // session_wallets indexes (v26.4)
    'CREATE INDEX IF NOT EXISTS idx_session_wallets_session ON session_wallets(session_id)',
    'CREATE INDEX IF NOT EXISTS idx_session_wallets_wallet ON session_wallets(wallet_id)',

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
    'CREATE INDEX IF NOT EXISTS idx_policies_network ON policies(network)',

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

    // telegram_users indexes
    'CREATE INDEX IF NOT EXISTS idx_telegram_users_role ON telegram_users(role)',

    // wc_sessions indexes
    'CREATE INDEX IF NOT EXISTS idx_wc_sessions_topic ON wc_sessions(topic)',

    // incoming_transactions indexes
    'CREATE INDEX IF NOT EXISTS idx_incoming_tx_wallet_detected ON incoming_transactions(wallet_id, detected_at DESC)',
    'CREATE INDEX IF NOT EXISTS idx_incoming_tx_detected_at ON incoming_transactions(detected_at)',
    'CREATE INDEX IF NOT EXISTS idx_incoming_tx_chain_network ON incoming_transactions(chain, network)',
    "CREATE INDEX IF NOT EXISTS idx_incoming_tx_status ON incoming_transactions(status) WHERE status = 'DETECTED'",
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

// ---------------------------------------------------------------------------
// v6a: Add network column to transactions with backfill from wallets
// ---------------------------------------------------------------------------
// Standard migration (managesOwnTransaction: false). Adds nullable network
// column to transactions and backfills from wallets.network via FK relationship.
// Must run BEFORE v6b which removes wallets.network.

MIGRATIONS.push({
  version: 6,
  description: 'Add network column to transactions with backfill from wallets',
  managesOwnTransaction: false,
  up: (sqlite) => {
    // SQL 1: Add nullable network column
    sqlite.exec('ALTER TABLE transactions ADD COLUMN network TEXT');

    // SQL 2: Backfill from wallets.network via FK relationship
    sqlite.exec(`UPDATE transactions SET network = (
      SELECT w.network FROM wallets w WHERE w.id = transactions.wallet_id
    )`);
  },
});

// ---------------------------------------------------------------------------
// v6b: Replace wallets.network with environment + default_network (12-step)
// ---------------------------------------------------------------------------
// 12-step table recreation. Converts wallets.network to environment + default_network.
// Recreates FK dependent tables (sessions, transactions, policies, audit_log).
// Requires PRAGMA foreign_keys=OFF (handled by managesOwnTransaction).
// @see docs/69-db-migration-v6-design.md section 3

MIGRATIONS.push({
  version: 7,
  description: 'Replace wallets.network with environment + default_network (12-step recreation)',
  managesOwnTransaction: true,
  up: (sqlite) => {
    // Step 1: Begin transaction
    sqlite.exec('BEGIN');

    try {
      // Step 2: Create wallets_new with environment + default_network
      sqlite.exec(`CREATE TABLE wallets_new (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  chain TEXT NOT NULL CHECK (chain IN (${inList(CHAIN_TYPES)})),
  environment TEXT NOT NULL CHECK (environment IN (${inList(ENVIRONMENT_TYPES)})),
  default_network TEXT CHECK (default_network IS NULL OR default_network IN (${inList(NETWORK_TYPES)})),
  public_key TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'CREATING' CHECK (status IN (${inList(WALLET_STATUSES)})),
  owner_address TEXT,
  owner_verified INTEGER NOT NULL DEFAULT 0 CHECK (owner_verified IN (0, 1)),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  suspended_at INTEGER,
  suspension_reason TEXT
)`);

      // Step 3: Data transformation INSERT with 13 CASE WHEN branches
      // Maps network -> environment using deriveEnvironment() logic (docs/68 section 3.3)
      // Preserves original network as default_network
      sqlite.exec(`INSERT INTO wallets_new (
  id, name, chain, environment, default_network,
  public_key, status, owner_address, owner_verified,
  created_at, updated_at, suspended_at, suspension_reason
)
SELECT
  id, name, chain,
  CASE
    WHEN network = 'mainnet' THEN 'mainnet'
    WHEN network = 'devnet' THEN 'testnet'
    WHEN network = 'testnet' THEN 'testnet'
    WHEN network = 'ethereum-mainnet' THEN 'mainnet'
    WHEN network = 'polygon-mainnet' THEN 'mainnet'
    WHEN network = 'arbitrum-mainnet' THEN 'mainnet'
    WHEN network = 'optimism-mainnet' THEN 'mainnet'
    WHEN network = 'base-mainnet' THEN 'mainnet'
    WHEN network = 'ethereum-sepolia' THEN 'testnet'
    WHEN network = 'polygon-amoy' THEN 'testnet'
    WHEN network = 'arbitrum-sepolia' THEN 'testnet'
    WHEN network = 'optimism-sepolia' THEN 'testnet'
    WHEN network = 'base-sepolia' THEN 'testnet'
    ELSE 'testnet'
  END AS environment,
  network AS default_network,
  public_key, status, owner_address, owner_verified,
  created_at, updated_at, suspended_at, suspension_reason
FROM wallets`);

      // Step 4: Drop old wallets table
      sqlite.exec('DROP TABLE wallets');

      // Step 5: Rename new table
      sqlite.exec('ALTER TABLE wallets_new RENAME TO wallets');

      // Step 6: Recreate wallets indexes
      sqlite.exec('DROP INDEX IF EXISTS idx_wallets_chain_network');
      sqlite.exec('CREATE UNIQUE INDEX idx_wallets_public_key ON wallets(public_key)');
      sqlite.exec('CREATE INDEX idx_wallets_status ON wallets(status)');
      sqlite.exec('CREATE INDEX idx_wallets_chain_environment ON wallets(chain, environment)');
      sqlite.exec('CREATE INDEX idx_wallets_owner_address ON wallets(owner_address)');

      // Step 7: Recreate sessions (FK reconnection, no schema change)
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
  SELECT id, wallet_id, token_hash, expires_at, constraints, usage_stats, revoked_at, renewal_count, max_renewals, last_renewed_at, absolute_expires_at, created_at FROM sessions`);
      sqlite.exec('DROP TABLE sessions');
      sqlite.exec('ALTER TABLE sessions_new RENAME TO sessions');
      sqlite.exec('CREATE INDEX idx_sessions_wallet_id ON sessions(wallet_id)');
      sqlite.exec('CREATE INDEX idx_sessions_expires_at ON sessions(expires_at)');
      sqlite.exec('CREATE INDEX idx_sessions_token_hash ON sessions(token_hash)');

      // Step 8: Recreate transactions (network column with CHECK, FK reconnection)
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
  metadata TEXT,
  network TEXT CHECK (network IS NULL OR network IN (${inList(NETWORK_TYPES)}))
)`);
      sqlite.exec(`INSERT INTO transactions_new (id, wallet_id, session_id, chain, tx_hash, type, amount, to_address, token_mint, contract_address, method_signature, spender_address, approved_amount, parent_id, batch_index, status, tier, queued_at, executed_at, created_at, reserved_amount, error, metadata, network)
  SELECT id, wallet_id, session_id, chain, tx_hash, type, amount, to_address, token_mint, contract_address, method_signature, spender_address, approved_amount, parent_id, batch_index, status, tier, queued_at, executed_at, created_at, reserved_amount, error, metadata, network FROM transactions`);
      sqlite.exec('DROP TABLE transactions');
      sqlite.exec('ALTER TABLE transactions_new RENAME TO transactions');
      sqlite.exec('CREATE INDEX idx_transactions_wallet_status ON transactions(wallet_id, status)');
      sqlite.exec('CREATE INDEX idx_transactions_session_id ON transactions(session_id)');
      sqlite.exec('CREATE UNIQUE INDEX idx_transactions_tx_hash ON transactions(tx_hash)');
      sqlite.exec('CREATE INDEX idx_transactions_queued_at ON transactions(queued_at)');
      sqlite.exec('CREATE INDEX idx_transactions_created_at ON transactions(created_at)');
      sqlite.exec('CREATE INDEX idx_transactions_type ON transactions(type)');
      sqlite.exec('CREATE INDEX idx_transactions_contract_address ON transactions(contract_address)');
      sqlite.exec('CREATE INDEX idx_transactions_parent_id ON transactions(parent_id)');

      // Step 9: Recreate policies (FK reconnection, no schema change -- v8 adds network)
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
  SELECT id, wallet_id, type, rules, priority, enabled, created_at, updated_at FROM policies`);
      sqlite.exec('DROP TABLE policies');
      sqlite.exec('ALTER TABLE policies_new RENAME TO policies');
      sqlite.exec('CREATE INDEX idx_policies_wallet_enabled ON policies(wallet_id, enabled)');
      sqlite.exec('CREATE INDEX idx_policies_type ON policies(type)');

      // Step 10: Recreate audit_log (consistency with v3 pattern)
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
  SELECT id, timestamp, event_type, actor, wallet_id, session_id, tx_id, details, severity, ip_address FROM audit_log`);
      sqlite.exec('DROP TABLE audit_log');
      sqlite.exec('ALTER TABLE audit_log_new RENAME TO audit_log');
      sqlite.exec('CREATE INDEX idx_audit_log_timestamp ON audit_log(timestamp)');
      sqlite.exec('CREATE INDEX idx_audit_log_event_type ON audit_log(event_type)');
      sqlite.exec('CREATE INDEX idx_audit_log_wallet_id ON audit_log(wallet_id)');
      sqlite.exec('CREATE INDEX idx_audit_log_severity ON audit_log(severity)');
      sqlite.exec('CREATE INDEX idx_audit_log_wallet_timestamp ON audit_log(wallet_id, timestamp)');

      // Step 11: Commit transaction
      sqlite.exec('COMMIT');
    } catch (err) {
      sqlite.exec('ROLLBACK');
      throw err;
    }

    // Step 12: Re-enable foreign keys and verify integrity
    sqlite.pragma('foreign_keys = ON');
    const fkErrors = sqlite.pragma('foreign_key_check') as unknown[];
    if (fkErrors.length > 0) {
      throw new Error(`FK integrity violation after v6b: ${JSON.stringify(fkErrors)}`);
    }
  },
});

// ---------------------------------------------------------------------------
// v8: Add network column to policies (12-step recreation)
// ---------------------------------------------------------------------------
// Adds nullable network column and updates type CHECK to include ALLOWED_NETWORKS.
// Requires 12-step recreation because SQLite cannot ALTER CHECK constraints.
// @see docs/71-policy-engine-network-extension-design.md section 6

MIGRATIONS.push({
  version: 8,
  description: 'Add network column to policies and ALLOWED_NETWORKS type support',
  managesOwnTransaction: true,
  up: (sqlite) => {
    // Step 1: Begin transaction
    sqlite.exec('BEGIN');

    try {
      // Step 2: Create policies_new with network column + updated CHECK
      sqlite.exec(`CREATE TABLE policies_new (
  id TEXT PRIMARY KEY,
  wallet_id TEXT REFERENCES wallets(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN (${inList(POLICY_TYPES)})),
  rules TEXT NOT NULL,
  priority INTEGER NOT NULL DEFAULT 0,
  enabled INTEGER NOT NULL DEFAULT 1,
  network TEXT CHECK (network IS NULL OR network IN (${inList(NETWORK_TYPES)})),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
)`);

      // Step 3: Copy existing policies with network=NULL
      sqlite.exec(`INSERT INTO policies_new (
  id, wallet_id, type, rules, priority, enabled, network, created_at, updated_at
)
SELECT
  id, wallet_id, type, rules, priority, enabled, NULL, created_at, updated_at
FROM policies`);

      // Step 4: Drop old table
      sqlite.exec('DROP TABLE policies');

      // Step 5: Rename new table
      sqlite.exec('ALTER TABLE policies_new RENAME TO policies');

      // Step 6: Recreate existing indexes
      sqlite.exec('CREATE INDEX idx_policies_wallet_enabled ON policies(wallet_id, enabled)');
      sqlite.exec('CREATE INDEX idx_policies_type ON policies(type)');

      // Step 7: Create new network index
      sqlite.exec('CREATE INDEX idx_policies_network ON policies(network)');

      // Step 8: Commit
      sqlite.exec('COMMIT');
    } catch (err) {
      sqlite.exec('ROLLBACK');
      throw err;
    }

    // Step 9: Re-enable foreign keys and verify integrity
    sqlite.pragma('foreign_keys = ON');
    const fkErrors = sqlite.pragma('foreign_key_check') as unknown[];
    if (fkErrors.length > 0) {
      throw new Error(`FK integrity violation after v8: ${JSON.stringify(fkErrors)}`);
    }
  },
});

// ---------------------------------------------------------------------------
// v9: Add SIGNED status and SIGN type to transactions CHECK constraints
// ---------------------------------------------------------------------------
// SSoT arrays TRANSACTION_STATUSES/TRANSACTION_TYPES에 새 값이 추가되었으므로
// transactions 테이블의 CHECK 제약을 갱신해야 한다. SQLite는 ALTER CHECK 불가 -> 12-step 재생성.
// 이 마이그레이션은 transactions 테이블만 재생성한다 (다른 테이블에 영향 없음).

MIGRATIONS.push({
  version: 9,
  description: 'Add SIGNED status and SIGN type to transactions CHECK constraints',
  managesOwnTransaction: true,
  up: (sqlite) => {
    // Step 1: Begin transaction
    sqlite.exec('BEGIN');

    try {
      // Step 2: Create transactions_new with updated CHECK constraints
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
  metadata TEXT,
  network TEXT CHECK (network IS NULL OR network IN (${inList(NETWORK_TYPES)}))
)`);

      // Step 3: Copy existing data
      sqlite.exec(`INSERT INTO transactions_new (id, wallet_id, session_id, chain, tx_hash, type, amount, to_address, token_mint, contract_address, method_signature, spender_address, approved_amount, parent_id, batch_index, status, tier, queued_at, executed_at, created_at, reserved_amount, error, metadata, network)
  SELECT id, wallet_id, session_id, chain, tx_hash, type, amount, to_address, token_mint, contract_address, method_signature, spender_address, approved_amount, parent_id, batch_index, status, tier, queued_at, executed_at, created_at, reserved_amount, error, metadata, network FROM transactions`);

      // Step 4: Drop old table
      sqlite.exec('DROP TABLE transactions');

      // Step 5: Rename new table
      sqlite.exec('ALTER TABLE transactions_new RENAME TO transactions');

      // Step 6: Recreate all 8 existing indexes
      sqlite.exec('CREATE INDEX idx_transactions_wallet_status ON transactions(wallet_id, status)');
      sqlite.exec('CREATE INDEX idx_transactions_session_id ON transactions(session_id)');
      sqlite.exec('CREATE UNIQUE INDEX idx_transactions_tx_hash ON transactions(tx_hash)');
      sqlite.exec('CREATE INDEX idx_transactions_queued_at ON transactions(queued_at)');
      sqlite.exec('CREATE INDEX idx_transactions_created_at ON transactions(created_at)');
      sqlite.exec('CREATE INDEX idx_transactions_type ON transactions(type)');
      sqlite.exec('CREATE INDEX idx_transactions_contract_address ON transactions(contract_address)');
      sqlite.exec('CREATE INDEX idx_transactions_parent_id ON transactions(parent_id)');

      // Step 7: Commit
      sqlite.exec('COMMIT');
    } catch (err) {
      sqlite.exec('ROLLBACK');
      throw err;
    }

    // Step 8: Re-enable foreign keys and verify integrity
    sqlite.pragma('foreign_keys = ON');
    const fkErrors = sqlite.pragma('foreign_key_check') as unknown[];
    if (fkErrors.length > 0) {
      throw new Error(`FK integrity violation after v9: ${JSON.stringify(fkErrors)}`);
    }
  },
});

// ---------------------------------------------------------------------------
// v10: Add message column to notification_logs
// ---------------------------------------------------------------------------
// Simple ALTER TABLE ADD COLUMN -- no CHECK constraint changes, no table recreation needed.

MIGRATIONS.push({
  version: 10,
  description: 'Add message column to notification_logs',
  up: (sqlite) => {
    sqlite.exec('ALTER TABLE notification_logs ADD COLUMN message TEXT');
  },
});

// ---------------------------------------------------------------------------
// v11: Create api_keys table for Action Provider API key storage
// ---------------------------------------------------------------------------

MIGRATIONS.push({
  version: 11,
  description: 'Add api_keys table for Action Provider API key storage',
  up: (sqlite) => {
    sqlite.exec(`CREATE TABLE IF NOT EXISTS api_keys (
  provider_name TEXT PRIMARY KEY,
  encrypted_key TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
)`);
  },
});

// ---------------------------------------------------------------------------
// v12: Add X402_PAYMENT to transactions and X402_ALLOWED_DOMAINS to policies CHECK constraints
// ---------------------------------------------------------------------------
// x402 결제 지원을 위해 transactions.type에 X402_PAYMENT,
// policies.type에 X402_ALLOWED_DOMAINS가 CHECK 제약에 포함되어야 한다.
// SQLite는 ALTER CHECK 불가 -> transactions와 policies 모두 12-step 재생성.

MIGRATIONS.push({
  version: 12,
  description:
    'Add X402_PAYMENT to transactions and X402_ALLOWED_DOMAINS to policies CHECK constraints',
  managesOwnTransaction: true,
  up: (sqlite) => {
    sqlite.exec('BEGIN');

    try {
      // ── Part 1: transactions 테이블 재생성 ──
      // v9과 동일 DDL. TRANSACTION_TYPES SSoT에 X402_PAYMENT이 이미 포함됨.
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
  metadata TEXT,
  network TEXT CHECK (network IS NULL OR network IN (${inList(NETWORK_TYPES)}))
)`);

      sqlite.exec(`INSERT INTO transactions_new (id, wallet_id, session_id, chain, tx_hash, type, amount, to_address, token_mint, contract_address, method_signature, spender_address, approved_amount, parent_id, batch_index, status, tier, queued_at, executed_at, created_at, reserved_amount, error, metadata, network)
  SELECT id, wallet_id, session_id, chain, tx_hash, type, amount, to_address, token_mint, contract_address, method_signature, spender_address, approved_amount, parent_id, batch_index, status, tier, queued_at, executed_at, created_at, reserved_amount, error, metadata, network FROM transactions`);

      sqlite.exec('DROP TABLE transactions');
      sqlite.exec('ALTER TABLE transactions_new RENAME TO transactions');

      // Recreate all 8 indexes (same as v9)
      sqlite.exec(
        'CREATE INDEX idx_transactions_wallet_status ON transactions(wallet_id, status)',
      );
      sqlite.exec(
        'CREATE INDEX idx_transactions_session_id ON transactions(session_id)',
      );
      sqlite.exec(
        'CREATE UNIQUE INDEX idx_transactions_tx_hash ON transactions(tx_hash)',
      );
      sqlite.exec(
        'CREATE INDEX idx_transactions_queued_at ON transactions(queued_at)',
      );
      sqlite.exec(
        'CREATE INDEX idx_transactions_created_at ON transactions(created_at)',
      );
      sqlite.exec(
        'CREATE INDEX idx_transactions_type ON transactions(type)',
      );
      sqlite.exec(
        'CREATE INDEX idx_transactions_contract_address ON transactions(contract_address)',
      );
      sqlite.exec(
        'CREATE INDEX idx_transactions_parent_id ON transactions(parent_id)',
      );

      // ── Part 2: policies 테이블 재생성 ──
      // v8과 동일 DDL. POLICY_TYPES SSoT에 X402_ALLOWED_DOMAINS가 이미 포함됨.
      sqlite.exec(`CREATE TABLE policies_new (
  id TEXT PRIMARY KEY,
  wallet_id TEXT REFERENCES wallets(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN (${inList(POLICY_TYPES)})),
  rules TEXT NOT NULL,
  priority INTEGER NOT NULL DEFAULT 0,
  enabled INTEGER NOT NULL DEFAULT 1,
  network TEXT CHECK (network IS NULL OR network IN (${inList(NETWORK_TYPES)})),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
)`);

      sqlite.exec(`INSERT INTO policies_new (id, wallet_id, type, rules, priority, enabled, network, created_at, updated_at)
  SELECT id, wallet_id, type, rules, priority, enabled, network, created_at, updated_at FROM policies`);

      sqlite.exec('DROP TABLE policies');
      sqlite.exec('ALTER TABLE policies_new RENAME TO policies');

      // Recreate 3 indexes (same as v8)
      sqlite.exec(
        'CREATE INDEX idx_policies_wallet_enabled ON policies(wallet_id, enabled)',
      );
      sqlite.exec('CREATE INDEX idx_policies_type ON policies(type)');
      sqlite.exec('CREATE INDEX idx_policies_network ON policies(network)');

      sqlite.exec('COMMIT');
    } catch (err) {
      sqlite.exec('ROLLBACK');
      throw err;
    }

    // Re-enable foreign keys and verify integrity
    sqlite.pragma('foreign_keys = ON');
    const fkErrors = sqlite.pragma('foreign_key_check') as unknown[];
    if (fkErrors.length > 0) {
      throw new Error(
        `FK integrity violation after v12: ${JSON.stringify(fkErrors)}`,
      );
    }
  },
});

// ---------------------------------------------------------------------------
// v13: Add amount_usd and reserved_amount_usd columns to transactions
// ---------------------------------------------------------------------------
// Simple ALTER TABLE ADD COLUMN -- no CHECK constraint changes, no table recreation needed.
// These nullable REAL columns store USD-denominated amounts for cumulative spending limit evaluation.
// amount_usd: confirmed USD amount (persists after CONFIRMED), reserved_amount_usd: cleared on release.

MIGRATIONS.push({
  version: 13,
  description: 'Add amount_usd and reserved_amount_usd columns to transactions',
  up: (sqlite) => {
    sqlite.exec('ALTER TABLE transactions ADD COLUMN amount_usd REAL');
    sqlite.exec('ALTER TABLE transactions ADD COLUMN reserved_amount_usd REAL');
  },
});

// ---------------------------------------------------------------------------
// v14: Migrate kill_switch_state values: NORMAL->ACTIVE, ACTIVATED->SUSPENDED
// ---------------------------------------------------------------------------
// Kill Switch 3-state machine migration.
// Old 2-state values (NORMAL, ACTIVATED, RECOVERING) are converted to
// new 3-state values (ACTIVE, SUSPENDED, LOCKED).
// Simple UPDATE on key_value_store -- no schema changes, no table recreation.

MIGRATIONS.push({
  version: 14,
  description:
    'Migrate kill_switch_state values: NORMAL->ACTIVE, ACTIVATED->SUSPENDED',
  up: (sqlite) => {
    const now = Math.floor(Date.now() / 1000);

    // NORMAL -> ACTIVE
    sqlite
      .prepare(
        "UPDATE key_value_store SET value = 'ACTIVE', updated_at = ? WHERE key = 'kill_switch_state' AND value = 'NORMAL'",
      )
      .run(now);

    // ACTIVATED -> SUSPENDED
    sqlite
      .prepare(
        "UPDATE key_value_store SET value = 'SUSPENDED', updated_at = ? WHERE key = 'kill_switch_state' AND value = 'ACTIVATED'",
      )
      .run(now);

    // RECOVERING -> ACTIVE (v0.10 design removed RECOVERING state)
    sqlite
      .prepare(
        "UPDATE key_value_store SET value = 'ACTIVE', updated_at = ? WHERE key = 'kill_switch_state' AND value = 'RECOVERING'",
      )
      .run(now);
  },
});

// ---------------------------------------------------------------------------
// v15: Create telegram_users table for Telegram Bot user management
// ---------------------------------------------------------------------------

MIGRATIONS.push({
  version: 15,
  description: 'Create telegram_users table for Telegram Bot user management',
  up: (sqlite) => {
    sqlite.exec(`CREATE TABLE IF NOT EXISTS telegram_users (
  chat_id INTEGER PRIMARY KEY,
  username TEXT,
  role TEXT NOT NULL DEFAULT 'PENDING' CHECK (role IN ('PENDING', 'ADMIN', 'READONLY')),
  registered_at INTEGER NOT NULL,
  approved_at INTEGER
)`);
    sqlite.exec('CREATE INDEX IF NOT EXISTS idx_telegram_users_role ON telegram_users(role)');
  },
});

// ---------------------------------------------------------------------------
// v16: Add WC infra: wc_sessions table, wc_store table, pending_approvals.approval_channel
// ---------------------------------------------------------------------------

MIGRATIONS.push({
  version: 16,
  description:
    'Add WC infra: wc_sessions table, wc_store table, pending_approvals.approval_channel',
  up: (sqlite) => {
    // 1. pending_approvals.approval_channel 추가
    sqlite.exec(
      "ALTER TABLE pending_approvals ADD COLUMN approval_channel TEXT DEFAULT 'rest_api'",
    );

    // 2. wc_sessions 테이블 생성
    sqlite.exec(`CREATE TABLE IF NOT EXISTS wc_sessions (
  wallet_id TEXT PRIMARY KEY REFERENCES wallets(id) ON DELETE CASCADE,
  topic TEXT NOT NULL UNIQUE,
  peer_meta TEXT,
  chain_id TEXT NOT NULL,
  owner_address TEXT NOT NULL,
  namespaces TEXT,
  expiry INTEGER NOT NULL,
  created_at INTEGER NOT NULL
)`);
    sqlite.exec(
      'CREATE INDEX IF NOT EXISTS idx_wc_sessions_topic ON wc_sessions(topic)',
    );

    // 3. wc_store 테이블 생성 (IKeyValueStorage용)
    sqlite.exec(`CREATE TABLE IF NOT EXISTS wc_store (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
)`);
  },
});

// ---------------------------------------------------------------------------
// Migration v17: Add source column to sessions table
// ---------------------------------------------------------------------------
MIGRATIONS.push({
  version: 17,
  description: 'Add source column to sessions table (api/mcp)',
  up: (sqlite) => {
    sqlite.exec("ALTER TABLE sessions ADD COLUMN source TEXT NOT NULL DEFAULT 'api'");
  },
});

// ---------------------------------------------------------------------------
// Migration v18: Add owner_approval_method column to wallets table
// ---------------------------------------------------------------------------
// Simple ALTER TABLE ADD COLUMN -- nullable, no CHECK via ALTER (SQLite limitation).
// CHECK is enforced at application level via Zod ApprovalMethodSchema.
// Fresh DB DDL includes CHECK constraint directly.

MIGRATIONS.push({
  version: 18,
  description: 'Add owner_approval_method column to wallets table',
  up: (sqlite) => {
    sqlite.exec('ALTER TABLE wallets ADD COLUMN owner_approval_method TEXT');
  },
});

// ---------------------------------------------------------------------------
// Migration v19: Create session_wallets junction table, migrate sessions.wallet_id, drop wallet_id column
// ---------------------------------------------------------------------------
// 12-step table recreation for sessions (wallet_id column removal).
// Creates session_wallets junction table, migrates existing 1:1 data as is_default=1,
// then recreates sessions without wallet_id and reconnects FK-dependent transactions.
// wallet_id IS NULL sessions are skipped (no crash).

MIGRATIONS.push({
  version: 19,
  description: 'Create session_wallets junction table, migrate sessions.wallet_id, drop wallet_id column',
  managesOwnTransaction: true,
  up: (sqlite) => {
    sqlite.exec('BEGIN');
    try {
      // Step 1: Create session_wallets table
      sqlite.exec(`CREATE TABLE session_wallets (
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  wallet_id TEXT NOT NULL REFERENCES wallets(id) ON DELETE CASCADE,
  is_default INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (session_id, wallet_id)
)`);
      sqlite.exec('CREATE INDEX idx_session_wallets_session ON session_wallets(session_id)');
      sqlite.exec('CREATE INDEX idx_session_wallets_wallet ON session_wallets(wallet_id)');

      // Step 2: Migrate existing sessions.wallet_id -> session_wallets (is_default = 1)
      // wallet_id가 NULL인 비정상 세션은 스킵 (WHERE wallet_id IS NOT NULL)
      sqlite.exec(`INSERT INTO session_wallets (session_id, wallet_id, is_default, created_at)
  SELECT id, wallet_id, 1, CAST(strftime('%s', 'now') AS INTEGER)
  FROM sessions
  WHERE wallet_id IS NOT NULL`);

      // Step 3: Recreate sessions table without wallet_id column (12-step)
      sqlite.exec(`CREATE TABLE sessions_new (
  id TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  constraints TEXT,
  usage_stats TEXT,
  revoked_at INTEGER,
  renewal_count INTEGER NOT NULL DEFAULT 0,
  max_renewals INTEGER NOT NULL DEFAULT 30,
  last_renewed_at INTEGER,
  absolute_expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  source TEXT NOT NULL DEFAULT 'api'
)`);

      // Step 4: Copy data (excluding wallet_id)
      sqlite.exec(`INSERT INTO sessions_new (id, token_hash, expires_at, constraints, usage_stats, revoked_at, renewal_count, max_renewals, last_renewed_at, absolute_expires_at, created_at, source)
  SELECT id, token_hash, expires_at, constraints, usage_stats, revoked_at, renewal_count, max_renewals, last_renewed_at, absolute_expires_at, created_at, source
  FROM sessions`);

      // Step 5: Drop old sessions table
      sqlite.exec('DROP TABLE sessions');

      // Step 6: Rename new table
      sqlite.exec('ALTER TABLE sessions_new RENAME TO sessions');

      // Step 7: Recreate sessions indexes (without wallet_id index)
      sqlite.exec('CREATE INDEX idx_sessions_expires_at ON sessions(expires_at)');
      sqlite.exec('CREATE INDEX idx_sessions_token_hash ON sessions(token_hash)');

      // Step 8: Recreate transactions table to fix FK reference to sessions
      // (sessions was dropped+renamed, need FK reconnection)
      // transactions references sessions(id) ON DELETE SET NULL
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
  amount_usd REAL,
  reserved_amount_usd REAL,
  error TEXT,
  metadata TEXT,
  network TEXT CHECK (network IS NULL OR network IN (${inList(NETWORK_TYPES)}))
)`);

      sqlite.exec(`INSERT INTO transactions_new (id, wallet_id, session_id, chain, tx_hash, type, amount, to_address, token_mint, contract_address, method_signature, spender_address, approved_amount, parent_id, batch_index, status, tier, queued_at, executed_at, created_at, reserved_amount, amount_usd, reserved_amount_usd, error, metadata, network)
  SELECT id, wallet_id, session_id, chain, tx_hash, type, amount, to_address, token_mint, contract_address, method_signature, spender_address, approved_amount, parent_id, batch_index, status, tier, queued_at, executed_at, created_at, reserved_amount, amount_usd, reserved_amount_usd, error, metadata, network FROM transactions`);
      sqlite.exec('DROP TABLE transactions');
      sqlite.exec('ALTER TABLE transactions_new RENAME TO transactions');

      // Recreate transactions indexes
      sqlite.exec('CREATE INDEX idx_transactions_wallet_status ON transactions(wallet_id, status)');
      sqlite.exec('CREATE INDEX idx_transactions_session_id ON transactions(session_id)');
      sqlite.exec('CREATE UNIQUE INDEX idx_transactions_tx_hash ON transactions(tx_hash)');
      sqlite.exec('CREATE INDEX idx_transactions_queued_at ON transactions(queued_at)');
      sqlite.exec('CREATE INDEX idx_transactions_created_at ON transactions(created_at)');
      sqlite.exec('CREATE INDEX idx_transactions_type ON transactions(type)');
      sqlite.exec('CREATE INDEX idx_transactions_contract_address ON transactions(contract_address)');
      sqlite.exec('CREATE INDEX idx_transactions_parent_id ON transactions(parent_id)');

      sqlite.exec('COMMIT');
    } catch (err) {
      sqlite.exec('ROLLBACK');
      throw err;
    }

    // Re-enable foreign keys and verify integrity
    sqlite.pragma('foreign_keys = ON');
    const fkErrors = sqlite.pragma('foreign_key_check') as unknown[];
    if (fkErrors.length > 0) {
      throw new Error(`FK integrity violation after v19: ${JSON.stringify(fkErrors)}`);
    }
  },
});

// ---------------------------------------------------------------------------
// Migration v20: Add token_issued_count to sessions (v26.5)
// ---------------------------------------------------------------------------

MIGRATIONS.push({
  version: 20,
  description: 'Add token_issued_count column to sessions table',
  up: (sqlite) => {
    sqlite.exec('ALTER TABLE sessions ADD COLUMN token_issued_count INTEGER NOT NULL DEFAULT 1');
  },
});

// ---------------------------------------------------------------------------
// Migration v21: Add incoming transaction monitoring tables and wallet opt-in column
// ---------------------------------------------------------------------------
// Creates incoming_transactions (13 columns + UNIQUE constraint), incoming_tx_cursors (6 columns),
// and adds wallets.monitor_incoming opt-in column.
// Simple ALTER TABLE + CREATE TABLE -- no CHECK constraint changes on existing tables,
// no table recreation needed.

MIGRATIONS.push({
  version: 21,
  description: 'Add incoming transaction monitoring tables and wallet opt-in column',
  up: (sqlite) => {
    // 1. wallets.monitor_incoming opt-in column
    sqlite.exec('ALTER TABLE wallets ADD COLUMN monitor_incoming INTEGER NOT NULL DEFAULT 0');

    // 2. incoming_transactions table (13 columns + UNIQUE constraint)
    sqlite.exec(`CREATE TABLE incoming_transactions (
  id TEXT PRIMARY KEY,
  tx_hash TEXT NOT NULL,
  wallet_id TEXT NOT NULL REFERENCES wallets(id) ON DELETE CASCADE,
  from_address TEXT NOT NULL,
  amount TEXT NOT NULL,
  token_address TEXT,
  chain TEXT NOT NULL CHECK (chain IN (${inList(CHAIN_TYPES)})),
  network TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'DETECTED' CHECK (status IN (${inList(INCOMING_TX_STATUSES)})),
  block_number INTEGER,
  detected_at INTEGER NOT NULL,
  confirmed_at INTEGER,
  is_suspicious INTEGER NOT NULL DEFAULT 0,
  UNIQUE(tx_hash, wallet_id)
)`);

    // 3. incoming_tx_cursors table (6 columns)
    sqlite.exec(`CREATE TABLE incoming_tx_cursors (
  wallet_id TEXT PRIMARY KEY REFERENCES wallets(id) ON DELETE CASCADE,
  chain TEXT NOT NULL,
  network TEXT NOT NULL,
  last_signature TEXT,
  last_block_number INTEGER,
  updated_at INTEGER NOT NULL
)`);

    // 4. Indexes on incoming_transactions
    sqlite.exec('CREATE INDEX idx_incoming_tx_wallet_detected ON incoming_transactions(wallet_id, detected_at DESC)');
    sqlite.exec('CREATE INDEX idx_incoming_tx_detected_at ON incoming_transactions(detected_at)');
    sqlite.exec('CREATE INDEX idx_incoming_tx_chain_network ON incoming_transactions(chain, network)');
    sqlite.exec("CREATE INDEX idx_incoming_tx_status ON incoming_transactions(status) WHERE status = 'DETECTED'");
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

  // Step 1: Create tables + record schema version (NO indexes yet)
  // Indexes reference latest-schema columns (e.g. wallets.environment) that may
  // not exist in pre-migration databases. Creating indexes before migrations
  // causes "no such column" errors on existing DBs. (MIGR-01 fix)
  //
  // Pre-v3 databases have an `agents` table that gets renamed to `wallets` by
  // v3 migration. We must skip creating `wallets` if `agents` still exists,
  // otherwise v3 migration fails with "table already exists". (MIGR-01b fix)
  const hasAgentsTable =
    (
      sqlite
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='agents'")
        .get() as { name: string } | undefined
    ) !== undefined;

  // Pre-v19 databases have sessions.wallet_id (or agent_id) which gets migrated to
  // session_wallets by v19 migration. Skip creating session_wallets DDL so v19 migration
  // can handle it. Detect existing DB by checking if schema_version has v1 recorded
  // (existing DB) AND v19 not yet applied. (MIGR-01c fix)
  const hasSchemaVersionTable =
    (
      sqlite
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='schema_version'")
        .get() as { name: string } | undefined
    ) !== undefined;
  const isExistingDbPreV19 =
    hasSchemaVersionTable &&
    (
      sqlite
        .prepare('SELECT version FROM schema_version WHERE version = 1')
        .get() as { version: number } | undefined
    ) !== undefined &&
    (
      sqlite
        .prepare('SELECT version FROM schema_version WHERE version = 19')
        .get() as { version: number } | undefined
    ) === undefined;

  sqlite.exec('BEGIN');
  try {
    for (const stmt of tables) {
      // Skip wallets table creation if agents table exists (v3 migration will handle rename)
      if (hasAgentsTable && stmt.includes('CREATE TABLE IF NOT EXISTS wallets')) {
        continue;
      }
      // Skip session_wallets creation if this is a pre-v19 existing DB (v19 migration will handle)
      if (isExistingDbPreV19 && stmt.includes('CREATE TABLE IF NOT EXISTS session_wallets')) {
        continue;
      }
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
        .run(1, ts, 'Initial schema (18 tables)');

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

  // Step 2: Run incremental migrations (adds/transforms columns in existing DBs)
  // Fresh DBs have all versions recorded above, so migrations are skipped.
  runMigrations(sqlite);

  // Step 3: Create indexes AFTER migrations complete
  // All columns are now guaranteed to exist (e.g. wallets.environment from v7).
  sqlite.exec('BEGIN');
  try {
    for (const stmt of indexes) {
      sqlite.exec(stmt);
    }
    sqlite.exec('COMMIT');
  } catch (err) {
    sqlite.exec('ROLLBACK');
    throw err;
  }
}
