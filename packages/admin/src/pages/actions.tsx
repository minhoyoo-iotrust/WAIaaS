import { useSignal } from '@preact/signals';
import { useEffect } from 'preact/hooks';
import { api, ApiError } from '../api/typed-client';
import type { components } from '../api/types.generated';
import { FormField, Button, Badge } from '../components/form';
import { showToast } from '../components/toast';
import { getErrorMessage } from '../utils/error-messages';
import { keyToLabel, isSlippageBpsKey, bpsToPercent, percentToBps } from '../utils/settings-helpers';
import type { SettingsData, ApiKeyEntry } from '../utils/settings-helpers';

// ---------------------------------------------------------------------------
// Category display order (dynamic categories from API sorted by this)
// ---------------------------------------------------------------------------

const CATEGORY_ORDER = ['Swap', 'Bridge', 'Staking', 'Lending', 'Yield', 'Perp', 'Other'];

// ---------------------------------------------------------------------------
// Advanced settings map: provider key -> list of short setting keys to display
// ---------------------------------------------------------------------------

const PROVIDER_ADVANCED_SETTINGS: Record<string, readonly string[]> = {
  jupiter_swap: ['jupiter_swap_default_slippage_bps', 'jupiter_swap_max_slippage_bps'],
  zerox_swap: ['zerox_swap_default_slippage_bps', 'zerox_swap_max_slippage_bps'],
  aave_v3: ['aave_v3_health_factor_warning_threshold', 'aave_v3_position_sync_interval_sec', 'aave_v3_max_ltv_pct'],
  kamino: ['kamino_market', 'kamino_hf_threshold'],
  drift: ['drift_max_leverage', 'drift_max_position_usd', 'drift_margin_warning_threshold_pct', 'drift_position_sync_interval_sec'],
  pendle_yield: ['pendle_yield_default_slippage_bps', 'pendle_yield_max_slippage_bps'],
  dcent_swap: ['dcent_swap_api_url', 'dcent_swap_default_slippage_bps', 'dcent_swap_max_slippage_bps'],
};

// ---------------------------------------------------------------------------
// Types for provider API response
// ---------------------------------------------------------------------------

