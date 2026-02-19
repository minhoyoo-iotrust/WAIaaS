/**
 * Additional coverage tests for notifications.tsx
 *
 * Focuses on uncovered functions: handleTestChannel, handlePrevPage,
 * handleNextPage, handleRowClick, and tab switching.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
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

vi.mock('../pages/telegram-users', () => ({
  TelegramUsersContent: () => <div data-testid="telegram-users-content">TelegramUsers</div>,
  default: () => <div>TelegramUsersPage</div>,
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

import { apiGet, apiPost, apiPut } from '../api/client';
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

const mockLogs = {
  logs: [
    {
      id: '1',
      eventType: 'TX_CONFIRMED',
      walletId: 'wallet-001-abcd',
      channel: 'telegram',
      status: 'sent',
      error: null,
      message: 'Transfer of 1 SOL completed',
      createdAt: 1707609600,
    },
    {
      id: '2',
      eventType: 'TX_FAILED',
      walletId: null,
      channel: 'discord',
      status: 'failed',
      error: 'Webhook error',
      message: null,
      createdAt: 1707609500,
    },
  ],
  total: 2,
  page: 1,
  pageSize: 20,
};

// Larger log set for pagination
const mockLogsPage1 = {
  logs: Array.from({ length: 20 }, (_, i) => ({
    id: String(i + 1),
    eventType: 'TX_CONFIRMED',
    walletId: `wallet-${i}`,
    channel: 'telegram',
    status: 'sent',
    error: null,
    message: `Message ${i}`,
    createdAt: 1707609600 - i * 100,
  })),
  total: 45,
  page: 1,
  pageSize: 20,
};

const mockLogsPage2 = {
  logs: Array.from({ length: 20 }, (_, i) => ({
    id: String(i + 21),
    eventType: 'TX_SUBMITTED',
    walletId: `wallet-${i + 20}`,
    channel: 'ntfy',
    status: 'sent',
    error: null,
    message: `Message ${i + 20}`,
    createdAt: 1707607600 - i * 100,
  })),
  total: 45,
  page: 2,
  pageSize: 20,
};

function setupMocks(statusData = mockStatus, logData = mockLogs) {
  vi.mocked(apiGet).mockImplementation((url: string) => {
    if (url.includes('/notifications/status')) return Promise.resolve(statusData);
    if (url.includes('/notifications/log')) return Promise.resolve(logData);
    return Promise.reject(new Error(`Unexpected URL: ${url}`));
  });
}

describe('NotificationsPage - Additional Coverage', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
    cleanup();
  });

  // -----------------------------------------------------------------------
  // handleTestChannel
  // -----------------------------------------------------------------------

  describe('handleTestChannel', () => {
    it('sends test to specific channel on per-channel Test button click', async () => {
      vi.useRealTimers();
      setupMocks();

      vi.mocked(apiPost).mockResolvedValueOnce({
        results: [{ channel: 'telegram', success: true }],
      });

      const { container } = render(<NotificationsPage />);

      await waitFor(() => {
        expect(screen.getByText('Channel Status')).toBeTruthy();
      });

      // Find telegram channel card's Test button
      const channelCards = container.querySelectorAll('.channel-card');
      let telegramTestBtn: HTMLButtonElement | null = null;
      channelCards.forEach((card) => {
        if (card.textContent?.includes('telegram')) {
          const btns = card.querySelectorAll('button');
          btns.forEach((btn) => {
            if (btn.textContent === 'Test') telegramTestBtn = btn as HTMLButtonElement;
          });
        }
      });

      expect(telegramTestBtn).toBeTruthy();
      fireEvent.click(telegramTestBtn!);

      await waitFor(() => {
        expect(vi.mocked(apiPost)).toHaveBeenCalledWith(
          '/v1/admin/notifications/test',
          { channel: 'telegram' },
        );
      });

      await waitFor(() => {
        expect(vi.mocked(showToast)).toHaveBeenCalledWith('success', 'Test sent to telegram');
      });
    });

    it('shows warning toast on failed per-channel test', async () => {
      vi.useRealTimers();
      setupMocks();

      vi.mocked(apiPost).mockResolvedValueOnce({
        results: [{ channel: 'ntfy', success: false, error: 'Connection refused' }],
      });

      const { container } = render(<NotificationsPage />);

      await waitFor(() => {
        expect(screen.getByText('Channel Status')).toBeTruthy();
      });

      // Find ntfy channel card's Test button
      const channelCards = container.querySelectorAll('.channel-card');
      let ntfyTestBtn: HTMLButtonElement | null = null;
      channelCards.forEach((card) => {
        if (card.textContent?.includes('ntfy')) {
          const btns = card.querySelectorAll('button');
          btns.forEach((btn) => {
            if (btn.textContent === 'Test') ntfyTestBtn = btn as HTMLButtonElement;
          });
        }
      });

      expect(ntfyTestBtn).toBeTruthy();
      fireEvent.click(ntfyTestBtn!);

      await waitFor(() => {
        expect(vi.mocked(showToast)).toHaveBeenCalledWith('warning', 'ntfy test failed');
      });
    });

    it('shows error toast on per-channel test API error', async () => {
      vi.useRealTimers();
      setupMocks();

      vi.mocked(apiPost).mockRejectedValueOnce(new Error('Network failure'));

      const { container } = render(<NotificationsPage />);

      await waitFor(() => {
        expect(screen.getByText('Channel Status')).toBeTruthy();
      });

      const channelCards = container.querySelectorAll('.channel-card');
      let telegramTestBtn: HTMLButtonElement | null = null;
      channelCards.forEach((card) => {
        if (card.textContent?.includes('telegram')) {
          const btns = card.querySelectorAll('button');
          btns.forEach((btn) => {
            if (btn.textContent === 'Test') telegramTestBtn = btn as HTMLButtonElement;
          });
        }
      });

      fireEvent.click(telegramTestBtn!);

      await waitFor(() => {
        expect(vi.mocked(showToast)).toHaveBeenCalledWith('error', expect.any(String));
      });
    });
  });

  // -----------------------------------------------------------------------
  // handlePrevPage / handleNextPage
  // -----------------------------------------------------------------------

  describe('handlePrevPage / handleNextPage', () => {
    it('navigates to next page and back to previous', async () => {
      vi.useRealTimers();

      // Start with page 1 of multi-page results
      vi.mocked(apiGet).mockImplementation((url: string) => {
        if (url.includes('/notifications/status')) return Promise.resolve(mockStatus);
        if (url.includes('page=2')) return Promise.resolve(mockLogsPage2);
        if (url.includes('page=1') || url.includes('/notifications/log')) return Promise.resolve(mockLogsPage1);
        return Promise.reject(new Error(`Unexpected URL: ${url}`));
      });

      const { container } = render(<NotificationsPage />);

      await waitFor(() => {
        const info = container.querySelector('.pagination-info');
        expect(info?.textContent).toContain('45 total');
      });

      // Previous should be disabled on page 1
      const prevBtn = screen.getByText('Previous').closest('button') as HTMLButtonElement;
      expect(prevBtn.disabled).toBe(true);

      // Click Next
      fireEvent.click(screen.getByText('Next'));

      await waitFor(() => {
        expect(vi.mocked(apiGet)).toHaveBeenCalledWith(
          '/v1/admin/notifications/log?page=2&pageSize=20',
        );
      });

      // Now Previous should be clickable
      // Click Previous to go back
      fireEvent.click(screen.getByText('Previous'));

      await waitFor(() => {
        expect(vi.mocked(apiGet)).toHaveBeenCalledWith(
          '/v1/admin/notifications/log?page=1&pageSize=20',
        );
      });
    });

    it('disables Next on last page', async () => {
      vi.useRealTimers();

      // Small dataset: total=5, page 1 of 1
      const smallLogs = {
        logs: Array.from({ length: 5 }, (_, i) => ({
          id: String(i + 1),
          eventType: 'TX_CONFIRMED',
          walletId: `w-${i}`,
          channel: 'telegram',
          status: 'sent',
          error: null,
          message: null,
          createdAt: 1707609600 - i * 100,
        })),
        total: 5,
        page: 1,
        pageSize: 20,
      };

      setupMocks(mockStatus, smallLogs);
      const { container } = render(<NotificationsPage />);

      await waitFor(() => {
        const info = container.querySelector('.pagination-info');
        expect(info?.textContent).toContain('5 total');
      });

      // Both Previous and Next should be disabled (only 1 page)
      const nextBtn = screen.getByText('Next').closest('button') as HTMLButtonElement;
      expect(nextBtn.disabled).toBe(true);
    });

    it('does not go below page 1 when Previous is clicked at boundary', async () => {
      vi.useRealTimers();
      setupMocks(mockStatus, mockLogs);

      render(<NotificationsPage />);

      await waitFor(() => {
        expect(screen.getByText('Previous')).toBeTruthy();
      });

      // Clicking Previous on page 1 should do nothing
      const prevBtn = screen.getByText('Previous').closest('button') as HTMLButtonElement;
      expect(prevBtn.disabled).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // handleRowClick (expand/collapse log detail)
  // -----------------------------------------------------------------------

  describe('handleRowClick', () => {
    it('expands log detail when a row is clicked', async () => {
      vi.useRealTimers();
      setupMocks();

      render(<NotificationsPage />);

      await waitFor(() => {
        expect(screen.getByText('TX_CONFIRMED')).toBeTruthy();
      });

      // Click on the TX_CONFIRMED row
      fireEvent.click(screen.getByText('TX_CONFIRMED'));

      // Log detail should appear with message
      await waitFor(() => {
        expect(screen.getByText('Transfer of 1 SOL completed')).toBeTruthy();
      });
    });

    it('collapses log detail when the same row is clicked again', async () => {
      vi.useRealTimers();
      setupMocks();

      render(<NotificationsPage />);

      await waitFor(() => {
        expect(screen.getByText('TX_CONFIRMED')).toBeTruthy();
      });

      // Click to expand (use the table cell)
      const txCells = screen.getAllByText('TX_CONFIRMED');
      fireEvent.click(txCells[0]);
      await waitFor(() => {
        expect(screen.getByText('Transfer of 1 SOL completed')).toBeTruthy();
      });

      // Click same row to collapse - now there are 2 TX_CONFIRMED elements
      // (table cell + detail header strong), click the table cell (first)
      const txCellsAfter = screen.getAllByText('TX_CONFIRMED');
      fireEvent.click(txCellsAfter[0]);
      await waitFor(() => {
        expect(screen.queryByText('Transfer of 1 SOL completed')).toBeNull();
      });
    });

    it('switches expanded row when a different row is clicked', async () => {
      vi.useRealTimers();
      setupMocks();

      render(<NotificationsPage />);

      await waitFor(() => {
        expect(screen.getByText('TX_CONFIRMED')).toBeTruthy();
      });

      // Click TX_CONFIRMED row (table cell)
      const txCells = screen.getAllByText('TX_CONFIRMED');
      fireEvent.click(txCells[0]);
      await waitFor(() => {
        expect(screen.getByText('Transfer of 1 SOL completed')).toBeTruthy();
      });

      // Click TX_FAILED row
      fireEvent.click(screen.getByText('TX_FAILED'));

      // Previous detail should be gone, new one appears
      await waitFor(() => {
        // TX_FAILED has message=null -> shows "(No message recorded)"
        expect(screen.getByText('(No message recorded)')).toBeTruthy();
      });
    });

    it('shows Close button in log detail which clears selection', async () => {
      vi.useRealTimers();
      setupMocks();

      render(<NotificationsPage />);

      await waitFor(() => {
        expect(screen.getByText('TX_CONFIRMED')).toBeTruthy();
      });

      // Click to expand
      fireEvent.click(screen.getByText('TX_CONFIRMED'));
      await waitFor(() => {
        expect(screen.getByText('Close')).toBeTruthy();
      });

      // Click Close
      fireEvent.click(screen.getByText('Close'));

      await waitFor(() => {
        expect(screen.queryByText('Transfer of 1 SOL completed')).toBeNull();
      });
    });
  });

  // -----------------------------------------------------------------------
  // Tab switching
  // -----------------------------------------------------------------------

  describe('tab switching', () => {
    it('shows Telegram Users tab when clicked', async () => {
      vi.useRealTimers();
      setupMocks();

      render(<NotificationsPage />);

      await waitFor(() => {
        // "Channels & Logs" now appears in both Breadcrumb and TabNav
        expect(screen.getAllByText('Channels & Logs').length).toBeGreaterThan(0);
      });

      // Click Telegram Users tab button (use getAllByText since it appears in breadcrumb too)
      const telegramBtns = screen.getAllByText('Telegram Users');
      fireEvent.click(telegramBtns[0]);

      await waitFor(() => {
        expect(screen.getByTestId('telegram-users-content')).toBeTruthy();
      });
    });

    it('switches back to Channels & Logs from Telegram Users', async () => {
      vi.useRealTimers();
      setupMocks();

      render(<NotificationsPage />);

      await waitFor(() => {
        expect(screen.getAllByText('Channels & Logs').length).toBeGreaterThan(0);
      });

      // Switch to Telegram Users
      const telegramBtns = screen.getAllByText('Telegram Users');
      fireEvent.click(telegramBtns[0]);
      await waitFor(() => {
        expect(screen.getByTestId('telegram-users-content')).toBeTruthy();
      });

      // Switch back via TabNav button (find the tab-btn specifically)
      const channelBtns = screen.getAllByText('Channels & Logs');
      fireEvent.click(channelBtns[0]);
      await waitFor(() => {
        expect(screen.getByText('Channel Status')).toBeTruthy();
      });
    });
  });

  // -----------------------------------------------------------------------
  // handleTestSend (Test All Channels)
  // -----------------------------------------------------------------------

  describe('handleTestSend', () => {
    it('sends test to all channels and shows success toast when all pass', async () => {
      vi.useRealTimers();
      setupMocks();

      vi.mocked(apiPost).mockResolvedValueOnce({
        results: [
          { channel: 'telegram', success: true },
          { channel: 'ntfy', success: true },
        ],
      });

      render(<NotificationsPage />);

      await waitFor(() => {
        expect(screen.getByText('Test All Channels')).toBeTruthy();
      });

      fireEvent.click(screen.getByText('Test All Channels'));

      await waitFor(() => {
        expect(vi.mocked(apiPost)).toHaveBeenCalledWith('/v1/admin/notifications/test', {});
      });

      await waitFor(() => {
        expect(vi.mocked(showToast)).toHaveBeenCalledWith('success', 'Test sent successfully');
      });
    });

    it('shows warning toast when some channels fail', async () => {
      vi.useRealTimers();
      setupMocks();

      vi.mocked(apiPost).mockResolvedValueOnce({
        results: [
          { channel: 'telegram', success: true },
          { channel: 'discord', success: false, error: 'Webhook error' },
        ],
      });

      render(<NotificationsPage />);

      await waitFor(() => {
        expect(screen.getByText('Test All Channels')).toBeTruthy();
      });

      fireEvent.click(screen.getByText('Test All Channels'));

      await waitFor(() => {
        expect(vi.mocked(showToast)).toHaveBeenCalledWith('warning', 'Some channels failed');
      });
    });

    it('shows error toast when test API call fails', async () => {
      vi.useRealTimers();
      setupMocks();

      vi.mocked(apiPost).mockRejectedValueOnce(new Error('Network failure'));

      render(<NotificationsPage />);

      await waitFor(() => {
        expect(screen.getByText('Test All Channels')).toBeTruthy();
      });

      fireEvent.click(screen.getByText('Test All Channels'));

      await waitFor(() => {
        expect(vi.mocked(showToast)).toHaveBeenCalledWith('error', expect.any(String));
      });
    });
  });

  // -----------------------------------------------------------------------
  // Disabled notifications banner
  // -----------------------------------------------------------------------

  describe('notifications disabled banner', () => {
    it('shows disabled banner when notifications are disabled', async () => {
      vi.useRealTimers();

      const disabledStatus = {
        enabled: false,
        channels: [
          { name: 'telegram', enabled: true },
        ],
      };

      setupMocks(disabledStatus, mockLogs);

      render(<NotificationsPage />);

      await waitFor(() => {
        expect(screen.getByText(/Notifications are disabled/)).toBeTruthy();
      });
    });
  });

  // -----------------------------------------------------------------------
  // Fetch error paths
  // -----------------------------------------------------------------------

  describe('fetch errors', () => {
    it('shows error when fetchStatus fails', async () => {
      vi.useRealTimers();

      vi.mocked(apiGet).mockImplementation((url: string) => {
        if (url.includes('/notifications/status'))
          return Promise.reject(new Error('Network error'));
        if (url.includes('/notifications/log')) return Promise.resolve(mockLogs);
        return Promise.reject(new Error(`Unexpected URL: ${url}`));
      });

      render(<NotificationsPage />);

      await waitFor(() => {
        expect(vi.mocked(showToast)).toHaveBeenCalledWith('error', expect.any(String));
      });
    });

    it('shows error when fetchLogs fails', async () => {
      vi.useRealTimers();

      vi.mocked(apiGet).mockImplementation((url: string) => {
        if (url.includes('/notifications/status')) return Promise.resolve(mockStatus);
        if (url.includes('/notifications/log'))
          return Promise.reject(new Error('Network error'));
        return Promise.reject(new Error(`Unexpected URL: ${url}`));
      });

      render(<NotificationsPage />);

      await waitFor(() => {
        expect(vi.mocked(showToast)).toHaveBeenCalledWith('error', expect.any(String));
      });
    });
  });

  // -----------------------------------------------------------------------
  // Settings tab
  // -----------------------------------------------------------------------

  describe('Settings tab', () => {
    it('shows Settings tab with notification configuration', async () => {
      vi.useRealTimers();

      vi.mocked(apiGet).mockImplementation((url: string) => {
        if (url.includes('/notifications/status')) return Promise.resolve(mockStatus);
        if (url.includes('/notifications/log')) return Promise.resolve(mockLogs);
        if (url === '/v1/admin/settings') return Promise.resolve({
          notifications: {
            enabled: 'true',
            telegram_bot_token: true, // credential configured
            telegram_chat_id: '12345',
            locale: 'en',
            discord_webhook_url: false,
            ntfy_server: '',
            ntfy_topic: '',
            slack_webhook_url: false,
            rate_limit_rpm: '20',
          },
          telegram: {
            enabled: 'false',
            bot_token: false,
            locale: 'en',
          },
        });
        return Promise.resolve({});
      });

      render(<NotificationsPage />);

      await waitFor(() => {
        expect(screen.getAllByText('Settings').length).toBeGreaterThan(0);
      });

      // Click Settings tab
      const settingsBtns = screen.getAllByText('Settings');
      fireEvent.click(settingsBtns[0]);

      await waitFor(() => {
        expect(screen.getByText('Notification Configuration')).toBeTruthy();
      });

      expect(screen.getByText('Telegram')).toBeTruthy();
      expect(screen.getByText('Other Channels')).toBeTruthy();
    });

    it('saves notification settings', async () => {
      vi.useRealTimers();

      vi.mocked(apiGet).mockImplementation((url: string) => {
        if (url.includes('/notifications/status')) return Promise.resolve(mockStatus);
        if (url.includes('/notifications/log')) return Promise.resolve(mockLogs);
        if (url === '/v1/admin/settings') return Promise.resolve({
          notifications: {
            enabled: 'true',
            telegram_chat_id: '12345',
            locale: 'en',
            rate_limit_rpm: '20',
          },
          telegram: {
            enabled: 'false',
            locale: 'en',
          },
        });
        return Promise.resolve({});
      });
      vi.mocked(apiPut).mockResolvedValueOnce(undefined);

      render(<NotificationsPage />);

      // Switch to Settings tab
      const settingsBtns = screen.getAllByText('Settings');
      fireEvent.click(settingsBtns[0]);

      await waitFor(() => {
        expect(screen.getByText('Notification Configuration')).toBeTruthy();
      });

      // Change chat ID
      const chatIdInput = screen.getByLabelText('Telegram Chat ID') as HTMLInputElement;
      fireEvent.input(chatIdInput, { target: { value: '99999' } });

      // Save
      await waitFor(() => {
        expect(screen.getByText('Save')).toBeTruthy();
      });

      fireEvent.click(screen.getByText('Save'));

      await waitFor(() => {
        expect(vi.mocked(apiPut)).toHaveBeenCalledWith('/v1/admin/settings', {
          settings: expect.arrayContaining([
            expect.objectContaining({ key: 'notifications.telegram_chat_id', value: '99999' }),
          ]),
        });
      });
    });

    it('runs test notification from settings tab', async () => {
      vi.useRealTimers();

      vi.mocked(apiGet).mockImplementation((url: string) => {
        if (url.includes('/notifications/status')) return Promise.resolve(mockStatus);
        if (url.includes('/notifications/log')) return Promise.resolve(mockLogs);
        if (url === '/v1/admin/settings') return Promise.resolve({
          notifications: { enabled: 'true' },
          telegram: { enabled: 'false' },
        });
        return Promise.resolve({});
      });

      vi.mocked(apiPost).mockResolvedValueOnce({
        results: [{ channel: 'telegram', success: true }],
      });

      render(<NotificationsPage />);

      const settingsBtns = screen.getAllByText('Settings');
      fireEvent.click(settingsBtns[0]);

      await waitFor(() => {
        expect(screen.getByText('Test Notification')).toBeTruthy();
      });

      fireEvent.click(screen.getByText('Test Notification'));

      await waitFor(() => {
        expect(vi.mocked(apiPost)).toHaveBeenCalledWith('/v1/admin/notifications/test', {});
      });
    });

    it('shows error when settings fetch fails', async () => {
      vi.useRealTimers();

      vi.mocked(apiGet).mockImplementation((url: string) => {
        if (url.includes('/notifications/status')) return Promise.resolve(mockStatus);
        if (url.includes('/notifications/log')) return Promise.resolve(mockLogs);
        if (url === '/v1/admin/settings')
          return Promise.reject(new Error('Settings fetch failed'));
        return Promise.resolve({});
      });

      render(<NotificationsPage />);

      const settingsBtns = screen.getAllByText('Settings');
      fireEvent.click(settingsBtns[0]);

      await waitFor(() => {
        expect(vi.mocked(showToast)).toHaveBeenCalledWith('error', expect.any(String));
      });
    });

    it('discards notification settings changes', async () => {
      vi.useRealTimers();

      vi.mocked(apiGet).mockImplementation((url: string) => {
        if (url.includes('/notifications/status')) return Promise.resolve(mockStatus);
        if (url.includes('/notifications/log')) return Promise.resolve(mockLogs);
        if (url === '/v1/admin/settings') return Promise.resolve({
          notifications: { enabled: 'true', telegram_chat_id: '12345' },
          telegram: { enabled: 'false' },
        });
        return Promise.resolve({});
      });

      render(<NotificationsPage />);

      const settingsBtns = screen.getAllByText('Settings');
      fireEvent.click(settingsBtns[0]);

      await waitFor(() => {
        expect(screen.getByText('Notification Configuration')).toBeTruthy();
      });

      const chatIdInput = screen.getByLabelText('Telegram Chat ID') as HTMLInputElement;
      fireEvent.input(chatIdInput, { target: { value: '99999' } });

      await waitFor(() => {
        expect(screen.getByText('Discard')).toBeTruthy();
      });

      fireEvent.click(screen.getByText('Discard'));

      // Save bar should disappear
      await waitFor(() => {
        expect(screen.queryByText('Discard')).toBeNull();
      });
    });
  });

  // -----------------------------------------------------------------------
  // Initial loading state
  // -----------------------------------------------------------------------

  describe('loading skeleton', () => {
    it('shows skeleton cards during initial load', async () => {
      vi.useRealTimers();

      // Never resolve so we stay in loading state
      vi.mocked(apiGet).mockImplementation(() => new Promise(() => {}));

      const { container } = render(<NotificationsPage />);

      // Skeleton cards should be visible
      const skeletons = container.querySelectorAll('.stat-skeleton');
      expect(skeletons.length).toBeGreaterThan(0);
    });
  });
});
