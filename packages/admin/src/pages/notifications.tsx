import { useSignal } from '@preact/signals';
import { useEffect } from 'preact/hooks';
import { apiGet, apiPost, apiPut, ApiError } from '../api/client';
import { API } from '../api/endpoints';
import { Table } from '../components/table';
import type { Column } from '../components/table';
import { FormField, Button, Badge } from '../components/form';
import { showToast } from '../components/toast';
import { getErrorMessage } from '../utils/error-messages';
import { formatDate } from '../utils/format';
import { TelegramUsersContent } from './telegram-users';
import { TabNav } from '../components/tab-nav';
import { Breadcrumb } from '../components/breadcrumb';
import {
  type SettingsData,
  type NotifTestResult,
  keyToLabel,
  getEffectiveValue,
  getEffectiveBoolValue,
  isCredentialConfigured,
} from '../utils/settings-helpers';
import { FieldGroup } from '../components/field-group';
import { pendingNavigation, highlightField } from '../components/settings-search';
import { registerDirty, unregisterDirty } from '../utils/dirty-guard';

interface ChannelStatus {
  name: string;
  enabled: boolean;
}

interface NotificationStatus {
  enabled: boolean;
  channels: ChannelStatus[];
}

interface TestResult {
  channel: string;
  success: boolean;
  error?: string;
}

interface NotificationLogEntry {
  id: string;
  eventType: string;
  walletId: string | null;
  channel: string;
  status: string;
  error: string | null;
  message: string | null;
  createdAt: number;
}

interface NotificationLogResponse {
  logs: NotificationLogEntry[];
  total: number;
  page: number;
  pageSize: number;
}

const PAGE_SIZE = 20;

type NotifTab = 'channels' | 'telegram' | 'settings';

const NOTIFICATIONS_TABS = [
  { key: 'channels', label: 'Channels & Logs' },
  { key: 'telegram', label: 'Telegram Users' },
  { key: 'settings', label: 'Settings' },
];

// ---------------------------------------------------------------------------
// Notification Settings Tab
// ---------------------------------------------------------------------------

