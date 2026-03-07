import { useSignal } from '@preact/signals';
import { useEffect } from 'preact/hooks';
import { apiGet, apiPut, apiDelete, ApiError } from '../api/client';
import { API } from '../api/endpoints';
import { FormField, Button, Badge } from '../components/form';
import { showToast } from '../components/toast';
import { getErrorMessage } from '../utils/error-messages';
import { keyToLabel, isSlippageBpsKey, bpsToPercent, percentToBps } from '../utils/settings-helpers';
import type { SettingsData, ApiKeyEntry } from '../utils/settings-helpers';

// ---------------------------------------------------------------------------
// Built-in provider definitions (client-side static list)
// ---------------------------------------------------------------------------

type ProviderCategory = 'Swap' | 'Bridge' | 'Staking' | 'Lending' | 'Yield' | 'Perp';

interface BuiltinProvider {
  key: string;
  name: string;
  description: string;
  chain: 'solana' | 'evm' | 'multi';
  category: ProviderCategory;
  requiresApiKey: boolean;
  docsUrl?: string;
}

const BUILTIN_PROVIDERS: BuiltinProvider[] = [
  { key: 'jupiter_swap', name: 'Jupiter Swap', description: 'Solana DEX aggregator', chain: 'solana', category: 'Swap', requiresApiKey: false, docsUrl: 'https://station.jup.ag/docs' },
  { key: 'zerox_swap', name: '0x Swap', description: 'EVM DEX aggregator (AllowanceHolder)', chain: 'evm', category: 'Swap', requiresApiKey: true, docsUrl: 'https://dashboard.0x.org' },
  { key: 'dcent_swap', name: "D'CENT Swap Aggregator", description: 'Multi-chain DEX swap aggregator with cross-chain support (6 EVM + Solana)', chain: 'multi', category: 'Swap', requiresApiKey: false, docsUrl: 'https://dcentwallet.com' },
  { key: 'lifi', name: 'LI.FI', description: 'Multi-chain DEX/bridge aggregator', chain: 'multi', category: 'Bridge', requiresApiKey: false, docsUrl: 'https://docs.li.fi' },
  { key: 'lido_staking', name: 'Lido Staking', description: 'ETH liquid staking (stETH/wstETH)', chain: 'evm', category: 'Staking', requiresApiKey: false, docsUrl: 'https://docs.lido.fi' },
  { key: 'jito_staking', name: 'Jito Staking', description: 'SOL liquid staking (JitoSOL)', chain: 'solana', category: 'Staking', requiresApiKey: false, docsUrl: 'https://www.jito.network/docs' },
  { key: 'aave_v3', name: 'Aave V3 Lending', description: 'EVM lending protocol (supply, borrow, repay, withdraw)', chain: 'evm', category: 'Lending', requiresApiKey: false, docsUrl: 'https://docs.aave.com/developers' },
  { key: 'kamino', name: 'Kamino Lending', description: 'Solana lending protocol (supply, borrow, repay, withdraw)', chain: 'solana', category: 'Lending', requiresApiKey: false, docsUrl: 'https://docs.kamino.finance' },
  { key: 'pendle_yield', name: 'Pendle Yield', description: 'EVM yield trading: buy/sell PT/YT, redeem at maturity, add/remove LP', chain: 'evm', category: 'Yield', requiresApiKey: false, docsUrl: 'https://docs.pendle.finance' },
  { key: 'drift', name: 'Drift Perp', description: 'Solana perpetual futures trading (open, close, modify positions with leverage)', chain: 'solana', category: 'Perp', requiresApiKey: false, docsUrl: 'https://docs.drift.trade' },
];

const CATEGORY_ORDER: ProviderCategory[] = ['Swap', 'Bridge', 'Staking', 'Lending', 'Yield', 'Perp'];

// ---------------------------------------------------------------------------
// Types for provider API response
// ---------------------------------------------------------------------------

