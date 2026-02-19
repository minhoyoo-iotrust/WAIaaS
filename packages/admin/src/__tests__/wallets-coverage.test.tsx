/**
 * wallets-coverage.test.tsx
 *
 * Supplemental coverage tests for wallets.tsx WalletDetailView functions:
 * - fetchWallet, handleSaveName, handleDelete, startEdit, cancelEdit
 * - handleMcpSetup, fetchNetworks, fetchBalance, fetchTransactions
 * - fetchWcSession, handleWcConnect, handleWcDisconnect
 * - startEditOwner, cancelEditOwner, handleSaveOwner
 * - handleChangeDefaultNetwork
 * - Error handling branches
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

import { apiGet, apiPost, apiPut, apiDelete, ApiError } from '../api/client';
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
  network: 'devnet',
  environment: 'testnet',
  publicKey: 'ABC123DEF456GHI789JKL012MNO345PQR678STU901',
  status: 'ACTIVE',
  ownerAddress: null,
  ownerState: 'NONE' as const,
  ownerVerified: null,
  createdAt: 1707609600,
  updatedAt: null,
  defaultNetwork: 'devnet',
};

const mockWalletWithOwner = {
  ...mockWalletDetail,
  ownerAddress: '0xABCDEF1234567890ABCDEF1234567890ABCDEF12',
  ownerState: 'GRACE' as const,
};

const mockNetworks = {
  availableNetworks: [
    { network: 'devnet', name: 'Devnet', isDefault: true },
    { network: 'testnet', name: 'Testnet', isDefault: false },
    { network: 'mainnet', name: 'Mainnet', isDefault: false },
  ],
};

const mockBalance = {
  balances: [
    {
      network: 'devnet',
      isDefault: true,
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
      network: 'devnet',
      txHash: 'abcdef1234567890',
      createdAt: 1707609600,
    },
    {
      id: 'tx-2',
      type: 'TOKEN_TRANSFER',
      status: 'FAILED',
      toAddress: null,
      amount: null,
      network: 'devnet',
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
  vi.mocked(apiGet).mockImplementation(async (path: string) => {
    if (path === `/v1/wallets/${wallet.id}`) return wallet;
    if (path === `/v1/wallets/${wallet.id}/networks`) return mockNetworks;
    if (path === `/v1/admin/wallets/${wallet.id}/balance`) return mockBalance;
    if (path === `/v1/admin/wallets/${wallet.id}/transactions`) return mockTransactions;
    if (path === `/v1/wallets/${wallet.id}/wc/session`) throw new Error('No session');
    return {};
  });
}

async function renderAndWaitForDetail() {
  render(<WalletsPage />);
  await waitFor(() => {
    expect(screen.getByText('trading-bot')).toBeTruthy();
  });
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
    expect(screen.getByText('Default Network')).toBeTruthy();
    // 'devnet' appears multiple times (detail row + networks list), use getAllByText
    expect(screen.getAllByText('devnet').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Balances')).toBeTruthy();
    expect(screen.getByText('Available Networks')).toBeTruthy();
    expect(screen.getByText('Recent Transactions')).toBeTruthy();
    expect(screen.getByText('Owner Wallet')).toBeTruthy();
    expect(screen.getByText('MCP Setup')).toBeTruthy();
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

  it('renders available networks with default badge', async () => {
    mockDetailApiCalls();
    await renderAndWaitForDetail();

    await waitFor(() => {
      expect(screen.getByText('Devnet')).toBeTruthy();
    });
    expect(screen.getAllByText('Default').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Testnet')).toBeTruthy();
  });

  it('renders transactions with status badges', async () => {
    mockDetailApiCalls();
    await renderAndWaitForDetail();

    await waitFor(() => {
      expect(screen.getByText('CONFIRMED')).toBeTruthy();
    });
    expect(screen.getByText('FAILED')).toBeTruthy();
    expect(screen.getByText('PENDING')).toBeTruthy();
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

    vi.mocked(apiPut).mockResolvedValueOnce({ ...mockWalletDetail, name: 'renamed-bot' });

    // Click edit (pencil) button
    const editBtn = screen.getByTitle('Edit name');
    fireEvent.click(editBtn);

    // Change name
    const editInput = screen.getByDisplayValue('trading-bot');
    fireEvent.input(editInput, { target: { value: 'renamed-bot' } });

    // Save
    fireEvent.click(screen.getByText('Save'));

    await waitFor(() => {
      expect(vi.mocked(apiPut)).toHaveBeenCalledWith('/v1/wallets/test-wallet-1', {
        name: 'renamed-bot',
      });
    });

    await waitFor(() => {
      expect(vi.mocked(showToast)).toHaveBeenCalledWith('success', 'Wallet name updated');
    });
  });

  it('handles save name error', async () => {
    mockDetailApiCalls();
    await renderAndWaitForDetail();

    vi.mocked(apiPut).mockRejectedValueOnce(new ApiError(400, 'INVALID_NAME', 'Bad name'));

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

    vi.mocked(apiDelete).mockResolvedValueOnce(undefined);

    fireEvent.click(screen.getByText('Terminate Wallet'));

    await waitFor(() => {
      expect(screen.getByText(/Are you sure you want to terminate wallet/)).toBeTruthy();
    });

    fireEvent.click(screen.getByText('Terminate'));

    await waitFor(() => {
      expect(vi.mocked(apiDelete)).toHaveBeenCalledWith('/v1/wallets/test-wallet-1');
    });

    await waitFor(() => {
      expect(vi.mocked(showToast)).toHaveBeenCalledWith('success', 'Wallet terminated');
    });
  });

  it('handles delete error', async () => {
    mockDetailApiCalls();
    await renderAndWaitForDetail();

    vi.mocked(apiDelete).mockRejectedValueOnce(new ApiError(500, 'DELETE_FAIL', 'Failed'));

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

describe('WalletDetailView: handleMcpSetup', () => {
  beforeEach(() => { currentPath.value = '/wallets/test-wallet-1'; });
  afterEach(() => { cleanup(); vi.clearAllMocks(); });

  it('provisions MCP token on click', async () => {
    mockDetailApiCalls();
    await renderAndWaitForDetail();

    vi.mocked(apiPost).mockResolvedValueOnce(mockMcpResult);

    fireEvent.click(screen.getByText('Setup MCP'));

    await waitFor(() => {
      expect(vi.mocked(apiPost)).toHaveBeenCalledWith('/v1/mcp/tokens', {
        walletId: 'test-wallet-1',
      });
    });

    await waitFor(() => {
      expect(vi.mocked(showToast)).toHaveBeenCalledWith('success', 'MCP token provisioned successfully');
    });

    // MCP result should be displayed
    await waitFor(() => {
      expect(screen.getByText('Token Path')).toBeTruthy();
      expect(screen.getByText('Claude Desktop Config')).toBeTruthy();
    });
  });

  it('handles MCP setup error', async () => {
    mockDetailApiCalls();
    await renderAndWaitForDetail();

    vi.mocked(apiPost).mockRejectedValueOnce(new ApiError(500, 'MCP_ERROR', 'Failed'));

    fireEvent.click(screen.getByText('Setup MCP'));

    await waitFor(() => {
      expect(vi.mocked(showToast)).toHaveBeenCalledWith('error', 'Error: MCP_ERROR');
    });
  });

  it('shows Re-provision button after initial setup', async () => {
    mockDetailApiCalls();
    await renderAndWaitForDetail();

    vi.mocked(apiPost).mockResolvedValueOnce(mockMcpResult);
    fireEvent.click(screen.getByText('Setup MCP'));

    await waitFor(() => {
      expect(screen.getByText('Re-provision')).toBeTruthy();
    });
  });
});

describe('WalletDetailView: handleChangeDefaultNetwork', () => {
  beforeEach(() => { currentPath.value = '/wallets/test-wallet-1'; });
  afterEach(() => { cleanup(); vi.clearAllMocks(); });

  it('changes default network on Set Default click', async () => {
    mockDetailApiCalls();
    await renderAndWaitForDetail();

    vi.mocked(apiPut).mockResolvedValueOnce(undefined);

    await waitFor(() => {
      const setDefaultButtons = screen.getAllByText('Set Default');
      expect(setDefaultButtons.length).toBeGreaterThan(0);
    });

    // Click "Set Default" on testnet (first non-default network)
    const setDefaultButtons = screen.getAllByText('Set Default');
    fireEvent.click(setDefaultButtons[0]!);

    await waitFor(() => {
      expect(vi.mocked(apiPut)).toHaveBeenCalledWith(
        '/v1/wallets/test-wallet-1/default-network',
        { network: 'testnet' },
      );
    });

    await waitFor(() => {
      expect(vi.mocked(showToast)).toHaveBeenCalledWith('success', 'Default network changed to testnet');
    });
  });

  it('handles change default network error', async () => {
    mockDetailApiCalls();
    await renderAndWaitForDetail();

    vi.mocked(apiPut).mockRejectedValueOnce(new ApiError(500, 'NET_ERROR', 'Failed'));

    await waitFor(() => {
      expect(screen.getAllByText('Set Default').length).toBeGreaterThan(0);
    });

    fireEvent.click(screen.getAllByText('Set Default')[0]!);

    await waitFor(() => {
      expect(vi.mocked(showToast)).toHaveBeenCalledWith('error', 'Error: NET_ERROR');
    });
  });
});

describe('WalletDetailView: owner address', () => {
  beforeEach(() => { currentPath.value = '/wallets/test-wallet-1'; });
  afterEach(() => { cleanup(); vi.clearAllMocks(); });

  it('shows Set Owner Address button for NONE state', async () => {
    mockDetailApiCalls();
    await renderAndWaitForDetail();

    expect(screen.getByText('Set Owner Address')).toBeTruthy();
    expect(screen.getByText('NONE')).toBeTruthy();
  });

  it('handleSaveOwner: saves owner address', async () => {
    mockDetailApiCalls();
    await renderAndWaitForDetail();

    vi.mocked(apiPut).mockResolvedValueOnce({
      ownerAddress: '0xNEW_OWNER_ADDRESS',
      ownerState: 'GRACE',
    });

    // Click Set Owner Address
    fireEvent.click(screen.getByText('Set Owner Address'));

    // Enter address in the inline edit
    const ownerInput = screen.getByPlaceholderText('Enter owner wallet address');
    fireEvent.input(ownerInput, { target: { value: '0xNEW_OWNER_ADDRESS' } });

    // Click Save
    const saveButtons = screen.getAllByText('Save');
    fireEvent.click(saveButtons[saveButtons.length - 1]!);

    await waitFor(() => {
      expect(vi.mocked(apiPut)).toHaveBeenCalledWith('/v1/wallets/test-wallet-1/owner', {
        owner_address: '0xNEW_OWNER_ADDRESS',
      });
    });

    await waitFor(() => {
      expect(vi.mocked(showToast)).toHaveBeenCalledWith('success', 'Owner address updated');
    });
  });

  it('handleSaveOwner: shows error for empty address', async () => {
    mockDetailApiCalls();
    await renderAndWaitForDetail();

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

    vi.mocked(apiPut).mockRejectedValueOnce(new ApiError(400, 'INVALID_ADDRESS', 'Bad'));

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
      expect(screen.getByText('GRACE')).toBeTruthy();
    });

    expect(screen.getByText('Verify Owner')).toBeTruthy();
  });
});

describe('WalletDetailView: WalletConnect', () => {
  beforeEach(() => { currentPath.value = '/wallets/test-wallet-1'; });
  afterEach(() => { cleanup(); vi.clearAllMocks(); });

  it('shows Connect Wallet button when owner is set and no session', async () => {
    mockDetailApiCalls(mockWalletWithOwner);
    render(<WalletsPage />);

    await waitFor(() => {
      expect(screen.getByText('Connect Wallet')).toBeTruthy();
    });
  });

  it('shows message when no owner is set', async () => {
    mockDetailApiCalls();
    await renderAndWaitForDetail();

    expect(screen.getByText('Set an Owner address first to enable WalletConnect.')).toBeTruthy();
  });

  it('handleWcConnect: initiates pairing', async () => {
    mockDetailApiCalls(mockWalletWithOwner);

    vi.mocked(apiPost).mockResolvedValueOnce({
      uri: 'wc:abc123',
      qrCode: 'data:image/png;base64,ABC',
      expiresAt: 1708214400,
    });

    render(<WalletsPage />);

    await waitFor(() => {
      expect(screen.getByText('Connect Wallet')).toBeTruthy();
    });

    fireEvent.click(screen.getByText('Connect Wallet'));

    await waitFor(() => {
      expect(vi.mocked(apiPost)).toHaveBeenCalledWith('/v1/wallets/test-wallet-1/wc/pair');
    });

    // QR modal should open
    await waitFor(() => {
      expect(screen.getByText('Scan QR Code')).toBeTruthy();
    });
  });

  it('handleWcConnect error', async () => {
    mockDetailApiCalls(mockWalletWithOwner);

    vi.mocked(apiPost).mockRejectedValueOnce(new ApiError(500, 'WC_ERROR', 'Failed'));

    render(<WalletsPage />);

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
    vi.mocked(apiGet).mockImplementation(async (path: string) => {
      if (path === '/v1/wallets/test-wallet-1') return mockWalletWithOwner;
      if (path === '/v1/wallets/test-wallet-1/networks') return mockNetworks;
      if (path === '/v1/admin/wallets/test-wallet-1/balance') return mockBalance;
      if (path === '/v1/admin/wallets/test-wallet-1/transactions') return mockTransactions;
      if (path === '/v1/wallets/test-wallet-1/wc/session') return mockWcSession;
      return {};
    });
    vi.mocked(apiDelete).mockResolvedValueOnce(undefined);

    render(<WalletsPage />);

    await waitFor(() => {
      expect(screen.getByText('Connected')).toBeTruthy();
    });

    expect(screen.getByText('MetaMask')).toBeTruthy();

    fireEvent.click(screen.getByText('Disconnect'));

    await waitFor(() => {
      expect(vi.mocked(apiDelete)).toHaveBeenCalledWith('/v1/wallets/test-wallet-1/wc/session');
    });

    await waitFor(() => {
      expect(vi.mocked(showToast)).toHaveBeenCalledWith('success', 'WalletConnect session disconnected');
    });
  });

  it('handleWcDisconnect error', async () => {
    vi.mocked(apiGet).mockImplementation(async (path: string) => {
      if (path === '/v1/wallets/test-wallet-1') return mockWalletWithOwner;
      if (path === '/v1/wallets/test-wallet-1/networks') return mockNetworks;
      if (path === '/v1/admin/wallets/test-wallet-1/balance') return mockBalance;
      if (path === '/v1/admin/wallets/test-wallet-1/transactions') return mockTransactions;
      if (path === '/v1/wallets/test-wallet-1/wc/session') return mockWcSession;
      return {};
    });
    vi.mocked(apiDelete).mockRejectedValueOnce(new ApiError(500, 'WC_DC_ERROR', 'Failed'));

    render(<WalletsPage />);

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
    vi.mocked(apiGet).mockImplementation(async (path: string) => {
      if (path === '/v1/wallets/test-wallet-1') throw new ApiError(404, 'NOT_FOUND', 'Wallet not found');
      if (path.includes('/networks')) return mockNetworks;
      if (path.includes('/balance')) return mockBalance;
      if (path.includes('/transactions')) return mockTransactions;
      if (path.includes('/wc/session')) throw new Error('No session');
      return {};
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
    vi.mocked(apiGet).mockImplementation(async (path: string) => {
      if (path === '/v1/wallets/test-wallet-1') return mockWalletDetail;
      if (path.includes('/networks')) throw new ApiError(500, 'NET_FAIL', 'Failed');
      if (path.includes('/balance')) return mockBalance;
      if (path.includes('/transactions')) return mockTransactions;
      if (path.includes('/wc/session')) throw new Error('No session');
      return {};
    });

    render(<WalletsPage />);

    await waitFor(() => {
      expect(vi.mocked(showToast)).toHaveBeenCalledWith('error', 'Error: NET_FAIL');
    });
  });

  it('handles balance fetch returning null', async () => {
    vi.mocked(apiGet).mockImplementation(async (path: string) => {
      if (path === '/v1/wallets/test-wallet-1') return mockWalletDetail;
      if (path.includes('/networks')) return mockNetworks;
      if (path.includes('/balance')) throw new Error('No balance');
      if (path.includes('/transactions')) return mockTransactions;
      if (path.includes('/wc/session')) throw new Error('No session');
      return {};
    });

    render(<WalletsPage />);

    await waitFor(() => {
      expect(screen.getByText('No balance data available')).toBeTruthy();
    });
  });

  it('handles transactions fetch returning empty', async () => {
    vi.mocked(apiGet).mockImplementation(async (path: string) => {
      if (path === '/v1/wallets/test-wallet-1') return mockWalletDetail;
      if (path.includes('/networks')) return mockNetworks;
      if (path.includes('/balance')) return mockBalance;
      if (path.includes('/transactions')) throw new Error('No transactions');
      if (path.includes('/wc/session')) throw new Error('No session');
      return {};
    });

    render(<WalletsPage />);

    await waitFor(() => {
      expect(screen.getByText('No transactions yet')).toBeTruthy();
    });
  });
});

describe('WalletDetailView: balance with no tokens', () => {
  beforeEach(() => { currentPath.value = '/wallets/test-wallet-1'; });
  afterEach(() => { cleanup(); vi.clearAllMocks(); });

  it('shows native balance when no tokens exist', async () => {
    vi.mocked(apiGet).mockImplementation(async (path: string) => {
      if (path === '/v1/wallets/test-wallet-1') return mockWalletDetail;
      if (path.includes('/networks')) return mockNetworks;
      if (path.includes('/balance')) return { balances: [{ network: 'devnet', isDefault: true, native: { balance: '1.0', symbol: 'SOL' }, tokens: [] }] };
      if (path.includes('/transactions')) return mockTransactions;
      if (path.includes('/wc/session')) throw new Error('No session');
      return {};
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
    vi.mocked(apiGet).mockImplementation(async (path: string) => {
      if (path === '/v1/wallets/test-wallet-1') return mockWalletDetail;
      if (path.includes('/networks')) return mockNetworks;
      if (path.includes('/balance')) return { balances: [{ network: 'devnet', isDefault: true, native: null, tokens: [], error: 'RPC unavailable' }] };
      if (path.includes('/transactions')) return mockTransactions;
      if (path.includes('/wc/session')) throw new Error('No session');
      return {};
    });

    render(<WalletsPage />);

    await waitFor(() => {
      expect(screen.getByText('RPC unavailable')).toBeTruthy();
    });
  });
});