type ProviderInfo = components['schemas']['ProvidersListResponse']['providers'][number];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function ActionsPage() {
  const providers = useSignal<ProviderInfo[]>([]);
  const settings = useSignal<SettingsData>({});
  const apiKeys = useSignal<ApiKeyEntry[]>([]);
  const loading = useSignal(true);

  // API key editing state
  const apiKeyEditing = useSignal<string | null>(null);
  const apiKeyInput = useSignal('');
  const apiKeySaving = useSignal(false);

  // Toggle saving state
  const toggleSaving = useSignal<string | null>(null);

  // Advanced settings dirty state
  const advancedDirty = useSignal<Record<string, string>>({});

  // ---------------------------------------------------------------------------
  // Data fetching
  // ---------------------------------------------------------------------------

  const fetchSettings = async () => {
    try {
      const { data: result } = await api.GET('/v1/admin/settings');
      settings.value = result as unknown as SettingsData;
    } catch (err) {
      const e = err instanceof ApiError ? err : new ApiError(0, 'UNKNOWN', 'Unknown error');
      showToast('error', getErrorMessage(e.code));
    }
  };

  const fetchApiKeys = async () => {
    try {
      const { data: result } = await api.GET('/v1/admin/api-keys');
      apiKeys.value = (result as unknown as { keys: ApiKeyEntry[] }).keys;
    } catch {
      // Feature not available -- keep empty
    }
  };

  const fetchProviders = async () => {
    try {
      const { data: result } = await api.GET('/v1/actions/providers');
      providers.value = (result as unknown as { providers: ProviderInfo[] }).providers ?? [];
    } catch {
      // Providers endpoint not available -- keep empty
    }
  };

  const fetchAll = async () => {
    loading.value = true;
    await Promise.all([fetchSettings(), fetchApiKeys(), fetchProviders()]);
    loading.value = false;
  };

  useEffect(() => {
    fetchAll();
  }, []);

  // ---------------------------------------------------------------------------
  // Toggle handler (uses enabledKey from API response)
  // ---------------------------------------------------------------------------

  const handleToggle = async (provider: ProviderInfo, newEnabled: boolean) => {
    const settingKey = `actions.${provider.enabledKey}_enabled`;
    toggleSaving.value = provider.name;
    try {
      const { data: result } = await api.PUT('/v1/admin/settings', { body: {
        settings: [{ key: settingKey, value: String(newEnabled) }],
      } });
      settings.value = result!.settings as unknown as SettingsData;
      // Re-fetch providers to get updated isEnabled
      await fetchProviders();
      showToast('success', `${newEnabled ? 'Enabled' : 'Disabled'} ${provider.name.replace(/_/g, ' ')}`);
    } catch (err) {
      const e = err instanceof ApiError ? err : new ApiError(0, 'UNKNOWN', 'Unknown error');
      showToast('error', getErrorMessage(e.code));
    } finally {
      toggleSaving.value = null;
    }
  };

  // ---------------------------------------------------------------------------
  // API Key handlers
  // ---------------------------------------------------------------------------

  const handleSaveApiKey = async (providerKey: string) => {
    apiKeySaving.value = true;
    try {
      await api.PUT('/v1/admin/api-keys/{provider}', { params: { path: { provider: providerKey } }, body: { apiKey: apiKeyInput.value } });
      showToast('success', `API key saved for ${providerKey}`);
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

  const handleDeleteApiKey = async (providerKey: string) => {
    try {
      await api.DELETE('/v1/admin/api-keys/{provider}', { params: { path: { provider: providerKey } } });
      showToast('success', `API key deleted for ${providerKey}`);
      await fetchApiKeys();
    } catch (err) {
      const e = err instanceof ApiError ? err : new ApiError(0, 'UNKNOWN', 'Unknown error');
      showToast('error', getErrorMessage(e.code));
    }
  };

  // ---------------------------------------------------------------------------
  // Advanced settings save handler
  // ---------------------------------------------------------------------------

  const handleAdvancedSave = async (settingKey: string, value: string) => {
    const fullKey = `actions.${settingKey}`;
    const saveValue = isSlippageBpsKey(settingKey) ? percentToBps(value) : value;
    try {
      const { data: result } = await api.PUT('/v1/admin/settings', { body: {
        settings: [{ key: fullKey, value: saveValue }],
      } });
      settings.value = result!.settings as unknown as SettingsData;
      const newDirty = { ...advancedDirty.value };
      delete newDirty[settingKey];
      advancedDirty.value = newDirty;
      showToast('success', 'Setting updated');
    } catch (err) {
      const e = err instanceof ApiError ? err : new ApiError(0, 'UNKNOWN', 'Unknown error');
      showToast('error', getErrorMessage(e.code));
    }
  };

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  function getApiKeyEntry(providerKey: string): ApiKeyEntry | undefined {
    return apiKeys.value.find(
      (k) => k.providerName === providerKey || k.providerName.toLowerCase().replace(/[\s-]/g, '_') === providerKey,
    );
  }

  // ---------------------------------------------------------------------------
  // Tier override helpers (Phase 331)
  // ---------------------------------------------------------------------------

  function getTierOverride(providerKey: string, actionName: string): string {
    const cat = settings.value['actions'] as Record<string, string> | undefined;
    return cat?.[`${providerKey}_${actionName}_tier`] || '';
  }

  function isOverridden(providerKey: string, actionName: string): boolean {
    const override = getTierOverride(providerKey, actionName);
    return override !== '' && override !== undefined;
  }

  async function handleTierChange(providerKey: string, actionName: string, newTier: string) {
    const settingKey = `actions.${providerKey}_${actionName}_tier`;
    try {
      const { data: result } = await api.PUT('/v1/admin/settings', { body: {
        settings: [{ key: settingKey, value: newTier }],
      } });
      settings.value = result!.settings as unknown as SettingsData;
      showToast('success', `Tier updated for ${providerKey}/${actionName}`);
    } catch (err) {
      const e = err instanceof ApiError ? err : new ApiError(0, 'UNKNOWN', 'Unknown error');
      showToast('error', getErrorMessage(e.code));
    }
  }

  async function handleTierReset(providerKey: string, actionName: string) {
    const settingKey = `actions.${providerKey}_${actionName}_tier`;
    try {
      const { data: result } = await api.PUT('/v1/admin/settings', { body: {
        settings: [{ key: settingKey, value: '' }],
      } });
      settings.value = result!.settings as unknown as SettingsData;
      showToast('success', `Tier reset to default for ${providerKey}/${actionName}`);
    } catch (err) {
      const e = err instanceof ApiError ? err : new ApiError(0, 'UNKNOWN', 'Unknown error');
      showToast('error', getErrorMessage(e.code));
    }
  }

  /** Get display value for an advanced setting, applying bps->% conversion for slippage keys */
  function getAdvancedDisplayValue(shortKey: string): string {
    const cat = settings.value['actions'] as Record<string, string> | undefined;
    const raw = advancedDirty.value[shortKey] ?? cat?.[shortKey] ?? '';
    if (advancedDirty.value[shortKey] !== undefined) return advancedDirty.value[shortKey];
    return isSlippageBpsKey(shortKey) ? bpsToPercent(raw) : raw;
  }

  function getStatus(p: ProviderInfo): { label: string; variant: 'success' | 'warning' | 'neutral' } {
    if (p.isEnabled && p.requiresApiKey && !getApiKeyEntry(p.name)?.hasKey) {
      return { label: 'Requires API Key', variant: 'warning' };
    }
    if (p.isEnabled) {
      return { label: 'Active', variant: 'success' };
    }
    return { label: 'Inactive', variant: 'neutral' };
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  if (loading.value) {
    return (
      <div class="page">
        <div class="empty-state">
          <p>Loading action providers...</p>
        </div>
      </div>
    );
  }

  // Group providers by category from API response, sorted by CATEGORY_ORDER
  const categories = [...new Set(providers.value.map(p => p.category))];
  const sortedCategories = categories.sort((a, b) =>
    (CATEGORY_ORDER.indexOf(a) !== -1 ? CATEGORY_ORDER.indexOf(a) : 99) -
    (CATEGORY_ORDER.indexOf(b) !== -1 ? CATEGORY_ORDER.indexOf(b) : 99)
  );
  const groupedProviders = sortedCategories
    .map((cat) => ({ category: cat, items: providers.value.filter((p) => p.category === cat) }))
    .filter((g) => g.items.length > 0);

  return (
    <div class="page">
      {groupedProviders.map((group) => (
        <div key={group.category}>
          <h2 style={{ fontSize: 'var(--font-size-lg)', fontWeight: 600, margin: 'var(--space-4) 0 var(--space-2)', borderBottom: '1px solid var(--border)', paddingBottom: 'var(--space-2)' }}>
            {group.category}
          </h2>
          {group.items.map((p) => {
        const status = getStatus(p);
        const keyEntry = getApiKeyEntry(p.name);
        const isSavingToggle = toggleSaving.value === p.name;
        const advancedKeys = PROVIDER_ADVANCED_SETTINGS[p.name];

        return (
          <div key={p.name} class="settings-category" style={{ marginBottom: 'var(--space-4)' }}>
            {/* Header */}
            <div class="settings-category-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <h3 style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', margin: 0 }}>
                  {p.name.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
                  <Badge variant="info">{p.version}</Badge>
                  <Badge variant="info">
                    {p.chains.length > 1 ? 'multi' : p.chains[0]}
                  </Badge>
                </h3>
                <p class="settings-description" style={{ marginTop: 'var(--space-1)' }}>
                  {p.description}
                </p>
              </div>
              <Badge variant={status.variant}>{status.label}</Badge>
            </div>

            <div class="settings-category-body">
              {/* Enable/Disable toggle */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', marginBottom: 'var(--space-3)' }}>
                <FormField
                  label="Enabled"
                  name={`actions.${p.enabledKey}_enabled`}
                  type="checkbox"
                  value={p.isEnabled}
                  onChange={(v) => handleToggle(p, !!v)}
                  disabled={isSavingToggle}
                />
                {isSavingToggle && <span style={{ fontSize: 'var(--font-size-sm)', color: 'var(--text-secondary)' }}>Saving...</span>}
              </div>

              {/* API Key section -- only for providers that require keys */}
              {p.requiresApiKey && (
                <div style={{ borderTop: '1px solid var(--border)', paddingTop: 'var(--space-3)', marginBottom: 'var(--space-3)' }}>
                  <div style={{ fontWeight: 600, fontSize: 'var(--font-size-sm)', marginBottom: 'var(--space-2)', color: 'var(--text-secondary)' }}>
                    API Key
                  </div>
                  {apiKeyEditing.value === p.name ? (
                    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 'var(--space-2)' }}>
                      <FormField
                        label="API Key"
                        type="password"
                        name={`apikey-${p.name}`}
                        value={apiKeyInput.value}
                        onChange={(v) => { apiKeyInput.value = String(v); }}
                        placeholder="Enter API key"
                      />
                      <Button
                        onClick={() => handleSaveApiKey(p.name)}
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
                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                      <span style={{ fontFamily: 'monospace', fontSize: 'var(--font-size-sm)', color: 'var(--text-secondary)' }}>
                        {keyEntry?.hasKey ? keyEntry.maskedKey : 'Not set'}
                      </span>
                      <Button
                        variant="ghost"
                        onClick={() => { apiKeyEditing.value = p.name; apiKeyInput.value = ''; }}
                        size="sm"
                      >{keyEntry?.hasKey ? 'Update' : 'Set'}</Button>
                      {keyEntry?.hasKey && (
                        <Button
                          variant="danger"
                          onClick={() => handleDeleteApiKey(p.name)}
                          size="sm"
                        >Delete</Button>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Advanced Settings -- dynamically from PROVIDER_ADVANCED_SETTINGS */}
              {advancedKeys && p.isEnabled && (
                <div style={{ borderTop: '1px solid var(--border)', paddingTop: 'var(--space-3)', marginBottom: 'var(--space-3)' }}>
                  <div style={{ fontWeight: 600, fontSize: 'var(--font-size-sm)', marginBottom: 'var(--space-2)', color: 'var(--text-secondary)' }}>
                    Advanced Settings
                  </div>
                  {advancedKeys.map((shortKey) => {
                    const currentValue = getAdvancedDisplayValue(shortKey);
                    return (
                      <div
                        key={shortKey}
                        style={{ marginBottom: 'var(--space-2)' }}
                        onBlur={() => {
                          const val = advancedDirty.value[shortKey];
                          if (val !== undefined) {
                            void handleAdvancedSave(shortKey, val);
                          }
                        }}
                      >
                        <FormField
                          label={keyToLabel(shortKey)}
                          name={`actions.${shortKey}`}
                          type="text"
                          value={currentValue}
                          onChange={(v) => {
                            advancedDirty.value = { ...advancedDirty.value, [shortKey]: String(v) };
                          }}
                        />
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Actions list -- only when provider is enabled and has actions */}
              {p.isEnabled && p.actions.length > 0 && (
                <div style={{ borderTop: '1px solid var(--border)', paddingTop: 'var(--space-3)' }}>
                  <div style={{ fontWeight: 600, fontSize: 'var(--font-size-sm)', marginBottom: 'var(--space-2)', color: 'var(--text-secondary)' }}>
                    Registered Actions
                  </div>
                  <table class="table">
                    <thead>
                      <tr>
                        <th>Name</th>
                        <th>Description</th>
                        <th>Chain</th>
                        <th>Risk Level</th>
                        <th>Tier</th>
                      </tr>
                    </thead>
                    <tbody>
                      {p.actions.map((action) => (
                        <tr key={action.name}>
                          <td>{action.name}</td>
                          <td style={{ fontSize: 'var(--font-size-sm)', color: 'var(--text-secondary)', maxWidth: '300px' }}>{action.description}</td>
                          <td>
                            {p.chains.length > 1
                              ? p.chains.map((c) => <Badge key={c} variant="info">{c}</Badge>)
                              : <Badge variant="info">{action.chain}</Badge>
                            }
                          </td>
                          <td>{action.riskLevel}</td>
                          <td>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                              <select
                                value={getTierOverride(p.name, action.name) || action.defaultTier}
                                onChange={(e) => handleTierChange(p.name, action.name, (e.target as HTMLSelectElement).value)}
                                style={{ padding: '2px 4px', fontSize: 'var(--font-size-sm)', borderRadius: 'var(--radius-sm)' }}
                              >
                                {['INSTANT', 'NOTIFY', 'DELAY', 'APPROVAL'].map(t => (
                                  <option key={t} value={t}>{t}</option>
                                ))}
                              </select>
                              {isOverridden(p.name, action.name) && (
                                <>
                                  <Badge variant="warning">customized</Badge>
                                  <button
                                    onClick={() => handleTierReset(p.name, action.name)}
                                    style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)', textDecoration: 'underline' }}
                                    title="Reset to provider default"
                                  >
                                    reset
                                  </button>
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        );
          })}
        </div>
      ))}

      {providers.value.length === 0 && (
        <div class="empty-state">
          <p>No action providers available.</p>
        </div>
      )}
    </div>
  );
}
