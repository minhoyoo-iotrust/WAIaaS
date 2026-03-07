/**
 * Schema push + incremental migration runner for daemon SQLite database.
 *
 * Creates all 19 tables with indexes, foreign keys, and CHECK constraints
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
  POSITION_CATEGORIES,
  POSITION_STATUSES,
  NETWORK_TO_CAIP2,
  tokenAssetId,
  ACCOUNT_TYPES,
} from '@waiaas/core';
import type { NetworkType } from '@waiaas/core';

// ---------------------------------------------------------------------------
// Utility: build CHECK IN clause from SSoT arrays
// ---------------------------------------------------------------------------

const inList = (values: readonly string[]) => values.map((v) => `'${v}'`).join(', ');

/**
 * NETWORK_TYPES_WITH_LEGACY includes both old ('mainnet', 'devnet', 'testnet') and new
 * ('solana-mainnet', 'solana-devnet', 'solana-testnet') Solana network names.
 * Used in pre-v29 migrations so CHECK constraints accept data in either format
 * during the migration chain. Migration v29 converts old -> new, and post-v29
 * tables use NETWORK_TYPES (new names only).
 */
const LEGACY_SOLANA_NETWORKS = ['mainnet', 'devnet', 'testnet'] as const;
const NETWORK_TYPES_WITH_LEGACY = [...new Set([...NETWORK_TYPES, ...LEGACY_SOLANA_NETWORKS])] as const;

/**
 * Map legacy bare Solana network names to their prefixed form.
 * Used by pre-v29 migrations (e.g., v22 asset_id backfill) that need to look up
 * NETWORK_TO_CAIP2 with potentially old-format data.
 */
const LEGACY_NETWORK_NORMALIZE: Record<string, string> = {
  mainnet: 'solana-mainnet',
  devnet: 'solana-devnet',
  testnet: 'solana-testnet',
};

// ---------------------------------------------------------------------------
// DDL statements for all 25 tables (latest schema: wallets + wallet_id + session_wallets + token_registry + settings + telegram_users + wc_sessions + wc_store + incoming_transactions + incoming_tx_cursors + defi_positions + wallet_apps + webhooks + webhook_logs + agent_identities + reputation_cache + nft_metadata_cache + userop_builds)
// ---------------------------------------------------------------------------

/**
 * The latest schema version that getCreateTableStatements() represents.
 * pushSchema() records this version for fresh databases so migrations are skipped.
 * Increment this whenever DDL statements are updated to match a new migration.
 */
export const LATEST_SCHEMA_VERSION = 50;

