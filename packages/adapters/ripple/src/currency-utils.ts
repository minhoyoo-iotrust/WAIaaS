/**
 * XRPL Currency Code utilities for Trust Line tokens.
 *
 * Handles 3-char ISO currency codes (e.g., "USD", "EUR") and
 * 40-char hex currency codes (non-standard tokens).
 * IOU tokens have up to 15 significant digits of precision.
 */

import { ChainError } from '@waiaas/core';

/** XRPL IOU tokens have up to 15 significant digits. */
export const IOU_DECIMALS = 15;

const MULTIPLIER_CACHE = new Map<number, bigint>();

function getMultiplier(decimals: number): bigint {
  let cached = MULTIPLIER_CACHE.get(decimals);
  if (!cached) {
    cached = 10n ** BigInt(decimals);
    MULTIPLIER_CACHE.set(decimals, cached);
  }
  return cached;
}

/**
 * Validate an XRPL currency code.
 * Accepts:
 * - 3-character ISO codes (letters only, not "XRP" which is reserved)
 * - 40-character hex codes (uppercase hex digits)
 */
export function isValidCurrencyCode(code: string): boolean {
  if (!code || typeof code !== 'string') return false;

  // 3-char ISO code: letters only, not "XRP"
  if (code.length === 3) {
    if (!/^[A-Za-z]{3}$/.test(code)) return false;
    if (code.toUpperCase() === 'XRP') return false;
    return true;
  }

  // 40-char hex code
  if (code.length === 40) {
    return /^[0-9A-Fa-f]{40}$/.test(code);
  }

  return false;
}

/**
 * Normalize a currency code to uppercase.
 * 3-char codes: uppercase. 40-char hex: uppercase.
 */
export function normalizeCurrencyCode(code: string): string {
  return code.toUpperCase();
}

/**
 * Parse a Trust Line token address in "{currency}.{issuer}" format.
 * @throws ChainError('INVALID_INSTRUCTION') if format is invalid
 */
export function parseTrustLineToken(tokenAddress: string): { currency: string; issuer: string } {
  if (!tokenAddress || typeof tokenAddress !== 'string') {
    throw new ChainError('INVALID_INSTRUCTION', 'ripple', {
      message: `Invalid Trust Line token address: ${tokenAddress}`,
    });
  }

  const dotIndex = tokenAddress.indexOf('.');
  if (dotIndex === -1 || dotIndex === 0 || dotIndex === tokenAddress.length - 1) {
    throw new ChainError('INVALID_INSTRUCTION', 'ripple', {
      message: `Invalid Trust Line token address format. Expected "{currency}.{issuer}", got: ${tokenAddress}`,
    });
  }

  const currency = tokenAddress.slice(0, dotIndex);
  const issuer = tokenAddress.slice(dotIndex + 1);

  if (!currency || !issuer) {
    throw new ChainError('INVALID_INSTRUCTION', 'ripple', {
      message: `Invalid Trust Line token address: empty currency or issuer in ${tokenAddress}`,
    });
  }

  return { currency: normalizeCurrencyCode(currency), issuer };
}

/**
 * Convert a decimal string value to bigint in smallest unit.
 * Example: "100.5" with 15 decimals -> 100_500_000_000_000_000n
 */
export function iouToSmallestUnit(value: string, decimals: number): bigint {
  const trimmed = value.trim();
  if (trimmed === '' || trimmed === '0') return 0n;

  const isNegative = trimmed.startsWith('-');
  const absValue = isNegative ? trimmed.slice(1) : trimmed;

  const parts = absValue.split('.');
  if (parts.length > 2) {
    throw new ChainError('INVALID_INSTRUCTION', 'ripple', {
      message: `Invalid IOU value: ${value}`,
    });
  }

  const wholePart = parts[0] ?? '0';
  const fracPart = (parts[1] ?? '').padEnd(decimals, '0').slice(0, decimals);

  const multiplier = getMultiplier(decimals);
  const whole = BigInt(wholePart) * multiplier;
  const frac = BigInt(fracPart);

  const result = whole + frac;
  return isNegative ? -result : result;
}

/**
 * Convert a bigint in smallest unit back to decimal string.
 * Example: 100_500_000_000_000_000n with 15 decimals -> "100.5"
 */
export function smallestUnitToIou(amount: bigint, decimals: number): string {
  if (amount === 0n) return '0';

  const isNegative = amount < 0n;
  const absAmount = isNegative ? -amount : amount;

  const multiplier = getMultiplier(decimals);
  const wholePart = absAmount / multiplier;
  const fracPart = absAmount % multiplier;

  if (fracPart === 0n) {
    return `${isNegative ? '-' : ''}${wholePart.toString()}`;
  }

  // Pad fractional part and strip trailing zeros
  const fracStr = fracPart.toString().padStart(decimals, '0').replace(/0+$/, '');
  return `${isNegative ? '-' : ''}${wholePart.toString()}.${fracStr}`;
}
