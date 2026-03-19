/**
 * Aave V3 RPC response decoders, health factor simulation, and APY conversion.
 *
 * Pure functions operating on hex strings and bigints -- no actual RPC calls here.
 * The IRpcCaller interface is the injection point for real RPC or mock in tests.
 *
 * IMPORTANT: All health factor threshold comparisons use bigint arithmetic.
 * Never convert to Number for safety-critical HF checks (Research Flag C2).
 */
import { MAX_UINT256 } from './aave-contracts.js';

// ---------------------------------------------------------------------------
// IRpcCaller interface (dependency injection point)
// ---------------------------------------------------------------------------

/**
 * Lightweight RPC caller interface for read-only eth_call operations.
 * Implementations wrap viem PublicClient or mock in tests.
 */
export interface IRpcCaller {
  call(params: { to: string; data: string; chainId?: number }): Promise<string>;
}

// ---------------------------------------------------------------------------
// UserAccountData type (decoded from getUserAccountData response)
// ---------------------------------------------------------------------------

export interface UserAccountData {
  /** Total collateral in base currency (8 decimals, USD). */
  totalCollateralBase: bigint;
  /** Total debt in base currency (8 decimals, USD). */
  totalDebtBase: bigint;
  /** Available borrows in base currency (8 decimals, USD). */
  availableBorrowsBase: bigint;
  /** Current liquidation threshold in basis points (e.g., 8250 = 82.5%). */
  currentLiquidationThreshold: bigint;
  /** Loan-to-value ratio in basis points (e.g., 8000 = 80%). */
  ltv: bigint;
  /** Health factor with 18 decimal precision (1e18 = HF 1.0). */
  healthFactor: bigint;
}

// ---------------------------------------------------------------------------
// ReserveData type (simplified -- only fields needed for APY)
// ---------------------------------------------------------------------------

export interface ReserveData {
  /** Current supply rate in ray units (1e27). */
  liquidityRate: bigint;
  /** Current variable borrow rate in ray units (1e27). */
  variableBorrowRate: bigint;
  /** Liquidity index in ray units. */
  liquidityIndex: bigint;
  /** Variable borrow index in ray units. */
  variableBorrowIndex: bigint;
}

// ---------------------------------------------------------------------------
// ReserveTokensAddresses type (decoded from getReserveTokensAddresses response)
// ---------------------------------------------------------------------------

export interface ReserveTokensAddresses {
  aToken: string;
  stableDebtToken: string;
  variableDebtToken: string;
}

// ---------------------------------------------------------------------------
// decodeAddressArray -- parse ABI-encoded dynamic address[] response
// ---------------------------------------------------------------------------

/**
 * Decode ABI-encoded dynamic address[] response.
 *
 * Layout: offset(32 bytes) + length(32 bytes) + N * address(32 bytes each)
 *
 * @param hexResponse - Raw hex response from eth_call (with or without 0x prefix)
 * @returns Array of checksummed addresses (0x-prefixed, lowercase)
 */
export function decodeAddressArray(hexResponse: string): string[] {
  const data = hexResponse.startsWith('0x') ? hexResponse.slice(2) : hexResponse;
  if (data.length < 128) return []; // at least offset + length

  // offset is at chars 0..64 (skip it)
  const length = Number(BigInt('0x' + data.slice(64, 128)));
  const addresses: string[] = [];

  for (let i = 0; i < length; i++) {
    const start = 128 + i * 64;
    const slot = data.slice(start, start + 64);
    addresses.push('0x' + slot.slice(24)); // last 20 bytes = 40 hex chars
  }

  return addresses;
}

// ---------------------------------------------------------------------------
// decodeUint256Array -- parse ABI-encoded dynamic uint256[] response
// ---------------------------------------------------------------------------

/**
 * Decode ABI-encoded dynamic uint256[] response.
 *
 * Same layout as address array but values are full 32-byte uint256.
 *
 * @param hexResponse - Raw hex response from eth_call (with or without 0x prefix)
 * @returns Array of bigint values
 */
