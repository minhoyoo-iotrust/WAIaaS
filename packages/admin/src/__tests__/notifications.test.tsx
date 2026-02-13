import { describe, it, expect, vi, afterEach } from 'vitest';
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
  getErrorMessage: (code: string) => `Error: ${code}`,
}));

import { apiGet, apiPost } from '../api/client';
import { showToast } from '../components/toast';
import NotificationsPage from '../pages/notifications';

const mockStatus = {
  enabled: true,
  channels: [
    { name: 'telegram', enabled: true },
    { name: 'discord', enabled: false },
    { name: 'ntfy', enabled: true },
  ],
};

const mockStatusDisabled = {
  enabled: false,
  channels: [
    { name: 'telegram', enabled: false },
    { name: 'discord', enabled: false },
    { name: 'ntfy', enabled: false },
  ],
};

const mockLogs = {
  logs: [
    { id: '1', eventType: 'TX_CONFIRMED', walletId: 'wallet-001-abcd', channel: 'telegram', status: 'sent', error: null, createdAt: 1707609600 },
    { id: '2', eventType: 'TX_FAILED', walletId: 'wallet-002-efgh', channel: 'discord', status: 'failed', error: 'Webhook error', createdAt: 1707609500 },
  ],
  total: 2,
  page: 1,
  pageSize: 20,
};

const mockLogsPage1 = {
  logs: Array.from({ length: 20 }, (_, i) => ({
    id: String(i + 1),
    eventType: 'TX_CONFIRMED',
    walletId: `wallet-${i}`,
    channel: 'telegram',
    status: 'sent',
    error: null,
    createdAt: 1707609600 - i * 100,
  })),
  total: 25,
  page: 1,
  pageSize: 20,
};

const emptyLogs = {
  logs: [],
  total: 0,
  page: 1,
  pageSize: 20,
};

function setupMocks(statusData = mockStatus, logData = mockLogs) {
  vi.mocked(apiGet).mockImplementation((url: string) => {
    if (url.includes('/notifications/status')) return Promise.resolve(statusData);
    if (url.includes('/notifications/log')) return Promise.resolve(logData);
    return Promise.reject(new Error(`Unexpected URL: ${url}`));
  });
}

