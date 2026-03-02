/**
 * Tests for WalletNotificationChannel service.
 *
 * Tests cover:
 * 1. NOTI-01: publishes to waiaas-notify-{appName} for alerts_enabled=1 apps
 * 2. NOTI-02: skips alerts_enabled=0 apps
 * 3. NOTI-03: skips entirely when no alert-enabled apps
 * 4. DAEMON-05: security_alert -> priority 5, others -> priority 3
 * 5. DAEMON-06: failure does not throw (catch isolation)
 * 6. SETTINGS-01/02: signing_sdk.enabled=false / notifications_enabled=false suppresses
 * 7. SETTINGS-03: notify_categories filters by category
 * 8. SETTINGS-04: notify_events filters by event
 * 9. CHAN-02: notify_topic from wallet_apps DB used for ntfy publish URL
 * 10. CHAN-05: system events reach all active wallet apps
 *
 * All HTTP calls mocked via globalThis.fetch -- no actual ntfy server.
 *
 * @see packages/daemon/src/services/signing-sdk/channels/wallet-notification-channel.ts
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { NotificationMessageSchema } from '@waiaas/core';
import { WalletNotificationChannel } from '../services/signing-sdk/channels/wallet-notification-channel.js';

// ---------------------------------------------------------------------------
// Mock fetch
// ---------------------------------------------------------------------------

let fetchMock: ReturnType<typeof vi.fn>;

// ---------------------------------------------------------------------------
// Mock SettingsService (Map-based)
// ---------------------------------------------------------------------------

function createMockSettings(overrides: Record<string, string> = {}) {
  const map = new Map<string, string>([
    ['signing_sdk.enabled', 'true'],
    ['signing_sdk.notifications_enabled', 'true'],
    ['notifications.notify_categories', '[]'],
    ['notifications.ntfy_server', 'https://ntfy.sh'],
  ]);
  for (const [k, v] of Object.entries(overrides)) {
    map.set(k, v);
  }
  return {
    get: vi.fn((key: string) => map.get(key) ?? ''),
  } as any;
}

// ---------------------------------------------------------------------------
// Mock SQLite (in-memory stub) -- app-based
// ---------------------------------------------------------------------------

interface MockWalletAppRow {
  name: string;
  alerts_enabled: number;
  notify_topic?: string | null;
}

function createMockSqlite(apps: MockWalletAppRow[]) {
  return {
    prepare: vi.fn((_sql: string) => ({
      all: vi.fn(() => {
        // wallet_apps WHERE alerts_enabled = 1
        return apps
          .filter((a) => a.alerts_enabled === 1)
          .map((a) => ({ name: a.name, notify_topic: a.notify_topic ?? null }));
      }),
    })),
  } as any;
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const APP_DCENT: MockWalletAppRow = { name: 'dcent', alerts_enabled: 1 };
const APP_CUSTOM: MockWalletAppRow = { name: 'custom-wallet', alerts_enabled: 1 };
const APP_DISABLED: MockWalletAppRow = { name: 'disabled-app', alerts_enabled: 0 };

// Arbitrary walletId for tests (doesn't affect routing now)
const SOME_WALLET_ID = '01935a3b-7c8d-7e00-b123-456789abcdef';

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('WalletNotificationChannel', () => {
  beforeEach(() => {
    fetchMock = vi.fn().mockResolvedValue({ ok: true });
    globalThis.fetch = fetchMock;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // -------------------------------------------------------------------------
  // NOTI-01: publishes to waiaas-notify-{appName} for alerts_enabled=1 apps
  // -------------------------------------------------------------------------
  describe('NOTI-01: app-based topic routing', () => {
    it('publishes to waiaas-notify-{appName} with base64url body matching NotificationMessageSchema', async () => {
      const settings = createMockSettings();
      const sqlite = createMockSqlite([APP_DCENT]);
      const channel = new WalletNotificationChannel({ sqlite, settingsService: settings });

      await channel.notify('TX_CONFIRMED', SOME_WALLET_ID, 'Tx Confirmed', 'Your transaction was confirmed.');

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, opts] = fetchMock.mock.calls[0]!;

      // Correct topic URL -- uses app name, not wallet name
      expect(url).toBe('https://ntfy.sh/waiaas-notify-dcent');

      // Body is base64url-encoded
      expect(opts.method).toBe('POST');
      const decoded = Buffer.from(opts.body, 'base64url').toString('utf-8');
      const parsed = JSON.parse(decoded);

      // Validate against NotificationMessageSchema
      const result = NotificationMessageSchema.safeParse(parsed);
      expect(result.success).toBe(true);

      // Check key fields
      expect(parsed.version).toBe('1');
      expect(parsed.eventType).toBe('TX_CONFIRMED');
      expect(parsed.walletId).toBe(SOME_WALLET_ID);
      expect(parsed.walletName).toBe('dcent');
      expect(parsed.category).toBe('transaction');
      expect(parsed.title).toBe('Tx Confirmed');
      expect(parsed.body).toBe('Your transaction was confirmed.');
      expect(typeof parsed.timestamp).toBe('number');
    });

    it('publishes to multiple alert-enabled apps', async () => {
      const settings = createMockSettings();
      const sqlite = createMockSqlite([APP_DCENT, APP_CUSTOM]);
      const channel = new WalletNotificationChannel({ sqlite, settingsService: settings });

      await channel.notify('TX_CONFIRMED', SOME_WALLET_ID, 'Tx', 'Body');

      expect(fetchMock).toHaveBeenCalledTimes(2);

      const urls = fetchMock.mock.calls.map((c: any) => c[0]);
      expect(urls).toContain('https://ntfy.sh/waiaas-notify-dcent');
      expect(urls).toContain('https://ntfy.sh/waiaas-notify-custom-wallet');
    });
  });

  // -------------------------------------------------------------------------
  // NOTI-02: does not publish to alerts_enabled=0 apps
  // -------------------------------------------------------------------------
  describe('NOTI-02: alerts_enabled=0 filtering', () => {
    it('does not publish to alerts_enabled=0 apps', async () => {
      const settings = createMockSettings();
      const sqlite = createMockSqlite([APP_DCENT, APP_DISABLED]);
      const channel = new WalletNotificationChannel({ sqlite, settingsService: settings });

      await channel.notify('TX_CONFIRMED', SOME_WALLET_ID, 'Tx', 'Body');

      // Only 1 call (dcent), not disabled-app
      expect(fetchMock).toHaveBeenCalledTimes(1);
      const url = fetchMock.mock.calls[0]![0];
      expect(url).toBe('https://ntfy.sh/waiaas-notify-dcent');
      expect(url).not.toContain('disabled-app');
    });
  });

  // -------------------------------------------------------------------------
  // NOTI-03: skips entirely when no alert-enabled apps
  // -------------------------------------------------------------------------
  describe('NOTI-03: skip when no alert-enabled apps', () => {
    it('skips when only alerts_enabled=0 apps exist', async () => {
      const settings = createMockSettings();
      const sqlite = createMockSqlite([APP_DISABLED]);
      const channel = new WalletNotificationChannel({ sqlite, settingsService: settings });

      await channel.notify('TX_CONFIRMED', SOME_WALLET_ID, 'Tx', 'Body');

      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('skips when wallet_apps table is empty', async () => {
      const settings = createMockSettings();
      const sqlite = createMockSqlite([]);
      const channel = new WalletNotificationChannel({ sqlite, settingsService: settings });

      await channel.notify('TX_CONFIRMED', SOME_WALLET_ID, 'Tx', 'Body');

      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // DAEMON-05: security_alert -> priority 5, others -> priority 3
  // -------------------------------------------------------------------------
  describe('DAEMON-05: priority by category', () => {
    it('uses priority 5 for security_alert events (KILL_SWITCH_ACTIVATED)', async () => {
      const settings = createMockSettings();
      const sqlite = createMockSqlite([APP_DCENT]);
      const channel = new WalletNotificationChannel({ sqlite, settingsService: settings });

      await channel.notify('KILL_SWITCH_ACTIVATED', SOME_WALLET_ID, 'Kill Switch', 'Activated!');

      const headers = fetchMock.mock.calls[0]![1].headers;
      expect(headers.Priority).toBe('5');
    });

    it('uses priority 3 for transaction events (TX_CONFIRMED)', async () => {
      const settings = createMockSettings();
      const sqlite = createMockSqlite([APP_DCENT]);
      const channel = new WalletNotificationChannel({ sqlite, settingsService: settings });

      await channel.notify('TX_CONFIRMED', SOME_WALLET_ID, 'Tx Confirmed', 'Body');

      const headers = fetchMock.mock.calls[0]![1].headers;
      expect(headers.Priority).toBe('3');
    });
  });

  // -------------------------------------------------------------------------
  // DAEMON-06: failure does not throw
  // -------------------------------------------------------------------------
  describe('DAEMON-06: error isolation', () => {
    it('resolves without throwing when fetch rejects', async () => {
      fetchMock.mockRejectedValue(new Error('network error'));
      const settings = createMockSettings();
      const sqlite = createMockSqlite([APP_DCENT]);
      const channel = new WalletNotificationChannel({ sqlite, settingsService: settings });

      // Should resolve without throwing
      await expect(
        channel.notify('TX_CONFIRMED', SOME_WALLET_ID, 'Tx', 'Body'),
      ).resolves.toBeUndefined();
    });
  });

  // -------------------------------------------------------------------------
  // SETTINGS-01/02: signing_sdk.enabled & notifications_enabled gating
  // -------------------------------------------------------------------------
  describe('SETTINGS-01/02: setting gates', () => {
    it('does not call fetch when signing_sdk.enabled=false', async () => {
      const settings = createMockSettings({ 'signing_sdk.enabled': 'false' });
      const sqlite = createMockSqlite([APP_DCENT]);
      const channel = new WalletNotificationChannel({ sqlite, settingsService: settings });

      await channel.notify('TX_CONFIRMED', SOME_WALLET_ID, 'Tx', 'Body');
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('does not call fetch when signing_sdk.notifications_enabled=false', async () => {
      const settings = createMockSettings({ 'signing_sdk.notifications_enabled': 'false' });
      const sqlite = createMockSqlite([APP_DCENT]);
      const channel = new WalletNotificationChannel({ sqlite, settingsService: settings });

      await channel.notify('TX_CONFIRMED', SOME_WALLET_ID, 'Tx', 'Body');
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // SETTINGS-03: notify_categories filters by category
  // -------------------------------------------------------------------------
  describe('SETTINGS-03: category filtering', () => {
    it('allows transaction events when notify_categories=["transaction"]', async () => {
      const settings = createMockSettings({
        'notifications.notify_categories': '["transaction"]',
      });
      const sqlite = createMockSqlite([APP_DCENT]);
      const channel = new WalletNotificationChannel({ sqlite, settingsService: settings });

      await channel.notify('TX_CONFIRMED', SOME_WALLET_ID, 'Tx', 'Body');
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('filters out security_alert events when notify_categories=["transaction"]', async () => {
      const settings = createMockSettings({
        'notifications.notify_categories': '["transaction"]',
      });
      const sqlite = createMockSqlite([APP_DCENT]);
      const channel = new WalletNotificationChannel({ sqlite, settingsService: settings });

      await channel.notify('KILL_SWITCH_ACTIVATED', SOME_WALLET_ID, 'Kill', 'Body');
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('allows all events when notify_categories=[] (empty array)', async () => {
      const settings = createMockSettings({
        'notifications.notify_categories': '[]',
      });
      const sqlite = createMockSqlite([APP_DCENT]);
      const channel = new WalletNotificationChannel({ sqlite, settingsService: settings });

      await channel.notify('TX_CONFIRMED', SOME_WALLET_ID, 'Tx', 'Body');
      await channel.notify('KILL_SWITCH_ACTIVATED', SOME_WALLET_ID, 'Kill', 'Body');
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });
  });

  // -------------------------------------------------------------------------
  // SETTINGS-04: notify_events filters by event
  // -------------------------------------------------------------------------
  describe('SETTINGS-04: per-event filtering', () => {
    it('allows specific events when notify_events is set', async () => {
      const settings = createMockSettings({
        'notifications.notify_events': '["TX_CONFIRMED"]',
      });
      const sqlite = createMockSqlite([APP_DCENT]);
      const channel = new WalletNotificationChannel({ sqlite, settingsService: settings });

      await channel.notify('TX_CONFIRMED', SOME_WALLET_ID, 'Tx', 'Body');
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('filters out events not in notify_events', async () => {
      const settings = createMockSettings({
        'notifications.notify_events': '["TX_CONFIRMED"]',
      });
      const sqlite = createMockSqlite([APP_DCENT]);
      const channel = new WalletNotificationChannel({ sqlite, settingsService: settings });

      await channel.notify('TX_FAILED', SOME_WALLET_ID, 'Tx', 'Body');
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('prefers notify_events over notify_categories', async () => {
      const settings = createMockSettings({
        'notifications.notify_events': '["TX_CONFIRMED"]',
        'notifications.notify_categories': '["policy"]',
      });
      const sqlite = createMockSqlite([APP_DCENT]);
      const channel = new WalletNotificationChannel({ sqlite, settingsService: settings });

      // TX_CONFIRMED is in notify_events, should be allowed even though category is "transaction" not "policy"
      await channel.notify('TX_CONFIRMED', SOME_WALLET_ID, 'Tx', 'Body');
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('falls back to notify_categories when notify_events is empty', async () => {
      const settings = createMockSettings({
        'notifications.notify_events': '[]',
        'notifications.notify_categories': '["policy"]',
      });
      const sqlite = createMockSqlite([APP_DCENT]);
      const channel = new WalletNotificationChannel({ sqlite, settingsService: settings });

      // TX_CONFIRMED category=transaction, not in notify_categories=["policy"]
      await channel.notify('TX_CONFIRMED', SOME_WALLET_ID, 'Tx', 'Body');
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // Details passthrough
  // -------------------------------------------------------------------------
  describe('details passthrough', () => {
    it('includes details in the NotificationMessage when provided', async () => {
      const settings = createMockSettings();
      const sqlite = createMockSqlite([APP_DCENT]);
      const channel = new WalletNotificationChannel({ sqlite, settingsService: settings });

      await channel.notify('TX_CONFIRMED', SOME_WALLET_ID, 'Tx', 'Body', {
        txId: 'abc-123',
        amount: '1.5',
      });

      const decoded = JSON.parse(
        Buffer.from(fetchMock.mock.calls[0]![1].body, 'base64url').toString('utf-8'),
      );
      expect(decoded.details).toEqual({ txId: 'abc-123', amount: '1.5' });
    });
  });

  // -------------------------------------------------------------------------
  // CHAN-02: notify_topic from wallet_apps DB used for ntfy publish URL
  // -------------------------------------------------------------------------
  describe('CHAN-02: DB-based notify_topic routing', () => {
    it('T-CHAN-02a: uses custom notify_topic from DB for ntfy publish URL', async () => {
      const settings = createMockSettings();
      const appWithCustomTopic: MockWalletAppRow = {
        name: 'dcent',
        alerts_enabled: 1,
        notify_topic: 'my-custom-notify-topic',
      };
      const sqlite = createMockSqlite([appWithCustomTopic]);
      const channel = new WalletNotificationChannel({ sqlite, settingsService: settings });

      await channel.notify('TX_CONFIRMED', SOME_WALLET_ID, 'Tx', 'Body');

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const url = fetchMock.mock.calls[0]![0];
      expect(url).toBe('https://ntfy.sh/my-custom-notify-topic');
    });

    it('T-CHAN-02b: NULL notify_topic falls back to waiaas-notify-{appName}', async () => {
      const settings = createMockSettings();
      const appWithNullTopic: MockWalletAppRow = {
        name: 'dcent',
        alerts_enabled: 1,
        notify_topic: null,
      };
      const sqlite = createMockSqlite([appWithNullTopic]);
      const channel = new WalletNotificationChannel({ sqlite, settingsService: settings });

      await channel.notify('TX_CONFIRMED', SOME_WALLET_ID, 'Tx', 'Body');

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const url = fetchMock.mock.calls[0]![0];
      expect(url).toBe('https://ntfy.sh/waiaas-notify-dcent');
    });
  });

  // -------------------------------------------------------------------------
  // CHAN-05: system events reach all active wallet apps
  // -------------------------------------------------------------------------
  describe('CHAN-05: system events broadcast to all alert-enabled apps', () => {
    it('T-CHAN-05: broadcast event reaches all active wallet apps with correct topics', async () => {
      const settings = createMockSettings();
      const apps: MockWalletAppRow[] = [
        { name: 'app-one', alerts_enabled: 1, notify_topic: 'custom-topic-one' },
        { name: 'app-two', alerts_enabled: 1, notify_topic: 'custom-topic-two' },
        { name: 'app-three', alerts_enabled: 1, notify_topic: null },
      ];
      const sqlite = createMockSqlite(apps);
      const channel = new WalletNotificationChannel({ sqlite, settingsService: settings });

      await channel.notify('UPDATE_AVAILABLE', SOME_WALLET_ID, 'Update', 'New version available');

      // One fetch call per alert-enabled app
      expect(fetchMock).toHaveBeenCalledTimes(3);

      const urls = fetchMock.mock.calls.map((c: any) => c[0]);
      expect(urls).toContain('https://ntfy.sh/custom-topic-one');
      expect(urls).toContain('https://ntfy.sh/custom-topic-two');
      expect(urls).toContain('https://ntfy.sh/waiaas-notify-app-three'); // NULL fallback
    });
  });
});
