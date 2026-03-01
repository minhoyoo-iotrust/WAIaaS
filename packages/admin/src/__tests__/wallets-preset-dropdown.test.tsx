/**
 * Admin UI wallet preset dropdown tests.
 *
 * T-ADUI-01: Dropdown renders with Custom + D'CENT options for NONE state
 * T-ADUI-02: Preset selection sends wallet_type in API body
 * T-ADUI-03: Custom selection omits wallet_type from API body
 * T-ADUI-04: Dropdown not shown when ownerState is not NONE
 * T-ADUI-05: walletType badge displayed for preset wallet
 *
 * @see Phase 266-02 — Admin UI Dropdown
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
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

vi.mock('../components/layout', async () => {
  const { signal } = await import('@preact/signals');
  return { currentPath: signal('/wallets/test-id') };
});

vi.mock('../components/settings-search', async () => {
  const { signal } = await import('@preact/signals');
  return {
    pendingNavigation: signal(null),
    highlightField: signal(null),
    SettingsSearch: () => null,
  };
});

vi.mock('../utils/dirty-guard', () => ({
  registerDirty: vi.fn(),
  unregisterDirty: vi.fn(),
  hasDirty: { value: false },
}));

vi.mock('../utils/display-currency', () => ({
  fetchDisplayCurrency: () => Promise.resolve({ currency: 'USD', rate: 1 }),
  formatWithDisplay: (_: unknown, __: unknown, amount: string) => amount,
}));

vi.mock('../components/copy-button', () => ({
  CopyButton: ({ value: _value }: { value: string }) => <button>Copy</button>,
}));

vi.mock('../components/empty-state', () => ({
  EmptyState: ({ title, description }: { title: string; description?: string }) => (
    <div>
      <h3>{title}</h3>
      {description && <p>{description}</p>}
    </div>
  ),
}));

vi.mock('../utils/error-messages', () => ({
  getErrorMessage: (code: string) => `Error: ${code}`,
}));

import { apiGet, apiPut } from '../api/client';
import { currentPath } from '../components/layout';
import WalletsPage from '../pages/wallets';

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

const noneWallet = {
  id: 'test-id',
  name: 'test-wallet',
  chain: 'solana',
  network: 'devnet',
  environment: 'testnet',
  defaultNetwork: 'devnet',
  publicKey: 'abc123def456',
  status: 'ACTIVE',
  ownerAddress: null,
  ownerVerified: null,
  ownerState: 'NONE' as const,
  approvalMethod: null,
  walletType: null,
  suspendedAt: null,
  suspensionReason: null,
  createdAt: 1707609600,
  updatedAt: null,
};

const graceWallet = {
  ...noneWallet,
  ownerAddress: '0x1234567890abcdef1234567890abcdef12345678',
  ownerState: 'GRACE' as const,
  walletType: 'dcent',
};

const mockNetworks = {
  availableNetworks: [
    { network: 'devnet', name: 'Devnet' },
    { network: 'testnet', name: 'Testnet' },
  ],
};

function setupApiMocks(walletData: Record<string, unknown>) {
  vi.mocked(apiGet).mockImplementation(async (path: string) => {
    if (path === '/v1/wallets/test-id') return walletData;
    if (path === '/v1/wallets/test-id/networks') return mockNetworks;
    if (path === '/v1/admin/wallets/test-id/balance') return { balances: [] };
    if (path.startsWith('/v1/admin/wallets/test-id/transactions')) return { items: [], total: 0 };
    if (path === '/v1/wallets/test-id/wc/session') throw new Error('No session');
    if (path === '/v1/admin/settings') return {};
    if (path === '/v1/admin/wallets/test-id/staking') return { walletId: 'test-id', positions: [] };
    return {};
  });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function renderAndWaitForDetail() {
  render(<WalletsPage />);
  await waitFor(() => {
    expect(screen.getByText('test-wallet')).toBeTruthy();
  });
}

async function switchToOwnerTab() {
  fireEvent.click(screen.getByText('Owner'));
  await waitFor(() => {
    expect(screen.getByText('Owner Wallet')).toBeTruthy();
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Admin UI wallet preset dropdown', () => {
  beforeEach(() => {
    currentPath.value = '/wallets/test-id';
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('T-ADUI-01: dropdown renders with Custom + D\'CENT options for NONE state', async () => {
    setupApiMocks(noneWallet);
    await renderAndWaitForDetail();

    // Switch to Owner tab
    await switchToOwnerTab();

    // Click "Set Owner Address" to open editing mode
    fireEvent.click(screen.getByText('Set Owner Address'));

    // Wait for the dropdown to appear
    await waitFor(() => {
      expect(screen.getByText('Wallet Type')).toBeTruthy();
    });

    // Find the select element
    const select = screen.getByDisplayValue('Custom (manual setup)') as HTMLSelectElement;
    expect(select).toBeTruthy();
    expect(select.tagName).toBe('SELECT');

    // Check options
    const options = select.querySelectorAll('option');
    expect(options.length).toBe(2);
    expect(options[0]!.textContent).toBe('Custom (manual setup)');
    expect(options[1]!.textContent).toBe("D'CENT Wallet");
  });

  it('T-ADUI-02: preset selection sends wallet_type in API body', async () => {
    setupApiMocks(noneWallet);
    vi.mocked(apiPut).mockResolvedValue({ ...noneWallet, walletType: 'dcent', approvalMethod: 'sdk_ntfy' });
    await renderAndWaitForDetail();

    await switchToOwnerTab();

    fireEvent.click(screen.getByText('Set Owner Address'));

    await waitFor(() => {
      expect(screen.getByText('Wallet Type')).toBeTruthy();
    });

    // Select D'CENT from dropdown
    const select = screen.getByDisplayValue('Custom (manual setup)') as HTMLSelectElement;
    fireEvent.change(select, { target: { value: 'dcent' } });

    // Enter owner address
    const addressInput = screen.getByPlaceholderText('Enter owner wallet address');
    fireEvent.input(addressInput, { target: { value: '11111111111111111111111111111112' } });

    // Click Save
    fireEvent.click(screen.getByText('Save'));

    await waitFor(() => {
      expect(apiPut).toHaveBeenCalledWith(
        '/v1/wallets/test-id/owner',
        expect.objectContaining({
          owner_address: '11111111111111111111111111111112',
          wallet_type: 'dcent',
        }),
      );
    });
  });

  it('T-ADUI-03: Custom selection omits wallet_type from API body', async () => {
    setupApiMocks(noneWallet);
    vi.mocked(apiPut).mockResolvedValue({ ...noneWallet, ownerAddress: '11111111111111111111111111111112', ownerState: 'GRACE' });
    await renderAndWaitForDetail();

    await switchToOwnerTab();

    fireEvent.click(screen.getByText('Set Owner Address'));

    await waitFor(() => {
      expect(screen.getByText('Wallet Type')).toBeTruthy();
    });

    // Leave dropdown on "Custom (manual setup)" — default value

    // Enter owner address
    const addressInput = screen.getByPlaceholderText('Enter owner wallet address');
    fireEvent.input(addressInput, { target: { value: '11111111111111111111111111111112' } });

    // Click Save
    fireEvent.click(screen.getByText('Save'));

    await waitFor(() => {
      expect(apiPut).toHaveBeenCalled();
    });

    // Verify wallet_type is NOT in the body
    const callArgs = vi.mocked(apiPut).mock.calls[0]!;
    const body = callArgs[1] as Record<string, unknown>;
    expect(body.owner_address).toBe('11111111111111111111111111111112');
    expect(body).not.toHaveProperty('wallet_type');
  });

  it('T-ADUI-04: NONE-state Wallet Type dropdown not shown when editing in GRACE state', async () => {
    setupApiMocks(graceWallet);
    await renderAndWaitForDetail();

    // Switch to Owner tab
    await switchToOwnerTab();

    // GRACE state shows the edit pencil button for owner address
    const pencilBtn = screen.getByTitle('Set owner address');
    expect(pencilBtn).toBeTruthy();

    // Click the pencil edit button
    fireEvent.click(pencilBtn);

    // Wait for address input to appear
    await waitFor(() => {
      expect(screen.getByPlaceholderText('Enter owner wallet address')).toBeTruthy();
    });

    // The NONE-state full-width dropdown (with "Custom (manual setup)") should NOT appear
    // during GRACE address editing — GRACE has its own Wallet Type section instead
    expect(screen.queryByDisplayValue('Custom (manual setup)')).toBeNull();
  });

  it('T-ADUI-05: walletType badge displayed for preset wallet', async () => {
    setupApiMocks(graceWallet);
    await renderAndWaitForDetail();

    // Switch to Owner tab where the state badge + walletType badge are shown
    await switchToOwnerTab();

    // GRACE badge should be present
    expect(screen.getByText('GRACE')).toBeTruthy();

    // D'CENT Wallet should be displayed (badge + Wallet Type section)
    const dcentElements = screen.getAllByText("D'CENT Wallet");
    expect(dcentElements.length).toBeGreaterThanOrEqual(1);
  });
});
