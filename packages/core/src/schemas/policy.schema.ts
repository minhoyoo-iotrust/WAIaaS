import { z } from 'zod';
import { PolicyTypeEnum, PolicyTierEnum } from '../enums/policy.js';
import { ChainTypeEnum, NetworkTypeEnum } from '../enums/chain.js';
import { Caip19Schema } from '../caip/index.js';

export const PolicySchema = z.object({
  id: z.string().uuid(),
  walletId: z.string().uuid(),
  type: PolicyTypeEnum,
  ruleConfig: z.record(z.unknown()),
  enabled: z.boolean(),
  network: NetworkTypeEnum.nullable(),
  createdAt: z.number().int(),
  updatedAt: z.number().int(),
});
export type Policy = z.infer<typeof PolicySchema>;

// ---------------------------------------------------------------------------
// v1.4 Policy type-specific rules schemas (internal, not exported).
// Used by superRefine to validate rules per PolicyType.
// ---------------------------------------------------------------------------

/** ALLOWED_TOKENS: rules.tokens array (mint/contract addresses + optional CAIP-19). */
const AllowedTokensRulesSchema = z.object({
  tokens: z.array(z.object({
    address: z.string().min(1),
    symbol: z.string().min(1).max(10).optional(),
    chain: ChainTypeEnum.optional(),
    assetId: Caip19Schema.optional(),
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

/** Per-token spending limit in human-readable units (e.g., "1.5" SOL, "1000" USDC). */
export const TokenLimitSchema = z.object({
  instant_max: z.string().regex(/^\d+(\.\d+)?$/, 'Must be a non-negative decimal string'),
  notify_max: z.string().regex(/^\d+(\.\d+)?$/, 'Must be a non-negative decimal string'),
  delay_max: z.string().regex(/^\d+(\.\d+)?$/, 'Must be a non-negative decimal string'),
});
export type TokenLimit = z.infer<typeof TokenLimitSchema>;

// ---------------------------------------------------------------------------
// token_limits key validation (Phase 235)
// ---------------------------------------------------------------------------

const VALID_CHAIN_TYPES = new Set(['solana', 'ethereum']);
// Duplicated from caip19.ts to avoid circular dependency risk
const CAIP19_REGEX = /^[-a-z0-9]{3,8}:[-_a-zA-Z0-9]{1,32}\/[-a-z0-9]{3,8}:[-.%a-zA-Z0-9]{1,128}$/;

function isValidTokenLimitKey(key: string): boolean {
  if (key === 'native') return true;
  if (key.startsWith('native:')) {
    return VALID_CHAIN_TYPES.has(key.slice(7));
  }
  return CAIP19_REGEX.test(key);
}

/** SPENDING_LIMIT: 금액 기반 4-티어 보안 분류. */
const SpendingLimitRulesBaseSchema = z.object({
  /** INSTANT 티어 최대 금액 (lamports/wei 문자열, deprecated -- optional since Phase 235) */
  instant_max: z.string().regex(/^\d+$/, '양의 정수 문자열이어야 합니다').optional(),
  /** NOTIFY 티어 최대 금액 */
  notify_max: z.string().regex(/^\d+$/, '양의 정수 문자열이어야 합니다').optional(),
  /** DELAY 티어 최대 금액 */
  delay_max: z.string().regex(/^\d+$/, '양의 정수 문자열이어야 합니다').optional(),
  /** INSTANT 티어 최대 USD 금액 (optional, 미설정 시 네이티브만 사용) */
  instant_max_usd: z.number().nonnegative().optional(),
  /** NOTIFY 티어 최대 USD 금액 */
  notify_max_usd: z.number().nonnegative().optional(),
  /** DELAY 티어 최대 USD 금액 */
  delay_max_usd: z.number().nonnegative().optional(),
  /** DELAY 티어 쿨다운 시간 (초) */
  delay_seconds: z.number().int().min(60).default(900),
  /** 24시간 롤링 윈도우 내 누적 USD 지출 상한 (optional, 미설정 시 누적 한도 없음) */
  daily_limit_usd: z.number().positive().optional(),
  /** 30일 롤링 윈도우 내 누적 USD 지출 상한 */
  monthly_limit_usd: z.number().positive().optional(),
  /** 토큰별 한도 (Phase 235): CAIP-19/native 키 → human-readable 한도 */
  token_limits: z.record(z.string(), TokenLimitSchema).optional(),
});

export const SpendingLimitRulesSchema = SpendingLimitRulesBaseSchema.superRefine((data, ctx) => {
  // SCHM-04: At least one limit source must be present
  const hasRaw = data.instant_max !== undefined || data.notify_max !== undefined || data.delay_max !== undefined;
  const hasUsd = data.instant_max_usd !== undefined || data.notify_max_usd !== undefined || data.delay_max_usd !== undefined;
  const hasTokenLimits = data.token_limits !== undefined && Object.keys(data.token_limits).length > 0;

  if (!hasRaw && !hasUsd && !hasTokenLimits) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'At least one of USD limits, token_limits, or raw limits must be specified',
      path: [],
    });
  }

  // Validate token_limits if present
  if (data.token_limits) {
    for (const [key, limit] of Object.entries(data.token_limits)) {
      // SCHM-06: Key format validation
      if (!isValidTokenLimitKey(key)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Invalid token_limits key "${key}". Must be "native", "native:{chain}", or a valid CAIP-19 asset ID`,
          path: ['token_limits', key],
        });
      }

      // SCHM-05: Ordering validation (instant_max <= notify_max <= delay_max)
      const instantMax = parseFloat(limit.instant_max);
      const notifyMax = parseFloat(limit.notify_max);
      const delayMax = parseFloat(limit.delay_max);

      if (instantMax > notifyMax) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `token_limits["${key}"]: instant_max (${limit.instant_max}) must be <= notify_max (${limit.notify_max})`,
          path: ['token_limits', key, 'instant_max'],
        });
      }
      if (notifyMax > delayMax) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `token_limits["${key}"]: notify_max (${limit.notify_max}) must be <= delay_max (${limit.delay_max})`,
          path: ['token_limits', key, 'notify_max'],
        });
      }
    }
  }
});
export type SpendingLimitRules = z.infer<typeof SpendingLimitRulesSchema>;

/** ALLOWED_NETWORKS: rules.networks array (permitted networks for wallet). */
const AllowedNetworksRulesSchema = z.object({
  networks: z.array(z.object({
    network: NetworkTypeEnum,
    name: z.string().optional(),
  })).min(1, 'At least one network required'),
});

/** WHITELIST: rules.allowed_addresses array (permitted destination addresses). */
export const WhitelistRulesSchema = z.object({
  allowed_addresses: z.array(z.string().min(1)).min(1, 'At least one address required'),
});
export type WhitelistRules = z.infer<typeof WhitelistRulesSchema>;

/** RATE_LIMIT: rules.max_requests + window_seconds. */
export const RateLimitRulesSchema = z.object({
  max_requests: z.number().int().min(1),
  window_seconds: z.number().int().min(1),
});
export type RateLimitRules = z.infer<typeof RateLimitRulesSchema>;

/** TIME_RESTRICTION: rules.allowed_hours + allowed_days. */
export const TimeRestrictionRulesSchema = z.object({
  allowed_hours: z.object({
    start: z.number().int().min(0).max(23),
    end: z.number().int().min(1).max(24),
  }),
  allowed_days: z.array(z.number().int().min(0).max(6)).min(1, 'At least one day required'),
});
export type TimeRestrictionRules = z.infer<typeof TimeRestrictionRulesSchema>;

/** X402_ALLOWED_DOMAINS: rules.domains array (permitted x402 payment domains). */
export const X402AllowedDomainsRulesSchema = z.object({
  domains: z.array(z.string().min(1)).min(1, 'At least one domain required'),
});
export type X402AllowedDomainsRules = z.infer<typeof X402AllowedDomainsRulesSchema>;

// Map of policy types to their rules schemas for superRefine lookup.
// All 12 PolicyTypes are now covered.
const POLICY_RULES_SCHEMAS: Record<string, z.ZodTypeAny> = {
  ALLOWED_TOKENS: AllowedTokensRulesSchema,
  CONTRACT_WHITELIST: ContractWhitelistRulesSchema,
  METHOD_WHITELIST: MethodWhitelistRulesSchema,
  APPROVED_SPENDERS: ApprovedSpendersRulesSchema,
  APPROVE_AMOUNT_LIMIT: ApproveAmountLimitRulesSchema,
  APPROVE_TIER_OVERRIDE: ApproveTierOverrideRulesSchema,
  ALLOWED_NETWORKS: AllowedNetworksRulesSchema,
  SPENDING_LIMIT: SpendingLimitRulesSchema,
  WHITELIST: WhitelistRulesSchema,
  RATE_LIMIT: RateLimitRulesSchema,
  TIME_RESTRICTION: TimeRestrictionRulesSchema,
  X402_ALLOWED_DOMAINS: X402AllowedDomainsRulesSchema,
};

/**
 * CreatePolicyRequestSchema - body for POST /v1/policies.
 *
 * walletId is optional (null = global policy).
 * rules is validated per-type via superRefine for all 12 PolicyTypes.
 */
export const CreatePolicyRequestSchema = z.object({
  walletId: z.string().uuid().optional(),
  type: PolicyTypeEnum,
  rules: z.record(z.unknown()),
  priority: z.number().int().default(0),
  enabled: z.boolean().default(true),
  network: NetworkTypeEnum.optional(),
}).superRefine((data, ctx) => {
  const schema = POLICY_RULES_SCHEMAS[data.type];
  if (!schema) return; // safety fallback (all 12 types are now registered)
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
