/**
 * Aave V3 IPositionProvider getPositions() unit tests.
 *
 * Tests cover: ABI encoding helpers (getReservesList, balanceOf, getAssetsPrices),
 * ABI decoding helpers (decodeAddressArray, decodeUint256Array, decodeReserveTokensAddresses),
 * and full getPositions() behavior with mock IRpcCaller.
 *
 * @see LEND-01, LEND-02, LEND-03, LEND-04, TEST-01
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { PositionQueryContext } from '@waiaas/core';
import { AaveV3LendingProvider } from '../providers/aave-v3/index.js';
import {
  encodeGetReservesListCalldata,
  encodeBalanceOfCalldata,
  encodeGetAssetsPricesCalldata,
} from '../providers/aave-v3/aave-contracts.js';
import {
  decodeAddressArray,
  decodeUint256Array,
} from '../providers/aave-v3/aave-rpc.js';
import { AAVE_V3_ADDRESSES } from '../providers/aave-v3/config.js';

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

const MOCK_ETH_RPC = 'https://mock-eth-rpc.example.com';

/** Build an ethereum PositionQueryContext for testing. */
function makeEvmCtx(walletId: string = WALLET_ADDRESS, chain: 'ethereum' | 'solana' = 'ethereum'): PositionQueryContext {
  return {
    walletId,
    walletAddress: walletId,
    chain,
    networks: chain === 'ethereum' ? ['ethereum-mainnet'] : ['solana-mainnet'],
    environment: 'mainnet',
    rpcUrls: chain === 'ethereum' ? { 'ethereum-mainnet': MOCK_ETH_RPC } : {},
  };
}

