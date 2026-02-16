/**
 * Display currency helper for REST API routes.
 *
 * Resolves the display currency code from query param or server setting,
 * and converts USD amounts to the display currency using ForexRateService.
 *
 * @see DISP-07 (v1.5.3 requirement: REST API display_currency query parameter)
 */

import type { IForexRateService, CurrencyCode } from '@waiaas/core';
import { CurrencyCodeSchema, formatDisplayCurrency } from '@waiaas/core';
import type { SettingsService } from '../../infrastructure/settings/settings-service.js';

/**
 * Resolve the display currency code from query param or server setting.
 * Returns null if currency code is invalid.
 */
export function resolveDisplayCurrencyCode(
  queryCurrency: string | undefined,
  settingsService?: SettingsService,
): CurrencyCode | null {
  const raw = queryCurrency ?? settingsService?.get('display.currency') ?? 'USD';
  const parsed = CurrencyCodeSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

/**
 * Fetch the forex rate for a given currency code.
 * Returns the rate number, or null if unavailable.
 */
export async function fetchDisplayRate(
  currencyCode: CurrencyCode | null,
  forexRateService?: IForexRateService,
): Promise<number | null> {
  if (!currencyCode || currencyCode === 'USD' || !forexRateService) return null;
  try {
    const rate = await forexRateService.getRate(currencyCode);
    return rate?.rate ?? null;
  } catch {
    return null;
  }
}

/**
 * Convert a USD amount to display currency string.
 * Returns null if conversion is not possible.
 */
export function toDisplayAmount(
  amountUsd: number | null | undefined,
  currencyCode: CurrencyCode | null,
  displayRate: number | null,
): string | null {
  if (amountUsd == null || currencyCode == null) return null;
  if (currencyCode === 'USD') return `$${amountUsd.toFixed(2)}`;
  if (displayRate == null) return null;
  return formatDisplayCurrency(amountUsd, currencyCode, displayRate);
}
