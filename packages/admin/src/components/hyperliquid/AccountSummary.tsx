import { useSignal } from '@preact/signals';
import { useEffect } from 'preact/hooks';
import { apiGet } from '../../api/client';

interface AccountState {
  marginSummary?: {
    accountValue?: string;
    totalMarginUsed?: string;
    totalNtlPos?: string;
    totalRawUsd?: string;
  };
  crossMarginSummary?: {
    accountValue?: string;
    totalMarginUsed?: string;
    totalNtlPos?: string;
  };
}

interface Props {
  walletId: string | null;
}

const styles = {
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
    gap: 'var(--space-3)',
    marginBottom: 'var(--space-4)',
  },
  card: {
    padding: 'var(--space-3)',
    background: 'var(--color-bg-secondary)',
    borderRadius: 'var(--radius)',
    border: '1px solid var(--color-border)',
  },
  label: {
    fontSize: 'var(--font-size-sm)',
    color: 'var(--color-text-muted)',
    marginBottom: 'var(--space-1)',
  },
  value: {
    fontSize: 'var(--font-size-lg)',
    fontWeight: 'var(--font-weight-semibold)' as const,
  },
} as const;

function getMarginStatus(ratio: number): { label: string; color: string } {
  if (ratio <= 0.1) return { label: 'Safe', color: 'var(--color-success)' };
  if (ratio <= 0.3) return { label: 'Warning', color: 'var(--color-warning)' };
  return { label: 'Danger', color: 'var(--color-danger)' };
}

export function AccountSummary({ walletId }: Props) {
  const state = useSignal<AccountState | null>(null);
  const loading = useSignal(false);
  const error = useSignal<string | null>(null);

  useEffect(() => {
    if (!walletId) return;
    loading.value = true;
    error.value = null;
    apiGet(`/v1/wallets/${walletId}/hyperliquid/account`)
      .then((res) => {
        state.value = (res as { state: AccountState }).state;
      })
      .catch((err) => {
        error.value = err instanceof Error ? err.message : 'Failed to load account state';
      })
      .finally(() => {
        loading.value = false;
      });
  }, [walletId]);

  if (!walletId) {
    return <p style={{ color: 'var(--color-text-muted)' }}>Select a wallet to view Hyperliquid account</p>;
  }

  if (loading.value) {
    return <p>Loading account state...</p>;
  }

  if (error.value) {
    return <p style={{ color: 'var(--color-danger)' }}>{error.value}</p>;
  }

  const ms = state.value?.marginSummary ?? state.value?.crossMarginSummary;
  if (!ms) {
    return <p style={{ color: 'var(--color-text-muted)' }}>No account data available</p>;
  }

  const equity = parseFloat(ms.accountValue ?? '0');
  const marginUsed = parseFloat(ms.totalMarginUsed ?? '0');
  const available = equity - marginUsed;
  const marginRatio = equity > 0 ? marginUsed / equity : 0;
  const status = getMarginStatus(marginRatio);

  return (
    <div style={styles.grid}>
      <div style={styles.card}>
        <div style={styles.label}>Perp Equity</div>
        <div style={styles.value}>${equity.toFixed(2)}</div>
      </div>
      <div style={styles.card}>
        <div style={styles.label}>Margin Used</div>
        <div style={styles.value}>${marginUsed.toFixed(2)}</div>
      </div>
      <div style={styles.card}>
        <div style={styles.label}>Available Margin</div>
        <div style={styles.value}>${available.toFixed(2)}</div>
      </div>
      <div style={styles.card}>
        <div style={styles.label}>Margin Ratio</div>
        <div style={{ ...styles.value, color: status.color }}>
          {(marginRatio * 100).toFixed(1)}% ({status.label})
        </div>
      </div>
    </div>
  );
}
