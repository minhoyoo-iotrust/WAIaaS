/**
 * wallets-coverage.test.tsx
 *
 * Supplemental coverage tests for wallets.tsx WalletDetailView functions:
 * - fetchWallet, handleSaveName, handleDelete, startEdit, cancelEdit
 * - handleMcpSetup, fetchNetworks, fetchBalance, fetchTransactions
 * - fetchWcSession, handleWcConnect, handleWcDisconnect
 * - startEditOwner, cancelEditOwner, handleSaveOwner
 * - Error handling branches
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
  return { currentPath: signal('/wallets/test-wallet-1') };
});

vi.mock('../components/copy-button', () => ({
  CopyButton: ({ value }: { value: string }) => <button data-testid={`copy-${value.slice(0, 8)}`}>Copy</button>,
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

vi.mock('../utils/dirty-guard', () => ({
  registerDirty: vi.fn(),
  unregisterDirty: vi.fn(),
  hasDirty: { value: false },
}));

vi.mock('../components/settings-search', () => {
  const { signal } = require('@preact/signals');
  return {
    pendingNavigation: signal(null),
    highlightField: signal(''),
    SettingsSearch: () => null,
  };
});

import { api, ApiError } from '../api/typed-client';
import { showToast } from '../components/toast';
import { currentPath } from '../components/layout';
import WalletsPage from '../pages/wallets';

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

const mockWalletDetail = {
  id: 'test-wallet-1',
  name: 'trading-bot',
  chain: 'solana',
  network: 'solana-devnet',
  environment: 'testnet',
  publicKey: 'ABC123DEF456GHI789JKL012MNO345PQR678STU901',
  status: 'ACTIVE',
  ownerAddress: null,
  ownerState: 'NONE' as const,
  ownerVerified: null,
  createdAt: 1707609600,
  updatedAt: null,
};

const mockWalletWithOwner = {
  ...mockWalletDetail,
  ownerAddress: '0xABCDEF1234567890ABCDEF1234567890ABCDEF12',
  ownerState: 'GRACE' as const,
};

/** GRACE wallet with WalletConnect approval method — WC section only renders when approvalMethod === 'walletconnect'. */
const mockWalletWithOwnerWc = {
  ...mockWalletWithOwner,
  approvalMethod: 'walletconnect',
};

const mockNetworks = {
  availableNetworks: [
    { network: 'solana-devnet', name: 'Devnet' },
    { network: 'solana-testnet', name: 'Testnet' },
    { network: 'solana-mainnet', name: 'Mainnet' },
  ],
};

