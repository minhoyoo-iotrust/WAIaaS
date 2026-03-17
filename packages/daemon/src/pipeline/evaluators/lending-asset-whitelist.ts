/**
 * evaluators/lending-asset-whitelist.ts - LENDING_ASSET_WHITELIST evaluation.
 *
 * Extracted from DatabasePolicyEngine private methods.
 */

import { LendingAssetWhitelistRulesSchema } from '@waiaas/core';
import type { PolicyEvaluation, PolicyRow, TransactionParam, ParseRulesContext } from './types.js';

/**
 * Evaluate LENDING_ASSET_WHITELIST policy.
 *
 * Logic:
 * - Only applies to lending actions (supply/borrow/repay/withdraw)
 * - If no LENDING_ASSET_WHITELIST policy exists: deny (default-deny per CLAUDE.md)
 * - If policy exists: check if target contract address is in rules.assets[].address
 *
 * Returns PolicyEvaluation if denied, null if allowed (or not applicable).
 */
export function evaluateLendingAssetWhitelist(
  ctx: ParseRulesContext,
  resolved: PolicyRow[],
  transaction: TransactionParam,
): PolicyEvaluation | null {
  // Only applies to lending actions
  const LENDING_ACTIONS = new Set(['supply', 'borrow', 'repay', 'withdraw']);
  if (!transaction.actionName || !LENDING_ACTIONS.has(transaction.actionName)) {
    return null;
  }

  const assetPolicy = resolved.find((p) => p.type === 'LENDING_ASSET_WHITELIST');
  if (!assetPolicy) {
    // Default-deny (CLAUDE.md compliance): no whitelist -> deny lending
    return {
      allowed: false,
      tier: 'INSTANT',
      reason: 'No LENDING_ASSET_WHITELIST policy configured. Lending assets require explicit whitelist.',
    };
  }

  const rules = ctx.parseRules(assetPolicy.rules, LendingAssetWhitelistRulesSchema, 'LENDING_ASSET_WHITELIST');
  const targetAddress = transaction.contractAddress ?? transaction.toAddress;
  const isWhitelisted = rules.assets.some(
    (a) => a.address.toLowerCase() === targetAddress.toLowerCase(),
  );

  if (!isWhitelisted) {
    return {
      allowed: false,
      tier: 'INSTANT',
      reason: `Asset ${targetAddress} not in lending asset whitelist`,
    };
  }
  return null; // pass through
}
