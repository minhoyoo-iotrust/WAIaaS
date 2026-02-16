/**
 * Blockchain amount formatting utilities (NOTE-01).
 *
 * Converts between raw blockchain amounts (bigint, smallest unit like lamports/wei)
 * and human-readable decimal strings. Uses pure bigint arithmetic for precision.
 *
 * @example
 * formatAmount(1_000_000_000n, 9)  // "1" (SOL)
 * formatAmount(1_500_000n, 9)      // "0.0015" (SOL)
 * parseAmount("1.5", 9)            // 1_500_000_000n (lamports)
 */

/**
 * Format a raw blockchain amount (bigint, smallest unit) to human-readable string.
 *
 * @param amount - Raw amount in smallest unit (lamports for SOL, wei for ETH).
 * @param decimals - Number of decimal places (9 for SOL, 18 for ETH, 6 for USDC).
 * @returns Human-readable amount string with trailing zeros trimmed.
 * @throws Error if amount is negative.
 *
 * @example
 * formatAmount(1_000_000_000n, 9) // "1"
 * formatAmount(1_500_000n, 9)     // "0.0015"
 * formatAmount(0n, 9)             // "0"
 * formatAmount(1n, 9)             // "0.000000001"
 */
export function formatAmount(amount: bigint, decimals: number): string {
  if (amount < 0n) {
    throw new Error('Amount must be non-negative');
  }
  if (amount === 0n) return '0';

  const divisor = 10n ** BigInt(decimals);
  const intPart = amount / divisor;
  const fracPart = amount % divisor;

  if (fracPart === 0n) return intPart.toString();

  const fracStr = fracPart.toString().padStart(decimals, '0').replace(/0+$/, '');
  return `${intPart}.${fracStr}`;
}

/**
 * Parse a human-readable amount string to raw bigint (smallest unit).
 *
 * @param amount - Human-readable amount string (e.g. "1.5").
 * @param decimals - Number of decimal places.
 * @returns Raw amount in smallest unit as bigint.
 * @throws Error if amount string is invalid.
 *
 * @example
 * parseAmount("1.5", 9)   // 1_500_000_000n
 * parseAmount("1", 9)     // 1_000_000_000n
 * parseAmount("0.001", 6) // 1_000n
 */
export function parseAmount(amount: string, decimals: number): bigint {
  const parts = amount.split('.');
  const intPart = BigInt(parts[0] || '0');
  const fracStr = (parts[1] || '').padEnd(decimals, '0').slice(0, decimals);
  const fracPart = BigInt(fracStr);
  return intPart * (10n ** BigInt(decimals)) + fracPart;
}
