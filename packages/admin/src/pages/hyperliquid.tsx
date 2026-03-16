import { useSignal } from '@preact/signals';
import { useEffect } from 'preact/hooks';
import { api } from '../api/typed-client';
import type { Wallet } from '../api/types.aliases';
import { TabNav, type TabItem } from '../components/tab-nav';
import { AccountSummary } from '../components/hyperliquid/AccountSummary';
import { PositionsTable } from '../components/hyperliquid/PositionsTable';
import { OpenOrdersTable } from '../components/hyperliquid/OpenOrdersTable';
import { SpotBalancesTable } from '../components/hyperliquid/SpotBalancesTable';
import { SpotOrdersTable } from '../components/hyperliquid/SpotOrdersTable';
import { SubAccountList } from '../components/hyperliquid/SubAccountList';
import { SubAccountDetail } from '../components/hyperliquid/SubAccountDetail';
type Tab = 'overview' | 'orders' | 'spot' | 'subaccounts';

const HYPERLIQUID_TABS: TabItem[] = [
  { key: 'overview', label: 'Overview' },
  { key: 'orders', label: 'Orders' },
  { key: 'spot', label: 'Spot' },
  { key: 'subaccounts', label: 'Sub-accounts' },
];

export default function HyperliquidPage() {
  const wallets = useSignal<Wallet[]>([]);
  const selectedWalletId = useSignal<string | null>(null);
  const activeTab = useSignal<Tab>('overview');
  const selectedSubAccount = useSignal<string | null>(null);
  const loading = useSignal(true);

  useEffect(() => {
    api.GET('/v1/wallets')
      .then(({ data }) => {
        const list = data?.items ?? [];
        // Filter to EVM wallets only (Hyperliquid is EVM-based)
        const evmWallets = list.filter((w) => w.chain === 'ethereum');
        wallets.value = evmWallets;
        if (evmWallets.length > 0 && !selectedWalletId.value) {
          selectedWalletId.value = evmWallets[0].id;
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
            <option value="">No EVM wallets available</option>
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
        tabs={HYPERLIQUID_TABS}
        activeTab={activeTab.value}
        onTabChange={(k) => {
          activeTab.value = k as Tab;
          if (k === 'subaccounts') selectedSubAccount.value = null;
        }}
      />

      {/* Tab content */}
      {activeTab.value === 'overview' && (
        <div>
          <h3 style={{ marginBottom: 'var(--space-3)' }}>Account Summary</h3>
          <AccountSummary walletId={selectedWalletId.value} />
          <h3 style={{ marginBottom: 'var(--space-3)' }}>Positions</h3>
          <PositionsTable walletId={selectedWalletId.value} />
        </div>
      )}
      {activeTab.value === 'orders' && (
        <div>
          <h3 style={{ marginBottom: 'var(--space-3)' }}>Open Orders</h3>
          <OpenOrdersTable walletId={selectedWalletId.value} />
        </div>
      )}
      {activeTab.value === 'spot' && (
        <div>
          <h3 style={{ marginBottom: 'var(--space-3)' }}>Spot Balances</h3>
          <SpotBalancesTable walletId={selectedWalletId.value} />
          <h3 style={{ marginTop: 'var(--space-4)', marginBottom: 'var(--space-3)' }}>Spot Orders</h3>
          <SpotOrdersTable walletId={selectedWalletId.value} />
        </div>
      )}
      {activeTab.value === 'subaccounts' && (
        <div>
          <h3 style={{ marginBottom: 'var(--space-3)' }}>Sub-accounts</h3>
          <SubAccountList
            walletId={selectedWalletId.value}
            onSelect={(addr) => { selectedSubAccount.value = addr; }}
          />
          {selectedSubAccount.value && (
            <div style={{ marginTop: 'var(--space-4)' }}>
              <SubAccountDetail
                walletId={selectedWalletId.value}
                subAccountAddress={selectedSubAccount.value}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
