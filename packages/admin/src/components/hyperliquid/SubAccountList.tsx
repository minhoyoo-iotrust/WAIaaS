import { useSignal } from '@preact/signals';
import { useEffect, useRef } from 'preact/hooks';
import { apiGet } from '../../api/client';
import { HYPERLIQUID_POLL_INTERVAL_MS } from '../../constants';

interface SubAccountInfo {
  subAccountUser: string;
  name: string;
  master: string;
}

interface Props {
  walletId: string | null;
  onSelect?: (subAddress: string) => void;
}

const cellStyle = {
  padding: 'var(--space-2) var(--space-3)',
  textAlign: 'left' as const,
  whiteSpace: 'nowrap' as const,
};

const headerStyle = {
  ...cellStyle,
  fontWeight: 'var(--font-weight-semibold)' as const,
  color: 'var(--color-text-muted)',
  fontSize: 'var(--font-size-sm)',
  borderBottom: '2px solid var(--color-border)',
};

export function SubAccountList({ walletId, onSelect }: Props) {
  const subAccounts = useSignal<SubAccountInfo[]>([]);
  const loading = useSignal(false);
  const error = useSignal<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchSubAccounts = () => {
    if (!walletId) return;
    apiGet(`/v1/wallets/${walletId}/hyperliquid/sub-accounts`)
      .then((res) => {
        subAccounts.value = (res as { subAccounts: SubAccountInfo[] }).subAccounts ?? [];
        error.value = null;
      })
      .catch((err) => {
        error.value = err instanceof Error ? err.message : 'Failed to load sub-accounts';
      })
      .finally(() => {
        loading.value = false;
      });
  };

  useEffect(() => {
    if (!walletId) return;
    loading.value = true;
    fetchSubAccounts();

    intervalRef.current = setInterval(fetchSubAccounts, HYPERLIQUID_POLL_INTERVAL_MS);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [walletId]);

  if (!walletId) {
    return <p style={{ color: 'var(--color-text-muted)' }}>Select a wallet to view sub-accounts</p>;
  }

  if (loading.value) return <p>Loading sub-accounts...</p>;
  if (error.value) return <p style={{ color: 'var(--color-danger)' }}>{error.value}</p>;

  if (subAccounts.value.length === 0) {
    return <p style={{ color: 'var(--color-text-muted)' }}>No sub-accounts found</p>;
  }

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={headerStyle}>Name</th>
            <th style={headerStyle}>Address</th>
          </tr>
        </thead>
        <tbody>
          {subAccounts.value.map((sa) => (
            <tr
              key={sa.subAccountUser}
              style={{
                borderBottom: '1px solid var(--color-border)',
                cursor: onSelect ? 'pointer' : 'default',
              }}
              onClick={() => onSelect?.(sa.subAccountUser)}
            >
              <td style={{ ...cellStyle, fontWeight: 'var(--font-weight-semibold)' }}>
                {sa.name || '(unnamed)'}
              </td>
              <td style={{ ...cellStyle, fontFamily: 'var(--font-mono)', fontSize: 'var(--font-size-sm)' }}>
                {sa.subAccountUser.slice(0, 6)}...{sa.subAccountUser.slice(-4)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
