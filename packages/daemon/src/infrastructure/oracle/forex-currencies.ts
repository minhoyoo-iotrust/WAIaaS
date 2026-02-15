/**
 * Fiat currency metadata for 43 supported display currencies.
 *
 * Used by:
 * - Admin UI: currency dropdown (name, symbol)
 * - Intl.NumberFormat: locale-aware formatting (decimals, locale)
 * - ForexRateService: validation of currency codes
 *
 * Decimals follow ISO 4217:
 * - 0: KRW, JPY, VND, CLP, HUF, PKR
 * - 2: Most currencies (USD, EUR, GBP, ...)
 * - 3: KWD, BHD (1/1000 subunit)
 */

/** Metadata for a fiat currency. */
export interface CurrencyMeta {
  /** ISO 4217 currency code (e.g. 'KRW'). */
  code: string;
  /** English display name (e.g. 'Korean Won'). */
  name: string;
  /** Currency symbol (e.g. '\u20A9'). */
  symbol: string;
  /** Decimal places per ISO 4217 (0, 2, or 3). */
  decimals: number;
  /** Preferred locale for Intl.NumberFormat (e.g. 'ko-KR'). */
  locale: string;
}

/** 43 supported fiat currencies with metadata. Ordered by CurrencyCodeSchema enum. */
export const CURRENCY_META: readonly CurrencyMeta[] = [
  { code: 'USD', name: 'US Dollar', symbol: '$', decimals: 2, locale: 'en-US' },
  { code: 'KRW', name: 'Korean Won', symbol: '\u20A9', decimals: 0, locale: 'ko-KR' },
  { code: 'JPY', name: 'Japanese Yen', symbol: '\u00A5', decimals: 0, locale: 'ja-JP' },
  { code: 'EUR', name: 'Euro', symbol: '\u20AC', decimals: 2, locale: 'de-DE' },
  { code: 'GBP', name: 'British Pound', symbol: '\u00A3', decimals: 2, locale: 'en-GB' },
  { code: 'CNY', name: 'Chinese Yuan', symbol: '\u00A5', decimals: 2, locale: 'zh-CN' },
  { code: 'CAD', name: 'Canadian Dollar', symbol: 'CA$', decimals: 2, locale: 'en-CA' },
  { code: 'AUD', name: 'Australian Dollar', symbol: 'A$', decimals: 2, locale: 'en-AU' },
  { code: 'CHF', name: 'Swiss Franc', symbol: 'CHF', decimals: 2, locale: 'de-CH' },
  { code: 'SGD', name: 'Singapore Dollar', symbol: 'S$', decimals: 2, locale: 'en-SG' },
  { code: 'HKD', name: 'Hong Kong Dollar', symbol: 'HK$', decimals: 2, locale: 'en-HK' },
  { code: 'INR', name: 'Indian Rupee', symbol: '\u20B9', decimals: 2, locale: 'en-IN' },
  { code: 'TWD', name: 'Taiwan Dollar', symbol: 'NT$', decimals: 2, locale: 'zh-TW' },
  { code: 'THB', name: 'Thai Baht', symbol: '\u0E3F', decimals: 2, locale: 'th-TH' },
  { code: 'MYR', name: 'Malaysian Ringgit', symbol: 'RM', decimals: 2, locale: 'ms-MY' },
  { code: 'IDR', name: 'Indonesian Rupiah', symbol: 'Rp', decimals: 2, locale: 'id-ID' },
  { code: 'PHP', name: 'Philippine Peso', symbol: '\u20B1', decimals: 2, locale: 'en-PH' },
  { code: 'VND', name: 'Vietnamese Dong', symbol: '\u20AB', decimals: 0, locale: 'vi-VN' },
  { code: 'BRL', name: 'Brazilian Real', symbol: 'R$', decimals: 2, locale: 'pt-BR' },
  { code: 'MXN', name: 'Mexican Peso', symbol: 'MX$', decimals: 2, locale: 'es-MX' },
  { code: 'CLP', name: 'Chilean Peso', symbol: 'CL$', decimals: 0, locale: 'es-CL' },
  { code: 'TRY', name: 'Turkish Lira', symbol: '\u20BA', decimals: 2, locale: 'tr-TR' },
  { code: 'PLN', name: 'Polish Zloty', symbol: 'z\u0142', decimals: 2, locale: 'pl-PL' },
  { code: 'CZK', name: 'Czech Koruna', symbol: 'K\u010D', decimals: 2, locale: 'cs-CZ' },
  { code: 'HUF', name: 'Hungarian Forint', symbol: 'Ft', decimals: 0, locale: 'hu-HU' },
  { code: 'SEK', name: 'Swedish Krona', symbol: 'kr', decimals: 2, locale: 'sv-SE' },
  { code: 'NOK', name: 'Norwegian Krone', symbol: 'kr', decimals: 2, locale: 'nb-NO' },
  { code: 'DKK', name: 'Danish Krone', symbol: 'kr', decimals: 2, locale: 'da-DK' },
  { code: 'NZD', name: 'New Zealand Dollar', symbol: 'NZ$', decimals: 2, locale: 'en-NZ' },
  { code: 'ZAR', name: 'South African Rand', symbol: 'R', decimals: 2, locale: 'en-ZA' },
  { code: 'ILS', name: 'Israeli Shekel', symbol: '\u20AA', decimals: 2, locale: 'he-IL' },
  { code: 'SAR', name: 'Saudi Riyal', symbol: 'SR', decimals: 2, locale: 'ar-SA' },
  { code: 'AED', name: 'UAE Dirham', symbol: 'AED', decimals: 2, locale: 'ar-AE' },
  { code: 'KWD', name: 'Kuwaiti Dinar', symbol: 'KD', decimals: 3, locale: 'ar-KW' },
  { code: 'BHD', name: 'Bahraini Dinar', symbol: 'BD', decimals: 3, locale: 'ar-BH' },
  { code: 'NGN', name: 'Nigerian Naira', symbol: '\u20A6', decimals: 2, locale: 'en-NG' },
  { code: 'RUB', name: 'Russian Ruble', symbol: '\u20BD', decimals: 2, locale: 'ru-RU' },
  { code: 'UAH', name: 'Ukrainian Hryvnia', symbol: '\u20B4', decimals: 2, locale: 'uk-UA' },
  { code: 'PKR', name: 'Pakistani Rupee', symbol: 'Rs', decimals: 0, locale: 'ur-PK' },
  { code: 'BDT', name: 'Bangladeshi Taka', symbol: '\u09F3', decimals: 2, locale: 'bn-BD' },
  { code: 'LKR', name: 'Sri Lankan Rupee', symbol: 'Rs', decimals: 2, locale: 'si-LK' },
  { code: 'MMK', name: 'Myanmar Kyat', symbol: 'K', decimals: 2, locale: 'my-MM' },
  { code: 'GEL', name: 'Georgian Lari', symbol: '\u20BE', decimals: 2, locale: 'ka-GE' },
] as const;

/** Map from currency code to metadata for O(1) lookup. */
const CURRENCY_MAP = new Map<string, CurrencyMeta>(
  CURRENCY_META.map((c) => [c.code, c]),
);

/**
 * Get metadata for a currency code.
 *
 * @param code - ISO 4217 currency code (e.g. 'KRW').
 * @returns CurrencyMeta or undefined if not supported.
 */
export function getCurrencyMeta(code: string): CurrencyMeta | undefined {
  return CURRENCY_MAP.get(code);
}