function getCreateTableStatements(): string[] {
  return [
    // Table 1: wallets (renamed from agents in v3, environment model in v6b, v29.3: default_network removed)
    `CREATE TABLE IF NOT EXISTS wallets (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  chain TEXT NOT NULL CHECK (chain IN (${inList(CHAIN_TYPES)})),
  environment TEXT NOT NULL CHECK (environment IN (${inList(ENVIRONMENT_TYPES)})),
  public_key TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'CREATING' CHECK (status IN (${inList(WALLET_STATUSES)})),
  owner_address TEXT,
  owner_verified INTEGER NOT NULL DEFAULT 0 CHECK (owner_verified IN (0, 1)),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  suspended_at INTEGER,
  suspension_reason TEXT,
  monitor_incoming INTEGER NOT NULL DEFAULT 0,
  owner_approval_method TEXT CHECK (owner_approval_method IS NULL OR owner_approval_method IN ('sdk_ntfy', 'sdk_telegram', 'walletconnect', 'telegram_bot', 'rest')),
  wallet_type TEXT,
  account_type TEXT NOT NULL DEFAULT 'eoa' CHECK (account_type IN (${inList(ACCOUNT_TYPES)})),
  signer_key TEXT,
  deployed INTEGER NOT NULL DEFAULT 1,
  entry_point TEXT,
  aa_provider TEXT CHECK (aa_provider IS NULL OR aa_provider IN ('pimlico', 'alchemy', 'custom')),
  aa_provider_api_key_encrypted TEXT,
  aa_bundler_url TEXT,
  aa_paymaster_url TEXT,
  aa_paymaster_policy_id TEXT,
  factory_address TEXT
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
  max_renewals INTEGER NOT NULL DEFAULT 0,
  last_renewed_at INTEGER,
  absolute_expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  source TEXT NOT NULL DEFAULT 'api',
  token_issued_count INTEGER NOT NULL DEFAULT 1
)`,

    // Table 2b: session_wallets (v26.4: session-wallet junction for 1:N model, v29.3: is_default removed)
    `CREATE TABLE IF NOT EXISTS session_wallets (
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  wallet_id TEXT NOT NULL REFERENCES wallets(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (session_id, wallet_id)
)`,

    // Table 3: transactions (bridge_status + bridge_metadata added in v23)
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
  network TEXT CHECK (network IS NULL OR network IN (${inList(NETWORK_TYPES)})),
  bridge_status TEXT CHECK (bridge_status IS NULL OR bridge_status IN ('PENDING', 'COMPLETED', 'FAILED', 'BRIDGE_MONITORING', 'TIMEOUT', 'REFUNDED')),
  bridge_metadata TEXT
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

    // Table 5: pending_approvals (approval_channel added in v16, approval_type added in v39, typed_data_json added in v40)
    `CREATE TABLE IF NOT EXISTS pending_approvals (
  id TEXT PRIMARY KEY,
  tx_id TEXT NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
  required_by INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  approved_at INTEGER,
  rejected_at INTEGER,
  owner_signature TEXT,
  approval_channel TEXT DEFAULT 'rest_api',
  approval_type TEXT NOT NULL DEFAULT 'SIWE' CHECK (approval_type IN ('SIWE', 'EIP712')),
  typed_data_json TEXT,
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

    // Table 9: token_registry (asset_id added in v22)
    `CREATE TABLE IF NOT EXISTS token_registry (
  id TEXT PRIMARY KEY,
  network TEXT NOT NULL,
  address TEXT NOT NULL,
  symbol TEXT NOT NULL,
  name TEXT NOT NULL,
  decimals INTEGER NOT NULL,
  source TEXT NOT NULL DEFAULT 'custom' CHECK (source IN ('builtin', 'custom')),
  asset_id TEXT,
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

    // Table 18: defi_positions (DeFi position tracking, v29.2)
    `CREATE TABLE IF NOT EXISTS defi_positions (
  id TEXT PRIMARY KEY,
  wallet_id TEXT NOT NULL REFERENCES wallets(id) ON DELETE CASCADE,
  category TEXT NOT NULL CHECK(category IN (${inList(POSITION_CATEGORIES)})),
  provider TEXT NOT NULL,
  chain TEXT NOT NULL CHECK(chain IN (${inList(CHAIN_TYPES)})),
  network TEXT CHECK(network IS NULL OR network IN (${inList(NETWORK_TYPES)})),
  asset_id TEXT,
  amount TEXT NOT NULL,
  amount_usd REAL,
  metadata TEXT,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK(status IN (${inList(POSITION_STATUSES)})),
  opened_at INTEGER NOT NULL,
  closed_at INTEGER,
  last_synced_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
)`,

    // Table 19: wallet_apps (Human Wallet Apps registry, v29.7, v29.10: sign_topic/notify_topic, v34: wallet_type, v35: subscription_token)
    `CREATE TABLE IF NOT EXISTS wallet_apps (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  wallet_type TEXT NOT NULL DEFAULT '',
  signing_enabled INTEGER NOT NULL DEFAULT 1,
  alerts_enabled INTEGER NOT NULL DEFAULT 1,
  sign_topic TEXT,
  notify_topic TEXT,
  subscription_token TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
)`,

    // Table 20: webhooks (webhook outbound subscriptions, v37 OPS-04)
    `CREATE TABLE IF NOT EXISTS webhooks (
  id TEXT PRIMARY KEY,
  url TEXT NOT NULL,
  secret_hash TEXT NOT NULL,
  secret_encrypted TEXT NOT NULL,
  events TEXT NOT NULL DEFAULT '[]',
  description TEXT,
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
)`,

    // Table 21: webhook_logs (webhook delivery attempt history, v37 OPS-04)
    `CREATE TABLE IF NOT EXISTS webhook_logs (
  id TEXT PRIMARY KEY,
  webhook_id TEXT NOT NULL REFERENCES webhooks(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('success', 'failed')),
  http_status INTEGER,
  attempt INTEGER NOT NULL DEFAULT 1,
  error TEXT,
  request_duration INTEGER,
  created_at INTEGER NOT NULL
)`,

    // Table 22: agent_identities (ERC-8004 agent identity tracking, v39)
    `CREATE TABLE IF NOT EXISTS agent_identities (
  id TEXT PRIMARY KEY,
  wallet_id TEXT NOT NULL REFERENCES wallets(id) ON DELETE CASCADE,
  chain_agent_id TEXT NOT NULL,
  registry_address TEXT NOT NULL,
  chain_id INTEGER NOT NULL,
  agent_uri TEXT,
  registration_file_url TEXT,
  status TEXT NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING', 'REGISTERED', 'WALLET_LINKED', 'DEREGISTERED')),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
)`,

    // Table 23: reputation_cache (ERC-8004 reputation score cache, v39)
    `CREATE TABLE IF NOT EXISTS reputation_cache (
  agent_id TEXT NOT NULL,
  registry_address TEXT NOT NULL,
  tag1 TEXT NOT NULL DEFAULT '',
  tag2 TEXT NOT NULL DEFAULT '',
  score INTEGER NOT NULL,
  score_decimals INTEGER NOT NULL DEFAULT 0,
  feedback_count INTEGER NOT NULL DEFAULT 0,
  cached_at INTEGER NOT NULL,
  PRIMARY KEY (agent_id, registry_address, tag1, tag2)
)`,

    // Table 24: nft_metadata_cache (NFT metadata caching with TTL, v44)
    `CREATE TABLE IF NOT EXISTS nft_metadata_cache (
  id TEXT PRIMARY KEY,
  contract_address TEXT NOT NULL,
  token_id TEXT NOT NULL,
  chain TEXT NOT NULL CHECK (chain IN (${inList(CHAIN_TYPES)})),
  network TEXT NOT NULL CHECK (network IN (${inList(NETWORK_TYPES)})),
  metadata_json TEXT NOT NULL,
  cached_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
)`,

    // Table 25: userop_builds (UserOp Build/Sign API data, v45, network added v50)
    `CREATE TABLE IF NOT EXISTS userop_builds (
  id TEXT PRIMARY KEY,
  wallet_id TEXT NOT NULL,
  call_data TEXT NOT NULL,
  sender TEXT NOT NULL,
  nonce TEXT NOT NULL,
  entry_point TEXT NOT NULL,
  network TEXT,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  used INTEGER NOT NULL DEFAULT 0 CHECK (used IN (0, 1))
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
    'CREATE INDEX IF NOT EXISTS idx_audit_log_tx_id ON audit_log(tx_id)',

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

    // v28.3: DeFi async tracking partial indexes on transactions
    'CREATE INDEX IF NOT EXISTS idx_transactions_bridge_status ON transactions(bridge_status) WHERE bridge_status IS NOT NULL',
    "CREATE INDEX IF NOT EXISTS idx_transactions_gas_waiting ON transactions(status) WHERE status = 'GAS_WAITING'",

    // v29.2: defi_positions indexes
    'CREATE INDEX IF NOT EXISTS idx_defi_positions_wallet_category ON defi_positions(wallet_id, category)',
    'CREATE INDEX IF NOT EXISTS idx_defi_positions_wallet_provider ON defi_positions(wallet_id, provider)',
    'CREATE INDEX IF NOT EXISTS idx_defi_positions_status ON defi_positions(status)',
    'CREATE UNIQUE INDEX IF NOT EXISTS idx_defi_positions_unique ON defi_positions(wallet_id, provider, asset_id, category)',

    // v34: wallet_apps.wallet_type index
    'CREATE INDEX IF NOT EXISTS idx_wallet_apps_wallet_type ON wallet_apps(wallet_type)',

    // v37: webhooks + webhook_logs indexes (OPS-04)
    'CREATE INDEX IF NOT EXISTS idx_webhooks_enabled ON webhooks(enabled)',
    'CREATE INDEX IF NOT EXISTS idx_webhook_logs_webhook_id ON webhook_logs(webhook_id)',
    'CREATE INDEX IF NOT EXISTS idx_webhook_logs_event_type ON webhook_logs(event_type)',
    'CREATE INDEX IF NOT EXISTS idx_webhook_logs_status ON webhook_logs(status)',
    'CREATE INDEX IF NOT EXISTS idx_webhook_logs_created_at ON webhook_logs(created_at)',

    // v39: agent_identities indexes (ERC-8004)
    'CREATE INDEX IF NOT EXISTS idx_agent_identities_wallet ON agent_identities(wallet_id)',
    'CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_identities_chain ON agent_identities(registry_address, chain_agent_id)',

    // v44: nft_metadata_cache indexes
    'CREATE UNIQUE INDEX IF NOT EXISTS idx_nft_cache_unique ON nft_metadata_cache(contract_address, token_id, chain, network)',
    'CREATE INDEX IF NOT EXISTS idx_nft_cache_expires ON nft_metadata_cache(expires_at)',

    // v45: userop_builds indexes
    'CREATE INDEX IF NOT EXISTS idx_userop_builds_wallet_id ON userop_builds(wallet_id)',
    'CREATE INDEX IF NOT EXISTS idx_userop_builds_expires ON userop_builds(expires_at)',
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
  network TEXT NOT NULL CHECK (network IN (${inList(NETWORK_TYPES_WITH_LEGACY)})),
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
  default_network TEXT CHECK (default_network IS NULL OR default_network IN (${inList(NETWORK_TYPES_WITH_LEGACY)})),
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
  network TEXT CHECK (network IS NULL OR network IN (${inList(NETWORK_TYPES_WITH_LEGACY)}))
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
  network TEXT CHECK (network IS NULL OR network IN (${inList(NETWORK_TYPES_WITH_LEGACY)})),
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
  network TEXT CHECK (network IS NULL OR network IN (${inList(NETWORK_TYPES_WITH_LEGACY)}))
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
  network TEXT CHECK (network IS NULL OR network IN (${inList(NETWORK_TYPES_WITH_LEGACY)}))
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
  network TEXT CHECK (network IS NULL OR network IN (${inList(NETWORK_TYPES_WITH_LEGACY)})),
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
  network TEXT CHECK (network IS NULL OR network IN (${inList(NETWORK_TYPES_WITH_LEGACY)}))
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
    sqlite.exec(`CREATE TABLE IF NOT EXISTS incoming_transactions (
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
    sqlite.exec(`CREATE TABLE IF NOT EXISTS incoming_tx_cursors (
  wallet_id TEXT PRIMARY KEY REFERENCES wallets(id) ON DELETE CASCADE,
  chain TEXT NOT NULL,
  network TEXT NOT NULL,
  last_signature TEXT,
  last_block_number INTEGER,
  updated_at INTEGER NOT NULL
)`);

    // 4. Indexes on incoming_transactions
    sqlite.exec('CREATE INDEX IF NOT EXISTS idx_incoming_tx_wallet_detected ON incoming_transactions(wallet_id, detected_at DESC)');
    sqlite.exec('CREATE INDEX IF NOT EXISTS idx_incoming_tx_detected_at ON incoming_transactions(detected_at)');
    sqlite.exec('CREATE INDEX IF NOT EXISTS idx_incoming_tx_chain_network ON incoming_transactions(chain, network)');
    sqlite.exec("CREATE INDEX IF NOT EXISTS idx_incoming_tx_status ON incoming_transactions(status) WHERE status = 'DETECTED'");
  },
});

// ---------------------------------------------------------------------------
// Migration v22: Add asset_id column to token_registry with CAIP-19 backfill
// ---------------------------------------------------------------------------
// Simple ALTER TABLE ADD COLUMN + application-level backfill.
// Generates CAIP-19 asset_id for each known-network token using tokenAssetId().
// Unknown networks are skipped (asset_id remains NULL).

MIGRATIONS.push({
  version: 22,
  description: 'Add asset_id column to token_registry with CAIP-19 backfill',
  managesOwnTransaction: false,
  up: (sqlite) => {
    // Step 1: Add nullable column (skip if already exists from fresh DDL)
    const columns = sqlite
      .prepare("PRAGMA table_info('token_registry')")
      .all() as Array<{ name: string }>;
    const hasAssetId = columns.some((c) => c.name === 'asset_id');
    if (!hasAssetId) {
      sqlite.exec('ALTER TABLE token_registry ADD COLUMN asset_id TEXT');
    }

    // Step 2: Application-level backfill using tokenAssetId()
    const rows = sqlite
      .prepare('SELECT id, network, address FROM token_registry')
      .all() as Array<{ id: string; network: string; address: string }>;

    const updateStmt = sqlite.prepare(
      'UPDATE token_registry SET asset_id = ? WHERE id = ?'
    );

    for (const row of rows) {
      // Normalize legacy Solana network names (mainnet -> solana-mainnet, etc.)
      const normalizedNetwork = LEGACY_NETWORK_NORMALIZE[row.network] ?? row.network;
      // Guard: only backfill for known networks (Pitfall 4)
      if (!(normalizedNetwork in NETWORK_TO_CAIP2)) continue;
      try {
        const assetId = tokenAssetId(normalizedNetwork as NetworkType, row.address);
        updateStmt.run(assetId, row.id);
      } catch {
        // Skip on error -- rows with unknown networks get asset_id = NULL
      }
    }
  },
});

// ---------------------------------------------------------------------------
// Migration v23: DeFi async tracking — bridge_status + bridge_metadata + GAS_WAITING
// ---------------------------------------------------------------------------
// 12-step table recreation required because:
// 1. TRANSACTION_STATUSES now includes GAS_WAITING (11 entries), must update status CHECK
// 2. New bridge_status column with 6-value CHECK constraint
// 3. New bridge_metadata TEXT column
// 4. 2 new partial indexes (idx_transactions_bridge_status, idx_transactions_gas_waiting)
// @see internal/objectives/m28-00-defi-basic-protocol-design.md (DEFI-04 ASNC-01)

MIGRATIONS.push({
  version: 23,
  description: 'DeFi async tracking: bridge_status + bridge_metadata + GAS_WAITING state',
  managesOwnTransaction: true,
  up: (sqlite) => {
    sqlite.exec('BEGIN');

    try {
      // Step 1: Create transactions_new with updated CHECK + new columns
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
  network TEXT CHECK (network IS NULL OR network IN (${inList(NETWORK_TYPES_WITH_LEGACY)})),
  bridge_status TEXT CHECK (bridge_status IS NULL OR bridge_status IN ('PENDING', 'COMPLETED', 'FAILED', 'BRIDGE_MONITORING', 'TIMEOUT', 'REFUNDED')),
  bridge_metadata TEXT
)`);

      // Step 2: Copy existing data (bridge_status and bridge_metadata default to NULL)
      sqlite.exec(`INSERT INTO transactions_new (id, wallet_id, session_id, chain, tx_hash, type, amount, to_address, token_mint, contract_address, method_signature, spender_address, approved_amount, parent_id, batch_index, status, tier, queued_at, executed_at, created_at, reserved_amount, amount_usd, reserved_amount_usd, error, metadata, network)
  SELECT id, wallet_id, session_id, chain, tx_hash, type, amount, to_address, token_mint, contract_address, method_signature, spender_address, approved_amount, parent_id, batch_index, status, tier, queued_at, executed_at, created_at, reserved_amount, amount_usd, reserved_amount_usd, error, metadata, network FROM transactions`);

      // Step 3: Drop old table
      sqlite.exec('DROP TABLE transactions');

      // Step 4: Rename new table
      sqlite.exec('ALTER TABLE transactions_new RENAME TO transactions');

      // Step 5: Recreate all 8 existing indexes
      sqlite.exec('CREATE INDEX idx_transactions_wallet_status ON transactions(wallet_id, status)');
      sqlite.exec('CREATE INDEX idx_transactions_session_id ON transactions(session_id)');
      sqlite.exec('CREATE UNIQUE INDEX idx_transactions_tx_hash ON transactions(tx_hash)');
      sqlite.exec('CREATE INDEX idx_transactions_queued_at ON transactions(queued_at)');
      sqlite.exec('CREATE INDEX idx_transactions_created_at ON transactions(created_at)');
      sqlite.exec('CREATE INDEX idx_transactions_type ON transactions(type)');
      sqlite.exec('CREATE INDEX idx_transactions_contract_address ON transactions(contract_address)');
      sqlite.exec('CREATE INDEX idx_transactions_parent_id ON transactions(parent_id)');

      // Step 6: Create 2 new partial indexes
      sqlite.exec('CREATE INDEX idx_transactions_bridge_status ON transactions(bridge_status) WHERE bridge_status IS NOT NULL');
      sqlite.exec("CREATE INDEX idx_transactions_gas_waiting ON transactions(status) WHERE status = 'GAS_WAITING'");

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
      throw new Error(`FK integrity violation after v23: ${JSON.stringify(fkErrors)}`);
    }
  },
});

// ---------------------------------------------------------------------------
// Migration v24: Add wallet_type column to wallets table for preset auto-setup
// ---------------------------------------------------------------------------
// Simple ALTER TABLE ADD COLUMN -- nullable TEXT, no CHECK constraint (validated at app level via Zod).
// Supports wallet preset auto-setup (v28.8): stores the preset type identifier.

MIGRATIONS.push({
  version: 24,
  description: 'Add wallet_type column to wallets table for preset auto-setup',
  up: (sqlite) => {
    sqlite.exec('ALTER TABLE wallets ADD COLUMN wallet_type TEXT');
  },
});

// ---------------------------------------------------------------------------
// v29.2 Migration 25: Add defi_positions table for DeFi position tracking
// ---------------------------------------------------------------------------

MIGRATIONS.push({
  version: 25,
  description: 'Add defi_positions table for DeFi position tracking',
  up: (sqlite) => {
    sqlite.exec(`
      CREATE TABLE IF NOT EXISTS defi_positions (
        id TEXT PRIMARY KEY,
        wallet_id TEXT NOT NULL REFERENCES wallets(id) ON DELETE CASCADE,
        category TEXT NOT NULL CHECK(category IN (${inList(POSITION_CATEGORIES)})),
        provider TEXT NOT NULL,
        chain TEXT NOT NULL CHECK(chain IN (${inList(CHAIN_TYPES)})),
        network TEXT CHECK(network IS NULL OR network IN (${inList(NETWORK_TYPES_WITH_LEGACY)})),
        asset_id TEXT,
        amount TEXT NOT NULL,
        amount_usd REAL,
        metadata TEXT,
        status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK(status IN (${inList(POSITION_STATUSES)})),
        opened_at INTEGER NOT NULL,
        closed_at INTEGER,
        last_synced_at INTEGER NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `);
    // Indexes for the new table
    sqlite.exec('CREATE INDEX IF NOT EXISTS idx_defi_positions_wallet_category ON defi_positions(wallet_id, category)');
    sqlite.exec('CREATE INDEX IF NOT EXISTS idx_defi_positions_wallet_provider ON defi_positions(wallet_id, provider)');
    sqlite.exec('CREATE INDEX IF NOT EXISTS idx_defi_positions_status ON defi_positions(status)');
    sqlite.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_defi_positions_unique ON defi_positions(wallet_id, provider, asset_id, category)');
  },
});

// ---------------------------------------------------------------------------
// v26: Add LENDING_LTV_LIMIT and LENDING_ASSET_WHITELIST to policies table CHECK constraint
// ---------------------------------------------------------------------------
// POLICY_TYPES SSoT array now includes LENDING_LTV_LIMIT and LENDING_ASSET_WHITELIST (14 total).
// SQLite cannot ALTER CHECK constraints, so we recreate the policies table (12-step pattern).

MIGRATIONS.push({
  version: 26,
  description: 'Add lending policy types to policies table CHECK constraint',
  managesOwnTransaction: true,
  up: (sqlite) => {
    // Step 1: Begin transaction (foreign_keys already OFF via runner)
    sqlite.exec('BEGIN');

    try {
      // Step 2: Create policies_new with updated CHECK (uses SSoT POLICY_TYPES array)
      sqlite.exec(`CREATE TABLE policies_new (
  id TEXT PRIMARY KEY,
  wallet_id TEXT REFERENCES wallets(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN (${inList(POLICY_TYPES)})),
  rules TEXT NOT NULL,
  priority INTEGER NOT NULL DEFAULT 0,
  enabled INTEGER NOT NULL DEFAULT 1,
  network TEXT CHECK (network IS NULL OR network IN (${inList(NETWORK_TYPES_WITH_LEGACY)})),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
)`);

      // Step 3: Copy existing policies
      sqlite.exec('INSERT INTO policies_new SELECT * FROM policies');

      // Step 4: Drop old table
      sqlite.exec('DROP TABLE policies');

      // Step 5: Rename new table
      sqlite.exec('ALTER TABLE policies_new RENAME TO policies');

      // Step 6: Recreate indexes
      sqlite.exec('CREATE INDEX idx_policies_wallet_enabled ON policies(wallet_id, enabled)');
      sqlite.exec('CREATE INDEX idx_policies_type ON policies(type)');
      sqlite.exec('CREATE INDEX idx_policies_network ON policies(network)');

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
      throw new Error(`FK integrity violation after v26: ${JSON.stringify(fkErrors)}`);
    }
  },
});

// ---------------------------------------------------------------------------
// Migration v27: Remove is_default from session_wallets, default_network from wallets
// v29.3: Default wallet/default network concept removed
// ---------------------------------------------------------------------------

MIGRATIONS.push({
  version: 27,
  description: 'Remove is_default from session_wallets and default_network from wallets (v29.3)',
  managesOwnTransaction: true,
  up: (sqlite) => {
    sqlite.exec('BEGIN');

    try {
      // ── Part 1: Remove is_default from session_wallets ──

      // Step 2: Create session_wallets_new without is_default
      sqlite.exec(`CREATE TABLE session_wallets_new (
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  wallet_id TEXT NOT NULL REFERENCES wallets(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (session_id, wallet_id)
)`);

      // Step 3: Copy data (is_default column discarded, no data loss)
      sqlite.exec('INSERT INTO session_wallets_new (session_id, wallet_id, created_at) SELECT session_id, wallet_id, created_at FROM session_wallets');

      // Step 4: Drop old table
      sqlite.exec('DROP TABLE session_wallets');

      // Step 5: Rename
      sqlite.exec('ALTER TABLE session_wallets_new RENAME TO session_wallets');

      // Step 6: Recreate indexes
      sqlite.exec('CREATE INDEX idx_session_wallets_session ON session_wallets(session_id)');
      sqlite.exec('CREATE INDEX idx_session_wallets_wallet ON session_wallets(wallet_id)');

      // ── Part 2: Remove default_network from wallets ──

      // Step 7: Create wallets_new without default_network
      sqlite.exec(`CREATE TABLE wallets_new (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  chain TEXT NOT NULL CHECK (chain IN (${inList(CHAIN_TYPES)})),
  environment TEXT NOT NULL CHECK (environment IN (${inList(ENVIRONMENT_TYPES)})),
  public_key TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'CREATING' CHECK (status IN (${inList(WALLET_STATUSES)})),
  owner_address TEXT,
  owner_verified INTEGER NOT NULL DEFAULT 0 CHECK (owner_verified IN (0, 1)),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  suspended_at INTEGER,
  suspension_reason TEXT,
  monitor_incoming INTEGER NOT NULL DEFAULT 0,
  owner_approval_method TEXT CHECK (owner_approval_method IS NULL OR owner_approval_method IN ('sdk_ntfy', 'sdk_telegram', 'walletconnect', 'telegram_bot', 'rest')),
  wallet_type TEXT
)`);

      // Step 8: Copy data (default_network intentionally excluded)
      sqlite.exec('INSERT INTO wallets_new (id, name, chain, environment, public_key, status, owner_address, owner_verified, created_at, updated_at, suspended_at, suspension_reason, monitor_incoming, owner_approval_method, wallet_type) SELECT id, name, chain, environment, public_key, status, owner_address, owner_verified, created_at, updated_at, suspended_at, suspension_reason, monitor_incoming, owner_approval_method, wallet_type FROM wallets');

      // Step 9: Drop old table
      sqlite.exec('DROP TABLE wallets');

      // Step 10: Rename
      sqlite.exec('ALTER TABLE wallets_new RENAME TO wallets');

      // Step 11: Recreate indexes
      sqlite.exec('CREATE UNIQUE INDEX idx_wallets_public_key ON wallets(public_key)');
      sqlite.exec('CREATE INDEX idx_wallets_status ON wallets(status)');
      sqlite.exec('CREATE INDEX idx_wallets_chain_environment ON wallets(chain, environment)');
      sqlite.exec('CREATE INDEX idx_wallets_owner_address ON wallets(owner_address)');

      // Step 12: Commit
      sqlite.exec('COMMIT');
    } catch (err) {
      sqlite.exec('ROLLBACK');
      throw err;
    }

    // Re-enable foreign keys and verify integrity
    sqlite.pragma('foreign_keys = ON');
    const fkErrors = sqlite.pragma('foreign_key_check') as unknown[];
    if (fkErrors.length > 0) {
      throw new Error(`FK integrity violation after v27: ${JSON.stringify(fkErrors)}`);
    }
  },
});

// ---------------------------------------------------------------------------
// v28: Migrate api_keys to settings table and drop api_keys (v29.5 #214)
// ---------------------------------------------------------------------------

MIGRATIONS.push({
  version: 28,
  description: 'Migrate api_keys to settings table and drop api_keys (v29.5 #214)',
  managesOwnTransaction: true,
  up: (sqlite) => {
    sqlite.exec('BEGIN');
    try {
      // 1. Check if api_keys table exists (may not exist on very old DBs that skipped v11)
      const tableExists = sqlite
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='api_keys'")
        .get();

      if (tableExists) {
        // 2. Read all api_keys rows
        const rows = sqlite
          .prepare('SELECT provider_name, encrypted_key, updated_at FROM api_keys')
          .all() as Array<{
          provider_name: string;
          encrypted_key: string;
          updated_at: number;
        }>;

        // 3. For each row, insert into settings with key = 'actions.{provider_name}_api_key'
        // Only insert if the setting doesn't already exist (avoid overwriting manual settings)
        // encrypted_key values use the SAME encryption format as settings.value
        // (both use encryptSettingValue from settings-crypto.ts), so copy directly.
        const insertStmt = sqlite.prepare(
          `INSERT OR IGNORE INTO settings (key, value, encrypted, category, updated_at)
           VALUES (?, ?, 1, 'actions', ?)`,
        );

        for (const row of rows) {
          const settingKey = `actions.${row.provider_name}_api_key`;
          insertStmt.run(settingKey, row.encrypted_key, row.updated_at);
        }

        // 4. Drop api_keys table
        sqlite.exec('DROP TABLE IF EXISTS api_keys');
      }

      sqlite.exec('COMMIT');
    } catch (err) {
      sqlite.exec('ROLLBACK');
      throw err;
    }
  },
});

// ---------------------------------------------------------------------------
// v29: Rename Solana network IDs to solana-{network} format (v29.5 #211)
// ---------------------------------------------------------------------------
// Converts mainnet->solana-mainnet, devnet->solana-devnet, testnet->solana-testnet
// in all tables with Solana network references.
// Tables with CHECK constraints (transactions, policies, defi_positions) require
// 12-step table recreation. Tables without CHECK (incoming_transactions,
// incoming_tx_cursors, token_registry) use simple UPDATE.

MIGRATIONS.push({
  version: 29,
  description: 'Rename Solana network IDs to solana-{network} format (v29.5 #211)',
  managesOwnTransaction: true,
  up: (sqlite) => {
    sqlite.exec('BEGIN');
    try {
      // Helper: Solana network CASE WHEN clause for SELECT
      const solanaCase = (col: string) =>
        `CASE WHEN chain = 'solana' AND ${col} = 'mainnet' THEN 'solana-mainnet'` +
        ` WHEN chain = 'solana' AND ${col} = 'devnet' THEN 'solana-devnet'` +
        ` WHEN chain = 'solana' AND ${col} = 'testnet' THEN 'solana-testnet'` +
        ` ELSE ${col} END`;

      // ── 1. transactions: 12-step recreation (has CHECK on network) ──

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
  network TEXT CHECK (network IS NULL OR network IN (${inList(NETWORK_TYPES)})),
  bridge_status TEXT CHECK (bridge_status IS NULL OR bridge_status IN ('PENDING', 'COMPLETED', 'FAILED', 'BRIDGE_MONITORING', 'TIMEOUT', 'REFUNDED')),
  bridge_metadata TEXT
)`);

      sqlite.exec(`INSERT INTO transactions_new
  SELECT id, wallet_id, session_id, chain, tx_hash, type, amount, to_address,
         token_mint, contract_address, method_signature, spender_address,
         approved_amount, parent_id, batch_index, status, tier, queued_at,
         executed_at, created_at, reserved_amount, amount_usd, reserved_amount_usd,
         error, metadata, ${solanaCase('network')}, bridge_status, bridge_metadata
  FROM transactions`);

      sqlite.exec('DROP TABLE transactions');
      sqlite.exec('ALTER TABLE transactions_new RENAME TO transactions');

      // Recreate transactions indexes
      sqlite.exec('CREATE INDEX IF NOT EXISTS idx_transactions_wallet_status ON transactions(wallet_id, status)');
      sqlite.exec('CREATE INDEX IF NOT EXISTS idx_transactions_session_id ON transactions(session_id)');
      sqlite.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_transactions_tx_hash ON transactions(tx_hash)');
      sqlite.exec('CREATE INDEX IF NOT EXISTS idx_transactions_queued_at ON transactions(queued_at)');
      sqlite.exec('CREATE INDEX IF NOT EXISTS idx_transactions_created_at ON transactions(created_at)');
      sqlite.exec('CREATE INDEX IF NOT EXISTS idx_transactions_type ON transactions(type)');
      sqlite.exec('CREATE INDEX IF NOT EXISTS idx_transactions_contract_address ON transactions(contract_address)');
      sqlite.exec('CREATE INDEX IF NOT EXISTS idx_transactions_parent_id ON transactions(parent_id)');
      sqlite.exec('CREATE INDEX IF NOT EXISTS idx_transactions_bridge_status ON transactions(bridge_status) WHERE bridge_status IS NOT NULL');
      sqlite.exec("CREATE INDEX IF NOT EXISTS idx_transactions_gas_waiting ON transactions(status) WHERE status = 'GAS_WAITING'");

      // ── 2. policies: 12-step recreation (has CHECK on network) ──

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

      // policies doesn't have a chain column, so we check if network is one of the bare Solana names
      sqlite.exec(`INSERT INTO policies_new
  SELECT id, wallet_id, type, rules, priority, enabled,
         CASE WHEN network = 'mainnet' THEN 'solana-mainnet'
              WHEN network = 'devnet' THEN 'solana-devnet'
              WHEN network = 'testnet' THEN 'solana-testnet'
              ELSE network END,
         created_at, updated_at
  FROM policies`);

      sqlite.exec('DROP TABLE policies');
      sqlite.exec('ALTER TABLE policies_new RENAME TO policies');

      // Recreate policies indexes
      sqlite.exec('CREATE INDEX IF NOT EXISTS idx_policies_wallet_enabled ON policies(wallet_id, enabled)');
      sqlite.exec('CREATE INDEX IF NOT EXISTS idx_policies_type ON policies(type)');
      sqlite.exec('CREATE INDEX IF NOT EXISTS idx_policies_network ON policies(network)');

      // ── 3. defi_positions: 12-step recreation (has CHECK on network) ──

      sqlite.exec(`CREATE TABLE defi_positions_new (
  id TEXT PRIMARY KEY,
  wallet_id TEXT NOT NULL REFERENCES wallets(id) ON DELETE CASCADE,
  category TEXT NOT NULL CHECK(category IN (${inList(POSITION_CATEGORIES)})),
  provider TEXT NOT NULL,
  chain TEXT NOT NULL CHECK(chain IN (${inList(CHAIN_TYPES)})),
  network TEXT CHECK(network IS NULL OR network IN (${inList(NETWORK_TYPES)})),
  asset_id TEXT,
  amount TEXT NOT NULL,
  amount_usd REAL,
  metadata TEXT,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK(status IN (${inList(POSITION_STATUSES)})),
  opened_at INTEGER NOT NULL,
  closed_at INTEGER,
  last_synced_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
)`);

      sqlite.exec(`INSERT INTO defi_positions_new
  SELECT id, wallet_id, category, provider, chain, ${solanaCase('network')},
         asset_id, amount, amount_usd, metadata, status, opened_at, closed_at,
         last_synced_at, created_at, updated_at
  FROM defi_positions`);

      sqlite.exec('DROP TABLE defi_positions');
      sqlite.exec('ALTER TABLE defi_positions_new RENAME TO defi_positions');

      // Recreate defi_positions indexes
      sqlite.exec('CREATE INDEX IF NOT EXISTS idx_defi_positions_wallet_category ON defi_positions(wallet_id, category)');
      sqlite.exec('CREATE INDEX IF NOT EXISTS idx_defi_positions_wallet_provider ON defi_positions(wallet_id, provider)');
      sqlite.exec('CREATE INDEX IF NOT EXISTS idx_defi_positions_status ON defi_positions(status)');
      sqlite.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_defi_positions_unique ON defi_positions(wallet_id, provider, asset_id, category)');

      // ── 4. incoming_transactions: UPDATE only (no CHECK on network) ──

      sqlite.exec(`UPDATE incoming_transactions SET network = 'solana-mainnet' WHERE chain = 'solana' AND network = 'mainnet'`);
      sqlite.exec(`UPDATE incoming_transactions SET network = 'solana-devnet' WHERE chain = 'solana' AND network = 'devnet'`);
      sqlite.exec(`UPDATE incoming_transactions SET network = 'solana-testnet' WHERE chain = 'solana' AND network = 'testnet'`);

      // ── 5. incoming_tx_cursors: UPDATE only (no CHECK on network) ──

      sqlite.exec(`UPDATE incoming_tx_cursors SET network = 'solana-mainnet' WHERE chain = 'solana' AND network = 'mainnet'`);
      sqlite.exec(`UPDATE incoming_tx_cursors SET network = 'solana-devnet' WHERE chain = 'solana' AND network = 'devnet'`);
      sqlite.exec(`UPDATE incoming_tx_cursors SET network = 'solana-testnet' WHERE chain = 'solana' AND network = 'testnet'`);

      // ── 6. token_registry: UPDATE only (no CHECK on network, no chain column) ──

      sqlite.exec(`UPDATE token_registry SET network = 'solana-mainnet' WHERE network = 'mainnet'`);
      sqlite.exec(`UPDATE token_registry SET network = 'solana-devnet' WHERE network = 'devnet'`);
      sqlite.exec(`UPDATE token_registry SET network = 'solana-testnet' WHERE network = 'testnet'`);

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
        `FK integrity check failed after v29 migration: ${JSON.stringify(fkErrors)}`,
      );
    }
  },
});

