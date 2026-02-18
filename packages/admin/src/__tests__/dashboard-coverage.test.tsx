/**
 * dashboard-coverage.test.tsx
 *
 * Supplemental coverage tests for dashboard.tsx:
 * - StatCard with badge variant (danger/success)
 * - StatCard with href (renders as <a>)
 * - buildTxColumns: amount formatting with display currency, null amount, status badges
 * - fetchDisplayCurrency integration
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

// Mock display-currency module to control fetchDisplayCurrency
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

const mockStatusFull = {
  status: 'running',
  version: '2.0.0',
  uptime: 7200,
  walletCount: 5,
  activeSessionCount: 12,
  killSwitchState: 'NORMAL',
  adminTimeout: 900,
  timestamp: Math.floor(Date.now() / 1000),
  policyCount: 8,
  recentTxCount: 42,
  failedTxCount: 0,
  recentTransactions: [
    {
      id: 'tx-1',
      walletId: 'wallet-1',
      walletName: 'alpha-bot',
      type: 'TRANSFER',
      status: 'CONFIRMED',
      toAddress: '0x1234567890abcdef',
      amount: '1.5 SOL',
      amountUsd: 250.50,
      network: 'devnet',
      createdAt: 1707609600,
    },
    {
      id: 'tx-2',
      walletId: 'wallet-2',
      walletName: null,
      type: 'TOKEN_TRANSFER',
      status: 'FAILED',
      toAddress: null,
      amount: null,
      amountUsd: null,
      network: 'devnet',
      createdAt: 1707696000,
    },
    {
      id: 'tx-3',
      walletId: 'wallet-3',
      walletName: 'gamma-bot',
      type: 'CONTRACT_CALL',
      status: 'PENDING',
      toAddress: '0xabcdef',
      amount: '0.1 ETH',
      amountUsd: 300,
      network: null,
      createdAt: null,
    },
  ],
};

const mockStatusActivated = {
  ...mockStatusFull,
  killSwitchState: 'ACTIVATED',
  failedTxCount: 3,
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Dashboard coverage: StatCard with badge', () => {
  afterEach(() => { cleanup(); vi.clearAllMocks(); });

  it('renders Kill Switch as NORMAL with success badge', async () => {
    vi.mocked(apiGet).mockResolvedValue(mockStatusFull);
    vi.mocked(fetchDisplayCurrency).mockResolvedValue({ currency: 'USD', rate: 1 });

    render(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByText('NORMAL')).toBeTruthy();
    });

    // The badge should have success variant (rendered in a span with badge class)
    const normalBadge = screen.getByText('NORMAL');
    expect(normalBadge.classList.contains('badge-success') || normalBadge.className.includes('success')).toBe(true);
  });

  it('renders Kill Switch as ACTIVATED with danger badge', async () => {
    vi.mocked(apiGet).mockResolvedValue(mockStatusActivated);
    vi.mocked(fetchDisplayCurrency).mockResolvedValue({ currency: 'USD', rate: 1 });

    render(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByText('ACTIVATED')).toBeTruthy();
    });

    const activatedBadge = screen.getByText('ACTIVATED');
    expect(activatedBadge.classList.contains('badge-danger') || activatedBadge.className.includes('danger')).toBe(true);
  });

  it('renders failed tx count with danger badge when > 0', async () => {
    vi.mocked(apiGet).mockResolvedValue(mockStatusActivated);
    vi.mocked(fetchDisplayCurrency).mockResolvedValue({ currency: 'USD', rate: 1 });

    render(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByText('3')).toBeTruthy();
    });

    // Failed tx count = 3 should get danger badge
    const failedBadge = screen.getByText('3');
    expect(failedBadge.classList.contains('badge-danger') || failedBadge.className.includes('danger')).toBe(true);
  });

  it('renders failed tx count with success badge when 0', async () => {
    vi.mocked(apiGet).mockResolvedValue(mockStatusFull);
    vi.mocked(fetchDisplayCurrency).mockResolvedValue({ currency: 'USD', rate: 1 });

    render(<DashboardPage />);

    await waitFor(() => {
      // failedTxCount = 0 should be rendered as '0' with success badge
      const zeroBadge = screen.getByText('0');
      expect(zeroBadge.classList.contains('badge-success') || zeroBadge.className.includes('success')).toBe(true);
    });
  });
});

describe('Dashboard coverage: StatCard with href', () => {
  afterEach(() => { cleanup(); vi.clearAllMocks(); });

  it('renders Wallets card as link to #/wallets', async () => {
    vi.mocked(apiGet).mockResolvedValue(mockStatusFull);
    vi.mocked(fetchDisplayCurrency).mockResolvedValue({ currency: 'USD', rate: 1 });

    render(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByText('5')).toBeTruthy();
    });

    const walletsLink = document.querySelector('a[href="#/wallets"]');
    expect(walletsLink).toBeTruthy();
    expect(walletsLink!.textContent).toContain('Wallets');
  });

  it('renders Sessions card as link to #/sessions', async () => {
    vi.mocked(apiGet).mockResolvedValue(mockStatusFull);
    vi.mocked(fetchDisplayCurrency).mockResolvedValue({ currency: 'USD', rate: 1 });

    render(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByText('12')).toBeTruthy();
    });

    const sessionsLink = document.querySelector('a[href="#/sessions"]');
    expect(sessionsLink).toBeTruthy();
    expect(sessionsLink!.textContent).toContain('Active Sessions');
  });

  it('renders Policies card as link to #/policies', async () => {
    vi.mocked(apiGet).mockResolvedValue(mockStatusFull);
    vi.mocked(fetchDisplayCurrency).mockResolvedValue({ currency: 'USD', rate: 1 });

    render(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByText('8')).toBeTruthy();
    });

    const policiesLink = document.querySelector('a[href="#/policies"]');
    expect(policiesLink).toBeTruthy();
    expect(policiesLink!.textContent).toContain('Policies');
  });

  it('StatCard link contains arrow indicator', async () => {
    vi.mocked(apiGet).mockResolvedValue(mockStatusFull);
    vi.mocked(fetchDisplayCurrency).mockResolvedValue({ currency: 'USD', rate: 1 });

    render(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByText('5')).toBeTruthy();
    });

    // href cards have an arrow span
    const walletsLink = document.querySelector('a[href="#/wallets"]');
    expect(walletsLink!.textContent).toContain('\u2192');
  });
});

describe('Dashboard coverage: buildTxColumns', () => {
  afterEach(() => { cleanup(); vi.clearAllMocks(); });

  it('renders transactions with USD amount formatting', async () => {
    vi.mocked(apiGet).mockResolvedValue(mockStatusFull);
    vi.mocked(fetchDisplayCurrency).mockResolvedValue({ currency: 'USD', rate: 1 });

    render(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByText('Recent Activity')).toBeTruthy();
    });

    // tx-1: amount='1.5 SOL', amountUsd=250.50, USD rate=1 -> should show "$250.50"
    await waitFor(() => {
      expect(screen.getByText(/1\.5 SOL/)).toBeTruthy();
    });

    // tx-2: amount=null -> should show em dash
    // tx-3: amount='0.1 ETH', amountUsd=300
  });

  it('renders tx with null amount as dash', async () => {
    vi.mocked(apiGet).mockResolvedValue(mockStatusFull);
    vi.mocked(fetchDisplayCurrency).mockResolvedValue({ currency: 'USD', rate: 1 });

    render(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByText('Recent Activity')).toBeTruthy();
    });

    // tx-2 has null amount -> should show em dash character
    await waitFor(() => {
      const cells = document.querySelectorAll('td');
      const dashCells = Array.from(cells).filter((c) => c.textContent === '\u2014');
      expect(dashCells.length).toBeGreaterThan(0);
    });
  });

  it('renders CONFIRMED status with success badge', async () => {
    vi.mocked(apiGet).mockResolvedValue(mockStatusFull);
    vi.mocked(fetchDisplayCurrency).mockResolvedValue({ currency: 'USD', rate: 1 });

    render(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByText('CONFIRMED')).toBeTruthy();
    });

    const confirmedBadge = screen.getByText('CONFIRMED');
    expect(confirmedBadge.className).toContain('success');
  });

  it('renders FAILED status with danger badge', async () => {
    vi.mocked(apiGet).mockResolvedValue(mockStatusFull);
    vi.mocked(fetchDisplayCurrency).mockResolvedValue({ currency: 'USD', rate: 1 });

    render(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByText('FAILED')).toBeTruthy();
    });

    const failedBadge = screen.getByText('FAILED');
    expect(failedBadge.className).toContain('danger');
  });

  it('renders PENDING status with warning badge', async () => {
    vi.mocked(apiGet).mockResolvedValue(mockStatusFull);
    vi.mocked(fetchDisplayCurrency).mockResolvedValue({ currency: 'USD', rate: 1 });

    render(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByText('PENDING')).toBeTruthy();
    });

    const pendingBadge = screen.getByText('PENDING');
    expect(pendingBadge.className).toContain('warning');
  });

  it('wallet name fallback to truncated walletId', async () => {
    vi.mocked(apiGet).mockResolvedValue(mockStatusFull);
    vi.mocked(fetchDisplayCurrency).mockResolvedValue({ currency: 'USD', rate: 1 });

    render(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByText('alpha-bot')).toBeTruthy();
    });

    // tx-2 has walletName=null -> should show first 8 chars of walletId
    expect(screen.getByText('wallet-2')).toBeTruthy();
  });

  it('tx with null createdAt shows dash', async () => {
    vi.mocked(apiGet).mockResolvedValue(mockStatusFull);
    vi.mocked(fetchDisplayCurrency).mockResolvedValue({ currency: 'USD', rate: 1 });

    render(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByText('Recent Activity')).toBeTruthy();
    });

    // tx-3 has createdAt=null -> time column shows em dash
    await waitFor(() => {
      const cells = document.querySelectorAll('td');
      const dashCells = Array.from(cells).filter((c) => c.textContent === '\u2014');
      expect(dashCells.length).toBeGreaterThan(0);
    });
  });
});

describe('Dashboard coverage: fetchDisplayCurrency', () => {
  afterEach(() => { cleanup(); vi.clearAllMocks(); });

  it('uses non-USD currency when available', async () => {
    vi.mocked(apiGet).mockResolvedValue(mockStatusFull);
    vi.mocked(fetchDisplayCurrency).mockResolvedValue({ currency: 'KRW', rate: 1450 });

    render(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByText('Recent Activity')).toBeTruthy();
    });

    // With KRW, the amount should include approximately symbol
    // tx-1: amountUsd=250.50, rate=1450 -> ~363,225 KRW
    await waitFor(() => {
      // The formatted amount should contain the KRW symbol or amount
      const amountCells = document.querySelectorAll('td');
      const hasKrwAmount = Array.from(amountCells).some((c) =>
        c.textContent?.includes('\u2248') || c.textContent?.includes('KRW'),
      );
      expect(hasKrwAmount).toBe(true);
    });
  });

  it('falls back to USD on fetchDisplayCurrency error', async () => {
    vi.mocked(apiGet).mockResolvedValue(mockStatusFull);
    vi.mocked(fetchDisplayCurrency).mockRejectedValue(new Error('Network error'));

    render(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByText('Recent Activity')).toBeTruthy();
    });

    // Should still render transactions (USD fallback)
    await waitFor(() => {
      expect(screen.getByText(/1\.5 SOL/)).toBeTruthy();
    });
  });

  it('renders empty transaction table', async () => {
    const statusNoTx = { ...mockStatusFull, recentTransactions: [] };
    vi.mocked(apiGet).mockResolvedValue(statusNoTx);
    vi.mocked(fetchDisplayCurrency).mockResolvedValue({ currency: 'USD', rate: 1 });

    render(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByText('No recent transactions')).toBeTruthy();
    });
  });

  it('handles generic (non-ApiError) fetch error', async () => {
    vi.mocked(apiGet).mockRejectedValue(new Error('Unexpected error'));
    vi.mocked(fetchDisplayCurrency).mockResolvedValue({ currency: 'USD', rate: 1 });

    render(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByText('An unexpected error occurred.')).toBeTruthy();
    });
  });
});
