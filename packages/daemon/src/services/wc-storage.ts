/**
 * SQLite-backed IKeyValueStorage implementation for WalletConnect SDK.
 *
 * Replaces the default FileSystemStorage to ensure WC session/pairing data
 * is persisted in the WAIaaS SQLite database (data/waiaas.db). This guarantees
 * session survival across daemon restarts and Docker container recreation.
 *
 * All data is stored in the `wc_store` table (created by DB v16 migration).
 *
 * @see packages/daemon/src/infrastructure/database/migrate.ts (v16)
 */

import type { Database } from 'better-sqlite3';

// ---------------------------------------------------------------------------
// IKeyValueStorage interface (from keyvaluestorage-interface@1.0.0)
// Defined locally to avoid transitive dependency issues in pnpm strict mode.
// ---------------------------------------------------------------------------

export interface IKeyValueStorage {
  getKeys(): Promise<string[]>;
  getEntries<T = any>(): Promise<[string, T][]>;
  getItem<T = any>(key: string): Promise<T | undefined>;
  setItem<T = any>(key: string, value: T): Promise<void>;
  removeItem(key: string): Promise<void>;
}

// ---------------------------------------------------------------------------
// SqliteKeyValueStorage
// ---------------------------------------------------------------------------

export class SqliteKeyValueStorage implements IKeyValueStorage {
  constructor(private readonly sqlite: Database) {}

  async getKeys(): Promise<string[]> {
    const rows = this.sqlite
      .prepare('SELECT key FROM wc_store')
      .all() as Array<{ key: string }>;
    return rows.map((r) => r.key);
  }

  async getEntries<T = any>(): Promise<[string, T][]> {
    const rows = this.sqlite
      .prepare('SELECT key, value FROM wc_store')
      .all() as Array<{ key: string; value: string }>;
    return rows.map((r) => [r.key, JSON.parse(r.value) as T]);
  }

  async getItem<T = any>(key: string): Promise<T | undefined> {
    const row = this.sqlite
      .prepare('SELECT value FROM wc_store WHERE key = ?')
      .get(key) as { value: string } | undefined;
    return row ? (JSON.parse(row.value) as T) : undefined;
  }

  async setItem<T = any>(key: string, value: T): Promise<void> {
    this.sqlite
      .prepare('INSERT OR REPLACE INTO wc_store (key, value) VALUES (?, ?)')
      .run(key, JSON.stringify(value));
  }

  async removeItem(key: string): Promise<void> {
    this.sqlite
      .prepare('DELETE FROM wc_store WHERE key = ?')
      .run(key);
  }
}