const mockBalance = {
  balances: [
    {
      network: 'solana-devnet',
      native: { balance: '2.5', symbol: 'SOL' },
      tokens: [
        { symbol: 'USDC', balance: '100.00', address: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v' },
      ],
    },
  ],
};

const mockTransactions = {
  items: [
    {
      id: 'tx-1',
      type: 'TRANSFER',
      status: 'CONFIRMED',
      toAddress: '9xBdDfVcFk5JMZfKXXj3JxfJKe7r5pNAAQKi7pVKsFTH',
      amount: '1.5 SOL',
      network: 'solana-devnet',
      txHash: 'abcdef1234567890',
      createdAt: 1707609600,
    },
    {
      id: 'tx-2',
      type: 'TOKEN_TRANSFER',
      status: 'FAILED',
      toAddress: null,
      amount: null,
      network: 'solana-devnet',
      txHash: null,
      createdAt: 1707696000,
    },
    {
      id: 'tx-3',
      type: 'CONTRACT_CALL',
      status: 'PENDING',
      toAddress: null,
      amount: '0.1 SOL',
      network: null,
      txHash: null,
      createdAt: null,
    },
  ],
  total: 3,
};

const mockWcSession = {
  walletId: 'test-wallet-1',
  topic: 'wc-topic-123',
  peerName: 'MetaMask',
  peerUrl: 'https://metamask.io',
  chainId: 'eip155:1',
  ownerAddress: '0xABCDEF1234567890ABCDEF1234567890ABCDEF12',
  expiry: 1708214400,
  createdAt: 1707609600,
};

const mockMcpResult = {
  walletId: 'test-wallet-1',
  walletName: 'trading-bot',
  tokenPath: '/tmp/waiaas/mcp-tokens/test-wallet-1.json',
  expiresAt: 1708214400,
  claudeDesktopConfig: { waiaas: { command: 'npx', args: ['@waiaas/mcp'] } },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mockDetailApiCalls(wallet = mockWalletDetail) {
  vi.mocked(api.GET).mockImplementation(async (path: string) => {
    if (path === '/v1/wallets/{id}') return { data: wallet };
    if (path.includes('/networks')) return { data: mockNetworks };
    if (path.includes('/balance')) return { data: mockBalance };
    if (path.includes('/transactions')) return { data: mockTransactions };
    if (path.includes('/wc/session')) throw new Error('No session');
    if (path.includes('/staking')) return { data: { positions: [] } };
    if (path.includes('/settings')) return { data: {} };
    return { data: {} };
  });
}

async function renderAndWaitForDetail() {
  render(<WalletsPage />);
  await waitFor(() => {
    expect(screen.getByText('trading-bot')).toBeTruthy();
  });
}

async function switchTab(tabLabel: string) {
  // Tab labels may appear in both tab button and content, use getAllByText and click the first (tab button)
  const elements = screen.getAllByText(tabLabel);
  fireEvent.click(elements[0]!);
  await waitFor(() => {});
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('WalletDetailView rendering', () => {
  beforeEach(() => { currentPath.value = '/wallets/test-wallet-1'; });
  afterEach(() => { cleanup(); vi.clearAllMocks(); });

  it('renders wallet detail with all sections', async () => {
    mockDetailApiCalls();
    await renderAndWaitForDetail();

    expect(screen.getByText('trading-bot')).toBeTruthy();
    expect(screen.getByText('Chain')).toBeTruthy();
    expect(screen.getByText('solana')).toBeTruthy();
    // 'devnet' appears in networks list, use getAllByText
    expect(screen.getAllByText('solana-devnet').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Balances')).toBeTruthy();
    expect(screen.getByText('Available Networks')).toBeTruthy();
    // Tab labels visible in TabNav (4-tab structure)
    expect(screen.getByText('Overview')).toBeTruthy();
    expect(screen.getByText('Activity')).toBeTruthy();
    expect(screen.getByText('Assets')).toBeTruthy();
    expect(screen.getByText('Setup')).toBeTruthy();
    // Owner Protection card in Overview tab
    expect(screen.getByText('Owner Protection')).toBeTruthy();
  });

  it('renders balance with native and tokens', async () => {
    mockDetailApiCalls();
    await renderAndWaitForDetail();

    await waitFor(() => {
      expect(screen.getByText('2.5 SOL')).toBeTruthy();
    });
    expect(screen.getByText('100.00')).toBeTruthy();
    expect(screen.getByText('USDC')).toBeTruthy();
  });

  it('renders available networks', async () => {
    mockDetailApiCalls();
    await renderAndWaitForDetail();

    await waitFor(() => {
      expect(screen.getAllByText('solana-devnet').length).toBeGreaterThanOrEqual(1);
    });
    expect(screen.getAllByText('solana-testnet').length).toBeGreaterThanOrEqual(1);
  });

  it('switches to Activity tab', async () => {
    mockDetailApiCalls();
    await renderAndWaitForDetail();

    await switchTab('Activity');

    // Activity tab is accessible (content integration in Plan 02)
    await waitFor(() => {
      expect(screen.getAllByText('Activity').length).toBeGreaterThanOrEqual(2);
    });
  });

  it('renders back link', async () => {
    mockDetailApiCalls();
    await renderAndWaitForDetail();

    const backLink = document.querySelector('a[href="#/wallets"]');
    expect(backLink).toBeTruthy();
  });
});

describe('WalletDetailView: handleSaveName', () => {
  beforeEach(() => { currentPath.value = '/wallets/test-wallet-1'; });
  afterEach(() => { cleanup(); vi.clearAllMocks(); });

  it('saves wallet name on edit', async () => {
    mockDetailApiCalls();
    await renderAndWaitForDetail();

    vi.mocked(api.PUT).mockResolvedValueOnce({ data: { ...mockWalletDetail, name: 'renamed-bot' } });

    // Click edit (pencil) button
    const editBtn = screen.getByTitle('Edit name');
    fireEvent.click(editBtn);

    // Change name
    const editInput = screen.getByDisplayValue('trading-bot');
    fireEvent.input(editInput, { target: { value: 'renamed-bot' } });

    // Save
    fireEvent.click(screen.getByText('Save'));

    await waitFor(() => {
      expect(vi.mocked(api.PUT)).toHaveBeenCalledWith('/v1/wallets/{id}', expect.objectContaining({
        body: { name: 'renamed-bot' },
      }));
    });

    await waitFor(() => {
      expect(vi.mocked(showToast)).toHaveBeenCalledWith('success', 'Wallet name updated');
    });
  });

  it('handles save name error', async () => {
    mockDetailApiCalls();
    await renderAndWaitForDetail();

    vi.mocked(api.PUT).mockRejectedValueOnce(new ApiError(400, 'INVALID_NAME', 'Bad name'));

    const editBtn = screen.getByTitle('Edit name');
    fireEvent.click(editBtn);

    const editInput = screen.getByDisplayValue('trading-bot');
    fireEvent.input(editInput, { target: { value: '' } });

    fireEvent.click(screen.getByText('Save'));

    await waitFor(() => {
      expect(vi.mocked(showToast)).toHaveBeenCalledWith('error', 'Error: INVALID_NAME');
    });
  });

  it('cancel edit restores view', async () => {
    mockDetailApiCalls();
    await renderAndWaitForDetail();

    const editBtn = screen.getByTitle('Edit name');
    fireEvent.click(editBtn);

    // Should see Cancel button
    fireEvent.click(screen.getByText('Cancel'));

    await waitFor(() => {
      expect(screen.getByText('trading-bot')).toBeTruthy();
    });
  });
});

describe('WalletDetailView: handleDelete', () => {
  beforeEach(() => { currentPath.value = '/wallets/test-wallet-1'; });
  afterEach(() => { cleanup(); vi.clearAllMocks(); });

  it('deletes wallet via modal confirmation', async () => {
    mockDetailApiCalls();
    await renderAndWaitForDetail();

    vi.mocked(api.DELETE).mockResolvedValueOnce({ data: undefined });

    fireEvent.click(screen.getByText('Terminate Wallet'));

    await waitFor(() => {
      expect(screen.getByText(/Are you sure you want to terminate wallet/)).toBeTruthy();
    });

    fireEvent.click(screen.getByText('Terminate'));

    await waitFor(() => {
      expect(vi.mocked(api.DELETE)).toHaveBeenCalledWith('/v1/wallets/{id}', expect.objectContaining({}));
    });

    await waitFor(() => {
      expect(vi.mocked(showToast)).toHaveBeenCalledWith('success', 'Wallet terminated');
    });
  });

  it('handles delete error', async () => {
    mockDetailApiCalls();
    await renderAndWaitForDetail();

    vi.mocked(api.DELETE).mockRejectedValueOnce(new ApiError(500, 'DELETE_FAIL', 'Failed'));

    fireEvent.click(screen.getByText('Terminate Wallet'));
    await waitFor(() => {
      expect(screen.getByText('Terminate')).toBeTruthy();
    });
    fireEvent.click(screen.getByText('Terminate'));

    await waitFor(() => {
      expect(vi.mocked(showToast)).toHaveBeenCalledWith('error', 'Error: DELETE_FAIL');
    });
  });
});

describe('WalletDetailView: Setup tab (MCP)', () => {
  beforeEach(() => { currentPath.value = '/wallets/test-wallet-1'; });
  afterEach(() => { cleanup(); vi.clearAllMocks(); });

  it('switches to Setup tab', async () => {
    mockDetailApiCalls();
    await renderAndWaitForDetail();

    await switchTab('Setup');

    await waitFor(() => {
      expect(screen.getAllByText('Setup').length).toBeGreaterThanOrEqual(2);
    });
  });
});

describe('WalletDetailView: owner address', () => {
  beforeEach(() => { currentPath.value = '/wallets/test-wallet-1'; });
  afterEach(() => { cleanup(); vi.clearAllMocks(); });

  it('shows Set Owner Address button for NONE state', async () => {
    mockDetailApiCalls();
    await renderAndWaitForDetail();

    // Owner Protection card is visible in Overview tab (default)
    expect(screen.getByText('Owner Protection')).toBeTruthy();
    // Click Register Owner to reveal OwnerTab inline
    fireEvent.click(screen.getByText('Register Owner'));
    await waitFor(() => {
      expect(screen.getByText('Set Owner Address')).toBeTruthy();
    });
    expect(screen.getAllByText('NONE').length).toBeGreaterThanOrEqual(1);
  });

  it('handleSaveOwner: saves owner address', async () => {
    mockDetailApiCalls();
    await renderAndWaitForDetail();

    // Reveal OwnerTab via Owner Protection card
    fireEvent.click(screen.getByText('Register Owner'));
    await waitFor(() => { expect(screen.getByText('Set Owner Address')).toBeTruthy(); });

    vi.mocked(api.PUT).mockResolvedValueOnce({ data: {
      ownerAddress: '0xNEW_OWNER_ADDRESS',
      ownerState: 'GRACE',
    } });

    // Click Set Owner Address
    fireEvent.click(screen.getByText('Set Owner Address'));

    // Enter address in the inline edit
    const ownerInput = screen.getByPlaceholderText('Enter owner wallet address');
    fireEvent.input(ownerInput, { target: { value: '0xNEW_OWNER_ADDRESS' } });

    // Click Save
    const saveButtons = screen.getAllByText('Save');
    fireEvent.click(saveButtons[saveButtons.length - 1]!);

    await waitFor(() => {
      expect(vi.mocked(api.PUT)).toHaveBeenCalledWith('/v1/wallets/{id}/owner', expect.objectContaining({
        body: expect.objectContaining({
          owner_address: '0xNEW_OWNER_ADDRESS',
        }),
      }));
    });

    await waitFor(() => {
      expect(vi.mocked(showToast)).toHaveBeenCalledWith('success', 'Owner address updated');
    });
  });

  it('handleSaveOwner: shows error for empty address', async () => {
    mockDetailApiCalls();
    await renderAndWaitForDetail();

    fireEvent.click(screen.getByText('Register Owner'));
    await waitFor(() => { expect(screen.getByText('Set Owner Address')).toBeTruthy(); });

    fireEvent.click(screen.getByText('Set Owner Address'));

    const ownerInput = screen.getByPlaceholderText('Enter owner wallet address');
    fireEvent.input(ownerInput, { target: { value: '' } });

    const saveButtons = screen.getAllByText('Save');
    fireEvent.click(saveButtons[saveButtons.length - 1]!);

    await waitFor(() => {
      expect(vi.mocked(showToast)).toHaveBeenCalledWith('error', 'Owner address is required');
    });
  });

  it('handleSaveOwner: handles API error', async () => {
    mockDetailApiCalls();
    await renderAndWaitForDetail();

    fireEvent.click(screen.getByText('Register Owner'));
    await waitFor(() => { expect(screen.getByText('Set Owner Address')).toBeTruthy(); });

    vi.mocked(api.PUT).mockRejectedValueOnce(new ApiError(400, 'INVALID_ADDRESS', 'Bad'));

    fireEvent.click(screen.getByText('Set Owner Address'));

    const ownerInput = screen.getByPlaceholderText('Enter owner wallet address');
    fireEvent.input(ownerInput, { target: { value: 'invalid-addr' } });

    const saveButtons = screen.getAllByText('Save');
    fireEvent.click(saveButtons[saveButtons.length - 1]!);

    await waitFor(() => {
      expect(vi.mocked(showToast)).toHaveBeenCalledWith('error', 'Error: INVALID_ADDRESS');
    });
  });

  it('cancelEditOwner: cancels owner edit', async () => {
    mockDetailApiCalls();
    await renderAndWaitForDetail();

    fireEvent.click(screen.getByText('Register Owner'));
    await waitFor(() => { expect(screen.getByText('Set Owner Address')).toBeTruthy(); });

    fireEvent.click(screen.getByText('Set Owner Address'));

    expect(screen.getByPlaceholderText('Enter owner wallet address')).toBeTruthy();

    const cancelButtons = screen.getAllByText('Cancel');
    fireEvent.click(cancelButtons[cancelButtons.length - 1]!);

    await waitFor(() => {
      expect(screen.queryByPlaceholderText('Enter owner wallet address')).toBeNull();
    });
  });

  it('shows GRACE state with verify info when owner is set', async () => {
    mockDetailApiCalls(mockWalletWithOwner);
    render(<WalletsPage />);

    await waitFor(() => {
      expect(screen.getByText('trading-bot')).toBeTruthy();
    });

    // Owner Protection card shows GRACE in Overview tab
    expect(screen.getByText('Owner Protection')).toBeTruthy();
    expect(screen.getByText('GRACE')).toBeTruthy();
    // Click Manage to reveal OwnerTab inline
    fireEvent.click(screen.getByText('Manage'));
    await waitFor(() => {
      expect(screen.getByText('Verify Owner')).toBeTruthy();
    });
  });
});

describe('WalletDetailView: WalletConnect', () => {
  beforeEach(() => { currentPath.value = '/wallets/test-wallet-1'; });
  afterEach(() => { cleanup(); vi.clearAllMocks(); });

  it('shows Connect Wallet button when owner is set and no session', async () => {
    mockDetailApiCalls(mockWalletWithOwnerWc);
    render(<WalletsPage />);

    await waitFor(() => {
      expect(screen.getByText('trading-bot')).toBeTruthy();
    });

    // Reveal OwnerTab via Manage button (GRACE state)
    fireEvent.click(screen.getByText('Manage'));

    await waitFor(() => {
      expect(screen.getByText('Connect Wallet')).toBeTruthy();
    });
  });

  it('shows message when no owner is set', async () => {
    mockDetailApiCalls({ ...mockWalletDetail, approvalMethod: 'walletconnect' });
    await renderAndWaitForDetail();

    // NONE state with walletconnect approval - click Register Owner
    fireEvent.click(screen.getByText('Register Owner'));
    await waitFor(() => {
      expect(screen.getByText('Set an Owner address first to enable WalletConnect.')).toBeTruthy();
    });
  });

  it('handleWcConnect: initiates pairing', async () => {
    mockDetailApiCalls(mockWalletWithOwnerWc);

    vi.mocked(api.POST).mockResolvedValueOnce({ data: {
      uri: 'wc:abc123',
      qrCode: 'data:image/png;base64,ABC',
      expiresAt: 1708214400,
    } });

    render(<WalletsPage />);

    await waitFor(() => {
      expect(screen.getByText('trading-bot')).toBeTruthy();
    });

    fireEvent.click(screen.getByText('Manage'));

    await waitFor(() => {
      expect(screen.getByText('Connect Wallet')).toBeTruthy();
    });

    fireEvent.click(screen.getByText('Connect Wallet'));

    await waitFor(() => {
      expect(vi.mocked(api.POST)).toHaveBeenCalledWith('/v1/wallets/{id}/wc/pair', expect.objectContaining({}));
    });

    // QR modal should open
    await waitFor(() => {
      expect(screen.getByText('Scan QR Code')).toBeTruthy();
    });
  });

  it('handleWcConnect error', async () => {
    mockDetailApiCalls(mockWalletWithOwnerWc);

    vi.mocked(api.POST).mockRejectedValueOnce(new ApiError(500, 'WC_ERROR', 'Failed'));

    render(<WalletsPage />);

    await waitFor(() => {
      expect(screen.getByText('trading-bot')).toBeTruthy();
    });

    fireEvent.click(screen.getByText('Manage'));

    await waitFor(() => {
      expect(screen.getByText('Connect Wallet')).toBeTruthy();
    });

    fireEvent.click(screen.getByText('Connect Wallet'));

    await waitFor(() => {
      expect(vi.mocked(showToast)).toHaveBeenCalledWith('error', 'Error: WC_ERROR');
    });
  });

  it('handleWcDisconnect: disconnects session', async () => {
    // Mock with WC session present
    vi.mocked(api.GET).mockImplementation(async (path: string) => {
      if (path === '/v1/wallets/{id}') return { data: mockWalletWithOwnerWc };
      if (path.includes('/networks')) return { data: mockNetworks };
      if (path.includes('/balance')) return { data: mockBalance };
      if (path.includes('/transactions')) return { data: mockTransactions };
      if (path.includes('/wc/session')) return { data: mockWcSession };
      return { data: {} };
    });
    vi.mocked(api.DELETE).mockResolvedValueOnce({ data: undefined });

    render(<WalletsPage />);

    await waitFor(() => {
      expect(screen.getByText('trading-bot')).toBeTruthy();
    });

    fireEvent.click(screen.getByText('Manage'));

    await waitFor(() => {
      expect(screen.getByText('Connected')).toBeTruthy();
    });

    expect(screen.getByText('MetaMask')).toBeTruthy();

    fireEvent.click(screen.getByText('Disconnect'));

    await waitFor(() => {
      expect(vi.mocked(api.DELETE)).toHaveBeenCalledWith('/v1/wallets/{id}/wc/session', expect.objectContaining({}));
    });

    await waitFor(() => {
      expect(vi.mocked(showToast)).toHaveBeenCalledWith('success', 'WalletConnect session disconnected');
    });
  });

  it('handleWcDisconnect error', async () => {
    vi.mocked(api.GET).mockImplementation(async (path: string) => {
      if (path === '/v1/wallets/{id}') return { data: mockWalletWithOwnerWc };
      if (path.includes('/networks')) return { data: mockNetworks };
      if (path.includes('/balance')) return { data: mockBalance };
      if (path.includes('/transactions')) return { data: mockTransactions };
      if (path.includes('/wc/session')) return { data: mockWcSession };
      return { data: {} };
    });
    vi.mocked(api.DELETE).mockRejectedValueOnce(new ApiError(500, 'WC_DC_ERROR', 'Failed'));

    render(<WalletsPage />);

    await waitFor(() => {
      expect(screen.getByText('trading-bot')).toBeTruthy();
    });

    fireEvent.click(screen.getByText('Manage'));

    await waitFor(() => {
      expect(screen.getByText('Disconnect')).toBeTruthy();
    });

    fireEvent.click(screen.getByText('Disconnect'));

    await waitFor(() => {
      expect(vi.mocked(showToast)).toHaveBeenCalledWith('error', 'Error: WC_DC_ERROR');
    });
  });
});

describe('WalletDetailView: fetch errors', () => {
  beforeEach(() => { currentPath.value = '/wallets/test-wallet-1'; });
  afterEach(() => { cleanup(); vi.clearAllMocks(); });

  it('shows error when wallet fetch fails', async () => {
    vi.mocked(api.GET).mockImplementation(async (path: string) => {
      if (path === '/v1/wallets/{id}') throw new ApiError(404, 'NOT_FOUND', 'Wallet not found');
      if (path.includes('/networks')) return { data: mockNetworks };
      if (path.includes('/balance')) return { data: mockBalance };
      if (path.includes('/transactions')) return { data: mockTransactions };
      if (path.includes('/wc/session')) throw new Error('No session');
      return { data: {} };
    });

    render(<WalletsPage />);

    await waitFor(() => {
      expect(vi.mocked(showToast)).toHaveBeenCalledWith('error', 'Error: NOT_FOUND');
    });

    // Should show empty state
    await waitFor(() => {
      expect(screen.getByText('Wallet not found')).toBeTruthy();
    });
  });

  it('handles networks fetch error', async () => {
    vi.mocked(api.GET).mockImplementation(async (path: string) => {
      if (path === '/v1/wallets/{id}') return { data: mockWalletDetail };
      if (path.includes('/networks')) throw new ApiError(500, 'NET_FAIL', 'Failed');
      if (path.includes('/balance')) return { data: mockBalance };
      if (path.includes('/transactions')) return { data: mockTransactions };
      if (path.includes('/wc/session')) throw new Error('No session');
      return { data: {} };
    });

    render(<WalletsPage />);

    await waitFor(() => {
      expect(vi.mocked(showToast)).toHaveBeenCalledWith('error', 'Error: NET_FAIL');
    });
  });

  it('handles balance fetch returning null', async () => {
    vi.mocked(api.GET).mockImplementation(async (path: string) => {
      if (path === '/v1/wallets/{id}') return { data: mockWalletDetail };
      if (path.includes('/networks')) return { data: mockNetworks };
      if (path.includes('/balance')) throw new Error('No balance');
      if (path.includes('/transactions')) return { data: mockTransactions };
      if (path.includes('/wc/session')) throw new Error('No session');
      return { data: {} };
    });

    render(<WalletsPage />);

    await waitFor(() => {
      expect(screen.getByText('No balance data available')).toBeTruthy();
    });
  });

  it('handles transactions fetch returning empty', async () => {
    vi.mocked(api.GET).mockImplementation(async (path: string) => {
      if (path === '/v1/wallets/{id}') return { data: mockWalletDetail };
      if (path.includes('/networks')) return { data: mockNetworks };
      if (path.includes('/balance')) return { data: mockBalance };
      if (path.includes('/transactions')) throw new Error('No transactions');
      if (path.includes('/wc/session')) throw new Error('No session');
      return { data: {} };
    });

    render(<WalletsPage />);

    await waitFor(() => {
      expect(screen.getByText('trading-bot')).toBeTruthy();
    });

    await switchTab('Activity');

    // Activity tab is now a stub; transactions content will be integrated in Plan 02
    await waitFor(() => {
      expect(screen.getAllByText('Activity').length).toBeGreaterThanOrEqual(2);
    });
  });
});

describe('WalletDetailView: balance with no tokens', () => {
  beforeEach(() => { currentPath.value = '/wallets/test-wallet-1'; });
  afterEach(() => { cleanup(); vi.clearAllMocks(); });

  it('shows native balance when no tokens exist', async () => {
    vi.mocked(api.GET).mockImplementation(async (path: string) => {
      if (path === '/v1/wallets/{id}') return { data: mockWalletDetail };
      if (path.includes('/networks')) return { data: mockNetworks };
      if (path.includes('/balance')) return { data: { balances: [{ network: 'solana-devnet', native: { balance: '1.0', symbol: 'SOL' }, tokens: [] }] } };
      if (path.includes('/transactions')) return { data: mockTransactions };
      if (path.includes('/wc/session')) throw new Error('No session');
      return { data: {} };
    });

    render(<WalletsPage />);

    await waitFor(() => {
      expect(screen.getByText('1.0 SOL')).toBeTruthy();
    });
  });
});

describe('WalletDetailView: wallet with balance error', () => {
  beforeEach(() => { currentPath.value = '/wallets/test-wallet-1'; });
  afterEach(() => { cleanup(); vi.clearAllMocks(); });

  it('shows balance error message when balance API returns error', async () => {
    vi.mocked(api.GET).mockImplementation(async (path: string) => {
      if (path === '/v1/wallets/{id}') return { data: mockWalletDetail };
      if (path.includes('/networks')) return { data: mockNetworks };
      if (path.includes('/balance')) return { data: { balances: [{ network: 'solana-devnet', native: null, tokens: [], error: 'RPC unavailable' }] } };
      if (path.includes('/transactions')) return { data: mockTransactions };
      if (path.includes('/wc/session')) throw new Error('No session');
      return { data: {} };
    });

    render(<WalletsPage />);

    await waitFor(() => {
      expect(screen.getByText('RPC unavailable')).toBeTruthy();
    });
  });
});

// ---------------------------------------------------------------------------
// WalletListContent (wallet list view)
// ---------------------------------------------------------------------------

const mockWalletList = {
  items: [
    {
      id: 'w-1',
      name: 'trading-bot',
      chain: 'solana',
      network: 'solana-devnet',
      environment: 'testnet',
      publicKey: 'ABC123DEF456GHI789',
      status: 'ACTIVE',
      ownerAddress: null,
      ownerState: 'NONE',
      createdAt: 1707609600,
    },
    {
      id: 'w-2',
      name: 'arb-bot',
      chain: 'ethereum',
      network: 'sepolia',
      environment: 'testnet',
      publicKey: '0xDEF789ABC012GHI345',
      status: 'ACTIVE',
      ownerAddress: '0xABC',
      ownerState: 'LOCKED',
      createdAt: 1707696000,
    },
  ],
};

const mockSettingsData = {
  rpc: {
    solana_mainnet: 'https://api.mainnet-beta.solana.com',
    solana_devnet: 'https://api.devnet.solana.com',
    solana_testnet: '',
    evm_ethereum_mainnet: '',
    evm_ethereum_sepolia: 'https://rpc.sepolia.org',
  },
  monitoring: {
    enabled: 'true',
    check_interval_sec: '300',
    low_balance_threshold_sol: '0.5',
    low_balance_threshold_eth: '0.01',
    cooldown_hours: '6',
  },
  walletconnect: {
    project_id: 'test-project-id',
    relay_url: 'wss://relay.walletconnect.com',
  },
};

describe('WalletListContent', () => {
  beforeEach(() => { currentPath.value = '/wallets'; });
  afterEach(() => { cleanup(); vi.clearAllMocks(); });

  it('renders wallet list with all columns', async () => {
    vi.mocked(api.GET).mockImplementation(async (path: string) => {
      if (path === '/v1/wallets') return { data: mockWalletList };
      return { data: {} };
    });

    render(<WalletsPage />);

    await waitFor(() => {
      expect(screen.getByText('trading-bot')).toBeTruthy();
    });

    expect(screen.getByText('arb-bot')).toBeTruthy();
    expect(screen.getByText('solana')).toBeTruthy();
    expect(screen.getByText('ethereum')).toBeTruthy();
  });

  it('shows create wallet form and creates wallet', async () => {
    vi.mocked(api.GET).mockImplementation(async (path: string) => {
      if (path === '/v1/wallets') return { data: mockWalletList };
      return { data: {} };
    });

    vi.mocked(api.POST).mockResolvedValueOnce({ data: {
      id: 'w-3',
      name: 'new-bot',
      chain: 'solana',
      network: 'solana-devnet',
      environment: 'testnet',
      publicKey: 'XYZ',
      status: 'ACTIVE',
      session: { id: 's-1', token: 'test-token-xyz', expiresAt: 1708000000 },
    } });

    const { container } = render(<WalletsPage />);

    await waitFor(() => {
      expect(screen.getByText('Create Wallet')).toBeTruthy();
    });

    fireEvent.click(screen.getByText('Create Wallet'));

    // Wait for inline form to appear
    await waitFor(() => {
      expect(container.querySelector('.inline-form')).toBeTruthy();
    });

    // Fill name using the input inside inline-form
    const nameInput = container.querySelector('.inline-form input[id="field-name"]') as HTMLInputElement;
    expect(nameInput).toBeTruthy();
    fireEvent.input(nameInput, { target: { value: 'new-bot' } });

    // Submit
    const createBtn = container.querySelector('.inline-form-actions .btn') as HTMLButtonElement;
    fireEvent.click(createBtn);

    await waitFor(() => {
      expect(vi.mocked(api.POST)).toHaveBeenCalledWith('/v1/wallets', expect.objectContaining({
        body: expect.objectContaining({
          name: 'new-bot',
          chain: 'solana',
          environment: 'testnet',
        }),
      }));
    });

    await waitFor(() => {
      expect(vi.mocked(showToast)).toHaveBeenCalledWith('success', 'Wallet created with session');
    });
  });

  it('shows error when create wallet fails', async () => {
    vi.mocked(api.GET).mockImplementation(async (path: string) => {
      if (path === '/v1/wallets') return { data: mockWalletList };
      return { data: {} };
    });

    vi.mocked(api.POST).mockRejectedValueOnce(new ApiError(400, 'NAME_TAKEN', 'Name taken'));

    const { container } = render(<WalletsPage />);

    await waitFor(() => {
      expect(screen.getByText('Create Wallet')).toBeTruthy();
    });

    fireEvent.click(screen.getByText('Create Wallet'));

    await waitFor(() => {
      expect(container.querySelector('.inline-form')).toBeTruthy();
    });

    const nameInput = container.querySelector('.inline-form input[id="field-name"]') as HTMLInputElement;
    fireEvent.input(nameInput, { target: { value: 'dup-bot' } });

    const createBtn = container.querySelector('.inline-form-actions .btn') as HTMLButtonElement;
    fireEvent.click(createBtn);

    await waitFor(() => {
      expect(screen.getByText('Error: NAME_TAKEN')).toBeTruthy();
    });
  });

  it('validates name required', async () => {
    vi.mocked(api.GET).mockImplementation(async (path: string) => {
      if (path === '/v1/wallets') return { data: mockWalletList };
      return { data: {} };
    });

    const { container } = render(<WalletsPage />);

    await waitFor(() => {
      expect(screen.getByText('Create Wallet')).toBeTruthy();
    });

    fireEvent.click(screen.getByText('Create Wallet'));

    await waitFor(() => {
      expect(container.querySelector('.inline-form')).toBeTruthy();
    });

    // Don't fill name, just submit
    const createBtn = container.querySelector('.inline-form-actions .btn') as HTMLButtonElement;
    fireEvent.click(createBtn);

    await waitFor(() => {
      expect(screen.getByText('Name is required')).toBeTruthy();
    });
  });

  it('cancels create wallet form', async () => {
    vi.mocked(api.GET).mockImplementation(async (path: string) => {
      if (path === '/v1/wallets') return { data: mockWalletList };
      return { data: {} };
    });

    const { container } = render(<WalletsPage />);

    await waitFor(() => {
      expect(screen.getByText('Create Wallet')).toBeTruthy();
    });

    fireEvent.click(screen.getByText('Create Wallet'));

    await waitFor(() => {
      expect(container.querySelector('.inline-form')).toBeTruthy();
    });

    // Click Cancel button
    fireEvent.click(screen.getByText('Cancel'));

    await waitFor(() => {
      expect(container.querySelector('.inline-form')).toBeNull();
    });
  });

  it('shows Account Type selector when chain is ethereum', async () => {
    vi.mocked(api.GET).mockImplementation(async (path: string) => {
      if (path === '/v1/wallets') return { data: mockWalletList };
      return { data: {} };
    });

    const { container } = render(<WalletsPage />);

    await waitFor(() => {
      expect(screen.getByText('Create Wallet')).toBeTruthy();
    });

    fireEvent.click(screen.getByText('Create Wallet'));

    await waitFor(() => {
      expect(container.querySelector('.inline-form')).toBeTruthy();
    });

    // Select Ethereum chain
    const chainSelect = container.querySelector('select[name="chain"]') as HTMLSelectElement;
    expect(chainSelect).toBeTruthy();
    fireEvent.change(chainSelect, { target: { value: 'ethereum' } });

    // Account Type selector should appear
    await waitFor(() => {
      expect(container.querySelector('select[name="accountType"]')).toBeTruthy();
    });
  });

  it('creates smart account wallet with accountType in POST body', async () => {
    vi.mocked(api.GET).mockImplementation(async (path: string) => {
      if (path === '/v1/wallets') return { data: mockWalletList };
      return { data: {} };
    });
    vi.mocked(api.POST).mockResolvedValue({ data: {
      id: 'w-smart',
      name: 'smart-test',
      chain: 'ethereum',
      network: 'ethereum-sepolia',
      environment: 'testnet',
      publicKey: '0xsmart123',
      status: 'ACTIVE',
      accountType: 'smart',
      session: { id: 's1', token: 'wai_sess_abc', expiresAt: 999 },
    } });

    const { container } = render(<WalletsPage />);

    await waitFor(() => {
      expect(screen.getByText('Create Wallet')).toBeTruthy();
    });

    fireEvent.click(screen.getByText('Create Wallet'));

    await waitFor(() => {
      expect(container.querySelector('.inline-form')).toBeTruthy();
    });

    // Fill in name
    const nameInput = container.querySelector('input[name="name"]') as HTMLInputElement;
    fireEvent.input(nameInput, { target: { value: 'smart-test' } });

    // Select Ethereum chain
    const chainSelect = container.querySelector('select[name="chain"]') as HTMLSelectElement;
    fireEvent.change(chainSelect, { target: { value: 'ethereum' } });

    // Select Smart Account type
    await waitFor(() => {
      expect(container.querySelector('select[name="accountType"]')).toBeTruthy();
    });
    const accountTypeSelect = container.querySelector('select[name="accountType"]') as HTMLSelectElement;
    fireEvent.change(accountTypeSelect, { target: { value: 'smart' } });

    // Click Create
    fireEvent.click(screen.getByText('Create'));

    await waitFor(() => {
      expect(vi.mocked(api.POST)).toHaveBeenCalledWith(
        '/v1/wallets',
        expect.objectContaining({
          body: expect.objectContaining({
            name: 'smart-test',
            chain: 'ethereum',
            accountType: 'smart',
          }),
        }),
      );
    });
  });

  it('shows error toast when wallet list fetch fails', async () => {
    vi.mocked(api.GET).mockRejectedValue(new ApiError(500, 'FETCH_FAIL', 'Failed'));

    render(<WalletsPage />);

    await waitFor(() => {
      expect(vi.mocked(showToast)).toHaveBeenCalledWith('error', 'Error: FETCH_FAIL');
    });
  });
});

// ---------------------------------------------------------------------------
// Wallet Tabs (RPC, Monitoring, WalletConnect)
// ---------------------------------------------------------------------------

describe('WalletListWithTabs - Tab switching', () => {
  beforeEach(() => { currentPath.value = '/wallets'; });
  afterEach(() => { cleanup(); vi.clearAllMocks(); });

  function setupTabMocks() {
    vi.mocked(api.GET).mockImplementation(async (path: string) => {
      if (path === '/v1/wallets') return { data: mockWalletList };
      if (path === '/v1/admin/settings') return { data: mockSettingsData };
      return { data: {} };
    });
  }

  it('switches to RPC Endpoints tab', async () => {
    setupTabMocks();

    render(<WalletsPage />);

    await waitFor(() => {
      expect(screen.getByText('RPC Endpoints')).toBeTruthy();
    });

    fireEvent.click(screen.getByText('RPC Endpoints'));

    await waitFor(() => {
      expect(screen.getByText('Solana')).toBeTruthy();
      expect(screen.getByText('EVM')).toBeTruthy();
    });
  });

  it('switches to WalletConnect tab', async () => {
    setupTabMocks();

    render(<WalletsPage />);

    // WalletConnect tab - note it appears in both the detail view and the tab
    const tabs = screen.getAllByText('WalletConnect');
    fireEvent.click(tabs[0]);

    await waitFor(() => {
      expect(screen.getByText(/WalletConnect Cloud/)).toBeTruthy();
    });
  });
});

describe('RpcEndpointsTab', () => {
  beforeEach(() => { currentPath.value = '/wallets'; });
  afterEach(() => { cleanup(); vi.clearAllMocks(); });

  it('renders network sections and expands to show URLs', async () => {
    vi.mocked(api.GET).mockImplementation(async (path: string) => {
      if (path === '/v1/wallets') return { data: mockWalletList };
      if (path === '/v1/admin/settings') return { data: mockSettingsData };
      if (path === '/v1/admin/rpc-status') return { data: {
        networks: {},
        builtinUrls: {
'solana-mainnet': ['https://api.mainnet-beta.solana.com'],
'solana-devnet': ['https://api.devnet.solana.com'],
'solana-testnet': ['https://api.testnet.solana.com'],
        },
      } };
      return { data: {} };
    });

    render(<WalletsPage />);

    fireEvent.click(screen.getByText('RPC Endpoints'));

    await waitFor(() => {
      expect(screen.getByText('Solana')).toBeTruthy();
      expect(screen.getByText('EVM')).toBeTruthy();
    });

    // Expand Solana Devnet to see URL list
    fireEvent.click(screen.getByText('Solana Devnet'));

    await waitFor(() => {
      expect(screen.getByText('https://api.devnet.solana.com')).toBeTruthy();
    });
  });

  it('shows test button inside expanded network section', async () => {
    vi.mocked(api.GET).mockImplementation(async (path: string) => {
      if (path === '/v1/wallets') return { data: mockWalletList };
      if (path === '/v1/admin/settings') return { data: mockSettingsData };
      if (path === '/v1/admin/rpc-status') return { data: {
        networks: {},
        builtinUrls: {
'solana-mainnet': ['https://api.mainnet-beta.solana.com'],
'solana-devnet': ['https://api.devnet.solana.com'],
'solana-testnet': ['https://api.testnet.solana.com'],
        },
      } };
      return { data: {} };
    });
    vi.mocked(api.POST).mockResolvedValueOnce({ data: { success: true, latencyMs: 150, blockNumber: 12345 } });

    render(<WalletsPage />);

    fireEvent.click(screen.getByText('RPC Endpoints'));

    await waitFor(() => {
      expect(screen.getByText('Solana')).toBeTruthy();
    });

    // Expand Solana Mainnet to see Test buttons
    fireEvent.click(screen.getByText('Solana Mainnet'));

    await waitFor(() => {
      expect(screen.getAllByText('Test').length).toBeGreaterThan(0);
    });

    fireEvent.click(screen.getAllByText('Test')[0]);

    await waitFor(() => {
      expect(vi.mocked(api.POST)).toHaveBeenCalledWith('/v1/admin/settings/test-rpc', expect.objectContaining({
        body: expect.objectContaining({ chain: 'solana' }),
      }));
    });
  });
});

describe('WalletConnectTab', () => {
  beforeEach(() => { currentPath.value = '/wallets'; });
  afterEach(() => { cleanup(); vi.clearAllMocks(); });

  it('saves WalletConnect settings', async () => {
    vi.mocked(api.GET).mockImplementation(async (path: string) => {
      if (path === '/v1/wallets') return { data: mockWalletList };
      if (path === '/v1/admin/settings') return { data: mockSettingsData };
      return { data: {} };
    });
    vi.mocked(api.PUT).mockResolvedValueOnce({ data: { updated: 1, settings: mockSettingsData } });

    render(<WalletsPage />);

    const tabs = screen.getAllByText('WalletConnect');
    fireEvent.click(tabs[0]);

    await waitFor(() => {
      expect(screen.getByLabelText('Project Id')).toBeTruthy();
    });

    const projectInput = screen.getByLabelText('Project Id') as HTMLInputElement;
    fireEvent.input(projectInput, { target: { value: 'new-project-id' } });

    await waitFor(() => {
      expect(screen.getByText('Save')).toBeTruthy();
    });

    fireEvent.click(screen.getByText('Save'));

    await waitFor(() => {
      expect(vi.mocked(api.PUT)).toHaveBeenCalledWith('/v1/admin/settings', expect.objectContaining({
        body: { settings: expect.arrayContaining([
          expect.objectContaining({ key: 'walletconnect.project_id', value: 'new-project-id' }),
        ]) },
      }));
    });
  });
});

// ---------------------------------------------------------------------------
// Deprecated Smart Account warning + Factory supported networks (v31.3)
// ---------------------------------------------------------------------------

describe('Smart Account deprecated warning and factory networks', () => {
  beforeEach(() => { currentPath.value = '/wallets/test-wallet-1'; });
  afterEach(() => { cleanup(); vi.clearAllMocks(); });

  const mockSmartWalletDeprecated = {
    ...mockWalletDetail,
    chain: 'evm',
    network: 'ethereum-sepolia',
    accountType: 'smart',
    factoryAddress: '0x5d82735936c6Cd5DE57cC3c1A799f6B2E6F933Df',
    factorySupportedNetworks: null,
    factoryVerifiedOnNetwork: null,
    deployed: false,
  };

  const mockSmartWalletWithNetworks = {
    ...mockWalletDetail,
    chain: 'evm',
    network: 'ethereum-sepolia',
    accountType: 'smart',
    factoryAddress: '0x1234567890abcdef1234567890abcdef12345678',
    factorySupportedNetworks: ['ethereum-mainnet', 'ethereum-sepolia', 'polygon-mainnet'],
    factoryVerifiedOnNetwork: true,
    deployed: true,
  };

  it('renders deprecated warning banner for Smart Account with Solady factory', async () => {
    vi.mocked(api.GET).mockImplementation(async (path: string) => {
      if (path === '/v1/wallets/{id}') return { data: mockSmartWalletDeprecated };
      if (path.includes('/networks')) return { data: mockNetworks };
      if (path.includes('/balance')) return { data: mockBalance };
      if (path.includes('/transactions')) return { data: mockTransactions };
      if (path.includes('/wc/session')) throw new Error('No session');
      return { data: {} };
    });

    render(<WalletsPage />);

    await waitFor(() => {
      expect(screen.getByText('Deprecated Smart Account')).toBeTruthy();
    });

    expect(screen.getByText(/This Smart Account uses a deprecated factory/)).toBeTruthy();
  });

  it('does not render deprecated warning for Smart Account with different factory', async () => {
    vi.mocked(api.GET).mockImplementation(async (path: string) => {
      if (path === '/v1/wallets/{id}') return { data: mockSmartWalletWithNetworks };
      if (path.includes('/networks')) return { data: mockNetworks };
      if (path.includes('/balance')) return { data: mockBalance };
      if (path.includes('/transactions')) return { data: mockTransactions };
      if (path.includes('/wc/session')) throw new Error('No session');
      return { data: {} };
    });

    render(<WalletsPage />);

    await waitFor(() => {
      expect(screen.getByText('trading-bot')).toBeTruthy();
    });

    expect(screen.queryByText('Deprecated Smart Account')).toBeNull();
  });

  it('renders factory supported networks badges', async () => {
    vi.mocked(api.GET).mockImplementation(async (path: string) => {
      if (path === '/v1/wallets/{id}') return { data: mockSmartWalletWithNetworks };
      if (path.includes('/networks')) return { data: mockNetworks };
      if (path.includes('/balance')) return { data: mockBalance };
      if (path.includes('/transactions')) return { data: mockTransactions };
      if (path.includes('/wc/session')) throw new Error('No session');
      return { data: {} };
    });

    render(<WalletsPage />);

    await waitFor(() => {
      expect(screen.getByText('trading-bot')).toBeTruthy();
    });

    // Should render Factory Networks section with network badges
    expect(screen.getByText('Factory Networks')).toBeTruthy();
    expect(screen.getByText('ethereum-mainnet')).toBeTruthy();
    expect(screen.getByText('ethereum-sepolia')).toBeTruthy();
    expect(screen.getByText('polygon-mainnet')).toBeTruthy();
  });

  it('renders Smart Account badge in detail view', async () => {
    vi.mocked(api.GET).mockImplementation(async (path: string) => {
      if (path === '/v1/wallets/{id}') return { data: mockSmartWalletWithNetworks };
      if (path.includes('/networks')) return { data: mockNetworks };
      if (path.includes('/balance')) return { data: mockBalance };
      if (path.includes('/transactions')) return { data: mockTransactions };
      if (path.includes('/wc/session')) throw new Error('No session');
      return { data: {} };
    });

    render(<WalletsPage />);

    await waitFor(() => {
      expect(screen.getByText('Smart Account')).toBeTruthy();
    });
  });
});

