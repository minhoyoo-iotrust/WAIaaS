/**
 * X402_ALLOWED_DOMAINS domain policy evaluation.
 *
 * Evaluates whether a target domain is allowed for x402 payments based on
 * the X402_ALLOWED_DOMAINS policy in the policies table.
 *
 * Design principle: Default deny -- if no X402_ALLOWED_DOMAINS policy is
 * configured, x402 payments are disabled entirely.
 *
 * This module is separate from DatabasePolicyEngine because X402_ALLOWED_DOMAINS
 * is a domain-level policy, not a transaction-level policy. The evaluate() method
 * in DatabasePolicyEngine operates on TransactionParam which has no URL/domain field.
 *
 * @see Research Pitfall 1: X402_ALLOWED_DOMAINS evaluation location
 */

import type { PolicyEvaluation, PolicyTier } from '@waiaas/core';

/** Minimal SettingsService interface to avoid circular imports. */
interface SettingsReader {
  get(key: string): string;
}

// ---------------------------------------------------------------------------
// Types (local definition -- PolicyRow is private in DatabasePolicyEngine)
// ---------------------------------------------------------------------------

/** Policy row shape matching DatabasePolicyEngine's internal PolicyRow. */
interface PolicyRow {
  id: string;
  walletId: string | null;
  type: string;
  rules: string;
  priority: number;
  enabled: boolean | null;
  network: string | null;
}

/** Rules JSON structure for X402_ALLOWED_DOMAINS policy. */
interface X402AllowedDomainsRules {
  domains: string[];
}

// ---------------------------------------------------------------------------
// matchDomain
// ---------------------------------------------------------------------------

/**
 * Match a domain pattern against a target domain.
 *
 * Rules:
 * - "api.example.com" -> exact match only
 * - "*.example.com" -> matches sub.example.com, a.b.example.com
 *                       does NOT match example.com (dot-boundary)
 * - Case-insensitive comparison
 *
 * @param pattern - Domain pattern (exact or wildcard like "*.example.com")
 * @param target - Target domain to match against
 * @returns true if pattern matches target
 */
export function matchDomain(pattern: string, target: string): boolean {
  const p = pattern.toLowerCase();
  const t = target.toLowerCase();

  // Exact match
  if (p === t) return true;

  // Wildcard match: *.example.com
  if (p.startsWith('*.')) {
    const suffix = p.slice(1); // ".example.com"
    // target must end with suffix AND be longer (dot-boundary: excludes root domain)
    return t.endsWith(suffix) && t.length > suffix.length;
  }

  return false;
}

// ---------------------------------------------------------------------------
// evaluateX402Domain
// ---------------------------------------------------------------------------

/**
 * Evaluate X402_ALLOWED_DOMAINS policy against a target domain.
 *
 * @param resolved - Resolved policy rows (after override resolution)
 * @param targetDomain - The domain to evaluate (e.g., "api.example.com")
 * @param settingsService - Optional settings service for default-deny toggle check
 * @returns PolicyEvaluation with allowed=false if denied, null if allowed (continue to next evaluation)
 */
export function evaluateX402Domain(
  resolved: PolicyRow[],
  targetDomain: string,
  settingsService?: SettingsReader,
): PolicyEvaluation | null {
  const policy = resolved.find((p) => p.type === 'X402_ALLOWED_DOMAINS');

  // No policy -> check toggle, then deny (default deny)
  if (!policy) {
    if (settingsService?.get('policy.default_deny_x402_domains') === 'false') {
      return null; // default-allow mode: skip x402 domain whitelist check
    }
    return {
      allowed: false,
      tier: 'INSTANT' as PolicyTier,
      reason: 'x402 payments disabled: no X402_ALLOWED_DOMAINS policy configured',
    };
  }

  const rules: X402AllowedDomainsRules = JSON.parse(policy.rules);

  // Check if domain is in allowed list
  const isAllowed = rules.domains.some((domainPattern) =>
    matchDomain(domainPattern, targetDomain),
  );

  if (!isAllowed) {
    return {
      allowed: false,
      tier: 'INSTANT' as PolicyTier,
      reason: `Domain '${targetDomain}' not in allowed x402 domains list`,
    };
  }

  return null; // Domain allowed, continue to next evaluation
}
