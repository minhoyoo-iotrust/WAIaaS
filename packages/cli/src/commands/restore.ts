/**
 * `waiaas restore` -- Restore from an encrypted backup.
 *
 * Safety checks:
 *   1. Validates backup file exists
 *   2. Checks daemon is not running (PID file)
 *   3. Pre-inspects backup metadata
 *   4. Confirmation prompt (unless --force)
 *   5. Decrypts backup with master password
 *   6. Preserves existing data as .bak-{timestamp}
 *   7. Writes restored files + PRAGMA integrity_check
 *   8. Auto-rollback on failure
 */

import {
  existsSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
  renameSync,
  rmSync,
} from 'node:fs';
import { join, basename, dirname } from 'node:path';
import { createDecipheriv } from 'node:crypto';
import Database from 'better-sqlite3';
import {
  readArchiveHeader,
  readArchiveMetadata,
  decodeEntries,
  deriveKey,
  BACKUP_HEADER_SIZE,
} from '@waiaas/daemon';
import { resolvePassword } from '../utils/password.js';
import { promptText } from '../utils/prompt.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RestoreOptions {
  from: string;
  dataDir: string;
  password?: string;
  force?: boolean;
}

// ---------------------------------------------------------------------------
// Restore command
// ---------------------------------------------------------------------------

/**
 * Restore from an encrypted .waiaas-backup archive.
 *
 * The daemon must NOT be running. Existing data is preserved as .bak-{timestamp}.
 * On failure, .bak files are automatically restored.
 */