// ---------------------------------------------------------------------------
// Migration v30: Add MATURED status to defi_positions CHECK constraint (v29.6)
// ---------------------------------------------------------------------------

MIGRATIONS.push({
  version: 30,
  description: 'Add MATURED position status to defi_positions CHECK constraint (v29.6 Yield)',
  managesOwnTransaction: true,
  up: (sqlite) => {
    sqlite.exec('BEGIN');
    try {
      // 12-step table recreation for defi_positions (status CHECK constraint update)
      sqlite.exec(`CREATE TABLE defi_positions_new (
  id TEXT PRIMARY KEY,
  wallet_id TEXT NOT NULL REFERENCES wallets(id) ON DELETE CASCADE,
  category TEXT NOT NULL CHECK(category IN (${inList(POSITION_CATEGORIES)})),
  provider TEXT NOT NULL,
  chain TEXT NOT NULL CHECK(chain IN (${inList(CHAIN_TYPES)})),
  network TEXT CHECK(network IS NULL OR network IN (${inList(NETWORK_TYPES)})),
  asset_id TEXT,
  amount TEXT NOT NULL,
  amount_usd REAL,
  metadata TEXT,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK(status IN (${inList(POSITION_STATUSES)})),
  opened_at INTEGER NOT NULL,
  closed_at INTEGER,
  last_synced_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
)`);

      sqlite.exec(`INSERT INTO defi_positions_new
  SELECT id, wallet_id, category, provider, chain, network,
         asset_id, amount, amount_usd, metadata, status, opened_at, closed_at,
         last_synced_at, created_at, updated_at
  FROM defi_positions`);

      sqlite.exec('DROP TABLE defi_positions');
      sqlite.exec('ALTER TABLE defi_positions_new RENAME TO defi_positions');

      // Recreate indexes
      sqlite.exec('CREATE INDEX IF NOT EXISTS idx_defi_positions_wallet_category ON defi_positions(wallet_id, category)');
      sqlite.exec('CREATE INDEX IF NOT EXISTS idx_defi_positions_wallet_provider ON defi_positions(wallet_id, provider)');
      sqlite.exec('CREATE INDEX IF NOT EXISTS idx_defi_positions_status ON defi_positions(status)');
      sqlite.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_defi_positions_unique ON defi_positions(wallet_id, provider, asset_id, category)');

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
        `FK integrity check failed after v30 migration: ${JSON.stringify(fkErrors)}`,
      );
    }
  },
});

