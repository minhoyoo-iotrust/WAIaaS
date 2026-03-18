import { useSignal } from '@preact/signals';
import { useEffect } from 'preact/hooks';
import { api, ApiError } from '../api/typed-client';
import type { components } from '../api/types.generated';
import { Table } from '../components/table';
import type { Column } from '../components/table';
import { FilterBar, type FilterField } from '../components/filter-bar';
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
import { DASHBOARD_POLL_INTERVAL_MS } from '../constants';

type ChannelStatus = components['schemas']['NotificationChannelStatus'];
type NotificationStatus = components['schemas']['NotificationStatusResponse'];
type TestResult = NotifTestResult;
type NotificationLogEntry = components['schemas']['NotificationLogEntry'];
type NotificationLogResponse = components['schemas']['NotificationLogResponse'];

const PAGE_SIZE = 20;

type NotifTab = 'channels' | 'telegram' | 'settings' | 'balance';

const NOTIFICATIONS_TABS = [
  { key: 'channels', label: 'Channels & Logs' },
  { key: 'telegram', label: 'Telegram Users' },
  { key: 'settings', label: 'Settings' },
  { key: 'balance', label: 'Balance Monitor' },
];

const LOG_FILTER_FIELDS: FilterField[] = [
  {
    key: 'eventType',
    label: 'Event Type',
    type: 'select',
    options: [
      { value: 'tx.submitted', label: 'tx.submitted' },
      { value: 'tx.confirmed', label: 'tx.confirmed' },
      { value: 'tx.failed', label: 'tx.failed' },
      { value: 'policy.violation', label: 'policy.violation' },
      { value: 'security.kill_switch', label: 'security.kill_switch' },
      { value: 'security.auto_stop', label: 'security.auto_stop' },
      { value: 'security.suspicious_tx', label: 'security.suspicious_tx' },
      { value: 'session.created', label: 'session.created' },
      { value: 'session.expired', label: 'session.expired' },
      { value: 'owner.registered', label: 'owner.registered' },
      { value: 'owner.verified', label: 'owner.verified' },
      { value: 'incoming.detected', label: 'incoming.detected' },
      { value: 'incoming.suspicious', label: 'incoming.suspicious' },
    ],
  },
  {
    key: 'channel',
    label: 'Channel',
    type: 'select',
    options: [
      { value: 'telegram', label: 'Telegram' },
      { value: 'discord', label: 'Discord' },
      { value: 'slack', label: 'Slack' },
      { value: 'wallet_app', label: 'Wallet App' },
    ],
  },
  {
    key: 'status',
    label: 'Status',
    type: 'select',
    options: [
      { value: 'sent', label: 'Sent' },
      { value: 'failed', label: 'Failed' },
    ],
  },
  { key: 'since', label: 'Since', type: 'date' },
  { key: 'until', label: 'Until', type: 'date' },
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
        .filter(([key]) => key.startsWith('notifications.') || key.startsWith('telegram.'))
        .map(([key, value]) => ({ key, value }));
      const { data: result } = await api.PUT('/v1/admin/settings', { body: { settings: entries } });
      settings.value = result!.settings as unknown as SettingsData;
      dirty.value = {};
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
      const { data: result } = await api.POST('/v1/admin/notifications/test', {});
      notifTestResults.value = result!.results;
      if (result!.results.length === 0) {
        showToast('info', 'No notification channels configured');
      } else {
        const allOk = result!.results.every((r) => r.success);
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
            <div class="settings-info-box" style={{ marginBottom: '0.75rem' }}>
              Get your bot token from{' '}
              <a href="https://t.me/BotFather" target="_blank" rel="noopener noreferrer">@BotFather</a>
              {' '}&mdash; send /newbot and follow the instructions. To get your Chat ID, send a message to your bot then visit{' '}
              <a href="https://api.telegram.org" target="_blank" rel="noopener noreferrer">Telegram Bot API</a>.
            </div>
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

          <FieldGroup legend="Other Channels" description="Discord, Slack, and rate limiting">
            <div class="settings-info-box" style={{ marginBottom: '0.75rem' }}>
              <strong>Discord:</strong> Create a webhook in Server Settings &gt; Integrations &gt;{' '}
              <a href="https://support.discord.com/hc/en-us/articles/228383668" target="_blank" rel="noopener noreferrer">Webhooks</a>.
              {' '}<strong>Slack:</strong> Create an{' '}
              <a href="https://api.slack.com/messaging/webhooks" target="_blank" rel="noopener noreferrer">Incoming Webhook</a> in your Slack workspace.
            </div>
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

          <FieldGroup legend="Event Filter" description="Choose which notification events are delivered. All checked = receive all.">
            {(() => {
              const BROADCAST = new Set(['KILL_SWITCH_ACTIVATED', 'KILL_SWITCH_RECOVERED', 'AUTO_STOP_TRIGGERED', 'TX_INCOMING_SUSPICIOUS']);
              const EVENT_GROUPS: { category: string; label: string; events: { event: string; desc: string }[] }[] = [
                { category: 'transaction', label: 'Transaction Events', events: [
                  { event: 'TX_REQUESTED', desc: 'Transaction request received' },
                  { event: 'TX_QUEUED', desc: 'Waiting in time-delay queue' },
                  { event: 'TX_SUBMITTED', desc: 'Submitted to blockchain' },
                  { event: 'TX_CONFIRMED', desc: 'Confirmed on-chain' },
                  { event: 'TX_FAILED', desc: 'Transaction failed' },
                  { event: 'TX_CANCELLED', desc: 'Cancelled by user or policy' },
                  { event: 'TX_DOWNGRADED_DELAY', desc: 'Auto-approved demoted to time-delay' },
                  { event: 'TX_APPROVAL_REQUIRED', desc: 'Owner approval required' },
                  { event: 'TX_APPROVAL_EXPIRED', desc: 'Approval wait timed out' },
                  { event: 'TX_INCOMING', desc: 'Incoming transaction detected' },
                ]},
                { category: 'policy', label: 'Policy', events: [
                  { event: 'POLICY_VIOLATION', desc: 'Blocked by policy rule' },
                  { event: 'CUMULATIVE_LIMIT_WARNING', desc: 'Cumulative spend limit warning' },
                ]},
                { category: 'security_alert', label: 'Security Alerts', events: [
                  { event: 'WALLET_SUSPENDED', desc: 'Wallet suspended' },
                  { event: 'KILL_SWITCH_ACTIVATED', desc: 'Emergency lock activated' },
                  { event: 'KILL_SWITCH_RECOVERED', desc: 'Emergency lock released' },
                  { event: 'KILL_SWITCH_ESCALATED', desc: 'Kill switch escalated' },
                  { event: 'AUTO_STOP_TRIGGERED', desc: 'Auto-stop triggered' },
                  { event: 'TX_INCOMING_SUSPICIOUS', desc: 'Suspicious incoming transaction' },
                ]},
                { category: 'session', label: 'Session Events', events: [
                  { event: 'SESSION_EXPIRING_SOON', desc: 'Session expiring soon' },
                  { event: 'SESSION_EXPIRED', desc: 'Session expired' },
                  { event: 'SESSION_CREATED', desc: 'Session created' },
                  { event: 'SESSION_WALLET_ADDED', desc: 'Wallet added to session' },
                  { event: 'SESSION_WALLET_REMOVED', desc: 'Wallet removed from session' },
                ]},
                { category: 'owner', label: 'Owner Events', events: [
                  { event: 'OWNER_SET', desc: 'Owner address registered' },
                  { event: 'OWNER_REMOVED', desc: 'Owner address removed' },
                  { event: 'OWNER_VERIFIED', desc: 'Owner address verified' },
                ]},
                { category: 'system', label: 'System Notifications', events: [
                  { event: 'DAILY_SUMMARY', desc: 'Daily summary report' },
                  { event: 'LOW_BALANCE', desc: 'Low balance warning' },
                  { event: 'APPROVAL_CHANNEL_SWITCHED', desc: 'Approval channel changed' },
                  { event: 'UPDATE_AVAILABLE', desc: 'Daemon update available' },
                ]},
              ];
              const ALL_EVENTS = EVENT_GROUPS.flatMap((g) => g.events.map((e) => e.event))
                .filter((e) => !BROADCAST.has(e));
              const currentJson = getEffectiveValue(settings.value, dirty.value, 'notifications', 'notify_events') || '[]';
              let rawEvents: string[] = [];
              try {
                const parsed = JSON.parse(currentJson);
                if (Array.isArray(parsed)) rawEvents = parsed;
              } catch { /* use empty */ }
              const displayEvents = rawEvents.length === 0 ? ALL_EVENTS : rawEvents;
              const handleEventToggle = (event: string, checked: boolean) => {
                const updated = checked
                  ? [...displayEvents, event]
                  : displayEvents.filter((e) => e !== event);
                const toSave = updated.length === ALL_EVENTS.length && ALL_EVENTS.every((e) => updated.includes(e))
                  ? []
                  : updated;
                handleFieldChange('notifications.notify_events', JSON.stringify(toSave));
              };
              const handleGroupToggle = (group: typeof EVENT_GROUPS[0], checked: boolean) => {
                const filterable = group.events.filter((e) => !BROADCAST.has(e.event)).map((e) => e.event);
                let updated: string[];
                if (checked) {
                  updated = [...new Set([...displayEvents, ...filterable])];
                } else {
                  const removeSet = new Set(filterable);
                  updated = displayEvents.filter((e) => !removeSet.has(e));
                }
                const toSave = updated.length === ALL_EVENTS.length && ALL_EVENTS.every((e) => updated.includes(e))
                  ? []
                  : updated;
                handleFieldChange('notifications.notify_events', JSON.stringify(toSave));
              };
              return (
                <div class="event-filter-groups">
                  {EVENT_GROUPS.map((group) => {
                    const filterable = group.events.filter((e) => !BROADCAST.has(e.event));
                    const allChecked = filterable.every((e) => displayEvents.includes(e.event));
                    const someChecked = filterable.some((e) => displayEvents.includes(e.event));
                    return (
                      <details key={group.category} class="event-filter-group" open>
                        <summary class="event-filter-group-header">
                          <span class="event-filter-group-label">{group.label}</span>
                          <label class="event-filter-group-all" onClick={(e) => e.stopPropagation()}>
                            <input
                              type="checkbox"
                              checked={allChecked}
                              ref={(el) => { if (el) el.indeterminate = someChecked && !allChecked; }}
                              onChange={(e) => handleGroupToggle(group, (e.target as HTMLInputElement).checked)}
                            />
                            {' All'}
                          </label>
                        </summary>
                        <div class="event-filter-events">
                          {group.events.map((ev) => {
                            const isBroadcast = BROADCAST.has(ev.event);
                            return (
                              <label key={ev.event} class={`event-filter-event ${isBroadcast ? 'event-broadcast' : ''}`}>
                                <input
                                  type="checkbox"
                                  checked={isBroadcast || displayEvents.includes(ev.event)}
                                  disabled={isBroadcast}
                                  onChange={(e) => handleEventToggle(ev.event, (e.target as HTMLInputElement).checked)}
                                />
                                <code>{ev.event}</code>
                                <span class="event-desc">{ev.desc}</span>
                                {isBroadcast && <span class="event-broadcast-badge">Always sent</span>}
                              </label>
                            );
                          })}
                        </div>
                      </details>
                    );
                  })}
                </div>
              );
            })()}
            <div class="settings-info-box" style={{ marginTop: '0.5rem' }}>
              Applies to all notification channels (Telegram, Discord, Slack) and wallet app side channel.
              Broadcast events (Kill Switch, Auto Stop, Suspicious TX) always bypass the filter.
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

// ---------------------------------------------------------------------------
// Balance Monitor Tab
// ---------------------------------------------------------------------------

const MONITORING_DESCRIPTIONS: Record<string, string> = {
  enabled: 'Enable or disable balance monitoring',
  check_interval_sec: 'How often to check wallet balances',
  low_balance_threshold_sol: 'Alert when SOL balance drops below this amount',
  low_balance_threshold_eth: 'Alert when ETH balance drops below this amount',
  cooldown_hours: 'Suppress duplicate alerts for this many hours',
};

function BalanceMonitorTab() {
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
        .filter(([key]) => key.startsWith('monitoring.'))
        .map(([key, value]) => ({ key, value }));
      const { data: result } = await api.PUT('/v1/admin/settings', { body: { settings: entries } });
      settings.value = result!.settings as unknown as SettingsData;
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
      id: 'notifications-balance',
      isDirty: () => Object.keys(dirty.value).filter(k => k.startsWith('monitoring.')).length > 0,
      save: handleSave,
      discard: handleDiscard,
    });
    return () => unregisterDirty('notifications-balance');
  }, []);

  const fields: { key: string; type: 'number' | 'checkbox'; min?: number; max?: number }[] = [
    { key: 'enabled', type: 'checkbox' },
    { key: 'check_interval_sec', type: 'number', min: 60, max: 86400 },
    { key: 'low_balance_threshold_sol', type: 'number', min: 0 },
    { key: 'low_balance_threshold_eth', type: 'number', min: 0 },
    { key: 'cooldown_hours', type: 'number', min: 1, max: 168 },
  ];

  const dirtyCount = Object.keys(dirty.value).filter((k) => k.startsWith('monitoring.')).length;

  if (loading.value) {
    return (
      <div class="empty-state">
        <p>Loading settings...</p>
      </div>
    );
  }

  return (
    <>
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
                    value={getEffectiveBoolValue(settings.value, dirty.value, 'monitoring', f.key)}
                    onChange={(v) => handleFieldChange(`monitoring.${f.key}`, v)}
                    description={MONITORING_DESCRIPTIONS[f.key]}
                  />
                </div>
              ) : (
                <FormField
                  key={f.key}
                  label={keyToLabel(f.key)}
                  name={`monitoring.${f.key}`}
                  type="number"
                  value={Number(getEffectiveValue(settings.value, dirty.value, 'monitoring', f.key)) || 0}
                  onChange={(v) => handleFieldChange(`monitoring.${f.key}`, v)}
                  min={f.min}
                  max={f.max}
                  description={MONITORING_DESCRIPTIONS[f.key]}
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
  const filters = useSignal<Record<string, string>>({
    eventType: '',
    channel: '',
    status: '',
    since: '',
    until: '',
  });

  const fetchStatus = async () => {
    try {
      const { data: result } = await api.GET('/v1/admin/notifications/status');
      status.value = result!;
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
      const params = new URLSearchParams();
      params.set('page', String(page));
      params.set('pageSize', String(PAGE_SIZE));
      const f = filters.value;
      if (f.eventType) params.set('eventType', f.eventType);
      if (f.channel) params.set('channel', f.channel);
      if (f.status) params.set('status', f.status);
      if (f.since) {
        const d = new Date(f.since);
        if (!isNaN(d.getTime())) params.set('since', String(Math.floor(d.getTime() / 1000)));
      }
      if (f.until) {
        const d = new Date(f.until);
        if (!isNaN(d.getTime())) {
          d.setHours(23, 59, 59, 999);
          params.set('until', String(Math.floor(d.getTime() / 1000)));
        }
      }
      const query: Record<string, string> = {};
      params.forEach((v, k) => { query[k] = v; });
      const { data: result } = await api.GET('/v1/admin/notifications/log', { params: { query: query as Record<string, unknown> } });
      logs.value = result as unknown as NotificationLogResponse;
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
      const { data: body } = await api.POST('/v1/admin/notifications/test', {});
      const results = body!.results;
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
      const { data: body } = await api.POST('/v1/admin/notifications/test', { body: { channel: channelName } });
      const results = body!.results;
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

  const handleFilterChange = (newFilters: Record<string, string>) => {
    filters.value = newFilters;
    currentPage.value = 1;
    fetchLogs(1);
  };

  useEffect(() => {
    fetchStatus();
    fetchLogs(1);
    const interval = setInterval(() => fetchLogs(currentPage.value), DASHBOARD_POLL_INTERVAL_MS);
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
      render: (entry) => entry.walletId
        ? (
          <a
            href={`#/wallets/${entry.walletId}`}
            class="wallet-link"
            onClick={(e: Event) => e.stopPropagation()}
            title={entry.walletId}
          >
            {entry.walletId.slice(0, 8)}...
          </a>
        )
        : '\u2014',
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
      ) : activeTab.value === 'balance' ? (
        <BalanceMonitorTab />
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
                    {ch.enabled
                      ? ch.configuredWallets != null
                        ? `${ch.configuredWallets} wallet${ch.configuredWallets !== 1 ? 's' : ''} configured`
                        : 'Connected'
                      : 'Not Configured'}
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
      <FilterBar
        fields={LOG_FILTER_FIELDS}
        values={filters.value}
        onChange={handleFilterChange}
        syncUrl={false}
      />
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
