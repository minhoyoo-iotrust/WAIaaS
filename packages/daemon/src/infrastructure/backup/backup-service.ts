/**
 * BackupService: pre-upgrade backup and restore for DB + config.toml.
 *
 * Creates backups at {dataDir}/backups/pre-upgrade-{version}-{timestamp}/
 * and enforces a retention policy (default 5 most recent backups).
 *
 * Used by the upgrade flow to provide safe rollback capability.
 */

import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  rmSync,
  statSync,
} from 'node:fs';
import { join } from 'node:path';

export class BackupService {
  private readonly backupsDir: string;

  constructor(private readonly dataDir: string) {
    this.backupsDir = join(dataDir, 'backups');
  }

  /**
   * Create a pre-upgrade backup of DB + config.toml.
   *
   * @param version - The version being upgraded from (e.g. "1.7.0")
   * @returns The absolute path to the created backup directory
   * @throws If DB file does not exist at {dataDir}/data/waiaas.db
   */
  createBackup(version: string): string {
    const timestamp = this.formatTimestamp(new Date());
    const backupName = `pre-upgrade-${version}-${timestamp}`;
    const backupDir = join(this.backupsDir, backupName);

    mkdirSync(backupDir, { recursive: true });

    // Copy DB file (required)
    const dbPath = join(this.dataDir, 'data', 'waiaas.db');
    if (!existsSync(dbPath)) {
      // Clean up empty backup dir before throwing
      rmSync(backupDir, { recursive: true, force: true });
      throw new Error(`Database file not found: ${dbPath}`);
    }
    copyFileSync(dbPath, join(backupDir, 'waiaas.db'));

    // Copy WAL/SHM files if they exist
    const walPath = join(this.dataDir, 'data', 'waiaas.db-wal');
    if (existsSync(walPath)) {
      copyFileSync(walPath, join(backupDir, 'waiaas.db-wal'));
    }

    const shmPath = join(this.dataDir, 'data', 'waiaas.db-shm');
    if (existsSync(shmPath)) {
      copyFileSync(shmPath, join(backupDir, 'waiaas.db-shm'));
    }

    // Copy config.toml if it exists (optional)
    const configPath = join(this.dataDir, 'config.toml');
    if (existsSync(configPath)) {
      copyFileSync(configPath, join(backupDir, 'config.toml'));
    }

    // Apply retention policy
    this.pruneBackups(5);

    return backupDir;
  }

  /**
   * Restore from the most recent backup.
   *
   * @returns The absolute path of the backup that was restored
   * @throws If no backups are found
   */
  restoreLatest(): string {
    const backups = this.listBackups();
    if (backups.length === 0) {
      throw new Error('No backups found');
    }

    const latestDir = backups[0]!;
    this.restore(latestDir);
    return latestDir;
  }

  /**
   * Restore DB + config.toml from a specific backup directory.
   *
   * @param backupDir - Absolute path to the backup directory
   * @throws If backupDir does not exist
   */
  restore(backupDir: string): void {
    if (!existsSync(backupDir)) {
      throw new Error(`Backup directory not found: ${backupDir}`);
    }

    // Restore DB file
    const backupDb = join(backupDir, 'waiaas.db');
    if (existsSync(backupDb)) {
      const targetDb = join(this.dataDir, 'data', 'waiaas.db');
      // Ensure data directory exists
      mkdirSync(join(this.dataDir, 'data'), { recursive: true });
      copyFileSync(backupDb, targetDb);
    }

    // Restore WAL file if present in backup
    const backupWal = join(backupDir, 'waiaas.db-wal');
    if (existsSync(backupWal)) {
      copyFileSync(backupWal, join(this.dataDir, 'data', 'waiaas.db-wal'));
    }

    // Restore SHM file if present in backup
    const backupShm = join(backupDir, 'waiaas.db-shm');
    if (existsSync(backupShm)) {
      copyFileSync(backupShm, join(this.dataDir, 'data', 'waiaas.db-shm'));
    }

    // Restore config.toml if present in backup
    const backupConfig = join(backupDir, 'config.toml');
    if (existsSync(backupConfig)) {
      copyFileSync(backupConfig, join(this.dataDir, 'config.toml'));
    }
  }

  /**
   * List all backup directories, sorted newest-first.
   *
   * @returns Array of absolute paths to backup directories, newest first
   */
  listBackups(): string[] {
    if (!existsSync(this.backupsDir)) {
      return [];
    }

    const entries = readdirSync(this.backupsDir);
    return entries
      .filter((name) => name.startsWith('pre-upgrade-'))
      .filter((name) => {
        try {
          return statSync(join(this.backupsDir, name)).isDirectory();
        } catch {
          return false;
        }
      })
      .sort((a, b) => b.localeCompare(a)) // Descending (newest first)
      .map((name) => join(this.backupsDir, name));
  }

  /**
   * Remove old backups exceeding the keep limit.
   *
   * @param keep - Number of most recent backups to retain (default 5)
   * @returns Number of backups deleted
   */
  pruneBackups(keep = 5): number {
    const backups = this.listBackups();
    if (backups.length <= keep) {
      return 0;
    }

    const toDelete = backups.slice(keep);
    for (const dir of toDelete) {
      rmSync(dir, { recursive: true, force: true });
    }

    return toDelete.length;
  }

  /**
   * Format a Date as YYYYMMDDHHmmss string.
   */
  private formatTimestamp(date: Date): string {
    const y = date.getFullYear().toString();
    const M = (date.getMonth() + 1).toString().padStart(2, '0');
    const d = date.getDate().toString().padStart(2, '0');
    const h = date.getHours().toString().padStart(2, '0');
    const m = date.getMinutes().toString().padStart(2, '0');
    const s = date.getSeconds().toString().padStart(2, '0');
    return `${y}${M}${d}${h}${m}${s}`;
  }
}
