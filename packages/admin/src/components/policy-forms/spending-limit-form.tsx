import { FormField } from '../form';
import type { PolicyFormProps } from './index';

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

export function SpendingLimitForm({ rules, onChange, errors, network }: PolicyFormProps) {
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
      {/* CAIP-19 token rows injected by Plan 237-02 */}

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
        Raw tiers use lamports/wei units and apply uniformly to all tokens. Use USD Tiers or Token-Specific Limits instead.
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
