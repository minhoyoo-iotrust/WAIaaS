/**
 * VersionCheckService - checks npm registry for latest @waiaas/cli version.
 *
 * Stores results in key_value_store for consumption by Health API and CLI.
 * All errors are caught and logged (fail-soft: never blocks daemon startup).
 *
 * Keys stored:
 *   - version_check_latest: latest version string from npm
 *   - version_check_checked_at: Unix seconds of last successful check
 *   - version_check_notified_version: version string for which UPDATE_AVAILABLE was sent
 */

import { createRequire } from 'node:module';
import type { Database } from 'better-sqlite3';
import semver from 'semver';
import type { NotificationService } from '../../notifications/notification-service.js';

const require = createRequire(import.meta.url);
const { version: CURRENT_VERSION } = require('../../../package.json') as { version: string };

const NPM_REGISTRY_URL = 'https://registry.npmjs.org/@waiaas/cli';
const FETCH_TIMEOUT_MS = 5000;

export class VersionCheckService {
  private notificationService: NotificationService | null = null;

  constructor(private readonly sqlite: Database) {}

  /**
   * Set the NotificationService for sending UPDATE_AVAILABLE alerts.
   */
  setNotificationService(service: NotificationService): void {
    this.notificationService = service;
  }

  /**
   * Fetch latest version from npm registry and store in key_value_store.
   *
   * @returns { latest, current } - latest is null if check failed
   */
  async check(): Promise<{ latest: string | null; current: string }> {
    try {
      const response = await fetch(NPM_REGISTRY_URL, {
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        headers: {
          'User-Agent': `waiaas/${CURRENT_VERSION}`,
          Accept: 'application/json',
        },
      });

      if (!response.ok) {
        console.warn(`VersionCheck: registry returned ${response.status}`);
        return { latest: null, current: CURRENT_VERSION };
      }

      const data = (await response.json()) as { 'dist-tags'?: { latest?: string } };
      const latest = data?.['dist-tags']?.latest;

      if (!latest || !semver.valid(latest)) {
        console.warn('VersionCheck: invalid version from registry');
        return { latest: null, current: CURRENT_VERSION };
      }

      // Store in key_value_store
      const now = Math.floor(Date.now() / 1000);
      const upsert = this.sqlite.prepare(
        'INSERT OR REPLACE INTO key_value_store (key, value, updated_at) VALUES (?, ?, ?)',
      );

      upsert.run('version_check_latest', latest, now);
      upsert.run('version_check_checked_at', String(now), now);

      if (semver.gt(latest, CURRENT_VERSION)) {
        console.log(`VersionCheck: update available ${CURRENT_VERSION} -> ${latest}`);
        await this.sendUpdateNotification(latest);
      }

      return { latest, current: CURRENT_VERSION };
    } catch (err) {
      console.warn('VersionCheck: check failed:', (err as Error).message ?? err);
      return { latest: null, current: CURRENT_VERSION };
    }
  }

  /**
   * Get the latest known version from key_value_store.
   * Returns null if no check has been performed yet.
   */
  getLatest(): string | null {
    try {
      const row = this.sqlite
        .prepare("SELECT value FROM key_value_store WHERE key = 'version_check_latest'")
        .get() as { value: string } | undefined;
      return row?.value ?? null;
    } catch {
      return null;
    }
  }

  /**
   * Get the timestamp of the last successful version check.
   * Returns null if no check has been performed yet.
   */
  getCheckedAt(): number | null {
    try {
      const row = this.sqlite
        .prepare("SELECT value FROM key_value_store WHERE key = 'version_check_checked_at'")
        .get() as { value: string } | undefined;
      return row ? Number(row.value) : null;
    } catch {
      return null;
    }
  }

  /**
   * Send UPDATE_AVAILABLE notification once per version.
   * Uses key_value_store key 'version_check_notified_version' for dedup.
   */
  private async sendUpdateNotification(latestVersion: string): Promise<void> {
    if (!this.notificationService) return;

    try {
      // Check if we already notified for this version
      const row = this.sqlite
        .prepare("SELECT value FROM key_value_store WHERE key = 'version_check_notified_version'")
        .get() as { value: string } | undefined;

      if (row?.value === latestVersion) return;

      // Send notification (walletId is empty for system-level notifications)
      await this.notificationService.notify('UPDATE_AVAILABLE', '', {
        latestVersion,
        currentVersion: CURRENT_VERSION,
      });

      // Record notified version
      const now = Math.floor(Date.now() / 1000);
      this.sqlite
        .prepare('INSERT OR REPLACE INTO key_value_store (key, value, updated_at) VALUES (?, ?, ?)')
        .run('version_check_notified_version', latestVersion, now);
    } catch (err) {
      console.warn('VersionCheck: failed to send update notification:', (err as Error).message ?? err);
    }
  }
}
