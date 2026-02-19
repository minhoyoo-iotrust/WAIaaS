import { useSignal } from '@preact/signals';
import { useEffect } from 'preact/hooks';
import { apiGet, apiPost, apiPut, apiDelete, ApiError } from '../api/client';
import { API } from '../api/endpoints';
import { FormField, Button, Badge } from '../components/form';
import { CurrencySelect } from '../components/currency-select';
import { Modal } from '../components/modal';
import { showToast } from '../components/toast';
import { getErrorMessage } from '../utils/error-messages';
import { formatDate } from '../utils/format';
import {
  type SettingsData,
  type KillSwitchState,
  type ApiKeyEntry,
  type RpcTestResult,
  type NotifTestResult,
  keyToLabel,
  getEffectiveValue as getEffectiveValuePure,
  getEffectiveBoolValue as getEffectiveBoolValuePure,
  isCredentialConfigured as isCredentialConfiguredPure,
} from '../utils/settings-helpers';

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

  // --- API Keys state ---
  const apiKeys = useSignal<ApiKeyEntry[]>([]);
  const apiKeysLoading = useSignal(true);
  const apiKeyEditing = useSignal<string | null>(null);
  const apiKeyInput = useSignal('');
  const apiKeySaving = useSignal(false);

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

  useEffect(() => {
    fetchSettings();
    fetchKillSwitchState();
    fetchApiKeys();
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
  const getEffectiveValue = (category: string, shortKey: string): string =>
    getEffectiveValuePure(settings.value, dirty.value, category, shortKey);

  /** Get effective boolean value (for checkbox fields) */
  const getEffectiveBoolValue = (category: string, shortKey: string): boolean =>
    getEffectiveBoolValuePure(settings.value, dirty.value, category, shortKey);

  /** Check if a credential field is configured (GET returned true) */
  const isCredentialConfigured = (category: string, shortKey: string): boolean =>
    isCredentialConfiguredPure(settings.value, dirty.value, category, shortKey);

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
      const result = await apiPost<{ results: NotifTestResult[] }>(API.ADMIN_NOTIFICATIONS_TEST, {});
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

  // Kill Switch: activate (ACTIVE -> SUSPENDED)
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

  // Kill Switch: escalate (SUSPENDED -> LOCKED)
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

  // Kill Switch: recover (SUSPENDED/LOCKED -> ACTIVE)
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
  const isActive = ksState?.state === 'ACTIVE';
  const isSuspended = ksState?.state === 'SUSPENDED';
  const isLocked = ksState?.state === 'LOCKED';

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
              label="Slack Webhook URL"
              name="notifications.slack_webhook_url"
              type="password"
              value={getEffectiveValue('notifications', 'slack_webhook_url')}
              onChange={(v) => handleFieldChange('notifications.slack_webhook_url', v)}
              placeholder={isCredentialConfigured('notifications', 'slack_webhook_url') ? '(configured)' : ''}
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
  // Section: Telegram Bot
  // ---------------------------------------------------------------------------

  function TelegramBotSettings() {
    return (
      <div class="settings-category">
        <div class="settings-category-header">
          <h3>Telegram Bot</h3>
          <p class="settings-description">
            Enable the Telegram Bot for interactive commands (/status, /wallets, /approve, etc.)
          </p>
        </div>
        <div class="settings-category-body">
          <div class="settings-fields-grid">
            <FormField
              label="Bot Enabled"
              name="telegram.enabled"
              type="select"
              value={getEffectiveValue('telegram', 'enabled') || 'false'}
              onChange={(v) => handleFieldChange('telegram.enabled', v)}
              options={[
                { label: 'Yes', value: 'true' },
                { label: 'No', value: 'false' },
              ]}
            />
            <FormField
              label="Bot Token"
              name="telegram.bot_token"
              type="password"
              value={getEffectiveValue('telegram', 'bot_token')}
              onChange={(v) => handleFieldChange('telegram.bot_token', v)}
              placeholder={isCredentialConfigured('telegram', 'bot_token') ? '(configured)' : 'Leave empty to use notification token'}
            />
            <FormField
              label="Locale"
              name="telegram.locale"
              type="select"
              value={getEffectiveValue('telegram', 'locale') || 'en'}
              onChange={(v) => handleFieldChange('telegram.locale', v)}
              options={[
                { label: 'English', value: 'en' },
                { label: '한국어', value: 'ko' },
              ]}
            />
          </div>
          <div class="settings-info-box">
            The Telegram Bot uses Long Polling for interactive commands. If Bot Token is left empty,
            it falls back to the Notifications Telegram Bot Token. Enable the bot and configure a token
            to allow wallet management via Telegram.
          </div>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Section: Display
  // ---------------------------------------------------------------------------

  function DisplaySettings() {
    return (
      <div class="settings-category">
        <div class="settings-category-header">
          <h3>Display</h3>
          <p class="settings-description">Configure display currency for USD amount conversion</p>
        </div>
        <div class="settings-category-body">
          <div class="settings-fields-grid">
            <div class="settings-field-full">
              <label>{keyToLabel('currency')}</label>
              <CurrencySelect
                value={getEffectiveValue('display', 'currency') || 'USD'}
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
  // Section: AutoStop Rules
  // ---------------------------------------------------------------------------

  function AutoStopSettings() {
    const fields: { key: string; type: 'number' | 'checkbox'; min?: number; max?: number }[] = [
      { key: 'enabled', type: 'checkbox' },
      { key: 'consecutive_failures_threshold', type: 'number', min: 1, max: 100 },
      { key: 'unusual_activity_threshold', type: 'number', min: 5, max: 1000 },
      { key: 'unusual_activity_window_sec', type: 'number', min: 60, max: 86400 },
      { key: 'idle_timeout_sec', type: 'number', min: 60, max: 604800 },
      { key: 'idle_check_interval_sec', type: 'number', min: 10, max: 3600 },
    ];

    return (
      <div class="settings-category">
        <div class="settings-category-header">
          <h3>AutoStop Rules</h3>
          <p class="settings-description">
            Automatic protection rules that suspend wallets or trigger Kill Switch on anomalies.
            Changes apply immediately without daemon restart.
          </p>
        </div>
        <div class="settings-category-body">
          <div class="settings-fields-grid">
            {fields.map((f) =>
              f.type === 'checkbox' ? (
                <div class="settings-field-full" key={f.key}>
                  <FormField
                    label={keyToLabel(f.key)}
                    name={`autostop.${f.key}`}
                    type="checkbox"
                    value={getEffectiveBoolValue('autostop', f.key)}
                    onChange={(v) => handleFieldChange(`autostop.${f.key}`, v)}
                  />
                </div>
              ) : (
                <FormField
                  key={f.key}
                  label={keyToLabel(f.key)}
                  name={`autostop.${f.key}`}
                  type="number"
                  value={Number(getEffectiveValue('autostop', f.key)) || 0}
                  onChange={(v) => handleFieldChange(`autostop.${f.key}`, v)}
                  min={f.min}
                  max={f.max}
                />
              ),
            )}
          </div>
          <div class="settings-info-box">
            <strong>Consecutive Failures:</strong> Suspends wallet after N consecutive failed transactions.<br />
            <strong>Unusual Activity:</strong> Suspends wallet if transaction count exceeds threshold within the time window.<br />
            <strong>Idle Timeout:</strong> Revokes sessions with no activity for the configured duration.
          </div>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Section: Balance Monitoring
  // ---------------------------------------------------------------------------

  function MonitoringSettings() {
    const fields: { key: string; type: 'number' | 'checkbox'; min?: number; max?: number }[] = [
      { key: 'enabled', type: 'checkbox' },
      { key: 'check_interval_sec', type: 'number', min: 60, max: 86400 },
      { key: 'low_balance_threshold_sol', type: 'number', min: 0 },
      { key: 'low_balance_threshold_eth', type: 'number', min: 0 },
      { key: 'cooldown_hours', type: 'number', min: 1, max: 168 },
    ];

    return (
      <div class="settings-category">
        <div class="settings-category-header">
          <h3>Balance Monitoring</h3>
          <p class="settings-description">
            Periodic balance checks for all active wallets. Sends LOW_BALANCE alerts when
            native token balance drops below thresholds. Changes apply immediately.
          </p>
        </div>
        <div class="settings-category-body">
          <div class="settings-fields-grid">
            {fields.map((f) =>
              f.type === 'checkbox' ? (
                <div class="settings-field-full" key={f.key}>
                  <FormField
                    label={keyToLabel(f.key)}
                    name={`monitoring.${f.key}`}
                    type="checkbox"
                    value={getEffectiveBoolValue('monitoring', f.key)}
                    onChange={(v) => handleFieldChange(`monitoring.${f.key}`, v)}
                  />
                </div>
              ) : (
                <FormField
                  key={f.key}
                  label={keyToLabel(f.key)}
                  name={`monitoring.${f.key}`}
                  type="number"
                  value={Number(getEffectiveValue('monitoring', f.key)) || 0}
                  onChange={(v) => handleFieldChange(`monitoring.${f.key}`, v)}
                  min={f.min}
                  max={f.max}
                />
              ),
            )}
          </div>
          <div class="settings-info-box">
            Monitors all active wallet native token balances (SOL, ETH) at the configured interval.
            When balance drops below threshold, a LOW_BALANCE notification is sent.
            Duplicate alerts are suppressed for the cooldown period (per wallet).
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
          {/* Category Sections */}
          <NotificationSettings />
          <RpcSettings />
          <SecuritySettings />
          <WalletConnectSettings />
          <TelegramBotSettings />
          <DaemonSettings />
          <DisplaySettings />
          <ApiKeysSection />
          <AutoStopSettings />
          <MonitoringSettings />
        </>
      )}

      {/* Kill Switch 3-state Section */}
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
