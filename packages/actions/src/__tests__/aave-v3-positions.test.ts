/**
 * Aave V3 IPositionProvider getPositions() unit tests.
 *
 * Tests cover: ABI encoding helpers (getReservesList, balanceOf, getAssetsPrices),
 * ABI decoding helpers (decodeAddressArray, decodeUint256Array, decodeReserveTokensAddresses),
 * and full getPositions() behavior with mock IRpcCaller.
 *
 * @see LEND-01, LEND-02, LEND-03, LEND-04, TEST-01
 */
import { describe, it, expect, vi } from 'vitest';
import { AaveV3LendingProvider } from '../providers/aave-v3/index.js';
import {
  AAVE_SELECTORS,
  encodeGetReservesListCalldata,
  encodeBalanceOfCalldata,
  encodeGetAssetsPricesCalldata,
  encodeGetReserveTokensAddressesCalldata,
} from '../providers/aave-v3/aave-contracts.js';
import {
  decodeAddressArray,
  decodeUint256Array,
  decodeReserveTokensAddresses,
  type IRpcCaller,
} from '../providers/aave-v3/aave-rpc.js';
import { AAVE_V3_ADDRESSES } from '../providers/aave-v3/config.js';
import { addressToHex } from '../common/contract-encoding.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const WALLET_ADDRESS = '0x1234567890123456789012345678901234567890';
const ASSET_A = '0xaAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAa';
const ASSET_B = '0xbBbBBBBbbBBBbbbBbbBbbbbBBbBbbbbBbBbbBBbB';
const A_TOKEN_A = '0x1111111111111111111111111111111111111111';
const V_DEBT_TOKEN_A = '0x2222222222222222222222222222222222222222';
const S_DEBT_TOKEN_A = '0x3333333333333333333333333333333333333333';
const A_TOKEN_B = '0x4444444444444444444444444444444444444444';
const V_DEBT_TOKEN_B = '0x5555555555555555555555555555555555555555';
const S_DEBT_TOKEN_B = '0x6666666666666666666666666666666666666666';

/** Encode a list of addresses into ABI-encoded dynamic array response. */
function encodeAddressArrayResponse(addresses: string[]): string {
  // offset (32 bytes) + length (32 bytes) + N * address (32 bytes each)
  const offset = '0'.repeat(62) + '20'; // 0x20 = 32
  const length = addresses.length.toString(16).padStart(64, '0');
  const items = addresses.map((a) => a.slice(2).toLowerCase().padStart(64, '0')).join('');
  return '0x' + offset + length + items;
}

/** Encode a list of uint256 into ABI-encoded dynamic array response. */
function encodeUint256ArrayResponse(values: bigint[]): string {
  const offset = '0'.repeat(62) + '20';
  const length = values.length.toString(16).padStart(64, '0');
  const items = values.map((v) => v.toString(16).padStart(64, '0')).join('');
  return '0x' + offset + length + items;
}

/** Encode 3 addresses as consecutive 32-byte slots (getReserveTokensAddresses response). */
function encodeThreeAddresses(addr1: string, addr2: string, addr3: string): string {
  return '0x' +
    addr1.slice(2).toLowerCase().padStart(64, '0') +
    addr2.slice(2).toLowerCase().padStart(64, '0') +
    addr3.slice(2).toLowerCase().padStart(64, '0');
}

/** Build getUserAccountData response (6 x uint256). */
function encodeUserAccountData(opts: {
  totalCollateralBase: bigint;
  totalDebtBase: bigint;
  availableBorrowsBase: bigint;
  currentLiquidationThreshold: bigint;
  ltv: bigint;
  healthFactor: bigint;
}): string {
  return '0x' +
    opts.totalCollateralBase.toString(16).padStart(64, '0') +
    opts.totalDebtBase.toString(16).padStart(64, '0') +
    opts.availableBorrowsBase.toString(16).padStart(64, '0') +
    opts.currentLiquidationThreshold.toString(16).padStart(64, '0') +
    opts.ltv.toString(16).padStart(64, '0') +
    opts.healthFactor.toString(16).padStart(64, '0');
}

