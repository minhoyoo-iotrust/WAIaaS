/**
 * Human Wallet Apps page UI tests.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent, cleanup } from '@testing-library/preact';

const mockApiGet = vi.fn();
const mockApiPost = vi.fn();
const mockApiPut = vi.fn();
const mockApiDelete = vi.fn();

vi.mock('../api/typed-client', () => ({
  api: {
    GET: (...args: unknown[]) => mockApiGet(...args),
    POST: (...args: unknown[]) => mockApiPost(...args),
    PUT: (...args: unknown[]) => mockApiPut(...args),
    DELETE: (...args: unknown[]) => mockApiDelete(...args),
  },
  ApiError: class ApiError extends Error {
    status: number; code: string; serverMessage: string;
    constructor(status: number, code: string, msg: string) {
      super(`[${status}] ${code}: ${msg}`);
      this.name = 'ApiError'; this.status = status; this.code = code; this.serverMessage = msg;
    }
  },
}));

vi.mock('../components/toast', () => ({
  showToast: vi.fn(),
  ToastContainer: () => null,
}));

vi.mock('../auth/store', () => ({
  masterPassword: { value: 'test-pw' },
  isAuthenticated: { value: true },
  adminTimeout: { value: 900 },
  daemonShutdown: { value: false },
  login: vi.fn(),
  logout: vi.fn(),
  resetInactivityTimer: vi.fn(),
}));

vi.mock('../utils/error-messages', () => ({
  getErrorMessage: (code: string) => `Error: ${code}`,
}));

vi.mock('../components/settings-search', async () => {
  const { signal } = await import('@preact/signals');
  return {
    pendingNavigation: signal(null),
    highlightField: signal(''),
    SettingsSearch: () => null,
  };
});

vi.mock('../utils/dirty-guard', () => ({
  registerDirty: vi.fn(),
  unregisterDirty: vi.fn(),
  hasDirty: { value: false },
}));

vi.mock('../components/currency-select', () => ({
  CurrencySelect: ({ name, value, onChange }: any) => (
    <select name={name} value={value} onChange={(e: any) => onChange(e.target.value)}>
      <option value="USD">USD</option>
    </select>
  ),
}));

import { showToast } from '../components/toast';
import HumanWalletAppsPage from '../pages/human-wallet-apps';

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

const mockApps = {
  apps: [
    {
      id: 'app-1',
      name: 'dcent',
      display_name: "D'CENT Wallet",
      wallet_type: 'dcent',
      signing_enabled: true,
      alerts_enabled: true,
      sign_topic: 'waiaas-sign-dcent',
      notify_topic: 'waiaas-notify-dcent',
      subscription_token: 'tok12345678',
      push_relay_url: 'https://waiaas-push.dcentwallet.com',
      used_by: [{ id: 'w1', label: 'wallet-1' }],
      created_at: 1700000000,
      updated_at: 1700000000,
    },
    {
      id: 'app-2',
      name: 'custom',
      display_name: 'Custom Wallet',
      wallet_type: 'custom',
      signing_enabled: false,
      alerts_enabled: false,
      sign_topic: null,
      notify_topic: null,
      subscription_token: null,
      push_relay_url: null,
      used_by: [],
      created_at: 1700000100,
      updated_at: 1700000100,
    },
  ],
};

const mockSettings = {
  signing_sdk: {
    enabled: 'true',
    notifications_enabled: 'true',
  },
};

function mockApiCalls() {
  mockApiGet.mockImplementation(async (path: string) => {
    if (path === '/v1/admin/wallet-apps') return { data: mockApps };
    if (path === '/v1/admin/settings') return { data: mockSettings };
    return { data: {} };
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('HumanWalletAppsPage', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('T-HWUI-03: renders app cards after loading', async () => {
    mockApiCalls();
    render(<HumanWalletAppsPage />);
    await waitFor(() => {
      expect(screen.getByText("D'CENT Wallet")).toBeTruthy();
    });
    expect(screen.getByText('Custom Wallet')).toBeTruthy();
  });

  it('T-HWUI-06: used by wallets displayed', async () => {
    mockApiCalls();
    render(<HumanWalletAppsPage />);
    await waitFor(() => {
      expect(screen.getByText("D'CENT Wallet")).toBeTruthy();
    });
    expect(screen.getByText('wallet-1')).toBeTruthy();
    expect(screen.getByText('No wallets')).toBeTruthy();
  });

  it('T-HWUI-04: signing toggle calls PUT', async () => {
    mockApiCalls();
    mockApiPut.mockResolvedValue({ data: {} });

    render(<HumanWalletAppsPage />);
    await waitFor(() => {
      expect(screen.getByText("D'CENT Wallet")).toBeTruthy();
    });

    const checkboxes = document.querySelectorAll('input[type="checkbox"]') as NodeListOf<HTMLInputElement>;
    const signingCheckbox = checkboxes[1] as HTMLInputElement;
    expect(signingCheckbox.checked).toBe(true);

    mockApiGet.mockImplementation(async (path: string) => {
      if (path === '/v1/admin/wallet-apps') return { data: { apps: mockApps.apps.map(a => a.id === 'app-1' ? { ...a, signing_enabled: false } : a) } };
      if (path === '/v1/admin/settings') return { data: mockSettings };
      return { data: {} };
    });

    fireEvent.change(signingCheckbox);

    await waitFor(() => {
      expect(mockApiPut).toHaveBeenCalledWith(
        '/v1/admin/wallet-apps/{id}',
        expect.objectContaining({
          params: { path: { id: 'app-1' } },
          body: { signing_enabled: false },
        }),
      );
    });
  });

  it('T-HWUI-05: alerts toggle calls PUT', async () => {
    mockApiCalls();
    mockApiPut.mockResolvedValue({ data: {} });

    render(<HumanWalletAppsPage />);
    await waitFor(() => {
      expect(screen.getByText("D'CENT Wallet")).toBeTruthy();
    });

    const checkboxes = document.querySelectorAll('input[type="checkbox"]') as NodeListOf<HTMLInputElement>;
    const alertsCheckbox = checkboxes[2] as HTMLInputElement;
    expect(alertsCheckbox.checked).toBe(true);
    fireEvent.change(alertsCheckbox);

    await waitFor(() => {
      expect(mockApiPut).toHaveBeenCalledWith(
        '/v1/admin/wallet-apps/{id}',
        expect.objectContaining({
          params: { path: { id: 'app-1' } },
          body: { alerts_enabled: false },
        }),
      );
    });
  });

  it('T-HWUI-08: Register App button opens modal', async () => {
    mockApiCalls();
    render(<HumanWalletAppsPage />);
    await waitFor(() => {
      expect(screen.getByText("D'CENT Wallet")).toBeTruthy();
    });

    fireEvent.click(screen.getByText('+ Register App'));
    await waitFor(() => {
      expect(screen.getByText('Register Wallet App')).toBeTruthy();
      expect(document.querySelector('input[name="register-app-name"]')).toBeTruthy();
    });
  });

  it('T-HWUI-09: remove button calls DELETE after confirm', async () => {
    mockApiCalls();
    mockApiDelete.mockResolvedValue({ data: {} });
    vi.spyOn(globalThis, 'confirm').mockReturnValue(true);

    render(<HumanWalletAppsPage />);
    await waitFor(() => {
      expect(screen.getByText("D'CENT Wallet")).toBeTruthy();
    });

    const removeButtons = screen.getAllByText('Remove');
    fireEvent.click(removeButtons[0]!);

    await waitFor(() => {
      expect(mockApiDelete).toHaveBeenCalledWith(
        '/v1/admin/wallet-apps/{id}',
        expect.objectContaining({ params: { path: { id: 'app-1' } } }),
      );
    });

    vi.mocked(globalThis.confirm).mockRestore();
  });

  it('shows empty state when no apps registered', async () => {
    mockApiGet.mockImplementation(async (path: string) => {
      if (path === '/v1/admin/wallet-apps') return { data: { apps: [] } };
      if (path === '/v1/admin/settings') return { data: mockSettings };
      return { data: {} };
    });

    render(<HumanWalletAppsPage />);
    await waitFor(() => {
      expect(screen.getByText(/No wallet apps registered/)).toBeTruthy();
    });
  });

  it('shows loading state', () => {
    mockApiGet.mockImplementation(() => new Promise(() => { /* never resolves */ }));
    render(<HumanWalletAppsPage />);
    expect(screen.getByText('Loading...')).toBeTruthy();
  });

  it('T-HWUI-10: Push Relay URL displayed in app cards', async () => {
    mockApiCalls();
    render(<HumanWalletAppsPage />);
    await waitFor(() => {
      expect(screen.getByText("D'CENT Wallet")).toBeTruthy();
    });
    // D'CENT app has push_relay_url configured
    expect(screen.getByText('https://waiaas-push.dcentwallet.com')).toBeTruthy();
    // Custom app has no push_relay_url
    expect(screen.getByText('Not configured')).toBeTruthy();
  });

  it('T-HWUI-11: Register dialog includes Push Relay URL field', async () => {
    mockApiCalls();
    render(<HumanWalletAppsPage />);
    await waitFor(() => {
      expect(screen.getByText("D'CENT Wallet")).toBeTruthy();
    });

    fireEvent.click(screen.getByText('+ Register App'));
    await waitFor(() => {
      expect(screen.getByText('Register Wallet App')).toBeTruthy();
    });

    // Push Relay URL field should be present
    const pushRelayInput = document.querySelector('input[name="register-app-push-relay-url"]') as HTMLInputElement;
    expect(pushRelayInput).toBeTruthy();
  });

  it('T-HWUI-12: global notification toggle displays and saves via PUT', async () => {
    mockApiCalls();
    mockApiPut.mockResolvedValue({ data: {} });

    render(<HumanWalletAppsPage />);
    await waitFor(() => {
      expect(screen.getByText("D'CENT Wallet")).toBeTruthy();
    });

    expect(screen.getByText('Wallet App Notifications')).toBeTruthy();
    const notifToggle = document.querySelector('[data-testid="notif-toggle"]') as HTMLInputElement;
    expect(notifToggle).toBeTruthy();
    expect(notifToggle.checked).toBe(true);
    fireEvent.change(notifToggle);

    await waitFor(() => {
      expect(mockApiPut).toHaveBeenCalledWith(
        '/v1/admin/settings',
        expect.objectContaining({
          body: { settings: [{ key: 'signing_sdk.notifications_enabled', value: 'false' }] },
        }),
      );
    });
  });

  it('T-HWUI-13: warning banner when toggle OFF + app alerts ON', async () => {
    const settingsNotifOff = { signing_sdk: { enabled: 'true', notifications_enabled: 'false' } };
    const appsWithAlerts = {
      apps: [{
        id: 'app-1', name: 'dcent', display_name: "D'CENT Wallet", wallet_type: 'dcent',
        signing_enabled: true, alerts_enabled: true, sign_topic: null, notify_topic: null,
        subscription_token: null, push_relay_url: null, used_by: [], created_at: 1700000000, updated_at: 1700000000,
      }],
    };

    mockApiGet.mockImplementation(async (path: string) => {
      if (path === '/v1/admin/wallet-apps') return { data: appsWithAlerts };
      if (path === '/v1/admin/settings') return { data: settingsNotifOff };
      return { data: {} };
    });

    render(<HumanWalletAppsPage />);
    await waitFor(() => {
      expect(screen.getByText("D'CENT Wallet")).toBeTruthy();
    });
    expect(screen.getByText(/Notifications are disabled but some apps have alerts enabled/)).toBeTruthy();
  });

  it('T-HWUI-14: Test button visible only when alerts_enabled is true', async () => {
    mockApiCalls();
    render(<HumanWalletAppsPage />);
    await waitFor(() => {
      expect(screen.getByText("D'CENT Wallet")).toBeTruthy();
    });
    const testButtons = screen.getAllByText('Test Notify');
    expect(testButtons.length).toBe(1);
  });

  it('T-HWUI-15: Test button calls POST test-notification', async () => {
    mockApiCalls();
    mockApiPost.mockResolvedValue({ data: { success: true } });

    render(<HumanWalletAppsPage />);
    await waitFor(() => {
      expect(screen.getByText("D'CENT Wallet")).toBeTruthy();
    });

    fireEvent.click(screen.getByText('Test Notify'));

    await waitFor(() => {
      expect(mockApiPost).toHaveBeenCalledWith(
        '/v1/admin/wallet-apps/{id}/test-notification',
        expect.objectContaining({ params: { path: { id: 'app-1' } } }),
      );
    });

    expect(vi.mocked(showToast)).toHaveBeenCalledWith(
      'success',
      'Test notification sent successfully',
    );
  });

  it('T-HWUI-16: Test failure shows inline error', async () => {
    mockApiCalls();
    mockApiPost.mockResolvedValue({ data: { success: false, error: 'Signing SDK is disabled' } });

    render(<HumanWalletAppsPage />);
    await waitFor(() => {
      expect(screen.getByText("D'CENT Wallet")).toBeTruthy();
    });

    fireEvent.click(screen.getByText('Test Notify'));

    await waitFor(() => {
      expect(screen.getByText('Signing SDK is disabled')).toBeTruthy();
    });
  });

  it('T-HWUI-17: Test button disabled when subscription token missing', async () => {
    const appsNoToken = {
      apps: [{
        id: 'app-1', name: 'dcent', display_name: "D'CENT Wallet", wallet_type: 'dcent',
        signing_enabled: true, alerts_enabled: true, sign_topic: null, notify_topic: null,
        subscription_token: null, push_relay_url: 'https://waiaas-push.dcentwallet.com',
        used_by: [], created_at: 1700000000, updated_at: 1700000000,
      }],
    };
    mockApiGet.mockImplementation(async (path: string) => {
      if (path === '/v1/admin/wallet-apps') return { data: appsNoToken };
      if (path === '/v1/admin/settings') return { data: mockSettings };
      return { data: {} };
    });

    render(<HumanWalletAppsPage />);
    await waitFor(() => {
      expect(screen.getByText("D'CENT Wallet")).toBeTruthy();
    });

    const testBtn = screen.getByText('Test Notify').closest('button') as HTMLButtonElement;
    expect(testBtn.disabled).toBe(true);
  });

  it('T-HWUI-18: Test button disabled when push relay URL missing', async () => {
    const appsNoUrl = {
      apps: [{
        id: 'app-1', name: 'dcent', display_name: "D'CENT Wallet", wallet_type: 'dcent',
        signing_enabled: true, alerts_enabled: true, sign_topic: null, notify_topic: null,
        subscription_token: 'tok123', push_relay_url: null,
        used_by: [], created_at: 1700000000, updated_at: 1700000000,
      }],
    };
    mockApiGet.mockImplementation(async (path: string) => {
      if (path === '/v1/admin/wallet-apps') return { data: appsNoUrl };
      if (path === '/v1/admin/settings') return { data: mockSettings };
      return { data: {} };
    });

    render(<HumanWalletAppsPage />);
    await waitFor(() => {
      expect(screen.getByText("D'CENT Wallet")).toBeTruthy();
    });

    const testBtn = screen.getByText('Test Notify').closest('button') as HTMLButtonElement;
    expect(testBtn.disabled).toBe(true);
  });

  it('T-HWUI-23: Test Sign button visible when signing_enabled is true', async () => {
    mockApiCalls();
    render(<HumanWalletAppsPage />);
    await waitFor(() => {
      expect(screen.getByText("D'CENT Wallet")).toBeTruthy();
    });
    // app-1 has signing_enabled=true, so Test Sign should be visible
    const testSignButtons = screen.getAllByText('Test Sign');
    expect(testSignButtons.length).toBe(1);
  });

  it('T-HWUI-24: Test Sign button calls POST test-sign-request', async () => {
    mockApiCalls();
    mockApiPost.mockResolvedValue({
      data: {
        success: true,
        result: { action: 'approve', signature: '0xabc123', signerAddress: '0x1234567890abcdef', signedAt: '2026-03-24T12:00:00Z' },
      },
    });

    render(<HumanWalletAppsPage />);
    await waitFor(() => {
      expect(screen.getByText("D'CENT Wallet")).toBeTruthy();
    });

    fireEvent.click(screen.getByText('Test Sign'));

    await waitFor(() => {
      expect(mockApiPost).toHaveBeenCalledWith(
        '/v1/admin/wallet-apps/{id}/test-sign-request',
        expect.objectContaining({ params: { path: { id: 'app-1' } } }),
      );
    });

    expect(vi.mocked(showToast)).toHaveBeenCalledWith(
      'success',
      'Sign request approved',
    );
  });

  it('T-HWUI-27: Test Sign with ownerAddress sends body', async () => {
    mockApiCalls();
    mockApiPost.mockResolvedValue({
      data: {
        success: true,
        result: { action: 'approve', signature: '0xabc', signerAddress: '0x742d35Cc', signedAt: '2026-03-26T12:00:00Z' },
      },
    });

    render(<HumanWalletAppsPage />);
    await waitFor(() => {
      expect(screen.getByText("D'CENT Wallet")).toBeTruthy();
    });

    // Type owner address into the input field
    const ownerInput = document.querySelector('input[placeholder="Owner address (optional)"]') as HTMLInputElement;
    expect(ownerInput).toBeTruthy();
    fireEvent.input(ownerInput, { target: { value: '0x742d35Cc' } });

    fireEvent.click(screen.getByText('Test Sign'));

    await waitFor(() => {
      expect(mockApiPost).toHaveBeenCalledWith(
        '/v1/admin/wallet-apps/{id}/test-sign-request',
        expect.objectContaining({
          params: { path: { id: 'app-1' } },
          body: { ownerAddress: '0x742d35Cc' },
        }),
      );
    });
  });

  it('T-HWUI-25: Test Sign timeout shows error message', async () => {
    mockApiCalls();
    mockApiPost.mockResolvedValue({
      data: { success: false, timeout: true, error: 'No response within 30 seconds' },
    });

    render(<HumanWalletAppsPage />);
    await waitFor(() => {
      expect(screen.getByText("D'CENT Wallet")).toBeTruthy();
    });

    fireEvent.click(screen.getByText('Test Sign'));

    await waitFor(() => {
      expect(screen.getByText(/No response within 30 seconds/)).toBeTruthy();
    });
  });

  it('T-HWUI-26: Test Sign reject shows warning toast', async () => {
    mockApiCalls();
    mockApiPost.mockResolvedValue({
      data: {
        success: true,
        result: { action: 'reject', signerAddress: '0xabcdef1234567890', signedAt: '2026-03-24T12:00:00Z' },
      },
    });

    render(<HumanWalletAppsPage />);
    await waitFor(() => {
      expect(screen.getByText("D'CENT Wallet")).toBeTruthy();
    });

    fireEvent.click(screen.getByText('Test Sign'));

    await waitFor(() => {
      expect(vi.mocked(showToast)).toHaveBeenCalledWith(
        'warning',
        'Sign request rejected',
      );
    });
  });

  it('T-HWUI-19: Push Relay URL Edit/Clear buttons shown for configured URL', async () => {
    mockApiCalls();
    render(<HumanWalletAppsPage />);
    await waitFor(() => {
      expect(screen.getByText("D'CENT Wallet")).toBeTruthy();
    });

    // app-1 has push_relay_url configured — should show Edit and Clear buttons
    expect(screen.getByText('Edit')).toBeTruthy();
    // Multiple Clear buttons (subscription token + push relay URL) — verify at least 2 exist
    expect(screen.getAllByText('Clear').length).toBeGreaterThanOrEqual(2);
  });

  it('T-HWUI-20: Push Relay URL Set button shown for unconfigured URL', async () => {
    mockApiCalls();
    render(<HumanWalletAppsPage />);
    await waitFor(() => {
      expect(screen.getByText("D'CENT Wallet")).toBeTruthy();
    });

    // app-2 has no push_relay_url — should show "Not configured" + Set
    expect(screen.getByText('Not configured')).toBeTruthy();
  });

  it('T-HWUI-21: Push Relay URL Edit opens inline form and Save calls PUT', async () => {
    mockApiCalls();
    mockApiPut.mockResolvedValue({ data: {} });

    render(<HumanWalletAppsPage />);
    await waitFor(() => {
      expect(screen.getByText("D'CENT Wallet")).toBeTruthy();
    });

    fireEvent.click(screen.getByText('Edit'));
    await waitFor(() => {
      expect(document.querySelector('input[placeholder="https://push-relay.example.com"]')).toBeTruthy();
    });

    const urlInput = document.querySelector('input[placeholder="https://push-relay.example.com"]') as HTMLInputElement;
    fireEvent.input(urlInput, { target: { value: 'https://new-relay.example.com' } });

    fireEvent.click(screen.getByText('Save'));

    await waitFor(() => {
      expect(mockApiPut).toHaveBeenCalledWith(
        '/v1/admin/wallet-apps/{id}',
        expect.objectContaining({
          params: { path: { id: 'app-1' } },
          body: { push_relay_url: 'https://new-relay.example.com' },
        }),
      );
    });
  });

  it('T-HWUI-22: Register dialog wallet_type has datalist with dcent preset', async () => {
    mockApiCalls();
    render(<HumanWalletAppsPage />);
    await waitFor(() => {
      expect(screen.getByText("D'CENT Wallet")).toBeTruthy();
    });

    fireEvent.click(screen.getByText('+ Register App'));
    await waitFor(() => {
      expect(screen.getByText('Register Wallet App')).toBeTruthy();
    });

    const walletTypeInput = document.querySelector('input[name="register-app-wallet-type"]') as HTMLInputElement;
    expect(walletTypeInput).toBeTruthy();
    expect(walletTypeInput.getAttribute('list')).toBe('wallet-type-presets');

    const datalist = document.getElementById('wallet-type-presets');
    expect(datalist).toBeTruthy();
    expect(datalist!.querySelector('option[value="dcent"]')).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// System page: Signing SDK removal
// ---------------------------------------------------------------------------

describe('SystemPage - Signing SDK removal (T-HWUI-02)', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('T-HWUI-02: system page does NOT show Signing SDK section', async () => {
    const mockSystemSettings = {
      daemon: { log_level: 'info' },
      oracle: { cross_validation_threshold: '5' },
      display: { currency: 'USD' },
      security: { rate_limit_global_ip_rpm: '1000' },
      gas_condition: { enabled: 'true', poll_interval_sec: '30', default_timeout_sec: '3600', max_timeout_sec: '86400', max_pending_count: '100' },
    };

    mockApiGet.mockImplementation(async (path: string) => {
      if (path === '/v1/admin/settings') return { data: mockSystemSettings };
      if (path === '/v1/admin/api-keys') return { data: { keys: [] } };
      return { data: {} };
    });

    const { default: SystemPage } = await import('../pages/system');
    render(<SystemPage />);

    await waitFor(() => {
      expect(screen.getByText('Oracle')).toBeTruthy();
    });

    expect(screen.queryByText('Signing SDK')).toBeNull();
  });
});
