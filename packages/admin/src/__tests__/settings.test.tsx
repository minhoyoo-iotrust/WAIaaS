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

import { apiGet, apiPost, apiPut, ApiError } from '../api/client';
import { showToast } from '../components/toast';
import SettingsPage from '../pages/settings';

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

const mockKillSwitchActive = {
  state: 'ACTIVE',
  activatedAt: null,
  activatedBy: null,
};

const mockKillSwitchSuspended = {
  state: 'SUSPENDED',
  activatedAt: 1707609600,
  activatedBy: 'admin',
};

const mockKillSwitchLocked = {
  state: 'LOCKED',
  activatedAt: 1707609600,
  activatedBy: 'admin',
};

const mockSettingsResponse = {
  notifications: {
    enabled: 'false',
    telegram_bot_token: true, // credential: configured
    telegram_chat_id: '12345',
    discord_webhook_url: false, // credential: not configured
    ntfy_server: 'https://ntfy.sh',
    ntfy_topic: '',
    locale: 'en',
    rate_limit_rpm: '20',
  },
  rpc: {
    solana_mainnet: 'https://api.mainnet-beta.solana.com',
    solana_devnet: 'https://api.devnet.solana.com',
    solana_testnet: 'https://api.testnet.solana.com',
    evm_ethereum_mainnet: 'https://eth.drpc.org',
    evm_ethereum_sepolia: 'https://sepolia.drpc.org',
    evm_polygon_mainnet: 'https://polygon.drpc.org',
    evm_polygon_amoy: 'https://polygon-amoy.drpc.org',
    evm_arbitrum_mainnet: 'https://arbitrum.drpc.org',
    evm_arbitrum_sepolia: 'https://arbitrum-sepolia.drpc.org',
    evm_optimism_mainnet: 'https://optimism.drpc.org',
    evm_optimism_sepolia: 'https://optimism-sepolia.drpc.org',
    evm_base_mainnet: 'https://base.drpc.org',
    evm_base_sepolia: 'https://base-sepolia.drpc.org',
    evm_default_network: 'ethereum-sepolia',
  },
  security: {
    session_ttl: '86400',
    max_sessions_per_wallet: '5',
    max_pending_tx: '10',
    rate_limit_global_ip_rpm: '1000',
    rate_limit_session_rpm: '300',
    rate_limit_tx_rpm: '10',
    policy_defaults_delay_seconds: '300',
    policy_defaults_approval_timeout: '3600',
  },
  daemon: {
    log_level: 'info',
  },
  walletconnect: {
    project_id: '',
  },
};

// ---------------------------------------------------------------------------
// Helper: mount with both API mocks satisfied
// ---------------------------------------------------------------------------

function mockApiCalls(ksState = mockKillSwitchActive) {
  vi.mocked(apiGet).mockImplementation(async (path: string) => {
    if (path === '/v1/admin/kill-switch') return ksState;
    if (path === '/v1/admin/settings') return mockSettingsResponse;
    if (path === '/v1/admin/api-keys') return { keys: [] };
    return {};
  });
}

