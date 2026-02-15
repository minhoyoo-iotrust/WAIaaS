import type { ComponentChildren } from 'preact';
import { SpendingLimitForm } from './spending-limit-form';
import { WhitelistForm } from './whitelist-form';
import { RateLimitForm } from './rate-limit-form';
import { ApproveAmountLimitForm } from './approve-amount-limit-form';
import { ApproveTierOverrideForm } from './approve-tier-override-form';
import { AllowedTokensForm } from './allowed-tokens-form';
import { ContractWhitelistForm } from './contract-whitelist-form';
import { MethodWhitelistForm } from './method-whitelist-form';
import { ApprovedSpendersForm } from './approved-spenders-form';
import { TimeRestrictionForm } from './time-restriction-form';
import { AllowedNetworksForm } from './allowed-networks-form';
import { X402AllowedDomainsForm } from './x402-allowed-domains-form';

export interface PolicyFormProps {
  rules: Record<string, unknown>;
  onChange: (rules: Record<string, unknown>) => void;
  errors: Record<string, string>;
}

/**
 * PolicyFormRouter - routes to type-specific policy form components.
 *
 * Supports all 12 core types with dedicated forms:
 * SPENDING_LIMIT, WHITELIST, RATE_LIMIT, APPROVE_AMOUNT_LIMIT, APPROVE_TIER_OVERRIDE,
 * ALLOWED_TOKENS, CONTRACT_WHITELIST, METHOD_WHITELIST, APPROVED_SPENDERS,
 * TIME_RESTRICTION, ALLOWED_NETWORKS, X402_ALLOWED_DOMAINS.
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
    case 'ALLOWED_TOKENS':
      return <AllowedTokensForm rules={rules} onChange={onChange} errors={errors} />;
    case 'CONTRACT_WHITELIST':
      return <ContractWhitelistForm rules={rules} onChange={onChange} errors={errors} />;
    case 'METHOD_WHITELIST':
      return <MethodWhitelistForm rules={rules} onChange={onChange} errors={errors} />;
    case 'APPROVED_SPENDERS':
      return <ApprovedSpendersForm rules={rules} onChange={onChange} errors={errors} />;
    case 'TIME_RESTRICTION':
      return <TimeRestrictionForm rules={rules} onChange={onChange} errors={errors} />;
    case 'ALLOWED_NETWORKS':
      return <AllowedNetworksForm rules={rules} onChange={onChange} errors={errors} />;
    case 'X402_ALLOWED_DOMAINS':
      return <X402AllowedDomainsForm rules={rules} onChange={onChange} errors={errors} />;
    default:
      return (
        <p class="policy-form-placeholder">
          This policy type uses JSON editor. Toggle to JSON mode.
        </p>
      );
  }
}
