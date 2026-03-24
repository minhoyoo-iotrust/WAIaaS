/**
 * WalletNotificationChannel -- pushes all notification events to alert-enabled
 * wallet apps via Push Relay HTTP POST side channel.
 *
 * Notifications are published to each app with alerts_enabled=1 in the
 * wallet_apps table. Apps with alerts_enabled=0 or without push_relay_url
 * are skipped. When no eligible apps exist, publishing is skipped entirely.
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
import { SIGNING_CHANNEL_FETCH_TIMEOUT_MS } from '../../../constants.js';

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
   * Send notification to alert-enabled wallet app side channels via Push Relay.
   * - Checks signing_sdk.enabled + signing_sdk.notifications_enabled
   * - Checks notify_categories / notify_events filter
   * - Resolves alert-enabled apps from wallet_apps table
   * - Publishes NotificationMessage as JSON to Push Relay POST /v1/push for each app
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

      // Gate 3: event filter (per-event -> fallback to legacy category)
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
      const apps = this.resolveAlertApps();
      if (apps.length === 0) return; // NOTI-03: skip when no alert-enabled apps

      // Send to all alert-enabled apps with push_relay_url in parallel
      await Promise.allSettled(
        apps
          .filter((app) => app.pushRelayUrl) // Skip apps without push_relay_url
          .map((app) =>
            this.publishNotification(app.pushRelayUrl!, app.subscriptionToken || app.name, {
              version: '1',
              eventType,
              walletId,
              walletName: app.name,
              category,
              title,
              body,
              details,
              timestamp: Math.floor(Date.now() / 1000),
            }),
          ),
      );
    } catch (err) {
      // DAEMON-06: never throw -- but log for diagnostics
      console.error('[WalletNotificationChannel] notify error:', err);
    }
  }

  /**
   * Query wallet_apps table for apps with alerts_enabled=1.
   * Returns app names and push_relay_url for Push Relay routing.
   */
  private resolveAlertApps(): Array<{ name: string; walletType: string; pushRelayUrl: string | null; subscriptionToken: string | null }> {
    const rows = this.sqlite.prepare(
      'SELECT name, wallet_type, push_relay_url, subscription_token FROM wallet_apps WHERE alerts_enabled = 1',
    ).all() as Array<{ name: string; wallet_type: string; push_relay_url: string | null; subscription_token: string | null }>;
    return rows.map((r) => ({ name: r.name, walletType: r.wallet_type || r.name, pushRelayUrl: r.push_relay_url, subscriptionToken: r.subscription_token }));
  }

  private async publishNotification(
    pushRelayUrl: string,
    subscriptionToken: string,
    message: NotificationMessage,
  ): Promise<void> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), SIGNING_CHANNEL_FETCH_TIMEOUT_MS);
    try {
      await fetch(`${pushRelayUrl}/v1/push`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          subscriptionToken,
          category: 'notification',
          payload: message,
        }),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeoutId);
    }
  }
}
