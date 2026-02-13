import { useSignal } from '@preact/signals';
import { useEffect } from 'preact/hooks';
import { apiGet, ApiError } from '../api/client';
import { API } from '../api/endpoints';
import { formatUptime } from '../utils/format';
import { Badge, Button } from '../components/form';
import { getErrorMessage } from '../utils/error-messages';

interface AdminStatus {
  status: string;
  version: string;
  uptime: number;
  walletCount: number;
  activeSessionCount: number;
  killSwitchState: string;
  adminTimeout: number;
  timestamp: number;
}

function StatCard({ label, value, loading, badge }: {
  label: string; value: string; loading?: boolean; badge?: 'success' | 'danger';
}) {
  return (
    <div class="stat-card">
      <div class="stat-label">{label}</div>
      {loading ? (
        <div class="stat-skeleton" />
      ) : badge ? (
        <Badge variant={badge}>{value}</Badge>
      ) : (
        <div class="stat-value">{value}</div>
      )}
    </div>
  );
}

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
        <StatCard label="Wallets" value={data.value?.walletCount?.toString() ?? '\u2014'} loading={isInitialLoad} />
        <StatCard label="Active Sessions" value={data.value?.activeSessionCount?.toString() ?? '\u2014'} loading={isInitialLoad} />
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
    </div>
  );
}