function NotificationSettingsTab() {
  const settings = useSignal<SettingsData>({});
  const dirty = useSignal<Record<string, string>>({});
  const saving = useSignal(false);
  const loading = useSignal(true);
  const notifTestResults = useSignal<NotifTestResult[]>([]);
  const notifTesting = useSignal(false);

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
        .filter(([key]) => key.startsWith('notifications.') || key.startsWith('telegram.'))
        .map(([key, value]) => ({ key, value }));
      await apiPut(API.ADMIN_SETTINGS, { settings: entries });
      dirty.value = {};
      await fetchSettings();
      showToast('success', 'Notification settings saved and applied');
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
      id: 'notifications-settings',
      isDirty: () => Object.keys(dirty.value).filter(k => k.startsWith('notifications.') || k.startsWith('telegram.')).length > 0,
      save: handleSave,
      discard: handleDiscard,
    });
    return () => unregisterDirty('notifications-settings');
  }, []);

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

  const dirtyCount = Object.keys(dirty.value).filter(
    (k) => k.startsWith('notifications.') || k.startsWith('telegram.'),
  ).length;

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
          <h3>Notification Configuration</h3>
          <p class="settings-description">
            Configure notification channels for transaction alerts.
            Changes apply immediately via hot-reload.
          </p>
        </div>
        <div class="settings-category-body">
          {/* Global notification settings — applies to all channels */}
          <div class="settings-fields-grid" style={{ marginBottom: 'var(--space-4)' }}>
            <div class="settings-field-full">
              <FormField
                label="Enabled"
                name="notifications.enabled"
                type="checkbox"
                value={getEffectiveBoolValue(settings.value, dirty.value, 'notifications', 'enabled')}
                onChange={(v) => handleFieldChange('notifications.enabled', v)}
                description="Enable or disable notifications globally"
              />
            </div>

            <FormField
              label={keyToLabel('locale')}
              name="notifications.locale"
              type="select"
              value={getEffectiveValue(settings.value, dirty.value, 'notifications', 'locale') || 'en'}
              onChange={(v) => handleFieldChange('notifications.locale', v)}
              options={[
                { label: 'English', value: 'en' },
                { label: 'Korean', value: 'ko' },
              ]}
              description="Language for notification messages"
            />
          </div>

          <FieldGroup legend="Telegram" description="Telegram notification channel and bot configuration">
            <div class="settings-fields-grid">
              <FormField
                label={keyToLabel('telegram_bot_token')}
                name="notifications.telegram_bot_token"
                type="password"
                value={getEffectiveValue(settings.value, dirty.value, 'notifications', 'telegram_bot_token')}
                onChange={(v) => handleFieldChange('notifications.telegram_bot_token', v)}
                placeholder={isCredentialConfigured(settings.value, dirty.value, 'notifications', 'telegram_bot_token') ? '(configured)' : ''}
                description="Bot token for Telegram notifications"
              />

              <FormField
                label={keyToLabel('telegram_chat_id')}
                name="notifications.telegram_chat_id"
                type="text"
                value={getEffectiveValue(settings.value, dirty.value, 'notifications', 'telegram_chat_id')}
                onChange={(v) => handleFieldChange('notifications.telegram_chat_id', v)}
                description="Chat ID for Telegram notification delivery"
              />
            </div>

            {/* Telegram Bot sub-section */}
            <div class="settings-subgroup" style={{ marginTop: '0.75rem', borderTop: '1px solid var(--border)', paddingTop: '0.75rem' }}>
              <div class="settings-subgroup-title">Telegram Bot</div>
              <div class="settings-fields-grid">
                <FormField
                  label="Bot Enabled"
                  name="telegram.enabled"
                  type="select"
                  value={getEffectiveValue(settings.value, dirty.value, 'telegram', 'enabled') || 'false'}
                  onChange={(v) => handleFieldChange('telegram.enabled', v)}
                  options={[
                    { label: 'Yes', value: 'true' },
                    { label: 'No', value: 'false' },
                  ]}
                  description="Enable or disable the Telegram bot"
                />
                <FormField
                  label={keyToLabel('bot_token')}
                  name="telegram.bot_token"
                  type="password"
                  value={getEffectiveValue(settings.value, dirty.value, 'telegram', 'bot_token')}
                  onChange={(v) => handleFieldChange('telegram.bot_token', v)}
                  placeholder={isCredentialConfigured(settings.value, dirty.value, 'telegram', 'bot_token') ? '(configured)' : 'Leave empty to use notification token'}
                  description="Dedicated bot token for Telegram bot (optional, uses notification token if empty)"
                />
                <FormField
                  label="Locale"
                  name="telegram.locale"
                  type="select"
                  value={getEffectiveValue(settings.value, dirty.value, 'telegram', 'locale') || 'en'}
                  onChange={(v) => handleFieldChange('telegram.locale', v)}
                  options={[
                    { label: 'English', value: 'en' },
                    { label: '한국어', value: 'ko' },
                  ]}
                  description="Language for Telegram bot messages"
                />
              </div>
            </div>
          </FieldGroup>

          <FieldGroup legend="Other Channels" description="Discord, ntfy, Slack, and rate limiting">
            <div class="settings-fields-grid">
              <FormField
                label={keyToLabel('discord_webhook_url')}
                name="notifications.discord_webhook_url"
                type="password"
                value={getEffectiveValue(settings.value, dirty.value, 'notifications', 'discord_webhook_url')}
                onChange={(v) => handleFieldChange('notifications.discord_webhook_url', v)}
                placeholder={isCredentialConfigured(settings.value, dirty.value, 'notifications', 'discord_webhook_url') ? '(configured)' : ''}
                description="Webhook URL for Discord notifications"
              />

              <FormField
                label={keyToLabel('ntfy_server')}
                name="notifications.ntfy_server"
                type="text"
                value={getEffectiveValue(settings.value, dirty.value, 'notifications', 'ntfy_server')}
                onChange={(v) => handleFieldChange('notifications.ntfy_server', v)}
                description="Server URL for ntfy notifications"
              />

              <FormField
                label={keyToLabel('ntfy_topic')}
                name="notifications.ntfy_topic"
                type="text"
                value={getEffectiveValue(settings.value, dirty.value, 'notifications', 'ntfy_topic')}
                onChange={(v) => handleFieldChange('notifications.ntfy_topic', v)}
                description="Topic name for ntfy notifications"
              />

              <FormField
                label="Slack Webhook URL"
                name="notifications.slack_webhook_url"
                type="password"
                value={getEffectiveValue(settings.value, dirty.value, 'notifications', 'slack_webhook_url')}
                onChange={(v) => handleFieldChange('notifications.slack_webhook_url', v)}
                placeholder={isCredentialConfigured(settings.value, dirty.value, 'notifications', 'slack_webhook_url') ? '(configured)' : ''}
                description="Webhook URL for Slack notifications"
              />

              <FormField
                label={keyToLabel('rate_limit_rpm')}
                name="notifications.rate_limit_rpm"
                type="number"
                value={Number(getEffectiveValue(settings.value, dirty.value, 'notifications', 'rate_limit_rpm')) || 20}
                onChange={(v) => handleFieldChange('notifications.rate_limit_rpm', v)}
                min={1}
                max={1000}
                description="Max notifications per minute"
              />
            </div>
          </FieldGroup>

          {/* Test Notification */}
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
    </>
  );
}

