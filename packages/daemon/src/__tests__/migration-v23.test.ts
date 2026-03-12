/**
 * Migration v23 tests: DeFi async tracking columns and indexes.
 *
 * Tests cover:
 * 1. bridge_status and bridge_metadata columns exist after pushSchema
 * 2. bridge_status CHECK constraint allows 6 valid values
 * 3. bridge_status CHECK constraint rejects invalid values
 * 4. bridge_status NULL is allowed (default for non-bridge transactions)
 * 5. Partial indexes exist (idx_transactions_bridge_status, idx_transactions_gas_waiting)
 * 6. TRANSACTION_STATUSES has 11 entries including GAS_WAITING
 * 7. GAS_WAITING status is accepted by transactions CHECK constraint
 *
 * @see internal/objectives/m28-00-defi-basic-protocol-design.md (DEFI-04 ASNC-01)
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { Database as DatabaseType } from 'better-sqlite3';
import { createDatabase, pushSchema } from '../infrastructure/database/index.js';
import { TRANSACTION_STATUSES } from '@waiaas/core';
import { BRIDGE_STATUS_VALUES } from '@waiaas/actions';

// ---------------------------------------------------------------------------
// Setup: in-memory DB with full schema (v23)
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

function createTestWallet(id: string = 'w-test-v23'): void {
  const ts = nowTs();
  sqlite.prepare(
    `INSERT OR IGNORE INTO wallets (id, name, chain, environment, public_key, status, created_at, updated_at)
     VALUES (?, 'v23-test', 'solana', 'testnet', ?, 'ACTIVE', ?, ?)`,
  ).run(id, `pk-${id}`, ts, ts);
}

function getCreateSql(tableName: string): string {
  const row = sqlite
    .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?")
    .get(tableName) as { sql: string } | undefined;
  if (!row) throw new Error(`Table '${tableName}' not found`);
  return row.sql;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Migration v23: bridge_status and bridge_metadata columns', () => {
  it('transactions table has bridge_status column', () => {
    const columns = sqlite
      .prepare("PRAGMA table_info('transactions')")
      .all() as Array<{ name: string; type: string; notnull: number }>;
    const bridgeStatus = columns.find((c) => c.name === 'bridge_status');
    expect(bridgeStatus).toBeDefined();
    expect(bridgeStatus!.type).toBe('TEXT');
    expect(bridgeStatus!.notnull).toBe(0); // nullable
  });

  it('transactions table has bridge_metadata column', () => {
    const columns = sqlite
      .prepare("PRAGMA table_info('transactions')")
      .all() as Array<{ name: string; type: string; notnull: number }>;
    const bridgeMetadata = columns.find((c) => c.name === 'bridge_metadata');
    expect(bridgeMetadata).toBeDefined();
    expect(bridgeMetadata!.type).toBe('TEXT');
    expect(bridgeMetadata!.notnull).toBe(0); // nullable
  });
});

describe('Migration v23: bridge_status CHECK constraint', () => {
  it('accepts all 6 valid bridge_status values', () => {
    createTestWallet('w-bridge-check');
    const ts = nowTs();

    for (const status of BRIDGE_STATUS_VALUES) {
      const txId = `tx-bridge-${status}-${Date.now()}-${Math.random()}`;
      expect(() => {
        sqlite.prepare(
          `INSERT INTO transactions (id, wallet_id, chain, type, status, created_at, bridge_status)
           VALUES (?, 'w-bridge-check', 'solana', 'TRANSFER', 'PENDING', ?, ?)`,
        ).run(txId, ts, status);
      }).not.toThrow();
    }
  });

  it('rejects invalid bridge_status values', () => {
    createTestWallet('w-bridge-reject');
    const ts = nowTs();

    expect(() => {
      sqlite.prepare(
        `INSERT INTO transactions (id, wallet_id, chain, type, status, created_at, bridge_status)
         VALUES ('tx-invalid-bridge', 'w-bridge-reject', 'solana', 'TRANSFER', 'PENDING', ?, 'INVALID_STATUS')`,
      ).run(ts);
    }).toThrow(/SQLITE_CONSTRAINT|CHECK/);
  });

  it('allows NULL bridge_status (default for non-bridge transactions)', () => {
    createTestWallet('w-bridge-null');
    const ts = nowTs();

    expect(() => {
      sqlite.prepare(
        `INSERT INTO transactions (id, wallet_id, chain, type, status, created_at, bridge_status)
         VALUES ('tx-null-bridge', 'w-bridge-null', 'solana', 'TRANSFER', 'PENDING', ?, NULL)`,
      ).run(ts);
    }).not.toThrow();
  });

  it('bridge_status CHECK values match BRIDGE_STATUS_VALUES SSoT', () => {
    const createSql = getCreateSql('transactions');
    // Extract bridge_status CHECK values
    const match = createSql.match(
      /bridge_status\s+IS\s+NULL\s+OR\s+bridge_status\s+IN\s*\(([^)]+)\)/i,
    );
    expect(match).not.toBeNull();

    const dbValues = match![1]!
      .split(',')
      .map((v) => v.trim().replace(/^'|'$/g, ''))
      .filter((v) => v.length > 0);

    expect([...dbValues].sort()).toEqual([...BRIDGE_STATUS_VALUES].sort());
  });
});

describe('Migration v23: partial indexes', () => {
  it('idx_transactions_bridge_status exists with WHERE clause', () => {
    const indexes = sqlite
      .prepare("SELECT name, sql FROM sqlite_master WHERE type = 'index' AND tbl_name = 'transactions'")
      .all() as Array<{ name: string; sql: string | null }>;

    const bridgeIdx = indexes.find((i) => i.name === 'idx_transactions_bridge_status');
    expect(bridgeIdx).toBeDefined();
    expect(bridgeIdx!.sql).toContain('bridge_status');
    expect(bridgeIdx!.sql!.toLowerCase()).toContain('where');
    expect(bridgeIdx!.sql!.toLowerCase()).toContain('is not null');
  });

  it('idx_transactions_gas_waiting exists with WHERE clause', () => {
    const indexes = sqlite
      .prepare("SELECT name, sql FROM sqlite_master WHERE type = 'index' AND tbl_name = 'transactions'")
      .all() as Array<{ name: string; sql: string | null }>;

    const gasIdx = indexes.find((i) => i.name === 'idx_transactions_gas_waiting');
    expect(gasIdx).toBeDefined();
    expect(gasIdx!.sql).toContain('status');
    expect(gasIdx!.sql!.toLowerCase()).toContain('where');
    expect(gasIdx!.sql!).toContain('GAS_WAITING');
  });
});

describe('Migration v23: TRANSACTION_STATUSES with GAS_WAITING', () => {
  it('TRANSACTION_STATUSES has 11 entries', () => {
    expect(TRANSACTION_STATUSES).toHaveLength(11);
  });

  it('TRANSACTION_STATUSES includes GAS_WAITING', () => {
    expect(TRANSACTION_STATUSES).toContain('GAS_WAITING');
  });

  it('GAS_WAITING status is accepted by transactions CHECK constraint', () => {
    createTestWallet('w-gas-waiting');
    const ts = nowTs();

    expect(() => {
      sqlite.prepare(
        `INSERT INTO transactions (id, wallet_id, chain, type, status, created_at)
         VALUES ('tx-gas-waiting', 'w-gas-waiting', 'solana', 'TRANSFER', 'GAS_WAITING', ?)`,
      ).run(ts);
    }).not.toThrow();
  });

  it('transactions status CHECK values include all 11 TRANSACTION_STATUSES', () => {
    const createSql = getCreateSql('transactions');
    // Find the status CHECK constraint (not bridge_status)
    // Pattern: status ... CHECK (status IN (...))
    const match = createSql.match(
      /status\s+TEXT\s+NOT\s+NULL\s+DEFAULT\s+'PENDING'\s+CHECK\s*\(\s*status\s+IN\s*\(([^)]+)\)/i,
    );
    expect(match).not.toBeNull();

    const dbValues = match![1]!
      .split(',')
      .map((v) => v.trim().replace(/^'|'$/g, ''))
      .filter((v) => v.length > 0);

    expect(dbValues).toHaveLength(11);
    expect([...dbValues].sort()).toEqual([...TRANSACTION_STATUSES].sort());
  });
});

describe('Migration v23: BRIDGE_STATUS_VALUES', () => {
  it('BRIDGE_STATUS_VALUES has 11 entries', () => {
    expect(BRIDGE_STATUS_VALUES).toHaveLength(11);
  });

  it('BRIDGE_STATUS_VALUES contains expected values', () => {
    expect(BRIDGE_STATUS_VALUES).toContain('PENDING');
    expect(BRIDGE_STATUS_VALUES).toContain('COMPLETED');
    expect(BRIDGE_STATUS_VALUES).toContain('FAILED');
    expect(BRIDGE_STATUS_VALUES).toContain('BRIDGE_MONITORING');
    expect(BRIDGE_STATUS_VALUES).toContain('TIMEOUT');
    expect(BRIDGE_STATUS_VALUES).toContain('REFUNDED');
  });
});

describe('Migration v23: schema_version', () => {
  it('schema_version includes version 23', () => {
    const row = sqlite
      .prepare('SELECT version, description FROM schema_version WHERE version = 23')
      .get() as { version: number; description: string } | undefined;
    expect(row).toBeDefined();
    expect(row!.version).toBe(23);
  });
});
