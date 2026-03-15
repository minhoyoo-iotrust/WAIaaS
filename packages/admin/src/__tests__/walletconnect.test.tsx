/**
 * walletconnect.test.tsx
 *
 * Tests for walletconnect.tsx page:
 * - Wallet table rendering with WC session status
 * - Empty state when no wallets exist
 * - Fetch error handling
 * - Connect flow (pairing API call + QR modal)
 * - Disconnect flow (session delete)
 * - Polling for pairing status (connected / expired)
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent, cleanup, act } from '@testing-library/preact';


const mockApiGet = vi.fn();
const mockApiPost = vi.fn();
const mockApiPut = vi.fn();
const mockApiDelete = vi.fn();
const mockApiPatch = vi.fn();

// Mock declarations moved to top-level const

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

import { showToast } from '../components/toast';
import { ApiError } from '../api/client';
import WalletConnectPage from '../pages/walletconnect';

// ---------------------------------------------------------------------------
// Types (mirrors walletconnect.tsx interfaces)
// ---------------------------------------------------------------------------

interface WcSession {
  walletId: string;
  topic: string;
  peerName: string | null;
  peerUrl: string | null;
  chainId: string;
  ownerAddress: string;
  expiry: number;
  createdAt: number;
}

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

const mockWallets = {
  items: [
    { id: 'w1', name: 'My Solana Wallet', chain: 'solana', environment: 'devnet' },
    { id: 'w2', name: 'My EVM Wallet', chain: 'evm', environment: 'testnet' },
  ],
};

const mockWcSession: WcSession = {
  walletId: 'w1',
  topic: 'topic-abc',
  peerName: 'MetaMask',
  peerUrl: 'https://metamask.io',
  chainId: 'eip155:1',
  ownerAddress: '0x1234567890abcdef1234567890abcdef12345678',
  expiry: 1707696000,
  createdAt: 1707609600,
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mockApiCalls(
  walletData = mockWallets,
  sessions: Record<string, WcSession | null> = {},
  pairStatusResponse?: { status: string; session?: WcSession | null },
) {
  mockApiGet.mockImplementation(async (path: string, opts?: { params?: { path?: { id?: string }; query?: Record<string, unknown> } }) => {
    if (path === '/v1/wallets') return { data: walletData };
    // Per-wallet WC session: /v1/wallets/{id}/wc/session
    if (path === '/v1/wallets/{id}/wc/session') {
      const wId = opts?.params?.path?.id ?? '';
      if (sessions[wId]) return { data: sessions[wId] };
      const { ApiError: AE } = await import('../api/client');
      throw new AE(404, 'NOT_FOUND', 'No session');
    }
    // Pair status polling: /v1/wallets/{id}/wc/pair/status
    if (path === '/v1/wallets/{id}/wc/pair/status') {
      if (pairStatusResponse) return { data: pairStatusResponse };
      return { data: { status: 'pending' } };
    }
    return { data: {} };
  });
}

// ---------------------------------------------------------------------------
// Tests: Rendering
// ---------------------------------------------------------------------------

describe('WalletConnect page: rendering', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('renders wallet table with WC status columns', async () => {
    mockApiCalls(mockWallets, { w1: mockWcSession });
    render(<WalletConnectPage />);

    await waitFor(() => {
      expect(screen.getByText('My Solana Wallet')).toBeTruthy();
    });

    // Verify column headers
    expect(screen.getByText('Wallet')).toBeTruthy();
    expect(screen.getByText('Chain')).toBeTruthy();
    expect(screen.getByText('WC Status')).toBeTruthy();
    expect(screen.getByText('Peer')).toBeTruthy();
    expect(screen.getByText('Owner Address')).toBeTruthy();
    expect(screen.getByText('Expiry')).toBeTruthy();
    expect(screen.getByText('Actions')).toBeTruthy();
  });

  it('shows Connected badge for wallet with session', async () => {
    mockApiCalls(mockWallets, { w1: mockWcSession });
    render(<WalletConnectPage />);

    await waitFor(() => {
      expect(screen.getByText('Connected')).toBeTruthy();
    });

    // MetaMask peer name should be displayed
    expect(screen.getByText('MetaMask')).toBeTruthy();
  });

  it('shows Not Connected badge for wallet without session', async () => {
    mockApiCalls(mockWallets, {});
    render(<WalletConnectPage />);

    await waitFor(() => {
      expect(screen.getByText('My Solana Wallet')).toBeTruthy();
    });

    // Both wallets should show Not Connected
    const badges = screen.getAllByText('Not Connected');
    expect(badges.length).toBe(2);
  });

  it('shows owner address formatted for connected wallet', async () => {
    mockApiCalls(mockWallets, { w1: mockWcSession });
    render(<WalletConnectPage />);

    await waitFor(() => {
      // formatAddress: first 4 + ".." + last 4 => "0x12..5678"
      expect(screen.getByText('0x12..5678')).toBeTruthy();
    });
  });

  it('shows -- for peer/address/expiry when not connected', async () => {
    mockApiCalls(mockWallets, {});
    render(<WalletConnectPage />);

    await waitFor(() => {
      expect(screen.getByText('My Solana Wallet')).toBeTruthy();
    });

    // Each disconnected wallet has 3 "--" columns (peer, address, expiry)
    const dashes = screen.getAllByText('--');
    expect(dashes.length).toBe(6); // 2 wallets x 3 columns
  });
});

// ---------------------------------------------------------------------------
// Tests: Empty state
// ---------------------------------------------------------------------------

describe('WalletConnect page: empty state', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('shows empty message when no wallets exist', async () => {
    mockApiCalls({ items: [] });
    render(<WalletConnectPage />);

    await waitFor(() => {
      expect(screen.getByText('No wallets found. Create a wallet first.')).toBeTruthy();
    });
  });

  it('shows description card about WalletConnect', async () => {
    mockApiCalls(mockWallets, {});
    render(<WalletConnectPage />);

    await waitFor(() => {
      expect(screen.getByText(/Manage WalletConnect sessions/)).toBeTruthy();
    });
  });
});

// ---------------------------------------------------------------------------
// Tests: Fetch error
// ---------------------------------------------------------------------------

describe('WalletConnect page: fetch error', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('shows error toast on fetch failure', async () => {
    mockApiGet.mockRejectedValue(new ApiError(500, 'INTERNAL', 'Server error'));
    render(<WalletConnectPage />);

    await waitFor(() => {
      expect(vi.mocked(showToast)).toHaveBeenCalledWith('error', 'Error: INTERNAL');
    });
  });
});

// ---------------------------------------------------------------------------
// Tests: Connect flow
// ---------------------------------------------------------------------------

describe('WalletConnect page: Connect flow', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  it('clicking Connect calls mockApiPost for pairing and shows QR modal', async () => {
    mockApiCalls(mockWallets, {});
    render(<WalletConnectPage />);

    await waitFor(() => {
      expect(screen.getByText('My Solana Wallet')).toBeTruthy();
    });

    mockApiPost.mockResolvedValueOnce({ data: {
      uri: 'wc:xxx',
      qrCode: 'data:image/png;base64,abc',
      expiresAt: 9999999999,
    } });

    // Click first Connect button (w1)
    const connectButtons = screen.getAllByText('Connect');
    fireEvent.click(connectButtons[0]!);

    await waitFor(() => {
      expect(screen.getByText('Scan QR Code')).toBeTruthy();
    });

    // Verify QR image
    const img = document.querySelector('img[alt="WalletConnect QR Code"]');
    expect(img).toBeTruthy();

    // Verify mockApiPost was called correctly
    expect(mockApiPost).toHaveBeenCalledWith('/v1/wallets/{id}/wc/pair', expect.objectContaining({
      params: { path: { id: 'w1' } },
    }));
  });

  it('QR modal shows waiting text', async () => {
    mockApiCalls(mockWallets, {});
    render(<WalletConnectPage />);

    await waitFor(() => {
      expect(screen.getByText('My Solana Wallet')).toBeTruthy();
    });

    mockApiPost.mockResolvedValueOnce({ data: {
      uri: 'wc:xxx',
      qrCode: 'data:image/png;base64,abc',
      expiresAt: 9999999999,
    } });

    const connectButtons = screen.getAllByText('Connect');
    fireEvent.click(connectButtons[0]!);

    await waitFor(() => {
      expect(screen.getByText('Waiting for connection...')).toBeTruthy();
    });
  });

  it('closing QR modal clears pairing state', async () => {
    mockApiCalls(mockWallets, {});
    render(<WalletConnectPage />);

    await waitFor(() => {
      expect(screen.getByText('My Solana Wallet')).toBeTruthy();
    });

    mockApiPost.mockResolvedValueOnce({ data: {
      uri: 'wc:xxx',
      qrCode: 'data:image/png;base64,abc',
      expiresAt: 9999999999,
    } });

    const connectButtons = screen.getAllByText('Connect');
    fireEvent.click(connectButtons[0]!);

    await waitFor(() => {
      expect(screen.getByText('Scan QR Code')).toBeTruthy();
    });

    // Click Cancel on modal
    fireEvent.click(screen.getByText('Cancel'));

    await waitFor(() => {
      expect(screen.queryByText('Scan QR Code')).toBeNull();
    });
  });

  it('connect error shows error toast', async () => {
    mockApiCalls(mockWallets, {});
    render(<WalletConnectPage />);

    await waitFor(() => {
      expect(screen.getByText('My Solana Wallet')).toBeTruthy();
    });

    mockApiPost.mockRejectedValueOnce(new ApiError(500, 'PAIR_FAIL', 'Failed'));

    const connectButtons = screen.getAllByText('Connect');
    fireEvent.click(connectButtons[0]!);

    await waitFor(() => {
      expect(vi.mocked(showToast)).toHaveBeenCalledWith('error', 'Error: PAIR_FAIL');
    });

    // QR modal should NOT appear
    expect(screen.queryByText('Scan QR Code')).toBeNull();
  });

  it('polling detects connected status and closes modal', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });

    mockApiCalls(mockWallets, {});
    render(<WalletConnectPage />);

    await waitFor(() => {
      expect(screen.getByText('My Solana Wallet')).toBeTruthy();
    });

    mockApiPost.mockResolvedValueOnce({ data: {
      uri: 'wc:xxx',
      qrCode: 'data:image/png;base64,abc',
      expiresAt: 9999999999,
    } });

    const connectButtons = screen.getAllByText('Connect');
    fireEvent.click(connectButtons[0]!);

    await waitFor(() => {
      expect(screen.getByText('Scan QR Code')).toBeTruthy();
    });

    // Now mock the pair-status to return connected
    mockApiGet.mockImplementation(async (path: string) => {
      if (path === '/v1/wallets') return { data: mockWallets };
      if (path === '/v1/wallets/{id}/wc/session') throw new ApiError(404, 'NOT_FOUND', 'No session');
      if (path === '/v1/wallets/{id}/wc/pair/status') return { data: { status: 'connected', session: mockWcSession } };
      return { data: {} };
    });

    // Advance timer to trigger polling
    await act(async () => {
      vi.advanceTimersByTime(3500);
    });

    await waitFor(() => {
      expect(vi.mocked(showToast)).toHaveBeenCalledWith('success', 'Wallet connected via WalletConnect');
    });
  });

  it('polling detects expired status and shows error toast', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });

    mockApiCalls(mockWallets, {});
    render(<WalletConnectPage />);

    await waitFor(() => {
      expect(screen.getByText('My Solana Wallet')).toBeTruthy();
    });

    mockApiPost.mockResolvedValueOnce({ data: {
      uri: 'wc:xxx',
      qrCode: 'data:image/png;base64,abc',
      expiresAt: 9999999999,
    } });

    const connectButtons = screen.getAllByText('Connect');
    fireEvent.click(connectButtons[0]!);

    await waitFor(() => {
      expect(screen.getByText('Scan QR Code')).toBeTruthy();
    });

    // Mock pair-status to return expired
    mockApiGet.mockImplementation(async (path: string) => {
      if (path === '/v1/wallets') return { data: mockWallets };
      if (path === '/v1/wallets/{id}/wc/session') throw new ApiError(404, 'NOT_FOUND', 'No session');
      if (path === '/v1/wallets/{id}/wc/pair/status') return { data: { status: 'expired' } };
      return { data: {} };
    });

    // Advance timer to trigger polling
    await act(async () => {
      vi.advanceTimersByTime(3500);
    });

    await waitFor(() => {
      expect(vi.mocked(showToast)).toHaveBeenCalledWith('error', 'Pairing expired. Try again.');
    });
  });
});

// ---------------------------------------------------------------------------
// Tests: Disconnect flow
// ---------------------------------------------------------------------------

describe('WalletConnect page: Disconnect flow', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('clicking Disconnect calls mockApiDelete and updates UI', async () => {
    mockApiCalls(mockWallets, { w1: mockWcSession });
    render(<WalletConnectPage />);

    await waitFor(() => {
      expect(screen.getByText('Disconnect')).toBeTruthy();
    });

    mockApiDelete.mockResolvedValueOnce(undefined as never);

    fireEvent.click(screen.getByText('Disconnect'));

    await waitFor(() => {
      expect(mockApiDelete).toHaveBeenCalledWith('/v1/wallets/{id}/wc/session', expect.objectContaining({
        params: { path: { id: 'w1' } },
      }));
    });

    await waitFor(() => {
      expect(vi.mocked(showToast)).toHaveBeenCalledWith('success', 'WalletConnect session disconnected');
    });
  });

  it('disconnect error shows error toast', async () => {
    mockApiCalls(mockWallets, { w1: mockWcSession });
    render(<WalletConnectPage />);

    await waitFor(() => {
      expect(screen.getByText('Disconnect')).toBeTruthy();
    });

    mockApiDelete.mockRejectedValueOnce(new ApiError(500, 'DISCONNECT_FAIL', 'Failed'));

    fireEvent.click(screen.getByText('Disconnect'));

    await waitFor(() => {
      expect(vi.mocked(showToast)).toHaveBeenCalledWith('error', 'Error: DISCONNECT_FAIL');
    });
  });
});