export default function NotificationsPage() {
  const activeTab = useSignal<NotifTab>('channels');

  useEffect(() => {
    const nav = pendingNavigation.value;
    if (nav && nav.tab) {
      activeTab.value = nav.tab as NotifTab;
      setTimeout(() => {
        highlightField.value = nav.fieldName;
      }, 100);
      pendingNavigation.value = null;
    }
  }, [pendingNavigation.value]);

  const status = useSignal<NotificationStatus | null>(null);
  const statusLoading = useSignal(true);
  const testLoading = useSignal(false);
  const testChannelLoading = useSignal<string | null>(null);
  const testResults = useSignal<TestResult[] | null>(null);
  const logs = useSignal<NotificationLogResponse | null>(null);
  const logsLoading = useSignal(true);
  const currentPage = useSignal(1);
  const selectedLog = useSignal<NotificationLogEntry | null>(null);

  const fetchStatus = async () => {
    try {
      const result = await apiGet<NotificationStatus>(API.ADMIN_NOTIFICATIONS_STATUS);
      status.value = result;
    } catch (err) {
      const e = err instanceof ApiError ? err : new ApiError(0, 'UNKNOWN', 'Unknown error');
      showToast('error', getErrorMessage(e.code));
    } finally {
      statusLoading.value = false;
    }
  };

  const fetchLogs = async (page: number) => {
    logsLoading.value = true;
    try {
      const result = await apiGet<NotificationLogResponse>(
        `${API.ADMIN_NOTIFICATIONS_LOG}?page=${page}&pageSize=${PAGE_SIZE}`,
      );
      logs.value = result;
    } catch (err) {
      const e = err instanceof ApiError ? err : new ApiError(0, 'UNKNOWN', 'Unknown error');
      showToast('error', getErrorMessage(e.code));
    } finally {
      logsLoading.value = false;
    }
  };

  const handleTestSend = async () => {
    testLoading.value = true;
    testResults.value = null;
    try {
      const body = await apiPost<{ results: TestResult[] }>(API.ADMIN_NOTIFICATIONS_TEST, {});
      const results = body.results;
      testResults.value = results;
      const allSuccess = results.every((r) => r.success);
      if (allSuccess) {
        showToast('success', 'Test sent successfully');
      } else {
        showToast('warning', 'Some channels failed');
      }
    } catch (err) {
      const e = err instanceof ApiError ? err : new ApiError(0, 'UNKNOWN', 'Unknown error');
      showToast('error', getErrorMessage(e.code));
    } finally {
      testLoading.value = false;
    }
  };

  const handleTestChannel = async (channelName: string) => {
    testChannelLoading.value = channelName;
    testResults.value = null;
    try {
      const body = await apiPost<{ results: TestResult[] }>(API.ADMIN_NOTIFICATIONS_TEST, { channel: channelName });
      const results = body.results;
      testResults.value = results;
      const allSuccess = results.every((r) => r.success);
      if (allSuccess) {
        showToast('success', `Test sent to ${channelName}`);
      } else {
        showToast('warning', `${channelName} test failed`);
      }
    } catch (err) {
      const e = err instanceof ApiError ? err : new ApiError(0, 'UNKNOWN', 'Unknown error');
      showToast('error', getErrorMessage(e.code));
    } finally {
      testChannelLoading.value = null;
    }
  };

  const handlePrevPage = () => {
    if (currentPage.value > 1) {
      currentPage.value -= 1;
      fetchLogs(currentPage.value);
    }
  };

  const handleNextPage = () => {
    const totalPages = logs.value ? Math.ceil(logs.value.total / PAGE_SIZE) : 1;
    if (currentPage.value < totalPages) {
      currentPage.value += 1;
      fetchLogs(currentPage.value);
    }
  };

  const handleRowClick = (log: NotificationLogEntry) => {
    selectedLog.value = selectedLog.value?.id === log.id ? null : log;
  };

  useEffect(() => {
    fetchStatus();
    fetchLogs(1);
    const interval = setInterval(() => fetchLogs(currentPage.value), 30_000);
    return () => clearInterval(interval);
  }, []);

  const isInitialLoad = statusLoading.value && !status.value;
  const hasEnabledChannels = status.value?.channels.some((c) => c.enabled) ?? false;
  const totalPages = logs.value ? Math.max(1, Math.ceil(logs.value.total / PAGE_SIZE)) : 1;

  const logColumns: Column<NotificationLogEntry>[] = [
    { key: 'eventType', header: 'Event Type' },
    {
      key: 'walletId',
      header: 'Wallet ID',
      render: (entry) => entry.walletId ? entry.walletId.slice(0, 8) + '...' : '\u2014',
    },
    {
      key: 'channel',
      header: 'Channel',
      render: (entry) => <span style={{ textTransform: 'capitalize' }}>{entry.channel}</span>,
    },
    {
      key: 'status',
      header: 'Status',
      render: (entry) => (
        <Badge variant={entry.status === 'sent' ? 'success' : 'danger'}>
          {entry.status}
        </Badge>
      ),
    },
    {
      key: 'createdAt',
      header: 'Time',
      render: (entry) => formatDate(entry.createdAt),
    },
  ];

  return (
    <div class="page">
      <Breadcrumb
        pageName="Notifications"
        tabName={NOTIFICATIONS_TABS.find(t => t.key === activeTab.value)?.label ?? ''}
        onPageClick={() => { activeTab.value = 'channels'; }}
      />
      <TabNav
        tabs={NOTIFICATIONS_TABS}
        activeTab={activeTab.value}
        onTabChange={(key) => { activeTab.value = key as NotifTab; }}
      />

      {activeTab.value === 'telegram' ? (
        <TelegramUsersContent />
      ) : activeTab.value === 'settings' ? (
        <NotificationSettingsTab />
      ) : (
      <>
      {/* Section 1: Channel Status Cards */}
      <h2>Channel Status</h2>

      {status.value && !status.value.enabled && (
        <div class="notif-disabled-banner">
          Notifications are disabled.{' '}
          <a href="#" onClick={(e: Event) => { e.preventDefault(); activeTab.value = 'settings'; }}>
            Enable them in the Settings tab
          </a>
        </div>
      )}

      {isInitialLoad ? (
        <div class="channel-grid">
          {[1, 2, 3].map((i) => (
            <div key={i} class="channel-card">
              <div class="stat-skeleton" />
            </div>
          ))}
        </div>
      ) : (
        <div class="channel-grid">
          {status.value?.channels.map((ch) => (
            <div key={ch.name} class="channel-card">
              <div class="channel-card-header">
                <span class="channel-card-name">{ch.name}</span>
                <div class="channel-card-actions">
                  <Badge variant={ch.enabled ? 'success' : 'neutral'}>
                    {ch.enabled ? 'Connected' : 'Not Configured'}
                  </Badge>
                  {ch.enabled && (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => handleTestChannel(ch.name)}
                      loading={testChannelLoading.value === ch.name}
                    >
                      Test
                    </Button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Test All + Results (below Channel Status) */}
      <div style={{ marginTop: 'var(--space-4)', marginBottom: 'var(--space-6)' }}>
        <Button
          onClick={handleTestSend}
          loading={testLoading.value}
          disabled={!hasEnabledChannels}
        >
          Test All Channels
        </Button>

        {testResults.value && (
          <div class="test-results">
            {testResults.value.map((result) => (
              <div key={result.channel} class="test-result-item">
                <span class={result.success ? 'test-result-success' : 'test-result-failure'}>
                  {result.success ? '\u2713' : '\u2717'}
                </span>
                <span style={{ textTransform: 'capitalize' }}>{result.channel}</span>
                {!result.success && result.error && (
                  <span class="test-result-failure"> - {result.error}</span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Section 2: Delivery Log Table */}
      <h2>Delivery Log</h2>
      <Table<NotificationLogEntry>
        columns={logColumns}
        data={logs.value?.logs ?? []}
        loading={logsLoading.value}
        emptyMessage="No notification logs"
        onRowClick={handleRowClick}
      />

      {/* Expanded log message detail */}
      {selectedLog.value && (
        <div class="log-message-detail">
          <div class="log-message-detail-header">
            <strong>{selectedLog.value.eventType}</strong> via <span style={{ textTransform: 'capitalize' }}>{selectedLog.value.channel}</span>
            <Button variant="ghost" size="sm" onClick={() => { selectedLog.value = null; }}>
              Close
            </Button>
          </div>
          <div class="log-message-detail-body">
            {selectedLog.value.message ? (
              <pre style={{ whiteSpace: 'pre-wrap', margin: 0, fontSize: 'var(--font-size-sm)' }}>{selectedLog.value.message}</pre>
            ) : (
              <span class="text-muted">(No message recorded)</span>
            )}
          </div>
        </div>
      )}

      <div class="pagination">
        <span class="pagination-info">
          Page {currentPage.value} of {totalPages}
          {logs.value ? ` (${logs.value.total} total)` : ''}
        </span>
        <div class="pagination-buttons">
          <Button
            variant="secondary"
            size="sm"
            onClick={handlePrevPage}
            disabled={currentPage.value <= 1}
          >
            Previous
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={handleNextPage}
            disabled={currentPage.value >= totalPages}
          >
            Next
          </Button>
        </div>
      </div>

      {/* Section 3: Configuration Guidance */}
      <div class="config-guidance">
        <p>Configure notification channels in the Settings tab above. Changes are applied immediately via hot-reload.</p>
      </div>
      </>
      )}
    </div>
  );
}
