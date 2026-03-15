/**
 * rpc-proxy.test.tsx
 *
 * Tests for the RPC Proxy admin page (rpc-proxy.tsx):
 * - Rendering loading state and all sections after load
 * - Toggle proxy enabled/disabled
 * - Settings form dirty tracking, save, and cancel
 * - Audit log table rendering with empty state
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent, cleanup } from '@testing-library/preact';

const mockApiGet = vi.fn();
const mockApiPut = vi.fn();

vi.mock('../api/typed-client', () => ({
  api: {
    GET: (...args: unknown[]) => mockApiGet(...args),
    POST: vi.fn(),
    PUT: (...args: unknown[]) => mockApiPut(...args),
    DELETE: vi.fn(),
  },
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
import RpcProxyPage from '../pages/rpc-proxy';

const mockShowToast = showToast as ReturnType<typeof vi.fn>;

// Settings response uses grouped structure: { category: { shortKey: value } }
const defaultSettings = {
  rpc_proxy: {
    enabled: 'true',
    delay_timeout_seconds: '300',
    approval_timeout_seconds: '600',
    max_gas_limit: '30000000',
    max_bytecode_size: '49152',
    deploy_default_tier: 'APPROVAL',
    allowed_methods: '[]',
  },
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('RpcProxyPage', () => {
  it('shows loading state initially', () => {
    mockApiGet.mockReturnValue(new Promise(() => {})); // never resolves
    render(<RpcProxyPage />);
    expect(screen.getByText('Loading...')).toBeTruthy();
  });

  it('renders all sections after loading', async () => {
    mockApiGet.mockImplementation((path: string) => {
      if (path.includes('audit')) return Promise.resolve({ data: { data: [], nextCursor: null, hasMore: false } });
      return Promise.resolve({ data: defaultSettings });
    });

    render(<RpcProxyPage />);
    await waitFor(() => {
      expect(screen.getByText('Proxy Status')).toBeTruthy();
    });

    expect(screen.getByText('Configuration')).toBeTruthy();
    expect(screen.getByText('Usage')).toBeTruthy();
    expect(screen.getByText('Recent Activity')).toBeTruthy();
  });

  it('shows ENABLED badge when rpc_proxy.enabled is true', async () => {
    mockApiGet.mockImplementation((path: string) => {
      if (path.includes('audit')) return Promise.resolve({ data: { data: [], nextCursor: null, hasMore: false } });
      return Promise.resolve({ data: defaultSettings });
    });

    render(<RpcProxyPage />);
    await waitFor(() => {
      expect(screen.getByText('ENABLED')).toBeTruthy();
    });
    expect(screen.getByText('Disable Proxy')).toBeTruthy();
  });

  it('shows DISABLED badge when rpc_proxy.enabled is false', async () => {
    const disabledSettings = {
      ...defaultSettings,
      rpc_proxy: { ...defaultSettings.rpc_proxy, enabled: 'false' },
    };
    mockApiGet.mockImplementation((path: string) => {
      if (path.includes('audit')) return Promise.resolve({ data: { data: [], nextCursor: null, hasMore: false } });
      return Promise.resolve({ data: disabledSettings });
    });

    render(<RpcProxyPage />);
    await waitFor(() => {
      expect(screen.getByText('DISABLED')).toBeTruthy();
    });
    expect(screen.getByText('Enable Proxy')).toBeTruthy();
  });

  it('toggles proxy enabled and calls apiPut', async () => {
    mockApiGet.mockImplementation((path: string) => {
      if (path.includes('audit')) return Promise.resolve({ data: { data: [], nextCursor: null, hasMore: false } });
      return Promise.resolve({ data: defaultSettings });
    });
    mockApiPut.mockResolvedValue({ data: {} });

    render(<RpcProxyPage />);
    await waitFor(() => {
      expect(screen.getByText('Disable Proxy')).toBeTruthy();
    });

    fireEvent.click(screen.getByText('Disable Proxy'));

    await waitFor(() => {
      expect(mockApiPut).toHaveBeenCalledWith(
        '/v1/admin/settings',
        expect.objectContaining({ body: { settings: [{ key: 'rpc_proxy.enabled', value: 'false' }] } }),
      );
    });
    expect(mockShowToast).toHaveBeenCalledWith('success', expect.stringContaining('disabled'));
  });

  it('shows save/cancel buttons when fields are dirty', async () => {
    mockApiGet.mockImplementation((path: string) => {
      if (path.includes('audit')) return Promise.resolve({ data: { data: [], nextCursor: null, hasMore: false } });
      return Promise.resolve({ data: defaultSettings });
    });

    render(<RpcProxyPage />);
    await waitFor(() => {
      expect(screen.getByText('Configuration')).toBeTruthy();
    });

    // Change a field value to make it dirty
    const inputs = document.querySelectorAll('input[type="number"]');
    const delayInput = inputs[0] as HTMLInputElement;
    fireEvent.input(delayInput, { target: { value: '500' } });

    await waitFor(() => {
      expect(screen.getByText('Save Changes')).toBeTruthy();
      expect(screen.getByText('Cancel')).toBeTruthy();
    });
  });

  it('saves dirty fields via apiPut', async () => {
    mockApiGet.mockImplementation((path: string) => {
      if (path.includes('audit')) return Promise.resolve({ data: { data: [], nextCursor: null, hasMore: false } });
      return Promise.resolve({ data: defaultSettings });
    });
    mockApiPut.mockResolvedValue({ data: {} });

    render(<RpcProxyPage />);
    await waitFor(() => {
      expect(screen.getByText('Configuration')).toBeTruthy();
    });

    // Make a field dirty
    const inputs = document.querySelectorAll('input[type="number"]');
    fireEvent.input(inputs[0]!, { target: { value: '500' } });

    await waitFor(() => {
      expect(screen.getByText('Save Changes')).toBeTruthy();
    });

    fireEvent.click(screen.getByText('Save Changes'));

    await waitFor(() => {
      expect(mockApiPut).toHaveBeenCalled();
      expect(mockShowToast).toHaveBeenCalledWith('success', 'RPC proxy settings saved');
    });
  });

  it('cancels dirty changes', async () => {
    mockApiGet.mockImplementation((path: string) => {
      if (path.includes('audit')) return Promise.resolve({ data: { data: [], nextCursor: null, hasMore: false } });
      return Promise.resolve({ data: defaultSettings });
    });

    render(<RpcProxyPage />);
    await waitFor(() => {
      expect(screen.getByText('Configuration')).toBeTruthy();
    });

    const inputs = document.querySelectorAll('input[type="number"]');
    fireEvent.input(inputs[0]!, { target: { value: '500' } });

    await waitFor(() => {
      expect(screen.getByText('Cancel')).toBeTruthy();
    });

    fireEvent.click(screen.getByText('Cancel'));

    await waitFor(() => {
      expect(screen.queryByText('Save Changes')).toBeNull();
    });
  });

  it('shows empty state for audit logs when no logs', async () => {
    mockApiGet.mockImplementation((path: string) => {
      if (path.includes('audit')) return Promise.resolve({ data: { data: [], nextCursor: null, hasMore: false } });
      return Promise.resolve({ data: defaultSettings });
    });

    render(<RpcProxyPage />);
    await waitFor(() => {
      expect(screen.getByText('No recent activity')).toBeTruthy();
    });
  });

  it('renders audit log table when logs exist', async () => {
    const logs = [
      {
        id: 1,
        eventType: 'ACTION_SIGNED',
        actor: 'system',
        sessionId: 'sess-1',
        walletId: 'wallet-abc12345-6789',
        txId: null,
        details: { method: 'eth_sendTransaction', status: 'ok' },
        severity: 'info',
        ipAddress: null,
        timestamp: 1710000000,
      },
      {
        id: 2,
        eventType: 'ACTION_SIGNED',
        actor: 'system',
        sessionId: null,
        walletId: null,
        txId: null,
        details: { method: 'eth_call', status: 'error' },
        severity: 'info',
        ipAddress: null,
        timestamp: 1710000060,
      },
    ];
    mockApiGet.mockImplementation((path: string) => {
      if (path.includes('audit')) return Promise.resolve({ data: { data: logs, nextCursor: null, hasMore: false } });
      return Promise.resolve({ data: defaultSettings });
    });

    render(<RpcProxyPage />);
    await waitFor(() => {
      expect(screen.getByText('eth_sendTransaction')).toBeTruthy();
    });
    expect(screen.getByText('eth_call')).toBeTruthy();
    expect(screen.getByText('wallet-a...')).toBeTruthy();
  });

  it('shows error toast on toggle failure', async () => {
    mockApiGet.mockImplementation((path: string) => {
      if (path.includes('audit')) return Promise.resolve({ data: { data: [], nextCursor: null, hasMore: false } });
      return Promise.resolve({ data: defaultSettings });
    });
    const { ApiError } = await import('../api/typed-client');
    mockApiPut.mockRejectedValue(new ApiError(500, 'INTERNAL', 'fail'));

    render(<RpcProxyPage />);
    await waitFor(() => {
      expect(screen.getByText('Disable Proxy')).toBeTruthy();
    });

    fireEvent.click(screen.getByText('Disable Proxy'));

    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith('error', expect.any(String));
    });
  });

  it('shows error toast on settings fetch failure', async () => {
    const { ApiError } = await import('../api/typed-client');
    mockApiGet.mockImplementation((path: string) => {
      if (path.includes('audit')) return Promise.resolve({ data: { data: [], nextCursor: null, hasMore: false } });
      return Promise.reject(new ApiError(500, 'INTERNAL', 'fail'));
    });

    render(<RpcProxyPage />);
    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith('error', expect.any(String));
    });
  });

  it('renders usage section with URL pattern and examples', async () => {
    mockApiGet.mockImplementation((path: string) => {
      if (path.includes('audit')) return Promise.resolve({ data: { data: [], nextCursor: null, hasMore: false } });
      return Promise.resolve({ data: defaultSettings });
    });

    render(<RpcProxyPage />);
    await waitFor(() => {
      expect(screen.getByText('Usage')).toBeTruthy();
    });
    expect(screen.getByText(/Forge/)).toBeTruthy();
    expect(screen.getByText(/Hardhat/)).toBeTruthy();
    expect(screen.getByText(/viem/)).toBeTruthy();
  });
});
