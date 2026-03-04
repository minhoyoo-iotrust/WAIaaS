/**
 * EncryptedBackupService: AES-256-GCM encrypted backup creation, listing,
 * inspection, pruning, and decryption.
 *
 * Uses Argon2id KDF (same parameters as keystore) for key derivation.
 * DB snapshot via VACUUM INTO for atomic, WAL-integrated snapshots.
 *
 * Archive format: 60B header + plaintext metadata JSON + encrypted payload.
 *
 * @see docs/306/DESIGN-SPEC.md sections 2-3
 */

import { randomBytes, createCipheriv, createDecipheriv, createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
  unlinkSync,
} from 'node:fs';
import { join, basename } from 'node:path';
import { createRequire } from 'node:module';
import type { Database as SQLiteDatabase } from 'better-sqlite3';
import { WAIaaSError } from '@waiaas/core';
import { deriveKey, KDF_PARAMS } from '../keystore/crypto.js';
import {
  writeArchive,
  readArchiveHeader,
  readArchiveMetadata,
  encodeEntries,
  decodeEntries,
  BACKUP_HEADER_SIZE,
} from './backup-format.js';
import type { BackupMetadata, BackupInfo } from './backup-format.js';

// ---------------------------------------------------------------------------
// Version helper
// ---------------------------------------------------------------------------

let _daemonVersion: string | null = null;

function getDaemonVersion(): string {
  if (_daemonVersion) return _daemonVersion;
  try {
    const require = createRequire(import.meta.url);
    const pkg = require('../../../package.json') as { version: string };
    _daemonVersion = pkg.version;
  } catch {
    _daemonVersion = 'unknown';
  }
  return _daemonVersion;
}

// ---------------------------------------------------------------------------
// EncryptedBackupService
// ---------------------------------------------------------------------------

export class EncryptedBackupService {
  constructor(
    private readonly dataDir: string,
    private readonly backupsDir: string,
    private readonly sqlite: SQLiteDatabase,
  ) {}

  /**
   * Create an encrypted backup archive.
   *
   * 1. VACUUM INTO for atomic DB snapshot
   * 2. Collect config.toml + keystore/*.json entries
   * 3. Encrypt with AES-256-GCM (Argon2id-derived key)
   * 4. Write archive to backupsDir
   */
  async createBackup(masterPassword: string): Promise<BackupInfo> {
    mkdirSync(this.backupsDir, { recursive: true });

    // Ensure tmp dir exists
    const tmpDir = join(this.dataDir, 'tmp');
    mkdirSync(tmpDir, { recursive: true });

    // 1. VACUUM INTO for atomic DB snapshot
    const snapPath = join(tmpDir, `waiaas-snap-${Date.now()}.db`);
    try {
      this.sqlite.exec(`VACUUM INTO '${snapPath}'`);
    } catch (err) {
      throw new WAIaaSError('BACKUP_CORRUPTED', {
        message: `VACUUM INTO failed: ${err instanceof Error ? err.message : String(err)}`,
        cause: err instanceof Error ? err : undefined,
      });
    }
    const dbBuffer = readFileSync(snapPath);
    try { unlinkSync(snapPath); } catch { /* best effort cleanup */ }

    // 2. Collect entries
    const entries: Array<{ name: string; data: Buffer }> = [
      { name: 'waiaas.db', data: dbBuffer },
    ];

    // config.toml (optional)
    const configPath = join(this.dataDir, 'config.toml');
    if (existsSync(configPath)) {
      entries.push({ name: 'config.toml', data: readFileSync(configPath) });
    }

    // keystore/*.json (0+)
    const keystoreDir = join(this.dataDir, 'keystore');
    if (existsSync(keystoreDir)) {
      const files = readdirSync(keystoreDir).filter((f) => f.endsWith('.json'));
      for (const file of files) {
        entries.push({
          name: `keystore/${file}`,
          data: readFileSync(join(keystoreDir, file)),
        });
      }
    }

    // 3. Encode + encrypt
    const plainPayload = encodeEntries(entries);

    const salt = randomBytes(16);
    const nonce = randomBytes(12);
    const { key } = await deriveKey(masterPassword, salt);

    const cipher = createCipheriv('aes-256-gcm', key, nonce);
    const encryptedPayload = Buffer.concat([cipher.update(plainPayload), cipher.final()]);
    const authTag = cipher.getAuthTag();

    // Zero key from memory
    key.fill(0);

    // 4. Build metadata (plaintext)
    const daemonVersion = getDaemonVersion();
    const schemaVersion = (this.sqlite.pragma('user_version') as Array<{ user_version: number }>)[0]?.user_version ?? 0;
    const checksum = 'sha256:' + createHash('sha256').update(encryptedPayload).digest('hex');

    const metadata: BackupMetadata = {
      created_at: new Date().toISOString(),
      daemon_version: daemonVersion,
      schema_version: schemaVersion,
      kdf: 'argon2id',
      kdf_params: {
        memory_cost: KDF_PARAMS.memoryCost,
        time_cost: KDF_PARAMS.timeCost,
        parallelism: KDF_PARAMS.parallelism,
        hash_length: KDF_PARAMS.hashLength,
      },
      contents: {
        database: { name: 'waiaas.db', size: dbBuffer.length },
        ...(existsSync(configPath) ? {
          config: { name: 'config.toml', size: readFileSync(configPath).length },
        } : {}),
        keystore_files: entries
          .filter((e) => e.name.startsWith('keystore/'))
          .map((e) => ({ name: basename(e.name), size: e.data.length })),
      },
      checksum,
    };

    // 5. Write archive
    const archiveBuffer = writeArchive({ metadata, salt, nonce, authTag, encryptedPayload });
    const timestamp = this.formatTimestamp(new Date());
    const filename = `backup-${timestamp}.waiaas-backup`;
    const filePath = join(this.backupsDir, filename);
    writeFileSync(filePath, archiveBuffer);

    return {
      path: filePath,
      filename,
      size: archiveBuffer.length,
      created_at: metadata.created_at,
      daemon_version: metadata.daemon_version,
      schema_version: metadata.schema_version,
      file_count: entries.length,
    };
  }

