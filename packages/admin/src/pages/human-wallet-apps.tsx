import { useSignal } from '@preact/signals';
import { useEffect } from 'preact/hooks';
import { api, ApiError } from '../api/typed-client';
import type { WalletApp } from '../api/types.aliases';
import { FormField, Button, Badge } from '../components/form';
import { Modal } from '../components/modal';
import { showToast } from '../components/toast';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type WalletAppApi = WalletApp;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function HumanWalletAppsPage() {
  const apps = useSignal<WalletAppApi[]>([]);
  const loading = useSignal(true);

  // Global notification toggle state
  const notificationsEnabled = useSignal(false);
  const sdkEnabled = useSignal(false);
  const notifToggleSaving = useSignal(false);

  // Test notification state
  const testNotifSending = useSignal<string | null>(null);

  // Test sign request state
  const testSignSending = useSignal<string | null>(null);
  const testSignError = useSignal<Record<string, string>>({});
  const testSignResult = useSignal<Record<string, { action: string; signature?: string; signerAddress: string; signedAt: string } | null>>({});

  // Register modal
  const registerModal = useSignal(false);
  const registerName = useSignal('');
  const registerDisplayName = useSignal('');
  const registerWalletType = useSignal('');
  const registerPushRelayUrl = useSignal('');
  const registerSaving = useSignal(false);

  // Subscription token editing state: maps app.id -> token value
  const subTokenEditing = useSignal<Record<string, string>>({});
  const subTokenSaving = useSignal<string | null>(null);

  // Push Relay URL editing state: maps app.id -> url value
  const pushRelayEditing = useSignal<Record<string, string>>({});
  const pushRelaySaving = useSignal<string | null>(null);

  // Inline test notification error: maps app.id -> error message
  const testNotifError = useSignal<Record<string, string>>({});

  // Toggle saving state
  const toggleSaving = useSignal<string | null>(null);

  // ---------------------------------------------------------------------------
  // Data fetching
  // ---------------------------------------------------------------------------

  const fetchApps = async () => {
    try {
      const { data } = await api.GET('/v1/admin/wallet-apps');
      apps.value = data!.apps;
    } catch {
      showToast('error', 'Failed to load wallet apps');
    }
  };

  const fetchSettings = async () => {
    try {
      const { data } = await api.GET('/v1/admin/settings');
      const sdk = data?.['signing_sdk'];
      if (sdk) {
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

  const handleNotifToggle = async () => {
    notifToggleSaving.value = true;
    const newValue = !notificationsEnabled.value;
    try {
      await api.PUT('/v1/admin/settings', {
        body: { settings: [{ key: 'signing_sdk.notifications_enabled', value: String(newValue) }] },
      });
      notificationsEnabled.value = newValue;
      showToast('success', `Wallet app notifications ${newValue ? 'enabled' : 'disabled'}`);
    } catch {
      showToast('error', 'Failed to update notification setting');
    } finally {
      notifToggleSaving.value = false;
    }
  };

  const handleToggle = async (app: WalletAppApi, field: 'signing_enabled' | 'alerts_enabled') => {
    toggleSaving.value = `${app.id}-${field}`;
    try {
      await api.PUT('/v1/admin/wallet-apps/{id}', {
        params: { path: { id: app.id } },
        body: { [field]: !app[field] },
      });
      await fetchApps();
      showToast('success', `${field === 'signing_enabled' ? 'Signing' : 'Alerts'} ${app[field] ? 'disabled' : 'enabled'} for ${app.display_name}`);
    } catch {
      showToast('error', 'Failed to update toggle');
    } finally {
      toggleSaving.value = null;
    }
  };

  const handleTestNotification = async (app: WalletAppApi) => {
    testNotifSending.value = app.id;
    // Clear previous error
    const nextErr = { ...testNotifError.value };
    delete nextErr[app.id];
    testNotifError.value = nextErr;
    try {
      const { data: result } = await api.POST('/v1/admin/wallet-apps/{id}/test-notification', {
        params: { path: { id: app.id } },
      });
      if (result!.success) {
        showToast('success', 'Test notification sent successfully');
      } else {
        const errorMsg = result!.error || 'Test notification failed';
        testNotifError.value = { ...testNotifError.value, [app.id]: errorMsg };
      }
    } catch {
      testNotifError.value = { ...testNotifError.value, [app.id]: 'Failed to send test notification' };
    } finally {
      testNotifSending.value = null;
    }
  };

  const handleTestSignRequest = async (app: WalletAppApi) => {
    testSignSending.value = app.id;
    // Clear previous state
    const nextErr = { ...testSignError.value };
    delete nextErr[app.id];
    testSignError.value = nextErr;
    const nextRes = { ...testSignResult.value };
    delete nextRes[app.id];
    testSignResult.value = nextRes;
    try {
      const { data: result } = await api.POST('/v1/admin/wallet-apps/{id}/test-sign-request', {
        params: { path: { id: app.id } },
      });
      if (result!.timeout) {
        testSignError.value = { ...testSignError.value, [app.id]: 'No response within 30 seconds. Check device connection.' };
      } else if (result!.success && result!.result) {
        testSignResult.value = { ...testSignResult.value, [app.id]: result!.result };
        showToast(result!.result.action === 'approve' ? 'success' : 'warning', `Sign request ${result!.result.action === 'approve' ? 'approved' : 'rejected'}`);
      } else {
        testSignError.value = { ...testSignError.value, [app.id]: result!.error || 'Test sign request failed' };
      }
    } catch {
      testSignError.value = { ...testSignError.value, [app.id]: 'Failed to send test sign request' };
    } finally {
      testSignSending.value = null;
    }
  };

  const handleRegister = async () => {
    if (!registerName.value.trim() || !registerDisplayName.value.trim()) {
      showToast('error', 'Name and display name are required');
      return;
    }
    registerSaving.value = true;
    try {
      const body: Record<string, string> = {
        name: registerName.value.trim(),
        display_name: registerDisplayName.value.trim(),
      };
      if (registerWalletType.value.trim()) {
        body.wallet_type = registerWalletType.value.trim();
      }
      if (registerPushRelayUrl.value.trim()) {
        body.push_relay_url = registerPushRelayUrl.value.trim();
      }
      await api.POST('/v1/admin/wallet-apps', { body: body as { name: string; display_name: string; wallet_type?: string; push_relay_url?: string } });
      registerModal.value = false;
      registerName.value = '';
      registerDisplayName.value = '';
      registerWalletType.value = '';
      registerPushRelayUrl.value = '';
      await fetchApps();
      showToast('success', 'Wallet app registered');
    } catch (err) {
      if (err instanceof ApiError && err.code === 'WALLET_APP_DUPLICATE') {
        showToast('error', 'App already registered');
      } else {
        showToast('error', 'Failed to register app');
      }
    } finally {
      registerSaving.value = false;
    }
  };

  const handleSetSubToken = async (app: WalletAppApi, token: string) => {
    subTokenSaving.value = app.id;
    try {
      await api.PUT('/v1/admin/wallet-apps/{id}', {
        params: { path: { id: app.id } },
        body: { subscription_token: token || '' },
      });
      const next = { ...subTokenEditing.value };
      delete next[app.id];
      subTokenEditing.value = next;
      await fetchApps();
      showToast('success', token ? 'Subscription token set' : 'Subscription token cleared');
    } catch {
      showToast('error', 'Failed to update subscription token');
    } finally {
      subTokenSaving.value = null;
    }
  };

  const handleSetPushRelayUrl = async (app: WalletAppApi, url: string) => {
    pushRelaySaving.value = app.id;
    try {
      await api.PUT('/v1/admin/wallet-apps/{id}', {
        params: { path: { id: app.id } },
        body: { push_relay_url: url || '' },
      });
      const next = { ...pushRelayEditing.value };
      delete next[app.id];
      pushRelayEditing.value = next;
      await fetchApps();
      showToast('success', url ? 'Push Relay URL set' : 'Push Relay URL cleared');
    } catch {
      showToast('error', 'Failed to update Push Relay URL');
    } finally {
      pushRelaySaving.value = null;
    }
  };

  const handleRemove = async (app: WalletAppApi) => {
    if (!confirm(`Remove "${app.display_name}"? Wallets using this app will no longer route signing requests to it.`)) {
      return;
    }
    try {
      await api.DELETE('/v1/admin/wallet-apps/{id}', {
        params: { path: { id: app.id } },
      });
      await fetchApps();
      showToast('success', `${app.display_name} removed`);
    } catch {
      showToast('error', 'Failed to remove app');
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
      {/* Wallet App Notifications Toggle */}
      <div class="settings-category" style={{ marginBottom: '1.5rem' }}>
        <div class="settings-category-header">
          <h3>Wallet App Notifications</h3>
          <p class="settings-description">
            Push event notifications (transaction alerts, balance changes) to registered wallet apps via Push Relay
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
            <div class="settings-warning-box" style={{ marginTop: '0.75rem', padding: '0.75rem', background: 'var(--color-warning-bg)', border: '1px solid var(--color-warning)', borderRadius: '4px', fontSize: '0.85rem' }}>
              Signing SDK is disabled. Enable it in System &gt; Signing SDK to use wallet app notifications.
            </div>
          )}

          {/* Warning: toggle off but apps have alerts enabled */}
          {!notificationsEnabled.value && hasAlertsEnabledApp && (
            <div class="settings-warning-box" style={{ marginTop: '0.75rem', padding: '0.75rem', background: 'var(--color-warning-bg)', border: '1px solid var(--color-warning)', borderRadius: '4px', fontSize: '0.85rem' }}>
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
                      <h4 style={{ margin: '0 0 0.25rem 0' }}>
                        {app.display_name}
                        {app.wallet_type && app.wallet_type !== app.name && (
                          <Badge variant="info" style={{ marginLeft: '0.5rem', fontSize: '0.7rem' }}>{app.wallet_type}</Badge>
                        )}
                      </h4>
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
                    {app.alerts_enabled && (() => {
                      const canTest = !!(app.subscription_token && app.push_relay_url);
                      return (
                        <span title={canTest ? undefined : 'Set subscription token and Push Relay URL first'}>
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => handleTestNotification(app)}
                            disabled={!canTest || testNotifSending.value === app.id}
                          >
                            {testNotifSending.value === app.id ? 'Sending...' : 'Test Notify'}
                          </Button>
                        </span>
                      );
                    })()}

                    {/* Test sign request button */}
                    {app.signing_enabled && (() => {
                      const canTest = !!(app.subscription_token && app.push_relay_url);
                      return (
                        <span title={canTest ? undefined : 'Set subscription token and Push Relay URL first'}>
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => handleTestSignRequest(app)}
                            disabled={!canTest || testSignSending.value === app.id}
                          >
                            {testSignSending.value === app.id ? 'Waiting...' : 'Test Sign'}
                          </Button>
                        </span>
                      );
                    })()}
                  </div>
                  {/* Inline test errors */}
                  {testNotifError.value[app.id] && (
                    <div style={{ marginTop: '0.5rem', fontSize: '0.85rem', color: 'var(--color-danger, #e74c3c)' }}>
                      {testNotifError.value[app.id]}
                    </div>
                  )}
                  {testSignError.value[app.id] && (
                    <div style={{ marginTop: '0.5rem', fontSize: '0.85rem', color: 'var(--color-danger, #e74c3c)' }}>
                      {testSignError.value[app.id]}
                    </div>
                  )}
                  {/* Sign request waiting indicator */}
                  {testSignSending.value === app.id && (
                    <div style={{ marginTop: '0.5rem', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                      Waiting for response from wallet app... Check your device.
                    </div>
                  )}
                  {/* Sign request result */}
                  {testSignResult.value[app.id] && (
                    <div style={{ marginTop: '0.5rem', padding: '0.75rem', background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: '4px', fontSize: '0.85rem' }}>
                      <div><strong>Action:</strong> <Badge variant={testSignResult.value[app.id]!.action === 'approve' ? 'success' : 'warning'}>{testSignResult.value[app.id]!.action}</Badge></div>
                      <div style={{ marginTop: '0.25rem' }}><strong>Signer:</strong> <code>{testSignResult.value[app.id]!.signerAddress.slice(0, 6)}...{testSignResult.value[app.id]!.signerAddress.slice(-4)}</code></div>
                      {testSignResult.value[app.id]!.signature && (
                        <div style={{ marginTop: '0.25rem' }}>
                          <strong>Signature:</strong>{' '}
                          <code
                            style={{ cursor: 'pointer', wordBreak: 'break-all' }}
                            title="Click to copy"
                            onClick={() => {
                              navigator.clipboard.writeText(testSignResult.value[app.id]!.signature!);
                              showToast('success', 'Signature copied');
                            }}
                          >
                            {testSignResult.value[app.id]!.signature!.slice(0, 20)}...
                          </code>
                        </div>
                      )}
                      <div style={{ marginTop: '0.25rem' }}><strong>Signed at:</strong> {testSignResult.value[app.id]!.signedAt}</div>
                    </div>
                  )}

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

                  {/* Subscription Token */}
                  <div style={{ marginTop: '0.75rem' }}>
                    <span style={{ fontSize: '0.85rem', fontWeight: 500 }}>Subscription Token: </span>
                    {subTokenEditing.value[app.id] !== undefined ? (
                      <span style={{ display: 'inline-flex', gap: '0.5rem', alignItems: 'center' }}>
                        <input
                          type="text"
                          value={subTokenEditing.value[app.id]}
                          onInput={(e) => {
                            subTokenEditing.value = {
                              ...subTokenEditing.value,
                              [app.id]: (e.target as HTMLInputElement).value,
                            };
                          }}
                          placeholder="e.g., a1b2c3d4"
                          style={{ padding: '0.25rem 0.5rem', fontSize: '0.85rem', width: '140px' }}
                        />
                        <Button
                          size="sm"
                          onClick={() => handleSetSubToken(app, subTokenEditing.value[app.id]!)}
                          disabled={subTokenSaving.value === app.id}
                        >
                          {subTokenSaving.value === app.id ? 'Saving...' : 'Set'}
                        </Button>
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => {
                            const next = { ...subTokenEditing.value };
                            delete next[app.id];
                            subTokenEditing.value = next;
                          }}
                        >
                          Cancel
                        </Button>
                      </span>
                    ) : app.subscription_token ? (
                      <span style={{ fontSize: '0.85rem' }}>
                        <code>{app.subscription_token.slice(0, 4)}****</code>
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => handleSetSubToken(app, '')}
                          disabled={subTokenSaving.value === app.id}
                          style={{ marginLeft: '0.5rem' }}
                        >
                          Clear
                        </Button>
                      </span>
                    ) : (
                      <span style={{ fontSize: '0.85rem' }}>
                        <span style={{ color: 'var(--text-muted)' }}>Not set</span>
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => {
                            subTokenEditing.value = { ...subTokenEditing.value, [app.id]: '' };
                          }}
                          style={{ marginLeft: '0.5rem' }}
                        >
                          Set
                        </Button>
                      </span>
                    )}
                  </div>

                  {/* Push Relay URL */}
                  <div style={{ marginTop: '0.75rem' }}>
                    <span style={{ fontSize: '0.85rem', fontWeight: 500 }}>Push Relay URL: </span>
                    {pushRelayEditing.value[app.id] !== undefined ? (
                      <span style={{ display: 'inline-flex', gap: '0.5rem', alignItems: 'center' }}>
                        <input
                          type="text"
                          value={pushRelayEditing.value[app.id]}
                          onInput={(e) => {
                            pushRelayEditing.value = {
                              ...pushRelayEditing.value,
                              [app.id]: (e.target as HTMLInputElement).value,
                            };
                          }}
                          placeholder="https://push-relay.example.com"
                          style={{ padding: '0.25rem 0.5rem', fontSize: '0.85rem', width: '260px' }}
                        />
                        <Button
                          size="sm"
                          onClick={() => handleSetPushRelayUrl(app, pushRelayEditing.value[app.id]!)}
                          disabled={pushRelaySaving.value === app.id}
                        >
                          {pushRelaySaving.value === app.id ? 'Saving...' : 'Save'}
                        </Button>
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => {
                            const next = { ...pushRelayEditing.value };
                            delete next[app.id];
                            pushRelayEditing.value = next;
                          }}
                        >
                          Cancel
                        </Button>
                      </span>
                    ) : app.push_relay_url ? (
                      <span style={{ fontSize: '0.85rem' }}>
                        <code>{app.push_relay_url}</code>
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => {
                            pushRelayEditing.value = { ...pushRelayEditing.value, [app.id]: app.push_relay_url || '' };
                          }}
                          style={{ marginLeft: '0.5rem' }}
                        >
                          Edit
                        </Button>
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => handleSetPushRelayUrl(app, '')}
                          disabled={pushRelaySaving.value === app.id}
                          style={{ marginLeft: '0.25rem' }}
                        >
                          Clear
                        </Button>
                      </span>
                    ) : (
                      <span style={{ fontSize: '0.85rem' }}>
                        <span style={{ color: 'var(--text-muted)' }}>Not configured</span>
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => {
                            pushRelayEditing.value = { ...pushRelayEditing.value, [app.id]: '' };
                          }}
                          style={{ marginLeft: '0.5rem' }}
                        >
                          Set
                        </Button>
                      </span>
                    )}
                  </div>
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
          <div class="form-field">
            <label for="field-register-app-wallet-type">Wallet Type (optional)</label>
            <input
              id="field-register-app-wallet-type"
              type="text"
              name="register-app-wallet-type"
              list="wallet-type-presets"
              value={registerWalletType.value}
              onInput={(e) => {
                const v = (e.target as HTMLInputElement).value;
                registerWalletType.value = v;
                // Auto-fill Push Relay URL for known presets
                const PRESET_PUSH_RELAY_URLS: Record<string, string> = {
                  dcent: 'https://waiaas-push.dcentwallet.com',
                };
                const preset = PRESET_PUSH_RELAY_URLS[v];
                registerPushRelayUrl.value = preset ?? '';
              }}
              placeholder="Select preset or enter custom"
            />
            <datalist id="wallet-type-presets">
              <option value="dcent">D'CENT Wallet</option>
            </datalist>
            <span class="form-description">Group multiple devices under the same wallet type. Defaults to app name.</span>
          </div>
          <FormField
            label="Push Relay URL (optional)"
            name="register-app-push-relay-url"
            type="text"
            value={registerPushRelayUrl.value}
            onChange={(v) => { registerPushRelayUrl.value = String(v); }}
            placeholder="https://push-relay.example.com"
            description="Push Relay server URL for sign requests and notifications"
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
