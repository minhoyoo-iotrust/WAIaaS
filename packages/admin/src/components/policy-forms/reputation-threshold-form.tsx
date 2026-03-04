/**
 * REPUTATION_THRESHOLD policy form.
 *
 * Fields: min_score (0-100), below_threshold_tier, unrated_tier,
 * tag1, tag2, check_counterparty.
 */

import { FormField } from '../form';
import type { PolicyFormProps } from './index';

const TIER_OPTIONS = [
  { label: 'Instant', value: 'INSTANT' },
  { label: 'Notify', value: 'NOTIFY' },
  { label: 'Delay', value: 'DELAY' },
  { label: 'Approval', value: 'APPROVAL' },
];

export function ReputationThresholdForm({ rules, onChange, errors }: PolicyFormProps) {
  return (
    <div class="policy-form-fields">
      <FormField
        label="Minimum Score"
        name="min_score"
        type="number"
        value={(rules.min_score as number) ?? 50}
        onChange={(v) => onChange({ ...rules, min_score: Number(v) })}
        error={errors.min_score}
        min={0}
        max={100}
        description="Minimum reputation score threshold (0-100)"
      />

      <FormField
        label="Below Threshold Tier"
        name="below_threshold_tier"
        type="select"
        value={(rules.below_threshold_tier as string) ?? 'APPROVAL'}
        onChange={(v) => onChange({ ...rules, below_threshold_tier: v as string })}
        options={TIER_OPTIONS}
        error={errors.below_threshold_tier}
        description="Security tier when counterparty score is below minimum"
      />

      <FormField
        label="Unrated Agent Tier"
        name="unrated_tier"
        type="select"
        value={(rules.unrated_tier as string) ?? 'APPROVAL'}
        onChange={(v) => onChange({ ...rules, unrated_tier: v as string })}
        options={TIER_OPTIONS}
        error={errors.unrated_tier}
        description="Security tier when counterparty has no reputation data"
      />

      <FormField
        label="Tag1 Filter"
        name="tag1"
        type="text"
        value={(rules.tag1 as string) ?? ''}
        onChange={(v) => onChange({ ...rules, tag1: v as string })}
        error={errors.tag1}
        placeholder="Optional (max 32 chars)"
      />

      <FormField
        label="Tag2 Filter"
        name="tag2"
        type="text"
        value={(rules.tag2 as string) ?? ''}
        onChange={(v) => onChange({ ...rules, tag2: v as string })}
        error={errors.tag2}
        placeholder="Optional (max 32 chars)"
      />

      <FormField
        label="Check Counterparty"
        name="check_counterparty"
        type="checkbox"
        value={!!rules.check_counterparty}
        onChange={(v) => onChange({ ...rules, check_counterparty: v as boolean })}
        error={errors.check_counterparty}
        description="Also evaluate the reputation of the transaction recipient"
      />
    </div>
  );
}
