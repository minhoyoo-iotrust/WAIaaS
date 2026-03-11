import { useSignal } from '@preact/signals';
import { useEffect, useRef } from 'preact/hooks';
import { apiGet } from '../../api/client';
import { HYPERLIQUID_POLL_INTERVAL_MS } from '../../constants';

interface Position {
  coin: string;
  szi: string;
  entryPx?: string | null;
  positionValue?: string;
  unrealizedPnl?: string;
  returnOnEquity?: string;
  leverage?: { value: number; type: string };
  liquidationPx?: string | null;
  maxLeverage?: number;
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

export function PositionsTable({ walletId }: Props) {
  const positions = useSignal<Position[]>([]);
  const loading = useSignal(false);
  const error = useSignal<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchPositions = () => {
    if (!walletId) return;
    apiGet(`/v1/wallets/${walletId}/hyperliquid/positions`)
      .then((res) => {
        positions.value = (res as { positions: Position[] }).positions;
        error.value = null;
      })
      .catch((err) => {
        error.value = err instanceof Error ? err.message : 'Failed to load positions';
      })
      .finally(() => {
        loading.value = false;
      });
  };

  useEffect(() => {
    if (!walletId) return;
    loading.value = true;
    fetchPositions();

    intervalRef.current = setInterval(fetchPositions, HYPERLIQUID_POLL_INTERVAL_MS);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [walletId]);

  if (!walletId) {
    return <p style={{ color: 'var(--color-text-muted)' }}>Select a wallet to view positions</p>;
  }

  if (loading.value) return <p>Loading positions...</p>;
  if (error.value) return <p style={{ color: 'var(--color-danger)' }}>{error.value}</p>;

  if (positions.value.length === 0) {
    return <p style={{ color: 'var(--color-text-muted)' }}>No open positions</p>;
  }

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={{ ...headerStyle, textAlign: 'left' }}>Market</th>
            <th style={headerStyle}>Side</th>
            <th style={headerStyle}>Size</th>
            <th style={headerStyle}>Entry Price</th>
            <th style={headerStyle}>Position Value</th>
            <th style={headerStyle}>PnL</th>
            <th style={headerStyle}>Leverage</th>
            <th style={headerStyle}>Liquidation</th>
          </tr>
        </thead>
        <tbody>
          {positions.value.map((p) => {
            const size = parseFloat(p.szi);
            const side = size > 0 ? 'LONG' : 'SHORT';
            const sideColor = size > 0 ? 'var(--color-success)' : 'var(--color-danger)';
            const pnl = parseFloat(p.unrealizedPnl ?? '0');
            const pnlColor = pnl >= 0 ? 'var(--color-success)' : 'var(--color-danger)';

            return (
              <tr key={p.coin} style={{ borderBottom: '1px solid var(--color-border)' }}>
                <td style={{ ...cellStyle, textAlign: 'left', fontWeight: 'var(--font-weight-semibold)' }}>{p.coin}</td>
                <td style={{ ...cellStyle, color: sideColor }}>{side}</td>
                <td style={cellStyle}>{Math.abs(size).toFixed(4)}</td>
                <td style={cellStyle}>{p.entryPx ? parseFloat(p.entryPx).toFixed(2) : '-'}</td>
                <td style={cellStyle}>${p.positionValue ? parseFloat(p.positionValue).toFixed(2) : '-'}</td>
                <td style={{ ...cellStyle, color: pnlColor }}>
                  {pnl >= 0 ? '+' : ''}{pnl.toFixed(2)}
                </td>
                <td style={cellStyle}>{p.leverage?.value ?? '-'}x</td>
                <td style={cellStyle}>{p.liquidationPx ? parseFloat(p.liquidationPx).toFixed(2) : '-'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
