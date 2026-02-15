import { FormField } from '../form';
import type { PolicyFormProps } from './index';

export function SpendingLimitForm({ rules, onChange, errors }: PolicyFormProps) {
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

  return (
    <div class="policy-form-fields">
      <h4>Native Amount Tiers</h4>
      <div class="policy-form-grid">
        <FormField
          label="Instant Max (lamports/wei)"
          name="instant_max"
          value={(rules.instant_max as string) || ''}
          onChange={handleChange('instant_max')}
          error={errors.instant_max}
          required
        />
        <FormField
          label="Notify Max (lamports/wei)"
          name="notify_max"
          value={(rules.notify_max as string) || ''}
          onChange={handleChange('notify_max')}
          error={errors.notify_max}
          required
        />
        <FormField
          label="Delay Max (lamports/wei)"
          name="delay_max"
          value={(rules.delay_max as string) || ''}
          onChange={handleChange('delay_max')}
          error={errors.delay_max}
          required
        />
      </div>
      <h4>USD Amount Tiers (Optional)</h4>
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
