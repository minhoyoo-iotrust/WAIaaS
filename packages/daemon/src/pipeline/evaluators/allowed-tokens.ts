/**
 * evaluators/allowed-tokens.ts - WHITELIST, ALLOWED_TOKENS, ALLOWED_NETWORKS evaluation.
 *
 * Extracted from DatabasePolicyEngine private methods.
 */

import {
  parseCaip19,
  WhitelistRulesSchema,
  AllowedTokensRulesSchema,
  AllowedNetworksRulesSchema,
} from '@waiaas/core';
import type { PolicyEvaluation, PolicyRow, TransactionParam, ParseRulesContext, SettingsContext } from './types.js';

/**
 * Evaluate WHITELIST policy.
 * Returns PolicyEvaluation if denied, null if allowed (or no whitelist).
 */
export function evaluateWhitelist(
  ctx: ParseRulesContext,
  resolved: PolicyRow[],
  toAddress: string,
): PolicyEvaluation | null {
  const whitelist = resolved.find((p) => p.type === 'WHITELIST');
  if (!whitelist) return null;

  const rules = ctx.parseRules(whitelist.rules, WhitelistRulesSchema, 'WHITELIST');

  // Empty allowed_addresses = whitelist inactive
  if (!rules.allowed_addresses || rules.allowed_addresses.length === 0) {
    return null;
  }

  // Case-insensitive comparison (EVM compat)
  const normalizedTo = toAddress.toLowerCase();
  const isWhitelisted = rules.allowed_addresses.some(
    (addr) => addr.toLowerCase() === normalizedTo,
  );

  if (!isWhitelisted) {
    return {
      allowed: false,
      tier: 'INSTANT',
      reason: `Address ${toAddress} not in whitelist`,
    };
  }

  return null;
}

/**
 * Evaluate ALLOWED_NETWORKS policy.
 *
 * Logic:
 * - If no ALLOWED_NETWORKS policy exists: return null (permissive default)
 * - If policy exists: check if resolvedNetwork is in rules.networks[].network
 *
 * Returns PolicyEvaluation if denied, null if allowed (or no policy).
 */
export function evaluateAllowedNetworks(
  ctx: ParseRulesContext,
  resolved: PolicyRow[],
  resolvedNetwork: string,
): PolicyEvaluation | null {
  const policy = resolved.find((p) => p.type === 'ALLOWED_NETWORKS');

  // No ALLOWED_NETWORKS policy -> permissive default (all networks allowed)
  if (!policy) return null;

  const rules = ctx.parseRules(policy.rules, AllowedNetworksRulesSchema, 'ALLOWED_NETWORKS');

  // Case-insensitive comparison
  const isAllowed = rules.networks.some(
    (n) => n.network.toLowerCase() === resolvedNetwork.toLowerCase(),
  );

  if (!isAllowed) {
    const allowedList = rules.networks.map((n) => n.network).join(', ');
    return {
      allowed: false,
      tier: 'INSTANT',
      reason: `Network '${resolvedNetwork}' not in allowed networks list. Allowed: ${allowedList}`,
    };
  }

  return null; // Network allowed, continue evaluation
}

/**
 * Evaluate ALLOWED_TOKENS policy with 4-scenario matching matrix (PLCY-03).
 *
 * Returns PolicyEvaluation if denied, null if allowed (or not applicable).
 */
export function evaluateAllowedTokens(
  ctx: ParseRulesContext & SettingsContext,
  resolved: PolicyRow[],
  transaction: TransactionParam,
): PolicyEvaluation | null {
  // Only evaluate for TOKEN_TRANSFER transactions
  if (transaction.type !== 'TOKEN_TRANSFER') return null;

  const allowedTokensPolicy = resolved.find((p) => p.type === 'ALLOWED_TOKENS');

  // No ALLOWED_TOKENS policy -> check toggle, then deny (default deny)
  if (!allowedTokensPolicy) {
    if (ctx.settingsService?.get('policy.default_deny_tokens') === 'false') {
      return null; // default-allow mode: skip token whitelist check
    }
    return {
      allowed: false,
      tier: 'INSTANT',
      reason: 'Token transfer not allowed: no ALLOWED_TOKENS policy configured',
    };
  }

  // Parse rules.tokens array
  const rules = ctx.parseRules(allowedTokensPolicy.rules, AllowedTokensRulesSchema, 'ALLOWED_TOKENS');
  const txTokenAddress = transaction.tokenAddress;
  const txAssetId = transaction.assetId;

  if (!txTokenAddress && !txAssetId) {
    return {
      allowed: false,
      tier: 'INSTANT',
      reason: 'Token transfer missing token address',
    };
  }

  // 4-scenario matching matrix (PLCY-03)
  const isAllowed = rules.tokens.some((policyToken) => {
    // Scenario 1: Both have assetId -> exact CAIP-19 string match
    if (policyToken.assetId && txAssetId) {
      return policyToken.assetId === txAssetId;
    }

    // Scenario 2: Policy has assetId, TX has address only
    if (policyToken.assetId && txTokenAddress) {
      try {
        const policyAddr = parseCaip19(policyToken.assetId).assetReference;
        return policyAddr.toLowerCase() === txTokenAddress.toLowerCase();
      } catch {
        return false; // Invalid policy assetId -> no match
      }
    }

    // Scenario 3: Policy has address only, TX has assetId
    if (!policyToken.assetId && txAssetId) {
      try {
        const txAddr = parseCaip19(txAssetId).assetReference;
        return policyToken.address.toLowerCase() === txAddr.toLowerCase();
      } catch {
        return false; // Invalid TX assetId -> no match
      }
    }

    // Scenario 4: Both address only -> current behavior (case-insensitive)
    return policyToken.address.toLowerCase() === (txTokenAddress ?? '').toLowerCase();
  });

  if (!isAllowed) {
    return {
      allowed: false,
      tier: 'INSTANT',
      reason: `Token not in allowed list: ${txAssetId ?? txTokenAddress}`,
    };
  }

  return null; // Token is allowed, continue evaluation
}
