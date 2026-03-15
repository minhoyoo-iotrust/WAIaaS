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
import { chainNetworkOptions } from '../pages/wallets';

// Mirrored from @waiaas/core/src/enums/chain.ts — admin SPA can't import core directly.
// If core adds new networks, this test will NOT catch them automatically;
// but it WILL catch value typos (e.g. 'sepolia' instead of 'ethereum-sepolia').
const SOLANA_NETWORK_TYPES = ['solana-mainnet', 'solana-devnet', 'solana-testnet'] as const;
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
      network: 'solana-devnet',
      environment: 'testnet',
      publicKey: 'abc123def456',
      status: 'ACTIVE',
      createdAt: 1707609600,
    },
    {
      id: 'wallet-2',
      name: 'bot-beta',
      chain: 'solana',
      network: 'solana-devnet',
      environment: 'testnet',
      publicKey: 'xyz789uvw012',
      status: 'ACTIVE',
      createdAt: 1707609600,
    },
  ],
};

const mockWalletDetail = {
  ...mockWallets.items[0],
  ownerAddress: null,
  ownerVerified: null,
  ownerState: 'NONE' as const,
  updatedAt: null,
};

const mockNetworks = {
  networks: [
    { network: 'solana-devnet', name: 'Devnet' },
    { network: 'solana-testnet', name: 'Testnet' },
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
    vi.mocked(api.GET).mockImplementation((path: string) => {
      if (path === '/v1/wallets') return Promise.resolve({ data: mockWallets });
      return Promise.resolve({ data: {} });
    });

    render(<WalletsPage />);

    await waitFor(() => {
      expect(screen.getByText('bot-alpha')).toBeTruthy();
    });

    expect(screen.getByText('bot-beta')).toBeTruthy();
    expect(screen.getByText('Name')).toBeTruthy();
    // Chain/Environment appear in both FilterBar labels and table headers
    expect(screen.getAllByText('Chain').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Environment').length).toBeGreaterThanOrEqual(1);
  });

  it('should show create form and call POST on submit', async () => {
    vi.mocked(api.GET).mockImplementation((path: string) => {
      if (path === '/v1/wallets') return Promise.resolve({ data: mockWallets });
      return Promise.resolve({ data: {} });
    });
    vi.mocked(api.POST).mockResolvedValue({ data: {
      id: 'wallet-3',
      name: 'new-bot',
      chain: 'solana',
      network: 'solana-devnet',
      environment: 'testnet',
      publicKey: 'newkey123',
      status: 'ACTIVE',
      createdAt: 1707609600,
    } });

    render(<WalletsPage />);

    await waitFor(() => {
      expect(screen.getByText('bot-alpha')).toBeTruthy();
    });

    fireEvent.click(screen.getByText('Create Wallet'));

    const nameInput = screen.getByPlaceholderText('e.g. trading-bot');
    fireEvent.input(nameInput, { target: { value: 'new-bot' } });

    fireEvent.click(screen.getByText('Create'));

    await waitFor(() => {
      expect(vi.mocked(api.POST)).toHaveBeenCalledWith('/v1/wallets', expect.objectContaining({
        body: expect.objectContaining({
          name: 'new-bot',
          chain: 'solana',
          environment: 'testnet',
        }),
      }));
    });
  });

  it('should render wallet detail view with tabs', async () => {
    currentPath.value = '/wallets/wallet-1';
    vi.mocked(api.GET).mockImplementation((path: string) => {
      if (path === '/v1/wallets/{id}') return Promise.resolve({ data: mockWalletDetail });
      if (path.includes('/networks')) return Promise.resolve({ data: { availableNetworks: mockNetworks.networks } });
      if (path.includes('/balance')) return Promise.resolve({ data: { balances: [] } });
      if (path.includes('/transactions')) return Promise.resolve({ data: { items: [], total: 0 } });
      if (path.includes('/wc/session')) return Promise.reject(new Error('no session'));
      if (path.includes('/settings')) return Promise.resolve({ data: {} });
      return Promise.resolve({ data: {} });
    });

    render(<WalletsPage />);

    await waitFor(() => {
      expect(screen.getByText('bot-alpha')).toBeTruthy();
    });

    // Overview tab is active by default and shows wallet info
    expect(screen.getByText('Chain')).toBeTruthy();
    expect(screen.getByText('Environment')).toBeTruthy();
    // Tab buttons should be visible (4-tab structure)
    expect(screen.getByText('Overview')).toBeTruthy();
    expect(screen.getByText('Activity')).toBeTruthy();
    expect(screen.getByText('Assets')).toBeTruthy();
    expect(screen.getByText('Setup')).toBeTruthy();
    // Owner Protection card visible in Overview tab
    expect(screen.getByText('Owner Protection')).toBeTruthy();
  });

  it('should edit wallet name', async () => {
    currentPath.value = '/wallets/wallet-1';
    vi.mocked(api.GET).mockImplementation((path: string) => {
      if (path === '/v1/wallets/{id}') return Promise.resolve({ data: mockWalletDetail });
      if (path.includes('/networks')) return Promise.resolve({ data: { availableNetworks: mockNetworks.networks } });
      if (path.includes('/balance')) return Promise.resolve({ data: { balances: [] } });
      if (path.includes('/transactions')) return Promise.resolve({ data: { items: [], total: 0 } });
      if (path.includes('/wc/session')) return Promise.reject(new Error('no session'));
      if (path.includes('/settings')) return Promise.resolve({ data: {} });
      return Promise.resolve({ data: {} });
    });
    vi.mocked(api.PUT).mockResolvedValue({ data: { ...mockWalletDetail, name: 'renamed-bot' } });

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
      expect(vi.mocked(api.PUT)).toHaveBeenCalledWith('/v1/wallets/{id}', expect.objectContaining({
        body: { name: 'renamed-bot' },
      }));
    });
  });

  it('should delete wallet with confirmation modal', async () => {
    currentPath.value = '/wallets/wallet-1';
    vi.mocked(api.GET).mockImplementation((path: string) => {
      if (path === '/v1/wallets/{id}') return Promise.resolve({ data: mockWalletDetail });
      if (path.includes('/networks')) return Promise.resolve({ data: { availableNetworks: mockNetworks.networks } });
      if (path.includes('/balance')) return Promise.resolve({ data: { balances: [] } });
      if (path.includes('/transactions')) return Promise.resolve({ data: { items: [], total: 0 } });
      if (path.includes('/wc/session')) return Promise.reject(new Error('no session'));
      if (path.includes('/settings')) return Promise.resolve({ data: {} });
      return Promise.resolve({ data: {} });
    });
    vi.mocked(api.DELETE).mockResolvedValue({ data: undefined });

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
      expect(vi.mocked(api.DELETE)).toHaveBeenCalledWith('/v1/wallets/{id}', expect.objectContaining({
        params: { path: { id: 'wallet-1' } },
      }));
    });
  });
});

