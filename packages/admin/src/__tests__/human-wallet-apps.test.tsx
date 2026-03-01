/**
 * Human Wallet Apps page UI tests.
 *
 * Tests cover:
 * - T-HWUI-01: Sidebar shows Human Wallet Apps menu
 * - T-HWUI-02: System page has no Signing SDK section
 * - T-HWUI-03: Page renders app cards
 * - T-HWUI-04: Signing toggle calls PUT
 * - T-HWUI-05: Alerts toggle calls PUT
 * - T-HWUI-06: Used by wallets displayed
 * - T-HWUI-07: ntfy server URL displayed
 * - T-HWUI-08: Register App button opens modal
 * - T-HWUI-09: Remove button calls DELETE
 *
 * @see packages/admin/src/pages/human-wallet-apps.tsx
 * @see internal/objectives/m29-07-dcent-owner-signing.md
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent, cleanup } from '@testing-library/preact';

vi.mock('../api/client', () => ({
  apiGet: vi.fn(),
  apiPost: vi.fn(),
  apiPut: vi.fn(),
  apiDelete: vi.fn(),
  ApiError: class ApiError extends Error {
    status: number;
    code: string;
    serverMessage: string;
    constructor(status: number, code: string, msg: string) {
      super(`[${status}] ${code}: ${msg}`);
      this.name = 'ApiError';
      this.status = status;
      this.code = code;
      this.serverMessage = msg;
    }
  },
  apiCall: vi.fn(),
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

import { apiGet, apiPost, apiPut, apiDelete } from '../api/client';
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
      signing_enabled: true,
      alerts_enabled: true,
      used_by: [{ id: 'w1', label: 'wallet-1' }],
      created_at: 1700000000,
      updated_at: 1700000000,
    },
    {
      id: 'app-2',
      name: 'custom',
      display_name: 'Custom Wallet',
      signing_enabled: false,
      alerts_enabled: true,
      used_by: [],
      created_at: 1700000100,
      updated_at: 1700000100,
    },
  ],
};

const mockSettings = {
  'signing_sdk.ntfy_server': {
    value: 'https://ntfy.sh',
    default_value: 'https://ntfy.sh',
    source: 'default',
  },
};

function mockApiCalls() {
  vi.mocked(apiGet).mockImplementation(async (path: string) => {
    if (path === '/v1/admin/wallet-apps') return mockApps;
    if (path === '/v1/admin/settings') return mockSettings;
    return {};
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

    // wallet-1 should be visible as a link in the dcent card
    expect(screen.getByText('wallet-1')).toBeTruthy();
    // Custom Wallet has no wallets — "No wallets" text
    expect(screen.getByText('No wallets')).toBeTruthy();
  });

  it('T-HWUI-07: ntfy server URL displayed', async () => {
    mockApiCalls();
    render(<HumanWalletAppsPage />);

    await waitFor(() => {
      expect(screen.getByText("D'CENT Wallet")).toBeTruthy();
    });

    const input = document.querySelector('input[name="ntfy-server-url"]') as HTMLInputElement;
    expect(input).toBeTruthy();
    expect(input.value).toBe('https://ntfy.sh');
  });

  it('T-HWUI-04: signing toggle calls PUT', async () => {
    mockApiCalls();
    vi.mocked(apiPut).mockResolvedValue({});
    // After toggle, re-fetch returns updated data
    const updatedApps = {
      apps: mockApps.apps.map((a) =>
        a.id === 'app-1' ? { ...a, signing_enabled: false } : a,
      ),
    };

    render(<HumanWalletAppsPage />);

    await waitFor(() => {
      expect(screen.getByText("D'CENT Wallet")).toBeTruthy();
    });

    // Find all Signing checkboxes — the first one belongs to D'CENT
    const checkboxes = document.querySelectorAll('input[type="checkbox"]') as NodeListOf<HTMLInputElement>;
    // D'CENT card has 2 checkboxes (signing, alerts), Custom has 2 — total 4
    // First checkbox is D'CENT signing
    const signingCheckbox = checkboxes[0] as HTMLInputElement;
    expect(signingCheckbox.checked).toBe(true);

    // Mock the re-fetch after toggle
    vi.mocked(apiGet).mockImplementation(async (path: string) => {
      if (path === '/v1/admin/wallet-apps') return updatedApps;
      if (path === '/v1/admin/settings') return mockSettings;
      return {};
    });

    fireEvent.change(signingCheckbox);

    await waitFor(() => {
      expect(vi.mocked(apiPut)).toHaveBeenCalledWith(
        '/v1/admin/wallet-apps/app-1',
        { signing_enabled: false },
      );
    });
  });

  it('T-HWUI-05: alerts toggle calls PUT', async () => {
    mockApiCalls();
    vi.mocked(apiPut).mockResolvedValue({});

    render(<HumanWalletAppsPage />);

    await waitFor(() => {
      expect(screen.getByText("D'CENT Wallet")).toBeTruthy();
    });

    // Second checkbox is D'CENT alerts
    const checkboxes = document.querySelectorAll('input[type="checkbox"]') as NodeListOf<HTMLInputElement>;
    const alertsCheckbox = checkboxes[1] as HTMLInputElement;
    expect(alertsCheckbox.checked).toBe(true);

    fireEvent.change(alertsCheckbox);

    await waitFor(() => {
      expect(vi.mocked(apiPut)).toHaveBeenCalledWith(
        '/v1/admin/wallet-apps/app-1',
        { alerts_enabled: false },
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
      // Modal should contain name and display name fields
      expect(document.querySelector('input[name="register-app-name"]')).toBeTruthy();
      expect(document.querySelector('input[name="register-app-display-name"]')).toBeTruthy();
    });
  });

  it('T-HWUI-09: remove button calls DELETE after confirm', async () => {
    mockApiCalls();
    vi.mocked(apiDelete).mockResolvedValue({});
    // Mock window.confirm to return true
    vi.spyOn(globalThis, 'confirm').mockReturnValue(true);

    render(<HumanWalletAppsPage />);

    await waitFor(() => {
      expect(screen.getByText("D'CENT Wallet")).toBeTruthy();
    });

    // Find Remove buttons — 2 apps = 2 Remove buttons
    const removeButtons = screen.getAllByText('Remove');
    // Click first Remove (D'CENT)
    fireEvent.click(removeButtons[0]!);

    await waitFor(() => {
      expect(vi.mocked(apiDelete)).toHaveBeenCalledWith('/v1/admin/wallet-apps/app-1');
    });

    vi.mocked(globalThis.confirm).mockRestore();
  });

  it('shows empty state when no apps registered', async () => {
    vi.mocked(apiGet).mockImplementation(async (path: string) => {
      if (path === '/v1/admin/wallet-apps') return { apps: [] };
      if (path === '/v1/admin/settings') return mockSettings;
      return {};
    });

    render(<HumanWalletAppsPage />);

    await waitFor(() => {
      expect(screen.getByText(/No wallet apps registered/)).toBeTruthy();
    });
  });

  it('shows loading state', () => {
    vi.mocked(apiGet).mockImplementation(() => new Promise(() => {}));
    render(<HumanWalletAppsPage />);

    expect(screen.getByText('Loading...')).toBeTruthy();
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
      gas_condition: {
        enabled: 'true',
        poll_interval_sec: '30',
        default_timeout_sec: '3600',
        max_timeout_sec: '86400',
        max_pending_count: '100',
      },
    };

    vi.mocked(apiGet).mockImplementation(async (path: string) => {
      if (path === '/v1/admin/settings') return mockSystemSettings;
      if (path === '/v1/admin/api-keys') return { keys: [] };
      return {};
    });

    // Dynamic import to avoid hoisting issues
    const { default: SystemPage } = await import('../pages/system');
    render(<SystemPage />);

    await waitFor(() => {
      expect(screen.getByText('Oracle')).toBeTruthy();
    });

    // Signing SDK section should NOT appear
    expect(screen.queryByText('Signing SDK')).toBeNull();
  });
});
