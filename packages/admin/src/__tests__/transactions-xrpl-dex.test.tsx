/**
 * Admin UI transactions page XRPL DEX label display tests.
 *
 * Verifies INTF-03: XRPL DEX transactions display correctly in the Admin UI.
 *
 * @see Phase 03-02 Task 2
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent, cleanup } from '@testing-library/preact';

const mockApiGet = vi.fn();
const mockApiPost = vi.fn();
const mockApiPut = vi.fn();
const mockApiDelete = vi.fn();
const mockApiPatch = vi.fn();

vi.mock('../api/typed-client', async () => {
  const { ApiError } = await import('../api/client');
  return {
    api: {
      GET: (...args: unknown[]) => mockApiGet(...args),
      POST: (...args: unknown[]) => mockApiPost(...args),
      PUT: (...args: unknown[]) => mockApiPut(...args),
      DELETE: (...args: unknown[]) => mockApiDelete(...args),
      PATCH: (...args: unknown[]) => mockApiPatch(...args),
    },
    ApiError,
  };
});

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

vi.mock('../utils/dirty-guard', () => ({
  registerDirty: vi.fn(),
  unregisterDirty: vi.fn(),
  hasDirty: { value: false },
}));

import TransactionsPage from '../pages/transactions';

// ---------------------------------------------------------------------------
// Mock data: XRPL DEX CONTRACT_CALL transaction
// ---------------------------------------------------------------------------

const mockXrplDexTx = {
  items: [
    {
      id: 'tx-xrpl-dex-1',
      walletId: 'wallet-ripple-1',
      walletName: 'XRP Wallet',
      type: 'CONTRACT_CALL',
      status: 'CONFIRMED',
      tier: 'INSTANT',
      toAddress: 'rPT1bpAYe',
      contractName: null,
      amount: '50.0',
      formattedAmount: '50.0 XRP',
      amountUsd: 125.0,
      network: 'xrpl-mainnet',
      txHash: '0A1B2C3D4E5F',
      chain: 'ripple',
      createdAt: Math.floor(Date.now() / 1000),
    },
  ],
  total: 1,
  offset: 0,
  limit: 20,
};

const mockIncomingResponse = {
  items: [],
  total: 0,
  offset: 0,
  limit: 20,
};

const mockWallets = {
  items: [
    { id: 'wallet-ripple-1', name: 'XRP Wallet', chain: 'ripple', network: 'xrpl-mainnet', status: 'ACTIVE', monitorIncoming: false },
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

function setupMocks() {
  mockApiGet.mockImplementation((url: string) => {
    if (url.includes('/v1/admin/transactions')) return Promise.resolve({ data: mockXrplDexTx });
    if (url.includes('/v1/admin/incoming')) return Promise.resolve({ data: mockIncomingResponse });
    if (url.includes('/v1/wallets')) return Promise.resolve({ data: mockWallets });
    if (url.includes('/v1/admin/settings')) return Promise.resolve({ data: mockSettings });
    return Promise.resolve({ data: {} });
  });
  mockApiPut.mockResolvedValue({ data: {} });
}

async function waitForTable() {
  await waitFor(() => {
    // Short address is shown directly (length <= 10)
    expect(screen.getByText('rPT1bpAYe')).toBeTruthy();
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Transactions XRPL DEX display', () => {
  beforeEach(() => {
    setupMocks();
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('renders XRPL DEX CONTRACT_CALL transaction in the list', async () => {
    render(<TransactionsPage />);
    await waitForTable();
    // Wallet name and counterparty visible
    expect(screen.getAllByText('XRP Wallet').length).toBeGreaterThan(0);
    expect(screen.getByText('rPT1bpAYe')).toBeTruthy();
  });

  it('shows human-readable "Contract Call" type in expanded detail', async () => {
    render(<TransactionsPage />);
    await waitForTable();

    // Click on the row to expand (find by counterparty address)
    const cell = screen.getByText('rPT1bpAYe');
    const row = cell.closest('tr')!;
    fireEvent.click(row);

    await waitFor(() => {
      // Type label "Contract Call" appears in both filter option and expanded detail
      // Check that the detail view value is present (inside .detail-value)
      const matches = screen.getAllByText('Contract Call');
      // At least 2: filter option + detail value
      expect(matches.length).toBeGreaterThanOrEqual(2);
      // Verify one is inside a detail-value span (expanded row)
      const detailMatch = matches.find((el) => el.classList.contains('detail-value'));
      expect(detailMatch).toBeTruthy();
    });
  });

  it('shows xrpl-mainnet network in table', async () => {
    render(<TransactionsPage />);
    await waitForTable();
    // Multiple matches expected (filter option + table cell), just verify at least 1 exists
    expect(screen.getAllByText('xrpl-mainnet').length).toBeGreaterThan(0);
  });

  it('displays CONFIRMED status badge', async () => {
    render(<TransactionsPage />);
    await waitForTable();
    expect(screen.getAllByText('CONFIRMED').length).toBeGreaterThan(0);
  });
});
