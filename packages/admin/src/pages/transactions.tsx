import { useSignal } from '@preact/signals';
import { useEffect } from 'preact/hooks';
import { api, ApiError } from '../api/typed-client';
import type { components } from '../api/types.generated';
import { formatDate, formatAddress } from '../utils/format';
import { fetchDisplayCurrency, formatWithDisplay } from '../utils/display-currency';
import { Badge, Button, FormField } from '../components/form';
import { FilterBar } from '../components/filter-bar';
import type { FilterField } from '../components/filter-bar';
import { SearchInput } from '../components/search-input';
import { ExplorerLink } from '../components/explorer-link';
import { TabNav } from '../components/tab-nav';
import { Breadcrumb } from '../components/breadcrumb';
import { showToast } from '../components/toast';
import { getErrorMessage } from '../utils/error-messages';
import type { SettingsData } from '../utils/settings-helpers';
import { getEffectiveValue as getEffectiveValuePure } from '../utils/settings-helpers';
import { pendingNavigation, highlightField } from '../components/settings-search';
import { registerDirty, unregisterDirty } from '../utils/dirty-guard';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type TransactionItem = components['schemas']['TxDetailResponse'] & { chain: string };
type TransactionsResponse = components['schemas']['TxListResponse'] & { total: number; offset: number; limit: number };
type IncomingTxItem = components['schemas']['IncomingTxItem'];
type IncomingTxResponse = components['schemas']['IncomingTxListResponse'] & { total: number; offset: number; limit: number };
type WalletListItem = components['schemas']['WalletCrudResponse'];

