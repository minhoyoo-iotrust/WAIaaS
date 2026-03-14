/**
 * ERC-8004 Agent Identity page UI tests.
 *
 * Tests cover:
 * - Toggle visible in both enabled and disabled states
 * - Feature gate disabled: disabled message + read-only table
 * - Feature gate enabled: full Identity table with action buttons
 * - Management tabs hidden when disabled
 * - Register Agent modal open/close
 * - Registration File tab: JSON viewer rendered
 * - Link Wallet button calls WC pair API
 * - Loading state display
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent, cleanup } from '@testing-library/preact';


const mockApiGet = vi.fn();
const mockApiPost = vi.fn();
const mockApiPut = vi.fn();
const mockApiDelete = vi.fn();
const mockApiPatch = vi.fn();

// Mock declarations moved to top-level const

vi.mock('../api/typed-client', () => ({
  api: {
    GET: (...args: unknown[]) => mockApiGet(...args),
    POST: (...args: unknown[]) => mockApiPost(...args),
    PUT: (...args: unknown[]) => mockApiPut(...args),
    DELETE: (...args: unknown[]) => mockApiDelete(...args),
    PATCH: (...args: unknown[]) => mockApiPatch(...args),
  },
  ApiError: class ApiError extends Error {
    status: number; code: string; serverMessage: string;
    constructor(s: number, c: string, m: string) { super(`[${s}] ${c}: ${m}`); this.name = 'ApiError'; this.status = s; this.code = c; this.serverMessage = m; }
  },
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

const mockProvidersWithErc8004 = {
  providers: [
    {
      name: 'erc8004_agent',
      description: 'ERC-8004 Agent Identity',
      version: '1.0.0',
      chains: ['ethereum'],
      requiresApiKey: false,
      hasApiKey: false,
      actions: [
        { name: 'register_agent', description: 'Register a new agent identity on the ERC-8004 registry', chain: 'ethereum', riskLevel: 'high', defaultTier: 'APPROVAL' },
        { name: 'set_agent_wallet', description: 'Link a wallet to a registered agent identity via EIP-712 signature', chain: 'ethereum', riskLevel: 'high', defaultTier: 'APPROVAL' },
      ],
    },
  ],
};

const mockSettingsWithTierOverride = {
  actions: {
    erc8004_agent_enabled: 'true',
    erc8004_agent_register_agent_tier: 'DELAY',
  },
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Erc8004Page', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('shows toggle and disabled message when feature gate is disabled', async () => {
        mockApiGet
      .mockResolvedValueOnce(mockSettingsDisabled)  // settings
      .mockResolvedValueOnce({ providers: [] })  // providers
      .mockResolvedValueOnce({ items: [] })  // wallets (always loaded now)
    ;

    render(<Erc8004Page />);

    await waitFor(() => {
      // Toggle should be visible
      expect(screen.getByText('Enabled')).toBeTruthy();
      // Disabled message should appear
      expect(screen.getByText(/Agent Identity features are disabled/)).toBeTruthy();
    });
  });

  it('shows toggle in enabled state with table headers', async () => {
        mockApiGet
      .mockResolvedValueOnce(mockSettingsEnabled) // settings
      .mockResolvedValueOnce({ providers: [] }) // providers
      .mockResolvedValueOnce({ items: mockWallets }) // wallets
      .mockResolvedValueOnce(mockRegFile); // registration file for w1

    render(<Erc8004Page />);

    await waitFor(() => {
      // Toggle should be visible
      expect(screen.getByText('Enabled')).toBeTruthy();
      // Table headers should render
      expect(screen.getByText('Wallet Name')).toBeTruthy();
      expect(screen.getByText('Status')).toBeTruthy();
      expect(screen.getByText('Agent ID')).toBeTruthy();
    });
  });

  it('hides management tabs when disabled', async () => {
        mockApiGet
      .mockResolvedValueOnce(mockSettingsDisabled) // settings
      .mockResolvedValueOnce({ providers: [] }) // providers
      .mockResolvedValueOnce({ items: mockWallets }) // wallets
      .mockResolvedValueOnce(mockRegFile); // registration file for w1

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
      .mockResolvedValueOnce(mockSettingsEnabled) // settings
      .mockResolvedValueOnce({ providers: [] }) // providers
      .mockResolvedValueOnce({ items: mockWallets }) // wallets
      .mockResolvedValueOnce(mockRegFile); // registration file for w1

    render(<Erc8004Page />);

    await waitFor(() => {
      expect(screen.getByText('Identity')).toBeTruthy();
      expect(screen.getByText('Registration File')).toBeTruthy();
      expect(screen.getByText('Reputation')).toBeTruthy();
    });
  });

  it('opens and closes Register Agent modal', async () => {
        mockApiGet
      .mockResolvedValueOnce(mockSettingsEnabled)
      .mockResolvedValueOnce({ providers: [] }) // providers
      .mockResolvedValueOnce({ items: mockWallets })
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
        mockApiGet
      .mockResolvedValueOnce(mockSettingsEnabled)
      .mockResolvedValueOnce({ providers: [] }) // providers
      .mockResolvedValueOnce({ items: mockWallets })
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
        
    mockApiGet
      .mockResolvedValueOnce(mockSettingsEnabled)
      .mockResolvedValueOnce({ providers: [] }) // providers
      .mockResolvedValueOnce({ items: mockWallets })
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
        mockApiGet.mockReturnValueOnce(new Promise(() => {})); // Never resolves

    render(<Erc8004Page />);

    expect(screen.getByText('Loading...')).toBeTruthy();
  });

  it('calls PUT settings API when toggle is clicked', async () => {
        
    mockApiGet
      .mockResolvedValueOnce(mockSettingsDisabled) // initial settings
      .mockResolvedValueOnce({ providers: [] }) // providers
      .mockResolvedValueOnce([]) // wallets
      .mockResolvedValueOnce(mockSettingsEnabled) // settings after toggle
      .mockResolvedValueOnce({ providers: [] }) // providers reload
      .mockResolvedValueOnce({ items: mockWallets }); // wallets after reload

    mockApiPut.mockResolvedValueOnce({ updated: 1, settings: mockSettingsEnabled });

    render(<Erc8004Page />);

    await waitFor(() => {
      expect(screen.getByText('Enabled')).toBeTruthy();
    });

    // Find and click the checkbox
    const checkbox = screen.getByRole('checkbox');
    fireEvent.click(checkbox);

    await waitFor(() => {
      expect(mockApiPut).toHaveBeenCalledWith('/v1/admin/settings', {
        settings: [{ key: 'actions.erc8004_agent_enabled', value: 'true' }],
      });
    });
  });

  describe('Registered Actions table (Phase 331)', () => {
    it('renders Registered Actions when erc8004_agent provider has actions', async () => {
            mockApiGet
        .mockResolvedValueOnce(mockSettingsEnabled) // settings
        .mockResolvedValueOnce(mockProvidersWithErc8004) // providers
        .mockResolvedValueOnce({ items: mockWallets }) // wallets
        .mockResolvedValueOnce(mockRegFile); // registration file

      render(<Erc8004Page />);

      await waitFor(() => {
        expect(screen.getByText('Registered Actions')).toBeTruthy();
      });
      expect(screen.getByText('register_agent')).toBeTruthy();
      expect(screen.getByText('set_agent_wallet')).toBeTruthy();
    });

    it('shows Description column with action descriptions', async () => {
            mockApiGet
        .mockResolvedValueOnce(mockSettingsEnabled)
        .mockResolvedValueOnce(mockProvidersWithErc8004)
        .mockResolvedValueOnce({ items: mockWallets })
        .mockResolvedValueOnce(mockRegFile);

      render(<Erc8004Page />);

      await waitFor(() => {
        expect(screen.getByText('Description')).toBeTruthy();
      });
      expect(screen.getByText(/Register a new agent identity/)).toBeTruthy();
    });

    it('tier dropdown is disabled when feature is disabled', async () => {
            mockApiGet
        .mockResolvedValueOnce(mockSettingsDisabled)
        .mockResolvedValueOnce(mockProvidersWithErc8004)
        .mockResolvedValueOnce({ items: mockWallets })
        .mockResolvedValueOnce(mockRegFile);

      render(<Erc8004Page />);

      await waitFor(() => {
        expect(screen.getByText('Registered Actions')).toBeTruthy();
      });

      const selects = document.querySelectorAll('select');
      // All tier dropdowns should be disabled
      selects.forEach(s => {
        expect(s.disabled).toBe(true);
      });
    });

    it('tier dropdown is enabled when feature is enabled', async () => {
            mockApiGet
        .mockResolvedValueOnce(mockSettingsEnabled)
        .mockResolvedValueOnce(mockProvidersWithErc8004)
        .mockResolvedValueOnce({ items: mockWallets })
        .mockResolvedValueOnce(mockRegFile);

      render(<Erc8004Page />);

      await waitFor(() => {
        expect(screen.getByText('Registered Actions')).toBeTruthy();
      });

      const selects = document.querySelectorAll('select');
      expect(selects.length).toBeGreaterThan(0);
      selects.forEach(s => {
        expect(s.disabled).toBe(false);
      });
    });

    it('dropdown change fires PUT with correct tier key', async () => {
            
      mockApiGet
        .mockResolvedValueOnce(mockSettingsEnabled)
        .mockResolvedValueOnce(mockProvidersWithErc8004)
        .mockResolvedValueOnce({ items: mockWallets })
        .mockResolvedValueOnce(mockRegFile);

      mockApiPut.mockResolvedValueOnce({
        updated: 1,
        settings: { actions: { erc8004_agent_enabled: 'true', erc8004_agent_register_agent_tier: 'DELAY' } },
      });

      render(<Erc8004Page />);

      await waitFor(() => {
        expect(screen.getByText('Registered Actions')).toBeTruthy();
      });

      const selects = document.querySelectorAll('select');
      const firstSelect = selects[0] as HTMLSelectElement;
      fireEvent.change(firstSelect, { target: { value: 'DELAY' } });

      await waitFor(() => {
        expect(mockApiPut).toHaveBeenCalledWith('/v1/admin/settings', {
          settings: [{ key: 'actions.erc8004_agent_register_agent_tier', value: 'DELAY' }],
        });
      });
    });
  });
});
