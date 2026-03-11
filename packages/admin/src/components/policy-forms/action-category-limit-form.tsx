import { FormField } from '../form';
import type { PolicyFormProps } from './index';

const CATEGORY_OPTIONS = [
  { label: 'Trade', value: 'trade' },
  { label: 'Withdraw', value: 'withdraw' },
  { label: 'Stake', value: 'stake' },
  { label: 'Lend', value: 'lend' },
  { label: 'Bridge', value: 'bridge' },
  { label: 'Swap', value: 'swap' },
  { label: 'Custom', value: 'custom' },
];

const TIER_OPTIONS = [
  { label: 'Instant', value: 'INSTANT' },
  { label: 'Notify', value: 'NOTIFY' },
  { label: 'Delay', value: 'DELAY' },
  { label: 'Approval', value: 'APPROVAL' },
];

export function ActionCategoryLimitForm({ rules, onChange, errors }: PolicyFormProps) {
  const category = (rules.category as string) || 'trade';
  const perActionLimitUsd = rules.per_action_limit_usd as number | undefined;
  const dailyLimitUsd = rules.daily_limit_usd as number | undefined;
  const monthlyLimitUsd = rules.monthly_limit_usd as number | undefined;
  const tierOnExceed = (rules.tier_on_exceed as string) || 'DELAY';

  return (
    <div class="policy-form-fields">
      <FormField
        label="Category"
        name="category"
        type="select"
        value={category}
        onChange={(v) => onChange({ ...rules, category: v as string })}
        options={CATEGORY_OPTIONS}
        error={errors.category}
        description="Action category this limit applies to"
      />
      <FormField
        label="Per-Action Limit (USD)"
        name="per_action_limit_usd"
        type="number"
        value={perActionLimitUsd ?? ''}
        onChange={(v) => {
          const num = Number(v);
          if (v === '' || v === 0) {
            const { per_action_limit_usd: _, ...rest } = rules;
            onChange(rest);
          } else {
            onChange({ ...rules, per_action_limit_usd: num });
          }
        }}
        placeholder="e.g. 1000"
        error={errors.per_action_limit_usd}
        description="Maximum USD value per single action (leave empty for no limit)"
        min={0}
      />
      <FormField
        label="Daily Limit (USD)"
        name="daily_limit_usd"
        type="number"
        value={dailyLimitUsd ?? ''}
        onChange={(v) => {
          const num = Number(v);
          if (v === '' || v === 0) {
            const { daily_limit_usd: _, ...rest } = rules;
            onChange(rest);
          } else {
            onChange({ ...rules, daily_limit_usd: num });
          }
        }}
        placeholder="e.g. 10000"
        error={errors.daily_limit_usd}
        description="Maximum cumulative USD per day (leave empty for no limit)"
        min={0}
      />
      <FormField
        label="Monthly Limit (USD)"
        name="monthly_limit_usd"
        type="number"
        value={monthlyLimitUsd ?? ''}
        onChange={(v) => {
          const num = Number(v);
          if (v === '' || v === 0) {
            const { monthly_limit_usd: _, ...rest } = rules;
            onChange(rest);
          } else {
            onChange({ ...rules, monthly_limit_usd: num });
          }
        }}
        placeholder="e.g. 100000"
        error={errors.monthly_limit_usd}
        description="Maximum cumulative USD per month (leave empty for no limit)"
        min={0}
      />
      <FormField
        label="Tier on Exceed"
        name="tier_on_exceed"
        type="select"
        value={tierOnExceed}
        onChange={(v) => onChange({ ...rules, tier_on_exceed: v as string })}
        options={TIER_OPTIONS}
        error={errors.tier_on_exceed}
        description="Security tier applied when limit is exceeded"
      />
    </div>
  );
}
