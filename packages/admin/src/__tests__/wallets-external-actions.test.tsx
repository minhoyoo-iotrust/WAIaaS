/**
 * Wallet Detail: External Actions tab tests.
 *
 * Since the ExternalActionsTab is deeply nested inside WalletDetailView,
 * we test the full WalletsPage render with a detail path.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent, cleanup } from '@testing-library/preact';

// Must mock before importing components
vi.mock('../api/typed-client', () => ({
  api: {
    GET: vi.fn().mockResolvedValue({ data: {} }),
    POST: vi.fn().mockResolvedValue({ data: {} }),
    PUT: vi.fn().mockResolvedValue({ data: {} }),
    DELETE: vi.fn().mockResolvedValue({ data: {} }),
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
import { api } from '../api/typed-client';

const mockApiGet = api.GET as ReturnType<typeof vi.fn>;

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
    provider: 'polymarket-order',
    actionName: 'placeOrder',
    bridgeStatus: null,
  },
  {
    id: 'act-2',
    actionKind: 'signedHttp',
    venue: 'hyperliquid',
    operation: 'open_position',
    status: 'failed',
    createdAt: 1700002000,
    provider: 'hyperliquid-perp',
    actionName: 'openPosition',
    bridgeStatus: null,
  },
];

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function setupMocks(actions: typeof MOCK_ACTIONS = MOCK_ACTIONS) {
  mockApiGet.mockImplementation((url: string) => {
    if (url === '/v1/wallets/{id}') return Promise.resolve({ data: MOCK_WALLET });
    if (url.includes('/actions')) return Promise.resolve({ data: { actions, total: actions.length, limit: 50, offset: 0 } });
    if (url.includes('/credentials')) return Promise.resolve({ data: { credentials: [] } });
    if (url.includes('/networks')) return Promise.resolve({ data: { availableNetworks: [] } });
    if (url.includes('/balance')) return Promise.resolve({ data: { balances: [] } });
    if (url.includes('/transactions')) return Promise.resolve({ data: { items: [], total: 0 } });
    if (url.includes('/staking')) return Promise.resolve({ data: { positions: [] } });
    if (url.includes('/settings')) return Promise.resolve({ data: {} });
    if (url.includes('/wc/session')) return Promise.reject(new Error('no session'));
    return Promise.resolve({ data: {} });
  });
}

describe('Wallet Detail - Activity Tab (External Actions)', () => {
  it('renders Activity tab in tab nav', async () => {
    setupMocks();
    render(<WalletsPage />);

    await waitFor(() => {
      expect(screen.getByText('Activity')).toBeTruthy();
    });
  });

  it('renders Setup tab in tab nav', async () => {
    setupMocks();
    render(<WalletsPage />);

    await waitFor(() => {
      expect(screen.getByText('Setup')).toBeTruthy();
    });
  });

  it('shows external actions list via Activity tab filter', async () => {
    setupMocks();
    render(<WalletsPage />);

    await waitFor(() => {
      expect(screen.getByText('Activity')).toBeTruthy();
    });

    fireEvent.click(screen.getByText('Activity'));

    await waitFor(() => {
      // Activity tab shows filter buttons
      expect(screen.getByText('External Actions')).toBeTruthy();
    });

    // Click External Actions filter
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
      expect(screen.getByText('Activity')).toBeTruthy();
    });

    fireEvent.click(screen.getByText('Activity'));

    await waitFor(() => {
      expect(screen.getByText('External Actions')).toBeTruthy();
    });

    fireEvent.click(screen.getByText('External Actions'));

    await waitFor(() => {
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
      expect(screen.getByText('Activity')).toBeTruthy();
    });

    fireEvent.click(screen.getByText('Activity'));

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
      expect(screen.getByText('Activity')).toBeTruthy();
    });

    fireEvent.click(screen.getByText('Activity'));

    await waitFor(() => {
      expect(screen.getByText('External Actions')).toBeTruthy();
    });

    fireEvent.click(screen.getByText('External Actions'));

    await waitFor(() => {
      expect(screen.getByText('polymarket')).toBeTruthy();
    });

    const venueCell = screen.getByText('polymarket');
    const row = venueCell.closest('tr');
    if (row) fireEvent.click(row);

    await waitFor(() => {
      expect(screen.getByText('External Action Details')).toBeTruthy();
    });
  });
});
