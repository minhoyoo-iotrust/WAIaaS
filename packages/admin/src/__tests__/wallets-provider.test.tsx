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

import { apiGet, apiPost, apiPut } from '../api/client';
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
    vi.mocked(apiGet).mockResolvedValue(mockWallets as never);
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('shows provider fields when accountType is smart', async () => {
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

    // Default is pimlico - check dashboard link
    expect(screen.getByText('Pimlico Dashboard')).toBeTruthy();

    // Switch to alchemy
    const providerSelect = screen.getByLabelText('Provider');
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

    vi.mocked(apiGet).mockImplementation(async (url: string) => {
      if (url.includes('/networks')) return { networks: [] } as never;
      if (url.includes('/balance')) return { balances: [] } as never;
      if (url.includes('/transactions')) return { items: [], total: 0 } as never;
      if (url.includes('/wc/session')) throw new Error('not found');
      if (url.includes('/staking')) return { positions: [] } as never;
      return mockSmartWalletDetail as never;
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

    vi.mocked(apiGet).mockImplementation(async (url: string) => {
      if (url.includes('/networks')) return { networks: [] } as never;
      if (url.includes('/balance')) return { balances: [] } as never;
      if (url.includes('/transactions')) return { items: [], total: 0 } as never;
      if (url.includes('/wc/session')) throw new Error('not found');
      if (url.includes('/staking')) return { positions: [] } as never;
      return mockSmartWalletDetail as never;
    });

    vi.mocked(apiPut).mockResolvedValue({
      provider: { name: 'alchemy', supportedChains: ['ethereum-mainnet'], paymasterEnabled: true },
    } as never);

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
      expect(apiPut).toHaveBeenCalledWith('/v1/wallets/w2/provider', {
        provider: 'alchemy',
        apiKey: 'test-alchemy-key',
      });
    });
  });

  it('sends aaProvider/aaProviderApiKey fields when creating smart account with pimlico', async () => {
    (currentPath as unknown as { value: string }).value = '/wallets';

    vi.mocked(apiPost).mockResolvedValue({
      id: 'w3',
      name: 'test-smart-new',
      chain: 'ethereum',
      network: 'ethereum-sepolia',
      environment: 'testnet',
      publicKey: '0xnew',
      status: 'ACTIVE',
      accountType: 'smart',
    } as never);

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

    // Fill API key
    const apiKeyInput = screen.getByLabelText('API Key');
    fireEvent.input(apiKeyInput, { target: { value: 'pimlico-key-123' } });

    // Submit
    fireEvent.click(screen.getByText('Create'));

    await waitFor(() => {
      expect(apiPost).toHaveBeenCalled();
      const callArgs = vi.mocked(apiPost).mock.calls[0];
      const body = callArgs[1] as Record<string, unknown>;
      // Must use aaProvider/aaProviderApiKey (not provider/apiKey)
      expect(body.aaProvider).toBe('pimlico');
      expect(body.aaProviderApiKey).toBe('pimlico-key-123');
      expect(body.accountType).toBe('smart');
      expect(body).not.toHaveProperty('provider');
      expect(body).not.toHaveProperty('apiKey');
    });
  });

  it('sends aaProvider/aaBundlerUrl/aaPaymasterUrl fields when creating smart account with custom provider', async () => {
    (currentPath as unknown as { value: string }).value = '/wallets';

    vi.mocked(apiPost).mockResolvedValue({
      id: 'w4',
      name: 'test-smart-custom',
      chain: 'ethereum',
      network: 'ethereum-sepolia',
      environment: 'testnet',
      publicKey: '0xcustom',
      status: 'ACTIVE',
      accountType: 'smart',
    } as never);

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
      expect(apiPost).toHaveBeenCalled();
      const callArgs = vi.mocked(apiPost).mock.calls[0];
      const body = callArgs[1] as Record<string, unknown>;
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
