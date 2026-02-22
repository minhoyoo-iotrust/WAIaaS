import { useSignal } from '@preact/signals';
import { useEffect } from 'preact/hooks';
import { apiGet, apiPut, apiPatch, ApiError } from '../api/client';
import { API } from '../api/endpoints';
import { formatDate, formatAddress } from '../utils/format';
import { Badge, Button, FormField } from '../components/form';
import { FilterBar } from '../components/filter-bar';
import type { FilterField } from '../components/filter-bar';
import { showToast } from '../components/toast';
import { getErrorMessage } from '../utils/error-messages';
import type { SettingsData } from '../utils/settings-helpers';
import {
  keyToLabel,
  getEffectiveValue as getEffectiveValuePure,
} from '../utils/settings-helpers';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface IncomingTxItem {
  id: string;
  txHash: string;
  walletId: string;
  walletName: string | null;
  fromAddress: string;
  amount: string;
  tokenAddress: string | null;
  chain: string;
  network: string;
  status: string;
  blockNumber: number | null;
  detectedAt: number | null;
  confirmedAt: number | null;
  suspicious: boolean;
}

interface IncomingTxResponse {
  items: IncomingTxItem[];
  total: number;
  offset: number;
  limit: number;
}

interface WalletListItem {
  id: string;
  name: string;
  chain: string;
  network: string;
  status: string;
  monitorIncoming: boolean;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PAGE_SIZE = 20;

const CHAIN_OPTIONS = [
  { value: 'solana', label: 'Solana' },
  { value: 'evm', label: 'EVM' },
];

const STATUS_OPTIONS = [
  { value: 'DETECTED', label: 'DETECTED' },
  { value: 'CONFIRMED', label: 'CONFIRMED' },
];

const SUSPICIOUS_OPTIONS = [
  { value: 'true', label: 'Yes' },
  { value: 'false', label: 'No' },
];

// Column headers
const COLUMNS = ['Time', 'Wallet', 'Sender', 'Amount', 'Chain', 'Network', 'Status', 'Suspicious'];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function statusVariant(status: string): 'success' | 'warning' {
  if (status === 'CONFIRMED') return 'success';
  return 'warning';
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function IncomingPage() {
  // --- Settings state ---
  const settings = useSignal<SettingsData>({});
  const dirty = useSignal<Record<string, string>>({});
  const saving = useSignal(false);
  const settingsLoading = useSignal(true);
  const settingsCollapsed = useSignal(false);

  // --- Wallets state ---
  const walletsList = useSignal<WalletListItem[]>([]);
  const walletsLoading = useSignal(true);
  const walletMonitorState = useSignal<Record<string, boolean>>({});
  const togglingWallet = useSignal<string | null>(null);

  // --- Incoming TX state ---
  const items = useSignal<IncomingTxItem[]>([]);
  const total = useSignal(0);
  const txLoading = useSignal(true);
  const error = useSignal<string | null>(null);

  const filters = useSignal<Record<string, string>>({
    wallet_id: '',
    chain: '',
    status: '',
    suspicious: '',
  });
  const page = useSignal(0);
  const expandedId = useSignal<string | null>(null);

  const walletOptions = useSignal<Array<{ value: string; label: string }>>([]);

  // ---------------------------------------------------------------------------
  // Settings helpers
  // ---------------------------------------------------------------------------

  const handleFieldChange = (fullKey: string, value: string | number | boolean) => {
    const strValue = String(value);
    dirty.value = { ...dirty.value, [fullKey]: strValue };
  };

  const getEffectiveValue = (category: string, shortKey: string): string =>
    getEffectiveValuePure(settings.value, dirty.value, category, shortKey);

  const handleSave = async () => {
    saving.value = true;
    try {
      // Only save incoming.* keys
      const entries = Object.entries(dirty.value)
        .filter(([key]) => key.startsWith('incoming.'))
        .map(([key, value]) => ({ key, value }));
      if (entries.length === 0) {
        showToast('info', 'No changes to save');
        saving.value = false;
        return;
      }
      const result = await apiPut<{ updated: number; settings: SettingsData }>(API.ADMIN_SETTINGS, { settings: entries });
      settings.value = result.settings;
      dirty.value = {};
      showToast('success', 'Settings saved and applied');
    } catch (err) {
      const e = err instanceof ApiError ? err : new ApiError(0, 'UNKNOWN', 'Unknown error');
      showToast('error', getErrorMessage(e.code));
    } finally {
      saving.value = false;
    }
  };

  const handleDiscard = () => {
    dirty.value = {};
  };

  // ---------------------------------------------------------------------------
  // Data fetching
  // ---------------------------------------------------------------------------

  const fetchSettings = async () => {
    try {
      const result = await apiGet<SettingsData>(API.ADMIN_SETTINGS);
      settings.value = result;
    } catch (err) {
      const e = err instanceof ApiError ? err : new ApiError(0, 'UNKNOWN', 'Unknown error');
      showToast('error', getErrorMessage(e.code));
    } finally {
      settingsLoading.value = false;
    }
  };

  const fetchWallets = async () => {
    try {
      const result = await apiGet<{ items: WalletListItem[] }>(API.WALLETS);
      const list = result.items ?? (result as unknown as WalletListItem[]);
      walletsList.value = list;
      walletOptions.value = list.map((w) => ({
        value: w.id,
        label: w.name || w.id.slice(0, 8),
      }));
      const monitorMap: Record<string, boolean> = {};
      for (const w of list) {
        monitorMap[w.id] = w.monitorIncoming ?? false;
      }
      walletMonitorState.value = monitorMap;
    } catch {
      // Non-critical
    } finally {
      walletsLoading.value = false;
    }
  };

  const fetchIncomingTx = async () => {
    txLoading.value = true;
    error.value = null;
    try {
      const params = new URLSearchParams();
      const f = filters.value;
      if (f.wallet_id) params.set('wallet_id', f.wallet_id);
      if (f.chain) params.set('chain', f.chain);
      if (f.status) params.set('status', f.status);
      if (f.suspicious) params.set('suspicious', f.suspicious);
      params.set('offset', String(page.value * PAGE_SIZE));
      params.set('limit', String(PAGE_SIZE));

      const qs = params.toString();
      const result = await apiGet<IncomingTxResponse>(
        `${API.ADMIN_INCOMING}?${qs}`,
      );
      items.value = result.items;
      total.value = result.total;
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        error.value = getErrorMessage(err.code);
      } else {
        error.value = 'An unexpected error occurred.';
      }
    } finally {
      txLoading.value = false;
    }
  };

  // On mount
  useEffect(() => {
    fetchSettings();
    fetchWallets();
    fetchIncomingTx();
  }, []);

  // Re-fetch when filters or page change
  useEffect(() => {
    fetchIncomingTx();
  }, [filters.value, page.value]);

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------

  function handleFiltersChange(newFilters: Record<string, string>) {
    filters.value = newFilters;
    page.value = 0;
  }

  function handleRowClick(tx: IncomingTxItem) {
    expandedId.value = expandedId.value === tx.id ? null : tx.id;
  }

  function handlePrev() {
    if (page.value > 0) page.value = page.value - 1;
  }

  function handleNext() {
    if ((page.value + 1) * PAGE_SIZE < total.value) page.value = page.value + 1;
  }

  async function handleToggleMonitor(walletId: string) {
    const currentVal = walletMonitorState.value[walletId] ?? false;
    togglingWallet.value = walletId;
    try {
      const result = await apiPatch<{ id: string; monitorIncoming: boolean }>(
        API.WALLET_PATCH(walletId),
        { monitorIncoming: !currentVal },
      );
      walletMonitorState.value = {
        ...walletMonitorState.value,
        [walletId]: result.monitorIncoming,
      };
    } catch (err) {
      const e = err instanceof ApiError ? err : new ApiError(0, 'UNKNOWN', 'Unknown error');
      showToast('error', getErrorMessage(e.code));
    } finally {
      togglingWallet.value = null;
    }
  }

  // ---------------------------------------------------------------------------
  // Filter fields
  // ---------------------------------------------------------------------------

  function getFilterFields(): FilterField[] {
    return [
      { key: 'wallet_id', label: 'Wallet', type: 'select', options: walletOptions.value },
      { key: 'chain', label: 'Chain', type: 'select', options: CHAIN_OPTIONS },
      { key: 'status', label: 'Status', type: 'select', options: STATUS_OPTIONS },
      { key: 'suspicious', label: 'Suspicious', type: 'select', options: SUSPICIOUS_OPTIONS },
    ];
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  const dirtyCount = Object.keys(dirty.value).filter((k) => k.startsWith('incoming.')).length;
  const offset = page.value * PAGE_SIZE;
  const showFrom = total.value > 0 ? offset + 1 : 0;
  const showTo = Math.min(offset + PAGE_SIZE, total.value);
  const hasPrev = page.value > 0;
  const hasNext = (page.value + 1) * PAGE_SIZE < total.value;

  return (
    <div class="page">
      {/* Save bar -- sticky when dirty */}
      {dirtyCount > 0 && (
        <div class="settings-save-bar">
          <span>{dirtyCount} unsaved change{dirtyCount > 1 ? 's' : ''}</span>
          <div class="settings-save-bar-actions">
            <Button variant="ghost" size="sm" onClick={handleDiscard}>
              Discard
            </Button>
            <Button variant="primary" size="sm" onClick={handleSave} loading={saving.value}>
              Save
            </Button>
          </div>
        </div>
      )}

      {/* ================================================================== */}
      {/* Section A: Settings Panel */}
      {/* ================================================================== */}
      <div class="settings-category">
        <div
          class="settings-category-header"
          style={{ cursor: 'pointer', userSelect: 'none' }}
          onClick={() => { settingsCollapsed.value = !settingsCollapsed.value; }}
        >
          <h3>
            Incoming TX Monitoring Settings
            <span style={{ marginLeft: '0.5rem', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
              {settingsCollapsed.value ? '[+]' : '[-]'}
            </span>
          </h3>
          <p class="settings-description">
            Monitor incoming transactions to wallets. Detects native and token transfers,
            flags suspicious activity (dust attacks, large amounts, unknown tokens).
          </p>
        </div>
        {!settingsCollapsed.value && (
          <div class="settings-category-body">
            {settingsLoading.value ? (
              <span>Loading settings...</span>
            ) : (
              <>
                <div class="settings-fields-grid">
                  <FormField
                    label="Monitoring Enabled"
                    name="incoming.enabled"
                    type="select"
                    value={getEffectiveValue('incoming', 'enabled') || 'false'}
                    onChange={(v) => handleFieldChange('incoming.enabled', v)}
                    options={[
                      { label: 'Yes', value: 'true' },
                      { label: 'No', value: 'false' },
                    ]}
                  />
                  <FormField
                    label="Poll Interval (seconds)"
                    name="incoming.poll_interval"
                    type="number"
                    value={Number(getEffectiveValue('incoming', 'poll_interval')) || 30}
                    onChange={(v) => handleFieldChange('incoming.poll_interval', v)}
                    min={5}
                    max={3600}
                  />
                  <FormField
                    label="Retention Days"
                    name="incoming.retention_days"
                    type="number"
                    value={Number(getEffectiveValue('incoming', 'retention_days')) || 90}
                    onChange={(v) => handleFieldChange('incoming.retention_days', v)}
                    min={1}
                    max={365}
                  />
                  <FormField
                    label="Suspicious Dust USD Threshold"
                    name="incoming.suspicious_dust_usd"
                    type="number"
                    value={Number(getEffectiveValue('incoming', 'suspicious_dust_usd')) || 0.01}
                    onChange={(v) => handleFieldChange('incoming.suspicious_dust_usd', v)}
                    min={0}
                    max={1000}
                  />
                  <FormField
                    label="Suspicious Amount Multiplier"
                    name="incoming.suspicious_amount_multiplier"
                    type="number"
                    value={Number(getEffectiveValue('incoming', 'suspicious_amount_multiplier')) || 10}
                    onChange={(v) => handleFieldChange('incoming.suspicious_amount_multiplier', v)}
                    min={1}
                    max={1000}
                  />
                  <FormField
                    label="Notification Cooldown (minutes)"
                    name="incoming.cooldown_minutes"
                    type="number"
                    value={Number(getEffectiveValue('incoming', 'cooldown_minutes')) || 5}
                    onChange={(v) => handleFieldChange('incoming.cooldown_minutes', v)}
                    min={1}
                    max={1440}
                  />
                  <FormField
                    label="WebSocket URL (optional)"
                    name="incoming.wss_url"
                    type="text"
                    value={getEffectiveValue('incoming', 'wss_url')}
                    onChange={(v) => handleFieldChange('incoming.wss_url', v)}
                    placeholder="wss://custom-rpc.example.com"
                  />
                </div>
                <div class="settings-info-box">
                  Monitors wallets with incoming monitoring enabled for incoming transactions.
                  Uses WebSocket subscription when available, falls back to polling.
                  Suspicious transactions (dust attacks, unusually large amounts, unknown tokens)
                  trigger broadcast alerts to all notification channels.
                  Changes take effect immediately via hot-reload.
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* ================================================================== */}
      {/* Section B: Per-Wallet Monitoring Toggles */}
      {/* ================================================================== */}
      <div class="settings-category" style={{ marginTop: 'var(--space-4)' }}>
        <div class="settings-category-header">
          <h3>Per-Wallet Monitoring</h3>
          <p class="settings-description">Enable or disable incoming transaction monitoring for individual wallets</p>
        </div>
        <div class="settings-category-body">
          {walletsLoading.value ? (
            <span>Loading wallets...</span>
          ) : walletsList.value.length === 0 ? (
            <p class="empty-text">No wallets found</p>
          ) : (
            <div class="table-container">
              <table>
                <thead>
                  <tr>
                    <th>Wallet Name</th>
                    <th>Chain</th>
                    <th>Status</th>
                    <th>Monitor Incoming</th>
                  </tr>
                </thead>
                <tbody>
                  {walletsList.value.map((w) => (
                    <tr key={w.id}>
                      <td>{w.name || w.id.slice(0, 8)}</td>
                      <td>{w.chain}</td>
                      <td>
                        <Badge variant={w.status === 'ACTIVE' ? 'success' : 'warning'}>
                          {w.status}
                        </Badge>
                      </td>
                      <td>
                        <Button
                          variant={walletMonitorState.value[w.id] ? 'primary' : 'secondary'}
                          size="sm"
                          onClick={() => handleToggleMonitor(w.id)}
                          loading={togglingWallet.value === w.id}
                        >
                          {walletMonitorState.value[w.id] ? 'ON' : 'OFF'}
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* ================================================================== */}
      {/* Section C: Incoming TX Table */}
      {/* ================================================================== */}
      <div style={{ marginTop: 'var(--space-4)' }}>
        <h3 style={{ marginBottom: 'var(--space-3)' }}>Incoming Transactions</h3>

        {error.value && (
          <div class="dashboard-error">
            <span>{error.value}</span>
            <Button variant="secondary" size="sm" onClick={fetchIncomingTx}>
              Retry
            </Button>
          </div>
        )}

        <FilterBar
          fields={getFilterFields()}
          values={filters.value}
          onChange={handleFiltersChange}
          syncUrl={false}
        />

        <div class="table-container" style={{ marginTop: 'var(--space-3)' }}>
          <table>
            <thead>
              <tr>
                {COLUMNS.map((col) => (
                  <th key={col}>{col}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {txLoading.value && items.value.length === 0 ? (
                <tr>
                  <td colSpan={COLUMNS.length} class="table-loading">
                    Loading...
                  </td>
                </tr>
              ) : items.value.length === 0 ? (
                <tr>
                  <td colSpan={COLUMNS.length} class="table-empty">
                    No incoming transactions found
                  </td>
                </tr>
              ) : (
                items.value.map((tx) => (
                  <>
                    <tr
                      key={tx.id}
                      class={`clickable${expandedId.value === tx.id ? ' row-expanded' : ''}`}
                      style={{ cursor: 'pointer' }}
                      onClick={() => handleRowClick(tx)}
                    >
                      <td>{tx.detectedAt ? formatDate(tx.detectedAt) : '\u2014'}</td>
                      <td>{tx.walletName ?? tx.walletId.slice(0, 8)}</td>
                      <td>{formatAddress(tx.fromAddress)}</td>
                      <td>{tx.amount}</td>
                      <td>{tx.chain}</td>
                      <td>{tx.network}</td>
                      <td>
                        <Badge variant={statusVariant(tx.status)}>{tx.status}</Badge>
                      </td>
                      <td>
                        <Badge variant={tx.suspicious ? 'danger' : 'success'}>
                          {tx.suspicious ? 'Yes' : 'No'}
                        </Badge>
                      </td>
                    </tr>
                    {expandedId.value === tx.id && (
                      <tr key={`${tx.id}-expand`} class="row-expand">
                        <td colSpan={COLUMNS.length}>
                          <div class="detail-grid">
                            <div class="detail-item">
                              <span class="detail-label">ID</span>
                              <span class="detail-value">{tx.id}</span>
                            </div>
                            <div class="detail-item">
                              <span class="detail-label">Tx Hash</span>
                              <span class="detail-value">{tx.txHash}</span>
                            </div>
                            <div class="detail-item">
                              <span class="detail-label">Wallet ID</span>
                              <span class="detail-value">{tx.walletId}</span>
                            </div>
                            <div class="detail-item">
                              <span class="detail-label">Wallet Name</span>
                              <span class="detail-value">{tx.walletName ?? '\u2014'}</span>
                            </div>
                            <div class="detail-item">
                              <span class="detail-label">From Address</span>
                              <span class="detail-value">{tx.fromAddress}</span>
                            </div>
                            <div class="detail-item">
                              <span class="detail-label">Amount</span>
                              <span class="detail-value">{tx.amount}</span>
                            </div>
                            <div class="detail-item">
                              <span class="detail-label">Token Address</span>
                              <span class="detail-value">{tx.tokenAddress ?? '\u2014'}</span>
                            </div>
                            <div class="detail-item">
                              <span class="detail-label">Chain</span>
                              <span class="detail-value">{tx.chain}</span>
                            </div>
                            <div class="detail-item">
                              <span class="detail-label">Network</span>
                              <span class="detail-value">{tx.network}</span>
                            </div>
                            <div class="detail-item">
                              <span class="detail-label">Status</span>
                              <span class="detail-value">{tx.status}</span>
                            </div>
                            <div class="detail-item">
                              <span class="detail-label">Block Number</span>
                              <span class="detail-value">{tx.blockNumber ?? '\u2014'}</span>
                            </div>
                            <div class="detail-item">
                              <span class="detail-label">Detected At</span>
                              <span class="detail-value">
                                {tx.detectedAt ? formatDate(tx.detectedAt) : '\u2014'}
                              </span>
                            </div>
                            <div class="detail-item">
                              <span class="detail-label">Confirmed At</span>
                              <span class="detail-value">
                                {tx.confirmedAt ? formatDate(tx.confirmedAt) : '\u2014'}
                              </span>
                            </div>
                            <div class="detail-item">
                              <span class="detail-label">Suspicious</span>
                              <span class="detail-value">{tx.suspicious ? 'Yes' : 'No'}</span>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div class="pagination" style={{ marginTop: 'var(--space-3)' }}>
          <span class="pagination-info">
            Showing {showFrom}-{showTo} of {total.value}
          </span>
          <div class="pagination-buttons">
            <Button
              variant="secondary"
              size="sm"
              disabled={!hasPrev}
              onClick={handlePrev}
            >
              Previous
            </Button>
            <Button
              variant="secondary"
              size="sm"
              disabled={!hasNext}
              onClick={handleNext}
            >
              Next
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
