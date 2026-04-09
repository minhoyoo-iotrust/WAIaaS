/**
 * Setup Wizard Step 3: Create Wallet
 */

import { signal } from '@preact/signals';
import { wizardData, nextStep, prevStep } from '../wizard-store';
import { masterPassword } from '../../../auth/store';

const walletName = signal(wizardData.value.walletName);
const error = signal<string | null>(null);
const loading = signal(false);
const progress = signal('');

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

const CHAIN_LABELS: Record<string, string> = {
  ethereum: 'EVM',
  solana: 'Solana',
  ripple: 'XRP Ledger',
};

async function handleCreate(e: Event) {
  e.preventDefault();
  error.value = null;

  const name = walletName.value.trim();
  if (!name) {
    error.value = 'Wallet name is required';
    return;
  }

  const chains = wizardData.value.chains;
  if (chains.length === 0) {
    error.value = 'No chains selected';
    return;
  }

  const authHeader = masterPassword.value ?? '';
  if (!authHeader) {
    error.value = 'Not authenticated — please restart the app';
    return;
  }

  loading.value = true;
  const createdIds: string[] = [];
  try {
    for (const chain of chains) {
      const label = CHAIN_LABELS[chain] ?? chain;
      progress.value = chains.length > 1
        ? `Creating ${label} wallet (${createdIds.length + 1}/${chains.length})...`
        : 'Creating wallet...';

      const res = await fetch('/v1/wallets', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Master-Password': authHeader,
        },
        body: JSON.stringify({
          name: chains.length > 1 ? `${name} (${label})` : name,
          chain,
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        error.value = (body as { message?: string }).message || `Failed to create ${label} wallet`;
        return;
      }

      const data = await res.json() as { id: string };
      createdIds.push(data.id);
    }

    wizardData.value = {
      ...wizardData.value,
      walletName: name,
      walletIds: createdIds,
    };
    nextStep();
  } catch {
    error.value = 'Cannot connect to daemon';
  } finally {
    loading.value = false;
    progress.value = '';
  }
}

export function WalletStep() {
  const chains = wizardData.value.chains;
  const chainLabels = chains.map(c => CHAIN_LABELS[c] ?? c).join(', ');

  return (
    <form style={styles.form} onSubmit={handleCreate}>
      <p style={styles.description}>
        {chains.length > 1
          ? `Create wallets on ${chains.length} chains. A new key pair will be generated for each.`
          : 'Create your first wallet. A new key pair will be generated on the selected chain.'}
      </p>

      <div style={styles.chainBadge}>
        {chains.length > 1 ? `Chains: ${chainLabels}` : `Chain: ${chainLabels}`}
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
          {loading.value ? (progress.value || 'Creating...') : (chains.length > 1 ? 'Create Wallets' : 'Create Wallet')}
        </button>
      </div>

      {error.value && <p style={styles.error}>{error.value}</p>}
    </form>
  );
}
