import { useSignal } from '@preact/signals';
import { useEffect } from 'preact/hooks';
import { apiGet } from '../api/client';
import { PolymarketOverview } from '../components/polymarket/PolymarketOverview';
import { PolymarketMarkets } from '../components/polymarket/PolymarketMarkets';
import { PolymarketOrders } from '../components/polymarket/PolymarketOrders';
import { PolymarketPositions } from '../components/polymarket/PolymarketPositions';
import { PolymarketSettings } from '../components/polymarket/PolymarketSettings';

interface Wallet {
  id: string;
  name: string;
  chain: string;
  network: string;
}

type Tab = 'overview' | 'markets' | 'orders' | 'positions' | 'settings';

const tabStyle = {
  display: 'flex',
  gap: 'var(--space-1)',
  marginBottom: 'var(--space-4)',
  borderBottom: '1px solid var(--color-border)',
  paddingBottom: 'var(--space-1)',
};

const tabButton = (active: boolean) => ({
  padding: 'var(--space-2) var(--space-3)',
  border: 'none',
  background: 'none',
  cursor: 'pointer',
  fontWeight: active ? ('var(--font-weight-semibold)' as const) : ('var(--font-weight-normal)' as const),
  color: active ? 'var(--color-primary)' : 'var(--color-text-muted)',
  borderBottom: active ? '2px solid var(--color-primary)' : '2px solid transparent',
  marginBottom: '-1px',
});

export default function PolymarketPage() {
  const wallets = useSignal<Wallet[]>([]);
  const selectedWalletId = useSignal<string | null>(null);
  const activeTab = useSignal<Tab>('overview');
  const loading = useSignal(true);

  useEffect(() => {
    apiGet('/v1/wallets')
      .then((res) => {
        const list = (res as { wallets: Wallet[] }).wallets ?? [];
        // Filter to Polygon EVM wallets (Polymarket runs on Polygon)
        const polygonWallets = list.filter((w) => w.chain === 'ethereum' && w.network.includes('polygon'));
        wallets.value = polygonWallets;
        if (polygonWallets.length > 0 && !selectedWalletId.value) {
          selectedWalletId.value = polygonWallets[0].id;
        }
      })
      .catch(() => {
        // Silently fail, will show empty state
      })
      .finally(() => {
        loading.value = false;
      });
  }, []);

  if (loading.value) {
    return <p>Loading...</p>;
  }

  return (
    <div>
      {/* Wallet selector */}
      <div style={{ marginBottom: 'var(--space-4)' }}>
        <label style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-muted)', marginRight: 'var(--space-2)' }}>
          Wallet:
        </label>
        <select
          class="form-input"
          style={{ width: 'auto', display: 'inline-block', minWidth: '200px' }}
          value={selectedWalletId.value ?? ''}
          onChange={(e) => {
            selectedWalletId.value = (e.target as HTMLSelectElement).value || null;
          }}
        >
          {wallets.value.length === 0 && (
            <option value="">No Polygon wallets available</option>
          )}
          {wallets.value.map((w) => (
            <option key={w.id} value={w.id}>
              {w.name} ({w.network})
            </option>
          ))}
        </select>
      </div>

      {/* Tab bar */}
      <div style={tabStyle}>
        <button
          style={tabButton(activeTab.value === 'overview')}
          onClick={() => { activeTab.value = 'overview'; }}
        >
          Overview
        </button>
        <button
          style={tabButton(activeTab.value === 'markets')}
          onClick={() => { activeTab.value = 'markets'; }}
        >
          Markets
        </button>
        <button
          style={tabButton(activeTab.value === 'orders')}
          onClick={() => { activeTab.value = 'orders'; }}
        >
          Orders
        </button>
        <button
          style={tabButton(activeTab.value === 'positions')}
          onClick={() => { activeTab.value = 'positions'; }}
        >
          Positions
        </button>
        <button
          style={tabButton(activeTab.value === 'settings')}
          onClick={() => { activeTab.value = 'settings'; }}
        >
          Settings
        </button>
      </div>

      {/* Tab content */}
      {activeTab.value === 'overview' && (
        <div>
          <h3 style={{ marginBottom: 'var(--space-3)' }}>Overview</h3>
          <PolymarketOverview walletId={selectedWalletId.value} />
        </div>
      )}
      {activeTab.value === 'markets' && (
        <div>
          <h3 style={{ marginBottom: 'var(--space-3)' }}>Markets</h3>
          <PolymarketMarkets />
        </div>
      )}
      {activeTab.value === 'orders' && (
        <div>
          <h3 style={{ marginBottom: 'var(--space-3)' }}>Orders</h3>
          <PolymarketOrders walletId={selectedWalletId.value} />
        </div>
      )}
      {activeTab.value === 'positions' && (
        <div>
          <h3 style={{ marginBottom: 'var(--space-3)' }}>Positions</h3>
          <PolymarketPositions walletId={selectedWalletId.value} />
        </div>
      )}
      {activeTab.value === 'settings' && (
        <div>
          <h3 style={{ marginBottom: 'var(--space-3)' }}>Polymarket Settings</h3>
          <PolymarketSettings />
        </div>
      )}
    </div>
  );
}
