/**
 * Tests for Smart Account provider UI in wallet create form and detail page.
 *
 * Covers:
 * - Provider fields visibility based on accountType
 * - Dashboard link switching between Pimlico and Alchemy
 * - Custom provider URL fields
 * - Detail page provider info display
 * - Provider edit calls PUT /v1/wallets/:id/provider
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent, cleanup } from '@testing-library/preact';

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

vi.mock('../components/layout', async () => {
  const { signal } = await import('@preact/signals');
  return { currentPath: signal('/wallets') };
});

vi.mock('../components/copy-button', () => ({
  CopyButton: ({ value }: { value: string }) => <button>Copy</button>,
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

import { api } from '../api/typed-client';
import { currentPath } from '../components/layout';
import WalletsPage from '../pages/wallets';

const mockWallets = {
  items: [
    {
      id: 'w1',
      name: 'test-eoa',
      chain: 'ethereum',
      network: 'ethereum-sepolia',
      environment: 'testnet',
      publicKey: '0xabc123',
      status: 'ACTIVE',
      ownerAddress: null,
      ownerState: 'NONE',
      createdAt: 1700000000,
      accountType: 'eoa',
    },
    {
      id: 'w2',
      name: 'test-smart',
      chain: 'ethereum',
      network: 'ethereum-sepolia',
      environment: 'testnet',
      publicKey: '0xdef456',
      status: 'ACTIVE',
      ownerAddress: null,
      ownerState: 'NONE',
      createdAt: 1700000000,
      accountType: 'smart',
      signerKey: '0xsigner',
      deployed: false,
      provider: { name: 'pimlico', supportedChains: ['ethereum-mainnet', 'ethereum-sepolia'], paymasterEnabled: true },
    },
  ],
};

const mockSmartWalletDetail = {
  id: 'w2',
  name: 'test-smart',
  chain: 'ethereum',
  network: 'ethereum-sepolia',
  environment: 'testnet',
  publicKey: '0xdef456',
  status: 'ACTIVE',
  ownerAddress: null,
  ownerVerified: null,
  ownerState: 'NONE',
  approvalMethod: null,
  walletType: null,
  suspendedAt: null,
  suspensionReason: null,
  updatedAt: null,
  createdAt: 1700000000,
  accountType: 'smart',
  signerKey: '0xsigner',
  deployed: false,
  provider: { name: 'pimlico', supportedChains: ['ethereum-mainnet', 'ethereum-sepolia'], paymasterEnabled: true },
};

describe('Wallet Provider UI', () => {
  beforeEach(() => {
    vi.mocked(api.GET).mockResolvedValue({ data: mockWallets } as never);
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('shows provider fields when accountType is smart (default None hides API Key)', async () => {
    (currentPath as unknown as { value: string }).value = '/wallets';
    render(<WalletsPage />);

    await waitFor(() => {
      expect(screen.getByText('Create Wallet')).toBeTruthy();
    });

    // Click Create Wallet button
    fireEvent.click(screen.getByText('Create Wallet'));

    // Select ethereum chain
    const chainSelect = screen.getByLabelText('Chain');
    fireEvent.change(chainSelect, { target: { value: 'ethereum' } });

    await waitFor(() => {
      expect(screen.getByLabelText('Account Type')).toBeTruthy();
    });

    // Select smart account type
    const accountTypeSelect = screen.getByLabelText('Account Type');
    fireEvent.change(accountTypeSelect, { target: { value: 'smart' } });

    await waitFor(() => {
      expect(screen.getByLabelText('Provider')).toBeTruthy();
    });

    // Default provider is None (Lite) -- API Key should be hidden
    expect(screen.queryByLabelText('API Key')).toBeNull();

    // Switch to pimlico to show API Key
    const providerSelect = screen.getByLabelText('Provider');
    fireEvent.change(providerSelect, { target: { value: 'pimlico' } });

    await waitFor(() => {
      expect(screen.getByLabelText('API Key')).toBeTruthy();
    });
  });

  it('hides provider fields when accountType is eoa', async () => {
    (currentPath as unknown as { value: string }).value = '/wallets';
    render(<WalletsPage />);

    await waitFor(() => {
      expect(screen.getByText('Create Wallet')).toBeTruthy();
    });

    fireEvent.click(screen.getByText('Create Wallet'));

    const chainSelect = screen.getByLabelText('Chain');
    fireEvent.change(chainSelect, { target: { value: 'ethereum' } });

    await waitFor(() => {
      expect(screen.getByLabelText('Account Type')).toBeTruthy();
    });

    // Keep default EOA
    expect(screen.queryByLabelText('Provider')).toBeNull();
    expect(screen.queryByLabelText('API Key')).toBeNull();
  });

  it('switches dashboard link between Pimlico and Alchemy', async () => {
    (currentPath as unknown as { value: string }).value = '/wallets';
    render(<WalletsPage />);

    await waitFor(() => {
      expect(screen.getByText('Create Wallet')).toBeTruthy();
    });

    fireEvent.click(screen.getByText('Create Wallet'));

    const chainSelect = screen.getByLabelText('Chain');
    fireEvent.change(chainSelect, { target: { value: 'ethereum' } });

    await waitFor(() => {
      expect(screen.getByLabelText('Account Type')).toBeTruthy();
    });

    const accountTypeSelect = screen.getByLabelText('Account Type');
    fireEvent.change(accountTypeSelect, { target: { value: 'smart' } });

    await waitFor(() => {
      expect(screen.getByLabelText('Provider')).toBeTruthy();
    });

    // Default is None (Lite) -- switch to pimlico first
    const providerSelect = screen.getByLabelText('Provider');
    fireEvent.change(providerSelect, { target: { value: 'pimlico' } });

    await waitFor(() => {
      expect(screen.getByText('Pimlico Dashboard')).toBeTruthy();
    });

    // Switch to alchemy
    fireEvent.change(providerSelect, { target: { value: 'alchemy' } });

    await waitFor(() => {
      expect(screen.getByText('Alchemy Dashboard')).toBeTruthy();
    });
  });

  it('shows URL fields for custom provider', async () => {
    (currentPath as unknown as { value: string }).value = '/wallets';
    render(<WalletsPage />);

    await waitFor(() => {
      expect(screen.getByText('Create Wallet')).toBeTruthy();
    });

    fireEvent.click(screen.getByText('Create Wallet'));

    const chainSelect = screen.getByLabelText('Chain');
    fireEvent.change(chainSelect, { target: { value: 'ethereum' } });

    await waitFor(() => {
      expect(screen.getByLabelText('Account Type')).toBeTruthy();
    });

    const accountTypeSelect = screen.getByLabelText('Account Type');
    fireEvent.change(accountTypeSelect, { target: { value: 'smart' } });

    await waitFor(() => {
      expect(screen.getByLabelText('Provider')).toBeTruthy();
    });

    // Select custom provider
    const providerSelect = screen.getByLabelText('Provider');
    fireEvent.change(providerSelect, { target: { value: 'custom' } });

    await waitFor(() => {
      expect(screen.getByLabelText('Bundler URL')).toBeTruthy();
      expect(screen.getByLabelText('Paymaster URL (optional)')).toBeTruthy();
      expect(screen.queryByLabelText('API Key')).toBeNull();
    });
  });

  it('shows provider info in detail page for smart account', async () => {
    (currentPath as unknown as { value: string }).value = '/wallets/w2';

    vi.mocked(api.GET).mockImplementation(async (url: string) => {
      if (url.includes('/networks')) return { data: { availableNetworks: [] } } as never;
      if (url.includes('/balance')) return { data: { balances: [] } } as never;
      if (url.includes('/transactions')) return { data: { items: [], total: 0 } } as never;
      if (url.includes('/wc/session')) throw new Error('not found');
      if (url.includes('/staking')) return { data: { positions: [] } } as never;
      return { data: mockSmartWalletDetail } as never;
    });

    render(<WalletsPage />);

    await waitFor(() => {
      expect(screen.getByText('pimlico')).toBeTruthy();
    });

    // Check provider fields are displayed
    expect(screen.getByText('Provider')).toBeTruthy();
    expect(screen.getByText('Supported Chains')).toBeTruthy();
    expect(screen.getByText('Paymaster')).toBeTruthy();
    expect(screen.getByText('Enabled')).toBeTruthy();
    expect(screen.getByText('Change Provider')).toBeTruthy();
  });

  it('calls PUT /v1/wallets/:id/provider when editing provider', async () => {
    (currentPath as unknown as { value: string }).value = '/wallets/w2';

    vi.mocked(api.GET).mockImplementation(async (url: string) => {
      if (url.includes('/networks')) return { data: { availableNetworks: [] } } as never;
      if (url.includes('/balance')) return { data: { balances: [] } } as never;
      if (url.includes('/transactions')) return { data: { items: [], total: 0 } } as never;
      if (url.includes('/wc/session')) throw new Error('not found');
      if (url.includes('/staking')) return { data: { positions: [] } } as never;
      return { data: mockSmartWalletDetail } as never;
    });

    vi.mocked(api.PUT).mockResolvedValue({ data: {
      provider: { name: 'alchemy', supportedChains: ['ethereum-mainnet'], paymasterEnabled: true },
    } } as never);

    render(<WalletsPage />);

    await waitFor(() => {
      expect(screen.getByText('Change Provider')).toBeTruthy();
    });

    // Click Change Provider
    fireEvent.click(screen.getByText('Change Provider'));

    await waitFor(() => {
      expect(screen.getByText('Save')).toBeTruthy();
    });

    // Change to alchemy and enter key
    const providerSelect = screen.getByLabelText('Provider');
    fireEvent.change(providerSelect, { target: { value: 'alchemy' } });

    const apiKeyInput = screen.getByLabelText('API Key');
    fireEvent.input(apiKeyInput, { target: { value: 'test-alchemy-key' } });

    // Click Save
    fireEvent.click(screen.getByText('Save'));

    await waitFor(() => {
      expect(api.PUT).toHaveBeenCalledWith('/v1/wallets/{id}/provider', expect.objectContaining({
        body: expect.objectContaining({
          provider: 'alchemy',
          apiKey: 'test-alchemy-key',
        }),
      }));
    });
  });

  it('sends aaProvider/aaProviderApiKey fields when creating smart account with pimlico', async () => {
    (currentPath as unknown as { value: string }).value = '/wallets';

    vi.mocked(api.POST).mockResolvedValue({ data: {
      id: 'w3',
      name: 'test-smart-new',
      chain: 'ethereum',
      network: 'ethereum-sepolia',
      environment: 'testnet',
      publicKey: '0xnew',
      status: 'ACTIVE',
      accountType: 'smart',
    } } as never);

    render(<WalletsPage />);

    await waitFor(() => {
      expect(screen.getByText('Create Wallet')).toBeTruthy();
    });

    fireEvent.click(screen.getByText('Create Wallet'));

    // Fill name
    const nameInput = screen.getByPlaceholderText('e.g. trading-bot');
    fireEvent.input(nameInput, { target: { value: 'test-smart-new' } });

    // Select ethereum chain
    const chainSelect = screen.getByLabelText('Chain');
    fireEvent.change(chainSelect, { target: { value: 'ethereum' } });

    await waitFor(() => {
      expect(screen.getByLabelText('Account Type')).toBeTruthy();
    });

    // Select smart account type
    const accountTypeSelect = screen.getByLabelText('Account Type');
    fireEvent.change(accountTypeSelect, { target: { value: 'smart' } });

    await waitFor(() => {
      expect(screen.getByLabelText('Provider')).toBeTruthy();
    });

    // Select pimlico provider (default is None/Lite)
    const providerSelect = screen.getByLabelText('Provider');
    fireEvent.change(providerSelect, { target: { value: 'pimlico' } });

    await waitFor(() => {
      expect(screen.getByLabelText('API Key')).toBeTruthy();
    });

    // Fill API key
    const apiKeyInput = screen.getByLabelText('API Key');
    fireEvent.input(apiKeyInput, { target: { value: 'pimlico-key-123' } });

    // Submit
    fireEvent.click(screen.getByText('Create'));

    await waitFor(() => {
      expect(api.POST).toHaveBeenCalled();
      const callArgs = vi.mocked(api.POST).mock.calls[0];
      const body = (callArgs[1] as any).body as Record<string, unknown>;
      // Must use aaProvider/aaProviderApiKey (not provider/apiKey)
      expect(body.aaProvider).toBe('pimlico');
      expect(body.aaProviderApiKey).toBe('pimlico-key-123');
      expect(body.accountType).toBe('smart');
      expect(body).not.toHaveProperty('provider');
      expect(body).not.toHaveProperty('apiKey');
    });
  });

  // =========================================================================
  // Lite/Full Mode Tests
  // =========================================================================

  it('shows None (Lite mode) as first option in Provider dropdown', async () => {
    (currentPath as unknown as { value: string }).value = '/wallets';
    render(<WalletsPage />);

    await waitFor(() => {
      expect(screen.getByText('Create Wallet')).toBeTruthy();
    });

    fireEvent.click(screen.getByText('Create Wallet'));

    const chainSelect = screen.getByLabelText('Chain');
    fireEvent.change(chainSelect, { target: { value: 'ethereum' } });

    await waitFor(() => {
      expect(screen.getByLabelText('Account Type')).toBeTruthy();
    });

    const accountTypeSelect = screen.getByLabelText('Account Type');
    fireEvent.change(accountTypeSelect, { target: { value: 'smart' } });

    await waitFor(() => {
      expect(screen.getByLabelText('Provider')).toBeTruthy();
    });

    // None (Lite mode) option should exist
    const providerSelect = screen.getByLabelText('Provider') as HTMLSelectElement;
    const options = Array.from(providerSelect.querySelectorAll('option'));
    expect(options[0]?.textContent).toBe('None (Lite mode)');
    expect(options[0]?.value).toBe('none');
  });

  it('hides API Key and URL fields when None (Lite) is selected', async () => {
    (currentPath as unknown as { value: string }).value = '/wallets';
    render(<WalletsPage />);

    await waitFor(() => {
      expect(screen.getByText('Create Wallet')).toBeTruthy();
    });

    fireEvent.click(screen.getByText('Create Wallet'));

    const chainSelect = screen.getByLabelText('Chain');
    fireEvent.change(chainSelect, { target: { value: 'ethereum' } });

    await waitFor(() => {
      expect(screen.getByLabelText('Account Type')).toBeTruthy();
    });

    const accountTypeSelect = screen.getByLabelText('Account Type');
    fireEvent.change(accountTypeSelect, { target: { value: 'smart' } });

    await waitFor(() => {
      expect(screen.getByLabelText('Provider')).toBeTruthy();
    });

    // Default is None -- API Key, Bundler URL, Paymaster URL should all be hidden
    expect(screen.queryByLabelText('API Key')).toBeNull();
    expect(screen.queryByLabelText('Bundler URL')).toBeNull();
    expect(screen.queryByLabelText('Paymaster URL (optional)')).toBeNull();
  });

  it('sends only accountType=smart (no aaProvider) when creating with None provider', async () => {
    (currentPath as unknown as { value: string }).value = '/wallets';

    vi.mocked(api.POST).mockResolvedValue({ data: {
      id: 'w-lite',
      name: 'lite-wallet',
      chain: 'ethereum',
      network: 'ethereum-sepolia',
      environment: 'testnet',
      publicKey: '0xlite',
      status: 'ACTIVE',
      accountType: 'smart',
    } } as never);

    render(<WalletsPage />);

    await waitFor(() => {
      expect(screen.getByText('Create Wallet')).toBeTruthy();
    });

    fireEvent.click(screen.getByText('Create Wallet'));

    const nameInput = screen.getByPlaceholderText('e.g. trading-bot');
    fireEvent.input(nameInput, { target: { value: 'lite-wallet' } });

    const chainSelect = screen.getByLabelText('Chain');
    fireEvent.change(chainSelect, { target: { value: 'ethereum' } });

    await waitFor(() => {
      expect(screen.getByLabelText('Account Type')).toBeTruthy();
    });

    const accountTypeSelect = screen.getByLabelText('Account Type');
    fireEvent.change(accountTypeSelect, { target: { value: 'smart' } });

    await waitFor(() => {
      expect(screen.getByLabelText('Provider')).toBeTruthy();
    });

    // Keep default None -- submit
    fireEvent.click(screen.getByText('Create'));

    await waitFor(() => {
      expect(api.POST).toHaveBeenCalled();
      const callArgs = vi.mocked(api.POST).mock.calls[0];
      const body = (callArgs[1] as any).body as Record<string, unknown>;
      expect(body.accountType).toBe('smart');
      // No aaProvider fields
      expect(body).not.toHaveProperty('aaProvider');
      expect(body).not.toHaveProperty('aaProviderApiKey');
      expect(body).not.toHaveProperty('aaBundlerUrl');
    });
  });

  it('shows Smart (Lite) badge in list for smart account without provider', async () => {
    const walletsWithLite = {
      items: [
        ...mockWallets.items,
        {
          id: 'w-lite',
          name: 'lite-wallet',
          chain: 'ethereum',
          network: 'ethereum-sepolia',
          environment: 'testnet',
          publicKey: '0xlite',
          status: 'ACTIVE',
          ownerAddress: null,
          ownerState: 'NONE',
          createdAt: 1700000000,
          accountType: 'smart',
          signerKey: '0xsigner2',
          deployed: false,
          provider: null,
        },
      ],
    };
    vi.mocked(api.GET).mockResolvedValue({ data: walletsWithLite } as never);
    (currentPath as unknown as { value: string }).value = '/wallets';
    render(<WalletsPage />);

    await waitFor(() => {
      expect(screen.getByText('Smart (Lite)')).toBeTruthy();
    });
  });

  it('shows Smart (Full) badge in list for smart account with provider', async () => {
    (currentPath as unknown as { value: string }).value = '/wallets';
    render(<WalletsPage />);

    await waitFor(() => {
      expect(screen.getByText('Smart (Full)')).toBeTruthy();
    });
  });

  it('shows Lite mode badge in detail page for smart account without provider', async () => {
    const liteWalletDetail = {
      ...mockSmartWalletDetail,
      id: 'w-lite',
      provider: null,
    };
    (currentPath as unknown as { value: string }).value = '/wallets/w-lite';

    vi.mocked(api.GET).mockImplementation(async (url: string) => {
      if (url.includes('/networks')) return { data: { availableNetworks: [] } } as never;
      if (url.includes('/balance')) return { data: { balances: [] } } as never;
      if (url.includes('/transactions')) return { data: { items: [], total: 0 } } as never;
      if (url.includes('/wc/session')) throw new Error('not found');
      if (url.includes('/staking')) return { data: { positions: [] } } as never;
      if (url.includes('/settings')) return { data: {} } as never;
      return { data: liteWalletDetail } as never;
    });

    render(<WalletsPage />);

    await waitFor(() => {
      expect(screen.getByText('Lite')).toBeTruthy();
    });

    // Check UserOp guidance text
    expect(screen.getByText('Use UserOp API for gas-sponsored transactions')).toBeTruthy();
  });

  it('shows Full mode badge in detail page for smart account with provider', async () => {
    (currentPath as unknown as { value: string }).value = '/wallets/w2';

    vi.mocked(api.GET).mockImplementation(async (url: string) => {
      if (url.includes('/networks')) return { data: { availableNetworks: [] } } as never;
      if (url.includes('/balance')) return { data: { balances: [] } } as never;
      if (url.includes('/transactions')) return { data: { items: [], total: 0 } } as never;
      if (url.includes('/wc/session')) throw new Error('not found');
      if (url.includes('/staking')) return { data: { positions: [] } } as never;
      return { data: mockSmartWalletDetail } as never;
    });

    render(<WalletsPage />);

    await waitFor(() => {
      expect(screen.getByText('Full')).toBeTruthy();
    });

    // No UserOp guidance text when Full mode
    expect(screen.queryByText('Use UserOp API for gas-sponsored transactions')).toBeNull();
  });

  it('sends aaProvider/aaBundlerUrl/aaPaymasterUrl fields when creating smart account with custom provider', async () => {
    (currentPath as unknown as { value: string }).value = '/wallets';

    vi.mocked(api.POST).mockResolvedValue({ data: {
      id: 'w4',
      name: 'test-smart-custom',
      chain: 'ethereum',
      network: 'ethereum-sepolia',
      environment: 'testnet',
      publicKey: '0xcustom',
      status: 'ACTIVE',
      accountType: 'smart',
    } } as never);

    render(<WalletsPage />);

    await waitFor(() => {
      expect(screen.getByText('Create Wallet')).toBeTruthy();
    });

    fireEvent.click(screen.getByText('Create Wallet'));

    // Fill name
    const nameInput = screen.getByPlaceholderText('e.g. trading-bot');
    fireEvent.input(nameInput, { target: { value: 'test-smart-custom' } });

    // Select ethereum chain
    const chainSelect = screen.getByLabelText('Chain');
    fireEvent.change(chainSelect, { target: { value: 'ethereum' } });

    await waitFor(() => {
      expect(screen.getByLabelText('Account Type')).toBeTruthy();
    });

    // Select smart account type
    const accountTypeSelect = screen.getByLabelText('Account Type');
    fireEvent.change(accountTypeSelect, { target: { value: 'smart' } });

    await waitFor(() => {
      expect(screen.getByLabelText('Provider')).toBeTruthy();
    });

    // Select custom provider
    const providerSelect = screen.getByLabelText('Provider');
    fireEvent.change(providerSelect, { target: { value: 'custom' } });

    await waitFor(() => {
      expect(screen.getByLabelText('Bundler URL')).toBeTruthy();
    });

    // Fill bundler URL and paymaster URL
    const bundlerInput = screen.getByLabelText('Bundler URL');
    fireEvent.input(bundlerInput, { target: { value: 'https://bundler.example.com' } });

    const paymasterInput = screen.getByLabelText('Paymaster URL (optional)');
    fireEvent.input(paymasterInput, { target: { value: 'https://paymaster.example.com' } });

    // Submit
    fireEvent.click(screen.getByText('Create'));

    await waitFor(() => {
      expect(api.POST).toHaveBeenCalled();
      const callArgs = vi.mocked(api.POST).mock.calls[0];
      const body = (callArgs[1] as any).body as Record<string, unknown>;
      // Must use aa-prefixed fields (not provider/bundlerUrl/paymasterUrl)
      expect(body.aaProvider).toBe('custom');
      expect(body.aaBundlerUrl).toBe('https://bundler.example.com');
      expect(body.aaPaymasterUrl).toBe('https://paymaster.example.com');
      expect(body.accountType).toBe('smart');
      expect(body).not.toHaveProperty('provider');
      expect(body).not.toHaveProperty('bundlerUrl');
      expect(body).not.toHaveProperty('paymasterUrl');
    });
  });
});
