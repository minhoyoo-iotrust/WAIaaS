import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
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
  getErrorMessage: (code: string) => {
    if (code === 'NETWORK_ERROR') return 'Cannot connect to the daemon. Check if it is running.';
    return `Error: ${code}`;
  },
}));

vi.mock('../utils/dirty-guard', () => ({
  registerDirty: vi.fn(),
  unregisterDirty: vi.fn(),
  hasDirty: { value: false },
}));

import TransactionsPage from '../pages/transactions';

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

const mockTxResponse = {
  items: [
    {
      id: 'tx-1',
      walletId: 'wallet-uuid-1',
      walletName: 'Test Wallet',
      type: 'TRANSFER',
      status: 'CONFIRMED',
      tier: 'AUTO',
      toAddress: '0x1234567890abcdef1234567890abcdef12345678',
      amount: '1.5',
      amountUsd: 3000,
      network: 'ethereum-mainnet',
      txHash: '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
      chain: 'evm',
      createdAt: Math.floor(Date.now() / 1000),
    },
    {
      id: 'tx-2',
      walletId: 'wallet-uuid-2',
      walletName: null,
      type: 'TOKEN_TRANSFER',
      status: 'FAILED',
      tier: null,
      toAddress: null,
      amount: null,
      amountUsd: null,
      network: 'devnet',
      txHash: null,
      chain: 'solana',
      createdAt: null,
    },
  ],
  total: 2,
  offset: 0,
  limit: 20,
};

const mockIncomingResponse = {
  items: [
    {
      id: 'itx-1',
      txHash: '0xincoming123',
      walletId: 'wallet-uuid-1',
      walletName: 'Test Wallet',
      fromAddress: '0xsender1234567890abcdef',
      amount: '1000000000',
      tokenAddress: null,
      chain: 'evm',
      network: 'ethereum-mainnet',
      status: 'CONFIRMED',
      blockNumber: 12345,
      detectedAt: 1700000000,
      confirmedAt: 1700000100,
      suspicious: false,
    },
  ],
  total: 1,
  offset: 0,
  limit: 20,
};

const mockWallets = {
  items: [
    { id: 'wallet-uuid-1', name: 'Test Wallet', chain: 'evm', network: 'ethereum-mainnet', status: 'ACTIVE', monitorIncoming: true },
    { id: 'wallet-uuid-2', name: 'Sol Wallet', chain: 'solana', network: 'mainnet', status: 'ACTIVE', monitorIncoming: false },
  ],
};