  /**
   * List existing backup files, sorted newest-first.
   */
  listBackups(): BackupInfo[] {
    if (!existsSync(this.backupsDir)) return [];

    const files = readdirSync(this.backupsDir)
      .filter((f) => f.endsWith('.waiaas-backup'));

    const infos: BackupInfo[] = [];
    for (const file of files) {
      const filePath = join(this.backupsDir, file);
      try {
        const archive = readFileSync(filePath);
        const metadata = readArchiveMetadata(archive);
        const stat = statSync(filePath);
        const fileCount =
          1 + // database
          (metadata.contents.config ? 1 : 0) +
          metadata.contents.keystore_files.length;

        infos.push({
          path: filePath,
          filename: file,
          size: stat.size,
          created_at: metadata.created_at,
          daemon_version: metadata.daemon_version,
          schema_version: metadata.schema_version,
          file_count: fileCount,
        });
      } catch {
        // Skip malformed backups
      }
    }

    // Sort newest-first
    infos.sort((a, b) => b.created_at.localeCompare(a.created_at));
    return infos;
  }

  /**
   * Inspect a backup file's metadata without decryption.
   */
  inspectBackup(archivePath: string): BackupMetadata {
    if (!existsSync(archivePath)) {
      throw new WAIaaSError('BACKUP_NOT_FOUND', {
        message: `Backup file not found: ${archivePath}`,
      });
    }
    const archive = readFileSync(archivePath);
    return readArchiveMetadata(archive);
  }

  /**
   * Remove old backups exceeding the retention count.
   *
   * @param keep - Number of newest backups to retain (default 7)
   * @returns Number of backups deleted
   */
  pruneBackups(keep = 7): number {
    const backups = this.listBackups();
    if (backups.length <= keep) return 0;

    const toDelete = backups.slice(keep);
    for (const info of toDelete) {
      try { unlinkSync(info.path); } catch { /* best effort */ }
    }
    return toDelete.length;
  }

  /**
   * Decrypt a backup archive and return the contained entries.
   *
   * @param archivePath - Path to the .waiaas-backup file
   * @param masterPassword - Master password used for encryption
   * @returns Array of { name, data } entries
   */
  async decryptBackup(
    archivePath: string,
    masterPassword: string,
  ): Promise<Array<{ name: string; data: Buffer }>> {
    if (!existsSync(archivePath)) {
      throw new WAIaaSError('BACKUP_NOT_FOUND', {
        message: `Backup file not found: ${archivePath}`,
      });
    }

    const archive = readFileSync(archivePath);
    const header = readArchiveHeader(archive);

    // Extract encrypted payload (after header + metadata)
    const payloadStart = BACKUP_HEADER_SIZE + header.metadataLength;
    const encryptedPayload = archive.subarray(payloadStart);

    // Derive key
    const { key } = await deriveKey(masterPassword, header.salt);

    try {
      const decipher = createDecipheriv('aes-256-gcm', key, header.nonce);
      decipher.setAuthTag(header.authTag);
      const plainPayload = Buffer.concat([
        decipher.update(encryptedPayload),
        decipher.final(),
      ]);
      return decodeEntries(plainPayload);
    } catch (error) {
      throw new WAIaaSError('INVALID_MASTER_PASSWORD', {
        message: 'Decryption failed: wrong password or corrupted backup (GCM authTag mismatch)',
        cause: error instanceof Error ? error : undefined,
      });
    } finally {
      key.fill(0);
    }
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private formatTimestamp(date: Date): string {
    const y = date.getFullYear().toString();
    const M = (date.getMonth() + 1).toString().padStart(2, '0');
    const d = date.getDate().toString().padStart(2, '0');
    const h = date.getHours().toString().padStart(2, '0');
    const m = date.getMinutes().toString().padStart(2, '0');
    const s = date.getSeconds().toString().padStart(2, '0');
    const ms = date.getMilliseconds().toString().padStart(3, '0');
    return `${y}${M}${d}-${h}${m}${s}${ms}`;
  }
}