export async function restoreCommand(opts: RestoreOptions): Promise<void> {
  const { from: archivePath, dataDir, force } = opts;

  // 1. Validate archive exists
  if (!existsSync(archivePath)) {
    console.error(`Error: Backup file not found: ${archivePath}`);
    process.exit(1);
  }

  // 2. Check daemon not running
  const pidFile = join(dataDir, 'daemon.pid');
  if (existsSync(pidFile)) {
    const pidStr = readFileSync(pidFile, 'utf-8').trim();
    const pid = parseInt(pidStr, 10);
    if (!isNaN(pid)) {
      let processAlive = false;
      try {
        process.kill(pid, 0); // signal 0 = check if process exists
        processAlive = true;
      } catch {
        // Process not found -- stale PID file, safe to continue
        try { rmSync(pidFile); } catch { /* best effort */ }
      }
      if (processAlive) {
        console.error('Error: WAIaaS daemon is running. Stop it first: waiaas stop');
        process.exit(1);
      }
    }
  }

  // 3. Pre-inspect backup metadata
  const archiveBuffer = readFileSync(archivePath);
  let metadata;
  try {
    metadata = readArchiveMetadata(archiveBuffer);
  } catch (err) {
    const code = (err as { code?: string }).code;
    if (code === 'INVALID_BACKUP_FORMAT') {
      console.error(`Error: Not a valid WAIaaS backup file: ${archivePath}`);
      process.exit(1);
    }
    throw err;
  }

  const fileCount =
    1 +
    (metadata.contents.config ? 1 : 0) +
    metadata.contents.keystore_files.length;

  console.log('\nBackup to restore:\n');
  console.log(`  File:           ${basename(archivePath)}`);
  console.log(`  Created at:     ${metadata.created_at}`);
  console.log(`  Daemon version: ${metadata.daemon_version}`);
  console.log(`  Schema version: ${metadata.schema_version}`);
  console.log(`  File count:     ${fileCount}`);
  console.log(`  Size:           ${formatSize(archiveBuffer.length)}`);
  console.log('');

  // 4. Confirmation prompt
  if (!force) {
    const answer = await promptText('This will replace your current data with the backup. Continue? (y/N) ');
    if (answer.toLowerCase() !== 'y') {
      console.log('Restore cancelled.');
      return;
    }
  }

  // 5. Decrypt backup
  console.log('Decrypting backup...');
  const password = opts.password ?? await resolvePassword(dataDir);

  const header = readArchiveHeader(archiveBuffer);
  const payloadStart = BACKUP_HEADER_SIZE + header.metadataLength;
  const encryptedPayload = archiveBuffer.subarray(payloadStart);

  const { key } = await deriveKey(password, header.salt);

  let entries: Array<{ name: string; data: Buffer }>;
  try {
    const decipher = createDecipheriv('aes-256-gcm', key, header.nonce);
    decipher.setAuthTag(header.authTag);
    const plainPayload = Buffer.concat([
      decipher.update(encryptedPayload),
      decipher.final(),
    ]);
    entries = decodeEntries(plainPayload);
  } catch {
    key.fill(0);
    console.error('Error: Wrong master password or corrupted backup (GCM auth tag mismatch).');
    process.exit(1);
  }
  key.fill(0);

  console.log(`Decrypted ${entries.length} file(s).`);

  // 6. Create .bak preservations
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const bakPaths: Array<{ original: string; backup: string }> = [];

  const dataDbDir = join(dataDir, 'data');
  const keystoreDir = join(dataDir, 'keystore');
  const configPath = join(dataDir, 'config.toml');

  if (existsSync(dataDbDir)) {
    const bakPath = `${dataDbDir}.bak-${timestamp}`;
    renameSync(dataDbDir, bakPath);
    bakPaths.push({ original: dataDbDir, backup: bakPath });
  }
  if (existsSync(keystoreDir)) {
    const bakPath = `${keystoreDir}.bak-${timestamp}`;
    renameSync(keystoreDir, bakPath);
    bakPaths.push({ original: keystoreDir, backup: bakPath });
  }
  if (existsSync(configPath)) {
    const bakPath = `${configPath}.bak-${timestamp}`;
    renameSync(configPath, bakPath);
    bakPaths.push({ original: configPath, backup: bakPath });
  }

  // 7. Write restored files (with auto-rollback on failure)
  try {
    mkdirSync(dataDbDir, { recursive: true });
    mkdirSync(keystoreDir, { recursive: true });

    for (const entry of entries) {
      if (entry.name === 'waiaas.db') {
        writeFileSync(join(dataDbDir, 'waiaas.db'), entry.data);
      } else if (entry.name === 'config.toml') {
        writeFileSync(configPath, entry.data);
      } else if (entry.name.startsWith('keystore/')) {
        const entryPath = join(dataDir, entry.name);
        mkdirSync(dirname(entryPath), { recursive: true });
        writeFileSync(entryPath, entry.data);
      }
    }

    // PRAGMA integrity_check
    const dbPath = join(dataDbDir, 'waiaas.db');
    if (existsSync(dbPath)) {
      const db = new Database(dbPath);
      try {
        const result = db.pragma('integrity_check') as Array<{ integrity_check: string }>;
        const status = result[0]?.integrity_check ?? 'unknown';
        if (status !== 'ok') {
          throw new Error(`Database integrity check failed: ${status}`);
        }
        console.log('Database integrity check: OK');
      } finally {
        db.close();
      }
    }
  } catch (err) {
    // 8. Auto-rollback
    console.error(`\nRestore failed: ${err instanceof Error ? err.message : String(err)}`);
    console.log('Rolling back to original data...');

    // Remove partially written files
    try { rmSync(dataDbDir, { recursive: true, force: true }); } catch { /* best effort */ }
    try { rmSync(keystoreDir, { recursive: true, force: true }); } catch { /* best effort */ }
    try { rmSync(configPath, { force: true }); } catch { /* best effort */ }

    // Restore .bak files
    for (const bak of bakPaths) {
      try {
        renameSync(bak.backup, bak.original);
      } catch {
        console.error(`Warning: Could not restore ${bak.backup} -> ${bak.original}`);
      }
    }

    console.error('Original data has been restored from .bak files.');
    process.exit(1);
  }

  // Success
  console.log('\nRestore complete!\n');
  console.log(`  Restored from: ${basename(archivePath)}`);
  if (bakPaths.length > 0) {
    console.log(`  Original data preserved as .bak-${timestamp}`);
  }
  console.log('  Start the daemon: waiaas start');
  console.log('');
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
