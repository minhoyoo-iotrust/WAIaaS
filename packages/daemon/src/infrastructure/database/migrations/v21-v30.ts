/**
 * Database migrations v21 through v30.
 *
 * v21: incoming transaction monitoring tables
 * v22: token_registry.asset_id CAIP-19 backfill
 * v23: DeFi async tracking (bridge_status, bridge_metadata, GAS_WAITING)
 * v24: wallets.wallet_type column
 * v25: defi_positions table
 * v26: Lending policy types CHECK constraint
 * v27: Remove is_default + default_network (v29.3)
 * v28: Migrate api_keys to settings
 * v29: Rename Solana network IDs
 * v30: MATURED position status
 */

import type { Database } from 'better-sqlite3';
import type { Migration } from '../migrate.js';
import {
  WALLET_STATUSES,
  CHAIN_TYPES,
  NETWORK_TYPES,
  ENVIRONMENT_TYPES,
  TRANSACTION_STATUSES,
  TRANSACTION_TYPES,
  POLICY_TYPES,
  POLICY_TIERS,
  INCOMING_TX_STATUSES,
  POSITION_CATEGORIES,
  POSITION_STATUSES,
  NETWORK_TO_CAIP2,
  tokenAssetId,
} from '@waiaas/core';
import type { NetworkType } from '@waiaas/core';
import { inList, NETWORK_TYPES_WITH_LEGACY, LEGACY_NETWORK_NORMALIZE } from '../schema-ddl.js';

