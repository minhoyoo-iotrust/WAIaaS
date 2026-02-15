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

import { apiGet, apiPost } from '../api/client';
import PoliciesPage from '../pages/policies';

const mockWallets = {
  items: [
    {
      id: 'wallet-1',
      name: 'bot-alpha',
      chain: 'solana',
      network: 'devnet',
      environment: 'testnet',
      publicKey: 'abc',
      status: 'ACTIVE',
      createdAt: 1707609600,
    },
  ],
};

const mockPolicies = [
  {
    id: 'policy-1',
    walletId: null,
    type: 'SPENDING_LIMIT',
    network: null,
    rules: {
      instant_max: '1000000',
      notify_max: '5000000',
      delay_max: '10000000',
      delay_seconds: 300,
      approval_timeout: 3600,
    },
    priority: 0,
    enabled: true,
    createdAt: 1707609600,
    updatedAt: 1707609600,
  },
];

/** Helper: render PoliciesPage with standard mocks and open Create form */
async function renderAndOpenForm() {
  vi.mocked(apiGet)
    .mockResolvedValueOnce(mockWallets) // wallets
    .mockResolvedValueOnce(mockPolicies); // policies

  render(<PoliciesPage />);

  await waitFor(() => {
    expect(screen.getByText('Create Policy')).toBeTruthy();
  });

  fireEvent.click(screen.getByText('Create Policy'));

  await waitFor(() => {
    expect(screen.getByText('Create')).toBeTruthy();
  });
}

