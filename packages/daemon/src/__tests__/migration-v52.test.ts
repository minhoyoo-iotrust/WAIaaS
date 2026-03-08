/**
 * Tests for DB v52 migration: hyperliquid_sub_accounts table.
 *
 * Plan 351-01 Task 2: DB v52 migration for Sub-account management.
 */

import { describe, it, expect, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { LATEST_SCHEMA_VERSION, pushSchema, runMigrations } from '../infrastructure/database/migrate.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createV51Db(): InstanceType<typeof Database> {
  const sqlite = new Database(':memory:');
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');
  pushSchema(sqlite);

  // Downgrade: remove v52+ artifacts to simulate a v51 DB
  sqlite.pragma('foreign_keys = OFF');
  sqlite.exec('DROP TABLE IF EXISTS hyperliquid_sub_accounts');
  sqlite.exec('DROP INDEX IF EXISTS idx_hl_sub_wallet');
  sqlite.exec('DELETE FROM schema_version WHERE version >= 52');
  sqlite.pragma('foreign_keys = ON');

  return sqlite;
}

function getMaxVersion(sqlite: InstanceType<typeof Database>): number {
  const row = sqlite
    .prepare('SELECT MAX(version) AS max_version FROM schema_version')
    .get() as { max_version: number };
  return row.max_version;
}

function tableExists(sqlite: InstanceType<typeof Database>, name: string): boolean {
  const row = sqlite
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?")
    .get(name) as { name: string } | undefined;
  return row !== undefined;
}

function getTableColumns(sqlite: InstanceType<typeof Database>, table: string): string[] {
  const rows = sqlite.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  return rows.map((r) => r.name);
}

function indexExists(sqlite: InstanceType<typeof Database>, name: string): boolean {
  const row = sqlite
    .prepare("SELECT name FROM sqlite_master WHERE type='index' AND name=?")
    .get(name) as { name: string } | undefined;
  return row !== undefined;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('DB v52 Migration: hyperliquid_sub_accounts', () => {
  let sqlite: InstanceType<typeof Database>;

  afterEach(() => {
    if (sqlite) {
      try { sqlite.close(); } catch { /* ignore */ }
    }
  });

  it('T1: LATEST_SCHEMA_VERSION is 52', () => {
    expect(LATEST_SCHEMA_VERSION).toBe(52);
  });

  it('T2: hyperliquid_sub_accounts has all 5 columns', () => {
    sqlite = new Database(':memory:');
    sqlite.pragma('journal_mode = WAL');
    sqlite.pragma('foreign_keys = ON');
    pushSchema(sqlite);

    expect(tableExists(sqlite, 'hyperliquid_sub_accounts')).toBe(true);
    const cols = getTableColumns(sqlite, 'hyperliquid_sub_accounts');
    const expected = ['id', 'wallet_id', 'sub_account_address', 'name', 'created_at'];
    for (const col of expected) {
      expect(cols).toContain(col);
    }
    expect(cols).toHaveLength(5);
  });

  it('T3: can INSERT and SELECT from hyperliquid_sub_accounts', () => {
    sqlite = new Database(':memory:');
    sqlite.pragma('journal_mode = WAL');
    sqlite.pragma('foreign_keys = OFF'); // Skip FK check for standalone test
    pushSchema(sqlite);

    sqlite.prepare(`
      INSERT INTO hyperliquid_sub_accounts
        (id, wallet_id, sub_account_address, name)
      VALUES (?, ?, ?, ?)
    `).run('hl-sub-001', 'wallet-001', '0xSub123', 'Trend Following');

    const row = sqlite.prepare('SELECT * FROM hyperliquid_sub_accounts WHERE id = ?').get('hl-sub-001') as Record<string, unknown>;
    expect(row).toBeDefined();
    expect(row.wallet_id).toBe('wallet-001');
    expect(row.sub_account_address).toBe('0xSub123');
    expect(row.name).toBe('Trend Following');
    expect(row.created_at).toBeGreaterThan(0);
  });

  it('T4: UNIQUE(wallet_id, sub_account_address) constraint works', () => {
    sqlite = new Database(':memory:');
    sqlite.pragma('journal_mode = WAL');
    sqlite.pragma('foreign_keys = OFF');
    pushSchema(sqlite);

    sqlite.prepare(`
      INSERT INTO hyperliquid_sub_accounts
        (id, wallet_id, sub_account_address, name)
      VALUES (?, ?, ?, ?)
    `).run('hl-sub-a', 'w1', '0xSub1', 'Alpha');

    // Same wallet_id + sub_account_address should fail
    expect(() => {
      sqlite.prepare(`
        INSERT INTO hyperliquid_sub_accounts
          (id, wallet_id, sub_account_address, name)
        VALUES (?, ?, ?, ?)
      `).run('hl-sub-b', 'w1', '0xSub1', 'Duplicate');
    }).toThrow();

    // Different sub_account_address should succeed
    expect(() => {
      sqlite.prepare(`
        INSERT INTO hyperliquid_sub_accounts
          (id, wallet_id, sub_account_address, name)
        VALUES (?, ?, ?, ?)
      `).run('hl-sub-c', 'w1', '0xSub2', 'Beta');
    }).not.toThrow();
  });

  it('T5: idx_hl_sub_wallet index exists', () => {
    sqlite = new Database(':memory:');
    sqlite.pragma('journal_mode = WAL');
    sqlite.pragma('foreign_keys = ON');
    pushSchema(sqlite);

    expect(indexExists(sqlite, 'idx_hl_sub_wallet')).toBe(true);
  });

  it('T6: v51 -> v52 incremental migration', () => {
    sqlite = createV51Db();
    expect(tableExists(sqlite, 'hyperliquid_sub_accounts')).toBe(false);
    expect(getMaxVersion(sqlite)).toBe(51);

    runMigrations(sqlite);

    expect(tableExists(sqlite, 'hyperliquid_sub_accounts')).toBe(true);
    expect(getMaxVersion(sqlite)).toBe(52);

    const cols = getTableColumns(sqlite, 'hyperliquid_sub_accounts');
    expect(cols).toContain('id');
    expect(cols).toContain('wallet_id');
    expect(cols).toContain('sub_account_address');
    expect(cols).toContain('name');
    expect(cols).toContain('created_at');
  });

  it('T7: migration is idempotent', () => {
    sqlite = createV51Db();
    runMigrations(sqlite);
    expect(tableExists(sqlite, 'hyperliquid_sub_accounts')).toBe(true);

    // Running again should not throw
    expect(() => runMigrations(sqlite)).not.toThrow();
  });

  it('T8: name field accepts NULL', () => {
    sqlite = new Database(':memory:');
    sqlite.pragma('journal_mode = WAL');
    sqlite.pragma('foreign_keys = OFF');
    pushSchema(sqlite);

    sqlite.prepare(`
      INSERT INTO hyperliquid_sub_accounts
        (id, wallet_id, sub_account_address)
      VALUES (?, ?, ?)
    `).run('hl-sub-null', 'w1', '0xSubNullName');

    const row = sqlite.prepare('SELECT * FROM hyperliquid_sub_accounts WHERE id = ?').get('hl-sub-null') as Record<string, unknown>;
    expect(row.name).toBeNull();
    expect(row.sub_account_address).toBe('0xSubNullName');
  });
});
