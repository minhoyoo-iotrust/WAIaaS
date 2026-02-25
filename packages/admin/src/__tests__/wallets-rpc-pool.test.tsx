/**
 * Tests for RPC Pool multi-URL tab in Wallets page.
 *
 * 13 tests covering:
 * 1. Renders network sections with URLs from settings
 * 2. Add URL form appends to list
 * 3. Delete button removes user URL
 * 4. Built-in URLs show (built-in) label and no delete button
 * 5. Reorder buttons move URLs up/down
 * 6. Save sends rpc_pool.* JSON arrays via PUT /admin/settings
 * 7. Discard resets dirty state
 * 8. Displays available status for URLs from rpc-status polling
 * 9. Displays cooldown status with remaining time and failure count
 * 10. Test button calls POST /admin/settings/test-rpc with correct chain
 * 11. Test result displays latency and block number on success
 * 12. Test result displays error on failure
 * 13. formatCooldown via rendering (tested through cooldown display)
 *
 * @see packages/admin/src/pages/wallets.tsx
 */

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
import { showToast } from '../components/toast';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Settings response with rpc_pool data for testing */
function mockSettingsWithRpcPool(overrides: Record<string, string> = {}) {
  return {
    notifications: {},
    rpc: { evm_default_network: 'ethereum-sepolia' },
    security: {},
    daemon: {},
    walletconnect: {},
    oracle: {},
    display: {},
    autostop: {},
    monitoring: {},
    telegram: {},
    signing_sdk: {},
    gas_condition: {},
    rpc_pool: {
      mainnet: '["https://custom-solana.rpc.com"]',
      devnet: '[]',
      testnet: '[]',
      'ethereum-mainnet': '[]',
      'ethereum-sepolia': '[]',
      'polygon-mainnet': '[]',
      'polygon-amoy': '[]',
      'arbitrum-mainnet': '[]',
      'arbitrum-sepolia': '[]',
      'optimism-mainnet': '[]',
      'optimism-sepolia': '[]',
      'base-mainnet': '[]',
      'base-sepolia': '[]',
      ...overrides,
    },
    incoming: {},
    actions: {},
    policy: {},
  };
}

const mockWallets = {
  items: [],
  total: 0,
};

/** Default rpc-status response (all URLs unknown / empty) */
const defaultRpcStatusResponse = { networks: {} };

