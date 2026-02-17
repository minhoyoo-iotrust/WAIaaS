/**
 * Schema compatibility checker for daemon startup.
 *
 * Checks whether the running code version is compatible with the DB schema version.
 * Three outcomes:
 *   - ok: code == db schema version (or fresh DB)
 *   - migrate: code > db schema version (auto-migration will be applied by pushSchema)
 *   - reject: code < db schema version (user must upgrade) OR db < MIN_COMPATIBLE (step-by-step upgrade)
 *
 * @see docs/65-migration-strategy.md
 */

import type { Database } from 'better-sqlite3';
import { LATEST_SCHEMA_VERSION } from './migrate.js';

/**
 * Minimum DB schema version this code version can work with.
 * If the DB schema is below this, a step-by-step upgrade path is required.
 * Set to 1 (initial schema) -- all migrations from v1 to current are available.
 * Future breaking migrations may bump this value.
 */
export const MIN_COMPATIBLE_SCHEMA_VERSION = 1;

export type CompatibilityResult =
  | { action: 'ok' }
  | { action: 'migrate' }
  | { action: 'reject'; reason: 'code_too_old' | 'schema_too_old'; message: string };

/**
 * Check compatibility between code's expected schema and DB's actual schema version.
 *
 * @param sqlite - Raw better-sqlite3 database instance
 * @returns CompatibilityResult indicating whether to proceed, migrate, or reject
 */
export function checkSchemaCompatibility(sqlite: Database): CompatibilityResult {
  // Check if schema_version table exists
  const tableExists = sqlite
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='schema_version'")
    .get();
  if (!tableExists) {
    // Fresh DB, no schema yet -> pushSchema will handle everything
    return { action: 'ok' };
  }

  // Get current max version and row count
  const row = sqlite
    .prepare('SELECT MAX(version) AS max_version FROM schema_version')
    .get() as { max_version: number | null } | undefined;
  const dbVersion = row?.max_version ?? null;

  if (dbVersion === null) {
    // Empty schema_version table -> fresh DB
    return { action: 'ok' };
  }

  if (dbVersion < MIN_COMPATIBLE_SCHEMA_VERSION) {
    return {
      action: 'reject',
      reason: 'schema_too_old',
      message: [
        `DB schema version ${dbVersion} is below minimum compatible version ${MIN_COMPATIBLE_SCHEMA_VERSION}.`,
        `This database was created with a much older version of WAIaaS.`,
        `Step-by-step upgrade required:`,
        `  1. Install the intermediate version: npm install -g @waiaas/cli@<intermediate-version>`,
        `  2. Run: waiaas start (to migrate DB to intermediate schema)`,
        `  3. Then upgrade to latest: waiaas upgrade`,
      ].join('\n'),
    };
  }

  if (dbVersion > LATEST_SCHEMA_VERSION) {
    return {
      action: 'reject',
      reason: 'code_too_old',
      message: [
        `DB schema version ${dbVersion} is newer than code expects (${LATEST_SCHEMA_VERSION}).`,
        `This database was created or migrated by a newer version of WAIaaS.`,
        `Run: waiaas upgrade`,
      ].join('\n'),
    };
  }

  if (dbVersion < LATEST_SCHEMA_VERSION) {
    return { action: 'migrate' };
  }

  // dbVersion === LATEST_SCHEMA_VERSION
  return { action: 'ok' };
}
