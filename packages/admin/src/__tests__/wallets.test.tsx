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
    { network: 'devnet', name: 'Devnet' },
    { network: 'testnet', name: 'Testnet' },
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
    vi.mocked(apiGet).mockImplementation((path: string) => {
      if (path === '/v1/wallets') return Promise.resolve(mockWallets);
      if (path.includes('/balance')) return Promise.resolve({ balances: [] });
      return Promise.resolve({});
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
    vi.mocked(apiGet).mockImplementation((path: string) => {
      if (path === '/v1/wallets') return Promise.resolve(mockWallets);
      if (path.includes('/balance')) return Promise.resolve({ balances: [] });
      return Promise.resolve({});
    });
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

  it('should render wallet detail view with tabs', async () => {
    currentPath.value = '/wallets/wallet-1';
    vi.mocked(apiGet).mockImplementation((path: string) => {
      if (path === '/v1/wallets/wallet-1') return Promise.resolve(mockWalletDetail);
      if (path.includes('/networks')) return Promise.resolve(mockNetworks);
      if (path.includes('/balance')) return Promise.resolve({ balances: [] });
      if (path.includes('/transactions')) return Promise.resolve({ items: [], total: 0 });
      if (path.includes('/wc/session')) return Promise.reject(new Error('no session'));
      if (path.includes('/settings')) return Promise.resolve({});
      return Promise.resolve({});
    });

    render(<WalletsPage />);

    await waitFor(() => {
      expect(screen.getByText('bot-alpha')).toBeTruthy();
    });

    // Overview tab is active by default and shows wallet info
    expect(screen.getByText('Chain')).toBeTruthy();
    expect(screen.getByText('Environment')).toBeTruthy();
    expect(screen.getByText('Default Network')).toBeTruthy();

    // Tab buttons should be visible
    expect(screen.getByText('Overview')).toBeTruthy();
    expect(screen.getByText('Transactions')).toBeTruthy();
    expect(screen.getByText('Owner')).toBeTruthy();
    expect(screen.getByText('MCP')).toBeTruthy();
  });

  it('should edit wallet name', async () => {
    currentPath.value = '/wallets/wallet-1';
    vi.mocked(apiGet).mockImplementation((path: string) => {
      if (path === '/v1/wallets/wallet-1') return Promise.resolve(mockWalletDetail);
      if (path.includes('/networks')) return Promise.resolve(mockNetworks);
      if (path.includes('/balance')) return Promise.resolve({ balances: [] });
      if (path.includes('/transactions')) return Promise.resolve({ items: [], total: 0 });
      if (path.includes('/wc/session')) return Promise.reject(new Error('no session'));
      if (path.includes('/settings')) return Promise.resolve({});
      return Promise.resolve({});
    });
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
    vi.mocked(apiGet).mockImplementation((path: string) => {
      if (path === '/v1/wallets/wallet-1') return Promise.resolve(mockWalletDetail);
      if (path.includes('/networks')) return Promise.resolve(mockNetworks);
      if (path.includes('/balance')) return Promise.resolve({ balances: [] });
      if (path.includes('/transactions')) return Promise.resolve({ items: [], total: 0 });
      if (path.includes('/wc/session')) return Promise.reject(new Error('no session'));
      if (path.includes('/settings')) return Promise.resolve({});
      return Promise.resolve({});
    });
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

const mockWalletsExtended = {
  items: [
    {
      id: 'wallet-1',
      name: 'bot-alpha',
      chain: 'solana',
      network: 'devnet',
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
      network: 'devnet',
      environment: 'testnet',
      publicKey: 'pqr456mno789',
      status: 'ACTIVE',
      ownerState: 'NONE',
      createdAt: 1707609600,
    },
  ],
};

const mockBalanceWallet1 = {
  balances: [
    {
      network: 'devnet',
      native: { balance: '1.5', symbol: 'SOL' },
      tokens: [],
    },
  ],
};

const mockBalanceWallet2 = {
  balances: [
    {
      network: 'ethereum-sepolia',
      native: { balance: '0.25', symbol: 'ETH' },
      tokens: [],
    },
  ],
};

describe('WalletListContent - search, filter, balance', () => {
  beforeEach(() => {
    currentPath.value = '/wallets';
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('should filter wallets by search text (name)', async () => {
    vi.mocked(apiGet).mockImplementation((path: string) => {
      if (path === '/v1/wallets') return Promise.resolve(mockWalletsExtended);
      if (path.includes('/balance')) return Promise.resolve({ balances: [] });
      return Promise.resolve({});
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
    vi.mocked(apiGet).mockImplementation((path: string) => {
      if (path === '/v1/wallets') return Promise.resolve(mockWalletsExtended);
      if (path.includes('/balance')) return Promise.resolve({ balances: [] });
      return Promise.resolve({});
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

  it('should display balance column with native balance', async () => {
    vi.mocked(apiGet).mockImplementation((path: string) => {
      if (path === '/v1/wallets') return Promise.resolve(mockWalletsExtended);
      if (path === '/v1/admin/wallets/wallet-1/balance') return Promise.resolve(mockBalanceWallet1);
      if (path === '/v1/admin/wallets/wallet-2/balance') return Promise.resolve(mockBalanceWallet2);
      if (path.includes('/balance')) return Promise.resolve({ balances: [] });
      return Promise.resolve({});
    });

    render(<WalletsPage />);

    // Wait for wallets and balances to load
    await waitFor(() => {
      expect(screen.getByText('bot-alpha')).toBeTruthy();
    });

    // Balance column header
    expect(screen.getByText('Balance')).toBeTruthy();

    // Wait for balance values to appear
    await waitFor(() => {
      expect(screen.getByText(/1\.5/)).toBeTruthy();
      expect(screen.getByText(/SOL/)).toBeTruthy();
    });

    await waitFor(() => {
      expect(screen.getByText(/0\.25/)).toBeTruthy();
      expect(screen.getByText(/ETH/)).toBeTruthy();
    });
  });

  it('should show loading state for balance column', async () => {
    // apiGet for wallets resolves immediately, but balance never resolves
    let resolveBalances: () => void;
    const balancePromise = new Promise<{ balances: never[] }>((resolve) => {
      resolveBalances = () => resolve({ balances: [] });
    });

    vi.mocked(apiGet).mockImplementation((path: string) => {
      if (path === '/v1/wallets') return Promise.resolve(mockWalletsExtended);
      if (path.includes('/balance')) return balancePromise;
      return Promise.resolve({});
    });

    render(<WalletsPage />);

    await waitFor(() => {
      expect(screen.getByText('bot-alpha')).toBeTruthy();
    });

    // Balance cells should show "Loading..." while fetching
    const loadingCells = screen.getAllByText('Loading...');
    expect(loadingCells.length).toBeGreaterThan(0);

    // Resolve balances to prevent hanging
    resolveBalances!();
  });

  it('should filter wallets by chain dropdown', async () => {
    vi.mocked(apiGet).mockImplementation((path: string) => {
      if (path === '/v1/wallets') return Promise.resolve(mockWalletsExtended);
      if (path.includes('/balance')) return Promise.resolve({ balances: [] });
      return Promise.resolve({});
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
  network: 'devnet',
  environment: 'testnet',
  publicKey: 'abc123def456',
  status: 'ACTIVE',
  defaultNetwork: 'devnet',
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
    network: 'devnet',
    txHash: '5xYz7890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234',
    createdAt: 1707609600,
  },
  {
    id: 'tx-2',
    type: 'TOKEN_TRANSFER',
    status: 'PENDING',
    toAddress: '0xdef456789012abc345678901',
    amount: '100',
    network: 'devnet',
    txHash: null,
    createdAt: 1707609500,
  },
];

function mockDetailApiGet(overrides?: {
  transactions?: { items: typeof mockTxItems; total: number };
  balance?: { balances: Array<{ network: string; native: { balance: string; symbol: string; usd?: number | null } | null; tokens: never[]; error?: string }> };
}) {
  return (path: string) => {
    if (path === '/v1/wallets/test-wallet-id') return Promise.resolve(mockDetailForTabs);
    if (path.includes('/networks')) return Promise.resolve({ availableNetworks: [{ network: 'devnet', name: 'Devnet' }] });
    if (path.includes('/balance')) return Promise.resolve(overrides?.balance ?? { balances: [] });
    if (path.includes('/transactions')) return Promise.resolve(overrides?.transactions ?? { items: [], total: 0 });
    if (path.includes('/wc/session')) return Promise.reject(new Error('no session'));
    if (path.includes('/settings')) return Promise.resolve({});
    return Promise.resolve({});
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
    vi.mocked(apiGet).mockImplementation(mockDetailApiGet());

    render(<WalletsPage />);

    await waitFor(() => {
      expect(screen.getByText('test-wallet')).toBeTruthy();
    });

    expect(screen.getByText('Overview')).toBeTruthy();
    expect(screen.getByText('Transactions')).toBeTruthy();
    expect(screen.getByText('Owner')).toBeTruthy();
    expect(screen.getByText('MCP')).toBeTruthy();
  });

  it('should switch tabs and show correct content', async () => {
    vi.mocked(apiGet).mockImplementation(mockDetailApiGet({
      transactions: { items: mockTxItems, total: 2 },
    }));

    render(<WalletsPage />);

    await waitFor(() => {
      expect(screen.getByText('test-wallet')).toBeTruthy();
    });

    // Default tab is Overview - should show Balances heading
    expect(screen.getByText('Balances')).toBeTruthy();

    // Click Transactions tab
    fireEvent.click(screen.getByText('Transactions'));

    await waitFor(() => {
      // Transactions tab should show a table with Tx Hash column header
      expect(screen.getByText('Tx Hash')).toBeTruthy();
    });

    // Click Owner tab
    fireEvent.click(screen.getByText('Owner'));

    await waitFor(() => {
      expect(screen.getByText('Owner Wallet')).toBeTruthy();
    });

    // Click MCP tab
    fireEvent.click(screen.getByText('MCP'));

    await waitFor(() => {
      expect(screen.getByText('MCP Setup')).toBeTruthy();
    });
  });

  it('should show transactions pagination controls with Previous/Next', async () => {
    // 25 total items - should show pagination with Next enabled
    vi.mocked(apiGet).mockImplementation(mockDetailApiGet({
      transactions: { items: mockTxItems, total: 25 },
    }));

    render(<WalletsPage />);

    await waitFor(() => {
      expect(screen.getByText('test-wallet')).toBeTruthy();
    });

    // Switch to Transactions tab
    fireEvent.click(screen.getByText('Transactions'));

    await waitFor(() => {
      // Pagination info should show
      expect(screen.getByText(/Showing 1-/)).toBeTruthy();
      // Previous/Next buttons (may have multiple "Previous"/"Next" from the tab itself, so check pagination area)
      const prevBtns = screen.getAllByText('Previous');
      const nextBtns = screen.getAllByText('Next');
      expect(prevBtns.length).toBeGreaterThanOrEqual(1);
      expect(nextBtns.length).toBeGreaterThanOrEqual(1);
    });

    // Click Next and verify API call with offset=20
    const nextBtn = screen.getAllByText('Next').find((el) => !(el as HTMLButtonElement).disabled);
    if (nextBtn) {
      fireEvent.click(nextBtn);

      await waitFor(() => {
        const calls = vi.mocked(apiGet).mock.calls;
        const txCall = calls.find(([p]) => typeof p === 'string' && p.includes('/transactions') && p.includes('offset=20'));
        expect(txCall).toBeTruthy();
      });
    }
  });

  it('should render ExplorerLink for transaction txHash', async () => {
    vi.mocked(apiGet).mockImplementation(mockDetailApiGet({
      transactions: { items: mockTxItems, total: 2 },
    }));

    render(<WalletsPage />);

    await waitFor(() => {
      expect(screen.getByText('test-wallet')).toBeTruthy();
    });

    // Switch to Transactions tab
    fireEvent.click(screen.getByText('Transactions'));

    await waitFor(() => {
      // ExplorerLink renders an <a> tag with the correct href
      // tx-1 has txHash on devnet, which maps to solscan.io
      const links = document.querySelectorAll('a.explorer-link');
      expect(links.length).toBeGreaterThanOrEqual(1);
      const firstLink = links[0] as HTMLAnchorElement;
      expect(firstLink.href).toContain('solscan.io');
    });
  });

  it('should render status and type filter dropdowns in Transactions tab', async () => {
    vi.mocked(apiGet).mockImplementation(mockDetailApiGet({
      transactions: { items: mockTxItems, total: 2 },
    }));

    render(<WalletsPage />);

    await waitFor(() => {
      expect(screen.getByText('test-wallet')).toBeTruthy();
    });

    // Switch to Transactions tab
    fireEvent.click(screen.getByText('Transactions'));

    await waitFor(() => {
      // FilterBar renders Status and Type labels
      const statusLabels = screen.getAllByText('Status');
      expect(statusLabels.length).toBeGreaterThanOrEqual(1);
      const typeLabels = screen.getAllByText('Type');
      expect(typeLabels.length).toBeGreaterThanOrEqual(1);
      // Clear button from FilterBar
      expect(screen.getByText('Clear')).toBeTruthy();
    });
  });

  it('should display USD value next to native balance', async () => {
    vi.mocked(apiGet).mockImplementation(mockDetailApiGet({
      balance: {
        balances: [{
          network: 'devnet',
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
    vi.mocked(apiGet).mockImplementation(mockDetailApiGet({
      balance: {
        balances: [{
          network: 'devnet',
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
    const callCountBefore = vi.mocked(apiGet).mock.calls.filter(
      ([p]) => typeof p === 'string' && p.includes('/balance'),
    ).length;

    fireEvent.click(screen.getByText('Refresh'));

    await waitFor(() => {
      const callCountAfter = vi.mocked(apiGet).mock.calls.filter(
        ([p]) => typeof p === 'string' && p.includes('/balance'),
      ).length;
      expect(callCountAfter).toBeGreaterThan(callCountBefore);
    });
  });
});
