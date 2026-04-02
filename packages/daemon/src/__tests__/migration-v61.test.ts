/**
 * Tests for database migration v61: Signing primary partial unique index.
 *
 * Verifies:
 * 1. Deduplicates signing_enabled=1 duplicates within same wallet_type (keeps earliest)
 * 2. Partial unique index rejects second signing_enabled=1 for same wallet_type
 * 3. CHECK trigger rejects invalid signing_enabled values (not 0 or 1)
 * 4. Different wallet_types can each have one signing_enabled=1
 * 5. Idempotent (running migration twice doesn't error)
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { mkdirSync, rmSync } from 'node:fs';
import { migrations } from '../infrastructure/database/migrations/v61.js';
import type { Migration } from '../infrastructure/database/migrate.js';

function createTestDb(tmpDir: string): Database.Database {
  const dbPath = join(tmpDir, `test-v61-${Date.now()}.db`);
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  return db;
}

function setupPreV61Schema(db: Database.Database): void {
  // Create wallet_apps table (v60 schema -- with push_relay_url, no partial unique index)
  db.exec(`
    CREATE TABLE IF NOT EXISTS wallet_apps (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      display_name TEXT NOT NULL,
      wallet_type TEXT NOT NULL DEFAULT '',
      signing_enabled INTEGER NOT NULL DEFAULT 1,
      alerts_enabled INTEGER NOT NULL DEFAULT 1,
      sign_topic TEXT,
      notify_topic TEXT,
      subscription_token TEXT,
      push_relay_url TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `);

  // Create wallet_type index (pre-existing from v34)
  db.exec('CREATE INDEX IF NOT EXISTS idx_wallet_apps_wallet_type ON wallet_apps(wallet_type)');

  // Create schema_version table
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_version (
      version INTEGER PRIMARY KEY,
      applied_at INTEGER NOT NULL,
      description TEXT NOT NULL
    )
  `);

  // Mark schema as v60
  db.prepare('INSERT INTO schema_version (version, applied_at, description) VALUES (?, ?, ?)')
    .run(60, Math.floor(Date.now() / 1000), 'pre-v61 test setup');
}

function getV61Migration(): Migration {
  const v61 = migrations.find(m => m.version === 61);
  if (!v61) throw new Error('v61 migration not found in migrations array');
  return v61;
}

let tmpDir: string;
let db: Database.Database;

beforeEach(() => {
  tmpDir = join(tmpdir(), `migration-v61-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(tmpDir, { recursive: true });
  db = createTestDb(tmpDir);
  setupPreV61Schema(db);
});

afterEach(() => {
  db.close();
  rmSync(tmpDir, { recursive: true });
});

describe('migration v61', () => {
  it('deduplicates signing primary within same wallet_type (keeps earliest)', () => {
    const now = Math.floor(Date.now() / 1000);
    // Insert two apps of same wallet_type with signing_enabled=1
    db.prepare(
      'INSERT INTO wallet_apps (id, name, display_name, wallet_type, signing_enabled, created_at, updated_at) VALUES (?, ?, ?, ?, 1, ?, ?)',
    ).run('app-1', 'dcent-1', "D'CENT 1", 'dcent', now - 100, now - 100);

    db.prepare(
      'INSERT INTO wallet_apps (id, name, display_name, wallet_type, signing_enabled, created_at, updated_at) VALUES (?, ?, ?, ?, 1, ?, ?)',
    ).run('app-2', 'dcent-2', "D'CENT 2", 'dcent', now, now);

    const v61 = getV61Migration();
    v61.up(db);

    // app-1 (earlier created_at) should keep signing_enabled=1
    const app1 = db.prepare('SELECT signing_enabled FROM wallet_apps WHERE id = ?').get('app-1') as { signing_enabled: number };
    expect(app1.signing_enabled).toBe(1);

    // app-2 (later created_at) should be signing_enabled=0
    const app2 = db.prepare('SELECT signing_enabled FROM wallet_apps WHERE id = ?').get('app-2') as { signing_enabled: number };
    expect(app2.signing_enabled).toBe(0);
  });

  it('partial unique index rejects second signing primary for same wallet_type', () => {
    const v61 = getV61Migration();
    v61.up(db);

    const now = Math.floor(Date.now() / 1000);
    // Insert first signing primary for dcent
    db.prepare(
      'INSERT INTO wallet_apps (id, name, display_name, wallet_type, signing_enabled, created_at, updated_at) VALUES (?, ?, ?, ?, 1, ?, ?)',
    ).run('app-1', 'dcent-1', "D'CENT 1", 'dcent', now, now);

    // Second INSERT with same wallet_type + signing_enabled=1 should fail
    expect(() => {
      db.prepare(
        'INSERT INTO wallet_apps (id, name, display_name, wallet_type, signing_enabled, created_at, updated_at) VALUES (?, ?, ?, ?, 1, ?, ?)',
      ).run('app-2', 'dcent-2', "D'CENT 2", 'dcent', now, now);
    }).toThrow(/UNIQUE/);
  });

  it('CHECK trigger rejects invalid signing_enabled value', () => {
    const v61 = getV61Migration();
    v61.up(db);

    const now = Math.floor(Date.now() / 1000);
    // INSERT with signing_enabled=2 should fail
    expect(() => {
      db.prepare(
        'INSERT INTO wallet_apps (id, name, display_name, wallet_type, signing_enabled, created_at, updated_at) VALUES (?, ?, ?, ?, 2, ?, ?)',
      ).run('bad-app', 'bad', 'Bad', 'dcent', now, now);
    }).toThrow(/signing_enabled must be 0 or 1/);
  });

  it('CHECK trigger rejects invalid signing_enabled on UPDATE', () => {
    const v61 = getV61Migration();
    v61.up(db);

    const now = Math.floor(Date.now() / 1000);
    db.prepare(
      'INSERT INTO wallet_apps (id, name, display_name, wallet_type, signing_enabled, created_at, updated_at) VALUES (?, ?, ?, ?, 1, ?, ?)',
    ).run('app-1', 'dcent-1', "D'CENT 1", 'dcent', now, now);

    expect(() => {
      db.prepare('UPDATE wallet_apps SET signing_enabled = 3 WHERE id = ?').run('app-1');
    }).toThrow(/signing_enabled must be 0 or 1/);
  });

  it('allows different wallet_types to each have one signing primary', () => {
    const v61 = getV61Migration();
    v61.up(db);

    const now = Math.floor(Date.now() / 1000);
    // dcent wallet_type with signing_enabled=1
    db.prepare(
      'INSERT INTO wallet_apps (id, name, display_name, wallet_type, signing_enabled, created_at, updated_at) VALUES (?, ?, ?, ?, 1, ?, ?)',
    ).run('app-dcent', 'dcent', "D'CENT", 'dcent', now, now);

    // ledger wallet_type with signing_enabled=1 -- should NOT fail
    expect(() => {
      db.prepare(
        'INSERT INTO wallet_apps (id, name, display_name, wallet_type, signing_enabled, created_at, updated_at) VALUES (?, ?, ?, ?, 1, ?, ?)',
      ).run('app-ledger', 'ledger', 'Ledger', 'ledger', now, now);
    }).not.toThrow();

    // Verify both are signing_enabled=1
    const dcent = db.prepare('SELECT signing_enabled FROM wallet_apps WHERE id = ?').get('app-dcent') as { signing_enabled: number };
    const ledger = db.prepare('SELECT signing_enabled FROM wallet_apps WHERE id = ?').get('app-ledger') as { signing_enabled: number };
    expect(dcent.signing_enabled).toBe(1);
    expect(ledger.signing_enabled).toBe(1);
  });

  it('idempotent: running migration twice does not error', () => {
    const now = Math.floor(Date.now() / 1000);
    db.prepare(
      'INSERT INTO wallet_apps (id, name, display_name, wallet_type, signing_enabled, created_at, updated_at) VALUES (?, ?, ?, ?, 1, ?, ?)',
    ).run('app-1', 'dcent', "D'CENT", 'dcent', now, now);

    const v61 = getV61Migration();
    v61.up(db);
    expect(() => v61.up(db)).not.toThrow();

    // Verify the app still has correct state
    const app = db.prepare('SELECT signing_enabled FROM wallet_apps WHERE id = ?').get('app-1') as { signing_enabled: number };
    expect(app.signing_enabled).toBe(1);
  });

  it('signing_enabled=0 rows are unaffected by partial unique index', () => {
    const v61 = getV61Migration();
    v61.up(db);

    const now = Math.floor(Date.now() / 1000);
    // Multiple signing_enabled=0 rows for same wallet_type should be fine
    db.prepare(
      'INSERT INTO wallet_apps (id, name, display_name, wallet_type, signing_enabled, created_at, updated_at) VALUES (?, ?, ?, ?, 0, ?, ?)',
    ).run('app-1', 'dcent-1', "D'CENT 1", 'dcent', now, now);

    expect(() => {
      db.prepare(
        'INSERT INTO wallet_apps (id, name, display_name, wallet_type, signing_enabled, created_at, updated_at) VALUES (?, ?, ?, ?, 0, ?, ?)',
      ).run('app-2', 'dcent-2', "D'CENT 2", 'dcent', now, now);
    }).not.toThrow();
  });
});