describe('PolicyFormRouter - type-specific forms', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('renders SPENDING_LIMIT form fields by default', async () => {
    await renderAndOpenForm();

    // SPENDING_LIMIT form should be visible with native amount fields
    expect(screen.getByLabelText(/Instant Max \(lamports\/wei\)/i)).toBeTruthy();
    expect(screen.getByLabelText(/Notify Max \(lamports\/wei\)/i)).toBeTruthy();
    expect(screen.getByLabelText(/Delay Max \(lamports\/wei\)/i)).toBeTruthy();
    expect(screen.getByLabelText(/Delay Duration/i)).toBeTruthy();

    // USD optional fields
    expect(screen.getByLabelText(/Instant Max USD/i)).toBeTruthy();
    expect(screen.getByLabelText(/Notify Max USD/i)).toBeTruthy();
    expect(screen.getByLabelText(/Delay Max USD/i)).toBeTruthy();
  });

  it('switches to WHITELIST form when type is changed', async () => {
    await renderAndOpenForm();

    // Initially SPENDING_LIMIT
    expect(screen.getByLabelText(/Instant Max \(lamports\/wei\)/i)).toBeTruthy();

    // Change type to WHITELIST
    const typeSelect = screen.getByLabelText('Type') as HTMLSelectElement;
    fireEvent.change(typeSelect, { target: { value: 'WHITELIST' } });

    // WHITELIST form: "Add Address" button should appear
    await waitFor(() => {
      expect(screen.getByText('+ Add Address')).toBeTruthy();
    });

    // SPENDING_LIMIT fields should be gone
    expect(screen.queryByLabelText(/Instant Max \(lamports\/wei\)/i)).toBeNull();
  });

  it('switches to RATE_LIMIT form and shows correct fields', async () => {
    await renderAndOpenForm();

    const typeSelect = screen.getByLabelText('Type') as HTMLSelectElement;
    fireEvent.change(typeSelect, { target: { value: 'RATE_LIMIT' } });

    await waitFor(() => {
      expect(screen.getByLabelText(/Max Requests/i)).toBeTruthy();
    });
    expect(screen.getByLabelText(/Window \(seconds\)/i)).toBeTruthy();
  });

  it('toggles between JSON mode and structured form', async () => {
    await renderAndOpenForm();

    // Initially in form mode - JSON toggle button visible
    expect(screen.getByText('JSON Direct Edit')).toBeTruthy();

    // Click to switch to JSON mode
    fireEvent.click(screen.getByText('JSON Direct Edit'));

    // Should now show textarea (JSON editor) and "Switch to Form" button
    await waitFor(() => {
      expect(screen.getByText('Switch to Form')).toBeTruthy();
    });

    // Switch back to form mode
    fireEvent.click(screen.getByText('Switch to Form'));

    await waitFor(() => {
      expect(screen.getByText('JSON Direct Edit')).toBeTruthy();
    });

    // Structured form fields should be back
    expect(screen.getByLabelText(/Instant Max \(lamports\/wei\)/i)).toBeTruthy();
  });

  it('DynamicRowList: adds and removes address rows in WHITELIST', async () => {
    await renderAndOpenForm();

    // Change to WHITELIST
    const typeSelect = screen.getByLabelText('Type') as HTMLSelectElement;
    fireEvent.change(typeSelect, { target: { value: 'WHITELIST' } });

    await waitFor(() => {
      expect(screen.getByText('+ Add Address')).toBeTruthy();
    });

    // Initially no address rows (empty array default)
    expect(screen.queryByText('Address 1')).toBeNull();

    // Add first address
    fireEvent.click(screen.getByText('+ Add Address'));
    await waitFor(() => {
      expect(screen.getByText('Address 1')).toBeTruthy();
    });

    // Add second address
    fireEvent.click(screen.getByText('+ Add Address'));
    await waitFor(() => {
      expect(screen.getByText('Address 2')).toBeTruthy();
    });

    // Remove first address (click the 'x' button)
    const removeButtons = screen.getAllByTitle('Remove');
    fireEvent.click(removeButtons[0]);

    await waitFor(() => {
      // Should be back to 1 row, re-labeled as Address 1
      expect(screen.getByText('Address 1')).toBeTruthy();
      expect(screen.queryByText('Address 2')).toBeNull();
    });
  });

  it('creates SPENDING_LIMIT policy with correct rules via API', async () => {
    vi.mocked(apiGet)
      .mockResolvedValueOnce(mockWallets) // wallets
      .mockResolvedValueOnce(mockPolicies) // initial policies
      .mockResolvedValueOnce(mockPolicies); // refresh after create

    vi.mocked(apiPost).mockResolvedValueOnce({ id: 'policy-new' });

    render(<PoliciesPage />);

    await waitFor(() => {
      expect(screen.getByText('Create Policy')).toBeTruthy();
    });

    fireEvent.click(screen.getByText('Create Policy'));

    await waitFor(() => {
      expect(screen.getByLabelText(/Instant Max \(lamports\/wei\)/i)).toBeTruthy();
    });

    // Fill in the fields (defaults already have values from DEFAULT_RULES)
    const instantInput = screen.getByLabelText(/Instant Max \(lamports\/wei\)/i) as HTMLInputElement;
    fireEvent.input(instantInput, { target: { value: '2000000' } });

    const notifyInput = screen.getByLabelText(/Notify Max \(lamports\/wei\)/i) as HTMLInputElement;
    fireEvent.input(notifyInput, { target: { value: '8000000' } });

    const delayInput = screen.getByLabelText(/Delay Max \(lamports\/wei\)/i) as HTMLInputElement;
    fireEvent.input(delayInput, { target: { value: '20000000' } });

    const delaySecondsInput = screen.getByLabelText(/Delay Duration/i) as HTMLInputElement;
    fireEvent.input(delaySecondsInput, { target: { value: '120' } });

    // Click Create
    fireEvent.click(screen.getByText('Create'));

    await waitFor(() => {
      expect(vi.mocked(apiPost)).toHaveBeenCalledWith(
        '/v1/policies',
        expect.objectContaining({
          type: 'SPENDING_LIMIT',
          rules: expect.objectContaining({
            instant_max: '2000000',
            notify_max: '8000000',
            delay_max: '20000000',
            delay_seconds: 120,
          }),
        }),
      );
    });
  });

  it('validates SPENDING_LIMIT: shows error for empty instant_max', async () => {
    await renderAndOpenForm();

    // Clear instant_max (default has a value)
    const instantInput = screen.getByLabelText(/Instant Max \(lamports\/wei\)/i) as HTMLInputElement;
    fireEvent.input(instantInput, { target: { value: '' } });

    // Click Create
    fireEvent.click(screen.getByText('Create'));

    // Validation error should appear
    await waitFor(() => {
      expect(screen.getByText('Positive integer required')).toBeTruthy();
    });

    // apiPost should NOT have been called
    expect(vi.mocked(apiPost)).not.toHaveBeenCalled();
  });

  it('validates WHITELIST: shows error for empty address list', async () => {
    await renderAndOpenForm();

    // Change to WHITELIST
    const typeSelect = screen.getByLabelText('Type') as HTMLSelectElement;
    fireEvent.change(typeSelect, { target: { value: 'WHITELIST' } });

    await waitFor(() => {
      expect(screen.getByText('+ Add Address')).toBeTruthy();
    });

    // Don't add any addresses, just click Create
    fireEvent.click(screen.getByText('Create'));

    await waitFor(() => {
      expect(screen.getByText('At least one address required')).toBeTruthy();
    });

    expect(vi.mocked(apiPost)).not.toHaveBeenCalled();
  });

  it('validates RATE_LIMIT: shows error for invalid max_requests', async () => {
    await renderAndOpenForm();

    // Change to RATE_LIMIT
    const typeSelect = screen.getByLabelText('Type') as HTMLSelectElement;
    fireEvent.change(typeSelect, { target: { value: 'RATE_LIMIT' } });

    await waitFor(() => {
      expect(screen.getByLabelText(/Max Requests/i)).toBeTruthy();
    });

    // Set max_requests to 0 (invalid - must be >= 1)
    const maxReqInput = screen.getByLabelText(/Max Requests/i) as HTMLInputElement;
    fireEvent.input(maxReqInput, { target: { value: '0' } });

    // Click Create
    fireEvent.click(screen.getByText('Create'));

    await waitFor(() => {
      expect(screen.getByText('Positive integer required')).toBeTruthy();
    });

    expect(vi.mocked(apiPost)).not.toHaveBeenCalled();
  });

  it('creates APPROVE_TIER_OVERRIDE with correct tier value', async () => {
    vi.mocked(apiGet)
      .mockResolvedValueOnce(mockWallets)
      .mockResolvedValueOnce(mockPolicies)
      .mockResolvedValueOnce(mockPolicies); // refresh after create

    vi.mocked(apiPost).mockResolvedValueOnce({ id: 'policy-tier' });

    render(<PoliciesPage />);

    await waitFor(() => {
      expect(screen.getByText('Create Policy')).toBeTruthy();
    });

    fireEvent.click(screen.getByText('Create Policy'));

    // Change to APPROVE_TIER_OVERRIDE
    await waitFor(() => {
      expect(screen.getByLabelText('Type')).toBeTruthy();
    });

    const typeSelect = screen.getByLabelText('Type') as HTMLSelectElement;
    fireEvent.change(typeSelect, { target: { value: 'APPROVE_TIER_OVERRIDE' } });

    await waitFor(() => {
      expect(screen.getByLabelText(/Override Tier/i)).toBeTruthy();
    });

    // Select DELAY (should be the default already, but explicitly set it)
    const tierSelect = screen.getByLabelText(/Override Tier/i) as HTMLSelectElement;
    fireEvent.change(tierSelect, { target: { value: 'DELAY' } });

    // Click Create
    fireEvent.click(screen.getByText('Create'));

    await waitFor(() => {
      expect(vi.mocked(apiPost)).toHaveBeenCalledWith(
        '/v1/policies',
        expect.objectContaining({
          type: 'APPROVE_TIER_OVERRIDE',
          rules: expect.objectContaining({
            tier: 'DELAY',
          }),
        }),
      );
    });
  });
});
