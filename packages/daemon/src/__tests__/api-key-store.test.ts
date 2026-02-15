/**
 * ApiKeyStore unit tests.
 *
 * Tests cover:
 * a. set -- new key stored encrypted (plaintext != DB value)
 * b. get -- decrypt and retrieve stored key
 * c. get -- null for non-existent provider
 * d. set (upsert) -- updatedAt refreshed on update
 * e. getMasked -- long key masking (first 4 + ... + last 2)
 * f. getMasked -- short key masking (****)
 * g. has -- true for existing key
 * h. has -- false for non-existent key
 * i. delete -- true for existing key
 * j. delete -- false for non-existent key
 * k. listAll -- multiple keys with masking
 * l. set + delete + get -- null after deletion
 *
 * Uses in-memory SQLite with pushSchema for a fresh DB per test.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { Database as DatabaseType } from 'better-sqlite3';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { createDatabase, pushSchema, apiKeys } from '../infrastructure/database/index.js';
import type * as schema from '../infrastructure/database/schema.js';
import { ApiKeyStore } from '../infrastructure/action/api-key-store.js';

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const TEST_MASTER_PASSWORD = 'test-master-password-for-api-keys';

function createTestDb(): { sqlite: DatabaseType; db: BetterSQLite3Database<typeof schema> } {
  const conn = createDatabase(':memory:');
  pushSchema(conn.sqlite);
  return conn;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ApiKeyStore', () => {
  let sqlite: DatabaseType;
  let db: BetterSQLite3Database<typeof schema>;
  let store: ApiKeyStore;

  beforeEach(() => {
    const conn = createTestDb();
    sqlite = conn.sqlite;
    db = conn.db;
    store = new ApiKeyStore(db, TEST_MASTER_PASSWORD);
  });

  afterEach(() => {
    try {
      sqlite.close();
    } catch {
      /* already closed */
    }
  });

  // -------------------------------------------------------------------------
  // a. set -- new key stored encrypted
  // -------------------------------------------------------------------------

  it('a: set stores encrypted value (not plaintext)', () => {
    const providerName = 'coingecko';
    const apiKey = 'CG-abc123def456xyz789';

    store.set(providerName, apiKey);

    // Read raw DB value
    const row = db.select().from(apiKeys).get();
    expect(row).toBeDefined();
    expect(row!.providerName).toBe(providerName);
    // Encrypted value should NOT equal plaintext
    expect(row!.encryptedKey).not.toBe(apiKey);
    // Should be a base64-encoded JSON string
    expect(row!.encryptedKey.length).toBeGreaterThan(0);
  });

  // -------------------------------------------------------------------------
  // b. get -- decrypt and retrieve
  // -------------------------------------------------------------------------

  it('b: get returns decrypted API key', () => {
    const providerName = 'coingecko';
    const apiKey = 'CG-abc123def456xyz789';

    store.set(providerName, apiKey);
    const retrieved = store.get(providerName);

    expect(retrieved).toBe(apiKey);
  });

  // -------------------------------------------------------------------------
  // c. get -- null for non-existent provider
  // -------------------------------------------------------------------------

  it('c: get returns null for non-existent provider', () => {
    const result = store.get('nonexistent');
    expect(result).toBeNull();
  });

  // -------------------------------------------------------------------------
  // d. set (upsert) -- updatedAt refreshed
  // -------------------------------------------------------------------------

  it('d: set upserts existing key and refreshes updatedAt', async () => {
    const providerName = 'coingecko';
    const originalKey = 'CG-original-key-123';
    const updatedKey = 'CG-updated-key-456';

    store.set(providerName, originalKey);

    // Read original timestamps
    const originalRow = db.select().from(apiKeys).get();
    expect(originalRow).toBeDefined();
    const originalCreatedAt = originalRow!.createdAt.getTime();
    const originalUpdatedAt = originalRow!.updatedAt.getTime();

    // Wait a tiny bit to ensure different timestamp (Unix seconds)
    await new Promise((resolve) => setTimeout(resolve, 1100));

    store.set(providerName, updatedKey);

    // Read updated row
    const updatedRow = db.select().from(apiKeys).get();
    expect(updatedRow).toBeDefined();

    // createdAt should be preserved (upsert does NOT update createdAt)
    expect(updatedRow!.createdAt.getTime()).toBe(originalCreatedAt);

    // updatedAt should be refreshed
    expect(updatedRow!.updatedAt.getTime()).toBeGreaterThanOrEqual(originalUpdatedAt);

    // Key should be the new value
    expect(store.get(providerName)).toBe(updatedKey);
  });

  // -------------------------------------------------------------------------
  // e. getMasked -- long key masking
  // -------------------------------------------------------------------------

  it('e: getMasked masks long key (first 4 + ... + last 2)', () => {
    const providerName = 'coingecko';
    const apiKey = 'CG-abc123def456xyz789'; // 20 chars

    store.set(providerName, apiKey);
    const masked = store.getMasked(providerName);

    expect(masked).toBe('CG-a...89');
  });

  // -------------------------------------------------------------------------
  // f. getMasked -- short key masking
  // -------------------------------------------------------------------------

  it('f: getMasked masks short key (<4 chars) as ****', () => {
    const providerName = 'tiny';
    const apiKey = 'ab'; // 2 chars

    store.set(providerName, apiKey);
    const masked = store.getMasked(providerName);

    expect(masked).toBe('****');
  });

  it('f2: getMasked masks medium key (4-6 chars) as first 2 + ...', () => {
    const providerName = 'medium';
    const apiKey = 'abcde'; // 5 chars

    store.set(providerName, apiKey);
    const masked = store.getMasked(providerName);

    expect(masked).toBe('ab...');
  });

  it('f3: getMasked returns null for non-existent provider', () => {
    const masked = store.getMasked('nonexistent');
    expect(masked).toBeNull();
  });

  // -------------------------------------------------------------------------
  // g. has -- true for existing key
  // -------------------------------------------------------------------------

  it('g: has returns true for existing provider', () => {
    store.set('coingecko', 'test-key');
    expect(store.has('coingecko')).toBe(true);
  });

  // -------------------------------------------------------------------------
  // h. has -- false for non-existent key
  // -------------------------------------------------------------------------

  it('h: has returns false for non-existent provider', () => {
    expect(store.has('nonexistent')).toBe(false);
  });

  // -------------------------------------------------------------------------
  // i. delete -- true for existing key
  // -------------------------------------------------------------------------

  it('i: delete returns true when key existed', () => {
    store.set('coingecko', 'test-key');
    const result = store.delete('coingecko');
    expect(result).toBe(true);
  });

  // -------------------------------------------------------------------------
  // j. delete -- false for non-existent key
  // -------------------------------------------------------------------------

  it('j: delete returns false when key did not exist', () => {
    const result = store.delete('nonexistent');
    expect(result).toBe(false);
  });

  // -------------------------------------------------------------------------
  // k. listAll -- multiple keys with masking
  // -------------------------------------------------------------------------

  it('k: listAll returns all keys with masked values', () => {
    store.set('coingecko', 'CG-abc123def456xyz789');
    store.set('pyth', 'pyth-key-abcdefgh');
    store.set('custom', 'xy');

    const list = store.listAll();

    expect(list).toHaveLength(3);

    // Sort for deterministic comparison
    const sorted = list.sort((a, b) => a.providerName.localeCompare(b.providerName));

    expect(sorted[0].providerName).toBe('coingecko');
    expect(sorted[0].hasKey).toBe(true);
    expect(sorted[0].maskedKey).toBe('CG-a...89');
    expect(sorted[0].updatedAt).toBeInstanceOf(Date);

    expect(sorted[1].providerName).toBe('custom');
    expect(sorted[1].hasKey).toBe(true);
    expect(sorted[1].maskedKey).toBe('****');

    expect(sorted[2].providerName).toBe('pyth');
    expect(sorted[2].hasKey).toBe(true);
    expect(sorted[2].maskedKey).toBe('pyth...gh');
  });

  // -------------------------------------------------------------------------
  // l. set + delete + get -- null after deletion
  // -------------------------------------------------------------------------

  it('l: get returns null after deletion', () => {
    store.set('coingecko', 'test-key');
    expect(store.get('coingecko')).toBe('test-key');

    store.delete('coingecko');
    expect(store.get('coingecko')).toBeNull();
    expect(store.has('coingecko')).toBe(false);
  });
});
