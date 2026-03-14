import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent, cleanup } from '@testing-library/preact';


const mockApiGet = vi.fn();
const mockApiPost = vi.fn();
const mockApiPut = vi.fn();
const mockApiDelete = vi.fn();
const mockApiPatch = vi.fn();

// Mock declarations moved to top-level const

vi.mock('../api/typed-client', () => ({
  api: {
    GET: (...args: unknown[]) => mockApiGet(...args),
    POST: (...args: unknown[]) => mockApiPost(...args),
    PUT: (...args: unknown[]) => mockApiPut(...args),
    DELETE: (...args: unknown[]) => mockApiDelete(...args),
    PATCH: (...args: unknown[]) => mockApiPatch(...args),
  },
  ApiError: class ApiError extends Error {
    status: number; code: string; serverMessage: string;
    constructor(s: number, c: string, m: string) { super(`[${s}] ${c}: ${m}`); this.name = 'ApiError'; this.status = s; this.code = c; this.serverMessage = m; }
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
  getErrorMessage: (code: string) => `Error: ${code}`,
}));

import NotificationsPage from '../pages/notifications';

const mockStatus = {
  enabled: true,
  channels: [
    { name: 'telegram', enabled: true },
    { name: 'discord', enabled: false },
  ],
};

const mockLogs = {
  logs: [
    {
      id: '1',
      eventType: 'tx.submitted',
      walletId: 'abc12345-6789-abcd-ef01-234567890abc',
      channel: 'telegram',
      status: 'sent',
      error: null,
      message: 'Test message',
      createdAt: 1707609600,
    },
    {
      id: '2',
      eventType: 'tx.failed',
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

function setupMocks(statusData = mockStatus, logData = mockLogs) {
  mockApiGet.mockImplementation((url: string) => {
    if (url.includes('/notifications/status')) return Promise.resolve(statusData);
    if (url.includes('/notifications/log')) return Promise.resolve(logData);
    return Promise.reject(new Error(`Unexpected URL: ${url}`));
  });
}

describe('Notification Log Filters and Wallet Link', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('renders filter bar above delivery log with all filter fields', async () => {
    setupMocks();
    const { container } = render(<NotificationsPage />);

    await waitFor(() => {
      expect(screen.getByText('Delivery Log')).toBeTruthy();
    });

    // FilterBar should be present with all 5 field labels
    const filterBar = container.querySelector('.filter-bar');
    expect(filterBar).toBeTruthy();

    // Check filter labels exist
    const labels = filterBar!.querySelectorAll('label');
    const labelTexts = Array.from(labels).map((l) => l.textContent);
    expect(labelTexts).toContain('Event Type');
    expect(labelTexts).toContain('Channel');
    expect(labelTexts).toContain('Status');
    expect(labelTexts).toContain('Since');
    expect(labelTexts).toContain('Until');
  });

  it('event type filter triggers re-fetch with eventType param', async () => {
    setupMocks();
    const { container } = render(<NotificationsPage />);

    await waitFor(() => {
      expect(screen.getByText('Delivery Log')).toBeTruthy();
    });

    // Find the Event Type select in the filter bar
    const filterBar = container.querySelector('.filter-bar');
    const selects = filterBar!.querySelectorAll('select');
    // First select is Event Type
    const eventTypeSelect = selects[0];

    mockApiGet.mockClear();
    setupMocks();

    fireEvent.change(eventTypeSelect, { target: { value: 'tx.submitted' } });

    await waitFor(() => {
      const calls = mockApiGet.mock.calls;
      const logCall = calls.find(
        (c) => typeof c[0] === 'string' && c[0].includes('/notifications/log'),
      );
      expect(logCall).toBeTruthy();
      expect(logCall![0]).toContain('eventType=tx.submitted');
    });
  });

  it('channel filter triggers re-fetch with channel param', async () => {
    setupMocks();
    const { container } = render(<NotificationsPage />);

    await waitFor(() => {
      expect(screen.getByText('Delivery Log')).toBeTruthy();
    });

    const filterBar = container.querySelector('.filter-bar');
    const selects = filterBar!.querySelectorAll('select');
    // Second select is Channel
    const channelSelect = selects[1];

    mockApiGet.mockClear();
    setupMocks();

    fireEvent.change(channelSelect, { target: { value: 'telegram' } });

    await waitFor(() => {
      const calls = mockApiGet.mock.calls;
      const logCall = calls.find(
        (c) => typeof c[0] === 'string' && c[0].includes('/notifications/log'),
      );
      expect(logCall).toBeTruthy();
      expect(logCall![0]).toContain('channel=telegram');
    });
  });

  it('status filter triggers re-fetch with status param', async () => {
    setupMocks();
    const { container } = render(<NotificationsPage />);

    await waitFor(() => {
      expect(screen.getByText('Delivery Log')).toBeTruthy();
    });

    const filterBar = container.querySelector('.filter-bar');
    const selects = filterBar!.querySelectorAll('select');
    // Third select is Status
    const statusSelect = selects[2];

    mockApiGet.mockClear();
    setupMocks();

    fireEvent.change(statusSelect, { target: { value: 'sent' } });

    await waitFor(() => {
      const calls = mockApiGet.mock.calls;
      const logCall = calls.find(
        (c) => typeof c[0] === 'string' && c[0].includes('/notifications/log'),
      );
      expect(logCall).toBeTruthy();
      expect(logCall![0]).toContain('status=sent');
    });
  });

  it('date filter converts to Unix seconds', async () => {
    setupMocks();
    const { container } = render(<NotificationsPage />);

    await waitFor(() => {
      expect(screen.getByText('Delivery Log')).toBeTruthy();
    });

    const filterBar = container.querySelector('.filter-bar');
    const dateInputs = filterBar!.querySelectorAll('input[type="date"]');
    // First date input is Since
    const sinceInput = dateInputs[0];

    mockApiGet.mockClear();
    setupMocks();

    fireEvent.change(sinceInput, { target: { value: '2026-01-15' } });

    await waitFor(() => {
      const calls = mockApiGet.mock.calls;
      const logCall = calls.find(
        (c) => typeof c[0] === 'string' && c[0].includes('/notifications/log'),
      );
      expect(logCall).toBeTruthy();
      // Should contain since= followed by a number (Unix seconds)
      expect(logCall![0]).toMatch(/since=\d+/);
    });
  });

  it('wallet ID renders as clickable link to wallet detail page', async () => {
    setupMocks();
    const { container } = render(<NotificationsPage />);

    await waitFor(() => {
      expect(screen.getByText('Delivery Log')).toBeTruthy();
    });

    // Find the wallet link
    const walletLinks = container.querySelectorAll('a.wallet-link');
    expect(walletLinks.length).toBeGreaterThanOrEqual(1);

    const link = walletLinks[0] as HTMLAnchorElement;
    expect(link.href).toContain('#/wallets/abc12345-6789');
    expect(link.textContent).toContain('abc12345');
  });

  it('null wallet ID renders as em dash, not a link', async () => {
    setupMocks();
    const { container } = render(<NotificationsPage />);

    await waitFor(() => {
      expect(screen.getByText('Delivery Log')).toBeTruthy();
    });

    // The second log entry has walletId: null, should render em dash
    const rows = container.querySelectorAll('tbody tr');
    expect(rows.length).toBeGreaterThanOrEqual(2);

    // Find the row with the null walletId entry (tx.failed)
    const secondRow = rows[1];
    const cells = secondRow.querySelectorAll('td');
    // Wallet ID column is the 2nd column (index 1)
    const walletCell = cells[1];
    expect(walletCell.textContent).toBe('\u2014');
    // Should NOT contain a link
    expect(walletCell.querySelector('a')).toBeNull();
  });

  it('clear filters resets all and re-fetches without filter params', async () => {
    setupMocks();
    const { container } = render(<NotificationsPage />);

    await waitFor(() => {
      expect(screen.getByText('Delivery Log')).toBeTruthy();
    });

    // First, set a filter
    const filterBar = container.querySelector('.filter-bar');
    const selects = filterBar!.querySelectorAll('select');
    fireEvent.change(selects[0], { target: { value: 'tx.submitted' } });

    await waitFor(() => {
      const calls = mockApiGet.mock.calls;
      const logCall = calls.find(
        (c) => typeof c[0] === 'string' && c[0].includes('eventType=tx.submitted'),
      );
      expect(logCall).toBeTruthy();
    });

    // Clear mocks then click Clear
    mockApiGet.mockClear();
    setupMocks();

    const clearBtn = filterBar!.querySelector('.filter-clear') as HTMLButtonElement;
    expect(clearBtn).toBeTruthy();
    fireEvent.click(clearBtn);

    await waitFor(() => {
      const calls = mockApiGet.mock.calls;
      const logCall = calls.find(
        (c) => typeof c[0] === 'string' && c[0].includes('/notifications/log'),
      );
      expect(logCall).toBeTruthy();
      // After clear, should NOT contain eventType param
      expect(logCall![0]).not.toContain('eventType=');
    });
  });
});
