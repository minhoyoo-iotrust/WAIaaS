import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { BackupService } from '../infrastructure/backup/backup-service.js';

describe('BackupService', () => {
  let tmpDir: string;
  let service: BackupService;

  const DB_CONTENT = 'SQLite format 3 dummy-db-data';
  const CONFIG_CONTENT = '[daemon]\nport = 3100\n';

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'backup-test-'));
    // Create data directory with dummy DB
    mkdirSync(join(tmpDir, 'data'), { recursive: true });
    writeFileSync(join(tmpDir, 'data', 'waiaas.db'), DB_CONTENT);
    // Create config.toml
    writeFileSync(join(tmpDir, 'config.toml'), CONFIG_CONTENT);
    service = new BackupService(tmpDir);
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('createBackup', () => {
    it('DB + config.toml이 백업 디렉토리에 복사된다', () => {
      const backupDir = service.createBackup('1.7.0');

      expect(existsSync(join(backupDir, 'waiaas.db'))).toBe(true);
      expect(existsSync(join(backupDir, 'config.toml'))).toBe(true);
      expect(readFileSync(join(backupDir, 'waiaas.db'), 'utf-8')).toBe(DB_CONTENT);
      expect(readFileSync(join(backupDir, 'config.toml'), 'utf-8')).toBe(CONFIG_CONTENT);
    });

    it('백업 디렉토리 이름이 pre-upgrade-{version}-{timestamp} 형식이다', () => {
      const backupDir = service.createBackup('1.7.0');
      const dirName = backupDir.split('/').pop()!;

      // Pattern: pre-upgrade-1.7.0-YYYYMMDDHHmmss
      expect(dirName).toMatch(/^pre-upgrade-1\.7\.0-\d{14}$/);
    });

    it('WAL/SHM 파일이 있으면 함께 복사된다', () => {
      writeFileSync(join(tmpDir, 'data', 'waiaas.db-wal'), 'wal-data');
      writeFileSync(join(tmpDir, 'data', 'waiaas.db-shm'), 'shm-data');

      const backupDir = service.createBackup('1.7.0');

      expect(existsSync(join(backupDir, 'waiaas.db-wal'))).toBe(true);
      expect(existsSync(join(backupDir, 'waiaas.db-shm'))).toBe(true);
      expect(readFileSync(join(backupDir, 'waiaas.db-wal'), 'utf-8')).toBe('wal-data');
      expect(readFileSync(join(backupDir, 'waiaas.db-shm'), 'utf-8')).toBe('shm-data');
    });

    it('config.toml이 없어도 에러 없이 DB만 백업된다', () => {
      rmSync(join(tmpDir, 'config.toml'));

      const backupDir = service.createBackup('1.7.0');

      expect(existsSync(join(backupDir, 'waiaas.db'))).toBe(true);
      expect(existsSync(join(backupDir, 'config.toml'))).toBe(false);
    });

    it('DB 파일이 없으면 에러를 throw한다', () => {
      rmSync(join(tmpDir, 'data', 'waiaas.db'));

      expect(() => service.createBackup('1.7.0')).toThrowError('Database file not found');
    });
  });

  describe('restoreLatest', () => {
    it('최신 백업에서 DB + config.toml이 복원된다', () => {
      // Create two backups with different content
      service.createBackup('1.6.0');
      // Modify the original files
      writeFileSync(join(tmpDir, 'data', 'waiaas.db'), 'modified-db');
      writeFileSync(join(tmpDir, 'config.toml'), 'modified-config');

      const backupDir = service.createBackup('1.7.0');

      // Corrupt original files
      writeFileSync(join(tmpDir, 'data', 'waiaas.db'), 'corrupted-db');
      writeFileSync(join(tmpDir, 'config.toml'), 'corrupted-config');

      // Restore latest (1.7.0 backup)
      const restoredDir = service.restoreLatest();

      expect(restoredDir).toBe(backupDir);
      expect(readFileSync(join(tmpDir, 'data', 'waiaas.db'), 'utf-8')).toBe('modified-db');
      expect(readFileSync(join(tmpDir, 'config.toml'), 'utf-8')).toBe('modified-config');
    });

    it('백업이 없으면 에러를 throw한다', () => {
      expect(() => service.restoreLatest()).toThrowError('No backups found');
    });
  });

  describe('restore', () => {
    it('지정된 백업 디렉토리에서 파일이 복원된다', () => {
      const backupDir = service.createBackup('1.7.0');

      // Modify original files
      writeFileSync(join(tmpDir, 'data', 'waiaas.db'), 'after-upgrade-db');
      writeFileSync(join(tmpDir, 'config.toml'), 'after-upgrade-config');

      // Restore from the specific backup
      service.restore(backupDir);

      expect(readFileSync(join(tmpDir, 'data', 'waiaas.db'), 'utf-8')).toBe(DB_CONTENT);
      expect(readFileSync(join(tmpDir, 'config.toml'), 'utf-8')).toBe(CONFIG_CONTENT);
    });

    it('존재하지 않는 백업 디렉토리면 에러를 throw한다', () => {
      expect(() => service.restore('/nonexistent/backup')).toThrowError(
        'Backup directory not found',
      );
    });

    it('WAL/SHM 파일이 백업에 있으면 함께 복원된다', () => {
      writeFileSync(join(tmpDir, 'data', 'waiaas.db-wal'), 'wal-data');
      writeFileSync(join(tmpDir, 'data', 'waiaas.db-shm'), 'shm-data');

      const backupDir = service.createBackup('1.7.0');

      // Remove WAL/SHM from data dir
      rmSync(join(tmpDir, 'data', 'waiaas.db-wal'));
      rmSync(join(tmpDir, 'data', 'waiaas.db-shm'));

      service.restore(backupDir);

      expect(readFileSync(join(tmpDir, 'data', 'waiaas.db-wal'), 'utf-8')).toBe('wal-data');
      expect(readFileSync(join(tmpDir, 'data', 'waiaas.db-shm'), 'utf-8')).toBe('shm-data');
    });
  });

  describe('listBackups', () => {
    it('백업 목록이 최신순으로 정렬된다', () => {
      // Create backups with different versions (timestamp in name ensures order)
      const dir1 = service.createBackup('1.5.0');

      // Wait briefly to ensure different timestamps
      const _dir2 = service.createBackup('1.6.0');
      const dir3 = service.createBackup('1.7.0');

      const backups = service.listBackups();

      // Should be newest first
      expect(backups.length).toBe(3);
      // The last created (1.7.0) should be first since its timestamp is latest
      expect(backups[0]).toBe(dir3);
      expect(backups[2]).toBe(dir1);
    });

    it('backups 디렉토리가 없으면 빈 배열을 반환한다', () => {
      // Use a fresh service with no backups dir
      const freshDir = mkdtempSync(join(tmpdir(), 'fresh-test-'));
      const freshService = new BackupService(freshDir);

      expect(freshService.listBackups()).toEqual([]);

      rmSync(freshDir, { recursive: true, force: true });
    });
  });

  describe('pruneBackups', () => {
    it('5개 초과 백업이 삭제되고 최신 5개가 보존된다', () => {
      // Create 7 backups with distinguishable versions
      for (let i = 0; i < 7; i++) {
        // Manually create backup dirs with ordered timestamps to avoid timing issues
        const backupName = `pre-upgrade-1.0.${i}-2026021${i}143022`;
        const backupDir = join(tmpDir, 'backups', backupName);
        mkdirSync(backupDir, { recursive: true });
        writeFileSync(join(backupDir, 'waiaas.db'), `db-${i}`);
      }

      const deleted = service.pruneBackups(5);

      expect(deleted).toBe(2);
      const remaining = readdirSync(join(tmpDir, 'backups')).filter((n) =>
        n.startsWith('pre-upgrade-'),
      );
      expect(remaining.length).toBe(5);

      // The oldest two (i=0, i=1) should be deleted — they sort first ascending = last descending
      expect(remaining).not.toContain('pre-upgrade-1.0.0-20260210143022');
      expect(remaining).not.toContain('pre-upgrade-1.0.1-20260211143022');
    });

    it('5개 이하이면 삭제되지 않는다', () => {
      // Create 3 backups
      service.createBackup('1.5.0');
      service.createBackup('1.6.0');
      service.createBackup('1.7.0');

      const deleted = service.pruneBackups(5);

      expect(deleted).toBe(0);
      expect(service.listBackups().length).toBe(3);
    });

    it('삭제된 개수를 반환한다', () => {
      // Create 8 backups manually
      for (let i = 0; i < 8; i++) {
        const backupName = `pre-upgrade-2.0.${i}-2026021${i}150000`;
        const backupDir = join(tmpDir, 'backups', backupName);
        mkdirSync(backupDir, { recursive: true });
        writeFileSync(join(backupDir, 'waiaas.db'), `db-${i}`);
      }

      const deleted = service.pruneBackups(5);
      expect(deleted).toBe(3);
    });
  });
});
