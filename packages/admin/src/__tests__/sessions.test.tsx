import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
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

vi.mock('../components/copy-button', () => ({
  CopyButton: ({ value, label }: { value: string; label?: string }) => (
    <button>{label ?? 'Copy'}</button>
  ),
}));

vi.mock('../components/empty-state', () => ({
  EmptyState: ({ title, description }: { title: string; description?: string }) => (
    <div>
      <h3>{title}</h3>
      {description && <p>{description}</p>}
    </div>
  ),
}));

vi.mock('../utils/error-messages', () => ({
  getErrorMessage: (code: string) => `Error: ${code}`,
}));

vi.mock('../utils/dirty-guard', () => ({
  registerDirty: vi.fn(),
  unregisterDirty: vi.fn(),
  hasDirty: { value: false },
}));

vi.mock('../components/settings-search', () => {
  const { signal } = require('@preact/signals');
  return {
    pendingNavigation: signal(null),
    highlightField: signal(''),
    SettingsSearch: () => null,
  };
});

import { apiGet, apiPost, apiPut, apiDelete, ApiError } from '../api/client';
import { showToast } from '../components/toast';
import SessionsPage from '../pages/sessions';

const mockWallets = {
  items: [
    {
      id: 'wallet-1',
      name: 'bot-alpha',
      chain: 'solana',
      network: 'devnet',
      publicKey: 'abc',
      status: 'ACTIVE',
      createdAt: 1707609600,
    },
  ],
};

const mockSessions = [
  {
    id: 'sess-1',
    walletId: 'wallet-1',
    status: 'ACTIVE',
    renewalCount: 0,
    maxRenewals: 10,
    expiresAt: 1707696000,
    absoluteExpiresAt: 1707782400,
    createdAt: 1707609600,
    lastRenewedAt: null,
  },
];

const mockCreatedSession = {
  id: 'sess-2',
  token: 'jwt-token-abc123',
  expiresAt: 1707696000,
  walletId: 'wallet-1',
};

describe('SessionsPage', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('should load and display sessions for selected agent', async () => {
    vi.mocked(apiGet)
      .mockResolvedValueOnce(mockWallets) // wallets load
      .mockResolvedValueOnce([]) // initial sessions (all wallets)
      .mockResolvedValueOnce(mockSessions); // sessions for selected wallet

    render(<SessionsPage />);

    // Wait for wallets dropdown to load
    await waitFor(() => {
      expect(screen.getByText(/bot-alpha/)).toBeTruthy();
    });

    // Select wallet
    const select = screen.getByLabelText('Wallet') as HTMLSelectElement;
    fireEvent.change(select, { target: { value: 'wallet-1' } });

    // Wait for sessions to load
    await waitFor(() => {
      expect(screen.getByText('ACTIVE')).toBeTruthy();
    });

    // Verify session row shows truncated ID
    expect(screen.getByText('sess-1...')).toBeTruthy();
  });

  it('should create session and show token modal', async () => {
    vi.mocked(apiGet)
      .mockResolvedValueOnce(mockWallets) // initial wallets load
      .mockResolvedValueOnce([]) // initial sessions (all wallets)
      .mockResolvedValueOnce(mockSessions) // sessions after wallet select
      .mockResolvedValueOnce(mockSessions); // refresh after create

    vi.mocked(apiPost).mockResolvedValueOnce(mockCreatedSession);

    render(<SessionsPage />);

    // Wait for wallets dropdown
    await waitFor(() => {
      expect(screen.getByText(/bot-alpha/)).toBeTruthy();
    });

    // Select wallet
    const select = screen.getByLabelText('Wallet') as HTMLSelectElement;
    fireEvent.change(select, { target: { value: 'wallet-1' } });

    // Wait for sessions to load
    await waitFor(() => {
      expect(screen.getByText('ACTIVE')).toBeTruthy();
    });

    // Click Create Session
    fireEvent.click(screen.getByText('Create Session'));

    // Wait for token modal
    await waitFor(() => {
      expect(screen.getByText(/Copy this token now/i)).toBeTruthy();
    });

    expect(screen.getByText('jwt-token-abc123')).toBeTruthy();
    expect(vi.mocked(apiPost)).toHaveBeenCalledWith('/v1/sessions', {
      walletId: 'wallet-1',
    });
  });

  it('should revoke session with confirmation modal', async () => {
    vi.mocked(apiGet)
      .mockResolvedValueOnce(mockWallets) // wallets load
      .mockResolvedValueOnce([]) // initial sessions (all wallets)
      .mockResolvedValueOnce(mockSessions) // sessions for selected wallet
      .mockResolvedValueOnce([]); // refresh after revoke

    vi.mocked(apiDelete).mockResolvedValueOnce(undefined);

    render(<SessionsPage />);

    // Wait for wallets dropdown
    await waitFor(() => {
      expect(screen.getByText(/bot-alpha/)).toBeTruthy();
    });

    // Select wallet
    const select = screen.getByLabelText('Wallet') as HTMLSelectElement;
    fireEvent.change(select, { target: { value: 'wallet-1' } });

    // Wait for sessions to load and Revoke button to appear
    await waitFor(() => {
      expect(screen.getByText('Revoke')).toBeTruthy();
    });

    // Click Revoke
    fireEvent.click(screen.getByText('Revoke'));

    // Wait for confirmation modal
    await waitFor(() => {
      expect(
        screen.getByText(/Are you sure you want to revoke this session/i),
      ).toBeTruthy();
    });

    // The modal has a "Revoke" confirm button - need to find the one in the modal
    // The modal footer has "Cancel" and "Revoke" buttons
    const modalButtons = screen.getAllByText('Revoke');
    // The last one should be the modal confirm button
    fireEvent.click(modalButtons[modalButtons.length - 1]);

    await waitFor(() => {
      expect(vi.mocked(apiDelete)).toHaveBeenCalledWith('/v1/sessions/sess-1');
    });
  });
});

