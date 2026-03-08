/**
 * Hyperliquid page tests.
 *
 * Covers:
 * - Loading state
 * - Wallet selector renders EVM wallets
 * - Tab navigation (overview, orders, spot, subaccounts, settings)
 * - Empty wallet state
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent, cleanup } from '@testing-library/preact';

vi.mock('../api/client', () => ({
  apiGet: vi.fn(),
  apiPost: vi.fn(),
  apiPut: vi.fn(),
  apiDelete: vi.fn(),
  apiCall: vi.fn(),
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
vi.mock('../components/hyperliquid/AccountSummary', () => ({
  AccountSummary: ({ walletId }: { walletId: string | null }) => (
    <div data-testid="account-summary">AccountSummary:{walletId}</div>
  ),
}));

vi.mock('../components/hyperliquid/PositionsTable', () => ({
  PositionsTable: ({ walletId }: { walletId: string | null }) => (
    <div data-testid="positions-table">Positions:{walletId}</div>
  ),
}));

vi.mock('../components/hyperliquid/OpenOrdersTable', () => ({
  OpenOrdersTable: ({ walletId }: { walletId: string | null }) => (
    <div data-testid="open-orders">OpenOrders:{walletId}</div>
  ),
}));

vi.mock('../components/hyperliquid/SpotBalancesTable', () => ({
  SpotBalancesTable: ({ walletId }: { walletId: string | null }) => (
    <div data-testid="spot-balances">SpotBalances:{walletId}</div>
  ),
}));

vi.mock('../components/hyperliquid/SpotOrdersTable', () => ({
  SpotOrdersTable: ({ walletId }: { walletId: string | null }) => (
    <div data-testid="spot-orders">SpotOrders:{walletId}</div>
  ),
}));

vi.mock('../components/hyperliquid/SubAccountList', () => ({
  SubAccountList: ({ walletId, onSelect }: { walletId: string | null; onSelect: (addr: string) => void }) => (
    <div data-testid="sub-list">
      SubAccounts:{walletId}
      <button onClick={() => onSelect('0xsub1')}>Select Sub</button>
    </div>
  ),
}));

vi.mock('../components/hyperliquid/SubAccountDetail', () => ({
  SubAccountDetail: ({ walletId, subAccountAddress }: { walletId: string | null; subAccountAddress: string }) => (
    <div data-testid="sub-detail">SubDetail:{walletId}:{subAccountAddress}</div>
  ),
}));

vi.mock('../components/hyperliquid/SettingsPanel', () => ({
  SettingsPanel: () => <div data-testid="settings-panel">SettingsPanel</div>,
}));

import HyperliquidPage from '../pages/hyperliquid';
import { apiGet } from '../api/client';

const mockApiGet = apiGet as ReturnType<typeof vi.fn>;

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function mockWallets(wallets: Array<{ id: string; name: string; chain: string; network: string }>) {
  mockApiGet.mockImplementation((url: string) => {
    if (url === '/v1/wallets') {
      return Promise.resolve({ wallets });
    }
    return Promise.resolve({});
  });
}

describe('HyperliquidPage', () => {
  it('shows loading state initially', () => {
    mockApiGet.mockReturnValue(new Promise(() => {})); // Never resolves
    render(<HyperliquidPage />);
    expect(screen.getByText('Loading...')).toBeTruthy();
  });

  it('renders wallet selector with EVM wallets', async () => {
    mockWallets([
      { id: 'w1', name: 'Main', chain: 'ethereum', network: 'ethereum-mainnet' },
      { id: 'w2', name: 'Solana', chain: 'solana', network: 'solana-mainnet' },
      { id: 'w3', name: 'Arb', chain: 'ethereum', network: 'arbitrum-mainnet' },
    ]);

    render(<HyperliquidPage />);
    await waitFor(() => {
      expect(screen.queryByText('Loading...')).toBeNull();
    });

    // Should only show EVM wallets (2 of 3)
    expect(screen.getByText('Main (ethereum-mainnet)')).toBeTruthy();
    expect(screen.getByText('Arb (arbitrum-mainnet)')).toBeTruthy();
    expect(screen.queryByText('Solana (solana-mainnet)')).toBeNull();
  });

  it('shows empty state when no EVM wallets', async () => {
    mockWallets([
      { id: 'w1', name: 'Sol', chain: 'solana', network: 'solana-mainnet' },
    ]);

    render(<HyperliquidPage />);
    await waitFor(() => {
      expect(screen.queryByText('Loading...')).toBeNull();
    });

    expect(screen.getByText('No EVM wallets available')).toBeTruthy();
  });

  it('renders overview tab by default with AccountSummary and Positions', async () => {
    mockWallets([
      { id: 'w1', name: 'Main', chain: 'ethereum', network: 'ethereum-mainnet' },
    ]);

    render(<HyperliquidPage />);
    await waitFor(() => {
      expect(screen.getByTestId('account-summary')).toBeTruthy();
    });

    expect(screen.getByTestId('positions-table')).toBeTruthy();
  });

  it('switches to orders tab', async () => {
    mockWallets([
      { id: 'w1', name: 'Main', chain: 'ethereum', network: 'ethereum-mainnet' },
    ]);

    render(<HyperliquidPage />);
    await waitFor(() => {
      expect(screen.queryByText('Loading...')).toBeNull();
    });

    fireEvent.click(screen.getByText('Orders'));
    expect(screen.getByTestId('open-orders')).toBeTruthy();
  });

  it('switches to spot tab', async () => {
    mockWallets([
      { id: 'w1', name: 'Main', chain: 'ethereum', network: 'ethereum-mainnet' },
    ]);

    render(<HyperliquidPage />);
    await waitFor(() => {
      expect(screen.queryByText('Loading...')).toBeNull();
    });

    fireEvent.click(screen.getByText('Spot'));
    expect(screen.getByTestId('spot-balances')).toBeTruthy();
    expect(screen.getByTestId('spot-orders')).toBeTruthy();
  });

  it('switches to subaccounts tab and selects sub-account', async () => {
    mockWallets([
      { id: 'w1', name: 'Main', chain: 'ethereum', network: 'ethereum-mainnet' },
    ]);

    render(<HyperliquidPage />);
    await waitFor(() => {
      expect(screen.queryByText('Loading...')).toBeNull();
    });

    fireEvent.click(screen.getByText('Sub-accounts'));
    expect(screen.getByTestId('sub-list')).toBeTruthy();

    // Select a sub-account
    fireEvent.click(screen.getByText('Select Sub'));
    expect(screen.getByTestId('sub-detail')).toBeTruthy();
  });

  it('switches to settings tab', async () => {
    mockWallets([
      { id: 'w1', name: 'Main', chain: 'ethereum', network: 'ethereum-mainnet' },
    ]);

    render(<HyperliquidPage />);
    await waitFor(() => {
      expect(screen.queryByText('Loading...')).toBeNull();
    });

    fireEvent.click(screen.getByText('Settings'));
    expect(screen.getByTestId('settings-panel')).toBeTruthy();
  });

  it('handles API error gracefully', async () => {
    mockApiGet.mockRejectedValue(new Error('Network error'));

    render(<HyperliquidPage />);
    await waitFor(() => {
      expect(screen.queryByText('Loading...')).toBeNull();
    });

    expect(screen.getByText('No EVM wallets available')).toBeTruthy();
  });
});
