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

import { apiGet, apiPut, apiDelete, ApiError } from '../api/client';
import { showToast } from '../components/toast';
import TelegramUsersPage from '../pages/telegram-users';

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

const mockUsers = [
  {
    chat_id: 111,
    username: 'alice',
    role: 'PENDING' as const,
    registered_at: 1707609600,
    approved_at: null,
  },
  {
    chat_id: 222,
    username: 'bob',
    role: 'ADMIN' as const,
    registered_at: 1707523200,
    approved_at: 1707609600,
  },
  {
    chat_id: 333,
    username: null,
    role: 'READONLY' as const,
    registered_at: 1707436800,
    approved_at: 1707523200,
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mockApiCalls(users = mockUsers) {
  vi.mocked(apiGet).mockImplementation(async (path: string) => {
    if (path === '/v1/admin/telegram-users') return { users, total: users.length };
    return {};
  });
}

async function renderAndWaitForLoad() {
  render(<TelegramUsersPage />);
  await waitFor(() => {
    // Table header should appear
    expect(screen.getByText('Chat ID')).toBeTruthy();
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('TelegramUsersPage', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  // ---- Test 1: Renders user list with 3 rows ----
  it('renders user list with correct roles and badges', async () => {
    mockApiCalls();
    await renderAndWaitForLoad();

    // Wait for data to load
    await waitFor(() => {
      expect(screen.getByText('111')).toBeTruthy();
    });

    // All 3 users displayed
    expect(screen.getByText('111')).toBeTruthy();
    expect(screen.getByText('alice')).toBeTruthy();
    expect(screen.getByText('222')).toBeTruthy();
    expect(screen.getByText('bob')).toBeTruthy();
    expect(screen.getByText('333')).toBeTruthy();

    // Role badges
    expect(screen.getByText('PENDING')).toBeTruthy();
    expect(screen.getByText('ADMIN')).toBeTruthy();
    expect(screen.getByText('READONLY')).toBeTruthy();
  });

  // ---- Test 2: Empty list shows empty message ----
  it('shows empty message when no users', async () => {
    mockApiCalls([]);
    await renderAndWaitForLoad();

    await waitFor(() => {
      expect(screen.getByText(/No Telegram users registered/)).toBeTruthy();
    });
  });

  // ---- Test 3: Approve action ----
  it('approves a PENDING user with ADMIN role', async () => {
    mockApiCalls();
    vi.mocked(apiPut).mockResolvedValueOnce({ success: true, chat_id: 111, role: 'ADMIN' });
    await renderAndWaitForLoad();

    await waitFor(() => {
      expect(screen.getByText('111')).toBeTruthy();
    });

    // Click Approve button (only PENDING user has one)
    const approveButtons = screen.getAllByText('Approve');
    expect(approveButtons.length).toBe(1);
    fireEvent.click(approveButtons[0]!);

    // Modal should appear
    await waitFor(() => {
      expect(screen.getByText('Approve Telegram User')).toBeTruthy();
    });

    // Click Confirm (default role is ADMIN) -- the modal's confirm button
    const modalFooter = document.querySelector('.modal-footer');
    const confirmButton = modalFooter!.querySelector('button.btn-primary') as HTMLButtonElement;
    fireEvent.click(confirmButton);

    await waitFor(() => {
      expect(vi.mocked(apiPut)).toHaveBeenCalledWith('/v1/admin/telegram-users/111', { role: 'ADMIN' });
    });

    await waitFor(() => {
      expect(vi.mocked(showToast)).toHaveBeenCalledWith('success', 'User approved as ADMIN');
    });
  });

  // ---- Test 4: Delete action ----
  it('deletes a user with confirmation', async () => {
    mockApiCalls();
    vi.mocked(apiDelete).mockResolvedValueOnce({ success: true });
    await renderAndWaitForLoad();

    await waitFor(() => {
      expect(screen.getByText('111')).toBeTruthy();
    });

    // Click first Delete button (all users have one)
    const deleteButtons = screen.getAllByText('Delete');
    expect(deleteButtons.length).toBe(3);
    fireEvent.click(deleteButtons[0]!);

    // Modal should appear
    await waitFor(() => {
      expect(screen.getByText('Delete Telegram User')).toBeTruthy();
    });

    // Confirm delete - click the danger button in the modal footer
    const modalFooter = document.querySelector('.modal-footer');
    const confirmButton = modalFooter!.querySelector('button.btn-danger') as HTMLButtonElement;
    fireEvent.click(confirmButton);

    await waitFor(() => {
      expect(vi.mocked(apiDelete)).toHaveBeenCalledWith('/v1/admin/telegram-users/111');
    });

    await waitFor(() => {
      expect(vi.mocked(showToast)).toHaveBeenCalledWith('success', 'User deleted');
    });
  });

  // ---- Test 5: Error handling on approve failure ----
  it('shows error toast on approve failure', async () => {
    mockApiCalls();
    const MockApiError = (await import('../api/client')).ApiError;
    vi.mocked(apiPut).mockRejectedValueOnce(new MockApiError(404, 'WALLET_NOT_FOUND', 'User not found'));
    await renderAndWaitForLoad();

    await waitFor(() => {
      expect(screen.getByText('111')).toBeTruthy();
    });

    // Click Approve
    fireEvent.click(screen.getAllByText('Approve')[0]!);

    await waitFor(() => {
      expect(screen.getByText('Approve Telegram User')).toBeTruthy();
    });

    // Confirm
    const modalFooter = document.querySelector('.modal-footer');
    const confirmButton = modalFooter!.querySelector('button.btn-primary') as HTMLButtonElement;
    fireEvent.click(confirmButton);

    await waitFor(() => {
      expect(vi.mocked(showToast)).toHaveBeenCalledWith('error', 'Error: WALLET_NOT_FOUND');
    });
  });

  // ---- Test 6: Loading state ----
  it('shows loading state initially', async () => {
    // Delay the API response
    vi.mocked(apiGet).mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve({ users: [], total: 0 }), 100)),
    );

    render(<TelegramUsersPage />);

    // Loading should be shown
    expect(screen.getByText('Loading...')).toBeTruthy();

    // Wait for load to complete
    await waitFor(() => {
      expect(screen.getByText(/No Telegram users registered/)).toBeTruthy();
    });
  });

  // ---- Test 7: Null username displays dash ----
  it('displays dash for null username', async () => {
    mockApiCalls();
    await renderAndWaitForLoad();

    await waitFor(() => {
      expect(screen.getByText('333')).toBeTruthy();
    });

    // User 333 has null username -> should show "-"
    const cells = document.querySelectorAll('td');
    const usernameValues = Array.from(cells).map((td) => td.textContent);
    expect(usernameValues.some((v) => v === '-')).toBe(true);
  });
});