// ---------------------------------------------------------------------------
// Additional Coverage: Error paths, source filter, bulk, settings tab
// ---------------------------------------------------------------------------

const mockWallets2 = {
  items: [
    {
      id: 'wallet-1',
      name: 'bot-alpha',
      chain: 'solana',
      network: 'devnet',
      publicKey: 'abc',
      status: 'ACTIVE',
      createdAt: 1707609600,
    },
    {
      id: 'wallet-2',
      name: 'bot-beta',
      chain: 'ethereum',
      network: 'sepolia',
      publicKey: 'def',
      status: 'ACTIVE',
      createdAt: 1707609700,
    },
  ],
};

const mockSessionsFull = [
  {
    id: 'sess-1',
    walletId: 'wallet-1',
    walletName: 'bot-alpha',
    status: 'ACTIVE',
    renewalCount: 0,
    maxRenewals: 10,
    expiresAt: 1707696000,
    absoluteExpiresAt: 1707782400,
    createdAt: 1707609600,
    lastRenewedAt: null,
    source: 'api' as const,
  },
  {
    id: 'sess-2',
    walletId: 'wallet-1',
    walletName: 'bot-alpha',
    status: 'ACTIVE',
    renewalCount: 2,
    maxRenewals: 10,
    expiresAt: 1707696000,
    absoluteExpiresAt: 1707782400,
    createdAt: 1707609700,
    lastRenewedAt: 1707620000,
    source: 'mcp' as const,
  },
  {
    id: 'sess-3',
    walletId: 'wallet-2',
    walletName: 'bot-beta',
    status: 'EXPIRED',
    renewalCount: 5,
    maxRenewals: 10,
    expiresAt: 1707500000,
    absoluteExpiresAt: 1707600000,
    createdAt: 1707400000,
    lastRenewedAt: 1707450000,
    source: 'api' as const,
  },
];

