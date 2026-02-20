import { useSignal } from '@preact/signals';
import { useEffect } from 'preact/hooks';
import { apiGet, apiPost, apiPut, apiDelete, ApiError } from '../api/client';
import { API } from '../api/endpoints';
import { FormField, Button, Badge } from '../components/form';
import { CurrencySelect } from '../components/currency-select';
import { Modal } from '../components/modal';
import { showToast } from '../components/toast';
import { getErrorMessage } from '../utils/error-messages';
import {
  type SettingsData,
  type ApiKeyEntry,
  keyToLabel,
  getEffectiveValue as getEffectiveValuePure,
  getEffectiveBoolValue as getEffectiveBoolValuePure,
  isCredentialConfigured as isCredentialConfiguredPure,
} from '../utils/settings-helpers';
import { pendingNavigation, highlightField } from '../components/settings-search';
import { registerDirty, unregisterDirty } from '../utils/dirty-guard';

// ---------------------------------------------------------------------------
// System-relevant setting categories (used for save filtering)
// ---------------------------------------------------------------------------

const SYSTEM_PREFIXES = ['display.', 'daemon.', 'oracle.'];
const SYSTEM_EXACT_KEYS = new Set(['security.rate_limit_global_ip_rpm']);

function isSystemSetting(key: string): boolean {
  return SYSTEM_PREFIXES.some((p) => key.startsWith(p)) || SYSTEM_EXACT_KEYS.has(key);
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function SystemPage() {
  // --- Settings state ---
  const settings = useSignal<SettingsData>({});
  const dirty = useSignal<Record<string, string>>({});
  const saving = useSignal(false);
  const loading = useSignal(true);

  // --- API Keys state ---
  const apiKeys = useSignal<ApiKeyEntry[]>([]);
  const apiKeysLoading = useSignal(true);
  const apiKeyEditing = useSignal<string | null>(null);
  const apiKeyInput = useSignal('');
  const apiKeySaving = useSignal(false);

  // --- Shutdown state ---
  const shutdownModal = useSignal(false);
  const shutdownLoading = useSignal(false);
  const shutdownConfirmText = useSignal('');
  const isShutdown = useSignal(false);

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

  const fetchApiKeys = async () => {
    try {
      const result = await apiGet<{ keys: ApiKeyEntry[] }>(API.ADMIN_API_KEYS);
      apiKeys.value = result.keys;
    } catch {
      // Feature not available or no providers registered -- keep empty
    } finally {
      apiKeysLoading.value = false;
    }
  };

  useEffect(() => {
    fetchSettings();
    fetchApiKeys();
  }, []);

  useEffect(() => {
    const nav = pendingNavigation.value;
    if (nav) {
      setTimeout(() => {
        highlightField.value = nav.fieldName;
      }, 100);
      pendingNavigation.value = null;
    }
  }, [pendingNavigation.value]);

  // ---------------------------------------------------------------------------
  // Settings helpers (local wrappers around pure functions)
  // ---------------------------------------------------------------------------

  const ev = (cat: string, key: string) =>
    getEffectiveValuePure(settings.value, dirty.value, cat, key);

  const _ebv = (cat: string, key: string) =>
    getEffectiveBoolValuePure(settings.value, dirty.value, cat, key);

  const icc = (cat: string, key: string) =>
    isCredentialConfiguredPure(settings.value, dirty.value, cat, key);

  // Suppress unused variable warnings -- _ebv kept for consistency
  void _ebv;
  void icc;

  // ---------------------------------------------------------------------------
  // Field change / Save / Discard
  // ---------------------------------------------------------------------------

  const handleFieldChange = (fullKey: string, value: string | number | boolean) => {
    const strValue = typeof value === 'boolean' ? String(value) : String(value);
    dirty.value = { ...dirty.value, [fullKey]: strValue };
  };

  const handleSave = async () => {
    saving.value = true;
    try {
      // Filter dirty entries to only system-relevant categories
      const entries = Object.entries(dirty.value)
        .filter(([key]) => isSystemSetting(key))
        .map(([key, value]) => ({ key, value }));
      const result = await apiPut<{ updated: number; settings: SettingsData }>(API.ADMIN_SETTINGS, { settings: entries });
      settings.value = result.settings;
      dirty.value = {};
      showToast('success', 'Settings saved and applied');
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
      id: 'system-settings',
      isDirty: () => Object.keys(dirty.value).filter(k => isSystemSetting(k)).length > 0,
      save: handleSave,
      discard: handleDiscard,
    });
    return () => unregisterDirty('system-settings');
  }, []);

  // ---------------------------------------------------------------------------
  // API Key handlers
  // ---------------------------------------------------------------------------

  const handleSaveApiKey = async (providerName: string) => {
    apiKeySaving.value = true;
    try {
      await apiPut(API.ADMIN_API_KEY(providerName), { apiKey: apiKeyInput.value });
      showToast('success', `API key saved for ${providerName}`);
      apiKeyEditing.value = null;
      apiKeyInput.value = '';
      await fetchApiKeys();
    } catch (err) {
      const e = err instanceof ApiError ? err : new ApiError(0, 'UNKNOWN', 'Unknown error');
      showToast('error', getErrorMessage(e.code));
    } finally {
      apiKeySaving.value = false;
    }
  };

  const handleDeleteApiKey = async (providerName: string) => {
    try {
      await apiDelete(API.ADMIN_API_KEY(providerName));
      showToast('success', `API key deleted for ${providerName}`);
      await fetchApiKeys();
    } catch (err) {
      const e = err instanceof ApiError ? err : new ApiError(0, 'UNKNOWN', 'Unknown error');
      showToast('error', getErrorMessage(e.code));
    }
  };

  // ---------------------------------------------------------------------------
  // Shutdown handler
  // ---------------------------------------------------------------------------

  const handleShutdown = async () => {
    shutdownLoading.value = true;
    try {
      await apiPost<{ message: string }>(API.ADMIN_SHUTDOWN);
      shutdownModal.value = false;
      shutdownConfirmText.value = '';
      showToast('info', 'Shutdown initiated');
      isShutdown.value = true;
    } catch (err) {
      const e = err instanceof ApiError ? err : new ApiError(0, 'UNKNOWN', 'Unknown error');
      showToast('error', getErrorMessage(e.code));
    } finally {
      shutdownLoading.value = false;
    }
  };

  // ---------------------------------------------------------------------------
  // Render helpers
  // ---------------------------------------------------------------------------

  const systemDirtyCount = Object.keys(dirty.value).filter((k) => isSystemSetting(k)).length;

  // ---------------------------------------------------------------------------
  // Section: API Keys
  // ---------------------------------------------------------------------------

  function ApiKeysSection() {
    if (apiKeysLoading.value) {
      return <div class="settings-loading">Loading API keys...</div>;
    }
    if (apiKeys.value.length === 0) {
      return null;
    }

    return (
      <div class="settings-category">
        <div class="settings-category-header">
          <h3>API Keys</h3>
          <p class="settings-description">Manage API keys for Action Providers</p>
        </div>
        <div class="settings-category-body">
          {apiKeys.value.map((entry) => (
            <div class="settings-field-row" key={entry.providerName}>
              <div class="settings-field-label">
                <span>{entry.providerName}</span>
                {entry.requiresApiKey && !entry.hasKey && (
                  <Badge variant="warning">Required</Badge>
                )}
              </div>
              <div class="settings-field-value">
                {apiKeyEditing.value === entry.providerName ? (
                  <div class="api-key-edit-row">
                    <FormField
                      label="API Key"
                      type="password"
                      name={`apikey-${entry.providerName}`}
                      value={apiKeyInput.value}
                      onChange={(v) => { apiKeyInput.value = String(v); }}
                      placeholder="Enter API key"
                    />
                    <Button
                      onClick={() => handleSaveApiKey(entry.providerName)}
                      loading={apiKeySaving.value}
                      size="sm"
                    >Save</Button>
                    <Button
                      variant="ghost"
                      onClick={() => { apiKeyEditing.value = null; apiKeyInput.value = ''; }}
                      size="sm"
                    >Cancel</Button>
                  </div>
                ) : (
                  <div class="api-key-display-row">
                    <span class="api-key-masked">{entry.hasKey ? entry.maskedKey : 'Not set'}</span>
                    <Button
                      variant="ghost"
                      onClick={() => { apiKeyEditing.value = entry.providerName; apiKeyInput.value = ''; }}
                      size="sm"
                    >{entry.hasKey ? 'Change' : 'Set'}</Button>
                    {entry.hasKey && (
                      <Button
                        variant="danger"
                        onClick={() => handleDeleteApiKey(entry.providerName)}
                        size="sm"
                      >Delete</Button>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Section: Oracle
  // ---------------------------------------------------------------------------

  function OracleSection() {
    return (
      <div class="settings-category">
        <div class="settings-category-header">
          <h3>Oracle</h3>
          <p class="settings-description">Price oracle configuration for cross-validation</p>
        </div>
        <div class="settings-category-body">
          <div class="settings-fields-grid">
            <FormField
              label="Cross Validation Threshold (%)"
              name="oracle.cross_validation_threshold"
              type="number"
              value={Number(ev('oracle', 'cross_validation_threshold')) || 5}
              onChange={(v) => handleFieldChange('oracle.cross_validation_threshold', v)}
              min={0}
              max={100}
              description="Maximum allowed deviation between price oracle sources"
            />
          </div>
          <div class="settings-info-box">
            Maximum allowed deviation between price sources before flagging a discrepancy. Default is 5%.
          </div>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Section: Display Currency
  // ---------------------------------------------------------------------------

  function DisplaySettings() {
    const isCurrencyHighlighted = highlightField.value === 'display.currency';

    useEffect(() => {
      if (isCurrencyHighlighted) {
        const el = document.querySelector('[name="display.currency"]');
        if (el) {
          el.closest('.form-field')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
        const timer = setTimeout(() => {
          highlightField.value = '';
        }, 2500);
        return () => clearTimeout(timer);
      }
    }, [isCurrencyHighlighted]);

    return (
      <div class="settings-category">
        <div class="settings-category-header">
          <h3>Display Currency</h3>
          <p class="settings-description">Configure display currency for USD amount conversion</p>
        </div>
        <div class="settings-category-body">
          <div class="settings-fields-grid">
            <div class={`form-field${isCurrencyHighlighted ? ' form-field--highlight' : ''}`}>
              <label>{keyToLabel('currency')}</label>
              <CurrencySelect
                name="display.currency"
                value={ev('display', 'currency') || 'USD'}
                onChange={(code) => handleFieldChange('display.currency', code)}
              />
            </div>
          </div>
          <div class="settings-info-box">
            All USD amounts in the dashboard, notifications, and API responses will be
            converted to the selected currency. Policy evaluation always uses USD.
            The &ldquo;&asymp;&rdquo; prefix indicates an approximate conversion.
          </div>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Section: Global IP Rate Limit
  // ---------------------------------------------------------------------------

  function GlobalRateLimitSection() {
    return (
      <div class="settings-category">
        <div class="settings-category-header">
          <h3>Global IP Rate Limit</h3>
          <p class="settings-description">Maximum API requests per minute from a single IP address</p>
        </div>
        <div class="settings-category-body">
          <div class="settings-fields-grid">
            <FormField
              label={keyToLabel('rate_limit_global_ip_rpm')}
              name="security.rate_limit_global_ip_rpm"
              type="number"
              value={Number(ev('security', 'rate_limit_global_ip_rpm')) || 0}
              onChange={(v) => handleFieldChange('security.rate_limit_global_ip_rpm', v)}
              min={10}
              description="Maximum API requests per minute from a single IP address"
            />
          </div>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Section: Log Level
  // ---------------------------------------------------------------------------

  function LogLevelSection() {
    return (
      <div class="settings-category">
        <div class="settings-category-header">
          <h3>Log Level</h3>
          <p class="settings-description">General daemon configuration</p>
        </div>
        <div class="settings-category-body">
          <div class="settings-fields-grid">
            <FormField
              label={keyToLabel('log_level')}
              name="daemon.log_level"
              type="select"
              value={ev('daemon', 'log_level') || 'info'}
              onChange={(v) => handleFieldChange('daemon.log_level', v)}
              options={[
                { label: 'debug', value: 'debug' },
                { label: 'info', value: 'info' },
                { label: 'warn', value: 'warn' },
                { label: 'error', value: 'error' },
              ]}
              description="Daemon logging verbosity level"
            />
          </div>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Main render
  // ---------------------------------------------------------------------------

  return (
    <div class="page">
      {isShutdown.value && (
        <div class="shutdown-overlay">
          <h2>Daemon is shutting down...</h2>
          <p>You can close this tab.</p>
        </div>
      )}

      {/* Save bar -- sticky when dirty */}
      {systemDirtyCount > 0 && (
        <div class="settings-save-bar">
          <span>{systemDirtyCount} unsaved change{systemDirtyCount > 1 ? 's' : ''}</span>
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

      {/* Loading state */}
      {loading.value ? (
        <div class="empty-state">
          <p>Loading settings...</p>
        </div>
      ) : (
        <>
          {/* 1. API Keys */}
          <ApiKeysSection />

          {/* 2. Oracle */}
          <OracleSection />

          {/* 3. Display Currency */}
          <DisplaySettings />

          {/* 4. Global IP Rate Limit */}
          <GlobalRateLimitSection />

          {/* 5. Log Level */}
          <LogLevelSection />
        </>
      )}

      {/* 6. Danger Zone */}
      <div class="settings-section settings-section--danger">
        <div class="settings-section-header">
          <h3>Danger Zone</h3>
          <p class="settings-description">Irreversible actions. Proceed with caution.</p>
        </div>
        <div class="settings-section-body">
          <Button variant="danger" onClick={() => { shutdownModal.value = true; }}>
            Shutdown Daemon
          </Button>
        </div>
      </div>

      {/* Shutdown Double-Confirmation Modal */}
      <Modal
        open={shutdownModal.value}
        title="Shutdown Daemon"
        onCancel={() => {
          shutdownModal.value = false;
          shutdownConfirmText.value = '';
        }}
        onConfirm={handleShutdown}
        confirmText="Shutdown"
        confirmVariant="danger"
        confirmDisabled={shutdownConfirmText.value !== 'SHUTDOWN'}
        loading={shutdownLoading.value}
      >
        <p>
          This will gracefully stop the daemon process. All active connections
          will be terminated.
        </p>
        <div class="shutdown-confirm-input">
          <label>Type <strong>SHUTDOWN</strong> to confirm</label>
          <input
            type="text"
            value={shutdownConfirmText.value}
            onInput={(e) => {
              shutdownConfirmText.value = (e.target as HTMLInputElement).value;
            }}
            placeholder="SHUTDOWN"
          />
        </div>
      </Modal>
    </div>
  );
}
