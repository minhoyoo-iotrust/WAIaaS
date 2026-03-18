/**
 * Tests for `waiaas backup` CLI commands.
 *
 * - backup create: calls POST /v1/admin/backup on daemon (mocked fetch)
 * - backup list: reads .waiaas-backup files from local directory (real files)
 * - backup inspect: reads plaintext metadata from a backup file (real files)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { writeArchive } from '@waiaas/daemon';
import type { BackupMetadata } from '@waiaas/daemon';
import { backupCommand, backupListCommand, backupInspectCommand } from '../commands/backup.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTempDir(): string {
  return mkdtempSync(join(tmpdir(), 'waiaas-backup-cli-test-'));
}

function createTestBackupFile(dir: string, filename: string, metadata?: Partial<BackupMetadata>): string {
  const meta: BackupMetadata = {
    created_at: '2026-03-03T12:00:00Z',
    daemon_version: '2.9.0',
    schema_version: 33,
    kdf: 'argon2id',
    kdf_params: { memory_cost: 65536, time_cost: 3, parallelism: 4, hash_length: 32 },
    contents: {
      database: { name: 'waiaas.db', size: 4096 },
      keystore_files: [],
    },
    checksum: 'sha256:0000000000000000000000000000000000000000000000000000000000000000',
    ...metadata,
  };

  const salt = Buffer.alloc(16, 0xaa);
  const nonce = Buffer.alloc(12, 0xbb);
  const authTag = Buffer.alloc(16, 0xcc);
  const encryptedPayload = Buffer.from('test-payload');

  const archive = writeArchive({ metadata: meta, salt, nonce, authTag, encryptedPayload });
  const filePath = join(dir, filename);
  writeFileSync(filePath, archive);
  return filePath;
}

// ---------------------------------------------------------------------------
// Test Suite
// ---------------------------------------------------------------------------

describe('backup CLI commands', () => {
  let logSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;
  let _exitSpy: ReturnType<typeof vi.spyOn>;
  let originalFetch: typeof globalThis.fetch;
  let tempDir: string;

  beforeEach(() => {
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    _exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('process.exit called');
    }) as never);
    originalFetch = globalThis.fetch;
    tempDir = makeTempDir();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    globalThis.fetch = originalFetch;
    rmSync(tempDir, { recursive: true, force: true });
  });

  // ── backup create ──

  describe('backupCommand (create)', () => {
    it('sends POST /v1/admin/backup and displays result', async () => {
      const mockInfo = {
        path: '/data/backups/backup-20260303-120000000.waiaas-backup',
        filename: 'backup-20260303-120000000.waiaas-backup',
        size: 12345,
        created_at: '2026-03-03T12:00:00Z',
        daemon_version: '2.9.0',
        schema_version: 33,
        file_count: 3,
      };

      globalThis.fetch = vi.fn()
        .mockResolvedValueOnce({ ok: true }) // health check
        .mockResolvedValueOnce({ ok: true, status: 200, json: async () => mockInfo }); // backup

      await backupCommand({ baseUrl: 'http://127.0.0.1:3100', password: 'test-pass' });

      expect(globalThis.fetch).toHaveBeenCalledTimes(2);
      const backupCall = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[1];
      expect(backupCall![0]).toBe('http://127.0.0.1:3100/v1/admin/backup');
      expect(backupCall![1]!.method).toBe('POST');
      expect(backupCall![1]!.headers['X-Master-Password']).toBe('test-pass');

      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Backup created successfully'));
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining(mockInfo.filename));
    });

    it('exits with error when daemon is not running', async () => {
      globalThis.fetch = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));

      await expect(backupCommand({ password: 'test-pass' })).rejects.toThrow('process.exit called');
      expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('Cannot reach WAIaaS daemon'));
    });

    it('exits with error on non-401 failure response from backup API', async () => {
      globalThis.fetch = vi.fn()
        .mockResolvedValueOnce({ ok: true }) // health check
        .mockResolvedValueOnce({
          ok: false,
          status: 500,
          json: async () => ({ message: 'Internal server error' }),
        });

      await expect(backupCommand({ password: 'test-pass' })).rejects.toThrow('process.exit called');
      expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('Backup creation failed'));
      expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('Internal server error'));
    });

    it('exits with error when masterAuth fails (401)', async () => {
      globalThis.fetch = vi.fn()
        .mockResolvedValueOnce({ ok: true }) // health check
        .mockResolvedValueOnce({
          ok: false,
          status: 401,
          json: async () => ({ code: 'INVALID_MASTER_PASSWORD', message: 'Invalid password' }),
        });

      await expect(backupCommand({ password: 'wrong' })).rejects.toThrow('process.exit called');
      expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('Invalid master password'));
    });
  });

  // ── backup list ──

  describe('backupListCommand (list)', () => {
    it('reads .waiaas-backup files and displays table', async () => {
      const backupsDir = join(tempDir, 'backups');
      mkdirSync(backupsDir, { recursive: true });
      createTestBackupFile(backupsDir, 'backup-20260301-100000000.waiaas-backup', {
        created_at: '2026-03-01T10:00:00Z',
      });
      createTestBackupFile(backupsDir, 'backup-20260302-120000000.waiaas-backup', {
        created_at: '2026-03-02T12:00:00Z',
      });

      await backupListCommand({ dataDir: tempDir });

      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Available Backups'));
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Total: 2 backup(s)'));
    });

    it('shows "No backups found" when directory is empty', async () => {
      const backupsDir = join(tempDir, 'backups');
      mkdirSync(backupsDir, { recursive: true });

      await backupListCommand({ dataDir: tempDir });

      expect(logSpy).toHaveBeenCalledWith('No backups found.');
    });

    it('shows "No backups found" when directory does not exist', async () => {
      await backupListCommand({ dataDir: tempDir });

      expect(logSpy).toHaveBeenCalledWith('No backups found.');
    });
  });

  // ── backup inspect ──

  describe('backupInspectCommand (inspect)', () => {
    it('reads and displays metadata from a backup file', async () => {
      const filePath = createTestBackupFile(tempDir, 'test.waiaas-backup', {
        created_at: '2026-03-03T15:30:00Z',
        daemon_version: '2.9.0',
        schema_version: 33,
        contents: {
          database: { name: 'waiaas.db', size: 8192 },
          config: { name: 'config.toml', size: 256 },
          keystore_files: [{ name: 'wallet-1.json', size: 1024 }],
        },
      });

      await backupInspectCommand(filePath);

      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Backup Inspection'));
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('2026-03-03T15:30:00Z'));
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('2.9.0'));
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('argon2id'));
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('config.toml'));
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('wallet-1.json'));
    });

    it('exits with error for non-existent file', async () => {
      await expect(backupInspectCommand('/nonexistent/path.waiaas-backup'))
        .rejects.toThrow('process.exit called');
      expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('Backup file not found'));
    });

    it('displays "none" when backup has no keystore files', async () => {
      const filePath = createTestBackupFile(tempDir, 'no-keystore.waiaas-backup', {
        created_at: '2026-03-03T16:00:00Z',
        daemon_version: '2.9.0',
        schema_version: 33,
        contents: {
          database: { name: 'waiaas.db', size: 4096 },
          keystore_files: [],
        },
      });

      await backupInspectCommand(filePath);

      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Keystore files: none'));
    });

    it('displays MB for large backup sizes', async () => {
      const filePath = createTestBackupFile(tempDir, 'large.waiaas-backup', {
        created_at: '2026-03-03T17:00:00Z',
        contents: {
          database: { name: 'waiaas.db', size: 2 * 1024 * 1024 },
          keystore_files: [],
        },
      });

      await backupInspectCommand(filePath);

      // The database size display should include "MB"
      const allOutput = logSpy.mock.calls.map((c: unknown[]) => String(c[0])).join('\n');
      expect(allOutput).toContain('MB');
    });

    it('exits with UNSUPPORTED_BACKUP_VERSION for unsupported version', async () => {
      // Create a file with valid magic but wrong version
      const filePath = join(tempDir, 'bad-version.waiaas-backup');
      // WAIaaS backup magic: 0x57 0x41 0x49 0x42 (WAIB) + version byte
      const buf = Buffer.alloc(100, 0);
      buf[0] = 0x57; buf[1] = 0x41; buf[2] = 0x49; buf[3] = 0x42;
      buf[4] = 0xff; // invalid version
      writeFileSync(filePath, buf);

      await expect(backupInspectCommand(filePath))
        .rejects.toThrow('process.exit called');
      const allStderr = errorSpy.mock.calls.map((c: unknown[]) => String(c[0])).join('\n');
      // Should hit either INVALID_BACKUP_FORMAT or UNSUPPORTED_BACKUP_VERSION
      expect(allStderr).toMatch(/Not a valid WAIaaS backup|Unsupported backup/);
    });

    it('exits with error for file with invalid magic bytes', async () => {
      const filePath = join(tempDir, 'bad.waiaas-backup');
      writeFileSync(filePath, Buffer.alloc(100, 0xff));

      await expect(backupInspectCommand(filePath))
        .rejects.toThrow('process.exit called');
      expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('Not a valid WAIaaS backup file'));
    });
  });
});
