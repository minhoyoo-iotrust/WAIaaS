/**
 * Tests for POST /v1/admin/backup and GET /v1/admin/backups endpoints.
 *
 * Uses real better-sqlite3 DB + real EncryptedBackupService + Hono app.request().
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { rmSync } from 'node:fs';
import Database from 'better-sqlite3';
import argon2 from 'argon2';
import { createApp } from '../api/server.js';
import { createDatabase, pushSchema } from '../infrastructure/database/index.js';
import { EncryptedBackupService } from '../infrastructure/backup/encrypted-backup-service.js';
import type { DaemonConfig } from '../infrastructure/config/loader.js';
import type { DatabaseConnection } from '../infrastructure/database/index.js';
import type { OpenAPIHono } from '@hono/zod-openapi';
import type { MasterPasswordRef } from '../api/middleware/master-auth.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TEST_MASTER_PASSWORD = 'test-master-password-2026';
const HOST = '127.0.0.1:3100';

let tempDir: string;
let dataDir: string;
let backupsDir: string;
let rawDb: InstanceType<typeof Database>;
let conn: DatabaseConnection;
let app: OpenAPIHono;
let passwordHash: string;

async function json(res: Response): Promise<Record<string, unknown>> {
  return (await res.json()) as Record<string, unknown>;
}

async function setupTest(): Promise<void> {
  tempDir = mkdtempSync(join(tmpdir(), 'waiaas-api-backup-test-'));
  dataDir = tempDir;
  backupsDir = join(dataDir, 'backups');
  mkdirSync(backupsDir, { recursive: true });

  // Create real SQLite DB (for VACUUM INTO in EncryptedBackupService)
  const dataDbDir = join(dataDir, 'data');
  mkdirSync(dataDbDir, { recursive: true });
  const dbPath = join(dataDbDir, 'waiaas.db');
  rawDb = new Database(dbPath);
  rawDb.exec('CREATE TABLE test_backup (id INTEGER PRIMARY KEY, value TEXT)');
  rawDb.exec("INSERT INTO test_backup (value) VALUES ('backup-test')");

  // Create Drizzle DB (in-memory for admin routes that use Drizzle ORM)
  conn = createDatabase(':memory:');
  pushSchema(conn.sqlite);

  passwordHash = await argon2.hash(TEST_MASTER_PASSWORD, {
    type: argon2.argon2id,
    memoryCost: 4096,
    timeCost: 1,
    parallelism: 1,
  });

  const passwordRef: MasterPasswordRef = {
    password: TEST_MASTER_PASSWORD,
    hash: passwordHash,
  };

  const encryptedBackupService = new EncryptedBackupService(dataDir, backupsDir, rawDb);

  app = createApp({
    db: conn.db,
    sqlite: conn.sqlite,
    passwordRef,
    masterPasswordHash: passwordHash,
    encryptedBackupService,
    config: {
      daemon: {
        port: 3100, hostname: '127.0.0.1', log_level: 'info', log_file: 'logs/daemon.log',
        log_max_size: '50MB', log_max_files: 5, pid_file: 'daemon.pid', shutdown_timeout: 30, dev_mode: false,
        admin_ui: true, admin_timeout: 900, update_check: false, update_check_interval: 86400,
      },
      backup: { dir: 'backups', interval: 0, retention_count: 7 },
    } as DaemonConfig,
    getKillSwitchState: () => 'ACTIVE',
  });
}

function teardownTest(): void {
  try { rawDb.close(); } catch { /* already closed */ }
  rmSync(tempDir, { recursive: true, force: true });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Admin Backup API', () => {
  beforeEach(async () => {
    await setupTest();
  });

  afterEach(() => {
    teardownTest();
  });

  // Test 1: POST /v1/admin/backup with valid masterAuth returns 200
  it('POST /v1/admin/backup with valid masterAuth returns 200 with backup info', async () => {
    const res = await app.request(`http://${HOST}/v1/admin/backup`, {
      method: 'POST',
      headers: { 'X-Master-Password': TEST_MASTER_PASSWORD, 'Host': HOST },
    });
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.path).toBeTruthy();
    expect(body.filename).toBeTruthy();
    expect(typeof body.size).toBe('number');
    expect(body.created_at).toBeTruthy();
    expect(body.daemon_version).toBeTruthy();
    expect(typeof body.schema_version).toBe('number');
    expect(typeof body.file_count).toBe('number');
  });

  // Test 2: POST /v1/admin/backup without masterAuth returns 401
  it('POST /v1/admin/backup without masterAuth returns 401', async () => {
    const res = await app.request(`http://${HOST}/v1/admin/backup`, {
      method: 'POST',
      headers: { 'Host': HOST },
    });
    expect(res.status).toBe(401);
  });

  // Test 3: GET /v1/admin/backups with valid masterAuth returns 200
  it('GET /v1/admin/backups with valid masterAuth returns 200 with backup list', async () => {
    const res = await app.request(`http://${HOST}/v1/admin/backups`, {
      method: 'GET',
      headers: { 'X-Master-Password': TEST_MASTER_PASSWORD, 'Host': HOST },
    });
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(Array.isArray(body.backups)).toBe(true);
    expect(typeof body.total).toBe('number');
    expect(typeof body.retention_count).toBe('number');
  });

  // Test 4: GET /v1/admin/backups returns empty array when no backups exist
  it('GET /v1/admin/backups returns empty array when no backups exist', async () => {
    const res = await app.request(`http://${HOST}/v1/admin/backups`, {
      method: 'GET',
      headers: { 'X-Master-Password': TEST_MASTER_PASSWORD, 'Host': HOST },
    });
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.backups).toEqual([]);
    expect(body.total).toBe(0);
  });

  // Test 5: POST /v1/admin/backup creates actual .waiaas-backup file
  it('POST /v1/admin/backup creates actual .waiaas-backup file in backups directory', async () => {
    const res = await app.request(`http://${HOST}/v1/admin/backup`, {
      method: 'POST',
      headers: { 'X-Master-Password': TEST_MASTER_PASSWORD, 'Host': HOST },
    });
    expect(res.status).toBe(200);
    const body = await json(res);

    const files = readdirSync(backupsDir).filter((f) => f.endsWith('.waiaas-backup'));
    expect(files.length).toBe(1);
    expect(existsSync(body.path as string)).toBe(true);
  });

  // Test 6: After POST backup, GET /v1/admin/backups includes the new backup
  it('after POST backup, GET /v1/admin/backups includes the newly created backup', async () => {
    // Create a backup
    const createRes = await app.request(`http://${HOST}/v1/admin/backup`, {
      method: 'POST',
      headers: { 'X-Master-Password': TEST_MASTER_PASSWORD, 'Host': HOST },
    });
    expect(createRes.status).toBe(200);
    const createBody = await json(createRes);

    // List backups
    const listRes = await app.request(`http://${HOST}/v1/admin/backups`, {
      method: 'GET',
      headers: { 'X-Master-Password': TEST_MASTER_PASSWORD, 'Host': HOST },
    });
    expect(listRes.status).toBe(200);
    const listBody = await json(listRes);

    expect(listBody.total).toBe(1);
    const backups = listBody.backups as Array<{ filename: string }>;
    expect(backups[0]!.filename).toBe(createBody.filename);
  });
});
