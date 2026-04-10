/**
 * Setup Wizard Step 5: Setup Complete
 */

import { wizardData, completeWizard } from '../wizard-store';

const styles = {
  container: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    gap: 'var(--space-4)',
    textAlign: 'center' as const,
  },
  checkmark: {
    fontSize: '3rem',
    lineHeight: 1,
  },
  title: {
    fontSize: 'var(--font-size-xl)',
    fontWeight: 'var(--font-weight-bold)',
  },
  summary: {
    width: '100%',
    padding: 'var(--space-3)',
    background: 'var(--color-bg-secondary)',
    border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius-md)',
    textAlign: 'left' as const,
  },
  summaryRow: {
    display: 'flex',
    justifyContent: 'space-between',
    padding: 'var(--space-1) 0',
    fontSize: 'var(--font-size-sm)',
  },
  summaryLabel: {
    color: 'var(--color-text-secondary)',
  },
  summaryValue: {
    fontWeight: 'var(--font-weight-medium)',
  },
  button: {
    width: '100%',
    padding: 'var(--space-3) var(--space-4)',
    background: 'var(--color-primary)',
    color: '#0c0c0c',
    border: 'none',
    borderRadius: 'var(--radius-md)',
    fontSize: 'var(--font-size-base)',
    fontWeight: 'var(--font-weight-medium)',
    cursor: 'pointer',
  },
  description: {
    fontSize: 'var(--font-size-sm)',
    color: 'var(--color-text-secondary)',
  },
} as const;

export function CompleteStep() {
  const data = wizardData.value;

  return (
    <div style={styles.container}>
      <div style={styles.checkmark}>&#10003;</div>
      <div style={styles.title}>Setup Complete!</div>
      <p style={styles.description}>
        Your WAIaaS desktop app is ready to use.
      </p>

      <div style={styles.summary}>
        <div style={styles.summaryRow}>
          <span style={styles.summaryLabel}>Chains</span>
          <span style={styles.summaryValue}>{data.chains.join(', ')}</span>
        </div>
        <div style={styles.summaryRow}>
          <span style={styles.summaryLabel}>Wallet</span>
          <span style={styles.summaryValue}>{data.walletName}</span>
        </div>
      </div>

      <button style={styles.button} onClick={completeWizard}>
        Go to Dashboard
      </button>
    </div>
  );
}
