/**
 * Wallet Detail: External Actions tab tests.
 *
 * Since the ExternalActionsTab is deeply nested inside WalletDetailView,
 * we test the full WalletsPage render with a detail path.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent, cleanup } from '@testing-library/preact';

// Must mock before importing components
vi.mock('../api/client', () => ({
  apiGet: vi.fn(),
  apiPost: vi.fn(),
  apiPut: vi.fn(),
  apiDelete: vi.fn(),
  ApiError: class ApiError extends Error {
    code: string;
    constructor(status: number, code: string, message: string) {
      super(message);
      this.code = code;
    }
  },
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

vi.mock('../components/toast', () => ({
  showToast: vi.fn(),
  ToastContainer: () => null,
}));

vi.mock('../components/layout', async () => {
  const { signal } = await import('@preact/signals');
  return {
    currentPath: signal('/wallets/test-wallet-1'),
    getPageSubtitle: () => '',
    highlightField: signal(''),
    pendingNavigation: signal(null),
  };
});

import WalletsPage from '../pages/wallets';
import { apiGet } from '../api/client';

const mockApiGet = apiGet as ReturnType<typeof vi.fn>;

const MOCK_WALLET = {
  id: 'test-wallet-1',
  name: 'Test Wallet',
  chain: 'ethereum',
  network: 'ethereum-mainnet',
  environment: 'mainnet',
  publicKey: '0x1234567890abcdef',
  status: 'ACTIVE',
  ownerAddress: null,
  ownerVerified: null,
  ownerState: 'NONE',
  approvalMethod: null,
  suspendedAt: null,
  suspensionReason: null,
  createdAt: 1700000000,
  updatedAt: 1700000000,
  accountType: 'eoa',
};

const MOCK_ACTIONS = [
  {
    id: 'act-1',
    actionKind: 'signedData',
    venue: 'polymarket',
    operation: 'place_order',
    status: 'signed',
    createdAt: 1700001000,
    actionProvider: 'polymarket-order',
    actionName: 'placeOrder',
  },
  {
    id: 'act-2',
    actionKind: 'signedHttp',
    venue: 'hyperliquid',
    operation: 'open_position',
    status: 'failed',
    createdAt: 1700002000,
    actionProvider: 'hyperliquid-perp',
    actionName: 'openPosition',
  },
];

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function setupMocks(actions: typeof MOCK_ACTIONS = MOCK_ACTIONS) {
  mockApiGet.mockImplementation((url: string) => {
    if (url.includes('/wallets/test-wallet-1') && !url.includes('/actions') && !url.includes('/networks') && !url.includes('/balance') && !url.includes('/transactions') && !url.includes('/credentials') && !url.includes('/nfts') && !url.includes('/staking')) {
      return Promise.resolve(MOCK_WALLET);
    }
    if (url.includes('/actions')) {
      return Promise.resolve({ actions });
    }
    if (url.includes('/credentials')) {
      return Promise.resolve({ credentials: [] });
    }
    if (url.includes('/networks')) {
      return Promise.resolve({ networks: [] });
    }
    if (url.includes('/balance')) {
      return Promise.resolve({ balances: [] });
    }
    if (url.includes('/transactions')) {
      return Promise.resolve({ transactions: [], total: 0 });
    }
    if (url.includes('/staking')) {
      return Promise.resolve({ positions: [] });
    }
    return Promise.resolve({});
  });
}

describe('Wallet Detail - External Actions Tab', () => {
  it('renders External Actions tab in tab nav', async () => {
    setupMocks();
    render(<WalletsPage />);

    await waitFor(() => {
      expect(screen.getByText('External Actions')).toBeTruthy();
    });
  });

  it('renders Credentials tab in tab nav', async () => {
    setupMocks();
    render(<WalletsPage />);

    await waitFor(() => {
      expect(screen.getByText('Credentials')).toBeTruthy();
    });
  });

  it('shows external actions list when tab is selected', async () => {
    setupMocks();
    render(<WalletsPage />);

    await waitFor(() => {
      expect(screen.getByText('External Actions')).toBeTruthy();
    });

    fireEvent.click(screen.getByText('External Actions'));

    await waitFor(() => {
      expect(screen.getByText('polymarket')).toBeTruthy();
      expect(screen.getByText('place_order')).toBeTruthy();
      expect(screen.getByText('signed')).toBeTruthy();
    });
  });

  it('shows correct status badge colors', async () => {
    setupMocks();
    render(<WalletsPage />);

    await waitFor(() => {
      expect(screen.getByText('External Actions')).toBeTruthy();
    });

    fireEvent.click(screen.getByText('External Actions'));

    await waitFor(() => {
      // 'signed' should have success variant, 'failed' should have danger variant
      const signedBadge = screen.getByText('signed');
      const failedBadge = screen.getByText('failed');
      expect(signedBadge.className).toContain('success');
      expect(failedBadge.className).toContain('danger');
    });
  });

  it('shows empty state when no actions', async () => {
    setupMocks([]);
    render(<WalletsPage />);

    await waitFor(() => {
      expect(screen.getByText('External Actions')).toBeTruthy();
    });

    fireEvent.click(screen.getByText('External Actions'));

    await waitFor(() => {
      expect(screen.getByText('No External Actions')).toBeTruthy();
    });
  });

  it('opens action detail modal on row click', async () => {
    setupMocks();
    render(<WalletsPage />);

    await waitFor(() => {
      expect(screen.getByText('External Actions')).toBeTruthy();
    });

    fireEvent.click(screen.getByText('External Actions'));

    await waitFor(() => {
      expect(screen.getByText('polymarket')).toBeTruthy();
    });

    // Click on the row (via the venue badge text parent row)
    const venueCell = screen.getByText('polymarket');
    const row = venueCell.closest('tr');
    if (row) fireEvent.click(row);

    await waitFor(() => {
      expect(screen.getByText('External Action Details')).toBeTruthy();
    });
  });
});
