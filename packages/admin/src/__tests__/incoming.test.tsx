import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent, cleanup } from '@testing-library/preact';

vi.mock('../api/client', () => ({
  apiGet: vi.fn(),
  apiPost: vi.fn(),
  apiPut: vi.fn(),
  apiPatch: vi.fn(),
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

import { apiGet, apiPatch, ApiError } from '../api/client';
import IncomingPage from '../pages/incoming';

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

const mockIncomingResponse = {
  items: [
    {
      id: 'itx-1',
      txHash: '0xabc123',
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
    {
      id: 'itx-2',
      txHash: 'SolHash123',
      walletId: 'wallet-uuid-2',
      walletName: null,
      fromAddress: 'SolanaSender123',
      amount: '500000',
      tokenAddress: 'TokenMint123',
      chain: 'solana',
      network: 'mainnet',
      status: 'DETECTED',
      blockNumber: null,
      detectedAt: 1700000200,
      confirmedAt: null,
      suspicious: true,
    },
  ],
  total: 2,
  offset: 0,
  limit: 20,
};

const mockWalletsResponse = {
  items: [
    { id: 'wallet-uuid-1', name: 'Test Wallet', chain: 'evm', network: 'ethereum-mainnet', environment: 'mainnet', publicKey: '0x123', status: 'ACTIVE', ownerAddress: null, ownerState: 'NONE', createdAt: 1700000000, monitorIncoming: true },
    { id: 'wallet-uuid-2', name: 'Sol Wallet', chain: 'solana', network: 'mainnet', environment: 'mainnet', publicKey: 'Sol123', status: 'ACTIVE', ownerAddress: null, ownerState: 'NONE', createdAt: 1700000000, monitorIncoming: false },
  ],
};

const mockSettingsResponse = {
  'incoming.enabled': { value: 'true', source: 'db' },
  'incoming.poll_interval': { value: '30', source: 'config' },
  'incoming.retention_days': { value: '90', source: 'config' },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function setupMocks(incomingResponse = mockIncomingResponse) {
  vi.mocked(apiGet).mockImplementation((url: string) => {
    if (url.includes('/v1/admin/incoming')) return Promise.resolve(incomingResponse);
    if (url.includes('/v1/wallets')) return Promise.resolve(mockWalletsResponse);
    if (url.includes('/v1/admin/settings')) return Promise.resolve(mockSettingsResponse);
    return Promise.resolve({});
  });
}

async function waitForTableData() {
  await waitFor(() => {
    // 'Test Wallet' appears in multiple places (toggle table, filter dropdown, TX table)
    const elements = screen.getAllByText('Test Wallet');
    expect(elements.length).toBeGreaterThanOrEqual(1);
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('IncomingPage', () => {
  beforeEach(() => {
    setupMocks();
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('renders incoming TX table with items', async () => {
    render(<IncomingPage />);

    await waitForTableData();

    // Wallet names (appear in toggle table + filter dropdown + TX table)
    const walletTexts = screen.getAllByText('Test Wallet');
    expect(walletTexts.length).toBeGreaterThanOrEqual(1);

    // Status badges (getAllByText since also in filter dropdown)
    const confirmedTexts = screen.getAllByText('CONFIRMED');
    expect(confirmedTexts.length).toBeGreaterThanOrEqual(1);

    const detectedTexts = screen.getAllByText('DETECTED');
    expect(detectedTexts.length).toBeGreaterThanOrEqual(1);

    // Amount values
    expect(screen.getByText('1000000000')).toBeTruthy();
    expect(screen.getByText('500000')).toBeTruthy();

    // Column headers
    expect(screen.getByText('Time')).toBeTruthy();
    expect(screen.getByText('Sender')).toBeTruthy();
    // 'Amount' appears as column header
    const amountTexts = screen.getAllByText('Amount');
    expect(amountTexts.length).toBeGreaterThanOrEqual(1);
    // 'Suspicious' is both column header and filter label
    const suspiciousTexts = screen.getAllByText('Suspicious');
    expect(suspiciousTexts.length).toBeGreaterThanOrEqual(1);
  });

  it('renders empty state when no transactions', async () => {
    setupMocks({ items: [], total: 0, offset: 0, limit: 20 });

    render(<IncomingPage />);

    await waitFor(() => {
      expect(screen.getByText('No incoming transactions found')).toBeTruthy();
    });
  });

  it('renders filter bar with wallet/chain/status/suspicious options', async () => {
    render(<IncomingPage />);

    await waitForTableData();

    // Filter labels should be present (some appear in multiple places)
    const walletLabels = screen.getAllByText('Wallet');
    expect(walletLabels.length).toBeGreaterThanOrEqual(1);
    const chainLabels = screen.getAllByText('Chain');
    expect(chainLabels.length).toBeGreaterThanOrEqual(1);
    const statusLabels = screen.getAllByText('Status');
    expect(statusLabels.length).toBeGreaterThanOrEqual(1);
    // "Suspicious" is both a column header and a filter label
    const suspiciousTexts = screen.getAllByText('Suspicious');
    expect(suspiciousTexts.length).toBeGreaterThanOrEqual(2);
  });

  it('renders settings panel with incoming.* fields', async () => {
    render(<IncomingPage />);

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

  it('renders per-wallet monitoring toggle table', async () => {
    render(<IncomingPage />);

    await waitFor(() => {
      const elements = screen.getAllByText('Test Wallet');
      expect(elements.length).toBeGreaterThanOrEqual(1);
    });

    const solElements = screen.getAllByText('Sol Wallet');
    expect(solElements.length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Per-Wallet Monitoring')).toBeTruthy();

    // Toggle buttons
    const onButtons = screen.getAllByText('ON');
    const offButtons = screen.getAllByText('OFF');
    expect(onButtons.length).toBeGreaterThanOrEqual(1);
    expect(offButtons.length).toBeGreaterThanOrEqual(1);
  });

  it('toggles wallet monitoring on click', async () => {
    vi.mocked(apiPatch).mockResolvedValue({ id: 'wallet-uuid-2', monitorIncoming: true });

    render(<IncomingPage />);

    await waitFor(() => {
      const elements = screen.getAllByText('Sol Wallet');
      expect(elements.length).toBeGreaterThanOrEqual(1);
    });

    // Find OFF buttons (wallet-uuid-2 should have OFF)
    const offButtons = screen.getAllByText('OFF');
    expect(offButtons.length).toBeGreaterThanOrEqual(1);

    // Click the first OFF toggle
    fireEvent.click(offButtons[0]!);

    await waitFor(() => {
      expect(vi.mocked(apiPatch)).toHaveBeenCalledWith(
        '/v1/wallets/wallet-uuid-2',
        { monitorIncoming: true },
      );
    });
  });

  it('handles API error gracefully', async () => {
    vi.mocked(apiGet).mockImplementation((url: string) => {
      if (url.includes('/v1/admin/incoming')) {
        return Promise.reject(new ApiError(0, 'NETWORK_ERROR', 'Cannot connect'));
      }
      if (url.includes('/v1/wallets')) return Promise.resolve(mockWalletsResponse);
      if (url.includes('/v1/admin/settings')) return Promise.resolve(mockSettingsResponse);
      return Promise.resolve({});
    });

    render(<IncomingPage />);

    await waitFor(() => {
      expect(
        screen.getByText('Cannot connect to the daemon. Check if it is running.'),
      ).toBeTruthy();
    });

    expect(screen.getByText('Retry')).toBeTruthy();
  });

  it('pagination controls work', async () => {
    const largeMock = {
      items: mockIncomingResponse.items,
      total: 50,
      offset: 0,
      limit: 20,
    };
    setupMocks(largeMock);

    render(<IncomingPage />);

    await waitForTableData();

    // Check pagination info
    expect(screen.getByText(/Showing 1-20 of 50/)).toBeTruthy();

    // Next button should be enabled
    const nextButton = screen.getByText('Next');
    expect(nextButton).toBeTruthy();
    expect((nextButton as HTMLButtonElement).disabled).toBe(false);

    // Previous should be disabled on first page
    const prevButton = screen.getByText('Previous');
    expect((prevButton as HTMLButtonElement).disabled).toBe(true);

    // Click next
    fireEvent.click(nextButton);

    // Should have re-fetched with offset=20
    await waitFor(() => {
      const calls = vi.mocked(apiGet).mock.calls;
      const incomingCalls = calls.filter((c) => c[0].includes('/v1/admin/incoming'));
      const lastCall = incomingCalls[incomingCalls.length - 1]![0];
      expect(lastCall).toContain('offset=20');
    });
  });
});
