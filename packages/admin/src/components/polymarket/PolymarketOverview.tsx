import { useSignal } from '@preact/signals';
import { useEffect } from 'preact/hooks';
import { apiGet } from '../../api/client';

interface Props {
  walletId: string | null;
}

export function PolymarketOverview({ walletId }: Props) {
  const pnl = useSignal<Record<string, unknown> | null>(null);
  const balance = useSignal<Record<string, unknown> | null>(null);
  const orders = useSignal<unknown[]>([]);
  const loading = useSignal(true);

  useEffect(() => {
    if (!walletId) {
      loading.value = false;
      return;
    }
    loading.value = true;
    Promise.all([
      apiGet(`/v1/wallets/${walletId}/polymarket/pnl`).catch(() => null),
      apiGet(`/v1/wallets/${walletId}/polymarket/balance`).catch(() => null),
      apiGet(`/v1/wallets/${walletId}/polymarket/orders`).catch(() => ({ orders: [] })),
    ])
      .then(([pnlRes, balRes, ordRes]) => {
        pnl.value = pnlRes as Record<string, unknown>;
        balance.value = balRes as Record<string, unknown>;
        const o = ordRes as { orders?: unknown[] };
        orders.value = (o?.orders ?? []).slice(0, 5);
      })
      .finally(() => {
        loading.value = false;
      });
  }, [walletId]);

  if (loading.value) return <p>Loading...</p>;
  if (!walletId) return <p style={{ color: 'var(--color-text-muted)' }}>Select a wallet to view overview.</p>;

  const pnlData = pnl.value?.pnl as Record<string, unknown> | undefined;

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 'var(--space-3)', marginBottom: 'var(--space-4)' }}>
        <div class="card" style={{ padding: 'var(--space-3)' }}>
          <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-muted)' }}>Active Positions</div>
          <div style={{ fontSize: 'var(--font-size-xl)', fontWeight: 'var(--font-weight-semibold)' }}>
            {pnlData?.positionCount ?? 0}
          </div>
        </div>
        <div class="card" style={{ padding: 'var(--space-3)' }}>
          <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-muted)' }}>Unrealized PnL</div>
          <div style={{ fontSize: 'var(--font-size-xl)', fontWeight: 'var(--font-weight-semibold)' }}>
            {pnlData?.totalUnrealized ?? '0'}
          </div>
        </div>
        <div class="card" style={{ padding: 'var(--space-3)' }}>
          <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-muted)' }}>CTF Tokens</div>
          <div style={{ fontSize: 'var(--font-size-xl)', fontWeight: 'var(--font-weight-semibold)' }}>
            {(balance.value as Record<string, unknown>)?.tokenCount ?? 0}
          </div>
        </div>
      </div>

      <h4 style={{ marginBottom: 'var(--space-2)' }}>Recent Orders</h4>
      {orders.value.length === 0 ? (
        <p style={{ color: 'var(--color-text-muted)' }}>No Polymarket activity. Use pm_setup to create API keys.</p>
      ) : (
        <table class="table" style={{ width: '100%' }}>
          <thead>
            <tr>
              <th>Side</th>
              <th>Outcome</th>
              <th>Price</th>
              <th>Size</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {orders.value.map((o: unknown, i: number) => {
              const ord = o as Record<string, unknown>;
              return (
                <tr key={i}>
                  <td>{String(ord.side ?? '')}</td>
                  <td>{String(ord.outcome ?? '')}</td>
                  <td>{String(ord.price ?? '')}</td>
                  <td>{String(ord.size ?? '')}</td>
                  <td>{String(ord.status ?? '')}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
