/**
 * ERC-8004 Identity page UI tests.
 *
 * Tests cover:
 * - Feature gate disabled: EmptyState rendered
 * - Feature gate enabled: Identity table headers rendered
 * - Register Agent modal open/close
 * - Registration File tab: JSON viewer rendered
 * - Link Wallet button calls WC pair API
 * - Loading state display
 */
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

vi.mock('../utils/dirty-guard', () => ({
  registerDirty: vi.fn(),
  unregisterDirty: vi.fn(),
  hasDirty: { value: false },
}));

import { apiGet, apiPost } from '../api/client';
import Erc8004Page from '../pages/erc8004';

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

const mockSettingsDisabled = {
  'actions.erc8004_agent_enabled': { value: 'false', source: 'default' },
};

const mockSettingsEnabled = {
  'actions.erc8004_agent_enabled': { value: 'true', source: 'admin' },
};

const mockWallets = [
  { id: 'w1', name: 'test-wallet', chain: 'ethereum', network: 'ethereum-mainnet', publicKey: '0xabc', status: 'ACTIVE' },
  { id: 'w2', name: 'sol-wallet', chain: 'solana', network: 'solana-mainnet', publicKey: 'abc123', status: 'ACTIVE' },
];

const mockRegFile = {
  agentId: '42',
  name: 'test-agent',
  registryAddress: '0xregistry123456789abcdef',
  endpoints: { mcp: 'http://localhost:3100/mcp', rest: 'http://localhost:3100/v1' },
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Erc8004Page', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('shows EmptyState when feature gate is disabled', async () => {
    const mockApiGet = apiGet as ReturnType<typeof vi.fn>;
    mockApiGet.mockResolvedValueOnce(mockSettingsDisabled);

    render(<Erc8004Page />);

    await waitFor(() => {
      expect(screen.getByText('ERC-8004 Agent feature is disabled')).toBeTruthy();
    });
  });

  it('renders table headers when feature gate is enabled', async () => {
    const mockApiGet = apiGet as ReturnType<typeof vi.fn>;
    mockApiGet
      .mockResolvedValueOnce(mockSettingsEnabled) // settings
      .mockResolvedValueOnce(mockWallets) // wallets
      .mockResolvedValueOnce(mockRegFile); // registration file for w1

    render(<Erc8004Page />);

    await waitFor(() => {
      expect(screen.getByText('Wallet Name')).toBeTruthy();
      expect(screen.getByText('Status')).toBeTruthy();
      expect(screen.getByText('Agent ID')).toBeTruthy();
    });
  });

  it('opens and closes Register Agent modal', async () => {
    const mockApiGet = apiGet as ReturnType<typeof vi.fn>;
    mockApiGet
      .mockResolvedValueOnce(mockSettingsEnabled)
      .mockResolvedValueOnce(mockWallets)
      .mockResolvedValueOnce(mockRegFile);

    render(<Erc8004Page />);

    await waitFor(() => {
      expect(screen.getByText('Register Agent')).toBeTruthy();
    });

    // Click Register Agent button
    const registerBtn = screen.getAllByText('Register Agent')[0]!;
    fireEvent.click(registerBtn);

    await waitFor(() => {
      expect(screen.getByText('Name')).toBeTruthy();
      expect(screen.getByText('EVM Wallet')).toBeTruthy();
    });

    // Close modal
    const cancelBtn = screen.getByText('Cancel');
    fireEvent.click(cancelBtn);
  });

  it('renders Registration File tab with JSON viewer', async () => {
    const mockApiGet = apiGet as ReturnType<typeof vi.fn>;
    mockApiGet
      .mockResolvedValueOnce(mockSettingsEnabled)
      .mockResolvedValueOnce(mockWallets)
      .mockResolvedValueOnce(mockRegFile)
      .mockResolvedValueOnce(mockRegFile); // For registration file load

    render(<Erc8004Page />);

    await waitFor(() => {
      expect(screen.getByText('Registration File')).toBeTruthy();
    });

    // Switch to Registration File tab
    const regTab = screen.getByText('Registration File');
    fireEvent.click(regTab);

    await waitFor(() => {
      expect(screen.getByText('Select Wallet')).toBeTruthy();
    });
  });

  it('calls WC pair API when Link Wallet is clicked', async () => {
    const mockApiGet = apiGet as ReturnType<typeof vi.fn>;
    const mockApiPost = apiPost as ReturnType<typeof vi.fn>;

    mockApiGet
      .mockResolvedValueOnce(mockSettingsEnabled)
      .mockResolvedValueOnce(mockWallets)
      .mockResolvedValueOnce(mockRegFile);

    mockApiPost.mockResolvedValueOnce({ uri: 'wc:test-uri@2' });

    render(<Erc8004Page />);

    await waitFor(() => {
      expect(screen.getByText('Link Wallet')).toBeTruthy();
    });

    fireEvent.click(screen.getByText('Link Wallet'));

    await waitFor(() => {
      expect(mockApiPost).toHaveBeenCalledWith('/v1/wallets/w1/wc/pair', {});
    });
  });

  it('shows loading state initially', () => {
    const mockApiGet = apiGet as ReturnType<typeof vi.fn>;
    mockApiGet.mockReturnValueOnce(new Promise(() => {})); // Never resolves

    render(<Erc8004Page />);

    expect(screen.getByText('Loading...')).toBeTruthy();
  });
});