export function decodeUint256Array(hexResponse: string): bigint[] {
  const data = hexResponse.startsWith('0x') ? hexResponse.slice(2) : hexResponse;
  if (data.length < 128) return [];

  const length = Number(BigInt('0x' + data.slice(64, 128)));
  const values: bigint[] = [];

  for (let i = 0; i < length; i++) {
    const start = 128 + i * 64;
    const slot = data.slice(start, start + 64);
    values.push(BigInt('0x' + slot));
  }

  return values;
}

// ---------------------------------------------------------------------------
// decodeReserveTokensAddresses -- parse 3 consecutive address slots
// ---------------------------------------------------------------------------

/**
 * Decode PoolDataProvider.getReserveTokensAddresses() response.
 *
 * Returns 3 addresses: (aTokenAddress, stableDebtTokenAddress, variableDebtTokenAddress)
 *
 * @param hexResponse - Raw hex response from eth_call
 */
export function decodeReserveTokensAddresses(hexResponse: string): ReserveTokensAddresses {
  const data = hexResponse.startsWith('0x') ? hexResponse.slice(2) : hexResponse;

  if (data.length < 192) {
    throw new Error(
      `Invalid getReserveTokensAddresses response: expected at least 192 hex chars (3 x 32 bytes), got ${data.length}`,
    );
  }

  return {
    aToken: '0x' + data.slice(24, 64),
    stableDebtToken: '0x' + data.slice(88, 128),
    variableDebtToken: '0x' + data.slice(152, 192),
  };
}

// ---------------------------------------------------------------------------
// decodeDecimals -- parse ERC-20 decimals() uint8 response
// ---------------------------------------------------------------------------

/**
 * Decode ERC-20 decimals() response.
 *
 * Returns a uint8 value encoded as a 32-byte ABI slot. We read only the
 * relevant byte (last byte of the 32-byte slot = first byte of the uint8).
 *
 * @param hex - Raw hex response from eth_call (with or without 0x prefix)
 * @returns Token decimal places as a number (e.g. 18, 6, 8)
 */
export function decodeDecimals(hex: string): number {
  const data = hex.startsWith('0x') ? hex.slice(2) : hex;
  return parseInt(data.slice(0, 64), 16);
}

// ---------------------------------------------------------------------------
// Health factor threshold constants (18-decimal bigints)
// ---------------------------------------------------------------------------

/** Health factor at liquidation threshold (1.0 in 18 decimals). */
export const LIQUIDATION_THRESHOLD_HF = 1_000_000_000_000_000_000n;

/** Health factor warning threshold (1.2 in 18 decimals). */
export const WARNING_THRESHOLD_HF = 1_200_000_000_000_000_000n;

// ---------------------------------------------------------------------------
// decodeGetUserAccountData -- parse 6 x uint256 from hex response
// ---------------------------------------------------------------------------

/**
 * Decode Pool.getUserAccountData() response.
 *
 * Returns 6 uint256 values:
 * [0] totalCollateralBase (8 decimals, base currency = USD)
 * [1] totalDebtBase (8 decimals)
 * [2] availableBorrowsBase (8 decimals)
 * [3] currentLiquidationThreshold (basis points)
 * [4] ltv (basis points)
 * [5] healthFactor (18 decimals)
 *
 * @param hexResponse - Raw hex response from eth_call (with or without 0x prefix)
 * @throws Error if hex string is too short
 */
export function decodeGetUserAccountData(hexResponse: string): UserAccountData {
  const data = hexResponse.startsWith('0x') ? hexResponse.slice(2) : hexResponse;

  if (data.length < 384) {
    throw new Error(
      `Invalid getUserAccountData response: expected at least 384 hex chars (6 x 32 bytes), got ${data.length}`,
    );
  }

  return {
    totalCollateralBase: BigInt('0x' + data.slice(0, 64)),
    totalDebtBase: BigInt('0x' + data.slice(64, 128)),
    availableBorrowsBase: BigInt('0x' + data.slice(128, 192)),
    currentLiquidationThreshold: BigInt('0x' + data.slice(192, 256)),
    ltv: BigInt('0x' + data.slice(256, 320)),
    healthFactor: BigInt('0x' + data.slice(320, 384)),
  };
}

