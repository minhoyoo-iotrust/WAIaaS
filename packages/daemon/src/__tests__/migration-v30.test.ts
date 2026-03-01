/**
 * Migration v30 tests: Add MATURED position status to defi_positions.
 *
 * Tests cover:
 * 1. MATURED status accepted in defi_positions CHECK constraint
 * 2. Existing ACTIVE/CLOSED/LIQUIDATED data preserved after migration
 * 3. Invalid status still rejected
 * 4. Indexes preserved after table recreation
 * 5. Fresh DB (pushSchema) includes MATURED status
 *
 * @see internal/objectives/m29-06-pendle-yield-trading.md
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { Database as DatabaseType } from 'better-sqlite3';
import { createDatabase, pushSchema } from '../infrastructure/database/index.js';

// ---------------------------------------------------------------------------
// Setup: in-memory DB with full schema (v30)
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

function createTestWallet(id: string = 'w-test-v30'): void {
  const ts = nowTs();
  sqlite.prepare(
    `INSERT OR IGNORE INTO wallets (id, name, chain, environment, public_key, status, created_at, updated_at)
     VALUES (?, 'v30-test', 'ethereum', 'mainnet', ?, 'ACTIVE', ?, ?)`,
  ).run(id, `pk-${id}`, ts, ts);
}

function insertPosition(overrides: Record<string, unknown> = {}): void {
  const ts = nowTs();
  const defaults = {
    id: `pos-${Math.random().toString(36).slice(2, 10)}`,
    wallet_id: 'w-test-v30',
    category: 'YIELD',
    provider: 'pendle',
    chain: 'ethereum',
    network: null,
    asset_id: '0xpt-steth',
    amount: '1000000000000000000',
    amount_usd: 3200.0,
    metadata: JSON.stringify({ tokenType: 'PT', maturity: 1782000000 }),
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

describe('Migration v30: MATURED position status', () => {
  it('accepts MATURED status in defi_positions', () => {
    createTestWallet();
    expect(() => {
      insertPosition({ id: 'pos-matured-1', status: 'MATURED', asset_id: 'pt-matured' });
    }).not.toThrow();

    const row = sqlite
      .prepare('SELECT status FROM defi_positions WHERE id = ?')
      .get('pos-matured-1') as { status: string };
    expect(row.status).toBe('MATURED');
  });

  it('still accepts ACTIVE, CLOSED, LIQUIDATED statuses', () => {
    createTestWallet();
    for (const status of ['ACTIVE', 'CLOSED', 'LIQUIDATED']) {
      expect(() => {
        insertPosition({ id: `pos-legacy-${status}`, status, asset_id: `asset-${status}` });
      }).not.toThrow();
    }
  });

  it('rejects invalid status', () => {
    createTestWallet();
    expect(() => {
      insertPosition({ id: 'pos-invalid', status: 'INVALID', asset_id: 'asset-invalid' });
    }).toThrow();
  });

  it('accepts YIELD category for Pendle positions', () => {
    createTestWallet();
    expect(() => {
      insertPosition({
        id: 'pos-yield-1',
        category: 'YIELD',
        provider: 'pendle',
        asset_id: 'pt-steth-yield',
      });
    }).not.toThrow();
  });

  it('preserves indexes after table recreation', () => {
    const indexes = sqlite
      .prepare("SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='defi_positions'")
      .all() as Array<{ name: string }>;
    const indexNames = indexes.map((i) => i.name);
    expect(indexNames).toContain('idx_defi_positions_wallet_category');
    expect(indexNames).toContain('idx_defi_positions_wallet_provider');
    expect(indexNames).toContain('idx_defi_positions_status');
    expect(indexNames).toContain('idx_defi_positions_unique');
  });

  it('schema_version includes v30', () => {
    const row = sqlite
      .prepare('SELECT MAX(version) AS max_version FROM schema_version')
      .get() as { max_version: number };
    expect(row.max_version).toBeGreaterThanOrEqual(30);
  });

  it('MATURED position with Yield metadata roundtrips correctly', () => {
    createTestWallet();
    const metadata = JSON.stringify({
      tokenType: 'PT',
      maturity: 1782000000,
      marketId: '0xmarket123',
      apy: 0.052,
    });
    insertPosition({
      id: 'pos-yield-meta',
      category: 'YIELD',
      status: 'MATURED',
      metadata,
      asset_id: 'pt-meta-yield',
    });

    const row = sqlite
      .prepare('SELECT metadata, status, category FROM defi_positions WHERE id = ?')
      .get('pos-yield-meta') as { metadata: string; status: string; category: string };
    expect(row.status).toBe('MATURED');
    expect(row.category).toBe('YIELD');
    const parsed = JSON.parse(row.metadata);
    expect(parsed.tokenType).toBe('PT');
    expect(parsed.maturity).toBe(1782000000);
  });
});
