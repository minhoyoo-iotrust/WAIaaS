import { useSignal } from '@preact/signals';
import { useEffect } from 'preact/hooks';
import { api } from '../api/typed-client';
import type { Wallet } from '../api/types.aliases';
import { TabNav, type TabItem } from '../components/tab-nav';
import { PolymarketOverview } from '../components/polymarket/PolymarketOverview';
import { PolymarketMarkets } from '../components/polymarket/PolymarketMarkets';
import { PolymarketOrders } from '../components/polymarket/PolymarketOrders';
import { PolymarketPositions } from '../components/polymarket/PolymarketPositions';
type Tab = 'overview' | 'markets' | 'orders' | 'positions';

const POLYMARKET_TABS: TabItem[] = [
  { key: 'overview', label: 'Overview' },
  { key: 'markets', label: 'Markets' },
  { key: 'orders', label: 'Orders' },
  { key: 'positions', label: 'Positions' },
];

export default function PolymarketPage() {
  const wallets = useSignal<Wallet[]>([]);
  const selectedWalletId = useSignal<string | null>(null);
  const activeTab = useSignal<Tab>('overview');
  const loading = useSignal(true);

  useEffect(() => {
    api.GET('/v1/wallets')
      .then(({ data }) => {
        const list = data?.items ?? [];
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
      <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-muted)', marginBottom: 'var(--space-3)' }}>
        <a href="#/providers" style={{ color: 'var(--color-primary)' }}>Configure in Protocols &gt; Providers</a>
      </p>

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
      <TabNav
        tabs={POLYMARKET_TABS}
        activeTab={activeTab.value}
        onTabChange={(k) => { activeTab.value = k as Tab; }}
      />

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
    </div>
  );
}