// ---------------------------------------------------------------------------
// Migration v31: Create wallet_apps table for Human Wallet Apps registry (v29.7)
// ---------------------------------------------------------------------------

MIGRATIONS.push({
  version: 31,
  description: 'Create wallet_apps table for Human Wallet Apps registry',
  up: (sqlite) => {
    sqlite.exec(`CREATE TABLE IF NOT EXISTS wallet_apps (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  signing_enabled INTEGER NOT NULL DEFAULT 1,
  alerts_enabled INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
)`);
  },
});

// v32: Change sessions DDL default max_renewals from 30 to 0 (unlimited).
// This is a no-op migration: existing rows keep their values, and the Drizzle
// schema (.default(0)) already handles the app-level default for new inserts.
// The DDL default change only affects fresh databases via getCreateTableStatements().
MIGRATIONS.push({
  version: 32,
  description: 'Session progressive security: default max_renewals 30 -> 0 (unlimited)',
  up: (_sqlite) => {
    // No DDL needed -- SQLite cannot ALTER TABLE ... ALTER COLUMN DEFAULT.
    // Fresh databases use getCreateTableStatements() which already has DEFAULT 0.
    // Existing sessions retain their max_renewals values unchanged.
  },
});

// ---------------------------------------------------------------------------
// Migration v33: Add sign_topic and notify_topic to wallet_apps for per-wallet ntfy topic routing (v29.10)
// ---------------------------------------------------------------------------