export const migrations: Migration[] = [
  // v21: incoming transaction monitoring
  {
    version: 21,
    description: 'Add incoming transaction monitoring tables and wallet opt-in column',
    up: (sqlite: Database) => {
      sqlite.exec('ALTER TABLE wallets ADD COLUMN monitor_incoming INTEGER NOT NULL DEFAULT 0');

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

      sqlite.exec(`CREATE TABLE IF NOT EXISTS incoming_tx_cursors (
  wallet_id TEXT PRIMARY KEY REFERENCES wallets(id) ON DELETE CASCADE,
  chain TEXT NOT NULL,
  network TEXT NOT NULL,
  last_signature TEXT,
  last_block_number INTEGER,
  updated_at INTEGER NOT NULL
)`);

      sqlite.exec('CREATE INDEX IF NOT EXISTS idx_incoming_tx_wallet_detected ON incoming_transactions(wallet_id, detected_at DESC)');
      sqlite.exec('CREATE INDEX IF NOT EXISTS idx_incoming_tx_detected_at ON incoming_transactions(detected_at)');
      sqlite.exec('CREATE INDEX IF NOT EXISTS idx_incoming_tx_chain_network ON incoming_transactions(chain, network)');
      sqlite.exec("CREATE INDEX IF NOT EXISTS idx_incoming_tx_status ON incoming_transactions(status) WHERE status = 'DETECTED'");
    },
  },

  // v22: token_registry.asset_id CAIP-19 backfill
  {
    version: 22,
    description: 'Add asset_id column to token_registry with CAIP-19 backfill',
    managesOwnTransaction: false,
    up: (sqlite: Database) => {
      const columns = sqlite
        .prepare("PRAGMA table_info('token_registry')")
        .all() as Array<{ name: string }>;
      const hasAssetId = columns.some((c) => c.name === 'asset_id');
      if (!hasAssetId) {
        sqlite.exec('ALTER TABLE token_registry ADD COLUMN asset_id TEXT');
      }

      const rows = sqlite
        .prepare('SELECT id, network, address FROM token_registry')
        .all() as Array<{ id: string; network: string; address: string }>;

      const updateStmt = sqlite.prepare(
        'UPDATE token_registry SET asset_id = ? WHERE id = ?'
      );

      for (const row of rows) {
        const normalizedNetwork = LEGACY_NETWORK_NORMALIZE[row.network] ?? row.network;
        if (!(normalizedNetwork in NETWORK_TO_CAIP2)) continue;
        try {
          const assetId = tokenAssetId(normalizedNetwork as NetworkType, row.address);
          updateStmt.run(assetId, row.id);
        } catch {
          // Skip on error
        }
      }
    },
  },

  // v23: DeFi async tracking
  {
    version: 23,
    description: 'DeFi async tracking: bridge_status + bridge_metadata + GAS_WAITING state',
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
  network TEXT CHECK (network IS NULL OR network IN (${inList(NETWORK_TYPES_WITH_LEGACY)})),
  bridge_status TEXT CHECK (bridge_status IS NULL OR bridge_status IN ('PENDING', 'COMPLETED', 'FAILED', 'BRIDGE_MONITORING', 'TIMEOUT', 'REFUNDED', 'PARTIALLY_FILLED', 'FILLED', 'CANCELED', 'SETTLED', 'EXPIRED')),
  bridge_metadata TEXT
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
        sqlite.exec('CREATE INDEX idx_transactions_bridge_status ON transactions(bridge_status) WHERE bridge_status IS NOT NULL');
        sqlite.exec("CREATE INDEX idx_transactions_gas_waiting ON transactions(status) WHERE status = 'GAS_WAITING'");

        sqlite.exec('COMMIT');
      } catch (err) {
        sqlite.exec('ROLLBACK');
        throw err;
      }

      sqlite.pragma('foreign_keys = ON');
      const fkErrors = sqlite.pragma('foreign_key_check') as unknown[];
      if (fkErrors.length > 0) {
        throw new Error(`FK integrity violation after v23: ${JSON.stringify(fkErrors)}`);
      }
    },
  },

  // v24: wallets.wallet_type
  {
    version: 24,
    description: 'Add wallet_type column to wallets table for preset auto-setup',
    up: (sqlite: Database) => {
      sqlite.exec('ALTER TABLE wallets ADD COLUMN wallet_type TEXT');
    },
  },

  // v25: defi_positions table
  {
    version: 25,
    description: 'Add defi_positions table for DeFi position tracking',
    up: (sqlite: Database) => {
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
      sqlite.exec('CREATE INDEX IF NOT EXISTS idx_defi_positions_wallet_category ON defi_positions(wallet_id, category)');
      sqlite.exec('CREATE INDEX IF NOT EXISTS idx_defi_positions_wallet_provider ON defi_positions(wallet_id, provider)');
      sqlite.exec('CREATE INDEX IF NOT EXISTS idx_defi_positions_status ON defi_positions(status)');
      sqlite.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_defi_positions_unique ON defi_positions(wallet_id, provider, asset_id, category)');
    },
  },

  // v26: Lending policy types CHECK
  {
    version: 26,
    description: 'Add lending policy types to policies table CHECK constraint',
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

        sqlite.exec('INSERT INTO policies_new SELECT * FROM policies');
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
        throw new Error(`FK integrity violation after v26: ${JSON.stringify(fkErrors)}`);
      }
    },
  },

  // v27: Remove is_default + default_network
  {
    version: 27,
    description: 'Remove is_default from session_wallets and default_network from wallets (v29.3)',
    managesOwnTransaction: true,
    up: (sqlite: Database) => {
      sqlite.exec('BEGIN');

      try {
        // Part 1: Remove is_default from session_wallets
        sqlite.exec(`CREATE TABLE session_wallets_new (
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  wallet_id TEXT NOT NULL REFERENCES wallets(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (session_id, wallet_id)
)`);
        sqlite.exec('INSERT INTO session_wallets_new (session_id, wallet_id, created_at) SELECT session_id, wallet_id, created_at FROM session_wallets');
        sqlite.exec('DROP TABLE session_wallets');
        sqlite.exec('ALTER TABLE session_wallets_new RENAME TO session_wallets');
        sqlite.exec('CREATE INDEX idx_session_wallets_session ON session_wallets(session_id)');
        sqlite.exec('CREATE INDEX idx_session_wallets_wallet ON session_wallets(wallet_id)');

        // Part 2: Remove default_network from wallets
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
        sqlite.exec('INSERT INTO wallets_new (id, name, chain, environment, public_key, status, owner_address, owner_verified, created_at, updated_at, suspended_at, suspension_reason, monitor_incoming, owner_approval_method, wallet_type) SELECT id, name, chain, environment, public_key, status, owner_address, owner_verified, created_at, updated_at, suspended_at, suspension_reason, monitor_incoming, owner_approval_method, wallet_type FROM wallets');
        sqlite.exec('DROP TABLE wallets');
        sqlite.exec('ALTER TABLE wallets_new RENAME TO wallets');

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
        throw new Error(`FK integrity violation after v27: ${JSON.stringify(fkErrors)}`);
      }
    },
  },

  // v28: Migrate api_keys to settings
  {
    version: 28,
    description: 'Migrate api_keys to settings table and drop api_keys (v29.5 #214)',
    managesOwnTransaction: true,
    up: (sqlite: Database) => {
      sqlite.exec('BEGIN');
      try {
        const tableExists = sqlite
          .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='api_keys'")
          .get();

        if (tableExists) {
          const rows = sqlite
            .prepare('SELECT provider_name, encrypted_key, updated_at FROM api_keys')
            .all() as Array<{
            provider_name: string;
            encrypted_key: string;
            updated_at: number;
          }>;

          const insertStmt = sqlite.prepare(
            `INSERT OR IGNORE INTO settings (key, value, encrypted, category, updated_at)
           VALUES (?, ?, 1, 'actions', ?)`,
          );

          for (const row of rows) {
            const settingKey = `actions.${row.provider_name}_api_key`;
            insertStmt.run(settingKey, row.encrypted_key, row.updated_at);
          }

          sqlite.exec('DROP TABLE IF EXISTS api_keys');
        }

        sqlite.exec('COMMIT');
      } catch (err) {
        sqlite.exec('ROLLBACK');
        throw err;
      }
    },
  },

  // v29: Rename Solana network IDs
  {
    version: 29,
    description: 'Rename Solana network IDs to solana-{network} format (v29.5 #211)',
    managesOwnTransaction: true,
    up: (sqlite: Database) => {
      sqlite.exec('BEGIN');
      try {
        const solanaCase = (col: string) =>
          `CASE WHEN chain = 'solana' AND ${col} = 'mainnet' THEN 'solana-mainnet'` +
          ` WHEN chain = 'solana' AND ${col} = 'devnet' THEN 'solana-devnet'` +
          ` WHEN chain = 'solana' AND ${col} = 'testnet' THEN 'solana-testnet'` +
          ` ELSE ${col} END`;

        // 1. transactions: 12-step recreation
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
  bridge_status TEXT CHECK (bridge_status IS NULL OR bridge_status IN ('PENDING', 'COMPLETED', 'FAILED', 'BRIDGE_MONITORING', 'TIMEOUT', 'REFUNDED', 'PARTIALLY_FILLED', 'FILLED', 'CANCELED', 'SETTLED', 'EXPIRED')),
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

        // 2. policies: 12-step recreation
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

        sqlite.exec('CREATE INDEX IF NOT EXISTS idx_policies_wallet_enabled ON policies(wallet_id, enabled)');
        sqlite.exec('CREATE INDEX IF NOT EXISTS idx_policies_type ON policies(type)');
        sqlite.exec('CREATE INDEX IF NOT EXISTS idx_policies_network ON policies(network)');

        // 3. defi_positions: 12-step recreation
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

        sqlite.exec('CREATE INDEX IF NOT EXISTS idx_defi_positions_wallet_category ON defi_positions(wallet_id, category)');
        sqlite.exec('CREATE INDEX IF NOT EXISTS idx_defi_positions_wallet_provider ON defi_positions(wallet_id, provider)');
        sqlite.exec('CREATE INDEX IF NOT EXISTS idx_defi_positions_status ON defi_positions(status)');
        sqlite.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_defi_positions_unique ON defi_positions(wallet_id, provider, asset_id, category)');

        // 4-6. Simple UPDATE for tables without CHECK
        sqlite.exec(`UPDATE incoming_transactions SET network = 'solana-mainnet' WHERE chain = 'solana' AND network = 'mainnet'`);
        sqlite.exec(`UPDATE incoming_transactions SET network = 'solana-devnet' WHERE chain = 'solana' AND network = 'devnet'`);
        sqlite.exec(`UPDATE incoming_transactions SET network = 'solana-testnet' WHERE chain = 'solana' AND network = 'testnet'`);

        sqlite.exec(`UPDATE incoming_tx_cursors SET network = 'solana-mainnet' WHERE chain = 'solana' AND network = 'mainnet'`);
        sqlite.exec(`UPDATE incoming_tx_cursors SET network = 'solana-devnet' WHERE chain = 'solana' AND network = 'devnet'`);
        sqlite.exec(`UPDATE incoming_tx_cursors SET network = 'solana-testnet' WHERE chain = 'solana' AND network = 'testnet'`);

        sqlite.exec(`UPDATE token_registry SET network = 'solana-mainnet' WHERE network = 'mainnet'`);
        sqlite.exec(`UPDATE token_registry SET network = 'solana-devnet' WHERE network = 'devnet'`);
        sqlite.exec(`UPDATE token_registry SET network = 'solana-testnet' WHERE network = 'testnet'`);

        sqlite.exec('COMMIT');
      } catch (err) {
        sqlite.exec('ROLLBACK');
        throw err;
      }

      sqlite.pragma('foreign_keys = ON');
      const fkErrors = sqlite.pragma('foreign_key_check') as unknown[];
      if (fkErrors.length > 0) {
        throw new Error(
          `FK integrity check failed after v29 migration: ${JSON.stringify(fkErrors)}`,
        );
      }
    },
  },

  // v30: MATURED position status
  {
    version: 30,
    description: 'Add MATURED position status to defi_positions CHECK constraint (v29.6 Yield)',
    managesOwnTransaction: true,
    up: (sqlite: Database) => {
      sqlite.exec('BEGIN');
      try {
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

        sqlite.exec('CREATE INDEX IF NOT EXISTS idx_defi_positions_wallet_category ON defi_positions(wallet_id, category)');
        sqlite.exec('CREATE INDEX IF NOT EXISTS idx_defi_positions_wallet_provider ON defi_positions(wallet_id, provider)');
        sqlite.exec('CREATE INDEX IF NOT EXISTS idx_defi_positions_status ON defi_positions(status)');
        sqlite.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_defi_positions_unique ON defi_positions(wallet_id, provider, asset_id, category)');

        sqlite.exec('COMMIT');
      } catch (err) {
        sqlite.exec('ROLLBACK');
        throw err;
      }

      sqlite.pragma('foreign_keys = ON');
      const fkErrors = sqlite.pragma('foreign_key_check') as unknown[];
      if (fkErrors.length > 0) {
        throw new Error(
          `FK integrity check failed after v30 migration: ${JSON.stringify(fkErrors)}`,
        );
      }
    },
  },
];
