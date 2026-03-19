/**
 * actions.test.tsx
 *
 * Tests for the Actions page (actions.tsx):
 * - Renders provider list with Jupiter Swap and 0x Swap cards
 * - Toggle enable/disable calls mockApiPut with correct settings key
 * - API key save calls mockApiPut with correct endpoint
 * - API key delete calls mockApiDelete with correct endpoint
 * - Active status when enabled and registered
 * - Requires API Key status when enabled but missing key
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent, cleanup } from '@testing-library/preact';


const mockApiGet = vi.fn();
const mockApiPost = vi.fn();
const mockApiPut = vi.fn();
const mockApiDelete = vi.fn();
const mockApiPatch = vi.fn();

// Mock declarations moved to top-level const

vi.mock('../api/typed-client', async () => {
  const { ApiError } = await import('../api/client');
  return {
    api: {
      GET: (...args: unknown[]) => mockApiGet(...args),
      POST: (...args: unknown[]) => mockApiPost(...args),
      PUT: (...args: unknown[]) => mockApiPut(...args),
      DELETE: (...args: unknown[]) => mockApiDelete(...args),
      PATCH: (...args: unknown[]) => mockApiPatch(...args),
    },
    ApiError,
  };
});

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

/** All built-in providers with new fields (enabledKey, category, isEnabled) */
const mockAllProvidersDisabled = {
  providers: [
    { name: 'jupiter_swap', description: 'Solana DEX aggregator', version: '1.0.0', chains: ['solana'], mcpExpose: true, requiresApiKey: true, hasApiKey: false, enabledKey: 'jupiter_swap', category: 'Swap', isEnabled: false, actions: [] },
    { name: 'zerox_swap', description: 'EVM DEX aggregator (AllowanceHolder)', version: '1.0.0', chains: ['evm'], mcpExpose: true, requiresApiKey: true, hasApiKey: false, enabledKey: 'zerox_swap', category: 'Swap', isEnabled: false, actions: [] },
    { name: 'lido_staking', description: 'ETH liquid staking (stETH/wstETH)', version: '1.0.0', chains: ['evm'], mcpExpose: false, requiresApiKey: false, hasApiKey: false, enabledKey: 'lido_staking', category: 'Staking', isEnabled: false, actions: [] },
  ],
};

const mockProvidersJupiter = {
  providers: [
    {
      name: 'jupiter_swap',
      description: 'Solana DEX aggregator',
      version: '1.0.0',
      chains: ['solana'],
      mcpExpose: true,
      requiresApiKey: false,
      hasApiKey: false,
      enabledKey: 'jupiter_swap',
      category: 'Swap',
      isEnabled: true,
      actions: [
        { name: 'swap', description: 'Swap tokens on Solana via Jupiter aggregator with best price routing', chain: 'solana', riskLevel: 'medium', defaultTier: 'DELAY' },
      ],
    },
  ],
};

const mockProvidersZeroxEnabled = {
  providers: [
    { name: 'zerox_swap', description: 'EVM DEX aggregator (AllowanceHolder)', version: '1.0.0', chains: ['evm'], mcpExpose: true, requiresApiKey: true, hasApiKey: true, enabledKey: 'zerox_swap', category: 'Swap', isEnabled: true, actions: [] },
  ],
};

