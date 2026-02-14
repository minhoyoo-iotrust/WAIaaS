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

import { apiGet, apiPost, apiPut, apiDelete } from '../api/client';
import { currentPath } from '../components/layout';
import WalletsPage from '../pages/wallets';
import { chainNetworkOptions } from '../pages/wallets';

// Mirrored from @waiaas/core/src/enums/chain.ts — admin SPA can't import core directly.
// If core adds new networks, this test will NOT catch them automatically;
// but it WILL catch value typos (e.g. 'sepolia' instead of 'ethereum-sepolia').
const SOLANA_NETWORK_TYPES = ['mainnet', 'devnet', 'testnet'] as const;
const EVM_NETWORK_TYPES = [
  'ethereum-mainnet', 'ethereum-sepolia',
  'polygon-mainnet', 'polygon-amoy',
  'arbitrum-mainnet', 'arbitrum-sepolia',
  'optimism-mainnet', 'optimism-sepolia',
  'base-mainnet', 'base-sepolia',
] as const;
const NETWORK_TYPES = [...SOLANA_NETWORK_TYPES, ...EVM_NETWORK_TYPES] as const;

const mockWallets = {
  items: [
    {
      id: 'wallet-1',
      name: 'bot-alpha',
      chain: 'solana',
      network: 'devnet',
      environment: 'testnet',
      publicKey: 'abc123def456',
      status: 'ACTIVE',
      createdAt: 1707609600,
    },
    {
      id: 'wallet-2',
      name: 'bot-beta',
      chain: 'solana',
      network: 'devnet',
      environment: 'testnet',
      publicKey: 'xyz789uvw012',
      status: 'ACTIVE',
      createdAt: 1707609600,
    },
  ],
};

const mockWalletDetail = {
  ...mockWallets.items[0],
  defaultNetwork: 'devnet',
  ownerAddress: null,
  ownerVerified: null,
  ownerState: 'NONE' as const,
  updatedAt: null,
};

const mockNetworks = {
  networks: [
    { network: 'devnet', name: 'Devnet', isDefault: true },
    { network: 'testnet', name: 'Testnet', isDefault: false },
  ],
};

