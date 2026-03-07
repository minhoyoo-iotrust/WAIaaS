/**
 * actions.test.tsx
 *
 * Tests for the Actions page (actions.tsx):
 * - Renders provider list with Jupiter Swap and 0x Swap cards
 * - Toggle enable/disable calls apiPut with correct settings key
 * - API key save calls apiPut with correct endpoint
 * - API key delete calls apiDelete with correct endpoint
 * - Active status when enabled and registered
 * - Requires API Key status when enabled but missing key
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

import { apiGet, apiPut, apiDelete } from '../api/client';
import { showToast } from '../components/toast';
import ActionsPage from '../pages/actions';

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

const mockSettingsDisabled = {
  actions: {
    jupiter_swap_enabled: 'false',
    zerox_swap_enabled: 'false',
  },
};

const mockSettingsJupiterEnabled = {
  actions: {
    jupiter_swap_enabled: 'true',
    zerox_swap_enabled: 'false',
  },
};

const mockSettingsZeroxEnabled = {
  actions: {
    jupiter_swap_enabled: 'false',
    zerox_swap_enabled: 'true',
  },
};

const mockEmptyApiKeys = { keys: [] };

const mockApiKeysWithZerox = {
  keys: [
    {
      providerName: 'zerox_swap',
      hasKey: true,
      maskedKey: '0x-****abc',
      requiresApiKey: true,
      updatedAt: '2026-01-01',
    },
  ],
};

const mockEmptyProviders = { providers: [] };

const mockProvidersJupiter = {
  providers: [
    {
      name: 'jupiter_swap',
      description: 'Solana DEX aggregator',
      version: '1.0.0',
      chains: ['solana'],
      requiresApiKey: false,
      hasApiKey: false,
      actions: [
        { name: 'swap', description: 'Swap tokens on Solana via Jupiter aggregator with best price routing', chain: 'solana', riskLevel: 'medium', defaultTier: 'DELAY' },
      ],
    },
  ],
};

const mockSettingsWithTierOverride = {
  actions: {
    jupiter_swap_enabled: 'true',
    zerox_swap_enabled: 'false',
    jupiter_swap_swap_tier: 'APPROVAL',
  },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mockApiCalls(
  settingsData: Record<string, any> = mockSettingsDisabled,
  apiKeysData: { keys: any[] } = mockEmptyApiKeys,
  providersData: { providers: any[] } = mockEmptyProviders,
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

describe('ActionsPage', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  describe('rendering', () => {
    it('shows loading state initially', () => {
      vi.mocked(apiGet).mockImplementation(() => new Promise(() => {}));
      render(<ActionsPage />);

      expect(screen.getByText('Loading action providers...')).toBeTruthy();
    });

    it('renders all provider cards with Inactive status when disabled', async () => {
      mockApiCalls(mockSettingsDisabled, mockEmptyApiKeys, mockEmptyProviders);
      render(<ActionsPage />);

      await waitFor(() => {
        expect(screen.getByText('Jupiter Swap')).toBeTruthy();
      });
      expect(screen.getByText('0x Swap')).toBeTruthy();
      expect(screen.getByText('LI.FI')).toBeTruthy();
      expect(screen.getByText('Lido Staking')).toBeTruthy();
      expect(screen.getByText('Jito Staking')).toBeTruthy();

      // All 10 should show Inactive (Jupiter, 0x, D'CENT, LI.FI, Lido, Jito, Aave V3, Kamino, Pendle, Drift)
      const inactiveBadges = screen.getAllByText('Inactive');
      expect(inactiveBadges.length).toBe(10);
    });

    it('renders provider descriptions', async () => {
      mockApiCalls();
      render(<ActionsPage />);

      await waitFor(() => {
        expect(screen.getByText(/Solana DEX aggregator/)).toBeTruthy();
      });
      expect(screen.getByText(/EVM DEX aggregator \(AllowanceHolder\)/)).toBeTruthy();
    });

    it('renders category section headers', async () => {
      mockApiCalls();
      render(<ActionsPage />);

      await waitFor(() => {
        expect(screen.getByText('Swap')).toBeTruthy();
      });
      expect(screen.getByText('Bridge')).toBeTruthy();
      expect(screen.getByText('Staking')).toBeTruthy();
      expect(screen.getByText('Lending')).toBeTruthy();
      expect(screen.getByText('Yield')).toBeTruthy();
      expect(screen.getByText('Perp')).toBeTruthy();
    });

    it('renders chain badges', async () => {
      mockApiCalls();
      render(<ActionsPage />);

      await waitFor(() => {
        expect(screen.getAllByText('solana').length).toBeGreaterThanOrEqual(1);
      });
      expect(screen.getAllByText('evm').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('multi').length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('toggle provider enabled', () => {
    it('clicking enable toggle calls apiPut with correct setting key', async () => {
      mockApiCalls(mockSettingsDisabled);
      render(<ActionsPage />);

      await waitFor(() => {
        expect(screen.getByText('Jupiter Swap')).toBeTruthy();
      });

      // Find the checkbox for jupiter_swap
      const checkbox = document.querySelector(
        'input[name="actions.jupiter_swap_enabled"]',
      ) as HTMLInputElement;
      expect(checkbox).toBeTruthy();
      expect(checkbox.checked).toBe(false);

      vi.mocked(apiPut).mockResolvedValueOnce({
        updated: 1,
        settings: { ...mockSettingsDisabled, actions: { ...mockSettingsDisabled.actions, jupiter_swap_enabled: 'true' } },
      });

      fireEvent.change(checkbox, { target: { checked: true } });

      await waitFor(() => {
        expect(vi.mocked(apiPut)).toHaveBeenCalledWith('/v1/admin/settings', {
          settings: [{ key: 'actions.jupiter_swap_enabled', value: 'true' }],
        });
      });
    });

    it('successful toggle shows toast', async () => {
      mockApiCalls(mockSettingsDisabled);
      render(<ActionsPage />);

      await waitFor(() => {
        expect(screen.getByText('Jupiter Swap')).toBeTruthy();
      });

      const checkbox = document.querySelector(
        'input[name="actions.jupiter_swap_enabled"]',
      ) as HTMLInputElement;

      vi.mocked(apiPut).mockResolvedValueOnce({
        updated: 1,
        settings: { actions: { jupiter_swap_enabled: 'true', zerox_swap_enabled: 'false' } },
      });

      fireEvent.change(checkbox, { target: { checked: true } });

      await waitFor(() => {
        expect(vi.mocked(showToast)).toHaveBeenCalledWith(
          'success',
          'Enabled jupiter swap',
        );
      });
    });
  });

  describe('API key save', () => {
    it('renders Set button for provider requiring API key', async () => {
      mockApiCalls(mockSettingsDisabled, mockEmptyApiKeys);
      render(<ActionsPage />);

      await waitFor(() => {
        expect(screen.getByText('0x Swap')).toBeTruthy();
      });

      // 0x Swap requires API key, should show Set button
      expect(screen.getByText('Set')).toBeTruthy();
    });

    it('entering key and clicking Save calls apiPut with correct endpoint', async () => {
      mockApiCalls(mockSettingsDisabled, mockEmptyApiKeys);
      render(<ActionsPage />);

      await waitFor(() => {
        expect(screen.getByText('Set')).toBeTruthy();
      });

      // Click Set to open edit mode
      fireEvent.click(screen.getByText('Set'));

      await waitFor(() => {
        expect(
          document.querySelector('input[name="apikey-zerox_swap"]'),
        ).toBeTruthy();
      });

      const input = document.querySelector(
        'input[name="apikey-zerox_swap"]',
      ) as HTMLInputElement;
      fireEvent.input(input, { target: { value: 'test-api-key' } });

      vi.mocked(apiPut).mockResolvedValueOnce({});

      fireEvent.click(screen.getByText('Save'));

      await waitFor(() => {
        expect(vi.mocked(apiPut)).toHaveBeenCalledWith(
          '/v1/admin/api-keys/zerox_swap',
          { apiKey: 'test-api-key' },
        );
      });

      await waitFor(() => {
        expect(vi.mocked(showToast)).toHaveBeenCalledWith(
          'success',
          'API key saved for zerox_swap',
        );
      });
    });
  });

  describe('API key delete', () => {
    it('clicking Delete calls apiDelete with correct endpoint', async () => {
      mockApiCalls(mockSettingsDisabled, mockApiKeysWithZerox);
      render(<ActionsPage />);

      await waitFor(() => {
        expect(screen.getByText('0x-****abc')).toBeTruthy();
      });

      vi.mocked(apiDelete).mockResolvedValueOnce(undefined);

      fireEvent.click(screen.getByText('Delete'));

      await waitFor(() => {
        expect(vi.mocked(apiDelete)).toHaveBeenCalledWith(
          '/v1/admin/api-keys/zerox_swap',
        );
      });

      await waitFor(() => {
        expect(vi.mocked(showToast)).toHaveBeenCalledWith(
          'success',
          'API key deleted for zerox_swap',
        );
      });
    });

    it('renders Update button when key exists', async () => {
      mockApiCalls(mockSettingsDisabled, mockApiKeysWithZerox);
      render(<ActionsPage />);

      await waitFor(() => {
        expect(screen.getByText('Update')).toBeTruthy();
      });
    });
  });

  describe('status indicators', () => {
    it('shows Active when enabled and registered', async () => {
      mockApiCalls(mockSettingsJupiterEnabled, mockEmptyApiKeys, mockProvidersJupiter);
      render(<ActionsPage />);

      await waitFor(() => {
        expect(screen.getByText('Active')).toBeTruthy();
      });
    });

    it('shows Requires API Key when enabled but missing required key', async () => {
      mockApiCalls(mockSettingsZeroxEnabled, mockEmptyApiKeys, mockEmptyProviders);
      render(<ActionsPage />);

      await waitFor(() => {
        expect(screen.getByText('Requires API Key')).toBeTruthy();
      });
    });

    it('shows version badge when provider is registered', async () => {
      mockApiCalls(mockSettingsJupiterEnabled, mockEmptyApiKeys, mockProvidersJupiter);
      render(<ActionsPage />);

      await waitFor(() => {
        expect(screen.getByText('1.0.0')).toBeTruthy();
      });
    });

    it('shows actions table when provider is enabled and registered', async () => {
      mockApiCalls(mockSettingsJupiterEnabled, mockEmptyApiKeys, mockProvidersJupiter);
      render(<ActionsPage />);

      await waitFor(() => {
        expect(screen.getByText('Registered Actions')).toBeTruthy();
      });
      expect(screen.getByText('swap')).toBeTruthy();
    });
  });

  describe('description column and tier dropdown (Phase 331)', () => {
    it('renders Description column in Registered Actions table', async () => {
      mockApiCalls(mockSettingsJupiterEnabled, mockEmptyApiKeys, mockProvidersJupiter);
      render(<ActionsPage />);

      await waitFor(() => {
        expect(screen.getByText('Description')).toBeTruthy();
      });
      expect(screen.getByText(/Swap tokens on Solana via Jupiter/)).toBeTruthy();
    });

    it('renders Tier column header instead of Default Tier', async () => {
      mockApiCalls(mockSettingsJupiterEnabled, mockEmptyApiKeys, mockProvidersJupiter);
      render(<ActionsPage />);

      await waitFor(() => {
        expect(screen.getByText('Tier')).toBeTruthy();
      });
      expect(screen.queryByText('Default Tier')).toBeNull();
    });

    it('renders tier dropdown with correct current value', async () => {
      mockApiCalls(mockSettingsJupiterEnabled, mockEmptyApiKeys, mockProvidersJupiter);
      render(<ActionsPage />);

      await waitFor(() => {
        expect(screen.getByText('Registered Actions')).toBeTruthy();
      });

      const select = document.querySelector('select') as HTMLSelectElement;
      expect(select).toBeTruthy();
      expect(select.value).toBe('DELAY');
    });

    it('dropdown change calls PUT /v1/admin/settings with correct key', async () => {
      mockApiCalls(mockSettingsJupiterEnabled, mockEmptyApiKeys, mockProvidersJupiter);
      render(<ActionsPage />);

      await waitFor(() => {
        expect(screen.getByText('Registered Actions')).toBeTruthy();
      });

      const select = document.querySelector('select') as HTMLSelectElement;
      vi.mocked(apiPut).mockResolvedValueOnce({
        updated: 1,
        settings: { actions: { jupiter_swap_enabled: 'true', jupiter_swap_swap_tier: 'APPROVAL' } },
      });

      fireEvent.change(select, { target: { value: 'APPROVAL' } });

      await waitFor(() => {
        expect(vi.mocked(apiPut)).toHaveBeenCalledWith('/v1/admin/settings', {
          settings: [{ key: 'actions.jupiter_swap_swap_tier', value: 'APPROVAL' }],
        });
      });
    });

    it('shows customized badge when tier is overridden', async () => {
      mockApiCalls(mockSettingsWithTierOverride, mockEmptyApiKeys, mockProvidersJupiter);
      render(<ActionsPage />);

      await waitFor(() => {
        expect(screen.getByText('customized')).toBeTruthy();
      });
      expect(screen.getByText('reset')).toBeTruthy();
    });

    it('reset button calls PUT with empty value', async () => {
      mockApiCalls(mockSettingsWithTierOverride, mockEmptyApiKeys, mockProvidersJupiter);
      render(<ActionsPage />);

      await waitFor(() => {
        expect(screen.getByText('reset')).toBeTruthy();
      });

      vi.mocked(apiPut).mockResolvedValueOnce({
        updated: 1,
        settings: { actions: { jupiter_swap_enabled: 'true' } },
      });

      fireEvent.click(screen.getByText('reset'));

      await waitFor(() => {
        expect(vi.mocked(apiPut)).toHaveBeenCalledWith('/v1/admin/settings', {
          settings: [{ key: 'actions.jupiter_swap_swap_tier', value: '' }],
        });
      });
    });
  });

  describe("D'CENT Swap advanced settings", () => {
    const mockSettingsDcentEnabled = {
      actions: {
        jupiter_swap_enabled: 'false',
        zerox_swap_enabled: 'false',
        dcent_swap_enabled: 'true',
      },
    };

    it('renders Advanced Settings section when D\'CENT Swap is enabled', async () => {
      mockApiCalls(mockSettingsDcentEnabled, mockEmptyApiKeys, mockEmptyProviders);
      render(<ActionsPage />);

      await waitFor(() => {
        // D'CENT Swap card should render with enabled state
        expect(screen.getByText("D'CENT Swap Aggregator")).toBeTruthy();
      });

      // The D'CENT Swap advanced settings section should appear
      // There are multiple "Advanced Settings" labels (one per provider that supports it)
      const advancedLabels = screen.getAllByText('Advanced Settings');
      expect(advancedLabels.length).toBeGreaterThanOrEqual(1);
    });

    it('renders all D\'CENT Swap advanced setting fields', async () => {
      mockApiCalls(mockSettingsDcentEnabled, mockEmptyApiKeys, mockEmptyProviders);
      render(<ActionsPage />);

      await waitFor(() => {
        expect(screen.getByText("D'CENT Swap Aggregator")).toBeTruthy();
      });

      // Should render the DCent-specific advanced setting labels
      // keyToLabel maps slippage_bps keys to "Default Slippage (%)" / "Max Slippage (%)"
      expect(screen.getByText(/Dcent Swap Api Url/i)).toBeTruthy();
      // Multiple providers share the same "Default Slippage (%)" label
      const defaultSlippageLabels = screen.getAllByText(/Default Slippage \(%\)/i);
      expect(defaultSlippageLabels.length).toBeGreaterThanOrEqual(1);
      const maxSlippageLabels = screen.getAllByText(/Max Slippage \(%\)/i);
      expect(maxSlippageLabels.length).toBeGreaterThanOrEqual(1);
    });

    it('updates dirty state when editing D\'CENT Swap advanced field', async () => {
      mockApiCalls(mockSettingsDcentEnabled, mockEmptyApiKeys, mockEmptyProviders);
      render(<ActionsPage />);

      await waitFor(() => {
        expect(screen.getByText("D'CENT Swap Aggregator")).toBeTruthy();
      });

      // Find the dcent_swap_api_url input
      const input = document.querySelector('input[name="actions.dcent_swap_api_url"]') as HTMLInputElement;
      expect(input).toBeTruthy();

      // Type a value
      fireEvent.input(input, { target: { value: 'https://custom-api.test' } });

      expect(input.value).toBe('https://custom-api.test');
    });

    it('saves D\'CENT Swap advanced field on blur', async () => {
      mockApiCalls(mockSettingsDcentEnabled, mockEmptyApiKeys, mockEmptyProviders);
      render(<ActionsPage />);

      await waitFor(() => {
        expect(screen.getByText("D'CENT Swap Aggregator")).toBeTruthy();
      });

      const input = document.querySelector('input[name="actions.dcent_swap_api_url"]') as HTMLInputElement;
      expect(input).toBeTruthy();

      // Change the value
      fireEvent.input(input, { target: { value: 'https://custom-api.test' } });

      vi.mocked(apiPut).mockResolvedValueOnce({
        updated: 1,
        settings: { actions: { dcent_swap_api_url: 'https://custom-api.test' } },
      });

      // Blur the parent div to trigger save
      const parentDiv = input.closest('div[style]');
      if (parentDiv) {
        fireEvent.blur(parentDiv);
      }

      await waitFor(() => {
        expect(vi.mocked(apiPut)).toHaveBeenCalledWith('/v1/admin/settings', {
          settings: [{ key: 'actions.dcent_swap_api_url', value: 'https://custom-api.test' }],
        });
      });
    });

    it('does not render D\'CENT Swap advanced settings when provider is disabled', async () => {
      mockApiCalls(mockSettingsDisabled, mockEmptyApiKeys, mockEmptyProviders);
      render(<ActionsPage />);

      await waitFor(() => {
        expect(screen.getByText("D'CENT Swap Aggregator")).toBeTruthy();
      });

      // Advanced settings for dcent_swap should NOT appear
      const dcentInput = document.querySelector('input[name="actions.dcent_swap_api_url"]');
      expect(dcentInput).toBeNull();
    });

    it('shows existing settings values in D\'CENT Swap advanced fields', async () => {
      const settingsWithValues = {
        actions: {
          ...mockSettingsDcentEnabled.actions,
          dcent_swap_api_url: 'https://existing-api.com',
          dcent_swap_default_slippage_bps: '100',
        },
      };
      mockApiCalls(settingsWithValues, mockEmptyApiKeys, mockEmptyProviders);
      render(<ActionsPage />);

      await waitFor(() => {
        expect(screen.getByText("D'CENT Swap Aggregator")).toBeTruthy();
      });

      const urlInput = document.querySelector('input[name="actions.dcent_swap_api_url"]') as HTMLInputElement;
      expect(urlInput).toBeTruthy();
      expect(urlInput.value).toBe('https://existing-api.com');

      const slippageInput = document.querySelector('input[name="actions.dcent_swap_default_slippage_bps"]') as HTMLInputElement;
      expect(slippageInput).toBeTruthy();
      // bps 100 is displayed as 1% after bpsToPercent conversion
      expect(slippageInput.value).toBe('1');
    });
  });
});
