/**
 * settings-coverage.test.tsx
 *
 * Supplemental coverage tests for settings.tsx uncovered functions:
 * - handleRpcTest (solana/evm, empty URL, error)
 * - handleNotifTest (all success, partial failure, empty, error)
 * - handleSaveApiKey / handleDeleteApiKey
 * - handleKillSwitchActivate / Escalate / Recover (error branches)
 * - handleRotate
 * - handleShutdown
 * - getEffectiveValue / getEffectiveBoolValue / isCredentialConfigured / handleFieldChange
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

vi.mock('../components/currency-select', () => ({
  CurrencySelect: ({ value, onChange }: { value: string; onChange: (code: string) => void }) => (
    <select
      data-testid="currency-select"
      value={value}
      onChange={(e) => onChange((e.target as HTMLSelectElement).value)}
    >
      <option value="USD">USD</option>
      <option value="KRW">KRW</option>
    </select>
  ),
}));

import { apiGet, apiPost, apiPut, apiDelete, ApiError } from '../api/client';
import { showToast } from '../components/toast';
import SettingsPage from '../pages/settings';

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

const mockSettingsResponse = {
  notifications: {
    enabled: 'true',
    telegram_bot_token: true,
    telegram_chat_id: '12345',
    discord_webhook_url: false,
    slack_webhook_url: true,
    ntfy_server: 'https://ntfy.sh',
    ntfy_topic: 'waiaas',
    locale: 'en',
    rate_limit_rpm: '20',
  },
  rpc: {
    solana_mainnet: 'https://api.mainnet-beta.solana.com',
    solana_devnet: 'https://api.devnet.solana.com',
    solana_testnet: '',
    evm_ethereum_mainnet: 'https://eth.drpc.org',
    evm_ethereum_sepolia: 'https://sepolia.drpc.org',
    evm_polygon_mainnet: '',
    evm_polygon_amoy: '',
    evm_arbitrum_mainnet: '',
    evm_arbitrum_sepolia: '',
    evm_optimism_mainnet: '',
    evm_optimism_sepolia: '',
    evm_base_mainnet: '',
    evm_base_sepolia: '',
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
    default_deny_tokens: 'true',
    default_deny_contracts: 'true',
    default_deny_spenders: 'false',
  },
  daemon: { log_level: 'info' },
  walletconnect: { project_id: '' },
  telegram: { enabled: 'false', bot_token: true, locale: 'en' },
  display: { currency: 'USD' },
  autostop: {
    enabled: 'true',
    consecutive_failures_threshold: '5',
    unusual_activity_threshold: '20',
    unusual_activity_window_sec: '300',
    idle_timeout_sec: '3600',
    idle_check_interval_sec: '60',
  },
  monitoring: {
    enabled: 'true',
    check_interval_sec: '300',
    low_balance_threshold_sol: '0.01',
    low_balance_threshold_eth: '0.005',
    cooldown_hours: '24',
  },
};

const mockKsActive = { state: 'ACTIVE', activatedAt: null, activatedBy: null };
const mockKsSuspended = { state: 'SUSPENDED', activatedAt: 1707609600, activatedBy: 'admin' };
const mockKsLocked = { state: 'LOCKED', activatedAt: 1707609600, activatedBy: 'admin' };

const mockApiKeys = {
  keys: [
    { providerName: 'coingecko', hasKey: true, maskedKey: 'CG-****abc', requiresApiKey: false, updatedAt: '2026-01-01' },
    { providerName: 'openai', hasKey: false, maskedKey: null, requiresApiKey: true, updatedAt: null },
  ],
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mockApiCalls(ksState = mockKsActive, apiKeysData = mockApiKeys) {
  vi.mocked(apiGet).mockImplementation(async (path: string) => {
    if (path === '/v1/admin/settings') return mockSettingsResponse;
    if (path === '/v1/admin/kill-switch') return ksState;
    if (path === '/v1/admin/api-keys') return apiKeysData;
    return {};
  });
}

async function renderAndWait() {
  render(<SettingsPage />);
  await waitFor(() => {
    expect(screen.getByText('Notifications')).toBeTruthy();
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Settings coverage: handleRpcTest', () => {
  afterEach(() => { cleanup(); vi.clearAllMocks(); });

  it('tests Solana RPC with chain=solana', async () => {
    mockApiCalls();
    await renderAndWait();

    vi.mocked(apiPost).mockResolvedValueOnce({
      success: true, latencyMs: 55, blockNumber: 999999,
    });

    // Click "Test" for solana_mainnet (first Test button)
    const testButtons = screen.getAllByText('Test');
    fireEvent.click(testButtons[0]!);

    await waitFor(() => {
      expect(vi.mocked(apiPost)).toHaveBeenCalledWith('/v1/admin/settings/test-rpc', {
        url: 'https://api.mainnet-beta.solana.com',
        chain: 'solana',
      });
    });

    await waitFor(() => {
      expect(screen.getByText('55ms')).toBeTruthy();
    });
  });

  it('tests EVM RPC with chain=evm', async () => {
    mockApiCalls();
    await renderAndWait();

    vi.mocked(apiPost).mockResolvedValueOnce({
      success: true, latencyMs: 30, blockNumber: 12345678,
    });

    // EVM test buttons start at index 3 (after 3 Solana)
    const testButtons = screen.getAllByText('Test');
    fireEvent.click(testButtons[3]!); // evm_ethereum_mainnet

    await waitFor(() => {
      expect(vi.mocked(apiPost)).toHaveBeenCalledWith('/v1/admin/settings/test-rpc', {
        url: 'https://eth.drpc.org',
        chain: 'evm',
      });
    });
  });

  it('shows warning for empty RPC URL', async () => {
    mockApiCalls();
    await renderAndWait();

    // solana_testnet has empty URL
    const testButtons = screen.getAllByText('Test');
    fireEvent.click(testButtons[2]!); // solana_testnet

    await waitFor(() => {
      expect(vi.mocked(showToast)).toHaveBeenCalledWith('warning', 'Enter a URL before testing');
    });
    // apiPost should NOT have been called
    expect(vi.mocked(apiPost)).not.toHaveBeenCalled();
  });

  it('handles RPC test failure', async () => {
    mockApiCalls();
    await renderAndWait();

    vi.mocked(apiPost).mockRejectedValueOnce(new Error('Network error'));

    const testButtons = screen.getAllByText('Test');
    fireEvent.click(testButtons[0]!);

    await waitFor(() => {
      expect(screen.getByText('FAIL')).toBeTruthy();
    });
  });
});

describe('Settings coverage: handleNotifTest', () => {
  afterEach(() => { cleanup(); vi.clearAllMocks(); });

  it('shows success toast when all channels pass', async () => {
    mockApiCalls();
    await renderAndWait();

    vi.mocked(apiPost).mockResolvedValueOnce({
      results: [
        { channel: 'telegram', success: true },
        { channel: 'ntfy', success: true },
      ],
    });

    fireEvent.click(screen.getByText('Test Notification'));

    await waitFor(() => {
      expect(vi.mocked(showToast)).toHaveBeenCalledWith('success', 'All test notifications sent');
    });
  });

  it('shows warning toast when some channels fail', async () => {
    mockApiCalls();
    await renderAndWait();

    vi.mocked(apiPost).mockResolvedValueOnce({
      results: [
        { channel: 'telegram', success: true },
        { channel: 'discord', success: false, error: 'Not configured' },
      ],
    });

    fireEvent.click(screen.getByText('Test Notification'));

    await waitFor(() => {
      expect(vi.mocked(showToast)).toHaveBeenCalledWith('warning', 'Some channels failed');
    });
  });

  it('shows info toast when no channels configured', async () => {
    mockApiCalls();
    await renderAndWait();

    vi.mocked(apiPost).mockResolvedValueOnce({ results: [] });

    fireEvent.click(screen.getByText('Test Notification'));

    await waitFor(() => {
      expect(vi.mocked(showToast)).toHaveBeenCalledWith('info', 'No notification channels configured');
    });
  });

  it('shows error toast when test throws', async () => {
    mockApiCalls();
    await renderAndWait();

    const MockApiError = (await import('../api/client')).ApiError;
    vi.mocked(apiPost).mockRejectedValueOnce(new MockApiError(500, 'INTERNAL', 'Failed'));

    fireEvent.click(screen.getByText('Test Notification'));

    await waitFor(() => {
      expect(vi.mocked(showToast)).toHaveBeenCalledWith('error', 'Error: INTERNAL');
    });
  });
});

describe('Settings coverage: API key management', () => {
  afterEach(() => { cleanup(); vi.clearAllMocks(); });

  it('displays API keys section with entries', async () => {
    mockApiCalls();
    await renderAndWait();

    expect(screen.getByText('API Keys')).toBeTruthy();
    expect(screen.getByText('coingecko')).toBeTruthy();
    expect(screen.getByText('openai')).toBeTruthy();
    // coingecko has key -> shows masked
    expect(screen.getByText('CG-****abc')).toBeTruthy();
    // openai has no key -> shows "Not set" and Required badge
    expect(screen.getByText('Not set')).toBeTruthy();
    expect(screen.getByText('Required')).toBeTruthy();
  });

  it('handleSaveApiKey: edits and saves an API key', async () => {
    mockApiCalls();
    await renderAndWait();

    vi.mocked(apiPut).mockResolvedValueOnce(undefined);

    // Click "Change" on coingecko
    const changeButton = screen.getByText('Change');
    fireEvent.click(changeButton);

    // Type new key
    const keyInput = document.querySelector('input[name="apikey-coingecko"]') as HTMLInputElement;
    expect(keyInput).toBeTruthy();
    fireEvent.input(keyInput, { target: { value: 'new-api-key-123' } });

    // Click Save
    const saveButtons = screen.getAllByText('Save');
    const apiKeySave = saveButtons.find((b) => b.closest('.api-key-edit-row'));
    fireEvent.click(apiKeySave!);

    await waitFor(() => {
      expect(vi.mocked(apiPut)).toHaveBeenCalledWith('/v1/admin/api-keys/coingecko', {
        apiKey: 'new-api-key-123',
      });
    });

    await waitFor(() => {
      expect(vi.mocked(showToast)).toHaveBeenCalledWith('success', 'API key saved for coingecko');
    });
  });

  it('handleSaveApiKey: shows error on failure', async () => {
    mockApiCalls();
    await renderAndWait();

    const MockApiError = (await import('../api/client')).ApiError;
    vi.mocked(apiPut).mockRejectedValueOnce(new MockApiError(400, 'INVALID_KEY', 'Bad key'));

    const changeButton = screen.getByText('Change');
    fireEvent.click(changeButton);

    const keyInput = document.querySelector('input[name="apikey-coingecko"]') as HTMLInputElement;
    fireEvent.input(keyInput, { target: { value: 'bad-key' } });

    const saveButtons = screen.getAllByText('Save');
    const apiKeySave = saveButtons.find((b) => b.closest('.api-key-edit-row'));
    fireEvent.click(apiKeySave!);

    await waitFor(() => {
      expect(vi.mocked(showToast)).toHaveBeenCalledWith('error', 'Error: INVALID_KEY');
    });
  });

  it('handleDeleteApiKey: deletes an API key', async () => {
    mockApiCalls();
    await renderAndWait();

    vi.mocked(apiDelete).mockResolvedValueOnce(undefined);

    // coingecko has key -> "Delete" button is visible
    const deleteButton = screen.getByText('Delete');
    fireEvent.click(deleteButton);

    await waitFor(() => {
      expect(vi.mocked(apiDelete)).toHaveBeenCalledWith('/v1/admin/api-keys/coingecko');
    });

    await waitFor(() => {
      expect(vi.mocked(showToast)).toHaveBeenCalledWith('success', 'API key deleted for coingecko');
    });
  });

  it('handleDeleteApiKey: shows error on failure', async () => {
    mockApiCalls();
    await renderAndWait();

    const MockApiError = (await import('../api/client')).ApiError;
    vi.mocked(apiDelete).mockRejectedValueOnce(new MockApiError(500, 'INTERNAL', 'Delete failed'));

    const deleteButton = screen.getByText('Delete');
    fireEvent.click(deleteButton);

    await waitFor(() => {
      expect(vi.mocked(showToast)).toHaveBeenCalledWith('error', 'Error: INTERNAL');
    });
  });

  it('handleSaveApiKey for new key via Set button', async () => {
    mockApiCalls();
    await renderAndWait();

    vi.mocked(apiPut).mockResolvedValueOnce(undefined);

    // Click "Set" on openai (which has no key)
    const setButton = screen.getByText('Set');
    fireEvent.click(setButton);

    const keyInput = document.querySelector('input[name="apikey-openai"]') as HTMLInputElement;
    expect(keyInput).toBeTruthy();
    fireEvent.input(keyInput, { target: { value: 'sk-openai-key' } });

    const saveButtons = screen.getAllByText('Save');
    const apiKeySave = saveButtons.find((b) => b.closest('.api-key-edit-row'));
    fireEvent.click(apiKeySave!);

    await waitFor(() => {
      expect(vi.mocked(apiPut)).toHaveBeenCalledWith('/v1/admin/api-keys/openai', {
        apiKey: 'sk-openai-key',
      });
    });
  });

  it('cancel editing API key clears state', async () => {
    mockApiCalls();
    await renderAndWait();

    // Click "Change" on coingecko
    const changeButton = screen.getByText('Change');
    fireEvent.click(changeButton);

    // Should see Cancel button
    const cancelButton = screen.getByText('Cancel');
    fireEvent.click(cancelButton);

    // Should be back to display mode -- "Change" visible again
    await waitFor(() => {
      expect(screen.getByText('Change')).toBeTruthy();
    });
  });
});

describe('Settings coverage: Kill Switch error branches', () => {
  afterEach(() => { cleanup(); vi.clearAllMocks(); });

  it('handleKillSwitchActivate error', async () => {
    mockApiCalls(mockKsActive);
    await renderAndWait();

    const MockApiError = (await import('../api/client')).ApiError;
    vi.mocked(apiPost).mockRejectedValueOnce(new MockApiError(500, 'KS_ERROR', 'Failed'));

    await waitFor(() => {
      expect(screen.getByText('Activate Kill Switch')).toBeTruthy();
    });

    fireEvent.click(screen.getByText('Activate Kill Switch'));

    await waitFor(() => {
      expect(vi.mocked(showToast)).toHaveBeenCalledWith('error', 'Error: KS_ERROR');
    });
  });

  it('handleKillSwitchEscalate error', async () => {
    mockApiCalls(mockKsSuspended);
    await renderAndWait();

    const MockApiError = (await import('../api/client')).ApiError;
    vi.mocked(apiPost).mockRejectedValueOnce(new MockApiError(500, 'ESCALATE_ERROR', 'Failed'));

    await waitFor(() => {
      expect(screen.getByText('Escalate to LOCKED')).toBeTruthy();
    });

    fireEvent.click(screen.getByText('Escalate to LOCKED'));

    await waitFor(() => {
      expect(vi.mocked(showToast)).toHaveBeenCalledWith('error', 'Error: ESCALATE_ERROR');
    });
  });

  it('handleKillSwitchRecover error', async () => {
    mockApiCalls(mockKsSuspended);
    await renderAndWait();

    const MockApiError = (await import('../api/client')).ApiError;
    vi.mocked(apiPost).mockRejectedValueOnce(new MockApiError(500, 'RECOVER_ERROR', 'Failed'));

    await waitFor(() => {
      expect(screen.getByText('Recover')).toBeTruthy();
    });

    fireEvent.click(screen.getByText('Recover'));

    await waitFor(() => {
      expect(vi.mocked(showToast)).toHaveBeenCalledWith('error', 'Error: RECOVER_ERROR');
    });
  });
});

describe('Settings coverage: handleRotate', () => {
  afterEach(() => { cleanup(); vi.clearAllMocks(); });

  it('rotates JWT secret via modal confirm', async () => {
    mockApiCalls();
    await renderAndWait();

    vi.mocked(apiPost).mockResolvedValueOnce({ rotatedAt: 1707609600, message: 'rotated' });

    // Open rotate modal
    fireEvent.click(screen.getByText('Invalidate All Tokens'));

    await waitFor(() => {
      expect(screen.getByText(/rotate the signing key and invalidate all active session tokens/)).toBeTruthy();
    });

    // Click the Invalidate confirm button
    fireEvent.click(screen.getByText('Invalidate'));

    await waitFor(() => {
      expect(vi.mocked(apiPost)).toHaveBeenCalledWith('/v1/admin/rotate-secret');
    });

    await waitFor(() => {
      expect(vi.mocked(showToast)).toHaveBeenCalledWith('success', 'All session tokens invalidated. Old tokens remain valid for 5 minutes.');
    });
  });

  it('handles rotate error', async () => {
    mockApiCalls();
    await renderAndWait();

    const MockApiError = (await import('../api/client')).ApiError;
    vi.mocked(apiPost).mockRejectedValueOnce(new MockApiError(500, 'ROTATE_ERROR', 'Failed'));

    fireEvent.click(screen.getByText('Invalidate All Tokens'));

    await waitFor(() => {
      expect(screen.getByText('Invalidate')).toBeTruthy();
    });

    fireEvent.click(screen.getByText('Invalidate'));

    await waitFor(() => {
      expect(vi.mocked(showToast)).toHaveBeenCalledWith('error', 'Error: ROTATE_ERROR');
    });
  });

  it('cancels rotate modal', async () => {
    mockApiCalls();
    await renderAndWait();

    fireEvent.click(screen.getByText('Invalidate All Tokens'));

    await waitFor(() => {
      expect(screen.getByText('Invalidate')).toBeTruthy();
    });

    // Click Cancel in modal
    const cancelButtons = screen.getAllByText('Cancel');
    const modalCancel = cancelButtons[cancelButtons.length - 1];
    fireEvent.click(modalCancel!);

    // Modal should be gone
    await waitFor(() => {
      expect(screen.queryByText(/rotate the signing key and invalidate all active session tokens/)).toBeNull();
    });
  });
});

describe('Settings coverage: handleShutdown', () => {
  afterEach(() => { cleanup(); vi.clearAllMocks(); });

  it('shuts down daemon with SHUTDOWN confirmation', async () => {
    mockApiCalls();
    await renderAndWait();

    vi.mocked(apiPost).mockResolvedValueOnce({ message: 'shutdown initiated' });

    // Open shutdown modal
    fireEvent.click(screen.getByText('Shutdown Daemon'));

    await waitFor(() => {
      expect(screen.getByText(/Type/)).toBeTruthy();
    });

    // Type SHUTDOWN
    const confirmInput = screen.getByPlaceholderText('SHUTDOWN');
    fireEvent.input(confirmInput, { target: { value: 'SHUTDOWN' } });

    // Click Shutdown button
    fireEvent.click(screen.getByText('Shutdown'));

    await waitFor(() => {
      expect(vi.mocked(apiPost)).toHaveBeenCalledWith('/v1/admin/shutdown');
    });

    await waitFor(() => {
      expect(vi.mocked(showToast)).toHaveBeenCalledWith('info', 'Shutdown initiated');
    });

    // Shutdown overlay should appear
    await waitFor(() => {
      expect(screen.getByText('Daemon is shutting down...')).toBeTruthy();
    });
  });

  it('shutdown confirm button disabled without proper text', async () => {
    mockApiCalls();
    await renderAndWait();

    fireEvent.click(screen.getByText('Shutdown Daemon'));

    await waitFor(() => {
      expect(screen.getByPlaceholderText('SHUTDOWN')).toBeTruthy();
    });

    // Shutdown button should be disabled when text doesn't match
    const shutdownBtn = screen.getByText('Shutdown');
    expect((shutdownBtn as HTMLButtonElement).disabled).toBe(true);

    // Type wrong text
    const confirmInput = screen.getByPlaceholderText('SHUTDOWN');
    fireEvent.input(confirmInput, { target: { value: 'WRONG' } });

    expect((shutdownBtn as HTMLButtonElement).disabled).toBe(true);
  });

  it('handles shutdown error', async () => {
    mockApiCalls();
    await renderAndWait();

    const MockApiError = (await import('../api/client')).ApiError;
    vi.mocked(apiPost).mockRejectedValueOnce(new MockApiError(500, 'SHUTDOWN_ERROR', 'Failed'));

    fireEvent.click(screen.getByText('Shutdown Daemon'));

    await waitFor(() => {
      expect(screen.getByPlaceholderText('SHUTDOWN')).toBeTruthy();
    });

    const confirmInput = screen.getByPlaceholderText('SHUTDOWN');
    fireEvent.input(confirmInput, { target: { value: 'SHUTDOWN' } });

    fireEvent.click(screen.getByText('Shutdown'));

    await waitFor(() => {
      expect(vi.mocked(showToast)).toHaveBeenCalledWith('error', 'Error: SHUTDOWN_ERROR');
    });
  });
});

describe('Settings coverage: shutdown modal cancel', () => {
  afterEach(() => { cleanup(); vi.clearAllMocks(); });

  it('cancel shutdown modal clears confirmation text', async () => {
    mockApiCalls();
    await renderAndWait();

    // Open shutdown modal
    fireEvent.click(screen.getByText('Shutdown Daemon'));

    await waitFor(() => {
      expect(screen.getByPlaceholderText('SHUTDOWN')).toBeTruthy();
    });

    // Type something
    const confirmInput = screen.getByPlaceholderText('SHUTDOWN');
    fireEvent.input(confirmInput, { target: { value: 'SHUT' } });

    // Click Cancel
    const cancelButtons = screen.getAllByText('Cancel');
    // Last Cancel button is in the shutdown modal
    fireEvent.click(cancelButtons[cancelButtons.length - 1]!);

    // Modal should be gone
    await waitFor(() => {
      expect(screen.queryByPlaceholderText('SHUTDOWN')).toBeNull();
    });
  });
});

describe('Settings coverage: field helpers', () => {
  afterEach(() => { cleanup(); vi.clearAllMocks(); });

  it('getEffectiveValue returns dirty value when changed', async () => {
    mockApiCalls();
    await renderAndWait();

    // Change session_ttl
    const input = document.querySelector('input[name="security.session_ttl"]') as HTMLInputElement;
    expect(input.value).toBe('86400');

    fireEvent.input(input, { target: { value: '7200' } });

    await waitFor(() => {
      expect(input.value).toBe('7200');
    });
  });

  it('getEffectiveBoolValue toggles checkbox fields', async () => {
    mockApiCalls();
    await renderAndWait();

    // notifications.enabled is 'true' -> checkbox checked
    const enabledCheckbox = document.querySelector('input[name="notifications.enabled"]') as HTMLInputElement;
    expect(enabledCheckbox).toBeTruthy();
    expect(enabledCheckbox.checked).toBe(true);

    // Toggle it off
    fireEvent.change(enabledCheckbox, { target: { checked: false } });

    await waitFor(() => {
      expect(screen.getByText(/unsaved/i)).toBeTruthy();
    });
  });

  it('isCredentialConfigured shows placeholder for configured credentials', async () => {
    mockApiCalls();
    await renderAndWait();

    // telegram_bot_token is true (configured) -> "(configured)" placeholder
    const tokenInput = document.querySelector('input[name="notifications.telegram_bot_token"]') as HTMLInputElement;
    expect(tokenInput.placeholder).toBe('(configured)');
    expect(tokenInput.value).toBe('');

    // slack_webhook_url is true (configured) -> "(configured)" placeholder
    const slackInput = document.querySelector('input[name="notifications.slack_webhook_url"]') as HTMLInputElement;
    expect(slackInput.placeholder).toBe('(configured)');

    // discord_webhook_url is false (not configured) -> empty placeholder
    const discordInput = document.querySelector('input[name="notifications.discord_webhook_url"]') as HTMLInputElement;
    expect(discordInput.placeholder).toBe('');
  });

  it('handleFieldChange: boolean fields via default deny checkboxes', async () => {
    mockApiCalls();
    await renderAndWait();

    // default_deny_tokens is 'true' in security settings
    const tokensDenyCheckbox = document.querySelector('input[name="policy.default_deny_tokens"]') as HTMLInputElement;
    expect(tokensDenyCheckbox).toBeTruthy();
    expect(tokensDenyCheckbox.checked).toBe(true);

    // Toggle it off
    fireEvent.change(tokensDenyCheckbox, { target: { checked: false } });

    await waitFor(() => {
      expect(screen.getByText(/unsaved/i)).toBeTruthy();
    });

    // Save should include the boolean field as string
    vi.mocked(apiPut).mockResolvedValueOnce(undefined);
    fireEvent.click(screen.getByText('Save'));

    await waitFor(() => {
      const putCall = vi.mocked(apiPut).mock.calls[0];
      const body = putCall![1] as { settings: { key: string; value: string }[] };
      const entry = body.settings.find((s) => s.key === 'policy.default_deny_tokens');
      expect(entry).toBeTruthy();
      expect(entry!.value).toBe('false');
    });
  });

  it('getEffectiveValue returns empty string for missing category', async () => {
    // Render with minimal settings (missing some categories)
    vi.mocked(apiGet).mockImplementation(async (path: string) => {
      if (path === '/v1/admin/settings') return { rpc: {} };
      if (path === '/v1/admin/kill-switch') return mockKsActive;
      if (path === '/v1/admin/api-keys') return { keys: [] };
      return {};
    });
    render(<SettingsPage />);
    await waitFor(() => {
      expect(screen.getByText('RPC Endpoints')).toBeTruthy();
    });

    // All fields for missing categories should show default/empty
    const sessionTtl = document.querySelector('input[name="security.session_ttl"]') as HTMLInputElement;
    expect(sessionTtl).toBeTruthy();
    expect(sessionTtl.value).toBe('0'); // Number('' || 0)
  });

  it('getEffectiveValue handles non-credential boolean values (autostop.enabled as boolean)', async () => {
    // When autostop.enabled comes back as actual boolean true instead of string 'true'
    const settingsWithBoolEnabled = {
      ...mockSettingsResponse,
      autostop: {
        ...mockSettingsResponse.autostop,
        enabled: true as unknown as string, // actual boolean from API
      },
      security: {
        ...mockSettingsResponse.security,
        default_deny_tokens: true as unknown as string, // boolean
      },
    };
    vi.mocked(apiGet).mockImplementation(async (path: string) => {
      if (path === '/v1/admin/settings') return settingsWithBoolEnabled;
      if (path === '/v1/admin/kill-switch') return mockKsActive;
      if (path === '/v1/admin/api-keys') return { keys: [] };
      return {};
    });

    render(<SettingsPage />);
    await waitFor(() => {
      expect(screen.getByText('AutoStop Rules')).toBeTruthy();
    });

    // autostop.enabled is boolean true -> checkbox should be checked
    const enabledCheckbox = document.querySelector('input[name="autostop.enabled"]') as HTMLInputElement;
    expect(enabledCheckbox).toBeTruthy();
    expect(enabledCheckbox.checked).toBe(true);
  });

  it('credential field editing clears isCredentialConfigured', async () => {
    mockApiCalls();
    await renderAndWait();

    // telegram.bot_token is configured -> shows "(configured)" placeholder
    const botTokenInput = document.querySelector('input[name="telegram.bot_token"]') as HTMLInputElement;
    expect(botTokenInput.placeholder).toContain('configured');

    // Start editing by typing a value
    fireEvent.input(botTokenInput, { target: { value: 'new-token' } });

    // After edit, dirty has the new value; the field value should reflect it
    await waitFor(() => {
      expect(screen.getByText(/unsaved/i)).toBeTruthy();
    });
  });

  it('Telegram Bot section renders with fields', async () => {
    mockApiCalls();
    await renderAndWait();

    expect(screen.getByText('Telegram Bot')).toBeTruthy();
    const enabledSelect = document.querySelector('select[name="telegram.enabled"]') as HTMLSelectElement;
    expect(enabledSelect).toBeTruthy();
    expect(enabledSelect.value).toBe('false');
  });

  it('Display section renders and CurrencySelect onChange triggers dirty', async () => {
    mockApiCalls();
    await renderAndWait();

    expect(screen.getByText('Display')).toBeTruthy();

    // Change currency via mocked CurrencySelect
    const currencySelect = screen.getByTestId('currency-select') as HTMLSelectElement;
    expect(currencySelect.value).toBe('USD');
    fireEvent.change(currencySelect, { target: { value: 'KRW' } });

    await waitFor(() => {
      expect(screen.getByText(/unsaved/i)).toBeTruthy();
    });
  });

  it('fetchSettings error shows toast', async () => {
    const MockApiError = (await import('../api/client')).ApiError;
    vi.mocked(apiGet).mockImplementation(async (path: string) => {
      if (path === '/v1/admin/settings') throw new MockApiError(500, 'SETTINGS_FAIL', 'Fail');
      if (path === '/v1/admin/kill-switch') return mockKsActive;
      if (path === '/v1/admin/api-keys') return { keys: [] };
      return {};
    });

    render(<SettingsPage />);

    await waitFor(() => {
      expect(vi.mocked(showToast)).toHaveBeenCalledWith('error', 'Error: SETTINGS_FAIL');
    });
  });

  it('fetchKillSwitchState error shows toast', async () => {
    const MockApiError = (await import('../api/client')).ApiError;
    vi.mocked(apiGet).mockImplementation(async (path: string) => {
      if (path === '/v1/admin/settings') return mockSettingsResponse;
      if (path === '/v1/admin/kill-switch') throw new MockApiError(500, 'KS_FETCH_FAIL', 'Fail');
      if (path === '/v1/admin/api-keys') return { keys: [] };
      return {};
    });

    render(<SettingsPage />);

    await waitFor(() => {
      expect(vi.mocked(showToast)).toHaveBeenCalledWith('error', 'Error: KS_FETCH_FAIL');
    });
  });

  it('handleSave with non-ApiError wraps as UNKNOWN', async () => {
    mockApiCalls();
    await renderAndWait();

    // Change a field
    const sessionTtl = document.querySelector('input[name="security.session_ttl"]') as HTMLInputElement;
    fireEvent.input(sessionTtl, { target: { value: '1000' } });

    await waitFor(() => {
      expect(screen.getByText(/unsaved/i)).toBeTruthy();
    });

    // Non-ApiError thrown
    vi.mocked(apiPut).mockRejectedValueOnce(new Error('Random error'));

    fireEvent.click(screen.getByText('Save'));

    await waitFor(() => {
      expect(vi.mocked(showToast)).toHaveBeenCalledWith('error', 'Error: UNKNOWN');
    });
  });
});
