/**
 * Unit tests for Aave V3 RPC response decoders, HF simulation, and APY conversion.
 *
 * Covers: decodeGetUserAccountData, decodeGetReserveData, simulateHealthFactor,
 * rayToApy, hfToNumber, threshold constants.
 */
import { describe, expect, it } from 'vitest';
import {
  decodeGetUserAccountData,
  decodeGetReserveData,
  simulateHealthFactor,
  rayToApy,
  hfToNumber,
  LIQUIDATION_THRESHOLD_HF,
  WARNING_THRESHOLD_HF,
} from '../providers/aave-v3/aave-rpc.js';
import { MAX_UINT256 } from '../providers/aave-v3/aave-contracts.js';

// ---------------------------------------------------------------------------
// Helper: build hex response from known values
// ---------------------------------------------------------------------------

function buildUserAccountDataHex(values: bigint[]): string {
  return '0x' + values.map((v) => v.toString(16).padStart(64, '0')).join('');
}

function buildReserveDataHex(values: bigint[]): string {
  return '0x' + values.map((v) => v.toString(16).padStart(64, '0')).join('');
}

// ---------------------------------------------------------------------------
// decodeGetUserAccountData
// ---------------------------------------------------------------------------

describe('decodeGetUserAccountData', () => {
  const totalCollateralBase = 100_000_000_000n;        // 1000 USD (8 decimals)
  const totalDebtBase = 50_000_000_000n;               // 500 USD
  const availableBorrowsBase = 30_000_000_000n;        // 300 USD
  const currentLiquidationThreshold = 8250n;           // 82.5%
  const ltv = 8000n;                                   // 80%
  const healthFactor = 1_650_000_000_000_000_000n;     // 1.65

  const hexResponse = buildUserAccountDataHex([
    totalCollateralBase,
    totalDebtBase,
    availableBorrowsBase,
    currentLiquidationThreshold,
    ltv,
    healthFactor,
  ]);

  it('should decode all 6 fields correctly', () => {
    const result = decodeGetUserAccountData(hexResponse);
    expect(result.totalCollateralBase).toBe(totalCollateralBase);
    expect(result.totalDebtBase).toBe(totalDebtBase);
    expect(result.availableBorrowsBase).toBe(availableBorrowsBase);
    expect(result.currentLiquidationThreshold).toBe(currentLiquidationThreshold);
    expect(result.ltv).toBe(ltv);
    expect(result.healthFactor).toBe(healthFactor);
  });

  it('should work with 0x prefix', () => {
    const result = decodeGetUserAccountData(hexResponse);
    expect(result.totalCollateralBase).toBe(totalCollateralBase);
  });

  it('should work without 0x prefix', () => {
    const hexWithoutPrefix = hexResponse.slice(2);
    const result = decodeGetUserAccountData(hexWithoutPrefix);
    expect(result.totalCollateralBase).toBe(totalCollateralBase);
  });

  it('should throw for too-short hex string', () => {
    expect(() => decodeGetUserAccountData('0x1234')).toThrow('Invalid getUserAccountData response');
  });

  it('should decode zero values correctly', () => {
    const zeroHex = buildUserAccountDataHex([0n, 0n, 0n, 0n, 0n, 0n]);
    const result = decodeGetUserAccountData(zeroHex);
    expect(result.totalCollateralBase).toBe(0n);
    expect(result.healthFactor).toBe(0n);
  });
});

// ---------------------------------------------------------------------------
// decodeGetReserveData
// ---------------------------------------------------------------------------

describe('decodeGetReserveData', () => {
  // Positions: [0]=unused, [1]=liquidityIndex, [2]=variableBorrowIndex,
  //            [3]=liquidityRate, [4]=variableBorrowRate
  const unused = 0n;
  const liquidityIndex = 1_000_000_000_000_000_000_000_000_000n;   // 1.0 in ray
  const variableBorrowIndex = 1_050_000_000_000_000_000_000_000_000n; // 1.05 in ray
  const liquidityRate = 35_000_000_000_000_000_000_000_000n;       // 3.5% in ray
  const variableBorrowRate = 50_000_000_000_000_000_000_000_000n;  // 5.0% in ray

  const hexResponse = buildReserveDataHex([
    unused,
    liquidityIndex,
    variableBorrowIndex,
    liquidityRate,
    variableBorrowRate,
  ]);

  it('should decode liquidityRate correctly', () => {
    const result = decodeGetReserveData(hexResponse);
    expect(result.liquidityRate).toBe(liquidityRate);
  });

  it('should decode variableBorrowRate correctly', () => {
    const result = decodeGetReserveData(hexResponse);
    expect(result.variableBorrowRate).toBe(variableBorrowRate);
  });

  it('should decode liquidityIndex correctly', () => {
    const result = decodeGetReserveData(hexResponse);
    expect(result.liquidityIndex).toBe(liquidityIndex);
  });

  it('should decode variableBorrowIndex correctly', () => {
    const result = decodeGetReserveData(hexResponse);
    expect(result.variableBorrowIndex).toBe(variableBorrowIndex);
  });

  it('should throw for too-short hex string', () => {
    expect(() => decodeGetReserveData('0x1234')).toThrow('Invalid getReserveData response');
  });
});

