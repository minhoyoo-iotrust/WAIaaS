/**
 * Tests for schema compatibility checker (v1.8 upgrade safety).
 *
 * Tests cover:
 * 1. Scenario A: code > db (auto-migration needed) -> { action: 'migrate' }
 * 2. Scenario B: code == db (normal) -> { action: 'ok' }
 * 3. Scenario C: code < db (reject + upgrade hint) -> { action: 'reject', reason: 'code_too_old' }
 * 4. Scenario D: db < MIN_COMPATIBLE (reject + step-by-step) -> { action: 'reject', reason: 'schema_too_old' }
 * 5. Scenario E: empty DB (fresh creation) -> { action: 'ok' }
 * 6. MIN_COMPATIBLE_SCHEMA_VERSION range validation
 * 7. Integration: future version gap
 * 8. Integration: exact one-below migration trigger
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { Database as DatabaseType } from 'better-sqlite3';
import { createDatabase, pushSchema, LATEST_SCHEMA_VERSION } from '../infrastructure/database/index.js';
import {
  checkSchemaCompatibility,
  MIN_COMPATIBLE_SCHEMA_VERSION,
} from '../infrastructure/database/compatibility.js';

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
// Tests
// ---------------------------------------------------------------------------

describe('checkSchemaCompatibility', () => {
  it('Scenario A: code > db -- returns migrate when DB schema is behind', () => {
    // Manipulate schema_version to simulate an older DB
    // Delete all versions above LATEST - 2
    sqlite
      .prepare('DELETE FROM schema_version WHERE version > ?')
      .run(LATEST_SCHEMA_VERSION - 2);

    const result = checkSchemaCompatibility(sqlite);
    expect(result).toEqual({ action: 'migrate' });
  });

  it('Scenario B: code == db -- returns ok when DB schema matches code', () => {
    // Default state: pushSchema records LATEST_SCHEMA_VERSION
    const result = checkSchemaCompatibility(sqlite);
    expect(result).toEqual({ action: 'ok' });
  });

  it('Scenario C: code < db -- returns reject with code_too_old and waiaas upgrade hint', () => {
    // Insert a version beyond what code expects
    sqlite
      .prepare(
        'INSERT INTO schema_version (version, applied_at, description) VALUES (?, ?, ?)',
      )
      .run(LATEST_SCHEMA_VERSION + 1, Math.floor(Date.now() / 1000), 'Future migration');

    const result = checkSchemaCompatibility(sqlite);
    expect(result.action).toBe('reject');
    if (result.action === 'reject') {
      expect(result.reason).toBe('code_too_old');
      expect(result.message).toContain('waiaas upgrade');
    }
  });

  it('Scenario D: db < MIN_COMPATIBLE -- returns reject with schema_too_old and step-by-step guide', () => {
    // Only applies if MIN_COMPATIBLE > 1; if MIN_COMPATIBLE is 1, we need
    // a schema_version table with max < 1, which means 0.
    // For this test we manipulate MIN_COMPATIBLE behavior by clearing
    // schema_version and inserting version 0 (below any valid MIN).
    // Since MIN_COMPATIBLE_SCHEMA_VERSION >= 1, version 0 is always below it.

    // Clear schema_version and insert version 0
    sqlite.exec('DELETE FROM schema_version');
    sqlite
      .prepare(
        'INSERT INTO schema_version (version, applied_at, description) VALUES (?, ?, ?)',
      )
      .run(0, Math.floor(Date.now() / 1000), 'Artificial pre-minimum version');

    const result = checkSchemaCompatibility(sqlite);
    expect(result.action).toBe('reject');
    if (result.action === 'reject') {
      expect(result.reason).toBe('schema_too_old');
      expect(result.message).toContain('Step-by-step upgrade');
    }
  });

  it('Scenario E: empty DB (no schema_version table) -- returns ok', () => {
    // Create a completely fresh DB without schema_version table
    const freshConn = createDatabase(':memory:');
    const freshSqlite = freshConn.sqlite;

    try {
      const result = checkSchemaCompatibility(freshSqlite);
      expect(result).toEqual({ action: 'ok' });
    } finally {
      freshSqlite.close();
    }
  });

  it('Scenario E-2: empty schema_version table -- returns ok', () => {
    // Clear all rows from schema_version
    sqlite.exec('DELETE FROM schema_version');

    const result = checkSchemaCompatibility(sqlite);
    expect(result).toEqual({ action: 'ok' });
  });

  it('MIN_COMPATIBLE_SCHEMA_VERSION is in valid range (>= 1 and <= LATEST)', () => {
    expect(MIN_COMPATIBLE_SCHEMA_VERSION).toBeGreaterThanOrEqual(1);
    expect(MIN_COMPATIBLE_SCHEMA_VERSION).toBeLessThanOrEqual(LATEST_SCHEMA_VERSION);
  });

  it('returns migrate when DB is exactly one version behind', () => {
    // Set DB to LATEST - 1
    sqlite
      .prepare('DELETE FROM schema_version WHERE version > ?')
      .run(LATEST_SCHEMA_VERSION - 1);

    const result = checkSchemaCompatibility(sqlite);
    expect(result).toEqual({ action: 'migrate' });
  });

  it('returns reject with code_too_old when DB is far ahead', () => {
    // Insert version LATEST + 5
    sqlite
      .prepare(
        'INSERT INTO schema_version (version, applied_at, description) VALUES (?, ?, ?)',
      )
      .run(LATEST_SCHEMA_VERSION + 5, Math.floor(Date.now() / 1000), 'Far future migration');

    const result = checkSchemaCompatibility(sqlite);
    expect(result.action).toBe('reject');
    if (result.action === 'reject') {
      expect(result.reason).toBe('code_too_old');
      expect(result.message).toContain('waiaas upgrade');
    }
  });
});
