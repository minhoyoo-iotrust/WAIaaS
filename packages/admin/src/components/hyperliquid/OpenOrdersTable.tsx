import { useSignal } from '@preact/signals';
import { useEffect } from 'preact/hooks';
import { apiGet } from '../../api/client';

interface OpenOrder {
  coin: string;
  side: string;
  limitPx: string;
  sz: string;
  oid: number;
  timestamp?: number;
  orderType?: string;
  triggerPx?: string;
  tif?: string;
  reduceOnly?: boolean;
  cloid?: string | null;
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

export function OpenOrdersTable({ walletId }: Props) {
  const orders = useSignal<OpenOrder[]>([]);
  const loading = useSignal(false);
  const error = useSignal<string | null>(null);

  useEffect(() => {
    if (!walletId) return;
    loading.value = true;
    error.value = null;
    apiGet(`/v1/wallets/${walletId}/hyperliquid/orders`)
      .then((res) => {
        orders.value = (res as { orders: OpenOrder[] }).orders;
      })
      .catch((err) => {
        error.value = err instanceof Error ? err.message : 'Failed to load orders';
      })
      .finally(() => {
        loading.value = false;
      });
  }, [walletId]);

  if (!walletId) {
    return <p style={{ color: 'var(--color-text-muted)' }}>Select a wallet to view orders</p>;
  }

  if (loading.value) return <p>Loading orders...</p>;
  if (error.value) return <p style={{ color: 'var(--color-danger)' }}>{error.value}</p>;

  if (orders.value.length === 0) {
    return <p style={{ color: 'var(--color-text-muted)' }}>No open orders</p>;
  }

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={{ ...headerStyle, textAlign: 'left' }}>Market</th>
            <th style={headerStyle}>Side</th>
            <th style={headerStyle}>Type</th>
            <th style={headerStyle}>Size</th>
            <th style={headerStyle}>Price</th>
            <th style={headerStyle}>Trigger</th>
            <th style={headerStyle}>TIF</th>
            <th style={headerStyle}>Created</th>
          </tr>
        </thead>
        <tbody>
          {orders.value.map((o) => {
            const sideColor = o.side === 'B' || o.side === 'BUY'
              ? 'var(--color-success)'
              : 'var(--color-danger)';
            const sideLabel = o.side === 'B' || o.side === 'BUY' ? 'BUY' : 'SELL';

            return (
              <tr key={o.oid} style={{ borderBottom: '1px solid var(--color-border)' }}>
                <td style={{ ...cellStyle, textAlign: 'left', fontWeight: 'var(--font-weight-semibold)' }}>{o.coin}</td>
                <td style={{ ...cellStyle, color: sideColor }}>{sideLabel}</td>
                <td style={cellStyle}>{o.orderType ?? 'LIMIT'}</td>
                <td style={cellStyle}>{parseFloat(o.sz).toFixed(4)}</td>
                <td style={cellStyle}>{parseFloat(o.limitPx).toFixed(2)}</td>
                <td style={cellStyle}>{o.triggerPx ? parseFloat(o.triggerPx).toFixed(2) : '-'}</td>
                <td style={cellStyle}>{o.tif ?? 'GTC'}</td>
                <td style={cellStyle}>
                  {o.timestamp ? new Date(o.timestamp).toLocaleString() : '-'}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
