import { useSignal } from '@preact/signals';
import { useEffect, useRef } from 'preact/hooks';
import { apiGet } from '../../api/client';

interface SpotBalance {
  coin: string;
  hold: string;
  token: number;
  total: string;
  entryNtl?: string;
}

interface Props {
  walletId: string | null;
}

const cellStyle = {
  padding: 'var(--space-2) var(--space-3)',
  textAlign: 'right' as const,
  whiteSpace: 'nowrap' as const,
};

const headerStyle = {
  ...cellStyle,
  fontWeight: 'var(--font-weight-semibold)' as const,
  color: 'var(--color-text-muted)',
  fontSize: 'var(--font-size-sm)',
  borderBottom: '2px solid var(--color-border)',
};

export function SpotBalancesTable({ walletId }: Props) {
  const balances = useSignal<SpotBalance[]>([]);
  const loading = useSignal(false);
  const error = useSignal<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchBalances = () => {
    if (!walletId) return;
    apiGet(`/v1/wallets/${walletId}/hyperliquid/spot/balances`)
      .then((res) => {
        const all = (res as { balances: SpotBalance[] }).balances;
        // Filter out zero-balance tokens
        balances.value = all.filter((b) => parseFloat(b.total) !== 0);
        error.value = null;
      })
      .catch((err) => {
        error.value = err instanceof Error ? err.message : 'Failed to load spot balances';
      })
      .finally(() => {
        loading.value = false;
      });
  };

  useEffect(() => {
    if (!walletId) return;
    loading.value = true;
    fetchBalances();

    intervalRef.current = setInterval(fetchBalances, 10000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [walletId]);

  if (!walletId) {
    return <p style={{ color: 'var(--color-text-muted)' }}>Select a wallet to view spot balances</p>;
  }

  if (loading.value) return <p>Loading spot balances...</p>;
  if (error.value) return <p style={{ color: 'var(--color-danger)' }}>{error.value}</p>;

  if (balances.value.length === 0) {
    return <p style={{ color: 'var(--color-text-muted)' }}>No spot balances</p>;
  }

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={{ ...headerStyle, textAlign: 'left' }}>Token</th>
            <th style={headerStyle}>Total</th>
            <th style={headerStyle}>Hold</th>
            <th style={headerStyle}>Available</th>
          </tr>
        </thead>
        <tbody>
          {balances.value.map((b) => {
            const total = parseFloat(b.total);
            const hold = parseFloat(b.hold);
            const available = total - hold;

            return (
              <tr key={b.coin} style={{ borderBottom: '1px solid var(--color-border)' }}>
                <td style={{ ...cellStyle, textAlign: 'left', fontWeight: 'var(--font-weight-semibold)' }}>{b.coin}</td>
                <td style={cellStyle}>{total.toFixed(4)}</td>
                <td style={cellStyle}>{hold > 0 ? hold.toFixed(4) : '-'}</td>
                <td style={cellStyle}>{available.toFixed(4)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
