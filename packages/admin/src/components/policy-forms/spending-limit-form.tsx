import { useSignal } from '@preact/signals';
import { useEffect } from 'preact/hooks';
import { FormField } from '../form';
import type { PolicyFormProps } from './index';
import { apiGet } from '../../api/client';
import { API } from '../../api/endpoints';

const NETWORK_NATIVE_SYMBOL: Record<string, string> = {
  'mainnet': 'SOL', 'devnet': 'SOL', 'testnet': 'SOL',
  'ethereum-mainnet': 'ETH', 'ethereum-sepolia': 'ETH',
  'polygon-mainnet': 'POL', 'polygon-amoy': 'POL',
  'arbitrum-mainnet': 'ETH', 'arbitrum-sepolia': 'ETH',
  'optimism-mainnet': 'ETH', 'optimism-sepolia': 'ETH',
  'base-mainnet': 'ETH', 'base-sepolia': 'ETH',
};

function getNativeSymbol(network?: string): string {
  if (!network) return 'Native';
  return NETWORK_NATIVE_SYMBOL[network] || 'Native';
}

interface TokenLimitEntry {
  instant_max: string;
  notify_max: string;
  delay_max: string;
}

interface TokenRegistryEntry {
  address: string;
  symbol: string;
  name: string;
  decimals: number;
  source: string;
  assetId: string | null;
}

interface TokenLimitRow {
  assetId: string;
  symbol: string;
  instant_max: string;
  notify_max: string;
  delay_max: string;
}

const EVM_NETWORKS = [
  'ethereum-mainnet', 'ethereum-sepolia', 'polygon-mainnet', 'polygon-amoy',
  'arbitrum-mainnet', 'arbitrum-sepolia', 'optimism-mainnet', 'optimism-sepolia',
  'base-mainnet', 'base-sepolia',
];

