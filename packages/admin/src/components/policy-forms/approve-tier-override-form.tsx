import { FormField } from '../form';
import type { PolicyFormProps } from './index';

const TIER_OPTIONS = [
  { label: 'Instant', value: 'INSTANT' },
  { label: 'Notify', value: 'NOTIFY' },
  { label: 'Delay', value: 'DELAY' },
  { label: 'Approval', value: 'APPROVAL' },
];

export function ApproveTierOverrideForm({ rules, onChange, errors }: PolicyFormProps) {
  return (
    <div class="policy-form-fields">
      <FormField
        label="Override Tier"
        name="tier"
        type="select"
        value={(rules.tier as string) ?? 'DELAY'}
        onChange={(v) => onChange({ ...rules, tier: v as string })}
        options={TIER_OPTIONS}
        error={errors.tier}
      />
    </div>
  );
}
