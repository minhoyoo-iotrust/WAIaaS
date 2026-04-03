/**
 * XRPL address utility functions.
 *
 * Handles r-address (classic) and X-address format conversion,
 * drops/XRP unit conversion, and address validation.
 */

import { isValidClassicAddress, isValidXAddress, xAddressToClassicAddress } from 'xrpl';

/** XRP has 6 decimal places. 1 XRP = 1,000,000 drops. */
export const XRP_DECIMALS = 6;
export const DROPS_PER_XRP = 1_000_000n;

/**
 * Detect whether an address is in X-address format.
 * X-addresses start with 'X' (mainnet) or 'T' (testnet).
 */
export function isXAddress(address: string): boolean {
  return isValidXAddress(address);
}

/**
 * Decode an X-address to its classic r-address and optional destination tag.
 * @throws Error if the address is not a valid X-address
 */
export function decodeXAddress(xAddress: string): { classicAddress: string; tag: number | false } {
  const result = xAddressToClassicAddress(xAddress);
  return { classicAddress: result.classicAddress, tag: result.tag };
}

/**
 * Validate a Ripple address (classic r-address or X-address).
 */
export function isValidRippleAddress(address: string): boolean {
  return isValidClassicAddress(address) || isValidXAddress(address);
}

/**
 * Convert drops (bigint) to XRP string with up to 6 decimal places.
 * Example: 1000000n -> "1", 500000n -> "0.5", 1n -> "0.000001"
 */
export function dropsToXrp(drops: bigint): string {
  const isNegative = drops < 0n;
  const absDrops = isNegative ? -drops : drops;
  const wholePart = absDrops / DROPS_PER_XRP;
  const fracPart = absDrops % DROPS_PER_XRP;

  if (fracPart === 0n) {
    return `${isNegative ? '-' : ''}${wholePart.toString()}`;
  }

  // Pad fractional part to 6 digits, then strip trailing zeros
  const fracStr = fracPart.toString().padStart(6, '0').replace(/0+$/, '');
  return `${isNegative ? '-' : ''}${wholePart.toString()}.${fracStr}`;
}

/**
 * Convert XRP string to drops (bigint).
 * Example: "1" -> 1000000n, "0.5" -> 500000n, "0.000001" -> 1n
 */
export function xrpToDrops(xrp: string): bigint {
  const trimmed = xrp.trim();
  if (trimmed === '') throw new Error('Cannot convert empty string to drops');

  const parts = trimmed.split('.');
  if (parts.length > 2) throw new Error(`Invalid XRP value: ${xrp}`);

  const wholePart = parts[0] ?? '0';
  const fracPart = (parts[1] ?? '').padEnd(6, '0').slice(0, 6);

  const whole = BigInt(wholePart) * DROPS_PER_XRP;
  const frac = BigInt(fracPart);

  return trimmed.startsWith('-') ? -((-whole) + frac) : whole + frac;
}
