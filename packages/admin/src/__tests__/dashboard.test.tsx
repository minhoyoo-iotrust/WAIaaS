import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent, cleanup } from '@testing-library/preact';
import type { components } from '../api/types.generated';

const mockApiGet = vi.fn();
const mockApiPost = vi.fn();

vi.mock('../api/typed-client', () => ({
  api: { GET: (...args: unknown[]) => mockApiGet(...args), POST: (...args: unknown[]) => mockApiPost(...args) },
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

vi.mock('../utils/error-messages', () => ({
  getErrorMessage: (code: string) => {
    if (code === 'NETWORK_ERROR') return 'Cannot connect to the daemon. Check if it is running.';
    return `Error: ${code}`;
  },
}));

vi.mock('../utils/display-currency', async () => {
  const actual = await vi.importActual<typeof import('../utils/display-currency')>('../utils/display-currency');
  return {
    ...actual,
    fetchDisplayCurrency: vi.fn(),
  };
});

import { ApiError } from '../api/typed-client';
import { fetchDisplayCurrency } from '../utils/display-currency';
import DashboardPage from '../pages/dashboard';

const mockStatus = {
  status: 'running',
  version: '1.4.3',
  latestVersion: null as string | null,
  updateAvailable: false,
  uptime: 3661,
  walletCount: 3,
  activeSessionCount: 5,
  killSwitchState: 'NORMAL',
  adminTimeout: 900,
  timestamp: Math.floor(Date.now() / 1000),
  policyCount: 0,
  recentTxCount: 0,
  failedTxCount: 0,
  autoProvisioned: false,
  recentTransactions: [],
} satisfies components['schemas']['AdminStatusResponse'];

function setupApiGetMock(statusData: components['schemas']['AdminStatusResponse'] = mockStatus) {
  mockApiGet.mockImplementation((path: string) => {
    if (path.includes('/v1/admin/stats')) return Promise.reject(new Error('not found'));
    if (path.includes('/v1/admin/defi/positions')) return Promise.reject(new Error('not found'));
    if (path === '/v1/admin/transactions') return Promise.resolve({ data: { items: [], total: 0, offset: 0, limit: 1 } });
    if (path === '/v1/wallets') return Promise.resolve({ data: { items: [] } });
    return Promise.resolve({ data: statusData });
  });
}

describe('DashboardPage', () => {
  beforeEach(() => {
    setupApiGetMock();
    vi.mocked(fetchDisplayCurrency).mockResolvedValue({ currency: 'USD', rate: 1 });
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('should display stat cards with API data', async () => {
    render(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByText('1.4.3')).toBeTruthy();
    });

    expect(screen.getByText('3')).toBeTruthy();
    expect(screen.getByText('5')).toBeTruthy();
    expect(screen.getByText('NORMAL')).toBeTruthy();
    expect(screen.getByText('running')).toBeTruthy();
    expect(mockApiGet).toHaveBeenCalledWith('/v1/admin/status');
  });

  it('should poll every 30 seconds', async () => {
    vi.useFakeTimers();

    render(<DashboardPage />);

    // Flush initial async work
    await vi.advanceTimersByTimeAsync(0);
    const initialCalls = mockApiGet.mock.calls.length;
    expect(initialCalls).toBeGreaterThanOrEqual(1);

    // After 30s poll, fetchStatus + fetchDefi + fetchStats fire again (3 calls per interval)
    await vi.advanceTimersByTimeAsync(30_000);
    expect(mockApiGet).toHaveBeenCalledTimes(initialCalls + 3);

    // After another 30s poll
    await vi.advanceTimersByTimeAsync(30_000);
    expect(mockApiGet).toHaveBeenCalledTimes(initialCalls + 6);

    vi.useRealTimers();
  });

  it('should show error banner on API failure with Retry button', async () => {
    mockApiGet.mockRejectedValueOnce(
      new ApiError(0, 'NETWORK_ERROR', 'Cannot connect'),
    );

    render(<DashboardPage />);

    await waitFor(() => {
      expect(
        screen.getByText('Cannot connect to the daemon. Check if it is running.'),
      ).toBeTruthy();
    });

    expect(screen.getByText('Retry')).toBeTruthy();

    // Setup success response for retry
    setupApiGetMock();

    fireEvent.click(screen.getByText('Retry'));

    await waitFor(() => {
      expect(screen.getByText('1.4.3')).toBeTruthy();
    });
  });
});
