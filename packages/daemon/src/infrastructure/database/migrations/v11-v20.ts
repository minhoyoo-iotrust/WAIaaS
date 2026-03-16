/**
 * Database migrations v11 through v20.
 *
 * v11: api_keys table
 * v12: X402_PAYMENT + X402_ALLOWED_DOMAINS CHECK constraints
 * v13: amount_usd + reserved_amount_usd columns
 * v14: kill_switch_state value migration
 * v15: telegram_users table
 * v16: WC infra (wc_sessions, wc_store, approval_channel)
 * v17: sessions.source column
 * v18: wallets.owner_approval_method column
 * v19: session_wallets junction table + sessions.wallet_id removal
 * v20: sessions.token_issued_count column
 */

import type { Database } from 'better-sqlite3';
import type { Migration } from '../migrate.js';
import {
  TRANSACTION_STATUSES,
  TRANSACTION_TYPES,
  POLICY_TYPES,
  POLICY_TIERS,
} from '@waiaas/core';
import { inList, NETWORK_TYPES_WITH_LEGACY } from '../schema-ddl.js';

export const migrations: Migration[] = [
  // v11: api_keys table
  {
    version: 11,
    description: 'Add api_keys table for Action Provider API key storage',
    up: (sqlite: Database) => {
      sqlite.exec(`CREATE TABLE IF NOT EXISTS api_keys (
  provider_name TEXT PRIMARY KEY,
  encrypted_key TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
)`);
    },
  },

  // v12: X402_PAYMENT + X402_ALLOWED_DOMAINS
  {
    version: 12,
    description:
      'Add X402_PAYMENT to transactions and X402_ALLOWED_DOMAINS to policies CHECK constraints',
    managesOwnTransaction: true,
    up: (sqlite: Database) => {
      sqlite.exec('BEGIN');

      try {
        // transactions table recreation
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

        // policies table recreation
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

      sqlite.pragma('foreign_keys = ON');
      const fkErrors = sqlite.pragma('foreign_key_check') as unknown[];
      if (fkErrors.length > 0) {
        throw new Error(
          `FK integrity violation after v12: ${JSON.stringify(fkErrors)}`,
        );
      }
    },
  },

  // v13: amount_usd columns
  {
    version: 13,
    description: 'Add amount_usd and reserved_amount_usd columns to transactions',
    up: (sqlite: Database) => {
      sqlite.exec('ALTER TABLE transactions ADD COLUMN amount_usd REAL');
      sqlite.exec('ALTER TABLE transactions ADD COLUMN reserved_amount_usd REAL');
    },
  },

  // v14: kill_switch_state migration
  {
    version: 14,
    description:
      'Migrate kill_switch_state values: NORMAL->ACTIVE, ACTIVATED->SUSPENDED',
    up: (sqlite: Database) => {
      const now = Math.floor(Date.now() / 1000);

      sqlite
        .prepare(
          "UPDATE key_value_store SET value = 'ACTIVE', updated_at = ? WHERE key = 'kill_switch_state' AND value = 'NORMAL'",
        )
        .run(now);

      sqlite
        .prepare(
          "UPDATE key_value_store SET value = 'SUSPENDED', updated_at = ? WHERE key = 'kill_switch_state' AND value = 'ACTIVATED'",
        )
        .run(now);

      sqlite
        .prepare(
          "UPDATE key_value_store SET value = 'ACTIVE', updated_at = ? WHERE key = 'kill_switch_state' AND value = 'RECOVERING'",
        )
        .run(now);
    },
  },

  // v15: telegram_users table
  {
    version: 15,
    description: 'Create telegram_users table for Telegram Bot user management',
    up: (sqlite: Database) => {
      sqlite.exec(`CREATE TABLE IF NOT EXISTS telegram_users (
  chat_id INTEGER PRIMARY KEY,
  username TEXT,
  role TEXT NOT NULL DEFAULT 'PENDING' CHECK (role IN ('PENDING', 'ADMIN', 'READONLY')),
  registered_at INTEGER NOT NULL,
  approved_at INTEGER
)`);
      sqlite.exec('CREATE INDEX IF NOT EXISTS idx_telegram_users_role ON telegram_users(role)');
    },
  },

  // v16: WC infra
  {
    version: 16,
    description:
      'Add WC infra: wc_sessions table, wc_store table, pending_approvals.approval_channel',
    up: (sqlite: Database) => {
      sqlite.exec(
        "ALTER TABLE pending_approvals ADD COLUMN approval_channel TEXT DEFAULT 'rest_api'",
      );

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

      sqlite.exec(`CREATE TABLE IF NOT EXISTS wc_store (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
)`);
    },
  },

  // v17: sessions.source column
  {
    version: 17,
    description: 'Add source column to sessions table (api/mcp)',
    up: (sqlite: Database) => {
      sqlite.exec("ALTER TABLE sessions ADD COLUMN source TEXT NOT NULL DEFAULT 'api'");
    },
  },

  // v18: wallets.owner_approval_method
  {
    version: 18,
    description: 'Add owner_approval_method column to wallets table',
    up: (sqlite: Database) => {
      sqlite.exec('ALTER TABLE wallets ADD COLUMN owner_approval_method TEXT');
    },
  },

  // v19: session_wallets junction table
  {
    version: 19,
    description: 'Create session_wallets junction table, migrate sessions.wallet_id, drop wallet_id column',
    managesOwnTransaction: true,
    up: (sqlite: Database) => {
      sqlite.exec('BEGIN');
      try {
        sqlite.exec(`CREATE TABLE session_wallets (
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  wallet_id TEXT NOT NULL REFERENCES wallets(id) ON DELETE CASCADE,
  is_default INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (session_id, wallet_id)
)`);
        sqlite.exec('CREATE INDEX idx_session_wallets_session ON session_wallets(session_id)');
        sqlite.exec('CREATE INDEX idx_session_wallets_wallet ON session_wallets(wallet_id)');

        sqlite.exec(`INSERT INTO session_wallets (session_id, wallet_id, is_default, created_at)
  SELECT id, wallet_id, 1, CAST(strftime('%s', 'now') AS INTEGER)
  FROM sessions
  WHERE wallet_id IS NOT NULL`);

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

        sqlite.exec(`INSERT INTO sessions_new (id, token_hash, expires_at, constraints, usage_stats, revoked_at, renewal_count, max_renewals, last_renewed_at, absolute_expires_at, created_at, source)
  SELECT id, token_hash, expires_at, constraints, usage_stats, revoked_at, renewal_count, max_renewals, last_renewed_at, absolute_expires_at, created_at, source
  FROM sessions`);

        sqlite.exec('DROP TABLE sessions');
        sqlite.exec('ALTER TABLE sessions_new RENAME TO sessions');

        sqlite.exec('CREATE INDEX idx_sessions_expires_at ON sessions(expires_at)');
        sqlite.exec('CREATE INDEX idx_sessions_token_hash ON sessions(token_hash)');

        // Recreate transactions for FK reconnection
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
        throw new Error(`FK integrity violation after v19: ${JSON.stringify(fkErrors)}`);
      }
    },
  },

  // v20: sessions.token_issued_count
  {
    version: 20,
    description: 'Add token_issued_count column to sessions table',
    up: (sqlite: Database) => {
      sqlite.exec('ALTER TABLE sessions ADD COLUMN token_issued_count INTEGER NOT NULL DEFAULT 1');
    },
  },
];
