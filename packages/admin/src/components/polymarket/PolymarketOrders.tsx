import { useSignal } from '@preact/signals';
import { useEffect } from 'preact/hooks';
import { apiGet } from '../../api/client';

interface Props {
  walletId: string | null;
}

interface Order {
  id: string;
  market: string;
  side: string;
  type: string;
  price: string;
  size: string;
  status: string;
  createdAt: string;
}

type StatusFilter = 'ALL' | 'LIVE' | 'MATCHED' | 'CANCELLED';

export function PolymarketOrders({ walletId }: Props) {
  const orders = useSignal<Order[]>([]);
  const loading = useSignal(true);
  const statusFilter = useSignal<StatusFilter>('ALL');

  const fetchOrders = (status?: StatusFilter) => {
    if (!walletId) {
      loading.value = false;
      return;
    }
    loading.value = true;
    const params = status && status !== 'ALL' ? `?status=${status}` : '';
    apiGet(`/v1/wallets/${walletId}/polymarket/orders${params}`)
      .then((res) => {
        const data = res as { orders?: Order[] };
        orders.value = data.orders ?? [];
      })
      .catch(() => {
        orders.value = [];
      })
      .finally(() => {
        loading.value = false;
      });
  };

  useEffect(() => {
    fetchOrders(statusFilter.value);
  }, [walletId]);

  const handleStatusChange = (value: StatusFilter) => {
    statusFilter.value = value;
    fetchOrders(value);
  };

  if (!walletId) return <p style={{ color: 'var(--color-text-muted)' }}>Select a wallet to view orders.</p>;
  if (loading.value) return <p>Loading orders...</p>;

  return (
    <div>
      <div style={{ marginBottom: 'var(--space-3)' }}>
        <label style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-muted)', marginRight: 'var(--space-2)' }}>
          Status:
        </label>
        <select
          class="form-input"
          style={{ width: 'auto', display: 'inline-block', minWidth: '120px' }}
          value={statusFilter.value}
          onChange={(e) => handleStatusChange((e.target as HTMLSelectElement).value as StatusFilter)}
        >
          <option value="ALL">All</option>
          <option value="LIVE">Live</option>
          <option value="MATCHED">Matched</option>
          <option value="CANCELLED">Cancelled</option>
        </select>
      </div>

      {orders.value.length === 0 ? (
        <p style={{ color: 'var(--color-text-muted)' }}>No orders found.</p>
      ) : (
        <table class="table" style={{ width: '100%' }}>
          <thead>
            <tr>
              <th>Market</th>
              <th>Side</th>
              <th>Type</th>
              <th>Price</th>
              <th>Size</th>
              <th>Status</th>
              <th>Created</th>
            </tr>
          </thead>
          <tbody>
            {orders.value.map((o) => (
              <tr key={o.id}>
                <td style={{ maxWidth: '250px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {o.market}
                </td>
                <td>{o.side}</td>
                <td>{o.type}</td>
                <td>{o.price}</td>
                <td>{o.size}</td>
                <td>{o.status}</td>
                <td>{o.createdAt}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
