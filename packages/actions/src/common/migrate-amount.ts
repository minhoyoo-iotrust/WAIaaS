/**
 * Backward-compatible amount migration helper.
 *
 * During the transition from human-readable to smallest-unit inputs,
 * this helper detects legacy decimal inputs and auto-converts them
 * while emitting a deprecation warning. Pure integer strings (smallest-unit)
 * are passed through as BigInt without conversion.
 *
 * Used by providers migrating from parseTokenAmount() to direct BigInt input.
 */
import { parseTokenAmount } from './amount-parser.js';

/**
 * Migrate an amount string to BigInt, with backward compatibility for decimal inputs.
 *
 * - If `value` contains a decimal point: converts via parseTokenAmount() + deprecation warning
 * - If `value` is a pure integer string: converts directly to BigInt (smallest-unit passthrough)
 *
 * @param value - Amount string (smallest-unit integer or legacy decimal)
 * @param decimals - Token decimals (e.g., 18 for ETH, 6 for USDC, 9 for SOL)
 * @returns Amount in smallest unit as bigint
 */
export function migrateAmount(value: string, decimals: number): bigint {
  if (value.includes('.')) {
    console.warn(
      `[WAIaaS DEPRECATION] Amount "${value}" contains decimal point. This will be rejected in a future version. Please provide amounts in smallest units (e.g., wei/lamports).`,
    );
    return parseTokenAmount(value, decimals);
  }

  return BigInt(value);
}
