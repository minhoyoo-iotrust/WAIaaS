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

vi.mock('../utils/error-messages', () => ({
  getErrorMessage: (code: string) => {
    if (code === 'NETWORK_ERROR') return 'Cannot connect to the daemon. Check if it is running.';
    return `Error: ${code}`;
  },
}));

import { apiGet, ApiError } from '../api/client';
import DashboardPage from '../pages/dashboard';

const mockStatus = {
  status: 'running',
  version: '0.1.0',
  uptime: 3661,
  walletCount: 3,
  activeSessionCount: 5,
  killSwitchState: 'NORMAL',
  adminTimeout: 900,
  timestamp: Math.floor(Date.now() / 1000),
};

describe('DashboardPage', () => {
  beforeEach(() => {
    vi.mocked(apiGet).mockResolvedValue(mockStatus);
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('should display stat cards with API data', async () => {
    render(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByText('0.1.0')).toBeTruthy();
    });

    expect(screen.getByText('3')).toBeTruthy();
    expect(screen.getByText('5')).toBeTruthy();
    expect(screen.getByText('NORMAL')).toBeTruthy();
    expect(screen.getByText('running')).toBeTruthy();
    expect(vi.mocked(apiGet)).toHaveBeenCalledWith('/v1/admin/status');
  });

  it('should poll every 30 seconds', async () => {
    vi.useFakeTimers();

    render(<DashboardPage />);

    await waitFor(() => {
      expect(vi.mocked(apiGet)).toHaveBeenCalledTimes(1);
    });

    vi.advanceTimersByTime(30_000);
    expect(vi.mocked(apiGet)).toHaveBeenCalledTimes(2);

    vi.advanceTimersByTime(30_000);
    expect(vi.mocked(apiGet)).toHaveBeenCalledTimes(3);

    vi.useRealTimers();
  });

  it('should show error banner on API failure with Retry button', async () => {
    vi.mocked(apiGet).mockRejectedValueOnce(
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
    vi.mocked(apiGet).mockResolvedValueOnce(mockStatus);

    fireEvent.click(screen.getByText('Retry'));

    await waitFor(() => {
      expect(screen.getByText('0.1.0')).toBeTruthy();
    });
  });
});
