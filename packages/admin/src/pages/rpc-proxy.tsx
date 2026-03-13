import { useSignal } from '@preact/signals';
import { useEffect } from 'preact/hooks';
import { apiGet, apiPut, ApiError } from '../api/client';
import { API } from '../api/endpoints';
import { FormField, Button, Badge } from '../components/form';
import { Table } from '../components/table';
import type { Column } from '../components/table';
import { EmptyState } from '../components/empty-state';
import { showToast } from '../components/toast';
import { getErrorMessage } from '../utils/error-messages';
import { formatDate } from '../utils/format';
import {
  type SettingsData,
  getEffectiveValue,
  getEffectiveBoolValue,
} from '../utils/settings-helpers';
import { registerDirty, unregisterDirty } from '../utils/dirty-guard';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AuditLogEntry {
  id: string;
  action: string;
  source: string;
  sessionId: string | null;
  walletId: string | null;
  metadata: Record<string, unknown>;
  timestamp: number;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function RpcProxyPage() {
  const settings = useSignal<SettingsData>({});
  const dirty = useSignal<Record<string, string>>({});
  const loading = useSignal(true);
  const saving = useSignal(false);
  const auditLogs = useSignal<AuditLogEntry[]>([]);
  const logsLoading = useSignal(true);

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
      loading.value = false;
    }
  };

  const fetchAuditLogs = async () => {
    try {
      const result = await apiGet<{ logs: AuditLogEntry[] }>(
        `${API.ADMIN_AUDIT_LOGS}?source=rpc-proxy&limit=20`,
      );
      auditLogs.value = result.logs ?? [];
    } catch {
      // Audit logs may not be available
    } finally {
      logsLoading.value = false;
    }
  };

  useEffect(() => {
    fetchSettings();
    fetchAuditLogs();
  }, []);

  // ---------------------------------------------------------------------------
  // Settings helpers
  // ---------------------------------------------------------------------------

  const getVal = (key: string, fallback = ''): string =>
    dirty.value[key] ?? getEffectiveValue(settings.value, key) ?? fallback;

  const getBool = (key: string): boolean => {
    if (dirty.value[key] !== undefined) return dirty.value[key] === 'true';
    return getEffectiveBoolValue(settings.value, key);
  };

  const setField = (key: string, value: string) => {
    dirty.value = { ...dirty.value, [key]: value };
  };

  const hasDirtyFields = () => Object.keys(dirty.value).length > 0;

  // Register dirty guard
  useEffect(() => {
    const id = 'rpc-proxy-settings';
    registerDirty(id, () => hasDirtyFields());
    return () => unregisterDirty(id);
  }, []);

  // ---------------------------------------------------------------------------
  // Save
  // ---------------------------------------------------------------------------

  const handleSave = async () => {
    saving.value = true;
    try {
      const entries = Object.entries(dirty.value);
      for (const [key, value] of entries) {
        await apiPut(API.ADMIN_SETTINGS, { key, value });
      }
      dirty.value = {};
      showToast('success', 'RPC proxy settings saved');
      await fetchSettings();
    } catch (err) {
      const e = err instanceof ApiError ? err : new ApiError(0, 'UNKNOWN', 'Unknown error');
      showToast('error', getErrorMessage(e.code));
    } finally {
      saving.value = false;
    }
  };

  // ---------------------------------------------------------------------------
  // Toggle enabled
  // ---------------------------------------------------------------------------

  const handleToggleEnabled = async () => {
    const current = getBool('rpc_proxy.enabled');
    const newVal = current ? 'false' : 'true';
    try {
      await apiPut(API.ADMIN_SETTINGS, { key: 'rpc_proxy.enabled', value: newVal });
      showToast('success', `RPC proxy ${newVal === 'true' ? 'enabled' : 'disabled'}`);
      await fetchSettings();
    } catch (err) {
      const e = err instanceof ApiError ? err : new ApiError(0, 'UNKNOWN', 'Unknown error');
      showToast('error', getErrorMessage(e.code));
    }
  };

  // ---------------------------------------------------------------------------
  // Audit logs table
  // ---------------------------------------------------------------------------

  const auditColumns: Column<AuditLogEntry>[] = [
    { key: 'timestamp', label: 'Time', render: (row) => formatDate(row.timestamp) },
    { key: 'action', label: 'Method', render: (row) => String(row.metadata?.method ?? row.action) },
    { key: 'walletId', label: 'Wallet', render: (row) => row.walletId ? row.walletId.slice(0, 8) + '...' : '-' },
    {
      key: 'metadata',
      label: 'Status',
      render: (row) => {
        const status = String(row.metadata?.status ?? 'ok');
        const variant = status === 'error' ? 'danger' : status === 'rejected' ? 'warning' : 'success';
        return <Badge variant={variant}>{status}</Badge>;
      },
    },
  ];

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  if (loading.value) {
    return <div class="loading-spinner">Loading...</div>;
  }

  const isEnabled = getBool('rpc_proxy.enabled');

  return (
    <div class="page-content">
      {/* Status Section */}
      <div class="card">
        <div class="card-header">
          <h3>Proxy Status</h3>
        </div>
        <div class="card-body">
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <Badge variant={isEnabled ? 'success' : 'danger'}>
              {isEnabled ? 'ENABLED' : 'DISABLED'}
            </Badge>
            <Button
              variant={isEnabled ? 'danger' : 'primary'}
              onClick={handleToggleEnabled}
            >
              {isEnabled ? 'Disable Proxy' : 'Enable Proxy'}
            </Button>
          </div>
        </div>
      </div>

      {/* Settings Form */}
      <div class="card" style={{ marginTop: '1rem' }}>
        <div class="card-header">
          <h3>Configuration</h3>
        </div>
        <div class="card-body">
          <FormField
            label="Delay Timeout (seconds)"
            value={getVal('rpc_proxy.delay_timeout_seconds', '300')}
            onChange={(v) => setField('rpc_proxy.delay_timeout_seconds', v)}
            type="number"
            help="Timeout for DELAY tier transactions (default: 300s)"
          />
          <FormField
            label="Approval Timeout (seconds)"
            value={getVal('rpc_proxy.approval_timeout_seconds', '600')}
            onChange={(v) => setField('rpc_proxy.approval_timeout_seconds', v)}
            type="number"
            help="Timeout for APPROVAL tier transactions (default: 600s)"
          />
          <FormField
            label="Max Gas Limit"
            value={getVal('rpc_proxy.max_gas_limit', '30000000')}
            onChange={(v) => setField('rpc_proxy.max_gas_limit', v)}
            type="number"
            help="Maximum gas limit per transaction (default: 30,000,000)"
          />
          <FormField
            label="Max Bytecode Size (bytes)"
            value={getVal('rpc_proxy.max_bytecode_size', '49152')}
            onChange={(v) => setField('rpc_proxy.max_bytecode_size', v)}
            type="number"
            help="Maximum contract bytecode size for deploy (default: 48KB)"
          />
          <FormField
            label="Deploy Default Tier"
            value={getVal('rpc_proxy.deploy_default_tier', 'APPROVAL')}
            onChange={(v) => setField('rpc_proxy.deploy_default_tier', v)}
            type="select"
            options={[
              { label: 'IMMEDIATE', value: 'IMMEDIATE' },
              { label: 'DELAY', value: 'DELAY' },
              { label: 'APPROVAL', value: 'APPROVAL' },
            ]}
            help="Default policy tier for CONTRACT_DEPLOY transactions"
          />
          <FormField
            label="Allowed Methods (JSON array)"
            value={getVal('rpc_proxy.allowed_methods', '[]')}
            onChange={(v) => setField('rpc_proxy.allowed_methods', v)}
            type="textarea"
            help='JSON array of allowed methods. Empty [] = all supported methods. Example: ["eth_sendTransaction","eth_call"]'
          />

          {hasDirtyFields() && (
            <div style={{ marginTop: '1rem', display: 'flex', gap: '0.5rem' }}>
              <Button variant="primary" onClick={handleSave} disabled={saving.value}>
                {saving.value ? 'Saving...' : 'Save Changes'}
              </Button>
              <Button variant="secondary" onClick={() => { dirty.value = {}; }}>
                Cancel
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Usage Info */}
      <div class="card" style={{ marginTop: '1rem' }}>
        <div class="card-header">
          <h3>Usage</h3>
        </div>
        <div class="card-body">
          <p>RPC Proxy URL pattern:</p>
          <code class="code-block" style={{ display: 'block', padding: '0.75rem', background: 'var(--bg-tertiary)', borderRadius: '4px', marginBottom: '1rem' }}>
            {'<baseUrl>'}/v1/rpc-evm/{'<walletId>'}/{'<chainId>'}
          </code>
          <p style={{ marginBottom: '0.5rem' }}><strong>Examples:</strong></p>
          <ul style={{ paddingLeft: '1.25rem', lineHeight: '1.8' }}>
            <li><strong>Forge:</strong> <code>forge script Deploy.s.sol --rpc-url http://localhost:3100/v1/rpc-evm/WALLET_ID/1</code></li>
            <li><strong>Hardhat:</strong> Set <code>url</code> in hardhat.config.ts networks section</li>
            <li><strong>viem:</strong> Use <code>http('http://localhost:3100/v1/rpc-evm/WALLET_ID/1')</code> as transport</li>
          </ul>
          <p style={{ marginTop: '0.75rem', color: 'var(--text-secondary)' }}>
            Requires session authentication (Authorization: Bearer wai_sess_...) on all requests.
          </p>
        </div>
      </div>

      {/* Recent Activity */}
      <div class="card" style={{ marginTop: '1rem' }}>
        <div class="card-header">
          <h3>Recent Activity</h3>
        </div>
        <div class="card-body">
          {logsLoading.value ? (
            <div class="loading-spinner">Loading...</div>
          ) : auditLogs.value.length === 0 ? (
            <EmptyState
              title="No recent activity"
              description="RPC proxy audit logs will appear here once requests are processed."
            />
          ) : (
            <Table
              columns={auditColumns}
              data={auditLogs.value}
              rowKey={(row) => row.id}
            />
          )}
        </div>
      </div>
    </div>
  );
}
