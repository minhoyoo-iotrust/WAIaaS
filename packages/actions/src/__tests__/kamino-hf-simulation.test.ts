/**
 * Unit tests for Kamino HF simulation module.
 *
 * Covers: calculateHealthFactor, simulateKaminoHealthFactor, hfToStatus, constants.
 * KPROV-08: HF simulation guard.
 */
import { describe, expect, it } from 'vitest';
import {
  calculateHealthFactor,
  simulateKaminoHealthFactor,
  hfToStatus,
  KAMINO_LIQUIDATION_THRESHOLD,
  KAMINO_DEFAULT_HF_THRESHOLD,
} from '../providers/kamino/hf-simulation.js';

// ---------------------------------------------------------------------------
// calculateHealthFactor
// ---------------------------------------------------------------------------

describe('calculateHealthFactor', () => {
  it('should return Infinity when totalDebtUsd is 0', () => {
    expect(calculateHealthFactor(10_000, 0)).toBe(Infinity);
  });

  it('should return Infinity when totalDebtUsd is negative', () => {
    expect(calculateHealthFactor(10_000, -100)).toBe(Infinity);
  });

  it('should calculate correct HF for typical position', () => {
    // collateral=10000, debt=5000, threshold=0.85 -> HF = (10000 * 0.85) / 5000 = 1.7
    const hf = calculateHealthFactor(10_000, 5_000);
    expect(hf).toBeCloseTo(1.7, 4);
  });

  it('should calculate HF with custom weighted threshold', () => {
    // collateral=10000, debt=5000, threshold=0.75 -> HF = (10000 * 0.75) / 5000 = 1.5
    const hf = calculateHealthFactor(10_000, 5_000, 0.75);
    expect(hf).toBeCloseTo(1.5, 4);
  });

  it('should return < 1.0 when near liquidation', () => {
    // collateral=5000, debt=5000, threshold=0.85 -> HF = (5000 * 0.85) / 5000 = 0.85
    const hf = calculateHealthFactor(5_000, 5_000);
    expect(hf).toBeLessThan(1.0);
    expect(hf).toBeCloseTo(0.85, 4);
  });

  it('should return exactly 0 when collateral is 0 and debt is positive', () => {
    expect(calculateHealthFactor(0, 1_000)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// simulateKaminoHealthFactor
// ---------------------------------------------------------------------------

describe('simulateKaminoHealthFactor', () => {
  const obligation = { totalCollateralUsd: 10_000, totalDebtUsd: 5_000 };

  it('should return lower HF when borrowing increases debt', () => {
    const result = simulateKaminoHealthFactor(obligation, 'borrow', 1_000);
    // Before: (10000 * 0.85) / 5000 = 1.7
    // After:  (10000 * 0.85) / 6000 = 1.4167
    expect(result.simulatedHf).toBeLessThan(1.7);
    expect(result.simulatedHf).toBeCloseTo(1.4167, 3);
  });

  it('should return lower HF when withdrawing decreases collateral', () => {
    const result = simulateKaminoHealthFactor(obligation, 'withdraw', 2_000);
    // After: (8000 * 0.85) / 5000 = 1.36
    expect(result.simulatedHf).toBeLessThan(1.7);
    expect(result.simulatedHf).toBeCloseTo(1.36, 4);
  });

  it('should return safe=true when simulated HF >= threshold', () => {
    const result = simulateKaminoHealthFactor(obligation, 'borrow', 100, 1.0);
    expect(result.safe).toBe(true);
    expect(result.simulatedHf).toBeGreaterThanOrEqual(1.0);
  });

  it('should return safe=false when simulated HF < threshold', () => {
    // Large borrow that pushes HF below 1.0
    const result = simulateKaminoHealthFactor(obligation, 'borrow', 5_000, 1.0);
    // After: (10000 * 0.85) / 10000 = 0.85
    expect(result.safe).toBe(false);
    expect(result.simulatedHf).toBeLessThan(1.0);
  });

  it('should use KAMINO_LIQUIDATION_THRESHOLD as default', () => {
    const result = simulateKaminoHealthFactor(obligation, 'borrow', 100);
    expect(result.threshold).toBe(KAMINO_LIQUIDATION_THRESHOLD);
  });

  it('should handle zero existing debt (new borrow against collateral)', () => {
    const noDebt = { totalCollateralUsd: 10_000, totalDebtUsd: 0 };
    const result = simulateKaminoHealthFactor(noDebt, 'borrow', 1_000);
    // After: (10000 * 0.85) / 1000 = 8.5
    expect(result.simulatedHf).toBeCloseTo(8.5, 4);
    expect(result.safe).toBe(true);
  });

  it('should return safe=true for Infinity HF (zero debt after borrow of 0)', () => {
    const noDebt = { totalCollateralUsd: 10_000, totalDebtUsd: 0 };
    const result = simulateKaminoHealthFactor(noDebt, 'withdraw', 1_000);
    // Debt stays 0, HF = Infinity
    expect(result.simulatedHf).toBe(Infinity);
    expect(result.safe).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// hfToStatus
// ---------------------------------------------------------------------------

describe('hfToStatus', () => {
  it('should return safe for HF >= 2.0', () => {
    expect(hfToStatus(2.0)).toBe('safe');
    expect(hfToStatus(3.5)).toBe('safe');
  });

  it('should return warning for HF in [1.5, 2.0)', () => {
    expect(hfToStatus(1.5)).toBe('warning');
    expect(hfToStatus(1.99)).toBe('warning');
  });

  it('should return danger for HF in [1.2, 1.5)', () => {
    expect(hfToStatus(1.2)).toBe('danger');
    expect(hfToStatus(1.49)).toBe('danger');
  });

  it('should return critical for HF < 1.2', () => {
    expect(hfToStatus(1.19)).toBe('critical');
    expect(hfToStatus(0.5)).toBe('critical');
  });

  it('should return safe for Infinity', () => {
    expect(hfToStatus(Infinity)).toBe('safe');
  });

  it('should return critical for 0', () => {
    expect(hfToStatus(0)).toBe('critical');
  });
});

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

describe('constants', () => {
  it('should have KAMINO_LIQUIDATION_THRESHOLD equal to 1.0', () => {
    expect(KAMINO_LIQUIDATION_THRESHOLD).toBe(1.0);
  });

  it('should have KAMINO_DEFAULT_HF_THRESHOLD equal to 1.2', () => {
    expect(KAMINO_DEFAULT_HF_THRESHOLD).toBe(1.2);
  });
});
