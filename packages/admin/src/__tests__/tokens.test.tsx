import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent, cleanup } from '@testing-library/preact';

const mockApiGet = vi.fn();
const mockApiPost = vi.fn();
const mockApiDelete = vi.fn();

vi.mock('../api/typed-client', () => ({
  api: {
    GET: (...args: unknown[]) => mockApiGet(...args),
    POST: (...args: unknown[]) => mockApiPost(...args),
    PUT: vi.fn(),
    DELETE: (...args: unknown[]) => mockApiDelete(...args),
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

import { ApiError } from '../api/typed-client';
import { showToast } from '../components/toast';
import { TokensContent as TokensPage } from '../pages/tokens';

const mockTokensResponse = {
  network: 'ethereum-mainnet',
  tokens: [
    {
      address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
      symbol: 'USDC',
      name: 'USD Coin',
      decimals: 6,
      source: 'builtin' as const,
      assetId: null,
    },
    {
      address: '0x514910771AF9Ca656af840dff83E8264EcF986CA',
      symbol: 'LINK',
      name: 'Chainlink Token',
      decimals: 18,
      source: 'custom' as const,
      assetId: null,
    },
  ],
};

function setupMocks(response = mockTokensResponse) {
  mockApiGet.mockImplementation(() => Promise.resolve({ data: response }));
  mockApiPost.mockImplementation(() => Promise.resolve({ data: { id: 'new-id', network: 'ethereum-mainnet', address: '0xnew', symbol: 'NEW' } }));
  mockApiDelete.mockImplementation(() => Promise.resolve({ data: { removed: true, network: 'ethereum-mainnet', address: '0x514910771AF9Ca656af840dff83E8264EcF986CA' } }));
}

async function waitForTokenData() {
  await waitFor(() => {
    expect(screen.getByText('USDC')).toBeTruthy();
  });
}

describe('TokensPage', () => {
  beforeEach(() => {
    setupMocks();
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('renders token table with builtin and custom tokens', async () => {
    render(<TokensPage />);
    await waitForTokenData();

    expect(screen.getByText('USDC')).toBeTruthy();
    expect(screen.getByText('USD Coin')).toBeTruthy();
    expect(screen.getByText('LINK')).toBeTruthy();
    expect(screen.getByText('Chainlink Token')).toBeTruthy();
    expect(screen.getByText('0xA0b8...eB48')).toBeTruthy();
    expect(screen.getByText('0x5149...86CA')).toBeTruthy();
    expect(screen.getByText('6')).toBeTruthy();
    expect(screen.getByText('18')).toBeTruthy();
    expect(screen.getByText('Symbol')).toBeTruthy();
    expect(screen.getByText('Name')).toBeTruthy();
    expect(screen.getByText('Address')).toBeTruthy();
    expect(screen.getByText('Decimals')).toBeTruthy();
    expect(screen.getByText('Source')).toBeTruthy();
    expect(screen.getByText('Actions')).toBeTruthy();
  });

  it('shows loading state', () => {
    mockApiGet.mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve({ data: mockTokensResponse }), 500)),
    );
    render(<TokensPage />);
    expect(screen.getByText('Loading...')).toBeTruthy();
  });

  it('shows empty state when no tokens', async () => {
    setupMocks({ network: 'ethereum-mainnet', tokens: [] });
    render(<TokensPage />);
    await waitFor(() => {
      expect(screen.getByText('No tokens found for this network')).toBeTruthy();
    });
  });

  it('network dropdown changes trigger re-fetch', async () => {
    render(<TokensPage />);
    await waitForTokenData();

    const selects = screen.getAllByRole('combobox');
    const networkSelect = selects[0];
    fireEvent.change(networkSelect!, { target: { value: 'polygon-mainnet' } });

    await waitFor(() => {
      const calls = mockApiGet.mock.calls;
      const lastCall = calls[calls.length - 1];
      const opts = lastCall?.[1] as { params?: { query?: Record<string, unknown> } };
      expect(opts?.params?.query?.network).toBe('polygon-mainnet');
    });
  });

  it('builtin tokens show Built-in badge and no delete button', async () => {
    render(<TokensPage />);
    await waitForTokenData();
    expect(screen.getByText('Built-in')).toBeTruthy();
    const usdcRow = screen.getByText('USDC').closest('tr')!;
    const cells = usdcRow.querySelectorAll('td');
    const actionsCell = cells[cells.length - 1];
    expect(actionsCell!.textContent).toBe('\u2014');
  });

  it('custom tokens show Custom badge and delete button', async () => {
    render(<TokensPage />);
    await waitForTokenData();
    expect(screen.getByText('Custom')).toBeTruthy();
    const linkRow = screen.getByText('LINK').closest('tr')!;
    const deleteBtn = linkRow.querySelector('button');
    expect(deleteBtn).toBeTruthy();
    expect(deleteBtn!.textContent).toBe('Delete');
  });

  it('add token form toggles visibility', async () => {
    render(<TokensPage />);
    await waitForTokenData();
    expect(screen.queryByText('Add Custom Token')).toBeFalsy();
    fireEvent.click(screen.getByText('Add Token'));
    expect(screen.getByText('Add Custom Token')).toBeTruthy();
    const cancelButtons = screen.getAllByText('Cancel');
    fireEvent.click(cancelButtons[cancelButtons.length - 1]!);
    expect(screen.queryByText('Add Custom Token')).toBeFalsy();
  });

  it('add token form submits and refreshes', async () => {
    render(<TokensPage />);
    await waitForTokenData();
    fireEvent.click(screen.getByText('Add Token'));

    fireEvent.input(screen.getByLabelText('Contract Address'), { target: { value: '0xNewTokenAddress' } });
    fireEvent.input(screen.getByLabelText('Symbol'), { target: { value: 'NEW' } });
    fireEvent.input(screen.getByLabelText('Name'), { target: { value: 'New Token' } });
    fireEvent.input(screen.getByLabelText('Decimals'), { target: { value: '8' } });

    fireEvent.click(screen.getByText('Submit'));

    await waitFor(() => {
      expect(mockApiPost).toHaveBeenCalledWith('/v1/tokens', expect.objectContaining({
        body: {
          network: 'ethereum-mainnet',
          address: '0xNewTokenAddress',
          symbol: 'NEW',
          name: 'New Token',
          decimals: 8,
        },
      }));
    });

    await waitFor(() => {
      expect(showToast).toHaveBeenCalledWith('success', 'Token NEW added successfully.');
    });
  });

  it('delete custom token calls API and refreshes', async () => {
    render(<TokensPage />);
    await waitForTokenData();
    const linkRow = screen.getByText('LINK').closest('tr')!;
    const deleteBtn = linkRow.querySelector('button')!;
    fireEvent.click(deleteBtn);

    await waitFor(() => {
      expect(mockApiDelete).toHaveBeenCalledWith('/v1/tokens', expect.objectContaining({
        body: {
          network: 'ethereum-mainnet',
          address: '0x514910771AF9Ca656af840dff83E8264EcF986CA',
        },
      }));
    });

    await waitFor(() => {
      expect(showToast).toHaveBeenCalledWith('success', 'Token removed successfully.');
    });
  });

  it('shows error toast on API failure', async () => {
    mockApiGet.mockImplementation(() =>
      Promise.reject(new ApiError(500, 'INTERNAL_ERROR', 'Server error')),
    );
    render(<TokensPage />);
    await waitFor(() => {
      expect(screen.getByText('Error: INTERNAL_ERROR')).toBeTruthy();
    });
    expect(screen.getByText('Retry')).toBeTruthy();
  });
});
