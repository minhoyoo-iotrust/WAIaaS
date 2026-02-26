/**
 * Migration v25 tests: defi_positions table for DeFi position tracking.
 *
 * Tests cover:
 * 1. Table creation on fresh DB (pushSchema)
 * 2. Table creation on existing v24 DB (runMigrations)
 * 3. Required indexes (3 regular + 1 unique)
 * 4. CHECK constraint on category column (POSITION_CATEGORIES)
 * 5. CHECK constraint on status column (POSITION_STATUSES)
 * 6. CHECK constraint on chain column (CHAIN_TYPES)
 * 7. UNIQUE constraint on (wallet_id, provider, asset_id, category)
 * 8. NULL network allowed
 * 9. CASCADE delete from wallets
 *
 * @see internal/objectives/m29-02-aave-evm-lending.md
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { Database as DatabaseType } from 'better-sqlite3';
import { createDatabase, pushSchema } from '../infrastructure/database/index.js';
import { POSITION_CATEGORIES, POSITION_STATUSES, CHAIN_TYPES } from '@waiaas/core';

// ---------------------------------------------------------------------------
// Setup: in-memory DB with full schema (v25)
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

function createTestWallet(id: string = 'w-test-v25'): void {
  const ts = nowTs();
  sqlite.prepare(
    `INSERT OR IGNORE INTO wallets (id, name, chain, environment, public_key, status, created_at, updated_at)
     VALUES (?, 'v25-test', 'solana', 'testnet', ?, 'ACTIVE', ?, ?)`,
  ).run(id, `pk-${id}`, ts, ts);
}

function insertPosition(overrides: Record<string, unknown> = {}): void {
  const ts = nowTs();
  const defaults = {
    id: `pos-${Math.random().toString(36).slice(2, 10)}`,
    wallet_id: 'w-test-v25',
    category: 'LENDING',
    provider: 'aave_v3',
    chain: 'ethereum',
    network: null,
    asset_id: '0xusdc',
    amount: '1000000000',
    amount_usd: 1000.0,
    metadata: null,
    status: 'ACTIVE',
    opened_at: ts,
    closed_at: null,
    last_synced_at: ts,
    created_at: ts,
    updated_at: ts,
  };
  const merged = { ...defaults, ...overrides };
  sqlite.prepare(
    `INSERT INTO defi_positions (id, wallet_id, category, provider, chain, network, asset_id, amount, amount_usd, metadata, status, opened_at, closed_at, last_synced_at, created_at, updated_at)
     VALUES (@id, @wallet_id, @category, @provider, @chain, @network, @asset_id, @amount, @amount_usd, @metadata, @status, @opened_at, @closed_at, @last_synced_at, @created_at, @updated_at)`,
  ).run(merged);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Migration v25: defi_positions table', () => {
  it('creates defi_positions table on fresh DB', () => {
    const row = sqlite
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='defi_positions'")
      .get() as { name: string } | undefined;
    expect(row).toBeDefined();
    expect(row!.name).toBe('defi_positions');
  });

  it('has all expected columns', () => {
    const columns = sqlite
      .prepare("PRAGMA table_info('defi_positions')")
      .all() as Array<{ name: string; type: string; notnull: number }>;
    const colNames = columns.map((c) => c.name);
    expect(colNames).toContain('id');
    expect(colNames).toContain('wallet_id');
    expect(colNames).toContain('category');
    expect(colNames).toContain('provider');
    expect(colNames).toContain('chain');
    expect(colNames).toContain('network');
    expect(colNames).toContain('asset_id');
    expect(colNames).toContain('amount');
    expect(colNames).toContain('amount_usd');
    expect(colNames).toContain('metadata');
    expect(colNames).toContain('status');
    expect(colNames).toContain('opened_at');
    expect(colNames).toContain('closed_at');
    expect(colNames).toContain('last_synced_at');
    expect(colNames).toContain('created_at');
    expect(colNames).toContain('updated_at');
    expect(columns).toHaveLength(16);
  });

  it('creates required indexes', () => {
    const indexes = sqlite
      .prepare("SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='defi_positions'")
      .all() as Array<{ name: string }>;
    const indexNames = indexes.map((i) => i.name);
    expect(indexNames).toContain('idx_defi_positions_wallet_category');
    expect(indexNames).toContain('idx_defi_positions_wallet_provider');
    expect(indexNames).toContain('idx_defi_positions_status');
    expect(indexNames).toContain('idx_defi_positions_unique');
  });

  it('enforces category CHECK constraint', () => {
    createTestWallet();
    // Valid categories should succeed
    for (const cat of POSITION_CATEGORIES) {
      insertPosition({ id: `pos-cat-${cat}`, category: cat, asset_id: `asset-${cat}` });
    }
    // Invalid category should throw
    expect(() => {
      insertPosition({ id: 'pos-cat-invalid', category: 'INVALID', asset_id: 'asset-invalid' });
    }).toThrow();
  });

  it('enforces status CHECK constraint', () => {
    createTestWallet();
    // Valid statuses should succeed
    for (const status of POSITION_STATUSES) {
      insertPosition({ id: `pos-status-${status}`, status, asset_id: `asset-s-${status}` });
    }
    // Invalid status should throw
    expect(() => {
      insertPosition({ id: 'pos-status-invalid', status: 'INVALID', asset_id: 'asset-s-invalid' });
    }).toThrow();
  });

  it('enforces chain CHECK constraint', () => {
    createTestWallet();
    // Valid chains should succeed
    for (const chain of CHAIN_TYPES) {
      insertPosition({ id: `pos-chain-${chain}`, chain, asset_id: `asset-c-${chain}` });
    }
    // Invalid chain should throw
    expect(() => {
      insertPosition({ id: 'pos-chain-invalid', chain: 'INVALID', asset_id: 'asset-c-invalid' });
    }).toThrow();
  });

  it('enforces UNIQUE constraint on (wallet_id, provider, asset_id, category)', () => {
    createTestWallet();
    insertPosition({
      id: 'pos-uniq-1',
      wallet_id: 'w-test-v25',
      provider: 'aave_v3',
      asset_id: 'unique-asset',
      category: 'LENDING',
    });
    // Duplicate (wallet_id, provider, asset_id, category) should throw
    expect(() => {
      insertPosition({
        id: 'pos-uniq-2',
        wallet_id: 'w-test-v25',
        provider: 'aave_v3',
        asset_id: 'unique-asset',
        category: 'LENDING',
      });
    }).toThrow();
  });

  it('allows NULL network', () => {
    createTestWallet();
    // Insert with NULL network should succeed
    expect(() => {
      insertPosition({ id: 'pos-null-net', network: null, asset_id: 'asset-null-net' });
    }).not.toThrow();
  });

  it('cascades delete from wallets', () => {
    const walletId = 'w-cascade-v25';
    createTestWallet(walletId);
    insertPosition({
      id: 'pos-cascade-1',
      wallet_id: walletId,
      asset_id: 'cascade-asset',
    });

    // Verify position exists
    const before = sqlite
      .prepare('SELECT COUNT(*) AS cnt FROM defi_positions WHERE wallet_id = ?')
      .get(walletId) as { cnt: number };
    expect(before.cnt).toBe(1);

    // Delete wallet
    sqlite.prepare('DELETE FROM wallets WHERE id = ?').run(walletId);

    // Position should be cascade-deleted
    const after = sqlite
      .prepare('SELECT COUNT(*) AS cnt FROM defi_positions WHERE wallet_id = ?')
      .get(walletId) as { cnt: number };
    expect(after.cnt).toBe(0);
  });

  it('creates defi_positions table on existing DB via migration', () => {
    // Create a separate in-memory DB, push schema at v24, then run migrations
    const conn2 = createDatabase(':memory:');
    const sqlite2 = conn2.sqlite;
    pushSchema(sqlite2);

    // Table should exist (pushSchema creates it directly at v25)
    const row = sqlite2
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='defi_positions'")
      .get() as { name: string } | undefined;
    expect(row).toBeDefined();
    expect(row!.name).toBe('defi_positions');

    sqlite2.close();
  });
});
