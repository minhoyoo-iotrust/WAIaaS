/**
 * Database module barrel export.
 *
 * Re-exports schema definitions, connection management, schema push, and ID generation.
 *
 * v1.4.2: wallets is the canonical table name. `agents` is a backward-compat alias
 * that will be removed in Phase 91 when all daemon code migrates to `wallets`.
 */

export { createDatabase, closeDatabase } from './connection.js';
export type { DatabaseConnection } from './connection.js';
export { pushSchema, runMigrations, MIGRATIONS, LATEST_SCHEMA_VERSION } from './migrate.js';
export type { Migration } from './migrate.js';
export {
  wallets,
  sessions,
  transactions,
  policies,
  pendingApprovals,
  auditLog,
  keyValueStore,
  notificationLogs,
} from './schema.js';
// Backward-compat alias: existing daemon code references `agents` until Phase 91
export { wallets as agents } from './schema.js';
export { generateId } from './id.js';
