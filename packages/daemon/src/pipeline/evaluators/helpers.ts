/**
 * evaluators/helpers.ts - Shared helper functions for policy evaluators.
 */

import type { PolicyTier } from '@waiaas/core';

const TIER_ORDER: PolicyTier[] = ['INSTANT', 'NOTIFY', 'DELAY', 'APPROVAL'];

/**
 * Return the more conservative (higher) tier of two.
 */
export function maxTier(a: PolicyTier, b: PolicyTier): PolicyTier {
  const aIdx = TIER_ORDER.indexOf(a);
  const bIdx = TIER_ORDER.indexOf(b);
  return TIER_ORDER[Math.max(aIdx, bIdx)]!;
}
