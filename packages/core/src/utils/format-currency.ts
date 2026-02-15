/**
 * Currency formatting utilities using Intl.NumberFormat.
 *
 * Used by Admin UI and API responses to display amounts in the user's
 * preferred display currency. Non-USD currencies get the "≈" prefix
 * to indicate the value is an approximation based on exchange rates.
 *
 * @see DISP-09 (v1.5.3 requirement: Intl.NumberFormat-based formatting)
 */

// ---------------------------------------------------------------------------
// Currency decimal overrides (ISO 4217)
// ---------------------------------------------------------------------------

/** Currencies with 0 decimal places (ISO 4217). */
const ZERO_DECIMAL_CURRENCIES = new Set([
  'KRW', 'JPY', 'VND', 'CLP', 'HUF', 'PKR',
]);

/** Currencies with 3 decimal places (ISO 4217). */
const THREE_DECIMAL_CURRENCIES = new Set([
  'KWD', 'BHD',
]);

/**
 * Get the number of decimal places for a currency code.
 *
 * @param currencyCode - ISO 4217 currency code.
 * @returns 0, 2, or 3 decimal places.
 */
function getDecimals(currencyCode: string): number {
  if (ZERO_DECIMAL_CURRENCIES.has(currencyCode)) return 0;
  if (THREE_DECIMAL_CURRENCIES.has(currencyCode)) return 3;
  return 2;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Format a USD amount in the specified display currency.
 *
 * Uses Intl.NumberFormat for locale-aware formatting with the correct
 * currency symbol, grouping separators, and decimal places.
 *
 * Non-USD currencies are prefixed with "≈" to indicate approximation.
 * USD amounts have no prefix.
 *
 * @param amountUsd - Amount in USD.
 * @param currencyCode - Target display currency code (e.g. 'KRW', 'EUR').
 * @param rate - Exchange rate (1 USD = rate target currency).
 * @returns Formatted string. Examples:
 *   - formatDisplayCurrency(500, 'USD', 1) => '$500.00'
 *   - formatDisplayCurrency(500, 'KRW', 1450) => '\u2248\u20A9725,000'
 *   - formatDisplayCurrency(500, 'JPY', 150) => '\u2248\u00A575,000'
 *   - formatDisplayCurrency(500, 'EUR', 0.93) => '\u2248\u20AC465.00'
 */
export function formatDisplayCurrency(
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

  // Non-USD: prefix with "≈" (approximately)
  return `\u2248${formatted}`;
}

/**
 * Format a rate preview string for Admin Settings currency dropdown.
 *
 * Shows "1 USD = {formatted rate}" for the selected currency.
 *
 * @param rate - Exchange rate (1 USD = rate target currency).
 * @param currencyCode - Target currency code.
 * @returns Preview string. Examples:
 *   - formatRatePreview(1, 'USD') => '1 USD = $1.00'
 *   - formatRatePreview(1450, 'KRW') => '1 USD = \u20A91,450'
 *   - formatRatePreview(150, 'JPY') => '1 USD = \u00A5150'
 */
export function formatRatePreview(
  rate: number,
  currencyCode: string,
): string {
  const decimals = getDecimals(currencyCode);

  const formatted = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currencyCode,
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(rate);

  return `1 USD = ${formatted}`;
}
