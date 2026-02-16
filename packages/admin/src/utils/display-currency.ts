/**
 * Display currency utilities for Admin UI.
 *
 * Provides display currency formatting and forex rate fetching.
 * Inline implementation of formatDisplayCurrency logic from @waiaas/core
 * because Admin UI cannot import daemon/core code due to CSP restrictions.
 *
 * @see packages/core/src/utils/format-currency.ts (canonical implementation)
 */

import { apiGet } from '../api/client';
import { API } from '../api/endpoints';

// ---------------------------------------------------------------------------
// Currency decimal overrides (ISO 4217) -- must match core/format-currency.ts
// ---------------------------------------------------------------------------

const ZERO_DECIMAL_CURRENCIES = new Set([
  'KRW', 'JPY', 'VND', 'CLP', 'HUF', 'PKR',
]);

const THREE_DECIMAL_CURRENCIES = new Set([
  'KWD', 'BHD',
]);

function getDecimals(currencyCode: string): number {
  if (ZERO_DECIMAL_CURRENCIES.has(currencyCode)) return 0;
  if (THREE_DECIMAL_CURRENCIES.has(currencyCode)) return 3;
  return 2;
}

// ---------------------------------------------------------------------------
// Inline formatDisplayCurrency (mirrors core)
// ---------------------------------------------------------------------------

function formatDisplayCurrency(
  amountUsd: number,
  currencyCode: string,
  rate: number,
): string {
  const converted = amountUsd * rate;
  const decimals = getDecimals(currencyCode);

  const formatted = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currencyCode,
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(converted);

  // USD has no approximation prefix
  if (currencyCode === 'USD') return formatted;

  // Non-USD: prefix with "\u2248" (approximately)
  return `\u2248${formatted}`;
}

// ---------------------------------------------------------------------------
// Cache for display currency + rate
// ---------------------------------------------------------------------------

interface DisplayCurrencyCache {
  currency: string;
  rate: number | null;
  fetchedAt: number;
}

let cache: DisplayCurrencyCache | null = null;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Fetch the configured display currency and its exchange rate.
 *
 * Reads display.currency from GET /v1/admin/settings, then fetches
 * the forex rate from GET /v1/admin/forex/rates if non-USD.
 *
 * Results are cached for 5 minutes to avoid excessive API calls.
 *
 * @returns { currency, rate } where rate is null on error (USD fallback)
 */
export async function fetchDisplayCurrency(): Promise<{ currency: string; rate: number | null }> {
  // Return cached value if still valid
  if (cache && Date.now() - cache.fetchedAt < CACHE_TTL_MS) {
    return { currency: cache.currency, rate: cache.rate };
  }

  try {
    // Read display.currency from settings
    const settings = await apiGet<{
      display?: Record<string, string | boolean>;
    }>(API.ADMIN_SETTINGS);

    const currency = (settings.display?.['display.currency'] as string) ?? 'USD';

    // USD: rate=1, no forex API call needed
    if (currency === 'USD') {
      cache = { currency: 'USD', rate: 1, fetchedAt: Date.now() };
      return { currency: 'USD', rate: 1 };
    }

    // Non-USD: fetch forex rate
    const rateResult = await apiGet<{
      rates: Record<string, { rate: number; preview: string }>;
    }>(`${API.ADMIN_FOREX_RATES}?currencies=${currency}`);

    const rateEntry = rateResult.rates[currency];
    const rate = rateEntry?.rate ?? null;

    cache = { currency, rate, fetchedAt: Date.now() };
    return { currency, rate };
  } catch {
    // Graceful fallback: USD with no rate
    return { currency: 'USD', rate: 1 };
  }
}

/**
 * Format an amountUsd value with the configured display currency.
 *
 * @param amountUsd - USD amount (null/undefined returns empty string)
 * @param currency - Display currency code
 * @param rate - Exchange rate (null returns USD fallback)
 * @returns Formatted string, e.g. "\u2248\u20A9725,000" or "$500.00"
 */
export function formatWithDisplay(
  amountUsd: number | null | undefined,
  currency: string,
  rate: number | null,
): string {
  if (amountUsd == null) return '';

  // If rate is unavailable, fall back to USD formatting
  if (rate == null) {
    return `$${amountUsd.toFixed(2)}`;
  }

  return formatDisplayCurrency(amountUsd, currency, rate);
}
