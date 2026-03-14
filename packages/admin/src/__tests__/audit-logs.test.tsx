import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent, cleanup } from '@testing-library/preact';

const mockApiGet = vi.fn();

vi.mock('../api/typed-client', () => ({
  api: {
    GET: (...args: unknown[]) => mockApiGet(...args),
    POST: vi.fn(),
    PUT: vi.fn(),
    DELETE: vi.fn(),
  },
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
  getErrorMessage: (code: string) => `Error: ${code}`,
}));

import { ApiError } from '../api/typed-client';
import { showToast } from '../components/toast';
import AuditLogsPage from '../pages/audit-logs';

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

const now = Math.floor(Date.now() / 1000);

const mockLogItems = [
  {
    id: 100,
    timestamp: now - 3600,
    eventType: 'WALLET_CREATED' as const,
    actor: 'admin',
    walletId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
    sessionId: null,
    txId: null,
    details: { name: 'My Wallet', chain: 'evm' },
    severity: 'info' as const,
    ipAddress: '127.0.0.1',
  },
  {
    id: 99,
    timestamp: now - 7200,
    eventType: 'KILL_SWITCH_ACTIVATED' as const,
    actor: 'system',
    walletId: null,
    sessionId: null,
    txId: null,
    details: { reason: 'manual' },
    severity: 'critical' as const,
    ipAddress: null,
  },
  {
    id: 98,
    timestamp: now - 10800,
    eventType: 'TX_SUBMITTED' as const,
    actor: 'session:abc123',
    walletId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
    sessionId: 'sess-1',
    txId: 'tx-uuid-1234',
    details: { amount: '1.0', to: '0x1234' },
    severity: 'warning' as const,
    ipAddress: '192.168.1.1',
  },
];

const mockResponse = {
  data: mockLogItems,
  nextCursor: 97,
  hasMore: true,
  total: 150,
};

const mockEmptyResponse = {
  data: [],
  nextCursor: null,
  hasMore: false,
  total: 0,
};

