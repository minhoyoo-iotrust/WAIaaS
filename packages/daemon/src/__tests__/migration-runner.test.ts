/**
 * Tests for the DB migration runner (v1.4+ incremental migrations).
 *
 * Tests cover:
 * 1. Empty MIGRATIONS array -> no-op
 * 2. Sequential execution of new migrations
 * 3. Skipping already-applied migrations
 * 4. Rollback on failure + subsequent migrations not executed
 * 5. Migration order guarantee (ascending by version)
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { Database as DatabaseType } from 'better-sqlite3';
import { createDatabase, pushSchema, runMigrations } from '../infrastructure/database/index.js';
import type { Migration } from '../infrastructure/database/index.js';

// ---------------------------------------------------------------------------
// Test setup
// ---------------------------------------------------------------------------

let sqlite: DatabaseType;

beforeEach(() => {
  const conn = createDatabase(':memory:');
  sqlite = conn.sqlite;
  pushSchema(sqlite);
});

afterEach(() => {
  try {
    sqlite.close();
  } catch {
    // already closed
  }
});

// ---------------------------------------------------------------------------
// Helper: get current max version from schema_version
// ---------------------------------------------------------------------------

function getMaxVersion(): number {
  const row = sqlite
    .prepare('SELECT MAX(version) AS max_version FROM schema_version')
    .get() as { max_version: number | null };
  return row.max_version ?? 0;
}

function getVersions(): number[] {
  const rows = sqlite
    .prepare('SELECT version FROM schema_version ORDER BY version')
    .all() as Array<{ version: number }>;
  return rows.map((r) => r.version);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Migration Runner', () => {
  it('should return { applied: 0, skipped: 0 } for empty migrations array', () => {
    const result = runMigrations(sqlite, []);
    expect(result).toEqual({ applied: 0, skipped: 0 });
    expect(getMaxVersion()).toBe(1); // only initial version 1
  });

  it('should execute version 2 and 3 migrations sequentially', () => {
    const migrations: Migration[] = [
      {
        version: 2,
        description: 'Add test_column to agents',
        up: (db) => {
          db.exec('ALTER TABLE agents ADD COLUMN test_col_v2 TEXT');
        },
      },
      {
        version: 3,
        description: 'Add another test_column to agents',
        up: (db) => {
          db.exec('ALTER TABLE agents ADD COLUMN test_col_v3 TEXT');
        },
      },
    ];

    const result = runMigrations(sqlite, migrations);
    expect(result).toEqual({ applied: 2, skipped: 0 });
    expect(getMaxVersion()).toBe(3);
    expect(getVersions()).toEqual([1, 2, 3]);

    // Verify columns were actually added
    const columns = sqlite.prepare("PRAGMA table_info('agents')").all() as Array<{ name: string }>;
    const colNames = columns.map((c) => c.name);
    expect(colNames).toContain('test_col_v2');
    expect(colNames).toContain('test_col_v3');
  });

  it('should skip already-applied migrations', () => {
    const migrations: Migration[] = [
      {
        version: 2,
        description: 'Add test_column to agents',
        up: (db) => {
          db.exec('ALTER TABLE agents ADD COLUMN test_col_skip TEXT');
        },
      },
      {
        version: 3,
        description: 'Add another column',
        up: (db) => {
          db.exec('ALTER TABLE agents ADD COLUMN test_col_skip2 TEXT');
        },
      },
    ];

    // First run: apply both
    const first = runMigrations(sqlite, migrations);
    expect(first).toEqual({ applied: 2, skipped: 0 });

    // Second run: skip both
    const second = runMigrations(sqlite, migrations);
    expect(second).toEqual({ applied: 0, skipped: 2 });
    expect(getMaxVersion()).toBe(3);
  });

  it('should rollback failed migration and not execute subsequent ones', () => {
    const migrations: Migration[] = [
      {
        version: 2,
        description: 'Failing migration',
        up: () => {
          throw new Error('Intentional migration failure');
        },
      },
      {
        version: 3,
        description: 'Should not be reached',
        up: (db) => {
          db.exec('ALTER TABLE agents ADD COLUMN should_not_exist TEXT');
        },
      },
    ];

    expect(() => runMigrations(sqlite, migrations)).toThrow(
      /Migration v2.*failed.*Intentional migration failure/,
    );

    // version 2 should NOT be recorded
    expect(getMaxVersion()).toBe(1);
    expect(getVersions()).toEqual([1]);

    // version 3 should NOT have been executed
    const columns = sqlite.prepare("PRAGMA table_info('agents')").all() as Array<{ name: string }>;
    const colNames = columns.map((c) => c.name);
    expect(colNames).not.toContain('should_not_exist');
  });

  it('should execute migrations in ascending version order regardless of array order', () => {
    const executionOrder: number[] = [];

    const migrations: Migration[] = [
      {
        version: 4,
        description: 'Fourth',
        up: (db) => {
          executionOrder.push(4);
          db.exec('ALTER TABLE agents ADD COLUMN order_v4 TEXT');
        },
      },
      {
        version: 2,
        description: 'Second',
        up: (db) => {
          executionOrder.push(2);
          db.exec('ALTER TABLE agents ADD COLUMN order_v2 TEXT');
        },
      },
      {
        version: 3,
        description: 'Third',
        up: (db) => {
          executionOrder.push(3);
          db.exec('ALTER TABLE agents ADD COLUMN order_v3 TEXT');
        },
      },
    ];

    const result = runMigrations(sqlite, migrations);
    expect(result).toEqual({ applied: 3, skipped: 0 });
    expect(executionOrder).toEqual([2, 3, 4]);
    expect(getVersions()).toEqual([1, 2, 3, 4]);
  });

  it('should skip version 1 migration (already exists from pushSchema)', () => {
    const migrations: Migration[] = [
      {
        version: 1,
        description: 'Should be skipped (pushSchema creates v1)',
        up: () => {
          throw new Error('Should not execute');
        },
      },
      {
        version: 2,
        description: 'Should execute',
        up: (db) => {
          db.exec('ALTER TABLE agents ADD COLUMN v1_skip_test TEXT');
        },
      },
    ];

    const result = runMigrations(sqlite, migrations);
    expect(result).toEqual({ applied: 1, skipped: 1 });
    expect(getMaxVersion()).toBe(2);
  });

  it('should record description in schema_version for applied migrations', () => {
    const migrations: Migration[] = [
      {
        version: 2,
        description: 'Add token_balances table',
        up: (db) => {
          db.exec('ALTER TABLE agents ADD COLUMN desc_test TEXT');
        },
      },
    ];

    runMigrations(sqlite, migrations);

    const row = sqlite
      .prepare('SELECT description FROM schema_version WHERE version = 2')
      .get() as { description: string } | undefined;
    expect(row).toBeDefined();
    expect(row!.description).toBe('Add token_balances table');
  });
});
