import { useSignal } from '@preact/signals';
import { useEffect } from 'preact/hooks';
import { api } from '../api/typed-client';
import type { Wallet } from '../api/types.aliases';
import { AccountSummary } from '../components/hyperliquid/AccountSummary';
import { PositionsTable } from '../components/hyperliquid/PositionsTable';
import { OpenOrdersTable } from '../components/hyperliquid/OpenOrdersTable';
import { SpotBalancesTable } from '../components/hyperliquid/SpotBalancesTable';
import { SpotOrdersTable } from '../components/hyperliquid/SpotOrdersTable';
import { SubAccountList } from '../components/hyperliquid/SubAccountList';
import { SubAccountDetail } from '../components/hyperliquid/SubAccountDetail';
import { SettingsPanel } from '../components/hyperliquid/SettingsPanel';

type Tab = 'overview' | 'orders' | 'spot' | 'subaccounts' | 'settings';

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
      <div style={tabStyle}>
        <button
          style={tabButton(activeTab.value === 'overview')}
          onClick={() => { activeTab.value = 'overview'; }}
        >
          Overview
        </button>
        <button
          style={tabButton(activeTab.value === 'orders')}
          onClick={() => { activeTab.value = 'orders'; }}
        >
          Orders
        </button>
        <button
          style={tabButton(activeTab.value === 'spot')}
          onClick={() => { activeTab.value = 'spot'; }}
        >
          Spot
        </button>
        <button
          style={tabButton(activeTab.value === 'subaccounts')}
          onClick={() => { activeTab.value = 'subaccounts'; selectedSubAccount.value = null; }}
        >
          Sub-accounts
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
      {activeTab.value === 'settings' && (
        <div>
          <h3 style={{ marginBottom: 'var(--space-3)' }}>Hyperliquid Settings</h3>
          <SettingsPanel />
        </div>
      )}
    </div>
  );
}
