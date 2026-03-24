/**
 * evaluators/spending-limit.ts - SPENDING_LIMIT 4-tier evaluation,
 * ACTION_CATEGORY_LIMIT evaluation.
 *
 * Extracted from DatabasePolicyEngine private methods.
 */

import {
  NATIVE_DECIMALS,
  SpendingLimitRulesSchema,
  ActionCategoryLimitRulesSchema,
} from '@waiaas/core';
import type { SpendingLimitRules, PolicyTier, PolicyEvaluation } from '@waiaas/core';
import type { Database as SQLiteDatabase } from 'better-sqlite3';
import type { PolicyRow, TransactionParam, ParseRulesContext } from './types.js';
import { maxTier } from './helpers.js';

/**
 * Parse a human-readable decimal string (e.g. "1.5", "1000") to raw bigint units.
 * Multiplies the value by 10^decimals for precise BigInt comparison.
 */
function parseDecimalToBigInt(value: string, decimals: number): bigint {
  const parts = value.split('.');
  const integerPart = parts[0] ?? '0';
  let fractionalPart = parts[1] ?? '';

  // Pad or truncate fractional part to exactly `decimals` digits
  if (fractionalPart.length > decimals) {
    fractionalPart = fractionalPart.slice(0, decimals);
  } else {
    fractionalPart = fractionalPart.padEnd(decimals, '0');
  }

  return BigInt(integerPart + fractionalPart);
}

/**
 * Evaluate SPENDING_LIMIT policy.
 * Returns PolicyEvaluation with tier classification, or null if no spending limit.
 */
export function evaluateSpendingLimit(
  ctx: ParseRulesContext,
  resolved: PolicyRow[],
  amount: string,
  usdAmount?: number,
  tokenContext?: {
    type: string;
    tokenAddress?: string;
    tokenDecimals?: number;
    chain?: string;
    assetId?: string;
    policyNetwork?: string;
  },
): PolicyEvaluation | null {
  const spending = resolved.find((p) => p.type === 'SPENDING_LIMIT');
  if (!spending) return null;

  const rules = ctx.parseRules(spending.rules, SpendingLimitRulesSchema, 'SPENDING_LIMIT');

  // 1. Token-specific tier (Phase 236)
  let tokenTier: PolicyTier = 'INSTANT';
  if (tokenContext && rules.token_limits) {
    const tokenResult = evaluateTokenTier(BigInt(amount), rules, tokenContext);
    if (tokenResult !== null) {
      tokenTier = tokenResult;
    } else {
      // No token_limits match -> fall back to raw fields
      tokenTier = evaluateNativeTier(BigInt(amount), rules);
    }
  } else {
    // No tokenContext or no token_limits -> use raw fields (existing behavior)
    tokenTier = evaluateNativeTier(BigInt(amount), rules);
  }

  // 2. USD tier (Phase 127)
  let finalTier = tokenTier;
  if (usdAmount !== undefined && usdAmount > 0 && hasUsdThresholds(rules)) {
    const usdTier = evaluateUsdTier(usdAmount, rules);
    finalTier = maxTier(tokenTier, usdTier);
  }

  // delaySeconds only included when final tier is DELAY
  const delaySeconds = finalTier === 'DELAY' ? rules.delay_seconds : undefined;

  return {
    allowed: true,
    tier: finalTier,
    ...(delaySeconds !== undefined ? { delaySeconds } : {}),
    ...(finalTier === 'APPROVAL' ? { approvalReason: 'per_tx' as const } : {}),
    ...(finalTier === 'APPROVAL' && rules.approval_timeout !== undefined ? { approvalTimeoutSeconds: rules.approval_timeout } : {}),
  };
}

/**
 * Evaluate token-specific tier using token_limits with CAIP-19 key matching.
 * Returns PolicyTier if a matching token limit is found, null otherwise (-> raw fallback).
 */