const mockProvidersZeroxDisabled = {
  providers: [
    { name: 'zerox_swap', description: 'EVM DEX aggregator (AllowanceHolder)', version: '1.0.0', chains: ['evm'], mcpExpose: true, requiresApiKey: true, hasApiKey: false, enabledKey: 'zerox_swap', category: 'Swap', isEnabled: false, actions: [] },
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
  mockApiGet.mockImplementation(async (path: string) => {
    if (path === '/v1/admin/settings') return { data: settingsData };
    if (path === '/v1/admin/api-keys') return { data: apiKeysData };
    if (path === '/v1/actions/providers') return { data: providersData };
    return { data: {} };
  });
  mockApiPut.mockImplementation(async () => ({ data: { updated: 1, settings: settingsData } }));
  mockApiDelete.mockImplementation(async () => ({ data: undefined }));
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
      mockApiGet.mockImplementation(() => new Promise(() => {}));
      render(<ActionsPage />);

      expect(screen.getByText('Loading action providers...')).toBeTruthy();
    });

    it('renders provider cards from API response with Inactive status when disabled', async () => {
      mockApiCalls(mockSettingsDisabled, mockEmptyApiKeys, mockAllProvidersDisabled);
      render(<ActionsPage />);

      // #355: TabNav auto-selects first category (Swap) — Lido Staking is in Staking tab
      await waitFor(() => {
        expect(screen.getByText('Jupiter Swap')).toBeTruthy();
      });
      expect(screen.getByText('Zerox Swap')).toBeTruthy();

      // Swap tab providers should show Inactive
      const inactiveBadges = screen.getAllByText('Inactive');
      expect(inactiveBadges.length).toBe(2);

      // Switch to Staking tab to verify Lido Staking
      const stakingTab = screen.getByText('Staking');
      stakingTab.click();
      await waitFor(() => {
        expect(screen.getByText('Lido Staking')).toBeTruthy();
      });
    });

    it('shows empty state when no providers returned from API', async () => {
      mockApiCalls(mockSettingsDisabled, mockEmptyApiKeys, mockEmptyProviders);
      render(<ActionsPage />);

      await waitFor(() => {
        expect(screen.getByText('No action providers available.')).toBeTruthy();
      });
    });

    it('renders provider descriptions from API', async () => {
      mockApiCalls(mockSettingsDisabled, mockEmptyApiKeys, mockAllProvidersDisabled);
      render(<ActionsPage />);

      await waitFor(() => {
        expect(screen.getByText(/Solana DEX aggregator/)).toBeTruthy();
      });
      expect(screen.getByText(/EVM DEX aggregator \(AllowanceHolder\)/)).toBeTruthy();
    });

    it('renders category section headers from API', async () => {
      mockApiCalls(mockSettingsDisabled, mockEmptyApiKeys, mockAllProvidersDisabled);
      render(<ActionsPage />);

      await waitFor(() => {
        expect(screen.getByText('Swap')).toBeTruthy();
      });
      expect(screen.getByText('Staking')).toBeTruthy();
    });

    it('renders chain badges from API', async () => {
      mockApiCalls(mockSettingsDisabled, mockEmptyApiKeys, mockAllProvidersDisabled);
      render(<ActionsPage />);

      await waitFor(() => {
        expect(screen.getAllByText('solana').length).toBeGreaterThanOrEqual(1);
      });
      expect(screen.getAllByText('evm').length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('toggle provider enabled', () => {
    it('clicking enable toggle calls mockApiPut with correct setting key', async () => {
      mockApiCalls(mockSettingsDisabled, mockEmptyApiKeys, mockAllProvidersDisabled);
      render(<ActionsPage />);

      await waitFor(() => {
        expect(screen.getByText('Jupiter Swap')).toBeTruthy();
      });

      const checkbox = document.querySelector(
        'input[name="actions.jupiter_swap_enabled"]',
      ) as HTMLInputElement;
      expect(checkbox).toBeTruthy();
      expect(checkbox.checked).toBe(false);

      mockApiPut.mockResolvedValueOnce({ data: {
        data: { updated: 1, settings: { actions: { jupiter_swap_enabled: 'true' } } },
      } });

      fireEvent.change(checkbox, { target: { checked: true } });

      await waitFor(() => {
        expect(mockApiPut).toHaveBeenCalledWith('/v1/admin/settings', expect.objectContaining({
          body: { settings: [{ key: 'actions.jupiter_swap_enabled', value: 'true' }] },
        }));
      });
    });

    it('successful toggle shows toast', async () => {
      mockApiCalls(mockSettingsDisabled, mockEmptyApiKeys, mockAllProvidersDisabled);
      render(<ActionsPage />);

      await waitFor(() => {
        expect(screen.getByText('Jupiter Swap')).toBeTruthy();
      });

      const checkbox = document.querySelector(
        'input[name="actions.jupiter_swap_enabled"]',
      ) as HTMLInputElement;

      mockApiPut.mockResolvedValueOnce({ data: {
        data: { updated: 1, settings: { actions: { jupiter_swap_enabled: 'true' } } },
      } });

      fireEvent.change(checkbox, { target: { checked: true } });

      await waitFor(() => {
        expect(vi.mocked(showToast)).toHaveBeenCalledWith(
          'success',
          expect.stringContaining('Enabled'),
        );
      });
    });
  });

  describe('API key save', () => {
    it('renders Set button for provider requiring API key', async () => {
      mockApiCalls(mockSettingsDisabled, mockEmptyApiKeys, mockProvidersZeroxDisabled);
      render(<ActionsPage />);

      await waitFor(() => {
        expect(screen.getByText('Zerox Swap')).toBeTruthy();
      });

      const setButtons = screen.getAllByText('Set');
      expect(setButtons.length).toBeGreaterThanOrEqual(1);
    });

    it('entering key and clicking Save calls mockApiPut with correct endpoint', async () => {
      mockApiCalls(mockSettingsDisabled, mockEmptyApiKeys, mockProvidersZeroxDisabled);
      render(<ActionsPage />);

      await waitFor(() => {
        expect(screen.getAllByText('Set').length).toBeGreaterThanOrEqual(1);
      });

      const setButtons = screen.getAllByText('Set');
      fireEvent.click(setButtons[0]);

      await waitFor(() => {
        expect(
          document.querySelector('input[name="apikey-zerox_swap"]'),
        ).toBeTruthy();
      });

      const input = document.querySelector(
        'input[name="apikey-zerox_swap"]',
      ) as HTMLInputElement;
      fireEvent.input(input, { target: { value: 'test-api-key' } });

      mockApiPut.mockResolvedValueOnce({ data: {} });

      fireEvent.click(screen.getByText('Save'));

      await waitFor(() => {
        expect(mockApiPut).toHaveBeenCalledWith(
          '/v1/admin/api-keys/{provider}',
          expect.objectContaining({ body: { apiKey: 'test-api-key' } }),
        );
      });
    });
  });

  describe('API key delete', () => {
    it('clicking Delete calls mockApiDelete with correct endpoint', async () => {
      mockApiCalls(mockSettingsDisabled, mockApiKeysWithZerox, mockProvidersZeroxDisabled);
      render(<ActionsPage />);

      await waitFor(() => {
        expect(screen.getByText('0x-****abc')).toBeTruthy();
      });

      mockApiDelete.mockResolvedValueOnce(undefined);

      fireEvent.click(screen.getByText('Delete'));

      await waitFor(() => {
        expect(mockApiDelete).toHaveBeenCalledWith(
          '/v1/admin/api-keys/{provider}',
          expect.objectContaining({ params: { path: { provider: 'zerox_swap' } } }),
        );
      });
    });

    it('renders Update button when key exists', async () => {
      mockApiCalls(mockSettingsDisabled, mockApiKeysWithZerox, mockProvidersZeroxDisabled);
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
      const mockZeroxEnabledNoKey = {
        providers: [
          { name: 'zerox_swap', description: 'EVM DEX aggregator (AllowanceHolder)', version: '1.0.0', chains: ['evm'], mcpExpose: true, requiresApiKey: true, hasApiKey: false, enabledKey: 'zerox_swap', category: 'Swap', isEnabled: true, actions: [] },
        ],
      };
      mockApiCalls(mockSettingsZeroxEnabled, mockEmptyApiKeys, mockZeroxEnabledNoKey);
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
      mockApiPut.mockResolvedValueOnce({ data: {
        updated: 1,
        settings: { actions: { jupiter_swap_enabled: 'true', jupiter_swap_swap_tier: 'APPROVAL' } },
      } });

      fireEvent.change(select, { target: { value: 'APPROVAL' } });

      await waitFor(() => {
        expect(mockApiPut).toHaveBeenCalledWith('/v1/admin/settings', expect.objectContaining({
          body: { settings: [{ key: 'actions.jupiter_swap_swap_tier', value: 'APPROVAL' }] },
        }));
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

      mockApiPut.mockResolvedValueOnce({ data: {
        updated: 1,
        settings: { actions: { jupiter_swap_enabled: 'true' } },
      } });

      fireEvent.click(screen.getByText('reset'));

      await waitFor(() => {
        expect(mockApiPut).toHaveBeenCalledWith('/v1/admin/settings', expect.objectContaining({
          body: { settings: [{ key: 'actions.jupiter_swap_swap_tier', value: '' }] },
        }));
      });
    });
  });

  describe('Pendle Yield advanced settings', () => {
    const mockPendleProvider = {
      providers: [
        { name: 'pendle_yield', description: 'EVM yield trading: buy/sell PT/YT', version: '1.0.0', chains: ['evm'], mcpExpose: false, requiresApiKey: false, hasApiKey: false, enabledKey: 'pendle_yield', category: 'Yield', isEnabled: true, actions: [] },
      ],
    };

    it('renders Advanced Settings section when Pendle Yield is enabled', async () => {
      mockApiCalls({}, mockEmptyApiKeys, mockPendleProvider);
      render(<ActionsPage />);

      await waitFor(() => {
        expect(screen.getByText('Pendle Yield')).toBeTruthy();
      });

      const advancedLabels = screen.getAllByText('Advanced Settings');
      expect(advancedLabels.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe("D'CENT Swap advanced settings", () => {
    const mockDcentProvider = {
      providers: [
        { name: 'dcent_swap', description: "D'CENT Swap Aggregator multi-chain DEX", version: '1.0.0', chains: ['evm'], mcpExpose: false, requiresApiKey: false, hasApiKey: false, enabledKey: 'dcent_swap', category: 'Swap', isEnabled: true, actions: [] },
      ],
    };
    const mockDcentProviderDisabled = {
      providers: [
        { name: 'dcent_swap', description: "D'CENT Swap Aggregator multi-chain DEX", version: '1.0.0', chains: ['evm'], mcpExpose: false, requiresApiKey: false, hasApiKey: false, enabledKey: 'dcent_swap', category: 'Swap', isEnabled: false, actions: [] },
      ],
    };

    it('renders Advanced Settings section when D\'CENT Swap is enabled', async () => {
      mockApiCalls({}, mockEmptyApiKeys, mockDcentProvider);
      render(<ActionsPage />);

      await waitFor(() => {
        // D'CENT Swap card should render -- name from API is dcent_swap, displayed as "Dcent Swap"
        expect(screen.getByText('Dcent Swap')).toBeTruthy();
      });

      // The D'CENT Swap advanced settings section should appear
      // There are multiple "Advanced Settings" labels (one per provider that supports it)
      const advancedLabels = screen.getAllByText('Advanced Settings');
      expect(advancedLabels.length).toBeGreaterThanOrEqual(1);
    });

    it('renders all D\'CENT Swap advanced setting fields', async () => {
      mockApiCalls({}, mockEmptyApiKeys, mockDcentProvider);
      render(<ActionsPage />);

      await waitFor(() => {
        expect(screen.getByText('Dcent Swap')).toBeTruthy();
      });

      expect(screen.getByText(/Dcent Swap Api Url/i)).toBeTruthy();
      // Multiple providers share slippage labels (keyToLabel fallback produces title-case)
      const defaultSlippageLabels = screen.getAllByText(/Default Slippage Bps/i);
      expect(defaultSlippageLabels.length).toBeGreaterThanOrEqual(1);
      const maxSlippageLabels = screen.getAllByText(/Max Slippage Bps/i);
      expect(maxSlippageLabels.length).toBeGreaterThanOrEqual(1);
    });

    it('updates dirty state when editing D\'CENT Swap advanced field', async () => {
      mockApiCalls({}, mockEmptyApiKeys, mockDcentProvider);
      render(<ActionsPage />);

      await waitFor(() => {
        expect(screen.getByText('Dcent Swap')).toBeTruthy();
      });

      // Find the dcent_swap_api_url input
      const input = document.querySelector('input[name="actions.dcent_swap_api_url"]') as HTMLInputElement;
      expect(input).toBeTruthy();

      // Type a value
      fireEvent.input(input, { target: { value: 'https://custom-api.test' } });

      expect(input.value).toBe('https://custom-api.test');
    });

    it('saves D\'CENT Swap advanced field on blur', async () => {
      mockApiCalls({}, mockEmptyApiKeys, mockDcentProvider);
      render(<ActionsPage />);

      await waitFor(() => {
        expect(screen.getByText('Dcent Swap')).toBeTruthy();
      });

      const input = document.querySelector('input[name="actions.dcent_swap_api_url"]') as HTMLInputElement;
      expect(input).toBeTruthy();

      // Change the value
      fireEvent.input(input, { target: { value: 'https://custom-api.test' } });

      mockApiPut.mockResolvedValueOnce({ data: {
        updated: 1,
        settings: { actions: { dcent_swap_api_url: 'https://custom-api.test' } },
      } });

      // Blur the parent div to trigger save
      const parentDiv = input.closest('div[style]');
      if (parentDiv) {
        fireEvent.blur(parentDiv);
      }

      await waitFor(() => {
        expect(mockApiPut).toHaveBeenCalledWith('/v1/admin/settings', expect.objectContaining({
          body: { settings: [{ key: 'actions.dcent_swap_api_url', value: 'https://custom-api.test' }] },
        }));
      });
    });

    it('does not render D\'CENT Swap advanced settings when provider is disabled', async () => {
      mockApiCalls({}, mockEmptyApiKeys, mockDcentProviderDisabled);
      render(<ActionsPage />);

      await waitFor(() => {
        expect(screen.getByText('Dcent Swap')).toBeTruthy();
      });

      // Advanced settings for dcent_swap should NOT appear
      const dcentInput = document.querySelector('input[name="actions.dcent_swap_api_url"]');
      expect(dcentInput).toBeNull();
    });

    it('shows existing settings values in D\'CENT Swap advanced fields', async () => {
      const settingsWithValues = {
        actions: {
          dcent_swap_api_url: 'https://existing-api.com',
          dcent_swap_default_slippage_bps: '100',
        },
      };
      mockApiCalls(settingsWithValues, mockEmptyApiKeys, mockDcentProvider);
      render(<ActionsPage />);

      await waitFor(() => {
        expect(screen.getByText('Dcent Swap')).toBeTruthy();
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
