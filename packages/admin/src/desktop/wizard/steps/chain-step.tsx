/**
 * Setup Wizard Step 2: Select Chain
 */

import { signal } from '@preact/signals';
import { wizardData, nextStep, prevStep } from '../wizard-store';

type SupportedChain = 'solana' | 'ethereum' | 'base' | 'polygon' | 'arbitrum';

interface ChainOption {
  id: SupportedChain;
  name: string;
  icon: string;
  description: string;
}

const chains: ChainOption[] = [
  { id: 'ethereum', name: 'Ethereum', icon: '\u039E', description: 'EVM mainnet' },
  { id: 'solana', name: 'Solana', icon: '\u25CE', description: 'High throughput' },
  { id: 'base', name: 'Base', icon: '\u25B3', description: 'Coinbase L2' },
  { id: 'polygon', name: 'Polygon', icon: '\u2B21', description: 'EVM sidechain' },
  { id: 'arbitrum', name: 'Arbitrum', icon: '\u25C7', description: 'Optimistic rollup' },
];

const selected = signal<SupportedChain>(wizardData.value.chain);

const styles = {
  description: {
    fontSize: 'var(--font-size-sm)',
    color: 'var(--color-text-secondary)',
    marginBottom: 'var(--space-4)',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
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
  buttonNext: {
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
} as const;

function handleNext() {
  wizardData.value = { ...wizardData.value, chain: selected.value };
  nextStep();
}

export function ChainStep() {
  return (
    <div>
      <p style={styles.description}>
        Select the blockchain network for your first wallet.
        You can add more wallets on different chains later.
      </p>

      <div style={styles.grid}>
        {chains.map((chain) => (
          <div
            key={chain.id}
            style={{
              ...styles.chainCard,
              ...(selected.value === chain.id ? styles.chainCardSelected : {}),
            }}
            onClick={() => { selected.value = chain.id; }}
          >
            <span style={styles.chainIcon}>{chain.icon}</span>
            <div style={styles.chainName}>{chain.name}</div>
            <div style={styles.chainDesc}>{chain.description}</div>
          </div>
        ))}
      </div>

      <div style={styles.buttonRow}>
        <button style={styles.buttonBack} onClick={prevStep}>Back</button>
        <button style={styles.buttonNext} onClick={handleNext}>Continue</button>
      </div>
    </div>
  );
}