function setupSessionsMocks() {
  vi.mocked(apiGet).mockImplementation((url: string) => {
    if (url === '/v1/wallets') return Promise.resolve(mockWallets2);
    if (url === '/v1/sessions' || url.includes('/v1/sessions?')) return Promise.resolve(mockSessionsFull);
    if (url === '/v1/admin/settings') return Promise.resolve({
      security: {
        session_ttl: '3600',
        session_absolute_lifetime: '86400',
        session_max_renewals: '10',
        max_sessions_per_wallet: '5',
        max_pending_tx: '10',
        rate_limit_session_rpm: '60',
        rate_limit_tx_rpm: '10',
      },
    });
    return Promise.resolve({});
  });
}

describe('SessionsPage - Error handling', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('shows error toast when fetchWallets fails', async () => {
    vi.mocked(apiGet).mockImplementation((url: string) => {
      if (url === '/v1/wallets') return Promise.reject(new ApiError(500, 'INTERNAL', 'Server error'));
      return Promise.resolve([]);
    });

    render(<SessionsPage />);

    await waitFor(() => {
      expect(vi.mocked(showToast)).toHaveBeenCalledWith('error', 'Error: INTERNAL');
    });
  });

  it('shows error toast when fetchSessions fails', async () => {
    vi.mocked(apiGet).mockImplementation((url: string) => {
      if (url === '/v1/wallets') return Promise.resolve(mockWallets);
      return Promise.reject(new ApiError(500, 'SESSION_ERROR', 'Failed'));
    });

    render(<SessionsPage />);

    await waitFor(() => {
      expect(vi.mocked(showToast)).toHaveBeenCalledWith('error', 'Error: SESSION_ERROR');
    });
  });

  it('shows error toast when handleCreate fails', async () => {
    vi.mocked(apiGet)
      .mockResolvedValueOnce(mockWallets) // wallets
      .mockResolvedValueOnce([]); // initial sessions

    vi.mocked(apiPost).mockRejectedValueOnce(new ApiError(400, 'CREATE_FAIL', 'Creation failed'));

    render(<SessionsPage />);

    await waitFor(() => {
      expect(screen.getByText(/bot-alpha/)).toBeTruthy();
    });

    // Select wallet first (Create Session is disabled without wallet)
    const select = screen.getByLabelText('Wallet') as HTMLSelectElement;
    vi.mocked(apiGet).mockResolvedValueOnce(mockSessionsFull);
    fireEvent.change(select, { target: { value: 'wallet-1' } });

    await waitFor(() => {
      expect(screen.getByText('Create Session')).toBeTruthy();
    });

    fireEvent.click(screen.getByText('Create Session'));

    await waitFor(() => {
      expect(vi.mocked(showToast)).toHaveBeenCalledWith('error', 'Error: CREATE_FAIL');
    });
  });

  it('shows error toast when handleRevoke fails', async () => {
    vi.mocked(apiGet)
      .mockResolvedValueOnce(mockWallets)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce(mockSessions);

    vi.mocked(apiDelete).mockRejectedValueOnce(new ApiError(500, 'REVOKE_FAIL', 'Failed'));

    render(<SessionsPage />);

    await waitFor(() => {
      expect(screen.getByText(/bot-alpha/)).toBeTruthy();
    });

    const select = screen.getByLabelText('Wallet') as HTMLSelectElement;
    fireEvent.change(select, { target: { value: 'wallet-1' } });

    await waitFor(() => {
      expect(screen.getByText('Revoke')).toBeTruthy();
    });

    fireEvent.click(screen.getByText('Revoke'));

    await waitFor(() => {
      expect(screen.getByText(/Are you sure you want to revoke/)).toBeTruthy();
    });

    const revokeButtons = screen.getAllByText('Revoke');
    fireEvent.click(revokeButtons[revokeButtons.length - 1]);

    await waitFor(() => {
      expect(vi.mocked(showToast)).toHaveBeenCalledWith('error', 'Error: REVOKE_FAIL');
    });
  });
});

