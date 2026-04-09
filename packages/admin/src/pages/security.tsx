import { useSignal } from '@preact/signals';
import { useEffect } from 'preact/hooks';
import { api, ApiError } from '../api/typed-client';
import { logout } from '../auth/store';
import { isDesktop } from '../utils/platform';
import { FormField, Button, Badge } from '../components/form';
import { Modal } from '../components/modal';
import { TabNav } from '../components/tab-nav';
import { Breadcrumb } from '../components/breadcrumb';
import { showToast } from '../components/toast';
import { getErrorMessage } from '../utils/error-messages';
import { formatDate } from '../utils/format';
import {
  type SettingsData,
  type KillSwitchState,
  keyToLabel,
  getEffectiveValue,
  getEffectiveBoolValue,
} from '../utils/settings-helpers';
import { FieldGroup } from '../components/field-group';
import { pendingNavigation, highlightField } from '../components/settings-search';
import { registerDirty, unregisterDirty } from '../utils/dirty-guard';

// ---------------------------------------------------------------------------
// Tab definitions
// ---------------------------------------------------------------------------

// Issue 491: the Master Password tab is hidden in Desktop mode because we
// don't have a way to persist the user-chosen password for the sidecar
// auto-login to pick up on the next launch (no OS Keychain integration yet).
// Users who need to manage the master password should use the `waiaas`
// CLI against the same data directory.
const SECURITY_TABS = isDesktop()
  ? [
      { key: 'killswitch', label: 'Kill Switch' },
      { key: 'autostop', label: 'AutoStop Rules' },
      { key: 'jwt', label: 'Invalidate Sessions' },
    ]
  : [
      { key: 'killswitch', label: 'Kill Switch' },
      { key: 'autostop', label: 'AutoStop Rules' },
      { key: 'jwt', label: 'Invalidate Sessions' },
      { key: 'password', label: 'Master Password' },
    ];

// ---------------------------------------------------------------------------
// Kill Switch Tab
// ---------------------------------------------------------------------------

