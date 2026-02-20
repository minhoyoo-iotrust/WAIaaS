/**
 * WalletNotificationChannel -- pushes all notification events to sdk_ntfy wallets
 * via dedicated ntfy side channel (waiaas-notify-{walletName}).
 *
 * Independent from existing NotificationService channels[]. Runs in parallel,
 * isolated by try/catch to never affect existing channel delivery.
 *
 * @see packages/core/src/schemas/signing-protocol.ts (NotificationMessage)
 */

import type { NotificationEventType } from '@waiaas/core';
import {
  EVENT_CATEGORY_MAP,
  type NotificationMessage,
} from '@waiaas/core';
import type { SettingsService } from '../../../infrastructure/settings/settings-service.js';
import type Database from 'better-sqlite3';

const DEFAULT_NTFY_SERVER = 'https://ntfy.sh';
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface WalletNotificationChannelDeps {
  sqlite: Database.Database;
  settingsService: SettingsService;
}

export class WalletNotificationChannel {
  private readonly sqlite: Database.Database;
  private readonly settings: SettingsService;

  constructor(deps: WalletNotificationChannelDeps) {
    this.sqlite = deps.sqlite;
    this.settings = deps.settingsService;
  }

  /**
   * Send notification to wallet side channel.
   * - Checks signing_sdk.enabled + signing_sdk.notifications_enabled
   * - Checks notify_categories filter
   * - Resolves target wallets (single or broadcast for non-UUID walletId)
   * - Publishes NotificationMessage as base64url to ntfy
   *
   * NEVER throws -- all errors are caught and logged.
   */
  async notify(
    eventType: NotificationEventType,
    walletId: string,
    title: string,
    body: string,
    details?: Record<string, unknown>,
  ): Promise<void> {
    try {
      // Gate 1: signing_sdk.enabled
      if (this.settings.get('signing_sdk.enabled') !== 'true') return;
      // Gate 2: signing_sdk.notifications_enabled
      if (this.settings.get('signing_sdk.notifications_enabled') !== 'true') return;

      // Gate 3: category filter
      const category = EVENT_CATEGORY_MAP[eventType];
      if (!category) return;
      const filterJson = this.settings.get('signing_sdk.notify_categories');
      if (filterJson && filterJson !== '[]') {
        try {
          const allowedCategories = JSON.parse(filterJson) as string[];
          if (Array.isArray(allowedCategories) && allowedCategories.length > 0) {
            if (!allowedCategories.includes(category)) return;
          }
        } catch { /* invalid JSON = allow all */ }
      }

      // Resolve target wallets
      const targets = this.resolveTargetWallets(walletId);
      if (targets.length === 0) return;

      // Resolve ntfy server
      const ntfyServer = this.getNtfyServer();

      // Determine priority
      const priority = category === 'security_alert' ? 5 : 3;

      // Send to all targets in parallel
      await Promise.allSettled(
        targets.map((t) =>
          this.publishNotification(ntfyServer, t.walletName, {
            version: '1',
            eventType,
            walletId: t.walletId,
            walletName: t.walletName,
            category,
            title,
            body,
            details,
            timestamp: Math.floor(Date.now() / 1000),
          }, priority),
        ),
      );
    } catch {
      // DAEMON-06: never throw
    }
  }

  private resolveTargetWallets(walletId: string): Array<{ walletId: string; walletName: string }> {
    if (UUID_REGEX.test(walletId)) {
      // Single wallet -- check if sdk_ntfy
      const row = this.sqlite.prepare(
        'SELECT id, name, owner_approval_method FROM wallets WHERE id = ?',
      ).get(walletId) as { id: string; name: string; owner_approval_method: string | null } | undefined;
      if (!row || row.owner_approval_method !== 'sdk_ntfy') return [];
      return [{ walletId: row.id, walletName: row.name }];
    }

    // Non-UUID (system, empty, etc.) -- broadcast to all sdk_ntfy wallets
    const rows = this.sqlite.prepare(
      "SELECT id, name FROM wallets WHERE owner_approval_method = 'sdk_ntfy' AND status = 'ACTIVE'",
    ).all() as Array<{ id: string; name: string }>;
    return rows.map((r) => ({ walletId: r.id, walletName: r.name }));
  }

  private async publishNotification(
    ntfyServer: string,
    walletName: string,
    message: NotificationMessage,
    priority: number,
  ): Promise<void> {
    const topic = `waiaas-notify-${walletName}`;
    const json = JSON.stringify(message);
    const encoded = Buffer.from(json, 'utf-8').toString('base64url');

    const url = `${ntfyServer}/${topic}`;
    await fetch(url, {
      method: 'POST',
      body: encoded,
      headers: {
        'Priority': String(priority),
        'Title': message.title,
        'Tags': `waiaas,${message.category}`,
      },
    });
  }

  private getNtfyServer(): string {
    try {
      return this.settings.get('notifications.ntfy_server') || DEFAULT_NTFY_SERVER;
    } catch {
      return DEFAULT_NTFY_SERVER;
    }
  }
}
