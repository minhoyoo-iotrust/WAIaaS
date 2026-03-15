/**
 * Polymarket page tests.
 *
 * Covers:
 * - Loading state
 * - Wallet selector renders Polygon wallets
 * - Tab navigation (overview, markets, orders, positions)
 * - Configure in Providers link
 * - Empty wallet state
 * - API error handling
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent, cleanup } from '@testing-library/preact';

const mockApiGet = vi.fn();

vi.mock('../api/typed-client', () => ({
  api: { GET: (...args: unknown[]) => mockApiGet(...args), POST: vi.fn(), PUT: vi.fn(), DELETE: vi.fn() },
  ApiError: class ApiError extends Error {
    status: number; code: string; serverMessage: string;
    constructor(s: number, c: string, m: string) { super(`[${s}] ${c}: ${m}`); this.name = 'ApiError'; this.status = s; this.code = c; this.serverMessage = m; }
  },
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

vi.mock('../components/toast', () => ({
  showToast: vi.fn(),
  ToastContainer: () => null,
}));

// Mock all child components to isolate page logic
vi.mock('../components/polymarket/PolymarketOverview', () => ({
  PolymarketOverview: ({ walletId }: { walletId: string | null }) => (
    <div data-testid="pm-overview">Overview:{walletId}</div>
  ),
}));

vi.mock('../components/polymarket/PolymarketMarkets', () => ({
  PolymarketMarkets: () => (
    <div data-testid="pm-markets">Markets</div>
  ),
}));

vi.mock('../components/polymarket/PolymarketOrders', () => ({
  PolymarketOrders: ({ walletId }: { walletId: string | null }) => (
    <div data-testid="pm-orders">Orders:{walletId}</div>
  ),
}));

vi.mock('../components/polymarket/PolymarketPositions', () => ({
  PolymarketPositions: ({ walletId }: { walletId: string | null }) => (
    <div data-testid="pm-positions">Positions:{walletId}</div>
  ),
}));

import PolymarketPage from '../pages/polymarket';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function mockWallets(wallets: Array<{ id: string; name: string; chain: string; network: string }>) {
  mockApiGet.mockImplementation((...args: unknown[]) => {
    const path = args[0] as string;
    if (path === '/v1/wallets') {
      return Promise.resolve({ data: { items: wallets } });
    }
    return Promise.resolve({ data: {} });
  });
}

describe('PolymarketPage', () => {
  it('shows loading state initially', () => {
    mockApiGet.mockReturnValue(new Promise(() => { /* Never resolves */ }));
    render(<PolymarketPage />);
    expect(screen.getByText('Loading...')).toBeTruthy();
  });

  it('renders wallet selector with Polygon wallets only', async () => {
    mockWallets([
      { id: 'w1', name: 'Polygon', chain: 'ethereum', network: 'polygon-mainnet' },
      { id: 'w2', name: 'Ethereum', chain: 'ethereum', network: 'ethereum-mainnet' },
      { id: 'w3', name: 'Solana', chain: 'solana', network: 'solana-mainnet' },
    ]);

    render(<PolymarketPage />);
    await waitFor(() => {
      expect(screen.queryByText('Loading...')).toBeNull();
    });

    // Should only show Polygon wallets (1 of 3)
    expect(screen.getByText('Polygon (polygon-mainnet)')).toBeTruthy();
    expect(screen.queryByText('Ethereum (ethereum-mainnet)')).toBeNull();
    expect(screen.queryByText('Solana (solana-mainnet)')).toBeNull();
  });

  it('shows empty state when no Polygon wallets', async () => {
    mockWallets([
      { id: 'w1', name: 'Eth', chain: 'ethereum', network: 'ethereum-mainnet' },
    ]);

    render(<PolymarketPage />);
    await waitFor(() => {
      expect(screen.queryByText('Loading...')).toBeNull();
    });

    expect(screen.getByText('No Polygon wallets available')).toBeTruthy();
  });

  it('renders overview tab by default', async () => {
    mockWallets([
      { id: 'w1', name: 'Poly', chain: 'ethereum', network: 'polygon-mainnet' },
    ]);

    render(<PolymarketPage />);
    await waitFor(() => {
      expect(screen.getByTestId('pm-overview')).toBeTruthy();
    });
  });

  it('switches to markets tab', async () => {
    mockWallets([
      { id: 'w1', name: 'Poly', chain: 'ethereum', network: 'polygon-mainnet' },
    ]);

    render(<PolymarketPage />);
    await waitFor(() => {
      expect(screen.queryByText('Loading...')).toBeNull();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Markets' }));
    expect(screen.getByTestId('pm-markets')).toBeTruthy();
  });

  it('switches to orders tab', async () => {
    mockWallets([
      { id: 'w1', name: 'Poly', chain: 'ethereum', network: 'polygon-mainnet' },
    ]);

    render(<PolymarketPage />);
    await waitFor(() => {
      expect(screen.queryByText('Loading...')).toBeNull();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Orders' }));
    expect(screen.getByTestId('pm-orders')).toBeTruthy();
  });

  it('switches to positions tab', async () => {
    mockWallets([
      { id: 'w1', name: 'Poly', chain: 'ethereum', network: 'polygon-mainnet' },
    ]);

    render(<PolymarketPage />);
    await waitFor(() => {
      expect(screen.queryByText('Loading...')).toBeNull();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Positions' }));
    expect(screen.getByTestId('pm-positions')).toBeTruthy();
  });

  it('shows configure link to Providers page', async () => {
    mockWallets([
      { id: 'w1', name: 'Poly', chain: 'ethereum', network: 'polygon-mainnet' },
    ]);

    render(<PolymarketPage />);
    await waitFor(() => {
      expect(screen.queryByText('Loading...')).toBeNull();
    });

    expect(screen.getByText(/Configure in/)).toBeTruthy();
    const link = screen.getByText(/Configure in/).closest('a');
    expect(link?.getAttribute('href')).toBe('#/providers');
  });

  it('handles API error gracefully', async () => {
    mockApiGet.mockRejectedValue(new Error('Network error'));

    render(<PolymarketPage />);
    await waitFor(() => {
      expect(screen.queryByText('Loading...')).toBeNull();
    });

    expect(screen.getByText('No Polygon wallets available')).toBeTruthy();
  });

  it('passes selected wallet ID to tab components', async () => {
    mockWallets([
      { id: 'w-poly-1', name: 'Poly', chain: 'ethereum', network: 'polygon-mainnet' },
    ]);

    render(<PolymarketPage />);
    await waitFor(() => {
      expect(screen.getByTestId('pm-overview')).toBeTruthy();
    });

    expect(screen.getByTestId('pm-overview').textContent).toContain('w-poly-1');
  });
});