function KillSwitchTab() {
  const killSwitchState = useSignal<KillSwitchState | null>(null);
  const ksLoading = useSignal(true);
  const ksActionLoading = useSignal(false);

  const fetchKillSwitchState = async () => {
    try {
      const { data } = await api.GET('/v1/admin/kill-switch');
      killSwitchState.value = data!;
    } catch (err) {
      const e = err instanceof ApiError ? err : new ApiError(0, 'UNKNOWN', 'Unknown error');
      showToast('error', getErrorMessage(e.code));
    } finally {
      ksLoading.value = false;
    }
  };

  useEffect(() => {
    fetchKillSwitchState();
  }, []);

  const handleKillSwitchActivate = async () => {
    ksActionLoading.value = true;
    try {
      await api.POST('/v1/admin/kill-switch');
      showToast('success', 'Kill switch activated - all operations suspended');
      await fetchKillSwitchState();
    } catch (err) {
      const e = err instanceof ApiError ? err : new ApiError(0, 'UNKNOWN', 'Unknown error');
      showToast('error', getErrorMessage(e.code));
    } finally {
      ksActionLoading.value = false;
    }
  };

  const handleKillSwitchEscalate = async () => {
    ksActionLoading.value = true;
    try {
      await api.POST('/v1/admin/kill-switch/escalate');
      showToast('success', 'Kill switch escalated to LOCKED');
      await fetchKillSwitchState();
    } catch (err) {
      const e = err instanceof ApiError ? err : new ApiError(0, 'UNKNOWN', 'Unknown error');
      showToast('error', getErrorMessage(e.code));
    } finally {
      ksActionLoading.value = false;
    }
  };

  const handleKillSwitchRecover = async () => {
    ksActionLoading.value = true;
    try {
      await api.POST('/v1/admin/recover');
      showToast('success', 'Kill switch recovered - operations resumed');
      await fetchKillSwitchState();
    } catch (err) {
      const e = err instanceof ApiError ? err : new ApiError(0, 'UNKNOWN', 'Unknown error');
      showToast('error', getErrorMessage(e.code));
    } finally {
      ksActionLoading.value = false;
    }
  };

  const ksState = killSwitchState.value;
  const isActive = ksState?.state === 'ACTIVE';
  const isSuspended = ksState?.state === 'SUSPENDED';
  const isLocked = ksState?.state === 'LOCKED';

  return (
    <div class="settings-category">
      <div class="settings-category-header">
        <h3>Kill Switch</h3>
        <p class="settings-description">
          Emergency stop - suspends all wallet operations immediately.
          3-state: ACTIVE (normal) → SUSPENDED (paused) → LOCKED (permanent).
        </p>
      </div>
      <div class="settings-category-body">
        {ksLoading.value ? (
          <span>Loading...</span>
        ) : ksState ? (
          <>
            {/* State indicator card */}
            <div class="ks-state-card" style={{ marginBottom: 'var(--space-4)' }}>
              <Badge variant={isActive ? 'success' : isLocked ? 'danger' : 'warning'}>
                {ksState.state}
              </Badge>
              {!isActive && ksState.activatedAt && (
                <span class="ks-state-info">
                  Since {formatDate(ksState.activatedAt)}
                  {ksState.activatedBy ? ` by ${ksState.activatedBy}` : ''}
                </span>
              )}
            </div>

            {/* Action buttons based on current state */}
            <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
              {isActive && (
                <Button
                  variant="danger"
                  onClick={handleKillSwitchActivate}
                  loading={ksActionLoading.value}
                >
                  Activate Kill Switch
                </Button>
              )}

              {isSuspended && (
                <>
                  <Button
                    variant="primary"
                    onClick={handleKillSwitchRecover}
                    loading={ksActionLoading.value}
                  >
                    Recover
                  </Button>
                  <Button
                    variant="danger"
                    onClick={handleKillSwitchEscalate}
                    loading={ksActionLoading.value}
                  >
                    Escalate to LOCKED
                  </Button>
                </>
              )}

              {isLocked && (
                <Button
                  variant="primary"
                  onClick={handleKillSwitchRecover}
                  loading={ksActionLoading.value}
                >
                  Recover from LOCKED (5s wait)
                </Button>
              )}
            </div>

            {/* State description */}
            {isSuspended && (
              <div class="settings-info-box" style={{ marginTop: 'var(--space-3)' }}>
                All wallet operations are suspended. Sessions revoked, transactions cancelled.
                You can Recover to resume operations, or Escalate to LOCKED for permanent lockdown.
              </div>
            )}
            {isLocked && (
              <div class="settings-info-box" style={{ marginTop: 'var(--space-3)', borderColor: 'var(--color-danger)' }}>
                System is permanently locked. Recovery requires dual-auth (Owner signature + Master password)
                and has a mandatory 5-second wait period.
              </div>
            )}
          </>
        ) : null}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// AutoStop Rules Tab
// ---------------------------------------------------------------------------

function AutoStopTab() {
  const settings = useSignal<SettingsData>({});
  const dirty = useSignal<Record<string, string>>({});
  const saving = useSignal(false);
  const loading = useSignal(true);

  const fetchSettings = async () => {
    try {
      const { data } = await api.GET('/v1/admin/settings');
      settings.value = data as unknown as SettingsData;
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
      // Only send autostop-related dirty entries
      const entries = Object.entries(dirty.value)
        .filter(([key]) => key.startsWith('autostop.'))
        .map(([key, value]) => ({ key, value }));
      const { data: result } = await api.PUT('/v1/admin/settings', { body: { settings: entries } });
      settings.value = result!.settings as unknown as SettingsData;
      dirty.value = {};
      showToast('success', 'AutoStop settings saved and applied');
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
      id: 'security-autostop',
      isDirty: () => Object.keys(dirty.value).filter(k => k.startsWith('autostop.')).length > 0,
      save: handleSave,
      discard: handleDiscard,
    });
    return () => unregisterDirty('security-autostop');
  }, []);

  const dirtyCount = Object.keys(dirty.value).filter((k) => k.startsWith('autostop.')).length;

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
          <h3>AutoStop Rules</h3>
          <p class="settings-description">
            Automatic protection rules that suspend wallets or trigger Kill Switch on anomalies.
            Changes apply immediately without daemon restart.
          </p>
        </div>
        <div class="settings-category-body">
          {/* Enabled toggle at top, outside FieldGroups */}
          <div class="settings-field-full" style={{ marginBottom: 'var(--space-4)' }}>
            <FormField
              label={keyToLabel('enabled')}
              name="autostop.enabled"
              type="checkbox"
              value={getEffectiveBoolValue(settings.value, dirty.value, 'autostop', 'enabled')}
              onChange={(v) => handleFieldChange('autostop.enabled', v)}
              description="Enable or disable AutoStop protection rules"
            />
          </div>

          <FieldGroup legend="Activity Detection" description="Detects failures and unusual transaction patterns">
            <div class="settings-fields-grid">
              <FormField
                label={keyToLabel('consecutive_failures_threshold')}
                name="autostop.consecutive_failures_threshold"
                type="number"
                value={Number(getEffectiveValue(settings.value, dirty.value, 'autostop', 'consecutive_failures_threshold')) || 0}
                onChange={(v) => handleFieldChange('autostop.consecutive_failures_threshold', v)}
                min={1}
                max={100}
                description="Suspend wallet after this many consecutive failed transactions"
              />
              <FormField
                label={keyToLabel('unusual_activity_threshold')}
                name="autostop.unusual_activity_threshold"
                type="number"
                value={Number(getEffectiveValue(settings.value, dirty.value, 'autostop', 'unusual_activity_threshold')) || 0}
                onChange={(v) => handleFieldChange('autostop.unusual_activity_threshold', v)}
                min={5}
                max={1000}
                description="Max transactions within window before triggering unusual activity alert"
              />
              <FormField
                label={keyToLabel('unusual_activity_window_sec')}
                name="autostop.unusual_activity_window_sec"
                type="number"
                value={Number(getEffectiveValue(settings.value, dirty.value, 'autostop', 'unusual_activity_window_sec')) || 0}
                onChange={(v) => handleFieldChange('autostop.unusual_activity_window_sec', v)}
                min={60}
                max={86400}
                description="Time window for unusual activity detection"
              />
            </div>
          </FieldGroup>

          <FieldGroup legend="Idle Detection" description="Monitors inactivity and revokes idle sessions">
            <div class="settings-fields-grid">
              <FormField
                label={keyToLabel('idle_timeout_sec')}
                name="autostop.idle_timeout_sec"
                type="number"
                value={Number(getEffectiveValue(settings.value, dirty.value, 'autostop', 'idle_timeout_sec')) || 0}
                onChange={(v) => handleFieldChange('autostop.idle_timeout_sec', v)}
                min={60}
                max={604800}
                description="Revoke sessions with no activity for this duration"
              />
              <FormField
                label={keyToLabel('idle_check_interval_sec')}
                name="autostop.idle_check_interval_sec"
                type="number"
                value={Number(getEffectiveValue(settings.value, dirty.value, 'autostop', 'idle_check_interval_sec')) || 0}
                onChange={(v) => handleFieldChange('autostop.idle_check_interval_sec', v)}
                min={10}
                max={3600}
                description="How often to check for idle sessions"
              />
            </div>
          </FieldGroup>

          <div class="settings-info-box">
            <strong>Consecutive Failures:</strong> Suspends wallet after N consecutive failed transactions.<br />
            <strong>Unusual Activity:</strong> Suspends wallet if transaction count exceeds threshold within the time window.<br />
            <strong>Idle Timeout:</strong> Revokes sessions with no activity for the configured duration.
          </div>
        </div>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// JWT Rotation Tab
// ---------------------------------------------------------------------------

function JwtRotationTab() {
  const rotateModal = useSignal(false);
  const rotateLoading = useSignal(false);

  const handleRotate = async () => {
    rotateLoading.value = true;
    try {
      await api.POST('/v1/admin/rotate-secret');
      rotateModal.value = false;
      showToast('success', 'All session tokens invalidated. Old tokens remain valid for 5 minutes.');
    } catch (err) {
      const e = err instanceof ApiError ? err : new ApiError(0, 'UNKNOWN', 'Unknown error');
      showToast('error', getErrorMessage(e.code));
    } finally {
      rotateLoading.value = false;
    }
  };

  return (
    <>
      <div class="settings-section">
        <div class="settings-section-header">
          <h3>Invalidate All Session Tokens</h3>
          <p class="settings-description">Revoke all active session tokens by rotating the signing key. Existing tokens remain valid for 5 minutes, then all wallets must create new sessions.</p>
        </div>
        <div class="settings-section-body">
          <Button variant="secondary" onClick={() => { rotateModal.value = true; }}>
            Invalidate All Tokens
          </Button>
        </div>
      </div>

      {/* JWT Rotation Confirmation Modal */}
      <Modal
        open={rotateModal.value}
        title="Invalidate All Session Tokens"
        onCancel={() => { rotateModal.value = false; }}
        onConfirm={handleRotate}
        confirmText="Invalidate"
        confirmVariant="primary"
        loading={rotateLoading.value}
      >
        <p>
          This will rotate the signing key and invalidate all active session tokens
          after 5 minutes. Every wallet will need to create a new session to continue
          API access. Use this when a token may have been compromised.
        </p>
      </Modal>
    </>
  );
}

// ---------------------------------------------------------------------------
// Master Password Tab
// ---------------------------------------------------------------------------

function MasterPasswordTab() {
  const currentPw = useSignal('');
  const newPw = useSignal('');
  const confirmPw = useSignal('');
  const saving = useSignal(false);
  const validationError = useSignal<string | null>(null);

  const validate = (): boolean => {
    if (newPw.value.length < 8) {
      validationError.value = 'New password must be at least 8 characters.';
      return false;
    }
    if (newPw.value !== confirmPw.value) {
      validationError.value = 'New password and confirmation do not match.';
      return false;
    }
    validationError.value = null;
    return true;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    saving.value = true;
    try {
      await api.PUT('/v1/admin/master-password', { body: { newPassword: newPw.value } });
      showToast('success', 'Master password changed. Please log in again.');
      // Clear form before logout
      currentPw.value = '';
      newPw.value = '';
      confirmPw.value = '';
      setTimeout(() => logout(), 500);
    } catch (err) {
      const e = err instanceof ApiError ? err : new ApiError(0, 'UNKNOWN', 'Unknown error');
      showToast('error', getErrorMessage(e.code));
    } finally {
      saving.value = false;
    }
  };

  return (
    <div class="settings-category">
      <div class="settings-category-header">
        <h3>Change Master Password</h3>
        <p class="settings-description">
          Update the master password used to authenticate with the Admin UI.
          You will be logged out after a successful change.
        </p>
      </div>
      <div class="settings-category-body">
        {validationError.value && (
          <div class="settings-info-box" style={{ borderColor: 'var(--color-danger)', color: 'var(--color-danger)', marginBottom: 'var(--space-3)' }}>
            {validationError.value}
          </div>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', maxWidth: '400px' }}>
          <FormField
            label="Current Password"
            name="current-password"
            type="password"
            value={currentPw.value}
            onChange={(v) => { currentPw.value = String(v); }}
          />
          <FormField
            label="New Password"
            name="new-password"
            type="password"
            value={newPw.value}
            onChange={(v) => { newPw.value = String(v); }}
            description="Minimum 8 characters"
          />
          <FormField
            label="Confirm New Password"
            name="confirm-password"
            type="password"
            value={confirmPw.value}
            onChange={(v) => { confirmPw.value = String(v); }}
          />
          <div>
            <Button
              variant="primary"
              onClick={handleSubmit}
              loading={saving.value}
              disabled={!currentPw.value || !newPw.value || !confirmPw.value}
            >
              Change Password
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Security Page Component
// ---------------------------------------------------------------------------

export default function SecurityPage() {
  // Check URL query params for initial tab (e.g. #/security?tab=password)
  const initialTab = (() => {
    const hash = location.hash;
    const qIdx = hash.indexOf('?');
    if (qIdx >= 0) {
      const params = new URLSearchParams(hash.slice(qIdx + 1));
      const t = params.get('tab');
      if (t && SECURITY_TABS.some((st) => st.key === t)) return t;
    }
    return 'killswitch';
  })();

  const activeTab = useSignal(initialTab);

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

  // Tab label lookup for Breadcrumb
  const activeTabLabel = SECURITY_TABS.find((t) => t.key === activeTab.value)?.label ?? '';

  return (
    <div class="page">
      <Breadcrumb
        pageName="Security"
        tabName={activeTabLabel}
        onPageClick={() => { activeTab.value = 'killswitch'; }}
      />
      <TabNav
        tabs={SECURITY_TABS}
        activeTab={activeTab.value}
        onTabChange={(key) => { activeTab.value = key; }}
      />
      {activeTab.value === 'killswitch' && <KillSwitchTab />}
      {activeTab.value === 'autostop' && <AutoStopTab />}
      {activeTab.value === 'jwt' && <JwtRotationTab />}
      {activeTab.value === 'password' && <MasterPasswordTab />}
    </div>
  );
}
