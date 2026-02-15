/**
 * Forex Rate types and interfaces (Zod SSoT).
 *
 * Defines CurrencyCode, ForexRate, and IForexRateService for the
 * v1.5.3 display currency subsystem. This is SEPARATE from IPriceOracle
 * (crypto vs forex concern separation -- tech decision #10).
 *
 * IForexRateService.getRate() returns null on failure (graceful fallback).
 * Caller should display USD when rate is unavailable.
 */
import { z } from 'zod';

// ---------------------------------------------------------------------------
// Zod SSoT: CurrencyCode (43 fiat currencies)
// ---------------------------------------------------------------------------

/** 43 supported fiat currency codes for display currency. */
export const CurrencyCodeSchema = z.enum([
  'USD', 'KRW', 'JPY', 'EUR', 'GBP', 'CNY', 'CAD', 'AUD', 'CHF', 'SGD',
  'HKD', 'INR', 'TWD', 'THB', 'MYR', 'IDR', 'PHP', 'VND', 'BRL', 'MXN',
  'CLP', 'TRY', 'PLN', 'CZK', 'HUF', 'SEK', 'NOK', 'DKK', 'NZD', 'ZAR',
  'ILS', 'SAR', 'AED', 'KWD', 'BHD', 'NGN', 'RUB', 'UAH', 'PKR', 'BDT',
  'LKR', 'MMK', 'GEL',
]);

/** Fiat currency code type. Derived from CurrencyCodeSchema via z.infer. */
export type CurrencyCode = z.infer<typeof CurrencyCodeSchema>;

// ---------------------------------------------------------------------------
// Zod SSoT: ForexRate
// ---------------------------------------------------------------------------

/** Forex rate from USD to a target fiat currency. */
export const ForexRateSchema = z.object({
  /** Source currency (always USD). */
  from: z.literal('USD'),
  /** Target currency code. */
  to: CurrencyCodeSchema,
  /** Exchange rate (1 USD = rate target currency). Positive number. */
  rate: z.number().positive(),
  /** Data source: 'coingecko' (fresh from API) or 'cache' (from cache). */
  source: z.enum(['coingecko', 'cache']),
  /** Unix timestamp (ms) when rate was fetched. */
  fetchedAt: z.number().int().positive(),
  /** Unix timestamp (ms) when this rate expires. */
  expiresAt: z.number().int().positive(),
});

/** Forex rate data. Derived from ForexRateSchema via z.infer. */
export type ForexRate = z.infer<typeof ForexRateSchema>;

// ---------------------------------------------------------------------------
// IForexRateService interface
// ---------------------------------------------------------------------------

/**
 * Forex rate service contract.
 *
 * Separate from IPriceOracle (crypto prices). Provides USD -> fiat
 * currency exchange rates for display currency conversion.
 *
 * Implementation: ForexRateService (uses CoinGeckoForexProvider + InMemoryPriceCache).
 *
 * Graceful fallback: getRate() returns null on failure (caller shows USD).
 */
export interface IForexRateService {
  /** Get exchange rate from USD to target currency. Returns null on failure. */
  getRate(to: CurrencyCode): Promise<ForexRate | null>;
  /** Get exchange rates for multiple currencies. Missing rates are omitted. */
  getRates(currencies: CurrencyCode[]): Promise<Map<CurrencyCode, ForexRate>>;
}
