import { useSignal } from '@preact/signals';
import { useEffect } from 'preact/hooks';
import { apiGet, apiPost, apiPut, ApiError } from '../api/client';
import { API } from '../api/endpoints';
import { FormField, Button, Badge } from '../components/form';
import { Modal } from '../components/modal';
import { showToast } from '../components/toast';
import { getErrorMessage } from '../utils/error-messages';
import { formatDate } from '../utils/format';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface KillSwitchState {
  state: string;
  activatedAt: number | null;
  activatedBy: string | null;
}

type SettingsData = Record<string, Record<string, string | boolean>>;

interface RpcTestResult {
  success: boolean;
  latencyMs: number;
  blockNumber?: number;
  error?: string;
}

interface NotifTestResult {
  channel: string;
  success: boolean;
  error?: string;
}

// ---------------------------------------------------------------------------
// Field metadata helpers
// ---------------------------------------------------------------------------

/** Credential fields come back as boolean from GET. These are the known credential keys. */
const CREDENTIAL_KEYS = new Set([
  'notifications.telegram_bot_token',
  'notifications.discord_webhook_url',
]);

function isCredentialField(fullKey: string): boolean {
  return CREDENTIAL_KEYS.has(fullKey);
}

/** Human-readable label from a setting key */
function keyToLabel(key: string): string {
  const map: Record<string, string> = {
    enabled: 'Enabled',
    telegram_bot_token: 'Telegram Bot Token',
    telegram_chat_id: 'Telegram Chat ID',
    discord_webhook_url: 'Discord Webhook URL',
    ntfy_server: 'Ntfy Server',
    ntfy_topic: 'Ntfy Topic',
    locale: 'Locale',
    rate_limit_rpm: 'Rate Limit (RPM)',
    solana_mainnet: 'Solana Mainnet',
    solana_devnet: 'Solana Devnet',
    solana_testnet: 'Solana Testnet',
    evm_ethereum_mainnet: 'Ethereum Mainnet',
    evm_ethereum_sepolia: 'Ethereum Sepolia',
    evm_polygon_mainnet: 'Polygon Mainnet',
    evm_polygon_amoy: 'Polygon Amoy',
    evm_arbitrum_mainnet: 'Arbitrum Mainnet',
    evm_arbitrum_sepolia: 'Arbitrum Sepolia',
    evm_optimism_mainnet: 'Optimism Mainnet',
    evm_optimism_sepolia: 'Optimism Sepolia',
    evm_base_mainnet: 'Base Mainnet',
    evm_base_sepolia: 'Base Sepolia',
    evm_default_network: 'Default EVM Network',
    session_ttl: 'Session TTL (seconds)',
    max_sessions_per_wallet: 'Max Sessions per Wallet',
    max_pending_tx: 'Max Pending Transactions',
    rate_limit_global_ip_rpm: 'Global IP Rate Limit (RPM)',
    rate_limit_session_rpm: 'Session Rate Limit (RPM)',
    rate_limit_tx_rpm: 'Transaction Rate Limit (RPM)',
    policy_defaults_delay_seconds: 'Policy Delay (seconds)',
    policy_defaults_approval_timeout: 'Approval Timeout (seconds)',
    default_deny_tokens: 'Default Deny: Token Transfers',
    default_deny_contracts: 'Default Deny: Contract Calls',
    default_deny_spenders: 'Default Deny: Token Approvals',
    project_id: 'Project ID',
    log_level: 'Log Level',
  };
  return map[key] ?? key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function SettingsPage() {
  // --- Settings state ---
  const settings = useSignal<SettingsData>({});
  const dirty = useSignal<Record<string, string>>({});
  const saving = useSignal(false);
  const loading = useSignal(true);
  const rpcTestResults = useSignal<Record<string, RpcTestResult>>({});
  const rpcTesting = useSignal<Record<string, boolean>>({});
  const notifTestResults = useSignal<NotifTestResult[]>([]);
  const notifTesting = useSignal(false);

  // --- Existing kill switch / rotate / shutdown state ---
  const killSwitchState = useSignal<KillSwitchState | null>(null);
  const ksLoading = useSignal(true);
  const ksActionLoading = useSignal(false);
  const rotateModal = useSignal(false);
  const rotateLoading = useSignal(false);
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
    fetchSettings();
    fetchKillSwitchState();
  }, []);

  // ---------------------------------------------------------------------------
  // Save / Discard
  // ---------------------------------------------------------------------------

  const handleSave = async () => {
    saving.value = true;
    try {
      const entries = Object.entries(dirty.value).map(([key, value]) => ({ key, value }));
      await apiPut(API.ADMIN_SETTINGS, { settings: entries });
      dirty.value = {};
      await fetchSettings();
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

  // ---------------------------------------------------------------------------
  // Field change
  // ---------------------------------------------------------------------------

  const handleFieldChange = (fullKey: string, value: string | number | boolean) => {
    const strValue = typeof value === 'boolean' ? String(value) : String(value);
    dirty.value = { ...dirty.value, [fullKey]: strValue };
  };

  /** Get effective display value for a field */
  const getEffectiveValue = (category: string, shortKey: string): string => {
    const fullKey = `${category}.${shortKey}`;
    if (dirty.value[fullKey] !== undefined) {
      return dirty.value[fullKey];
    }
    const catData = settings.value[category];
    if (!catData) return '';
    const catValue = catData[shortKey];
    if (typeof catValue === 'boolean') {
      // Credential fields: boolean indicates presence, not actual value
      if (isCredentialField(fullKey)) return '';
      return String(catValue);
    }
    return catValue ?? '';
  };

  /** Get effective boolean value (for checkbox fields) */
  const getEffectiveBoolValue = (category: string, shortKey: string): boolean => {
    const fullKey = `${category}.${shortKey}`;
    if (dirty.value[fullKey] !== undefined) {
      return dirty.value[fullKey] === 'true';
    }
    const catData = settings.value[category];
    if (!catData) return false;
    const catValue = catData[shortKey];
    if (typeof catValue === 'boolean') return catValue;
    return catValue === 'true';
  };

  /** Check if a credential field is configured (GET returned true) */
  const isCredentialConfigured = (category: string, shortKey: string): boolean => {
    const fullKey = `${category}.${shortKey}`;
    if (dirty.value[fullKey] !== undefined) return false; // user is editing
    const catData = settings.value[category];
    if (!catData) return false;
    return catData[shortKey] === true;
  };

  // ---------------------------------------------------------------------------
  // RPC Test
  // ---------------------------------------------------------------------------

  const handleRpcTest = async (settingKey: string) => {
    const shortKey = settingKey.split('.')[1] ?? '';
    const effectiveUrl = getEffectiveValue('rpc', shortKey);
    if (!effectiveUrl) {
      showToast('warning', 'Enter a URL before testing');
      return;
    }

    const chain = shortKey.startsWith('solana') ? 'solana' : 'evm';

    rpcTesting.value = { ...rpcTesting.value, [settingKey]: true };
    try {
      const result = await apiPost<RpcTestResult>(API.ADMIN_SETTINGS_TEST_RPC, { url: effectiveUrl, chain });
      rpcTestResults.value = { ...rpcTestResults.value, [settingKey]: result };
    } catch (err) {
      rpcTestResults.value = {
        ...rpcTestResults.value,
        [settingKey]: { success: false, latencyMs: 0, error: 'Request failed' },
      };
    } finally {
      rpcTesting.value = { ...rpcTesting.value, [settingKey]: false };
    }
  };

  // ---------------------------------------------------------------------------
  // Notification Test
  // ---------------------------------------------------------------------------

  const handleNotifTest = async () => {
    notifTesting.value = true;
    notifTestResults.value = [];
    try {
      const result = await apiPost<{ results: NotifTestResult[] }>(API.ADMIN_NOTIFICATIONS_TEST);
      notifTestResults.value = result.results;
      if (result.results.length === 0) {
        showToast('info', 'No notification channels configured');
      } else {
        const allOk = result.results.every((r) => r.success);
        showToast(allOk ? 'success' : 'warning', allOk ? 'All test notifications sent' : 'Some channels failed');
      }
    } catch (err) {
      const e = err instanceof ApiError ? err : new ApiError(0, 'UNKNOWN', 'Unknown error');
      showToast('error', getErrorMessage(e.code));
    } finally {
      notifTesting.value = false;
    }
  };

  // ---------------------------------------------------------------------------
  // Kill Switch / Rotate / Shutdown handlers (unchanged)
  // ---------------------------------------------------------------------------

  const handleKillSwitchToggle = async () => {
    ksActionLoading.value = true;
    const isActivated = killSwitchState.value?.state === 'ACTIVATED';
    try {
      if (isActivated) {
        await apiPost(API.ADMIN_RECOVER);
        showToast('success', 'Kill switch recovered');
      } else {
        await apiPost(API.ADMIN_KILL_SWITCH);
        showToast('success', 'Kill switch activated');
      }
      await fetchKillSwitchState();
    } catch (err) {
      const e = err instanceof ApiError ? err : new ApiError(0, 'UNKNOWN', 'Unknown error');
      showToast('error', getErrorMessage(e.code));
    } finally {
      ksActionLoading.value = false;
    }
  };

  const handleRotate = async () => {
    rotateLoading.value = true;
    try {
      await apiPost<{ rotatedAt: number; message: string }>(API.ADMIN_ROTATE_SECRET);
      rotateModal.value = false;
      showToast('success', 'JWT secret rotated. Old tokens valid for 5 minutes.');
    } catch (err) {
      const e = err instanceof ApiError ? err : new ApiError(0, 'UNKNOWN', 'Unknown error');
      showToast('error', getErrorMessage(e.code));
    } finally {
      rotateLoading.value = false;
    }
  };

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

  const dirtyCount = Object.keys(dirty.value).length;
  const ksState = killSwitchState.value;
  const isActivated = ksState?.state === 'ACTIVATED';

  // ---------------------------------------------------------------------------
  // Section: Notifications
  // ---------------------------------------------------------------------------

  function NotificationSettings() {
    return (
      <div class="settings-category">
        <div class="settings-category-header">
          <h3>Notifications</h3>
          <p class="settings-description">Configure notification channels for transaction alerts</p>
        </div>
        <div class="settings-category-body">
          <div class="settings-fields-grid">
            <div class="settings-field-full">
              <FormField
                label="Enabled"
                name="notifications.enabled"
                type="checkbox"
                value={getEffectiveBoolValue('notifications', 'enabled')}
                onChange={(v) => handleFieldChange('notifications.enabled', v)}
              />
            </div>

            <FormField
              label={keyToLabel('telegram_bot_token')}
              name="notifications.telegram_bot_token"
              type="password"
              value={getEffectiveValue('notifications', 'telegram_bot_token')}
              onChange={(v) => handleFieldChange('notifications.telegram_bot_token', v)}
              placeholder={isCredentialConfigured('notifications', 'telegram_bot_token') ? '(configured)' : ''}
            />

            <FormField
              label={keyToLabel('telegram_chat_id')}
              name="notifications.telegram_chat_id"
              type="text"
              value={getEffectiveValue('notifications', 'telegram_chat_id')}
              onChange={(v) => handleFieldChange('notifications.telegram_chat_id', v)}
            />

            <FormField
              label={keyToLabel('discord_webhook_url')}
              name="notifications.discord_webhook_url"
              type="password"
              value={getEffectiveValue('notifications', 'discord_webhook_url')}
              onChange={(v) => handleFieldChange('notifications.discord_webhook_url', v)}
              placeholder={isCredentialConfigured('notifications', 'discord_webhook_url') ? '(configured)' : ''}
            />

            <FormField
              label={keyToLabel('ntfy_server')}
              name="notifications.ntfy_server"
              type="text"
              value={getEffectiveValue('notifications', 'ntfy_server')}
              onChange={(v) => handleFieldChange('notifications.ntfy_server', v)}
            />

            <FormField
              label={keyToLabel('ntfy_topic')}
              name="notifications.ntfy_topic"
              type="text"
              value={getEffectiveValue('notifications', 'ntfy_topic')}
              onChange={(v) => handleFieldChange('notifications.ntfy_topic', v)}
            />

            <FormField
              label={keyToLabel('locale')}
              name="notifications.locale"
              type="select"
              value={getEffectiveValue('notifications', 'locale') || 'en'}
              onChange={(v) => handleFieldChange('notifications.locale', v)}
              options={[
                { label: 'English', value: 'en' },
                { label: 'Korean', value: 'ko' },
              ]}
            />

            <FormField
              label={keyToLabel('rate_limit_rpm')}
              name="notifications.rate_limit_rpm"
              type="number"
              value={Number(getEffectiveValue('notifications', 'rate_limit_rpm')) || 20}
              onChange={(v) => handleFieldChange('notifications.rate_limit_rpm', v)}
              min={1}
              max={1000}
            />
          </div>

          <div class="notif-test-section">
            <Button
              variant="secondary"
              size="sm"
              onClick={handleNotifTest}
              loading={notifTesting.value}
            >
              Test Notification
            </Button>
            {notifTestResults.value.length > 0 && (
              <div class="test-results">
                {notifTestResults.value.map((r) => (
                  <div key={r.channel} class={`test-result-item ${r.success ? 'test-result-success' : 'test-result-failure'}`}>
                    <Badge variant={r.success ? 'success' : 'danger'}>
                      {r.success ? 'OK' : 'FAIL'}
                    </Badge>
                    <span>{r.channel}</span>
                    {r.error && <span style="font-size: var(--font-size-xs); color: var(--color-danger);"> - {r.error}</span>}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Section: RPC Endpoints
  // ---------------------------------------------------------------------------

  function RpcField({ shortKey }: { shortKey: string }) {
    const fullKey = `rpc.${shortKey}`;
    const testResult = rpcTestResults.value[fullKey];
    const isTesting = rpcTesting.value[fullKey];

    return (
      <div class="settings-field-full">
        <div class="rpc-field-row">
          <FormField
            label={keyToLabel(shortKey)}
            name={fullKey}
            type="text"
            value={getEffectiveValue('rpc', shortKey)}
            onChange={(v) => handleFieldChange(fullKey, v)}
            placeholder="https://..."
          />
          <Button
            variant="ghost"
            size="sm"
            onClick={() => handleRpcTest(fullKey)}
            loading={!!isTesting}
          >
            Test
          </Button>
        </div>
        {testResult && (
          <div class={`rpc-test-result ${testResult.success ? 'rpc-test-result--success' : 'rpc-test-result--failure'}`}>
            <Badge variant={testResult.success ? 'success' : 'danger'}>
              {testResult.success ? 'OK' : 'FAIL'}
            </Badge>
            <span>{testResult.latencyMs}ms</span>
            {testResult.blockNumber !== undefined && <span> (block #{testResult.blockNumber.toLocaleString()})</span>}
            {testResult.error && <span> - {testResult.error}</span>}
          </div>
        )}
      </div>
    );
  }

  const solanaRpcKeys = ['solana_mainnet', 'solana_devnet', 'solana_testnet'];
  const evmRpcKeys = [
    'evm_ethereum_mainnet', 'evm_ethereum_sepolia',
    'evm_polygon_mainnet', 'evm_polygon_amoy',
    'evm_arbitrum_mainnet', 'evm_arbitrum_sepolia',
    'evm_optimism_mainnet', 'evm_optimism_sepolia',
    'evm_base_mainnet', 'evm_base_sepolia',
  ];

  const evmNetworkOptions = [
    { label: 'Ethereum Mainnet', value: 'ethereum-mainnet' },
    { label: 'Ethereum Sepolia', value: 'ethereum-sepolia' },
    { label: 'Polygon Mainnet', value: 'polygon-mainnet' },
    { label: 'Polygon Amoy', value: 'polygon-amoy' },
    { label: 'Arbitrum Mainnet', value: 'arbitrum-mainnet' },
    { label: 'Arbitrum Sepolia', value: 'arbitrum-sepolia' },
    { label: 'Optimism Mainnet', value: 'optimism-mainnet' },
    { label: 'Optimism Sepolia', value: 'optimism-sepolia' },
    { label: 'Base Mainnet', value: 'base-mainnet' },
    { label: 'Base Sepolia', value: 'base-sepolia' },
  ];

  function RpcSettings() {
    return (
      <div class="settings-category">
        <div class="settings-category-header">
          <h3>RPC Endpoints</h3>
          <p class="settings-description">Configure blockchain RPC URLs for Solana and EVM networks</p>
        </div>
        <div class="settings-category-body">
          <div class="settings-subgroup">
            <div class="settings-subgroup-title">Solana</div>
            <div class="settings-fields-grid">
              {solanaRpcKeys.map((k) => (
                <RpcField key={k} shortKey={k} />
              ))}
            </div>
          </div>

          <div class="settings-subgroup">
            <div class="settings-subgroup-title">EVM</div>
            <div class="settings-fields-grid">
              {evmRpcKeys.map((k) => (
                <RpcField key={k} shortKey={k} />
              ))}
              <div class="settings-field-full">
                <FormField
                  label={keyToLabel('evm_default_network')}
                  name="rpc.evm_default_network"
                  type="select"
                  value={getEffectiveValue('rpc', 'evm_default_network') || 'ethereum-sepolia'}
                  onChange={(v) => handleFieldChange('rpc.evm_default_network', v)}
                  options={evmNetworkOptions}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Section: Security Parameters
  // ---------------------------------------------------------------------------

  function SecuritySettings() {
    const fields: { key: string; min?: number; max?: number }[] = [
      { key: 'session_ttl', min: 300 },
      { key: 'max_sessions_per_wallet', min: 1, max: 100 },
      { key: 'max_pending_tx', min: 1, max: 100 },
      { key: 'rate_limit_global_ip_rpm', min: 10 },
      { key: 'rate_limit_session_rpm', min: 10 },
      { key: 'rate_limit_tx_rpm', min: 1 },
      { key: 'policy_defaults_delay_seconds', min: 0 },
      { key: 'policy_defaults_approval_timeout', min: 60 },
    ];

    return (
      <div class="settings-category">
        <div class="settings-category-header">
          <h3>Security Parameters</h3>
          <p class="settings-description">Session, rate limiting, and policy defaults</p>
        </div>
        <div class="settings-category-body">
          <div class="settings-fields-grid">
            {fields.map((f) => (
              <FormField
                key={f.key}
                label={keyToLabel(f.key)}
                name={`security.${f.key}`}
                type="number"
                value={Number(getEffectiveValue('security', f.key)) || 0}
                onChange={(v) => handleFieldChange(`security.${f.key}`, v)}
                min={f.min}
                max={f.max}
              />
            ))}
          </div>

          {/* Default Deny Policy Toggles */}
          <div class="settings-subgroup" style={{ marginTop: '1rem', borderTop: '1px solid var(--border)', paddingTop: '1rem' }}>
            <h4 style={{ margin: '0 0 0.5rem 0', fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Default Deny Policies</h4>
            <p class="settings-description" style={{ marginBottom: '0.75rem' }}>
              When enabled, transactions are denied if no matching whitelist policy exists.
              Disable to allow all transactions of that type when no policy is configured.
            </p>
            <div class="settings-fields-grid">
              <FormField
                label={keyToLabel('default_deny_tokens')}
                name="policy.default_deny_tokens"
                type="checkbox"
                value={getEffectiveBoolValue('security', 'default_deny_tokens')}
                onChange={(v) => handleFieldChange('policy.default_deny_tokens', v)}
              />
              <FormField
                label={keyToLabel('default_deny_contracts')}
                name="policy.default_deny_contracts"
                type="checkbox"
                value={getEffectiveBoolValue('security', 'default_deny_contracts')}
                onChange={(v) => handleFieldChange('policy.default_deny_contracts', v)}
              />
              <FormField
                label={keyToLabel('default_deny_spenders')}
                name="policy.default_deny_spenders"
                type="checkbox"
                value={getEffectiveBoolValue('security', 'default_deny_spenders')}
                onChange={(v) => handleFieldChange('policy.default_deny_spenders', v)}
              />
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Section: WalletConnect
  // ---------------------------------------------------------------------------

  function WalletConnectSettings() {
    return (
      <div class="settings-category">
        <div class="settings-category-header">
          <h3>WalletConnect</h3>
          <p class="settings-description">WalletConnect integration for dApp connections</p>
        </div>
        <div class="settings-category-body">
          <div class="settings-fields-grid">
            <div class="settings-field-full">
              <FormField
                label={keyToLabel('project_id')}
                name="walletconnect.project_id"
                type="text"
                value={getEffectiveValue('walletconnect', 'project_id')}
                onChange={(v) => handleFieldChange('walletconnect.project_id', v)}
              />
            </div>
          </div>
          <div class="settings-info-box">
            Get your project ID from{' '}
            <a href="https://cloud.walletconnect.com" target="_blank" rel="noopener noreferrer">
              https://cloud.walletconnect.com
            </a>
            {' '}&mdash; Create a free account and project to obtain your project ID.
          </div>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Section: Daemon
  // ---------------------------------------------------------------------------

  function DaemonSettings() {
    return (
      <div class="settings-category">
        <div class="settings-category-header">
          <h3>Daemon</h3>
          <p class="settings-description">General daemon configuration</p>
        </div>
        <div class="settings-category-body">
          <div class="settings-fields-grid">
            <FormField
              label={keyToLabel('log_level')}
              name="daemon.log_level"
              type="select"
              value={getEffectiveValue('daemon', 'log_level') || 'info'}
              onChange={(v) => handleFieldChange('daemon.log_level', v)}
              options={[
                { label: 'debug', value: 'debug' },
                { label: 'info', value: 'info' },
                { label: 'warn', value: 'warn' },
                { label: 'error', value: 'error' },
              ]}
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

      {/* Loading state */}
      {loading.value ? (
        <div class="empty-state">
          <p>Loading settings...</p>
        </div>
      ) : (
        <>
          {/* 5 Category Sections */}
          <NotificationSettings />
          <RpcSettings />
          <SecuritySettings />
          <WalletConnectSettings />
          <DaemonSettings />
        </>
      )}

      {/* Existing Admin Sections */}
      <div class="settings-section">
        <div class="settings-section-header">
          <h3>Kill Switch</h3>
          <p class="settings-description">Emergency stop -- suspends all wallet operations immediately.</p>
        </div>
        <div class="settings-section-body">
          {ksLoading.value ? (
            <span>Loading...</span>
          ) : ksState ? (
            <div class="ks-state-card">
              <Badge variant={isActivated ? 'danger' : 'success'}>
                {ksState.state}
              </Badge>
              {isActivated && ksState.activatedAt && (
                <span class="ks-state-info">
                  Activated {formatDate(ksState.activatedAt)}
                  {ksState.activatedBy ? ` by ${ksState.activatedBy}` : ''}
                </span>
              )}
            </div>
          ) : null}
          <Button
            variant={isActivated ? 'primary' : 'danger'}
            onClick={handleKillSwitchToggle}
            loading={ksActionLoading.value}
            disabled={ksLoading.value}
          >
            {isActivated ? 'Recover' : 'Activate Kill Switch'}
          </Button>
        </div>
      </div>

      <div class="settings-section">
        <div class="settings-section-header">
          <h3>JWT Secret Rotation</h3>
          <p class="settings-description">Invalidate all existing JWT tokens. Old tokens remain valid for 5 minutes.</p>
        </div>
        <div class="settings-section-body">
          <Button variant="secondary" onClick={() => { rotateModal.value = true; }}>
            Rotate JWT Secret
          </Button>
        </div>
      </div>

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

      {/* JWT Rotation Confirmation Modal */}
      <Modal
        open={rotateModal.value}
        title="Rotate JWT Secret"
        onCancel={() => { rotateModal.value = false; }}
        onConfirm={handleRotate}
        confirmText="Rotate"
        confirmVariant="primary"
        loading={rotateLoading.value}
      >
        <p>
          Are you sure you want to rotate the JWT secret? All existing session
          tokens will remain valid for 5 more minutes, then expire. Wallets will
          need new sessions.
        </p>
      </Modal>

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
