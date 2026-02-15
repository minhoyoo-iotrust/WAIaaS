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

import { apiGet, apiPost, apiPut } from '../api/client';
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

/** Extended mock policies for visualization tests */
const mockPoliciesWithVis = [
  ...mockPolicies,
  {
    id: 'policy-tokens',
    walletId: null,
    type: 'ALLOWED_TOKENS',
    network: null,
    rules: {
      tokens: [
        { address: '0xLINKaddr1234567890', symbol: 'LINK' },
        { address: '0xUSDCaddr1234567890', symbol: 'USDC' },
      ],
    },
    priority: 0,
    enabled: true,
    createdAt: 1707609600,
    updatedAt: 1707609600,
  },
  {
    id: 'policy-rate',
    walletId: null,
    type: 'RATE_LIMIT',
    network: null,
    rules: { max_requests: 100, window_seconds: 3600 },
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

describe('7-type form rendering', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('ALLOWED_TOKENS: renders form with + Add Token button and adds rows', async () => {
    await renderAndOpenForm();

    const typeSelect = screen.getByLabelText('Type') as HTMLSelectElement;
    fireEvent.change(typeSelect, { target: { value: 'ALLOWED_TOKENS' } });

    await waitFor(() => {
      expect(screen.getByText('+ Add Token')).toBeTruthy();
    });

    // Click to add a token row
    fireEvent.click(screen.getByText('+ Add Token'));

    // After add, a token row with address/symbol placeholders should appear
    await waitFor(() => {
      expect(screen.getByPlaceholderText('Token mint/contract address')).toBeTruthy();
      expect(screen.getByPlaceholderText('e.g. USDC')).toBeTruthy();
    });
  });

  it('CONTRACT_WHITELIST: renders form with + Add Contract button', async () => {
    await renderAndOpenForm();

    const typeSelect = screen.getByLabelText('Type') as HTMLSelectElement;
    fireEvent.change(typeSelect, { target: { value: 'CONTRACT_WHITELIST' } });

    await waitFor(() => {
      expect(screen.getByText('+ Add Contract')).toBeTruthy();
    });
  });

  it('METHOD_WHITELIST: renders 2-level nested form with + Add Method Entry', async () => {
    await renderAndOpenForm();

    const typeSelect = screen.getByLabelText('Type') as HTMLSelectElement;
    fireEvent.change(typeSelect, { target: { value: 'METHOD_WHITELIST' } });

    await waitFor(() => {
      expect(screen.getByText('+ Add Method Entry')).toBeTruthy();
    });

    // Add a method entry
    fireEvent.click(screen.getByText('+ Add Method Entry'));

    // After add, contract address field and selector add button should appear
    await waitFor(() => {
      expect(screen.getByPlaceholderText('Contract address')).toBeTruthy();
      expect(screen.getByText('+ Add Selector')).toBeTruthy();
    });
  });

  it('TIME_RESTRICTION: renders day checkboxes and hour selects', async () => {
    await renderAndOpenForm();

    const typeSelect = screen.getByLabelText('Type') as HTMLSelectElement;
    fireEvent.change(typeSelect, { target: { value: 'TIME_RESTRICTION' } });

    await waitFor(() => {
      expect(screen.getByText('Sun')).toBeTruthy();
    });

    // All 7 day checkboxes
    expect(screen.getByText('Mon')).toBeTruthy();
    expect(screen.getByText('Tue')).toBeTruthy();
    expect(screen.getByText('Wed')).toBeTruthy();
    expect(screen.getByText('Thu')).toBeTruthy();
    expect(screen.getByText('Fri')).toBeTruthy();
    expect(screen.getByText('Sat')).toBeTruthy();

    // Start/End hour selects
    expect(screen.getByLabelText('Start Hour')).toBeTruthy();
    expect(screen.getByLabelText('End Hour')).toBeTruthy();
  });

  it('ALLOWED_NETWORKS: renders form with + Add Network button', async () => {
    await renderAndOpenForm();

    const typeSelect = screen.getByLabelText('Type') as HTMLSelectElement;
    fireEvent.change(typeSelect, { target: { value: 'ALLOWED_NETWORKS' } });

    await waitFor(() => {
      expect(screen.getByText('+ Add Network')).toBeTruthy();
    });
  });

  it('X402_ALLOWED_DOMAINS: renders form with + Add Domain button', async () => {
    await renderAndOpenForm();

    const typeSelect = screen.getByLabelText('Type') as HTMLSelectElement;
    fireEvent.change(typeSelect, { target: { value: 'X402_ALLOWED_DOMAINS' } });

    await waitFor(() => {
      expect(screen.getByText('+ Add Domain')).toBeTruthy();
    });
  });
});

describe('7-type validation', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('ALLOWED_TOKENS: shows error for empty token list', async () => {
    await renderAndOpenForm();

    const typeSelect = screen.getByLabelText('Type') as HTMLSelectElement;
    fireEvent.change(typeSelect, { target: { value: 'ALLOWED_TOKENS' } });

    await waitFor(() => {
      expect(screen.getByText('+ Add Token')).toBeTruthy();
    });

    // Don't add any tokens, click Create
    fireEvent.click(screen.getByText('Create'));

    await waitFor(() => {
      expect(screen.getByText('At least one token required')).toBeTruthy();
    });

    expect(vi.mocked(apiPost)).not.toHaveBeenCalled();
  });

  it('TIME_RESTRICTION: shows error when no days selected', async () => {
    await renderAndOpenForm();

    const typeSelect = screen.getByLabelText('Type') as HTMLSelectElement;
    fireEvent.change(typeSelect, { target: { value: 'TIME_RESTRICTION' } });

    await waitFor(() => {
      expect(screen.getByText('Sun')).toBeTruthy();
    });

    // Default has all 7 days checked. Uncheck all by clicking each checkbox.
    const checkboxes = screen.getAllByRole('checkbox').filter(
      (el) => (el as HTMLInputElement).type === 'checkbox' && (el as HTMLInputElement).checked
    );
    // The first checkbox is "Enabled" (from the form), rest are day checkboxes
    // Filter only day checkboxes by finding ones near day labels
    for (const cb of checkboxes) {
      const parent = cb.closest('label');
      if (parent && parent.textContent && ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].some(d => parent.textContent!.includes(d))) {
        fireEvent.click(cb);
      }
    }

    // Click Create
    fireEvent.click(screen.getByText('Create'));

    await waitFor(() => {
      expect(screen.getByText('At least one day required')).toBeTruthy();
    });

    expect(vi.mocked(apiPost)).not.toHaveBeenCalled();
  });
});

