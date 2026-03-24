/**
 * Tests for POST /admin/wallet-apps/:id/test-notification endpoint.
 *
 * Tests cover:
 * - Gate check: SDK disabled returns error
 * - Gate check: notifications disabled returns error
 * - Gate check: app alerts disabled returns error
 * - Success: fetch called with correct URL
 * - 404: app not found
 *
 * @see packages/daemon/src/api/routes/wallet-apps.ts
 * @see internal/objectives/issues/229-wallet-app-notification-toggle-ux.md
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createWalletAppsRoutes } from '../api/routes/wallet-apps.js';
import type { WalletAppService } from '../services/signing-sdk/wallet-app-service.js';
import type { SettingsService } from '../infrastructure/settings/settings-service.js';

// ---------------------------------------------------------------------------
// Mock helpers
// ---------------------------------------------------------------------------

function mockWalletAppService(overrides: Partial<WalletAppService> = {}): WalletAppService {
  return {
    register: vi.fn(),
    ensureRegistered: vi.fn(),
    getByName: vi.fn(),
    getById: vi.fn().mockReturnValue(undefined),
    list: vi.fn().mockReturnValue([]),
    listWithUsedBy: vi.fn().mockReturnValue([]),
    getAlertEnabledApps: vi.fn().mockReturnValue([]),
    update: vi.fn(),
    remove: vi.fn(),
    ...overrides,
  } as unknown as WalletAppService;
}

function mockSettingsService(values: Record<string, string> = {}): SettingsService {
  return {
    get: vi.fn((key: string) => {
      if (key in values) return values[key];
      if (key === 'signing_sdk.enabled') return 'true';
      if (key === 'signing_sdk.notifications_enabled') return 'true';
      // push_relay_api_key no longer needed for POST /v1/push
      return '';
    }),
    set: vi.fn(),
    getAllMasked: vi.fn().mockReturnValue({}),
    setMany: vi.fn(),
    importFromConfig: vi.fn(),
  } as unknown as SettingsService;
}

const TEST_APP = {
  id: 'app-1',
  name: 'dcent',
  displayName: "D'CENT Wallet",
  signingEnabled: true,
  alertsEnabled: true,
  signTopic: null,
  notifyTopic: null,
  subscriptionToken: 'a1b2c3d4',
  pushRelayUrl: 'https://relay.example.com',
  createdAt: 1700000000,
  updatedAt: 1700000000,
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('POST /admin/wallet-apps/:id/test-notification', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, status: 200 });
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('returns error when SDK is disabled', async () => {
    const walletAppService = mockWalletAppService({
      getById: vi.fn().mockReturnValue(TEST_APP),
    });
    const settingsService = mockSettingsService({
      'signing_sdk.enabled': 'false',
    });

    const router = createWalletAppsRoutes({ walletAppService, settingsService });
    const res = await router.request('/admin/wallet-apps/app-1/test-notification', { method: 'POST' });
    const body = await res.json() as { success: boolean; error?: string };

    expect(res.status).toBe(200);
    expect(body.success).toBe(false);
    expect(body.error).toContain('Signing SDK is disabled');
  });

  it('returns error when notifications are disabled', async () => {
    const walletAppService = mockWalletAppService({
      getById: vi.fn().mockReturnValue(TEST_APP),
    });
    const settingsService = mockSettingsService({
      'signing_sdk.enabled': 'true',
      'signing_sdk.notifications_enabled': 'false',
    });

    const router = createWalletAppsRoutes({ walletAppService, settingsService });
    const res = await router.request('/admin/wallet-apps/app-1/test-notification', { method: 'POST' });
    const body = await res.json() as { success: boolean; error?: string };

    expect(res.status).toBe(200);
    expect(body.success).toBe(false);
    expect(body.error).toContain('notifications are disabled');
  });

  it('returns error when app alerts are disabled', async () => {
    const appAlertsOff = { ...TEST_APP, alertsEnabled: false };
    const walletAppService = mockWalletAppService({
      getById: vi.fn().mockReturnValue(appAlertsOff),
    });
    const settingsService = mockSettingsService();

    const router = createWalletAppsRoutes({ walletAppService, settingsService });
    const res = await router.request('/admin/wallet-apps/app-1/test-notification', { method: 'POST' });
    const body = await res.json() as { success: boolean; error?: string };

    expect(res.status).toBe(200);
    expect(body.success).toBe(false);
    expect(body.error).toContain('Alerts are disabled');
  });

  it('returns error when no device registered (subscriptionToken null)', async () => {
    const appNoDevice = { ...TEST_APP, subscriptionToken: null };
    const walletAppService = mockWalletAppService({
      getById: vi.fn().mockReturnValue(appNoDevice),
    });
    const settingsService = mockSettingsService();

    const router = createWalletAppsRoutes({ walletAppService, settingsService });
    const res = await router.request('/admin/wallet-apps/app-1/test-notification', { method: 'POST' });
    const body = await res.json() as { success: boolean; error?: string };

    expect(res.status).toBe(200);
    expect(body.success).toBe(false);
    expect(body.error).toContain('No device registered');
    // Fetch should NOT have been called
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('sends test notification via Push Relay JSON format', async () => {
    const walletAppService = mockWalletAppService({
      getById: vi.fn().mockReturnValue(TEST_APP),
    });
    const settingsService = mockSettingsService();

    const router = createWalletAppsRoutes({ walletAppService, settingsService });
    const res = await router.request('/admin/wallet-apps/app-1/test-notification', { method: 'POST' });
    const body = await res.json() as { success: boolean };

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);

    // Verify fetch was called with Push Relay JSON body
    const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
    expect(fetchMock).toHaveBeenCalledWith(
      'https://relay.example.com/v1/push',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
        }),
      }),
    );

    // Validate the JSON body matches Push Relay format
    const callArgs = fetchMock.mock.calls[0] as [string, { body: string }];
    const parsed = JSON.parse(callArgs[1].body);
    expect(parsed.subscriptionToken).toBe('a1b2c3d4');
    expect(parsed.category).toBe('notification');
    expect(parsed.payload).toMatchObject({
      version: '1',
      eventType: 'TEST',
      walletId: '',
      walletName: 'dcent',
      category: 'system',
      title: 'Test Notification',
      body: expect.stringContaining("D'CENT Wallet"),
    });
    expect(typeof parsed.payload.timestamp).toBe('number');
  });

  it('returns 404 when app not found', async () => {
    const walletAppService = mockWalletAppService({
      getById: vi.fn().mockReturnValue(undefined),
    });
    const settingsService = mockSettingsService();

    const router = createWalletAppsRoutes({ walletAppService, settingsService });
    const res = await router.request('/admin/wallet-apps/nonexistent/test-notification', { method: 'POST' });

    // WAIaaSError with WALLET_APP_NOT_FOUND should result in an error response
    // The exact status depends on errorHandler, but the error should be thrown
    expect(res.status).toBeGreaterThanOrEqual(400);
  });
});