MIGRATIONS.push({
  version: 33,
  description: 'Add sign_topic and notify_topic columns to wallet_apps for per-wallet ntfy topic routing',
  up: (sqlite) => {
    const cols = (sqlite.prepare("PRAGMA table_info('wallet_apps')").all() as Array<{ name: string }>).map(c => c.name);
    if (!cols.includes('sign_topic')) sqlite.exec(`ALTER TABLE wallet_apps ADD COLUMN sign_topic TEXT`);
    if (!cols.includes('notify_topic')) sqlite.exec(`ALTER TABLE wallet_apps ADD COLUMN notify_topic TEXT`);
    // Backfill existing rows with prefix+appName defaults
    const prefix = 'waiaas-sign';
    const notifyPrefix = 'waiaas-notify';
    const rows = sqlite.prepare('SELECT id, name FROM wallet_apps').all() as Array<{ id: string; name: string }>;
    const stmt = sqlite.prepare('UPDATE wallet_apps SET sign_topic = ?, notify_topic = ? WHERE id = ?');
    for (const row of rows) {
      stmt.run(`${prefix}-${row.name}`, `${notifyPrefix}-${row.name}`, row.id);
    }
  },
});

// ---------------------------------------------------------------------------
// v34: Add wallet_type column to wallet_apps (multi-device per wallet type)
// ---------------------------------------------------------------------------

