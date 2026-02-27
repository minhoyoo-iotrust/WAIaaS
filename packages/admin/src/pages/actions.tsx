import { useSignal } from '@preact/signals';
import { useEffect } from 'preact/hooks';
import { apiGet, apiPut, apiDelete, ApiError } from '../api/client';
import { API } from '../api/endpoints';
import { FormField, Button, Badge } from '../components/form';
import { showToast } from '../components/toast';
import { getErrorMessage } from '../utils/error-messages';
import { keyToLabel } from '../utils/settings-helpers';
import type { SettingsData, ApiKeyEntry } from '../utils/settings-helpers';

// ---------------------------------------------------------------------------
// Built-in provider definitions (client-side static list)
// ---------------------------------------------------------------------------

interface BuiltinProvider {
  key: string;
  name: string;
  description: string;
  chain: 'solana' | 'evm' | 'multi';
  requiresApiKey: boolean;
  docsUrl?: string;
}

const BUILTIN_PROVIDERS: BuiltinProvider[] = [
  { key: 'jupiter_swap', name: 'Jupiter Swap', description: 'Solana DEX aggregator', chain: 'solana', requiresApiKey: false, docsUrl: 'https://station.jup.ag/docs' },
  { key: 'zerox_swap', name: '0x Swap', description: 'EVM DEX aggregator (AllowanceHolder)', chain: 'evm', requiresApiKey: true, docsUrl: 'https://dashboard.0x.org' },
  { key: 'lifi', name: 'LI.FI', description: 'Multi-chain DEX/bridge aggregator', chain: 'multi', requiresApiKey: false, docsUrl: 'https://docs.li.fi' },
  { key: 'lido_staking', name: 'Lido Staking', description: 'ETH liquid staking (stETH/wstETH)', chain: 'evm', requiresApiKey: false, docsUrl: 'https://docs.lido.fi' },
  { key: 'jito_staking', name: 'Jito Staking', description: 'SOL liquid staking (JitoSOL)', chain: 'solana', requiresApiKey: false, docsUrl: 'https://www.jito.network/docs' },
  { key: 'aave_v3', name: 'Aave V3 Lending', description: 'EVM lending protocol (supply, borrow, repay, withdraw)', chain: 'evm', requiresApiKey: false, docsUrl: 'https://docs.aave.com/developers' },
];

// ---------------------------------------------------------------------------
// Types for provider API response
// ---------------------------------------------------------------------------

interface ProviderAction {
  name: string;
  chain: string;
  riskLevel: string;
  defaultTier: string;
}

