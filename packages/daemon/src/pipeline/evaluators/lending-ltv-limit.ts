/**
 * evaluators/lending-ltv-limit.ts - LENDING_LTV_LIMIT, PERP_MAX_LEVERAGE,
 * PERP_MAX_POSITION_USD evaluation.
 *
 * Extracted from DatabasePolicyEngine private methods.
 */

import {
  LendingLtvLimitRulesSchema,
  PerpMaxLeverageRulesSchema,
  PerpMaxPositionUsdRulesSchema,
} from '@waiaas/core';
import type { PolicyTier, PolicyEvaluation, PolicyRow, TransactionParam, ParseRulesContext } from './types.js';
import type { Database as SQLiteDatabase } from 'better-sqlite3';

/**
 * Evaluate LENDING_LTV_LIMIT policy for borrow actions.
 *
 * @param usdAmount - USD value of the new borrow (from pipeline IPriceOracle, LEND-09)
 * Returns PolicyEvaluation if denied/escalated, null if allowed (or not applicable).
 */
export function evaluateLendingLtvLimit(
  ctx: ParseRulesContext,
  resolved: PolicyRow[],
  transaction: TransactionParam,
  walletId: string,
  sqlite: SQLiteDatabase | null,
  usdAmount?: number,
): PolicyEvaluation | null {
  // Only applies to borrow actions (matches 'borrow', 'aave_borrow', 'kamino_borrow', etc.)
  if (!transaction.actionName?.endsWith('borrow')) return null;

  const ltvPolicy = resolved.find((p) => p.type === 'LENDING_LTV_LIMIT');
  if (!ltvPolicy) return null; // No LTV policy -> pass through

  const rules = ctx.parseRules(ltvPolicy.rules, LendingLtvLimitRulesSchema, 'LENDING_LTV_LIMIT');

  // Read cached position data from defi_positions
  if (!sqlite) return null;

  const positions = sqlite.prepare(
    "SELECT amount_usd, metadata, status FROM defi_positions WHERE wallet_id = ? AND category = 'LENDING' AND status = 'ACTIVE'",
  ).all(walletId) as Array<{ amount_usd: number | null; metadata: string | null; status: string }>;

  // Aggregate collateral and debt from positions
  let totalCollateralUsd = 0;
  let totalDebtUsd = 0;
  for (const pos of positions) {
    if (!pos.metadata) continue;
    try {
      const meta = JSON.parse(pos.metadata) as Record<string, unknown>;
      const posType = meta.positionType as string | undefined;
      const usd = pos.amount_usd ?? 0;
      if (posType === 'SUPPLY') totalCollateralUsd += usd;
      else if (posType === 'BORROW') totalDebtUsd += usd;
    } catch { /* ignore parse errors */ }
  }

  // Calculate projected LTV including new borrow amount (LEND-09)
  const newBorrowUsd = usdAmount ?? 0;

  const projectedLtv = totalCollateralUsd > 0
    ? (totalDebtUsd + newBorrowUsd) / totalCollateralUsd
    : (totalDebtUsd > 0 || newBorrowUsd > 0 ? Infinity : 0);

  if (projectedLtv > rules.maxLtv) {
    return {
      allowed: false,
      tier: 'INSTANT',
      reason: `Borrow would exceed max LTV (projected: ${(projectedLtv * 100).toFixed(1)}%, limit: ${(rules.maxLtv * 100).toFixed(1)}%)`,
    };
  }
  if (projectedLtv > rules.warningLtv) {
    return {
      allowed: true,
      tier: 'DELAY' as PolicyTier,
      reason: `LTV approaching limit (projected: ${(projectedLtv * 100).toFixed(1)}%)`,
    };
  }
  return null; // pass through
}

/**
 * Evaluate PERP_MAX_LEVERAGE policy.
 */
export function evaluatePerpMaxLeverage(
  ctx: ParseRulesContext,
  resolved: PolicyRow[],
  transaction: TransactionParam,
): PolicyEvaluation | null {
  if (!transaction.actionName) return null;
  const isLeverageAction =
    transaction.actionName.endsWith('open_position') ||
    transaction.actionName.endsWith('modify_position');
  if (!isLeverageAction) return null;

  const leveragePolicy = resolved.find((p) => p.type === 'PERP_MAX_LEVERAGE');
  if (!leveragePolicy) return null; // No leverage policy -> pass through

  const rules = ctx.parseRules(leveragePolicy.rules, PerpMaxLeverageRulesSchema, 'PERP_MAX_LEVERAGE');
  const leverage = transaction.perpLeverage;
  if (typeof leverage !== 'number') return null; // No leverage info -> pass through

  if (leverage > rules.maxLeverage) {
    return {
      allowed: false,
      tier: 'INSTANT',
      reason: `Leverage ${leverage}x exceeds max allowed (${rules.maxLeverage}x)`,
    };
  }

  if (rules.warningLeverage && leverage > rules.warningLeverage) {
    return {
      allowed: true,
      tier: 'DELAY' as PolicyTier,
      reason: `Leverage ${leverage}x approaching limit (warning: ${rules.warningLeverage}x, max: ${rules.maxLeverage}x)`,
    };
  }

  return null;
}

/**
 * Evaluate PERP_MAX_POSITION_USD policy.
 */
export function evaluatePerpMaxPositionUsd(
  ctx: ParseRulesContext,
  resolved: PolicyRow[],
  transaction: TransactionParam,
): PolicyEvaluation | null {
  if (!transaction.actionName) return null;
  const isSizeAction =
    transaction.actionName.endsWith('open_position') ||
    transaction.actionName.endsWith('modify_position');
  if (!isSizeAction) return null;

  const sizePolicy = resolved.find((p) => p.type === 'PERP_MAX_POSITION_USD');
  if (!sizePolicy) return null; // No size policy -> pass through

  const rules = ctx.parseRules(sizePolicy.rules, PerpMaxPositionUsdRulesSchema, 'PERP_MAX_POSITION_USD');
  const sizeUsd = transaction.perpSizeUsd;
  if (typeof sizeUsd !== 'number') return null; // No size info -> pass through

  if (sizeUsd > rules.maxPositionUsd) {
    return {
      allowed: false,
      tier: 'INSTANT',
      reason: `Position size $${sizeUsd.toLocaleString()} exceeds max allowed ($${rules.maxPositionUsd.toLocaleString()})`,
    };
  }

  if (rules.warningPositionUsd && sizeUsd > rules.warningPositionUsd) {
    return {
      allowed: true,
      tier: 'DELAY' as PolicyTier,
      reason: `Position size $${sizeUsd.toLocaleString()} approaching limit (warning: $${rules.warningPositionUsd.toLocaleString()}, max: $${rules.maxPositionUsd.toLocaleString()})`,
    };
  }

  return null;
}
