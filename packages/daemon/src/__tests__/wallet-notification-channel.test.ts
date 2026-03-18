/**
 * Tests for WalletNotificationChannel service.
 *
 * Tests cover:
 * 1. NOTI-01: publishes to Push Relay for alerts_enabled=1 apps with push_relay_url
 * 2. NOTI-02: skips alerts_enabled=0 apps
 * 3. NOTI-03: skips entirely when no alert-enabled apps
 * 4. DAEMON-05: security_alert uses priority 5, others use priority 3
 * 5. DAEMON-06: failure does not throw (catch isolation)
 * 6. SETTINGS-01/02: signing_sdk.enabled=false / notifications_enabled=false suppresses
 * 7. SETTINGS-03: notify_categories filters by category
 * 8. SETTINGS-04: notify_events filters by event
 * 9. Push Relay: apps without push_relay_url are skipped
 * 10. Push Relay: API key and subscription token sent correctly
 *
 * All HTTP calls mocked via globalThis.fetch -- no actual Push Relay server.
 *
 * @see packages/daemon/src/services/signing-sdk/channels/wallet-notification-channel.ts
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
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
    ['signing_sdk.push_relay_api_key', 'test-api-key'],
    ['notifications.notify_categories', '[]'],
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
  push_relay_url?: string | null;
}

function createMockSqlite(apps: MockWalletAppRow[]) {
  return {
    prepare: vi.fn((_sql: string) => ({
      all: vi.fn(() => {
        // wallet_apps WHERE alerts_enabled = 1
        return apps
          .filter((a) => a.alerts_enabled === 1)
          .map((a) => ({ name: a.name, wallet_type: a.name, push_relay_url: a.push_relay_url ?? null }));
      }),
    })),
  } as any;
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const APP_DCENT: MockWalletAppRow = { name: 'dcent', alerts_enabled: 1, push_relay_url: 'https://relay.example.com' };
const APP_CUSTOM: MockWalletAppRow = { name: 'custom-wallet', alerts_enabled: 1, push_relay_url: 'https://relay2.example.com' };
const APP_DISABLED: MockWalletAppRow = { name: 'disabled-app', alerts_enabled: 0 };
const APP_NO_URL: MockWalletAppRow = { name: 'no-url-app', alerts_enabled: 1, push_relay_url: null };

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
  // NOTI-01: publishes to Push Relay for alerts_enabled=1 apps
  // -------------------------------------------------------------------------
  describe('NOTI-01: Push Relay notification delivery', () => {
    it('publishes to Push Relay POST /v1/push with correct JSON body', async () => {
      const settings = createMockSettings();
      const sqlite = createMockSqlite([APP_DCENT]);
      const channel = new WalletNotificationChannel({ sqlite, settingsService: settings });

      await channel.notify('TX_CONFIRMED', SOME_WALLET_ID, 'Tx Confirmed', 'Your transaction was confirmed.');

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, opts] = fetchMock.mock.calls[0]!;

      // Correct Push Relay URL
      expect(url).toBe('https://relay.example.com/v1/push');
      expect(opts.method).toBe('POST');
      expect(opts.headers['Content-Type']).toBe('application/json');
      expect(opts.headers['X-Api-Key']).toBe('test-api-key');

      const body = JSON.parse(opts.body);
      expect(body.subscriptionToken).toBe('dcent');
      expect(body.category).toBe('notification');
      expect(body.payload.version).toBe('1');
      expect(body.payload.eventType).toBe('TX_CONFIRMED');
      expect(body.payload.walletId).toBe(SOME_WALLET_ID);
      expect(body.payload.walletName).toBe('dcent');
      expect(body.payload.category).toBe('transaction');
      expect(body.payload.title).toBe('Tx Confirmed');
      expect(body.payload.body).toBe('Your transaction was confirmed.');
      expect(typeof body.payload.timestamp).toBe('number');
    });

    it('publishes to multiple alert-enabled apps', async () => {
      const settings = createMockSettings();
      const sqlite = createMockSqlite([APP_DCENT, APP_CUSTOM]);
      const channel = new WalletNotificationChannel({ sqlite, settingsService: settings });

      await channel.notify('TX_CONFIRMED', SOME_WALLET_ID, 'Tx', 'Body');

      expect(fetchMock).toHaveBeenCalledTimes(2);

      const urls = fetchMock.mock.calls.map((c: any) => c[0]);
      expect(urls).toContain('https://relay.example.com/v1/push');
      expect(urls).toContain('https://relay2.example.com/v1/push');
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

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const url = fetchMock.mock.calls[0]![0];
      expect(url).toBe('https://relay.example.com/v1/push');
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
  // Apps without push_relay_url are skipped
  // -------------------------------------------------------------------------
  describe('Push Relay URL filtering', () => {
    it('skips apps without push_relay_url', async () => {
      const settings = createMockSettings();
      const sqlite = createMockSqlite([APP_DCENT, APP_NO_URL]);
      const channel = new WalletNotificationChannel({ sqlite, settingsService: settings });

      await channel.notify('TX_CONFIRMED', SOME_WALLET_ID, 'Tx', 'Body');

      // Only dcent (with URL) should be called
      expect(fetchMock).toHaveBeenCalledTimes(1);
      const url = fetchMock.mock.calls[0]![0];
      expect(url).toBe('https://relay.example.com/v1/push');
    });

    it('skips entirely when all apps lack push_relay_url', async () => {
      const settings = createMockSettings();
      const sqlite = createMockSqlite([APP_NO_URL]);
      const channel = new WalletNotificationChannel({ sqlite, settingsService: settings });

      await channel.notify('TX_CONFIRMED', SOME_WALLET_ID, 'Tx', 'Body');

      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // DAEMON-05: priority by category
  // -------------------------------------------------------------------------
  describe('DAEMON-05: priority by category', () => {
    it('uses priority 5 for security_alert events (KILL_SWITCH_ACTIVATED)', async () => {
      const settings = createMockSettings();
      const sqlite = createMockSqlite([APP_DCENT]);
      const channel = new WalletNotificationChannel({ sqlite, settingsService: settings });

      await channel.notify('KILL_SWITCH_ACTIVATED', SOME_WALLET_ID, 'Kill Switch', 'Activated!');

      const body = JSON.parse(fetchMock.mock.calls[0]![1].body);
      expect(body.payload.priority).toBe(5);
    });

    it('uses priority 3 for transaction events (TX_CONFIRMED)', async () => {
      const settings = createMockSettings();
      const sqlite = createMockSqlite([APP_DCENT]);
      const channel = new WalletNotificationChannel({ sqlite, settingsService: settings });

      await channel.notify('TX_CONFIRMED', SOME_WALLET_ID, 'Tx Confirmed', 'Body');

      const body = JSON.parse(fetchMock.mock.calls[0]![1].body);
      expect(body.payload.priority).toBe(3);
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

      await channel.notify('TX_CONFIRMED', SOME_WALLET_ID, 'Tx', 'Body');
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // Details passthrough
  // -------------------------------------------------------------------------
  describe('details passthrough', () => {
    it('includes details in the payload when provided', async () => {
      const settings = createMockSettings();
      const sqlite = createMockSqlite([APP_DCENT]);
      const channel = new WalletNotificationChannel({ sqlite, settingsService: settings });

      await channel.notify('TX_CONFIRMED', SOME_WALLET_ID, 'Tx', 'Body', {
        txId: 'abc-123',
        amount: '1.5',
      });

      const body = JSON.parse(fetchMock.mock.calls[0]![1].body);
      expect(body.payload.details).toEqual({ txId: 'abc-123', amount: '1.5' });
    });
  });

  // -------------------------------------------------------------------------
  // System events broadcast
  // -------------------------------------------------------------------------
  describe('system events broadcast to all alert-enabled apps', () => {
    it('broadcast event reaches all active wallet apps with push_relay_url', async () => {
      const settings = createMockSettings();
      const apps: MockWalletAppRow[] = [
        { name: 'app-one', alerts_enabled: 1, push_relay_url: 'https://relay1.com' },
        { name: 'app-two', alerts_enabled: 1, push_relay_url: 'https://relay2.com' },
        { name: 'app-three', alerts_enabled: 1, push_relay_url: null }, // no URL, skipped
      ];
      const sqlite = createMockSqlite(apps);
      const channel = new WalletNotificationChannel({ sqlite, settingsService: settings });

      await channel.notify('UPDATE_AVAILABLE', SOME_WALLET_ID, 'Update', 'New version available');

      // Only 2 calls (app-three has no push_relay_url)
      expect(fetchMock).toHaveBeenCalledTimes(2);

      const urls = fetchMock.mock.calls.map((c: any) => c[0]);
      expect(urls).toContain('https://relay1.com/v1/push');
      expect(urls).toContain('https://relay2.com/v1/push');
    });
  });
});
