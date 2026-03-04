import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/preact';

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

vi.mock('../utils/display-currency', async () => {
  const actual = await vi.importActual<typeof import('../utils/display-currency')>('../utils/display-currency');
  return {
    ...actual,
    fetchDisplayCurrency: vi.fn(),
  };
});

import { apiGet } from '../api/client';
import { fetchDisplayCurrency } from '../utils/display-currency';
import DashboardPage from '../pages/dashboard';

const mockStatus = {
  status: 'running',
  version: '2.0.0',
  latestVersion: null as string | null,
  updateAvailable: false,
  uptime: 3600,
  walletCount: 4,
  activeSessionCount: 7,
  killSwitchState: 'NORMAL',
  adminTimeout: 900,
  timestamp: Math.floor(Date.now() / 1000),
  policyCount: 5,
  recentTxCount: 10,
  failedTxCount: 8,
  recentTransactions: [
    {
      id: 'tx-1',
      walletId: 'w-1',
      walletName: 'Wallet A',
      type: 'TRANSFER',
      status: 'CONFIRMED',
      toAddress: '0x1234',
      amount: '1.0',
      amountUsd: 2000,
      network: 'ethereum-mainnet',
      txHash: '0xabc123def456789000000000000000000000000000000000',
      createdAt: Math.floor(Date.now() / 1000),
    },
    {
      id: 'tx-2',
      walletId: 'w-2',
      walletName: null,
      type: 'TOKEN_TRANSFER',
      status: 'APPROVED',
      toAddress: null,
      amount: null,
      amountUsd: null,
      network: 'devnet',
      txHash: null,
      createdAt: null,
    },
  ],
};

const mockApprovalResponse = { items: [], total: 13, offset: 0, limit: 1 };
const mockSettingsResponse = { display: { 'display.currency': 'USD' } };

function setupMocks(approvalResponse = mockApprovalResponse) {
  vi.mocked(apiGet).mockImplementation((url: string) => {
    if (url === '/v1/admin/status') return Promise.resolve(mockStatus);
    if (url.startsWith('/v1/admin/transactions?status=APPROVED')) return Promise.resolve(approvalResponse);
    if (url.includes('/v1/admin/stats')) return Promise.reject(new Error('not found'));
    if (url.includes('/v1/admin/defi/positions')) return Promise.reject(new Error('not found'));
    if (url === '/v1/admin/settings') return Promise.resolve(mockSettingsResponse);
    return Promise.resolve({});
  });
  vi.mocked(fetchDisplayCurrency).mockResolvedValue({ currency: 'USD', rate: 1 });
}

describe('Dashboard Transactions Features', () => {
  beforeEach(() => {
    setupMocks();
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('renders Approval Pending card with count from API', async () => {
    render(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByText('Approval Pending')).toBeTruthy();
    });

    // The approval count should be 13 (from mockApprovalResponse.total)
    await waitFor(() => {
      expect(vi.mocked(apiGet)).toHaveBeenCalledWith(
        '/v1/admin/transactions?status=APPROVED&limit=1',
      );
    });

    // Badge with "13" should appear in the Approval Pending card (warning badge since > 0)
    await waitFor(() => {
      const label = screen.getByText('Approval Pending');
      const card = label.closest('a');
      const badge = card?.querySelector('.badge-warning');
      expect(badge).toBeTruthy();
      expect(badge!.textContent).toBe('13');
    });
  });

  it('Approval Pending card links to /transactions?status=APPROVED', async () => {
    render(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByText('Approval Pending')).toBeTruthy();
    });

    // Find the anchor wrapping the Approval Pending card
    const approvalLabel = screen.getByText('Approval Pending');
    const card = approvalLabel.closest('a');
    expect(card).toBeTruthy();
    expect(card!.getAttribute('href')).toBe('#/transactions?status=APPROVED');
  });

  it('Failed Txns card links to /transactions?status=FAILED', async () => {
    render(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByText('Failed Txns (24h)')).toBeTruthy();
    });

    const failedLabel = screen.getByText('Failed Txns (24h)');
    const card = failedLabel.closest('a');
    expect(card).toBeTruthy();
    expect(card!.getAttribute('href')).toBe('#/transactions?status=FAILED');
  });

  it('Recent Txns card links to /transactions', async () => {
    render(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByText('Recent Txns (24h)')).toBeTruthy();
    });

    const recentLabel = screen.getByText('Recent Txns (24h)');
    const card = recentLabel.closest('a');
    expect(card).toBeTruthy();
    expect(card!.getAttribute('href')).toBe('#/transactions');
  });

  it('Recent Activity table shows Network column', async () => {
    render(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByText('Network')).toBeTruthy();
    });

    // tx-1 has network "ethereum-mainnet"
    expect(screen.getByText('ethereum-mainnet')).toBeTruthy();
  });

  it('Recent Activity table shows Tx Hash column with explorer link', async () => {
    render(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByText('Tx Hash')).toBeTruthy();
    });

    // tx-1 has txHash and network=ethereum-mainnet, so it should render as an etherscan link
    const link = await waitFor(() => {
      const links = screen.getAllByRole('link');
      return links.find((a) => {
        const href = a.getAttribute('href');
        return href?.includes('etherscan.io/tx/');
      });
    });
    expect(link).toBeTruthy();
    expect(link!.getAttribute('href')).toContain('etherscan.io/tx/0xabc123def456789');
  });

  it('handles null txHash in Recent Activity gracefully', async () => {
    render(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByText('Tx Hash')).toBeTruthy();
    });

    // tx-2 has null txHash — ExplorerLink returns null for null txHash
    // There should be no link for devnet tx hash
    const links = screen.getAllByRole('link');
    const devnetTxLink = links.find((a) => {
      const href = a.getAttribute('href');
      return href?.includes('solscan.io/tx/') && href?.includes('cluster=devnet');
    });
    expect(devnetTxLink).toBeUndefined();
  });

  it('Approval Pending card shows 0 gracefully without warning badge', async () => {
    setupMocks({ items: [], total: 0, offset: 0, limit: 1 });

    render(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByText('Approval Pending')).toBeTruthy();
    });

    // Wait for approval count to load
    await waitFor(() => {
      const label = screen.getByText('Approval Pending');
      const card = label.closest('a');
      // The card should render the value "0" as a plain stat-value (not a badge)
      const badge = card?.querySelector('.badge');
      const statValue = card?.querySelector('.stat-value');
      // With 0 count, no warning badge should render
      expect(badge).toBeNull();
      expect(statValue).toBeTruthy();
      expect(statValue!.textContent).toBe('0');
    });
  });
});
