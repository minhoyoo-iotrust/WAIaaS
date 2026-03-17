/**
 * evaluators/approved-spenders.ts - APPROVED_SPENDERS, APPROVE_AMOUNT_LIMIT,
 * APPROVE_TIER_OVERRIDE evaluation.
 *
 * Extracted from DatabasePolicyEngine private methods.
 */

import {
  ApprovedSpendersRulesSchema,
  ApproveAmountLimitRulesSchema,
  ApproveTierOverrideRulesSchema,
} from '@waiaas/core';
import type { PolicyEvaluation, PolicyTier, PolicyRow, TransactionParam, ParseRulesContext, SettingsContext } from './types.js';

/** Threshold for detecting "unlimited" approve amounts. */
const UNLIMITED_THRESHOLD = (2n ** 256n - 1n) / 2n;

/**
 * Evaluate APPROVED_SPENDERS policy.
 *
 * Returns PolicyEvaluation if denied, null if allowed (or not applicable).
 */
export function evaluateApprovedSpenders(
  ctx: ParseRulesContext & SettingsContext,
  resolved: PolicyRow[],
  transaction: TransactionParam,
): PolicyEvaluation | null {
  // Only evaluate for APPROVE transactions
  if (transaction.type !== 'APPROVE') return null;

  const approvedSpendersPolicy = resolved.find((p) => p.type === 'APPROVED_SPENDERS');

  // No APPROVED_SPENDERS policy -> check toggle, then deny (default deny)
  if (!approvedSpendersPolicy) {
    if (ctx.settingsService?.get('policy.default_deny_spenders') === 'false') {
      return null; // default-allow mode: skip approved spenders check
    }
    return {
      allowed: false,
      tier: 'INSTANT',
      reason: 'Token approvals disabled: no APPROVED_SPENDERS policy configured',
    };
  }

  // Parse rules.spenders array
  const rules = ctx.parseRules(approvedSpendersPolicy.rules, ApprovedSpendersRulesSchema, 'APPROVED_SPENDERS');
  const spenderAddress = transaction.spenderAddress;

  if (!spenderAddress) {
    return {
      allowed: false,
      tier: 'INSTANT',
      reason: 'Approve missing spender address',
    };
  }

  // Check if spender is in approved list (case-insensitive for EVM addresses)
  const isApproved = rules.spenders.some(
    (s) => s.address.toLowerCase() === spenderAddress.toLowerCase(),
  );

  if (!isApproved) {
    return {
      allowed: false,
      tier: 'INSTANT',
      reason: `Spender not in approved list: ${spenderAddress}`,
    };
  }

  return null; // Spender is approved, continue evaluation
}

/**
 * Evaluate APPROVE_AMOUNT_LIMIT policy.
 *
 * Returns PolicyEvaluation if denied, null if allowed (or not applicable).
 */
export function evaluateApproveAmountLimit(
  ctx: ParseRulesContext,
  resolved: PolicyRow[],
  transaction: TransactionParam,
): PolicyEvaluation | null {
  // Only evaluate for APPROVE transactions
  if (transaction.type !== 'APPROVE') return null;

  const approveAmount = transaction.approveAmount;
  if (!approveAmount) return null; // No amount to check

  const amount = BigInt(approveAmount);

  const approveAmountPolicy = resolved.find((p) => p.type === 'APPROVE_AMOUNT_LIMIT');

  if (!approveAmountPolicy) {
    // No policy: default block unlimited
    if (amount >= UNLIMITED_THRESHOLD) {
      return {
        allowed: false,
        tier: 'INSTANT',
        reason: 'Unlimited token approval is blocked',
      };
    }
    return null;
  }

  // Parse rules
  const rules = ctx.parseRules(approveAmountPolicy.rules, ApproveAmountLimitRulesSchema, 'APPROVE_AMOUNT_LIMIT');

  // Check unlimited block
  if (rules.blockUnlimited && amount >= UNLIMITED_THRESHOLD) {
    return {
      allowed: false,
      tier: 'INSTANT',
      reason: 'Unlimited token approval is blocked',
    };
  }

  // Check maxAmount cap
  if (rules.maxAmount && amount > BigInt(rules.maxAmount)) {
    return {
      allowed: false,
      tier: 'INSTANT',
      reason: 'Approve amount exceeds limit',
    };
  }

  return null; // Amount within limits, continue evaluation
}

/**
 * Evaluate APPROVE_TIER_OVERRIDE policy.
 *
 * Returns PolicyEvaluation if override policy exists, null otherwise.
 */
export function evaluateApproveTierOverride(
  ctx: ParseRulesContext,
  resolved: PolicyRow[],
  transaction: TransactionParam,
): PolicyEvaluation | null {
  // Only evaluate for APPROVE transactions
  if (transaction.type !== 'APPROVE') return null;

  const approveTierPolicy = resolved.find((p) => p.type === 'APPROVE_TIER_OVERRIDE');

  if (!approveTierPolicy) {
    // Phase 236: No override -> fall through to SPENDING_LIMIT for token_limits evaluation
    return null;
  }

  // Parse rules
  const rules = ctx.parseRules(approveTierPolicy.rules, ApproveTierOverrideRulesSchema, 'APPROVE_TIER_OVERRIDE');
  return { allowed: true, tier: rules.tier as PolicyTier };
}
