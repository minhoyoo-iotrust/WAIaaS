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
        expect(screen.getByText('Channels & Logs')).toBeTruthy();
      });

      // Click Telegram Users tab
      fireEvent.click(screen.getByText('Telegram Users'));

      await waitFor(() => {
        expect(screen.getByTestId('telegram-users-content')).toBeTruthy();
      });
    });

    it('switches back to Channels & Logs from Telegram Users', async () => {
      vi.useRealTimers();
      setupMocks();

      render(<NotificationsPage />);

      await waitFor(() => {
        expect(screen.getByText('Channels & Logs')).toBeTruthy();
      });

      // Switch to Telegram Users
      fireEvent.click(screen.getByText('Telegram Users'));
      await waitFor(() => {
        expect(screen.getByTestId('telegram-users-content')).toBeTruthy();
      });

      // Switch back
      fireEvent.click(screen.getByText('Channels & Logs'));
      await waitFor(() => {
        expect(screen.getByText('Channel Status')).toBeTruthy();
      });
    });
  });
});
