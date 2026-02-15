import type { ComponentChildren } from 'preact';
import { SpendingLimitForm } from './spending-limit-form';
import { WhitelistForm } from './whitelist-form';
import { RateLimitForm } from './rate-limit-form';
import { ApproveAmountLimitForm } from './approve-amount-limit-form';
import { ApproveTierOverrideForm } from './approve-tier-override-form';

export interface PolicyFormProps {
  rules: Record<string, unknown>;
  onChange: (rules: Record<string, unknown>) => void;
  errors: Record<string, string>;
}

/**
 * PolicyFormRouter - routes to type-specific policy form components.
 *
 * Supports 5 core types with dedicated forms:
 * SPENDING_LIMIT, WHITELIST, RATE_LIMIT, APPROVE_AMOUNT_LIMIT, APPROVE_TIER_OVERRIDE.
 * Other types fall back to a placeholder directing the user to JSON mode.
 */
export function PolicyFormRouter({
  type,
  rules,
  onChange,
  errors,
}: { type: string } & PolicyFormProps): ComponentChildren {
  switch (type) {
    case 'SPENDING_LIMIT':
      return <SpendingLimitForm rules={rules} onChange={onChange} errors={errors} />;
    case 'WHITELIST':
      return <WhitelistForm rules={rules} onChange={onChange} errors={errors} />;
    case 'RATE_LIMIT':
      return <RateLimitForm rules={rules} onChange={onChange} errors={errors} />;
    case 'APPROVE_AMOUNT_LIMIT':
      return <ApproveAmountLimitForm rules={rules} onChange={onChange} errors={errors} />;
    case 'APPROVE_TIER_OVERRIDE':
      return <ApproveTierOverrideForm rules={rules} onChange={onChange} errors={errors} />;
    default:
      return (
        <p class="policy-form-placeholder">
          This policy type uses JSON editor. Toggle to JSON mode.
        </p>
      );
  }
}
