/**
 * Tests for WalletNotificationChannel service.
 *
 * Tests cover:
 * 1. DAEMON-01: publishes NotificationMessage to waiaas-notify-{walletName} ntfy topic
 * 2. DAEMON-03: skips wallets where owner_approval_method != 'sdk_ntfy'
 * 3. DAEMON-04: non-UUID walletId broadcasts to ALL sdk_ntfy wallets
 * 4. DAEMON-05: security_alert -> priority 5, others -> priority 3
 * 5. DAEMON-06: failure does not throw (catch isolation)
 * 6. SETTINGS-01/02: signing_sdk.enabled=false / notifications_enabled=false suppresses
 * 7. SETTINGS-03: notify_categories filters by category
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
// Mock SQLite (in-memory stub)
// ---------------------------------------------------------------------------

interface MockWalletRow {
  id: string;
  name: string;
  owner_approval_method: string | null;
  status: string;
}

function createMockSqlite(wallets: MockWalletRow[]) {
  return {
    prepare: vi.fn((_sql: string) => ({
      get: vi.fn((walletId: string) => {
        return wallets.find((w) => w.id === walletId) ?? undefined;
      }),
      all: vi.fn(() => {
        // For broadcast query: return sdk_ntfy + ACTIVE wallets
        return wallets.filter(
          (w) => w.owner_approval_method === 'sdk_ntfy' && w.status === 'ACTIVE',
        );
      }),
    })),
  } as any;
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const SDK_NTFY_WALLET_1 = {
  id: '01935a3b-7c8d-7e00-b123-456789abcdef',
  name: 'my-wallet',
  owner_approval_method: 'sdk_ntfy',
  status: 'ACTIVE',
};

const SDK_NTFY_WALLET_2 = {
  id: '01935a3b-8888-7e00-b123-000000000002',
  name: 'second-wallet',
  owner_approval_method: 'sdk_ntfy',
  status: 'ACTIVE',
};

const TELEGRAM_BOT_WALLET = {
  id: '01935a3b-9999-7e00-b123-000000000003',
  name: 'tg-wallet',
  owner_approval_method: 'telegram_bot',
  status: 'ACTIVE',
};

const WC_WALLET = {
  id: '01935a3b-aaaa-7e00-b123-000000000004',
  name: 'wc-wallet',
  owner_approval_method: 'walletconnect',
  status: 'ACTIVE',
};

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
  // DAEMON-01: publishes NotificationMessage to waiaas-notify-{walletName}
  // -------------------------------------------------------------------------
  describe('DAEMON-01: ntfy topic & NotificationMessage format', () => {
    it('publishes to waiaas-notify-{walletName} with base64url body matching NotificationMessageSchema', async () => {
      const settings = createMockSettings();
      const sqlite = createMockSqlite([SDK_NTFY_WALLET_1]);
      const channel = new WalletNotificationChannel({ sqlite, settingsService: settings });

      await channel.notify('TX_CONFIRMED', SDK_NTFY_WALLET_1.id, 'Tx Confirmed', 'Your transaction was confirmed.');

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, opts] = fetchMock.mock.calls[0]!;

      // Correct topic URL
      expect(url).toBe('https://ntfy.sh/waiaas-notify-my-wallet');

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
      expect(parsed.walletId).toBe(SDK_NTFY_WALLET_1.id);
      expect(parsed.walletName).toBe('my-wallet');
      expect(parsed.category).toBe('transaction');
      expect(parsed.title).toBe('Tx Confirmed');
      expect(parsed.body).toBe('Your transaction was confirmed.');
      expect(typeof parsed.timestamp).toBe('number');
    });
  });

  // -------------------------------------------------------------------------
  // DAEMON-03: skips wallets where owner_approval_method != 'sdk_ntfy'
  // -------------------------------------------------------------------------
  describe('DAEMON-03: approval method filtering', () => {
    it('does not call fetch for wallets with telegram_bot approval method', async () => {
      const settings = createMockSettings();
      const sqlite = createMockSqlite([SDK_NTFY_WALLET_1, TELEGRAM_BOT_WALLET]);
      const channel = new WalletNotificationChannel({ sqlite, settingsService: settings });

      await channel.notify('TX_CONFIRMED', TELEGRAM_BOT_WALLET.id, 'Tx', 'Body');

      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // DAEMON-04: non-UUID walletId broadcasts to ALL sdk_ntfy wallets
  // -------------------------------------------------------------------------
  describe('DAEMON-04: broadcast on non-UUID walletId', () => {
    it('sends to all sdk_ntfy wallets when walletId is "system"', async () => {
      const settings = createMockSettings();
      const sqlite = createMockSqlite([SDK_NTFY_WALLET_1, SDK_NTFY_WALLET_2, WC_WALLET]);
      const channel = new WalletNotificationChannel({ sqlite, settingsService: settings });

      await channel.notify('KILL_SWITCH_ACTIVATED', 'system', 'Kill Switch', 'Activated!');

      // Should call fetch for 2 sdk_ntfy wallets (not wc_wallet)
      expect(fetchMock).toHaveBeenCalledTimes(2);

      // Verify each call has the correct wallet-specific topic and walletId
      const calls = fetchMock.mock.calls;
      const urls = calls.map((c: any) => c[0]);
      expect(urls).toContain('https://ntfy.sh/waiaas-notify-my-wallet');
      expect(urls).toContain('https://ntfy.sh/waiaas-notify-second-wallet');

      // Verify each message has the real wallet UUID as walletId (not 'system')
      for (const call of calls) {
        const decoded = JSON.parse(Buffer.from(call[1].body, 'base64url').toString('utf-8'));
        expect(decoded.walletId).not.toBe('system');
        expect([SDK_NTFY_WALLET_1.id, SDK_NTFY_WALLET_2.id]).toContain(decoded.walletId);
      }
    });
  });

  // -------------------------------------------------------------------------
  // DAEMON-05: security_alert -> priority 5, others -> priority 3
  // -------------------------------------------------------------------------
  describe('DAEMON-05: priority by category', () => {
    it('uses priority 5 for security_alert events (KILL_SWITCH_ACTIVATED)', async () => {
      const settings = createMockSettings();
      const sqlite = createMockSqlite([SDK_NTFY_WALLET_1]);
      const channel = new WalletNotificationChannel({ sqlite, settingsService: settings });

      await channel.notify('KILL_SWITCH_ACTIVATED', SDK_NTFY_WALLET_1.id, 'Kill Switch', 'Activated!');

      const headers = fetchMock.mock.calls[0]![1].headers;
      expect(headers.Priority).toBe('5');
    });

    it('uses priority 3 for transaction events (TX_CONFIRMED)', async () => {
      const settings = createMockSettings();
      const sqlite = createMockSqlite([SDK_NTFY_WALLET_1]);
      const channel = new WalletNotificationChannel({ sqlite, settingsService: settings });

      await channel.notify('TX_CONFIRMED', SDK_NTFY_WALLET_1.id, 'Tx Confirmed', 'Body');

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
      const sqlite = createMockSqlite([SDK_NTFY_WALLET_1]);
      const channel = new WalletNotificationChannel({ sqlite, settingsService: settings });

      // Should resolve without throwing
      await expect(
        channel.notify('TX_CONFIRMED', SDK_NTFY_WALLET_1.id, 'Tx', 'Body'),
      ).resolves.toBeUndefined();
    });
  });

  // -------------------------------------------------------------------------
  // SETTINGS-01/02: signing_sdk.enabled & notifications_enabled gating
  // -------------------------------------------------------------------------
  describe('SETTINGS-01/02: setting gates', () => {
    it('does not call fetch when signing_sdk.enabled=false', async () => {
      const settings = createMockSettings({ 'signing_sdk.enabled': 'false' });
      const sqlite = createMockSqlite([SDK_NTFY_WALLET_1]);
      const channel = new WalletNotificationChannel({ sqlite, settingsService: settings });

      await channel.notify('TX_CONFIRMED', SDK_NTFY_WALLET_1.id, 'Tx', 'Body');
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('does not call fetch when signing_sdk.notifications_enabled=false', async () => {
      const settings = createMockSettings({ 'signing_sdk.notifications_enabled': 'false' });
      const sqlite = createMockSqlite([SDK_NTFY_WALLET_1]);
      const channel = new WalletNotificationChannel({ sqlite, settingsService: settings });

      await channel.notify('TX_CONFIRMED', SDK_NTFY_WALLET_1.id, 'Tx', 'Body');
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
      const sqlite = createMockSqlite([SDK_NTFY_WALLET_1]);
      const channel = new WalletNotificationChannel({ sqlite, settingsService: settings });

      await channel.notify('TX_CONFIRMED', SDK_NTFY_WALLET_1.id, 'Tx', 'Body');
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('filters out security_alert events when notify_categories=["transaction"]', async () => {
      const settings = createMockSettings({
        'notifications.notify_categories': '["transaction"]',
      });
      const sqlite = createMockSqlite([SDK_NTFY_WALLET_1]);
      const channel = new WalletNotificationChannel({ sqlite, settingsService: settings });

      await channel.notify('KILL_SWITCH_ACTIVATED', SDK_NTFY_WALLET_1.id, 'Kill', 'Body');
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('allows all events when notify_categories=[] (empty array)', async () => {
      const settings = createMockSettings({
        'notifications.notify_categories': '[]',
      });
      const sqlite = createMockSqlite([SDK_NTFY_WALLET_1]);
      const channel = new WalletNotificationChannel({ sqlite, settingsService: settings });

      await channel.notify('TX_CONFIRMED', SDK_NTFY_WALLET_1.id, 'Tx', 'Body');
      await channel.notify('KILL_SWITCH_ACTIVATED', SDK_NTFY_WALLET_1.id, 'Kill', 'Body');
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });
  });

  // -------------------------------------------------------------------------
  // Details passthrough
  // -------------------------------------------------------------------------
  describe('details passthrough', () => {
    it('includes details in the NotificationMessage when provided', async () => {
      const settings = createMockSettings();
      const sqlite = createMockSqlite([SDK_NTFY_WALLET_1]);
      const channel = new WalletNotificationChannel({ sqlite, settingsService: settings });

      await channel.notify('TX_CONFIRMED', SDK_NTFY_WALLET_1.id, 'Tx', 'Body', {
        txId: 'abc-123',
        amount: '1.5',
      });

      const decoded = JSON.parse(
        Buffer.from(fetchMock.mock.calls[0]![1].body, 'base64url').toString('utf-8'),
      );
      expect(decoded.details).toEqual({ txId: 'abc-123', amount: '1.5' });
    });
  });
});
