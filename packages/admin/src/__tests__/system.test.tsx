/**
 * system.test.tsx
 *
 * Tests for the System page (system.tsx):
 * - Rendering all 6 sections (API Keys, Oracle, Display Currency, Rate Limit, Log Level, Danger Zone)
 * - Daemon settings form fields (log level, oracle threshold, rate limit, display currency)
 * - Dirty tracking: save bar, save, discard
 * - API Keys CRUD (loading, list, set, change, save, cancel, delete, error)
 * - Danger Zone: shutdown modal with double-confirmation
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

vi.mock('../components/currency-select', () => ({
  CurrencySelect: ({ name, value, onChange }: any) => (
    <select
      name={name}
      value={value}
      onChange={(e: any) => onChange(e.target.value)}
    >
      <option value="USD">USD</option>
      <option value="KRW">KRW</option>
    </select>
  ),
}));

import { apiGet, apiPost, apiPut, apiDelete } from '../api/client';
import { showToast } from '../components/toast';
import { registerDirty, unregisterDirty } from '../utils/dirty-guard';
import SystemPage from '../pages/system';

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

const mockSettingsResponse = {
  daemon: { log_level: 'info' },
  oracle: { cross_validation_threshold: '5' },
  display: { currency: 'USD' },
  security: { rate_limit_global_ip_rpm: '1000' },
};

const mockApiKeys = {
  keys: [
    {
      providerName: 'coingecko',
      hasKey: true,
      maskedKey: 'CG-****abc',
      requiresApiKey: false,
      updatedAt: '2026-01-01',
    },
    {
      providerName: 'openai',
      hasKey: false,
      maskedKey: null,
      requiresApiKey: true,
      updatedAt: null,
    },
  ],
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mockApiCalls(
  settingsData = mockSettingsResponse,
  apiKeysData: { keys: any[] } = mockApiKeys,
) {
  vi.mocked(apiGet).mockImplementation(async (path: string) => {
    if (path === '/v1/admin/settings') return settingsData;
    if (path === '/v1/admin/api-keys') return apiKeysData;
    return {};
  });
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

describe('SystemPage', () => {
  describe('rendering', () => {
    afterEach(() => {
      cleanup();
      vi.clearAllMocks();
    });

    it('shows loading state initially', () => {
      vi.mocked(apiGet).mockImplementation(() => new Promise(() => {}));
      render(<SystemPage />);

      expect(screen.getByText('Loading settings...')).toBeTruthy();
    });

    it('renders all 6 sections after loading', async () => {
      mockApiCalls();
      render(<SystemPage />);

      await waitFor(() => {
        expect(screen.getByText('API Keys')).toBeTruthy();
      });
      expect(screen.getByText('Oracle')).toBeTruthy();
      // "Display Currency" appears in both <h3> heading and <label> (keyToLabel)
      expect(screen.getAllByText('Display Currency').length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText('Global IP Rate Limit')).toBeTruthy();
      // "Log Level" also appears in both <h3> heading and <label>
      expect(screen.getAllByText('Log Level').length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText('Danger Zone')).toBeTruthy();
    });

    it('registers dirty guard on mount', async () => {
      mockApiCalls();
      render(<SystemPage />);

      await waitFor(() => {
        expect(screen.getByText('Oracle')).toBeTruthy();
      });

      expect(vi.mocked(registerDirty)).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'system-settings' }),
      );
    });

    it('unregisters dirty guard on unmount', async () => {
      mockApiCalls();
      const { unmount } = render(<SystemPage />);

      await waitFor(() => {
        expect(screen.getByText('Oracle')).toBeTruthy();
      });

      unmount();

      expect(vi.mocked(unregisterDirty)).toHaveBeenCalledWith('system-settings');
    });
  });

  // ---------------------------------------------------------------------------
  // Daemon settings form
  // ---------------------------------------------------------------------------

  describe('Daemon settings form', () => {
    afterEach(() => {
      cleanup();
      vi.clearAllMocks();
    });

    it('renders log level select with current value', async () => {
      mockApiCalls();
      render(<SystemPage />);

      await waitFor(() => {
        const select = document.querySelector(
          'select[name="daemon.log_level"]',
        ) as HTMLSelectElement;
        expect(select).toBeTruthy();
        expect(select.value).toBe('info');
      });
    });

    it('renders oracle threshold field', async () => {
      mockApiCalls();
      render(<SystemPage />);

      await waitFor(() => {
        const input = document.querySelector(
          'input[name="oracle.cross_validation_threshold"]',
        ) as HTMLInputElement;
        expect(input).toBeTruthy();
        expect(input.value).toBe('5');
      });
    });

    it('renders rate limit field', async () => {
      mockApiCalls();
      render(<SystemPage />);

      await waitFor(() => {
        const input = document.querySelector(
          'input[name="security.rate_limit_global_ip_rpm"]',
        ) as HTMLInputElement;
        expect(input).toBeTruthy();
        expect(input.value).toBe('1000');
      });
    });

    it('renders display currency select', async () => {
      mockApiCalls();
      render(<SystemPage />);

      await waitFor(() => {
        const select = document.querySelector(
          'select[name="display.currency"]',
        ) as HTMLSelectElement;
        expect(select).toBeTruthy();
        expect(select.value).toBe('USD');
      });
    });

    it('changing log level shows save bar', async () => {
      mockApiCalls();
      render(<SystemPage />);

      await waitFor(() => {
        expect(
          document.querySelector('select[name="daemon.log_level"]'),
        ).toBeTruthy();
      });

      const select = document.querySelector(
        'select[name="daemon.log_level"]',
      ) as HTMLSelectElement;
      fireEvent.change(select, { target: { value: 'debug' } });

      await waitFor(() => {
        expect(screen.getByText(/unsaved change/)).toBeTruthy();
      });
    });

    it('changing oracle threshold shows save bar', async () => {
      mockApiCalls();
      render(<SystemPage />);

      await waitFor(() => {
        expect(
          document.querySelector(
            'input[name="oracle.cross_validation_threshold"]',
          ),
        ).toBeTruthy();
      });

      const input = document.querySelector(
        'input[name="oracle.cross_validation_threshold"]',
      ) as HTMLInputElement;
      fireEvent.input(input, { target: { value: '10' } });

      await waitFor(() => {
        expect(screen.getByText(/unsaved change/)).toBeTruthy();
      });
    });
  });

  // ---------------------------------------------------------------------------
  // Save and discard
  // ---------------------------------------------------------------------------

  describe('save and discard', () => {
    afterEach(() => {
      cleanup();
      vi.clearAllMocks();
    });

    it('save calls apiPut with filtered system entries', async () => {
      mockApiCalls();
      render(<SystemPage />);

      await waitFor(() => {
        expect(
          document.querySelector('select[name="daemon.log_level"]'),
        ).toBeTruthy();
      });

      const select = document.querySelector(
        'select[name="daemon.log_level"]',
      ) as HTMLSelectElement;
      fireEvent.change(select, { target: { value: 'debug' } });

      await waitFor(() => {
        expect(screen.getByText(/unsaved change/)).toBeTruthy();
      });

      vi.mocked(apiPut).mockResolvedValueOnce(undefined);

      fireEvent.click(screen.getByText('Save'));

      await waitFor(() => {
        expect(vi.mocked(apiPut)).toHaveBeenCalledWith('/v1/admin/settings', {
          settings: expect.arrayContaining([
            { key: 'daemon.log_level', value: 'debug' },
          ]),
        });
      });
    });

    it('save success shows toast and clears dirty', async () => {
      mockApiCalls();
      render(<SystemPage />);

      await waitFor(() => {
        expect(
          document.querySelector('select[name="daemon.log_level"]'),
        ).toBeTruthy();
      });

      const select = document.querySelector(
        'select[name="daemon.log_level"]',
      ) as HTMLSelectElement;
      fireEvent.change(select, { target: { value: 'debug' } });

      await waitFor(() => {
        expect(screen.getByText(/unsaved change/)).toBeTruthy();
      });

      vi.mocked(apiPut).mockResolvedValueOnce(undefined);

      fireEvent.click(screen.getByText('Save'));

      await waitFor(() => {
        expect(vi.mocked(showToast)).toHaveBeenCalledWith(
          'success',
          'Settings saved and applied',
        );
      });

      await waitFor(() => {
        expect(screen.queryByText(/unsaved change/)).toBeNull();
      });
    });

    it('save error shows error toast', async () => {
      mockApiCalls();
      render(<SystemPage />);

      await waitFor(() => {
        expect(
          document.querySelector('select[name="daemon.log_level"]'),
        ).toBeTruthy();
      });

      const select = document.querySelector(
        'select[name="daemon.log_level"]',
      ) as HTMLSelectElement;
      fireEvent.change(select, { target: { value: 'debug' } });

      await waitFor(() => {
        expect(screen.getByText(/unsaved change/)).toBeTruthy();
      });

      const MockApiError = (await import('../api/client')).ApiError;
      vi.mocked(apiPut).mockRejectedValueOnce(
        new MockApiError(400, 'SAVE_ERROR', 'Bad'),
      );

      fireEvent.click(screen.getByText('Save'));

      await waitFor(() => {
        expect(vi.mocked(showToast)).toHaveBeenCalledWith(
          'error',
          'Error: SAVE_ERROR',
        );
      });
    });

    it('discard clears save bar', async () => {
      mockApiCalls();
      render(<SystemPage />);

      await waitFor(() => {
        expect(
          document.querySelector('select[name="daemon.log_level"]'),
        ).toBeTruthy();
      });

      const select = document.querySelector(
        'select[name="daemon.log_level"]',
      ) as HTMLSelectElement;
      fireEvent.change(select, { target: { value: 'debug' } });

      await waitFor(() => {
        expect(screen.getByText(/unsaved change/)).toBeTruthy();
      });

      fireEvent.click(screen.getByText('Discard'));

      await waitFor(() => {
        expect(screen.queryByText(/unsaved change/)).toBeNull();
      });
    });
  });

  // ---------------------------------------------------------------------------
  // Settings fetch error
  // ---------------------------------------------------------------------------

  describe('settings fetch error', () => {
    afterEach(() => {
      cleanup();
      vi.clearAllMocks();
    });

    it('shows error toast on settings fetch failure', async () => {
      const MockApiError = (await import('../api/client')).ApiError;
      vi.mocked(apiGet).mockImplementation(async (path: string) => {
        if (path === '/v1/admin/settings')
          throw new MockApiError(500, 'SETTINGS_FETCH_FAIL', 'Fail');
        if (path === '/v1/admin/api-keys') return { keys: [] };
        return {};
      });

      render(<SystemPage />);

      await waitFor(() => {
        expect(vi.mocked(showToast)).toHaveBeenCalledWith(
          'error',
          'Error: SETTINGS_FETCH_FAIL',
        );
      });
    });
  });

  // ---------------------------------------------------------------------------
  // API Keys section
  // ---------------------------------------------------------------------------

  describe('API Keys section', () => {
    afterEach(() => {
      cleanup();
      vi.clearAllMocks();
    });

    it('shows loading state for API keys', () => {
      // Settings resolve immediately, api-keys never resolve
      vi.mocked(apiGet).mockImplementation(async (path: string) => {
        if (path === '/v1/admin/settings') return mockSettingsResponse;
        if (path === '/v1/admin/api-keys') return new Promise(() => {});
        return {};
      });

      render(<SystemPage />);

      // The API keys loading state shows while main loading is still true,
      // but once settings load, the API keys loading text appears
      waitFor(() => {
        expect(screen.getByText('Loading API keys...')).toBeTruthy();
      });
    });

    it('renders null when no API keys exist', async () => {
      mockApiCalls(mockSettingsResponse, { keys: [] });
      render(<SystemPage />);

      await waitFor(() => {
        expect(screen.getByText('Oracle')).toBeTruthy();
      });

      // API Keys heading should NOT be present when keys array is empty
      expect(screen.queryByText('API Keys')).toBeNull();
    });

    it('renders API key list with provider names', async () => {
      mockApiCalls();
      render(<SystemPage />);

      await waitFor(() => {
        expect(screen.getByText('coingecko')).toBeTruthy();
      });
      expect(screen.getByText('openai')).toBeTruthy();
    });

    it('shows maskedKey for providers with key', async () => {
      mockApiCalls();
      render(<SystemPage />);

      await waitFor(() => {
        expect(screen.getByText('CG-****abc')).toBeTruthy();
      });
      expect(screen.getByText('Not set')).toBeTruthy();
    });

    it('shows Change button for provider with key, Set button for provider without key', async () => {
      mockApiCalls();
      render(<SystemPage />);

      await waitFor(() => {
        expect(screen.getByText('coingecko')).toBeTruthy();
      });

      // coingecko has key -> Change button
      expect(screen.getByText('Change')).toBeTruthy();
      // openai has no key -> Set button
      expect(screen.getByText('Set')).toBeTruthy();
    });

    it('shows Delete button only for provider with key', async () => {
      mockApiCalls();
      render(<SystemPage />);

      await waitFor(() => {
        expect(screen.getByText('coingecko')).toBeTruthy();
      });

      // Only coingecko has a key, so only 1 Delete button
      const deleteButtons = screen.getAllByText('Delete');
      expect(deleteButtons.length).toBe(1);
    });

    it('shows Required badge for provider that requires key but has none', async () => {
      mockApiCalls();
      render(<SystemPage />);

      await waitFor(() => {
        expect(screen.getByText('Required')).toBeTruthy();
      });
    });

    it('clicking Set opens edit mode with password input', async () => {
      mockApiCalls();
      render(<SystemPage />);

      await waitFor(() => {
        expect(screen.getByText('Set')).toBeTruthy();
      });

      fireEvent.click(screen.getByText('Set'));

      await waitFor(() => {
        const input = document.querySelector(
          'input[name="apikey-openai"]',
        ) as HTMLInputElement;
        expect(input).toBeTruthy();
        expect(input.type).toBe('password');
      });

      // Save and Cancel buttons should be visible in edit mode
      expect(screen.getByText('Save')).toBeTruthy();
      expect(screen.getByText('Cancel')).toBeTruthy();
    });

    it('save API key calls apiPut and refreshes list', async () => {
      mockApiCalls();
      render(<SystemPage />);

      await waitFor(() => {
        expect(screen.getByText('Set')).toBeTruthy();
      });

      fireEvent.click(screen.getByText('Set'));

      await waitFor(() => {
        expect(
          document.querySelector('input[name="apikey-openai"]'),
        ).toBeTruthy();
      });

      const input = document.querySelector(
        'input[name="apikey-openai"]',
      ) as HTMLInputElement;
      // FormField uses onInput for password type
      fireEvent.input(input, { target: { value: 'new-key' } });

      vi.mocked(apiPut).mockResolvedValueOnce(undefined);

      fireEvent.click(screen.getByText('Save'));

      await waitFor(() => {
        expect(vi.mocked(apiPut)).toHaveBeenCalledWith(
          '/v1/admin/api-keys/openai',
          { apiKey: 'new-key' },
        );
      });

      await waitFor(() => {
        expect(vi.mocked(showToast)).toHaveBeenCalledWith(
          'success',
          'API key saved for openai',
        );
      });
    });

    it('cancel edit mode clears input and exits', async () => {
      mockApiCalls();
      render(<SystemPage />);

      await waitFor(() => {
        expect(screen.getByText('Set')).toBeTruthy();
      });

      fireEvent.click(screen.getByText('Set'));

      await waitFor(() => {
        expect(
          document.querySelector('input[name="apikey-openai"]'),
        ).toBeTruthy();
      });

      fireEvent.click(screen.getByText('Cancel'));

      await waitFor(() => {
        // Edit mode should be gone, password input should not exist
        expect(
          document.querySelector('input[name="apikey-openai"]'),
        ).toBeNull();
      });

      // Original display should be back
      expect(screen.getByText('Not set')).toBeTruthy();
    });

    it('delete API key calls apiDelete and refreshes', async () => {
      mockApiCalls();
      render(<SystemPage />);

      await waitFor(() => {
        expect(screen.getByText('Delete')).toBeTruthy();
      });

      vi.mocked(apiDelete).mockResolvedValueOnce(undefined);

      fireEvent.click(screen.getByText('Delete'));

      await waitFor(() => {
        expect(vi.mocked(apiDelete)).toHaveBeenCalledWith(
          '/v1/admin/api-keys/coingecko',
        );
      });

      await waitFor(() => {
        expect(vi.mocked(showToast)).toHaveBeenCalledWith(
          'success',
          'API key deleted for coingecko',
        );
      });
    });

    it('API key save error shows toast', async () => {
      mockApiCalls();
      render(<SystemPage />);

      await waitFor(() => {
        expect(screen.getByText('Set')).toBeTruthy();
      });

      fireEvent.click(screen.getByText('Set'));

      await waitFor(() => {
        expect(
          document.querySelector('input[name="apikey-openai"]'),
        ).toBeTruthy();
      });

      const input = document.querySelector(
        'input[name="apikey-openai"]',
      ) as HTMLInputElement;
      fireEvent.input(input, { target: { value: 'bad-key' } });

      const MockApiError = (await import('../api/client')).ApiError;
      vi.mocked(apiPut).mockRejectedValueOnce(
        new MockApiError(400, 'API_KEY_SAVE_ERROR', 'Invalid'),
      );

      fireEvent.click(screen.getByText('Save'));

      await waitFor(() => {
        expect(vi.mocked(showToast)).toHaveBeenCalledWith(
          'error',
          'Error: API_KEY_SAVE_ERROR',
        );
      });
    });

    it('API key delete error shows toast', async () => {
      mockApiCalls();
      render(<SystemPage />);

      await waitFor(() => {
        expect(screen.getByText('Delete')).toBeTruthy();
      });

      const MockApiError = (await import('../api/client')).ApiError;
      vi.mocked(apiDelete).mockRejectedValueOnce(
        new MockApiError(500, 'DELETE_ERROR', 'Failed'),
      );

      fireEvent.click(screen.getByText('Delete'));

      await waitFor(() => {
        expect(vi.mocked(showToast)).toHaveBeenCalledWith(
          'error',
          'Error: DELETE_ERROR',
        );
      });
    });
  });

  // ---------------------------------------------------------------------------
  // Danger Zone - Shutdown
  // ---------------------------------------------------------------------------

  describe('Danger Zone - Shutdown', () => {
    afterEach(() => {
      cleanup();
      vi.clearAllMocks();
    });

    it('renders Shutdown Daemon button', async () => {
      mockApiCalls();
      render(<SystemPage />);

      // Shutdown button is outside loading gate, should be visible immediately
      expect(screen.getByText('Shutdown Daemon')).toBeTruthy();
    });

    it('clicking Shutdown Daemon opens confirmation modal', async () => {
      mockApiCalls();
      render(<SystemPage />);

      fireEvent.click(screen.getByText('Shutdown Daemon'));

      await waitFor(() => {
        expect(screen.getByText(/Type/)).toBeTruthy();
        expect(
          document.querySelector('input[placeholder="SHUTDOWN"]'),
        ).toBeTruthy();
      });
    });

    it('confirm button disabled until SHUTDOWN typed', async () => {
      mockApiCalls();
      render(<SystemPage />);

      fireEvent.click(screen.getByText('Shutdown Daemon'));

      await waitFor(() => {
        expect(
          document.querySelector('input[placeholder="SHUTDOWN"]'),
        ).toBeTruthy();
      });

      // The confirm button in modal footer should be disabled
      const confirmBtn = document.querySelector(
        '.modal-footer button.btn-danger',
      ) as HTMLButtonElement;
      expect(confirmBtn).toBeTruthy();
      expect(confirmBtn.disabled).toBe(true);

      // Type SHUTDOWN
      const input = document.querySelector(
        'input[placeholder="SHUTDOWN"]',
      ) as HTMLInputElement;
      fireEvent.input(input, { target: { value: 'SHUTDOWN' } });

      await waitFor(() => {
        expect(confirmBtn.disabled).toBe(false);
      });
    });

    it('shutdown calls apiPost and shows overlay', async () => {
      mockApiCalls();
      render(<SystemPage />);

      fireEvent.click(screen.getByText('Shutdown Daemon'));

      await waitFor(() => {
        expect(
          document.querySelector('input[placeholder="SHUTDOWN"]'),
        ).toBeTruthy();
      });

      const input = document.querySelector(
        'input[placeholder="SHUTDOWN"]',
      ) as HTMLInputElement;
      fireEvent.input(input, { target: { value: 'SHUTDOWN' } });

      vi.mocked(apiPost).mockResolvedValueOnce({ message: 'ok' });

      // Find and click the confirm button in modal footer
      const confirmBtn = document.querySelector(
        '.modal-footer button.btn-danger',
      ) as HTMLButtonElement;
      fireEvent.click(confirmBtn);

      await waitFor(() => {
        expect(vi.mocked(apiPost)).toHaveBeenCalledWith('/v1/admin/shutdown');
      });

      await waitFor(() => {
        expect(screen.getByText('Daemon is shutting down...')).toBeTruthy();
      });
    });

    it('shutdown error shows toast', async () => {
      mockApiCalls();
      render(<SystemPage />);

      fireEvent.click(screen.getByText('Shutdown Daemon'));

      await waitFor(() => {
        expect(
          document.querySelector('input[placeholder="SHUTDOWN"]'),
        ).toBeTruthy();
      });

      const input = document.querySelector(
        'input[placeholder="SHUTDOWN"]',
      ) as HTMLInputElement;
      fireEvent.input(input, { target: { value: 'SHUTDOWN' } });

      const MockApiError = (await import('../api/client')).ApiError;
      vi.mocked(apiPost).mockRejectedValueOnce(
        new MockApiError(500, 'SHUTDOWN_ERROR', 'Failed'),
      );

      const confirmBtn = document.querySelector(
        '.modal-footer button.btn-danger',
      ) as HTMLButtonElement;
      fireEvent.click(confirmBtn);

      await waitFor(() => {
        expect(vi.mocked(showToast)).toHaveBeenCalledWith(
          'error',
          'Error: SHUTDOWN_ERROR',
        );
      });
    });

    it('cancel modal closes it', async () => {
      mockApiCalls();
      render(<SystemPage />);

      fireEvent.click(screen.getByText('Shutdown Daemon'));

      await waitFor(() => {
        expect(
          document.querySelector('input[placeholder="SHUTDOWN"]'),
        ).toBeTruthy();
      });

      fireEvent.click(screen.getByText('Cancel'));

      await waitFor(() => {
        expect(
          document.querySelector('input[placeholder="SHUTDOWN"]'),
        ).toBeNull();
      });
    });
  });
});
