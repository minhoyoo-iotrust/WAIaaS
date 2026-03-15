/**
 * Credentials page tests.
 *
 * Covers: list rendering, empty state, add modal, delete modal, rotate modal,
 * credential value not exposed.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent, cleanup } from '@testing-library/preact';

const mockApiGet = vi.fn();
const mockApiPost = vi.fn();
const mockApiDelete = vi.fn();
const mockApiPut = vi.fn();

vi.mock('../api/typed-client', () => ({
  api: {
    GET: (...args: unknown[]) => mockApiGet(...args),
    POST: (...args: unknown[]) => mockApiPost(...args),
    PUT: (...args: unknown[]) => mockApiPut(...args),
    DELETE: (...args: unknown[]) => mockApiDelete(...args),
  },
  ApiError: class ApiError extends Error {
    status: number; code: string; serverMessage: string;
    constructor(status: number, code: string, message: string) {
      super(message);
      this.name = 'ApiError';
      this.status = status;
      this.code = code;
      this.serverMessage = message;
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

import CredentialsPage from '../pages/credentials';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const MOCK_CREDENTIALS = [
  {
    id: 'cred-1',
    walletId: null,
    type: 'api-key' as const,
    name: 'polymarket-key',
    metadata: {},
    expiresAt: null,
    createdAt: 1700000000,
    updatedAt: 1700000000,
  },
  {
    id: 'cred-2',
    walletId: null,
    type: 'hmac-secret' as const,
    name: 'exchange-hmac',
    metadata: { provider: 'test' },
    expiresAt: 1800000000,
    createdAt: 1700000100,
    updatedAt: 1700000100,
  },
];

describe('CredentialsPage', () => {
  it('renders credential list', async () => {
    mockApiGet.mockResolvedValue({ data: { credentials: MOCK_CREDENTIALS } });
    render(<CredentialsPage />);

    await waitFor(() => {
      expect(screen.getByText('polymarket-key')).toBeTruthy();
      expect(screen.getByText('exchange-hmac')).toBeTruthy();
    });
  });

  it('shows empty state when no credentials', async () => {
    mockApiGet.mockResolvedValue({ data: { credentials: [] } });
    render(<CredentialsPage />);

    await waitFor(() => {
      expect(screen.getByText('No Credentials')).toBeTruthy();
      expect(screen.getByText('Add Credential')).toBeTruthy();
    });
  });

  it('renders type badges', async () => {
    mockApiGet.mockResolvedValue({ data: { credentials: MOCK_CREDENTIALS } });
    render(<CredentialsPage />);

    await waitFor(() => {
      expect(screen.getByText('api-key')).toBeTruthy();
      expect(screen.getByText('hmac-secret')).toBeTruthy();
    });
  });

  it('opens add modal when clicking Add Credential', async () => {
    mockApiGet.mockResolvedValue({ data: { credentials: MOCK_CREDENTIALS } });
    render(<CredentialsPage />);

    await waitFor(() => {
      expect(screen.getByText('polymarket-key')).toBeTruthy();
    });

    fireEvent.click(screen.getByText('Add Credential'));
    await waitFor(() => {
      expect(screen.getByText('Add Global Credential')).toBeTruthy();
    });
  });

  it('opens delete confirmation modal', async () => {
    mockApiGet.mockResolvedValue({ data: { credentials: MOCK_CREDENTIALS } });
    render(<CredentialsPage />);

    await waitFor(() => {
      expect(screen.getByText('polymarket-key')).toBeTruthy();
    });

    const deleteButtons = screen.getAllByText('Delete');
    fireEvent.click(deleteButtons[0]!);
    await waitFor(() => {
      expect(screen.getByText('Delete Credential')).toBeTruthy();
    });
  });

  it('opens rotate modal', async () => {
    mockApiGet.mockResolvedValue({ data: { credentials: MOCK_CREDENTIALS } });
    render(<CredentialsPage />);

    await waitFor(() => {
      expect(screen.getByText('polymarket-key')).toBeTruthy();
    });

    const rotateButtons = screen.getAllByText('Rotate');
    fireEvent.click(rotateButtons[0]!);
    await waitFor(() => {
      expect(screen.getByText('Rotate Credential')).toBeTruthy();
    });
  });

  it('does not expose credential value in table', async () => {
    mockApiGet.mockResolvedValue({ data: { credentials: MOCK_CREDENTIALS } });
    render(<CredentialsPage />);

    await waitFor(() => {
      expect(screen.getByText('polymarket-key')).toBeTruthy();
    });

    // CredentialMetadata does not include 'value' field -- verify no column header for it
    expect(screen.queryByText('Value')).toBeNull();
    // Verify table has Name, Type, Expires, Created, Actions columns
    expect(screen.getByText('Name')).toBeTruthy();
    expect(screen.getByText('Type')).toBeTruthy();
    expect(screen.getByText('Expires')).toBeTruthy();
    expect(screen.getByText('Created')).toBeTruthy();
    expect(screen.getByText('Actions')).toBeTruthy();
  });

  it('calls api.POST when creating credential', async () => {
    mockApiGet.mockResolvedValue({ data: { credentials: [] } });
    mockApiPost.mockResolvedValue({ data: { id: 'new-cred' } });
    render(<CredentialsPage />);

    await waitFor(() => {
      expect(screen.getByText('No Credentials')).toBeTruthy();
    });

    fireEvent.click(screen.getByText('Add Credential'));
    await waitFor(() => {
      expect(screen.getByText('Add Global Credential')).toBeTruthy();
    });

    // Fill form
    const nameInput = screen.getByPlaceholderText('e.g. polymarket-api-key');
    fireEvent.input(nameInput, { target: { value: 'test-key' } });

    const valueInput = screen.getByPlaceholderText('Secret value');
    fireEvent.input(valueInput, { target: { value: 'secret123' } });

    // Click Create
    mockApiGet.mockResolvedValue({ data: { credentials: [{ id: 'new', walletId: null, type: 'api-key' as const, name: 'test-key', metadata: {}, expiresAt: null, createdAt: 1700000000, updatedAt: 1700000000 }] } });
    fireEvent.click(screen.getByText('Create'));

    await waitFor(() => {
      expect(mockApiPost).toHaveBeenCalled();
    });
  });
});
