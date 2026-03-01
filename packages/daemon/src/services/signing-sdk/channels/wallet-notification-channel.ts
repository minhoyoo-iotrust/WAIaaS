/**
 * WalletNotificationChannel -- pushes all notification events to alert-enabled
 * wallet apps via dedicated ntfy side channel (waiaas-notify-{appName}).
 *
 * Notifications are published to each app with alerts_enabled=1 in the
 * wallet_apps table. Apps with alerts_enabled=0 are skipped. When no
 * alert-enabled apps exist, publishing is skipped entirely.
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
const FETCH_TIMEOUT_MS = 10_000;

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
   * Send notification to alert-enabled wallet app side channels.
   * - Checks signing_sdk.enabled + signing_sdk.notifications_enabled
   * - Checks notify_categories / notify_events filter
   * - Resolves alert-enabled apps from wallet_apps table
   * - Publishes NotificationMessage as base64url to ntfy for each app
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

      // Gate 3: event filter (per-event → fallback to legacy category)
      const category = EVENT_CATEGORY_MAP[eventType];
      if (!category) return;
      const eventsJson = this.settings.get('notifications.notify_events');
      if (eventsJson && eventsJson !== '[]') {
        try {
          const allowedEvents = JSON.parse(eventsJson) as string[];
          if (Array.isArray(allowedEvents) && allowedEvents.length > 0) {
            if (!allowedEvents.includes(eventType)) return;
          }
        } catch { /* invalid JSON = allow all */ }
      } else {
        const filterJson = this.settings.get('notifications.notify_categories');
        if (filterJson && filterJson !== '[]') {
          try {
            const allowedCategories = JSON.parse(filterJson) as string[];
            if (Array.isArray(allowedCategories) && allowedCategories.length > 0) {
              if (!allowedCategories.includes(category)) return;
            }
          } catch { /* invalid JSON = allow all */ }
        }
      }

      // Resolve alert-enabled apps (NOTI-01/02/03)
      const appNames = this.resolveAlertApps();
      if (appNames.length === 0) return; // NOTI-03: skip when no alert-enabled apps

      // Resolve ntfy server
      const ntfyServer = this.getNtfyServer();

      // Determine priority
      const priority = category === 'security_alert' ? 5 : 3;

      // Send to all alert-enabled apps in parallel
      await Promise.allSettled(
        appNames.map((appName) =>
          this.publishNotification(ntfyServer, appName, {
            version: '1',
            eventType,
            walletId,
            walletName: appName,
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

  /**
   * Query wallet_apps table for apps with alerts_enabled=1.
   * Returns app names for topic routing.
   */
  private resolveAlertApps(): string[] {
    const rows = this.sqlite.prepare(
      'SELECT name FROM wallet_apps WHERE alerts_enabled = 1',
    ).all() as Array<{ name: string }>;
    return rows.map((r) => r.name);
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
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      await fetch(url, {
        method: 'POST',
        body: encoded,
        signal: controller.signal,
        headers: {
          'Priority': String(priority),
          'Title': message.title,
          'Tags': `waiaas,${message.category}`,
        },
      });
    } finally {
      clearTimeout(timeoutId);
    }
  }

  private getNtfyServer(): string {
    try {
      return this.settings.get('notifications.ntfy_server') || DEFAULT_NTFY_SERVER;
    } catch {
      return DEFAULT_NTFY_SERVER;
    }
  }
}
