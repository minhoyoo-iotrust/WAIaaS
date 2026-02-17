/**
 * `waiaas upgrade` -- Upgrade WAIaaS to the latest version.
 *
 * Supports four modes:
 *   --check     Check for available updates without upgrading
 *   --rollback  Restore from the latest pre-upgrade backup
 *   --to <ver>  Upgrade to a specific version
 *   (default)   7-step upgrade sequence:
 *     1. Version check
 *     2. Stop daemon
 *     3. Create backup
 *     4. Update package
 *     5. Database migrations (deferred to daemon start)
 *     6. Verify installation
 *     7. Restart daemon
 */

import { existsSync, readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import semver from 'semver';
import { BackupService } from '@waiaas/daemon';

const require = createRequire(import.meta.url);
const { version: CURRENT_VERSION } = require('../../package.json') as { version: string };

const NPM_REGISTRY_URL = 'https://registry.npmjs.org/@waiaas/cli';
const FETCH_TIMEOUT_MS = 5000;

export interface UpgradeOptions {
  dataDir: string;
  check?: boolean;
  to?: string;
  rollback?: boolean;
  noStart?: boolean;
}

/**
 * Execute the upgrade command based on the provided options.
 */
export async function upgradeCommand(opts: UpgradeOptions): Promise<void> {
  if (opts.check) {
    return checkMode();
  }

  if (opts.rollback) {
    return rollbackMode(opts.dataDir);
  }

  return upgradeMode(opts);
}

/**
 * --check mode: Query npm registry and report update availability.
 */
async function checkMode(): Promise<void> {
  const latest = await fetchLatestVersion();
  if (!latest) {
    console.error('Failed to check for updates. Please try again later.');
    process.exit(1);
    return;
  }

  if (semver.gt(latest, CURRENT_VERSION)) {
    console.log(`Update available: ${CURRENT_VERSION} \u2192 ${latest}`);
    console.log('Run: waiaas upgrade');
  } else {
    console.log(`Already up to date (${CURRENT_VERSION})`);
  }
}

/**
 * --rollback mode: Restore from the latest backup.
 */
function rollbackMode(dataDir: string): void {
  try {
    const backupService = new BackupService(dataDir);
    const backupDir = backupService.restoreLatest();
    console.log(`Restored from backup: ${backupDir}`);
  } catch (err) {
    console.error(`Rollback failed: ${(err as Error).message}`);
    process.exit(1);
  }
}

/**
 * Default mode: Execute the 7-step upgrade sequence.
 */
async function upgradeMode(opts: UpgradeOptions): Promise<void> {
  // Step 1: Version check
  let targetVersion: string;

  if (opts.to) {
    if (!semver.valid(opts.to)) {
      console.error(`Invalid version: ${opts.to}`);
      process.exit(1);
      return;
    }
    targetVersion = opts.to;
  } else {
    const latest = await fetchLatestVersion();
    if (!latest) {
      console.error('Failed to check for updates. Please try again later.');
      process.exit(1);
      return;
    }
    targetVersion = latest;
  }

  if (targetVersion === CURRENT_VERSION) {
    console.log(`Already up to date (${CURRENT_VERSION})`);
    return;
  }

  console.log(`[1/7] Version check: ${CURRENT_VERSION} \u2192 ${targetVersion}`);

  // Step 2: Stop daemon
  console.log('[2/7] Stopping daemon...');
  stopDaemonIfRunning(opts.dataDir);

  // Step 3: Backup
  console.log('[3/7] Creating backup...');
  const backupService = new BackupService(opts.dataDir);
  try {
    const backupDir = backupService.createBackup(CURRENT_VERSION);
    console.log(`  Backup created: ${backupDir}`);
  } catch (err) {
    console.error(`Backup failed: ${(err as Error).message}`);
    console.error('Upgrade aborted. No changes were made.');
    process.exit(1);
    return;
  }

  // Step 4: Update package
  console.log(`[4/7] Updating to ${targetVersion}...`);
  try {
    execSync(`npm install -g @waiaas/cli@${targetVersion}`, { stdio: 'inherit' });
  } catch {
    console.error('Package update failed.');
    console.error('Run: waiaas upgrade --rollback');
    process.exit(1);
    return;
  }

  // Step 5: Database migrations
  console.log('[5/7] Running database migrations...');
  console.log('  Migrations will run on next daemon start');

  // Step 6: Verify installation
  console.log('[6/7] Verifying installation...');
  try {
    const output = execSync('waiaas --version', { stdio: 'pipe' }).toString().trim();
    // Commander outputs the version string directly (e.g. "1.8.0")
    const installedVersion = output.replace(/^v/, '');
    if (installedVersion !== targetVersion) {
      console.warn(`  Warning: Expected ${targetVersion}, found ${installedVersion}`);
    }
  } catch {
    console.warn('  Warning: Could not verify installed version');
  }

  // Step 7: Restart daemon
  if (opts.noStart) {
    console.log('[7/7] Skipping daemon restart (--no-start)');
  } else {
    console.log('[7/7] Restarting daemon...');
    try {
      execSync('waiaas start', { stdio: 'inherit' });
    } catch {
      console.error('Failed to restart daemon. Start it manually: waiaas start');
    }
  }

  console.log(`\nUpgrade complete: ${CURRENT_VERSION} \u2192 ${targetVersion}`);
}

/**
 * Fetch the latest version from the npm registry.
 */
async function fetchLatestVersion(): Promise<string | null> {
  try {
    const res = await fetch(NPM_REGISTRY_URL, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: {
        'User-Agent': `waiaas/${CURRENT_VERSION}`,
        Accept: 'application/json',
      },
    });

    if (!res.ok) return null;

    const data = (await res.json()) as { 'dist-tags'?: { latest?: string } };
    const latest = data?.['dist-tags']?.latest;

    if (!latest || !semver.valid(latest)) return null;

    return latest;
  } catch {
    return null;
  }
}

/**
 * Stop daemon if running by reading PID file and sending SIGTERM.
 */
function stopDaemonIfRunning(dataDir: string): void {
  const pidPath = join(dataDir, 'daemon.pid');

  if (!existsSync(pidPath)) {
    console.log('  Daemon not running, skipping');
    return;
  }

  try {
    const pid = parseInt(readFileSync(pidPath, 'utf-8').trim(), 10);
    // Check if process is alive
    process.kill(pid, 0);
    // Send SIGTERM
    process.kill(pid, 'SIGTERM');
    console.log(`  Sent SIGTERM to PID ${pid}`);
  } catch {
    console.log('  Daemon not running, skipping');
  }
}
