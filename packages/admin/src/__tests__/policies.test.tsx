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

import { apiGet, apiPost, apiDelete } from '../api/client';
import PoliciesPage from '../pages/policies';

const mockAgents = {
  items: [
    {
      id: 'agent-1',
      name: 'bot-alpha',
      chain: 'solana',
      network: 'devnet',
      publicKey: 'abc',
      status: 'ACTIVE',
      createdAt: 1707609600,
    },
  ],
};

const mockPolicies = [
  {
    id: 'policy-1',
    agentId: null,
    type: 'SPENDING_LIMIT',
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
    agentId: 'agent-1',
    type: 'WHITELIST',
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
    vi.mocked(apiGet)
      .mockResolvedValueOnce(mockAgents) // agents load
      .mockResolvedValueOnce(mockPolicies); // policies load (triggered by filterAgentId effect)

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

    // Verify Global for null agentId policy
    expect(screen.getByText('Global')).toBeTruthy();

    // Verify agent name for the agent-specific policy
    expect(screen.getByText('bot-alpha')).toBeTruthy();
  });

  it('should create policy via form', async () => {
    vi.mocked(apiGet)
      .mockResolvedValueOnce(mockAgents) // agents load
      .mockResolvedValueOnce(mockPolicies) // initial policies load
      .mockResolvedValueOnce(mockPolicies); // refresh after create

    vi.mocked(apiPost).mockResolvedValueOnce({ id: 'policy-3' });

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
      expect(vi.mocked(apiPost)).toHaveBeenCalledWith('/v1/policies', expect.objectContaining({
        type: 'SPENDING_LIMIT',
      }));
    });
  });

  it('should delete policy with confirmation modal', async () => {
    vi.mocked(apiGet)
      .mockResolvedValueOnce(mockAgents) // agents load
      .mockResolvedValueOnce(mockPolicies) // policies load
      .mockResolvedValueOnce([]); // refresh after delete

    vi.mocked(apiDelete).mockResolvedValueOnce(undefined);

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
      expect(vi.mocked(apiDelete)).toHaveBeenCalledWith(
        expect.stringMatching(/^\/v1\/policies\/policy-/),
      );
    });
  });
});