describe('AaveV3LendingProvider.getPositions()', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  /**
   * Setup fetch mock to respond to JSON-RPC eth_call requests
   * based on the same handler pattern used previously with IRpcCaller.
   */
  function setupFetchHandlers(handlers: Record<string, string>): void {
    fetchMock.mockImplementation(async (_url: string, opts: { body: string }) => {
      const body = JSON.parse(opts.body);
      const to = (body.params?.[0]?.to as string)?.toLowerCase() ?? '';
      const data = body.params?.[0]?.data as string ?? '';
      const selector = data.slice(0, 10);
      const key = `${to}:${selector}`;

      let result = '0x' + '0'.repeat(64);

      if (handlers[key]) {
        result = handlers[key];
      } else if (selector === '0x70a08231') {
        const balanceKey = `${to}:balanceOf`;
        if (handlers[balanceKey]) result = handlers[balanceKey];
      } else if (selector === '0xd2493b6c') {
        const assetHex = '0x' + data.slice(34);
        const tokenKey = `tokens:${assetHex.slice(0, 42).toLowerCase()}`;
        if (handlers[tokenKey]) result = handlers[tokenKey];
      } else if (selector === '0x35ea6a75') {
        if (handlers['reserveData']) result = handlers['reserveData'];
      }

      return new Response(JSON.stringify({ jsonrpc: '2.0', id: 1, result }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    });
  }

  const ethMainAddresses = AAVE_V3_ADDRESSES['ethereum-mainnet']!;

  it('Test 6: getPositions with 1 supply (aToken balance > 0) returns SUPPLY position with APY, CAIP-19 assetId, amountUsd', async () => {
    const balance1e18 = '0x' + (10n ** 18n).toString(16).padStart(64, '0');
    const priceUsd = 200000000000n; // $2000 in 8 decimals

    setupFetchHandlers({
      [`${ethMainAddresses.pool.toLowerCase()}:0xd1946dbc`]: encodeAddressArrayResponse([ASSET_A]),
      [`${ethMainAddresses.oracle.toLowerCase()}:0x9d23d9f2`]: encodeUint256ArrayResponse([priceUsd]),
      [`${ethMainAddresses.pool.toLowerCase()}:0xbf92857c`]: encodeUserAccountData({
        totalCollateralBase: 200000000000n,
        totalDebtBase: 0n,
        availableBorrowsBase: 160000000000n,
        currentLiquidationThreshold: 8250n,
        ltv: 8000n,
        healthFactor: BigInt('115792089237316195423570985008687907853269984665640564039457584007913129639935'),
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
    });

    const provider = new AaveV3LendingProvider({});
    const positions = await provider.getPositions(makeEvmCtx());

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

    setupFetchHandlers({
      [`${ethMainAddresses.pool.toLowerCase()}:0xd1946dbc`]: encodeAddressArrayResponse([ASSET_A]),
      [`${ethMainAddresses.oracle.toLowerCase()}:0x9d23d9f2`]: encodeUint256ArrayResponse([100000000n]),
      [`${ethMainAddresses.pool.toLowerCase()}:0xbf92857c`]: encodeUserAccountData({
        totalCollateralBase: 200000000000n,
        totalDebtBase: 100000000000n,
        availableBorrowsBase: 60000000000n,
        currentLiquidationThreshold: 8250n,
        ltv: 8000n,
        healthFactor: 1_650_000_000_000_000_000n,
      }),
      [`tokens:${ASSET_A.toLowerCase()}`]: encodeThreeAddresses(A_TOKEN_A, S_DEBT_TOKEN_A, V_DEBT_TOKEN_A),
      [`${A_TOKEN_A.toLowerCase()}:balanceOf`]: '0x' + '0'.repeat(64),
      [`${V_DEBT_TOKEN_A.toLowerCase()}:balanceOf`]: balance1e18,
      reserveData: encodeReserveData({
        liquidityIndex: 10n ** 27n,
        variableBorrowIndex: 10n ** 27n,
        liquidityRate: 20n * 10n ** 24n,
        variableBorrowRate: 50n * 10n ** 24n,
      }),
    });

    const provider = new AaveV3LendingProvider({});
    const positions = await provider.getPositions(makeEvmCtx());

    expect(positions).toHaveLength(1);
    expect(positions[0]!.metadata.positionType).toBe('BORROW');
    expect(positions[0]!.metadata.interestRateMode).toBe('variable');
    expect(positions[0]!.metadata.apy).toBeGreaterThan(0);
  });

  it('Test 8: getPositions includes healthFactor from getUserAccountData in metadata', async () => {
    const balance1e18 = '0x' + (10n ** 18n).toString(16).padStart(64, '0');

    setupFetchHandlers({
      [`${ethMainAddresses.pool.toLowerCase()}:0xd1946dbc`]: encodeAddressArrayResponse([ASSET_A]),
      [`${ethMainAddresses.oracle.toLowerCase()}:0x9d23d9f2`]: encodeUint256ArrayResponse([200000000000n]),
      [`${ethMainAddresses.pool.toLowerCase()}:0xbf92857c`]: encodeUserAccountData({
        totalCollateralBase: 400000000000n,
        totalDebtBase: 200000000000n,
        availableBorrowsBase: 120000000000n,
        currentLiquidationThreshold: 8250n,
        ltv: 8000n,
        healthFactor: 1_650_000_000_000_000_000n,
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
    });

    const provider = new AaveV3LendingProvider({});
    const positions = await provider.getPositions(makeEvmCtx());

    expect(positions).toHaveLength(1);
    expect(positions[0]!.metadata.healthFactor).toBeCloseTo(1.65, 1);
  });

  it('Test 9: getPositions with no positions (all balances 0) returns []', async () => {
    setupFetchHandlers({
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
      reserveData: encodeReserveData({
        liquidityIndex: 10n ** 27n,
        variableBorrowIndex: 10n ** 27n,
        liquidityRate: 0n,
        variableBorrowRate: 0n,
      }),
    });

    const provider = new AaveV3LendingProvider({});
    const positions = await provider.getPositions(makeEvmCtx());

    expect(positions).toEqual([]);
  });

  it('Test 10: getPositions with no rpcUrls returns []', async () => {
    const provider = new AaveV3LendingProvider({});
    const ctx: PositionQueryContext = {
      walletId: WALLET_ADDRESS,
      walletAddress: WALLET_ADDRESS,
      chain: 'ethereum',
      networks: ['ethereum-mainnet'],
      environment: 'mainnet',
      rpcUrls: {},
    };
    const positions = await provider.getPositions(ctx);
    expect(positions).toEqual([]);
  });

  it('Test 11: getPositions uses Oracle getAssetsPrices for USD conversion (amountUsd is non-null)', async () => {
    const balance1e18 = '0x' + (10n ** 18n).toString(16).padStart(64, '0');

    setupFetchHandlers({
      [`${ethMainAddresses.pool.toLowerCase()}:0xd1946dbc`]: encodeAddressArrayResponse([ASSET_A, ASSET_B]),
      [`${ethMainAddresses.oracle.toLowerCase()}:0x9d23d9f2`]: encodeUint256ArrayResponse([200000000000n, 100000000n]),
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
      [`${A_TOKEN_A.toLowerCase()}:balanceOf`]: balance1e18,
      [`${V_DEBT_TOKEN_A.toLowerCase()}:balanceOf`]: '0x' + '0'.repeat(64),
      [`${A_TOKEN_B.toLowerCase()}:balanceOf`]: '0x' + '0'.repeat(64),
      [`${V_DEBT_TOKEN_B.toLowerCase()}:balanceOf`]: balance1e18,
      reserveData: encodeReserveData({
        liquidityIndex: 10n ** 27n,
        variableBorrowIndex: 10n ** 27n,
        liquidityRate: 35n * 10n ** 24n,
        variableBorrowRate: 50n * 10n ** 24n,
      }),
    });

    const provider = new AaveV3LendingProvider({});
    const positions = await provider.getPositions(makeEvmCtx());

    expect(positions).toHaveLength(2);
    const supply = positions.find((p) => p.metadata.positionType === 'SUPPLY');
    const borrow = positions.find((p) => p.metadata.positionType === 'BORROW');
    expect(supply).toBeDefined();
    expect(borrow).toBeDefined();
    expect(supply!.amountUsd).toBeGreaterThan(0);
    expect(borrow!.amountUsd).toBeGreaterThan(0);
  });

  it('Test 12: getPositions returns [] for solana wallet (chain guard)', async () => {
    const provider = new AaveV3LendingProvider({});
    const positions = await provider.getPositions(makeEvmCtx(WALLET_ADDRESS, 'solana'));
    expect(positions).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Multichain getPositions tests (MCHN-02)
// ---------------------------------------------------------------------------

describe('AaveV3LendingProvider Multichain Positions', () => {
  const ETH_RPC = 'https://eth-rpc.example.com';
  const BASE_RPC = 'https://base-rpc.example.com';

  function rpcResult(hexValue: string): Response {
    return new Response(JSON.stringify({ jsonrpc: '2.0', id: 1, result: hexValue }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  function makeMultiCtx(opts?: {
    networks?: string[];
    environment?: 'mainnet' | 'testnet';
  }): PositionQueryContext {
    return {
      walletId: WALLET_ADDRESS,
      walletAddress: WALLET_ADDRESS,
      chain: 'ethereum',
      networks: (opts?.networks ?? ['ethereum-mainnet', 'base-mainnet']) as any,
      environment: opts?.environment ?? 'mainnet',
      rpcUrls: {
        'ethereum-mainnet': ETH_RPC,
        'base-mainnet': BASE_RPC,
      },
    };
  }

  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('Test 13: queries positions from multiple networks with correct CAIP-19 assetIds', async () => {
    const balance1e18 = '0x' + (10n ** 18n).toString(16).padStart(64, '0');

    // Mock fetch to respond based on rpcUrl
    fetchMock.mockImplementation(async (_url: string, opts: { body: string }) => {
      const body = JSON.parse(opts.body);
      const calldata = body.params?.[0]?.data as string;

      // getReservesList -> 1 asset
      if (calldata?.startsWith('0xd1946dbc')) {
        return rpcResult(encodeAddressArrayResponse([ASSET_A]));
      }
      // getAssetsPrices
      if (calldata?.startsWith('0x9d23d9f2')) {
        return rpcResult(encodeUint256ArrayResponse([200000000000n]));
      }
      // getUserAccountData
      if (calldata?.startsWith('0xbf92857c')) {
        return rpcResult(encodeUserAccountData({
          totalCollateralBase: 200000000000n,
          totalDebtBase: 0n,
          availableBorrowsBase: 160000000000n,
          currentLiquidationThreshold: 8250n,
          ltv: 8000n,
          healthFactor: BigInt('115792089237316195423570985008687907853269984665640564039457584007913129639935'),
        }));
      }
      // getReserveTokensAddresses
      if (calldata?.startsWith('0xd2493b6c')) {
        return rpcResult(encodeThreeAddresses(A_TOKEN_A, S_DEBT_TOKEN_A, V_DEBT_TOKEN_A));
      }
      // balanceOf for aToken -> 1e18
      if (calldata?.startsWith('0x70a08231')) {
        const to = (body.params?.[0]?.to as string)?.toLowerCase();
        if (to === A_TOKEN_A.toLowerCase()) return rpcResult(balance1e18);
        return rpcResult('0x' + '0'.repeat(64));
      }
      // getReserveData
      if (calldata?.startsWith('0x35ea6a75')) {
        return rpcResult(encodeReserveData({
          liquidityIndex: 10n ** 27n,
          variableBorrowIndex: 10n ** 27n,
          liquidityRate: 35n * 10n ** 24n,
          variableBorrowRate: 50n * 10n ** 24n,
        }));
      }
      return rpcResult('0x' + '0'.repeat(64));
    });

    const provider = new AaveV3LendingProvider({});
    const positions = await provider.getPositions(makeMultiCtx());

    // Should have positions from both networks
    expect(positions.length).toBeGreaterThanOrEqual(2);

    const ethPositions = positions.filter(p => p.network === 'ethereum-mainnet');
    const basePositions = positions.filter(p => p.network === 'base-mainnet');

    expect(ethPositions.length).toBeGreaterThan(0);
    expect(basePositions.length).toBeGreaterThan(0);

    // Check CAIP-19 prefixes
    for (const p of ethPositions) {
      expect(p.assetId).toContain('eip155:1/erc20:');
    }
    for (const p of basePositions) {
      expect(p.assetId).toContain('eip155:8453/erc20:');
    }
  });

  it('Test 14: single network RPC failure returns positions from other networks', async () => {
    const balance1e18 = '0x' + (10n ** 18n).toString(16).padStart(64, '0');

    fetchMock.mockImplementation(async (url: string, opts: { body: string }) => {
      // Base RPC fails
      if (url === BASE_RPC) throw new Error('Base RPC down');

      const body = JSON.parse(opts.body);
      const calldata = body.params?.[0]?.data as string;

      if (calldata?.startsWith('0xd1946dbc')) {
        return rpcResult(encodeAddressArrayResponse([ASSET_A]));
      }
      if (calldata?.startsWith('0x9d23d9f2')) {
        return rpcResult(encodeUint256ArrayResponse([200000000000n]));
      }
      if (calldata?.startsWith('0xbf92857c')) {
        return rpcResult(encodeUserAccountData({
          totalCollateralBase: 200000000000n,
          totalDebtBase: 0n,
          availableBorrowsBase: 160000000000n,
          currentLiquidationThreshold: 8250n,
          ltv: 8000n,
          healthFactor: BigInt('115792089237316195423570985008687907853269984665640564039457584007913129639935'),
        }));
      }
      if (calldata?.startsWith('0xd2493b6c')) {
        return rpcResult(encodeThreeAddresses(A_TOKEN_A, S_DEBT_TOKEN_A, V_DEBT_TOKEN_A));
      }
      if (calldata?.startsWith('0x70a08231')) {
        const to = (body.params?.[0]?.to as string)?.toLowerCase();
        if (to === A_TOKEN_A.toLowerCase()) return rpcResult(balance1e18);
        return rpcResult('0x' + '0'.repeat(64));
      }
      if (calldata?.startsWith('0x35ea6a75')) {
        return rpcResult(encodeReserveData({
          liquidityIndex: 10n ** 27n,
          variableBorrowIndex: 10n ** 27n,
          liquidityRate: 35n * 10n ** 24n,
          variableBorrowRate: 50n * 10n ** 24n,
        }));
      }
      return rpcResult('0x' + '0'.repeat(64));
    });

    const provider = new AaveV3LendingProvider({});
    const positions = await provider.getPositions(makeMultiCtx());

    expect(positions.length).toBeGreaterThan(0);
    expect(positions.every(p => p.network === 'ethereum-mainnet')).toBe(true);
  });

  it('Test 15: unsupported networks filtered out silently', async () => {
    fetchMock.mockResolvedValue(rpcResult('0x' + '0'.repeat(64)));

    const provider = new AaveV3LendingProvider({});
    const ctx = makeMultiCtx({ networks: ['hyperevm-mainnet' as any, 'optimism-sepolia' as any] });
    const positions = await provider.getPositions(ctx);

    expect(positions).toEqual([]);
  });

  it('Test 16: testnet environment returns empty (no testnet addresses defined)', async () => {
    fetchMock.mockResolvedValue(rpcResult('0x' + '0'.repeat(64)));

    const provider = new AaveV3LendingProvider({});
    const ctx = makeMultiCtx({ networks: ['ethereum-sepolia' as any], environment: 'testnet' });
    const positions = await provider.getPositions(ctx);

    expect(positions).toEqual([]);
  });

  it('Test 17: each position network field matches the queried network', async () => {
    const balance1e18 = '0x' + (10n ** 18n).toString(16).padStart(64, '0');

    fetchMock.mockImplementation(async (_url: string, opts: { body: string }) => {
      const body = JSON.parse(opts.body);
      const calldata = body.params?.[0]?.data as string;

      if (calldata?.startsWith('0xd1946dbc')) {
        return rpcResult(encodeAddressArrayResponse([ASSET_A]));
      }
      if (calldata?.startsWith('0x9d23d9f2')) {
        return rpcResult(encodeUint256ArrayResponse([100000000n]));
      }
      if (calldata?.startsWith('0xbf92857c')) {
        return rpcResult(encodeUserAccountData({
          totalCollateralBase: 100000000n,
          totalDebtBase: 0n,
          availableBorrowsBase: 80000000n,
          currentLiquidationThreshold: 8250n,
          ltv: 8000n,
          healthFactor: BigInt('115792089237316195423570985008687907853269984665640564039457584007913129639935'),
        }));
      }
      if (calldata?.startsWith('0xd2493b6c')) {
        return rpcResult(encodeThreeAddresses(A_TOKEN_A, S_DEBT_TOKEN_A, V_DEBT_TOKEN_A));
      }
      if (calldata?.startsWith('0x70a08231')) {
        const to = (body.params?.[0]?.to as string)?.toLowerCase();
        if (to === A_TOKEN_A.toLowerCase()) return rpcResult(balance1e18);
        return rpcResult('0x' + '0'.repeat(64));
      }
      if (calldata?.startsWith('0x35ea6a75')) {
        return rpcResult(encodeReserveData({
          liquidityIndex: 10n ** 27n,
          variableBorrowIndex: 10n ** 27n,
          liquidityRate: 20n * 10n ** 24n,
          variableBorrowRate: 30n * 10n ** 24n,
        }));
      }
      return rpcResult('0x' + '0'.repeat(64));
    });

    const provider = new AaveV3LendingProvider({});
    const ctx = makeMultiCtx({ networks: ['ethereum-mainnet', 'base-mainnet'] });
    const positions = await provider.getPositions(ctx);

    for (const p of positions) {
      expect(['ethereum-mainnet', 'base-mainnet']).toContain(p.network);
    }
  });
});
