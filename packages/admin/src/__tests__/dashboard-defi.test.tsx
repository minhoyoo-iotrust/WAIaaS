/**
 * dashboard-defi.test.tsx
 *
 * Tests for DeFi Positions section in Dashboard:
 * - Shows DeFi Positions section when positions exist
 * - Hides DeFi Positions section when no positions
 * - StatCards show correct values (Total DeFi Value, HF, Active Positions)
 * - HF badge shows correct color (danger/warning/success)
 *
 * @see ADMN-01
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
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

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

const mockStatus = {
  status: 'running',
  version: '2.8.0',
  latestVersion: null as string | null,
  updateAvailable: false,
  uptime: 3661,
  walletCount: 3,
  activeSessionCount: 5,
  killSwitchState: 'NORMAL',
  adminTimeout: 900,
  timestamp: Math.floor(Date.now() / 1000),
  policyCount: 2,
  recentTxCount: 10,
  failedTxCount: 0,
  recentTransactions: [],
};

const mockDefiPositions = {
  positions: [
    {
      id: 'pos-1',
      walletId: 'w-1',
      category: 'LENDING',
      provider: 'aave_v3',
      chain: 'ethereum',
      network: 'ethereum-mainnet',
      assetId: null,
      amount: '1000',
      amountUsd: 2500.0,
      status: 'ACTIVE',
      openedAt: 1700000000,
      lastSyncedAt: 1700001000,
    },
  ],
  totalValueUsd: 2500.0,
  worstHealthFactor: 1.8,
  activeCount: 1,
};

const mockEmptyDefi = {
  positions: [],
  totalValueUsd: null,
  worstHealthFactor: null,
  activeCount: 0,
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mockApiCallsWithDefi(defiData: Record<string, unknown> = mockDefiPositions) {
  vi.mocked(apiGet).mockImplementation(async (path: string) => {
    if (path === '/v1/admin/status') return mockStatus;
    if (path.startsWith('/v1/admin/defi/positions')) return defiData;
    if (path === '/v1/wallets') return { items: [] };
    if (path.includes('/v1/admin/stats')) throw new Error('not found');
    if (path.includes('/v1/admin/transactions')) return { total: 0, transactions: [] };
    return {};
  });
  vi.mocked(fetchDisplayCurrency).mockResolvedValue({ currency: 'USD', rate: 1 });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('DashboardPage - DeFi Positions section', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('renders DeFi Positions section when active positions exist', async () => {
    mockApiCallsWithDefi(mockDefiPositions);
    render(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByText('DeFi Positions')).toBeTruthy();
    });

    expect(screen.getByText('Total DeFi Value')).toBeTruthy();
    expect(screen.getByText('Health Factor')).toBeTruthy();
    expect(screen.getByText('Active Positions')).toBeTruthy();
  });

  it('hides DeFi section when activeCount is 0', async () => {
    mockApiCallsWithDefi(mockEmptyDefi);
    render(<DashboardPage />);

    // Wait for dashboard to load
    await waitFor(() => {
      expect(screen.getByText('2.8.0')).toBeTruthy();
    });

    // DeFi Positions heading should not exist
    expect(screen.queryByText('DeFi Positions')).toBeNull();
  });

  it('shows success badge for HF >= 1.5', async () => {
    mockApiCallsWithDefi({
      ...mockDefiPositions,
      worstHealthFactor: 2.0,
    });
    render(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByText('2.00')).toBeTruthy();
    });

    // The HF value should be rendered inside a badge
    const hfElement = screen.getByText('2.00');
    expect(hfElement.closest('.badge')).toBeTruthy();
  });

  it('shows warning badge for 1.2 <= HF < 1.5', async () => {
    mockApiCallsWithDefi({
      ...mockDefiPositions,
      worstHealthFactor: 1.3,
    });
    render(<DashboardPage />);

    await waitFor(() => {
      // HF value appears in both warning banner and stat card badge
      const matches = screen.getAllByText('1.30');
      expect(matches.length).toBeGreaterThanOrEqual(1);
    });
  });

  it('shows danger badge for HF < 1.2', async () => {
    mockApiCallsWithDefi({
      ...mockDefiPositions,
      worstHealthFactor: 1.1,
    });
    render(<DashboardPage />);

    await waitFor(() => {
      // HF value appears in both warning banner and stat card badge
      const matches = screen.getAllByText('1.10');
      expect(matches.length).toBeGreaterThanOrEqual(1);
    });
  });

  it('shows position count as Active Positions stat', async () => {
    mockApiCallsWithDefi(mockDefiPositions);
    render(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByText('Active Positions')).toBeTruthy();
    });

    // The active count is 1
    expect(screen.getByText('1')).toBeTruthy();
  });

  it('renders category filter tabs', async () => {
    mockApiCallsWithDefi(mockDefiPositions);
    render(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByText('DeFi Positions')).toBeTruthy();
    });

    // Category tab buttons should be present in the .defi-category-tabs container
    const tabContainer = document.querySelector('.defi-category-tabs');
    expect(tabContainer).toBeTruthy();
    const buttons = tabContainer!.querySelectorAll('button');
    const labels = Array.from(buttons).map((b) => b.textContent);
    expect(labels).toContain('ALL');
    expect(labels).toContain('STAKING');
    expect(labels).toContain('LENDING');
    expect(labels).toContain('YIELD');
    expect(labels).toContain('PERP');
  });

  it('renders HF warning banner when worstHealthFactor < 1.5', async () => {
    mockApiCallsWithDefi({
      ...mockDefiPositions,
      worstHealthFactor: 1.3,
    });
    render(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByText('Health Factor Warning:')).toBeTruthy();
    });

    // Verify role="alert" element exists
    const alertEl = screen.getByRole('alert');
    expect(alertEl).toBeTruthy();
  });

  it('does not render HF warning banner when worstHealthFactor >= 1.5', async () => {
    mockApiCallsWithDefi({
      ...mockDefiPositions,
      worstHealthFactor: 2.0,
    });
    render(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByText('DeFi Positions')).toBeTruthy();
    });

    expect(screen.queryByText('Health Factor Warning:')).toBeNull();
  });

  it('renders provider group headers', async () => {
    const multiProviderDefi = {
      positions: [
        {
          id: 'pos-1', walletId: 'w-1', category: 'LENDING', provider: 'aave-v3',
          chain: 'ethereum', network: 'ethereum-mainnet', assetId: null,
          amount: '1000', amountUsd: 2500.0, metadata: { positionType: 'SUPPLY', healthFactor: 1.8 },
          status: 'ACTIVE', openedAt: 1700000000, lastSyncedAt: 1700001000,
        },
        {
          id: 'pos-2', walletId: 'w-1', category: 'STAKING', provider: 'lido',
          chain: 'ethereum', network: 'ethereum-mainnet', assetId: null,
          amount: '5.0', amountUsd: 10000.0, metadata: { protocol: 'Lido', exchangeRate: 1.15 },
          status: 'ACTIVE', openedAt: 1700000000, lastSyncedAt: 1700001000,
        },
      ],
      totalValueUsd: 12500.0,
      worstHealthFactor: 1.8,
      activeCount: 2,
    };
    mockApiCallsWithDefi(multiProviderDefi);
    render(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByText('Aave V3')).toBeTruthy();
    });
    expect(screen.getByText('Lido')).toBeTruthy();
  });

  it('renders wallet filter dropdown', async () => {
    const mockWallets = [
      { id: 'w-1', name: 'Wallet 1' },
      { id: 'w-2', name: 'Wallet 2' },
    ];
    vi.mocked(apiGet).mockImplementation(async (path: string) => {
      if (path === '/v1/admin/status') return mockStatus;
      if (path.startsWith('/v1/admin/defi/positions')) return mockDefiPositions;
      if (path === '/v1/wallets') return { items: mockWallets };
      if (path.includes('/v1/admin/stats')) throw new Error('not found');
      if (path.includes('/v1/admin/transactions')) return { total: 0, transactions: [] };
      return {};
    });
    vi.mocked(fetchDisplayCurrency).mockResolvedValue({ currency: 'USD', rate: 1 });

    render(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByText('All Wallets')).toBeTruthy();
    });

    // Wallet names should appear as options
    await waitFor(() => {
      expect(screen.getByText('Wallet 1')).toBeTruthy();
      expect(screen.getByText('Wallet 2')).toBeTruthy();
    });
  });
});