// UI-only type (not from API schema)
interface UnifiedTxRow {
  id: string;
  direction: 'outgoing' | 'incoming';
  time: number | null;
  walletId: string;
  walletName: string | null;
  counterparty: string | null;
  contractName: string | null;
  amount: string | null;
  formattedAmount: string | null;
  amountUsd: number | null;
  network: string;
  status: string;
  txHash: string | null;
  chain: string;
  outgoing?: TransactionItem;
  incoming?: IncomingTxItem;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

type TabKey = 'transactions' | 'monitor';
type Direction = 'all' | 'outgoing' | 'incoming';

const TABS = [
  { key: 'transactions', label: 'History' },
  { key: 'monitor', label: 'Monitor Settings' },
];

const PAGE_SIZE = 20;

const DIRECTION_OPTIONS = [
  { value: 'all', label: 'All' },
  { value: 'outgoing', label: 'Outgoing' },
  { value: 'incoming', label: 'Incoming' },
];

const TYPE_OPTIONS = [
  { value: 'TRANSFER', label: 'Transfer' },
  { value: 'TOKEN_TRANSFER', label: 'Token Transfer' },
  { value: 'CONTRACT_CALL', label: 'Contract Call' },
  { value: 'APPROVE', label: 'Approve' },
  { value: 'BATCH', label: 'Batch' },
  { value: 'CONTRACT_DEPLOY', label: 'Contract Deploy' },
  { value: 'SIGN', label: 'Sign' },
];

/** Human-readable type labels for display */
const TYPE_LABELS: Record<string, string> = {
  TRANSFER: 'Transfer',
  TOKEN_TRANSFER: 'Token Transfer',
  CONTRACT_CALL: 'Contract Call',
  APPROVE: 'Approve',
  BATCH: 'Batch',
  CONTRACT_DEPLOY: 'Contract Deploy',
  SIGN: 'Sign',
  NFT_TRANSFER: 'NFT Transfer',
  X402_PAYMENT: 'x402 Payment',
};

const OUTGOING_STATUS_OPTIONS = [
  { value: 'PENDING', label: 'PENDING' },
  { value: 'QUEUED', label: 'QUEUED' },
  { value: 'APPROVED', label: 'APPROVED' },
  { value: 'SUBMITTED', label: 'SUBMITTED' },
  { value: 'CONFIRMED', label: 'CONFIRMED' },
  { value: 'FAILED', label: 'FAILED' },
  { value: 'CANCELLED', label: 'CANCELLED' },
];

const INCOMING_STATUS_OPTIONS = [
  { value: 'DETECTED', label: 'DETECTED' },
  { value: 'CONFIRMED', label: 'CONFIRMED' },
];

const CHAIN_OPTIONS = [
  { value: 'solana', label: 'Solana' },
  { value: 'evm', label: 'EVM' },
  { value: 'ripple', label: 'Ripple' },
];

const SUSPICIOUS_OPTIONS = [
  { value: 'true', label: 'Yes' },
  { value: 'false', label: 'No' },
];

const NETWORK_OPTIONS = [
  { value: 'solana-mainnet', label: 'solana-mainnet' },
  { value: 'solana-devnet', label: 'solana-devnet' },
  { value: 'solana-testnet', label: 'solana-testnet' },
  { value: 'ethereum-mainnet', label: 'ethereum-mainnet' },
  { value: 'ethereum-sepolia', label: 'ethereum-sepolia' },
  { value: 'polygon-mainnet', label: 'polygon-mainnet' },
  { value: 'polygon-amoy', label: 'polygon-amoy' },
  { value: 'arbitrum-mainnet', label: 'arbitrum-mainnet' },
  { value: 'arbitrum-sepolia', label: 'arbitrum-sepolia' },
  { value: 'optimism-mainnet', label: 'optimism-mainnet' },
  { value: 'optimism-sepolia', label: 'optimism-sepolia' },
  { value: 'base-mainnet', label: 'base-mainnet' },
  { value: 'base-sepolia', label: 'base-sepolia' },
  { value: 'xrpl-mainnet', label: 'xrpl-mainnet' },
  { value: 'xrpl-testnet', label: 'xrpl-testnet' },
  { value: 'xrpl-devnet', label: 'xrpl-devnet' },
];

const COLUMNS = ['Time', 'Direction', 'Wallet', 'Counterparty', 'Amount', 'Network', 'Status', 'Tx Hash'];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function statusVariant(status: string): 'success' | 'danger' | 'warning' {
  if (status === 'CONFIRMED') return 'success';
  if (status === 'FAILED') return 'danger';
  return 'warning';
}

function normalizeOutgoing(tx: TransactionItem): UnifiedTxRow {
  return {
    id: `out-${tx.id}`,
    direction: 'outgoing',
    time: tx.createdAt,
    walletId: tx.walletId,
    walletName: tx.walletName,
    counterparty: tx.toAddress,
    contractName: tx.contractName ?? null,
    amount: tx.amount,
    formattedAmount: tx.formattedAmount,
    amountUsd: tx.amountUsd,
    network: tx.network ?? tx.chain,
    status: tx.status,
    txHash: tx.txHash,
    chain: tx.chain,
    outgoing: tx,
  };
}

function normalizeIncoming(tx: IncomingTxItem): UnifiedTxRow {
  return {
    id: `in-${tx.id}`,
    direction: 'incoming',
    time: tx.detectedAt,
    walletId: tx.walletId,
    walletName: tx.walletName,
    counterparty: tx.fromAddress,
    contractName: null,
    amount: tx.amount,
    formattedAmount: tx.formattedAmount,
    amountUsd: null,
    network: tx.network,
    status: tx.status,
    txHash: tx.txHash,
    chain: tx.chain,
    incoming: tx,
  };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function TransactionsPage() {
  const activeTab = useSignal<TabKey>('transactions');

  // --- TX list state ---
  const rows = useSignal<UnifiedTxRow[]>([]);
  const totalOut = useSignal(0);
  const totalIn = useSignal(0);
  const loading = useSignal(true);
  const error = useSignal<string | null>(null);

  const direction = useSignal<Direction>('all');
  const filters = useSignal<Record<string, string>>({
    wallet_id: '',
    type: '',
    status: '',
    network: '',
    chain: '',
    suspicious: '',
    since: '',
    until: '',
  });
  const search = useSignal('');
  const page = useSignal(0);
  const expandedId = useSignal<string | null>(null);

  const displayCurrency = useSignal<string>('USD');
  const displayRate = useSignal<number | null>(1);
  const walletOptions = useSignal<Array<{ value: string; label: string }>>([]);

  // --- Monitor Settings state ---
  const settings = useSignal<SettingsData>({});
  const dirty = useSignal<Record<string, string>>({});
  const saving = useSignal(false);
  const settingsLoading = useSignal(true);
  const walletsList = useSignal<WalletListItem[]>([]);
  const walletsLoading = useSignal(true);
  const walletMonitorState = useSignal<Record<string, boolean>>({});
  const togglingWallet = useSignal<string | null>(null);

  // ---------------------------------------------------------------------------
  // Settings helpers
  // ---------------------------------------------------------------------------

  const handleFieldChange = (fullKey: string, value: string | number | boolean) => {
    dirty.value = { ...dirty.value, [fullKey]: String(value) };
  };

  const getEffectiveValue = (category: string, shortKey: string): string =>
    getEffectiveValuePure(settings.value, dirty.value, category, shortKey);

  const handleSave = async () => {
    saving.value = true;
    try {
      const entries = Object.entries(dirty.value)
        .filter(([key]) => key.startsWith('incoming.'))
        .map(([key, value]) => ({ key, value }));
      if (entries.length === 0) {
        showToast('info', 'No changes to save');
        saving.value = false;
        return;
      }
      const { data: result } = await api.PUT('/v1/admin/settings', { body: { settings: entries } });
      settings.value = result!.settings as unknown as SettingsData;
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

  // Register dirty guard
  useEffect(() => {
    const dirtyCount = Object.keys(dirty.value).filter((k) => k.startsWith('incoming.')).length;
    if (dirtyCount > 0) {
      registerDirty({
        id: 'transactions-monitor',
        isDirty: () => Object.keys(dirty.value).filter((k) => k.startsWith('incoming.')).length > 0,
        save: handleSave,
        discard: handleDiscard,
      });
    } else {
      unregisterDirty('transactions-monitor');
    }
    return () => unregisterDirty('transactions-monitor');
  }, [dirty.value]);

  // ---------------------------------------------------------------------------
  // Filter fields
  // ---------------------------------------------------------------------------

  function getFilterFields(): FilterField[] {
    const d = direction.value;
    const fields: FilterField[] = [
      { key: 'wallet_id', label: 'Wallet', type: 'select', options: walletOptions.value },
    ];

    if (d === 'outgoing' || d === 'all') {
      fields.push({ key: 'type', label: 'Type', type: 'select', options: TYPE_OPTIONS });
    }

    if (d === 'outgoing') {
      fields.push({ key: 'status', label: 'Status', type: 'select', options: OUTGOING_STATUS_OPTIONS });
    } else if (d === 'incoming') {
      fields.push({ key: 'status', label: 'Status', type: 'select', options: INCOMING_STATUS_OPTIONS });
    }

    fields.push({ key: 'network', label: 'Network', type: 'select', options: NETWORK_OPTIONS });

    if (d === 'incoming' || d === 'all') {
      fields.push({ key: 'chain', label: 'Chain', type: 'select', options: CHAIN_OPTIONS });
      fields.push({ key: 'suspicious', label: 'Suspicious', type: 'select', options: SUSPICIOUS_OPTIONS });
    }

    fields.push(
      { key: 'since', label: 'Since', type: 'date' },
      { key: 'until', label: 'Until', type: 'date' },
    );

    return fields;
  }

  // ---------------------------------------------------------------------------
  // Data fetching
  // ---------------------------------------------------------------------------

  const fetchOutgoing = async (): Promise<TransactionsResponse> => {
    const params = new URLSearchParams();
    const f = filters.value;
    if (f.wallet_id) params.set('wallet_id', f.wallet_id);
    if (f.type) params.set('type', f.type);
    if (f.status && direction.value !== 'all') params.set('status', f.status);
    if (f.network) params.set('network', f.network);
    if (f.since) {
      const d = new Date(f.since);
      if (!isNaN(d.getTime())) params.set('since', String(Math.floor(d.getTime() / 1000)));
    }
    if (f.until) {
      const d = new Date(f.until);
      if (!isNaN(d.getTime())) {
        d.setHours(23, 59, 59, 999);
        params.set('until', String(Math.floor(d.getTime() / 1000)));
      }
    }
    if (search.value) params.set('search', search.value);
    params.set('offset', String(page.value * PAGE_SIZE));
    params.set('limit', String(PAGE_SIZE));

    const query: Record<string, string> = {};
    params.forEach((v, k) => { query[k] = v; });
    const { data } = await api.GET('/v1/admin/transactions', { params: { query: query as Record<string, unknown> } });
    return data as unknown as TransactionsResponse;
  };

  const fetchIncoming = async (): Promise<IncomingTxResponse> => {
    const params = new URLSearchParams();
    const f = filters.value;
    if (f.wallet_id) params.set('wallet_id', f.wallet_id);
    if (f.chain) params.set('chain', f.chain);
    if (f.status && direction.value !== 'all') params.set('status', f.status);
    if (f.suspicious) params.set('suspicious', f.suspicious);
    params.set('offset', String(page.value * PAGE_SIZE));
    params.set('limit', String(PAGE_SIZE));

    const inQuery: Record<string, string> = {};
    params.forEach((v, k) => { inQuery[k] = v; });
    const { data } = await api.GET('/v1/admin/incoming', { params: { query: inQuery as Record<string, unknown> } });
    return data as unknown as IncomingTxResponse;
  };

  const fetchTransactions = async () => {
    loading.value = true;
    error.value = null;
    try {
      const d = direction.value;
      if (d === 'outgoing') {
        const result = await fetchOutgoing();
        rows.value = result.items.map(normalizeOutgoing);
        totalOut.value = result.total;
        totalIn.value = 0;
      } else if (d === 'incoming') {
        const result = await fetchIncoming();
        rows.value = result.items.map(normalizeIncoming);
        totalOut.value = 0;
        totalIn.value = result.total;
      } else {
        const [outResult, inResult] = await Promise.all([fetchOutgoing(), fetchIncoming()]);
        const combined = [
          ...outResult.items.map(normalizeOutgoing),
          ...inResult.items.map(normalizeIncoming),
        ];
        combined.sort((a, b) => (b.time ?? 0) - (a.time ?? 0));
        rows.value = combined;
        totalOut.value = outResult.total;
        totalIn.value = inResult.total;
      }
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        error.value = getErrorMessage(err.code);
      } else {
        error.value = 'An unexpected error occurred.';
      }
    } finally {
      loading.value = false;
    }
  };

  const fetchWallets = async () => {
    try {
      const { data: result } = await api.GET('/v1/wallets');
      const list = result!.items;
      walletOptions.value = list.map((w) => ({
        value: w.id,
        label: w.name || w.id.slice(0, 8),
      }));
      walletsList.value = list;
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

  const fetchSettings = async () => {
    try {
      const { data: result } = await api.GET('/v1/admin/settings');
      settings.value = result as unknown as SettingsData;
    } catch (err) {
      const e = err instanceof ApiError ? err : new ApiError(0, 'UNKNOWN', 'Unknown error');
      showToast('error', getErrorMessage(e.code));
    } finally {
      settingsLoading.value = false;
    }
  };

  // On mount
  useEffect(() => {
    fetchTransactions();
    fetchWallets();
    fetchDisplayCurrency()
      .then(({ currency, rate }) => {
        displayCurrency.value = currency;
        displayRate.value = rate;
      })
      .catch(() => { /* fallback to USD */ });
    fetchSettings();
  }, []);

  // Re-fetch when filters, search, page, or direction change
  useEffect(() => {
    fetchTransactions();
  }, [filters.value, search.value, page.value, direction.value]);

  // Handle pending navigation from settings search
  useEffect(() => {
    const nav = pendingNavigation.value;
    if (nav && nav.tab) {
      activeTab.value = nav.tab as TabKey;
      pendingNavigation.value = null;
      setTimeout(() => {
        highlightField.value = nav.fieldName;
      }, 100);
    }
  }, [pendingNavigation.value]);

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------

  function handleTabChange(key: string) {
    activeTab.value = key as TabKey;
  }

  function handleFiltersChange(newFilters: Record<string, string>) {
    filters.value = newFilters;
    page.value = 0;
  }

  function handleSearch(query: string) {
    search.value = query;
    page.value = 0;
  }

  function handleDirectionChange(d: Direction) {
    direction.value = d;
    page.value = 0;
    // Reset direction-specific filters
    filters.value = {
      ...filters.value,
      type: '',
      status: '',
      chain: '',
      suspicious: '',
    };
  }

  function handleRowClick(row: UnifiedTxRow) {
    expandedId.value = expandedId.value === row.id ? null : row.id;
  }

  function handlePrev() {
    if (page.value > 0) page.value = page.value - 1;
  }

  function handleNext() {
    const total = totalOut.value + totalIn.value;
    if ((page.value + 1) * PAGE_SIZE < total) page.value = page.value + 1;
  }

  async function handleCancelTx(txId: string) {
    if (!window.confirm('Are you sure you want to cancel this transaction?')) return;
    try {
      await api.POST('/v1/admin/transactions/{id}/cancel', { params: { path: { id: txId } } });
      showToast('success', 'Transaction cancelled');
      await fetchTransactions();
    } catch (err) {
      const e = err instanceof ApiError ? err : new ApiError(0, 'UNKNOWN', 'Unknown error');
      showToast('error', getErrorMessage(e.code));
    }
  }

  async function handleRejectTx(txId: string) {
    if (!window.confirm('Are you sure you want to reject this transaction?')) return;
    try {
      await api.POST('/v1/admin/transactions/{id}/reject', { params: { path: { id: txId } } });
      showToast('success', 'Transaction rejected');
      await fetchTransactions();
    } catch (err) {
      const e = err instanceof ApiError ? err : new ApiError(0, 'UNKNOWN', 'Unknown error');
      showToast('error', getErrorMessage(e.code));
    }
  }

  async function handleToggleMonitor(walletId: string) {
    const currentVal = walletMonitorState.value[walletId] ?? false;
    togglingWallet.value = walletId;
    try {
      const { data: result } = await api.PATCH('/v1/wallets/{id}', {
        params: { path: { id: walletId } },
        body: { monitorIncoming: !currentVal },
      });
      walletMonitorState.value = {
        ...walletMonitorState.value,
        [walletId]: result!.monitorIncoming,
      };
    } catch (err) {
      const e = err instanceof ApiError ? err : new ApiError(0, 'UNKNOWN', 'Unknown error');
      showToast('error', getErrorMessage(e.code));
    } finally {
      togglingWallet.value = null;
    }
  }

  // ---------------------------------------------------------------------------
  // Render: All Transactions Tab
  // ---------------------------------------------------------------------------

  function renderTransactionsTab() {
    const total = totalOut.value + totalIn.value;
    const offset = page.value * PAGE_SIZE;
    const showFrom = total > 0 ? offset + 1 : 0;
    const showTo = Math.min(offset + PAGE_SIZE, total);
    const hasPrev = page.value > 0;
    const hasNext = (page.value + 1) * PAGE_SIZE < total;

    return (
      <>
        {error.value && (
          <div class="dashboard-error">
            <span>{error.value}</span>
            <Button variant="secondary" size="sm" onClick={fetchTransactions}>
              Retry
            </Button>
          </div>
        )}

        {/* Direction selector */}
        <div class="filter-bar" style={{ marginBottom: 0 }}>
          <div class="filter-field">
            <label>Direction</label>
            <select
              value={direction.value}
              onChange={(e) => handleDirectionChange((e.target as HTMLSelectElement).value as Direction)}
            >
              {DIRECTION_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
        </div>

        <FilterBar
          fields={getFilterFields()}
          values={filters.value}
          onChange={handleFiltersChange}
        />

        {direction.value !== 'incoming' && (
          <SearchInput
            value={search.value}
            onSearch={handleSearch}
            placeholder="Search by txHash or recipient address..."
          />
        )}

        <div class="table-container">
          <table>
            <thead>
              <tr>
                {COLUMNS.map((col) => (
                  <th key={col}>{col}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading.value && rows.value.length === 0 ? (
                <tr>
                  <td colSpan={COLUMNS.length} class="table-loading">
                    Loading...
                  </td>
                </tr>
              ) : rows.value.length === 0 ? (
                <tr>
                  <td colSpan={COLUMNS.length} class="table-empty">
                    No transactions found
                  </td>
                </tr>
              ) : (
                rows.value.map((row) => (
                  <>
                    <tr
                      key={row.id}
                      class={`clickable${expandedId.value === row.id ? ' row-expanded' : ''}`}
                      style={{ cursor: 'pointer' }}
                      onClick={() => handleRowClick(row)}
                    >
                      <td>{row.time ? formatDate(row.time) : '\u2014'}</td>
                      <td>
                        <Badge variant={row.direction === 'outgoing' ? 'info' : 'success'}>
                          {row.direction === 'outgoing' ? 'Outgoing' : 'Incoming'}
                        </Badge>
                      </td>
                      <td>{row.walletName ?? row.walletId.slice(0, 8)}</td>
                      <td>
                        {row.contractName ? (
                          <span>
                            <strong>{row.contractName}</strong>
                            {row.counterparty ? <span style={{ marginLeft: '4px', fontSize: '0.8em', color: 'var(--color-text-secondary)' }}>({formatAddress(row.counterparty)})</span> : null}
                          </span>
                        ) : row.counterparty ? formatAddress(row.counterparty) : '\u2014'}
                      </td>
                      <td>
                        {row.amount
                          ? (() => {
                              const displayAmount = row.formattedAmount ?? row.amount;
                              if (row.amountUsd != null) {
                                const display = formatWithDisplay(
                                  row.amountUsd,
                                  displayCurrency.value,
                                  displayRate.value,
                                );
                                return display ? `${displayAmount} (${display})` : displayAmount;
                              }
                              return displayAmount;
                            })()
                          : '\u2014'}
                      </td>
                      <td>{row.network}</td>
                      <td>
                        <Badge variant={statusVariant(row.status)}>{row.status}</Badge>
                      </td>
                      <td>
                        <ExplorerLink network={row.network} txHash={row.txHash} />
                      </td>
                    </tr>
                    {expandedId.value === row.id && (
                      <tr key={`${row.id}-expand`} class="row-expand">
                        <td colSpan={COLUMNS.length}>
                          {row.outgoing ? renderOutgoingDetail(row.outgoing) : null}
                          {row.incoming ? renderIncomingDetail(row.incoming) : null}
                        </td>
                      </tr>
                    )}
                  </>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div class="pagination">
          <span class="pagination-info">
            Showing {showFrom}-{showTo} of {total}
          </span>
          <div class="pagination-buttons">
            <Button variant="secondary" size="sm" disabled={!hasPrev} onClick={handlePrev}>
              Previous
            </Button>
            <Button variant="secondary" size="sm" disabled={!hasNext} onClick={handleNext}>
              Next
            </Button>
          </div>
        </div>
      </>
    );
  }

  function renderOutgoingDetail(tx: TransactionItem) {
    return (
      <div class="detail-grid">
        <div class="detail-item"><span class="detail-label">ID</span><span class="detail-value">{tx.id}</span></div>
        <div class="detail-item"><span class="detail-label">Wallet ID</span><span class="detail-value">{tx.walletId}</span></div>
        <div class="detail-item"><span class="detail-label">Wallet Name</span><span class="detail-value">{tx.walletName ?? '\u2014'}</span></div>
        <div class="detail-item"><span class="detail-label">Type</span><span class="detail-value">{TYPE_LABELS[tx.type] ?? tx.type}</span></div>
        <div class="detail-item"><span class="detail-label">Status</span><span class="detail-value">{tx.status}</span></div>
        <div class="detail-item"><span class="detail-label">Tier</span><span class="detail-value">{tx.tier ?? '\u2014'}</span></div>
        <div class="detail-item"><span class="detail-label">To Address</span><span class="detail-value">{tx.toAddress ?? '\u2014'}</span></div>
        {tx.contractName && (
          <div class="detail-item"><span class="detail-label">Contract Name</span><span class="detail-value">{tx.contractName}</span></div>
        )}
        <div class="detail-item"><span class="detail-label">Amount</span><span class="detail-value">{tx.amount ?? '\u2014'}</span></div>
        <div class="detail-item"><span class="detail-label">Amount USD</span><span class="detail-value">{tx.amountUsd != null ? `$${tx.amountUsd.toFixed(2)}` : '\u2014'}</span></div>
        <div class="detail-item"><span class="detail-label">Network</span><span class="detail-value">{tx.network ?? '\u2014'}</span></div>
        <div class="detail-item"><span class="detail-label">Chain</span><span class="detail-value">{tx.chain}</span></div>
        <div class="detail-item"><span class="detail-label">Tx Hash</span><span class="detail-value">{tx.txHash ?? '\u2014'}</span></div>
        <div class="detail-item"><span class="detail-label">Created At</span><span class="detail-value">{tx.createdAt ? formatDate(tx.createdAt) : '\u2014'}</span></div>
        {tx.status === 'QUEUED' && (
          <div class="detail-item" style={{ gridColumn: '1 / -1', marginTop: 'var(--space-2)' }}>
            <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
              <Button
                variant="danger"
                size="sm"
                onClick={(e: Event) => { e.stopPropagation(); handleCancelTx(tx.id); }}
              >
                Cancel
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={(e: Event) => { e.stopPropagation(); handleRejectTx(tx.id); }}
              >
                Reject
              </Button>
            </div>
          </div>
        )}
      </div>
    );
  }

  function renderIncomingDetail(tx: IncomingTxItem) {
    return (
      <div class="detail-grid">
        <div class="detail-item"><span class="detail-label">ID</span><span class="detail-value">{tx.id}</span></div>
        <div class="detail-item"><span class="detail-label">Tx Hash</span><span class="detail-value">{tx.txHash}</span></div>
        <div class="detail-item"><span class="detail-label">Wallet ID</span><span class="detail-value">{tx.walletId}</span></div>
        <div class="detail-item"><span class="detail-label">Wallet Name</span><span class="detail-value">{tx.walletName ?? '\u2014'}</span></div>
        <div class="detail-item"><span class="detail-label">From Address</span><span class="detail-value">{tx.fromAddress}</span></div>
        <div class="detail-item"><span class="detail-label">Amount</span><span class="detail-value">{tx.amount}</span></div>
        <div class="detail-item"><span class="detail-label">Token Address</span><span class="detail-value">{tx.tokenAddress ?? '\u2014'}</span></div>
        <div class="detail-item"><span class="detail-label">Chain</span><span class="detail-value">{tx.chain}</span></div>
        <div class="detail-item"><span class="detail-label">Network</span><span class="detail-value">{tx.network}</span></div>
        <div class="detail-item"><span class="detail-label">Status</span><span class="detail-value">{tx.status}</span></div>
        <div class="detail-item"><span class="detail-label">Block Number</span><span class="detail-value">{tx.blockNumber ?? '\u2014'}</span></div>
        <div class="detail-item"><span class="detail-label">Detected At</span><span class="detail-value">{tx.detectedAt ? formatDate(tx.detectedAt) : '\u2014'}</span></div>
        <div class="detail-item"><span class="detail-label">Confirmed At</span><span class="detail-value">{tx.confirmedAt ? formatDate(tx.confirmedAt) : '\u2014'}</span></div>
        <div class="detail-item"><span class="detail-label">Suspicious</span><span class="detail-value">{tx.suspicious ? 'Yes' : 'No'}</span></div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Render: Monitor Settings Tab
  // ---------------------------------------------------------------------------

  function renderMonitorTab() {
    const dirtyCount = Object.keys(dirty.value).filter((k) => k.startsWith('incoming.')).length;

    return (
      <>
        {/* Save bar */}
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

        {/* Settings Panel */}
        <div class="settings-category">
          <div class="settings-category-header">
            <h3>Incoming TX Monitoring Settings</h3>
            <p class="settings-description">
              Monitor incoming transactions to wallets. Detects native and token transfers,
              flags suspicious activity (dust attacks, large amounts, unknown tokens).
            </p>
          </div>
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
        </div>

        {/* Per-Wallet Monitoring Toggles */}
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
                          <Badge variant={(w.status ?? 'ACTIVE') === 'ACTIVE' ? 'success' : 'warning'}>
                            {w.status ?? 'ACTIVE'}
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
      </>
    );
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  const tabLabel = TABS.find((t) => t.key === activeTab.value)?.label;

  return (
    <div class="page">
      <Breadcrumb
        pageName="Transactions"
        tabName={tabLabel}
        onPageClick={() => { activeTab.value = 'transactions'; }}
      />
      <TabNav tabs={TABS} activeTab={activeTab.value} onTabChange={handleTabChange} />
      <div style={{ marginTop: 'var(--space-4)' }}>
        {activeTab.value === 'transactions' ? renderTransactionsTab() : renderMonitorTab()}
      </div>
    </div>
  );
}
