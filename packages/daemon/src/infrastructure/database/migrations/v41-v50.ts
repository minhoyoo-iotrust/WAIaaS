/**
 * Database migrations v41 through v50.
 *
 * v41: Smart Account per-wallet provider columns
 * v42: Seed action provider _enabled defaults
 * v43: aa_paymaster_policy_id column
 * v44: nft_metadata_cache table
 * v45: userop_builds table
 * v46: Backfill CONTRACT_CALL amount
 * v47: factory_address column
 * v48: Purge mock defi_positions
 * v49: Fix bugged smart account wallets
 * v50: userop_builds.network column
 */

import type { Database } from 'better-sqlite3';
import type { Migration } from '../migrate.js';
import {
  CHAIN_TYPES,
  NETWORK_TYPES,
} from '@waiaas/core';
import { inList } from '../schema-ddl.js';

export const migrations: Migration[] = [
  // v41: Smart Account per-wallet provider columns
  {
    version: 41,
    description: 'Smart Account per-wallet provider: aa_provider, aa_provider_api_key_encrypted, aa_bundler_url, aa_paymaster_url',
    up: (sqlite: Database) => {
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
  },

  // v42: Seed action provider defaults
  {
    version: 42,
    description: 'Seed all 10 action provider _enabled defaults to true (INSERT OR IGNORE preserves existing)',
    up: (sqlite: Database) => {
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
  },

  // v43: aa_paymaster_policy_id
  {
    version: 43,
    description: 'Add aa_paymaster_policy_id column to wallets for paymaster context (sponsorshipPolicyId)',
    up: (sqlite: Database) => {
      const cols = sqlite.pragma('table_info(wallets)') as Array<{ name: string }>;
      const has = (n: string) => cols.some((c) => c.name === n);
      if (!has('aa_paymaster_policy_id')) {
        sqlite.exec('ALTER TABLE wallets ADD COLUMN aa_paymaster_policy_id TEXT');
      }
    },
  },

  // v44: nft_metadata_cache
  {
    version: 44,
    description: 'Create nft_metadata_cache table for NFT metadata caching (24h TTL)',
    up: (sqlite: Database) => {
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
  },

  // v45: userop_builds
  {
    version: 45,
    description: 'Create userop_builds table for UserOp Build/Sign API',
    up: (sqlite: Database) => {
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
  },

  // v46: Backfill CONTRACT_CALL amount
  {
    version: 46,
    description: 'Backfill CONTRACT_CALL amount from metadata.originalRequest.value',
    up: (sqlite: Database) => {
      sqlite.exec(`
      UPDATE transactions
      SET amount = json_extract(metadata, '$.originalRequest.value')
      WHERE type = 'CONTRACT_CALL'
        AND amount IS NULL
        AND json_extract(metadata, '$.originalRequest.value') IS NOT NULL
    `);
    },
  },

  // v47: factory_address column
  {
    version: 47,
    description: 'Add factory_address column to wallets for multichain Smart Account factory tracking',
    up: (sqlite: Database) => {
      sqlite.exec(`ALTER TABLE wallets ADD COLUMN factory_address TEXT`);

      sqlite.exec(`
      UPDATE wallets
      SET factory_address = '0x5d82735936c6Cd5DE57cC3c1A799f6B2E6F933Df'
      WHERE account_type = 'smart' AND factory_address IS NULL
    `);
    },
  },

  // v48: Purge mock defi_positions
  {
    version: 48,
    description: 'Purge mock defi_positions data from Kamino/Drift (#263)',
    up: (sqlite: Database) => {
      sqlite.exec(`DELETE FROM defi_positions WHERE provider IN ('kamino', 'drift_perp')`);
    },
  },

  // v49: Fix bugged smart account wallets
  {
    version: 49,
    description: 'Convert bugged smart account wallets (missing signerKey) to EOA (#272)',
    up: (sqlite: Database) => {
      sqlite.exec(`
      UPDATE wallets
      SET account_type = 'eoa',
          deployed = 1,
          entry_point = NULL,
          factory_address = NULL
      WHERE account_type = 'smart' AND signer_key IS NULL
    `);
    },
  },

  // v50: userop_builds.network
  {
    version: 50,
    description: 'Add network column to userop_builds for Sign route RPC resolve (#279)',
    up: (sqlite: Database) => {
      const cols = sqlite.prepare("PRAGMA table_info('userop_builds')").all() as Array<{ name: string }>;
      if (!cols.some((c) => c.name === 'network')) {
        sqlite.exec(`ALTER TABLE userop_builds ADD COLUMN network TEXT`);
      }
    },
  },
];