MIGRATIONS.push({
  version: 34,
  description: 'Add wallet_type column to wallet_apps for multi-device per wallet type',
  up: (sqlite) => {
    const cols = (sqlite.prepare("PRAGMA table_info('wallet_apps')").all() as Array<{ name: string }>).map(c => c.name);
    if (!cols.includes('wallet_type')) {
      sqlite.exec(`ALTER TABLE wallet_apps ADD COLUMN wallet_type TEXT NOT NULL DEFAULT ''`);
      // Backfill: set wallet_type = name for existing rows
      sqlite.exec(`UPDATE wallet_apps SET wallet_type = name WHERE wallet_type = ''`);
    }
    sqlite.exec('CREATE INDEX IF NOT EXISTS idx_wallet_apps_wallet_type ON wallet_apps(wallet_type)');
  },
});

// ---------------------------------------------------------------------------
// v35: Add subscription_token column to wallet_apps (token-based ntfy topic routing)
// ---------------------------------------------------------------------------

MIGRATIONS.push({
  version: 35,
  description: 'Add subscription_token column to wallet_apps for token-based ntfy topic routing',
  up: (sqlite) => {
    const cols = (sqlite.prepare("PRAGMA table_info('wallet_apps')").all() as Array<{ name: string }>).map(c => c.name);
    if (!cols.includes('subscription_token')) {
      sqlite.exec(`ALTER TABLE wallet_apps ADD COLUMN subscription_token TEXT`);
    }
  },
});

