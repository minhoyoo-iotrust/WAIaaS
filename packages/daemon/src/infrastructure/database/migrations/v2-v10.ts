/**
 * Database migrations v2 through v10.
 *
 * v2: Expand agents.network CHECK to include EVM networks
 * v3: Rename agents to wallets (table, FK columns, indexes, enum data)
 * v4: Create token_registry table
 * v5: Create settings table
 * v6 (version 6): Add network column to transactions with backfill
 * v6b (version 7): Replace wallets.network with environment + default_network
 * v8: Add network column to policies
 * v9: Add SIGNED status and SIGN type to transactions CHECK
 * v10: Add message column to notification_logs
 */

import type { Database } from 'better-sqlite3';
import type { Migration } from '../migrate.js';
import {
  WALLET_STATUSES,
  CHAIN_TYPES,
  ENVIRONMENT_TYPES,
  TRANSACTION_STATUSES,
  TRANSACTION_TYPES,
  POLICY_TYPES,
  POLICY_TIERS,
  NOTIFICATION_LOG_STATUSES,
} from '@waiaas/core';
import { inList, NETWORK_TYPES_WITH_LEGACY } from '../schema-ddl.js';

export const migrations: Migration[] = [
  // ---------------------------------------------------------------------------
  // v2: Expand agents.network CHECK to include EVM networks
  // ---------------------------------------------------------------------------
  {
    version: 2,
    description: 'Expand agents network CHECK to include EVM networks',
    managesOwnTransaction: true,
    up: (sqlite: Database) => {
      sqlite.exec('BEGIN');

      try {
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

        sqlite.exec('INSERT INTO agents_new SELECT * FROM agents');
        sqlite.exec('DROP TABLE agents');
        sqlite.exec('ALTER TABLE agents_new RENAME TO agents');

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

        sqlite.exec('COMMIT');
      } catch (err) {
        sqlite.exec('ROLLBACK');
        throw err;
      }

      sqlite.pragma('foreign_keys = ON');

      const fkErrors = sqlite.pragma('foreign_key_check') as unknown[];
      if (fkErrors.length > 0) {
        throw new Error(
          `FK integrity check failed after v2 migration: ${JSON.stringify(fkErrors)}`,
        );
      }
    },
  },

  // ---------------------------------------------------------------------------
  // v3: Rename agents to wallets
  // ---------------------------------------------------------------------------
  {
    version: 3,
    description: 'Rename agents to wallets (table, FK columns, indexes, enum data)',
    managesOwnTransaction: true,
    up: (sqlite: Database) => {
      sqlite.exec('BEGIN');

      try {
        sqlite.exec('ALTER TABLE agents RENAME TO wallets');

        sqlite.exec('DROP INDEX IF EXISTS idx_agents_public_key');
        sqlite.exec('DROP INDEX IF EXISTS idx_agents_status');
        sqlite.exec('DROP INDEX IF EXISTS idx_agents_chain_network');
        sqlite.exec('DROP INDEX IF EXISTS idx_agents_owner_address');

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

        // Recreate all indexes
        sqlite.exec('CREATE UNIQUE INDEX idx_wallets_public_key ON wallets(public_key)');
        sqlite.exec('CREATE INDEX idx_wallets_status ON wallets(status)');
        sqlite.exec('CREATE INDEX idx_wallets_chain_network ON wallets(chain, network)');
        sqlite.exec('CREATE INDEX idx_wallets_owner_address ON wallets(owner_address)');

        sqlite.exec('CREATE INDEX idx_sessions_wallet_id ON sessions(wallet_id)');
        sqlite.exec('CREATE INDEX idx_sessions_expires_at ON sessions(expires_at)');
        sqlite.exec('CREATE INDEX idx_sessions_token_hash ON sessions(token_hash)');

        sqlite.exec('CREATE INDEX idx_transactions_wallet_status ON transactions(wallet_id, status)');
        sqlite.exec('CREATE INDEX idx_transactions_session_id ON transactions(session_id)');
        sqlite.exec('CREATE UNIQUE INDEX idx_transactions_tx_hash ON transactions(tx_hash)');
        sqlite.exec('CREATE INDEX idx_transactions_queued_at ON transactions(queued_at)');
        sqlite.exec('CREATE INDEX idx_transactions_created_at ON transactions(created_at)');
        sqlite.exec('CREATE INDEX idx_transactions_type ON transactions(type)');
        sqlite.exec('CREATE INDEX idx_transactions_contract_address ON transactions(contract_address)');
        sqlite.exec('CREATE INDEX idx_transactions_parent_id ON transactions(parent_id)');

        sqlite.exec('CREATE INDEX idx_policies_wallet_enabled ON policies(wallet_id, enabled)');
        sqlite.exec('CREATE INDEX idx_policies_type ON policies(type)');

        sqlite.exec('CREATE INDEX idx_audit_log_timestamp ON audit_log(timestamp)');
        sqlite.exec('CREATE INDEX idx_audit_log_event_type ON audit_log(event_type)');
        sqlite.exec('CREATE INDEX idx_audit_log_wallet_id ON audit_log(wallet_id)');
        sqlite.exec('CREATE INDEX idx_audit_log_severity ON audit_log(severity)');
        sqlite.exec('CREATE INDEX idx_audit_log_wallet_timestamp ON audit_log(wallet_id, timestamp)');

        sqlite.exec('CREATE INDEX idx_notification_logs_event_type ON notification_logs(event_type)');
        sqlite.exec('CREATE INDEX idx_notification_logs_wallet_id ON notification_logs(wallet_id)');
        sqlite.exec('CREATE INDEX idx_notification_logs_status ON notification_logs(status)');
        sqlite.exec('CREATE INDEX idx_notification_logs_created_at ON notification_logs(created_at)');

        // Update enum data
        sqlite.exec("UPDATE audit_log SET event_type = 'WALLET_CREATED' WHERE event_type = 'AGENT_CREATED'");
        sqlite.exec("UPDATE audit_log SET event_type = 'WALLET_ACTIVATED' WHERE event_type = 'AGENT_ACTIVATED'");
        sqlite.exec("UPDATE audit_log SET event_type = 'WALLET_SUSPENDED' WHERE event_type = 'AGENT_SUSPENDED'");
        sqlite.exec("UPDATE audit_log SET event_type = 'WALLET_TERMINATED' WHERE event_type = 'AGENT_TERMINATED'");

        sqlite.exec("UPDATE notification_logs SET event_type = 'WALLET_SUSPENDED' WHERE event_type = 'AGENT_SUSPENDED'");

        sqlite.exec('COMMIT');
      } catch (err) {
        sqlite.exec('ROLLBACK');
        throw err;
      }

      sqlite.pragma('foreign_keys = ON');
      const fkErrors = sqlite.pragma('foreign_key_check') as unknown[];
      if (fkErrors.length > 0) {
        throw new Error(
          `FK integrity check failed after v3 migration: ${JSON.stringify(fkErrors)}`,
        );
      }
    },
  },

  // v4: Create token_registry table
  {
    version: 4,
    description: 'Create token_registry table for EVM token management',
    up: (sqlite: Database) => {
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
  },

  // v5: Create settings table
  {
    version: 5,
    description: 'Create settings table for operational config DB storage',
    up: (sqlite: Database) => {
      sqlite.exec(`CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  encrypted INTEGER NOT NULL DEFAULT 0 CHECK (encrypted IN (0, 1)),
  category TEXT NOT NULL,
  updated_at INTEGER NOT NULL
)`);
      sqlite.exec('CREATE INDEX IF NOT EXISTS idx_settings_category ON settings(category)');
    },
  },

  // v6a: Add network column to transactions
  {
    version: 6,
    description: 'Add network column to transactions with backfill from wallets',
    managesOwnTransaction: false,
    up: (sqlite: Database) => {
      sqlite.exec('ALTER TABLE transactions ADD COLUMN network TEXT');
      sqlite.exec(`UPDATE transactions SET network = (
      SELECT w.network FROM wallets w WHERE w.id = transactions.wallet_id
    )`);
    },
  },

  // v6b (version 7): Replace wallets.network with environment + default_network
  {
    version: 7,
    description: 'Replace wallets.network with environment + default_network (12-step recreation)',
    managesOwnTransaction: true,
    up: (sqlite: Database) => {
      sqlite.exec('BEGIN');

      try {
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

        sqlite.exec('DROP TABLE wallets');
        sqlite.exec('ALTER TABLE wallets_new RENAME TO wallets');

        sqlite.exec('DROP INDEX IF EXISTS idx_wallets_chain_network');
        sqlite.exec('CREATE UNIQUE INDEX idx_wallets_public_key ON wallets(public_key)');
        sqlite.exec('CREATE INDEX idx_wallets_status ON wallets(status)');
        sqlite.exec('CREATE INDEX idx_wallets_chain_environment ON wallets(chain, environment)');
        sqlite.exec('CREATE INDEX idx_wallets_owner_address ON wallets(owner_address)');

        // Recreate sessions (FK reconnection)
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

        // Recreate transactions (network column with CHECK)
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

        // Recreate policies (FK reconnection)
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

        // Recreate audit_log
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

        sqlite.exec('COMMIT');
      } catch (err) {
        sqlite.exec('ROLLBACK');
        throw err;
      }

      sqlite.pragma('foreign_keys = ON');
      const fkErrors = sqlite.pragma('foreign_key_check') as unknown[];
      if (fkErrors.length > 0) {
        throw new Error(`FK integrity violation after v6b: ${JSON.stringify(fkErrors)}`);
      }
    },
  },

  // v8: Add network column to policies
  {
    version: 8,
    description: 'Add network column to policies and ALLOWED_NETWORKS type support',
    managesOwnTransaction: true,
    up: (sqlite: Database) => {
      sqlite.exec('BEGIN');

      try {
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

        sqlite.exec(`INSERT INTO policies_new (
  id, wallet_id, type, rules, priority, enabled, network, created_at, updated_at
)
SELECT
  id, wallet_id, type, rules, priority, enabled, NULL, created_at, updated_at
FROM policies`);

        sqlite.exec('DROP TABLE policies');
        sqlite.exec('ALTER TABLE policies_new RENAME TO policies');

        sqlite.exec('CREATE INDEX idx_policies_wallet_enabled ON policies(wallet_id, enabled)');
        sqlite.exec('CREATE INDEX idx_policies_type ON policies(type)');
        sqlite.exec('CREATE INDEX idx_policies_network ON policies(network)');

        sqlite.exec('COMMIT');
      } catch (err) {
        sqlite.exec('ROLLBACK');
        throw err;
      }

      sqlite.pragma('foreign_keys = ON');
      const fkErrors = sqlite.pragma('foreign_key_check') as unknown[];
      if (fkErrors.length > 0) {
        throw new Error(`FK integrity violation after v8: ${JSON.stringify(fkErrors)}`);
      }
    },
  },

  // v9: Add SIGNED status and SIGN type to transactions CHECK
  {
    version: 9,
    description: 'Add SIGNED status and SIGN type to transactions CHECK constraints',
    managesOwnTransaction: true,
    up: (sqlite: Database) => {
      sqlite.exec('BEGIN');

      try {
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

        sqlite.exec('COMMIT');
      } catch (err) {
        sqlite.exec('ROLLBACK');
        throw err;
      }

      sqlite.pragma('foreign_keys = ON');
      const fkErrors = sqlite.pragma('foreign_key_check') as unknown[];
      if (fkErrors.length > 0) {
        throw new Error(`FK integrity violation after v9: ${JSON.stringify(fkErrors)}`);
      }
    },
  },

  // v10: Add message column to notification_logs
  {
    version: 10,
    description: 'Add message column to notification_logs',
    up: (sqlite: Database) => {
      sqlite.exec('ALTER TABLE notification_logs ADD COLUMN message TEXT');
    },
  },
];
