import { useSignal } from '@preact/signals';
import { useEffect } from 'preact/hooks';
import { apiGet } from '../../api/client';

interface Props {
  walletId: string | null;
}

interface Position {
  conditionId: string;
  market: string;
  outcome: string;
  size: string;
  avgPrice: string;
  currentPrice: string;
  unrealizedPnl: string;
  resolved: boolean;
  redeemable: boolean;
}

export function PolymarketPositions({ walletId }: Props) {
  const positions = useSignal<Position[]>([]);
  const loading = useSignal(true);

  useEffect(() => {
    if (!walletId) {
      loading.value = false;
      return;
    }
    loading.value = true;
    apiGet(`/v1/wallets/${walletId}/polymarket/positions`)
      .then((res) => {
        const data = res as { positions?: Position[] };
        positions.value = data.positions ?? [];
      })
      .catch(() => {
        positions.value = [];
      })
      .finally(() => {
        loading.value = false;
      });
  }, [walletId]);

  if (!walletId) return <p style={{ color: 'var(--color-text-muted)' }}>Select a wallet to view positions.</p>;
  if (loading.value) return <p>Loading positions...</p>;

  const active = positions.value.filter((p) => !p.resolved);
  const resolved = positions.value.filter((p) => p.resolved);

  if (positions.value.length === 0) {
    return <p style={{ color: 'var(--color-text-muted)' }}>No positions.</p>;
  }

  return (
    <div>
      {active.length > 0 && (
        <div style={{ marginBottom: 'var(--space-4)' }}>
          <h4 style={{ marginBottom: 'var(--space-2)' }}>Active Positions</h4>
          <table class="table" style={{ width: '100%' }}>
            <thead>
              <tr>
                <th>Market</th>
                <th>Outcome</th>
                <th>Size</th>
                <th>Avg Price</th>
                <th>Current</th>
                <th>Unrealized PnL</th>
              </tr>
            </thead>
            <tbody>
              {active.map((p) => (
                <tr key={`${p.conditionId}-${p.outcome}`}>
                  <td style={{ maxWidth: '250px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {p.market}
                  </td>
                  <td>{p.outcome}</td>
                  <td>{p.size}</td>
                  <td>{p.avgPrice}</td>
                  <td>{p.currentPrice}</td>
                  <td>{p.unrealizedPnl}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {resolved.length > 0 && (
        <div>
          <h4 style={{ marginBottom: 'var(--space-2)' }}>Resolved Markets</h4>
          <table class="table" style={{ width: '100%' }}>
            <thead>
              <tr>
                <th>Market</th>
                <th>Outcome</th>
                <th>Size</th>
                <th>PnL</th>
                <th>Redeemable</th>
              </tr>
            </thead>
            <tbody>
              {resolved.map((p) => (
                <tr key={`${p.conditionId}-${p.outcome}`}>
                  <td style={{ maxWidth: '250px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {p.market}
                  </td>
                  <td>{p.outcome}</td>
                  <td>{p.size}</td>
                  <td>{p.unrealizedPnl}</td>
                  <td>{p.redeemable ? 'Yes' : 'No'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
