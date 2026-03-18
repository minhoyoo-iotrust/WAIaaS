/**
 * Migration v31 tests: Create wallet_apps table for Human Wallet Apps registry.
 *
 * Tests cover:
 * 1. wallet_apps table creation with correct columns
 * 2. UNIQUE constraint on name column
 * 3. Fresh DB (pushSchema) includes wallet_apps and sets version to 31
 *
 * @see internal/objectives/m29-07-dcent-owner-signing.md
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { Database as DatabaseType } from 'better-sqlite3';
import { createDatabase, pushSchema, LATEST_SCHEMA_VERSION } from '../infrastructure/database/index.js';

// ---------------------------------------------------------------------------
// Setup: in-memory DB with full schema (v31)
// ---------------------------------------------------------------------------

let sqlite: DatabaseType;

beforeAll(() => {
  const conn = createDatabase(':memory:');
  sqlite = conn.sqlite;
  pushSchema(sqlite);
});

afterAll(() => {
  sqlite?.close();
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function nowTs(): number {
  return Math.floor(Date.now() / 1000);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Migration v31: wallet_apps table', () => {
  it('T-APP-01: wallet_apps table exists with correct columns', () => {
    const columns = sqlite
      .prepare("PRAGMA table_info('wallet_apps')")
      .all() as Array<{ name: string; type: string; notnull: number }>;

    const columnNames = columns.map((c) => c.name);
    expect(columnNames).toContain('id');
    expect(columnNames).toContain('name');
    expect(columnNames).toContain('display_name');
    expect(columnNames).toContain('signing_enabled');
    expect(columnNames).toContain('alerts_enabled');
    expect(columnNames).toContain('created_at');
    expect(columnNames).toContain('updated_at');
    // v33 added sign_topic/notify_topic, v34 added wallet_type/subscription_token, v60 added push_relay_url (12 columns total)
    expect(columns).toHaveLength(12);
  });

  it('T-APP-01b: UNIQUE constraint on name column', () => {
    const ts = nowTs();
    sqlite.prepare(
      'INSERT INTO wallet_apps (id, name, display_name, signing_enabled, alerts_enabled, created_at, updated_at) VALUES (?, ?, ?, 1, 1, ?, ?)',
    ).run('unique-test-1', 'unique-name', 'Unique App', ts, ts);

    expect(() => {
      sqlite.prepare(
        'INSERT INTO wallet_apps (id, name, display_name, signing_enabled, alerts_enabled, created_at, updated_at) VALUES (?, ?, ?, 1, 1, ?, ?)',
      ).run('unique-test-2', 'unique-name', 'Duplicate', ts, ts);
    }).toThrow(/UNIQUE constraint failed/);

    // Cleanup
    sqlite.prepare('DELETE FROM wallet_apps WHERE id LIKE ?').run('unique-test-%');
  });

  it('T-APP-01c: Fresh DB has LATEST_SCHEMA_VERSION >= 31', () => {
    expect(LATEST_SCHEMA_VERSION).toBeGreaterThanOrEqual(31);

    const row = sqlite
      .prepare('SELECT MAX(version) AS max_version FROM schema_version')
      .get() as { max_version: number };
    expect(row.max_version).toBe(LATEST_SCHEMA_VERSION);
  });

  it('defaults: signing_enabled=1 and alerts_enabled=1', () => {
    const ts = nowTs();
    sqlite.prepare(
      'INSERT INTO wallet_apps (id, name, display_name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
    ).run('default-test-1', 'defaults-app', 'Default App', ts, ts);

    const row = sqlite.prepare(
      'SELECT signing_enabled, alerts_enabled FROM wallet_apps WHERE id = ?',
    ).get('default-test-1') as { signing_enabled: number; alerts_enabled: number };

    expect(row.signing_enabled).toBe(1);
    expect(row.alerts_enabled).toBe(1);

    // Cleanup
    sqlite.prepare('DELETE FROM wallet_apps WHERE id = ?').run('default-test-1');
  });
});
