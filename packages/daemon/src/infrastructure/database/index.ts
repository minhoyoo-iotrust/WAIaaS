/**
 * Database module barrel export.
 *
 * Re-exports schema definitions, connection management, schema push, and ID generation.
 */

export { createDatabase, closeDatabase } from './connection.js';
export type { DatabaseConnection } from './connection.js';
export { pushSchema, runMigrations, MIGRATIONS, LATEST_SCHEMA_VERSION } from './migrate.js';
export type { Migration } from './migrate.js';
export {
  wallets,
  sessions,
  sessionWallets,
  transactions,
  policies,
  pendingApprovals,
  auditLog,
  keyValueStore,
  notificationLogs,
  tokenRegistry,
  settings,
  apiKeys,
  telegramUsers,
  incomingTransactions,
  incomingTxCursors,
} from './schema.js';
export { generateId } from './id.js';
export { generateCheckConstraint } from './checks.js';
export { checkSchemaCompatibility, MIN_COMPATIBLE_SCHEMA_VERSION } from './compatibility.js';
export type { CompatibilityResult } from './compatibility.js';