// ---------------------------------------------------------------------------
// v36: Add idx_audit_log_tx_id index for audit log tx_id filter queries (OPS-02)
// ---------------------------------------------------------------------------

MIGRATIONS.push({
  version: 36,
  description: 'Add idx_audit_log_tx_id index for audit log tx_id filter queries',
  up: (sqlite) => {
    sqlite.exec('CREATE INDEX IF NOT EXISTS idx_audit_log_tx_id ON audit_log(tx_id)');
  },
});

// ---------------------------------------------------------------------------
// v37: Create webhooks + webhook_logs tables for webhook outbound (OPS-04)
// ---------------------------------------------------------------------------

MIGRATIONS.push({
  version: 37,
  description: 'Create webhooks and webhook_logs tables for webhook outbound (OPS-04)',
  up: (sqlite) => {
    // Enable foreign keys for CASCADE support
    sqlite.exec('PRAGMA foreign_keys = ON');

    // Table 20: webhooks -- webhook subscription registry
    sqlite.exec(`CREATE TABLE IF NOT EXISTS webhooks (
  id TEXT PRIMARY KEY,
  url TEXT NOT NULL,
  secret_hash TEXT NOT NULL,
  secret_encrypted TEXT NOT NULL,
  events TEXT NOT NULL DEFAULT '[]',
  description TEXT,
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
)`);

    sqlite.exec('CREATE INDEX IF NOT EXISTS idx_webhooks_enabled ON webhooks(enabled)');

    // Table 21: webhook_logs -- webhook delivery attempt history
    sqlite.exec(`CREATE TABLE IF NOT EXISTS webhook_logs (
  id TEXT PRIMARY KEY,
  webhook_id TEXT NOT NULL REFERENCES webhooks(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('success', 'failed')),
  http_status INTEGER,
  attempt INTEGER NOT NULL DEFAULT 1,
  error TEXT,
  request_duration INTEGER,
  created_at INTEGER NOT NULL
)`);

    sqlite.exec('CREATE INDEX IF NOT EXISTS idx_webhook_logs_webhook_id ON webhook_logs(webhook_id)');
    sqlite.exec('CREATE INDEX IF NOT EXISTS idx_webhook_logs_event_type ON webhook_logs(event_type)');
    sqlite.exec('CREATE INDEX IF NOT EXISTS idx_webhook_logs_status ON webhook_logs(status)');
    sqlite.exec('CREATE INDEX IF NOT EXISTS idx_webhook_logs_created_at ON webhook_logs(created_at)');
  },
});

// ---------------------------------------------------------------------------
// v38: Add smart account columns to wallets table (ERC-4337 Account Abstraction)
// ---------------------------------------------------------------------------

MIGRATIONS.push({
  version: 38,
  description: 'Add smart account columns to wallets table (account_type, signer_key, deployed, entry_point)',
  up: (sqlite) => {
    sqlite.exec(`ALTER TABLE wallets ADD COLUMN account_type TEXT NOT NULL DEFAULT 'eoa'`);
    sqlite.exec(`ALTER TABLE wallets ADD COLUMN signer_key TEXT`);
    sqlite.exec(`ALTER TABLE wallets ADD COLUMN deployed INTEGER NOT NULL DEFAULT 1`);
    sqlite.exec(`ALTER TABLE wallets ADD COLUMN entry_point TEXT`);
  },
});

// v39: ERC-8004 Trustless Agents Foundation
// Creates agent_identities + reputation_cache tables, adds pending_approvals.approval_type,
// recreates policies table with REPUTATION_THRESHOLD in CHECK constraint.
MIGRATIONS.push({
  version: 39,
  description: 'ERC-8004: agent_identities + reputation_cache + pending_approvals.approval_type + policies CHECK update',
  managesOwnTransaction: true,
  up: (sqlite) => {
    sqlite.exec('BEGIN');

    // Step 1: Create agent_identities table
    sqlite.exec(`CREATE TABLE IF NOT EXISTS agent_identities (
  id TEXT PRIMARY KEY,
  wallet_id TEXT NOT NULL REFERENCES wallets(id) ON DELETE CASCADE,
  chain_agent_id TEXT NOT NULL,
  registry_address TEXT NOT NULL,
  chain_id INTEGER NOT NULL,
  agent_uri TEXT,
  registration_file_url TEXT,
  status TEXT NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING', 'REGISTERED', 'WALLET_LINKED', 'DEREGISTERED')),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
)`);
    sqlite.exec('CREATE INDEX IF NOT EXISTS idx_agent_identities_wallet ON agent_identities(wallet_id)');
    sqlite.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_identities_chain ON agent_identities(registry_address, chain_agent_id)');

    // Step 2: Create reputation_cache table
    sqlite.exec(`CREATE TABLE IF NOT EXISTS reputation_cache (
  agent_id TEXT NOT NULL,
  registry_address TEXT NOT NULL,
  tag1 TEXT NOT NULL DEFAULT '',
  tag2 TEXT NOT NULL DEFAULT '',
  score INTEGER NOT NULL,
  score_decimals INTEGER NOT NULL DEFAULT 0,
  feedback_count INTEGER NOT NULL DEFAULT 0,
  cached_at INTEGER NOT NULL,
  PRIMARY KEY (agent_id, registry_address, tag1, tag2)
)`);

    // Step 3: Add approval_type to pending_approvals
    sqlite.exec("ALTER TABLE pending_approvals ADD COLUMN approval_type TEXT NOT NULL DEFAULT 'SIWE' CHECK (approval_type IN ('SIWE', 'EIP712'))");

    // Step 4: Recreate policies table with REPUTATION_THRESHOLD in CHECK constraint
    // Uses same pattern as v11, v20, v27, v33 (INSERT → DROP → RENAME)
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
    sqlite.exec('INSERT INTO policies_new SELECT * FROM policies');
    sqlite.exec('DROP TABLE policies');
    sqlite.exec('ALTER TABLE policies_new RENAME TO policies');
    sqlite.exec('CREATE INDEX IF NOT EXISTS idx_policies_wallet_enabled ON policies(wallet_id, enabled)');
    sqlite.exec('CREATE INDEX IF NOT EXISTS idx_policies_type ON policies(type)');
    sqlite.exec('CREATE INDEX IF NOT EXISTS idx_policies_network ON policies(network)');

    sqlite.exec('COMMIT');
  },
});

// ---------------------------------------------------------------------------
// v40: Add typed_data_json column to pending_approvals for EIP-712 approval flow
// ---------------------------------------------------------------------------

MIGRATIONS.push({
  version: 40,
  description: 'ERC-8004: pending_approvals.typed_data_json for EIP-712 approval payloads',
  up: (sqlite) => {
    sqlite.exec(
      "ALTER TABLE pending_approvals ADD COLUMN typed_data_json TEXT",
    );
  },
});

// ---------------------------------------------------------------------------
// v41: Smart Account per-wallet provider columns (v30.9)
// ---------------------------------------------------------------------------