// ---------------------------------------------------------------------------
// decodeGetReserveData -- extract rate fields from hex response
// ---------------------------------------------------------------------------

/**
 * Decode PoolDataProvider.getReserveData() response (simplified).
 *
 * Extracts only the fields needed for APY calculation:
 * - [1] liquidityIndex (index 1 = chars 64..128)
 * - [2] variableBorrowIndex (index 2 = chars 128..192)
 * - [3] currentLiquidityRate (index 3 = chars 192..256)
 * - [4] currentVariableBorrowRate (index 4 = chars 256..320)
 *
 * @param hexResponse - Raw hex response from eth_call (with or without 0x prefix)
 * @throws Error if hex string is too short
 */
export function decodeGetReserveData(hexResponse: string): ReserveData {
  const data = hexResponse.startsWith('0x') ? hexResponse.slice(2) : hexResponse;

  if (data.length < 320) {
    throw new Error(
      `Invalid getReserveData response: expected at least 320 hex chars (5 x 32 bytes), got ${data.length}`,
    );
  }

  return {
    liquidityIndex: BigInt('0x' + data.slice(64, 128)),
    variableBorrowIndex: BigInt('0x' + data.slice(128, 192)),
    liquidityRate: BigInt('0x' + data.slice(192, 256)),
    variableBorrowRate: BigInt('0x' + data.slice(256, 320)),
  };
}

// ---------------------------------------------------------------------------
// rayToApy -- convert ray (1e27) rate to decimal APY
// ---------------------------------------------------------------------------

/**
 * Convert Aave V3 ray-unit rate to decimal APY.
 *
 * Linear approximation: rate / 1e27 (good enough for display at typical DeFi rates).
 * Returns as decimal (e.g., 0.035 for 3.5% APY).
 *
 * @param rayRate - Rate in ray units (1e27)
 */
export function rayToApy(rayRate: bigint): number {
  return Number(rayRate) / 1e27;
}

// ---------------------------------------------------------------------------
// simulateHealthFactor -- pre-action HF estimation
// ---------------------------------------------------------------------------

/**
 * Simulate health factor after a borrow or withdraw action.
 *
 * Uses bigint-only arithmetic for precision (Research Flag C2).
 * Returns MAX_UINT256 when newTotalDebt is 0 (no debt = infinite HF).
 *
 * @param currentData - Current position data from getUserAccountData
 * @param action - 'borrow' or 'withdraw'
 * @param amountBase - Amount in base currency (8 decimals, USD)
 * @returns Simulated health factor as 18-decimal bigint
 */
export function simulateHealthFactor(
  currentData: {
    totalCollateralBase: bigint;
    totalDebtBase: bigint;
    currentLiquidationThreshold: bigint;
  },
  action: 'borrow' | 'withdraw',
  amountBase: bigint,
): bigint {
  let collateral = currentData.totalCollateralBase;
  let newTotalDebt = currentData.totalDebtBase;

  if (action === 'borrow') {
    newTotalDebt = currentData.totalDebtBase + amountBase;
  } else {
    // withdraw reduces collateral
    collateral = currentData.totalCollateralBase - amountBase;
  }

  const collateralThresholdAdjusted =
    (collateral * currentData.currentLiquidationThreshold) / 10000n;

  if (newTotalDebt === 0n) {
    return MAX_UINT256;
  }

  return (collateralThresholdAdjusted * 10n ** 18n) / newTotalDebt;
}

// ---------------------------------------------------------------------------
// hfToNumber -- convert 18-decimal bigint HF to display number
// ---------------------------------------------------------------------------

/**
 * Convert 18-decimal bigint health factor to a display number.
 *
 * This is ONLY for API display responses, NOT for threshold comparisons.
 * Use bigint comparisons (e.g., hf >= LIQUIDATION_THRESHOLD_HF) for safety checks.
 *
 * @param hf - Health factor as 18-decimal bigint
 */
export function hfToNumber(hf: bigint): number {
  return Number(hf) / 1e18;
}