interface ProviderAction {
  name: string;
  description: string;
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
    const saveValue = isSlippageBpsKey(settingKey) ? percentToBps(value) : value;
    try {
      const result = await apiPut<{ updated: number; settings: SettingsData }>(API.ADMIN_SETTINGS, {
        settings: [{ key: fullKey, value: saveValue }],
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
      const result = await apiPut<{ updated: number; settings: SettingsData }>(API.ADMIN_SETTINGS, {
        settings: [{ key: settingKey, value: newTier }],
      });
      settings.value = result.settings;
      showToast('success', `Tier updated for ${providerKey}/${actionName}`);
    } catch (err) {
      const e = err instanceof ApiError ? err : new ApiError(0, 'UNKNOWN', 'Unknown error');
      showToast('error', getErrorMessage(e.code));
    }
  }

  async function handleTierReset(providerKey: string, actionName: string) {
    const settingKey = `actions.${providerKey}_${actionName}_tier`;
    try {
      const result = await apiPut<{ updated: number; settings: SettingsData }>(API.ADMIN_SETTINGS, {
        settings: [{ key: settingKey, value: '' }],
      });
      settings.value = result.settings;
      showToast('success', `Tier reset to default for ${providerKey}/${actionName}`);
    } catch (err) {
      const e = err instanceof ApiError ? err : new ApiError(0, 'UNKNOWN', 'Unknown error');
      showToast('error', getErrorMessage(e.code));
    }
  }

  /** Get display value for an advanced setting, applying bps→% conversion for slippage keys */
  function getAdvancedDisplayValue(shortKey: string): string {
    const cat = settings.value['actions'] as Record<string, string> | undefined;
    const raw = advancedDirty.value[shortKey] ?? cat?.[shortKey] ?? '';
    // dirty values are already in display format (%), raw DB values need conversion
    if (advancedDirty.value[shortKey] !== undefined) return advancedDirty.value[shortKey];
    return isSlippageBpsKey(shortKey) ? bpsToPercent(raw) : raw;
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

  const groupedProviders = CATEGORY_ORDER
    .map((cat) => ({ category: cat, items: BUILTIN_PROVIDERS.filter((bp) => bp.category === cat) }))
    .filter((g) => g.items.length > 0);

  return (
    <div class="page">
      {groupedProviders.map((group) => (
        <div key={group.category}>
          <h2 style={{ fontSize: 'var(--font-size-lg)', fontWeight: 600, margin: 'var(--space-4) 0 var(--space-2)', borderBottom: '1px solid var(--border)', paddingBottom: 'var(--space-2)' }}>
            {group.category}
          </h2>
          {group.items.map((bp) => {
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

              {/* Jupiter Swap Advanced Settings -- slippage only */}
              {bp.key === 'jupiter_swap' && enabled && (
                <div style={{ borderTop: '1px solid var(--border)', paddingTop: 'var(--space-3)', marginBottom: 'var(--space-3)' }}>
                  <div style={{ fontWeight: 600, fontSize: 'var(--font-size-sm)', marginBottom: 'var(--space-2)', color: 'var(--text-secondary)' }}>
                    Advanced Settings
                  </div>
                  {(['jupiter_swap_default_slippage_bps', 'jupiter_swap_max_slippage_bps'] as const).map((shortKey) => {
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

              {/* 0x Swap Advanced Settings -- slippage only */}
              {bp.key === 'zerox_swap' && enabled && (
                <div style={{ borderTop: '1px solid var(--border)', paddingTop: 'var(--space-3)', marginBottom: 'var(--space-3)' }}>
                  <div style={{ fontWeight: 600, fontSize: 'var(--font-size-sm)', marginBottom: 'var(--space-2)', color: 'var(--text-secondary)' }}>
                    Advanced Settings
                  </div>
                  {(['zerox_swap_default_slippage_bps', 'zerox_swap_max_slippage_bps'] as const).map((shortKey) => {
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

              {/* Aave V3 Advanced Settings -- only when Aave V3 is enabled */}
              {bp.key === 'aave_v3' && enabled && (
                <div style={{ borderTop: '1px solid var(--border)', paddingTop: 'var(--space-3)', marginBottom: 'var(--space-3)' }}>
                  <div style={{ fontWeight: 600, fontSize: 'var(--font-size-sm)', marginBottom: 'var(--space-2)', color: 'var(--text-secondary)' }}>
                    Advanced Settings
                  </div>
                  {(['aave_v3_health_factor_warning_threshold', 'aave_v3_position_sync_interval_sec', 'aave_v3_max_ltv_pct'] as const).map((shortKey) => {
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

              {/* Kamino Advanced Settings -- only when Kamino is enabled */}
              {bp.key === 'kamino' && enabled && (
                <div style={{ borderTop: '1px solid var(--border)', paddingTop: 'var(--space-3)', marginBottom: 'var(--space-3)' }}>
                  <div style={{ fontWeight: 600, fontSize: 'var(--font-size-sm)', marginBottom: 'var(--space-2)', color: 'var(--text-secondary)' }}>
                    Advanced Settings
                  </div>
                  {(['kamino_market', 'kamino_hf_threshold'] as const).map((shortKey) => {
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

              {/* Drift Perp Advanced Settings -- only when Drift is enabled */}
              {bp.key === 'drift' && enabled && (
                <div style={{ borderTop: '1px solid var(--border)', paddingTop: 'var(--space-3)', marginBottom: 'var(--space-3)' }}>
                  <div style={{ fontWeight: 600, fontSize: 'var(--font-size-sm)', marginBottom: 'var(--space-2)', color: 'var(--text-secondary)' }}>
                    Advanced Settings
                  </div>
                  {(['drift_max_leverage', 'drift_max_position_usd', 'drift_margin_warning_threshold_pct', 'drift_position_sync_interval_sec'] as const).map((shortKey) => {
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

              {/* Pendle Yield Advanced Settings -- slippage only */}
              {bp.key === 'pendle_yield' && enabled && (
                <div style={{ borderTop: '1px solid var(--border)', paddingTop: 'var(--space-3)', marginBottom: 'var(--space-3)' }}>
                  <div style={{ fontWeight: 600, fontSize: 'var(--font-size-sm)', marginBottom: 'var(--space-2)', color: 'var(--text-secondary)' }}>
                    Advanced Settings
                  </div>
                  {(['pendle_yield_default_slippage_bps', 'pendle_yield_max_slippage_bps'] as const).map((shortKey) => {
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

              {/* D'CENT Swap Advanced Settings -- only when D'CENT Swap is enabled */}
              {bp.key === 'dcent_swap' && enabled && (
                <div style={{ borderTop: '1px solid var(--border)', paddingTop: 'var(--space-3)', marginBottom: 'var(--space-3)' }}>
                  <div style={{ fontWeight: 600, fontSize: 'var(--font-size-sm)', marginBottom: 'var(--space-2)', color: 'var(--text-secondary)' }}>
                    Advanced Settings
                  </div>
                  {(['dcent_swap_api_url', 'dcent_swap_default_slippage_bps', 'dcent_swap_max_slippage_bps'] as const).map((shortKey) => {
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
                        <th>Description</th>
                        <th>Chain</th>
                        <th>Risk Level</th>
                        <th>Tier</th>
                      </tr>
                    </thead>
                    <tbody>
                      {registered.actions.map((action) => (
                        <tr key={action.name}>
                          <td>{action.name}</td>
                          <td style={{ fontSize: 'var(--font-size-sm)', color: 'var(--text-secondary)', maxWidth: '300px' }}>{action.description}</td>
                          <td>
                            {registered.chains.length > 1
                              ? registered.chains.map((c) => <Badge key={c} variant="info">{c}</Badge>)
                              : <Badge variant="info">{action.chain}</Badge>
                            }
                          </td>
                          <td>{action.riskLevel}</td>
                          <td>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                              <select
                                value={getTierOverride(bp.key, action.name) || action.defaultTier}
                                onChange={(e) => handleTierChange(bp.key, action.name, (e.target as HTMLSelectElement).value)}
                                style={{ padding: '2px 4px', fontSize: 'var(--font-size-sm)', borderRadius: 'var(--radius-sm)' }}
                              >
                                {['INSTANT', 'NOTIFY', 'DELAY', 'APPROVAL'].map(t => (
                                  <option key={t} value={t}>{t}</option>
                                ))}
                              </select>
                              {isOverridden(bp.key, action.name) && (
                                <>
                                  <Badge variant="warning">customized</Badge>
                                  <button
                                    onClick={() => handleTierReset(bp.key, action.name)}
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

      {BUILTIN_PROVIDERS.length === 0 && (
        <div class="empty-state">
          <p>No action providers available.</p>
        </div>
      )}
    </div>
  );
}