describe('SessionsPage - Source filter', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('filters sessions by source when source filter is changed', async () => {
    setupSessionsMocks();

    render(<SessionsPage />);

    await waitFor(() => {
      expect(screen.getAllByText(/bot-alpha/).length).toBeGreaterThan(0);
    });

    // Select source filter to 'mcp'
    const sourceSelect = screen.getByLabelText('Source') as HTMLSelectElement;
    fireEvent.change(sourceSelect, { target: { value: 'mcp' } });

    // The MCP session should be rendered, API sessions should be filtered
    await waitFor(() => {
      const mcpBadges = screen.getAllByText('MCP');
      expect(mcpBadges.length).toBeGreaterThanOrEqual(1);
    });
  });

  it('shows all sources when filter is cleared', async () => {
    setupSessionsMocks();

    render(<SessionsPage />);

    await waitFor(() => {
      expect(screen.getByLabelText('Source')).toBeTruthy();
    });

    // Select API filter first
    const sourceSelect = screen.getByLabelText('Source') as HTMLSelectElement;
    fireEvent.change(sourceSelect, { target: { value: 'api' } });

    // Then clear
    fireEvent.change(sourceSelect, { target: { value: '' } });

    // All sessions should be visible
    await waitFor(() => {
      expect(screen.getAllByText('API').length).toBeGreaterThanOrEqual(1);
    });
  });
});

describe('SessionsPage - Bulk creation', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('opens bulk create modal and toggles wallet selection', async () => {
    setupSessionsMocks();

    render(<SessionsPage />);

    await waitFor(() => {
      expect(screen.getByText('Bulk Create')).toBeTruthy();
    });

    fireEvent.click(screen.getByText('Bulk Create'));

    await waitFor(() => {
      expect(screen.getByText('Select Wallets')).toBeTruthy();
    });

    // Should see both wallets as checkboxes (they also appear in dropdown and table)
    expect(screen.getAllByText('bot-alpha').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('bot-beta').length).toBeGreaterThanOrEqual(1);

    // Select All
    fireEvent.click(screen.getByText('Select All'));

    // Now it should say Deselect All
    await waitFor(() => {
      expect(screen.getByText('Deselect All')).toBeTruthy();
    });

    // Deselect All
    fireEvent.click(screen.getByText('Deselect All'));

    await waitFor(() => {
      expect(screen.getByText('Select All')).toBeTruthy();
    });
  });

  it('executes bulk create for API sessions', async () => {
    setupSessionsMocks();

    vi.mocked(apiPost).mockResolvedValueOnce({
      results: [
        { walletId: 'wallet-1', walletName: 'bot-alpha', sessionId: 'sess-new-1', token: 'tok-1' },
        { walletId: 'wallet-2', walletName: 'bot-beta', sessionId: 'sess-new-2', token: 'tok-2' },
      ],
      created: 2,
      failed: 0,
    });

    render(<SessionsPage />);

    await waitFor(() => {
      expect(screen.getByText('Bulk Create')).toBeTruthy();
    });

    fireEvent.click(screen.getByText('Bulk Create'));

    await waitFor(() => {
      expect(screen.getByText('Select All')).toBeTruthy();
    });

    fireEvent.click(screen.getByText('Select All'));

    // Click confirm
    const confirmBtn = screen.getByText(/Create 2/);
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(vi.mocked(apiPost)).toHaveBeenCalledWith('/v1/admin/sessions/bulk', {
        walletIds: expect.arrayContaining(['wallet-1', 'wallet-2']),
      });
    });

    // Results modal should appear
    await waitFor(() => {
      expect(screen.getByText('Bulk Creation Results')).toBeTruthy();
    });
  });

  it('executes bulk create for MCP tokens and shows claude config', async () => {
    setupSessionsMocks();

    vi.mocked(apiPost).mockResolvedValueOnce({
      results: [
        { walletId: 'wallet-1', walletName: 'bot-alpha', tokenPath: '/tmp/mcp/w1.json' },
      ],
      created: 1,
      failed: 0,
      claudeDesktopConfig: { waiaas: { command: 'npx' } },
    });

    const { container } = render(<SessionsPage />);

    await waitFor(() => {
      expect(screen.getByText('Bulk Create')).toBeTruthy();
    });

    fireEvent.click(screen.getByText('Bulk Create'));

    await waitFor(() => {
      expect(screen.getByText('API Session')).toBeTruthy();
    });

    // Switch to MCP type - find radio input by name and value
    const radioInputs = container.querySelectorAll('input[name="bulkType"]');
    const mcpRadio = radioInputs[1] as HTMLInputElement; // second radio is MCP
    fireEvent.click(mcpRadio);

    // Select all wallets
    fireEvent.click(screen.getByText('Select All'));

    // Confirm - look for button with MCP text
    await waitFor(() => {
      expect(screen.getByText(/MCP Tokens/)).toBeTruthy();
    });

    fireEvent.click(screen.getByText(/MCP Tokens/));

    await waitFor(() => {
      expect(vi.mocked(apiPost)).toHaveBeenCalledWith('/v1/admin/mcp/tokens/bulk', {
        walletIds: expect.arrayContaining(['wallet-1', 'wallet-2']),
      });
    });

    // Results modal should show with Claude Desktop Config
    await waitFor(() => {
      expect(screen.getByText('Claude Desktop Config')).toBeTruthy();
    });
  });

  it('handles bulk create error', async () => {
    setupSessionsMocks();

    vi.mocked(apiPost).mockRejectedValueOnce(new ApiError(500, 'BULK_FAIL', 'Failed'));

    render(<SessionsPage />);

    await waitFor(() => {
      expect(screen.getByText('Bulk Create')).toBeTruthy();
    });

    fireEvent.click(screen.getByText('Bulk Create'));

    await waitFor(() => {
      expect(screen.getByText('Select All')).toBeTruthy();
    });

    fireEvent.click(screen.getByText('Select All'));

    const confirmBtn = screen.getByText(/Create 2/);
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(vi.mocked(showToast)).toHaveBeenCalledWith('error', 'Error: BULK_FAIL');
    });
  });
});