describe('PolicyRulesSummary visualization', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('ALLOWED_TOKENS: displays symbol badges in policy list', async () => {
    vi.mocked(apiGet)
      .mockResolvedValueOnce(mockWallets)
      .mockResolvedValueOnce(mockPoliciesWithVis);

    render(<PoliciesPage />);

    // Wait for policy list to render with token badges
    await waitFor(() => {
      expect(screen.getByText('LINK')).toBeTruthy();
    });
    expect(screen.getByText('USDC')).toBeTruthy();
  });

  it('RATE_LIMIT: displays "100 req / 1h" format in policy list', async () => {
    vi.mocked(apiGet)
      .mockResolvedValueOnce(mockWallets)
      .mockResolvedValueOnce(mockPoliciesWithVis);

    render(<PoliciesPage />);

    await waitFor(() => {
      expect(screen.getByText('100 req / 1h')).toBeTruthy();
    });
  });
});

describe('Edit modal - form prefill', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('prefills SPENDING_LIMIT form with existing values on edit (EDIT-01)', async () => {
    vi.mocked(apiGet)
      .mockResolvedValueOnce(mockWallets)
      .mockResolvedValueOnce(mockPolicies);

    render(<PoliciesPage />);

    // Wait for policy to appear in the list
    await waitFor(() => {
      expect(screen.getByText('Edit')).toBeTruthy();
    });

    // Click Edit button
    fireEvent.click(screen.getByText('Edit'));

    // Edit modal should open with form (not JSON mode by default)
    await waitFor(() => {
      expect(screen.getByText('Edit Policy')).toBeTruthy();
    });

    // The form should be prefilled with existing values
    await waitFor(() => {
      const instantInput = screen.getByLabelText(/Instant Max \(lamports\/wei\)/i) as HTMLInputElement;
      expect(instantInput.value).toBe('1000000');
    });

    const notifyInput = screen.getByLabelText(/Notify Max \(lamports\/wei\)/i) as HTMLInputElement;
    expect(notifyInput.value).toBe('5000000');

    const delayInput = screen.getByLabelText(/Delay Max \(lamports\/wei\)/i) as HTMLInputElement;
    expect(delayInput.value).toBe('10000000');
  });

  it('saves edited policy via PUT API (EDIT-02)', async () => {
    vi.mocked(apiGet)
      .mockResolvedValueOnce(mockWallets)
      .mockResolvedValueOnce(mockPolicies)
      .mockResolvedValueOnce(mockPolicies); // refresh after edit

    vi.mocked(apiPut).mockResolvedValueOnce({ ok: true });

    render(<PoliciesPage />);

    await waitFor(() => {
      expect(screen.getByText('Edit')).toBeTruthy();
    });

    // Click Edit
    fireEvent.click(screen.getByText('Edit'));

    await waitFor(() => {
      expect(screen.getByText('Edit Policy')).toBeTruthy();
    });

    // Wait for form to be rendered
    await waitFor(() => {
      expect(screen.getByLabelText(/Instant Max \(lamports\/wei\)/i)).toBeTruthy();
    });

    // Modify a value
    const instantInput = screen.getByLabelText(/Instant Max \(lamports\/wei\)/i) as HTMLInputElement;
    fireEvent.input(instantInput, { target: { value: '2000000' } });

    // Click Save
    fireEvent.click(screen.getByText('Save'));

    await waitFor(() => {
      expect(vi.mocked(apiPut)).toHaveBeenCalledWith(
        '/v1/policies/policy-1',
        expect.objectContaining({
          rules: expect.objectContaining({
            instant_max: '2000000',
          }),
        }),
      );
    });
  });
});