const mockWalletsExtended = {
  items: [
    {
      id: 'wallet-1',
      name: 'bot-alpha',
      chain: 'solana',
      network: 'solana-devnet',
      environment: 'testnet',
      publicKey: 'abc123def456',
      status: 'ACTIVE',
      ownerState: 'NONE',
      createdAt: 1707609600,
    },
    {
      id: 'wallet-2',
      name: 'bot-beta',
      chain: 'ethereum',
      network: 'ethereum-sepolia',
      environment: 'mainnet',
      publicKey: 'xyz789uvw012',
      status: 'SUSPENDED',
      ownerState: 'NONE',
      createdAt: 1707609600,
    },
    {
      id: 'wallet-3',
      name: 'trade-gamma',
      chain: 'solana',
      network: 'solana-devnet',
      environment: 'testnet',
      publicKey: 'pqr456mno789',
      status: 'ACTIVE',
      ownerState: 'NONE',
      createdAt: 1707609600,
    },
  ],
};

describe('WalletListContent - search and filter', () => {
  beforeEach(() => {
    currentPath.value = '/wallets';
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('should filter wallets by search text (name)', async () => {
    vi.mocked(api.GET).mockImplementation((path: string) => {
      if (path === '/v1/wallets') return Promise.resolve({ data: mockWalletsExtended });
      return Promise.resolve({ data: {} });
    });

    render(<WalletsPage />);

    await waitFor(() => {
      expect(screen.getByText('bot-alpha')).toBeTruthy();
      expect(screen.getByText('bot-beta')).toBeTruthy();
      expect(screen.getByText('trade-gamma')).toBeTruthy();
    });

    // Type in the search input -- SearchInput uses debounce, so we trigger onSearch directly
    const searchInput = screen.getByPlaceholderText('Search by name or public key...');
    // SearchInput fires onSearch via debounce; simulate by firing input + wait
    fireEvent.input(searchInput, { target: { value: 'alpha' } });

    // Wait for debounced search callback
    await waitFor(
      () => {
        expect(screen.getByText('bot-alpha')).toBeTruthy();
        expect(screen.queryByText('bot-beta')).toBeNull();
        expect(screen.queryByText('trade-gamma')).toBeNull();
      },
      { timeout: 1000 },
    );
  });

  it('should render FilterBar with chain, environment, and status dropdowns', async () => {
    vi.mocked(api.GET).mockImplementation((path: string) => {
      if (path === '/v1/wallets') return Promise.resolve({ data: mockWalletsExtended });
      return Promise.resolve({ data: {} });
    });

    render(<WalletsPage />);

    await waitFor(() => {
      expect(screen.getByText('bot-alpha')).toBeTruthy();
    });

    // FilterBar renders labels for each filter field (also in table headers, so use getAllByText)
    expect(screen.getAllByText('Chain').length).toBeGreaterThanOrEqual(2); // label + th
    expect(screen.getAllByText('Environment').length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText('Status').length).toBeGreaterThanOrEqual(2);
    // The Clear button from FilterBar
    expect(screen.getByText('Clear')).toBeTruthy();
    // Search input is present
    expect(screen.getByPlaceholderText('Search by name or public key...')).toBeTruthy();
  });

  it('should filter wallets by chain dropdown', async () => {
    vi.mocked(api.GET).mockImplementation((path: string) => {
      if (path === '/v1/wallets') return Promise.resolve({ data: mockWalletsExtended });
      return Promise.resolve({ data: {} });
    });

    render(<WalletsPage />);

    await waitFor(() => {
      expect(screen.getByText('bot-alpha')).toBeTruthy();
    });

    // Find the Chain dropdown (FilterBar renders <select> elements)
    const selects = document.querySelectorAll('.filter-bar select');
    // First select is 'chain'
    const chainSelect = selects[0] as HTMLSelectElement;
    fireEvent.change(chainSelect, { target: { value: 'ethereum' } });

    await waitFor(() => {
      // bot-beta is ethereum, bot-alpha and trade-gamma are solana
      expect(screen.getByText('bot-beta')).toBeTruthy();
      expect(screen.queryByText('bot-alpha')).toBeNull();
      expect(screen.queryByText('trade-gamma')).toBeNull();
    });
  });
});

describe('WalletListContent - Smart Account type column', () => {
  beforeEach(() => {
    currentPath.value = '/wallets';
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  const SOLADY_FACTORY = '0x5d82735936c6Cd5DE57cC3c1A799f6B2E6F933Df';

  const mockWalletsWithSmartAccounts = {
    items: [
      {
        id: 'wallet-eoa',
        name: 'eoa-wallet',
        chain: 'evm',
        network: 'ethereum-sepolia',
        environment: 'testnet',
        publicKey: '0xeoa123',
        status: 'ACTIVE',
        createdAt: 1707609600,
        accountType: 'eoa',
      },
      {
        id: 'wallet-smart-deprecated',
        name: 'deprecated-sa',
        chain: 'evm',
        network: 'ethereum-sepolia',
        environment: 'testnet',
        publicKey: '0xdeprecated123',
        status: 'ACTIVE',
        createdAt: 1707609600,
        accountType: 'smart',
        factoryAddress: SOLADY_FACTORY,
        provider: null,
      },
      {
        id: 'wallet-smart-full',
        name: 'full-sa',
        chain: 'evm',
        network: 'ethereum-sepolia',
        environment: 'testnet',
        publicKey: '0xfull123',
        status: 'ACTIVE',
        createdAt: 1707609600,
        accountType: 'smart',
        factoryAddress: '0x1234567890abcdef1234567890abcdef12345678',
        provider: 'pimlico',
      },
      {
        id: 'wallet-smart-lite',
        name: 'lite-sa',
        chain: 'evm',
        network: 'ethereum-sepolia',
        environment: 'testnet',
        publicKey: '0xlite123',
        status: 'ACTIVE',
        createdAt: 1707609600,
        accountType: 'smart',
        factoryAddress: '0xabcdef1234567890abcdef1234567890abcdef12',
        provider: null,
      },
    ],
  };

  it('shows Deprecated badge for Smart Account with Solady factory in list', async () => {
    vi.mocked(api.GET).mockImplementation((path: string) => {
      if (path === '/v1/wallets') return Promise.resolve({ data: mockWalletsWithSmartAccounts });
      return Promise.resolve({ data: {} });
    });

    render(<WalletsPage />);

    await waitFor(() => {
      expect(screen.getByText('deprecated-sa')).toBeTruthy();
    });

    expect(screen.getByText('Deprecated')).toBeTruthy();
  });

  it('shows Smart (Full) badge for Smart Account with provider', async () => {
    vi.mocked(api.GET).mockImplementation((path: string) => {
      if (path === '/v1/wallets') return Promise.resolve({ data: mockWalletsWithSmartAccounts });
      return Promise.resolve({ data: {} });
    });

    render(<WalletsPage />);

    await waitFor(() => {
      expect(screen.getByText('full-sa')).toBeTruthy();
    });

    expect(screen.getByText('Smart (Full)')).toBeTruthy();
  });

  it('shows Smart (Lite) badge for Smart Account without provider', async () => {
    vi.mocked(api.GET).mockImplementation((path: string) => {
      if (path === '/v1/wallets') return Promise.resolve({ data: mockWalletsWithSmartAccounts });
      return Promise.resolve({ data: {} });
    });

    render(<WalletsPage />);

    await waitFor(() => {
      expect(screen.getByText('lite-sa')).toBeTruthy();
    });

    expect(screen.getByText('Smart (Lite)')).toBeTruthy();
  });

  it('shows EOA badge for non-smart accounts', async () => {
    vi.mocked(api.GET).mockImplementation((path: string) => {
      if (path === '/v1/wallets') return Promise.resolve({ data: mockWalletsWithSmartAccounts });
      return Promise.resolve({ data: {} });
    });

    render(<WalletsPage />);

    await waitFor(() => {
      expect(screen.getByText('eoa-wallet')).toBeTruthy();
    });

    // EOA badges - there should be at least one
    const eoaBadges = screen.getAllByText('EOA');
    expect(eoaBadges.length).toBeGreaterThanOrEqual(1);
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

// ---------------------------------------------------------------------------
// WalletDetailView - 4-tab structure tests
// ---------------------------------------------------------------------------

const mockDetailForTabs = {
  id: 'test-wallet-id',
  name: 'test-wallet',
  chain: 'solana',
  network: 'solana-devnet',
  environment: 'testnet',
  publicKey: 'abc123def456',
  status: 'ACTIVE',
  ownerAddress: null,
  ownerVerified: null,
  ownerState: 'NONE' as const,
  approvalMethod: null,
  suspendedAt: null,
  suspensionReason: null,
  createdAt: 1707609600,
  updatedAt: null,
};

const mockTxItems = [
  {
    id: 'tx-1',
    type: 'TRANSFER',
    status: 'CONFIRMED',
    toAddress: '0xabc123456789def012345678',
    amount: '1.5',
    network: 'solana-devnet',
    txHash: '5xYz7890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234',
    createdAt: 1707609600,
  },
  {
    id: 'tx-2',
    type: 'TOKEN_TRANSFER',
    status: 'PENDING',
    toAddress: '0xdef456789012abc345678901',
    amount: '100',
    network: 'solana-devnet',
    txHash: null,
    createdAt: 1707609500,
  },
];

function mockDetailApiGet(overrides?: {
  transactions?: { items: typeof mockTxItems; total: number };
  balance?: { balances: Array<{ network: string; native: { balance: string; symbol: string; usd?: number | null } | null; tokens: never[]; error?: string }> };
}) {
  return (path: string) => {
    if (path === '/v1/wallets/{id}') return Promise.resolve({ data: mockDetailForTabs });
    if (path.includes('/networks')) return Promise.resolve({ data: { availableNetworks: [{ network: 'solana-devnet' }] } });
    if (path.includes('/balance')) return Promise.resolve({ data: overrides?.balance ?? { balances: [] } });
    if (path.includes('/transactions')) return Promise.resolve({ data: overrides?.transactions ?? { items: [], total: 0 } });
    if (path.includes('/wc/session')) return Promise.reject(new Error('no session'));
    if (path.includes('/settings')) return Promise.resolve({ data: {} });
    return Promise.resolve({ data: {} });
  };
}

describe('WalletDetailView - 4-tab structure', () => {
  beforeEach(() => {
    currentPath.value = '/wallets/test-wallet-id';
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('should render all 4 tab buttons', async () => {
    vi.mocked(api.GET).mockImplementation(mockDetailApiGet());

    render(<WalletsPage />);

    await waitFor(() => {
      expect(screen.getByText('test-wallet')).toBeTruthy();
    });

    expect(screen.getByText('Overview')).toBeTruthy();
    expect(screen.getByText('Activity')).toBeTruthy();
    expect(screen.getByText('Assets')).toBeTruthy();
    expect(screen.getByText('Setup')).toBeTruthy();
  });

  it('should switch tabs and show correct content', async () => {
    vi.mocked(api.GET).mockImplementation(mockDetailApiGet({
      transactions: { items: mockTxItems, total: 2 },
    }));

    render(<WalletsPage />);

    await waitFor(() => {
      expect(screen.getByText('test-wallet')).toBeTruthy();
    });

    // Default tab is Overview - should show Balances heading + Owner Protection card
    expect(screen.getByText('Balances')).toBeTruthy();
    expect(screen.getByText('Owner Protection')).toBeTruthy();

    // Click Activity tab
    const activityBtns = screen.getAllByText('Activity');
    fireEvent.click(activityBtns[0]!);

    await waitFor(() => {
      // Tab button + content both show "Activity"
      expect(screen.getAllByText('Activity').length).toBeGreaterThanOrEqual(2);
    });

    // Click Setup tab
    const setupBtns = screen.getAllByText('Setup');
    fireEvent.click(setupBtns[0]!);

    await waitFor(() => {
      // Tab button + content both show "Setup"
      expect(screen.getAllByText('Setup').length).toBeGreaterThanOrEqual(2);
    });
  });

  it('should switch to Activity tab', async () => {
    vi.mocked(api.GET).mockImplementation(mockDetailApiGet({
      transactions: { items: mockTxItems, total: 25 },
    }));

    render(<WalletsPage />);

    await waitFor(() => {
      expect(screen.getByText('test-wallet')).toBeTruthy();
    });

    // Switch to Activity tab (replaces old Transactions tab)
    const activityBtns = screen.getAllByText('Activity');
    fireEvent.click(activityBtns[0]!);

    await waitFor(() => {
      // Activity tab button + content both render
      expect(screen.getAllByText('Activity').length).toBeGreaterThanOrEqual(2);
    });
  });

  it('should display USD value next to native balance', async () => {
    vi.mocked(api.GET).mockImplementation(mockDetailApiGet({
      balance: {
        balances: [{
          network: 'solana-devnet',
          native: { balance: '1.5', symbol: 'SOL', usd: 750.0 },
          tokens: [],
        }],
      },
    }));

    render(<WalletsPage />);

    await waitFor(() => {
      expect(screen.getByText('test-wallet')).toBeTruthy();
    });

    // Overview tab is default - balance should show USD
    await waitFor(() => {
      expect(screen.getByText(/1\.5 SOL/)).toBeTruthy();
      // USD should be displayed formatted
      expect(screen.getByText(/\$750\.00/)).toBeTruthy();
    });
  });

  it('should have a Refresh button in balance section', async () => {
    vi.mocked(api.GET).mockImplementation(mockDetailApiGet({
      balance: {
        balances: [{
          network: 'solana-devnet',
          native: { balance: '1.5', symbol: 'SOL' },
          tokens: [],
        }],
      },
    }));

    render(<WalletsPage />);

    await waitFor(() => {
      expect(screen.getByText('test-wallet')).toBeTruthy();
    });

    // Refresh button should exist
    await waitFor(() => {
      expect(screen.getByText('Refresh')).toBeTruthy();
    });

    // Click Refresh - should re-fetch balance
    const callCountBefore = vi.mocked(api.GET).mock.calls.filter(
      ([p]) => typeof p === 'string' && p.includes('/balance'),
    ).length;

    fireEvent.click(screen.getByText('Refresh'));

    await waitFor(() => {
      const callCountAfter = vi.mocked(api.GET).mock.calls.filter(
        ([p]) => typeof p === 'string' && p.includes('/balance'),
      ).length;
      expect(callCountAfter).toBeGreaterThan(callCountBefore);
    });
  });
});
