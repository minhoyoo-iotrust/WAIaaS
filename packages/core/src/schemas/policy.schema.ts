import { z } from 'zod';
import { PolicyTypeEnum, PolicyTierEnum } from '../enums/policy.js';
import { ChainTypeEnum } from '../enums/chain.js';

export const PolicySchema = z.object({
  id: z.string().uuid(),
  walletId: z.string().uuid(),
  type: PolicyTypeEnum,
  ruleConfig: z.record(z.unknown()),
  enabled: z.boolean(),
  createdAt: z.number().int(),
  updatedAt: z.number().int(),
});
export type Policy = z.infer<typeof PolicySchema>;

// ---------------------------------------------------------------------------
// v1.4 Policy type-specific rules schemas (internal, not exported).
// Used by superRefine to validate rules per PolicyType.
// ---------------------------------------------------------------------------

/** ALLOWED_TOKENS: rules.tokens array (mint/contract addresses). */
const AllowedTokensRulesSchema = z.object({
  tokens: z.array(z.object({
    address: z.string().min(1),
    symbol: z.string().min(1).max(10).optional(),
    chain: ChainTypeEnum.optional(),
  })).min(1, 'At least one token required'),
});

/** CONTRACT_WHITELIST: rules.contracts array. */
const ContractWhitelistRulesSchema = z.object({
  contracts: z.array(z.object({
    address: z.string().min(1),
    name: z.string().optional(),
    chain: ChainTypeEnum.optional(),
  })).min(1, 'At least one contract required'),
});

/** METHOD_WHITELIST: rules.methods array (contract-specific allowed methods). */
const MethodWhitelistRulesSchema = z.object({
  methods: z.array(z.object({
    contractAddress: z.string().min(1),
    selectors: z.array(z.string().min(1)).min(1),
  })).min(1, 'At least one method entry required'),
});

/** APPROVED_SPENDERS: rules.spenders array. */
const ApprovedSpendersRulesSchema = z.object({
  spenders: z.array(z.object({
    address: z.string().min(1),
    name: z.string().optional(),
    maxAmount: z.string().regex(/^\d+$/).optional(),
  })).min(1, 'At least one spender required'),
});

/** APPROVE_AMOUNT_LIMIT: rules.maxAmount + rules.blockUnlimited. */
const ApproveAmountLimitRulesSchema = z.object({
  maxAmount: z.string().regex(/^\d+$/).optional(),
  blockUnlimited: z.boolean().default(true),
});

/** APPROVE_TIER_OVERRIDE: rules.tier (forced policy tier). */
const ApproveTierOverrideRulesSchema = z.object({
  tier: PolicyTierEnum,
});

// Map of policy types to their rules schemas for superRefine lookup.
const POLICY_RULES_SCHEMAS: Partial<Record<string, z.ZodTypeAny>> = {
  ALLOWED_TOKENS: AllowedTokensRulesSchema,
  CONTRACT_WHITELIST: ContractWhitelistRulesSchema,
  METHOD_WHITELIST: MethodWhitelistRulesSchema,
  APPROVED_SPENDERS: ApprovedSpendersRulesSchema,
  APPROVE_AMOUNT_LIMIT: ApproveAmountLimitRulesSchema,
  APPROVE_TIER_OVERRIDE: ApproveTierOverrideRulesSchema,
};

/**
 * CreatePolicyRequestSchema - body for POST /v1/policies.
 *
 * walletId is optional (null = global policy).
 * rules is validated per-type via superRefine for the 6 v1.4 PolicyTypes.
 * Existing 4 types (SPENDING_LIMIT, WHITELIST, TIME_RESTRICTION, RATE_LIMIT)
 * retain free-form rules for backward compatibility.
 */
export const CreatePolicyRequestSchema = z.object({
  walletId: z.string().uuid().optional(),
  type: PolicyTypeEnum,
  rules: z.record(z.unknown()),
  priority: z.number().int().default(0),
  enabled: z.boolean().default(true),
}).superRefine((data, ctx) => {
  const schema = POLICY_RULES_SCHEMAS[data.type];
  if (!schema) return; // existing 4 types: no additional validation
  const result = schema.safeParse(data.rules);
  if (!result.success) {
    for (const issue of result.error.issues) {
      ctx.addIssue({ ...issue, path: ['rules', ...issue.path] });
    }
  }
});
export type CreatePolicyRequest = z.infer<typeof CreatePolicyRequestSchema>;

/**
 * UpdatePolicyRequestSchema - body for PUT /v1/policies/:id.
 *
 * All fields optional (partial update).
 */
export const UpdatePolicyRequestSchema = z.object({
  rules: z.record(z.unknown()).optional(),
  priority: z.number().int().optional(),
  enabled: z.boolean().optional(),
});
export type UpdatePolicyRequest = z.infer<typeof UpdatePolicyRequestSchema>;
