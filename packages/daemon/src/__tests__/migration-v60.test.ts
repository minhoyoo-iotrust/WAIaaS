/**
 * Tests for database migration v60: Push Relay migration.
 *
 * Verifies:
 * 1. push_relay_url column added to wallet_apps
 * 2. dcent wallet_type gets auto-configured push_relay_url
 * 3. sign_topic and notify_topic are set to NULL
 * 4. owner_approval_method 'sdk_ntfy' renamed to 'sdk_push' in wallets
 * 5. Idempotency (running migration twice doesn't error)
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { mkdirSync, rmSync } from 'node:fs';
import { migrations } from '../infrastructure/database/migrations/v51-v59.js';
import type { Migration } from '../infrastructure/database/migrate.js';

function createTestDb(tmpDir: string): Database.Database {
  const dbPath = join(tmpDir, `test-v60-${Date.now()}.db`);
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  return db;
}

function setupPreV60Schema(db: Database.Database): void {
  // Create minimal wallet_apps table (pre-v60 -- no push_relay_url column)
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
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `);

  // Create minimal wallets table (with sdk_ntfy in CHECK -- simplified for test)
  db.exec(`
    CREATE TABLE IF NOT EXISTS wallets (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      chain TEXT NOT NULL DEFAULT 'ethereum',
      environment TEXT NOT NULL DEFAULT 'mainnet',
      public_key TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'ACTIVE',
      owner_address TEXT,
      owner_verified INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      owner_approval_method TEXT,
      wallet_type TEXT,
      account_type TEXT NOT NULL DEFAULT 'eoa',
      monitor_incoming INTEGER NOT NULL DEFAULT 0,
      deployed INTEGER NOT NULL DEFAULT 1
    )
  `);

  // Create schema_version table
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_version (
      version INTEGER PRIMARY KEY,
      applied_at INTEGER NOT NULL,
      description TEXT NOT NULL
    )
  `);

  // Mark schema as v59
  db.prepare('INSERT INTO schema_version (version, applied_at, description) VALUES (?, ?, ?)')
    .run(59, Math.floor(Date.now() / 1000), 'pre-v60 test setup');
}

function getV60Migration(): Migration {
  const v60 = migrations.find(m => m.version === 60);
  if (!v60) throw new Error('v60 migration not found in migrations array');
  return v60;
}

let tmpDir: string;
let db: Database.Database;

beforeEach(() => {
  tmpDir = join(tmpdir(), `migration-v60-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(tmpDir, { recursive: true });
  db = createTestDb(tmpDir);
  setupPreV60Schema(db);
});

afterEach(() => {
  db.close();
  rmSync(tmpDir, { recursive: true });
});

describe('migration v60', () => {
  it('adds push_relay_url column to wallet_apps', () => {
    const v60 = getV60Migration();
    v60.up(db);

    const cols = (db.prepare("PRAGMA table_info('wallet_apps')").all() as Array<{ name: string }>)
      .map(c => c.name);
    expect(cols).toContain('push_relay_url');
  });

  it('sets dcent wallet_type push_relay_url to DCent Push Relay URL', () => {
    const now = Math.floor(Date.now() / 1000);
    db.prepare(`INSERT INTO wallet_apps (id, name, display_name, wallet_type, sign_topic, notify_topic, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
      .run('app-1', 'dcent', "D'CENT Wallet", 'dcent', 'waiaas-sign-dcent', 'waiaas-notify-dcent', now, now);

    const v60 = getV60Migration();
    v60.up(db);

    const row = db.prepare('SELECT push_relay_url FROM wallet_apps WHERE wallet_type = ?')
      .get('dcent') as { push_relay_url: string | null };
    expect(row.push_relay_url).toBe('https://waiaas-push.dcentwallet.com');
  });

  it('sets sign_topic and notify_topic to NULL for all rows', () => {
    const now = Math.floor(Date.now() / 1000);
    db.prepare(`INSERT INTO wallet_apps (id, name, display_name, wallet_type, sign_topic, notify_topic, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
      .run('app-1', 'dcent', "D'CENT Wallet", 'dcent', 'waiaas-sign-dcent', 'waiaas-notify-dcent', now, now);

    db.prepare(`INSERT INTO wallet_apps (id, name, display_name, wallet_type, sign_topic, notify_topic, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
      .run('app-2', 'other', 'Other Wallet', 'custom', 'waiaas-sign-other', 'waiaas-notify-other', now, now);

    const v60 = getV60Migration();
    v60.up(db);

    const rows = db.prepare('SELECT sign_topic, notify_topic FROM wallet_apps').all() as Array<{
      sign_topic: string | null;
      notify_topic: string | null;
    }>;
    for (const row of rows) {
      expect(row.sign_topic).toBeNull();
      expect(row.notify_topic).toBeNull();
    }
  });

  it('updates owner_approval_method sdk_ntfy to sdk_push in wallets table', () => {
    const now = Math.floor(Date.now() / 1000);
    db.prepare(`INSERT INTO wallets (id, name, chain, environment, public_key, status, owner_approval_method, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run('w-1', 'wallet-1', 'ethereum', 'mainnet', '0xabc', 'ACTIVE', 'sdk_ntfy', now, now);

    db.prepare(`INSERT INTO wallets (id, name, chain, environment, public_key, status, owner_approval_method, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run('w-2', 'wallet-2', 'ethereum', 'mainnet', '0xdef', 'ACTIVE', 'sdk_telegram', now, now);

    const v60 = getV60Migration();
    v60.up(db);

    const w1 = db.prepare('SELECT owner_approval_method FROM wallets WHERE id = ?')
      .get('w-1') as { owner_approval_method: string | null };
    expect(w1.owner_approval_method).toBe('sdk_push');

    const w2 = db.prepare('SELECT owner_approval_method FROM wallets WHERE id = ?')
      .get('w-2') as { owner_approval_method: string | null };
    expect(w2.owner_approval_method).toBe('sdk_telegram');
  });

  it('is idempotent (running twice does not fail)', () => {
    const v60 = getV60Migration();
    v60.up(db);
    expect(() => v60.up(db)).not.toThrow();
  });

  it('does not overwrite existing push_relay_url for dcent', () => {
    const v60 = getV60Migration();
    v60.up(db);

    const now = Math.floor(Date.now() / 1000);
    db.prepare(`INSERT INTO wallet_apps (id, name, display_name, wallet_type, push_relay_url, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .run('app-1', 'dcent', "D'CENT Wallet", 'dcent', 'https://custom-relay.example.com', now, now);

    // Run again (idempotent)
    v60.up(db);

    const row = db.prepare('SELECT push_relay_url FROM wallet_apps WHERE wallet_type = ?')
      .get('dcent') as { push_relay_url: string | null };
    // Should NOT overwrite since push_relay_url is already set
    expect(row.push_relay_url).toBe('https://custom-relay.example.com');
  });
});
