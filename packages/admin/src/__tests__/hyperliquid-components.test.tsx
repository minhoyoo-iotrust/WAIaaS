/**
 * Hyperliquid child component tests.
 *
 * Tests the 8 components in components/hyperliquid/:
 * - AccountSummary: account equity, margin, status badges
 * - PositionsTable: perp positions with PnL coloring
 * - OpenOrdersTable: perp open orders
 * - SpotBalancesTable: spot token balances (filters zero balances)
 * - SpotOrdersTable: spot orders (filters by "/" in coin name)
 * - SubAccountList: sub-account listing with click handler
 * - SubAccountDetail: sub-account positions
 * - SettingsPanel: admin settings form with save
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
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

import { apiGet, apiPut } from '../api/client';
import { showToast } from '../components/toast';
import { AccountSummary } from '../components/hyperliquid/AccountSummary';
import { PositionsTable } from '../components/hyperliquid/PositionsTable';
import { OpenOrdersTable } from '../components/hyperliquid/OpenOrdersTable';
import { SpotBalancesTable } from '../components/hyperliquid/SpotBalancesTable';
import { SpotOrdersTable } from '../components/hyperliquid/SpotOrdersTable';
import { SubAccountList } from '../components/hyperliquid/SubAccountList';
import { SubAccountDetail } from '../components/hyperliquid/SubAccountDetail';
import { SettingsPanel } from '../components/hyperliquid/SettingsPanel';

const mockApiGet = apiGet as ReturnType<typeof vi.fn>;
const mockApiPut = apiPut as ReturnType<typeof vi.fn>;
const mockShowToast = showToast as ReturnType<typeof vi.fn>;

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// AccountSummary
// ---------------------------------------------------------------------------
describe('AccountSummary', () => {
  it('shows prompt when no walletId', () => {
    render(<AccountSummary walletId={null} />);
    expect(screen.getByText('Select a wallet to view Hyperliquid account')).toBeTruthy();
  });

  it('shows loading state', () => {
    mockApiGet.mockReturnValue(new Promise(() => {}));
    render(<AccountSummary walletId="w1" />);
    expect(screen.getByText('Loading account state...')).toBeTruthy();
  });

  it('renders account data with margin status Safe', async () => {
    mockApiGet.mockResolvedValue({
      state: {
        marginSummary: {
          accountValue: '10000.00',
          totalMarginUsed: '500.00',
          totalNtlPos: '5000.00',
          totalRawUsd: '10000.00',
        },
      },
    });

    render(<AccountSummary walletId="w1" />);

    await waitFor(() => {
      expect(screen.getByText('$10000.00')).toBeTruthy();
    });

    expect(screen.getByText('$500.00')).toBeTruthy();
    expect(screen.getByText('$9500.00')).toBeTruthy();
    // 500/10000 = 5% -> Safe
    expect(screen.getByText(/Safe/)).toBeTruthy();
  });

  it('renders Warning margin status when ratio > 10%', async () => {
    mockApiGet.mockResolvedValue({
      state: {
        marginSummary: {
          accountValue: '10000.00',
          totalMarginUsed: '2000.00',
        },
      },
    });

    render(<AccountSummary walletId="w1" />);

    await waitFor(() => {
      // 2000/10000 = 20% -> Warning
      expect(screen.getByText(/Warning/)).toBeTruthy();
    });
  });

  it('renders Danger margin status when ratio > 30%', async () => {
    mockApiGet.mockResolvedValue({
      state: {
        marginSummary: {
          accountValue: '10000.00',
          totalMarginUsed: '5000.00',
        },
      },
    });

    render(<AccountSummary walletId="w1" />);

    await waitFor(() => {
      // 5000/10000 = 50% -> Danger
      expect(screen.getByText(/Danger/)).toBeTruthy();
    });
  });

  it('shows error message on API failure', async () => {
    mockApiGet.mockRejectedValue(new Error('Network error'));

    render(<AccountSummary walletId="w1" />);

    await waitFor(() => {
      expect(screen.getByText('Network error')).toBeTruthy();
    });
  });

  it('shows no data message when state has no margin summary', async () => {
    mockApiGet.mockResolvedValue({ state: {} });

    render(<AccountSummary walletId="w1" />);

    await waitFor(() => {
      expect(screen.getByText('No account data available')).toBeTruthy();
    });
  });

  it('falls back to crossMarginSummary when marginSummary is missing', async () => {
    mockApiGet.mockResolvedValue({
      state: {
        crossMarginSummary: {
          accountValue: '5000.00',
          totalMarginUsed: '200.00',
        },
      },
    });

    render(<AccountSummary walletId="w1" />);

    await waitFor(() => {
      expect(screen.getByText('$5000.00')).toBeTruthy();
    });
  });
});

// ---------------------------------------------------------------------------
// PositionsTable
// ---------------------------------------------------------------------------
describe('PositionsTable', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows prompt when no walletId', () => {
    render(<PositionsTable walletId={null} />);
    expect(screen.getByText('Select a wallet to view positions')).toBeTruthy();
  });

  it('shows loading state', () => {
    mockApiGet.mockReturnValue(new Promise(() => {}));
    render(<PositionsTable walletId="w1" />);
    expect(screen.getByText('Loading positions...')).toBeTruthy();
  });

  it('renders positions with LONG/SHORT coloring', async () => {
    mockApiGet.mockResolvedValue({
      positions: [
        {
          coin: 'BTC',
          szi: '0.5',
          entryPx: '50000.00',
          positionValue: '25000.00',
          unrealizedPnl: '1500.00',
          leverage: { value: 10, type: 'cross' },
          liquidationPx: '45000.00',
        },
        {
          coin: 'ETH',
          szi: '-2.0',
          entryPx: '3000.00',
          positionValue: '6000.00',
          unrealizedPnl: '-200.00',
          leverage: { value: 5, type: 'isolated' },
          liquidationPx: '3500.00',
        },
      ],
    });

    render(<PositionsTable walletId="w1" />);

    await waitFor(() => {
      expect(screen.getByText('BTC')).toBeTruthy();
    });

    expect(screen.getByText('ETH')).toBeTruthy();
    expect(screen.getByText('LONG')).toBeTruthy();
    expect(screen.getByText('SHORT')).toBeTruthy();
    expect(screen.getByText('+1500.00')).toBeTruthy();
    expect(screen.getByText('-200.00')).toBeTruthy();
    expect(screen.getByText('10x')).toBeTruthy();
    expect(screen.getByText('5x')).toBeTruthy();
  });

  it('shows empty state when no positions', async () => {
    mockApiGet.mockResolvedValue({ positions: [] });

    render(<PositionsTable walletId="w1" />);

    await waitFor(() => {
      expect(screen.getByText('No open positions')).toBeTruthy();
    });
  });

  it('shows error on API failure', async () => {
    mockApiGet.mockRejectedValue(new Error('Connection failed'));

    render(<PositionsTable walletId="w1" />);

    await waitFor(() => {
      expect(screen.getByText('Connection failed')).toBeTruthy();
    });
  });
});

// ---------------------------------------------------------------------------
// OpenOrdersTable
// ---------------------------------------------------------------------------
describe('OpenOrdersTable', () => {
  it('shows prompt when no walletId', () => {
    render(<OpenOrdersTable walletId={null} />);
    expect(screen.getByText('Select a wallet to view orders')).toBeTruthy();
  });

  it('shows loading state', () => {
    mockApiGet.mockReturnValue(new Promise(() => {}));
    render(<OpenOrdersTable walletId="w1" />);
    expect(screen.getByText('Loading orders...')).toBeTruthy();
  });

  it('renders orders with BUY/SELL labels', async () => {
    mockApiGet.mockResolvedValue({
      orders: [
        {
          coin: 'BTC',
          side: 'B',
          limitPx: '48000.00',
          sz: '0.1',
          oid: 1001,
          orderType: 'LIMIT',
          tif: 'GTC',
          timestamp: 1709900000000,
        },
        {
          coin: 'ETH',
          side: 'A',
          limitPx: '3200.00',
          sz: '1.5',
          oid: 1002,
          triggerPx: '3100.00',
          tif: 'IOC',
        },
      ],
    });

    render(<OpenOrdersTable walletId="w1" />);

    await waitFor(() => {
      expect(screen.getByText('BTC')).toBeTruthy();
    });

    expect(screen.getByText('ETH')).toBeTruthy();
    expect(screen.getByText('BUY')).toBeTruthy();
    expect(screen.getByText('SELL')).toBeTruthy();
    expect(screen.getByText('48000.00')).toBeTruthy();
    expect(screen.getByText('3100.00')).toBeTruthy();
    expect(screen.getByText('IOC')).toBeTruthy();
  });

  it('shows empty state when no orders', async () => {
    mockApiGet.mockResolvedValue({ orders: [] });

    render(<OpenOrdersTable walletId="w1" />);

    await waitFor(() => {
      expect(screen.getByText('No open orders')).toBeTruthy();
    });
  });

  it('shows error on failure', async () => {
    mockApiGet.mockRejectedValue(new Error('Timeout'));

    render(<OpenOrdersTable walletId="w1" />);

    await waitFor(() => {
      expect(screen.getByText('Timeout')).toBeTruthy();
    });
  });
});

// ---------------------------------------------------------------------------
// SpotBalancesTable
// ---------------------------------------------------------------------------
describe('SpotBalancesTable', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows prompt when no walletId', () => {
    render(<SpotBalancesTable walletId={null} />);
    expect(screen.getByText('Select a wallet to view spot balances')).toBeTruthy();
  });

  it('shows loading state', () => {
    mockApiGet.mockReturnValue(new Promise(() => {}));
    render(<SpotBalancesTable walletId="w1" />);
    expect(screen.getByText('Loading spot balances...')).toBeTruthy();
  });

  it('renders balances and filters zero-balance tokens', async () => {
    mockApiGet.mockResolvedValue({
      balances: [
        { coin: 'USDC', hold: '100.00', token: 0, total: '5000.00' },
        { coin: 'HYPE', hold: '0', token: 1, total: '250.50' },
        { coin: 'EMPTY', hold: '0', token: 2, total: '0' },
      ],
    });

    render(<SpotBalancesTable walletId="w1" />);

    await waitFor(() => {
      expect(screen.getByText('USDC')).toBeTruthy();
    });

    expect(screen.getByText('HYPE')).toBeTruthy();
    // Zero-balance token should be filtered out
    expect(screen.queryByText('EMPTY')).toBeNull();
  });

  it('shows hold amount and available calculation', async () => {
    mockApiGet.mockResolvedValue({
      balances: [
        { coin: 'USDC', hold: '200.0000', token: 0, total: '1000.0000' },
      ],
    });

    render(<SpotBalancesTable walletId="w1" />);

    await waitFor(() => {
      expect(screen.getByText('USDC')).toBeTruthy();
    });

    // total=1000, hold=200, available=800
    expect(screen.getByText('1000.0000')).toBeTruthy();
    expect(screen.getByText('200.0000')).toBeTruthy();
    expect(screen.getByText('800.0000')).toBeTruthy();
  });

  it('shows empty state when no balances', async () => {
    mockApiGet.mockResolvedValue({ balances: [] });

    render(<SpotBalancesTable walletId="w1" />);

    await waitFor(() => {
      expect(screen.getByText('No spot balances')).toBeTruthy();
    });
  });

  it('shows error on failure', async () => {
    mockApiGet.mockRejectedValue(new Error('RPC error'));

    render(<SpotBalancesTable walletId="w1" />);

    await waitFor(() => {
      expect(screen.getByText('RPC error')).toBeTruthy();
    });
  });
});

// ---------------------------------------------------------------------------
// SpotOrdersTable
// ---------------------------------------------------------------------------
describe('SpotOrdersTable', () => {
  it('shows prompt when no walletId', () => {
    render(<SpotOrdersTable walletId={null} />);
    expect(screen.getByText('Select a wallet to view spot orders')).toBeTruthy();
  });

  it('shows loading state', () => {
    mockApiGet.mockReturnValue(new Promise(() => {}));
    render(<SpotOrdersTable walletId="w1" />);
    expect(screen.getByText('Loading spot orders...')).toBeTruthy();
  });

  it('renders only spot orders (coin contains "/")', async () => {
    mockApiGet.mockResolvedValue({
      orders: [
        { coin: 'HYPE/USDC', side: 'B', limitPx: '25.00', sz: '10', oid: 1, orderType: 'LIMIT', tif: 'GTC' },
        { coin: 'BTC', side: 'A', limitPx: '50000', sz: '0.1', oid: 2 }, // perp, should be filtered
        { coin: 'ETH/USDC', side: 'BUY', limitPx: '3000.00', sz: '2', oid: 3 },
      ],
    });

    render(<SpotOrdersTable walletId="w1" />);

    await waitFor(() => {
      expect(screen.getByText('HYPE/USDC')).toBeTruthy();
    });

    expect(screen.getByText('ETH/USDC')).toBeTruthy();
    // BTC (perp) should be filtered out
    expect(screen.queryByText(/^BTC$/)).toBeNull();
  });

  it('shows BUY for side "B" or "BUY"', async () => {
    mockApiGet.mockResolvedValue({
      orders: [
        { coin: 'HYPE/USDC', side: 'BUY', limitPx: '25.00', sz: '10', oid: 1 },
      ],
    });

    render(<SpotOrdersTable walletId="w1" />);

    await waitFor(() => {
      expect(screen.getByText('BUY')).toBeTruthy();
    });
  });

  it('shows empty state when no spot orders', async () => {
    mockApiGet.mockResolvedValue({ orders: [] });

    render(<SpotOrdersTable walletId="w1" />);

    await waitFor(() => {
      expect(screen.getByText('No spot orders')).toBeTruthy();
    });
  });

  it('shows error on failure', async () => {
    mockApiGet.mockRejectedValue(new Error('API down'));

    render(<SpotOrdersTable walletId="w1" />);

    await waitFor(() => {
      expect(screen.getByText('API down')).toBeTruthy();
    });
  });
});

// ---------------------------------------------------------------------------
// SubAccountList
// ---------------------------------------------------------------------------
describe('SubAccountList', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows prompt when no walletId', () => {
    render(<SubAccountList walletId={null} />);
    expect(screen.getByText('Select a wallet to view sub-accounts')).toBeTruthy();
  });

  it('shows loading state', () => {
    mockApiGet.mockReturnValue(new Promise(() => {}));
    render(<SubAccountList walletId="w1" />);
    expect(screen.getByText('Loading sub-accounts...')).toBeTruthy();
  });

  it('renders sub-accounts with truncated addresses', async () => {
    mockApiGet.mockResolvedValue({
      subAccounts: [
        { subAccountUser: '0xabcdef1234567890abcdef1234567890abcdef12', name: 'Trading Bot', master: '0xmaster' },
        { subAccountUser: '0x1111222233334444555566667777888899990000', name: '', master: '0xmaster' },
      ],
    });

    render(<SubAccountList walletId="w1" />);

    await waitFor(() => {
      expect(screen.getByText('Trading Bot')).toBeTruthy();
    });

    // Unnamed sub-account shows "(unnamed)"
    expect(screen.getByText('(unnamed)')).toBeTruthy();

    // Address should be truncated: first 6 + last 4
    expect(screen.getByText('0xabcd...ef12')).toBeTruthy();
    expect(screen.getByText('0x1111...0000')).toBeTruthy();
  });

  it('calls onSelect when a row is clicked', async () => {
    const onSelect = vi.fn();
    mockApiGet.mockResolvedValue({
      subAccounts: [
        { subAccountUser: '0xabcdef1234567890abcdef1234567890abcdef12', name: 'Bot', master: '0xm' },
      ],
    });

    render(<SubAccountList walletId="w1" onSelect={onSelect} />);

    await waitFor(() => {
      expect(screen.getByText('Bot')).toBeTruthy();
    });

    fireEvent.click(screen.getByText('Bot'));
    expect(onSelect).toHaveBeenCalledWith('0xabcdef1234567890abcdef1234567890abcdef12');
  });

  it('shows empty state when no sub-accounts', async () => {
    mockApiGet.mockResolvedValue({ subAccounts: [] });

    render(<SubAccountList walletId="w1" />);

    await waitFor(() => {
      expect(screen.getByText('No sub-accounts found')).toBeTruthy();
    });
  });

  it('shows error on failure', async () => {
    mockApiGet.mockRejectedValue(new Error('Auth required'));

    render(<SubAccountList walletId="w1" />);

    await waitFor(() => {
      expect(screen.getByText('Auth required')).toBeTruthy();
    });
  });
});

// ---------------------------------------------------------------------------
// SubAccountDetail
// ---------------------------------------------------------------------------
describe('SubAccountDetail', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows loading state', () => {
    mockApiGet.mockReturnValue(new Promise(() => {}));
    render(<SubAccountDetail walletId="w1" subAccountAddress="0xsub123" />);
    expect(screen.getByText('Loading positions...')).toBeTruthy();
  });

  it('renders sub-account positions with truncated address header', async () => {
    mockApiGet.mockResolvedValue({
      positions: [
        {
          coin: 'BTC',
          szi: '1.0',
          entryPx: '60000.00',
          positionValue: '60000.00',
          unrealizedPnl: '2000.00',
          leverage: { type: 'cross', value: 20 },
          liquidationPx: '55000.00',
        },
      ],
    });

    render(<SubAccountDetail walletId="w1" subAccountAddress="0xabcdef1234567890abcdef1234567890abcdef12" />);

    await waitFor(() => {
      expect(screen.getByText('BTC')).toBeTruthy();
    });

    // Header with truncated address
    expect(screen.getByText(/0xabcd\.\.\.ef12/)).toBeTruthy();
    expect(screen.getByText('LONG')).toBeTruthy();
    expect(screen.getByText('+2000.00')).toBeTruthy();
    expect(screen.getByText('20x')).toBeTruthy();
  });

  it('shows SHORT for negative szi', async () => {
    mockApiGet.mockResolvedValue({
      positions: [
        {
          coin: 'ETH',
          szi: '-5.0',
          entryPx: '3000.00',
          unrealizedPnl: '-100.00',
        },
      ],
    });

    render(<SubAccountDetail walletId="w1" subAccountAddress="0xsub" />);

    await waitFor(() => {
      expect(screen.getByText('SHORT')).toBeTruthy();
    });

    expect(screen.getByText('-100.00')).toBeTruthy();
  });

  it('shows empty state when no positions', async () => {
    mockApiGet.mockResolvedValue({ positions: [] });

    render(<SubAccountDetail walletId="w1" subAccountAddress="0xsub" />);

    await waitFor(() => {
      expect(screen.getByText('No open positions for this sub-account')).toBeTruthy();
    });
  });

  it('shows error on failure', async () => {
    mockApiGet.mockRejectedValue(new Error('Not found'));

    render(<SubAccountDetail walletId="w1" subAccountAddress="0xsub" />);

    await waitFor(() => {
      expect(screen.getByText('Not found')).toBeTruthy();
    });
  });
});

// ---------------------------------------------------------------------------
// SettingsPanel
// ---------------------------------------------------------------------------
describe('SettingsPanel', () => {
  it('shows loading state', () => {
    mockApiGet.mockReturnValue(new Promise(() => {}));
    render(<SettingsPanel />);
    expect(screen.getByText('Loading settings...')).toBeTruthy();
  });

  it('renders settings form with all fields', async () => {
    mockApiGet.mockResolvedValue({
      settings: {
        'actions.hyperliquid_enabled': 'true',
        'actions.hyperliquid_network': 'mainnet',
        'actions.hyperliquid_default_leverage': '10',
        'actions.hyperliquid_default_margin_mode': 'CROSS',
      },
    });

    render(<SettingsPanel />);

    await waitFor(() => {
      expect(screen.getByText('Enabled')).toBeTruthy();
    });

    expect(screen.getByText('Network')).toBeTruthy();
    expect(screen.getByText('Default Leverage')).toBeTruthy();
    expect(screen.getByText('Default Margin Mode')).toBeTruthy();
    expect(screen.getByText('API URL Override')).toBeTruthy();
    expect(screen.getByText('Rate Limit (weight/min)')).toBeTruthy();
    expect(screen.getByText('Builder Address')).toBeTruthy();
    expect(screen.getByText('Builder Fee (bps)')).toBeTruthy();
    expect(screen.getByText('Order Poll Interval (ms)')).toBeTruthy();
    expect(screen.getByText('Save Settings')).toBeTruthy();
  });

  it('renders all 9 setting fields after loading', async () => {
    mockApiGet.mockResolvedValue({
      settings: {
        'actions.hyperliquid_enabled': 'true',
      },
    });

    render(<SettingsPanel />);

    await waitFor(() => {
      expect(screen.getByText('Enabled')).toBeTruthy();
    });

    // FormField renders its own inputs; verify all 9 labels are present
    const fields = document.querySelectorAll('.form-field');
    expect(fields.length).toBe(9);
  });

  it('saves settings on button click', async () => {
    mockApiGet.mockResolvedValue({
      settings: {
        'actions.hyperliquid_enabled': 'true',
        'actions.hyperliquid_network': 'mainnet',
      },
    });
    mockApiPut.mockResolvedValue({});

    render(<SettingsPanel />);

    await waitFor(() => {
      expect(screen.getByText('Save Settings')).toBeTruthy();
    });

    fireEvent.click(screen.getByText('Save Settings'));

    await waitFor(() => {
      expect(mockApiPut).toHaveBeenCalledWith('/v1/admin/settings', {
        settings: expect.objectContaining({
          'actions.hyperliquid_enabled': 'true',
          'actions.hyperliquid_network': 'mainnet',
        }),
      });
    });

    expect(mockShowToast).toHaveBeenCalledWith('Hyperliquid settings saved', 'success');
  });

  it('shows error toast on save failure', async () => {
    mockApiGet.mockResolvedValue({ settings: {} });
    mockApiPut.mockRejectedValue(new Error('Save failed'));

    render(<SettingsPanel />);

    await waitFor(() => {
      expect(screen.getByText('Save Settings')).toBeTruthy();
    });

    fireEvent.click(screen.getByText('Save Settings'));

    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith('Failed to save settings', 'error');
    });
  });

  it('shows error toast on load failure', async () => {
    mockApiGet.mockRejectedValue(new Error('Load failed'));

    render(<SettingsPanel />);

    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith('Failed to load settings', 'error');
    });
  });
});
