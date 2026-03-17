/**
 * evaluators/contract-whitelist.ts - CONTRACT_WHITELIST, METHOD_WHITELIST,
 * VENUE_WHITELIST, PERP_ALLOWED_MARKETS evaluation.
 *
 * Extracted from DatabasePolicyEngine private methods.
 */

import {
  ContractWhitelistRulesSchema,
  MethodWhitelistRulesSchema,
  VenueWhitelistRulesSchema,
  PerpAllowedMarketsRulesSchema,
} from '@waiaas/core';
import type { PolicyEvaluation, PolicyRow, TransactionParam, ParseRulesContext, SettingsContext } from './types.js';

/**
 * Evaluate CONTRACT_WHITELIST policy.
 *
 * Returns PolicyEvaluation if denied, null if allowed (or not applicable).
 */
export function evaluateContractWhitelist(
  ctx: ParseRulesContext & SettingsContext,
  resolved: PolicyRow[],
  transaction: TransactionParam,
): PolicyEvaluation | null {
  // Evaluate for CONTRACT_CALL and NFT_TRANSFER transactions (v31.0)
  if (transaction.type !== 'CONTRACT_CALL' && transaction.type !== 'NFT_TRANSFER') return null;

  // Provider-trust: skip CONTRACT_WHITELIST for trusted action providers
  if (transaction.actionProvider && ctx.settingsService) {
    const enabledKey = `actions.${transaction.actionProvider}_enabled`;
    try {
      const enabled = ctx.settingsService.get(enabledKey);
      if (enabled === 'true') {
        return null; // Skip CONTRACT_WHITELIST -- provider is trusted
      }
    } catch {
      // Unknown setting key means provider is not registered -- fall through to normal check
    }
  }

  const contractWhitelistPolicy = resolved.find((p) => p.type === 'CONTRACT_WHITELIST');

  // No CONTRACT_WHITELIST policy -> check toggle, then deny (default deny)
  if (!contractWhitelistPolicy) {
    if (ctx.settingsService?.get('policy.default_deny_contracts') === 'false') {
      return null; // default-allow mode: skip contract whitelist check
    }
    return {
      allowed: false,
      tier: 'INSTANT',
      reason: 'Contract calls disabled: no CONTRACT_WHITELIST policy configured',
    };
  }

  // Parse rules.contracts array
  const rules = ctx.parseRules(contractWhitelistPolicy.rules, ContractWhitelistRulesSchema, 'CONTRACT_WHITELIST');
  const contractAddress = transaction.contractAddress ?? transaction.toAddress;

  // Check if contract is in whitelist (case-insensitive comparison for EVM addresses)
  const isWhitelisted = rules.contracts.some(
    (c) => c.address.toLowerCase() === contractAddress.toLowerCase(),
  );

  if (!isWhitelisted) {
    return {
      allowed: false,
      tier: 'INSTANT',
      reason: `Contract not whitelisted: ${contractAddress}`,
    };
  }

  return null; // Contract is whitelisted, continue evaluation
}

/**
 * Evaluate METHOD_WHITELIST policy.
 *
 * Returns PolicyEvaluation if denied, null if allowed (or not applicable).
 */
export function evaluateMethodWhitelist(
  ctx: ParseRulesContext,
  resolved: PolicyRow[],
  transaction: TransactionParam,
): PolicyEvaluation | null {
  // Only evaluate for CONTRACT_CALL transactions
  if (transaction.type !== 'CONTRACT_CALL') return null;

  const methodWhitelistPolicy = resolved.find((p) => p.type === 'METHOD_WHITELIST');

  // No METHOD_WHITELIST policy -> no method restriction (optional policy)
  if (!methodWhitelistPolicy) return null;

  // Parse rules.methods array
  const rules = ctx.parseRules(methodWhitelistPolicy.rules, MethodWhitelistRulesSchema, 'METHOD_WHITELIST');
  const contractAddress = transaction.contractAddress ?? transaction.toAddress;
  const selector = transaction.selector;

  // Find matching entry for this contract (case-insensitive)
  const entry = rules.methods.find(
    (m) => m.contractAddress.toLowerCase() === contractAddress.toLowerCase(),
  );

  // No entry for this contract -> no method restriction for this specific contract
  if (!entry) return null;

  // Check if selector is in the allowed list (case-insensitive)
  if (!selector) {
    return {
      allowed: false,
      tier: 'INSTANT',
      reason: `Method not whitelisted: missing selector on contract ${contractAddress}`,
    };
  }

  const isAllowed = entry.selectors.some(
    (s) => s.toLowerCase() === selector.toLowerCase(),
  );

  if (!isAllowed) {
    return {
      allowed: false,
      tier: 'INSTANT',
      reason: `Method not whitelisted: ${selector} on contract ${contractAddress}`,
    };
  }

  return null; // Method is whitelisted, continue evaluation
}

