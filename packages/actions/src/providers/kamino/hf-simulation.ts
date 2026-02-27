/**
 * Kamino Health Factor simulation functions.
 *
 * Pure functions for calculating and simulating Kamino health factor changes.
 * Unlike Aave (bigint 18-decimal precision), Kamino SDK provides USD values
 * as floats, so number arithmetic is used. This is safe because HF threshold
 * comparisons happen at the 0.01 precision level (e.g., 1.20 vs 1.05).
 *
 * Used by KaminoLendingProvider to guard borrow/withdraw actions against
 * self-liquidation risk (KPROV-08).
 */

// ---------------------------------------------------------------------------
// Threshold constants
// ---------------------------------------------------------------------------

/** HF at liquidation (1.0). Below this, the position can be liquidated. */
export const KAMINO_LIQUIDATION_THRESHOLD = 1.0;

/** Default HF warning threshold (configurable via Admin Settings). */
export const KAMINO_DEFAULT_HF_THRESHOLD = 1.2;

// ---------------------------------------------------------------------------
// calculateHealthFactor
// ---------------------------------------------------------------------------

/**
 * Calculate health factor from Kamino obligation data.
 *
 * HF = (totalCollateralUsd * weightedLiqThreshold) / totalDebtUsd
 * When totalDebt is 0, returns Infinity.
 *
 * @param totalCollateralUsd - Total collateral in USD
 * @param totalDebtUsd - Total debt in USD
 * @param weightedLiqThreshold - Weighted liquidation threshold (default 0.85)
 * @returns Health factor as a number
 */
export function calculateHealthFactor(
  totalCollateralUsd: number,
  totalDebtUsd: number,
  weightedLiqThreshold: number = 0.85,
): number {
  if (totalDebtUsd <= 0) return Infinity;
  return (totalCollateralUsd * weightedLiqThreshold) / totalDebtUsd;
}

// ---------------------------------------------------------------------------
// simulateKaminoHealthFactor
// ---------------------------------------------------------------------------

/**
 * Simulate health factor after a borrow or withdraw action.
 *
 * @param obligation - Current obligation summary (collateral/debt in USD)
 * @param action - 'borrow' (increases debt) or 'withdraw' (decreases collateral)
 * @param amountUsd - Amount in USD terms (approximate, for simulation)
 * @param threshold - HF threshold to check against (default: KAMINO_LIQUIDATION_THRESHOLD)
 * @returns Simulation result with safe flag, simulated HF, and threshold
 */
export function simulateKaminoHealthFactor(
  obligation: { totalCollateralUsd: number; totalDebtUsd: number },
  action: 'borrow' | 'withdraw',
  amountUsd: number,
  threshold: number = KAMINO_LIQUIDATION_THRESHOLD,
): { safe: boolean; simulatedHf: number; threshold: number } {
  let collateral = obligation.totalCollateralUsd;
  let debt = obligation.totalDebtUsd;

  if (action === 'borrow') {
    debt += amountUsd;
  } else {
    collateral -= amountUsd;
  }

  const simulatedHf = calculateHealthFactor(collateral, debt);
  return {
    safe: simulatedHf >= threshold,
    simulatedHf,
    threshold,
  };
}

// ---------------------------------------------------------------------------
// hfToStatus
// ---------------------------------------------------------------------------

/**
 * Convert a health factor value to a status string.
 *
 * @param hf - Health factor value
 * @returns Status: 'safe' (>= 2.0), 'warning' (>= 1.5), 'danger' (>= 1.2), 'critical' (< 1.2)
 */
export function hfToStatus(hf: number): 'safe' | 'warning' | 'danger' | 'critical' {
  if (hf >= 2.0) return 'safe';
  if (hf >= 1.5) return 'warning';
  if (hf >= 1.2) return 'danger';
  return 'critical';
}
