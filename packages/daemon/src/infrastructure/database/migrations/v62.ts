/**
 * Database migration v62: Add 'ripple' to chain CHECK constraints and XRPL networks to network CHECK.
 *
 * SQLite CHECK constraints are immutable after table creation, so we use the
 * 12-step table recreation pattern for each affected table.
 *
 * Affected tables (chain CHECK):
 *   - wallets
 *   - incoming_transactions
 *   - defi_positions
 *   - nft_metadata_cache
 *
 * Affected tables (network CHECK):
 *   - transactions
 *   - policies
 *   - defi_positions (also has chain CHECK)
 *   - nft_metadata_cache (also has chain CHECK)
 *
 * @see Phase 470-03
 */

import type { Database } from 'better-sqlite3';
import type { Migration } from '../migrate.js';
import {
  CHAIN_TYPES,
  NETWORK_TYPES,
  TRANSACTION_TYPES,
  TRANSACTION_STATUSES,
  POLICY_TIERS,
  WALLET_STATUSES,
  POLICY_TYPES,
  INCOMING_TX_STATUSES,
  POSITION_CATEGORIES,
  POSITION_STATUSES,
  ACCOUNT_TYPES,
} from '@waiaas/core';
import { inList } from '../schema-ddl.js';

export const migrations: Migration[] = [
  {
    version: 62,
    description: 'Add ripple chain type and XRPL networks to CHECK constraints (12-step table recreation)',
    managesOwnTransaction: true,
    up: (sqlite: Database) => {
      sqlite.exec('BEGIN');

      try {
        // ── 1. wallets table (chain CHECK) ─────────────────────────────
        sqlite.exec(`CREATE TABLE wallets_new (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  chain TEXT NOT NULL CHECK (chain IN (${inList(CHAIN_TYPES)})),
  environment TEXT NOT NULL CHECK (environment IN ('testnet', 'mainnet')),
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
  owner_approval_method, wallet_type, account_type, signer_key, deployed,
  entry_point, aa_provider, aa_provider_api_key_encrypted, aa_bundler_url,
  aa_paymaster_url, aa_paymaster_policy_id, factory_address
FROM wallets`);
        sqlite.exec('DROP TABLE wallets');
        sqlite.exec('ALTER TABLE wallets_new RENAME TO wallets');

        // Recreate wallets indexes
        sqlite.exec('CREATE UNIQUE INDEX idx_wallets_public_key ON wallets(public_key)');
        sqlite.exec('CREATE INDEX idx_wallets_status ON wallets(status)');
        sqlite.exec('CREATE INDEX idx_wallets_chain_environment ON wallets(chain, environment)');
        sqlite.exec('CREATE INDEX idx_wallets_owner_address ON wallets(owner_address)');

        // ── 2. transactions table (network CHECK) ─────────────────────
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

        sqlite.exec(`INSERT INTO transactions_new (
  id, wallet_id, session_id, chain, tx_hash, type, amount, to_address,
  token_mint, contract_address, method_signature, spender_address, approved_amount,
  parent_id, batch_index, status, tier, queued_at, executed_at, created_at,
  reserved_amount, amount_usd, reserved_amount_usd, error, metadata, network,
  bridge_status, bridge_metadata, action_kind, venue, operation, external_id
) SELECT
  id, wallet_id, session_id, chain, tx_hash, type, amount, to_address,
  token_mint, contract_address, method_signature, spender_address, approved_amount,
  parent_id, batch_index, status, tier, queued_at, executed_at, created_at,
  reserved_amount, amount_usd, reserved_amount_usd, error, metadata, network,
  bridge_status, bridge_metadata, action_kind, venue, operation, external_id
FROM transactions`);
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
        sqlite.exec("CREATE INDEX idx_transactions_bridge_status ON transactions(bridge_status) WHERE bridge_status IS NOT NULL");
        sqlite.exec("CREATE INDEX idx_transactions_gas_waiting ON transactions(status) WHERE status = 'GAS_WAITING'");
        sqlite.exec('CREATE INDEX idx_transactions_action_kind ON transactions(action_kind)');
        sqlite.exec("CREATE INDEX idx_transactions_venue ON transactions(venue) WHERE venue IS NOT NULL");
        sqlite.exec("CREATE INDEX idx_transactions_external_id ON transactions(external_id) WHERE external_id IS NOT NULL");
        sqlite.exec("CREATE INDEX idx_transactions_action_kind_bridge_status ON transactions(action_kind, bridge_status) WHERE bridge_status IS NOT NULL");

        // ── 3. policies table (network CHECK) ─────────────────────────
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

        sqlite.exec(`INSERT INTO policies_new (
  id, wallet_id, type, rules, priority, enabled, network, created_at, updated_at
) SELECT
  id, wallet_id, type, rules, priority, enabled, network, created_at, updated_at
FROM policies`);
        sqlite.exec('DROP TABLE policies');
        sqlite.exec('ALTER TABLE policies_new RENAME TO policies');

        // Recreate policies indexes
        sqlite.exec('CREATE INDEX idx_policies_wallet_enabled ON policies(wallet_id, enabled)');
        sqlite.exec('CREATE INDEX idx_policies_type ON policies(type)');
        sqlite.exec('CREATE INDEX idx_policies_network ON policies(network)');

        // ── 4. incoming_transactions table (chain CHECK) ──────────────
        sqlite.exec(`CREATE TABLE incoming_transactions_new (
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

        sqlite.exec(`INSERT INTO incoming_transactions_new (
  id, tx_hash, wallet_id, from_address, amount, token_address, chain,
  network, status, block_number, detected_at, confirmed_at, is_suspicious
) SELECT
  id, tx_hash, wallet_id, from_address, amount, token_address, chain,
  network, status, block_number, detected_at, confirmed_at, is_suspicious
FROM incoming_transactions`);
        sqlite.exec('DROP TABLE incoming_transactions');
        sqlite.exec('ALTER TABLE incoming_transactions_new RENAME TO incoming_transactions');

        // Recreate incoming_transactions indexes
        sqlite.exec('CREATE INDEX idx_incoming_tx_wallet_detected ON incoming_transactions(wallet_id, detected_at DESC)');
        sqlite.exec('CREATE INDEX idx_incoming_tx_detected_at ON incoming_transactions(detected_at)');
        sqlite.exec('CREATE INDEX idx_incoming_tx_chain_network ON incoming_transactions(chain, network)');
        sqlite.exec("CREATE INDEX idx_incoming_tx_status ON incoming_transactions(status) WHERE status = 'DETECTED'");

        // ── 5. defi_positions table (chain CHECK + network CHECK) ─────
        sqlite.exec(`CREATE TABLE defi_positions_new (
  id TEXT PRIMARY KEY,
  wallet_id TEXT NOT NULL REFERENCES wallets(id) ON DELETE CASCADE,
  category TEXT NOT NULL CHECK(category IN (${inList(POSITION_CATEGORIES)})),
  provider TEXT NOT NULL,
  chain TEXT NOT NULL CHECK(chain IN (${inList(CHAIN_TYPES)})),
  environment TEXT NOT NULL DEFAULT 'mainnet',
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

        // Explicit column list required: environment was added via ALTER TABLE ADD
        // and sits at the end of the source table, but is defined at position 6 in
        // the new table.  SELECT * would map columns by position and break.
        sqlite.exec(`INSERT INTO defi_positions_new (
  id, wallet_id, category, provider, chain, environment, network,
  asset_id, amount, amount_usd, metadata, status,
  opened_at, closed_at, last_synced_at, created_at, updated_at
) SELECT
  id, wallet_id, category, provider, chain, environment, network,
  asset_id, amount, amount_usd, metadata, status,
  opened_at, closed_at, last_synced_at, created_at, updated_at
FROM defi_positions`);
        sqlite.exec('DROP TABLE defi_positions');
        sqlite.exec('ALTER TABLE defi_positions_new RENAME TO defi_positions');

        // Recreate defi_positions indexes
        sqlite.exec('CREATE INDEX idx_defi_positions_wallet_category ON defi_positions(wallet_id, category)');
        sqlite.exec('CREATE INDEX idx_defi_positions_wallet_provider ON defi_positions(wallet_id, provider)');
        sqlite.exec('CREATE INDEX idx_defi_positions_status ON defi_positions(status)');
        sqlite.exec('CREATE UNIQUE INDEX idx_defi_positions_unique ON defi_positions(wallet_id, provider, asset_id, category)');
        sqlite.exec('CREATE INDEX idx_defi_positions_environment ON defi_positions(environment)');

        // ── 6. nft_metadata_cache table (chain CHECK + network CHECK) ─
        sqlite.exec(`CREATE TABLE nft_metadata_cache_new (
  id TEXT PRIMARY KEY,
  contract_address TEXT NOT NULL,
  token_id TEXT NOT NULL,
  chain TEXT NOT NULL CHECK (chain IN (${inList(CHAIN_TYPES)})),
  network TEXT NOT NULL CHECK (network IN (${inList(NETWORK_TYPES)})),
  metadata_json TEXT NOT NULL,
  cached_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
)`);

        sqlite.exec(`INSERT INTO nft_metadata_cache_new (
  id, contract_address, token_id, chain, network, metadata_json, cached_at, expires_at
) SELECT
  id, contract_address, token_id, chain, network, metadata_json, cached_at, expires_at
FROM nft_metadata_cache`);
        sqlite.exec('DROP TABLE nft_metadata_cache');
        sqlite.exec('ALTER TABLE nft_metadata_cache_new RENAME TO nft_metadata_cache');

        // Recreate nft_metadata_cache indexes
        sqlite.exec('CREATE UNIQUE INDEX idx_nft_cache_unique ON nft_metadata_cache(contract_address, token_id, chain, network)');
        sqlite.exec('CREATE INDEX idx_nft_cache_expires ON nft_metadata_cache(expires_at)');

        sqlite.exec('COMMIT');
      } catch (err) {
        sqlite.exec('ROLLBACK');
        throw err;
      }

      // Verify FK integrity after recreation
      sqlite.pragma('foreign_keys = ON');
      const fkErrors = sqlite.pragma('foreign_key_check') as unknown[];
      if (fkErrors.length > 0) {
        throw new Error(`FK integrity violation after v62: ${JSON.stringify(fkErrors)}`);
      }
    },
  },
];
