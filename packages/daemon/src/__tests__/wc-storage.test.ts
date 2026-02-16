/**
 * SqliteKeyValueStorage unit tests.
 *
 * Verifies all 5 IKeyValueStorage methods against the wc_store table:
 * getKeys, getEntries, getItem, setItem, removeItem.
 *
 * Uses in-memory SQLite with pushSchema for a fresh DB per test.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { Database as DatabaseType } from 'better-sqlite3';
import { createDatabase, pushSchema } from '../infrastructure/database/index.js';
import { SqliteKeyValueStorage } from '../services/wc-storage.js';

// ---------------------------------------------------------------------------
// Test setup
// ---------------------------------------------------------------------------

let sqlite: DatabaseType;
let storage: SqliteKeyValueStorage;

beforeEach(() => {
  const conn = createDatabase(':memory:');
  sqlite = conn.sqlite;
  pushSchema(sqlite);
  storage = new SqliteKeyValueStorage(sqlite);
});

afterEach(() => {
  try {
    sqlite.close();
  } catch {
    // already closed
  }
});

// ---------------------------------------------------------------------------
// setItem + getItem
// ---------------------------------------------------------------------------

describe('setItem + getItem', () => {
  it('stores and retrieves a string value', async () => {
    await storage.setItem('key1', 'hello');
    const result = await storage.getItem<string>('key1');
    expect(result).toBe('hello');
  });

  it('stores and retrieves a number value', async () => {
    await storage.setItem('key-num', 42);
    const result = await storage.getItem<number>('key-num');
    expect(result).toBe(42);
  });

  it('stores and retrieves an object value', async () => {
    const obj = { name: 'test', nested: { a: 1 } };
    await storage.setItem('key-obj', obj);
    const result = await storage.getItem<typeof obj>('key-obj');
    expect(result).toEqual(obj);
  });

  it('stores and retrieves an array value', async () => {
    const arr = [1, 'two', { three: 3 }];
    await storage.setItem('key-arr', arr);
    const result = await storage.getItem('key-arr');
    expect(result).toEqual(arr);
  });
});

// ---------------------------------------------------------------------------
// setItem overwrite
// ---------------------------------------------------------------------------

describe('setItem overwrite', () => {
  it('overwrites existing key with new value', async () => {
    await storage.setItem('ow-key', 'first');
    await storage.setItem('ow-key', 'second');
    const result = await storage.getItem<string>('ow-key');
    expect(result).toBe('second');
  });
});

// ---------------------------------------------------------------------------
// removeItem
// ---------------------------------------------------------------------------

describe('removeItem', () => {
  it('removes a stored key, getItem returns undefined', async () => {
    await storage.setItem('rm-key', 'value');
    await storage.removeItem('rm-key');
    const result = await storage.getItem('rm-key');
    expect(result).toBeUndefined();
  });

  it('does not throw when removing non-existent key', async () => {
    await expect(storage.removeItem('no-such-key')).resolves.not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// getKeys
// ---------------------------------------------------------------------------

describe('getKeys', () => {
  it('returns all stored keys', async () => {
    await storage.setItem('k1', 'v1');
    await storage.setItem('k2', 'v2');
    await storage.setItem('k3', 'v3');

    const keys = await storage.getKeys();
    expect(keys.sort()).toEqual(['k1', 'k2', 'k3']);
  });

  it('returns empty array for empty store', async () => {
    const keys = await storage.getKeys();
    expect(keys).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// getEntries
// ---------------------------------------------------------------------------

describe('getEntries', () => {
  it('returns all stored [key, value] pairs', async () => {
    await storage.setItem('e1', 'val1');
    await storage.setItem('e2', { n: 2 });

    const entries = await storage.getEntries();
    const sorted = entries.sort((a, b) => a[0].localeCompare(b[0]));

    expect(sorted).toEqual([
      ['e1', 'val1'],
      ['e2', { n: 2 }],
    ]);
  });

  it('returns empty array for empty store', async () => {
    const entries = await storage.getEntries();
    expect(entries).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// getItem non-existent key
// ---------------------------------------------------------------------------

describe('getItem non-existent key', () => {
  it('returns undefined for key that was never set', async () => {
    const result = await storage.getItem('never-set');
    expect(result).toBeUndefined();
  });
});
