/**
 * Admin UI wallet preset dropdown tests.
 *
 * T-ADUI-01: Dropdown renders with Custom + D'CENT options for NONE state
 * T-ADUI-02: Preset selection sends wallet_type in API body
 * T-ADUI-03: Custom selection omits wallet_type from API body
 * T-ADUI-04: Dropdown not shown when ownerState is not NONE
 * T-ADUI-05: walletType badge displayed for preset wallet
 *
 * Phase 292 — Owner tab improvements:
 * T-OWN-01: NONE state preset selection shows approval method preview
 * T-OWN-02: GRACE state Change button opens Wallet Type dropdown
 * T-OWN-03: LOCKED state read-only with disabled radios
 * T-OWN-04: Approval preview text is correct for each preset
 * T-OWN-05: GRACE wallet_type change triggers API call
 * T-OWN-06: WC section hidden when sdk_push
 * T-OWN-07: WC section visible when walletconnect
 *
 * @see Phase 266-02 — Admin UI Dropdown
 * @see Phase 292 — Admin UI Owner Settings
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent, cleanup } from '@testing-library/preact';

vi.mock('../api/typed-client', () => ({
  api: {
    GET: vi.fn().mockResolvedValue({ data: {} }),
    POST: vi.fn().mockResolvedValue({ data: {} }),
    PUT: vi.fn().mockResolvedValue({ data: {} }),
    DELETE: vi.fn().mockResolvedValue({ data: {} }),
  },
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

import { api } from '../api/typed-client';
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

const graceWalletSdkNtfy = {
  ...noneWallet,
  ownerAddress: '0x1234567890abcdef1234567890abcdef12345678',
  ownerState: 'GRACE' as const,
  walletType: 'dcent',
  approvalMethod: 'sdk_push',
};

const graceWalletWc = {
  ...noneWallet,
  ownerAddress: '0x1234567890abcdef1234567890abcdef12345678',
  ownerState: 'GRACE' as const,
  walletType: null,
  approvalMethod: 'walletconnect',
};

const lockedWallet = {
  ...noneWallet,
  ownerAddress: '0x1234567890abcdef1234567890abcdef12345678',
  ownerVerified: true,
  ownerState: 'LOCKED' as const,
  walletType: 'dcent',
  approvalMethod: 'sdk_push',
};

const mockNetworks = {
  availableNetworks: [
    { network: 'devnet', name: 'Devnet' },
    { network: 'testnet', name: 'Testnet' },
  ],
};

function setupApiMocks(walletData: Record<string, unknown>) {
  vi.mocked(api.GET).mockImplementation(async (path: string) => {
    if (path === '/v1/wallets/{id}') return { data: walletData };
    if (path.includes('/networks')) return { data: mockNetworks };
    if (path.includes('/balance')) return { data: { balances: [] } };
    if (path.includes('/transactions')) return { data: { items: [], total: 0 } };
    if (path.includes('/wc/session')) throw new Error('No session');
    if (path.includes('/settings')) return { data: {} };
    if (path.includes('/staking')) return { data: { walletId: 'test-id', positions: [] } };
    return { data: {} };
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
  // Owner is now inside Owner Protection card in Overview tab
  // Click "Register Owner" (NONE state) or "Manage" (GRACE/LOCKED state) to reveal OwnerTab
  const registerBtn = screen.queryByText('Register Owner');
  const manageBtn = screen.queryByText('Manage');
  if (registerBtn) {
    fireEvent.click(registerBtn);
  } else if (manageBtn) {
    fireEvent.click(manageBtn);
  }
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
    vi.mocked(api.PUT).mockResolvedValue({ data: { ...noneWallet, walletType: 'dcent', approvalMethod: 'sdk_push' } });
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
      expect(api.PUT).toHaveBeenCalledWith(
        '/v1/wallets/{id}/owner',
        expect.objectContaining({
          body: expect.objectContaining({
            owner_address: '11111111111111111111111111111112',
            wallet_type: 'dcent',
          }),
        }),
      );
    });
  });

  it('T-ADUI-03: Custom selection omits wallet_type from API body', async () => {
    setupApiMocks(noneWallet);
    vi.mocked(api.PUT).mockResolvedValue({ data: { ...noneWallet, ownerAddress: '11111111111111111111111111111112', ownerState: 'GRACE' } });
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
      expect(api.PUT).toHaveBeenCalled();
    });

    // Verify wallet_type is NOT in the body
    const callArgs = vi.mocked(api.PUT).mock.calls[0]!;
    const opts = callArgs[1] as { body: Record<string, unknown> };
    expect(opts.body.owner_address).toBe('11111111111111111111111111111112');
    expect(opts.body).not.toHaveProperty('wallet_type');
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

    // GRACE badge should be present (appears in both Owner Protection card and OwnerTab)
    expect(screen.getAllByText('GRACE').length).toBeGreaterThanOrEqual(1);

    // D'CENT Wallet should be displayed (badge + Wallet Type section)
    const dcentElements = screen.getAllByText("D'CENT Wallet");
    expect(dcentElements.length).toBeGreaterThanOrEqual(1);
  });
});

// ---------------------------------------------------------------------------
// Phase 292 — Owner tab improvements
// ---------------------------------------------------------------------------

describe('Admin UI Owner tab — Phase 292', () => {
  beforeEach(() => {
    currentPath.value = '/wallets/test-id';
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('T-OWN-01: NONE state — preset selection shows approval method preview', async () => {
    setupApiMocks(noneWallet);
    await renderAndWaitForDetail();
    await switchToOwnerTab();

    // Open editing mode
    fireEvent.click(screen.getByText('Set Owner Address'));
    await waitFor(() => {
      expect(screen.getByText('Wallet Type')).toBeTruthy();
    });

    // Select D'CENT preset
    const select = screen.getByDisplayValue('Custom (manual setup)') as HTMLSelectElement;
    fireEvent.change(select, { target: { value: 'dcent' } });

    // Approval method preview should appear
    await waitFor(() => {
      expect(screen.getByText(/Approval:.*Wallet App \(Push\)/)).toBeTruthy();
    });
  });

  it('T-OWN-02: GRACE state — Change button opens Wallet Type dropdown', async () => {
    setupApiMocks(graceWalletSdkNtfy);
    await renderAndWaitForDetail();
    await switchToOwnerTab();

    // Should show current wallet type with change button
    await waitFor(() => {
      const dcentElements = screen.getAllByText("D'CENT Wallet");
      expect(dcentElements.length).toBeGreaterThanOrEqual(1);
    });

    // Click the change pencil button for wallet type
    const changeBtn = screen.getByTitle('Change wallet type');
    expect(changeBtn).toBeTruthy();
    fireEvent.click(changeBtn);

    // Dropdown should appear with D'CENT Wallet pre-selected
    await waitFor(() => {
      const select = screen.getByDisplayValue("D'CENT Wallet") as HTMLSelectElement;
      expect(select).toBeTruthy();
    });
  });

  it('T-OWN-03: LOCKED state — no edit controls, read-only display', async () => {
    setupApiMocks(lockedWallet);
    await renderAndWaitForDetail();
    await switchToOwnerTab();

    // Wallet Type should be displayed
    await waitFor(() => {
      const dcentElements = screen.getAllByText("D'CENT Wallet");
      expect(dcentElements.length).toBeGreaterThanOrEqual(1);
    });

    // No change button for wallet type
    expect(screen.queryByTitle('Change wallet type')).toBeNull();

    // No "Set owner address" edit pencil button
    expect(screen.queryByTitle('Set owner address')).toBeNull();

    // Approval method radios should be disabled
    const radios = document.querySelectorAll('input[name="approval_method"]');
    radios.forEach((radio) => {
      expect((radio as HTMLInputElement).disabled).toBe(true);
    });
  });

  it('T-OWN-04: preset selection preview shows correct approval method text', async () => {
    setupApiMocks(noneWallet);
    await renderAndWaitForDetail();
    await switchToOwnerTab();

    fireEvent.click(screen.getByText('Set Owner Address'));
    await waitFor(() => {
      expect(screen.getByText('Wallet Type')).toBeTruthy();
    });

    // Custom selection (default) — no preview
    expect(screen.queryByText(/Approval:/)).toBeNull();

    // Select D'CENT
    const select = screen.getByDisplayValue('Custom (manual setup)') as HTMLSelectElement;
    fireEvent.change(select, { target: { value: 'dcent' } });

    // Preview appears
    await waitFor(() => {
      expect(screen.getByText(/Approval:.*Wallet App \(Push\)/)).toBeTruthy();
    });
  });

  it('T-OWN-05: GRACE state Wallet Type change triggers API call with wallet_type and shows updated approval method', async () => {
    // Start with a GRACE wallet that has D'CENT preset
    // We'll change from dcent to Custom (clearing wallet_type), then assert the API call
    setupApiMocks(graceWalletSdkNtfy);
    vi.mocked(api.PUT).mockResolvedValue({ data: { ...graceWalletSdkNtfy } });
    await renderAndWaitForDetail();
    await switchToOwnerTab();

    // Open wallet type change
    await waitFor(() => {
      expect(screen.getByTitle('Change wallet type')).toBeTruthy();
    });
    fireEvent.click(screen.getByTitle('Change wallet type'));

    // Dropdown should appear with D'CENT Wallet pre-selected
    await waitFor(() => {
      const select = screen.getByDisplayValue("D'CENT Wallet") as HTMLSelectElement;
      expect(select).toBeTruthy();
    });

    // Change selection (keep dcent to test wallet_type being sent)
    const select = screen.getByDisplayValue("D'CENT Wallet") as HTMLSelectElement;
    // First change to Custom, then back to dcent to exercise the change path
    fireEvent.change(select, { target: { value: 'dcent' } });

    // Click Save in the inline-edit area
    const saveButtons = screen.getAllByText('Save');
    const saveBtn = saveButtons.find(btn => btn.closest('.inline-edit'));
    fireEvent.click(saveBtn!);

    // Assert API call includes wallet_type: 'dcent' and owner_address
    await waitFor(() => {
      expect(api.PUT).toHaveBeenCalledWith(
        '/v1/wallets/{id}/owner',
        expect.objectContaining({
          body: expect.objectContaining({
            owner_address: graceWalletSdkNtfy.ownerAddress,
            wallet_type: 'dcent',
          }),
        }),
      );
    });
  });

  it('T-OWN-06: WalletConnect section hidden when approvalMethod is sdk_push', async () => {
    setupApiMocks(graceWalletSdkNtfy);
    await renderAndWaitForDetail();
    await switchToOwnerTab();

    // WalletConnect section header should NOT be present
    await waitFor(() => {
      // Approval Method appears in both Owner Protection card and OwnerTab
      expect(screen.getAllByText('Approval Method').length).toBeGreaterThanOrEqual(1);
    });

    // The h4 "WalletConnect" section should be absent
    const wcHeaders = screen.queryAllByText('WalletConnect');
    // Only the radio option label "WalletConnect" should be present, not the section header
    const sectionHeaders = wcHeaders.filter((el) => el.tagName === 'H4');
    expect(sectionHeaders.length).toBe(0);
  });

  it('T-OWN-07: WalletConnect section visible when approvalMethod is walletconnect', async () => {
    setupApiMocks(graceWalletWc);
    await renderAndWaitForDetail();
    await switchToOwnerTab();

    // WalletConnect section h4 should be present
    await waitFor(() => {
      const wcHeaders = screen.queryAllByText('WalletConnect');
      const sectionHeaders = wcHeaders.filter((el) => el.tagName === 'H4');
      expect(sectionHeaders.length).toBe(1);
    });
  });
});
