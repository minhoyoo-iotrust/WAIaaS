import { useSignal } from '@preact/signals';
import { useEffect } from 'preact/hooks';
import { apiGet, apiPost, apiPut, apiDelete, ApiError } from '../api/client';
import { API } from '../api/endpoints';
import { FormField, Button, Badge } from '../components/form';
import { Modal } from '../components/modal';
import { showToast } from '../components/toast';
import type { SettingsData } from '../utils/settings-helpers';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface WalletAppApi {
  id: string;
  name: string;
  display_name: string;
  signing_enabled: boolean;
  alerts_enabled: boolean;
  sign_topic: string | null;
  notify_topic: string | null;
  used_by: Array<{ id: string; label: string }>;
  created_at: number;
  updated_at: number;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function HumanWalletAppsPage() {
  const apps = useSignal<WalletAppApi[]>([]);
  const loading = useSignal(true);

  // ntfy server setting
  const ntfyServer = useSignal('');
  const ntfyServerOriginal = useSignal('');
  const ntfySaving = useSignal(false);

  // Global notification toggle state
  const notificationsEnabled = useSignal(false);
  const sdkEnabled = useSignal(false);
  const notifToggleSaving = useSignal(false);

  // Test notification state
  const testNotifSending = useSignal<string | null>(null);

  // Register modal
  const registerModal = useSignal(false);
  const registerName = useSignal('');
  const registerDisplayName = useSignal('');
  const registerSaving = useSignal(false);

  // Toggle saving state
  const toggleSaving = useSignal<string | null>(null);

  // Topic editing state: maps app.id -> { signTopic, notifyTopic }
  const topicEditing = useSignal<Record<string, { signTopic: string; notifyTopic: string }>>({});
  const topicSaving = useSignal<string | null>(null);

  // ---------------------------------------------------------------------------
  // Data fetching
  // ---------------------------------------------------------------------------

  const fetchApps = async () => {
    try {
      const data = await apiGet<{ apps: WalletAppApi[] }>(API.ADMIN_WALLET_APPS);
      apps.value = data.apps;
    } catch {
      showToast('Failed to load wallet apps', 'error');
    }
  };

  const fetchSettings = async () => {
    try {
      const data = await apiGet<SettingsData>(API.ADMIN_SETTINGS);
      // Settings API returns nested: { signing_sdk: { ntfy_server: '...', enabled: '...', ... } }
      const sdk = data['signing_sdk'];
      if (sdk) {
        const ntfyVal = sdk['ntfy_server'];
        if (ntfyVal !== undefined) {
          ntfyServer.value = String(ntfyVal) || '';
          ntfyServerOriginal.value = ntfyServer.value;
        }
        sdkEnabled.value = String(sdk['enabled']) === 'true';
        notificationsEnabled.value = String(sdk['notifications_enabled']) === 'true';
      }
    } catch {
      // Settings may not be available
    }
  };

  useEffect(() => {
    Promise.all([fetchApps(), fetchSettings()]).finally(() => {
      loading.value = false;
    });
  }, []);

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------

  const handleSaveNtfyServer = async () => {
    ntfySaving.value = true;
    try {
      await apiPut(API.ADMIN_SETTINGS, {
        settings: [{ key: 'signing_sdk.ntfy_server', value: ntfyServer.value }],
      });
      ntfyServerOriginal.value = ntfyServer.value;
      showToast('ntfy server URL saved', 'success');
    } catch {
      showToast('Failed to save ntfy server URL', 'error');
    } finally {
      ntfySaving.value = false;
    }
  };

  const handleNotifToggle = async () => {
    notifToggleSaving.value = true;
    const newValue = !notificationsEnabled.value;
    try {
      await apiPut(API.ADMIN_SETTINGS, {
        settings: [{ key: 'signing_sdk.notifications_enabled', value: String(newValue) }],
      });
      notificationsEnabled.value = newValue;
      showToast(`Wallet app notifications ${newValue ? 'enabled' : 'disabled'}`, 'success');
    } catch {
      showToast('Failed to update notification setting', 'error');
    } finally {
      notifToggleSaving.value = false;
    }
  };

  const handleToggle = async (app: WalletAppApi, field: 'signing_enabled' | 'alerts_enabled') => {
    toggleSaving.value = `${app.id}-${field}`;
    try {
      await apiPut(API.ADMIN_WALLET_APP(app.id), {
        [field]: !app[field],
      });
      await fetchApps();
      showToast(`${field === 'signing_enabled' ? 'Signing' : 'Alerts'} ${app[field] ? 'disabled' : 'enabled'} for ${app.display_name}`, 'success');
    } catch {
      showToast('Failed to update toggle', 'error');
    } finally {
      toggleSaving.value = null;
    }
  };

  const handleTestNotification = async (app: WalletAppApi) => {
    testNotifSending.value = app.id;
    try {
      const result = await apiPost<{ success: boolean; topic?: string; error?: string }>(
        API.ADMIN_WALLET_APP_TEST_NOTIFICATION(app.id),
      );
      if (result.success) {
        showToast(`Test notification sent to ${result.topic}`, 'success');
      } else {
        showToast(result.error || 'Test notification failed', 'error');
      }
    } catch {
      showToast('Failed to send test notification', 'error');
    } finally {
      testNotifSending.value = null;
    }
  };

  const handleRegister = async () => {
    if (!registerName.value.trim() || !registerDisplayName.value.trim()) {
      showToast('Name and display name are required', 'error');
      return;
    }
    registerSaving.value = true;
    try {
      await apiPost(API.ADMIN_WALLET_APPS, {
        name: registerName.value.trim(),
        display_name: registerDisplayName.value.trim(),
      });
      registerModal.value = false;
      registerName.value = '';
      registerDisplayName.value = '';
      await fetchApps();
      showToast('Wallet app registered', 'success');
    } catch (err) {
      if (err instanceof ApiError && err.code === 'WALLET_APP_DUPLICATE') {
        showToast('App already registered', 'error');
      } else {
        showToast('Failed to register app', 'error');
      }
    } finally {
      registerSaving.value = false;
    }
  };

  const handleRemove = async (app: WalletAppApi) => {
    if (!confirm(`Remove "${app.display_name}"? Wallets using this app will no longer route signing requests to it.`)) {
      return;
    }
    try {
      await apiDelete(API.ADMIN_WALLET_APP(app.id));
      await fetchApps();
      showToast(`${app.display_name} removed`, 'success');
    } catch {
      showToast('Failed to remove app', 'error');
    }
  };

  const startTopicEdit = (app: WalletAppApi) => {
    topicEditing.value = {
      ...topicEditing.value,
      [app.id]: {
        signTopic: app.sign_topic ?? '',
        notifyTopic: app.notify_topic ?? '',
      },
    };
  };

  const cancelTopicEdit = (appId: string) => {
    const next = { ...topicEditing.value };
    delete next[appId];
    topicEditing.value = next;
  };

  const handleTopicSave = async (app: WalletAppApi) => {
    const edit = topicEditing.value[app.id];
    if (!edit) return;
    topicSaving.value = app.id;
    try {
      await apiPut(API.ADMIN_WALLET_APP(app.id), {
        sign_topic: edit.signTopic || null,
        notify_topic: edit.notifyTopic || null,
      });
      cancelTopicEdit(app.id);
      await fetchApps();
      showToast('Topics updated', 'success');
    } catch {
      showToast('Failed to update topics', 'error');
    } finally {
      topicSaving.value = null;
    }
  };

  // Check if any app has alerts enabled (for warning banner)
  const hasAlertsEnabledApp = apps.value.some((a) => a.alerts_enabled);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  if (loading.value) {
    return <div class="loading-container">Loading...</div>;
  }

  return (
    <div class="human-wallet-apps-page">
      {/* ntfy Server URL */}
      <div class="settings-category" style={{ marginBottom: '1.5rem' }}>
        <div class="settings-category-header">
          <h3>Push Relay Server</h3>
          <p class="settings-description">
            ntfy server URL used for signing requests and wallet app notifications
          </p>
        </div>
        <div class="settings-category-body">
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-end' }}>
            <div style={{ flex: 1 }}>
              <FormField
                label="ntfy Server URL"
                name="ntfy-server-url"
                type="text"
                value={ntfyServer.value}
                onChange={(v) => { ntfyServer.value = String(v); }}
                placeholder="https://ntfy.sh"
                description="Push notification relay server for signing requests"
              />
            </div>
            <Button
              onClick={handleSaveNtfyServer}
              disabled={ntfySaving.value || ntfyServer.value === ntfyServerOriginal.value}
              style={{ marginBottom: '0.25rem' }}
            >
              {ntfySaving.value ? 'Saving...' : 'Save'}
            </Button>
          </div>
        </div>
      </div>

      {/* Wallet App Notifications Toggle */}
      <div class="settings-category" style={{ marginBottom: '1.5rem' }}>
        <div class="settings-category-header">
          <h3>Wallet App Notifications</h3>
          <p class="settings-description">
            Push event notifications (transaction alerts, balance changes) to registered wallet apps via ntfy
          </p>
        </div>
        <div class="settings-category-body">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={notificationsEnabled.value}
                onChange={handleNotifToggle}
                disabled={notifToggleSaving.value}
                data-testid="notif-toggle"
              />
              <span>Notifications</span>
              <Badge variant={notificationsEnabled.value ? 'success' : 'muted'}>
                {notificationsEnabled.value ? 'ON' : 'OFF'}
              </Badge>
            </label>
            {notifToggleSaving.value && <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Saving...</span>}
          </div>

          {/* Warning: SDK disabled */}
          {!sdkEnabled.value && (
            <div class="settings-warning-box" style={{ marginTop: '0.75rem', padding: '0.75rem', background: 'var(--warning-bg, #fff3cd)', border: '1px solid var(--warning-border, #ffc107)', borderRadius: '4px', fontSize: '0.85rem' }}>
              Signing SDK is disabled. Enable it in System &gt; Signing SDK to use wallet app notifications.
            </div>
          )}

          {/* Warning: toggle off but apps have alerts enabled */}
          {!notificationsEnabled.value && hasAlertsEnabledApp && (
            <div class="settings-warning-box" style={{ marginTop: '0.75rem', padding: '0.75rem', background: 'var(--warning-bg, #fff3cd)', border: '1px solid var(--warning-border, #ffc107)', borderRadius: '4px', fontSize: '0.85rem' }}>
              Notifications are disabled but some apps have alerts enabled. Enable notifications above for alerts to be delivered.
            </div>
          )}
        </div>
      </div>

      {/* App Cards */}
      <div class="settings-category">
        <div class="settings-category-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h3>Registered Apps</h3>
            <p class="settings-description">
              Wallet apps registered for signing and notifications
            </p>
          </div>
          <Button onClick={() => { registerModal.value = true; }}>
            + Register App
          </Button>
        </div>
        <div class="settings-category-body">
          {apps.value.length === 0 ? (
            <div class="settings-info-box">
              No wallet apps registered. Use "+ Register App" to add one, or apply a wallet preset when setting up a wallet owner.
            </div>
          ) : (
            <div style={{ display: 'grid', gap: '1rem' }}>
              {apps.value.map((app) => (
                <div key={app.id} class="settings-category" style={{ border: '1px solid var(--border)', padding: '1rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <h4 style={{ margin: '0 0 0.25rem 0' }}>{app.display_name}</h4>
                      <code style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{app.name}</code>
                    </div>
                    <Button
                      variant="danger"
                      size="sm"
                      onClick={() => handleRemove(app)}
                    >
                      Remove
                    </Button>
                  </div>

                  <div style={{ display: 'flex', gap: '2rem', marginTop: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
                    {/* Signing toggle */}
                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={app.signing_enabled}
                        onChange={() => handleToggle(app, 'signing_enabled')}
                        disabled={toggleSaving.value === `${app.id}-signing_enabled`}
                      />
                      <span>Signing</span>
                      <Badge variant={app.signing_enabled ? 'success' : 'muted'}>
                        {app.signing_enabled ? 'ON' : 'OFF'}
                      </Badge>
                    </label>

                    {/* Alerts toggle */}
                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={app.alerts_enabled}
                        onChange={() => handleToggle(app, 'alerts_enabled')}
                        disabled={toggleSaving.value === `${app.id}-alerts_enabled`}
                      />
                      <span>Alerts</span>
                      <Badge variant={app.alerts_enabled ? 'success' : 'muted'}>
                        {app.alerts_enabled ? 'ON' : 'OFF'}
                      </Badge>
                    </label>

                    {/* Test notification button */}
                    {app.alerts_enabled && (
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => handleTestNotification(app)}
                        disabled={testNotifSending.value === app.id}
                      >
                        {testNotifSending.value === app.id ? 'Sending...' : 'Test'}
                      </Button>
                    )}
                  </div>

                  {/* Used by */}
                  <div style={{ marginTop: '0.75rem' }}>
                    <span style={{ fontSize: '0.85rem', fontWeight: 500 }}>Used by: </span>
                    {app.used_by.length === 0 ? (
                      <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>No wallets</span>
                    ) : (
                      <span style={{ fontSize: '0.85rem' }}>
                        {app.used_by.map((w, i) => (
                          <span key={w.id}>
                            {i > 0 && ', '}
                            <a href={`#/wallets/${w.id}`} style={{ color: 'var(--primary)' }}>{w.label}</a>
                          </span>
                        ))}
                      </span>
                    )}
                  </div>

                  {/* ntfy Topics */}
                  {topicEditing.value[app.id] ? (
                    <div style={{ marginTop: '0.75rem', borderTop: '1px solid var(--border)', paddingTop: '0.75rem' }}>
                      <span style={{ fontSize: '0.85rem', fontWeight: 500, display: 'block', marginBottom: '0.5rem' }}>ntfy Topics</span>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                        <FormField
                          label="Sign Topic"
                          name={`sign-topic-${app.id}`}
                          type="text"
                          value={topicEditing.value[app.id]!.signTopic}
                          onChange={(v) => {
                            topicEditing.value = {
                              ...topicEditing.value,
                              [app.id]: { ...topicEditing.value[app.id]!, signTopic: String(v) },
                            };
                          }}
                          placeholder={`waiaas-sign-${app.name}`}
                          description="ntfy topic for signing requests"
                        />
                        <FormField
                          label="Notify Topic"
                          name={`notify-topic-${app.id}`}
                          type="text"
                          value={topicEditing.value[app.id]!.notifyTopic}
                          onChange={(v) => {
                            topicEditing.value = {
                              ...topicEditing.value,
                              [app.id]: { ...topicEditing.value[app.id]!, notifyTopic: String(v) },
                            };
                          }}
                          placeholder={`waiaas-notify-${app.name}`}
                          description="ntfy topic for activity alerts"
                        />
                      </div>
                      <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
                        <Button variant="secondary" size="sm" onClick={() => cancelTopicEdit(app.id)}>
                          Cancel
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => handleTopicSave(app)}
                          disabled={topicSaving.value === app.id}
                        >
                          {topicSaving.value === app.id ? 'Saving...' : 'Save Topics'}
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div style={{ marginTop: '0.75rem', borderTop: '1px solid var(--border)', paddingTop: '0.75rem' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                        <span style={{ fontSize: '0.85rem', fontWeight: 500 }}>ntfy Topics</span>
                        <Button variant="secondary" size="sm" onClick={() => startTopicEdit(app)}>
                          Edit
                        </Button>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', fontSize: '0.85rem' }}>
                        <div>
                          <span style={{ color: 'var(--text-muted)' }}>Sign Topic: </span>
                          <code>{app.sign_topic ?? '(default)'}</code>
                        </div>
                        <div>
                          <span style={{ color: 'var(--text-muted)' }}>Notify Topic: </span>
                          <code>{app.notify_topic ?? '(default)'}</code>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Register Modal */}
      <Modal
        open={registerModal.value}
        title="Register Wallet App"
        onCancel={() => { registerModal.value = false; }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <FormField
            label="App Name"
            name="register-app-name"
            type="text"
            value={registerName.value}
            onChange={(v) => { registerName.value = String(v); }}
            placeholder="my-custom-wallet"
            description="Lowercase alphanumeric with hyphens (e.g., dcent, my-wallet)"
          />
          <FormField
            label="Display Name"
            name="register-app-display-name"
            type="text"
            value={registerDisplayName.value}
            onChange={(v) => { registerDisplayName.value = String(v); }}
            placeholder="My Custom Wallet"
            description="Human-readable name shown in the UI"
          />
          <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
            <Button variant="secondary" onClick={() => { registerModal.value = false; }}>
              Cancel
            </Button>
            <Button
              onClick={handleRegister}
              disabled={registerSaving.value || !registerName.value.trim() || !registerDisplayName.value.trim()}
            >
              {registerSaving.value ? 'Registering...' : 'Register'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
