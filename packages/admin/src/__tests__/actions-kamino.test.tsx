/**
 * actions-kamino.test.tsx
 *
 * Tests for Kamino Lending card in Actions page:
 * - Kamino card renders with correct info
 * - Toggle enable/disable works
 * - Advanced settings section shows when enabled
 * - Advanced settings save calls mockApiPut with correct key
 * - Card shows Inactive when disabled
 *
 * @see KINT-08, KINT-09
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

const mockKaminoProviderEnabled = {
  providers: [
    { name: 'kamino', description: 'Solana lending protocol (supply, borrow, repay, withdraw)', version: '1.0.0', chains: ['solana'], mcpExpose: false, requiresApiKey: false, hasApiKey: false, enabledKey: 'kamino', category: 'Lending', isEnabled: true, actions: [] },
  ],
};
const mockKaminoProviderDisabled = {
  providers: [
    { name: 'kamino', description: 'Solana lending protocol (supply, borrow, repay, withdraw)', version: '1.0.0', chains: ['solana'], mcpExpose: false, requiresApiKey: false, hasApiKey: false, enabledKey: 'kamino', category: 'Lending', isEnabled: false, actions: [] },
  ],
};

function mockApiCalls(
  settingsData: Record<string, unknown> = mockSettingsAllDisabled,
  apiKeysData: { keys: unknown[] } = mockEmptyApiKeys,
  providersData: { providers: unknown[] } = mockKaminoProviderDisabled,
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

describe('ActionsPage - Kamino Lending Card', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('renders Kamino Lending card', async () => {
    mockApiCalls(mockSettingsAllDisabled);
    render(<ActionsPage />);

    await waitFor(() => {
      expect(screen.getByText('Kamino')).toBeTruthy();
    });
    expect(screen.getByText(/Solana lending protocol/)).toBeTruthy();
  });

  it('toggle Kamino calls mockApiPut with actions.kamino_enabled', async () => {
    mockApiCalls(mockSettingsAllDisabled);
    render(<ActionsPage />);

    await waitFor(() => {
      expect(screen.getByText('Kamino')).toBeTruthy();
    });

    const checkbox = document.querySelector(
      'input[name="actions.kamino_enabled"]',
    ) as HTMLInputElement;
    expect(checkbox).toBeTruthy();
    expect(checkbox.checked).toBe(false);

    mockApiPut.mockResolvedValueOnce({
      updated: 1,
      settings: mockSettingsKaminoEnabled,
    });

    fireEvent.change(checkbox, { target: { checked: true } });

    await waitFor(() => {
      expect(mockApiPut).toHaveBeenCalledWith('/v1/admin/settings', expect.objectContaining({
        body: { settings: [{ key: 'actions.kamino_enabled', value: 'true' }] },
      }));
    });
  });

  it('shows Advanced Settings section when Kamino is enabled', async () => {
    mockApiCalls(mockSettingsKaminoEnabled, mockEmptyApiKeys, mockKaminoProviderEnabled);
    render(<ActionsPage />);

    await waitFor(() => {
      expect(screen.getByText('Kamino')).toBeTruthy();
    });

    // Check Advanced Settings header and Kamino-specific fields
    const advancedHeaders = screen.getAllByText('Advanced Settings');
    expect(advancedHeaders.length).toBeGreaterThanOrEqual(1);

    // Check Kamino-specific setting fields
    expect(screen.getByText('Market')).toBeTruthy();
    expect(screen.getByText('HF Warning Threshold')).toBeTruthy();
  });

  it('saving Kamino advanced setting calls mockApiPut with correct key', async () => {
    mockApiCalls(mockSettingsKaminoEnabled, mockEmptyApiKeys, mockKaminoProviderEnabled);
    render(<ActionsPage />);

    await waitFor(() => {
      expect(screen.getByText('Kamino')).toBeTruthy();
    });

    // Find the Kamino market input
    const marketInput = document.querySelector(
      'input[name="actions.kamino_market"]',
    ) as HTMLInputElement;
    expect(marketInput).toBeTruthy();

    mockApiPut.mockResolvedValueOnce({
      updated: 1,
      settings: mockSettingsKaminoEnabled,
    });

    // Change value
    fireEvent.input(marketInput, { target: { value: '7u3HeHxYDLhn' } });

    // Trigger blur on the wrapper div to save
    const wrapper = marketInput.closest('[style*="margin-bottom"]') as HTMLElement;
    fireEvent.blur(wrapper);

    await waitFor(() => {
      expect(mockApiPut).toHaveBeenCalledWith('/v1/admin/settings', expect.objectContaining({
        body: { settings: [{ key: 'actions.kamino_market', value: '7u3HeHxYDLhn' }] },
      }));
    });
  });

  it('shows Inactive when Kamino is disabled', async () => {
    mockApiCalls(mockSettingsAllDisabled, mockEmptyApiKeys, mockKaminoProviderDisabled);
    render(<ActionsPage />);

    await waitFor(() => {
      expect(screen.getByText('Kamino')).toBeTruthy();
    });

    const inactiveBadges = screen.getAllByText('Inactive');
    expect(inactiveBadges.length).toBe(1);
  });
});
