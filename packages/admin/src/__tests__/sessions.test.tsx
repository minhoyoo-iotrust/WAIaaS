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

vi.mock('../components/copy-button', () => ({
  CopyButton: ({ value, label }: { value: string; label?: string }) => (
    <button>{label ?? 'Copy'}</button>
  ),
}));

vi.mock('../components/empty-state', () => ({
  EmptyState: ({ title, description }: { title: string; description?: string }) => (
    <div>
      <h3>{title}</h3>
      {description && <p>{description}</p>}
    </div>
  ),
}));

vi.mock('../utils/error-messages', () => ({
  getErrorMessage: (code: string) => `Error: ${code}`,
}));

import { apiGet, apiPost, apiDelete } from '../api/client';
import SessionsPage from '../pages/sessions';

const mockWallets = {
  items: [
    {
      id: 'wallet-1',
      name: 'bot-alpha',
      chain: 'solana',
      network: 'devnet',
      publicKey: 'abc',
      status: 'ACTIVE',
      createdAt: 1707609600,
    },
  ],
};

const mockSessions = [
  {
    id: 'sess-1',
    walletId: 'wallet-1',
    status: 'ACTIVE',
    renewalCount: 0,
    maxRenewals: 10,
    expiresAt: 1707696000,
    absoluteExpiresAt: 1707782400,
    createdAt: 1707609600,
    lastRenewedAt: null,
  },
];

const mockCreatedSession = {
  id: 'sess-2',
  token: 'jwt-token-abc123',
  expiresAt: 1707696000,
  walletId: 'wallet-1',
};

describe('SessionsPage', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('should load and display sessions for selected agent', async () => {
    vi.mocked(apiGet)
      .mockResolvedValueOnce(mockWallets) // wallets load
      .mockResolvedValueOnce([]) // initial sessions (all wallets)
      .mockResolvedValueOnce(mockSessions); // sessions for selected wallet

    render(<SessionsPage />);

    // Wait for wallets dropdown to load
    await waitFor(() => {
      expect(screen.getByText(/bot-alpha/)).toBeTruthy();
    });

    // Select wallet
    const select = screen.getByLabelText('Wallet') as HTMLSelectElement;
    fireEvent.change(select, { target: { value: 'wallet-1' } });

    // Wait for sessions to load
    await waitFor(() => {
      expect(screen.getByText('ACTIVE')).toBeTruthy();
    });

    // Verify session row shows truncated ID
    expect(screen.getByText('sess-1...')).toBeTruthy();
  });

  it('should create session and show token modal', async () => {
    vi.mocked(apiGet)
      .mockResolvedValueOnce(mockWallets) // initial wallets load
      .mockResolvedValueOnce([]) // initial sessions (all wallets)
      .mockResolvedValueOnce(mockSessions) // sessions after wallet select
      .mockResolvedValueOnce(mockSessions); // refresh after create

    vi.mocked(apiPost).mockResolvedValueOnce(mockCreatedSession);

    render(<SessionsPage />);

    // Wait for wallets dropdown
    await waitFor(() => {
      expect(screen.getByText(/bot-alpha/)).toBeTruthy();
    });

    // Select wallet
    const select = screen.getByLabelText('Wallet') as HTMLSelectElement;
    fireEvent.change(select, { target: { value: 'wallet-1' } });

    // Wait for sessions to load
    await waitFor(() => {
      expect(screen.getByText('ACTIVE')).toBeTruthy();
    });

    // Click Create Session
    fireEvent.click(screen.getByText('Create Session'));

    // Wait for token modal
    await waitFor(() => {
      expect(screen.getByText(/Copy this token now/i)).toBeTruthy();
    });

    expect(screen.getByText('jwt-token-abc123')).toBeTruthy();
    expect(vi.mocked(apiPost)).toHaveBeenCalledWith('/v1/sessions', {
      walletId: 'wallet-1',
    });
  });

  it('should revoke session with confirmation modal', async () => {
    vi.mocked(apiGet)
      .mockResolvedValueOnce(mockWallets) // wallets load
      .mockResolvedValueOnce([]) // initial sessions (all wallets)
      .mockResolvedValueOnce(mockSessions) // sessions for selected wallet
      .mockResolvedValueOnce([]); // refresh after revoke

    vi.mocked(apiDelete).mockResolvedValueOnce(undefined);

    render(<SessionsPage />);

    // Wait for wallets dropdown
    await waitFor(() => {
      expect(screen.getByText(/bot-alpha/)).toBeTruthy();
    });

    // Select wallet
    const select = screen.getByLabelText('Wallet') as HTMLSelectElement;
    fireEvent.change(select, { target: { value: 'wallet-1' } });

    // Wait for sessions to load and Revoke button to appear
    await waitFor(() => {
      expect(screen.getByText('Revoke')).toBeTruthy();
    });

    // Click Revoke
    fireEvent.click(screen.getByText('Revoke'));

    // Wait for confirmation modal
    await waitFor(() => {
      expect(
        screen.getByText(/Are you sure you want to revoke this session/i),
      ).toBeTruthy();
    });

    // The modal has a "Revoke" confirm button - need to find the one in the modal
    // The modal footer has "Cancel" and "Revoke" buttons
    const modalButtons = screen.getAllByText('Revoke');
    // The last one should be the modal confirm button
    fireEvent.click(modalButtons[modalButtons.length - 1]);

    await waitFor(() => {
      expect(vi.mocked(apiDelete)).toHaveBeenCalledWith('/v1/sessions/sess-1');
    });
  });
});
