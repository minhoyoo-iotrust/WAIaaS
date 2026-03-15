import { useSignal } from '@preact/signals';
import { useEffect } from 'preact/hooks';
import { api, ApiError } from '../api/typed-client';
import type { paths, components } from '../api/types.generated';
import { formatUptime, formatDate } from '../utils/format';
import { fetchDisplayCurrency, formatWithDisplay } from '../utils/display-currency';
import { Badge, Button } from '../components/form';
import { Table } from '../components/table';
import type { Column } from '../components/table';
import { getErrorMessage } from '../utils/error-messages';
import { showToast } from '../components/toast';
import { ExplorerLink } from '../components/explorer-link';
import { DASHBOARD_POLL_INTERVAL_MS } from '../constants';

// Generated type aliases (replacing manual interfaces)
type AdminStatus = components['schemas']['AdminStatusResponse'];
type RecentTransaction = AdminStatus['recentTransactions'][number];
type AgentPromptResult = components['schemas']['AgentPromptResponse'];
type DefiPositionSummary = paths['/v1/admin/defi/positions']['get']['responses']['200']['content']['application/json'];

// AdminStats: generated type is `unknown` (no named schema), keep manual interface
interface AdminStats {
  transactions: {
    total: number;
    byStatus: Record<string, number>;
    byType: Record<string, number>;
    last24h: { count: number; totalUsd: number | null };
    last7d: { count: number; totalUsd: number | null };
  };
  sessions: { active: number; total: number; revokedLast24h: number };
  wallets: { total: number; byStatus: Record<string, number>; withOwner: number };
  rpc: {
    totalCalls: number;
    totalErrors: number;
    avgLatencyMs: number;
    byNetwork: Array<{ network: string; calls: number; errors: number; avgLatencyMs: number }>;
  };
  autostop: {
    enabled: boolean;
    triggeredTotal: number;
    rules: Array<{ id: string; displayName: string; enabled: boolean; trackedCount: number }>;
    lastTriggeredAt: number | null;
  };
  notifications: { sentLast24h: number; failedLast24h: number; channelStatus: Record<string, unknown> };
  system: {
    uptimeSeconds: number;
    version: string;
    schemaVersion: number;
    dbSizeBytes: number;
    nodeVersion: string;
    platform: string;
    timestamp: number;
  };
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const k = 1024;
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(k)), units.length - 1);
  const value = bytes / Math.pow(k, i);
  return `${value.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

const DEFI_CATEGORIES = ['ALL', 'STAKING', 'LENDING', 'YIELD', 'PERP'] as const;

function StatCard({ label, value, loading, badge, href }: {
  label: string; value: string; loading?: boolean; badge?: 'success' | 'danger' | 'warning'; href?: string;
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

function buildTxColumns(
  displayCurrency: string,
  displayRate: number | null,
): Column<RecentTransaction>[] {
  return [
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
      render: (tx) => {
        if (!tx.amount) return '\u2014';
        const amountText = tx.formattedAmount ?? tx.amount;
        const display = formatWithDisplay(tx.amountUsd, displayCurrency, displayRate);
        return display ? `${amountText} (${display})` : amountText;
      },
    },
    {
      key: 'network',
      header: 'Network',
      render: (tx) => tx.network ?? '\u2014',
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
    {
      key: 'txHash',
      header: 'Tx Hash',
      render: (tx) => (
        <ExplorerLink network={tx.network ?? ''} txHash={tx.txHash} />
      ),
    },
  ];
}

type DefiPosition = DefiPositionSummary['positions'][number];

function meta(p: { metadata?: unknown }): Record<string, unknown> {
  return p.metadata && typeof p.metadata === 'object' ? (p.metadata as Record<string, unknown>) : {};
}

const PROVIDER_LABELS: Record<string, string> = {
  'lido': 'Lido', 'jito': 'Jito', 'aave-v3': 'Aave V3', 'aave_v3': 'Aave V3',
  'pendle': 'Pendle', 'hyperliquid-perp': 'Hyperliquid Perp',
  'hyperliquid-spot': 'Hyperliquid Spot', 'kamino': 'Kamino', 'drift': 'Drift',
};

function providerLabel(key: string): string {
  return PROVIDER_LABELS[key] ?? key;
}

function groupByProvider(positions: DefiPosition[]): Map<string, DefiPosition[]> {
  const groups = new Map<string, DefiPosition[]>();
  for (const p of positions) {
    const key = p.provider;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(p);
  }
  return groups;
}

function buildDefiBaseColumns(
  displayCurrency: string,
  displayRate: number | null,
  showCategory: boolean,
): Column<DefiPosition>[] {
  const cols: Column<DefiPosition>[] = [];
  if (showCategory) {
    cols.push({ key: 'category', header: 'Category', render: (p) => <Badge variant="info">{p.category}</Badge> });
  }
  cols.push(
    { key: 'chain', header: 'Chain', render: (p) => <Badge variant="info">{p.chain}</Badge> },
    { key: 'amount', header: 'Amount' },
    {
      key: 'amountUsd',
      header: 'USD Value',
      render: (p) => {
        if (p.amountUsd === null) return '\u2014';
        const display = formatWithDisplay(p.amountUsd, displayCurrency, displayRate);
        return display ?? `$${p.amountUsd.toFixed(2)}`;
      },
    },
  );
  return cols;
}

function buildCategoryColumns(category: string): Column<DefiPosition>[] {
  switch (category) {
    case 'STAKING':
      return [
        { key: 'provider', header: 'Protocol', render: (p) => String(meta(p).protocol ?? p.provider) },
        { key: 'metadata', header: 'Exchange Rate', render: (p) => {
          const rate = meta(p).exchangeRate;
          return typeof rate === 'number' ? rate.toFixed(4) : '\u2014';
        }},
      ];
    case 'LENDING':
      return [
        { key: 'metadata', header: 'Type', render: (p) => {
          const posType = String(meta(p).positionType ?? '');
          return posType ? <Badge variant={posType === 'SUPPLY' ? 'success' : 'warning'}>{posType}</Badge> : '\u2014';
        }},
        { key: 'provider', header: 'Health Factor', render: (p) => {
          const hf = meta(p).healthFactor;
          if (typeof hf !== 'number') return '\u2014';
          const variant = hf < 1.2 ? 'danger' : hf < 1.5 ? 'warning' : 'success';
          return <Badge variant={variant}>{hf.toFixed(2)}</Badge>;
        }},
        { key: 'status', header: 'APY', render: (p) => {
          const apy = meta(p).apy;
          return typeof apy === 'number' ? `${(apy * 100).toFixed(2)}%` : '\u2014';
        }},
      ];
    case 'YIELD':
      return [
        { key: 'metadata', header: 'Token', render: (p) => {
          const tokenType = String(meta(p).tokenType ?? '');
          return tokenType ? <Badge variant={tokenType === 'PT' ? 'info' : 'warning'}>{tokenType}</Badge> : '\u2014';
        }},
        { key: 'provider', header: 'Maturity', render: (p) => {
          const maturity = meta(p).maturity;
          if (typeof maturity !== 'number') return '\u2014';
          const isPast = maturity * 1000 < Date.now();
          const dateStr = new Date(maturity * 1000).toLocaleDateString();
          return isPast ? <Badge variant="danger">MATURED ({dateStr})</Badge> : dateStr;
        }},
        { key: 'status', header: 'Implied APY', render: (p) => {
          const apy = meta(p).impliedApy;
          return typeof apy === 'number' ? `${(apy * 100).toFixed(2)}%` : '\u2014';
        }},
      ];
    case 'PERP':
      return [
        { key: 'metadata', header: 'Market', render: (p) => String(meta(p).market ?? '\u2014') },
        { key: 'provider', header: 'Side', render: (p) => {
          const side = String(meta(p).side ?? '');
          return side ? <Badge variant={side === 'LONG' ? 'success' : 'danger'}>{side}</Badge> : '\u2014';
        }},
        { key: 'status', header: 'PnL', render: (p) => {
          const pnl = meta(p).unrealizedPnl;
          if (pnl == null) return '\u2014';
          const num = Number(pnl);
          if (isNaN(num)) return String(pnl);
          const cls = num >= 0 ? 'pnl-positive' : 'pnl-negative';
          return <span class={cls}>{num >= 0 ? '+' : ''}{num.toFixed(2)}</span>;
        }},
        { key: 'walletId', header: 'Liq. Price', render: (p) => String(meta(p).liquidationPrice ?? '\u2014') },
      ];
    default:
      return [
        { key: 'provider', header: 'Provider' },
      ];
  }
}

async function copyToClipboard(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.left = '-9999px';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
  }
}

export default function DashboardPage() {
  const data = useSignal<AdminStatus | null>(null);
  const loading = useSignal(true);
  const error = useSignal<string | null>(null);
  const displayCurrency = useSignal<string>('USD');
  const displayRate = useSignal<number | null>(1);
  const promptLoading = useSignal(false);
  const promptText = useSignal<string | null>(null);
  const approvalCount = useSignal<number | null>(null);
  const defiData = useSignal<DefiPositionSummary | null>(null);
  const defiLoading = useSignal(true);
  const categoryFilter = useSignal<string>('ALL');
  const walletFilter = useSignal<string>('');
  const walletList = useSignal<Array<{ id: string; name: string }>>([]);
  const statsData = useSignal<AdminStats | null>(null);
  const statsLoading = useSignal(true);

  const fetchStats = async () => {
    try {
      // AdminStats response type is `unknown` in generated types, cast to local interface
      const { data: result } = await api.GET('/v1/admin/stats');
      statsData.value = result as AdminStats;
    } catch {
      // Stats not available -- keep null
    } finally {
      statsLoading.value = false;
    }
  };

  const fetchDefi = async () => {
    defiLoading.value = true;
    try {
      const query: { wallet_id?: string; category?: 'STAKING' | 'LENDING' | 'YIELD' | 'PERP' } = {};
      if (walletFilter.value) query.wallet_id = walletFilter.value;
      if (categoryFilter.value !== 'ALL') query.category = categoryFilter.value as 'STAKING' | 'LENDING' | 'YIELD' | 'PERP';
      const { data: result } = await api.GET('/v1/admin/defi/positions', { params: { query } });
      defiData.value = result!;
    } catch {
      // DeFi positions not available or empty -- keep null
    } finally {
      defiLoading.value = false;
    }
  };

  const fetchStatus = async () => {
    loading.value = true;
    error.value = null;
    try {
      const { data: result } = await api.GET('/v1/admin/status');
      data.value = result!;
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

  const handleGeneratePrompt = async () => {
    promptLoading.value = true;
    try {
      const { data: result } = await api.POST('/v1/admin/agent-prompt', { body: {} });
      if (result!.walletCount === 0) {
        showToast('warning', 'No active wallets found');
        return;
      }
      promptText.value = result!.prompt;
      showToast('success', `Prompt generated for ${result!.walletCount} wallet(s)`);
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        showToast('error', getErrorMessage(err.code));
      } else {
        showToast('error', 'Failed to generate agent prompt');
      }
    } finally {
      promptLoading.value = false;
    }
  };

  const handleCopyPrompt = async () => {
    if (!promptText.value) return;
    await copyToClipboard(promptText.value);
    showToast('success', 'Copied to clipboard!');
  };

  useEffect(() => {
    fetchStatus();
    fetchDefi();
    fetchStats();
    fetchDisplayCurrency()
      .then(({ currency, rate }) => {
        displayCurrency.value = currency;
        displayRate.value = rate;
      })
      .catch(() => { /* fallback to USD */ });
    api.GET('/v1/admin/transactions', { params: { query: { status: 'APPROVED', limit: 1 } } })
      .then(({ data: res }) => { approvalCount.value = res!.total; })
      .catch(() => { /* fallback */ });
    api.GET('/v1/wallets')
      .then(({ data: res }) => {
        const items = res!.items;
        walletList.value = items.map((w) => ({
          id: w.id,
          name: w.name ?? w.id.slice(0, 8),
        }));
      })
      .catch(() => { /* wallet list unavailable */ });
    const interval = setInterval(() => { fetchStatus(); fetchDefi(); fetchStats(); }, DASHBOARD_POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, []);

  // Re-fetch defi data when filters change
  useEffect(() => {
    fetchDefi();
  }, [categoryFilter.value, walletFilter.value]);

  const isInitialLoad = loading.value && !data.value;

  return (
    <div class="page">
      {error.value && (
        <div class="dashboard-error">
          <span>{error.value}</span>
          <Button variant="secondary" size="sm" onClick={fetchStatus}>Retry</Button>
        </div>
      )}
      {data.value?.updateAvailable && (
        <div class="update-banner" role="status">
          <span class="update-banner-icon">{'\u2B06'}</span>
          <span>
            <strong>Update available:</strong>{' '}
            {data.value.version} {'\u2192'} {data.value.latestVersion}{' \u2014 '}
            Run <code>waiaas update</code> to update.
          </span>
        </div>
      )}
      {data.value?.autoProvisioned && (
        <div class="auto-provision-banner" role="alert">
          <span class="auto-provision-banner-icon">{'\u26A0'}</span>
          <span>
            <strong>Auto-provision mode active.</strong>{' '}
            Change the master password for security.{' '}
            <a href="#/security?tab=password" class="auto-provision-link">
              Go to Security
            </a>
          </span>
        </div>
      )}
      <div class="stat-grid">
        <StatCard
          label="Version"
          value={data.value?.version ?? '\u2014'}
          loading={isInitialLoad}
          badge={data.value ? (data.value.updateAvailable ? 'warning' : undefined) : undefined}
        />
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
          href="#/transactions"
        />
        <StatCard
          label="Failed Txns (24h)"
          value={data.value?.failedTxCount?.toString() ?? '\u2014'}
          loading={isInitialLoad}
          badge={data.value ? (data.value.failedTxCount === 0 ? 'success' : 'danger') : undefined}
          href="#/transactions?status=FAILED"
        />
        <StatCard
          label="Approval Pending"
          value={approvalCount.value?.toString() ?? '\u2014'}
          loading={isInitialLoad}
          badge={approvalCount.value != null && approvalCount.value > 0 ? 'warning' : undefined}
          href="#/transactions?status=APPROVED"
        />
      </div>

      <div class="prompt-card" style={{ marginTop: 'var(--space-4)' }}>
        <h3 style={{ marginBottom: 'var(--space-2)' }}>Agent Connection Prompt</h3>
        <p class="prompt-card-desc">
          Generate a connection prompt for AI agents. Creates sessions for all active wallets.
        </p>
        {promptText.value ? (
          <>
            <pre class="prompt-preview">{promptText.value}</pre>
            <div style={{ display: 'flex', gap: 'var(--space-2)', marginTop: 'var(--space-3)' }}>
              <Button variant="primary" size="sm" onClick={handleCopyPrompt}>
                Copy to Clipboard
              </Button>
              <Button variant="secondary" size="sm" onClick={handleGeneratePrompt} loading={promptLoading.value}>
                Regenerate
              </Button>
            </div>
          </>
        ) : (
          <Button
            variant="primary"
            size="sm"
            onClick={handleGeneratePrompt}
            loading={promptLoading.value}
            style={{ marginTop: 'var(--space-2)' }}
          >
            Generate
          </Button>
        )}
      </div>

      {/* HF Warning Banner */}
      {defiData.value && defiData.value.worstHealthFactor !== null && defiData.value.worstHealthFactor < 1.5 && (
        <div class="hf-warning-banner" role="alert" style={{ marginTop: 'var(--space-4)' }}>
          <span class="hf-warning-icon">{'\u26A0'}</span>
          <span>
            <strong>Health Factor Warning:</strong>{' '}
            Worst Health Factor is <strong>{defiData.value.worstHealthFactor.toFixed(2)}</strong>
            {defiData.value.worstHealthFactor < 1.2 ? ' \u2014 Liquidation risk is HIGH!' : ' \u2014 Monitor closely.'}
          </span>
        </div>
      )}

      {/* DeFi Positions Section */}
      {defiData.value && defiData.value.activeCount > 0 && (
        <div style={{ marginTop: 'var(--space-4)' }}>
          <h3 style={{ marginBottom: 'var(--space-3)' }}>DeFi Positions</h3>
          <div class="defi-filter-row">
            <div class="defi-category-tabs">
              {DEFI_CATEGORIES.map((cat) => (
                <button
                  key={cat}
                  class={categoryFilter.value === cat ? 'active' : ''}
                  onClick={() => { categoryFilter.value = cat; }}
                >
                  {cat}
                </button>
              ))}
            </div>
            <select
              class="defi-wallet-select"
              value={walletFilter.value}
              onChange={(e) => { walletFilter.value = (e.target as HTMLSelectElement).value; }}
            >
              <option value="">All Wallets</option>
              {walletList.value.map((w) => (
                <option key={w.id} value={w.id}>{w.name}</option>
              ))}
            </select>
          </div>
          <div class="stat-grid">
            <StatCard
              label="Total DeFi Value"
              value={defiData.value.totalValueUsd !== null
                ? (formatWithDisplay(defiData.value.totalValueUsd, displayCurrency.value, displayRate.value) ?? `$${defiData.value.totalValueUsd.toFixed(2)}`)
                : '\u2014'}
              loading={defiLoading.value}
            />
            <StatCard
              label="Health Factor"
              value={defiData.value.worstHealthFactor !== null
                ? defiData.value.worstHealthFactor.toFixed(2)
                : 'N/A'}
              loading={defiLoading.value}
              badge={defiData.value.worstHealthFactor !== null
                ? (defiData.value.worstHealthFactor < 1.2 ? 'danger' : defiData.value.worstHealthFactor < 1.5 ? 'warning' : 'success')
                : undefined}
            />
            <StatCard
              label="Active Positions"
              value={defiData.value.activeCount.toString()}
              loading={defiLoading.value}
            />
          </div>
          <div style={{ marginTop: 'var(--space-3)' }}>
            {Array.from(groupByProvider(defiData.value.positions)).map(([providerKey, positions]) => (
              <div class="defi-provider-group" key={providerKey}>
                <h4 class="defi-provider-header">{providerLabel(providerKey)}</h4>
                <Table
                  columns={[
                    ...buildDefiBaseColumns(displayCurrency.value, displayRate.value, categoryFilter.value === 'ALL'),
                    ...buildCategoryColumns(categoryFilter.value === 'ALL' ? '' : categoryFilter.value),
                  ]}
                  data={positions}
                  emptyMessage="No positions"
                />
              </div>
            ))}
            {defiData.value.positions.length === 0 && (
              <p style={{ color: 'var(--color-text-muted)', textAlign: 'center', padding: 'var(--space-4)' }}>
                No active DeFi positions
              </p>
            )}
          </div>
        </div>
      )}

      <div style={{ marginTop: 'var(--space-4)' }}>
        <h3 style={{ marginBottom: 'var(--space-3)' }}>Recent Activity</h3>
        <Table
          columns={buildTxColumns(displayCurrency.value, displayRate.value)}
          data={data.value?.recentTransactions ?? []}
          loading={isInitialLoad}
          emptyMessage="No recent transactions"
        />
      </div>

      {/* Operational Stats Section (from GET /admin/stats) */}
      {statsData.value && (
        <>
          {/* RPC Network Stats Table */}
          {statsData.value.rpc.byNetwork.length > 0 && (
            <div style={{ marginTop: 'var(--space-4)' }}>
              <h3 style={{ marginBottom: 'var(--space-3)' }}>RPC Network Status</h3>
              <Table
                columns={[
                  { key: 'network', header: 'Network' } as Column<AdminStats['rpc']['byNetwork'][number]>,
                  { key: 'calls', header: 'Total Calls' } as Column<AdminStats['rpc']['byNetwork'][number]>,
                  { key: 'errors', header: 'Errors' } as Column<AdminStats['rpc']['byNetwork'][number]>,
                  {
                    key: 'avgLatencyMs',
                    header: 'Avg Latency (ms)',
                    render: (r: AdminStats['rpc']['byNetwork'][number]) => r.avgLatencyMs.toFixed(1),
                  } as Column<AdminStats['rpc']['byNetwork'][number]>,
                ]}
                data={statsData.value.rpc.byNetwork}
                emptyMessage="No RPC data available"
              />
            </div>
          )}

          {/* AutoStop Rules Table */}
          <div style={{ marginTop: 'var(--space-4)' }}>
            <h3 style={{ marginBottom: 'var(--space-3)' }}>AutoStop Rules</h3>
            <Table
              columns={[
                { key: 'id', header: 'Rule' } as Column<AdminStats['autostop']['rules'][number]>,
                { key: 'displayName', header: 'Name' } as Column<AdminStats['autostop']['rules'][number]>,
                {
                  key: 'enabled',
                  header: 'Status',
                  render: (r: AdminStats['autostop']['rules'][number]) => (
                    <Badge variant={r.enabled ? 'success' : 'danger'}>
                      {r.enabled ? 'Enabled' : 'Disabled'}
                    </Badge>
                  ),
                } as Column<AdminStats['autostop']['rules'][number]>,
                { key: 'trackedCount', header: 'Tracked' } as Column<AdminStats['autostop']['rules'][number]>,
              ]}
              data={statsData.value.autostop.rules}
              emptyMessage="No rules configured"
            />
          </div>

          {/* Notifications Summary */}
          <div class="stat-grid" style={{ marginTop: 'var(--space-4)' }}>
            <StatCard
              label="Notifications Sent (24h)"
              value={String(statsData.value.notifications.sentLast24h)}
            />
            <StatCard
              label="Failed Notifications (24h)"
              value={String(statsData.value.notifications.failedLast24h)}
              badge={statsData.value.notifications.failedLast24h > 0 ? 'danger' : undefined}
            />
          </div>

          {/* System Info */}
          <div class="stat-grid" style={{ marginTop: 'var(--space-4)' }}>
            <StatCard label="DB Size" value={formatBytes(statsData.value.system.dbSizeBytes)} />
            <StatCard label="Schema Version" value={`v${statsData.value.system.schemaVersion}`} />
            <StatCard label="Node.js" value={statsData.value.system.nodeVersion} />
            <StatCard label="Platform" value={statsData.value.system.platform} />
          </div>
        </>
      )}
    </div>
  );
}