async function renderAndWaitForLoad() {
  render(<SettingsPage />);
  // Wait until loading finishes (Notifications heading appears)
  await waitFor(() => {
    expect(screen.getByText('Notifications')).toBeTruthy();
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('SettingsPage', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  // ---- Test 1: Renders all 5 category sections ----
  it('renders all 5 category sections', async () => {
    mockApiCalls();
    await renderAndWaitForLoad();

    expect(screen.getByText('Notifications')).toBeTruthy();
    expect(screen.getByText('RPC Endpoints')).toBeTruthy();
    expect(screen.getByText('Security Parameters')).toBeTruthy();
    expect(screen.getByText('WalletConnect')).toBeTruthy();
    expect(screen.getByText('Daemon')).toBeTruthy();
  });

  // ---- Test 2: Renders notification fields with credential masking ----
  it('renders notification fields with credential masking', async () => {
    mockApiCalls();
    await renderAndWaitForLoad();

    // telegram_bot_token is true (configured) -> input should have "(configured)" placeholder
    const tokenInput = document.querySelector('input[name="notifications.telegram_bot_token"]') as HTMLInputElement;
    expect(tokenInput).toBeTruthy();
    expect(tokenInput.placeholder).toBe('(configured)');
    // Value should be empty because credential fields return boolean, not actual value
    expect(tokenInput.value).toBe('');

    // discord_webhook_url is false (not configured) -> empty placeholder
    const discordInput = document.querySelector('input[name="notifications.discord_webhook_url"]') as HTMLInputElement;
    expect(discordInput).toBeTruthy();
    expect(discordInput.placeholder).toBe('');

    // telegram_chat_id is a normal field with value '12345'
    const chatIdInput = document.querySelector('input[name="notifications.telegram_chat_id"]') as HTMLInputElement;
    expect(chatIdInput).toBeTruthy();
    expect(chatIdInput.value).toBe('12345');
  });

  // ---- Test 3: Renders RPC endpoint URLs ----
  it('renders RPC endpoint URLs', async () => {
    mockApiCalls();
    await renderAndWaitForLoad();

    // Solana Mainnet URL should be displayed
    const solMainnetInput = document.querySelector('input[name="rpc.solana_mainnet"]') as HTMLInputElement;
    expect(solMainnetInput).toBeTruthy();
    expect(solMainnetInput.value).toBe('https://api.mainnet-beta.solana.com');

    // Test buttons exist for RPC fields
    const testButtons = screen.getAllByText('Test');
    // 13 RPC URL fields (3 solana + 10 evm) = 13 Test buttons
    expect(testButtons.length).toBe(13);
  });

  // ---- Test 4: Renders security parameter fields ----
  it('renders security parameter fields', async () => {
    mockApiCalls();
    await renderAndWaitForLoad();

    // Session TTL should show 86400
    const sessionTtl = document.querySelector('input[name="security.session_ttl"]') as HTMLInputElement;
    expect(sessionTtl).toBeTruthy();
    expect(sessionTtl.value).toBe('86400');

    // Max sessions per wallet
    const maxSessions = document.querySelector('input[name="security.max_sessions_per_wallet"]') as HTMLInputElement;
    expect(maxSessions).toBeTruthy();
    expect(maxSessions.value).toBe('5');
  });

  // ---- Test 5: Renders WalletConnect section with info box ----
  it('renders WalletConnect section with info box', async () => {
    mockApiCalls();
    await renderAndWaitForLoad();

    expect(screen.getByText('WalletConnect')).toBeTruthy();
    // Info box references cloud.walletconnect.com
    const link = document.querySelector('a[href="https://cloud.walletconnect.com"]');
    expect(link).toBeTruthy();
  });

  // ---- Test 6: Renders daemon log_level select ----
  it('renders daemon log_level select', async () => {
    mockApiCalls();
    await renderAndWaitForLoad();

    const logLevelSelect = document.querySelector('select[name="daemon.log_level"]') as HTMLSelectElement;
    expect(logLevelSelect).toBeTruthy();
    expect(logLevelSelect.value).toBe('info');

    // Should have 4 options: debug, info, warn, error
    const options = logLevelSelect.querySelectorAll('option');
    expect(options.length).toBe(4);
  });

  // ---- Test 7: Shows save bar when field is modified ----
  it('shows save bar when field is modified', async () => {
    mockApiCalls();
    await renderAndWaitForLoad();

    // Save bar should not be visible initially
    expect(screen.queryByText(/unsaved/i)).toBeNull();

    // Modify session_ttl
    const sessionTtl = document.querySelector('input[name="security.session_ttl"]') as HTMLInputElement;
    fireEvent.input(sessionTtl, { target: { value: '7200' } });

    // Save bar should now appear
    await waitFor(() => {
      expect(screen.getByText(/unsaved/i)).toBeTruthy();
    });
  });

  // ---- Test 8: Saves settings via PUT and clears dirty state ----
  it('saves settings via PUT and clears dirty state', async () => {
    mockApiCalls();
    await renderAndWaitForLoad();

    // Modify a field
    const sessionTtl = document.querySelector('input[name="security.session_ttl"]') as HTMLInputElement;
    fireEvent.input(sessionTtl, { target: { value: '7200' } });

    await waitFor(() => {
      expect(screen.getByText(/unsaved/i)).toBeTruthy();
    });

    // Mock PUT success and re-fetch
    vi.mocked(apiPut).mockResolvedValueOnce(undefined);

    // Click Save
    fireEvent.click(screen.getByText('Save'));

    await waitFor(() => {
      expect(vi.mocked(apiPut)).toHaveBeenCalledWith('/v1/admin/settings', {
        settings: [{ key: 'security.session_ttl', value: '7200' }],
      });
    });

    // After save, toast shows success
    await waitFor(() => {
      expect(vi.mocked(showToast)).toHaveBeenCalledWith('success', 'Settings saved and applied');
    });
  });

  // ---- Test 9: Discards changes on discard click ----
  it('discards changes on discard click', async () => {
    mockApiCalls();
    await renderAndWaitForLoad();

    // Modify a field
    const sessionTtl = document.querySelector('input[name="security.session_ttl"]') as HTMLInputElement;
    fireEvent.input(sessionTtl, { target: { value: '7200' } });

    await waitFor(() => {
      expect(screen.getByText(/unsaved/i)).toBeTruthy();
    });

    // Click Discard
    fireEvent.click(screen.getByText('Discard'));

    // Save bar should disappear
    await waitFor(() => {
      expect(screen.queryByText(/unsaved/i)).toBeNull();
    });

    // Field should revert to original value
    const sessionTtlAfter = document.querySelector('input[name="security.session_ttl"]') as HTMLInputElement;
    expect(sessionTtlAfter.value).toBe('86400');
  });

  // ---- Test 10: Tests RPC connectivity ----
  it('tests RPC connectivity', async () => {
    mockApiCalls();
    await renderAndWaitForLoad();

    // Mock apiPost for test-rpc
    vi.mocked(apiPost).mockResolvedValueOnce({
      success: true,
      latencyMs: 42,
      blockNumber: 123456,
    });

    // Find the first Test button (Solana Mainnet)
    const testButtons = screen.getAllByText('Test');
    expect(testButtons.length).toBeGreaterThan(0);
    fireEvent.click(testButtons[0]!);

    await waitFor(() => {
      expect(vi.mocked(apiPost)).toHaveBeenCalledWith('/v1/admin/settings/test-rpc', {
        url: 'https://api.mainnet-beta.solana.com',
        chain: 'solana',
      });
    });

    // Result badge should appear
    await waitFor(() => {
      expect(screen.getByText('OK')).toBeTruthy();
      expect(screen.getByText('42ms')).toBeTruthy();
    });
  });

  // ---- Test 11: Tests notification delivery ----
  it('tests notification delivery', async () => {
    mockApiCalls();
    await renderAndWaitForLoad();

    // Mock apiPost for notification test
    vi.mocked(apiPost).mockResolvedValueOnce({
      results: [
        { channel: 'telegram', success: true },
        { channel: 'discord', success: false, error: 'Not configured' },
      ],
    });

    fireEvent.click(screen.getByText('Test Notification'));

    await waitFor(() => {
      expect(vi.mocked(apiPost)).toHaveBeenCalledWith('/v1/admin/notifications/test', {});
    });

    // Results displayed
    await waitFor(() => {
      expect(screen.getByText('telegram')).toBeTruthy();
      expect(screen.getByText('discord')).toBeTruthy();
    });
  });

  // ---- Test 12: Handles API error on save ----
  it('handles API error on save', async () => {
    mockApiCalls();
    await renderAndWaitForLoad();

    // Modify a field
    const sessionTtl = document.querySelector('input[name="security.session_ttl"]') as HTMLInputElement;
    fireEvent.input(sessionTtl, { target: { value: '7200' } });

    await waitFor(() => {
      expect(screen.getByText(/unsaved/i)).toBeTruthy();
    });

    // Mock PUT to throw ApiError
    const MockApiError = (await import('../api/client')).ApiError;
    vi.mocked(apiPut).mockRejectedValueOnce(new MockApiError(400, 'VALIDATION_ERROR', 'Invalid value'));

    // Click Save
    fireEvent.click(screen.getByText('Save'));

    await waitFor(() => {
      expect(vi.mocked(showToast)).toHaveBeenCalledWith('error', 'Error: VALIDATION_ERROR');
    });
  });

  // ---- Test 13: ACTIVE state renders Activate Kill Switch button ----
  it('renders Activate Kill Switch button in ACTIVE state', async () => {
    mockApiCalls(mockKillSwitchActive);
    await renderAndWaitForLoad();

    // Kill switch section heading
    expect(screen.getByText('Kill Switch')).toBeTruthy();

    // State badge shows ACTIVE with success variant
    await waitFor(() => {
      expect(screen.getByText('ACTIVE')).toBeTruthy();
    });

    // Activate button present
    expect(screen.getByText('Activate Kill Switch')).toBeTruthy();

    // No Recover or Escalate buttons
    expect(screen.queryByText('Recover')).toBeNull();
    expect(screen.queryByText('Escalate to LOCKED')).toBeNull();
  });

  // ---- Test 14: Keeps existing shutdown controls ----
  it('keeps existing shutdown controls', async () => {
    mockApiCalls();
    await renderAndWaitForLoad();

    expect(screen.getByText('Shutdown Daemon')).toBeTruthy();
    expect(screen.getByText('Danger Zone')).toBeTruthy();
  });

  // ---- Test 15: SUSPENDED state renders Recover and Escalate buttons ----
  it('renders Recover and Escalate buttons in SUSPENDED state', async () => {
    mockApiCalls(mockKillSwitchSuspended);
    await renderAndWaitForLoad();

    await waitFor(() => {
      expect(screen.getByText('SUSPENDED')).toBeTruthy();
    });

    // Recover and Escalate buttons present
    expect(screen.getByText('Recover')).toBeTruthy();
    expect(screen.getByText('Escalate to LOCKED')).toBeTruthy();

    // No Activate button
    expect(screen.queryByText('Activate Kill Switch')).toBeNull();
  });

  // ---- Test 16: LOCKED state renders Recover from LOCKED button ----
  it('renders Recover from LOCKED button in LOCKED state', async () => {
    mockApiCalls(mockKillSwitchLocked);
    await renderAndWaitForLoad();

    await waitFor(() => {
      expect(screen.getByText('LOCKED')).toBeTruthy();
    });

    // Recover from LOCKED button present
    expect(screen.getByText('Recover from LOCKED (5s wait)')).toBeTruthy();

    // No Activate or Escalate buttons
    expect(screen.queryByText('Activate Kill Switch')).toBeNull();
    expect(screen.queryByText('Escalate to LOCKED')).toBeNull();
  });

  // ---- Test 17: Activate calls POST /v1/admin/kill-switch ----
  it('calls POST /v1/admin/kill-switch on activate', async () => {
    mockApiCalls(mockKillSwitchActive);
    vi.mocked(apiPost).mockResolvedValueOnce({ state: 'SUSPENDED' });
    await renderAndWaitForLoad();

    await waitFor(() => {
      expect(screen.getByText('Activate Kill Switch')).toBeTruthy();
    });

    fireEvent.click(screen.getByText('Activate Kill Switch'));

    await waitFor(() => {
      expect(vi.mocked(apiPost)).toHaveBeenCalledWith('/v1/admin/kill-switch');
    });

    await waitFor(() => {
      expect(vi.mocked(showToast)).toHaveBeenCalledWith('success', 'Kill switch activated - all operations suspended');
    });
  });

  // ---- Test 18: Escalate calls POST /v1/admin/kill-switch/escalate ----
  it('calls POST /v1/admin/kill-switch/escalate on escalate', async () => {
    mockApiCalls(mockKillSwitchSuspended);
    vi.mocked(apiPost).mockResolvedValueOnce({ state: 'LOCKED' });
    await renderAndWaitForLoad();

    await waitFor(() => {
      expect(screen.getByText('Escalate to LOCKED')).toBeTruthy();
    });

    fireEvent.click(screen.getByText('Escalate to LOCKED'));

    await waitFor(() => {
      expect(vi.mocked(apiPost)).toHaveBeenCalledWith('/v1/admin/kill-switch/escalate');
    });

    await waitFor(() => {
      expect(vi.mocked(showToast)).toHaveBeenCalledWith('success', 'Kill switch escalated to LOCKED');
    });
  });

  // ---- Test 19: Recover calls POST /v1/admin/recover ----
  it('calls POST /v1/admin/recover on recover', async () => {
    mockApiCalls(mockKillSwitchSuspended);
    vi.mocked(apiPost).mockResolvedValueOnce({ state: 'ACTIVE' });
    await renderAndWaitForLoad();

    await waitFor(() => {
      expect(screen.getByText('Recover')).toBeTruthy();
    });

    fireEvent.click(screen.getByText('Recover'));

    await waitFor(() => {
      expect(vi.mocked(apiPost)).toHaveBeenCalledWith('/v1/admin/recover');
    });

    await waitFor(() => {
      expect(vi.mocked(showToast)).toHaveBeenCalledWith('success', 'Kill switch recovered - operations resumed');
    });
  });
});
