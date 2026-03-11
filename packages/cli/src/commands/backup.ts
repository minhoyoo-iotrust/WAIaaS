/**
 * `waiaas backup` CLI commands.
 *
 * Subcommands:
 *   create   -- Create encrypted backup via daemon API (daemon must be running)
 *   list     -- List available backups from local directory (offline)
 *   inspect  -- Show plaintext metadata of a backup file (offline, no password needed)
 */

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { readArchiveMetadata } from '@waiaas/daemon';
import { resolvePassword } from '../utils/password.js';
import { CLI_FETCH_TIMEOUT_MS } from '../constants.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface BackupCreateOptions {
  baseUrl?: string;
  password?: string;
  dataDir?: string;
}

export interface BackupListOptions {
  dataDir: string;
}

// ---------------------------------------------------------------------------
// backup create (daemon API)
// ---------------------------------------------------------------------------

/**
 * Create an encrypted backup by calling POST /v1/admin/backup on the running daemon.
 */
export async function backupCommand(opts: BackupCreateOptions): Promise<void> {
  const baseUrl = opts.baseUrl ?? 'http://127.0.0.1:3100';

  // 1. Health check
  try {
    const healthRes = await fetch(`${baseUrl}/health`, { signal: AbortSignal.timeout(CLI_FETCH_TIMEOUT_MS) });
    if (!healthRes.ok) throw new Error(`Health check returned ${healthRes.status}`);
  } catch {
    console.error('Error: Cannot reach WAIaaS daemon.');
    console.error(`Hint: Start the daemon first: waiaas start`);
    process.exit(1);
  }

  // 2. Resolve password
  const password = opts.password ?? await resolvePassword(opts.dataDir);

  // 3. Call POST /v1/admin/backup
  const res = await fetch(`${baseUrl}/v1/admin/backup`, {
    method: 'POST',
    headers: { 'X-Master-Password': password },
  });

  if (res.status === 401) {
    console.error('Error: Invalid master password.');
    process.exit(1);
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({ message: 'Unknown error' })) as { message?: string };
    console.error(`Error: Backup creation failed (${res.status}): ${body.message ?? 'Unknown error'}`);
    process.exit(1);
  }

  const info = await res.json() as {
    path: string;
    filename: string;
    size: number;
    created_at: string;
    daemon_version: string;
    schema_version: number;
    file_count: number;
  };

  // 4. Display result
  console.log('\nBackup created successfully!\n');
  console.log(`  Filename:       ${info.filename}`);
  console.log(`  Path:           ${info.path}`);
  console.log(`  Size:           ${formatSize(info.size)}`);
  console.log(`  Created at:     ${info.created_at}`);
  console.log(`  Daemon version: ${info.daemon_version}`);
  console.log(`  Schema version: ${info.schema_version}`);
  console.log(`  File count:     ${info.file_count}`);
  console.log('');
}

// ---------------------------------------------------------------------------
// backup list (offline)
// ---------------------------------------------------------------------------

/**
 * List available backups from the backups directory (offline, no daemon needed).
 */
export async function backupListCommand(opts: BackupListOptions): Promise<void> {
  const backupsDir = join(opts.dataDir, 'backups');

  if (!existsSync(backupsDir)) {
    console.log('No backups found.');
    return;
  }

  const files = readdirSync(backupsDir).filter((f) => f.endsWith('.waiaas-backup'));
  if (files.length === 0) {
    console.log('No backups found.');
    return;
  }

  interface BackupRow {
    filename: string;
    size: string;
    created_at: string;
    daemon_version: string;
    schema_version: number;
    files: number;
  }

  const rows: BackupRow[] = [];

  for (const file of files) {
    const filePath = join(backupsDir, file);
    try {
      const archive = readFileSync(filePath);
      const metadata = readArchiveMetadata(archive);
      const stat = statSync(filePath);
      const fileCount =
        1 +
        (metadata.contents.config ? 1 : 0) +
        metadata.contents.keystore_files.length;

      rows.push({
        filename: file,
        size: formatSize(stat.size),
        created_at: metadata.created_at,
        daemon_version: metadata.daemon_version,
        schema_version: metadata.schema_version,
        files: fileCount,
      });
    } catch {
      // Skip malformed backups
    }
  }

  // Sort newest-first
  rows.sort((a, b) => b.created_at.localeCompare(a.created_at));

  // Display table
  console.log('\nAvailable Backups:\n');
  console.log(
    '  ' +
    'Filename'.padEnd(40) +
    'Size'.padEnd(12) +
    'Created'.padEnd(26) +
    'Version'.padEnd(10) +
    'Schema'.padEnd(8) +
    'Files'
  );
  console.log('  ' + '-'.repeat(96));

  for (const row of rows) {
    console.log(
      '  ' +
      row.filename.padEnd(40) +
      row.size.padEnd(12) +
      row.created_at.padEnd(26) +
      row.daemon_version.padEnd(10) +
      String(row.schema_version).padEnd(8) +
      String(row.files)
    );
  }

  console.log(`\nTotal: ${rows.length} backup(s)\n`);
}

// ---------------------------------------------------------------------------
// backup inspect (offline)
// ---------------------------------------------------------------------------

/**
 * Inspect a backup file's metadata without requiring the master password.
 */
export async function backupInspectCommand(archivePath: string): Promise<void> {
  if (!existsSync(archivePath)) {
    console.error(`Error: Backup file not found: ${archivePath}`);
    process.exit(1);
  }

  let metadata;
  try {
    const archive = readFileSync(archivePath);
    metadata = readArchiveMetadata(archive);
  } catch (err) {
    const code = (err as { code?: string }).code;
    if (code === 'INVALID_BACKUP_FORMAT') {
      console.error(`Error: Not a valid WAIaaS backup file: ${archivePath}`);
      process.exit(1);
    }
    if (code === 'UNSUPPORTED_BACKUP_VERSION') {
      console.error(`Error: Unsupported backup format version: ${archivePath}`);
      process.exit(1);
    }
    throw err;
  }

  const stat = statSync(archivePath);

  console.log('\nBackup Inspection:\n');
  console.log(`  File:           ${archivePath}`);
  console.log(`  Size:           ${formatSize(stat.size)}`);
  console.log(`  Created at:     ${metadata.created_at}`);
  console.log(`  Daemon version: ${metadata.daemon_version}`);
  console.log(`  Schema version: ${metadata.schema_version}`);
  console.log(`  KDF:            ${metadata.kdf}`);
  console.log(`  KDF params:     memory=${metadata.kdf_params.memory_cost}, time=${metadata.kdf_params.time_cost}, parallelism=${metadata.kdf_params.parallelism}`);
  console.log(`  Checksum:       ${metadata.checksum}`);
  console.log('');
  console.log('  Contents:');
  console.log(`    Database:     ${metadata.contents.database.name} (${formatSize(metadata.contents.database.size)})`);
  if (metadata.contents.config) {
    console.log(`    Config:       ${metadata.contents.config.name} (${formatSize(metadata.contents.config.size)})`);
  }
  if (metadata.contents.keystore_files.length > 0) {
    console.log(`    Keystore files (${metadata.contents.keystore_files.length}):`);
    for (const kf of metadata.contents.keystore_files) {
      console.log(`      - ${kf.name} (${formatSize(kf.size)})`);
    }
  } else {
    console.log('    Keystore files: none');
  }
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
