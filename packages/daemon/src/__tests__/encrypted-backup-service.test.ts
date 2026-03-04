/**
 * Tests for EncryptedBackupService: encrypted backup creation, listing,
 * inspection, pruning, and round-trip decryption.
 *
 * Uses real temp directories and a real better-sqlite3 database for VACUUM INTO testing.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, mkdirSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { rmSync } from 'node:fs';
import Database from 'better-sqlite3';
import { EncryptedBackupService } from '../infrastructure/backup/encrypted-backup-service.js';
import { readArchiveHeader, readArchiveMetadata, BACKUP_MAGIC, BACKUP_HEADER_SIZE } from '../infrastructure/backup/backup-format.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TEST_PASSWORD = 'test-backup-password-2026';
let tempDir: string;
let dataDir: string;
let backupsDir: string;
let dbPath: string;
let db: InstanceType<typeof Database>;

function setupTestEnv(): void {
  tempDir = mkdtempSync(join(tmpdir(), 'waiaas-backup-test-'));
  dataDir = tempDir;
  backupsDir = join(dataDir, 'backups');
  mkdirSync(backupsDir, { recursive: true });

  // Create a real SQLite DB with a table and data
  const dataDbDir = join(dataDir, 'data');
  mkdirSync(dataDbDir, { recursive: true });
  dbPath = join(dataDbDir, 'waiaas.db');
  db = new Database(dbPath);
  db.exec('CREATE TABLE test_data (id INTEGER PRIMARY KEY, value TEXT)');
  db.exec("INSERT INTO test_data (value) VALUES ('hello'), ('world')");
}

function teardownTestEnv(): void {
  try { db.close(); } catch { /* already closed */ }
  rmSync(tempDir, { recursive: true, force: true });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('EncryptedBackupService', () => {
  beforeEach(() => {
    setupTestEnv();
  });

  afterEach(() => {
    teardownTestEnv();
  });

  // Test 11
  it('createBackup creates a .waiaas-backup file in backupsDir', async () => {
    const service = new EncryptedBackupService(dataDir, backupsDir, db);
    const info = await service.createBackup(TEST_PASSWORD);

    expect(info.filename).toMatch(/^backup-\d{8}-\d{9}\.waiaas-backup$/);
    expect(existsSync(info.path)).toBe(true);
    expect(info.size).toBeGreaterThan(0);
  });

  // Test 12
  it('createBackup archive passes round-trip decrypt -> entries contain waiaas.db', async () => {
    const service = new EncryptedBackupService(dataDir, backupsDir, db);
    const info = await service.createBackup(TEST_PASSWORD);

    const entries = await service.decryptBackup(info.path, TEST_PASSWORD);
    const dbEntry = entries.find((e) => e.name === 'waiaas.db');
    expect(dbEntry).toBeDefined();
    expect(dbEntry!.data.length).toBeGreaterThan(0);

    // Verify the decrypted DB is valid SQLite (starts with 'SQLite format 3')
    expect(dbEntry!.data.subarray(0, 16).toString('utf-8')).toContain('SQLite format 3');
  });

  // Test 13
  it('createBackup includes config.toml in entries when present', async () => {
    const configContent = '[daemon]\nport = 3100\nhostname = "127.0.0.1"';
    writeFileSync(join(dataDir, 'config.toml'), configContent, 'utf-8');

    const service = new EncryptedBackupService(dataDir, backupsDir, db);
    const info = await service.createBackup(TEST_PASSWORD);
    const entries = await service.decryptBackup(info.path, TEST_PASSWORD);

    const configEntry = entries.find((e) => e.name === 'config.toml');
    expect(configEntry).toBeDefined();
    expect(configEntry!.data.toString('utf-8')).toBe(configContent);
  });

  // Test 14
  it('createBackup includes keystore/*.json files in entries', async () => {
    const keystoreDir = join(dataDir, 'keystore');
    mkdirSync(keystoreDir, { recursive: true });
    writeFileSync(join(keystoreDir, 'wallet-abc.json'), '{"encrypted": true}');
    writeFileSync(join(keystoreDir, 'wallet-def.json'), '{"encrypted": false}');

    const service = new EncryptedBackupService(dataDir, backupsDir, db);
    const info = await service.createBackup(TEST_PASSWORD);
    const entries = await service.decryptBackup(info.path, TEST_PASSWORD);

    const keystoreEntries = entries.filter((e) => e.name.startsWith('keystore/'));
    expect(keystoreEntries.length).toBe(2);
    expect(keystoreEntries.map((e) => e.name).sort()).toEqual([
      'keystore/wallet-abc.json',
      'keystore/wallet-def.json',
    ]);
  });

  // Test 15
  it('createBackup with empty keystore (0 files) succeeds', async () => {
    const keystoreDir = join(dataDir, 'keystore');
    mkdirSync(keystoreDir, { recursive: true });
    // No files in keystore

    const service = new EncryptedBackupService(dataDir, backupsDir, db);
    const info = await service.createBackup(TEST_PASSWORD);
    expect(info.file_count).toBe(1); // only DB
    expect(existsSync(info.path)).toBe(true);
  });

  // Test 16
  it('listBackups returns BackupInfo[] sorted newest-first with metadata', async () => {
    const service = new EncryptedBackupService(dataDir, backupsDir, db);

    // Create two backups with a small delay to ensure different ms-level filename timestamps
    const info1 = await service.createBackup(TEST_PASSWORD);
    await new Promise((r) => setTimeout(r, 20));
    const info2 = await service.createBackup(TEST_PASSWORD);

    const list = service.listBackups();
    expect(list.length).toBe(2);
    // Newest first
    expect(list[0]!.filename).toBe(info2.filename);
    expect(list[1]!.filename).toBe(info1.filename);
    // Has required fields
    expect(list[0]!.daemon_version).toBeTruthy();
    expect(list[0]!.schema_version).toBeGreaterThanOrEqual(0);
  });

  // Test 17
  it('inspectBackup returns BackupMetadata from plaintext header without password', async () => {
    const service = new EncryptedBackupService(dataDir, backupsDir, db);
    const info = await service.createBackup(TEST_PASSWORD);

    const metadata = service.inspectBackup(info.path);
    expect(metadata.created_at).toBeTruthy();
    expect(metadata.daemon_version).toBeTruthy();
    expect(metadata.kdf).toBe('argon2id');
    expect(metadata.kdf_params.memory_cost).toBe(65536);
    expect(metadata.contents.database.name).toBe('waiaas.db');
    expect(metadata.checksum).toMatch(/^sha256:/);
  });

  // Test 18
  it('pruneBackups removes oldest backups exceeding retention count', async () => {
    const service = new EncryptedBackupService(dataDir, backupsDir, db);

    // Create 4 backups
    for (let i = 0; i < 4; i++) {
      await service.createBackup(TEST_PASSWORD);
      await new Promise((r) => setTimeout(r, 20));
    }

    expect(service.listBackups().length).toBe(4);
    const pruned = service.pruneBackups(2);
    expect(pruned).toBe(2);
    expect(service.listBackups().length).toBe(2);
  });

  // Test 19
  it('createBackup uses VACUUM INTO for DB snapshot', async () => {
    const service = new EncryptedBackupService(dataDir, backupsDir, db);
    const info = await service.createBackup(TEST_PASSWORD);

    // Verify the backup contains a valid DB with our test data
    const entries = await service.decryptBackup(info.path, TEST_PASSWORD);
    const dbEntry = entries.find((e) => e.name === 'waiaas.db');
    expect(dbEntry).toBeDefined();

    // Open the decrypted DB and verify data
    const snapPath = join(tempDir, 'verify-snap.db');
    writeFileSync(snapPath, dbEntry!.data);
    const snapDb = new Database(snapPath);
    const rows = snapDb.prepare('SELECT value FROM test_data ORDER BY id').all() as Array<{ value: string }>;
    expect(rows.length).toBe(2);
    expect(rows[0]!.value).toBe('hello');
    expect(rows[1]!.value).toBe('world');
    snapDb.close();
  });

  // Test 20
  it('wrong password on decrypt produces INVALID_MASTER_PASSWORD error', async () => {
    const service = new EncryptedBackupService(dataDir, backupsDir, db);
    const info = await service.createBackup(TEST_PASSWORD);

    try {
      await service.decryptBackup(info.path, 'wrong-password');
      expect.unreachable('Should have thrown');
    } catch (err: unknown) {
      expect((err as { code: string }).code).toBe('INVALID_MASTER_PASSWORD');
    }
  });

  // Test 21
  it('corrupted archive (modified authTag bytes) produces INVALID_MASTER_PASSWORD error', async () => {
    const service = new EncryptedBackupService(dataDir, backupsDir, db);
    const info = await service.createBackup(TEST_PASSWORD);

    // Read the archive and corrupt the auth tag (offset 44, 16 bytes)
    const archive = readFileSync(info.path);
    archive[44] = archive[44]! ^ 0xff; // flip bits
    archive[45] = archive[45]! ^ 0xff;
    writeFileSync(info.path, archive);

    try {
      await service.decryptBackup(info.path, TEST_PASSWORD);
      expect.unreachable('Should have thrown');
    } catch (err: unknown) {
      // GCM auth tag mismatch -> INVALID_MASTER_PASSWORD (same error for both)
      expect((err as { code: string }).code).toBe('INVALID_MASTER_PASSWORD');
    }
  });

  // Test 22
  it('createBackup metadata includes checksum (sha256 of encrypted payload)', async () => {
    const service = new EncryptedBackupService(dataDir, backupsDir, db);
    const info = await service.createBackup(TEST_PASSWORD);

    const metadata = readArchiveMetadata(readFileSync(info.path));
    expect(metadata.checksum).toMatch(/^sha256:[a-f0-9]{64}$/);
  });

  // Additional: BACKUP_NOT_FOUND for inspectBackup
  it('inspectBackup throws BACKUP_NOT_FOUND for non-existent file', () => {
    const service = new EncryptedBackupService(dataDir, backupsDir, db);
    try {
      service.inspectBackup('/nonexistent/backup.waiaas-backup');
      expect.unreachable('Should have thrown');
    } catch (err: unknown) {
      expect((err as { code: string }).code).toBe('BACKUP_NOT_FOUND');
    }
  });

  // Additional: header structure validation
  it('archive starts with 60-byte fixed header', async () => {
    const service = new EncryptedBackupService(dataDir, backupsDir, db);
    const info = await service.createBackup(TEST_PASSWORD);
    const archive = readFileSync(info.path);
    expect(archive.length).toBeGreaterThan(BACKUP_HEADER_SIZE);

    const header = readArchiveHeader(archive);
    expect(header.magic).toEqual(BACKUP_MAGIC);
    expect(header.version).toBe(1);
    expect(header.salt.length).toBe(16);
    expect(header.nonce.length).toBe(12);
    expect(header.authTag.length).toBe(16);
  });
});