/** Navigate to wallets page and switch to RPC Endpoints tab */
async function renderAndNavigateToRpcTab(rpcStatusOverride?: Record<string, unknown>) {
  currentPath.value = '/wallets';

  const settingsData = mockSettingsWithRpcPool();
  const rpcStatusData = rpcStatusOverride ?? defaultRpcStatusResponse;

  vi.mocked(apiGet).mockImplementation((path: string) => {
    if (path === '/v1/wallets') return Promise.resolve(mockWallets);
    if (path === '/v1/admin/settings') return Promise.resolve(settingsData);
    if (path === '/v1/admin/rpc-status') return Promise.resolve(rpcStatusData);
    if (path.includes('/balance')) return Promise.resolve({ balances: [] });
    return Promise.resolve({});
  });

  render(<WalletsPage />);

  // Wait for wallets list to load
  await waitFor(() => {
    // The wallet list tab should render first
    expect(screen.getByText('RPC Endpoints')).toBeTruthy();
  });

  // Switch to RPC Endpoints tab
  fireEvent.click(screen.getByText('RPC Endpoints'));

  // Wait for settings to load
  await waitFor(() => {
    expect(screen.getByText('Solana Mainnet')).toBeTruthy();
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('RPC Pool multi-URL tab', () => {
  beforeEach(() => {
    currentPath.value = '/wallets';
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('should render network sections with URLs from settings', async () => {
    await renderAndNavigateToRpcTab();

    // Verify Solana and EVM subgroup titles
    expect(screen.getByText('Solana')).toBeTruthy();
    expect(screen.getByText('EVM')).toBeTruthy();

    // Verify network names appear (some appear in both network headers and EVM select options)
    expect(screen.getByText('Solana Mainnet')).toBeTruthy();
    expect(screen.getByText('Solana Devnet')).toBeTruthy();
    // 'Ethereum Mainnet' appears in both the network section header and the select option
    expect(screen.getAllByText('Ethereum Mainnet').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Ethereum Sepolia').length).toBeGreaterThanOrEqual(1);

    // Expand Solana Mainnet section to see URLs
    fireEvent.click(screen.getByText('Solana Mainnet'));

    await waitFor(() => {
      // Custom URL from settings should appear
      expect(screen.getByText('https://custom-solana.rpc.com')).toBeTruthy();
    });

    // Built-in URLs should also appear
    expect(screen.getByText('https://api.mainnet-beta.solana.com')).toBeTruthy();
  });

  it('should add URL via input form', async () => {
    await renderAndNavigateToRpcTab();

    // Expand Solana Devnet section
    fireEvent.click(screen.getByText('Solana Devnet'));

    await waitFor(() => {
      expect(screen.getByPlaceholderText('https://your-rpc-url.com')).toBeTruthy();
    });

    // Find the add URL input (multiple exist, one per expanded section)
    const addInputs = screen.getAllByPlaceholderText('https://your-rpc-url.com');
    const addInput = addInputs[0]; // First expanded section

    fireEvent.input(addInput, { target: { value: 'https://new-custom-rpc.com' } });

    // Click Add button
    const addButtons = screen.getAllByText('Add');
    fireEvent.click(addButtons[0]);

    await waitFor(() => {
      expect(screen.getByText('https://new-custom-rpc.com')).toBeTruthy();
    });
  });

  it('should delete user URL when delete button is clicked', async () => {
    await renderAndNavigateToRpcTab();

    // Expand Solana Mainnet to see custom URL
    fireEvent.click(screen.getByText('Solana Mainnet'));

    await waitFor(() => {
      expect(screen.getByText('https://custom-solana.rpc.com')).toBeTruthy();
    });

    // Find the delete button (x) for the custom URL row
    const removeButtons = screen.getAllByTitle('Remove');
    expect(removeButtons.length).toBeGreaterThan(0);
    fireEvent.click(removeButtons[0]);

    // Custom URL should be removed
    await waitFor(() => {
      expect(screen.queryByText('https://custom-solana.rpc.com')).toBeNull();
    });
  });

  it('should show (built-in) label for built-in URLs', async () => {
    await renderAndNavigateToRpcTab();

    // Expand Solana Mainnet
    fireEvent.click(screen.getByText('Solana Mainnet'));

    await waitFor(() => {
      // Built-in URLs should have the (built-in) badge
      const badges = screen.getAllByText('(built-in)');
      expect(badges.length).toBeGreaterThan(0);
    });

    // Built-in URLs should not have a "Remove" button, they should have On/Off toggle
    const toggleButtons = screen.getAllByTitle('Disable');
    expect(toggleButtons.length).toBeGreaterThan(0);
  });

  it('should reorder URLs with up/down buttons', async () => {
    // Settings with 2 custom URLs so we can test reordering
    const settingsData = mockSettingsWithRpcPool({
      mainnet: '["https://custom1.rpc.com","https://custom2.rpc.com"]',
    });

    vi.mocked(apiGet).mockImplementation((path: string) => {
      if (path === '/v1/wallets') return Promise.resolve(mockWallets);
      if (path === '/v1/admin/settings') return Promise.resolve(settingsData);
      if (path === '/v1/admin/rpc-status') return Promise.resolve(defaultRpcStatusResponse);
      return Promise.resolve({});
    });

    currentPath.value = '/wallets';
    render(<WalletsPage />);

    await waitFor(() => {
      expect(screen.getByText('RPC Endpoints')).toBeTruthy();
    });

    fireEvent.click(screen.getByText('RPC Endpoints'));

    await waitFor(() => {
      expect(screen.getByText('Solana Mainnet')).toBeTruthy();
    });

    // Expand Solana Mainnet
    fireEvent.click(screen.getByText('Solana Mainnet'));

    await waitFor(() => {
      expect(screen.getByText('https://custom1.rpc.com')).toBeTruthy();
      expect(screen.getByText('https://custom2.rpc.com')).toBeTruthy();
    });

    // Find down arrow buttons (Move down)
    const downButtons = screen.getAllByTitle('Move down');
    expect(downButtons.length).toBeGreaterThan(0);

    // Click down on first URL (custom1) to swap with custom2
    fireEvent.click(downButtons[0]);

    // After reorder, verify the testids show different order
    // The URL entries should be reordered in the DOM
    await waitFor(() => {
      const urlElements = screen.getAllByText(/https:\/\/custom[12]\.rpc\.com/);
      // custom2 should now be first
      expect(urlElements[0].textContent).toBe('https://custom2.rpc.com');
      expect(urlElements[1].textContent).toBe('https://custom1.rpc.com');
    });
  });

  it('should save rpc_pool.* JSON arrays via PUT /admin/settings', async () => {
    const settingsData = mockSettingsWithRpcPool();

    vi.mocked(apiGet).mockImplementation((path: string) => {
      if (path === '/v1/wallets') return Promise.resolve(mockWallets);
      if (path === '/v1/admin/settings') return Promise.resolve(settingsData);
      if (path === '/v1/admin/rpc-status') return Promise.resolve(defaultRpcStatusResponse);
      return Promise.resolve({});
    });

    vi.mocked(apiPut).mockResolvedValue({
      updated: 13,
      settings: settingsData,
    });

    currentPath.value = '/wallets';
    render(<WalletsPage />);

    await waitFor(() => {
      expect(screen.getByText('RPC Endpoints')).toBeTruthy();
    });

    fireEvent.click(screen.getByText('RPC Endpoints'));

    await waitFor(() => {
      expect(screen.getByText('Solana Mainnet')).toBeTruthy();
    });

    // Expand Solana Devnet and add a URL to make a change
    fireEvent.click(screen.getByText('Solana Devnet'));

    await waitFor(() => {
      expect(screen.getAllByPlaceholderText('https://your-rpc-url.com').length).toBeGreaterThan(0);
    });

    // Get add input for the expanded section
    const addInputs = screen.getAllByPlaceholderText('https://your-rpc-url.com');
    fireEvent.input(addInputs[0], { target: { value: 'https://my-devnet-rpc.com' } });
    const addButtons = screen.getAllByText('Add');
    fireEvent.click(addButtons[0]);

    // Save bar should appear
    await waitFor(() => {
      expect(screen.getByText('Save')).toBeTruthy();
    });

    fireEvent.click(screen.getByText('Save'));

    await waitFor(() => {
      expect(vi.mocked(apiPut)).toHaveBeenCalled();
    });

    // Verify the PUT call includes rpc_pool entries
    const putCall = vi.mocked(apiPut).mock.calls[0];
    expect(putCall[0]).toBe('/v1/admin/settings');
    const putBody = putCall[1] as { settings: { key: string; value: string }[] };
    const rpcPoolEntries = putBody.settings.filter((e: { key: string }) => e.key.startsWith('rpc_pool.'));
    expect(rpcPoolEntries.length).toBeGreaterThan(0);

    // Verify mainnet has the custom URL
    const mainnetEntry = rpcPoolEntries.find((e: { key: string }) => e.key === 'rpc_pool.mainnet');
    expect(mainnetEntry).toBeDefined();
    if (mainnetEntry) {
      const urls = JSON.parse(mainnetEntry.value);
      expect(urls).toContain('https://custom-solana.rpc.com');
    }
  });

  it('should discard changes and reset to original state', async () => {
    await renderAndNavigateToRpcTab();

    // Expand Solana Devnet and add a URL
    fireEvent.click(screen.getByText('Solana Devnet'));

    await waitFor(() => {
      expect(screen.getAllByPlaceholderText('https://your-rpc-url.com').length).toBeGreaterThan(0);
    });

    const addInputs = screen.getAllByPlaceholderText('https://your-rpc-url.com');
    fireEvent.input(addInputs[0], { target: { value: 'https://temp-url.com' } });
    const addButtons = screen.getAllByText('Add');
    fireEvent.click(addButtons[0]);

    // URL should appear
    await waitFor(() => {
      expect(screen.getByText('https://temp-url.com')).toBeTruthy();
    });

    // Click Discard
    fireEvent.click(screen.getByText('Discard'));

    // URL should disappear
    await waitFor(() => {
      expect(screen.queryByText('https://temp-url.com')).toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  // Plan 02: Live status display + per-URL test button
  // ---------------------------------------------------------------------------

  it('should display available status for URLs from rpc-status polling', async () => {
    const rpcStatus = {
      networks: {
        mainnet: [
          { url: 'https://custom-solana.rpc.com', status: 'available', failureCount: 0, cooldownRemainingMs: 0 },
          { url: 'https://api.mainnet-beta.solana.com', status: 'available', failureCount: 0, cooldownRemainingMs: 0 },
        ],
      },
    };

    await renderAndNavigateToRpcTab(rpcStatus);

    // Expand Solana Mainnet
    fireEvent.click(screen.getByText('Solana Mainnet'));

    await waitFor(() => {
      expect(screen.getByText('https://custom-solana.rpc.com')).toBeTruthy();
    });

    // Should show "Available" status text
    const availableTexts = screen.getAllByText('Available');
    expect(availableTexts.length).toBeGreaterThan(0);
  });

  it('should display cooldown status with remaining time and failure count', async () => {
    const rpcStatus = {
      networks: {
        mainnet: [
          { url: 'https://custom-solana.rpc.com', status: 'cooldown', failureCount: 2, cooldownRemainingMs: 45000 },
        ],
      },
    };

    await renderAndNavigateToRpcTab(rpcStatus);

    // Expand Solana Mainnet
    fireEvent.click(screen.getByText('Solana Mainnet'));

    await waitFor(() => {
      expect(screen.getByText('https://custom-solana.rpc.com')).toBeTruthy();
    });

    // Should show "Cooldown" status
    expect(screen.getByText('Cooldown')).toBeTruthy();

    // Should show remaining time "45s remaining"
    expect(screen.getByText('45s remaining')).toBeTruthy();

    // Should show failure count badge "2 fails"
    expect(screen.getByText('2 fails')).toBeTruthy();
  });

  it('should call POST /admin/settings/test-rpc with correct chain for Solana', async () => {
    vi.mocked(apiPost).mockResolvedValue({
      success: true,
      latencyMs: 42,
      blockNumber: 123456,
    });

    await renderAndNavigateToRpcTab();

    // Expand Solana Mainnet
    fireEvent.click(screen.getByText('Solana Mainnet'));

    await waitFor(() => {
      expect(screen.getByText('https://custom-solana.rpc.com')).toBeTruthy();
    });

    // Find and click the first Test button
    const testButtons = screen.getAllByText('Test');
    fireEvent.click(testButtons[0]);

    await waitFor(() => {
      expect(vi.mocked(apiPost)).toHaveBeenCalledWith(
        '/v1/admin/settings/test-rpc',
        { url: 'https://custom-solana.rpc.com', chain: 'solana' },
      );
    });
  });

  it('should display latency and block number on test success', async () => {
    vi.mocked(apiPost).mockResolvedValue({
      success: true,
      latencyMs: 42,
      blockNumber: 123456,
    });

    await renderAndNavigateToRpcTab();

    // Expand Solana Mainnet
    fireEvent.click(screen.getByText('Solana Mainnet'));

    await waitFor(() => {
      expect(screen.getByText('https://custom-solana.rpc.com')).toBeTruthy();
    });

    // Click Test button
    const testButtons = screen.getAllByText('Test');
    fireEvent.click(testButtons[0]);

    // Wait for test result to appear
    await waitFor(() => {
      expect(screen.getByText('OK')).toBeTruthy();
    });

    // Check latency and block number in rendered output
    expect(screen.getByText(/42ms/)).toBeTruthy();
    expect(screen.getByText(/block #123,456/)).toBeTruthy();
  });

  it('should display error message on test failure', async () => {
    vi.mocked(apiPost).mockResolvedValue({
      success: false,
      latencyMs: 0,
      error: 'Connection refused',
    });

    await renderAndNavigateToRpcTab();

    // Expand Solana Mainnet
    fireEvent.click(screen.getByText('Solana Mainnet'));

    await waitFor(() => {
      expect(screen.getByText('https://custom-solana.rpc.com')).toBeTruthy();
    });

    // Click Test button
    const testButtons = screen.getAllByText('Test');
    fireEvent.click(testButtons[0]);

    // Wait for FAIL result
    await waitFor(() => {
      expect(screen.getByText('FAIL')).toBeTruthy();
    });

    // Check error message
    expect(screen.getByText(/Connection refused/)).toBeTruthy();
  });

  it('should format cooldown times correctly via rendering', async () => {
    // Test various cooldown durations through the UI
    const rpcStatus = {
      networks: {
        mainnet: [
          { url: 'https://custom-solana.rpc.com', status: 'cooldown', failureCount: 3, cooldownRemainingMs: 125000 },
        ],
      },
    };

    await renderAndNavigateToRpcTab(rpcStatus);

    // Expand Solana Mainnet
    fireEvent.click(screen.getByText('Solana Mainnet'));

    await waitFor(() => {
      expect(screen.getByText('https://custom-solana.rpc.com')).toBeTruthy();
    });

    // 125000ms -> "2m 5s remaining"
    expect(screen.getByText('2m 5s remaining')).toBeTruthy();
    expect(screen.getByText('3 fails')).toBeTruthy();
  });
});