/**
 * Evaluate VENUE_WHITELIST policy (default-deny when enabled).
 */
export function evaluateVenueWhitelist(
  ctx: ParseRulesContext & SettingsContext,
  resolved: PolicyRow[],
  transaction: TransactionParam,
): PolicyEvaluation | null {
  // No venue (contractCall) -> skip
  if (!transaction.venue) return null;

  // Check if venue whitelist is enabled via Admin Settings
  let enabled = false;
  try {
    enabled = ctx.settingsService?.get('venue_whitelist_enabled') === 'true';
  } catch {
    // Setting key not registered -- disabled by default
  }
  if (!enabled) return null;

  const policy = resolved.find((p) => p.type === 'VENUE_WHITELIST');
  const venueNorm = transaction.venue.toLowerCase();

  if (!policy) {
    // Default-deny: venue present but no whitelist policy
    return {
      allowed: false,
      tier: 'INSTANT',
      reason: `VENUE_NOT_ALLOWED: venue '${transaction.venue}' is not whitelisted (no VENUE_WHITELIST policy)`,
    };
  }

  const rules = ctx.parseRules(policy.rules, VenueWhitelistRulesSchema, 'VENUE_WHITELIST');
  const isAllowed = rules.venues.some((v) => v.id.toLowerCase() === venueNorm);

  if (!isAllowed) {
    return {
      allowed: false,
      tier: 'INSTANT',
      reason: `VENUE_NOT_ALLOWED: venue '${transaction.venue}' is not in the whitelist`,
    };
  }

  return null; // Venue allowed
}

/**
 * Evaluate PERP_ALLOWED_MARKETS policy.
 */
export function evaluatePerpAllowedMarkets(
  ctx: ParseRulesContext,
  resolved: PolicyRow[],
  transaction: TransactionParam,
): PolicyEvaluation | null {
  const PERP_ACTIONS = new Set([
    'open_position', 'close_position', 'modify_position',
    'add_margin', 'withdraw_margin',
  ]);
  // Suffix matching for prefixed actions (drift_open_position -> open_position)
  const actionSuffix = transaction.actionName
    ? [...PERP_ACTIONS].find((a) => transaction.actionName!.endsWith(a))
    : undefined;
  if (!actionSuffix) return null; // Not a perp action

  const marketPolicy = resolved.find((p) => p.type === 'PERP_ALLOWED_MARKETS');
  if (!marketPolicy) {
    return {
      allowed: false,
      tier: 'INSTANT',
      reason: 'No PERP_ALLOWED_MARKETS policy configured. Perp markets require explicit whitelist.',
    };
  }

  const rules = ctx.parseRules(marketPolicy.rules, PerpAllowedMarketsRulesSchema, 'PERP_ALLOWED_MARKETS');
  const targetMarket = transaction.contractAddress ?? transaction.toAddress;
  const isAllowed = rules.markets.some(
    (m) => m.market.toLowerCase() === targetMarket.toLowerCase(),
  );

  if (!isAllowed) {
    return {
      allowed: false,
      tier: 'INSTANT',
      reason: `Market ${targetMarket} not in perp allowed markets whitelist`,
    };
  }
  return null;
}
