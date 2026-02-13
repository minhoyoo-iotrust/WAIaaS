/**
 * Drizzle ORM schema definitions for WAIaaS daemon SQLite database.
 *
 * 10 tables: wallets, sessions, transactions, policies, pending_approvals, audit_log, key_value_store, notification_logs, token_registry, settings
 *
 * CHECK constraints are derived from @waiaas/core enum SSoT arrays (not hardcoded strings).
 * All timestamps are Unix epoch seconds via { mode: 'timestamp' }.
 * All text PKs use UUID v7 for ms-precision time ordering (except audit_log which uses AUTOINCREMENT).
 *
 * v1.4.2: agents table renamed to wallets, agent_id columns renamed to wallet_id.
 * WALLET_STATUSES used for status CHECK constraint.
 *
 * @see docs/25-sqlite-schema.md
 */

import {
  sqliteTable,
  text,
  integer,
  index,
  uniqueIndex,
  check,
  type AnySQLiteColumn,
} from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';
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
// Utility: build CHECK constraint SQL from SSoT enum arrays
// ---------------------------------------------------------------------------

const buildCheckSql = (column: string, values: readonly string[]) =>
  sql.raw(`${column} IN (${values.map((v) => `'${v}'`).join(', ')})`);

// ---------------------------------------------------------------------------
// Table 1: wallets -- wallet identity and lifecycle state (renamed from agents in v3)
// ---------------------------------------------------------------------------

export const wallets = sqliteTable(
  'wallets',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    chain: text('chain').notNull(),
    network: text('network').notNull(),
    publicKey: text('public_key').notNull(),
    status: text('status').notNull().default('CREATING'),
    ownerAddress: text('owner_address'),
    ownerVerified: integer('owner_verified', { mode: 'boolean' }).notNull().default(false),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
    suspendedAt: integer('suspended_at', { mode: 'timestamp' }),
    suspensionReason: text('suspension_reason'),
  },
  (table) => [
    uniqueIndex('idx_wallets_public_key').on(table.publicKey),
    index('idx_wallets_status').on(table.status),
    index('idx_wallets_chain_network').on(table.chain, table.network),
    index('idx_wallets_owner_address').on(table.ownerAddress),
    check('check_chain', buildCheckSql('chain', CHAIN_TYPES)),
    check('check_network', buildCheckSql('network', NETWORK_TYPES)),
    check('check_status', buildCheckSql('status', WALLET_STATUSES)),
    check('check_owner_verified', sql`owner_verified IN (0, 1)`),
  ],
);

// ---------------------------------------------------------------------------
// Table 2: sessions -- JWT session tracking
// ---------------------------------------------------------------------------