// ---------------------------------------------------------------------------
// simulateHealthFactor
// ---------------------------------------------------------------------------

describe('simulateHealthFactor', () => {
  const baseData = {
    totalCollateralBase: 100_000_00_000_000n,  // 100000 USD (8 decimals)
    totalDebtBase: 50_000_00_000_000n,          // 50000 USD
    currentLiquidationThreshold: 8250n,         // 82.5%
  };

  it('should simulate borrow correctly', () => {
    // borrow 10000 USD -> newDebt = 60000
    // collateral * threshold / 10000 = 100000e8 * 8250 / 10000 = 82500e8
    // HF = 82500e8 * 1e18 / 60000e8 = 1375000000000000000 (1.375)
    const result = simulateHealthFactor(baseData, 'borrow', 10_000_00_000_000n);
    expect(result).toBe(1_375_000_000_000_000_000n);
  });

  it('should detect liquidation risk from excessive borrow', () => {
    // borrow 40000 -> newDebt = 90000
    // HF = 82500e8 * 1e18 / 90000e8 = 916666666666666666 (~0.917) -- below 1.0
    const result = simulateHealthFactor(baseData, 'borrow', 40_000_00_000_000n);
    expect(result < LIQUIDATION_THRESHOLD_HF).toBe(true);
  });

  it('should simulate withdraw correctly', () => {
    // withdraw 20000 -> newCollateral = 80000
    // collateral * threshold = 80000e8 * 8250 / 10000 = 66000e8
    // HF = 66000e8 * 1e18 / 50000e8 = 1320000000000000000 (1.32)
    const result = simulateHealthFactor(baseData, 'withdraw', 20_000_00_000_000n);
    expect(result).toBe(1_320_000_000_000_000_000n);
  });

  it('should return MAX_UINT256 when newTotalDebt is 0', () => {
    const zeroDebtData = {
      ...baseData,
      totalDebtBase: 0n,
    };
    const result = simulateHealthFactor(zeroDebtData, 'borrow', 0n);
    expect(result).toBe(MAX_UINT256);
  });

  it('should use bigint-only arithmetic (no Number conversion)', () => {
    // This test verifies precision is maintained for large values
    const largeCollateral = 999_999_999_999_00_000_000n; // very large
    const largeDebt = 500_000_000_000_00_000_000n;
    const result = simulateHealthFactor(
      { totalCollateralBase: largeCollateral, totalDebtBase: largeDebt, currentLiquidationThreshold: 8250n },
      'borrow',
      100_000_000_00_000_000n,
    );
    // Result should be a bigint
    expect(typeof result).toBe('bigint');
    expect(result > 0n).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// rayToApy
// ---------------------------------------------------------------------------

describe('rayToApy', () => {
  it('should return 0 for zero rate', () => {
    expect(rayToApy(0n)).toBe(0);
  });

  it('should convert 3.5% rate correctly', () => {
    // 0.035 * 1e27 = 35_000_000_000_000_000_000_000_000
    const ray = 35_000_000_000_000_000_000_000_000n;
    const apy = rayToApy(ray);
    expect(apy).toBeCloseTo(0.035, 5);
  });

  it('should handle large rates', () => {
    // 15% = 0.15 * 1e27
    const ray = 150_000_000_000_000_000_000_000_000n;
    const apy = rayToApy(ray);
    expect(apy).toBeCloseTo(0.15, 5);
  });
});

// ---------------------------------------------------------------------------
// hfToNumber
// ---------------------------------------------------------------------------

describe('hfToNumber', () => {
  it('should convert 1.0 HF correctly', () => {
    expect(hfToNumber(1_000_000_000_000_000_000n)).toBe(1.0);
  });

  it('should convert 1.5 HF correctly', () => {
    expect(hfToNumber(1_500_000_000_000_000_000n)).toBe(1.5);
  });

  it('should handle MAX_UINT256 as very large number', () => {
    const result = hfToNumber(MAX_UINT256);
    // MAX_UINT256 / 1e18 is an extremely large number (may be Infinity or finite depending on JS engine)
    expect(result).toBeGreaterThan(1e50);
  });
});

// ---------------------------------------------------------------------------
// Threshold constants
// ---------------------------------------------------------------------------

describe('threshold constants', () => {
  it('should have LIQUIDATION_THRESHOLD_HF = 1e18 exactly', () => {
    expect(LIQUIDATION_THRESHOLD_HF).toBe(10n ** 18n);
  });

  it('should have WARNING_THRESHOLD_HF = 1.2e18 exactly', () => {
    expect(WARNING_THRESHOLD_HF).toBe(1_200_000_000_000_000_000n);
    // Verify: 1.2 * 10^18
    expect(WARNING_THRESHOLD_HF).toBe(12n * 10n ** 17n);
  });

  it('should satisfy WARNING > LIQUIDATION', () => {
    expect(WARNING_THRESHOLD_HF > LIQUIDATION_THRESHOLD_HF).toBe(true);
  });
});