MIGRATIONS.push({
  version: 41,
  description: 'Smart Account per-wallet provider: aa_provider, aa_provider_api_key_encrypted, aa_bundler_url, aa_paymaster_url',
  up: (sqlite) => {
    // Skip if columns already exist (e.g. fresh DDL via pushSchema includes them)
    const columns = sqlite
      .prepare("PRAGMA table_info('wallets')")
      .all() as Array<{ name: string }>;
    const has = (name: string) => columns.some((c) => c.name === name);

    if (!has('aa_provider')) {
      sqlite.exec("ALTER TABLE wallets ADD COLUMN aa_provider TEXT CHECK (aa_provider IS NULL OR aa_provider IN ('pimlico', 'alchemy', 'custom'))");
    }
    if (!has('aa_provider_api_key_encrypted')) {
      sqlite.exec("ALTER TABLE wallets ADD COLUMN aa_provider_api_key_encrypted TEXT");
    }
    if (!has('aa_bundler_url')) {
      sqlite.exec("ALTER TABLE wallets ADD COLUMN aa_bundler_url TEXT");
    }
    if (!has('aa_paymaster_url')) {
      sqlite.exec("ALTER TABLE wallets ADD COLUMN aa_paymaster_url TEXT");
    }
  },
});

// ---------------------------------------------------------------------------
// v42: Seed all 10 action provider _enabled defaults to true
// ---------------------------------------------------------------------------

MIGRATIONS.push({
  version: 42,
  description: 'Seed all 10 action provider _enabled defaults to true (INSERT OR IGNORE preserves existing)',
  up: (sqlite) => {
    const keys = [
      'actions.jupiter_swap_enabled',
      'actions.zerox_swap_enabled',
      'actions.lifi_enabled',
      'actions.lido_staking_enabled',
      'actions.jito_staking_enabled',
      'actions.aave_v3_enabled',
      'actions.kamino_enabled',
      'actions.pendle_yield_enabled',
      'actions.drift_enabled',
      'actions.erc8004_agent_enabled',
    ];
    const now = Math.floor(Date.now() / 1000);
    const stmt = sqlite.prepare(
      "INSERT OR IGNORE INTO settings (key, value, encrypted, category, updated_at) VALUES (?, 'true', 0, 'actions', ?)",
    );
    for (const key of keys) {
      stmt.run(key, now);
    }
  },
});

// ---------------------------------------------------------------------------
// #252: Paymaster Policy ID column
// ---------------------------------------------------------------------------
MIGRATIONS.push({
  version: 43,
  description: 'Add aa_paymaster_policy_id column to wallets for paymaster context (sponsorshipPolicyId)',
  up: (sqlite) => {
    const cols = sqlite.pragma('table_info(wallets)') as Array<{ name: string }>;
    const has = (n: string) => cols.some((c) => c.name === n);
    if (!has('aa_paymaster_policy_id')) {
      sqlite.exec('ALTER TABLE wallets ADD COLUMN aa_paymaster_policy_id TEXT');
    }
  },
});

// v44: Create nft_metadata_cache table for NFT metadata caching (24h TTL)
MIGRATIONS.push({
  version: 44,
  description: 'Create nft_metadata_cache table for NFT metadata caching (24h TTL)',
  up: (sqlite) => {
    sqlite.exec(`
      CREATE TABLE IF NOT EXISTS nft_metadata_cache (
        id TEXT PRIMARY KEY,
        contract_address TEXT NOT NULL,
        token_id TEXT NOT NULL,
        chain TEXT NOT NULL CHECK (chain IN (${inList(CHAIN_TYPES)})),
        network TEXT NOT NULL CHECK (network IN (${inList(NETWORK_TYPES)})),
        metadata_json TEXT NOT NULL,
        cached_at INTEGER NOT NULL,
        expires_at INTEGER NOT NULL
      )
    `);
    sqlite.exec(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_nft_cache_unique
      ON nft_metadata_cache (contract_address, token_id, chain, network)
    `);
    sqlite.exec(`
      CREATE INDEX IF NOT EXISTS idx_nft_cache_expires
      ON nft_metadata_cache (expires_at)
    `);
  },
});

// v45: Create userop_builds table for UserOp Build/Sign API (v31.2)
MIGRATIONS.push({
  version: 45,
  description: 'Create userop_builds table for UserOp Build/Sign API',
  up: (sqlite) => {
    sqlite.exec(`
      CREATE TABLE IF NOT EXISTS userop_builds (
        id TEXT PRIMARY KEY,
        wallet_id TEXT NOT NULL,
        call_data TEXT NOT NULL,
        sender TEXT NOT NULL,
        nonce TEXT NOT NULL,
        entry_point TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        expires_at INTEGER NOT NULL,
        used INTEGER NOT NULL DEFAULT 0 CHECK (used IN (0, 1))
      )
    `);
    sqlite.exec('CREATE INDEX IF NOT EXISTS idx_userop_builds_wallet_id ON userop_builds(wallet_id)');
    sqlite.exec('CREATE INDEX IF NOT EXISTS idx_userop_builds_expires ON userop_builds(expires_at)');
  },
});

// ── v46: Backfill CONTRACT_CALL amount from metadata (#260) ──────────
MIGRATIONS.push({
  version: 46,
  description: 'Backfill CONTRACT_CALL amount from metadata.originalRequest.value',
  up: (sqlite) => {
    sqlite.exec(`
      UPDATE transactions
      SET amount = json_extract(metadata, '$.originalRequest.value')
      WHERE type = 'CONTRACT_CALL'
        AND amount IS NULL
        AND json_extract(metadata, '$.originalRequest.value') IS NOT NULL
    `);
  },
});

// ── v47: Add factory_address column to wallets (#256) ────────────────
MIGRATIONS.push({
  version: 47,
  description: 'Add factory_address column to wallets for multichain Smart Account factory tracking',
  up: (sqlite) => {
    // Add nullable factory_address column
    sqlite.exec(`ALTER TABLE wallets ADD COLUMN factory_address TEXT`);

    // Backfill: existing smart accounts used the Solady factory
    sqlite.exec(`
      UPDATE wallets
      SET factory_address = '0x5d82735936c6Cd5DE57cC3c1A799f6B2E6F933Df'
      WHERE account_type = 'smart' AND factory_address IS NULL
    `);
  },
});

// ── v48: Purge mock defi_positions data from Kamino/Drift (#263/#269) ──
MIGRATIONS.push({
  version: 48,
  description: 'Purge mock defi_positions data from Kamino/Drift (#263)',
  up: (sqlite) => {
    sqlite.exec(`DELETE FROM defi_positions WHERE provider IN ('kamino', 'drift_perp')`);
  },
});

// ── v49: Fix bugged smart account wallets — convert to EOA (#272) ─────
MIGRATIONS.push({
  version: 49,
  description: 'Convert bugged smart account wallets (missing signerKey) to EOA (#272)',
  up: (sqlite) => {
    // Smart account wallets created while smartAccountService was not injected
    // have accountType='smart' but signerKey=NULL (signer_key column).
    // Their publicKey is already the EOA address, so convert them to EOA type.
    sqlite.exec(`
      UPDATE wallets
      SET account_type = 'eoa',
          deployed = 1,
          entry_point = NULL,
          factory_address = NULL
      WHERE account_type = 'smart' AND signer_key IS NULL
    `);
  },
});

// ── v50: Add network column to userop_builds (#279) ──────────────────
MIGRATIONS.push({
  version: 50,
  description: 'Add network column to userop_builds for Sign route RPC resolve (#279)',
  up: (sqlite) => {
    sqlite.exec(`ALTER TABLE userop_builds ADD COLUMN network TEXT`);
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
