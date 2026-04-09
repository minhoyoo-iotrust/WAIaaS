/**
 * Tests for desktop/wizard/setup-wizard.tsx -- wizard orchestrator component.
 *
 * Issue 491: the "Set Password" step was removed. On first launch, sidecar.rs
 * generates a bootstrap recovery.key and the daemon initializes its hash from
 * it, so the user is already authenticated by the time the wizard loads.
 * The wizard now has 4 steps: Chain → Wallet → Owner → Complete.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/preact';

// Mock all step components
vi.mock('../../desktop/wizard/steps/chain-step', () => ({
  ChainStep: () => <div data-testid="chain-step">ChainStep</div>,
}));
vi.mock('../../desktop/wizard/steps/wallet-step', () => ({
  WalletStep: () => <div data-testid="wallet-step">WalletStep</div>,
}));
vi.mock('../../desktop/wizard/steps/owner-step', () => ({
  OwnerStep: () => <div data-testid="owner-step">OwnerStep</div>,
}));
vi.mock('../../desktop/wizard/steps/complete-step', () => ({
  CompleteStep: () => <div data-testid="complete-step">CompleteStep</div>,
}));

// Mock wizard-store signal
vi.mock('../../desktop/wizard/wizard-store', async () => {
  const { signal } = await import('@preact/signals');
  return {
    wizardStep: signal(1),
  };
});

import { wizardStep } from '../../desktop/wizard/wizard-store';
import { SetupWizard } from '../../desktop/wizard/setup-wizard';

describe('SetupWizard', () => {
  beforeEach(() => {
    wizardStep.value = 1;
  });

  it('should render ChainStep on step 1', () => {
    render(<SetupWizard />);
    expect(screen.getByTestId('chain-step')).toBeTruthy();
    expect(screen.getByText(/Step 1 of 4/)).toBeTruthy();
    expect(screen.getByText(/Select Chain/)).toBeTruthy();
    expect(screen.getByText('WAIaaS Setup')).toBeTruthy();
  });

  it('should render WalletStep on step 2', () => {
    wizardStep.value = 2;
    render(<SetupWizard />);
    expect(screen.getByTestId('wallet-step')).toBeTruthy();
    expect(screen.getByText(/Step 2 of 4/)).toBeTruthy();
    expect(screen.getByText(/Create Wallet/)).toBeTruthy();
  });

  it('should render OwnerStep on step 3', () => {
    wizardStep.value = 3;
    render(<SetupWizard />);
    expect(screen.getByTestId('owner-step')).toBeTruthy();
    expect(screen.getByText(/Step 3 of 4/)).toBeTruthy();
    expect(screen.getByText(/Connect Owner/)).toBeTruthy();
  });

  it('should render CompleteStep on step 4', () => {
    wizardStep.value = 4;
    render(<SetupWizard />);
    expect(screen.getByTestId('complete-step')).toBeTruthy();
    expect(screen.getByText(/Step 4 of 4/)).toBeTruthy();
    expect(screen.getByText(/Step 4 of 4: Complete/)).toBeTruthy();
  });

  it('should render ChainStep for unknown step (default case)', () => {
    wizardStep.value = 0;
    render(<SetupWizard />);
    expect(screen.getByTestId('chain-step')).toBeTruthy();
  });

  it('should render 4 progress dots', () => {
    const { container } = render(<SetupWizard />);
    const header = container.querySelector('h1');
    expect(header?.textContent).toBe('WAIaaS Setup');

    const allDivs = container.querySelectorAll('div');
    const dots = Array.from(allDivs).filter(
      (d) => (d as HTMLElement).style.borderRadius === '50%',
    );
    expect(dots).toHaveLength(4);
  });
});
