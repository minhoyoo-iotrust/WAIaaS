/**
 * Tests for uncovered functions in human-wallet-apps.tsx, dashboard.tsx, transactions.tsx.
 *
 * Targets Functions coverage gaps identified in the coverage report.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent, cleanup } from '@testing-library/preact';

// ---------------------------------------------------------------------------
// Common mocks
// ---------------------------------------------------------------------------

const mockApiGet = vi.fn();
const mockApiPost = vi.fn();
const mockApiPut = vi.fn();
const mockApiDelete = vi.fn();
const mockApiPatch = vi.fn();

vi.mock('../api/typed-client', async () => {
  const { ApiError } = await import('../api/client');
  return {
    api: {
      GET: (...args: unknown[]) => mockApiGet(...args),
      POST: (...args: unknown[]) => mockApiPost(...args),
      PUT: (...args: unknown[]) => mockApiPut(...args),
      DELETE: (...args: unknown[]) => mockApiDelete(...args),
      PATCH: (...args: unknown[]) => mockApiPatch(...args),
    },
    ApiError,
  };
});

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

vi.mock('../utils/display-currency', () => ({
  fetchDisplayCurrency: vi.fn(() => Promise.resolve({ currency: 'USD', rate: 1 })),
  formatWithDisplay: vi.fn((amount: number | null) => amount != null ? `$${amount.toFixed(2)}` : ''),
}));

vi.mock('../components/currency-select', () => ({
  CurrencySelect: ({ name, value, onChange }: any) => (
    <select name={name} value={value} onChange={(e: any) => onChange(e.target.value)}>
      <option value="USD">USD</option>
    </select>
  ),
}));

vi.mock('../constants', () => ({
  DASHBOARD_POLL_INTERVAL_MS: 999999999,
}));

import { showToast } from '../components/toast';

// ---------------------------------------------------------------------------
// human-wallet-apps.tsx uncovered functions
// ---------------------------------------------------------------------------

describe('human-wallet-apps.tsx uncovered functions', () => {
  let HumanWalletAppsPage: any;

  const mockApps = {
    apps: [
      {
        id: 'app-1', name: 'dcent', display_name: "D'CENT Wallet", wallet_type: 'dcent',
        signing_enabled: true, alerts_enabled: true, sign_topic: 'waiaas-sign-dcent',
        notify_topic: 'waiaas-notify-dcent', subscription_token: 'tok12345678',
        push_relay_url: 'https://waiaas-push.dcentwallet.com',
        used_by: [{ id: 'w1', label: 'wallet-1' }], created_at: 1700000000, updated_at: 1700000000,
      },
      {
        id: 'app-2', name: 'custom', display_name: 'Custom Wallet', wallet_type: '',
        signing_enabled: false, alerts_enabled: false, sign_topic: null,
        notify_topic: null, subscription_token: null, push_relay_url: null,
        used_by: [], created_at: 1700000100, updated_at: 1700000100,
      },
    ],
  };

  const mockSettings = {
    signing_sdk: { enabled: 'true', notifications_enabled: 'true' },
  };

  function mockApiCalls() {
    mockApiGet.mockImplementation(async (path: string) => {
      if (path === '/v1/admin/wallet-apps') return { data: mockApps };
      if (path === '/v1/admin/settings') return { data: mockSettings };
      return { data: {} };
    });
  }

  beforeEach(async () => {
    HumanWalletAppsPage = (await import('../pages/human-wallet-apps')).default;
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('handleRegister: submits register form', async () => {
    mockApiCalls();
    mockApiPost.mockResolvedValue({ data: {} });

    render(<HumanWalletAppsPage />);
    await waitFor(() => {
      expect(screen.getByText("D'CENT Wallet")).toBeTruthy();
    });

    // Open register modal
    fireEvent.click(screen.getByText('+ Register App'));
    await waitFor(() => {
      expect(screen.getByText('Register Wallet App')).toBeTruthy();
    });

    // Fill form fields via FormField (onChange handler)
    const nameInput = document.querySelector('input[name="register-app-name"]') as HTMLInputElement;
    fireEvent.input(nameInput, { target: { value: 'new-app' } });

    const displayInput = document.querySelector('input[name="register-app-display-name"]') as HTMLInputElement;
    fireEvent.input(displayInput, { target: { value: 'New App' } });

    // The Register button is inside the modal body (not modal-footer)
    const registerBtn = screen.getByText('Register');
    fireEvent.click(registerBtn);

    await waitFor(() => {
      expect(mockApiPost).toHaveBeenCalledWith(
        '/v1/admin/wallet-apps',
        expect.objectContaining({
          body: expect.objectContaining({ name: 'new-app', display_name: 'New App' }),
        }),
      );
      expect(vi.mocked(showToast)).toHaveBeenCalledWith('Wallet app registered', 'success');
    });
  });

  it('handleRegister: validates required fields', async () => {
    mockApiCalls();

    render(<HumanWalletAppsPage />);
    await waitFor(() => {
      expect(screen.getByText("D'CENT Wallet")).toBeTruthy();
    });

    fireEvent.click(screen.getByText('+ Register App'));
    await waitFor(() => {
      expect(screen.getByText('Register Wallet App')).toBeTruthy();
    });

    // The Register button is disabled when fields are empty
    // But let's test with only name (no display name)
    const nameInput = document.querySelector('input[name="register-app-name"]') as HTMLInputElement;
    fireEvent.input(nameInput, { target: { value: 'test' } });

    // Register button should still be disabled since display name is empty
    const registerBtn = screen.getByText('Register') as HTMLButtonElement;
    expect(registerBtn.disabled).toBe(true);
  });

  it('handleSetSubToken: clears existing subscription token', async () => {
    mockApiCalls();
    mockApiPut.mockResolvedValue({ data: {} });

    render(<HumanWalletAppsPage />);
    await waitFor(() => {
      expect(screen.getByText("D'CENT Wallet")).toBeTruthy();
    });

    // app-1 has subscription_token set, should show Clear button
    const clearButtons = screen.getAllByText('Clear');
    fireEvent.click(clearButtons[0]!);

    await waitFor(() => {
      expect(mockApiPut).toHaveBeenCalledWith(
        '/v1/admin/wallet-apps/{id}',
        expect.objectContaining({
          params: { path: { id: 'app-1' } },
          body: { subscription_token: '' },
        }),
      );
      expect(vi.mocked(showToast)).toHaveBeenCalledWith('Subscription token cleared', 'success');
    });
  });

  it('handleSetSubToken: sets new token via edit mode', async () => {
    // Use app-2 which has no subscription_token
    mockApiCalls();
    mockApiPut.mockResolvedValue({ data: {} });

    render(<HumanWalletAppsPage />);
    await waitFor(() => {
      expect(screen.getByText('Custom Wallet')).toBeTruthy();
    });

    // app-2 has no token, should show "Not set" with "Set" button
    // Find all Set buttons — subscription token Set buttons appear before push relay URL Set buttons
    const setButtons = screen.getAllByText('Set');
    // First "Set" is app-2's subscription token (app-1 has token already)
    fireEvent.click(setButtons[0]!);

    // Should enter edit mode with input
    await waitFor(() => {
      expect(document.querySelector('input[placeholder="e.g., a1b2c3d4"]')).toBeTruthy();
    });

    const tokenInput = document.querySelector('input[placeholder="e.g., a1b2c3d4"]') as HTMLInputElement;
    fireEvent.input(tokenInput, { target: { value: 'newtoken123' } });

    // Click the Set button in edit mode (first one is the subscription token edit Set)
    const editSetBtns = screen.getAllByText('Set');
    fireEvent.click(editSetBtns[0]!);

    await waitFor(() => {
      expect(mockApiPut).toHaveBeenCalledWith(
        '/v1/admin/wallet-apps/{id}',
        expect.objectContaining({
          body: expect.objectContaining({ subscription_token: 'newtoken123' }),
        }),
      );
    });
  });

  it('handleRemove: cancelled by user does not call DELETE', async () => {
    mockApiCalls();
    vi.spyOn(globalThis, 'confirm').mockReturnValue(false);

    render(<HumanWalletAppsPage />);
    await waitFor(() => {
      expect(screen.getByText("D'CENT Wallet")).toBeTruthy();
    });

    const removeButtons = screen.getAllByText('Remove');
    fireEvent.click(removeButtons[0]!);

    expect(mockApiDelete).not.toHaveBeenCalled();
    vi.mocked(globalThis.confirm).mockRestore();
  });

  it('handleNotifToggle error shows toast', async () => {
    mockApiCalls();
    mockApiPut.mockRejectedValueOnce(new Error('Network'));

    render(<HumanWalletAppsPage />);
    await waitFor(() => {
      expect(screen.getByText("D'CENT Wallet")).toBeTruthy();
    });

    const notifToggle = document.querySelector('[data-testid="notif-toggle"]') as HTMLInputElement;
    fireEvent.change(notifToggle);

    await waitFor(() => {
      expect(vi.mocked(showToast)).toHaveBeenCalledWith('Failed to update notification setting', 'error');
    });
  });

  it('handleTestNotification error shows inline error', async () => {
    mockApiCalls();
    mockApiPost.mockRejectedValueOnce(new Error('Network'));

    render(<HumanWalletAppsPage />);
    await waitFor(() => {
      expect(screen.getByText("D'CENT Wallet")).toBeTruthy();
    });

    fireEvent.click(screen.getByText('Test'));

    await waitFor(() => {
      expect(screen.getByText('Failed to send test notification')).toBeTruthy();
    });
  });
});

// ---------------------------------------------------------------------------
// dashboard.tsx uncovered functions
// ---------------------------------------------------------------------------

describe('dashboard.tsx uncovered functions', () => {
  let DashboardPage: any;

  const mockStatus = {
    version: '1.0.0',
    latestVersion: '1.0.1',
    updateAvailable: false,
    autoProvisioned: false,
    uptime: 3600,
    walletsCount: 2,
    sessionsCount: 1,
    pendingTransactions: 0,
    recentTransactions: [],
    network: 'solana-mainnet',
    nodeVersion: 'v22.0.0',
    schemaVersion: 59,
  };

  const mockStats = {
    transactions: {
      total: 10, byStatus: { CONFIRMED: 8 }, byType: { TRANSFER: 10 },
      last24h: { count: 3, totalUsd: 150 }, last7d: { count: 10, totalUsd: 500 },
    },
    sessions: { active: 1, total: 5, revokedLast24h: 0 },
    wallets: { total: 2, byStatus: { ACTIVE: 2 }, withOwner: 1 },
    rpc: { totalCalls: 100, totalErrors: 2, avgLatencyMs: 50, byNetwork: [] },
    autostop: { enabled: false, triggeredTotal: 0, rules: [], lastTriggeredAt: null },
    notifications: { sentLast24h: 5, failedLast24h: 0, channelStatus: {} },
    system: { uptimeSeconds: 3600, version: '1.0.0', schemaVersion: 59, dbSizeBytes: 1024, nodeVersion: 'v22' },
  };

  function mockDashboardApiCalls(statusOverride?: Record<string, unknown>) {
    mockApiGet.mockImplementation(async (path: string, opts?: any) => {
      if (path === '/v1/admin/status') return { data: { ...mockStatus, ...statusOverride } };
      if (path === '/v1/admin/stats') return { data: mockStats };
      // Let defi fail silently so defiData stays null (avoids worstHealthFactor rendering issues)
      if (path === '/v1/admin/defi/positions') throw new Error('skip');
      if (path === '/v1/admin/transactions') return { data: { items: [], total: 0, offset: 0, limit: 20 } };
      if (path === '/v1/wallets') return { data: { items: [] } };
      if (path === '/v1/admin/agent-prompt') return { data: { prompt: '' } };
      return { data: {} };
    });
  }

  beforeEach(async () => {
    DashboardPage = (await import('../pages/dashboard')).default;
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('renders autoProvisioned banner when autoProvisioned is true', async () => {
    mockDashboardApiCalls({ autoProvisioned: true });

    render(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByText(/Auto-provision mode active/)).toBeTruthy();
      expect(screen.getByText('Go to Security')).toBeTruthy();
    });
  });

  it('renders updateAvailable banner when update is available', async () => {
    mockDashboardApiCalls({ updateAvailable: true, latestVersion: '2.0.0' });

    render(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByText(/Update available/)).toBeTruthy();
    });
  });

  it('does not render banners when neither update nor autoProvisioned', async () => {
    mockDashboardApiCalls();

    render(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByText('1.0.0')).toBeTruthy();
    });

    expect(screen.queryByText(/Auto-provision mode active/)).toBeNull();
    expect(screen.queryByText(/Update available/)).toBeNull();
  });

  it('handles fetchStatus error gracefully (sets error state)', async () => {
    const MockApiError = (await import('../api/client')).ApiError;
    mockApiGet.mockImplementation(async (path: string) => {
      if (path === '/v1/admin/status') throw new MockApiError(500, 'FETCH_FAIL', 'Failed');
      if (path === '/v1/admin/stats') return { data: mockStats };
      if (path === '/v1/admin/defi/positions') throw new Error('skip');
      if (path === '/v1/admin/transactions') return { data: { items: [], total: 0, offset: 0, limit: 20 } };
      if (path === '/v1/wallets') return { data: { items: [] } };
      return { data: {} };
    });

    render(<DashboardPage />);

    // Dashboard shows error message in the UI (dashboard-error div)
    await waitFor(() => {
      expect(document.querySelector('.dashboard-error')).toBeTruthy();
    });
  });
});

// ---------------------------------------------------------------------------
// transactions.tsx uncovered functions
// ---------------------------------------------------------------------------

describe('transactions.tsx uncovered functions', () => {
  let TransactionsPage: any;

  const mockTxSettings = {
    incoming: {
      enabled: 'true',
      poll_interval: '30',
      retention_days: '90',
      suspicious_dust_usd: '0.01',
      suspicious_amount_multiplier: '10',
      cooldown_minutes: '5',
      wss_url: '',
    },
  };

  const mockOutgoingTxs = {
    items: [
      {
        id: 'tx-1', type: 'TRANSFER', status: 'CONFIRMED', chain: 'solana',
        request: { type: 'TRANSFER', to: 'abc123', amount: '1000000000', network: 'solana-mainnet' },
        walletId: 'w1', walletName: 'test-wallet', network: 'solana-mainnet',
        txHash: 'hash1', amount: '1.0', amountUsd: 10, contractName: null,
        createdAt: 1700000000, updatedAt: 1700000000,
      },
    ],
    total: 1, offset: 0, limit: 20,
  };

  const mockIncomingTxs = {
    items: [
      {
        id: 'itx-1', walletId: 'w1', walletName: 'test-wallet',
        chain: 'solana', network: 'solana-mainnet',
        txHash: 'inhash1', from: 'sender1', to: 'receiver1',
        amount: '2.5', amountUsd: 25, tokenSymbol: 'SOL',
        type: 'native', suspicious: false, flags: [],
        detectedAt: 1700000100,
      },
    ],
    total: 1, offset: 0, limit: 20,
  };

  const mockWallets = {
    items: [
      { id: 'w1', name: 'test-wallet', chain: 'solana', network: 'solana-mainnet', publicKey: 'abc', status: 'ACTIVE' },
    ],
  };

  function mockTxApiCalls() {
    mockApiGet.mockImplementation(async (path: string) => {
      if (path === '/v1/admin/settings') return { data: mockTxSettings };
      if (path === '/v1/admin/transactions') return { data: mockOutgoingTxs };
      if (path === '/v1/admin/incoming-transactions') return { data: mockIncomingTxs };
      if (path === '/v1/wallets') return { data: mockWallets };
      return { data: {} };
    });
  }

  beforeEach(async () => {
    TransactionsPage = (await import('../pages/transactions')).default;
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('renders transaction page with tabs', async () => {
    mockTxApiCalls();

    render(<TransactionsPage />);

    // Wait for data to load
    await waitFor(() => {
      // "History" appears in breadcrumb + tab
      const historyElements = screen.queryAllByText('History');
      expect(historyElements.length).toBeGreaterThanOrEqual(1);
    });
    expect(screen.getByText('Monitor Settings')).toBeTruthy();
  });

  it('switches to Monitor Settings tab and renders incoming monitoring fields', async () => {
    mockTxApiCalls();

    render(<TransactionsPage />);

    await waitFor(() => {
      expect(screen.getByText('Monitor Settings')).toBeTruthy();
    });

    // Click Monitor Settings tab
    fireEvent.click(screen.getByText('Monitor Settings'));

    await waitFor(() => {
      expect(screen.getByText('Incoming TX Monitoring Settings')).toBeTruthy();
    });

    // Verify settings fields are rendered
    expect(document.querySelector('[name="incoming.enabled"]')).toBeTruthy();
    expect(document.querySelector('[name="incoming.poll_interval"]')).toBeTruthy();
    expect(document.querySelector('[name="incoming.retention_days"]')).toBeTruthy();
  });

  it('Monitor Settings tab: field change shows save bar', async () => {
    mockTxApiCalls();

    render(<TransactionsPage />);

    await waitFor(() => {
      expect(screen.getByText('Monitor Settings')).toBeTruthy();
    });

    fireEvent.click(screen.getByText('Monitor Settings'));

    await waitFor(() => {
      expect(document.querySelector('[name="incoming.enabled"]')).toBeTruthy();
    });

    const enabledSelect = document.querySelector('select[name="incoming.enabled"]') as HTMLSelectElement;
    fireEvent.change(enabledSelect, { target: { value: 'false' } });

    await waitFor(() => {
      expect(screen.getByText(/unsaved change/)).toBeTruthy();
    });
  });

  it('Monitor Settings tab: save calls PUT', async () => {
    mockTxApiCalls();
    mockApiPut.mockResolvedValueOnce({ data: { updated: 1, settings: mockTxSettings } });

    render(<TransactionsPage />);

    await waitFor(() => {
      expect(screen.getByText('Monitor Settings')).toBeTruthy();
    });

    fireEvent.click(screen.getByText('Monitor Settings'));

    await waitFor(() => {
      expect(document.querySelector('[name="incoming.enabled"]')).toBeTruthy();
    });

    const enabledSelect = document.querySelector('select[name="incoming.enabled"]') as HTMLSelectElement;
    fireEvent.change(enabledSelect, { target: { value: 'false' } });

    await waitFor(() => {
      expect(screen.getByText('Save')).toBeTruthy();
    });

    fireEvent.click(screen.getByText('Save'));

    await waitFor(() => {
      expect(mockApiPut).toHaveBeenCalled();
    });
  });

  it('Monitor Settings tab: discard clears dirty state', async () => {
    mockTxApiCalls();

    render(<TransactionsPage />);

    await waitFor(() => {
      expect(screen.getByText('Monitor Settings')).toBeTruthy();
    });

    fireEvent.click(screen.getByText('Monitor Settings'));

    await waitFor(() => {
      expect(document.querySelector('[name="incoming.enabled"]')).toBeTruthy();
    });

    const enabledSelect = document.querySelector('select[name="incoming.enabled"]') as HTMLSelectElement;
    fireEvent.change(enabledSelect, { target: { value: 'false' } });

    await waitFor(() => {
      expect(screen.getByText('Discard')).toBeTruthy();
    });

    fireEvent.click(screen.getByText('Discard'));

    await waitFor(() => {
      expect(screen.queryByText(/unsaved change/)).toBeNull();
    });
  });

  it('handles fetch error by setting error state', async () => {
    const MockApiError = (await import('../api/client')).ApiError;
    mockApiGet.mockImplementation(async (path: string) => {
      if (path === '/v1/admin/settings') return { data: mockTxSettings };
      if (path === '/v1/admin/transactions') throw new MockApiError(500, 'TX_FAIL', 'Failed');
      if (path === '/v1/admin/incoming-transactions') return { data: { items: [], total: 0, offset: 0, limit: 20 } };
      if (path === '/v1/wallets') return { data: mockWallets };
      return { data: {} };
    });

    render(<TransactionsPage />);

    // Transactions page shows inline error message
    await waitFor(() => {
      const container = document.querySelector('.page') || document.body;
      // Error shows as text in the page
      expect(container.textContent).toContain('Error');
    });
  });
});
