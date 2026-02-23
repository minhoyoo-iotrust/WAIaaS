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
import TransactionsPage from '../pages/transactions';

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

const mockWallets = [{ id: 'wallet-uuid-1', name: 'Test Wallet', chain: 'evm' }];

const mockSettings = { display: { 'display.currency': 'USD' } };

/**
 * Helper: wait for table data to load.
 * Uses wallet-u text (tx-2 walletId slice) which is unique to the table body.
 */
async function waitForTableData() {
  await waitFor(() => {
    expect(screen.getByText('wallet-u')).toBeTruthy();
  });
}

/** Helper: find the first data row in the table (contains the address) */
function getFirstDataRow(): HTMLElement {
  // formatAddress('0x1234567890abcdef...') => '0x12..5678'
  const cell = screen.getByText('0x12..5678');
  return cell.closest('tr')!;
}

function setupMocks(txResponse = mockTxResponse) {
  vi.mocked(apiGet).mockImplementation((url: string) => {
    if (url.includes('/v1/admin/transactions')) return Promise.resolve(txResponse);
    if (url.includes('/v1/wallets')) return Promise.resolve(mockWallets);
    if (url.includes('/v1/admin/settings')) return Promise.resolve(mockSettings);
    return Promise.resolve({});
  });
}

describe('TransactionsPage', () => {
  beforeEach(() => {
    setupMocks();
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('renders transaction table with data', async () => {
    render(<TransactionsPage />);

    await waitForTableData();

    // Type badges (getAllByText because also in filter dropdown)
    const transferTexts = screen.getAllByText('TRANSFER');
    expect(transferTexts.length).toBeGreaterThanOrEqual(2);

    const tokenTransferTexts = screen.getAllByText('TOKEN_TRANSFER');
    expect(tokenTransferTexts.length).toBeGreaterThanOrEqual(1);

    // Status badges (also in filter options)
    const confirmedTexts = screen.getAllByText('CONFIRMED');
    expect(confirmedTexts.length).toBeGreaterThanOrEqual(1);

    // Amount for tx-1
    expect(screen.getByText(/1\.5/)).toBeTruthy();

    // Wallet name for tx-2 falls back to walletId slice
    expect(screen.getByText('wallet-u')).toBeTruthy();

    // Column headers
    expect(screen.getByText('Time')).toBeTruthy();
    expect(screen.getByText('Tx Hash')).toBeTruthy();
  });

  it('shows loading state', async () => {
    // Delay response to capture loading state
    vi.mocked(apiGet).mockImplementation((url: string) => {
      if (url.includes('/v1/admin/transactions')) {
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

  it('shows empty state when no transactions', async () => {
    setupMocks({ items: [], total: 0, offset: 0, limit: 20 });

    render(<TransactionsPage />);

    await waitFor(() => {
      expect(screen.getByText('No transactions found')).toBeTruthy();
    });
  });

  it('shows error state with retry button', async () => {
    vi.mocked(apiGet).mockImplementation((url: string) => {
      if (url.includes('/v1/admin/transactions')) {
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

    // Setup success response for retry
    setupMocks();

    fireEvent.click(screen.getByText('Retry'));

    await waitForTableData();
  });

  it('renders explorer link for txHash', async () => {
    render(<TransactionsPage />);

    await waitForTableData();

    // tx-1 has ethereum-mainnet + txHash, should render as a link
    const explorerLink = screen.getByText(/0xabcdef/);
    expect(explorerLink).toBeTruthy();
    expect(explorerLink.tagName).toBe('A');
    expect(explorerLink.getAttribute('href')).toContain('etherscan.io');
  });

  it('handles null txHash gracefully', async () => {
    render(<TransactionsPage />);

    await waitForTableData();

    // tx-2 has null txHash, so no explorer link should render for it
    // The row should still render without errors
    const rows = screen.getAllByRole('row');
    // header + 2 data rows = 3
    expect(rows.length).toBeGreaterThanOrEqual(3);
  });

  it('row click expands detail view', async () => {
    render(<TransactionsPage />);

    await waitForTableData();

    // Click on the first data row
    const row = getFirstDataRow();
    fireEvent.click(row);

    // Expanded detail should now show full fields
    await waitFor(() => {
      expect(screen.getByText('tx-1')).toBeTruthy(); // ID field in detail
      expect(screen.getByText('wallet-uuid-1')).toBeTruthy(); // Wallet ID
      expect(screen.getByText('AUTO')).toBeTruthy(); // Tier
      expect(screen.getByText('0x1234567890abcdef1234567890abcdef12345678')).toBeTruthy(); // Full address
    });
  });

  it('pagination controls navigate pages', async () => {
    // Mock a response with more than PAGE_SIZE items
    const largeTxResponse = {
      items: mockTxResponse.items,
      total: 50,
      offset: 0,
      limit: 20,
    };
    setupMocks(largeTxResponse);

    render(<TransactionsPage />);

    await waitForTableData();

    // Check pagination info exists using a text matcher function
    // The text "Showing 1-2 of 50" may be split across elements
    const paginationInfo = document.querySelector('.pagination-info');
    expect(paginationInfo).toBeTruthy();
    expect(paginationInfo!.textContent).toContain('Showing');
    expect(paginationInfo!.textContent).toContain('50');

    // Next button should be enabled
    const nextBtn = screen.getByText('Next');
    expect(nextBtn).toBeTruthy();
    expect((nextBtn as HTMLButtonElement).disabled).toBe(false);

    // Previous button should be disabled on first page
    const prevBtn = screen.getByText('Previous');
    expect((prevBtn as HTMLButtonElement).disabled).toBe(true);

    // Click Next
    fireEvent.click(nextBtn);

    // Verify apiGet was called with offset=20
    await waitFor(() => {
      const calls = vi.mocked(apiGet).mock.calls;
      const txCalls = calls.filter((c) => (c[0] as string).includes('/v1/admin/transactions'));
      const lastCall = txCalls[txCalls.length - 1]?.[0] as string;
      expect(lastCall).toContain('offset=20');
    });
  });

  it('filter change triggers refetch', async () => {
    render(<TransactionsPage />);

    await waitForTableData();

    // Find the Type filter select (second select after Wallet)
    const selects = screen.getAllByRole('combobox');
    // selects: wallet_id, type, status, network
    const typeSelect = selects[1];
    expect(typeSelect).toBeTruthy();

    // Change type filter
    fireEvent.change(typeSelect!, { target: { value: 'APPROVE' } });

    // Verify apiGet was called with type=APPROVE
    await waitFor(() => {
      const calls = vi.mocked(apiGet).mock.calls;
      const txCalls = calls.filter((c) => (c[0] as string).includes('/v1/admin/transactions'));
      const lastCall = txCalls[txCalls.length - 1]?.[0] as string;
      expect(lastCall).toContain('type=APPROVE');
    });
  });

  it('search input renders and accepts input', async () => {
    render(<TransactionsPage />);

    await waitForTableData();

    // Find the search input
    const searchInput = screen.getByPlaceholderText('Search by txHash or recipient address...');
    expect(searchInput).toBeTruthy();
    expect(searchInput.tagName).toBe('INPUT');
  });

  it('shows dash for null toAddress', async () => {
    render(<TransactionsPage />);

    await waitForTableData();

    // tx-2 has null toAddress; there should be dash characters in the table
    const dashes = screen.getAllByText('\u2014');
    expect(dashes.length).toBeGreaterThan(0);
  });

  it('second click on expanded row collapses it', async () => {
    render(<TransactionsPage />);

    await waitForTableData();

    // Click to expand
    const row = getFirstDataRow();
    fireEvent.click(row);

    await waitFor(() => {
      expect(screen.getByText('tx-1')).toBeTruthy();
    });

    // Click again to collapse
    fireEvent.click(row);

    await waitFor(() => {
      // After collapse, the detail labels should be gone
      expect(screen.queryByText('Wallet ID')).toBeFalsy();
    });
  });
});
