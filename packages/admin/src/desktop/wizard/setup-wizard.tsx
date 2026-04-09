/**
 * Setup Wizard orchestrator -- renders the current step with a progress indicator.
 *
 * IMPORTANT: This file must ONLY be loaded via dynamic import inside
 * isDesktop() guards. It is NEVER statically imported in browser code.
 */

import { wizardStep } from './wizard-store';
import { ChainStep } from './steps/chain-step';
import { WalletStep } from './steps/wallet-step';
import { OwnerStep } from './steps/owner-step';
import { CompleteStep } from './steps/complete-step';

// Issue 491: the "Set Password" step was removed. On first launch, sidecar.rs
// generates a bootstrap recovery.key and the daemon initializes its hash from
// it, so the user is already authenticated by the time the wizard loads (see
// auto-login in app.tsx). Users who want a custom master password change it
// from the dashboard Security page instead.
const STEP_NAMES = [
  'Select Chain',
  'Create Wallet',
  'Connect Owner',
  'Complete',
] as const;

const TOTAL_STEPS = 4;

const styles = {
  wrapper: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '100vh',
    background: 'var(--color-bg-secondary)',
  },
  card: {
    background: 'var(--color-bg)',
    border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius-lg)',
    padding: 'var(--space-8)',
    width: '100%',
    maxWidth: '480px',
    boxShadow: 'var(--shadow-md)',
  },
  header: {
    textAlign: 'center' as const,
    marginBottom: 'var(--space-6)',
  },
  title: {
    fontSize: 'var(--font-size-2xl)',
    fontWeight: 'var(--font-weight-bold)',
    marginBottom: 'var(--space-1)',
  },
  stepLabel: {
    fontSize: 'var(--font-size-sm)',
    color: 'var(--color-text-secondary)',
    marginBottom: 'var(--space-4)',
  },
  progressBar: {
    display: 'flex',
    justifyContent: 'center',
    gap: 'var(--space-2)',
  },
} as const;

function StepContent({ step }: { step: number }) {
  switch (step) {
    case 1: return <ChainStep />;
    case 2: return <WalletStep />;
    case 3: return <OwnerStep />;
    case 4: return <CompleteStep />;
    default: return <ChainStep />;
  }
}

function getDotStyle(stepNum: number, currentStep: number): Record<string, string> {
  const base: Record<string, string> = {
    width: '10px',
    height: '10px',
    borderRadius: '50%',
    background: 'var(--color-border)',
    transition: 'background 0.2s',
  };
  if (stepNum === currentStep) {
    base.background = 'var(--color-primary)';
  } else if (stepNum < currentStep) {
    base.background = 'var(--color-primary)';
    base.opacity = '0.5';
  }
  return base;
}

export function SetupWizard() {
  const currentStep = wizardStep.value;

  return (
    <div style={styles.wrapper}>
      <div style={styles.card}>
        <div style={styles.header}>
          <h1 style={styles.title}>WAIaaS Setup</h1>
          <p style={styles.stepLabel}>
            Step {currentStep} of {TOTAL_STEPS}: {STEP_NAMES[currentStep - 1]}
          </p>
          <div style={styles.progressBar}>
            {Array.from({ length: TOTAL_STEPS }, (_, i) => (
              <div key={i + 1} style={getDotStyle(i + 1, currentStep)} />
            ))}
          </div>
        </div>
        <StepContent step={currentStep} />
      </div>
    </div>
  );
}
