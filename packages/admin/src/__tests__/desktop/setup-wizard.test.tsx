/**
 * Tests for desktop/wizard/setup-wizard.tsx -- wizard orchestrator component.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/preact';

// Mock all step components
vi.mock('../../desktop/wizard/steps/password-step', () => ({
  PasswordStep: () => <div data-testid="password-step">PasswordStep</div>,
}));
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

  it('should render PasswordStep on step 1', () => {
    render(<SetupWizard />);
    expect(screen.getByTestId('password-step')).toBeTruthy();
    expect(screen.getByText(/Step 1 of 5/)).toBeTruthy();
    expect(screen.getByText(/Set Password/)).toBeTruthy();
    expect(screen.getByText('WAIaaS Setup')).toBeTruthy();
  });

  it('should render ChainStep on step 2', () => {
    wizardStep.value = 2;
    render(<SetupWizard />);
    expect(screen.getByTestId('chain-step')).toBeTruthy();
    expect(screen.getByText(/Step 2 of 5/)).toBeTruthy();
    expect(screen.getByText(/Select Chain/)).toBeTruthy();
  });

  it('should render WalletStep on step 3', () => {
    wizardStep.value = 3;
    render(<SetupWizard />);
    expect(screen.getByTestId('wallet-step')).toBeTruthy();
    expect(screen.getByText(/Step 3 of 5/)).toBeTruthy();
    expect(screen.getByText(/Create Wallet/)).toBeTruthy();
  });

  it('should render OwnerStep on step 4', () => {
    wizardStep.value = 4;
    render(<SetupWizard />);
    expect(screen.getByTestId('owner-step')).toBeTruthy();
    expect(screen.getByText(/Step 4 of 5/)).toBeTruthy();
    expect(screen.getByText(/Connect Owner/)).toBeTruthy();
  });

  it('should render CompleteStep on step 5', () => {
    wizardStep.value = 5;
    render(<SetupWizard />);
    expect(screen.getByTestId('complete-step')).toBeTruthy();
    expect(screen.getByText(/Step 5 of 5/)).toBeTruthy();
    expect(screen.getByText(/Step 5 of 5: Complete/)).toBeTruthy();
  });

  it('should render PasswordStep for unknown step (default case)', () => {
    wizardStep.value = 0;
    render(<SetupWizard />);
    expect(screen.getByTestId('password-step')).toBeTruthy();
  });

  it('should render 5 progress dots', () => {
    const { container } = render(<SetupWizard />);
    // Progress dots are rendered inside the progressBar div
    // Each dot is a div with specific styles -- count them
    const header = container.querySelector('h1');
    expect(header?.textContent).toBe('WAIaaS Setup');

    // There should be exactly 5 dot elements in the progress bar
    // They're siblings after the step label paragraph
    const allDivs = container.querySelectorAll('div');
    // Find divs with borderRadius 50% (progress dots)
    const dots = Array.from(allDivs).filter(
      (d) => (d as HTMLElement).style.borderRadius === '50%',
    );
    expect(dots).toHaveLength(5);
  });
});
