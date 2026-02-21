import { useSignal } from '@preact/signals';
import { useEffect } from 'preact/hooks';
import { apiGet, apiPost, apiPut, apiDelete, ApiError } from '../api/client';
import { API } from '../api/endpoints';
import { Table } from '../components/table';
import type { Column } from '../components/table';
import { FormField, Button, Badge } from '../components/form';
import { Modal } from '../components/modal';
import { CopyButton } from '../components/copy-button';
import { showToast } from '../components/toast';
import { getErrorMessage } from '../utils/error-messages';
import { formatDate } from '../utils/format';
import { TabNav } from '../components/tab-nav';
import { Breadcrumb } from '../components/breadcrumb';
import { type SettingsData, keyToLabel, getEffectiveValue } from '../utils/settings-helpers';
import { FieldGroup } from '../components/field-group';
import { pendingNavigation, highlightField } from '../components/settings-search';
import { registerDirty, unregisterDirty } from '../utils/dirty-guard';

interface Wallet {
  id: string;
  name: string;
  chain: string;
  network: string;
  publicKey: string;
  status: string;
  createdAt: number;
}

interface SessionWallet {
  id: string;
  name: string;
  isDefault: boolean;
}

interface Session {
  id: string;
  walletId: string;
  walletName: string | null;
  wallets?: SessionWallet[];
  status: string;
  renewalCount: number;
  maxRenewals: number;
  expiresAt: number;
  absoluteExpiresAt: number;
  createdAt: number;
  lastRenewedAt: number | null;
  source: 'api' | 'mcp';
}

interface CreatedSession {
  id: string;
  token: string;
  expiresAt: number;
  walletId: string;
  wallets?: SessionWallet[];
}

function openRevoke(
  id: string,
  revokeSessionId: { value: string },
  revokeModal: { value: boolean },
) {
  revokeSessionId.value = id;
  revokeModal.value = true;
}

const SESSIONS_TABS = [
  { key: 'sessions', label: 'Sessions' },
  { key: 'settings', label: 'Settings' },
];

// ---------------------------------------------------------------------------
// Session Settings Tab
// ---------------------------------------------------------------------------

const SESSION_KEYS = [
  'security.session_ttl',
  'security.session_absolute_lifetime',
  'security.session_max_renewals',
  'security.max_sessions_per_wallet',
  'security.max_pending_tx',
  'security.rate_limit_session_rpm',
  'security.rate_limit_tx_rpm',
];

