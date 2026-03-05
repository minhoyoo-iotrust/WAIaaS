/**
 * ERC8128_ALLOWED_DOMAINS domain policy evaluation.
 *
 * Evaluates whether a target domain is allowed for ERC-8128 HTTP message signing
 * based on the ERC8128_ALLOWED_DOMAINS policy in the policies table.
 *
 * Design principle: Default deny -- if no ERC8128_ALLOWED_DOMAINS policy is
 * configured, ERC-8128 signing is disabled entirely.
 *
 * This follows the same architecture as X402_ALLOWED_DOMAINS:
 * separate from DatabasePolicyEngine because domain-level policies
 * don't operate on TransactionParam.
 *
 * @see packages/daemon/src/services/x402/x402-domain-policy.ts (pattern source)
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

/** Rules JSON structure for ERC8128_ALLOWED_DOMAINS policy. */
interface Erc8128AllowedDomainsRules {
  domains: string[];
  rate_limit_rpm?: number;
}

// ---------------------------------------------------------------------------
// In-memory rate limit counters
// ---------------------------------------------------------------------------

/** Per-domain timestamp arrays for rate limiting (domain -> timestamps[]) */
const rateLimitCounters = new Map<string, number[]>();

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
// evaluateErc8128Domain
// ---------------------------------------------------------------------------

/**
 * Evaluate ERC8128_ALLOWED_DOMAINS policy against a target domain.
 *
 * @param resolved - Resolved policy rows (after override resolution)
 * @param targetDomain - The domain to evaluate (e.g., "api.example.com")
 * @param settingsService - Optional settings service for default-deny toggle check
 * @returns PolicyEvaluation with allowed=false if denied, null if allowed (continue)
 */
export function evaluateErc8128Domain(
  resolved: PolicyRow[],
  targetDomain: string,
  settingsService?: SettingsReader,
): PolicyEvaluation | null {
  const policy = resolved.find((p) => p.type === 'ERC8128_ALLOWED_DOMAINS');

  // No policy -> check toggle, then deny (default deny)
  if (!policy) {
    if (settingsService?.get('policy.default_deny_erc8128_domains') === 'false') {
      return null; // default-allow mode: skip ERC-8128 domain whitelist check
    }
    return {
      allowed: false,
      tier: 'INSTANT' as PolicyTier,
      reason: 'ERC-8128 signing disabled: no ERC8128_ALLOWED_DOMAINS policy configured',
    };
  }

  const rules: Erc8128AllowedDomainsRules = JSON.parse(policy.rules);

  // Check if domain is in allowed list
  const isAllowed = rules.domains.some((domainPattern) =>
    matchDomain(domainPattern, targetDomain),
  );

  if (!isAllowed) {
    return {
      allowed: false,
      tier: 'INSTANT' as PolicyTier,
      reason: `Domain '${targetDomain}' not in allowed ERC-8128 domains list`,
    };
  }

  return null; // Domain allowed, continue
}

// ---------------------------------------------------------------------------
// checkErc8128RateLimit
// ---------------------------------------------------------------------------

/**
 * Check per-domain rate limit for ERC-8128 signing requests.
 *
 * Uses in-memory counters with a 60-second sliding window.
 *
 * @param domain - Target domain
 * @param limitRpm - Maximum requests per minute for this domain
 * @returns true if request is allowed, false if rate limited
 */
export function checkErc8128RateLimit(domain: string, limitRpm: number): boolean {
  const now = Date.now();
  const windowMs = 60_000;

  let timestamps = rateLimitCounters.get(domain);
  if (!timestamps) {
    timestamps = [];
    rateLimitCounters.set(domain, timestamps);
  }

  // Filter to timestamps within the last 60 seconds
  const recent = timestamps.filter((t) => now - t < windowMs);
  rateLimitCounters.set(domain, recent);

  if (recent.length >= limitRpm) {
    return false;
  }

  recent.push(now);
  return true;
}

/**
 * Reset rate limit counters (for testing only).
 * @internal
 */
export function _resetRateLimitCounters(): void {
  rateLimitCounters.clear();
}
