import { useSignal } from '@preact/signals';
import { useEffect } from 'preact/hooks';
import { apiGet, apiPost, apiPut, ApiError } from '../api/client';
import { API } from '../api/endpoints';
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

const SECURITY_TABS = [
  { key: 'killswitch', label: 'Kill Switch' },
  { key: 'autostop', label: 'AutoStop Rules' },
  { key: 'jwt', label: 'Invalidate Sessions' },
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
      const result = await apiGet<KillSwitchState>(API.ADMIN_KILL_SWITCH);
      killSwitchState.value = result;
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
      await apiPost(API.ADMIN_KILL_SWITCH);
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
      await apiPost(API.ADMIN_KILL_SWITCH_ESCALATE);
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
      await apiPost(API.ADMIN_RECOVER);
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
      // Only send autostop-related dirty entries
      const entries = Object.entries(dirty.value)
        .filter(([key]) => key.startsWith('autostop.'))
        .map(([key, value]) => ({ key, value }));
      const result = await apiPut<{ updated: number; settings: SettingsData }>(API.ADMIN_SETTINGS, { settings: entries });
      settings.value = result.settings;
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
      await apiPost<{ rotatedAt: number; message: string }>(API.ADMIN_ROTATE_SECRET);
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
// Security Page Component
// ---------------------------------------------------------------------------

export default function SecurityPage() {
  const activeTab = useSignal('killswitch');

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
    </div>
  );
}
