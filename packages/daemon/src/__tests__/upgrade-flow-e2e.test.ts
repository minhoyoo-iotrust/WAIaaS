/**
 * Upgrade flow E2E integration tests.
 *
 * Verifies the full upgrade pipeline:
 *   1. VersionCheckService -> Health endpoint (updateAvailable logic)
 *   2. Health response contract -> CLI notification flow
 *   3. Schema compatibility -> daemon startup decisions
 *   4. Full upgrade sequence: version check -> health -> backup -> schema compat
 *
 * Uses real modules (createHealthRoute, checkSchemaCompatibility, BackupService)
 * with mock boundaries at fetch/npm/filesystem.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, mkdirSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { Database as DatabaseType } from 'better-sqlite3';

import { createHealthRoute } from '../api/routes/health.js';
import { createDatabase, pushSchema, LATEST_SCHEMA_VERSION } from '../infrastructure/database/index.js';
import {
  checkSchemaCompatibility,
  MIN_COMPATIBLE_SCHEMA_VERSION,
} from '../infrastructure/database/compatibility.js';
import { BackupService } from '../infrastructure/backup/backup-service.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Create a mock VersionCheckService with controllable return values. */
function createMockVersionService(latest: string | null, checkedAt: number | null = Date.now()) {
  return {
    getLatest: () => latest,
    getCheckedAt: () => checkedAt,
    check: vi.fn().mockResolvedValue({ latest, current: '1.7.0' }),
  };
}

/** Extract JSON body from a Response. */
async function json(res: Response): Promise<Record<string, unknown>> {
  return (await res.json()) as Record<string, unknown>;
}

/** Create a temp data directory with a DB file for BackupService tests. */
function createTempDataDir(opts?: { withDb?: boolean; withConfig?: boolean }): string {
  const dir = mkdtempSync(join(tmpdir(), 'waiaas-e2e-'));
  if (opts?.withDb) {
    mkdirSync(join(dir, 'data'), { recursive: true });
    writeFileSync(join(dir, 'data', 'waiaas.db'), 'fake-db-content');
  }
  if (opts?.withConfig) {
    writeFileSync(join(dir, 'config.toml'), 'port = 3100\n');
  }
  return dir;
}

// ---------------------------------------------------------------------------
// 1. Version check -> Health endpoint
// ---------------------------------------------------------------------------