export function SpendingLimitForm({ rules, onChange, errors, network }: PolicyFormProps) {
  const registryTokens = useSignal<TokenRegistryEntry[]>([]);
  const registryLoading = useSignal(false);

  const handleChange = (field: string) => (v: string | number | boolean) => {
    onChange({ ...rules, [field]: v });
  };

  const handleUsdChange = (field: string) => (v: string | number | boolean) => {
    const num = Number(v);
    const next = { ...rules };
    if (v === '' || v === 0 || Number.isNaN(num)) {
      delete next[field];
    } else {
      next[field] = num;
    }
    onChange(next);
  };

  const tokenLimits = (rules.token_limits as Record<string, TokenLimitEntry>) || {};

  const handleNativeTokenChange = (field: 'instant_max' | 'notify_max' | 'delay_max') => (v: string | number | boolean) => {
    const strVal = String(v);
    const current = tokenLimits['native'] || { instant_max: '', notify_max: '', delay_max: '' };
    const updated = { ...current, [field]: strVal };
    // If all empty, remove native entry
    if (!updated.instant_max && !updated.notify_max && !updated.delay_max) {
      const next = { ...tokenLimits };
      delete next['native'];
      onChange({ ...rules, token_limits: Object.keys(next).length > 0 ? next : undefined });
    } else {
      onChange({ ...rules, token_limits: { ...tokenLimits, native: updated } });
    }
  };

  // CAIP-19 token row handlers
  const handleCaipTokenChange = (assetId: string, field: string, value: string) => {
    const current = tokenLimits[assetId] || { instant_max: '0', notify_max: '0', delay_max: '0' };
    const updated = { ...current, [field]: value };
    onChange({ ...rules, token_limits: { ...tokenLimits, [assetId]: updated } });
  };

  const handleRemoveCaipToken = (assetId: string) => {
    const next = { ...tokenLimits };
    delete next[assetId];
    onChange({ ...rules, token_limits: Object.keys(next).length > 0 ? next : undefined });
  };

  const handleAddTokenFromRegistry = (assetId: string) => {
    if (!assetId || tokenLimits[assetId]) return;
    const newEntry = { instant_max: '0', notify_max: '0', delay_max: '0' };
    onChange({ ...rules, token_limits: { ...tokenLimits, [assetId]: newEntry } });
  };

  const handleAddManualToken = () => {
    const key = prompt('Enter CAIP-19 asset ID (e.g., eip155:1/erc20:0xa0b8...)');
    if (!key || tokenLimits[key]) return;
    const newEntry = { instant_max: '0', notify_max: '0', delay_max: '0' };
    onChange({ ...rules, token_limits: { ...tokenLimits, [key]: newEntry } });
  };

  // Fetch token registry when network changes (EVM networks only)
  useEffect(() => {
    if (!network) { registryTokens.value = []; return; }
    if (!EVM_NETWORKS.includes(network)) { registryTokens.value = []; return; }
    registryLoading.value = true;
    apiGet<{ network: string; tokens: TokenRegistryEntry[] }>(`${API.TOKENS}?network=${network}`)
      .then((res) => { registryTokens.value = res.tokens; })
      .catch(() => { registryTokens.value = []; })
      .finally(() => { registryLoading.value = false; });
  }, [network]);

  // Derive CAIP-19 token rows (exclude 'native' key)
  const caipTokenRows: TokenLimitRow[] = Object.entries(tokenLimits)
    .filter(([key]) => key !== 'native')
    .map(([key, val]) => ({
      assetId: key,
      symbol: registryTokens.value.find(t => t.assetId === key)?.symbol || key.split('/').pop()?.split(':').pop() || key,
      instant_max: val.instant_max,
      notify_max: val.notify_max,
      delay_max: val.delay_max,
    }));

  const symbol = getNativeSymbol(network);

  return (
    <div class="policy-form-fields">
      {/* Section 1: USD Amount Tiers */}
      <h4>USD Amount Tiers</h4>
      <div class="policy-form-grid">
        <FormField
          label="Instant Max USD"
          name="instant_max_usd"
          type="number"
          value={(rules.instant_max_usd as number) ?? ''}
          onChange={handleUsdChange('instant_max_usd')}
          placeholder="Optional"
        />
        <FormField
          label="Notify Max USD"
          name="notify_max_usd"
          type="number"
          value={(rules.notify_max_usd as number) ?? ''}
          onChange={handleUsdChange('notify_max_usd')}
          placeholder="Optional"
        />
        <FormField
          label="Delay Max USD"
          name="delay_max_usd"
          type="number"
          value={(rules.delay_max_usd as number) ?? ''}
          onChange={handleUsdChange('delay_max_usd')}
          placeholder="Optional"
        />
      </div>

      {/* Section 2: Token-Specific Limits */}
      <h4>Token-Specific Limits</h4>
      <h5>Native Token ({symbol})</h5>
      <div class="policy-form-grid">
        <FormField
          label={`Instant Max (${symbol})`}
          name="native_instant_max"
          value={tokenLimits['native']?.instant_max ?? ''}
          onChange={handleNativeTokenChange('instant_max')}
          placeholder="e.g. 0.5"
          error={errors['token_limits.native.instant_max']}
        />
        <FormField
          label={`Notify Max (${symbol})`}
          name="native_notify_max"
          value={tokenLimits['native']?.notify_max ?? ''}
          onChange={handleNativeTokenChange('notify_max')}
          placeholder="e.g. 0.5"
          error={errors['token_limits.native.notify_max']}
        />
        <FormField
          label={`Delay Max (${symbol})`}
          name="native_delay_max"
          value={tokenLimits['native']?.delay_max ?? ''}
          onChange={handleNativeTokenChange('delay_max')}
          placeholder="e.g. 0.5"
          error={errors['token_limits.native.delay_max']}
        />
      </div>
      <p class="form-description">Human-readable amounts (e.g., 0.5 SOL, not lamports/wei)</p>

      {/* CAIP-19 Custom Token Limits */}
      <h5 style={{ marginTop: '1rem' }}>Custom Token Limits</h5>
      {caipTokenRows.map((row, i) => (
        <div key={row.assetId} class="token-limit-row" style={{ border: '1px solid var(--border)', borderRadius: '0.5rem', padding: '0.75rem', marginBottom: '0.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
            <strong>{row.symbol}</strong>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', flex: 1, marginLeft: '0.5rem', overflow: 'hidden', textOverflow: 'ellipsis' }}>{row.assetId}</span>
            <button class="btn btn-ghost btn-sm" onClick={() => handleRemoveCaipToken(row.assetId)} title="Remove">x</button>
          </div>
          <div class="policy-form-grid">
            <FormField label="Instant Max" name={`token-${i}-instant`} value={row.instant_max} onChange={(v) => handleCaipTokenChange(row.assetId, 'instant_max', String(v))} placeholder="e.g. 100" error={errors[`token_limits.${row.assetId}.instant_max`]} />
            <FormField label="Notify Max" name={`token-${i}-notify`} value={row.notify_max} onChange={(v) => handleCaipTokenChange(row.assetId, 'notify_max', String(v))} placeholder="e.g. 500" error={errors[`token_limits.${row.assetId}.notify_max`]} />
            <FormField label="Delay Max" name={`token-${i}-delay`} value={row.delay_max} onChange={(v) => handleCaipTokenChange(row.assetId, 'delay_max', String(v))} placeholder="e.g. 1000" error={errors[`token_limits.${row.assetId}.delay_max`]} />
          </div>
        </div>
      ))}

      {/* Add token from registry or manual entry */}
      {network && EVM_NETWORKS.includes(network) && registryTokens.value.length > 0 && (
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-end', marginTop: '0.5rem' }}>
          <FormField
            label="Select Token"
            name="add-token-select"
            type="select"
            value=""
            onChange={(v) => handleAddTokenFromRegistry(v as string)}
            options={[
              { label: registryLoading.value ? 'Loading...' : '-- Select a token --', value: '' },
              ...registryTokens.value
                .filter(t => t.assetId && !tokenLimits[t.assetId])
                .map(t => ({ label: `${t.symbol} (${t.name})`, value: t.assetId! })),
            ]}
          />
        </div>
      )}
      <button class="btn btn-secondary btn-sm" style={{ marginTop: '0.5rem' }} onClick={handleAddManualToken}>
        + Add Token Limit (manual CAIP-19)
      </button>

      {/* Section 3: Cumulative USD Limits */}
      <h4>Cumulative USD Limits (Optional)</h4>
      <div class="policy-form-grid">
        <FormField
          label="Daily Limit USD (24h rolling)"
          name="daily_limit_usd"
          type="number"
          value={(rules.daily_limit_usd as number) ?? ''}
          onChange={handleUsdChange('daily_limit_usd')}
          placeholder="e.g. 500"
          error={errors.daily_limit_usd}
        />
        <FormField
          label="Monthly Limit USD (30d rolling)"
          name="monthly_limit_usd"
          type="number"
          value={(rules.monthly_limit_usd as number) ?? ''}
          onChange={handleUsdChange('monthly_limit_usd')}
          placeholder="e.g. 5000"
          error={errors.monthly_limit_usd}
        />
      </div>

      {/* Section 4: Legacy Raw Tiers (Deprecated) */}
      <h4>Legacy Raw Tiers <span class="badge badge-warning">Deprecated</span></h4>
      <p class="form-description">
        Raw tiers use lamports/wei units and apply uniformly to all tokens. Use USD Tiers or Token-Specific Limits instead. These fields will be removed in a future version.
      </p>
      <div class="policy-form-grid">
        <FormField
          label="Instant Max (lamports/wei)"
          name="instant_max"
          value={(rules.instant_max as string) || ''}
          onChange={handleChange('instant_max')}
          error={errors.instant_max}
        />
        <FormField
          label="Notify Max (lamports/wei)"
          name="notify_max"
          value={(rules.notify_max as string) || ''}
          onChange={handleChange('notify_max')}
          error={errors.notify_max}
        />
        <FormField
          label="Delay Max (lamports/wei)"
          name="delay_max"
          value={(rules.delay_max as string) || ''}
          onChange={handleChange('delay_max')}
          error={errors.delay_max}
        />
      </div>

      {/* Section 5: Delay Duration */}
      <FormField
        label="Delay Duration (seconds, min 60)"
        name="delay_seconds"
        type="number"
        value={(rules.delay_seconds as number) ?? 900}
        onChange={handleChange('delay_seconds')}
        error={errors.delay_seconds}
        required
        min={60}
      />
    </div>
  );
}
