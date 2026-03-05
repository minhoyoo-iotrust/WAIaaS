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

const SYSTEM_PREFIXES = ['display.', 'daemon.', 'oracle.', 'gas_condition.', 'smart_account.', 'erc8128.'];
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

  const ebv = (cat: string, key: string) =>
    getEffectiveBoolValuePure(settings.value, dirty.value, cat, key);

  const icc = (cat: string, key: string) =>
    isCredentialConfiguredPure(settings.value, dirty.value, cat, key);

  // Suppress unused variable warnings -- icc kept for consistency
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
          <div style={{ borderTop: '1px solid var(--border)', paddingTop: 'var(--space-3)', marginTop: 'var(--space-3)' }}>
            <FormField
              label="CoinGecko API Key"
              name="oracle.coingecko_api_key"
              type="password"
              value={icc('oracle', 'coingecko_api_key') ? '••••••••' : ''}
              onChange={(v) => handleFieldChange('oracle.coingecko_api_key', v)}
              placeholder="Enter CoinGecko Pro API key (optional)"
              description="Pro API key for higher rate limits. Free tier: ~30 req/min."
            />
          </div>
          <div class="settings-info-box">
            Maximum allowed deviation between price sources before flagging a discrepancy. Default is 5%.
            CoinGecko Pro API key increases rate limits for reliable price data.
            Get your API key from{' '}
            <a href="https://www.coingecko.com/en/api" target="_blank" rel="noopener noreferrer">CoinGecko API Dashboard</a>.
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
  // Section: Gas Condition
  // ---------------------------------------------------------------------------

  function GasConditionSection() {
    return (
      <div class="settings-category">
        <div class="settings-category-header">
          <h3>Gas Condition</h3>
          <p class="settings-description">
            Configure gas conditional execution for deferred transactions
          </p>
        </div>
        <div class="settings-category-body">
          <div class="settings-fields-grid">
            <FormField
              label="Gas Condition Enabled"
              name="gas_condition.enabled"
              type="select"
              value={ev('gas_condition', 'enabled') || 'true'}
              onChange={(v) => handleFieldChange('gas_condition.enabled', v)}
              options={[
                { label: 'Yes', value: 'true' },
                { label: 'No', value: 'false' },
              ]}
              description="Enable gas conditional execution for agents"
            />
            <FormField
              label={keyToLabel('poll_interval_sec')}
              name="gas_condition.poll_interval_sec"
              type="number"
              value={Number(ev('gas_condition', 'poll_interval_sec')) || 30}
              onChange={(v) => handleFieldChange('gas_condition.poll_interval_sec', v)}
              min={10}
              max={300}
              description="How often to check gas prices (seconds)"
            />
            <FormField
              label={keyToLabel('default_timeout_sec')}
              name="gas_condition.default_timeout_sec"
              type="number"
              value={Number(ev('gas_condition', 'default_timeout_sec')) || 3600}
              onChange={(v) => handleFieldChange('gas_condition.default_timeout_sec', v)}
              min={60}
              max={86400}
              description="Default wait timeout when not specified in request (seconds)"
            />
            <FormField
              label={keyToLabel('max_timeout_sec')}
              name="gas_condition.max_timeout_sec"
              type="number"
              value={Number(ev('gas_condition', 'max_timeout_sec')) || 86400}
              onChange={(v) => handleFieldChange('gas_condition.max_timeout_sec', v)}
              min={60}
              max={86400}
              description="Maximum allowed timeout for gas conditions (seconds)"
            />
            <FormField
              label={keyToLabel('max_pending_count')}
              name="gas_condition.max_pending_count"
              type="number"
              value={Number(ev('gas_condition', 'max_pending_count')) || 100}
              onChange={(v) => handleFieldChange('gas_condition.max_pending_count', v)}
              min={1}
              max={10000}
              description="Maximum number of concurrent GAS_WAITING transactions"
            />
          </div>
          <div class="settings-info-box">
            Gas conditional execution allows agents to specify gas price conditions.
            Transactions wait until gas prices fall below the specified threshold
            before executing.
          </div>
        </div>
      </div>
    );
  }

  function SmartAccountSection() {
    return (
      <div class="settings-category">
        <div class="settings-category-header">
          <h3>Smart Account (ERC-4337)</h3>
          <p class="settings-description">
            Global smart account feature toggle. Bundler and Paymaster are configured per-wallet.
          </p>
        </div>
        <div class="settings-category-body">
          <div class="settings-fields-grid">
            <FormField
              label="Enabled"
              name="smart_account.enabled"
              type="select"
              value={ev('smart_account', 'enabled') || 'false'}
              onChange={(v) => handleFieldChange('smart_account.enabled', v)}
              options={[
                { label: 'Yes', value: 'true' },
                { label: 'No', value: 'false' },
              ]}
              description="Enable smart account wallet creation. When disabled, only EOA wallets can be created."
              data-field="smart_account.enabled"
            />
            <FormField
              label="EntryPoint Address"
              name="smart_account.entry_point"
              value={ev('smart_account', 'entry_point')}
              onChange={(v) => handleFieldChange('smart_account.entry_point', v)}
              placeholder="0x0000000071727De22E5E9d8BAf0edAc6f37da032"
              description="EntryPoint v0.7 contract address. Override only if using a custom deployment."
              data-field="smart_account.entry_point"
            />
          </div>
          <div class="settings-info-box">
            Smart accounts enable gas-sponsored transactions via Paymaster, atomic batch execution,
            and lazy contract deployment. Bundler and Paymaster settings are configured individually
            on each wallet (Wallets → Edit → AA Provider).
          </div>
        </div>
      </div>
    );
  }

  function Erc8128Section() {
    return (
      <div class="settings-category">
        <div class="settings-category-header">
          <h3>ERC-8128 Signed HTTP Requests</h3>
          <p class="settings-description">
            Configure ERC-8128 HTTP message signing (RFC 9421 + EIP-191). Enables wallets to authenticate API requests with cryptographic signatures.
          </p>
        </div>
        <div class="settings-category-body">
          <div class="settings-fields-grid">
            <FormField
              label="Enabled"
              name="erc8128.enabled"
              type="select"
              value={ev('erc8128', 'enabled') || 'false'}
              onChange={(v) => handleFieldChange('erc8128.enabled', v)}
              options={[
                { label: 'Yes', value: 'true' },
                { label: 'No', value: 'false' },
              ]}
              description="Enable ERC-8128 HTTP message signing. When disabled, sign/verify endpoints return 403."
              data-field="erc8128.enabled"
            />
            <FormField
              label="Default Preset"
              name="erc8128.default_preset"
              type="select"
              value={ev('erc8128', 'default_preset') || 'standard'}
              onChange={(v) => handleFieldChange('erc8128.default_preset', v)}
              options={[
                { label: 'Minimal', value: 'minimal' },
                { label: 'Standard', value: 'standard' },
                { label: 'Strict', value: 'strict' },
              ]}
              description="Default covered components preset for signatures."
              data-field="erc8128.default_preset"
            />
            <FormField
              label="Default TTL (seconds)"
              name="erc8128.default_ttl_sec"
              value={ev('erc8128', 'default_ttl_sec') || '300'}
              onChange={(v) => handleFieldChange('erc8128.default_ttl_sec', v)}
              placeholder="300"
              description="Default signature TTL in seconds."
              data-field="erc8128.default_ttl_sec"
            />
            <FormField
              label="Include Nonce"
              name="erc8128.default_nonce"
              type="checkbox"
              value={ebv('erc8128', 'default_nonce')}
              onChange={(v) => handleFieldChange('erc8128.default_nonce', v)}
              description="Include a UUID v4 nonce in signatures by default for replay protection."
              data-field="erc8128.default_nonce"
            />
            <FormField
              label="Algorithm"
              name="erc8128.default_algorithm"
              value={ev('erc8128', 'default_algorithm') || 'ethereum-eip191'}
              onChange={(v) => handleFieldChange('erc8128.default_algorithm', v)}
              placeholder="ethereum-eip191"
              description="Signing algorithm. Currently only ethereum-eip191 (personal_sign) is supported."
              data-field="erc8128.default_algorithm"
            />
            <FormField
              label="Rate Limit (per minute)"
              name="erc8128.default_rate_limit_rpm"
              value={ev('erc8128', 'default_rate_limit_rpm') || '60'}
              onChange={(v) => handleFieldChange('erc8128.default_rate_limit_rpm', v)}
              placeholder="60"
              description="Maximum signing requests per domain per minute."
              data-field="erc8128.default_rate_limit_rpm"
            />
          </div>
          <div class="settings-info-box">
            ERC-8128 enables wallet-based HTTP API authentication using RFC 9421 message signatures
            signed with EIP-191 (personal_sign). Requires ERC8128_ALLOWED_DOMAINS policy for domain whitelisting.
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
          {/* 1. Oracle */}
          <OracleSection />

          {/* 3. Display Currency */}
          <DisplaySettings />

          {/* 4. Global IP Rate Limit */}
          <GlobalRateLimitSection />

          {/* 5. Log Level */}
          <LogLevelSection />

          {/* 6. Signing SDK -- moved to Human Wallet Apps page (v29.7) */}

          {/* 7. Gas Condition */}
          <GasConditionSection />

          {/* 8. Smart Account (ERC-4337) */}
          <SmartAccountSection />

          {/* 9. ERC-8128 Signed HTTP Requests */}
          <Erc8128Section />
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