describe('upgrade flow E2E', () => {
  describe('1. Version check -> Health endpoint', () => {
    it('returns latestVersion=null and updateAvailable=false when service returns null', async () => {
      const mockService = createMockVersionService(null);
      const app = createHealthRoute({ versionCheckService: mockService as any });

      const res = await app.request('/');
      const body = await json(res);

      expect(res.status).toBe(200);
      expect(body.latestVersion).toBeNull();
      expect(body.updateAvailable).toBe(false);
    });

    it('returns updateAvailable=true when latest > current version', async () => {
      const mockService = createMockVersionService('99.0.0');
      const app = createHealthRoute({ versionCheckService: mockService as any });

      const res = await app.request('/');
      const body = await json(res);

      expect(res.status).toBe(200);
      expect(body.latestVersion).toBe('99.0.0');
      expect(body.updateAvailable).toBe(true);
    });

    it('returns updateAvailable=false when latest == current version', async () => {
      // Use version 0.0.1 which is guaranteed <= any real daemon version
      const mockService = createMockVersionService('0.0.1');
      const app = createHealthRoute({ versionCheckService: mockService as any });

      const res = await app.request('/');
      const body = await json(res);

      expect(body.latestVersion).toBe('0.0.1');
      expect(body.updateAvailable).toBe(false);
    });

    it('returns schemaVersion matching LATEST_SCHEMA_VERSION', async () => {
      const mockService = createMockVersionService(null);
      const app = createHealthRoute({ versionCheckService: mockService as any });

      const res = await app.request('/');
      const body = await json(res);

      expect(body.schemaVersion).toBe(LATEST_SCHEMA_VERSION);
    });

    it('returns all 7 expected fields with correct types', async () => {
      const mockService = createMockVersionService('2.0.0');
      const app = createHealthRoute({ versionCheckService: mockService as any });

      const res = await app.request('/');
      const body = await json(res);

      // 7 fields: status, version, latestVersion, updateAvailable, schemaVersion, uptime, timestamp
      expect(typeof body.status).toBe('string');
      expect(typeof body.version).toBe('string');
      // latestVersion is string or null
      expect(['string', 'object'].includes(typeof body.latestVersion)).toBe(true);
      expect(typeof body.updateAvailable).toBe('boolean');
      expect(typeof body.schemaVersion).toBe('number');
      expect(typeof body.uptime).toBe('number');
      expect(typeof body.timestamp).toBe('number');

      // Verify all keys are present
      const keys = Object.keys(body).sort();
      expect(keys).toEqual(
        ['latestVersion', 'schemaVersion', 'status', 'timestamp', 'updateAvailable', 'uptime', 'version'],
      );
    });
  });

  // ---------------------------------------------------------------------------
  // 2. Health -> CLI notification flow (contract tests)
  // ---------------------------------------------------------------------------

  describe('2. Health -> CLI notification flow (contract)', () => {
    it('health response with updateAvailable=true satisfies CLI notification contract', async () => {
      const mockService = createMockVersionService('99.0.0');
      const app = createHealthRoute({ versionCheckService: mockService as any });

      const res = await app.request('/');
      const body = await json(res);

      // CLI's checkAndNotifyUpdate reads these exact fields:
      // - updateAvailable (boolean) to decide whether to print
      // - version (string) to show "current -> latest"
      // - latestVersion (string) for the "upgrade to" message
      expect(body.updateAvailable).toBe(true);
      expect(typeof body.version).toBe('string');
      expect(body.version).toMatch(/^\d+\.\d+\.\d+/);
      expect(typeof body.latestVersion).toBe('string');
      expect(body.latestVersion).toMatch(/^\d+\.\d+\.\d+/);
    });

    it('health response with updateAvailable=false should not trigger CLI notification', async () => {
      const mockService = createMockVersionService('0.0.1');
      const app = createHealthRoute({ versionCheckService: mockService as any });

      const res = await app.request('/');
      const body = await json(res);

      // CLI checks: if (!body.updateAvailable) return; // no notification
      expect(body.updateAvailable).toBe(false);
    });

    it('health response with null latestVersion is safe for CLI consumption', async () => {
      // When VersionCheckService has never checked, latestVersion is null
      const app = createHealthRoute({ versionCheckService: null });

      const res = await app.request('/');
      const body = await json(res);

      // CLI must handle null latestVersion gracefully
      expect(body.latestVersion).toBeNull();
      expect(body.updateAvailable).toBe(false);
      // version is always present
      expect(typeof body.version).toBe('string');
    });
  });

  // ---------------------------------------------------------------------------
  // 3. Schema compatibility -> daemon start
  // ---------------------------------------------------------------------------

  describe('3. Schema compatibility -> daemon start', () => {
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

    it('code > DB schema: returns { action: "migrate" }', () => {
      // Remove the latest version records to simulate an older DB
      sqlite
        .prepare('DELETE FROM schema_version WHERE version > ?')
        .run(LATEST_SCHEMA_VERSION - 2);

      const result = checkSchemaCompatibility(sqlite);
      expect(result).toEqual({ action: 'migrate' });
    });

    it('code == DB schema: returns { action: "ok" }', () => {
      // Default: pushSchema sets DB to LATEST_SCHEMA_VERSION
      const result = checkSchemaCompatibility(sqlite);
      expect(result).toEqual({ action: 'ok' });
    });

    it('code < DB schema: returns { action: "reject", reason: "code_too_old" }', () => {
      // Insert a future version
      sqlite
        .prepare('INSERT INTO schema_version (version, applied_at, description) VALUES (?, ?, ?)')
        .run(LATEST_SCHEMA_VERSION + 1, Math.floor(Date.now() / 1000), 'Future version');

      const result = checkSchemaCompatibility(sqlite);
      expect(result.action).toBe('reject');
      if (result.action === 'reject') {
        expect(result.reason).toBe('code_too_old');
        expect(result.message).toContain('waiaas upgrade');
      }
    });

    it('DB < MIN_COMPATIBLE: returns { action: "reject", reason: "schema_too_old" }', () => {
      // Clear schema_version and insert version 0 (below MIN_COMPATIBLE=1)
      sqlite.exec('DELETE FROM schema_version');
      sqlite
        .prepare('INSERT INTO schema_version (version, applied_at, description) VALUES (?, ?, ?)')
        .run(0, Math.floor(Date.now() / 1000), 'Pre-minimum version');

      const result = checkSchemaCompatibility(sqlite);
      expect(result.action).toBe('reject');
      if (result.action === 'reject') {
        expect(result.reason).toBe('schema_too_old');
        expect(result.message).toContain('Step-by-step upgrade');
      }
    });

    it('fresh DB (no schema_version table): returns { action: "ok" }', () => {
      const freshConn = createDatabase(':memory:');
      const freshSqlite = freshConn.sqlite;

      try {
        const result = checkSchemaCompatibility(freshSqlite);
        expect(result).toEqual({ action: 'ok' });
      } finally {
        freshSqlite.close();
      }
    });
  });

  // ---------------------------------------------------------------------------
  // 4. Full upgrade sequence
  // ---------------------------------------------------------------------------

  describe('4. Full upgrade sequence', () => {
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

    it('end-to-end: version check -> health -> schema compat all consistent', async () => {
      // Step 1: VersionCheckService reports a newer version
      const mockService = createMockVersionService('99.0.0');

      // Step 2: Health endpoint reflects the update
      const app = createHealthRoute({ versionCheckService: mockService as any });
      const res = await app.request('/');
      const body = await json(res);
      expect(body.updateAvailable).toBe(true);
      expect(body.latestVersion).toBe('99.0.0');

      // Step 3: Schema compatibility check passes (current schema is up to date)
      const compat = checkSchemaCompatibility(sqlite);
      expect(compat).toEqual({ action: 'ok' });

      // Step 4: Health's schemaVersion and actual DB version are consistent
      expect(body.schemaVersion).toBe(LATEST_SCHEMA_VERSION);
    });

    it('BackupService backup/restore round-trip preserves files', () => {
      const dataDir = createTempDataDir({ withDb: true, withConfig: true });
      const service = new BackupService(dataDir);

      // Create backup
      const backupDir = service.createBackup('1.7.0');
      expect(existsSync(join(backupDir, 'waiaas.db'))).toBe(true);
      expect(existsSync(join(backupDir, 'config.toml'))).toBe(true);

      // Verify backup content matches original
      const backupDb = readFileSync(join(backupDir, 'waiaas.db'), 'utf-8');
      expect(backupDb).toBe('fake-db-content');

      // Corrupt original
      writeFileSync(join(dataDir, 'data', 'waiaas.db'), 'corrupted-data');

      // Restore
      service.restore(backupDir);

      // Verify restored content
      const restoredDb = readFileSync(join(dataDir, 'data', 'waiaas.db'), 'utf-8');
      expect(restoredDb).toBe('fake-db-content');
    });

    it('BackupService.listBackups returns backups sorted newest-first', () => {
      const dataDir = createTempDataDir({ withDb: true });
      const service = new BackupService(dataDir);

      // Create multiple backups with different version labels
      const dir1 = service.createBackup('1.5.0');
      const dir2 = service.createBackup('1.6.0');
      const dir3 = service.createBackup('1.7.0');

      const backups = service.listBackups();
      expect(backups.length).toBe(3);
      // Newest first (lexicographic descending on timestamp-based names)
      expect(backups[0]).toBe(dir3);
    });

    it('upgrade --check equivalent: health info reflects version check state', async () => {
      // Simulate what `waiaas upgrade --check` does:
      // 1. Fetch /health from daemon
      // 2. Check updateAvailable + latestVersion

      // Case A: update available
      const mockServiceA = createMockVersionService('99.0.0');
      const appA = createHealthRoute({ versionCheckService: mockServiceA as any });
      const resA = await appA.request('/');
      const bodyA = await json(resA);

      expect(bodyA.updateAvailable).toBe(true);
      expect(bodyA.latestVersion).toBe('99.0.0');
      expect(bodyA.version).toBeTruthy();

      // Case B: no update
      const mockServiceB = createMockVersionService('0.0.1');
      const appB = createHealthRoute({ versionCheckService: mockServiceB as any });
      const resB = await appB.request('/');
      const bodyB = await json(resB);

      expect(bodyB.updateAvailable).toBe(false);
    });

    it('schema compatibility check after migration scenario is consistent', () => {
      // Simulate: DB is one version behind -> migrate -> ok
      sqlite
        .prepare('DELETE FROM schema_version WHERE version > ?')
        .run(LATEST_SCHEMA_VERSION - 1);

      const beforeMigration = checkSchemaCompatibility(sqlite);
      expect(beforeMigration).toEqual({ action: 'migrate' });

      // Simulate migration: re-insert the latest version
      sqlite
        .prepare('INSERT INTO schema_version (version, applied_at, description) VALUES (?, ?, ?)')
        .run(LATEST_SCHEMA_VERSION, Math.floor(Date.now() / 1000), 'Migration applied');

      const afterMigration = checkSchemaCompatibility(sqlite);
      expect(afterMigration).toEqual({ action: 'ok' });
    });

    it('BackupService retention policy prunes old backups', () => {
      const dataDir = createTempDataDir({ withDb: true });
      const service = new BackupService(dataDir);

      // Create 7 backups (exceeds default retention of 5)
      for (let i = 0; i < 7; i++) {
        service.createBackup(`1.${i}.0`);
      }

      const backups = service.listBackups();
      // Retention policy (keep=5) is applied during createBackup
      expect(backups.length).toBeLessThanOrEqual(5);
    });
  });
});
