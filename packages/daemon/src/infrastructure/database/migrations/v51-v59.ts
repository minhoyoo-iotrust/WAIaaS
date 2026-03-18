/**
 * Database migrations v51 through v60.
 *
 * v51: hyperliquid_orders table
 * v52: hyperliquid_sub_accounts table
 * v53: polymarket_orders table
 * v54: polymarket_positions + polymarket_api_keys tables
 * v55: wallet_credentials table
 * v56: transactions action tracking columns
 * v57: composite index for external action tracking
 * v58: CONTRACT_DEPLOY type CHECK constraint
 * v59: defi_positions.environment column
 * v60: Push Relay migration (push_relay_url, clear ntfy topics, sdk_ntfy -> sdk_push)
 */

import type { Database } from 'better-sqlite3';
import type { Migration } from '../migrate.js';
import {
  NETWORK_TYPES,
  TRANSACTION_STATUSES,
  TRANSACTION_TYPES,
  POLICY_TIERS,
  CHAIN_TYPES,
  ENVIRONMENT_TYPES,
  WALLET_STATUSES,
  ACCOUNT_TYPES,
} from '@waiaas/core';
import { inList } from '../schema-ddl.js';

export const migrations: Migration[] = [
  // v51: hyperliquid_orders
  {
    version: 51,
    description: 'Create hyperliquid_orders table for Hyperliquid DEX integration',
    up: (sqlite: Database) => {
      const tables = sqlite
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='hyperliquid_orders'")
        .all() as Array<{ name: string }>;
      if (tables.length > 0) return;

      sqlite.exec(`
      CREATE TABLE hyperliquid_orders (
        id TEXT PRIMARY KEY,
        wallet_id TEXT NOT NULL REFERENCES wallets(id),
        sub_account_address TEXT,
        oid INTEGER,
        cloid TEXT,
        transaction_id TEXT REFERENCES transactions(id),
        market TEXT NOT NULL,
        asset_index INTEGER NOT NULL,
        side TEXT NOT NULL CHECK(side IN ('BUY', 'SELL')),
        order_type TEXT NOT NULL CHECK(order_type IN ('MARKET', 'LIMIT', 'STOP_MARKET', 'STOP_LIMIT', 'TAKE_PROFIT')),
        size TEXT NOT NULL,
        price TEXT,
        trigger_price TEXT,
        tif TEXT CHECK(tif IN ('GTC', 'IOC', 'ALO')),
        reduce_only INTEGER NOT NULL DEFAULT 0,
        status TEXT NOT NULL CHECK(status IN ('PENDING', 'RESTING', 'FILLED', 'PARTIALLY_FILLED', 'CANCELLED', 'REJECTED', 'TRIGGERED')),
        filled_size TEXT,
        avg_fill_price TEXT,
        is_spot INTEGER NOT NULL DEFAULT 0,
        leverage INTEGER,
        margin_mode TEXT CHECK(margin_mode IN ('CROSS', 'ISOLATED')),
        response_data TEXT,
        created_at INTEGER NOT NULL DEFAULT (unixepoch()),
        updated_at INTEGER NOT NULL DEFAULT (unixepoch())
      );
      CREATE INDEX idx_hl_orders_wallet ON hyperliquid_orders(wallet_id);
      CREATE INDEX idx_hl_orders_oid ON hyperliquid_orders(oid);
      CREATE INDEX idx_hl_orders_market ON hyperliquid_orders(market);
      CREATE INDEX idx_hl_orders_status ON hyperliquid_orders(status);
      CREATE INDEX idx_hl_orders_created ON hyperliquid_orders(created_at);
    `);
    },
  },

  // v52: hyperliquid_sub_accounts
  {
    version: 52,
    description: 'Create hyperliquid_sub_accounts table for Hyperliquid Sub-account management',
    up: (sqlite: Database) => {
      const tables = sqlite
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='hyperliquid_sub_accounts'")
        .all() as Array<{ name: string }>;
      if (tables.length > 0) return;

      sqlite.exec(`
      CREATE TABLE hyperliquid_sub_accounts (
        id TEXT PRIMARY KEY,
        wallet_id TEXT NOT NULL REFERENCES wallets(id),
        sub_account_address TEXT NOT NULL,
        name TEXT,
        created_at INTEGER NOT NULL DEFAULT (unixepoch()),
        UNIQUE(wallet_id, sub_account_address)
      );
      CREATE INDEX idx_hl_sub_wallet ON hyperliquid_sub_accounts(wallet_id);
    `);
    },
  },

  // v53: polymarket_orders
  {
    version: 53,
    description: 'Create polymarket_orders table for Polymarket CLOB order tracking',
    up: (sqlite: Database) => {
      const tables = sqlite
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='polymarket_orders'")
        .all() as Array<{ name: string }>;
      if (tables.length > 0) return;

      sqlite.exec(`
      CREATE TABLE polymarket_orders (
        id TEXT PRIMARY KEY,
        wallet_id TEXT NOT NULL REFERENCES wallets(id),
        transaction_id TEXT REFERENCES transactions(id),
        condition_id TEXT NOT NULL,
        token_id TEXT NOT NULL,
        market_slug TEXT,
        outcome TEXT NOT NULL,
        order_id TEXT,
        side TEXT NOT NULL CHECK (side IN ('BUY', 'SELL')),
        order_type TEXT NOT NULL CHECK (order_type IN ('GTC', 'GTD', 'FOK', 'IOC')),
        price TEXT NOT NULL,
        size TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('PENDING', 'LIVE', 'MATCHED', 'PARTIALLY_FILLED', 'CANCELLED', 'EXPIRED')),
        filled_size TEXT,
        avg_fill_price TEXT,
        salt TEXT,
        maker_amount TEXT,
        taker_amount TEXT,
        signature_type INTEGER NOT NULL DEFAULT 0,
        fee_rate_bps INTEGER,
        expiration INTEGER,
        nonce TEXT,
        is_neg_risk INTEGER NOT NULL DEFAULT 0,
        response_data TEXT,
        created_at INTEGER NOT NULL DEFAULT (unixepoch()),
        updated_at INTEGER NOT NULL DEFAULT (unixepoch())
      );
      CREATE INDEX idx_pm_orders_wallet ON polymarket_orders(wallet_id);
      CREATE INDEX idx_pm_orders_order_id ON polymarket_orders(order_id);
      CREATE INDEX idx_pm_orders_condition ON polymarket_orders(condition_id);
      CREATE INDEX idx_pm_orders_status ON polymarket_orders(status);
      CREATE INDEX idx_pm_orders_created ON polymarket_orders(created_at);
    `);
    },
  },

  // v54: polymarket_positions + polymarket_api_keys
  {
    version: 54,
    description: 'Create polymarket_positions and polymarket_api_keys tables',
    up: (sqlite: Database) => {
      const posTables = sqlite
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='polymarket_positions'")
        .all() as Array<{ name: string }>;
      if (posTables.length === 0) {
        sqlite.exec(`
        CREATE TABLE polymarket_positions (
          id TEXT PRIMARY KEY,
          wallet_id TEXT NOT NULL REFERENCES wallets(id),
          condition_id TEXT NOT NULL,
          token_id TEXT NOT NULL,
          market_slug TEXT,
          outcome TEXT NOT NULL CHECK (outcome IN ('YES', 'NO')),
          size TEXT NOT NULL DEFAULT '0',
          avg_price TEXT,
          realized_pnl TEXT DEFAULT '0',
          market_resolved INTEGER NOT NULL DEFAULT 0,
          winning_outcome TEXT,
          is_neg_risk INTEGER NOT NULL DEFAULT 0,
          created_at INTEGER NOT NULL DEFAULT (unixepoch()),
          updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
          UNIQUE(wallet_id, token_id)
        );
        CREATE INDEX idx_pm_positions_wallet ON polymarket_positions(wallet_id);
        CREATE INDEX idx_pm_positions_condition ON polymarket_positions(condition_id);
        CREATE INDEX idx_pm_positions_resolved ON polymarket_positions(market_resolved);
      `);
      }

      const keyTables = sqlite
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='polymarket_api_keys'")
        .all() as Array<{ name: string }>;
      if (keyTables.length === 0) {
        sqlite.exec(`
        CREATE TABLE polymarket_api_keys (
          id TEXT PRIMARY KEY,
          wallet_id TEXT NOT NULL REFERENCES wallets(id),
          api_key TEXT NOT NULL,
          api_secret_encrypted TEXT NOT NULL,
          api_passphrase_encrypted TEXT NOT NULL,
          signature_type INTEGER NOT NULL DEFAULT 0,
          proxy_address TEXT,
          created_at INTEGER NOT NULL DEFAULT (unixepoch()),
          UNIQUE(wallet_id)
        );
      `);
      }
    },
  },

  // v55: wallet_credentials
  {
    version: 55,
    description: 'Create wallet_credentials table for External Action credential vault',
    up: (sqlite: Database) => {
      const tables = sqlite
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='wallet_credentials'")
        .all() as Array<{ name: string }>;
      if (tables.length > 0) return;

      sqlite.exec(`
      CREATE TABLE wallet_credentials (
        id TEXT NOT NULL PRIMARY KEY,
        wallet_id TEXT,
        type TEXT NOT NULL CHECK (type IN ('api-key','hmac-secret','rsa-private-key','session-token','custom')),
        name TEXT NOT NULL,
        encrypted_value BLOB NOT NULL,
        iv BLOB NOT NULL,
        auth_tag BLOB NOT NULL,
        metadata TEXT NOT NULL DEFAULT '{}',
        expires_at INTEGER,
        created_at INTEGER NOT NULL DEFAULT (unixepoch()),
        updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
        FOREIGN KEY (wallet_id) REFERENCES wallets(id) ON DELETE CASCADE
      );
      CREATE UNIQUE INDEX idx_wallet_credentials_wallet_name ON wallet_credentials(wallet_id, name);
      CREATE INDEX idx_wallet_credentials_global_name ON wallet_credentials(name) WHERE wallet_id IS NULL;
      CREATE INDEX idx_wallet_credentials_wallet_id ON wallet_credentials(wallet_id);
      CREATE INDEX idx_wallet_credentials_expires_at ON wallet_credentials(expires_at) WHERE expires_at IS NOT NULL;
    `);
    },
  },

  // v56: transactions action tracking columns
  {
    version: 56,
    description: 'Add action_kind, venue, operation, external_id columns to transactions',
    up: (sqlite: Database) => {
      const cols = (sqlite.prepare('PRAGMA table_info(transactions)').all() as Array<{ name: string }>)
        .map(c => c.name);

      if (!cols.includes('action_kind')) {
        sqlite.exec("ALTER TABLE transactions ADD COLUMN action_kind TEXT NOT NULL DEFAULT 'contractCall'");
      }
      if (!cols.includes('venue')) {
        sqlite.exec('ALTER TABLE transactions ADD COLUMN venue TEXT');
      }
      if (!cols.includes('operation')) {
        sqlite.exec('ALTER TABLE transactions ADD COLUMN operation TEXT');
      }
      if (!cols.includes('external_id')) {
        sqlite.exec('ALTER TABLE transactions ADD COLUMN external_id TEXT');
      }

      sqlite.exec('CREATE INDEX IF NOT EXISTS idx_transactions_action_kind ON transactions(action_kind)');
      sqlite.exec('CREATE INDEX IF NOT EXISTS idx_transactions_venue ON transactions(venue) WHERE venue IS NOT NULL');
      sqlite.exec('CREATE INDEX IF NOT EXISTS idx_transactions_external_id ON transactions(external_id) WHERE external_id IS NOT NULL');
    },
  },

  // v57: composite index
  {
    version: 57,
    description: 'Add composite index idx_transactions_action_kind_bridge_status',
    up: (sqlite: Database) => {
      sqlite.exec(
        'CREATE INDEX IF NOT EXISTS idx_transactions_action_kind_bridge_status ON transactions(action_kind, bridge_status) WHERE bridge_status IS NOT NULL',
      );
    },
  },

  // v58: CONTRACT_DEPLOY type CHECK
  {
    version: 58,
    description: 'Add CONTRACT_DEPLOY to transactions type CHECK constraint (12-step table recreation)',
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
  amount_usd REAL,
  reserved_amount_usd REAL,
  error TEXT,
  metadata TEXT,
  network TEXT CHECK (network IS NULL OR network IN (${inList(NETWORK_TYPES)})),
  bridge_status TEXT CHECK (bridge_status IS NULL OR bridge_status IN ('PENDING', 'COMPLETED', 'FAILED', 'BRIDGE_MONITORING', 'TIMEOUT', 'REFUNDED', 'PARTIALLY_FILLED', 'FILLED', 'CANCELED', 'SETTLED', 'EXPIRED')),
  bridge_metadata TEXT,
  action_kind TEXT NOT NULL DEFAULT 'contractCall',
  venue TEXT,
  operation TEXT,
  external_id TEXT
)`);

        sqlite.exec(`INSERT INTO transactions_new (id, wallet_id, session_id, chain, tx_hash, type, amount, to_address, token_mint, contract_address, method_signature, spender_address, approved_amount, parent_id, batch_index, status, tier, queued_at, executed_at, created_at, reserved_amount, amount_usd, reserved_amount_usd, error, metadata, network, bridge_status, bridge_metadata, action_kind, venue, operation, external_id)
  SELECT id, wallet_id, session_id, chain, tx_hash, type, amount, to_address, token_mint, contract_address, method_signature, spender_address, approved_amount, parent_id, batch_index, status, tier, queued_at, executed_at, created_at, reserved_amount, amount_usd, reserved_amount_usd, error, metadata, network, bridge_status, bridge_metadata, action_kind, venue, operation, external_id FROM transactions`);

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
        sqlite.exec("CREATE INDEX idx_transactions_bridge_status ON transactions(bridge_status) WHERE bridge_status IS NOT NULL");
        sqlite.exec("CREATE INDEX idx_transactions_gas_waiting ON transactions(status) WHERE status = 'GAS_WAITING'");
        sqlite.exec('CREATE INDEX idx_transactions_action_kind ON transactions(action_kind)');
        sqlite.exec("CREATE INDEX idx_transactions_venue ON transactions(venue) WHERE venue IS NOT NULL");
        sqlite.exec("CREATE INDEX idx_transactions_external_id ON transactions(external_id) WHERE external_id IS NOT NULL");
        sqlite.exec('CREATE INDEX idx_transactions_action_kind_bridge_status ON transactions(action_kind, bridge_status) WHERE bridge_status IS NOT NULL');

        sqlite.exec('COMMIT');
      } catch (err) {
        sqlite.exec('ROLLBACK');
        throw err;
      }

      sqlite.pragma('foreign_keys = ON');
      const fkErrors = sqlite.pragma('foreign_key_check') as unknown[];
      if (fkErrors.length > 0) {
        throw new Error(`FK integrity violation after v58: ${JSON.stringify(fkErrors)}`);
      }
    },
  },

  // v59: defi_positions.environment
  {
    version: 59,
    description: 'Add environment column to defi_positions table (Testnet Toggle)',
    up: (sqlite: Database) => {
      const cols = (sqlite.prepare("PRAGMA table_info('defi_positions')").all() as Array<{ name: string }>).map(c => c.name);
      if (!cols.includes('environment')) {
        sqlite.exec("ALTER TABLE defi_positions ADD COLUMN environment TEXT NOT NULL DEFAULT 'mainnet'");
      }
      sqlite.exec('CREATE INDEX IF NOT EXISTS idx_defi_positions_environment ON defi_positions(environment)');
    },
  },

  // v60: Push Relay migration
  {
    version: 60,
    description: 'Add wallet_apps.push_relay_url, clear sign_topic/notify_topic, rename sdk_ntfy to sdk_push',
    managesOwnTransaction: true,
    up: (sqlite: Database) => {
      // 1. Add push_relay_url column to wallet_apps
      const cols = (sqlite.prepare("PRAGMA table_info('wallet_apps')").all() as Array<{ name: string }>).map(c => c.name);
      if (!cols.includes('push_relay_url')) {
        sqlite.exec("ALTER TABLE wallet_apps ADD COLUMN push_relay_url TEXT");
      }

      // 2. Set dcent wallet_type push_relay_url (only if not already set)
      sqlite.prepare(
        "UPDATE wallet_apps SET push_relay_url = ? WHERE wallet_type = 'dcent' AND (push_relay_url IS NULL OR push_relay_url = '')",
      ).run('https://waiaas-push.dcentwallet.com');

      // 3. Clear sign_topic and notify_topic (no longer used)
      sqlite.exec("UPDATE wallet_apps SET sign_topic = NULL, notify_topic = NULL");

      // 4. Rebuild wallets table to update CHECK constraint: sdk_ntfy -> sdk_push
      // SQLite cannot ALTER CHECK constraints, so we must rebuild the table.
      // Only rebuild if the existing CHECK still references 'sdk_ntfy' (idempotency).
      const walletsCreateSql = (sqlite.prepare(
        "SELECT sql FROM sqlite_master WHERE type='table' AND name='wallets'",
      ).get() as { sql: string } | undefined)?.sql ?? '';

      if (walletsCreateSql.includes('sdk_ntfy')) {
        sqlite.pragma('foreign_keys = OFF');
        sqlite.exec('BEGIN');
        try {
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
  owner_approval_method TEXT CHECK (owner_approval_method IS NULL OR owner_approval_method IN ('sdk_push', 'sdk_telegram', 'walletconnect', 'telegram_bot', 'rest')),
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
)`);

          sqlite.exec(`INSERT INTO wallets_new (
  id, name, chain, environment, public_key, status, owner_address, owner_verified,
  created_at, updated_at, suspended_at, suspension_reason, monitor_incoming,
  owner_approval_method, wallet_type, account_type, signer_key, deployed,
  entry_point, aa_provider, aa_provider_api_key_encrypted, aa_bundler_url,
  aa_paymaster_url, aa_paymaster_policy_id, factory_address
) SELECT
  id, name, chain, environment, public_key, status, owner_address, owner_verified,
  created_at, updated_at, suspended_at, suspension_reason, monitor_incoming,
  CASE WHEN owner_approval_method = 'sdk_ntfy' THEN 'sdk_push' ELSE owner_approval_method END,
  wallet_type, account_type, signer_key, deployed,
  entry_point, aa_provider, aa_provider_api_key_encrypted, aa_bundler_url,
  aa_paymaster_url, aa_paymaster_policy_id, factory_address
FROM wallets`);

          sqlite.exec('DROP TABLE wallets');
          sqlite.exec('ALTER TABLE wallets_new RENAME TO wallets');

          // Recreate indexes
          sqlite.exec('CREATE UNIQUE INDEX idx_wallets_public_key ON wallets(public_key)');
          sqlite.exec('CREATE INDEX idx_wallets_status ON wallets(status)');
          sqlite.exec('CREATE INDEX idx_wallets_chain_environment ON wallets(chain, environment)');
          sqlite.exec('CREATE INDEX idx_wallets_owner_address ON wallets(owner_address)');

          sqlite.exec('COMMIT');
        } catch (err) {
          sqlite.exec('ROLLBACK');
          throw err;
        }

        sqlite.pragma('foreign_keys = ON');
        const fkErrors = sqlite.pragma('foreign_key_check') as unknown[];
        if (fkErrors.length > 0) {
          throw new Error(`FK integrity violation after v60: ${JSON.stringify(fkErrors)}`);
        }
      }
    },
  },
];
