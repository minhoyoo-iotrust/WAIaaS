/**
 * Tests for desktop/wizard/steps/* wizard step components.
 *
 * Issue 491: the PasswordStep was removed. Desktop first-run auto-logs in via
 * the bootstrap recovery.key, so the wizard only covers Chain/Wallet/Complete
 * now. Master password changes happen from the dashboard Security page.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/preact';

// Mock fetch globally (already in setup.ts)
const mockFetch = globalThis.fetch as ReturnType<typeof vi.fn>;

// Mock wizard-store
const mockNextStep = vi.fn();
const mockPrevStep = vi.fn();
const mockCompleteWizard = vi.fn();

vi.mock('../../desktop/wizard/wizard-store', async () => {
  const { signal } = await import('@preact/signals');
  return {
    wizardData: signal({
      password: 'test-password',
      chains: ['ethereum', 'solana', 'ripple'],
      walletName: 'My Wallet',
      walletIds: ['wallet-123'],
    }),
    wizardStep: signal(1),
    nextStep: () => mockNextStep(),
    prevStep: () => mockPrevStep(),
    completeWizard: () => mockCompleteWizard(),
  };
});

// Mock auth store -- auto-login sets masterPassword via recovery.key
vi.mock('../../auth/store', async () => {
  const { signal } = await import('@preact/signals');
  return {
    masterPassword: signal('test-recovery-key'),
  };
});

// Mock the API endpoints
vi.mock('../../api/endpoints', () => ({
  API: {
    WALLET_WC_PAIR: (id: string) => `/v1/wallets/${id}/wc/pair`,
    WALLET_WC_PAIR_STATUS: (id: string) => `/v1/wallets/${id}/wc/pair/status`,
  },
}));

import { wizardData } from '../../desktop/wizard/wizard-store';
import { ChainStep } from '../../desktop/wizard/steps/chain-step';
import { WalletStep } from '../../desktop/wizard/steps/wallet-step';
import { CompleteStep } from '../../desktop/wizard/steps/complete-step';

describe('ChainStep', () => {
  beforeEach(() => {
    mockNextStep.mockReset();
  });

  it('should render 3 SSoT chain cards', () => {
    render(<ChainStep />);
    expect(screen.getByText('EVM')).toBeTruthy();
    expect(screen.getByText('Solana')).toBeTruthy();
    expect(screen.getByText('XRP Ledger')).toBeTruthy();
    expect(screen.getByText(/Select the blockchain networks/)).toBeTruthy();
  });

  it('should have Continue button with selection count', () => {
    render(<ChainStep />);
    // Default: all 3 selected
    expect(screen.getByText(/Continue \(3 selected\)/)).toBeTruthy();
  });

  it('should call nextStep when Continue is clicked', () => {
    render(<ChainStep />);
    fireEvent.click(screen.getByText(/Continue/));
    expect(mockNextStep).toHaveBeenCalled();
  });

  it('should render chain descriptions', () => {
    render(<ChainStep />);
    expect(screen.getByText(/Ethereum, Base, Polygon/)).toBeTruthy();
    expect(screen.getByText('High throughput')).toBeTruthy();
    expect(screen.getByText('Cross-border payments')).toBeTruthy();
  });

  it('should toggle chain selection by clicking', () => {
    render(<ChainStep />);
    // Deselect Solana (3 → 2)
    fireEvent.click(screen.getByText('Solana'));
    expect(screen.getByText(/Continue \(2 selected\)/)).toBeTruthy();
  });

  it('should disable Continue when no chains selected', () => {
    render(<ChainStep />);
    // Deselect all
    fireEvent.click(screen.getByText('EVM'));
    fireEvent.click(screen.getByText('Solana'));
    fireEvent.click(screen.getByText('XRP Ledger'));
    const btn = screen.getByText(/Continue \(0 selected\)/);
    expect((btn as HTMLButtonElement).disabled).toBe(true);
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
    expect(screen.getByText('Create Wallets')).toBeTruthy();
    expect(screen.getByText(/Create wallets on 3 chains/)).toBeTruthy();
    expect(screen.getByText(/Chains:/)).toBeTruthy();
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
      fireEvent.submit(screen.getByText('Create Wallets').closest('form')!);
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
      fireEvent.submit(screen.getByText('Create Wallets').closest('form')!);
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
      fireEvent.submit(screen.getByText('Create Wallets').closest('form')!);
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
      fireEvent.submit(screen.getByText('Create Wallets').closest('form')!);
    });

    await waitFor(() => {
      expect(screen.getByText(/Failed to create.*wallet/)).toBeTruthy();
    });
  });

  it('should show network error', async () => {
    mockFetch.mockRejectedValue(new Error('Network'));

    render(<WalletStep />);
    const input = screen.getByPlaceholderText('My Wallet');
    fireEvent.input(input, { target: { value: 'Test Wallet' } });

    await act(async () => {
      fireEvent.submit(screen.getByText('Create Wallets').closest('form')!);
    });

    await waitFor(() => {
      expect(screen.getByText('Cannot connect to daemon')).toBeTruthy();
    });
  });
});

describe('CompleteStep', () => {
  beforeEach(() => {
    mockCompleteWizard.mockReset();
    wizardData.value = {
      password: 'test-pass',
      chains: ['ethereum', 'solana', 'ripple'],
      walletName: 'My Wallet',
      walletIds: ['wallet-123'],
    };
  });

  it('should render completion summary', () => {
    render(<CompleteStep />);
    expect(screen.getByText('Setup Complete!')).toBeTruthy();
    expect(screen.getByText(/Your WAIaaS desktop app is ready/)).toBeTruthy();
    expect(screen.getByText('My Wallet')).toBeTruthy();
    expect(screen.getByText('Go to Dashboard')).toBeTruthy();
  });

  it('should call completeWizard when Go to Dashboard is clicked', () => {
    render(<CompleteStep />);
    fireEvent.click(screen.getByText('Go to Dashboard'));
    expect(mockCompleteWizard).toHaveBeenCalled();
  });
});
