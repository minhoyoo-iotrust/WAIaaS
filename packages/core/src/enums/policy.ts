import { z } from 'zod';

export const POLICY_TYPES = [
  'SPENDING_LIMIT',
  'WHITELIST',
  'TIME_RESTRICTION',
  'RATE_LIMIT',
  'ALLOWED_TOKENS',
  'CONTRACT_WHITELIST',
  'METHOD_WHITELIST',
  'APPROVED_SPENDERS',
  'APPROVE_AMOUNT_LIMIT',
  'APPROVE_TIER_OVERRIDE',
  'ALLOWED_NETWORKS',
  'X402_ALLOWED_DOMAINS',
  'LENDING_LTV_LIMIT',
  'LENDING_ASSET_WHITELIST',
  'PERP_MAX_LEVERAGE',
  'PERP_MAX_POSITION_USD',
  'PERP_ALLOWED_MARKETS',
] as const;
export type PolicyType = (typeof POLICY_TYPES)[number];
export const PolicyTypeEnum = z.enum(POLICY_TYPES);

export const POLICY_TIERS = ['INSTANT', 'NOTIFY', 'DELAY', 'APPROVAL'] as const;
export type PolicyTier = (typeof POLICY_TIERS)[number];
export const PolicyTierEnum = z.enum(POLICY_TIERS);
