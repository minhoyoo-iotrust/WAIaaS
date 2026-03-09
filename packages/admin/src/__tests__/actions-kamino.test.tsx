/**
 * actions-kamino.test.tsx
 *
 * Tests for Kamino Lending card in Actions page:
 * - Kamino card renders with correct info
 * - Toggle enable/disable works
 * - Advanced settings section shows when enabled
 * - Advanced settings save calls apiPut with correct key
 * - Card shows Inactive when disabled
 *
 * @see KINT-08, KINT-09
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

vi.mock('../components/settings-search', () => ({
  pendingNavigation: { value: null },
  highlightField: { value: '' },
}));

vi.mock('../utils/dirty-guard', () => ({
  registerDirty: vi.fn(),
  unregisterDirty: vi.fn(),
  hasDirty: { value: false },
}));

import { apiGet, apiPut } from '../api/client';
import ActionsPage from '../pages/actions';

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

const mockSettingsKaminoEnabled = {
  actions: {
    jupiter_swap_enabled: 'false',
    zerox_swap_enabled: 'false',
    lifi_enabled: 'false',
    lido_staking_enabled: 'false',
    jito_staking_enabled: 'false',
    aave_v3_enabled: 'false',
    kamino_enabled: 'true',
    kamino_market: 'main',
    kamino_hf_threshold: '1.2',
  },
};

const mockSettingsAllDisabled = {
  actions: {
    jupiter_swap_enabled: 'false',
    zerox_swap_enabled: 'false',
    lifi_enabled: 'false',
    lido_staking_enabled: 'false',
    jito_staking_enabled: 'false',
    aave_v3_enabled: 'false',
    kamino_enabled: 'false',
  },
};

const mockEmptyApiKeys = { keys: [] };
const mockEmptyProviders = { providers: [] };

function mockApiCalls(
  settingsData: Record<string, unknown> = mockSettingsAllDisabled,
  apiKeysData: { keys: unknown[] } = mockEmptyApiKeys,
  providersData: { providers: unknown[] } = mockEmptyProviders,
) {
  vi.mocked(apiGet).mockImplementation(async (path: string) => {
    if (path === '/v1/admin/settings') return settingsData;
    if (path === '/v1/admin/api-keys') return apiKeysData;
    if (path === '/v1/actions/providers') return providersData;
    return {};
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ActionsPage - Kamino Lending Card', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('renders Kamino Lending card', async () => {
    mockApiCalls(mockSettingsAllDisabled);
    render(<ActionsPage />);

    await waitFor(() => {
      expect(screen.getByText('Kamino Lending')).toBeTruthy();
    });
    expect(screen.getByText(/Solana lending protocol/)).toBeTruthy();
  });

  it('toggle Kamino calls apiPut with actions.kamino_enabled', async () => {
    mockApiCalls(mockSettingsAllDisabled);
    render(<ActionsPage />);

    await waitFor(() => {
      expect(screen.getByText('Kamino Lending')).toBeTruthy();
    });

    const checkbox = document.querySelector(
      'input[name="actions.kamino_enabled"]',
    ) as HTMLInputElement;
    expect(checkbox).toBeTruthy();
    expect(checkbox.checked).toBe(false);

    vi.mocked(apiPut).mockResolvedValueOnce({
      updated: 1,
      settings: mockSettingsKaminoEnabled,
    });

    fireEvent.change(checkbox, { target: { checked: true } });

    await waitFor(() => {
      expect(vi.mocked(apiPut)).toHaveBeenCalledWith('/v1/admin/settings', {
        settings: [{ key: 'actions.kamino_enabled', value: 'true' }],
      });
    });
  });

  it('shows Advanced Settings section when Kamino is enabled', async () => {
    mockApiCalls(mockSettingsKaminoEnabled);
    render(<ActionsPage />);

    await waitFor(() => {
      expect(screen.getByText('Kamino Lending')).toBeTruthy();
    });

    // Check Advanced Settings header and Kamino-specific fields
    const advancedHeaders = screen.getAllByText('Advanced Settings');
    expect(advancedHeaders.length).toBeGreaterThanOrEqual(1);

    // Check Kamino-specific setting fields
    expect(screen.getByText('Market')).toBeTruthy();
    expect(screen.getByText('HF Warning Threshold')).toBeTruthy();
  });

  it('saving Kamino advanced setting calls apiPut with correct key', async () => {
    mockApiCalls(mockSettingsKaminoEnabled);
    render(<ActionsPage />);

    await waitFor(() => {
      expect(screen.getByText('Kamino Lending')).toBeTruthy();
    });

    // Find the Kamino market input
    const marketInput = document.querySelector(
      'input[name="actions.kamino_market"]',
    ) as HTMLInputElement;
    expect(marketInput).toBeTruthy();

    vi.mocked(apiPut).mockResolvedValueOnce({
      updated: 1,
      settings: mockSettingsKaminoEnabled,
    });

    // Change value
    fireEvent.input(marketInput, { target: { value: '7u3HeHxYDLhn' } });

    // Trigger blur on the wrapper div to save
    const wrapper = marketInput.closest('[style*="margin-bottom"]') as HTMLElement;
    fireEvent.blur(wrapper);

    await waitFor(() => {
      expect(vi.mocked(apiPut)).toHaveBeenCalledWith('/v1/admin/settings', {
        settings: [{ key: 'actions.kamino_market', value: '7u3HeHxYDLhn' }],
      });
    });
  });

  it('shows Inactive when Kamino is disabled along with all other providers', async () => {
    mockApiCalls(mockSettingsAllDisabled);
    render(<ActionsPage />);

    await waitFor(() => {
      expect(screen.getByText('Kamino Lending')).toBeTruthy();
    });

    // All 13 providers disabled -> 13 Inactive badges (ERC-8004 moved to Agent Identity page)
    const inactiveBadges = screen.getAllByText('Inactive');
    expect(inactiveBadges.length).toBe(13);
  });
});
