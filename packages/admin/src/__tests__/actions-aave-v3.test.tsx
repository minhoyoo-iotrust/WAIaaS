/**
 * actions-aave-v3.test.tsx
 *
 * Tests for Aave V3 card in Actions page:
 * - Aave V3 card renders with correct info
 * - Toggle enable/disable works
 * - Advanced settings section shows when enabled
 * - Advanced settings save calls mockApiPut with correct key
 * - Card shows Inactive when disabled
 *
 * @see ADMN-02, ADMN-03, ADMN-04, ADMN-05
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent, cleanup } from '@testing-library/preact';


const mockApiGet = vi.fn();
const mockApiPost = vi.fn();
const mockApiPut = vi.fn();
const mockApiDelete = vi.fn();
const mockApiPatch = vi.fn();

// Mock declarations moved to top-level const

vi.mock('../api/typed-client', () => ({
  api: {
    GET: (...args: unknown[]) => mockApiGet(...args),
    POST: (...args: unknown[]) => mockApiPost(...args),
    PUT: (...args: unknown[]) => mockApiPut(...args),
    DELETE: (...args: unknown[]) => mockApiDelete(...args),
    PATCH: (...args: unknown[]) => mockApiPatch(...args),
  },
  ApiError: class ApiError extends Error {
    status: number; code: string; serverMessage: string;
    constructor(s: number, c: string, m: string) { super(`[${s}] ${c}: ${m}`); this.name = 'ApiError'; this.status = s; this.code = c; this.serverMessage = m; }
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

vi.mock('../components/settings-search', () => ({
  pendingNavigation: { value: null },
  highlightField: { value: '' },
}));

vi.mock('../utils/dirty-guard', () => ({
  registerDirty: vi.fn(),
  unregisterDirty: vi.fn(),
  hasDirty: { value: false },
}));

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

const mockAaveProviderEnabled = {
  providers: [
    { name: 'aave_v3', description: 'EVM lending protocol (supply, borrow, repay, withdraw)', version: '1.0.0', chains: ['evm'], mcpExpose: false, requiresApiKey: false, hasApiKey: false, enabledKey: 'aave_v3', category: 'Lending', isEnabled: true, actions: [] },
  ],
};
const mockAaveProviderDisabled = {
  providers: [
    { name: 'aave_v3', description: 'EVM lending protocol (supply, borrow, repay, withdraw)', version: '1.0.0', chains: ['evm'], mcpExpose: false, requiresApiKey: false, hasApiKey: false, enabledKey: 'aave_v3', category: 'Lending', isEnabled: false, actions: [] },
  ],
};

function mockApiCalls(
  settingsData: Record<string, unknown> = mockSettingsAllDisabled,
  apiKeysData: { keys: unknown[] } = mockEmptyApiKeys,
  providersData: { providers: unknown[] } = mockAaveProviderDisabled,
) {
  mockApiGet.mockImplementation(async (path: string) => {
    if (path === '/v1/admin/settings') return { data: settingsData };
    if (path === '/v1/admin/api-keys') return { data: apiKeysData };
    if (path === '/v1/actions/providers') return { data: providersData };
    return { data: {} };
  });
  mockApiPut.mockImplementation(async () => ({ data: { updated: 1, settings: settingsData } }));
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
      expect(screen.getByText('Aave V3')).toBeTruthy();
    });
    expect(screen.getByText(/EVM lending protocol/)).toBeTruthy();
  });

  it('toggle Aave V3 calls mockApiPut with actions.aave_v3_enabled', async () => {
    mockApiCalls(mockSettingsAllDisabled);
    render(<ActionsPage />);

    await waitFor(() => {
      expect(screen.getByText('Aave V3')).toBeTruthy();
    });

    const checkbox = document.querySelector(
      'input[name="actions.aave_v3_enabled"]',
    ) as HTMLInputElement;
    expect(checkbox).toBeTruthy();
    expect(checkbox.checked).toBe(false);

    mockApiPut.mockResolvedValueOnce({
      updated: 1,
      settings: mockSettingsAaveEnabled,
    });

    fireEvent.change(checkbox, { target: { checked: true } });

    await waitFor(() => {
      expect(mockApiPut).toHaveBeenCalledWith('/v1/admin/settings', expect.objectContaining({
        body: { settings: [{ key: 'actions.aave_v3_enabled', value: 'true' }] },
      }));
    });
  });

  it('shows Advanced Settings section when Aave V3 is enabled', async () => {
    mockApiCalls(mockSettingsAaveEnabled, mockEmptyApiKeys, mockAaveProviderEnabled);
    render(<ActionsPage />);

    await waitFor(() => {
      expect(screen.getByText('Advanced Settings')).toBeTruthy();
    });
  });

  it('saving advanced setting calls mockApiPut with correct key', async () => {
    mockApiCalls(mockSettingsAaveEnabled, mockEmptyApiKeys, mockAaveProviderEnabled);
    render(<ActionsPage />);

    await waitFor(() => {
      expect(screen.getByText('Advanced Settings')).toBeTruthy();
    });

    // Find the HF threshold input
    const hfInput = document.querySelector(
      'input[name="actions.aave_v3_health_factor_warning_threshold"]',
    ) as HTMLInputElement;
    expect(hfInput).toBeTruthy();

    mockApiPut.mockResolvedValueOnce({
      updated: 1,
      settings: mockSettingsAaveEnabled,
    });

    // Change value
    fireEvent.input(hfInput, { target: { value: '1.5' } });

    // Trigger blur on the wrapper div to save
    const wrapper = hfInput.closest('[style*="margin-bottom"]') as HTMLElement;
    fireEvent.blur(wrapper);

    await waitFor(() => {
      expect(mockApiPut).toHaveBeenCalledWith('/v1/admin/settings', expect.objectContaining({
        body: { settings: [{ key: 'actions.aave_v3_health_factor_warning_threshold', value: '1.5' }] },
      }));
    });
  });

  it('shows Inactive when Aave V3 is disabled', async () => {
    mockApiCalls(mockSettingsAllDisabled, mockEmptyApiKeys, mockAaveProviderDisabled);
    render(<ActionsPage />);

    await waitFor(() => {
      expect(screen.getByText('Aave V3')).toBeTruthy();
    });

    const inactiveBadges = screen.getAllByText('Inactive');
    expect(inactiveBadges.length).toBe(1);
  });
});