describe('SessionsPage - Settings tab', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('renders settings tab with session configuration fields', async () => {
    setupSessionsMocks();

    render(<SessionsPage />);

    await waitFor(() => {
      expect(screen.getAllByText('Sessions').length).toBeGreaterThan(0);
    });

    // Switch to Settings tab
    fireEvent.click(screen.getByText('Settings'));

    await waitFor(() => {
      expect(screen.getByText('Session Configuration')).toBeTruthy();
    });

    expect(screen.getByText('Lifetime')).toBeTruthy();
    expect(screen.getByText('Rate Limits')).toBeTruthy();
  });

  it('saves session settings', async () => {
    setupSessionsMocks();

    const mockSessionSettings = {
      security: {
        session_ttl: '7200',
        session_absolute_lifetime: '86400',
        session_max_renewals: '10',
        max_sessions_per_wallet: '5',
        max_pending_tx: '10',
        rate_limit_session_rpm: '60',
        rate_limit_tx_rpm: '10',
      },
    };
    vi.mocked(apiPut).mockResolvedValueOnce({ updated: 1, settings: mockSessionSettings });

    render(<SessionsPage />);

    await waitFor(() => {
      expect(screen.getByText('Settings')).toBeTruthy();
    });

    fireEvent.click(screen.getByText('Settings'));

    await waitFor(() => {
      expect(screen.getByText('Session Configuration')).toBeTruthy();
    });

    // Change a field value
    const ttlInput = screen.getByLabelText('Session TTL (seconds)') as HTMLInputElement;
    fireEvent.input(ttlInput, { target: { value: '7200' } });

    // Save bar should appear
    await waitFor(() => {
      expect(screen.getByText('Save')).toBeTruthy();
    });

    fireEvent.click(screen.getByText('Save'));

    await waitFor(() => {
      expect(vi.mocked(apiPut)).toHaveBeenCalledWith('/v1/admin/settings', {
        settings: expect.arrayContaining([
          expect.objectContaining({ key: 'security.session_ttl', value: '7200' }),
        ]),
      });
    });
  });

  it('discards session settings changes', async () => {
    setupSessionsMocks();

    render(<SessionsPage />);

    await waitFor(() => {
      expect(screen.getByText('Settings')).toBeTruthy();
    });

    fireEvent.click(screen.getByText('Settings'));

    await waitFor(() => {
      expect(screen.getByText('Session Configuration')).toBeTruthy();
    });

    // Change a field value
    const ttlInput = screen.getByLabelText('Session TTL (seconds)') as HTMLInputElement;
    fireEvent.input(ttlInput, { target: { value: '7200' } });

    // Click Discard
    await waitFor(() => {
      expect(screen.getByText('Discard')).toBeTruthy();
    });

    fireEvent.click(screen.getByText('Discard'));

    // Save bar should disappear (discard clears dirty)
    await waitFor(() => {
      expect(screen.queryByText('Discard')).toBeNull();
    });
  });

  it('shows error toast when settings save fails', async () => {
    setupSessionsMocks();

    vi.mocked(apiPut).mockRejectedValueOnce(new ApiError(500, 'SAVE_FAIL', 'Failed'));

    render(<SessionsPage />);

    fireEvent.click(screen.getByText('Settings'));

    await waitFor(() => {
      expect(screen.getByText('Session Configuration')).toBeTruthy();
    });

    const ttlInput = screen.getByLabelText('Session TTL (seconds)') as HTMLInputElement;
    fireEvent.input(ttlInput, { target: { value: '7200' } });

    await waitFor(() => {
      expect(screen.getByText('Save')).toBeTruthy();
    });

    fireEvent.click(screen.getByText('Save'));

    await waitFor(() => {
      expect(vi.mocked(showToast)).toHaveBeenCalledWith('error', 'Error: SAVE_FAIL');
    });
  });

  it('shows error toast when settings fetch fails', async () => {
    vi.mocked(apiGet).mockImplementation((url: string) => {
      if (url === '/v1/wallets') return Promise.resolve(mockWallets2);
      if (url === '/v1/sessions') return Promise.resolve([]);
      if (url === '/v1/admin/settings') return Promise.reject(new ApiError(500, 'SETTINGS_FAIL', 'Failed'));
      return Promise.resolve({});
    });

    render(<SessionsPage />);

    fireEvent.click(screen.getByText('Settings'));

    await waitFor(() => {
      expect(vi.mocked(showToast)).toHaveBeenCalledWith('error', 'Error: SETTINGS_FAIL');
    });
  });
});