describe('WalletsPage', () => {
  beforeEach(() => {
    currentPath.value = '/wallets';
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('should render wallet list table', async () => {
    vi.mocked(apiGet).mockResolvedValue(mockWallets);

    render(<WalletsPage />);

    await waitFor(() => {
      expect(screen.getByText('bot-alpha')).toBeTruthy();
    });

    expect(screen.getByText('bot-beta')).toBeTruthy();
    expect(screen.getByText('Name')).toBeTruthy();
    expect(screen.getByText('Chain')).toBeTruthy();
    expect(screen.getByText('Environment')).toBeTruthy();
  });

  it('should show create form and call POST on submit', async () => {
    vi.mocked(apiGet).mockResolvedValue(mockWallets);
    vi.mocked(apiPost).mockResolvedValue({
      id: 'wallet-3',
      name: 'new-bot',
      chain: 'solana',
      network: 'devnet',
      environment: 'testnet',
      publicKey: 'newkey123',
      status: 'ACTIVE',
      createdAt: 1707609600,
    });

    render(<WalletsPage />);

    await waitFor(() => {
      expect(screen.getByText('bot-alpha')).toBeTruthy();
    });

    fireEvent.click(screen.getByText('Create Wallet'));

    const nameInput = screen.getByPlaceholderText('e.g. trading-bot');
    fireEvent.input(nameInput, { target: { value: 'new-bot' } });

    fireEvent.click(screen.getByText('Create'));

    await waitFor(() => {
      expect(vi.mocked(apiPost)).toHaveBeenCalledWith('/v1/wallets', {
        name: 'new-bot',
        chain: 'solana',
        environment: 'testnet',
      });
    });
  });

  it('should render wallet detail view', async () => {
    currentPath.value = '/wallets/wallet-1';
    vi.mocked(apiGet)
      .mockResolvedValueOnce(mockWalletDetail)
      .mockResolvedValueOnce(mockNetworks);

    render(<WalletsPage />);

    await waitFor(() => {
      expect(screen.getByText('bot-alpha')).toBeTruthy();
    });

    expect(screen.getByText('Chain')).toBeTruthy();
    expect(screen.getByText('Environment')).toBeTruthy();
    expect(screen.getByText('Default Network')).toBeTruthy();
    expect(screen.getByText('Owner State')).toBeTruthy();
    expect(screen.getByText('NONE')).toBeTruthy();
  });

  it('should edit wallet name', async () => {
    currentPath.value = '/wallets/wallet-1';
    vi.mocked(apiGet)
      .mockResolvedValueOnce(mockWalletDetail)
      .mockResolvedValueOnce(mockNetworks);
    vi.mocked(apiPut).mockResolvedValue({ ...mockWalletDetail, name: 'renamed-bot' });

    render(<WalletsPage />);

    await waitFor(() => {
      expect(screen.getByText('bot-alpha')).toBeTruthy();
    });

    // Click the edit button (pencil icon with title "Edit name")
    const editButton = screen.getByTitle('Edit name');
    fireEvent.click(editButton);

    // Find inline edit input and type new name
    const editInput = screen.getByDisplayValue('bot-alpha');
    fireEvent.input(editInput, { target: { value: 'renamed-bot' } });

    fireEvent.click(screen.getByText('Save'));

    await waitFor(() => {
      expect(vi.mocked(apiPut)).toHaveBeenCalledWith('/v1/wallets/wallet-1', {
        name: 'renamed-bot',
      });
    });
  });

  it('should delete wallet with confirmation modal', async () => {
    currentPath.value = '/wallets/wallet-1';
    vi.mocked(apiGet)
      .mockResolvedValueOnce(mockWalletDetail)
      .mockResolvedValueOnce(mockNetworks);
    vi.mocked(apiDelete).mockResolvedValue(undefined);

    render(<WalletsPage />);

    await waitFor(() => {
      expect(screen.getByText('bot-alpha')).toBeTruthy();
    });

    fireEvent.click(screen.getByText('Terminate Wallet'));

    await waitFor(() => {
      expect(
        screen.getByText(/Are you sure you want to terminate wallet/),
      ).toBeTruthy();
    });

    fireEvent.click(screen.getByText('Terminate'));

    await waitFor(() => {
      expect(vi.mocked(apiDelete)).toHaveBeenCalledWith('/v1/wallets/wallet-1');
    });
  });
});

describe('chainNetworkOptions', () => {
  it('all Solana option values are valid SOLANA_NETWORK_TYPES', () => {
    const options = chainNetworkOptions('solana');
    for (const opt of options) {
      expect(SOLANA_NETWORK_TYPES as readonly string[]).toContain(opt.value);
    }
  });

  it('all EVM option values are valid EVM_NETWORK_TYPES', () => {
    const options = chainNetworkOptions('ethereum');
    for (const opt of options) {
      expect(EVM_NETWORK_TYPES as readonly string[]).toContain(opt.value);
    }
  });

  it('all option values are valid NETWORK_TYPES', () => {
    for (const chain of ['solana', 'ethereum']) {
      const options = chainNetworkOptions(chain);
      for (const opt of options) {
        expect(NETWORK_TYPES as readonly string[]).toContain(opt.value);
      }
    }
  });

  it('EVM options cover all 10 EVM_NETWORK_TYPES', () => {
    const options = chainNetworkOptions('ethereum');
    const values = options.map((o) => o.value);
    for (const net of EVM_NETWORK_TYPES) {
      expect(values).toContain(net);
    }
  });

  it('EVM options include ethereum-sepolia and ethereum-mainnet', () => {
    const options = chainNetworkOptions('ethereum');
    const values = options.map((o) => o.value);
    expect(values).toContain('ethereum-sepolia');
    expect(values).toContain('ethereum-mainnet');
  });
});
