/**
 * Setup Wizard Step 1: Select Chain(s)
 *
 * Aligned with SSoT CHAIN_TYPES = ['solana', 'ethereum', 'ripple'] from
 * packages/shared/src/networks.ts. Individual EVM networks (Base, Polygon,
 * Arbitrum) are NETWORKS under the 'ethereum' chain type, not separate chains.
 *
 * Multi-select: all chains selected by default so the initial setup creates
 * wallets on every supported chain.
 */

import { useSignal } from '@preact/signals';
import { wizardData, nextStep } from '../wizard-store';
import type { ChainId } from '../wizard-store';

interface ChainOption {
  id: ChainId;
  name: string;
  icon: string;
  description: string;
}

const chains: ChainOption[] = [
  { id: 'ethereum', name: 'EVM', icon: '\u039E', description: 'Ethereum, Base, Polygon, Arbitrum' },
  { id: 'solana', name: 'Solana', icon: '\u25CE', description: 'High throughput' },
  { id: 'ripple', name: 'XRP Ledger', icon: '\u2715', description: 'Cross-border payments' },
];

// toggle() and handleNext() are defined inside ChainStep to access instance signal

const styles = {
  description: {
    fontSize: 'var(--font-size-sm)',
    color: 'var(--color-text-secondary)',
    marginBottom: 'var(--space-4)',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr 1fr',
    gap: 'var(--space-3)',
    marginBottom: 'var(--space-4)',
  },
  chainCard: {
    padding: 'var(--space-3)',
    border: '2px solid var(--color-border)',
    borderRadius: 'var(--radius-md)',
    cursor: 'pointer',
    textAlign: 'center' as const,
    transition: 'border-color 0.15s',
    position: 'relative' as const,
  },
  chainCardSelected: {
    borderColor: 'var(--color-primary)',
    background: 'var(--color-bg-secondary)',
  },
  chainIcon: {
    fontSize: 'var(--font-size-2xl)',
    display: 'block',
    marginBottom: 'var(--space-1)',
  },
  chainName: {
    fontSize: 'var(--font-size-base)',
    fontWeight: 'var(--font-weight-medium)',
  },
  chainDesc: {
    fontSize: 'var(--font-size-xs)',
    color: 'var(--color-text-secondary)',
  },
  checkmark: {
    position: 'absolute' as const,
    top: '6px',
    right: '8px',
    fontSize: 'var(--font-size-sm)',
    color: 'var(--color-primary)',
  },
  buttonRow: {
    display: 'flex',
    gap: 'var(--space-3)',
  },
  buttonNext: {
    flex: 1,
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
  hint: {
    fontSize: 'var(--font-size-xs)',
    color: 'var(--color-text-secondary)',
    textAlign: 'center' as const,
    marginBottom: 'var(--space-3)',
  },
} as const;

export function ChainStep() {
  const selected = useSignal<Set<ChainId>>(new Set(wizardData.value.chains));

  function toggle(id: ChainId) {
    const next = new Set(selected.value);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    selected.value = next;
  }

  function handleNext() {
    const arr = Array.from(selected.value) as ChainId[];
    wizardData.value = { ...wizardData.value, chains: arr };
    nextStep();
  }

  const isDisabled = selected.value.size === 0;

  return (
    <div>
      <p style={styles.description}>
        Select the blockchain networks for your wallets.
        A key pair will be generated for each selected chain.
      </p>

      <div style={styles.grid}>
        {chains.map((chain) => {
          const isSelected = selected.value.has(chain.id);
          return (
            <div
              key={chain.id}
              style={{
                ...styles.chainCard,
                ...(isSelected ? styles.chainCardSelected : {}),
              }}
              onClick={() => toggle(chain.id)}
            >
              {isSelected && <span style={styles.checkmark}>&#10003;</span>}
              <span style={styles.chainIcon}>{chain.icon}</span>
              <div style={styles.chainName}>{chain.name}</div>
              <div style={styles.chainDesc}>{chain.description}</div>
            </div>
          );
        })}
      </div>

      <p style={styles.hint}>
        You can add more wallets later from the dashboard.
      </p>

      <div style={styles.buttonRow}>
        <button
          style={{
            ...styles.buttonNext,
            ...(isDisabled ? styles.buttonDisabled : {}),
          }}
          disabled={isDisabled}
          onClick={handleNext}
        >
          Continue ({selected.value.size} selected)
        </button>
      </div>
    </div>
  );
}
