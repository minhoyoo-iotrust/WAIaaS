/**
 * Database migrations v31 through v40.
 *
 * v31: wallet_apps table
 * v32: sessions max_renewals default change (no-op)
 * v33: wallet_apps sign_topic + notify_topic
 * v34: wallet_apps.wallet_type
 * v35: wallet_apps.subscription_token
 * v36: audit_log tx_id index
 * v37: webhooks + webhook_logs tables
 * v38: Smart account columns
 * v39: ERC-8004 (agent_identities + reputation_cache + policies CHECK)
 * v40: pending_approvals.typed_data_json
 */

import type { Database } from 'better-sqlite3';
import type { Migration } from '../migrate.js';
import {
  NETWORK_TYPES,
  POLICY_TYPES,
} from '@waiaas/core';
import { inList } from '../schema-ddl.js';

export const migrations: Migration[] = [
  // v31: wallet_apps table
  {
    version: 31,
    description: 'Create wallet_apps table for Human Wallet Apps registry',
    up: (sqlite: Database) => {
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
  },

  // v32: sessions max_renewals default (no-op)
  {
    version: 32,
    description: 'Session progressive security: default max_renewals 30 -> 0 (unlimited)',
    up: (_sqlite: Database) => {
      // No DDL needed
    },
  },

  // v33: wallet_apps sign_topic + notify_topic
  {
    version: 33,
    description: 'Add sign_topic and notify_topic columns to wallet_apps for per-wallet ntfy topic routing',
    up: (sqlite: Database) => {
      const cols = (sqlite.prepare("PRAGMA table_info('wallet_apps')").all() as Array<{ name: string }>).map(c => c.name);
      if (!cols.includes('sign_topic')) sqlite.exec(`ALTER TABLE wallet_apps ADD COLUMN sign_topic TEXT`);
      if (!cols.includes('notify_topic')) sqlite.exec(`ALTER TABLE wallet_apps ADD COLUMN notify_topic TEXT`);
      const prefix = 'waiaas-sign';
      const notifyPrefix = 'waiaas-notify';
      const rows = sqlite.prepare('SELECT id, name FROM wallet_apps').all() as Array<{ id: string; name: string }>;
      const stmt = sqlite.prepare('UPDATE wallet_apps SET sign_topic = ?, notify_topic = ? WHERE id = ?');
      for (const row of rows) {
        stmt.run(`${prefix}-${row.name}`, `${notifyPrefix}-${row.name}`, row.id);
      }
    },
  },

  // v34: wallet_apps.wallet_type
  {
    version: 34,
    description: 'Add wallet_type column to wallet_apps for multi-device per wallet type',
    up: (sqlite: Database) => {
      const cols = (sqlite.prepare("PRAGMA table_info('wallet_apps')").all() as Array<{ name: string }>).map(c => c.name);
      if (!cols.includes('wallet_type')) {
        sqlite.exec(`ALTER TABLE wallet_apps ADD COLUMN wallet_type TEXT NOT NULL DEFAULT ''`);
        sqlite.exec(`UPDATE wallet_apps SET wallet_type = name WHERE wallet_type = ''`);
      }
      sqlite.exec('CREATE INDEX IF NOT EXISTS idx_wallet_apps_wallet_type ON wallet_apps(wallet_type)');
    },
  },

  // v35: wallet_apps.subscription_token
  {
    version: 35,
    description: 'Add subscription_token column to wallet_apps for token-based ntfy topic routing',
    up: (sqlite: Database) => {
      const cols = (sqlite.prepare("PRAGMA table_info('wallet_apps')").all() as Array<{ name: string }>).map(c => c.name);
      if (!cols.includes('subscription_token')) {
        sqlite.exec(`ALTER TABLE wallet_apps ADD COLUMN subscription_token TEXT`);
      }
    },
  },

  // v36: audit_log tx_id index
  {
    version: 36,
    description: 'Add idx_audit_log_tx_id index for audit log tx_id filter queries',
    up: (sqlite: Database) => {
      sqlite.exec('CREATE INDEX IF NOT EXISTS idx_audit_log_tx_id ON audit_log(tx_id)');
    },
  },

  // v37: webhooks + webhook_logs
  {
    version: 37,
    description: 'Create webhooks and webhook_logs tables for webhook outbound (OPS-04)',
    up: (sqlite: Database) => {
      sqlite.exec('PRAGMA foreign_keys = ON');

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
  },

  // v38: Smart account columns
  {
    version: 38,
    description: 'Add smart account columns to wallets table (account_type, signer_key, deployed, entry_point)',
    up: (sqlite: Database) => {
      sqlite.exec(`ALTER TABLE wallets ADD COLUMN account_type TEXT NOT NULL DEFAULT 'eoa'`);
      sqlite.exec(`ALTER TABLE wallets ADD COLUMN signer_key TEXT`);
      sqlite.exec(`ALTER TABLE wallets ADD COLUMN deployed INTEGER NOT NULL DEFAULT 1`);
      sqlite.exec(`ALTER TABLE wallets ADD COLUMN entry_point TEXT`);
    },
  },

  // v39: ERC-8004
  {
    version: 39,
    description: 'ERC-8004: agent_identities + reputation_cache + pending_approvals.approval_type + policies CHECK update',
    managesOwnTransaction: true,
    up: (sqlite: Database) => {
      sqlite.exec('BEGIN');

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

      sqlite.exec("ALTER TABLE pending_approvals ADD COLUMN approval_type TEXT NOT NULL DEFAULT 'SIWE' CHECK (approval_type IN ('SIWE', 'EIP712'))");

      // Recreate policies with REPUTATION_THRESHOLD in CHECK
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
  },

  // v40: pending_approvals.typed_data_json
  {
    version: 40,
    description: 'ERC-8004: pending_approvals.typed_data_json for EIP-712 approval payloads',
    up: (sqlite: Database) => {
      sqlite.exec(
        "ALTER TABLE pending_approvals ADD COLUMN typed_data_json TEXT",
      );
    },
  },
];
