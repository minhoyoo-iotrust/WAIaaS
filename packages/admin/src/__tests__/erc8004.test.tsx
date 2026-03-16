/**
 * ERC-8004 Agent Identity page UI tests.
 *
 * Tests cover:
 * - Disabled banner when feature gate is off (pointing to Providers)
 * - Feature gate enabled: full Identity table with action buttons
 * - Management tabs hidden when disabled
 * - Register Agent modal open/close
 * - Registration File tab: JSON viewer rendered
 * - Link Wallet button calls WC pair API
 * - Loading state display
 * - No toggle or tier settings on this page (managed in Providers)
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent, cleanup } from '@testing-library/preact';


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

vi.mock('../utils/dirty-guard', () => ({
  registerDirty: vi.fn(),
  unregisterDirty: vi.fn(),
  hasDirty: { value: false },
}));

import Erc8004Page from '../pages/erc8004';

// ---------------------------------------------------------------------------
// Mock data (nested SettingsData format)
// ---------------------------------------------------------------------------

const mockSettingsDisabled = {
  actions: {
    erc8004_agent_enabled: 'false',
  },
};

const mockSettingsEnabled = {
  actions: {
    erc8004_agent_enabled: 'true',
  },
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

  it('shows disabled banner with Providers link when feature gate is disabled', async () => {
    mockApiGet
      .mockResolvedValueOnce({ data: mockSettingsDisabled })  // settings
      .mockResolvedValueOnce({ data: { items: [] } });  // wallets

    render(<Erc8004Page />);

    await waitFor(() => {
      // Disabled banner should appear with link to Providers
      expect(screen.getByText(/Agent Identity is currently disabled/)).toBeTruthy();
      expect(screen.getByText('Enable this protocol in Providers settings')).toBeTruthy();
    });
  });

  it('does not show a toggle checkbox (managed in Providers)', async () => {
    mockApiGet
      .mockResolvedValueOnce({ data: mockSettingsDisabled })
      .mockResolvedValueOnce({ data: { items: [] } });

    render(<Erc8004Page />);

    await waitFor(() => {
      expect(screen.getByText(/Agent Identity is currently disabled/)).toBeTruthy();
    });

    // No checkbox/toggle should be present
    expect(screen.queryByRole('checkbox')).toBeNull();
    expect(screen.queryByText('Enabled')).toBeNull();
  });

  it('shows Providers link and table headers when enabled', async () => {
    mockApiGet
      .mockResolvedValueOnce({ data: mockSettingsEnabled }) // settings
      .mockResolvedValueOnce({ data: { items: mockWallets } }) // wallets
      .mockResolvedValueOnce({ data: mockRegFile }); // registration file for w1

    render(<Erc8004Page />);

    await waitFor(() => {
      // Providers link should render
      expect(screen.getByText(/Configure in Protocols/)).toBeTruthy();
      // Table headers should render
      expect(screen.getByText('Wallet Name')).toBeTruthy();
      expect(screen.getByText('Status')).toBeTruthy();
      expect(screen.getByText('Agent ID')).toBeTruthy();
    });
  });

  it('hides management tabs when disabled', async () => {
    mockApiGet
      .mockResolvedValueOnce({ data: mockSettingsDisabled }) // settings
      .mockResolvedValueOnce({ data: { items: mockWallets } }) // wallets
      .mockResolvedValueOnce({ data: mockRegFile }); // registration file for w1

    render(<Erc8004Page />);

    await waitFor(() => {
      // Identity tab should be visible
      expect(screen.getByText('Identity')).toBeTruthy();
    });

    // Registration File and Reputation tabs should NOT be visible when disabled
    expect(screen.queryByText('Registration File')).toBeNull();
    expect(screen.queryByText('Reputation')).toBeNull();
  });

  it('shows all tabs when enabled', async () => {
    mockApiGet
      .mockResolvedValueOnce({ data: mockSettingsEnabled }) // settings
      .mockResolvedValueOnce({ data: { items: mockWallets } }) // wallets
      .mockResolvedValueOnce({ data: mockRegFile }); // registration file for w1

    render(<Erc8004Page />);

    await waitFor(() => {
      expect(screen.getByText('Identity')).toBeTruthy();
      expect(screen.getByText('Registration File')).toBeTruthy();
      expect(screen.getByText('Reputation')).toBeTruthy();
    });
  });

  it('opens and closes Register Agent modal', async () => {
    mockApiGet
      .mockResolvedValueOnce({ data: mockSettingsEnabled })
      .mockResolvedValueOnce({ data: { items: mockWallets } })
      .mockResolvedValueOnce({ data: mockRegFile });

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
    mockApiGet
      .mockResolvedValueOnce({ data: mockSettingsEnabled })
      .mockResolvedValueOnce({ data: { items: mockWallets } })
      .mockResolvedValueOnce({ data: mockRegFile })
      .mockResolvedValueOnce({ data: mockRegFile }); // For registration file load

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
    mockApiGet
      .mockResolvedValueOnce({ data: mockSettingsEnabled })
      .mockResolvedValueOnce({ data: { items: mockWallets } })
      .mockResolvedValueOnce({ data: mockRegFile });

    mockApiPost.mockResolvedValueOnce({ data: { uri: 'wc:test-uri@2' } });

    render(<Erc8004Page />);

    await waitFor(() => {
      expect(screen.getByText('Link Wallet')).toBeTruthy();
    });

    fireEvent.click(screen.getByText('Link Wallet'));

    await waitFor(() => {
      expect(mockApiPost).toHaveBeenCalledWith('/v1/wallets/{id}/wc/pair', expect.objectContaining({
        params: { path: { id: 'w1' } },
      }));
    });
  });

  it('shows loading state initially', () => {
    mockApiGet.mockReturnValueOnce(new Promise(() => {})); // Never resolves

    render(<Erc8004Page />);

    expect(screen.getByText('Loading...')).toBeTruthy();
  });

  it('does not render Registered Actions or tier dropdowns (managed in Providers)', async () => {
    mockApiGet
      .mockResolvedValueOnce({ data: mockSettingsEnabled })
      .mockResolvedValueOnce({ data: { items: mockWallets } })
      .mockResolvedValueOnce({ data: mockRegFile });

    render(<Erc8004Page />);

    await waitFor(() => {
      expect(screen.getByText('Registered Agents')).toBeTruthy();
    });

    // No "Registered Actions" section or tier dropdowns
    expect(screen.queryByText('Registered Actions')).toBeNull();
    expect(screen.queryByText('Risk Level')).toBeNull();
  });
});