export function evaluateTokenTier(
  amountBig: bigint,
  rules: SpendingLimitRules,
  tokenContext: {
    type: string;
    tokenAddress?: string;
    tokenDecimals?: number;
    chain?: string;
    assetId?: string;
    policyNetwork?: string;
  },
): PolicyTier | null {
  if (!rules.token_limits) return null;

  // Skip for CONTRACT_CALL and BATCH (they don't use token_limits)
  if (tokenContext.type === 'CONTRACT_CALL' || tokenContext.type === 'BATCH') {
    return null;
  }

  let matchedLimit: { instant_max: string; notify_max: string; delay_max: string } | undefined;
  let decimals: number | undefined;

  if (tokenContext.type === 'TOKEN_TRANSFER' || tokenContext.type === 'APPROVE') {
    // Try exact CAIP-19 asset ID match
    if (tokenContext.assetId && rules.token_limits[tokenContext.assetId]) {
      matchedLimit = rules.token_limits[tokenContext.assetId];
      decimals = tokenContext.tokenDecimals;
    }
  } else if (tokenContext.type === 'TRANSFER') {
    // Try "native:{chain}" match
    const nativeChainKey = tokenContext.chain ? `native:${tokenContext.chain}` : undefined;
    if (nativeChainKey && rules.token_limits[nativeChainKey]) {
      matchedLimit = rules.token_limits[nativeChainKey];
      decimals = tokenContext.chain ? NATIVE_DECIMALS[tokenContext.chain] : undefined;
    }
    // Fallback: try "native" shorthand (only when policy has a network set)
    if (!matchedLimit && tokenContext.policyNetwork && rules.token_limits['native']) {
      matchedLimit = rules.token_limits['native'];
      decimals = tokenContext.chain ? NATIVE_DECIMALS[tokenContext.chain] : undefined;
    }
  }

  if (!matchedLimit || decimals === undefined) {
    return null; // No match -> caller falls back to raw fields
  }

  // Use fixed-point comparison: multiply limit by divisor (avoids precision loss)
  const instantMaxRaw = parseDecimalToBigInt(matchedLimit.instant_max, decimals);
  const notifyMaxRaw = parseDecimalToBigInt(matchedLimit.notify_max, decimals);
  const delayMaxRaw = parseDecimalToBigInt(matchedLimit.delay_max, decimals);

  if (amountBig <= instantMaxRaw) return 'INSTANT';
  if (amountBig <= notifyMaxRaw) return 'NOTIFY';
  if (amountBig <= delayMaxRaw) return 'DELAY';
  return 'APPROVAL';
}

/**
 * Evaluate native amount tier.
 */
export function evaluateNativeTier(amountBig: bigint, rules: SpendingLimitRules): PolicyTier {
  // Phase 236: raw fields are now optional -- skip native tier if all undefined
  if (rules.instant_max === undefined && rules.notify_max === undefined && rules.delay_max === undefined) {
    return 'INSTANT'; // No raw thresholds -> permissive (USD/token_limits will handle)
  }

  const instantMax = rules.instant_max !== undefined ? BigInt(rules.instant_max) : 0n;
  const notifyMax = rules.notify_max !== undefined ? BigInt(rules.notify_max) : 0n;
  const delayMax = rules.delay_max !== undefined ? BigInt(rules.delay_max) : 0n;

  if (amountBig <= instantMax) return 'INSTANT';
  if (amountBig <= notifyMax) return 'NOTIFY';
  if (amountBig <= delayMax) return 'DELAY';
  return 'APPROVAL';
}

/**
 * Check if rules have any USD thresholds configured.
 */
function hasUsdThresholds(rules: SpendingLimitRules): boolean {
  return rules.instant_max_usd !== undefined
    || rules.notify_max_usd !== undefined
    || rules.delay_max_usd !== undefined;
}

/**
 * Evaluate USD amount tier.
 */
export function evaluateUsdTier(usdAmount: number, rules: SpendingLimitRules): PolicyTier {
  if (rules.instant_max_usd !== undefined && usdAmount <= rules.instant_max_usd) {
    return 'INSTANT';
  }
  if (rules.notify_max_usd !== undefined && usdAmount <= rules.notify_max_usd) {
    return 'NOTIFY';
  }
  if (rules.delay_max_usd !== undefined && usdAmount <= rules.delay_max_usd) {
    return 'DELAY';
  }
  return 'APPROVAL';
}

/**
 * Evaluate ACTION_CATEGORY_LIMIT policy (per-action, daily, monthly USD limits).
 */
