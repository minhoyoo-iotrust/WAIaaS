/**
 * security.test.tsx
 *
 * Tests for the Security page (security.tsx):
 * - Rendering & tab navigation (Kill Switch, AutoStop Rules, Invalidate Sessions)
 * - Kill Switch 3-state (ACTIVE / SUSPENDED / LOCKED) actions
 * - AutoStop Rules settings form (dirty tracking, save, discard)
 * - JWT Rotation modal (open, confirm, cancel, error)
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent, cleanup } from '@testing-library/preact';

vi.mock('../api/client', () => ({
  apiGet: vi.fn(),
  apiPost: vi.fn(),
  apiPut: vi.fn(),
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
  highlightField: { value: null },
}));

vi.mock('../utils/dirty-guard', () => ({
  registerDirty: vi.fn(),
  unregisterDirty: vi.fn(),
  hasDirty: { value: false },
}));

vi.mock('../components/unsaved-dialog', () => ({
  showUnsavedDialog: vi.fn(),
  pendingAction: { value: null },
  UnsavedDialog: () => null,
}));

import { apiGet, apiPost, apiPut } from '../api/client';
import { showToast } from '../components/toast';
import { registerDirty, unregisterDirty } from '../utils/dirty-guard';
import SecurityPage from '../pages/security';

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

const mockKsActive = { state: 'ACTIVE', activatedAt: null, activatedBy: null };
const mockKsSuspended = { state: 'SUSPENDED', activatedAt: 1707609600, activatedBy: 'admin' };
const mockKsLocked = { state: 'LOCKED', activatedAt: 1707609600, activatedBy: 'admin' };

const mockSettingsResponse = {
  autostop: {
    enabled: 'true',
    consecutive_failures_threshold: '5',
    unusual_activity_threshold: '20',
    unusual_activity_window_sec: '300',
    idle_timeout_sec: '3600',
    idle_check_interval_sec: '60',
  },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mockApiCalls(ksState = mockKsActive, settingsData = mockSettingsResponse) {
  vi.mocked(apiGet).mockImplementation(async (path: string) => {
    if (path === '/v1/admin/kill-switch') return ksState;
    if (path === '/v1/admin/settings') return settingsData;
    return {};
  });
}

// ---------------------------------------------------------------------------
// Rendering & Tab Navigation
// ---------------------------------------------------------------------------

describe('Security page: rendering & tab navigation', () => {
  afterEach(() => { cleanup(); vi.clearAllMocks(); });

  it('renders with Kill Switch tab active by default', async () => {
    mockApiCalls();
    render(<SecurityPage />);

    // "Kill Switch" appears in breadcrumb, tab, and heading -- use getAllByText
    await waitFor(() => {
      expect(screen.getAllByText('Kill Switch').length).toBeGreaterThanOrEqual(1);
    });

    // ACTIVE badge visible
    await waitFor(() => {
      expect(screen.getByText('ACTIVE')).toBeTruthy();
    });
  });

  it('switches to AutoStop Rules tab', async () => {
    mockApiCalls();
    render(<SecurityPage />);

    await waitFor(() => {
      expect(screen.getByText('ACTIVE')).toBeTruthy();
    });

    // Click the AutoStop Rules tab button
    const tabButtons = screen.getAllByText('AutoStop Rules');
    fireEvent.click(tabButtons[0]!);

    await waitFor(() => {
      // The AutoStop Rules heading should be visible in the content area
      const headings = screen.getAllByText('AutoStop Rules');
      // Should have at least 2: tab label + heading (+ breadcrumb)
      expect(headings.length).toBeGreaterThanOrEqual(2);
    });
  });

  it('switches to Invalidate Sessions tab', async () => {
    mockApiCalls();
    render(<SecurityPage />);

    await waitFor(() => {
      expect(screen.getByText('ACTIVE')).toBeTruthy();
    });

    // "Invalidate Sessions" appears in tab; after click, heading shows "Invalidate All Session Tokens"
    const tabButtons = screen.getAllByText('Invalidate Sessions');
    fireEvent.click(tabButtons[0]!);

    await waitFor(() => {
      expect(screen.getByText('Invalidate All Session Tokens')).toBeTruthy();
    });
  });

  it('Breadcrumb shows current tab name', async () => {
    mockApiCalls();
    render(<SecurityPage />);

    await waitFor(() => {
      expect(screen.getByText('ACTIVE')).toBeTruthy();
    });

    // Default tab: Kill Switch -- breadcrumb shows "Security" page and "Kill Switch" tab
    expect(screen.getByText('Security')).toBeTruthy();

    // Switch tab and verify breadcrumb updates
    fireEvent.click(screen.getByText('Invalidate Sessions'));

    await waitFor(() => {
      expect(screen.getByText('Invalidate All Session Tokens')).toBeTruthy();
    });
  });
});

// ---------------------------------------------------------------------------
// Kill Switch Tab
// ---------------------------------------------------------------------------

describe('Security page: Kill Switch tab', () => {
  afterEach(() => { cleanup(); vi.clearAllMocks(); });

  it('ACTIVE state: shows ACTIVE badge and Activate button', async () => {
    mockApiCalls(mockKsActive);
    render(<SecurityPage />);

    await waitFor(() => {
      expect(screen.getByText('ACTIVE')).toBeTruthy();
    });
    expect(screen.getByText('Activate Kill Switch')).toBeTruthy();
  });

  it('ACTIVE state: activate calls apiPost and shows success toast', async () => {
    mockApiCalls(mockKsActive);
    render(<SecurityPage />);

    await waitFor(() => {
      expect(screen.getByText('Activate Kill Switch')).toBeTruthy();
    });

    vi.mocked(apiPost).mockResolvedValueOnce(undefined);

    fireEvent.click(screen.getByText('Activate Kill Switch'));

    await waitFor(() => {
      expect(vi.mocked(apiPost)).toHaveBeenCalledWith('/v1/admin/kill-switch');
    });

    await waitFor(() => {
      expect(vi.mocked(showToast)).toHaveBeenCalledWith('success', 'Kill switch activated - all operations suspended');
    });
  });

  it('SUSPENDED state: shows Recover and Escalate buttons', async () => {
    mockApiCalls(mockKsSuspended);
    render(<SecurityPage />);

    await waitFor(() => {
      expect(screen.getByText('SUSPENDED')).toBeTruthy();
    });
    expect(screen.getByText('Recover')).toBeTruthy();
    expect(screen.getByText('Escalate to LOCKED')).toBeTruthy();

    // Info box about suspended state
    expect(screen.getByText(/All wallet operations are suspended/)).toBeTruthy();
  });

  it('SUSPENDED state: recover calls apiPost to /v1/admin/recover', async () => {
    mockApiCalls(mockKsSuspended);
    render(<SecurityPage />);

    await waitFor(() => {
      expect(screen.getByText('Recover')).toBeTruthy();
    });

    vi.mocked(apiPost).mockResolvedValueOnce(undefined);

    fireEvent.click(screen.getByText('Recover'));

    await waitFor(() => {
      expect(vi.mocked(apiPost)).toHaveBeenCalledWith('/v1/admin/recover');
    });

    await waitFor(() => {
      expect(vi.mocked(showToast)).toHaveBeenCalledWith('success', 'Kill switch recovered - operations resumed');
    });
  });

  it('SUSPENDED state: escalate calls apiPost to /v1/admin/kill-switch/escalate', async () => {
    mockApiCalls(mockKsSuspended);
    render(<SecurityPage />);

    await waitFor(() => {
      expect(screen.getByText('Escalate to LOCKED')).toBeTruthy();
    });

    vi.mocked(apiPost).mockResolvedValueOnce(undefined);

    fireEvent.click(screen.getByText('Escalate to LOCKED'));

    await waitFor(() => {
      expect(vi.mocked(apiPost)).toHaveBeenCalledWith('/v1/admin/kill-switch/escalate');
    });

    await waitFor(() => {
      expect(vi.mocked(showToast)).toHaveBeenCalledWith('success', 'Kill switch escalated to LOCKED');
    });
  });

  it('LOCKED state: shows Recover from LOCKED button and warning box', async () => {
    mockApiCalls(mockKsLocked);
    render(<SecurityPage />);

    await waitFor(() => {
      expect(screen.getByText('LOCKED')).toBeTruthy();
    });
    expect(screen.getByText('Recover from LOCKED (5s wait)')).toBeTruthy();

    // Warning box about permanently locked
    expect(screen.getByText(/permanently locked/)).toBeTruthy();
  });

  it('LOCKED state: recover calls apiPost to /v1/admin/recover', async () => {
    mockApiCalls(mockKsLocked);
    render(<SecurityPage />);

    await waitFor(() => {
      expect(screen.getByText('Recover from LOCKED (5s wait)')).toBeTruthy();
    });

    vi.mocked(apiPost).mockResolvedValueOnce(undefined);

    fireEvent.click(screen.getByText('Recover from LOCKED (5s wait)'));

    await waitFor(() => {
      expect(vi.mocked(apiPost)).toHaveBeenCalledWith('/v1/admin/recover');
    });
  });

  it('shows loading state initially', async () => {
    // Mock apiGet to never resolve (pending promise)
    vi.mocked(apiGet).mockImplementation(() => new Promise(() => {}));
    render(<SecurityPage />);

    expect(screen.getByText('Loading...')).toBeTruthy();
  });

  it('handles fetch error with toast', async () => {
    const MockApiError = (await import('../api/client')).ApiError;
    vi.mocked(apiGet).mockImplementation(async (path: string) => {
      if (path === '/v1/admin/kill-switch') throw new MockApiError(500, 'KS_FETCH_FAIL', 'Fail');
      return {};
    });

    render(<SecurityPage />);

    await waitFor(() => {
      expect(vi.mocked(showToast)).toHaveBeenCalledWith('error', 'Error: KS_FETCH_FAIL');
    });
  });

  it('handles activate error with toast', async () => {
    mockApiCalls(mockKsActive);
    render(<SecurityPage />);

    await waitFor(() => {
      expect(screen.getByText('Activate Kill Switch')).toBeTruthy();
    });

    const MockApiError = (await import('../api/client')).ApiError;
    vi.mocked(apiPost).mockRejectedValueOnce(new MockApiError(500, 'ACTIVATE_ERROR', 'Failed'));

    fireEvent.click(screen.getByText('Activate Kill Switch'));

    await waitFor(() => {
      expect(vi.mocked(showToast)).toHaveBeenCalledWith('error', 'Error: ACTIVATE_ERROR');
    });
  });
});

// ---------------------------------------------------------------------------
// AutoStop Rules Tab
// ---------------------------------------------------------------------------

describe('Security page: AutoStop Rules tab', () => {
  afterEach(() => { cleanup(); vi.clearAllMocks(); });

  it('renders AutoStop fields with current values', async () => {
    mockApiCalls();
    render(<SecurityPage />);

    await waitFor(() => {
      expect(screen.getByText('ACTIVE')).toBeTruthy();
    });

    // Switch to AutoStop tab
    fireEvent.click(screen.getAllByText('AutoStop Rules')[0]!);

    await waitFor(() => {
      const input = document.querySelector('input[name="autostop.consecutive_failures_threshold"]') as HTMLInputElement;
      expect(input).toBeTruthy();
      expect(input.value).toBe('5');
    });

    const idleInput = document.querySelector('input[name="autostop.idle_timeout_sec"]') as HTMLInputElement;
    expect(idleInput).toBeTruthy();
    expect(idleInput.value).toBe('3600');
  });

  it('changing a field shows save bar with dirty count', async () => {
    mockApiCalls();
    render(<SecurityPage />);

    await waitFor(() => {
      expect(screen.getByText('ACTIVE')).toBeTruthy();
    });

    fireEvent.click(screen.getAllByText('AutoStop Rules')[0]!);

    await waitFor(() => {
      expect(document.querySelector('input[name="autostop.consecutive_failures_threshold"]')).toBeTruthy();
    });

    const input = document.querySelector('input[name="autostop.consecutive_failures_threshold"]') as HTMLInputElement;
    fireEvent.input(input, { target: { value: '10' } });

    await waitFor(() => {
      expect(screen.getByText(/unsaved change/)).toBeTruthy();
    });
    expect(screen.getByText('Save')).toBeTruthy();
    expect(screen.getByText('Discard')).toBeTruthy();
  });

  it('save calls apiPut with changed autostop entries', async () => {
    mockApiCalls();
    render(<SecurityPage />);

    await waitFor(() => {
      expect(screen.getByText('ACTIVE')).toBeTruthy();
    });

    fireEvent.click(screen.getAllByText('AutoStop Rules')[0]!);

    await waitFor(() => {
      expect(document.querySelector('input[name="autostop.consecutive_failures_threshold"]')).toBeTruthy();
    });

    const input = document.querySelector('input[name="autostop.consecutive_failures_threshold"]') as HTMLInputElement;
    fireEvent.input(input, { target: { value: '10' } });

    await waitFor(() => {
      expect(screen.getByText(/unsaved change/)).toBeTruthy();
    });

    vi.mocked(apiPut).mockResolvedValueOnce(undefined);

    fireEvent.click(screen.getByText('Save'));

    await waitFor(() => {
      expect(vi.mocked(apiPut)).toHaveBeenCalledWith('/v1/admin/settings', {
        settings: [{ key: 'autostop.consecutive_failures_threshold', value: '10' }],
      });
    });

    await waitFor(() => {
      expect(vi.mocked(showToast)).toHaveBeenCalledWith('success', 'AutoStop settings saved and applied');
    });
  });

  it('discard clears dirty state', async () => {
    mockApiCalls();
    render(<SecurityPage />);

    await waitFor(() => {
      expect(screen.getByText('ACTIVE')).toBeTruthy();
    });

    fireEvent.click(screen.getAllByText('AutoStop Rules')[0]!);

    await waitFor(() => {
      expect(document.querySelector('input[name="autostop.consecutive_failures_threshold"]')).toBeTruthy();
    });

    const input = document.querySelector('input[name="autostop.consecutive_failures_threshold"]') as HTMLInputElement;
    fireEvent.input(input, { target: { value: '10' } });

    await waitFor(() => {
      expect(screen.getByText(/unsaved change/)).toBeTruthy();
    });

    fireEvent.click(screen.getByText('Discard'));

    await waitFor(() => {
      expect(screen.queryByText(/unsaved change/)).toBeNull();
    });
  });

  it('save error shows error toast', async () => {
    mockApiCalls();
    render(<SecurityPage />);

    await waitFor(() => {
      expect(screen.getByText('ACTIVE')).toBeTruthy();
    });

    fireEvent.click(screen.getAllByText('AutoStop Rules')[0]!);

    await waitFor(() => {
      expect(document.querySelector('input[name="autostop.consecutive_failures_threshold"]')).toBeTruthy();
    });

    const input = document.querySelector('input[name="autostop.consecutive_failures_threshold"]') as HTMLInputElement;
    fireEvent.input(input, { target: { value: '10' } });

    await waitFor(() => {
      expect(screen.getByText(/unsaved change/)).toBeTruthy();
    });

    const MockApiError = (await import('../api/client')).ApiError;
    vi.mocked(apiPut).mockRejectedValueOnce(new MockApiError(400, 'SAVE_ERROR', 'Bad'));

    fireEvent.click(screen.getByText('Save'));

    await waitFor(() => {
      expect(vi.mocked(showToast)).toHaveBeenCalledWith('error', 'Error: SAVE_ERROR');
    });
  });

  it('registers and unregisters dirty guard', async () => {
    mockApiCalls();
    const { unmount } = render(<SecurityPage />);

    await waitFor(() => {
      expect(screen.getByText('ACTIVE')).toBeTruthy();
    });

    // Switch to AutoStop tab to trigger dirty guard registration
    fireEvent.click(screen.getAllByText('AutoStop Rules')[0]!);

    await waitFor(() => {
      expect(document.querySelector('input[name="autostop.consecutive_failures_threshold"]')).toBeTruthy();
    });

    expect(vi.mocked(registerDirty)).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'security-autostop' }),
    );

    unmount();

    expect(vi.mocked(unregisterDirty)).toHaveBeenCalledWith('security-autostop');
  });

  it('shows loading state before settings load', async () => {
    // Kill switch resolves immediately, settings never resolves
    vi.mocked(apiGet).mockImplementation(async (path: string) => {
      if (path === '/v1/admin/kill-switch') return mockKsActive;
      if (path === '/v1/admin/settings') return new Promise(() => {});
      return {};
    });

    render(<SecurityPage />);

    await waitFor(() => {
      expect(screen.getByText('ACTIVE')).toBeTruthy();
    });

    fireEvent.click(screen.getAllByText('AutoStop Rules')[0]!);

    await waitFor(() => {
      expect(screen.getByText('Loading settings...')).toBeTruthy();
    });
  });

  it('enabled checkbox toggles autostop.enabled', async () => {
    mockApiCalls();
    render(<SecurityPage />);

    await waitFor(() => {
      expect(screen.getByText('ACTIVE')).toBeTruthy();
    });

    fireEvent.click(screen.getAllByText('AutoStop Rules')[0]!);

    await waitFor(() => {
      expect(document.querySelector('input[name="autostop.enabled"]')).toBeTruthy();
    });

    const checkbox = document.querySelector('input[name="autostop.enabled"]') as HTMLInputElement;
    expect(checkbox.checked).toBe(true);

    // Toggle the checkbox off -- FormField uses onChange with (e.target as HTMLInputElement).checked
    fireEvent.change(checkbox, { target: { checked: false } });

    await waitFor(() => {
      expect(screen.getByText(/unsaved change/)).toBeTruthy();
    });
  });
});

// ---------------------------------------------------------------------------
// Invalidate Sessions (JWT Rotation) Tab
// ---------------------------------------------------------------------------

describe('Security page: Invalidate Sessions (JWT Rotation) tab', () => {
  afterEach(() => { cleanup(); vi.clearAllMocks(); });

  it('renders Invalidate button', async () => {
    mockApiCalls();
    render(<SecurityPage />);

    await waitFor(() => {
      expect(screen.getByText('ACTIVE')).toBeTruthy();
    });

    fireEvent.click(screen.getByText('Invalidate Sessions'));

    await waitFor(() => {
      expect(screen.getByText('Invalidate All Tokens')).toBeTruthy();
    });
  });

  it('clicking Invalidate All Tokens opens modal', async () => {
    mockApiCalls();
    render(<SecurityPage />);

    await waitFor(() => {
      expect(screen.getByText('ACTIVE')).toBeTruthy();
    });

    fireEvent.click(screen.getByText('Invalidate Sessions'));

    await waitFor(() => {
      expect(screen.getByText('Invalidate All Tokens')).toBeTruthy();
    });

    fireEvent.click(screen.getByText('Invalidate All Tokens'));

    await waitFor(() => {
      expect(screen.getByText(/rotate the signing key/)).toBeTruthy();
    });
  });

  it('confirming modal calls apiPost to rotate-secret', async () => {
    mockApiCalls();
    render(<SecurityPage />);

    await waitFor(() => {
      expect(screen.getByText('ACTIVE')).toBeTruthy();
    });

    fireEvent.click(screen.getByText('Invalidate Sessions'));

    await waitFor(() => {
      expect(screen.getByText('Invalidate All Tokens')).toBeTruthy();
    });

    fireEvent.click(screen.getByText('Invalidate All Tokens'));

    await waitFor(() => {
      expect(screen.getByText(/rotate the signing key/)).toBeTruthy();
    });

    vi.mocked(apiPost).mockResolvedValueOnce({ rotatedAt: 1707609600, message: 'ok' });

    // Click the "Invalidate" confirm button in the modal
    fireEvent.click(screen.getByText('Invalidate'));

    await waitFor(() => {
      expect(vi.mocked(apiPost)).toHaveBeenCalledWith('/v1/admin/rotate-secret');
    });

    await waitFor(() => {
      expect(vi.mocked(showToast)).toHaveBeenCalledWith(
        'success',
        'All session tokens invalidated. Old tokens remain valid for 5 minutes.',
      );
    });
  });

  it('canceling modal closes it', async () => {
    mockApiCalls();
    render(<SecurityPage />);

    await waitFor(() => {
      expect(screen.getByText('ACTIVE')).toBeTruthy();
    });

    fireEvent.click(screen.getByText('Invalidate Sessions'));

    await waitFor(() => {
      expect(screen.getByText('Invalidate All Tokens')).toBeTruthy();
    });

    fireEvent.click(screen.getByText('Invalidate All Tokens'));

    await waitFor(() => {
      expect(screen.getByText(/rotate the signing key/)).toBeTruthy();
    });

    // Click Cancel
    fireEvent.click(screen.getByText('Cancel'));

    await waitFor(() => {
      expect(screen.queryByText(/rotate the signing key/)).toBeNull();
    });
  });

  it('rotate error shows error toast', async () => {
    mockApiCalls();
    render(<SecurityPage />);

    await waitFor(() => {
      expect(screen.getByText('ACTIVE')).toBeTruthy();
    });

    fireEvent.click(screen.getByText('Invalidate Sessions'));

    await waitFor(() => {
      expect(screen.getByText('Invalidate All Tokens')).toBeTruthy();
    });

    fireEvent.click(screen.getByText('Invalidate All Tokens'));

    await waitFor(() => {
      expect(screen.getByText('Invalidate')).toBeTruthy();
    });

    const MockApiError = (await import('../api/client')).ApiError;
    vi.mocked(apiPost).mockRejectedValueOnce(new MockApiError(500, 'ROTATE_ERROR', 'Failed'));

    fireEvent.click(screen.getByText('Invalidate'));

    await waitFor(() => {
      expect(vi.mocked(showToast)).toHaveBeenCalledWith('error', 'Error: ROTATE_ERROR');
    });
  });
});