interface ProviderInfo {
  name: string;
  description: string;
  version: string;
  chains: string[];
  requiresApiKey: boolean;
  hasApiKey: boolean;
  actions: ProviderAction[];
}

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

  // Aave V3 advanced settings dirty state
  const advancedDirty = useSignal<Record<string, string>>({});

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
    }
  };

  const fetchApiKeys = async () => {
    try {
      const result = await apiGet<{ keys: ApiKeyEntry[] }>(API.ADMIN_API_KEYS);
      apiKeys.value = result.keys;
    } catch {
      // Feature not available -- keep empty
    }
  };

  const fetchProviders = async () => {
    try {
      const result = await apiGet<{ providers: ProviderInfo[] }>(API.ACTIONS_PROVIDERS);
      providers.value = result.providers ?? [];
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
  // Toggle handler
  // ---------------------------------------------------------------------------

  const handleToggle = async (providerKey: string, newEnabled: boolean) => {
    const settingKey = `actions.${providerKey}_enabled`;
    toggleSaving.value = providerKey;
    try {
      const result = await apiPut<{ updated: number; settings: SettingsData }>(API.ADMIN_SETTINGS, {
        settings: [{ key: settingKey, value: String(newEnabled) }],
      });
      settings.value = result.settings;
      showToast('success', `${newEnabled ? 'Enabled' : 'Disabled'} ${providerKey.replace(/_/g, ' ')}`);
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
      await apiPut(API.ADMIN_API_KEY(providerKey), { apiKey: apiKeyInput.value });
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
      await apiDelete(API.ADMIN_API_KEY(providerKey));
      showToast('success', `API key deleted for ${providerKey}`);
      await fetchApiKeys();
    } catch (err) {
      const e = err instanceof ApiError ? err : new ApiError(0, 'UNKNOWN', 'Unknown error');
      showToast('error', getErrorMessage(e.code));
    }
  };

  // ---------------------------------------------------------------------------
  // Advanced settings save handler (Aave V3)
  // ---------------------------------------------------------------------------

  const handleAdvancedSave = async (settingKey: string, value: string) => {
    const fullKey = `actions.${settingKey}`;
    try {
      const result = await apiPut<{ updated: number; settings: SettingsData }>(API.ADMIN_SETTINGS, {
        settings: [{ key: fullKey, value }],
      });
      settings.value = result.settings;
      // Clear dirty for this key
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

  function isEnabled(providerKey: string): boolean {
    const cat = settings.value['actions'] as Record<string, string> | undefined;
    if (!cat) return false;
    return cat[`${providerKey}_enabled`] === 'true';
  }

  function isRegistered(providerKey: string): boolean {
    return providers.value.some(
      (p) => p.name.toLowerCase().replace(/[\s-]/g, '_') === providerKey || p.name.toLowerCase().includes(providerKey.replace(/_/g, ' ')),
    );
  }

  function getApiKeyEntry(providerKey: string): ApiKeyEntry | undefined {
    return apiKeys.value.find(
      (k) => k.providerName === providerKey || k.providerName.toLowerCase().replace(/[\s-]/g, '_') === providerKey,
    );
  }

  function getRegisteredProvider(providerKey: string): ProviderInfo | undefined {
    return providers.value.find(
      (p) => p.name.toLowerCase().replace(/[\s-]/g, '_') === providerKey || p.name.toLowerCase().includes(providerKey.replace(/_/g, ' ')),
    );
  }

  function getStatus(bp: BuiltinProvider): { label: string; variant: 'success' | 'warning' | 'neutral' } {
    const enabled = isEnabled(bp.key);
    const registered = isRegistered(bp.key);

    if (enabled && bp.requiresApiKey && !getApiKeyEntry(bp.key)?.hasKey) {
      return { label: 'Requires API Key', variant: 'warning' };
    }
    if (enabled && registered) {
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

  return (
    <div class="page">
      {BUILTIN_PROVIDERS.map((bp) => {
        const status = getStatus(bp);
        const enabled = isEnabled(bp.key);
        const registered = getRegisteredProvider(bp.key);
        const keyEntry = getApiKeyEntry(bp.key);
        const isSavingToggle = toggleSaving.value === bp.key;

        return (
          <div key={bp.key} class="settings-category" style={{ marginBottom: 'var(--space-4)' }}>
            {/* Header */}
            <div class="settings-category-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <h3 style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', margin: 0 }}>
                  {bp.name}
                  {registered && (
                    <Badge variant="info">{registered.version}</Badge>
                  )}
                  <Badge variant={bp.chain === 'solana' ? 'info' : 'info'}>
                    {bp.chain}
                  </Badge>
                </h3>
                <p class="settings-description" style={{ marginTop: 'var(--space-1)' }}>
                  {bp.description}
                  {bp.docsUrl && (
                    <>
                      {' '}&mdash;{' '}
                      <a href={bp.docsUrl} target="_blank" rel="noopener noreferrer">Docs</a>
                    </>
                  )}
                </p>
              </div>
              <Badge variant={status.variant}>{status.label}</Badge>
            </div>

            <div class="settings-category-body">
              {/* Enable/Disable toggle */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', marginBottom: 'var(--space-3)' }}>
                <FormField
                  label="Enabled"
                  name={`actions.${bp.key}_enabled`}
                  type="checkbox"
                  value={enabled}
                  onChange={(v) => handleToggle(bp.key, !!v)}
                  disabled={isSavingToggle}
                />
                {isSavingToggle && <span style={{ fontSize: 'var(--font-size-sm)', color: 'var(--text-secondary)' }}>Saving...</span>}
              </div>

              {/* API Key section -- only for providers that require keys */}
              {bp.requiresApiKey && (
                <div style={{ borderTop: '1px solid var(--border)', paddingTop: 'var(--space-3)', marginBottom: 'var(--space-3)' }}>
                  <div style={{ fontWeight: 600, fontSize: 'var(--font-size-sm)', marginBottom: 'var(--space-2)', color: 'var(--text-secondary)' }}>
                    API Key
                  </div>
                  {apiKeyEditing.value === bp.key ? (
                    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 'var(--space-2)' }}>
                      <FormField
                        label="API Key"
                        type="password"
                        name={`apikey-${bp.key}`}
                        value={apiKeyInput.value}
                        onChange={(v) => { apiKeyInput.value = String(v); }}
                        placeholder="Enter API key"
                      />
                      <Button
                        onClick={() => handleSaveApiKey(bp.key)}
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
                        onClick={() => { apiKeyEditing.value = bp.key; apiKeyInput.value = ''; }}
                        size="sm"
                      >{keyEntry?.hasKey ? 'Update' : 'Set'}</Button>
                      {keyEntry?.hasKey && (
                        <Button
                          variant="danger"
                          onClick={() => handleDeleteApiKey(bp.key)}
                          size="sm"
                        >Delete</Button>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Aave V3 Advanced Settings -- only when Aave V3 is enabled */}
              {bp.key === 'aave_v3' && enabled && (
                <div style={{ borderTop: '1px solid var(--border)', paddingTop: 'var(--space-3)', marginBottom: 'var(--space-3)' }}>
                  <div style={{ fontWeight: 600, fontSize: 'var(--font-size-sm)', marginBottom: 'var(--space-2)', color: 'var(--text-secondary)' }}>
                    Advanced Settings
                  </div>
                  {(['aave_v3_health_factor_warning_threshold', 'aave_v3_position_sync_interval_sec', 'aave_v3_max_ltv_pct'] as const).map((shortKey) => {
                    const cat = settings.value['actions'] as Record<string, string> | undefined;
                    const currentValue = advancedDirty.value[shortKey] ?? cat?.[shortKey] ?? '';
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

              {/* Actions list -- only when provider is enabled and registered */}
              {enabled && registered && registered.actions.length > 0 && (
                <div style={{ borderTop: '1px solid var(--border)', paddingTop: 'var(--space-3)' }}>
                  <div style={{ fontWeight: 600, fontSize: 'var(--font-size-sm)', marginBottom: 'var(--space-2)', color: 'var(--text-secondary)' }}>
                    Registered Actions
                  </div>
                  <table class="table">
                    <thead>
                      <tr>
                        <th>Name</th>
                        <th>Chain</th>
                        <th>Risk Level</th>
                        <th>Default Tier</th>
                      </tr>
                    </thead>
                    <tbody>
                      {registered.actions.map((action) => (
                        <tr key={action.name}>
                          <td>{action.name}</td>
                          <td><Badge variant="info">{action.chain}</Badge></td>
                          <td>{action.riskLevel}</td>
                          <td>{action.defaultTier}</td>
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

      {BUILTIN_PROVIDERS.length === 0 && (
        <div class="empty-state">
          <p>No action providers available.</p>
        </div>
      )}
    </div>
  );
}
