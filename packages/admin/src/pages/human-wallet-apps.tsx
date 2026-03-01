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

  // Register modal
  const registerModal = useSignal(false);
  const registerName = useSignal('');
  const registerDisplayName = useSignal('');
  const registerSaving = useSignal(false);

  // Toggle saving state
  const toggleSaving = useSignal<string | null>(null);

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
      const ntfyEntry = data['signing_sdk.ntfy_server'];
      if (ntfyEntry) {
        ntfyServer.value = ntfyEntry.value || ntfyEntry.default_value || '';
        ntfyServerOriginal.value = ntfyServer.value;
      }
    } catch {
      // Settings may not have ntfy_server
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
        settings: { 'signing_sdk.ntfy_server': ntfyServer.value },
      });
      ntfyServerOriginal.value = ntfyServer.value;
      showToast('ntfy server URL saved', 'success');
    } catch {
      showToast('Failed to save ntfy server URL', 'error');
    } finally {
      ntfySaving.value = false;
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

                  <div style={{ display: 'flex', gap: '2rem', marginTop: '1rem', flexWrap: 'wrap' }}>
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
