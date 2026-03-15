import { useSignal } from '@preact/signals';
import { useEffect } from 'preact/hooks';
import { api, ApiError } from '../api/typed-client';
import type { components } from '../api/types.generated';
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

type Wallet = components['schemas']['WalletCrudResponse'];
type SessionWallet = components['schemas']['SessionWallet'];
type Session = components['schemas']['SessionListItem'] & { tokenIssuedCount?: number };
type CreatedSession = components['schemas']['SessionCreateResponse'];

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
      const { data: result } = await api.GET('/v1/admin/settings');
      settings.value = result as unknown as SettingsData;
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
      const { data: result } = await api.PUT('/v1/admin/settings', { body: { settings: entries } });
      settings.value = result!.settings as unknown as SettingsData;
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
          <FieldGroup legend="Limits" description="Session concurrency limits">
            <div class="settings-fields-grid">
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
  const reissueLoading = useSignal<string | null>(null);

  // Multi-wallet session creation modal state
  const createModal = useSignal(false);
  const createSelectedIds = useSignal<Set<string>>(new Set());
  const createAdvancedOpen = useSignal(false);
  const createTtlDays = useSignal('');
  const createMaxRenewals = useSignal('');
  const createLifetimeDays = useSignal('');

  const fetchWallets = async () => {
    try {
      const { data: result } = await api.GET('/v1/wallets');
      wallets.value = result!.items.filter((a) => a.status === 'ACTIVE');
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
      const query = selectedWalletId.value ? { walletId: selectedWalletId.value } : undefined;
      const { data: result } = await api.GET('/v1/sessions', { params: { query: query as Record<string, string> } });
      sessions.value = (result as unknown as Session[]);
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
    } else {
      next.add(id);
    }
    createSelectedIds.value = next;
  };

  const handleCreate = async () => {
    createLoading.value = true;
    try {
      const ids = Array.from(createSelectedIds.value);
      const body: Record<string, unknown> = ids.length === 1
        ? { walletId: ids[0] }
        : { walletIds: ids };
      // Per-session TTL (days → seconds)
      const ttlDays = Number(createTtlDays.value);
      if (ttlDays > 0) body['ttl'] = ttlDays * 86400;
      const maxR = Number(createMaxRenewals.value);
      if (createMaxRenewals.value !== '' && maxR >= 0) body['maxRenewals'] = maxR;
      const lifeDays = Number(createLifetimeDays.value);
      if (lifeDays > 0) body['absoluteLifetime'] = lifeDays * 86400;
      const { data: result } = await api.POST('/v1/sessions', { body: body as Record<string, unknown> });
      createdToken.value = (result as unknown as CreatedSession).token;
      tokenModal.value = true;
      createModal.value = false;
      createAdvancedOpen.value = false;
      createTtlDays.value = '';
      createMaxRenewals.value = '';
      createLifetimeDays.value = '';
      await fetchSessions();
    } catch (err) {
      const e = err instanceof ApiError ? err : new ApiError(0, 'UNKNOWN', 'Unknown error');
      showToast('error', getErrorMessage(e.code));
    } finally {
      createLoading.value = false;
    }
  };

  const handleRevoke = async () => {
    revokeLoading.value = true;
    try {
      await api.DELETE('/v1/sessions/{id}', { params: { path: { id: revokeSessionId.value } } });
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

  const handleReissue = async (sessionId: string) => {
    reissueLoading.value = sessionId;
    try {
      const { data: result } = await api.POST('/v1/admin/sessions/{id}/reissue', {
        params: { path: { id: sessionId } },
      });
      createdToken.value = (result as unknown as { token: string }).token;
      tokenModal.value = true;
      await fetchSessions();
    } catch (err) {
      const e = err instanceof ApiError ? err : new ApiError(0, 'UNKNOWN', 'Unknown error');
      showToast('error', getErrorMessage(e.code));
    } finally {
      reissueLoading.value = null;
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
    { key: 'expiresAt', header: 'Expires At', render: (s) => s.expiresAt === 0 ? 'Never' : formatDate(s.expiresAt) },
    {
      key: 'renewals',
      header: 'Renewals',
      render: (s) => `${s.renewalCount}/${s.maxRenewals}`,
    },
    {
      key: 'tokenIssuedCount',
      header: 'Tokens',
      render: (s) => String(s.tokenIssuedCount ?? 1),
    },
    { key: 'createdAt', header: 'Created', render: (s) => formatDate(s.createdAt) },
    {
      key: 'actions',
      header: 'Actions',
      render: (s) =>
        s.status === 'ACTIVE' ? (
          <div style={{ display: 'flex', gap: 'var(--space-1)' }}>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => handleReissue(s.id)}
              loading={reissueLoading.value === s.id}
            >
              Reissue
            </Button>
            <Button
              size="sm"
              variant="danger"
              onClick={() => openRevoke(s.id, revokeSessionId, revokeModal)}
            >
              Revoke
            </Button>
          </div>
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
                createModal.value = true;
              }}
              disabled={wallets.value.length === 0}
            >
              Create Session
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
            {/* Advanced Options — per-session TTL, renewals, lifetime */}
            <div style={{ marginTop: 'var(--space-3)' }}>
              <button
                type="button"
                onClick={() => { createAdvancedOpen.value = !createAdvancedOpen.value; }}
                style={{ background: 'none', border: 'none', color: 'var(--color-primary)', cursor: 'pointer', padding: 0, fontSize: '0.85rem' }}
              >
                {createAdvancedOpen.value ? 'Hide' : 'Show'} Advanced Options
              </button>
              {createAdvancedOpen.value && (
                <div style={{ marginTop: 'var(--space-2)', display: 'grid', gap: 'var(--space-2)' }}>
                  <FormField
                    label="TTL (days)"
                    name="create-ttl"
                    type="number"
                    value={createTtlDays.value}
                    onChange={(v) => { createTtlDays.value = String(v); }}
                    min={0}
                    description="Leave empty for unlimited session"
                    placeholder="Unlimited"
                  />
                  <FormField
                    label="Max Renewals"
                    name="create-max-renewals"
                    type="number"
                    value={createMaxRenewals.value}
                    onChange={(v) => { createMaxRenewals.value = String(v); }}
                    min={0}
                    description="0 = unlimited renewals"
                    placeholder="Unlimited"
                  />
                  <FormField
                    label="Absolute Lifetime (days)"
                    name="create-lifetime"
                    type="number"
                    value={createLifetimeDays.value}
                    onChange={(v) => { createLifetimeDays.value = String(v); }}
                    min={0}
                    description="Leave empty for unlimited lifetime"
                    placeholder="Unlimited"
                  />
                </div>
              )}
            </div>
          </Modal>

        </>
      )}

      {activeTab.value === 'settings' && <SessionSettingsTab />}
    </div>
  );
}
