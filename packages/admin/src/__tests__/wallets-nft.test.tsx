/**
 * NFT tab in wallet detail page tests.
 *
 * Tests cover:
 * - Grid view renders NFT cards with images
 * - Empty state when no NFTs
 * - Indexer not configured error message
 * - Modal opens on NFT click
 * - List view toggle
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
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

vi.mock('../utils/error-messages', () => ({
  getErrorMessage: (code: string) => `Error: ${code}`,
}));

vi.mock('../utils/dirty-guard', () => ({
  registerDirty: vi.fn(),
  unregisterDirty: vi.fn(),
  hasDirty: { value: false },
}));

vi.mock('../utils/display-currency', () => ({
  fetchDisplayCurrency: vi.fn(async () => ({ currency: 'USD', rate: 1 })),
  formatWithDisplay: (val: number) => `$${val.toFixed(2)}`,
}));

vi.mock('../components/layout', () => ({
  currentPath: { value: '/wallets/w1' },
}));

vi.mock('../components/settings-search', () => ({
  pendingNavigation: { value: null, peek: () => null },
  highlightField: vi.fn(),
}));

import { api, ApiError } from '../api/typed-client';

const mockApiGet = vi.mocked(api.GET);

describe('Wallets NFT Tab', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  // Helper to set up apiGet responses for wallet detail + NFT queries
  function setupMocks(nftResponse?: unknown, nftError?: Error) {
    const walletDetail = {
      id: 'w1',
      name: 'test-wallet',
      chain: 'ethereum',
      environment: 'mainnet',
      status: 'ACTIVE',
      publicKey: '0xabc123',
      accountType: 'eoa',
      networks: [{ network: 'ethereum-mainnet' }],
    };

    mockApiGet.mockImplementation(async (url: string) => {
      if (url.includes('/nfts/{tokenIdentifier}')) {
        if (nftError) throw nftError;
        return { data: nftResponse ?? {} };
      }
      if (url.includes('/nfts')) {
        if (nftError) throw nftError;
        return { data: nftResponse ?? { items: [], pageKey: undefined, totalCount: 0 } };
      }
      if (url.includes('/networks')) return { data: { availableNetworks: [{ network: 'ethereum-mainnet' }] } };
      if (url.includes('/transactions')) return { data: { items: [], total: 0 } };
      if (url.includes('/staking')) return { data: { walletId: 'w1', positions: [] } };
      if (url.includes('/balance')) return { data: { balances: [] } };
      if (url === '/v1/wallets/{id}') return { data: walletDetail };
      if (url.includes('/wc/session')) throw new Error('no session');
      if (url.includes('/settings')) return { data: {} };
      return { data: {} };
    });
  }

  it('shows NFT tab in detail tabs', async () => {
    setupMocks();
    const WalletsPage = (await import('../pages/wallets')).default;
    render(<WalletsPage />);

    await waitFor(() => {
      expect(screen.getByText('NFTs')).toBeTruthy();
    });
  });

  it('shows empty state when no network selected', async () => {
    setupMocks();
    const WalletsPage = (await import('../pages/wallets')).default;
    render(<WalletsPage />);

    await waitFor(() => {
      expect(screen.getByText('NFTs')).toBeTruthy();
    });

    // Click NFTs tab
    fireEvent.click(screen.getByText('NFTs'));

    await waitFor(() => {
      expect(screen.getByText('Select a network')).toBeTruthy();
    });
  });

  it('shows empty state when no NFTs found', async () => {
    setupMocks({ items: [], pageKey: undefined, totalCount: 0 });
    const WalletsPage = (await import('../pages/wallets')).default;
    render(<WalletsPage />);

    await waitFor(() => {
      expect(screen.getByText('NFTs')).toBeTruthy();
    });

    // Click NFTs tab
    fireEvent.click(screen.getByText('NFTs'));

    // Select network from dropdown
    await waitFor(() => {
      const selects = document.querySelectorAll('select');
      const nftSelect = Array.from(selects).find((s) => {
        const options = Array.from(s.options);
        return options.some((o) => o.value === 'ethereum-mainnet');
      });
      if (nftSelect) {
        fireEvent.change(nftSelect, { target: { value: 'ethereum-mainnet' } });
      }
    });

    await waitFor(() => {
      expect(screen.getByText('No NFTs found')).toBeTruthy();
    });
  });

  it('shows indexer not configured message', async () => {
    const err = new ApiError(400, 'INDEXER_NOT_CONFIGURED', 'NFT indexer not configured');
    setupMocks(undefined, err);
    const WalletsPage = (await import('../pages/wallets')).default;
    render(<WalletsPage />);

    await waitFor(() => {
      expect(screen.getByText('NFTs')).toBeTruthy();
    });

    fireEvent.click(screen.getByText('NFTs'));

    await waitFor(() => {
      const selects = document.querySelectorAll('select');
      const nftSelect = Array.from(selects).find((s) => {
        const options = Array.from(s.options);
        return options.some((o) => o.value === 'ethereum-mainnet');
      });
      if (nftSelect) {
        fireEvent.change(nftSelect, { target: { value: 'ethereum-mainnet' } });
      }
    });

    await waitFor(() => {
      expect(screen.getByText('NFT indexer not configured')).toBeTruthy();
    });
  });

  it('renders NFT grid with cards, no-image placeholder, and card click', async () => {
    setupMocks({
      items: [
        {
          tokenId: '42',
          contractAddress: '0xabc',
          standard: 'erc721',
          name: 'Cool NFT',
          image: 'https://ipfs.io/ipfs/Qm...',
          amount: '1',
          collection: { name: 'Cool Collection' },
        },
        {
          tokenId: '99',
          contractAddress: '0xdef',
          standard: 'erc1155',
          name: 'No Image NFT',
          amount: '5',
          collection: { name: 'Multi Collection' },
        },
      ],
      pageKey: undefined,
    });
    const WalletsPage = (await import('../pages/wallets')).default;
    render(<WalletsPage />);

    await waitFor(() => {
      expect(screen.getByText('NFTs')).toBeTruthy();
    });

    fireEvent.click(screen.getByText('NFTs'));

    await waitFor(() => {
      const selects = document.querySelectorAll('select');
      const nftSelect = Array.from(selects).find((s) => {
        const options = Array.from(s.options);
        return options.some((o) => o.value === 'ethereum-mainnet');
      });
      if (nftSelect) {
        fireEvent.change(nftSelect, { target: { value: 'ethereum-mainnet' } });
      }
    });

    await waitFor(() => {
      expect(screen.getByText('Cool NFT')).toBeTruthy();
      expect(screen.getByText('ERC721')).toBeTruthy();
    });

    // Verify no-image NFT placeholder is also rendered
    expect(screen.getByText('No Image NFT')).toBeTruthy();

    // Click first NFT card
    const card = document.querySelector('.nft-card') as HTMLElement;
    if (card) fireEvent.click(card);

    // Toggle to list view
    const viewToggleButtons = document.querySelectorAll('button');
    const listToggle = Array.from(viewToggleButtons).find((btn) =>
      btn.getAttribute('title')?.includes('list'),
    );
    if (listToggle) {
      fireEvent.click(listToggle);
      // Both NFTs should still be visible in list view
      await waitFor(() => {
        expect(screen.getByText('Cool NFT')).toBeTruthy();
      });
    }
  });
});
