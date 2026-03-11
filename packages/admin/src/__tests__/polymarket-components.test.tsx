/**
 * Polymarket child component tests.
 *
 * Tests the 5 components in components/polymarket/:
 * - PolymarketOverview: PnL summary cards + recent orders table
 * - PolymarketMarkets: market search + category filter + table
 * - PolymarketOrders: order list with status filter
 * - PolymarketPositions: active + resolved positions tables
 * - PolymarketSettings: admin settings form with save
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

import { apiGet, apiPut } from '../api/client';
import { showToast } from '../components/toast';
import { PolymarketOverview } from '../components/polymarket/PolymarketOverview';
import { PolymarketMarkets } from '../components/polymarket/PolymarketMarkets';
import { PolymarketOrders } from '../components/polymarket/PolymarketOrders';
import { PolymarketPositions } from '../components/polymarket/PolymarketPositions';
import { PolymarketSettings } from '../components/polymarket/PolymarketSettings';

const mockApiGet = apiGet as ReturnType<typeof vi.fn>;
const mockApiPut = apiPut as ReturnType<typeof vi.fn>;
const mockShowToast = showToast as ReturnType<typeof vi.fn>;

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// PolymarketOverview
// ---------------------------------------------------------------------------
describe('PolymarketOverview', () => {
  it('shows prompt when no walletId', async () => {
    render(<PolymarketOverview walletId={null} />);
    await waitFor(() => {
      expect(screen.getByText('Select a wallet to view overview.')).toBeTruthy();
    });
  });

  it('shows loading state', () => {
    mockApiGet.mockReturnValue(new Promise(() => {}));
    render(<PolymarketOverview walletId="w1" />);
    expect(screen.getByText('Loading...')).toBeTruthy();
  });

  it('renders PnL cards and empty orders message', async () => {
    mockApiGet.mockImplementation((url: string) => {
      if (url.includes('/pnl')) return Promise.resolve({ pnl: { positionCount: 3, totalUnrealized: '42.5' } });
      if (url.includes('/balance')) return Promise.resolve({ tokenCount: 7 });
      if (url.includes('/orders')) return Promise.resolve({ orders: [] });
      return Promise.resolve({});
    });

    render(<PolymarketOverview walletId="w1" />);
    await waitFor(() => {
      expect(screen.queryByText('Loading...')).toBeNull();
    });

    expect(screen.getByText('Active Positions')).toBeTruthy();
    expect(screen.getByText('3')).toBeTruthy();
    expect(screen.getByText('42.5')).toBeTruthy();
    expect(screen.getByText('7')).toBeTruthy();
    expect(screen.getByText(/No Polymarket activity/)).toBeTruthy();
  });

  it('renders recent orders table when orders exist', async () => {
    mockApiGet.mockImplementation((url: string) => {
      if (url.includes('/pnl')) return Promise.resolve({ pnl: { positionCount: 1, totalUnrealized: '10' } });
      if (url.includes('/balance')) return Promise.resolve({ tokenCount: 2 });
      if (url.includes('/orders')) return Promise.resolve({
        orders: [
          { side: 'BUY', outcome: 'Yes', price: '0.65', size: '100', status: 'LIVE' },
        ],
      });
      return Promise.resolve({});
    });

    render(<PolymarketOverview walletId="w1" />);
    await waitFor(() => {
      expect(screen.getByText('Recent Orders')).toBeTruthy();
    });

    expect(screen.getByText('BUY')).toBeTruthy();
    expect(screen.getByText('Yes')).toBeTruthy();
    expect(screen.getByText('0.65')).toBeTruthy();
    expect(screen.getByText('LIVE')).toBeTruthy();
  });

  it('handles API errors gracefully', async () => {
    // apiGet catches errors internally and resolves to null
    mockApiGet.mockImplementation(() => Promise.reject(new Error('fail')));

    render(<PolymarketOverview walletId="w1" />);
    await waitFor(() => {
      expect(screen.queryByText('Loading...')).toBeNull();
    });

    // Should still render with fallback values (0 for counts)
    expect(screen.getByText('Active Positions')).toBeTruthy();
    expect(screen.getByText('Unrealized PnL')).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// PolymarketMarkets
// ---------------------------------------------------------------------------
describe('PolymarketMarkets', () => {
  it('shows loading state initially', () => {
    mockApiGet.mockReturnValue(new Promise(() => {}));
    render(<PolymarketMarkets />);
    expect(screen.getByText('Loading markets...')).toBeTruthy();
  });

  it('renders markets table', async () => {
    mockApiGet.mockResolvedValue({
      markets: [
        { conditionId: 'c1', question: 'Will X happen?', volume: '1000', liquidity: '500', endDate: '2026-12-31' },
      ],
    });

    render(<PolymarketMarkets />);
    await waitFor(() => {
      expect(screen.queryByText('Loading markets...')).toBeNull();
    });

    expect(screen.getByText('Will X happen?')).toBeTruthy();
    expect(screen.getByText('1000')).toBeTruthy();
    expect(screen.getByText('500')).toBeTruthy();
    expect(screen.getByText('2026-12-31')).toBeTruthy();
  });

  it('shows empty state when no markets', async () => {
    mockApiGet.mockResolvedValue({ markets: [] });

    render(<PolymarketMarkets />);
    await waitFor(() => {
      expect(screen.getByText('No markets found.')).toBeTruthy();
    });
  });

  it('filters by category', async () => {
    mockApiGet.mockResolvedValue({ markets: [] });

    render(<PolymarketMarkets />);
    await waitFor(() => {
      expect(screen.queryByText('Loading markets...')).toBeNull();
    });

    mockApiGet.mockClear();
    mockApiGet.mockResolvedValue({ markets: [] });

    const select = screen.getByDisplayValue('All Categories');
    fireEvent.change(select, { target: { value: 'crypto' } });

    await waitFor(() => {
      expect(mockApiGet).toHaveBeenCalledWith(expect.stringContaining('category=crypto'));
    });
  });

  it('handles search with debounce', async () => {
    vi.useFakeTimers();
    mockApiGet.mockResolvedValue({ markets: [] });

    render(<PolymarketMarkets />);
    await waitFor(() => {
      expect(screen.queryByText('Loading markets...')).toBeNull();
    });

    mockApiGet.mockClear();
    mockApiGet.mockResolvedValue({ markets: [] });

    const input = screen.getByPlaceholderText('Search markets...');
    fireEvent.input(input, { target: { value: 'election' } });

    // Should not call immediately (debounce)
    expect(mockApiGet).not.toHaveBeenCalled();

    // Advance timers past debounce
    vi.advanceTimersByTime(350);
    expect(mockApiGet).toHaveBeenCalledWith(expect.stringContaining('keyword=election'));

    vi.useRealTimers();
  });

  it('handles API error', async () => {
    mockApiGet.mockRejectedValue(new Error('fail'));

    render(<PolymarketMarkets />);
    await waitFor(() => {
      expect(screen.getByText('No markets found.')).toBeTruthy();
    });
  });
});

// ---------------------------------------------------------------------------
// PolymarketOrders
// ---------------------------------------------------------------------------
describe('PolymarketOrders', () => {
  it('shows prompt when no walletId', () => {
    render(<PolymarketOrders walletId={null} />);
    expect(screen.getByText('Select a wallet to view orders.')).toBeTruthy();
  });

  it('shows loading state', () => {
    mockApiGet.mockReturnValue(new Promise(() => {}));
    render(<PolymarketOrders walletId="w1" />);
    expect(screen.getByText('Loading orders...')).toBeTruthy();
  });

  it('renders orders table', async () => {
    mockApiGet.mockResolvedValue({
      orders: [
        { id: 'o1', market: 'Will Y?', side: 'SELL', type: 'LIMIT', price: '0.35', size: '50', status: 'MATCHED', createdAt: '2026-03-01' },
      ],
    });

    render(<PolymarketOrders walletId="w1" />);
    await waitFor(() => {
      expect(screen.queryByText('Loading orders...')).toBeNull();
    });

    expect(screen.getByText('Will Y?')).toBeTruthy();
    expect(screen.getByText('SELL')).toBeTruthy();
    expect(screen.getByText('LIMIT')).toBeTruthy();
    expect(screen.getByText('MATCHED')).toBeTruthy();
  });

  it('shows empty state', async () => {
    mockApiGet.mockResolvedValue({ orders: [] });

    render(<PolymarketOrders walletId="w1" />);
    await waitFor(() => {
      expect(screen.getByText('No orders found.')).toBeTruthy();
    });
  });

  it('filters by status', async () => {
    mockApiGet.mockResolvedValue({ orders: [] });

    render(<PolymarketOrders walletId="w1" />);
    await waitFor(() => {
      expect(screen.queryByText('Loading orders...')).toBeNull();
    });

    mockApiGet.mockClear();
    mockApiGet.mockResolvedValue({ orders: [] });

    const select = screen.getByDisplayValue('All');
    fireEvent.change(select, { target: { value: 'LIVE' } });

    await waitFor(() => {
      expect(mockApiGet).toHaveBeenCalledWith(expect.stringContaining('status=LIVE'));
    });
  });

  it('handles API error', async () => {
    mockApiGet.mockRejectedValue(new Error('fail'));

    render(<PolymarketOrders walletId="w1" />);
    await waitFor(() => {
      expect(screen.getByText('No orders found.')).toBeTruthy();
    });
  });
});

// ---------------------------------------------------------------------------
// PolymarketPositions
// ---------------------------------------------------------------------------
describe('PolymarketPositions', () => {
  it('shows prompt when no walletId', () => {
    render(<PolymarketPositions walletId={null} />);
    expect(screen.getByText('Select a wallet to view positions.')).toBeTruthy();
  });

  it('shows loading state', () => {
    mockApiGet.mockReturnValue(new Promise(() => {}));
    render(<PolymarketPositions walletId="w1" />);
    expect(screen.getByText('Loading positions...')).toBeTruthy();
  });

  it('renders active positions', async () => {
    mockApiGet.mockResolvedValue({
      positions: [
        { conditionId: 'c1', market: 'Market A', outcome: 'Yes', size: '100', avgPrice: '0.50', currentPrice: '0.70', unrealizedPnl: '20.00', resolved: false, redeemable: false },
      ],
    });

    render(<PolymarketPositions walletId="w1" />);
    await waitFor(() => {
      expect(screen.getByText('Active Positions')).toBeTruthy();
    });

    expect(screen.getByText('Market A')).toBeTruthy();
    expect(screen.getByText('0.50')).toBeTruthy();
    expect(screen.getByText('0.70')).toBeTruthy();
    expect(screen.getByText('20.00')).toBeTruthy();
  });

  it('renders resolved positions', async () => {
    mockApiGet.mockResolvedValue({
      positions: [
        { conditionId: 'c2', market: 'Market B', outcome: 'No', size: '50', avgPrice: '0.30', currentPrice: '0.00', unrealizedPnl: '-15.00', resolved: true, redeemable: true },
      ],
    });

    render(<PolymarketPositions walletId="w1" />);
    await waitFor(() => {
      expect(screen.getByText('Resolved Markets')).toBeTruthy();
    });

    expect(screen.getByText('Market B')).toBeTruthy();
    expect(screen.getByText('Yes')).toBeTruthy(); // redeemable
  });

  it('renders both active and resolved sections', async () => {
    mockApiGet.mockResolvedValue({
      positions: [
        { conditionId: 'c1', market: 'Active M', outcome: 'Yes', size: '10', avgPrice: '0.5', currentPrice: '0.6', unrealizedPnl: '1', resolved: false, redeemable: false },
        { conditionId: 'c2', market: 'Resolved M', outcome: 'No', size: '20', avgPrice: '0.3', currentPrice: '0', unrealizedPnl: '-6', resolved: true, redeemable: false },
      ],
    });

    render(<PolymarketPositions walletId="w1" />);
    await waitFor(() => {
      expect(screen.getByText('Active Positions')).toBeTruthy();
      expect(screen.getByText('Resolved Markets')).toBeTruthy();
    });
  });

  it('shows empty state when no positions', async () => {
    mockApiGet.mockResolvedValue({ positions: [] });

    render(<PolymarketPositions walletId="w1" />);
    await waitFor(() => {
      expect(screen.getByText('No positions.')).toBeTruthy();
    });
  });

  it('handles API error', async () => {
    mockApiGet.mockRejectedValue(new Error('fail'));

    render(<PolymarketPositions walletId="w1" />);
    await waitFor(() => {
      expect(screen.getByText('No positions.')).toBeTruthy();
    });
  });
});

// ---------------------------------------------------------------------------
// PolymarketSettings
// ---------------------------------------------------------------------------
describe('PolymarketSettings', () => {
  it('shows loading state', () => {
    mockApiGet.mockReturnValue(new Promise(() => {}));
    render(<PolymarketSettings />);
    expect(screen.getByText('Loading settings...')).toBeTruthy();
  });

  it('renders settings form with loaded values', async () => {
    mockApiGet.mockResolvedValue({
      settings: {
        'actions.polymarket_enabled': 'true',
        'actions.polymarket_default_fee_bps': '50',
        'actions.polymarket_order_expiry_seconds': '600',
      },
    });

    render(<PolymarketSettings />);
    await waitFor(() => {
      expect(screen.queryByText('Loading settings...')).toBeNull();
    });

    expect(screen.getByText('Enabled')).toBeTruthy();
    expect(screen.getByText('Default Fee (bps)')).toBeTruthy();
    expect(screen.getByText('Save Settings')).toBeTruthy();
  });

  it('saves settings successfully', async () => {
    mockApiGet.mockResolvedValue({
      settings: {
        'actions.polymarket_enabled': 'true',
        'actions.polymarket_default_fee_bps': '50',
      },
    });
    mockApiPut.mockResolvedValue({});

    render(<PolymarketSettings />);
    await waitFor(() => {
      expect(screen.queryByText('Loading settings...')).toBeNull();
    });

    fireEvent.click(screen.getByText('Save Settings'));
    await waitFor(() => {
      expect(mockApiPut).toHaveBeenCalledWith('/v1/admin/settings', {
        settings: expect.objectContaining({
          'actions.polymarket_enabled': 'true',
          'actions.polymarket_default_fee_bps': '50',
        }),
      });
    });

    expect(mockShowToast).toHaveBeenCalledWith('Polymarket settings saved', 'success');
  });

  it('shows error toast on save failure', async () => {
    mockApiGet.mockResolvedValue({ settings: { 'actions.polymarket_enabled': 'false' } });
    mockApiPut.mockRejectedValue(new Error('fail'));

    render(<PolymarketSettings />);
    await waitFor(() => {
      expect(screen.queryByText('Loading settings...')).toBeNull();
    });

    fireEvent.click(screen.getByText('Save Settings'));
    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith('Failed to save settings', 'error');
    });
  });

  it('shows error toast on load failure', async () => {
    mockApiGet.mockRejectedValue(new Error('fail'));

    render(<PolymarketSettings />);
    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith('Failed to load settings', 'error');
    });
  });

  it('renders all setting fields', async () => {
    mockApiGet.mockResolvedValue({
      settings: {},
    });

    render(<PolymarketSettings />);
    await waitFor(() => {
      expect(screen.queryByText('Loading settings...')).toBeNull();
    });

    // All 7 PM_KEYS labels should render
    expect(screen.getByText('Enabled')).toBeTruthy();
    expect(screen.getByText('Default Fee (bps)')).toBeTruthy();
    expect(screen.getByText('Order Expiry (seconds)')).toBeTruthy();
    expect(screen.getByText('Max Position (USDC)')).toBeTruthy();
    expect(screen.getByText('Proxy Wallet')).toBeTruthy();
    expect(screen.getByText('Neg Risk Enabled')).toBeTruthy();
    expect(screen.getByText('Auto Approve CTF')).toBeTruthy();
  });
});
