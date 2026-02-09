/**
 * SQLite database connection with 7 required PRAGMAs.
 *
 * PRAGMAs are applied in order on every new connection per doc 25 section 1.2:
 *   1. journal_mode = WAL
 *   2. synchronous = NORMAL
 *   3. foreign_keys = ON
 *   4. busy_timeout = 5000
 *   5. cache_size = -64000
 *   6. mmap_size = 268435456
 *   7. temp_store = MEMORY
 *
 * @see docs/25-sqlite-schema.md
 */

import Database from 'better-sqlite3';
import type { Database as DatabaseType } from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import * as schema from './schema.js';

export interface DatabaseConnection {
  sqlite: DatabaseType;
  db: BetterSQLite3Database<typeof schema>;
}

/**
 * Create a new SQLite database connection with all required PRAGMAs applied.
 *
 * @param dbPath - Path to the SQLite database file, or ':memory:' for in-memory.
 * @returns Object containing the raw better-sqlite3 instance and the Drizzle ORM instance.
 */
export function createDatabase(dbPath: string): DatabaseConnection {
  const sqlite = new Database(dbPath);

  // Apply 7 PRAGMAs in order (doc 25 section 1.2)
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('synchronous = NORMAL');
  sqlite.pragma('foreign_keys = ON');
  sqlite.pragma('busy_timeout = 5000');
  sqlite.pragma('cache_size = -64000');
  sqlite.pragma('mmap_size = 268435456');
  sqlite.pragma('temp_store = MEMORY');

  const db = drizzle(sqlite, { schema });
  return { sqlite, db };
}

/**
 * Gracefully close the database connection.
 * Runs WAL checkpoint(TRUNCATE) to merge WAL into main database file before closing.
 *
 * @param sqlite - The raw better-sqlite3 database instance.
 */
export function closeDatabase(sqlite: DatabaseType): void {
  sqlite.pragma('wal_checkpoint(TRUNCATE)');
  sqlite.close();
}
