import { useSignal } from '@preact/signals';
import { useEffect } from 'preact/hooks';
import { apiGet, ApiError } from '../api/client';
import { API } from '../api/endpoints';
import { formatUptime, formatDate } from '../utils/format';
import { Badge, Button } from '../components/form';
import { Table } from '../components/table';
import type { Column } from '../components/table';
import { getErrorMessage } from '../utils/error-messages';

interface RecentTransaction {
  id: string;
  walletId: string;
  walletName: string | null;
  type: string;
  status: string;
  toAddress: string | null;
  amount: string | null;
  network: string | null;
  createdAt: number | null;
}

interface AdminStatus {
  status: string;
  version: string;
  uptime: number;
  walletCount: number;
  activeSessionCount: number;
  killSwitchState: string;
  adminTimeout: number;
  timestamp: number;
  policyCount: number;
  recentTxCount: number;
  failedTxCount: number;
  recentTransactions: RecentTransaction[];
}

function StatCard({ label, value, loading, badge, href }: {
  label: string; value: string; loading?: boolean; badge?: 'success' | 'danger'; href?: string;
}) {
  const content = (
    <>
      <div class="stat-label">
        {label}
        {href && <span class="stat-link-arrow">{' \u2192'}</span>}
      </div>
      {loading ? (
        <div class="stat-skeleton" />
      ) : badge ? (
        <Badge variant={badge}>{value}</Badge>
      ) : (
        <div class="stat-value">{value}</div>
      )}
    </>
  );

  if (href) {
    return (
      <a
        href={href}
        class="stat-card stat-card-link"
        style={{ textDecoration: 'none', color: 'inherit', cursor: 'pointer' }}
      >
        {content}
      </a>
    );
  }

  return <div class="stat-card">{content}</div>;
}

const txColumns: Column<RecentTransaction>[] = [
  {
    key: 'createdAt',
    header: 'Time',
    render: (tx) => tx.createdAt ? formatDate(tx.createdAt) : '\u2014',
  },
  {
    key: 'walletName',
    header: 'Wallet',
    render: (tx) => tx.walletName ?? tx.walletId.slice(0, 8),
  },
  {
    key: 'type',
    header: 'Type',
  },
  {
    key: 'amount',
    header: 'Amount',
    render: (tx) => tx.amount ?? '\u2014',
  },
  {
    key: 'status',
    header: 'Status',
    render: (tx) => {
      const variant: 'success' | 'danger' | 'warning' =
        tx.status === 'CONFIRMED'
          ? 'success'
          : tx.status === 'FAILED'
            ? 'danger'
            : 'warning';
      return <Badge variant={variant}>{tx.status}</Badge>;
    },
  },
];

export default function DashboardPage() {
  const data = useSignal<AdminStatus | null>(null);
  const loading = useSignal(true);
  const error = useSignal<string | null>(null);

  const fetchStatus = async () => {
    loading.value = true;
    error.value = null;
    try {
      const result = await apiGet<AdminStatus>(API.ADMIN_STATUS);
      data.value = result;
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

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 30_000);
    return () => clearInterval(interval);
  }, []);

  const isInitialLoad = loading.value && !data.value;

  return (
    <div class="page">
      {error.value && (
        <div class="dashboard-error">
          <span>{error.value}</span>
          <Button variant="secondary" size="sm" onClick={fetchStatus}>Retry</Button>
        </div>
      )}
      <div class="stat-grid">
        <StatCard label="Version" value={data.value?.version ?? '\u2014'} loading={isInitialLoad} />
        <StatCard label="Uptime" value={data.value ? formatUptime(data.value.uptime) : '\u2014'} loading={isInitialLoad} />
        <StatCard label="Wallets" value={data.value?.walletCount?.toString() ?? '\u2014'} loading={isInitialLoad} href="#/wallets" />
        <StatCard label="Active Sessions" value={data.value?.activeSessionCount?.toString() ?? '\u2014'} loading={isInitialLoad} href="#/sessions" />
      </div>
      <div class="stat-grid" style={{ marginTop: 'var(--space-4)' }}>
        <StatCard
          label="Kill Switch"
          value={data.value?.killSwitchState === 'ACTIVATED' ? 'ACTIVATED' : 'NORMAL'}
          loading={isInitialLoad}
          badge={data.value ? (data.value.killSwitchState === 'ACTIVATED' ? 'danger' : 'success') : undefined}
        />
        <StatCard label="Status" value={data.value?.status ?? '\u2014'} loading={isInitialLoad} />
      </div>
      <div class="stat-grid" style={{ marginTop: 'var(--space-4)' }}>
        <StatCard
          label="Policies"
          value={data.value?.policyCount?.toString() ?? '\u2014'}
          loading={isInitialLoad}
          href="#/policies"
        />
        <StatCard
          label="Recent Txns (24h)"
          value={data.value?.recentTxCount?.toString() ?? '\u2014'}
          loading={isInitialLoad}
        />
        <StatCard
          label="Failed Txns (24h)"
          value={data.value?.failedTxCount?.toString() ?? '\u2014'}
          loading={isInitialLoad}
          badge={data.value ? (data.value.failedTxCount === 0 ? 'success' : 'danger') : undefined}
        />
      </div>

      <div style={{ marginTop: 'var(--space-6)' }}>
        <h3 style={{ marginBottom: 'var(--space-3)' }}>Recent Activity</h3>
        <Table
          columns={txColumns}
          data={data.value?.recentTransactions ?? []}
          loading={isInitialLoad}
          emptyMessage="No recent transactions"
        />
      </div>
    </div>
  );
}
