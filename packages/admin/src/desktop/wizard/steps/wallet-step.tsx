/**
 * Setup Wizard Step 3: Create Wallet
 */

import { signal } from '@preact/signals';
import { wizardData, nextStep, prevStep } from '../wizard-store';

const walletName = signal(wizardData.value.walletName);
const error = signal<string | null>(null);
const loading = signal(false);

const styles = {
  form: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 'var(--space-4)',
  },
  description: {
    fontSize: 'var(--font-size-sm)',
    color: 'var(--color-text-secondary)',
    marginBottom: 'var(--space-2)',
  },
  label: {
    fontSize: 'var(--font-size-sm)',
    fontWeight: 'var(--font-weight-medium)' as const,
    marginBottom: 'var(--space-1)',
    display: 'block',
  },
  input: {
    width: '100%',
    padding: 'var(--space-2) var(--space-3)',
    border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius-md)',
    fontSize: 'var(--font-size-base)',
    outline: 'none',
    boxSizing: 'border-box' as const,
  },
  chainBadge: {
    display: 'inline-block',
    padding: 'var(--space-1) var(--space-2)',
    background: 'var(--color-bg-secondary)',
    border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius-sm)',
    fontSize: 'var(--font-size-sm)',
    marginBottom: 'var(--space-3)',
  },
  buttonRow: {
    display: 'flex',
    gap: 'var(--space-3)',
  },
  buttonBack: {
    flex: 1,
    padding: 'var(--space-2) var(--space-4)',
    background: 'transparent',
    color: 'var(--color-text)',
    border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius-md)',
    fontSize: 'var(--font-size-base)',
    cursor: 'pointer',
  },
  buttonCreate: {
    flex: 2,
    padding: 'var(--space-2) var(--space-4)',
    background: 'var(--color-primary)',
    color: '#0c0c0c',
    border: 'none',
    borderRadius: 'var(--radius-md)',
    fontSize: 'var(--font-size-base)',
    fontWeight: 'var(--font-weight-medium)',
    cursor: 'pointer',
  },
  buttonDisabled: {
    opacity: 0.6,
    cursor: 'not-allowed',
  },
  error: {
    color: 'var(--color-danger)',
    fontSize: 'var(--font-size-sm)',
    textAlign: 'center' as const,
  },
} as const;

async function handleCreate(e: Event) {
  e.preventDefault();
  error.value = null;

  const name = walletName.value.trim();
  if (!name) {
    error.value = 'Wallet name is required';
    return;
  }

  loading.value = true;
  try {
    const res = await fetch('/v1/wallets', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Master-Password': wizardData.value.password,
      },
      body: JSON.stringify({
        name,
        chain: wizardData.value.chain,
      }),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      error.value = (body as { message?: string }).message || 'Failed to create wallet';
      return;
    }

    const data = await res.json() as { id: string };
    wizardData.value = {
      ...wizardData.value,
      walletName: name,
      walletId: data.id,
    };
    nextStep();
  } catch {
    error.value = 'Cannot connect to daemon';
  } finally {
    loading.value = false;
  }
}

export function WalletStep() {
  return (
    <form style={styles.form} onSubmit={handleCreate}>
      <p style={styles.description}>
        Create your first wallet. A new key pair will be generated on the selected chain.
      </p>

      <div style={styles.chainBadge}>
        Chain: {wizardData.value.chain}
      </div>

      <div>
        <label style={styles.label}>Wallet Name</label>
        <input
          type="text"
          placeholder="My Wallet"
          value={walletName.value}
          onInput={(e) => { walletName.value = (e.target as HTMLInputElement).value; }}
          style={styles.input}
          autoFocus
        />
      </div>

      <div style={styles.buttonRow}>
        <button type="button" style={styles.buttonBack} onClick={prevStep}>Back</button>
        <button
          type="submit"
          disabled={loading.value}
          style={{
            ...styles.buttonCreate,
            ...(loading.value ? styles.buttonDisabled : {}),
          }}
        >
          {loading.value ? 'Creating...' : 'Create Wallet'}
        </button>
      </div>

      {error.value && <p style={styles.error}>{error.value}</p>}
    </form>
  );
}
