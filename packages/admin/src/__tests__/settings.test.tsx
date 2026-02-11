import { describe, it, expect, vi, afterEach } from 'vitest';
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
  getErrorMessage: (code: string) => `Error: ${code}`,
}));

import { apiGet, apiPost } from '../api/client';
import SettingsPage from '../pages/settings';

const mockKillSwitchNormal = {
  state: 'NORMAL',
  activatedAt: null,
  activatedBy: null,
};

const mockKillSwitchActivated = {
  state: 'ACTIVATED',
  activatedAt: 1707609600,
  activatedBy: 'admin',
};

describe('SettingsPage', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('should display kill switch state and toggle', async () => {
    vi.mocked(apiGet).mockResolvedValueOnce(mockKillSwitchNormal);

    render(<SettingsPage />);

    await waitFor(() => {
      expect(screen.getByText('NORMAL')).toBeTruthy();
    });

    expect(screen.getByText('Activate Kill Switch')).toBeTruthy();

    // Mock POST for activation and re-fetch
    vi.mocked(apiPost).mockResolvedValueOnce(undefined);
    vi.mocked(apiGet).mockResolvedValueOnce(mockKillSwitchActivated);

    fireEvent.click(screen.getByText('Activate Kill Switch'));

    await waitFor(() => {
      expect(vi.mocked(apiPost)).toHaveBeenCalledWith('/v1/admin/kill-switch');
    });
  });

  it('should open JWT rotation confirmation modal', async () => {
    vi.mocked(apiGet).mockResolvedValueOnce(mockKillSwitchNormal);

    render(<SettingsPage />);

    await waitFor(() => {
      expect(screen.getByText('NORMAL')).toBeTruthy();
    });

    fireEvent.click(screen.getByText('Rotate JWT Secret'));

    await waitFor(() => {
      expect(
        screen.getByText(/Are you sure you want to rotate the JWT secret/i),
      ).toBeTruthy();
    });

    expect(screen.getByText('Rotate')).toBeTruthy();

    // Mock rotation
    vi.mocked(apiPost).mockResolvedValueOnce({
      rotatedAt: 1707609600,
      message: 'Rotated',
    });

    fireEvent.click(screen.getByText('Rotate'));

    await waitFor(() => {
      expect(vi.mocked(apiPost)).toHaveBeenCalledWith('/v1/admin/rotate-secret');
    });
  });

  it('should require typing SHUTDOWN for daemon shutdown', async () => {
    vi.mocked(apiGet).mockResolvedValueOnce(mockKillSwitchNormal);

    render(<SettingsPage />);

    await waitFor(() => {
      expect(screen.getByText('NORMAL')).toBeTruthy();
    });

    fireEvent.click(screen.getByText('Shutdown Daemon'));

    // Wait for the shutdown modal - text is split across elements ("Type " + <strong>SHUTDOWN</strong> + " to confirm")
    await waitFor(() => {
      expect(screen.getByPlaceholderText('SHUTDOWN')).toBeTruthy();
    });

    const input = screen.getByPlaceholderText('SHUTDOWN');
    const shutdownBtn = screen.getByText('Shutdown');

    // Confirm button should be disabled initially
    expect(shutdownBtn.hasAttribute('disabled')).toBe(true);

    // Type SHUTDOWN
    fireEvent.input(input, { target: { value: 'SHUTDOWN' } });

    // Now the confirm button should be enabled
    await waitFor(() => {
      expect(screen.getByText('Shutdown').hasAttribute('disabled')).toBe(false);
    });

    // Mock shutdown
    vi.mocked(apiPost).mockResolvedValueOnce({ message: 'Shutting down' });

    fireEvent.click(screen.getByText('Shutdown'));

    await waitFor(() => {
      expect(vi.mocked(apiPost)).toHaveBeenCalledWith('/v1/admin/shutdown');
    });
  });
});