/** Build getReserveData response (5 x uint256 minimum). */
function encodeReserveData(opts: {
  unbacked?: bigint;
  liquidityIndex: bigint;
  variableBorrowIndex: bigint;
  liquidityRate: bigint;
  variableBorrowRate: bigint;
}): string {
  const unbacked = opts.unbacked ?? 0n;
  return '0x' +
    unbacked.toString(16).padStart(64, '0') +
    opts.liquidityIndex.toString(16).padStart(64, '0') +
    opts.variableBorrowIndex.toString(16).padStart(64, '0') +
    opts.liquidityRate.toString(16).padStart(64, '0') +
    opts.variableBorrowRate.toString(16).padStart(64, '0');
}

// ---------------------------------------------------------------------------
// ABI encoding tests
// ---------------------------------------------------------------------------

describe('Aave V3 ABI encoding helpers', () => {
  it('Test 1: encodeGetReservesListCalldata returns selector 0xd1946dbc (no args)', () => {
    expect(encodeGetReservesListCalldata()).toBe('0xd1946dbc');
  });

  it('Test 2: encodeBalanceOfCalldata returns 0x70a08231 + padded address', () => {
    const result = encodeBalanceOfCalldata(WALLET_ADDRESS);
    expect(result).toMatch(/^0x70a08231/);
    expect(result.length).toBe(2 + 8 + 64); // 0x + selector + 32 bytes
    expect(result).toContain(WALLET_ADDRESS.slice(2).toLowerCase());
  });

  it('Test 3: encodeGetAssetsPricesCalldata returns encoded ABI for Oracle.getAssetsPrices(address[])', () => {
    const result = encodeGetAssetsPricesCalldata([ASSET_A, ASSET_B]);
    expect(result).toMatch(/^0x9d23d9f2/);
    // selector(4) + offset(32) + length(32) + 2 addresses(64 each) = 4 + 32 + 32 + 64 = 132 bytes = 264 hex chars
    expect(result.length).toBe(2 + 8 + 64 + 64 + 64 + 64); // 0x + selector + offset + length + 2 addrs
  });
});

// ---------------------------------------------------------------------------
// ABI decoding tests
// ---------------------------------------------------------------------------

describe('Aave V3 ABI decoding helpers', () => {
  it('Test 4: decodeAddressArray correctly parses dynamic array of addresses', () => {
    const hex = encodeAddressArrayResponse([ASSET_A, ASSET_B]);
    const addresses = decodeAddressArray(hex);
    expect(addresses).toHaveLength(2);
    expect(addresses[0]!.toLowerCase()).toBe(ASSET_A.toLowerCase());
    expect(addresses[1]!.toLowerCase()).toBe(ASSET_B.toLowerCase());
  });

  it('Test 5: decodeUint256Array correctly parses dynamic array of uint256', () => {
    const values = [100000000n, 200000000n]; // 8 decimals: $1, $2
    const hex = encodeUint256ArrayResponse(values);
    const result = decodeUint256Array(hex);
    expect(result).toHaveLength(2);
    expect(result[0]).toBe(100000000n);
    expect(result[1]).toBe(200000000n);
  });
});

// ---------------------------------------------------------------------------
// getPositions() tests
// ---------------------------------------------------------------------------

