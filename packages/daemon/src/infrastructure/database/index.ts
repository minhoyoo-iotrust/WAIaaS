/**
 * Database module barrel export.
 *
 * Re-exports schema definitions, connection management, schema push, and ID generation.
 */

export { createDatabase, closeDatabase } from './connection.js';
export type { DatabaseConnection } from './connection.js';
export { pushSchema, runMigrations, MIGRATIONS } from './migrate.js';
export type { Migration } from './migrate.js';
export {
  agents,
  sessions,
  transactions,
  policies,
  pendingApprovals,
  auditLog,
  keyValueStore,
  notificationLogs,
} from './schema.js';
export { generateId } from './id.js';