const mockPage2Response = {
  data: [
    {
      id: 97,
      timestamp: now - 14400,
      eventType: 'SESSION_CREATED' as const,
      actor: 'admin',
      walletId: null,
      sessionId: 'sess-2',
      txId: null,
      details: {},
      severity: 'info' as const,
      ipAddress: '10.0.0.1',
    },
  ],
  nextCursor: null,
  hasMore: false,
  total: 150,
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function setupMock(response: Record<string, unknown> = mockResponse) {
  mockApiGet.mockResolvedValue({ data: response });
}

async function waitForData() {
  await waitFor(() => {
    expect(screen.getByText('WALLET CREATED')).toBeTruthy();
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AuditLogsPage', () => {
  beforeEach(() => {
    window.location.hash = '#/audit-logs';
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  // --- Rendering ---

  it('renders loading state then displays audit logs', async () => {
    setupMock();
    render(<AuditLogsPage />);
    // Initially loading
    expect(screen.getByText('Loading...')).toBeTruthy();
    await waitForData();
    // Check rows
    expect(screen.getByText('WALLET CREATED')).toBeTruthy();
    expect(screen.getByText('KILL SWITCH ACTIVATED')).toBeTruthy();
    expect(screen.getByText('TX SUBMITTED')).toBeTruthy();
  });

  it('renders empty state when no logs', async () => {
    setupMock(mockEmptyResponse);
    render(<AuditLogsPage />);
    await waitFor(() => {
      expect(screen.getByText('No audit logs found')).toBeTruthy();
    });
  });

  it('displays total count', async () => {
    setupMock();
    render(<AuditLogsPage />);
    await waitForData();
    expect(screen.getByText('150 total logs')).toBeTruthy();
  });

  // --- Severity badges ---

  it('renders severity badges with correct variants', async () => {
    setupMock();
    render(<AuditLogsPage />);
    await waitForData();
    expect(screen.getByText('INFO')).toBeTruthy();
    expect(screen.getByText('CRITICAL')).toBeTruthy();
    expect(screen.getByText('WARNING')).toBeTruthy();
  });

  // --- Table columns ---

  it('renders actor and IP columns', async () => {
    setupMock();
    render(<AuditLogsPage />);
    await waitForData();
    expect(screen.getByText('admin')).toBeTruthy();
    expect(screen.getByText('127.0.0.1')).toBeTruthy();
    expect(screen.getByText('192.168.1.1')).toBeTruthy();
  });

  it('truncates wallet and TX IDs', async () => {
    setupMock();
    render(<AuditLogsPage />);
    await waitForData();
    // walletId truncated
    expect(screen.getAllByText('aaaaaaaa...').length).toBeGreaterThan(0);
    // txId truncated
    expect(screen.getByText('tx-uuid-...')).toBeTruthy();
  });

  // --- Filters ---

  it('calls API with event_type filter', async () => {
    setupMock();
    render(<AuditLogsPage />);
    await waitForData();
    mockApiGet.mockClear();
    setupMock();

    // Change event type filter
    const selects = screen.getAllByRole('combobox');
    const eventTypeSelect = selects[0]!; // first select is event_type
    fireEvent.change(eventTypeSelect, { target: { value: 'KILL_SWITCH_ACTIVATED' } });

    await waitFor(() => {
      const lastCall = mockApiGet.mock.calls[0];
      expect(lastCall).toBeTruthy();
      const opts = lastCall?.[1] as { params?: { query?: Record<string, unknown> } };
      expect(opts?.params?.query?.event_type).toBe('KILL_SWITCH_ACTIVATED');
    });
  });

  it('calls API with severity filter', async () => {
    setupMock();
    render(<AuditLogsPage />);
    await waitForData();
    mockApiGet.mockClear();
    setupMock();

    const selects = screen.getAllByRole('combobox');
    const severitySelect = selects[1]!; // second select is severity
    fireEvent.change(severitySelect, { target: { value: 'critical' } });

    await waitFor(() => {
      const lastCall = mockApiGet.mock.calls[0];
      expect(lastCall).toBeTruthy();
      const opts = lastCall?.[1] as { params?: { query?: Record<string, unknown> } };
      expect(opts?.params?.query?.severity).toBe('critical');
    });
  });

  it('calls API with date range filters', async () => {
    setupMock();
    render(<AuditLogsPage />);
    await waitForData();
    mockApiGet.mockClear();
    setupMock();

    const dateInputs = screen.getAllByDisplayValue('');
    // Find date inputs (type="date")
    const fromInput = dateInputs.find((el) => el.closest('.filter-field')?.querySelector('label')?.textContent === 'From')!;
    fireEvent.change(fromInput, { target: { value: '2026-03-01' } });

    await waitFor(() => {
      const lastCall = mockApiGet.mock.calls[0];
      expect(lastCall).toBeTruthy();
      const opts = lastCall?.[1] as { params?: { query?: Record<string, unknown> } };
      expect(opts?.params?.query?.from).toBeTruthy();
    });
  });

  it('resets pagination when filters change', async () => {
    setupMock();
    render(<AuditLogsPage />);
    await waitForData();

    // Go to page 2
    mockApiGet.mockClear();
    mockApiGet.mockResolvedValue({ data: mockPage2Response });
    fireEvent.click(screen.getByText('Next'));

    await waitFor(() => {
      expect(screen.getByText('Page 2')).toBeTruthy();
    });

    // Change filter -- should reset to page 1
    mockApiGet.mockClear();
    setupMock();
    const selects = screen.getAllByRole('combobox');
    fireEvent.change(selects[1]!, { target: { value: 'info' } });

    await waitFor(() => {
      expect(screen.getByText('Page 1')).toBeTruthy();
    });
  });

  // --- Pagination ---

  it('navigates to next page', async () => {
    setupMock();
    render(<AuditLogsPage />);
    await waitForData();

    expect(screen.getByText('Page 1')).toBeTruthy();
    const prevBtn = screen.getByText('Previous');
    expect(prevBtn.closest('button')?.disabled).toBe(true);

    mockApiGet.mockClear();
    mockApiGet.mockResolvedValue({ data: mockPage2Response });

    fireEvent.click(screen.getByText('Next'));

    await waitFor(() => {
      expect(screen.getByText('Page 2')).toBeTruthy();
      expect(screen.getByText('SESSION CREATED')).toBeTruthy();
    });

    // Next should be disabled on last page
    const nextBtn = screen.getByText('Next');
    expect(nextBtn.closest('button')?.disabled).toBe(true);

    // Verify cursor was passed
    const callOpts = mockApiGet.mock.calls[0]?.[1] as { params?: { query?: Record<string, unknown> } };
    expect(callOpts?.params?.query?.cursor).toBe(97);
  });

  it('navigates back to previous page', async () => {
    setupMock();
    render(<AuditLogsPage />);
    await waitForData();

    // Go to page 2
    mockApiGet.mockClear();
    mockApiGet.mockResolvedValue({ data: mockPage2Response });
    fireEvent.click(screen.getByText('Next'));

    await waitFor(() => {
      expect(screen.getByText('Page 2')).toBeTruthy();
    });

    // Go back to page 1
    mockApiGet.mockClear();
    setupMock();
    fireEvent.click(screen.getByText('Previous'));

    await waitFor(() => {
      expect(screen.getByText('Page 1')).toBeTruthy();
      expect(screen.getByText('WALLET CREATED')).toBeTruthy();
    });
  });

  // --- Detail modal ---

  it('opens detail modal on row click', async () => {
    setupMock();
    render(<AuditLogsPage />);
    await waitForData();

    // Click on the first row
    const row = screen.getByText('WALLET CREATED').closest('tr')!;
    fireEvent.click(row);

    await waitFor(() => {
      expect(screen.getByText('Audit Log Detail')).toBeTruthy();
    });

    // Check detail fields
    expect(screen.getByText('WALLET_CREATED')).toBeTruthy();
    // Check JSON details
    expect(screen.getByText(/"name": "My Wallet"/)).toBeTruthy();
  });

  it('closes detail modal', async () => {
    setupMock();
    render(<AuditLogsPage />);
    await waitForData();

    // Open modal
    const row = screen.getByText('WALLET CREATED').closest('tr')!;
    fireEvent.click(row);

    await waitFor(() => {
      expect(screen.getByText('Audit Log Detail')).toBeTruthy();
    });

    // Close modal
    fireEvent.click(screen.getByText('Close'));

    await waitFor(() => {
      expect(screen.queryByText('Audit Log Detail')).toBeNull();
    });
  });

  // --- Error handling ---

  it('shows toast on API error', async () => {
    mockApiGet.mockRejectedValue(new ApiError(500, 'INTERNAL_ERROR', 'Server error'));
    render(<AuditLogsPage />);

    await waitFor(() => {
      expect(showToast).toHaveBeenCalledWith('error', 'Error: INTERNAL_ERROR');
    });
  });

  // --- Navigation entry ---

  it('has Audit Logs in page', async () => {
    setupMock();
    const { container } = render(<AuditLogsPage />);
    await waitForData();
    // The page renders with filter bar and table
    expect(container.querySelector('.filter-bar')).toBeTruthy();
    expect(container.querySelector('.table-container')).toBeTruthy();
  });
});
