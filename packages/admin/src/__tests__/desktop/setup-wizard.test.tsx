/**
 * Tests for desktop/wizard/setup-wizard.tsx -- wizard orchestrator component.
 *
 * Issue 495: Owner step removed. Wizard is now 3 steps: Chain → Wallet → Complete.
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
    expect(screen.getByText(/Step 1 of 3/)).toBeTruthy();
    expect(screen.getByText(/Select Chain/)).toBeTruthy();
  });

  it('should render WalletStep on step 2', () => {
    wizardStep.value = 2;
    render(<SetupWizard />);
    expect(screen.getByTestId('wallet-step')).toBeTruthy();
    expect(screen.getByText(/Step 2 of 3/)).toBeTruthy();
  });

  it('should render CompleteStep on step 3', () => {
    wizardStep.value = 3;
    render(<SetupWizard />);
    expect(screen.getByTestId('complete-step')).toBeTruthy();
    expect(screen.getByText(/Step 3 of 3: Complete/)).toBeTruthy();
  });

  it('should render ChainStep for unknown step (default case)', () => {
    wizardStep.value = 0;
    render(<SetupWizard />);
    expect(screen.getByTestId('chain-step')).toBeTruthy();
  });

  it('should render 3 progress dots', () => {
    const { container } = render(<SetupWizard />);
    const allDivs = container.querySelectorAll('div');
    const dots = Array.from(allDivs).filter(
      (d) => (d as HTMLElement).style.borderRadius === '50%',
    );
    expect(dots).toHaveLength(3);
  });
});
