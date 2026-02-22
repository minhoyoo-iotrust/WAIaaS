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

vi.mock('../utils/error-messages', () => ({
  getErrorMessage: (code: string) => `Error: ${code}`,
}));

import { apiGet, apiPost, apiDelete, ApiError } from '../api/client';
import { showToast } from '../components/toast';
import TokensPage from '../pages/tokens';

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
  vi.mocked(apiGet).mockImplementation(() => Promise.resolve(response));
  vi.mocked(apiPost).mockImplementation(() => Promise.resolve({ id: 'new-id', network: 'ethereum-mainnet', address: '0xnew', symbol: 'NEW' }));
  vi.mocked(apiDelete).mockImplementation(() => Promise.resolve({ removed: true, network: 'ethereum-mainnet', address: '0x514910771AF9Ca656af840dff83E8264EcF986CA' }));
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

    // Both tokens displayed
    expect(screen.getByText('USDC')).toBeTruthy();
    expect(screen.getByText('USD Coin')).toBeTruthy();
    expect(screen.getByText('LINK')).toBeTruthy();
    expect(screen.getByText('Chainlink Token')).toBeTruthy();

    // Truncated addresses (first 6 + ... + last 4)
    expect(screen.getByText('0xA0b8...eB48')).toBeTruthy();
    expect(screen.getByText('0x5149...86CA')).toBeTruthy();

    // Decimals
    expect(screen.getByText('6')).toBeTruthy();
    expect(screen.getByText('18')).toBeTruthy();

    // Column headers
    expect(screen.getByText('Symbol')).toBeTruthy();
    expect(screen.getByText('Name')).toBeTruthy();
    expect(screen.getByText('Address')).toBeTruthy();
    expect(screen.getByText('Decimals')).toBeTruthy();
    expect(screen.getByText('Source')).toBeTruthy();
    expect(screen.getByText('Actions')).toBeTruthy();
  });

  it('shows loading state', () => {
    vi.mocked(apiGet).mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve(mockTokensResponse), 500)),
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

    // Find the network select dropdown
    const selects = screen.getAllByRole('combobox');
    const networkSelect = selects[0];

    // Change to polygon-mainnet
    fireEvent.change(networkSelect!, { target: { value: 'polygon-mainnet' } });

    await waitFor(() => {
      const calls = vi.mocked(apiGet).mock.calls;
      const lastCall = calls[calls.length - 1]?.[0] as string;
      expect(lastCall).toContain('network=polygon-mainnet');
    });
  });

  it('builtin tokens show Built-in badge and no delete button', async () => {
    render(<TokensPage />);

    await waitForTokenData();

    // USDC is builtin
    expect(screen.getByText('Built-in')).toBeTruthy();

    // The USDC row should show a dash (em-dash) for actions, not a Delete button
    const usdcRow = screen.getByText('USDC').closest('tr')!;
    const cells = usdcRow.querySelectorAll('td');
    const actionsCell = cells[cells.length - 1];
    expect(actionsCell!.textContent).toBe('\u2014');
  });

  it('custom tokens show Custom badge and delete button', async () => {
    render(<TokensPage />);

    await waitForTokenData();

    // LINK is custom
    expect(screen.getByText('Custom')).toBeTruthy();

    // LINK row should have a Delete button
    const linkRow = screen.getByText('LINK').closest('tr')!;
    const deleteBtn = linkRow.querySelector('button');
    expect(deleteBtn).toBeTruthy();
    expect(deleteBtn!.textContent).toBe('Delete');
  });

  it('add token form toggles visibility', async () => {
    render(<TokensPage />);

    await waitForTokenData();

    // Add form should not be visible initially
    expect(screen.queryByText('Add Custom Token')).toBeFalsy();

    // Click "Add Token" button
    fireEvent.click(screen.getByText('Add Token'));

    // Form should now be visible
    expect(screen.getByText('Add Custom Token')).toBeTruthy();
    expect(screen.getByLabelText('Contract Address')).toBeTruthy();
    expect(screen.getByLabelText('Symbol')).toBeTruthy();
    expect(screen.getByLabelText('Name')).toBeTruthy();
    expect(screen.getByLabelText('Decimals')).toBeTruthy();

    // Click Cancel to hide
    const cancelButtons = screen.getAllByText('Cancel');
    // The last Cancel is the form's Cancel button
    fireEvent.click(cancelButtons[cancelButtons.length - 1]!);

    expect(screen.queryByText('Add Custom Token')).toBeFalsy();
  });

  it('add token form submits and refreshes', async () => {
    render(<TokensPage />);

    await waitForTokenData();

    // Open form
    fireEvent.click(screen.getByText('Add Token'));

    // Fill fields
    fireEvent.input(screen.getByLabelText('Contract Address'), {
      target: { value: '0xNewTokenAddress' },
    });
    fireEvent.input(screen.getByLabelText('Symbol'), {
      target: { value: 'NEW' },
    });
    fireEvent.input(screen.getByLabelText('Name'), {
      target: { value: 'New Token' },
    });
    fireEvent.input(screen.getByLabelText('Decimals'), {
      target: { value: '8' },
    });

    // Submit
    fireEvent.click(screen.getByText('Submit'));

    await waitFor(() => {
      expect(apiPost).toHaveBeenCalledWith('/v1/tokens', {
        network: 'ethereum-mainnet',
        address: '0xNewTokenAddress',
        symbol: 'NEW',
        name: 'New Token',
        decimals: 8,
      });
    });

    // Should show success toast
    await waitFor(() => {
      expect(showToast).toHaveBeenCalledWith('success', 'Token NEW added successfully.');
    });

    // Form should close and re-fetch
    await waitFor(() => {
      expect(screen.queryByText('Add Custom Token')).toBeFalsy();
    });
  });

  it('delete custom token calls API and refreshes', async () => {
    render(<TokensPage />);

    await waitForTokenData();

    // Find and click Delete button on LINK row
    const linkRow = screen.getByText('LINK').closest('tr')!;
    const deleteBtn = linkRow.querySelector('button')!;
    fireEvent.click(deleteBtn);

    await waitFor(() => {
      expect(apiDelete).toHaveBeenCalledWith('/v1/tokens', {
        network: 'ethereum-mainnet',
        address: '0x514910771AF9Ca656af840dff83E8264EcF986CA',
      });
    });

    // Should show success toast
    await waitFor(() => {
      expect(showToast).toHaveBeenCalledWith('success', 'Token removed successfully.');
    });
  });

  it('shows error toast on API failure', async () => {
    vi.mocked(apiGet).mockImplementation(() =>
      Promise.reject(new ApiError(500, 'INTERNAL_ERROR', 'Server error')),
    );

    render(<TokensPage />);

    await waitFor(() => {
      expect(screen.getByText('Error: INTERNAL_ERROR')).toBeTruthy();
    });

    // Retry button should be visible
    expect(screen.getByText('Retry')).toBeTruthy();
  });
});
