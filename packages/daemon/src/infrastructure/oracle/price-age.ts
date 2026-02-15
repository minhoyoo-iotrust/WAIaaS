/**
 * Price age classification utility.
 *
 * Classifies how old a price observation is into three buckets:
 * - FRESH (< 5 minutes): Safe to use directly
 * - AGING (5-30 minutes): Usable with warning, may trigger re-fetch
 * - STALE (>= 30 minutes): Should not be used for policy evaluation
 *
 * Note: These thresholds align with InMemoryPriceCache:
 * - FRESH_MAX_MS matches cache TTL (5 min)
 * - AGING_MAX_MS matches cache staleMax (30 min)
 *
 * IMPORTANT: Do not confuse PriceInfo.isStale (cache TTL expired, >5min)
 * with PriceAge 'STALE' (>30min). They are different concepts.
 */
import { z } from 'zod';

/** Valid price age categories. */
export const PRICE_AGES = ['FRESH', 'AGING', 'STALE'] as const;

/** Price age discriminant type. */
export type PriceAge = (typeof PRICE_AGES)[number];

/** Zod enum for runtime validation of PriceAge values. */
export const PriceAgeEnum = z.enum(PRICE_AGES);

/** Threshold constants for price age classification (milliseconds). */
export const PRICE_AGE_THRESHOLDS = {
  /** Maximum age for FRESH classification: 5 minutes. */
  FRESH_MAX_MS: 5 * 60 * 1000,   // 300,000 ms
  /** Maximum age for AGING classification: 30 minutes. Beyond this = STALE. */
  AGING_MAX_MS: 30 * 60 * 1000,  // 1,800,000 ms
} as const;

/**
 * Classify the age of a price observation.
 *
 * @param fetchedAt - Unix timestamp (ms) when price was fetched.
 * @param now - Current time (ms). Defaults to Date.now(). Inject for testing.
 * @returns PriceAge discriminant: 'FRESH', 'AGING', or 'STALE'.
 */
export function classifyPriceAge(fetchedAt: number, now?: number): PriceAge {
  const currentTime = now ?? Date.now();
  const ageMs = currentTime - fetchedAt;

  if (ageMs < PRICE_AGE_THRESHOLDS.FRESH_MAX_MS) return 'FRESH';
  if (ageMs < PRICE_AGE_THRESHOLDS.AGING_MAX_MS) return 'AGING';
  return 'STALE';
}
