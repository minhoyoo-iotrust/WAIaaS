/**
 * actions-aave-v3.test.tsx
 *
 * Tests for Aave V3 card in Actions page:
 * - Aave V3 card renders with correct info
 * - Toggle enable/disable works
 * - Advanced settings section shows when enabled
 * - Advanced settings save calls apiPut with correct key
 * - Card shows Inactive when disabled
 *
 * @see ADMN-02, ADMN-03, ADMN-04, ADMN-05
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
import { showToast } from '../components/toast';
import ActionsPage from '../pages/actions';

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

const mockSettingsAaveEnabled = {
  actions: {
    jupiter_swap_enabled: 'false',
    zerox_swap_enabled: 'false',
    lifi_enabled: 'false',
    lido_staking_enabled: 'false',
    jito_staking_enabled: 'false',
    aave_v3_enabled: 'true',
    aave_v3_health_factor_warning_threshold: '1.2',
    aave_v3_position_sync_interval_sec: '300',
    aave_v3_max_ltv_pct: '0.8',
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

describe('ActionsPage - Aave V3 Card', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('renders Aave V3 Lending card', async () => {
    mockApiCalls(mockSettingsAllDisabled);
    render(<ActionsPage />);

    await waitFor(() => {
      expect(screen.getByText('Aave V3 Lending')).toBeTruthy();
    });
    expect(screen.getByText(/EVM lending protocol/)).toBeTruthy();
  });

  it('toggle Aave V3 calls apiPut with actions.aave_v3_enabled', async () => {
    mockApiCalls(mockSettingsAllDisabled);
    render(<ActionsPage />);

    await waitFor(() => {
      expect(screen.getByText('Aave V3 Lending')).toBeTruthy();
    });

    const checkbox = document.querySelector(
      'input[name="actions.aave_v3_enabled"]',
    ) as HTMLInputElement;
    expect(checkbox).toBeTruthy();
    expect(checkbox.checked).toBe(false);

    vi.mocked(apiPut).mockResolvedValueOnce({
      updated: 1,
      settings: mockSettingsAaveEnabled,
    });

    fireEvent.change(checkbox, { target: { checked: true } });

    await waitFor(() => {
      expect(vi.mocked(apiPut)).toHaveBeenCalledWith('/v1/admin/settings', {
        settings: [{ key: 'actions.aave_v3_enabled', value: 'true' }],
      });
    });
  });

  it('shows Advanced Settings section when Aave V3 is enabled', async () => {
    mockApiCalls(mockSettingsAaveEnabled);
    render(<ActionsPage />);

    await waitFor(() => {
      expect(screen.getByText('Advanced Settings')).toBeTruthy();
    });

    // Check all 3 advanced setting fields are present
    expect(screen.getByText('HF Warning Threshold')).toBeTruthy();
    expect(screen.getByText('Position Sync Interval (seconds)')).toBeTruthy();
    expect(screen.getByText('Max LTV Percentage')).toBeTruthy();
  });

  it('saving advanced setting calls apiPut with correct key', async () => {
    mockApiCalls(mockSettingsAaveEnabled);
    render(<ActionsPage />);

    await waitFor(() => {
      expect(screen.getByText('Advanced Settings')).toBeTruthy();
    });

    // Find the HF threshold input
    const hfInput = document.querySelector(
      'input[name="actions.aave_v3_health_factor_warning_threshold"]',
    ) as HTMLInputElement;
    expect(hfInput).toBeTruthy();

    vi.mocked(apiPut).mockResolvedValueOnce({
      updated: 1,
      settings: mockSettingsAaveEnabled,
    });

    // Change value
    fireEvent.input(hfInput, { target: { value: '1.5' } });

    // Trigger blur on the wrapper div to save
    const wrapper = hfInput.closest('[style*="margin-bottom"]') as HTMLElement;
    fireEvent.blur(wrapper);

    await waitFor(() => {
      expect(vi.mocked(apiPut)).toHaveBeenCalledWith('/v1/admin/settings', {
        settings: [{ key: 'actions.aave_v3_health_factor_warning_threshold', value: '1.5' }],
      });
    });
  });

  it('shows Inactive when Aave V3 is disabled along with all other providers', async () => {
    mockApiCalls(mockSettingsAllDisabled);
    render(<ActionsPage />);

    await waitFor(() => {
      expect(screen.getByText('Aave V3 Lending')).toBeTruthy();
    });

    // All 12 providers disabled -> 12 Inactive badges (ERC-8004 moved to Agent Identity page)
    const inactiveBadges = screen.getAllByText('Inactive');
    expect(inactiveBadges.length).toBe(12);
  });
});
