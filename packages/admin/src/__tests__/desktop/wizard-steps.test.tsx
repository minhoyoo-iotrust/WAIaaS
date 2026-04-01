/**
 * Tests for desktop/wizard/steps/* -- all 5 wizard step components.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/preact';

// Mock fetch globally (already in setup.ts)
const mockFetch = globalThis.fetch as ReturnType<typeof vi.fn>;

// Mock wizard-store
const mockNextStep = vi.fn();
const mockPrevStep = vi.fn();
const mockCompleteWizard = vi.fn();
const mockSkipOwnerStep = vi.fn();

vi.mock('../../desktop/wizard/wizard-store', async () => {
  const { signal } = await import('@preact/signals');
  return {
    wizardData: signal({
      password: 'test-password',
      chain: 'ethereum',
      walletName: 'My Wallet',
      walletId: 'wallet-123',
      skipOwner: false,
    }),
    wizardStep: signal(1),
    nextStep: () => mockNextStep(),
    prevStep: () => mockPrevStep(),
    completeWizard: () => mockCompleteWizard(),
    skipOwnerStep: () => mockSkipOwnerStep(),
  };
});

// Mock the API endpoints
vi.mock('../../api/endpoints', () => ({
  API: {
    ADMIN_MASTER_PASSWORD: '/v1/admin/master-password',
    WALLET_WC_PAIR: (id: string) => `/v1/wallets/${id}/wc/pair`,
    WALLET_WC_PAIR_STATUS: (id: string) => `/v1/wallets/${id}/wc/pair/status`,
  },
}));

// Mock wc-connector and wc-qr-modal for OwnerStep dynamic imports
vi.mock('../../desktop/walletconnect/wc-connector', () => ({
  connectViaWalletConnect: vi.fn().mockResolvedValue({ success: true }),
  cancelPairing: vi.fn(),
}));

vi.mock('../../desktop/walletconnect/wc-qr-modal', () => ({
  WcQrModal: ({ open, onClose, onConnected }: any) =>
    open ? <div data-testid="wc-modal">WcModal</div> : null,
}));

import { wizardData } from '../../desktop/wizard/wizard-store';
import { PasswordStep } from '../../desktop/wizard/steps/password-step';
import { ChainStep } from '../../desktop/wizard/steps/chain-step';
import { WalletStep } from '../../desktop/wizard/steps/wallet-step';
import { OwnerStep } from '../../desktop/wizard/steps/owner-step';
import { CompleteStep } from '../../desktop/wizard/steps/complete-step';

describe('PasswordStep', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    mockNextStep.mockReset();
  });

  it('should render password form', () => {
    render(<PasswordStep />);
    expect(screen.getByText('Master Password')).toBeTruthy();
    expect(screen.getByText('Confirm Password')).toBeTruthy();
    expect(screen.getByText(/Set Password & Continue/)).toBeTruthy();
    expect(screen.getByText(/Choose a master password/)).toBeTruthy();
  });

  it('should show error for short password', async () => {
    render(<PasswordStep />);
    const pwInput = screen.getByPlaceholderText('Enter password (min 8 chars)');
    const confirmInput = screen.getByPlaceholderText('Re-enter password');
    fireEvent.input(pwInput, { target: { value: 'short' } });
    fireEvent.input(confirmInput, { target: { value: 'short' } });
    fireEvent.submit(screen.getByText(/Set Password & Continue/).closest('form')!);

    await waitFor(() => {
      expect(screen.getByText('Password must be at least 8 characters')).toBeTruthy();
    });
  });

  it('should show error for mismatched passwords', async () => {
    render(<PasswordStep />);
    const pwInput = screen.getByPlaceholderText('Enter password (min 8 chars)');
    const confirmInput = screen.getByPlaceholderText('Re-enter password');
    fireEvent.input(pwInput, { target: { value: 'password123' } });
    fireEvent.input(confirmInput, { target: { value: 'different123' } });
    fireEvent.submit(screen.getByText(/Set Password & Continue/).closest('form')!);

    await waitFor(() => {
      expect(screen.getByText('Passwords do not match')).toBeTruthy();
    });
  });

  it('should call API and advance on success', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({}),
    });

    render(<PasswordStep />);
    const pwInput = screen.getByPlaceholderText('Enter password (min 8 chars)');
    const confirmInput = screen.getByPlaceholderText('Re-enter password');
    fireEvent.input(pwInput, { target: { value: 'validpass123' } });
    fireEvent.input(confirmInput, { target: { value: 'validpass123' } });

    await act(async () => {
      fireEvent.submit(screen.getByText(/Set Password & Continue/).closest('form')!);
    });

    await waitFor(() => {
      expect(mockNextStep).toHaveBeenCalled();
    });
  });

  it('should show error on API failure', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      json: () => Promise.resolve({ message: 'Password too weak' }),
    });

    render(<PasswordStep />);
    const pwInput = screen.getByPlaceholderText('Enter password (min 8 chars)');
    const confirmInput = screen.getByPlaceholderText('Re-enter password');
    fireEvent.input(pwInput, { target: { value: 'validpass123' } });
    fireEvent.input(confirmInput, { target: { value: 'validpass123' } });

    await act(async () => {
      fireEvent.submit(screen.getByText(/Set Password & Continue/).closest('form')!);
    });

    await waitFor(() => {
      expect(screen.getByText('Password too weak')).toBeTruthy();
    });
  });

  it('should show default error when API returns non-JSON', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      json: () => Promise.reject(new Error('not json')),
    });

    render(<PasswordStep />);
    const pwInput = screen.getByPlaceholderText('Enter password (min 8 chars)');
    const confirmInput = screen.getByPlaceholderText('Re-enter password');
    fireEvent.input(pwInput, { target: { value: 'validpass123' } });
    fireEvent.input(confirmInput, { target: { value: 'validpass123' } });

    await act(async () => {
      fireEvent.submit(screen.getByText(/Set Password & Continue/).closest('form')!);
    });

    await waitFor(() => {
      expect(screen.getByText('Failed to set password')).toBeTruthy();
    });
  });

  it('should show network error', async () => {
    mockFetch.mockRejectedValue(new Error('Network error'));

    render(<PasswordStep />);
    const pwInput = screen.getByPlaceholderText('Enter password (min 8 chars)');
    const confirmInput = screen.getByPlaceholderText('Re-enter password');
    fireEvent.input(pwInput, { target: { value: 'validpass123' } });
    fireEvent.input(confirmInput, { target: { value: 'validpass123' } });

    await act(async () => {
      fireEvent.submit(screen.getByText(/Set Password & Continue/).closest('form')!);
    });

    await waitFor(() => {
      expect(screen.getByText('Cannot connect to daemon')).toBeTruthy();
    });
  });
});

describe('ChainStep', () => {
  beforeEach(() => {
    mockNextStep.mockReset();
    mockPrevStep.mockReset();
  });

  it('should render chain selection grid', () => {
    render(<ChainStep />);
    expect(screen.getByText('Ethereum')).toBeTruthy();
    expect(screen.getByText('Solana')).toBeTruthy();
    expect(screen.getByText('Base')).toBeTruthy();
    expect(screen.getByText('Polygon')).toBeTruthy();
    expect(screen.getByText('Arbitrum')).toBeTruthy();
    expect(screen.getByText(/Select the blockchain network/)).toBeTruthy();
  });

  it('should have Back and Continue buttons', () => {
    render(<ChainStep />);
    expect(screen.getByText('Back')).toBeTruthy();
    expect(screen.getByText('Continue')).toBeTruthy();
  });

  it('should call prevStep when Back is clicked', () => {
    render(<ChainStep />);
    fireEvent.click(screen.getByText('Back'));
    expect(mockPrevStep).toHaveBeenCalled();
  });

  it('should call nextStep when Continue is clicked', () => {
    render(<ChainStep />);
    fireEvent.click(screen.getByText('Continue'));
    expect(mockNextStep).toHaveBeenCalled();
  });

  it('should render chain descriptions', () => {
    render(<ChainStep />);
    expect(screen.getByText('EVM mainnet')).toBeTruthy();
    expect(screen.getByText('High throughput')).toBeTruthy();
    expect(screen.getByText('Coinbase L2')).toBeTruthy();
  });

  it('should allow selecting a chain by clicking', () => {
    render(<ChainStep />);
    fireEvent.click(screen.getByText('Solana'));
    fireEvent.click(screen.getByText('Continue'));
    expect(mockNextStep).toHaveBeenCalled();
  });
});

describe('WalletStep', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    mockNextStep.mockReset();
    mockPrevStep.mockReset();
  });

  it('should render wallet creation form', () => {
    render(<WalletStep />);
    expect(screen.getByText('Wallet Name')).toBeTruthy();
    expect(screen.getByText('Create Wallet')).toBeTruthy();
    expect(screen.getByText(/Create your first wallet/)).toBeTruthy();
    // The chain badge text contains "Chain:" and the chain name as separate text nodes
    expect(screen.getByText(/Chain:/)).toBeTruthy();
  });

  it('should call prevStep when Back is clicked', () => {
    render(<WalletStep />);
    fireEvent.click(screen.getByText('Back'));
    expect(mockPrevStep).toHaveBeenCalled();
  });

  it('should show error for empty wallet name', async () => {
    render(<WalletStep />);
    const input = screen.getByPlaceholderText('My Wallet');
    fireEvent.input(input, { target: { value: '   ' } });

    await act(async () => {
      fireEvent.submit(screen.getByText('Create Wallet').closest('form')!);
    });

    await waitFor(() => {
      expect(screen.getByText('Wallet name is required')).toBeTruthy();
    });
  });

  it('should call API and advance on success', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ id: 'new-wallet-id' }),
    });

    render(<WalletStep />);
    // Ensure the input has a non-empty value
    const input = screen.getByPlaceholderText('My Wallet');
    fireEvent.input(input, { target: { value: 'Test Wallet' } });

    await act(async () => {
      fireEvent.submit(screen.getByText('Create Wallet').closest('form')!);
    });

    await waitFor(() => {
      expect(mockNextStep).toHaveBeenCalled();
    });
    expect(mockFetch).toHaveBeenCalledWith(
      '/v1/wallets',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('should show API error on failure', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      json: () => Promise.resolve({ message: 'Chain not supported' }),
    });

    render(<WalletStep />);
    const input = screen.getByPlaceholderText('My Wallet');
    fireEvent.input(input, { target: { value: 'Test Wallet' } });

    await act(async () => {
      fireEvent.submit(screen.getByText('Create Wallet').closest('form')!);
    });

    await waitFor(() => {
      expect(screen.getByText('Chain not supported')).toBeTruthy();
    });
  });

  it('should show default error when API returns non-JSON', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      json: () => Promise.reject(new Error('not json')),
    });

    render(<WalletStep />);
    const input = screen.getByPlaceholderText('My Wallet');
    fireEvent.input(input, { target: { value: 'Test Wallet' } });

    await act(async () => {
      fireEvent.submit(screen.getByText('Create Wallet').closest('form')!);
    });

    await waitFor(() => {
      expect(screen.getByText('Failed to create wallet')).toBeTruthy();
    });
  });

  it('should show network error', async () => {
    mockFetch.mockRejectedValue(new Error('Network'));

    render(<WalletStep />);
    const input = screen.getByPlaceholderText('My Wallet');
    fireEvent.input(input, { target: { value: 'Test Wallet' } });

    await act(async () => {
      fireEvent.submit(screen.getByText('Create Wallet').closest('form')!);
    });

    await waitFor(() => {
      expect(screen.getByText('Cannot connect to daemon')).toBeTruthy();
    });
  });
});

describe('OwnerStep', () => {
  beforeEach(() => {
    mockNextStep.mockReset();
    mockPrevStep.mockReset();
    mockSkipOwnerStep.mockReset();
    wizardData.value = { ...wizardData.value, walletId: 'wallet-123' };
  });

  it('should render owner connection form', () => {
    render(<OwnerStep />);
    expect(screen.getByText(/Connect an external wallet/)).toBeTruthy();
    expect(screen.getByText('Connect via WalletConnect')).toBeTruthy();
    expect(screen.getByText('Skip for now')).toBeTruthy();
    expect(screen.getByText('Back')).toBeTruthy();
  });

  it('should show warning when no wallet is created', () => {
    wizardData.value = { ...wizardData.value, walletId: null };
    render(<OwnerStep />);
    expect(screen.getByText(/Wallet not created/)).toBeTruthy();
    const connectBtn = screen.getByText('Connect via WalletConnect');
    expect((connectBtn as HTMLButtonElement).disabled).toBe(true);
  });

  it('should call skipOwnerStep when Skip is clicked', () => {
    render(<OwnerStep />);
    fireEvent.click(screen.getByText('Skip for now'));
    expect(mockSkipOwnerStep).toHaveBeenCalled();
  });

  it('should call prevStep when Back is clicked', () => {
    render(<OwnerStep />);
    fireEvent.click(screen.getByText('Back'));
    expect(mockPrevStep).toHaveBeenCalled();
  });
});

describe('CompleteStep', () => {
  beforeEach(() => {
    mockCompleteWizard.mockReset();
    wizardData.value = {
      password: 'test-pass',
      chain: 'ethereum',
      walletName: 'My Wallet',
      walletId: 'wallet-123',
      skipOwner: false,
    };
  });

  it('should render completion summary', () => {
    render(<CompleteStep />);
    expect(screen.getByText('Setup Complete!')).toBeTruthy();
    expect(screen.getByText(/Your WAIaaS desktop app is ready/)).toBeTruthy();
    expect(screen.getByText('ethereum')).toBeTruthy();
    expect(screen.getByText('My Wallet')).toBeTruthy();
    expect(screen.getByText('Connected')).toBeTruthy();
    expect(screen.getByText('Go to Dashboard')).toBeTruthy();
  });

  it('should show "Skipped" when owner was skipped', () => {
    wizardData.value = { ...wizardData.value, skipOwner: true };
    render(<CompleteStep />);
    expect(screen.getByText('Skipped (can set later)')).toBeTruthy();
  });

  it('should call completeWizard when Go to Dashboard is clicked', () => {
    render(<CompleteStep />);
    fireEvent.click(screen.getByText('Go to Dashboard'));
    expect(mockCompleteWizard).toHaveBeenCalled();
  });

  it('should show correct chain name', () => {
    wizardData.value = { ...wizardData.value, chain: 'solana' };
    render(<CompleteStep />);
    expect(screen.getByText('solana')).toBeTruthy();
  });
});