const mockSettings = {
  'incoming.enabled': { value: 'true', source: 'db' },
  'incoming.poll_interval': { value: '30', source: 'config' },
  'incoming.retention_days': { value: '90', source: 'config' },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function setupMocks(txResponse = mockTxResponse, incomingResponse = mockIncomingResponse) {
  mockApiGet.mockImplementation((url: string) => {
    if (url.includes('/v1/admin/transactions')) return Promise.resolve(txResponse);
    if (url.includes('/v1/admin/incoming')) return Promise.resolve(incomingResponse);
    if (url.includes('/v1/wallets')) return Promise.resolve(mockWallets);
    if (url.includes('/v1/admin/settings')) return Promise.resolve(mockSettings);
    return Promise.resolve({});
  });
}

async function waitForTableData() {
  await waitFor(() => {
    expect(screen.getByText('wallet-u')).toBeTruthy();
  });
}

function getFirstDataRow(): HTMLElement {
  const cell = screen.getByText('0x12..5678');
  return cell.closest('tr')!;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('TransactionsPage', () => {
  beforeEach(() => {
    setupMocks();
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  // --- Tab navigation ---

  it('renders 2 tabs', async () => {
    render(<TransactionsPage />);
    await waitForTableData();

    // "All Transactions" appears in tab + breadcrumb
    const allTxTexts = screen.getAllByText('All Transactions');
    expect(allTxTexts.length).toBeGreaterThanOrEqual(1);
    const monitorTexts = screen.getAllByText('Monitor Settings');
    expect(monitorTexts.length).toBeGreaterThanOrEqual(1);
  });

  it('defaults to All Transactions tab', async () => {
    render(<TransactionsPage />);
    await waitForTableData();

    // Tab button should have active class
    const tabBtns = screen.getAllByText('All Transactions');
    const activeTab = tabBtns.find((el) => el.classList.contains('tab-btn'));
    expect(activeTab).toBeTruthy();
    expect(activeTab!.classList.contains('active')).toBe(true);
  });

  it('switches to Monitor Settings tab', async () => {
    render(<TransactionsPage />);
    await waitForTableData();

    fireEvent.click(screen.getByText('Monitor Settings'));

    await waitFor(() => {
      expect(screen.getByText('Incoming TX Monitoring Settings')).toBeTruthy();
    });
  });

  // --- Unified table ---

  it('renders unified table with outgoing and incoming data', async () => {
    render(<TransactionsPage />);
    await waitForTableData();

    // Direction badges (also "Outgoing"/"Incoming" in filter dropdown options)
    const outgoingBadges = screen.getAllByText('Outgoing');
    expect(outgoingBadges.length).toBeGreaterThanOrEqual(1);
    // "Incoming" appears in direction filter option + badges
    const incomingTexts = screen.getAllByText('Incoming');
    expect(incomingTexts.length).toBeGreaterThanOrEqual(1);

    // Column headers
    const directionHeaders = screen.getAllByText('Direction');
    expect(directionHeaders.length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Counterparty')).toBeTruthy();
  });

  it('shows Direction filter with All/Outgoing/Incoming', async () => {
    render(<TransactionsPage />);
    await waitForTableData();

    // Direction label appears as filter label and column header
    const directionLabels = screen.getAllByText('Direction');
    expect(directionLabels.length).toBeGreaterThanOrEqual(1);
  });

  // --- Direction filter ---

  it('Outgoing direction calls only outgoing API', async () => {
    render(<TransactionsPage />);
    await waitForTableData();

    mockApiGet.mockClear();
    setupMocks();

    // Find the Direction select (first select)
    const selects = screen.getAllByRole('combobox');
    const directionSelect = selects[0]!;

    fireEvent.change(directionSelect, { target: { value: 'outgoing' } });

    await waitFor(() => {
      const calls = mockApiGet.mock.calls;
      const txCalls = calls.filter((c) => (c[0] as string).includes('/v1/admin/transactions'));
      const inCalls = calls.filter((c) => (c[0] as string).includes('/v1/admin/incoming'));
      expect(txCalls.length).toBeGreaterThanOrEqual(1);
      expect(inCalls.length).toBe(0);
    });
  });

  it('Incoming direction calls only incoming API', async () => {
    render(<TransactionsPage />);
    await waitForTableData();

    mockApiGet.mockClear();
    setupMocks();

    const selects = screen.getAllByRole('combobox');
    const directionSelect = selects[0]!;

    fireEvent.change(directionSelect, { target: { value: 'incoming' } });

    await waitFor(() => {
      const calls = mockApiGet.mock.calls;
      const txCalls = calls.filter((c) => (c[0] as string).includes('/v1/admin/transactions'));
      const inCalls = calls.filter((c) => (c[0] as string).includes('/v1/admin/incoming'));
      expect(txCalls.length).toBe(0);
      expect(inCalls.length).toBeGreaterThanOrEqual(1);
    });
  });

  it('All direction calls both APIs', async () => {
    render(<TransactionsPage />);

    await waitFor(() => {
      const calls = mockApiGet.mock.calls;
      const txCalls = calls.filter((c) => (c[0] as string).includes('/v1/admin/transactions'));
      const inCalls = calls.filter((c) => (c[0] as string).includes('/v1/admin/incoming'));
      expect(txCalls.length).toBeGreaterThanOrEqual(1);
      expect(inCalls.length).toBeGreaterThanOrEqual(1);
    });
  });

  // --- Conditional filters ---

  it('hides SearchInput when direction is incoming', async () => {
    render(<TransactionsPage />);
    await waitForTableData();

    // SearchInput should exist initially (direction=all)
    expect(screen.getByPlaceholderText('Search by txHash or recipient address...')).toBeTruthy();

    // Change to incoming
    const selects = screen.getAllByRole('combobox');
    fireEvent.change(selects[0]!, { target: { value: 'incoming' } });

    await waitFor(() => {
      expect(screen.queryByPlaceholderText('Search by txHash or recipient address...')).toBeFalsy();
    });
  });

  // --- Expanded row ---

  it('row click expands outgoing detail view', async () => {
    render(<TransactionsPage />);
    await waitForTableData();

    const row = getFirstDataRow();
    fireEvent.click(row);

    await waitFor(() => {
      expect(screen.getByText('tx-1')).toBeTruthy();
      expect(screen.getByText('wallet-uuid-1')).toBeTruthy();
      expect(screen.getByText('AUTO')).toBeTruthy();
    });
  });

  it('second click collapses expanded row', async () => {
    render(<TransactionsPage />);
    await waitForTableData();

    const row = getFirstDataRow();
    fireEvent.click(row);

    await waitFor(() => {
      expect(screen.getByText('tx-1')).toBeTruthy();
    });

    fireEvent.click(row);

    await waitFor(() => {
      expect(screen.queryByText('Wallet ID')).toBeFalsy();
    });
  });

  // --- Loading / Empty / Error ---

  it('shows loading state', async () => {
    mockApiGet.mockImplementation((url: string) => {
      if (url.includes('/v1/admin/transactions') || url.includes('/v1/admin/incoming')) {
        return new Promise((resolve) =>
          setTimeout(() => resolve(mockTxResponse), 500),
        );
      }
      if (url.includes('/v1/wallets')) return Promise.resolve(mockWallets);
      if (url.includes('/v1/admin/settings')) return Promise.resolve(mockSettings);
      return Promise.resolve({});
    });

    render(<TransactionsPage />);
    expect(screen.getByText('Loading...')).toBeTruthy();
  });

  it('shows empty state', async () => {
    setupMocks(
      { items: [], total: 0, offset: 0, limit: 20 },
      { items: [], total: 0, offset: 0, limit: 20 },
    );

    render(<TransactionsPage />);

    await waitFor(() => {
      expect(screen.getByText('No transactions found')).toBeTruthy();
    });
  });

  it('shows error state with retry', async () => {
    mockApiGet.mockImplementation((url: string) => {
      if (url.includes('/v1/admin/transactions') || url.includes('/v1/admin/incoming')) {
        return Promise.reject(new ApiError(0, 'NETWORK_ERROR', 'Cannot connect'));
      }
      if (url.includes('/v1/wallets')) return Promise.resolve(mockWallets);
      if (url.includes('/v1/admin/settings')) return Promise.resolve(mockSettings);
      return Promise.resolve({});
    });

    render(<TransactionsPage />);

    await waitFor(() => {
      expect(
        screen.getByText('Cannot connect to the daemon. Check if it is running.'),
      ).toBeTruthy();
    });

    expect(screen.getByText('Retry')).toBeTruthy();
  });

  // --- Pagination ---

  it('pagination controls work', async () => {
    setupMocks(
      { items: mockTxResponse.items, total: 50, offset: 0, limit: 20 },
      { items: [], total: 0, offset: 0, limit: 20 },
    );

    render(<TransactionsPage />);
    await waitForTableData();

    const paginationInfo = document.querySelector('.pagination-info');
    expect(paginationInfo).toBeTruthy();
    expect(paginationInfo!.textContent).toContain('50');

    const nextBtn = screen.getByText('Next');
    expect((nextBtn as HTMLButtonElement).disabled).toBe(false);

    const prevBtn = screen.getByText('Previous');
    expect((prevBtn as HTMLButtonElement).disabled).toBe(true);

    fireEvent.click(nextBtn);

    await waitFor(() => {
      const calls = mockApiGet.mock.calls;
      const txCalls = calls.filter((c) => (c[0] as string).includes('/v1/admin/transactions'));
      const lastCall = txCalls[txCalls.length - 1]?.[0] as string;
      expect(lastCall).toContain('offset=20');
    });
  });

  // --- Explorer link ---

  it('renders explorer link for txHash', async () => {
    render(<TransactionsPage />);
    await waitForTableData();

    const explorerLink = screen.getByText(/0xabcdef/);
    expect(explorerLink.tagName).toBe('A');
    expect(explorerLink.getAttribute('href')).toContain('etherscan.io');
  });

  // --- Filter change ---

  it('filter change triggers refetch', async () => {
    render(<TransactionsPage />);
    await waitForTableData();

    const selects = screen.getAllByRole('combobox');
    // selects[0] = Direction, selects[1] = Wallet, selects[2] = Type, ...
    const typeSelect = selects[2];

    fireEvent.change(typeSelect!, { target: { value: 'APPROVE' } });

    await waitFor(() => {
      const calls = mockApiGet.mock.calls;
      const txCalls = calls.filter((c) => (c[0] as string).includes('/v1/admin/transactions'));
      const lastCall = txCalls[txCalls.length - 1]?.[0] as string;
      expect(lastCall).toContain('type=APPROVE');
    });
  });

  // --- Monitor Settings tab ---

  it('Monitor Settings tab renders settings fields', async () => {
    render(<TransactionsPage />);
    await waitForTableData();

    fireEvent.click(screen.getByText('Monitor Settings'));

    await waitFor(() => {
      expect(screen.getByText('Monitoring Enabled')).toBeTruthy();
    });

    expect(screen.getByText('Poll Interval (seconds)')).toBeTruthy();
    expect(screen.getByText('Retention Days')).toBeTruthy();
    expect(screen.getByText('Suspicious Dust USD Threshold')).toBeTruthy();
    expect(screen.getByText('Suspicious Amount Multiplier')).toBeTruthy();
    expect(screen.getByText('Notification Cooldown (minutes)')).toBeTruthy();
    expect(screen.getByText('WebSocket URL (optional)')).toBeTruthy();
  });

  it('Monitor Settings tab renders per-wallet toggles', async () => {
    render(<TransactionsPage />);
    await waitForTableData();

    fireEvent.click(screen.getByText('Monitor Settings'));

    await waitFor(() => {
      expect(screen.getByText('Per-Wallet Monitoring')).toBeTruthy();
    });

    // Toggle buttons
    const onButtons = screen.getAllByText('ON');
    const offButtons = screen.getAllByText('OFF');
    expect(onButtons.length).toBeGreaterThanOrEqual(1);
    expect(offButtons.length).toBeGreaterThanOrEqual(1);
  });

  it('toggles wallet monitoring on click', async () => {
    mockApiPatch.mockResolvedValue({ id: 'wallet-uuid-2', monitorIncoming: true });

    render(<TransactionsPage />);
    await waitForTableData();

    fireEvent.click(screen.getByText('Monitor Settings'));

    await waitFor(() => {
      expect(screen.getByText('Per-Wallet Monitoring')).toBeTruthy();
    });

    const offButtons = screen.getAllByText('OFF');
    fireEvent.click(offButtons[0]!);

    await waitFor(() => {
      expect(mockApiPatch).toHaveBeenCalledWith(
        '/v1/wallets/wallet-uuid-2',
        { monitorIncoming: true },
      );
    });
  });
});
