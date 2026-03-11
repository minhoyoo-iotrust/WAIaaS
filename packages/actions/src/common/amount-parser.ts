/**
 * Common token amount parsing utility.
 *
 * Converts human-readable decimal strings (e.g. "100.5") to smallest-unit
 * bigint values based on the token's decimal precision.
 *
 * Consolidates identical implementations previously duplicated across
 * aave-v3, kamino, lido-staking, jito-staking, and hyperliquid providers.
 */
import { ChainError } from '@waiaas/core';

/**
 * Parse a human-readable token amount string to smallest unit (bigint).
 *
 * @param amount - Human-readable amount string (e.g., "100.5")
 * @param decimals - Token decimals (e.g. 18 for ETH, 6 for USDC, 9 for SOL)
 * @returns Amount in smallest unit as bigint
 * @throws ChainError('INVALID_INSTRUCTION') if amount is zero or negative
 */
export function parseTokenAmount(amount: string, decimals: number): bigint {
  const parts = amount.split('.');
  const whole = BigInt(parts[0] || '0');
  const fractional = (parts[1] || '').padEnd(decimals, '0').slice(0, decimals);
  const result = whole * 10n ** BigInt(decimals) + BigInt(fractional);

  if (result <= 0n) {
    throw new ChainError('INVALID_INSTRUCTION', 'evm', {
      message: 'Amount must be greater than 0',
    });
  }

  return result;
}
