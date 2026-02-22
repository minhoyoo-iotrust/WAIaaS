import { useSignal } from '@preact/signals';
import { useEffect } from 'preact/hooks';
import { apiGet, ApiError } from '../api/client';
import { API } from '../api/endpoints';
import { formatDate, formatAddress } from '../utils/format';
import { fetchDisplayCurrency, formatWithDisplay } from '../utils/display-currency';
import { Badge, Button } from '../components/form';
import { FilterBar } from '../components/filter-bar';
import type { FilterField } from '../components/filter-bar';
import { SearchInput } from '../components/search-input';
import { ExplorerLink } from '../components/explorer-link';
import { getErrorMessage } from '../utils/error-messages';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TransactionItem {
  id: string;
  walletId: string;
  walletName: string | null;
  type: string;
  status: string;
  tier: string | null;
  toAddress: string | null;
  amount: string | null;
  amountUsd: number | null;
  network: string | null;
  txHash: string | null;
  chain: string;
  createdAt: number | null;
}

interface TransactionsResponse {
  items: TransactionItem[];
  total: number;
  offset: number;
  limit: number;
}

interface WalletListItem {
  id: string;
  name: string;
  chain: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PAGE_SIZE = 20;

const TYPE_OPTIONS = [
  { value: 'TRANSFER', label: 'TRANSFER' },
  { value: 'TOKEN_TRANSFER', label: 'TOKEN_TRANSFER' },
  { value: 'CONTRACT_CALL', label: 'CONTRACT_CALL' },
  { value: 'APPROVE', label: 'APPROVE' },
  { value: 'BATCH', label: 'BATCH' },
];

const STATUS_OPTIONS = [
  { value: 'PENDING', label: 'PENDING' },
  { value: 'APPROVED', label: 'APPROVED' },
  { value: 'SUBMITTED', label: 'SUBMITTED' },
  { value: 'CONFIRMED', label: 'CONFIRMED' },
  { value: 'FAILED', label: 'FAILED' },
];

const NETWORK_OPTIONS = [
  { value: 'mainnet', label: 'mainnet' },
  { value: 'devnet', label: 'devnet' },
  { value: 'testnet', label: 'testnet' },
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
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function statusVariant(status: string): 'success' | 'danger' | 'warning' {
  if (status === 'CONFIRMED') return 'success';
  if (status === 'FAILED') return 'danger';
  return 'warning';
}

// Column headers for the custom table
const COLUMNS = ['Time', 'Wallet', 'Type', 'To', 'Amount', 'Network', 'Status', 'Tx Hash'];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function TransactionsPage() {
  const items = useSignal<TransactionItem[]>([]);
  const total = useSignal(0);
  const loading = useSignal(true);
  const error = useSignal<string | null>(null);

  const filters = useSignal<Record<string, string>>({
    wallet_id: '',
    type: '',
    status: '',
    network: '',
    since: '',
    until: '',
  });
  const search = useSignal('');
  const page = useSignal(0);
  const expandedId = useSignal<string | null>(null);

  const displayCurrency = useSignal<string>('USD');
  const displayRate = useSignal<number | null>(1);

  const walletOptions = useSignal<Array<{ value: string; label: string }>>([]);

  // Build filter fields (wallet options populated dynamically)
  function getFilterFields(): FilterField[] {
    return [
      { key: 'wallet_id', label: 'Wallet', type: 'select', options: walletOptions.value },
      { key: 'type', label: 'Type', type: 'select', options: TYPE_OPTIONS },
      { key: 'status', label: 'Status', type: 'select', options: STATUS_OPTIONS },
      { key: 'network', label: 'Network', type: 'select', options: NETWORK_OPTIONS },
      { key: 'since', label: 'Since', type: 'date' },
      { key: 'until', label: 'Until', type: 'date' },
    ];
  }

  // Fetch transactions from admin API
  const fetchTransactions = async () => {
    loading.value = true;
    error.value = null;
    try {
      const params = new URLSearchParams();
      const f = filters.value;
      if (f.wallet_id) params.set('wallet_id', f.wallet_id);
      if (f.type) params.set('type', f.type);
      if (f.status) params.set('status', f.status);
      if (f.network) params.set('network', f.network);
      if (f.since) params.set('since', f.since);
      if (f.until) params.set('until', f.until);
      if (search.value) params.set('search', search.value);
      params.set('offset', String(page.value * PAGE_SIZE));
      params.set('limit', String(PAGE_SIZE));

      const qs = params.toString();
      const result = await apiGet<TransactionsResponse>(
        `${API.ADMIN_TRANSACTIONS}?${qs}`,
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
      loading.value = false;
    }
  };

  // Fetch wallet list for filter dropdown
  const fetchWallets = async () => {
    try {
      const wallets = await apiGet<WalletListItem[]>(API.WALLETS);
      walletOptions.value = wallets.map((w) => ({
        value: w.id,
        label: w.name || w.id.slice(0, 8),
      }));
    } catch {
      // Wallet list fetch failure is non-critical
    }
  };

  // On mount: fetch data + wallets + display currency
  useEffect(() => {
    fetchTransactions();
    fetchWallets();
    fetchDisplayCurrency()
      .then(({ currency, rate }) => {
        displayCurrency.value = currency;
        displayRate.value = rate;
      })
      .catch(() => { /* fallback to USD */ });
  }, []);

  // Re-fetch when filters, search, or page change
  useEffect(() => {
    fetchTransactions();
  }, [filters.value, search.value, page.value]);

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------

  function handleFiltersChange(newFilters: Record<string, string>) {
    filters.value = newFilters;
    page.value = 0;
  }

  function handleSearch(query: string) {
    search.value = query;
    page.value = 0;
  }

  function handleRowClick(tx: TransactionItem) {
    expandedId.value = expandedId.value === tx.id ? null : tx.id;
  }

  function handlePrev() {
    if (page.value > 0) {
      page.value = page.value - 1;
    }
  }

  function handleNext() {
    if ((page.value + 1) * PAGE_SIZE < total.value) {
      page.value = page.value + 1;
    }
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  const offset = page.value * PAGE_SIZE;
  const showFrom = total.value > 0 ? offset + 1 : 0;
  const showTo = Math.min(offset + PAGE_SIZE, total.value);
  const hasPrev = page.value > 0;
  const hasNext = (page.value + 1) * PAGE_SIZE < total.value;

  return (
    <div class="page">
      {error.value && (
        <div class="dashboard-error">
          <span>{error.value}</span>
          <Button variant="secondary" size="sm" onClick={fetchTransactions}>
            Retry
          </Button>
        </div>
      )}

      <FilterBar
        fields={getFilterFields()}
        values={filters.value}
        onChange={handleFiltersChange}
      />

      <div style={{ marginTop: 'var(--space-3)' }}>
        <SearchInput
          value={search.value}
          onSearch={handleSearch}
          placeholder="Search by txHash or recipient address..."
        />
      </div>

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
            {loading.value && items.value.length === 0 ? (
              <tr>
                <td colSpan={COLUMNS.length} class="table-loading">
                  Loading...
                </td>
              </tr>
            ) : items.value.length === 0 ? (
              <tr>
                <td colSpan={COLUMNS.length} class="table-empty">
                  No transactions found
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
                    <td>{tx.createdAt ? formatDate(tx.createdAt) : '\u2014'}</td>
                    <td>{tx.walletName ?? tx.walletId.slice(0, 8)}</td>
                    <td>
                      <Badge variant="info">{tx.type}</Badge>
                    </td>
                    <td>{tx.toAddress ? formatAddress(tx.toAddress) : '\u2014'}</td>
                    <td>
                      {tx.amount
                        ? (() => {
                            const display = formatWithDisplay(
                              tx.amountUsd,
                              displayCurrency.value,
                              displayRate.value,
                            );
                            return display ? `${tx.amount} (${display})` : tx.amount;
                          })()
                        : '\u2014'}
                    </td>
                    <td>{tx.network ?? tx.chain}</td>
                    <td>
                      <Badge variant={statusVariant(tx.status)}>{tx.status}</Badge>
                    </td>
                    <td>
                      <ExplorerLink
                        network={tx.network ?? ''}
                        txHash={tx.txHash}
                      />
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
                            <span class="detail-label">Wallet ID</span>
                            <span class="detail-value">{tx.walletId}</span>
                          </div>
                          <div class="detail-item">
                            <span class="detail-label">Wallet Name</span>
                            <span class="detail-value">{tx.walletName ?? '\u2014'}</span>
                          </div>
                          <div class="detail-item">
                            <span class="detail-label">Type</span>
                            <span class="detail-value">{tx.type}</span>
                          </div>
                          <div class="detail-item">
                            <span class="detail-label">Status</span>
                            <span class="detail-value">{tx.status}</span>
                          </div>
                          <div class="detail-item">
                            <span class="detail-label">Tier</span>
                            <span class="detail-value">{tx.tier ?? '\u2014'}</span>
                          </div>
                          <div class="detail-item">
                            <span class="detail-label">To Address</span>
                            <span class="detail-value">{tx.toAddress ?? '\u2014'}</span>
                          </div>
                          <div class="detail-item">
                            <span class="detail-label">Amount</span>
                            <span class="detail-value">{tx.amount ?? '\u2014'}</span>
                          </div>
                          <div class="detail-item">
                            <span class="detail-label">Amount USD</span>
                            <span class="detail-value">
                              {tx.amountUsd != null ? `$${tx.amountUsd.toFixed(2)}` : '\u2014'}
                            </span>
                          </div>
                          <div class="detail-item">
                            <span class="detail-label">Network</span>
                            <span class="detail-value">{tx.network ?? '\u2014'}</span>
                          </div>
                          <div class="detail-item">
                            <span class="detail-label">Chain</span>
                            <span class="detail-value">{tx.chain}</span>
                          </div>
                          <div class="detail-item">
                            <span class="detail-label">Tx Hash</span>
                            <span class="detail-value">{tx.txHash ?? '\u2014'}</span>
                          </div>
                          <div class="detail-item">
                            <span class="detail-label">Created At</span>
                            <span class="detail-value">
                              {tx.createdAt ? formatDate(tx.createdAt) : '\u2014'}
                            </span>
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
  );
}
