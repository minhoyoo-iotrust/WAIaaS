import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
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
  {
    id: 'policy-2',
    walletId: 'wallet-1',
    type: 'WHITELIST',
    network: null,
    rules: { allowed_addresses: ['addr1'] },
    priority: 1,
    enabled: true,
    createdAt: 1707609600,
    updatedAt: 1707609600,
  },
];

describe('PoliciesPage', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('should render policy list with tier visualization for SPENDING_LIMIT', async () => {
    mockApiGet
      .mockResolvedValueOnce({ data: mockWallets }) // wallets load
      .mockResolvedValueOnce({ data: { data: mockPolicies, total: mockPolicies.length, limit: 50, offset: 0 } }); // policies load (triggered by filterWalletId effect)

    render(<PoliciesPage />);

    // Wait for policies to load
    await waitFor(() => {
      expect(screen.getByText('Spending Limit')).toBeTruthy();
    });

    // Verify SPENDING_LIMIT tier labels
    expect(screen.getByText('Instant')).toBeTruthy();
    expect(screen.getByText('Notify')).toBeTruthy();
    expect(screen.getByText('Delay')).toBeTruthy();
    expect(screen.getByText('Approval')).toBeTruthy();

    // Verify Whitelist type appears
    expect(screen.getByText('Whitelist')).toBeTruthy();

    // Verify Global for null walletId policy
    expect(screen.getByText('Global')).toBeTruthy();

    // Verify wallet name for the wallet-specific policy
    expect(screen.getByText('bot-alpha')).toBeTruthy();
  });

  it('should create policy via form', async () => {
    mockApiGet
      .mockResolvedValueOnce({ data: mockWallets }) // wallets load
      .mockResolvedValueOnce({ data: { data: mockPolicies, total: mockPolicies.length, limit: 50, offset: 0 } }) // initial policies load
      .mockResolvedValueOnce({ data: { data: mockPolicies, total: mockPolicies.length, limit: 50, offset: 0 } }); // refresh after create

    mockApiPost.mockResolvedValueOnce({ data: { id: 'policy-3' } });

    render(<PoliciesPage />);

    // Wait for policies to load
    await waitFor(() => {
      expect(screen.getByText('Spending Limit')).toBeTruthy();
    });

    // Click Create Policy button
    fireEvent.click(screen.getByText('Create Policy'));

    // The form should appear with Type dropdown defaulting to SPENDING_LIMIT
    // Verify the Create button exists in the form
    await waitFor(() => {
      expect(screen.getByText('Create')).toBeTruthy();
    });

    // Click Create to submit with defaults
    fireEvent.click(screen.getByText('Create'));

    await waitFor(() => {
      expect(mockApiPost).toHaveBeenCalledWith('/v1/policies', expect.objectContaining({
        body: expect.objectContaining({ type: 'SPENDING_LIMIT' }),
      }));
    });
  });

  it('should delete policy with confirmation modal', async () => {
    mockApiGet
      .mockResolvedValueOnce({ data: mockWallets }) // wallets load
      .mockResolvedValueOnce({ data: { data: mockPolicies, total: mockPolicies.length, limit: 50, offset: 0 } }) // policies load
      .mockResolvedValueOnce({ data: { data: [], total: 0, limit: 50, offset: 0 } }); // refresh after delete

    mockApiDelete.mockResolvedValueOnce(undefined);

    render(<PoliciesPage />);

    // Wait for policy table to load
    await waitFor(() => {
      expect(screen.getByText('Spending Limit')).toBeTruthy();
    });

    // Click Delete button on one of the policy rows
    const deleteButtons = screen.getAllByText('Delete');
    // Click the first Delete button (policy table action)
    fireEvent.click(deleteButtons[0]);

    // Wait for confirmation modal
    await waitFor(() => {
      expect(
        screen.getByText(/Are you sure you want to delete this/i),
      ).toBeTruthy();
    });

    // Find the Delete button in the modal footer (not the table ones)
    // After the modal opens, there should be more Delete buttons
    const allDeleteButtons = screen.getAllByText('Delete');
    // The last one is the modal confirm button
    fireEvent.click(allDeleteButtons[allDeleteButtons.length - 1]);

    await waitFor(() => {
      expect(mockApiDelete).toHaveBeenCalledWith(
        '/v1/policies/{id}',
        expect.objectContaining({ params: { path: { id: expect.stringMatching(/^policy-/) } } }),
      );
    });
  });

  it('shows ALLOWED_NETWORKS in policy type options', async () => {
    mockApiGet
      .mockResolvedValueOnce({ data: mockWallets })
      .mockResolvedValueOnce({ data: { data: mockPolicies, total: mockPolicies.length, limit: 50, offset: 0 } });

    render(<PoliciesPage />);

    await waitFor(() => {
      expect(screen.getByText('Spending Limit')).toBeTruthy();
    });

    // Open create form
    fireEvent.click(screen.getByText('Create Policy'));

    await waitFor(() => {
      expect(screen.getByText('Create')).toBeTruthy();
    });

    // Check that the Type select contains ALLOWED_NETWORKS option
    const typeSelect = screen.getByLabelText('Type') as HTMLSelectElement;
    const options = Array.from(typeSelect.querySelectorAll('option'));
    const values = options.map((o) => o.value);
    expect(values).toContain('ALLOWED_NETWORKS');
  });

  it('shows Network column in policy table', async () => {
    mockApiGet
      .mockResolvedValueOnce({ data: mockWallets })
      .mockResolvedValueOnce({ data: { data: mockPolicies, total: mockPolicies.length, limit: 50, offset: 0 } });

    render(<PoliciesPage />);

    await waitFor(() => {
      expect(screen.getByText('Spending Limit')).toBeTruthy();
    });

    // Check Network column header exists
    expect(screen.getByText('Network')).toBeTruthy();
    // Check "All" is displayed for null network
    const allCells = screen.getAllByText('All');
    expect(allCells.length).toBeGreaterThan(0);
  });
});
