/**
 * Resolve humanAmount variants in provider params.
 *
 * Phase 405: Provides a shared helper for converting human-readable amount
 * inputs (e.g., "1.5" ETH) to smallest-unit strings (e.g., "1500000000000000000" wei)
 * in Action Provider resolve() methods.
 *
 * Each provider defines its own humanAmount field name (e.g., humanAmount,
 * humanSellAmount, humanAmountIn) matching its original amount field name.
 */
import { parseAmount } from '@waiaas/core';

/**
 * Resolve a humanAmount variant in provider input params.
 *
 * If `humanAmountField` is present in params, converts its value to smallest-unit
 * using `decimals` and sets the result on `amountField`. Removes the humanAmount
 * and decimals fields from params. Mutates params in place.
 *
 * @param params - Provider input params (will be mutated)
 * @param amountField - Original amount field name (e.g., 'amount', 'sellAmount', 'fromAmount')
 * @param humanAmountField - Human amount field name (e.g., 'humanAmount', 'humanSellAmount')
 * @param decimalsField - Field name for decimals (default: 'decimals')
 */
export function resolveProviderHumanAmount(
  params: Record<string, unknown>,
  amountField: string,
  humanAmountField: string,
  decimalsField: string = 'decimals',
): void {
  const humanValue = params[humanAmountField];
  if (typeof humanValue !== 'string' || humanValue.length === 0) {
    return; // No humanAmount provided, use existing amount
  }

  const decimals = params[decimalsField];
  if (typeof decimals !== 'number' || !Number.isInteger(decimals) || decimals < 0) {
    throw new Error(
      `${decimalsField} is required (integer >= 0) when using ${humanAmountField}`,
    );
  }

  // Convert human-readable to smallest-unit
  params[amountField] = parseAmount(humanValue, decimals).toString();

  // Remove humanAmount and decimals fields (not part of original schema)
  delete params[humanAmountField];
  delete params[decimalsField];
}
