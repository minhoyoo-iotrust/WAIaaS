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

import { apiGet, apiPost, apiDelete, ApiError } from '../api/client';
import { showToast } from '../components/toast';
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
  vi.mocked(apiGet).mockImplementation(async (path: string) => {
    if (path === '/v1/wallets') return walletData;
    // Per-wallet WC session: /v1/wallets/{id}/wc/session
    const wcMatch = path.match(/\/v1\/wallets\/(.+)\/wc\/session$/);
    if (wcMatch) {
      const wId = wcMatch[1];
      if (sessions[wId]) return sessions[wId];
      throw new ApiError(404, 'NOT_FOUND', 'No session');
    }
    // Pair status polling: /v1/wallets/{id}/wc/pair/status
    const statusMatch = path.match(/\/v1\/wallets\/(.+)\/wc\/pair\/status$/);
    if (statusMatch) {
      if (pairStatusResponse) return pairStatusResponse;
      return { status: 'pending' };
    }
    return {};
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
    vi.mocked(apiGet).mockRejectedValue(new ApiError(500, 'INTERNAL', 'Server error'));
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

  it('clicking Connect calls apiPost for pairing and shows QR modal', async () => {
    mockApiCalls(mockWallets, {});
    render(<WalletConnectPage />);

    await waitFor(() => {
      expect(screen.getByText('My Solana Wallet')).toBeTruthy();
    });

    vi.mocked(apiPost).mockResolvedValueOnce({
      uri: 'wc:xxx',
      qrCode: 'data:image/png;base64,abc',
      expiresAt: 9999999999,
    });

    // Click first Connect button (w1)
    const connectButtons = screen.getAllByText('Connect');
    fireEvent.click(connectButtons[0]!);

    await waitFor(() => {
      expect(screen.getByText('Scan QR Code')).toBeTruthy();
    });

    // Verify QR image
    const img = document.querySelector('img[alt="WalletConnect QR Code"]');
    expect(img).toBeTruthy();

    // Verify apiPost was called correctly
    expect(vi.mocked(apiPost)).toHaveBeenCalledWith('/v1/wallets/w1/wc/pair');
  });

  it('QR modal shows waiting text', async () => {
    mockApiCalls(mockWallets, {});
    render(<WalletConnectPage />);

    await waitFor(() => {
      expect(screen.getByText('My Solana Wallet')).toBeTruthy();
    });

    vi.mocked(apiPost).mockResolvedValueOnce({
      uri: 'wc:xxx',
      qrCode: 'data:image/png;base64,abc',
      expiresAt: 9999999999,
    });

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

    vi.mocked(apiPost).mockResolvedValueOnce({
      uri: 'wc:xxx',
      qrCode: 'data:image/png;base64,abc',
      expiresAt: 9999999999,
    });

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

    vi.mocked(apiPost).mockRejectedValueOnce(new ApiError(500, 'PAIR_FAIL', 'Failed'));

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

    vi.mocked(apiPost).mockResolvedValueOnce({
      uri: 'wc:xxx',
      qrCode: 'data:image/png;base64,abc',
      expiresAt: 9999999999,
    });

    const connectButtons = screen.getAllByText('Connect');
    fireEvent.click(connectButtons[0]!);

    await waitFor(() => {
      expect(screen.getByText('Scan QR Code')).toBeTruthy();
    });

    // Now mock the pair-status to return connected
    vi.mocked(apiGet).mockImplementation(async (path: string) => {
      if (path === '/v1/wallets') return mockWallets;
      const wcMatch = path.match(/\/v1\/wallets\/(.+)\/wc\/session$/);
      if (wcMatch) throw new ApiError(404, 'NOT_FOUND', 'No session');
      const statusMatch = path.match(/\/v1\/wallets\/(.+)\/wc\/pair\/status$/);
      if (statusMatch) return { status: 'connected', session: mockWcSession };
      return {};
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

    vi.mocked(apiPost).mockResolvedValueOnce({
      uri: 'wc:xxx',
      qrCode: 'data:image/png;base64,abc',
      expiresAt: 9999999999,
    });

    const connectButtons = screen.getAllByText('Connect');
    fireEvent.click(connectButtons[0]!);

    await waitFor(() => {
      expect(screen.getByText('Scan QR Code')).toBeTruthy();
    });

    // Mock pair-status to return expired
    vi.mocked(apiGet).mockImplementation(async (path: string) => {
      if (path === '/v1/wallets') return mockWallets;
      const wcMatch = path.match(/\/v1\/wallets\/(.+)\/wc\/session$/);
      if (wcMatch) throw new ApiError(404, 'NOT_FOUND', 'No session');
      const statusMatch = path.match(/\/v1\/wallets\/(.+)\/wc\/pair\/status$/);
      if (statusMatch) return { status: 'expired' };
      return {};
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

  it('clicking Disconnect calls apiDelete and updates UI', async () => {
    mockApiCalls(mockWallets, { w1: mockWcSession });
    render(<WalletConnectPage />);

    await waitFor(() => {
      expect(screen.getByText('Disconnect')).toBeTruthy();
    });

    vi.mocked(apiDelete).mockResolvedValueOnce(undefined as never);

    fireEvent.click(screen.getByText('Disconnect'));

    await waitFor(() => {
      expect(vi.mocked(apiDelete)).toHaveBeenCalledWith('/v1/wallets/w1/wc/session');
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

    vi.mocked(apiDelete).mockRejectedValueOnce(new ApiError(500, 'DISCONNECT_FAIL', 'Failed'));

    fireEvent.click(screen.getByText('Disconnect'));

    await waitFor(() => {
      expect(vi.mocked(showToast)).toHaveBeenCalledWith('error', 'Error: DISCONNECT_FAIL');
    });
  });
});
