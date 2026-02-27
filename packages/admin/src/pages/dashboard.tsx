import { useSignal } from '@preact/signals';
import { useEffect } from 'preact/hooks';
import { apiGet, apiPost, ApiError } from '../api/client';
import { API } from '../api/endpoints';
import { formatUptime, formatDate } from '../utils/format';
import { fetchDisplayCurrency, formatWithDisplay } from '../utils/display-currency';
import { Badge, Button } from '../components/form';
import { Table } from '../components/table';
import type { Column } from '../components/table';
import { getErrorMessage } from '../utils/error-messages';
import { showToast } from '../components/toast';
import { ExplorerLink } from '../components/explorer-link';

interface RecentTransaction {
  id: string;
  walletId: string;
  walletName: string | null;
  type: string;
  status: string;
  toAddress: string | null;
  amount: string | null;
  amountUsd: number | null;
  network: string | null;
  txHash: string | null;
  createdAt: number | null;
}

interface AdminStatus {
  status: string;
  version: string;
  latestVersion: string | null;
  updateAvailable: boolean;
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
  autoProvisioned?: boolean;
}

interface AgentPromptResult {
  prompt: string;
  walletCount: number;
  sessionsCreated: number;
  expiresAt: number;
}

interface DefiPositionSummary {
  positions: Array<{
    id: string;
    walletId: string;
    category: string;
    provider: string;
    chain: string;
    network: string | null;
    assetId: string | null;
    amount: string;
    amountUsd: number | null;
    status: string;
    openedAt: number;
    lastSyncedAt: number;
  }>;
  totalValueUsd: number | null;
  worstHealthFactor: number | null;
  activeCount: number;
}

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
        const display = formatWithDisplay(tx.amountUsd, displayCurrency, displayRate);
        return display ? `${tx.amount} (${display})` : tx.amount;
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

function buildDefiColumns(
  displayCurrency: string,
  displayRate: number | null,
): Column<DefiPositionSummary['positions'][number]>[] {
  return [
    { key: 'provider', header: 'Provider' },
    { key: 'category', header: 'Category', render: (p) => <Badge variant="info">{p.category}</Badge> },
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
  ];
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

  const fetchDefi = async () => {
    defiLoading.value = true;
    try {
      const result = await apiGet<DefiPositionSummary>(API.ADMIN_DEFI_POSITIONS);
      defiData.value = result;
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

  const handleGeneratePrompt = async () => {
    promptLoading.value = true;
    try {
      const result = await apiPost<AgentPromptResult>(API.ADMIN_AGENT_PROMPT, {});
      if (result.walletCount === 0) {
        showToast('warning', 'No active wallets found');
        return;
      }
      promptText.value = result.prompt;
      showToast('success', `Prompt generated for ${result.walletCount} wallet(s)`);
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
    fetchDisplayCurrency()
      .then(({ currency, rate }) => {
        displayCurrency.value = currency;
        displayRate.value = rate;
      })
      .catch(() => { /* fallback to USD */ });
    apiGet<{ total: number }>(API.ADMIN_TRANSACTIONS + '?status=APPROVED&limit=1')
      .then((res) => { approvalCount.value = res.total; })
      .catch(() => { /* fallback */ });
    const interval = setInterval(() => { fetchStatus(); fetchDefi(); }, 30_000);
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

      {/* DeFi Positions Section */}
      {defiData.value && defiData.value.activeCount > 0 && (
        <div style={{ marginTop: 'var(--space-4)' }}>
          <h3 style={{ marginBottom: 'var(--space-3)' }}>DeFi Positions</h3>
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
            <Table
              columns={buildDefiColumns(displayCurrency.value, displayRate.value)}
              data={defiData.value.positions}
              loading={defiLoading.value}
              emptyMessage="No active DeFi positions"
            />
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
    </div>
  );
}