describe('SessionsPage - Tab navigation', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('switches between Sessions and Settings tabs', async () => {
    setupSessionsMocks();

    const { container } = render(<SessionsPage />);

    await waitFor(() => {
      // Sessions tab content visible
      expect(screen.getByLabelText('Wallet')).toBeTruthy();
    });

    // Switch to Settings
    fireEvent.click(screen.getByText('Settings'));

    await waitFor(() => {
      expect(screen.getByText('Session Configuration')).toBeTruthy();
    });

    // Switch back to Sessions via tab nav button (use breadcrumb-page button)
    const breadcrumbBtn = container.querySelector('.breadcrumb-page') as HTMLButtonElement;
    fireEvent.click(breadcrumbBtn);

    await waitFor(() => {
      expect(screen.getByLabelText('Wallet')).toBeTruthy();
    });
  });
});

describe('SessionsPage - Expired session rendering', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('does not show Revoke button for expired sessions', async () => {
    const expiredSessions = [
      {
        id: 'sess-expired',
        walletId: 'wallet-1',
        walletName: 'bot-alpha',
        status: 'EXPIRED',
        renewalCount: 10,
        maxRenewals: 10,
        expiresAt: 1707500000,
        absoluteExpiresAt: 1707600000,
        createdAt: 1707400000,
        lastRenewedAt: 1707450000,
        source: 'api' as const,
      },
    ];

    vi.mocked(apiGet).mockImplementation((url: string) => {
      if (url === '/v1/wallets') return Promise.resolve(mockWallets2);
      if (url.includes('/v1/sessions')) return Promise.resolve(expiredSessions);
      return Promise.resolve({});
    });

    render(<SessionsPage />);

    await waitFor(() => {
      expect(screen.getByText('EXPIRED')).toBeTruthy();
    });

    // Revoke should not exist for expired sessions
    expect(screen.queryByText('Revoke')).toBeNull();
  });
});
