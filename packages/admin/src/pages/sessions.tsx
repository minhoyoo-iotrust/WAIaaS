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

interface Wallet {
  id: string;
  name: string;
  chain: string;
  network: string;
  publicKey: string;
  status: string;
  createdAt: number;
}

interface Session {
  id: string;
  walletId: string;
  walletName: string | null;
  status: string;
  renewalCount: number;
  maxRenewals: number;
  expiresAt: number;
  absoluteExpiresAt: number;
  createdAt: number;
  lastRenewedAt: number | null;
}

interface CreatedSession {
  id: string;
  token: string;
  expiresAt: number;
  walletId: string;
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
      await apiPut(API.ADMIN_SETTINGS, { settings: entries });
      dirty.value = {};
      await fetchSettings();
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
              />
              <FormField
                label={keyToLabel('session_absolute_lifetime')}
                name="security.session_absolute_lifetime"
                type="number"
                value={Number(getEffectiveValue(settings.value, dirty.value, 'security', 'session_absolute_lifetime')) || 0}
                onChange={(v) => handleFieldChange('security.session_absolute_lifetime', v)}
                min={0}
              />
              <FormField
                label={keyToLabel('session_max_renewals')}
                name="security.session_max_renewals"
                type="number"
                value={Number(getEffectiveValue(settings.value, dirty.value, 'security', 'session_max_renewals')) || 0}
                onChange={(v) => handleFieldChange('security.session_max_renewals', v)}
                min={0}
              />
              <FormField
                label={keyToLabel('max_sessions_per_wallet')}
                name="security.max_sessions_per_wallet"
                type="number"
                value={Number(getEffectiveValue(settings.value, dirty.value, 'security', 'max_sessions_per_wallet')) || 0}
                onChange={(v) => handleFieldChange('security.max_sessions_per_wallet', v)}
                min={1}
                max={100}
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
              />
              <FormField
                label={keyToLabel('rate_limit_session_rpm')}
                name="security.rate_limit_session_rpm"
                type="number"
                value={Number(getEffectiveValue(settings.value, dirty.value, 'security', 'rate_limit_session_rpm')) || 0}
                onChange={(v) => handleFieldChange('security.rate_limit_session_rpm', v)}
                min={10}
              />
              <FormField
                label={keyToLabel('rate_limit_tx_rpm')}
                name="security.rate_limit_tx_rpm"
                type="number"
                value={Number(getEffectiveValue(settings.value, dirty.value, 'security', 'rate_limit_tx_rpm')) || 0}
                onChange={(v) => handleFieldChange('security.rate_limit_tx_rpm', v)}
                min={1}
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
  const sessions = useSignal<Session[]>([]);
  const loading = useSignal(false);
  const walletsLoading = useSignal(true);
  const createLoading = useSignal(false);
  const tokenModal = useSignal(false);
  const createdToken = useSignal('');
  const revokeModal = useSignal(false);
  const revokeSessionId = useSignal('');
  const revokeLoading = useSignal(false);

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

  const handleCreate = async () => {
    createLoading.value = true;
    try {
      const result = await apiPost<CreatedSession>(API.SESSIONS, {
        walletId: selectedWalletId.value,
      });
      createdToken.value = result.token;
      tokenModal.value = true;
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
      render: (s) => s.walletName ?? s.walletId.slice(0, 8) + '...',
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
            <Button
              onClick={handleCreate}
              disabled={!selectedWalletId.value}
              loading={createLoading.value}
            >
              Create Session
            </Button>
          </div>

          <Table<Session>
            columns={sessionColumns}
            data={sessions.value}
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
        </>
      )}

      {activeTab.value === 'settings' && <SessionSettingsTab />}
    </div>
  );
}
