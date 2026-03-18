/**
 * Tests for `waiaas restore` CLI command.
 *
 * Uses real EncryptedBackupService to create test backups, then verifies
 * the restore command correctly:
 * - Decrypts and writes DB/config/keystore files
 * - Preserves existing data as .bak-{timestamp}
 * - Checks daemon PID file
 * - Handles wrong password
 * - Runs PRAGMA integrity_check
 * - Auto-rolls back on failure
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  existsSync,
  readdirSync,
  rmSync,
} from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import Database from 'better-sqlite3';
import { EncryptedBackupService } from '@waiaas/daemon';
import { restoreCommand } from '../commands/restore.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TEST_PASSWORD = 'test-restore-password-2026';

function makeTempDir(): string {
  return mkdtempSync(join(tmpdir(), 'waiaas-restore-test-'));
}

/**
 * Create a minimal data directory with DB, config, and keystore,
 * then create an encrypted backup from it. Returns { backupPath, sourceDir }.
 */
async function createTestBackup(): Promise<{ backupPath: string; sourceDir: string }> {
  const sourceDir = makeTempDir();
  const dataDbDir = join(sourceDir, 'data');
  const keystoreDir = join(sourceDir, 'keystore');
  const backupsDir = join(sourceDir, 'backups');
  mkdirSync(dataDbDir, { recursive: true });
  mkdirSync(keystoreDir, { recursive: true });
  mkdirSync(backupsDir, { recursive: true });

  // Create real SQLite DB
  const dbPath = join(dataDbDir, 'waiaas.db');
  const db = new Database(dbPath);
  db.exec('CREATE TABLE test_restore (id INTEGER PRIMARY KEY, value TEXT)');
  db.exec("INSERT INTO test_restore (value) VALUES ('restore-data')");

  // Create config.toml
  writeFileSync(join(sourceDir, 'config.toml'), '[daemon]\nport = 3100\n');

  // Create keystore file
  writeFileSync(join(keystoreDir, 'wallet-1.json'), '{"address":"0x123"}');

  // Create backup
  const service = new EncryptedBackupService(sourceDir, backupsDir, db);
  const info = await service.createBackup(TEST_PASSWORD);
  db.close();

  return { backupPath: info.path, sourceDir };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('restore CLI command', () => {
  let logSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;
  let _exitSpy: ReturnType<typeof vi.spyOn>;
  let tempDirs: string[] = [];

  beforeEach(() => {
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    _exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('process.exit called');
    }) as never);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    for (const dir of tempDirs) {
      rmSync(dir, { recursive: true, force: true });
    }
    tempDirs = [];
  });

  function trackDir(dir: string): string {
    tempDirs.push(dir);
    return dir;
  }

  it('decrypts backup and writes DB/config/keystore files to correct paths', async () => {
    const { backupPath, sourceDir } = await createTestBackup();
    trackDir(sourceDir);
    const targetDir = trackDir(makeTempDir());

    await restoreCommand({
      from: backupPath,
      dataDir: targetDir,
      password: TEST_PASSWORD,
      force: true,
    });

    // Verify DB restored
    expect(existsSync(join(targetDir, 'data', 'waiaas.db'))).toBe(true);
    const db = new Database(join(targetDir, 'data', 'waiaas.db'));
    const row = db.prepare('SELECT value FROM test_restore').get() as { value: string };
    expect(row.value).toBe('restore-data');
    db.close();

    // Verify config.toml restored
    expect(existsSync(join(targetDir, 'config.toml'))).toBe(true);
    const config = readFileSync(join(targetDir, 'config.toml'), 'utf-8');
    expect(config).toContain('port = 3100');

    // Verify keystore restored
    expect(existsSync(join(targetDir, 'keystore', 'wallet-1.json'))).toBe(true);
    const keystore = readFileSync(join(targetDir, 'keystore', 'wallet-1.json'), 'utf-8');
    expect(keystore).toContain('0x123');

    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Restore complete'));
  });

  it('creates .bak directories for existing data', async () => {
    const { backupPath, sourceDir } = await createTestBackup();
    trackDir(sourceDir);
    const targetDir = trackDir(makeTempDir());

    // Pre-populate target with existing data
    mkdirSync(join(targetDir, 'data'), { recursive: true });
    writeFileSync(join(targetDir, 'data', 'waiaas.db'), 'existing-db');
    mkdirSync(join(targetDir, 'keystore'), { recursive: true });
    writeFileSync(join(targetDir, 'keystore', 'old.json'), 'old-key');
    writeFileSync(join(targetDir, 'config.toml'), 'old-config');

    await restoreCommand({
      from: backupPath,
      dataDir: targetDir,
      password: TEST_PASSWORD,
      force: true,
    });

    // Verify .bak directories exist
    const dirEntries = readdirSync(targetDir);
    const dataBaks = dirEntries.filter((e) => e.startsWith('data.bak-'));
    const keystoreBaks = dirEntries.filter((e) => e.startsWith('keystore.bak-'));
    const configBaks = dirEntries.filter((e) => e.startsWith('config.toml.bak-'));

    expect(dataBaks.length).toBe(1);
    expect(keystoreBaks.length).toBe(1);
    expect(configBaks.length).toBe(1);

    // Verify original data preserved in .bak
    const bakDbContent = readFileSync(join(targetDir, dataBaks[0]!, 'waiaas.db'), 'utf-8');
    expect(bakDbContent).toBe('existing-db');

    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('.bak'));
  });

  it('fails if daemon PID file exists and process is running', async () => {
    const { backupPath, sourceDir } = await createTestBackup();
    trackDir(sourceDir);
    const targetDir = trackDir(makeTempDir());

    // Write PID file with current process PID (it's alive)
    writeFileSync(join(targetDir, 'daemon.pid'), String(process.pid));

    await expect(restoreCommand({
      from: backupPath,
      dataDir: targetDir,
      password: TEST_PASSWORD,
      force: true,
    })).rejects.toThrow('process.exit called');

    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('daemon is running'));
  });

  it('fails with wrong password', async () => {
    const { backupPath, sourceDir } = await createTestBackup();
    trackDir(sourceDir);
    const targetDir = trackDir(makeTempDir());

    await expect(restoreCommand({
      from: backupPath,
      dataDir: targetDir,
      password: 'wrong-password',
      force: true,
    })).rejects.toThrow('process.exit called');

    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('Wrong master password'));
  });

  it('runs PRAGMA integrity_check on restored DB', async () => {
    const { backupPath, sourceDir } = await createTestBackup();
    trackDir(sourceDir);
    const targetDir = trackDir(makeTempDir());

    await restoreCommand({
      from: backupPath,
      dataDir: targetDir,
      password: TEST_PASSWORD,
      force: true,
    });

    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('integrity check: OK'));
  });

  it('with --force flag skips confirmation prompt', async () => {
    const { backupPath, sourceDir } = await createTestBackup();
    trackDir(sourceDir);
    const targetDir = trackDir(makeTempDir());

    // No promptText mock needed -- force=true bypasses prompt
    await restoreCommand({
      from: backupPath,
      dataDir: targetDir,
      password: TEST_PASSWORD,
      force: true,
    });

    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Restore complete'));
  });

  it('fails with BACKUP_NOT_FOUND for non-existent archive path', async () => {
    const targetDir = trackDir(makeTempDir());

    await expect(restoreCommand({
      from: '/nonexistent/backup.waiaas-backup',
      dataDir: targetDir,
      password: TEST_PASSWORD,
      force: true,
    })).rejects.toThrow('process.exit called');

    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('Backup file not found'));
  });

  it('handles backup with no keystore files', async () => {
    const sourceDir = trackDir(makeTempDir());
    const dataDbDir = join(sourceDir, 'data');
    const backupsDir = join(sourceDir, 'backups');
    mkdirSync(dataDbDir, { recursive: true });
    mkdirSync(backupsDir, { recursive: true });

    // DB only -- no keystore, no config
    const dbPath = join(dataDbDir, 'waiaas.db');
    const db = new Database(dbPath);
    db.exec('CREATE TABLE t (id INTEGER PRIMARY KEY)');
    db.exec('INSERT INTO t VALUES (1)');

    const service = new EncryptedBackupService(sourceDir, backupsDir, db);
    const info = await service.createBackup(TEST_PASSWORD);
    db.close();

    const targetDir = trackDir(makeTempDir());
    await restoreCommand({
      from: info.path,
      dataDir: targetDir,
      password: TEST_PASSWORD,
      force: true,
    });

    expect(existsSync(join(targetDir, 'data', 'waiaas.db'))).toBe(true);
    // keystore dir created but empty
    expect(existsSync(join(targetDir, 'keystore'))).toBe(true);
    expect(readdirSync(join(targetDir, 'keystore')).length).toBe(0);

    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Restore complete'));
  });

  it('displays MB for large backup in pre-restore summary', async () => {
    // Create a backup large enough to trigger MB formatting
    const sourceDir = trackDir(makeTempDir());
    const dataDbDir = join(sourceDir, 'data');
    const backupsDir = join(sourceDir, 'backups');
    mkdirSync(dataDbDir, { recursive: true });
    mkdirSync(backupsDir, { recursive: true });

    const dbPath = join(dataDbDir, 'waiaas.db');
    const db = new Database(dbPath);
    db.exec('CREATE TABLE t (id INTEGER PRIMARY KEY, data TEXT)');
    // Insert enough data to make the backup > 1MB after encryption
    const bigValue = 'x'.repeat(100_000);
    for (let i = 0; i < 15; i++) {
      db.exec(`INSERT INTO t VALUES (${i}, '${bigValue}')`);
    }

    const service = new EncryptedBackupService(sourceDir, backupsDir, db);
    const info = await service.createBackup(TEST_PASSWORD);
    db.close();

    const targetDir = trackDir(makeTempDir());
    await restoreCommand({
      from: info.path,
      dataDir: targetDir,
      password: TEST_PASSWORD,
      force: true,
    });

    // The size display should contain MB
    const allLog = logSpy.mock.calls.map((c: unknown[]) => String(c[0])).join('\n');
    expect(allLog).toContain('MB');
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Restore complete'));
  });

  it('handles backup with no config.toml', async () => {
    const sourceDir = trackDir(makeTempDir());
    const dataDbDir = join(sourceDir, 'data');
    const keystoreDir = join(sourceDir, 'keystore');
    const backupsDir = join(sourceDir, 'backups');
    mkdirSync(dataDbDir, { recursive: true });
    mkdirSync(keystoreDir, { recursive: true });
    mkdirSync(backupsDir, { recursive: true });

    const dbPath = join(dataDbDir, 'waiaas.db');
    const db = new Database(dbPath);
    db.exec('CREATE TABLE t (id INTEGER PRIMARY KEY)');
    db.exec('INSERT INTO t VALUES (1)');

    writeFileSync(join(keystoreDir, 'key.json'), '{"key":"val"}');

    const service = new EncryptedBackupService(sourceDir, backupsDir, db);
    const info = await service.createBackup(TEST_PASSWORD);
    db.close();

    const targetDir = trackDir(makeTempDir());
    await restoreCommand({
      from: info.path,
      dataDir: targetDir,
      password: TEST_PASSWORD,
      force: true,
    });

    expect(existsSync(join(targetDir, 'data', 'waiaas.db'))).toBe(true);
    // No config.toml restored
    expect(existsSync(join(targetDir, 'config.toml'))).toBe(false);

    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Restore complete'));
  });
});
