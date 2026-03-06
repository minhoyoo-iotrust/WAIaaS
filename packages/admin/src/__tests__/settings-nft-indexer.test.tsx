/**
 * NFT Indexer section in Settings page tests.
 *
 * Tests cover:
 * - Shows "Configured" badge when alchemy_nft key is set
 * - Shows "Not configured" badge when key is not set
 * - NFT Indexer section renders with provider descriptions
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/preact';

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

vi.mock('../utils/dirty-guard', () => ({
  registerDirty: vi.fn(),
  unregisterDirty: vi.fn(),
  hasDirty: { value: false },
}));

vi.mock('../utils/display-currency', () => ({
  fetchDisplayCurrency: vi.fn(async () => ({ currency: 'USD', rate: 1 })),
  formatWithDisplay: (val: number) => `$${val.toFixed(2)}`,
}));

vi.mock('../components/layout', () => ({
  currentPath: { value: '/settings' },
}));

vi.mock('../components/settings-search', () => ({
  pendingNavigation: { value: null, peek: () => null },
  highlightField: vi.fn(),
}));

import { apiGet } from '../api/client';

const mockApiGet = vi.mocked(apiGet);

describe('Settings NFT Indexer Section', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  function setupMocks(apiKeys: Array<{ providerName: string; hasKey: boolean; maskedKey: string | null; requiresApiKey: boolean; updatedAt: string | null }>) {
    mockApiGet.mockImplementation(async (url: string) => {
      if (url.includes('/v1/admin/api-keys')) {
        return { keys: apiKeys };
      }
      if (url.includes('/v1/admin/settings')) {
        return {};
      }
      if (url.includes('/v1/admin/kill-switch')) {
        return { state: 'NORMAL', activatedAt: null, activatedBy: null };
      }
      if (url.includes('/v1/admin/status')) {
        return { status: 'ok' };
      }
      return {};
    });
  }

  it('shows Configured badge when alchemy_nft has key', async () => {
    setupMocks([
      { providerName: 'alchemy_nft', hasKey: true, maskedKey: 'abc...xyz', requiresApiKey: true, updatedAt: '2026-03-06' },
      { providerName: 'helius', hasKey: false, maskedKey: null, requiresApiKey: true, updatedAt: null },
    ]);
    const SettingsPage = (await import('../pages/settings')).default;
    render(<SettingsPage />);

    await waitFor(() => {
      expect(screen.getByText('NFT Indexer')).toBeTruthy();
    });

    await waitFor(() => {
      expect(screen.getByText('Configured')).toBeTruthy();
      expect(screen.getByText('Not configured')).toBeTruthy();
    });
  });

  it('shows NFT Indexer section title and descriptions', async () => {
    setupMocks([
      { providerName: 'alchemy_nft', hasKey: false, maskedKey: null, requiresApiKey: true, updatedAt: null },
      { providerName: 'helius', hasKey: true, maskedKey: 'hel...key', requiresApiKey: true, updatedAt: '2026-03-06' },
    ]);
    const SettingsPage = (await import('../pages/settings')).default;
    render(<SettingsPage />);

    await waitFor(() => {
      expect(screen.getByText('NFT Indexer')).toBeTruthy();
      expect(screen.getByText('Alchemy NFT')).toBeTruthy();
      expect(screen.getByText('Helius')).toBeTruthy();
    });
  });
});