export const sessions = sqliteTable(
  'sessions',
  {
    id: text('id').primaryKey(),
    walletId: text('wallet_id')
      .notNull()
      .references(() => wallets.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull(),
    expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
    constraints: text('constraints'),
    usageStats: text('usage_stats'),
    revokedAt: integer('revoked_at', { mode: 'timestamp' }),
    renewalCount: integer('renewal_count').notNull().default(0),
    maxRenewals: integer('max_renewals').notNull().default(30),
    lastRenewedAt: integer('last_renewed_at', { mode: 'timestamp' }),
    absoluteExpiresAt: integer('absolute_expires_at', { mode: 'timestamp' }).notNull(),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  },
  (table) => [
    index('idx_sessions_wallet_id').on(table.walletId),
    index('idx_sessions_expires_at').on(table.expiresAt),
    index('idx_sessions_token_hash').on(table.tokenHash),
  ],
);

// ---------------------------------------------------------------------------
// Table 3: transactions -- on-chain transaction records
// ---------------------------------------------------------------------------

export const transactions = sqliteTable(
  'transactions',
  {
    id: text('id').primaryKey(),
    walletId: text('wallet_id')
      .notNull()
      .references(() => wallets.id, { onDelete: 'restrict' }),
    sessionId: text('session_id').references(() => sessions.id, { onDelete: 'set null' }),
    chain: text('chain').notNull(),
    txHash: text('tx_hash'),
    type: text('type').notNull(),
    amount: text('amount'),
    toAddress: text('to_address'),
    tokenMint: text('token_mint'),
    contractAddress: text('contract_address'),
    methodSignature: text('method_signature'),
    spenderAddress: text('spender_address'),
    approvedAmount: text('approved_amount'),
    parentId: text('parent_id').references((): AnySQLiteColumn => transactions.id, {
      onDelete: 'cascade',
    }),
    batchIndex: integer('batch_index'),
    status: text('status').notNull().default('PENDING'),
    tier: text('tier'),
    queuedAt: integer('queued_at', { mode: 'timestamp' }),
    executedAt: integer('executed_at', { mode: 'timestamp' }),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
    reservedAmount: text('reserved_amount'),
    error: text('error'),
    metadata: text('metadata'),
  },
  (table) => [
    index('idx_transactions_wallet_status').on(table.walletId, table.status),
    index('idx_transactions_session_id').on(table.sessionId),
    uniqueIndex('idx_transactions_tx_hash').on(table.txHash),
    index('idx_transactions_queued_at').on(table.queuedAt),
    index('idx_transactions_created_at').on(table.createdAt),
    index('idx_transactions_type').on(table.type),
    index('idx_transactions_contract_address').on(table.contractAddress),
    index('idx_transactions_parent_id').on(table.parentId),
    check('check_tx_type', buildCheckSql('type', TRANSACTION_TYPES)),
    check('check_tx_status', buildCheckSql('status', TRANSACTION_STATUSES)),
    check(
      'check_tx_tier',
      sql.raw(
        `tier IS NULL OR tier IN (${POLICY_TIERS.map((v) => `'${v}'`).join(', ')})`,
      ),
    ),
  ],
);

// ---------------------------------------------------------------------------
// Table 4: policies -- wallet and global policy rules
// ---------------------------------------------------------------------------

export const policies = sqliteTable(
  'policies',
  {
    id: text('id').primaryKey(),
    walletId: text('wallet_id').references(() => wallets.id, { onDelete: 'cascade' }),
    type: text('type').notNull(),
    rules: text('rules').notNull(),
    priority: integer('priority').notNull().default(0),
    enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
  },
  (table) => [
    index('idx_policies_wallet_enabled').on(table.walletId, table.enabled),
    index('idx_policies_type').on(table.type),
    check('check_policy_type', buildCheckSql('type', POLICY_TYPES)),
  ],
);

// ---------------------------------------------------------------------------
// Table 5: pending_approvals -- APPROVAL tier owner sign-off tracking
// ---------------------------------------------------------------------------

export const pendingApprovals = sqliteTable(
  'pending_approvals',
  {
    id: text('id').primaryKey(),
    txId: text('tx_id')
      .notNull()
      .references(() => transactions.id, { onDelete: 'cascade' }),
    requiredBy: integer('required_by', { mode: 'timestamp' }).notNull(),
    expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
    approvedAt: integer('approved_at', { mode: 'timestamp' }),
    rejectedAt: integer('rejected_at', { mode: 'timestamp' }),
    ownerSignature: text('owner_signature'),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  },
  (table) => [
    index('idx_pending_approvals_tx_id').on(table.txId),
    index('idx_pending_approvals_expires_at').on(table.expiresAt),
  ],
);

// ---------------------------------------------------------------------------
// Table 6: audit_log -- append-only security event log
// ---------------------------------------------------------------------------

export const auditLog = sqliteTable(
  'audit_log',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    timestamp: integer('timestamp', { mode: 'timestamp' }).notNull(),
    eventType: text('event_type').notNull(),
    actor: text('actor').notNull(),
    walletId: text('wallet_id'),
    sessionId: text('session_id'),
    txId: text('tx_id'),
    details: text('details').notNull(),
    severity: text('severity').notNull().default('info'),
    ipAddress: text('ip_address'),
  },
  (table) => [
    index('idx_audit_log_timestamp').on(table.timestamp),
    index('idx_audit_log_event_type').on(table.eventType),
    index('idx_audit_log_wallet_id').on(table.walletId),
    index('idx_audit_log_severity').on(table.severity),
    index('idx_audit_log_wallet_timestamp').on(table.walletId, table.timestamp),
    check('check_severity', sql`severity IN ('info', 'warning', 'critical')`),
  ],
);

// ---------------------------------------------------------------------------
// Table 7: key_value_store -- system state (JWT secret, daemon metadata)
// ---------------------------------------------------------------------------

export const keyValueStore = sqliteTable('key_value_store', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
});

// ---------------------------------------------------------------------------
// Table 8: notification_logs -- notification delivery history
// ---------------------------------------------------------------------------

export const notificationLogs = sqliteTable(
  'notification_logs',
  {
    id: text('id').primaryKey(), // UUID v7
    eventType: text('event_type').notNull(),
    walletId: text('wallet_id'),
    channel: text('channel').notNull(), // telegram / discord / ntfy
    status: text('status').notNull(), // sent / failed
    error: text('error'), // failure error message (nullable)
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  },
  (table) => [
    index('idx_notification_logs_event_type').on(table.eventType),
    index('idx_notification_logs_wallet_id').on(table.walletId),
    index('idx_notification_logs_status').on(table.status),
    index('idx_notification_logs_created_at').on(table.createdAt),
    check('check_notif_log_status', buildCheckSql('status', NOTIFICATION_LOG_STATUSES)),
  ],
);

// ---------------------------------------------------------------------------
// Table 9: token_registry -- EVM ERC-20 token management (builtin + custom)
// ---------------------------------------------------------------------------

export const tokenRegistry = sqliteTable(
  'token_registry',
  {
    id: text('id').primaryKey(), // UUID v7
    network: text('network').notNull(), // EvmNetworkType
    address: text('address').notNull(), // EIP-55 checksum address
    symbol: text('symbol').notNull(),
    name: text('name').notNull(),
    decimals: integer('decimals').notNull(),
    source: text('source').notNull().default('custom'), // 'builtin' | 'custom'
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  },
  (table) => [
    uniqueIndex('idx_token_registry_network_address').on(table.network, table.address),
    index('idx_token_registry_network').on(table.network),
    check('check_token_source', sql`source IN ('builtin', 'custom')`),
  ],
);

// ---------------------------------------------------------------------------
// Table 10: settings -- daemon operational settings (key-value)
// ---------------------------------------------------------------------------

export const settings = sqliteTable(
  'settings',
  {
    key: text('key').primaryKey(), // e.g., 'notifications.telegram_bot_token'
    value: text('value').notNull(), // plain or AES-GCM encrypted (base64 JSON)
    encrypted: integer('encrypted', { mode: 'boolean' }).notNull().default(false),
    category: text('category').notNull(), // 'notifications' | 'rpc' | 'security' | 'daemon' | 'walletconnect'
    updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
  },
  (table) => [
    index('idx_settings_category').on(table.category),
  ],
);