function SessionSettingsTab() {
  const settings = useSignal<SettingsData>({});
  const dirty = useSignal<Record<string, string>>({});
  const saving = useSignal(false);
  const loading = useSignal(true);

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

  useEffect(() => {
    fetchSettings();
  }, []);

  const handleFieldChange = (fullKey: string, value: string | number | boolean) => {
    const strValue = typeof value === 'boolean' ? String(value) : String(value);
    dirty.value = { ...dirty.value, [fullKey]: strValue };
  };

  const handleSave = async () => {
    saving.value = true;
    try {
      const entries = Object.entries(dirty.value)
        .filter(([key]) => SESSION_KEYS.includes(key))
        .map(([key, value]) => ({ key, value }));
      const result = await apiPut<{ updated: number; settings: SettingsData }>(API.ADMIN_SETTINGS, { settings: entries });
      settings.value = result.settings;
      dirty.value = {};
      showToast('success', 'Session settings saved and applied');
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

  useEffect(() => {
    registerDirty({
      id: 'sessions-settings',
      isDirty: () => Object.keys(dirty.value).filter(k => SESSION_KEYS.includes(k)).length > 0,
      save: handleSave,
      discard: handleDiscard,
    });
    return () => unregisterDirty('sessions-settings');
  }, []);

  const dirtyCount = Object.keys(dirty.value).filter((k) => SESSION_KEYS.includes(k)).length;

  if (loading.value) {
    return (
      <div class="empty-state">
        <p>Loading settings...</p>
      </div>
    );
  }

  return (
    <>
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

      <div class="settings-category">
        <div class="settings-category-header">
          <h3>Session Configuration</h3>
          <p class="settings-description">
            Configure session lifetime, renewal limits, and request rate limiting.
            Changes apply immediately without daemon restart.
          </p>
        </div>
        <div class="settings-category-body">
          <FieldGroup legend="Lifetime" description="Session duration and renewal limits">
            <div class="settings-fields-grid">
              <FormField
                label={keyToLabel('session_ttl')}
                name="security.session_ttl"
                type="number"
                value={Number(getEffectiveValue(settings.value, dirty.value, 'security', 'session_ttl')) || 0}
                onChange={(v) => handleFieldChange('security.session_ttl', v)}
                min={300}
                description="How long a session token is valid before renewal"
              />
              <FormField
                label={keyToLabel('session_absolute_lifetime')}
                name="security.session_absolute_lifetime"
                type="number"
                value={Number(getEffectiveValue(settings.value, dirty.value, 'security', 'session_absolute_lifetime')) || 0}
                onChange={(v) => handleFieldChange('security.session_absolute_lifetime', v)}
                min={0}
                description="Maximum total session duration regardless of renewals"
              />
              <FormField
                label={keyToLabel('session_max_renewals')}
                name="security.session_max_renewals"
                type="number"
                value={Number(getEffectiveValue(settings.value, dirty.value, 'security', 'session_max_renewals')) || 0}
                onChange={(v) => handleFieldChange('security.session_max_renewals', v)}
                min={0}
                description="Maximum number of times a session can be renewed"
              />
              <FormField
                label={keyToLabel('max_sessions_per_wallet')}
                name="security.max_sessions_per_wallet"
                type="number"
                value={Number(getEffectiveValue(settings.value, dirty.value, 'security', 'max_sessions_per_wallet')) || 0}
                onChange={(v) => handleFieldChange('security.max_sessions_per_wallet', v)}
                min={1}
                max={100}
                description="Maximum concurrent sessions for a single wallet"
              />
            </div>
          </FieldGroup>

          <FieldGroup legend="Rate Limits" description="Request throttling per session and transaction">
            <div class="settings-fields-grid">
              <FormField
                label={keyToLabel('max_pending_tx')}
                name="security.max_pending_tx"
                type="number"
                value={Number(getEffectiveValue(settings.value, dirty.value, 'security', 'max_pending_tx')) || 0}
                onChange={(v) => handleFieldChange('security.max_pending_tx', v)}
                min={1}
                max={100}
                description="Maximum in-flight transactions per session"
              />
              <FormField
                label={keyToLabel('rate_limit_session_rpm')}
                name="security.rate_limit_session_rpm"
                type="number"
                value={Number(getEffectiveValue(settings.value, dirty.value, 'security', 'rate_limit_session_rpm')) || 0}
                onChange={(v) => handleFieldChange('security.rate_limit_session_rpm', v)}
                min={10}
                description="Max requests per minute per session"
              />
              <FormField
                label={keyToLabel('rate_limit_tx_rpm')}
                name="security.rate_limit_tx_rpm"
                type="number"
                value={Number(getEffectiveValue(settings.value, dirty.value, 'security', 'rate_limit_tx_rpm')) || 0}
                onChange={(v) => handleFieldChange('security.rate_limit_tx_rpm', v)}
                min={1}
                description="Max transaction requests per minute per session"
              />
            </div>
          </FieldGroup>
        </div>
      </div>
    </>
  );
}

export default function SessionsPage() {
  const activeTab = useSignal('sessions');

  useEffect(() => {
    const nav = pendingNavigation.value;
    if (nav && nav.tab) {
      activeTab.value = nav.tab;
      setTimeout(() => {
        highlightField.value = nav.fieldName;
      }, 100);
      pendingNavigation.value = null;
    }
  }, [pendingNavigation.value]);

  const wallets = useSignal<Wallet[]>([]);
  const selectedWalletId = useSignal('');
  const sourceFilter = useSignal<'' | 'api' | 'mcp'>('');
  const sessions = useSignal<Session[]>([]);
  const loading = useSignal(false);
  const walletsLoading = useSignal(true);
  const createLoading = useSignal(false);
  const tokenModal = useSignal(false);
  const createdToken = useSignal('');
  const revokeModal = useSignal(false);
  const revokeSessionId = useSignal('');
  const revokeLoading = useSignal(false);

  // Multi-wallet session creation modal state
  const createModal = useSignal(false);
  const createSelectedIds = useSignal<Set<string>>(new Set());
  const createDefaultWalletId = useSignal('');

  // Bulk creation state
  const bulkModal = useSignal(false);
  const bulkType = useSignal<'api' | 'mcp'>('api');
  const bulkSelectedIds = useSignal<Set<string>>(new Set());
  const bulkLoading = useSignal(false);
  const bulkResultModal = useSignal(false);
  const bulkResults = useSignal<Array<{ walletId: string; walletName: string | null; sessionId?: string; token?: string; tokenPath?: string; error?: string }>>([]);
  const bulkClaudeConfig = useSignal<Record<string, unknown> | null>(null);

  const fetchWallets = async () => {
    try {
      const result = await apiGet<{ items: Wallet[] }>(API.WALLETS);
      wallets.value = result.items.filter((a) => a.status === 'ACTIVE');
    } catch (err) {
      const e = err instanceof ApiError ? err : new ApiError(0, 'UNKNOWN', 'Unknown error');
      showToast('error', getErrorMessage(e.code));
    } finally {
      walletsLoading.value = false;
    }
  };

  const fetchSessions = async () => {
    loading.value = true;
    try {
      const url = selectedWalletId.value
        ? `${API.SESSIONS}?walletId=${selectedWalletId.value}`
        : API.SESSIONS;
      const result = await apiGet<Session[]>(url);
      sessions.value = result;
    } catch (err) {
      const e = err instanceof ApiError ? err : new ApiError(0, 'UNKNOWN', 'Unknown error');
      showToast('error', getErrorMessage(e.code));
    } finally {
      loading.value = false;
    }
  };

  const toggleCreateSelect = (id: string) => {
    const next = new Set(createSelectedIds.value);
    if (next.has(id)) {
      next.delete(id);
      // If removed wallet was the default, reset default
      if (createDefaultWalletId.value === id) {
        createDefaultWalletId.value = next.size > 0 ? (Array.from(next)[0] ?? '') : '';
      }
    } else {
      next.add(id);
      // Auto-set first selected wallet as default
      if (next.size === 1) {
        createDefaultWalletId.value = id;
      }
    }
    createSelectedIds.value = next;
  };

  const handleCreate = async () => {
    createLoading.value = true;
    try {
      const ids = Array.from(createSelectedIds.value);
      const body: Record<string, unknown> = ids.length === 1
        ? { walletId: ids[0] }
        : { walletIds: ids, defaultWalletId: createDefaultWalletId.value || ids[0] };
      const result = await apiPost<CreatedSession>(API.SESSIONS, body);
      createdToken.value = result.token;
      tokenModal.value = true;
      createModal.value = false;
      await fetchSessions();
    } catch (err) {
      const e = err instanceof ApiError ? err : new ApiError(0, 'UNKNOWN', 'Unknown error');
      showToast('error', getErrorMessage(e.code));
    } finally {
      createLoading.value = false;
    }
  };

  const toggleBulkSelect = (id: string) => {
    const next = new Set(bulkSelectedIds.value);
    if (next.has(id)) next.delete(id); else next.add(id);
    bulkSelectedIds.value = next;
  };

  const toggleBulkSelectAll = () => {
    if (bulkSelectedIds.value.size === wallets.value.length) {
      bulkSelectedIds.value = new Set();
    } else {
      bulkSelectedIds.value = new Set(wallets.value.map((w) => w.id));
    }
  };

  const handleBulkCreate = async () => {
    if (bulkSelectedIds.value.size === 0) return;
    bulkLoading.value = true;
    try {
      const walletIds = Array.from(bulkSelectedIds.value);
      if (bulkType.value === 'mcp') {
        const result = await apiPost<{
          results: typeof bulkResults.value;
          created: number;
          failed: number;
          claudeDesktopConfig: Record<string, unknown>;
        }>(API.ADMIN_BULK_MCP_TOKENS, { walletIds });
        bulkResults.value = result.results;
        bulkClaudeConfig.value = result.claudeDesktopConfig;
      } else {
        const result = await apiPost<{
          results: typeof bulkResults.value;
          created: number;
          failed: number;
        }>(API.ADMIN_BULK_SESSIONS, { walletIds });
        bulkResults.value = result.results;
        bulkClaudeConfig.value = null;
      }
      bulkModal.value = false;
      bulkResultModal.value = true;
      await fetchSessions();
    } catch (err) {
      const e = err instanceof ApiError ? err : new ApiError(0, 'UNKNOWN', 'Unknown error');
      showToast('error', getErrorMessage(e.code));
    } finally {
      bulkLoading.value = false;
    }
  };

  const handleRevoke = async () => {
    revokeLoading.value = true;
    try {
      await apiDelete(API.SESSION(revokeSessionId.value));
      showToast('success', 'Session revoked');
      revokeModal.value = false;
      await fetchSessions();
    } catch (err) {
      const e = err instanceof ApiError ? err : new ApiError(0, 'UNKNOWN', 'Unknown error');
      showToast('error', getErrorMessage(e.code));
    } finally {
      revokeLoading.value = false;
    }
  };

  useEffect(() => {
    fetchWallets();
  }, []);

  useEffect(() => {
    sessions.value = [];
    fetchSessions();
  }, [selectedWalletId.value]);

  const sessionColumns: Column<Session>[] = [
    { key: 'id', header: 'ID', render: (s) => s.id.slice(0, 8) + '...' },
    {
      key: 'walletName',
      header: 'Wallet',
      render: (s) => {
        if (s.wallets && s.wallets.length > 0) {
          return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
              {s.wallets.map((w) => (
                <span key={w.id}>
                  {w.name ?? w.id.slice(0, 8)}
                  {w.isDefault && <Badge variant="info">default</Badge>}
                </span>
              ))}
            </div>
          );
        }
        return s.walletName ?? s.walletId.slice(0, 8) + '...';
      },
    },
    {
      key: 'source',
      header: 'Source',
      render: (s) => (
        <Badge variant={s.source === 'mcp' ? 'info' : 'neutral'}>
          {s.source === 'mcp' ? 'MCP' : 'API'}
        </Badge>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (s) => (
        <Badge
          variant={
            s.status === 'ACTIVE' ? 'success' : s.status === 'EXPIRED' ? 'warning' : 'danger'
          }
        >
          {s.status}
        </Badge>
      ),
    },
    { key: 'expiresAt', header: 'Expires At', render: (s) => formatDate(s.expiresAt) },
    {
      key: 'renewals',
      header: 'Renewals',
      render: (s) => `${s.renewalCount}/${s.maxRenewals}`,
    },
    { key: 'createdAt', header: 'Created', render: (s) => formatDate(s.createdAt) },
    {
      key: 'actions',
      header: 'Actions',
      render: (s) =>
        s.status === 'ACTIVE' ? (
          <Button
            size="sm"
            variant="danger"
            onClick={() => openRevoke(s.id, revokeSessionId, revokeModal)}
          >
            Revoke
          </Button>
        ) : null,
    },
  ];

  return (
    <div class="page">
      <Breadcrumb
        pageName="Sessions"
        tabName={SESSIONS_TABS.find(t => t.key === activeTab.value)?.label ?? ''}
        onPageClick={() => { activeTab.value = 'sessions'; }}
      />
      <TabNav tabs={SESSIONS_TABS} activeTab={activeTab.value} onTabChange={(k) => { activeTab.value = k; }} />

      {activeTab.value === 'sessions' && (
        <>
          <div class="session-controls">
            <div class="session-wallet-select">
              <label for="wallet-select">Wallet</label>
              <select
                id="wallet-select"
                value={selectedWalletId.value}
                onChange={(e) => {
                  selectedWalletId.value = (e.target as HTMLSelectElement).value;
                }}
                disabled={walletsLoading.value}
              >
                <option value="">All Wallets</option>
                {wallets.value.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} ({a.chain}/{a.network})
                  </option>
                ))}
              </select>
            </div>
            <div class="session-wallet-select">
              <label for="source-select">Source</label>
              <select
                id="source-select"
                value={sourceFilter.value}
                onChange={(e) => {
                  sourceFilter.value = (e.target as HTMLSelectElement).value as '' | 'api' | 'mcp';
                }}
              >
                <option value="">All</option>
                <option value="api">API</option>
                <option value="mcp">MCP</option>
              </select>
            </div>
            <Button
              onClick={() => {
                createSelectedIds.value = new Set();
                createDefaultWalletId.value = '';
                createModal.value = true;
              }}
              disabled={wallets.value.length === 0}
            >
              Create Session
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                bulkSelectedIds.value = new Set();
                bulkType.value = 'api';
                bulkModal.value = true;
              }}
              disabled={wallets.value.length === 0}
            >
              Bulk Create
            </Button>
          </div>

          <Table<Session>
            columns={sessionColumns}
            data={sourceFilter.value
              ? sessions.value.filter((s) => s.source === sourceFilter.value)
              : sessions.value}
            loading={loading.value}
            emptyMessage="No sessions"
          />

          {/* Token Display Modal */}
          <Modal
            open={tokenModal.value}
            title="Session Created"
            onCancel={() => { tokenModal.value = false; }}
            cancelText="Close"
          >
            <p class="token-warning">Copy this token now. It will not be shown again.</p>
            <div class="token-display">
              <code class="token-value">{createdToken.value}</code>
              <CopyButton value={createdToken.value} label="Copy Token" />
            </div>
          </Modal>

          {/* Revoke Confirmation Modal */}
          <Modal
            open={revokeModal.value}
            title="Revoke Session"
            onCancel={() => { revokeModal.value = false; }}
            onConfirm={handleRevoke}
            confirmText="Revoke"
            confirmVariant="danger"
            loading={revokeLoading.value}
          >
            <p>
              Are you sure you want to revoke this session? The associated token will be immediately
              invalidated.
            </p>
          </Modal>

          {/* Create Session Modal — multi-wallet selection */}
          <Modal
            open={createModal.value}
            title="Create Session"
            onCancel={() => { createModal.value = false; }}
            onConfirm={handleCreate}
            confirmText={`Create Session (${createSelectedIds.value.size} wallet${createSelectedIds.value.size !== 1 ? 's' : ''})`}
            confirmDisabled={createSelectedIds.value.size === 0}
            loading={createLoading.value}
          >
            <div>
              <label style={{ fontWeight: 600, display: 'block', marginBottom: 'var(--space-2)' }}>Select Wallets</label>
              <div style={{ maxHeight: '250px', overflow: 'auto', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', padding: 'var(--space-2)' }}>
                {wallets.value.map((w) => (
                  <label key={w.id} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', padding: 'var(--space-1) 0', cursor: 'pointer' }}>
                    <input type="checkbox" checked={createSelectedIds.value.has(w.id)}
                      onChange={() => toggleCreateSelect(w.id)} />
                    <span>{w.name}</span>
                    <span style={{ color: 'var(--color-text-secondary)', fontSize: '0.8rem' }}>({w.chain}/{w.network})</span>
                  </label>
                ))}
              </div>
            </div>
            {createSelectedIds.value.size > 1 && (
              <div style={{ marginTop: 'var(--space-3)' }}>
                <label style={{ fontWeight: 600, display: 'block', marginBottom: 'var(--space-2)' }}>Default Wallet</label>
                <div style={{ border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', padding: 'var(--space-2)' }}>
                  {wallets.value.filter((w) => createSelectedIds.value.has(w.id)).map((w) => (
                    <label key={w.id} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', padding: 'var(--space-1) 0', cursor: 'pointer' }}>
                      <input type="radio" name="defaultWallet" checked={createDefaultWalletId.value === w.id}
                        onChange={() => { createDefaultWalletId.value = w.id; }} />
                      <span>{w.name}</span>
                      <span style={{ color: 'var(--color-text-secondary)', fontSize: '0.8rem' }}>({w.chain}/{w.network})</span>
                    </label>
                  ))}
                </div>
              </div>
            )}
          </Modal>

          {/* Bulk Create Modal — wallet selection */}
          <Modal
            open={bulkModal.value}
            title="Bulk Create Sessions"
            onCancel={() => { bulkModal.value = false; }}
            onConfirm={handleBulkCreate}
            confirmText={`Create ${bulkSelectedIds.value.size} ${bulkType.value === 'mcp' ? 'MCP Tokens' : 'Sessions'}`}
            confirmDisabled={bulkSelectedIds.value.size === 0}
            loading={bulkLoading.value}
          >
            <div style={{ marginBottom: 'var(--space-3)' }}>
              <label style={{ fontWeight: 600, display: 'block', marginBottom: 'var(--space-2)' }}>Type</label>
              <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
                <label style={{ cursor: 'pointer' }}>
                  <input type="radio" name="bulkType" checked={bulkType.value === 'api'}
                    onChange={() => { bulkType.value = 'api'; }} /> API Session
                </label>
                <label style={{ cursor: 'pointer' }}>
                  <input type="radio" name="bulkType" checked={bulkType.value === 'mcp'}
                    onChange={() => { bulkType.value = 'mcp'; }} /> MCP Token
                </label>
              </div>
            </div>
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-2)' }}>
                <label style={{ fontWeight: 600 }}>Select Wallets</label>
                <button type="button" class="btn btn-sm" onClick={toggleBulkSelectAll}>
                  {bulkSelectedIds.value.size === wallets.value.length ? 'Deselect All' : 'Select All'}
                </button>
              </div>
              <div style={{ maxHeight: '250px', overflow: 'auto', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', padding: 'var(--space-2)' }}>
                {wallets.value.map((w) => (
                  <label key={w.id} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', padding: 'var(--space-1) 0', cursor: 'pointer' }}>
                    <input type="checkbox" checked={bulkSelectedIds.value.has(w.id)}
                      onChange={() => toggleBulkSelect(w.id)} />
                    <span>{w.name}</span>
                    <span style={{ color: 'var(--color-text-secondary)', fontSize: '0.8rem' }}>({w.chain}/{w.network})</span>
                  </label>
                ))}
              </div>
            </div>
          </Modal>

          {/* Bulk Results Modal */}
          <Modal
            open={bulkResultModal.value}
            title="Bulk Creation Results"
            onCancel={() => { bulkResultModal.value = false; }}
            cancelText="Close"
          >
            <div style={{ marginBottom: 'var(--space-3)' }}>
              <p>
                Created: <strong>{bulkResults.value.filter((r) => !r.error).length}</strong> /
                Failed: <strong>{bulkResults.value.filter((r) => r.error).length}</strong>
              </p>
            </div>
            <div style={{ maxHeight: '200px', overflow: 'auto', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', padding: 'var(--space-2)' }}>
              {bulkResults.value.map((r) => (
                <div key={r.walletId} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 'var(--space-1) 0', borderBottom: '1px solid var(--color-border)' }}>
                  <span>{r.walletName ?? r.walletId.slice(0, 8)}</span>
                  {r.error ? (
                    <Badge variant="danger">{r.error}</Badge>
                  ) : (
                    <Badge variant="success">Created</Badge>
                  )}
                </div>
              ))}
            </div>
            {bulkClaudeConfig.value && Object.keys(bulkClaudeConfig.value).length > 0 && (
              <div style={{ marginTop: 'var(--space-3)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-2)' }}>
                  <label style={{ fontWeight: 600 }}>Claude Desktop Config</label>
                  <CopyButton value={JSON.stringify({ mcpServers: bulkClaudeConfig.value }, null, 2)} label="Copy Config" />
                </div>
                <pre style={{ fontSize: '0.75rem', maxHeight: '150px', overflow: 'auto', background: 'var(--color-bg-secondary)', padding: 'var(--space-2)', borderRadius: 'var(--radius-md)' }}>
                  {JSON.stringify({ mcpServers: bulkClaudeConfig.value }, null, 2)}
                </pre>
              </div>
            )}
          </Modal>
        </>
      )}

      {activeTab.value === 'settings' && <SessionSettingsTab />}
    </div>
  );
}
