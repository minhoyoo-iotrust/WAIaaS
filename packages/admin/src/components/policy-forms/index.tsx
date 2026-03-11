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
import { Erc8128AllowedDomainsForm } from './erc8128-allowed-domains-form';
import { ReputationThresholdForm } from './reputation-threshold-form';
import { VenueWhitelistForm } from './venue-whitelist-form';
import { ActionCategoryLimitForm } from './action-category-limit-form';

export interface PolicyFormProps {
  rules: Record<string, unknown>;
  onChange: (rules: Record<string, unknown>) => void;
  errors: Record<string, string>;
  network?: string;
}

/**
 * PolicyFormRouter - routes to type-specific policy form components.
 *
 * Supports all 16 core types with dedicated forms:
 * SPENDING_LIMIT, WHITELIST, RATE_LIMIT, APPROVE_AMOUNT_LIMIT, APPROVE_TIER_OVERRIDE,
 * ALLOWED_TOKENS, CONTRACT_WHITELIST, METHOD_WHITELIST, APPROVED_SPENDERS,
 * TIME_RESTRICTION, ALLOWED_NETWORKS, X402_ALLOWED_DOMAINS, ERC8128_ALLOWED_DOMAINS,
 * REPUTATION_THRESHOLD, VENUE_WHITELIST, ACTION_CATEGORY_LIMIT.
 */
export function PolicyFormRouter({
  type,
  rules,
  onChange,
  errors,
  network,
}: { type: string } & PolicyFormProps): ComponentChildren {
  switch (type) {
    case 'SPENDING_LIMIT':
      return <SpendingLimitForm rules={rules} onChange={onChange} errors={errors} network={network} />;
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
    case 'ERC8128_ALLOWED_DOMAINS':
      return <Erc8128AllowedDomainsForm rules={rules} onChange={onChange} errors={errors} />;
    case 'REPUTATION_THRESHOLD':
      return <ReputationThresholdForm rules={rules} onChange={onChange} errors={errors} />;
    case 'VENUE_WHITELIST':
      return <VenueWhitelistForm rules={rules} onChange={onChange} errors={errors} />;
    case 'ACTION_CATEGORY_LIMIT':
      return <ActionCategoryLimitForm rules={rules} onChange={onChange} errors={errors} />;
    default:
      return (
        <p class="policy-form-placeholder">
          This policy type uses JSON editor. Toggle to JSON mode.
        </p>
      );
  }
}