describe('AaveV3LendingProvider.getPositions()', () => {
  function createMockRpcCaller(handlers: Record<string, string>): IRpcCaller {
    return {
      call: vi.fn().mockImplementation(async (params: { to: string; data: string }) => {
        const to = params.to.toLowerCase();
        const selector = params.data.slice(0, 10);
        const key = `${to}:${selector}`;

        // Try exact match first, then fallback patterns
        if (handlers[key]) return handlers[key];

        // balanceOf calls may be to various token addresses
        if (selector === '0x70a08231') {
          const balanceKey = `${to}:balanceOf`;
          if (handlers[balanceKey]) return handlers[balanceKey];
          return '0x' + '0'.repeat(64); // default zero balance
        }

        // getReserveTokensAddresses calls
        if (selector === '0xd2493b6c') {
          const assetHex = '0x' + params.data.slice(34); // extract asset from calldata
          const tokenKey = `tokens:${assetHex.slice(0, 42).toLowerCase()}`;
          if (handlers[tokenKey]) return handlers[tokenKey];
        }

        // getReserveData calls
        if (selector === '0x35ea6a75') {
          if (handlers['reserveData']) return handlers['reserveData'];
        }

        return '0x' + '0'.repeat(64);
      }),
    };
  }

  const ethMainAddresses = AAVE_V3_ADDRESSES['ethereum-mainnet']!;

  it('Test 6: getPositions with 1 supply (aToken balance > 0) returns SUPPLY position with APY, CAIP-19 assetId, amountUsd', async () => {
    const balance1e18 = '0x' + (10n ** 18n).toString(16).padStart(64, '0');
    const priceUsd = 200000000000n; // $2000 in 8 decimals

    const handlers: Record<string, string> = {
      // Pool.getReservesList() -> [ASSET_A]
      [`${ethMainAddresses.pool.toLowerCase()}:0xd1946dbc`]: encodeAddressArrayResponse([ASSET_A]),
      // Oracle.getAssetsPrices() -> [$2000]
      [`${ethMainAddresses.oracle.toLowerCase()}:0x9d23d9f2`]: encodeUint256ArrayResponse([priceUsd]),
      // Pool.getUserAccountData()
      [`${ethMainAddresses.pool.toLowerCase()}:0xbf92857c`]: encodeUserAccountData({
        totalCollateralBase: 200000000000n, // $2000
        totalDebtBase: 0n,
        availableBorrowsBase: 160000000000n,
        currentLiquidationThreshold: 8250n,
        ltv: 8000n,
        healthFactor: BigInt('115792089237316195423570985008687907853269984665640564039457584007913129639935'), // max uint256 (no debt)
      }),
      // PoolDataProvider.getReserveTokensAddresses(ASSET_A)
      [`tokens:${ASSET_A.toLowerCase()}`]: encodeThreeAddresses(A_TOKEN_A, S_DEBT_TOKEN_A, V_DEBT_TOKEN_A),
      // aToken balanceOf -> 1e18
      [`${A_TOKEN_A.toLowerCase()}:balanceOf`]: balance1e18,
      // variableDebtToken balanceOf -> 0
      [`${V_DEBT_TOKEN_A.toLowerCase()}:balanceOf`]: '0x' + '0'.repeat(64),
      // getReserveData for APY
      reserveData: encodeReserveData({
        liquidityIndex: 10n ** 27n, // 1.0 in ray
        variableBorrowIndex: 10n ** 27n,
        liquidityRate: 35n * 10n ** 24n, // ~3.5% APY in ray
        variableBorrowRate: 50n * 10n ** 24n,
      }),
    };

    const provider = new AaveV3LendingProvider({}, createMockRpcCaller(handlers));
    const positions = await provider.getPositions(WALLET_ADDRESS);

    expect(positions).toHaveLength(1);
    expect(positions[0]!.category).toBe('LENDING');
    expect(positions[0]!.provider).toBe('aave_v3');
    expect(positions[0]!.metadata.positionType).toBe('SUPPLY');
    expect(positions[0]!.metadata.apy).toBeGreaterThan(0);
    expect(positions[0]!.assetId).toContain('eip155:1/erc20:');
    expect(positions[0]!.amountUsd).toBeGreaterThan(0);
    expect(positions[0]!.status).toBe('ACTIVE');
  });

  it('Test 7: getPositions with 1 borrow (debtToken balance > 0) returns BORROW position with interestRateMode, APY', async () => {
    const balance1e18 = '0x' + (10n ** 18n).toString(16).padStart(64, '0');
    const priceUsd = 100000000n; // $1 in 8 decimals (stablecoin)

    const handlers: Record<string, string> = {
      [`${ethMainAddresses.pool.toLowerCase()}:0xd1946dbc`]: encodeAddressArrayResponse([ASSET_A]),
      [`${ethMainAddresses.oracle.toLowerCase()}:0x9d23d9f2`]: encodeUint256ArrayResponse([priceUsd]),
      [`${ethMainAddresses.pool.toLowerCase()}:0xbf92857c`]: encodeUserAccountData({
        totalCollateralBase: 200000000000n,
        totalDebtBase: 100000000000n,
        availableBorrowsBase: 60000000000n,
        currentLiquidationThreshold: 8250n,
        ltv: 8000n,
        healthFactor: 1_650_000_000_000_000_000n, // 1.65
      }),
      [`tokens:${ASSET_A.toLowerCase()}`]: encodeThreeAddresses(A_TOKEN_A, S_DEBT_TOKEN_A, V_DEBT_TOKEN_A),
      // aToken balanceOf -> 0
      [`${A_TOKEN_A.toLowerCase()}:balanceOf`]: '0x' + '0'.repeat(64),
      // variableDebtToken balanceOf -> 1e18
      [`${V_DEBT_TOKEN_A.toLowerCase()}:balanceOf`]: balance1e18,
      reserveData: encodeReserveData({
        liquidityIndex: 10n ** 27n,
        variableBorrowIndex: 10n ** 27n,
        liquidityRate: 20n * 10n ** 24n,
        variableBorrowRate: 50n * 10n ** 24n, // ~5% APY
      }),
    };

    const provider = new AaveV3LendingProvider({}, createMockRpcCaller(handlers));
    const positions = await provider.getPositions(WALLET_ADDRESS);

    expect(positions).toHaveLength(1);
    expect(positions[0]!.metadata.positionType).toBe('BORROW');
    expect(positions[0]!.metadata.interestRateMode).toBe('variable');
    expect(positions[0]!.metadata.apy).toBeGreaterThan(0);
  });

  it('Test 8: getPositions includes healthFactor from getUserAccountData in metadata', async () => {
    const balance1e18 = '0x' + (10n ** 18n).toString(16).padStart(64, '0');
    const priceUsd = 200000000000n;

    const handlers: Record<string, string> = {
      [`${ethMainAddresses.pool.toLowerCase()}:0xd1946dbc`]: encodeAddressArrayResponse([ASSET_A]),
      [`${ethMainAddresses.oracle.toLowerCase()}:0x9d23d9f2`]: encodeUint256ArrayResponse([priceUsd]),
      [`${ethMainAddresses.pool.toLowerCase()}:0xbf92857c`]: encodeUserAccountData({
        totalCollateralBase: 400000000000n,
        totalDebtBase: 200000000000n,
        availableBorrowsBase: 120000000000n,
        currentLiquidationThreshold: 8250n,
        ltv: 8000n,
        healthFactor: 1_650_000_000_000_000_000n, // 1.65
      }),
      [`tokens:${ASSET_A.toLowerCase()}`]: encodeThreeAddresses(A_TOKEN_A, S_DEBT_TOKEN_A, V_DEBT_TOKEN_A),
      [`${A_TOKEN_A.toLowerCase()}:balanceOf`]: balance1e18,
      [`${V_DEBT_TOKEN_A.toLowerCase()}:balanceOf`]: '0x' + '0'.repeat(64),
      reserveData: encodeReserveData({
        liquidityIndex: 10n ** 27n,
        variableBorrowIndex: 10n ** 27n,
        liquidityRate: 35n * 10n ** 24n,
        variableBorrowRate: 50n * 10n ** 24n,
      }),
    };

    const provider = new AaveV3LendingProvider({}, createMockRpcCaller(handlers));
    const positions = await provider.getPositions(WALLET_ADDRESS);

    expect(positions).toHaveLength(1);
    expect(positions[0]!.metadata.healthFactor).toBeCloseTo(1.65, 1);
  });

  it('Test 9: getPositions with no positions (all balances 0) returns []', async () => {
    const handlers: Record<string, string> = {
      [`${ethMainAddresses.pool.toLowerCase()}:0xd1946dbc`]: encodeAddressArrayResponse([ASSET_A]),
      [`${ethMainAddresses.oracle.toLowerCase()}:0x9d23d9f2`]: encodeUint256ArrayResponse([100000000n]),
      [`${ethMainAddresses.pool.toLowerCase()}:0xbf92857c`]: encodeUserAccountData({
        totalCollateralBase: 0n,
        totalDebtBase: 0n,
        availableBorrowsBase: 0n,
        currentLiquidationThreshold: 0n,
        ltv: 0n,
        healthFactor: BigInt('115792089237316195423570985008687907853269984665640564039457584007913129639935'),
      }),
      [`tokens:${ASSET_A.toLowerCase()}`]: encodeThreeAddresses(A_TOKEN_A, S_DEBT_TOKEN_A, V_DEBT_TOKEN_A),
      // All balances zero (default)
      reserveData: encodeReserveData({
        liquidityIndex: 10n ** 27n,
        variableBorrowIndex: 10n ** 27n,
        liquidityRate: 0n,
        variableBorrowRate: 0n,
      }),
    };

    const provider = new AaveV3LendingProvider({}, createMockRpcCaller(handlers));
    const positions = await provider.getPositions(WALLET_ADDRESS);

    expect(positions).toEqual([]);
  });

  it('Test 10: getPositions without rpcCaller returns []', async () => {
    const provider = new AaveV3LendingProvider({});
    const positions = await provider.getPositions(WALLET_ADDRESS);
    expect(positions).toEqual([]);
  });

  it('Test 11: getPositions uses Oracle getAssetsPrices for USD conversion (amountUsd is non-null)', async () => {
    const balance1e18 = '0x' + (10n ** 18n).toString(16).padStart(64, '0');
    const ethPrice = 200000000000n; // $2000 in 8 decimals
    const usdcPrice = 100000000n; // $1 in 8 decimals

    const handlers: Record<string, string> = {
      [`${ethMainAddresses.pool.toLowerCase()}:0xd1946dbc`]: encodeAddressArrayResponse([ASSET_A, ASSET_B]),
      [`${ethMainAddresses.oracle.toLowerCase()}:0x9d23d9f2`]: encodeUint256ArrayResponse([ethPrice, usdcPrice]),
      [`${ethMainAddresses.pool.toLowerCase()}:0xbf92857c`]: encodeUserAccountData({
        totalCollateralBase: 200000000000n,
        totalDebtBase: 100000000000n,
        availableBorrowsBase: 60000000000n,
        currentLiquidationThreshold: 8250n,
        ltv: 8000n,
        healthFactor: 1_650_000_000_000_000_000n,
      }),
      [`tokens:${ASSET_A.toLowerCase()}`]: encodeThreeAddresses(A_TOKEN_A, S_DEBT_TOKEN_A, V_DEBT_TOKEN_A),
      [`tokens:${ASSET_B.toLowerCase()}`]: encodeThreeAddresses(A_TOKEN_B, S_DEBT_TOKEN_B, V_DEBT_TOKEN_B),
      [`${A_TOKEN_A.toLowerCase()}:balanceOf`]: balance1e18, // 1 ETH supplied
      [`${V_DEBT_TOKEN_A.toLowerCase()}:balanceOf`]: '0x' + '0'.repeat(64),
      [`${A_TOKEN_B.toLowerCase()}:balanceOf`]: '0x' + '0'.repeat(64),
      [`${V_DEBT_TOKEN_B.toLowerCase()}:balanceOf`]: balance1e18, // 1 USDC-like borrowed
      reserveData: encodeReserveData({
        liquidityIndex: 10n ** 27n,
        variableBorrowIndex: 10n ** 27n,
        liquidityRate: 35n * 10n ** 24n,
        variableBorrowRate: 50n * 10n ** 24n,
      }),
    };

    const provider = new AaveV3LendingProvider({}, createMockRpcCaller(handlers));
    const positions = await provider.getPositions(WALLET_ADDRESS);

    expect(positions).toHaveLength(2); // 1 supply + 1 borrow
    const supply = positions.find((p) => p.metadata.positionType === 'SUPPLY');
    const borrow = positions.find((p) => p.metadata.positionType === 'BORROW');
    expect(supply).toBeDefined();
    expect(borrow).toBeDefined();
    expect(supply!.amountUsd).toBeGreaterThan(0); // ETH price $2000
    expect(borrow!.amountUsd).toBeGreaterThan(0); // USDC price $1
  });
});