export function evaluateActionCategoryLimit(
  ctx: ParseRulesContext,
  resolved: PolicyRow[],
  transaction: TransactionParam,
  walletId: string | undefined,
  sqlite: SQLiteDatabase | null,
): PolicyEvaluation | null {
  if (!transaction.actionCategory || transaction.notionalUsd === undefined) return null;

  // Find matching ACTION_CATEGORY_LIMIT policies
  const categoryPolicies = resolved.filter(
    (p) => p.type === 'ACTION_CATEGORY_LIMIT',
  );
  if (categoryPolicies.length === 0) return null;

  for (const policy of categoryPolicies) {
    const rules = ctx.parseRules(policy.rules, ActionCategoryLimitRulesSchema, 'ACTION_CATEGORY_LIMIT');
    if (rules.category !== transaction.actionCategory) continue;

    const tierOnExceed = (rules.tier_on_exceed ?? 'DELAY') as PolicyTier;

    // Per-action limit
    if (rules.per_action_limit_usd !== undefined && transaction.notionalUsd > rules.per_action_limit_usd) {
      return {
        allowed: true,
        tier: tierOnExceed,
        reason: `ACTION_CATEGORY_LIMIT: per-action $${transaction.notionalUsd} exceeds ${rules.category} limit $${rules.per_action_limit_usd}`,
      };
    }

    // Daily limit (cumulative query)
    if (rules.daily_limit_usd !== undefined && sqlite) {
      const todayStart = new Date();
      todayStart.setUTCHours(0, 0, 0, 0);
      const todayStartSec = Math.floor(todayStart.getTime() / 1000);

      const row = sqlite.prepare(`
        SELECT COALESCE(SUM(
          CASE
            WHEN json_extract(metadata, '$.notionalUsd') IS NOT NULL
            THEN CAST(json_extract(metadata, '$.notionalUsd') AS REAL)
            ELSE 0
          END
        ), 0) AS total
        FROM transactions
        WHERE wallet_id = ?
          AND action_kind IN ('signedData', 'signedHttp')
          AND json_extract(metadata, '$.actionCategory') = ?
          AND created_at >= ?
          AND status != 'FAILED'
      `).get(
        walletId ?? resolved[0]?.walletId ?? null,
        rules.category,
        todayStartSec,
      ) as { total: number } | undefined;

      const cumulative = (row?.total ?? 0) + transaction.notionalUsd;
      if (cumulative > rules.daily_limit_usd) {
        return {
          allowed: true,
          tier: tierOnExceed,
          reason: `ACTION_CATEGORY_LIMIT: daily cumulative $${cumulative.toFixed(2)} exceeds ${rules.category} limit $${rules.daily_limit_usd}`,
        };
      }
    }

    // Monthly limit (cumulative query)
    if (rules.monthly_limit_usd !== undefined && sqlite) {
      const monthStart = new Date();
      monthStart.setUTCDate(1);
      monthStart.setUTCHours(0, 0, 0, 0);
      const monthStartSec = Math.floor(monthStart.getTime() / 1000);

      const row = sqlite.prepare(`
        SELECT COALESCE(SUM(
          CASE
            WHEN json_extract(metadata, '$.notionalUsd') IS NOT NULL
            THEN CAST(json_extract(metadata, '$.notionalUsd') AS REAL)
            ELSE 0
          END
        ), 0) AS total
        FROM transactions
        WHERE wallet_id = ?
          AND action_kind IN ('signedData', 'signedHttp')
          AND json_extract(metadata, '$.actionCategory') = ?
          AND created_at >= ?
          AND status != 'FAILED'
      `).get(
        walletId ?? resolved[0]?.walletId ?? null,
        rules.category,
        monthStartSec,
      ) as { total: number } | undefined;

      const cumulative = (row?.total ?? 0) + transaction.notionalUsd;
      if (cumulative > rules.monthly_limit_usd) {
        return {
          allowed: true,
          tier: tierOnExceed,
          reason: `ACTION_CATEGORY_LIMIT: monthly cumulative $${cumulative.toFixed(2)} exceeds ${rules.category} limit $${rules.monthly_limit_usd}`,
        };
      }
    }
  }

  return null; // Within limits
}