describe('NotificationsPage', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('should display channel status cards with connected and not-configured badges', async () => {
    setupMocks();

    render(<NotificationsPage />);

    await waitFor(() => {
      expect(screen.getByText('Channel Status')).toBeTruthy();
    });

    // 2 Connected (telegram, ntfy) and 1 Not Configured (discord)
    const connectedBadges = screen.getAllByText('Connected');
    expect(connectedBadges.length).toBe(2);

    const notConfiguredBadges = screen.getAllByText('Not Configured');
    expect(notConfiguredBadges.length).toBe(1);

    // Channel names appear in both card and log table, so use getAllByText
    expect(screen.getAllByText('telegram').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('discord').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('ntfy').length).toBeGreaterThanOrEqual(1);
  });

  it('should display disabled banner when notifications are disabled', async () => {
    setupMocks(mockStatusDisabled, emptyLogs);

    render(<NotificationsPage />);

    await waitFor(() => {
      expect(screen.getByText(/Notifications are disabled/)).toBeTruthy();
    });

    // The banner contains config.toml reference
    const banner = screen.getByText(/Notifications are disabled/).closest('.notif-disabled-banner');
    expect(banner).toBeTruthy();
  });

  it('should trigger POST on Send Test click and show results', async () => {
    setupMocks();

    vi.mocked(apiPost).mockResolvedValueOnce({
      results: [
        { channel: 'telegram', success: true },
        { channel: 'ntfy', success: true },
      ],
    });

    render(<NotificationsPage />);

    await waitFor(() => {
      expect(screen.getByText('Send Test')).toBeTruthy();
    });

    fireEvent.click(screen.getByText('Send Test'));

    await waitFor(() => {
      expect(vi.mocked(apiPost)).toHaveBeenCalledWith('/v1/admin/notifications/test');
    });

    await waitFor(() => {
      // Check marks for successful channels
      const successMarks = screen.getAllByText('\u2713');
      expect(successMarks.length).toBe(2);
    });

    expect(vi.mocked(showToast)).toHaveBeenCalledWith('success', 'Test sent successfully');
  });

  it('should display notification log table with correct data', async () => {
    setupMocks();

    render(<NotificationsPage />);

    await waitFor(() => {
      expect(screen.getByText('TX_CONFIRMED')).toBeTruthy();
    });

    expect(screen.getByText('TX_FAILED')).toBeTruthy();

    // Status badges
    expect(screen.getByText('sent')).toBeTruthy();
    expect(screen.getByText('failed')).toBeTruthy();

    // Column headers
    expect(screen.getByText('Event Type')).toBeTruthy();
    expect(screen.getByText('Channel')).toBeTruthy();
    expect(screen.getByText('Status')).toBeTruthy();
  });

  it('should handle pagination with Next button', async () => {
    setupMocks(mockStatus, mockLogsPage1);

    const { container } = render(<NotificationsPage />);

    // Wait for pagination info to appear with correct content
    await waitFor(() => {
      const paginationInfo = container.querySelector('.pagination-info');
      expect(paginationInfo?.textContent).toContain('Page');
      expect(paginationInfo?.textContent).toContain('25 total');
    });

    // Mock the page 2 fetch
    vi.mocked(apiGet).mockImplementation((url: string) => {
      if (url.includes('/notifications/status')) return Promise.resolve(mockStatus);
      if (url.includes('page=2')) {
        return Promise.resolve({
          logs: [{ id: '21', eventType: 'TX_SUBMITTED', walletId: 'wallet-20', channel: 'ntfy', status: 'sent', error: null, createdAt: 1707607600 }],
          total: 25,
          page: 2,
          pageSize: 20,
        });
      }
      if (url.includes('/notifications/log')) return Promise.resolve(mockLogsPage1);
      return Promise.reject(new Error(`Unexpected URL: ${url}`));
    });

    fireEvent.click(screen.getByText('Next'));

    await waitFor(() => {
      expect(vi.mocked(apiGet)).toHaveBeenCalledWith(
        '/v1/admin/notifications/log?page=2&pageSize=20',
      );
    });
  });

  it('should show config.toml guidance section', async () => {
    setupMocks();

    render(<NotificationsPage />);

    await waitFor(() => {
      expect(screen.getByText(/Notification channels are configured via config\.toml/)).toBeTruthy();
    });

    expect(screen.getByText(/Restart the daemon after changing notification settings/)).toBeTruthy();
    expect(screen.getByText(/telegram_bot_token/)).toBeTruthy();
    expect(screen.getByText(/discord_webhook_url/)).toBeTruthy();
  });

  it('should disable Send Test when no channels are active', async () => {
    setupMocks(mockStatusDisabled, emptyLogs);

    render(<NotificationsPage />);

    await waitFor(() => {
      const sendBtn = screen.getByText('Send Test');
      expect(sendBtn.closest('button')?.hasAttribute('disabled')).toBe(true);
    });
  });

  it('should show error message for failed test channels', async () => {
    setupMocks();

    vi.mocked(apiPost).mockResolvedValueOnce({
      results: [
        { channel: 'telegram', success: true },
        { channel: 'ntfy', success: false, error: 'Connection timeout' },
      ],
    });

    render(<NotificationsPage />);

    await waitFor(() => {
      expect(screen.getByText('Send Test')).toBeTruthy();
    });

    fireEvent.click(screen.getByText('Send Test'));

    await waitFor(() => {
      expect(screen.getByText(/Connection timeout/)).toBeTruthy();
    });

    expect(vi.mocked(showToast)).toHaveBeenCalledWith('warning', 'Some channels failed');
  });
});
