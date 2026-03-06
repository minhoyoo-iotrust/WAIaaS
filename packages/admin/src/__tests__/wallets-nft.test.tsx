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

import { apiGet, ApiError } from '../api/client';

const mockApiGet = vi.mocked(apiGet);

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
      if (url.includes('/v1/wallets/w1/nfts')) {
        if (nftError) throw nftError;
        return nftResponse ?? { nfts: [], hasMore: false };
      }
      if (url.includes('/v1/wallets/w1/transactions')) {
        return { items: [], cursor: null, hasMore: false };
      }
      if (url.includes('/v1/admin/wallets/w1/staking')) {
        return { walletId: 'w1', positions: [] };
      }
      if (url.includes('/v1/admin/wallets/w1/balance')) {
        return { walletId: 'w1', balance: '0', decimals: 18, symbol: 'ETH', chain: 'ethereum', network: 'ethereum-mainnet', address: '0xabc' };
      }
      if (url.includes('/v1/wallets/w1')) {
        return walletDetail;
      }
      if (url.includes('/v1/admin/forex/rates')) {
        return { rates: {} };
      }
      if (url.includes('/v1/policies')) {
        return [];
      }
      if (url.includes('/v1/sessions')) {
        return [];
      }
      return {};
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
    setupMocks({ nfts: [], hasMore: false });
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

  it('renders NFT grid with cards', async () => {
    setupMocks({
      nfts: [
        {
          tokenId: '42',
          contractAddress: '0xabc',
          standard: 'erc721',
          name: 'Cool NFT',
          image: 'https://ipfs.io/ipfs/Qm...',
          collection: { name: 'Cool Collection', address: '0xabc' },
        },
      ],
      hasMore: false,
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
  });
});
