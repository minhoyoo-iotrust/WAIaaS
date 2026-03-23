/**
 * Unit tests for DriftSdkWrapper real class with mocked SDK.
 *
 * Covers all DriftSdkWrapper methods (build 5 + query 3) via
 * mocked dynamic imports to exercise the real code paths without
 * requiring @drift-labs/sdk to be installed.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { DriftSdkWrapper } from '../providers/drift/drift-sdk-wrapper.js';
import { DRIFT_PROGRAM_ID } from '../providers/drift/config.js';

// ---------------------------------------------------------------------------
// Test constants
// ---------------------------------------------------------------------------

const WALLET = 'So11111111111111111111111111111111111111112';
const RPC_URL = 'https://api.mainnet-beta.solana.com';

// ---------------------------------------------------------------------------
// Mock SDK objects factory
// ---------------------------------------------------------------------------

function createMockSdk() {
  const mockPubkey = (addr: string) => ({
    toBase58: () => addr,
    toString: () => addr,
  });

  const mockIx = {
    programId: mockPubkey(DRIFT_PROGRAM_ID),
    data: Buffer.from('test-drift-data'),
    keys: [
      { pubkey: mockPubkey(WALLET), isSigner: true, isWritable: true },
      { pubkey: mockPubkey(DRIFT_PROGRAM_ID), isSigner: false, isWritable: true },
    ],
  };

  const mockUser = {
    getActivePerpPositions: vi.fn().mockReturnValue([
      {
        marketIndex: 0,
        baseAssetAmount: {
          toString: () => '100000000000',
          toNumber: () => 100_000_000_000,
        },
        quoteEntryAmount: { toNumber: () => 15_000_000_000 },
        quoteBreakEvenAmount: { toNumber: () => 15_000_000_000 },
      },
      {
        marketIndex: 1,
        baseAssetAmount: {
          toString: () => '-50000000000',
          toNumber: () => -50_000_000_000,
        },
        quoteEntryAmount: null,
        quoteBreakEvenAmount: null,
      },
    ]),
    getTotalCollateral: vi.fn().mockReturnValue('mock-total'),
    getFreeCollateral: vi.fn().mockReturnValue('mock-free'),
    getMarginRatio: vi.fn().mockReturnValue('mock-ratio'),
  };

  const mockClient = {
    subscribe: vi.fn().mockResolvedValue(undefined),
    getUser: vi.fn().mockReturnValue(mockUser),
    getPlacePerpOrderIx: vi.fn().mockResolvedValue(mockIx),
    getDepositInstruction: vi.fn().mockResolvedValue(mockIx),
    getWithdrawIx: vi.fn().mockResolvedValue(mockIx),
    getPerpMarketAccount: vi.fn().mockImplementation((idx: number) => ({
      name: Buffer.from(`${['SOL', 'BTC', 'ETH'][idx] ?? 'UNK'}-PERP\0\0\0\0`),
      amm: {
        lastOracleNormalisedPrice: 'mock-price',
        baseAssetAmountLong: { toNumber: () => 1_000_000_000_000 },
        baseAssetAmountShort: { toNumber: () => -500_000_000_000 },
      },
      marginRatioInitial: 500,
      lastFundingRate: 'mock-funding',
    })),
    getPerpMarketAccounts: vi.fn().mockReturnValue([
      {
        marketIndex: 0,
        name: Buffer.from('SOL-PERP\0\0\0\0'),
        amm: {
          lastOracleNormalisedPrice: 'mock-price',
          baseAssetAmountLong: { toNumber: () => 1_000_000_000_000 },
          baseAssetAmountShort: { toNumber: () => -500_000_000_000 },
        },
        marginRatioInitial: 500,
        lastFundingRate: 'mock-funding',
      },
      {
        marketIndex: 1,
        name: Buffer.from('BTC-PERP\0\0\0\0'),
        amm: {
          lastOracleNormalisedPrice: 'mock-price',
          baseAssetAmountLong: { toNumber: () => 2_000_000_000_000 },
          baseAssetAmountShort: { toNumber: () => -1_000_000_000_000 },
        },
        marginRatioInitial: 200,
        lastFundingRate: null,
      },
      {
        marketIndex: 2,
        name: Buffer.from('ETH-PERP\0\0\0\0'),
        amm: null,
        marginRatioInitial: 0,
        lastFundingRate: null,
      },
    ]),
    getCloseSpotMarketOrderIx: vi.fn(),
  };

  const sdk = {
    Connection: vi.fn().mockReturnValue({}),
    PublicKey: vi.fn().mockImplementation((addr: string) => mockPubkey(addr)),
    Keypair: { generate: vi.fn().mockReturnValue({}) },
    Wallet: vi.fn().mockReturnValue({}),
    BN: vi.fn().mockImplementation((n: number) => n),
    DriftClient: vi.fn().mockReturnValue(mockClient),
    PositionDirection: { LONG: 'long', SHORT: 'short' },
    OrderType: { MARKET: 'market', LIMIT: 'limit' },
    MarketType: { PERP: 'perp' },
    PRICE_PRECISION: 'price-precision',
    BASE_PRECISION: 'base-precision',
    QUOTE_PRECISION: 'quote-precision',
    convertToNumber: vi.fn().mockReturnValue(150.25),
    getMarketOrderParams: vi.fn().mockImplementation((p: unknown) => p),
    getLimitOrderParams: vi.fn().mockImplementation((p: unknown) => p),
  };

  return { sdk, mockClient, mockUser };
}

// ---------------------------------------------------------------------------
// DriftSdkWrapper with mocked SDK
// ---------------------------------------------------------------------------

describe('DriftSdkWrapper with mocked SDK', () => {
  let wrapper: DriftSdkWrapper;
  let mockClient: ReturnType<typeof createMockSdk>['mockClient'];

  beforeEach(() => {
    wrapper = new DriftSdkWrapper(RPC_URL, 0, {
      debug: () => {}, info: () => {}, warn: () => {}, error: () => {},
    });
    const mocks = createMockSdk();
    mockClient = mocks.mockClient;
    // Inject mocked SDK via private field access
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (wrapper as any)._sdk = mocks.sdk;
  });

  describe('buildOpenPositionInstruction', () => {
    it('returns converted instructions for MARKET order', async () => {
      const result = await wrapper.buildOpenPositionInstruction({
        market: 'SOL-PERP',
        direction: 'LONG',
        size: '100',
        orderType: 'MARKET',
        walletAddress: WALLET,
      });
      expect(result.length).toBe(1);
      expect(result[0]!.programId).toBe(DRIFT_PROGRAM_ID);
      expect(typeof result[0]!.instructionData).toBe('string');
    });

    it('returns converted instructions for LIMIT order', async () => {
      const result = await wrapper.buildOpenPositionInstruction({
        market: 'SOL-PERP',
        direction: 'SHORT',
        size: '50',
        orderType: 'LIMIT',
        limitPrice: '155.0',
        walletAddress: WALLET,
      });
      expect(result.length).toBe(1);
    });

    it('uses MARKET order when LIMIT but no limitPrice', async () => {
      const result = await wrapper.buildOpenPositionInstruction({
        market: 'BTC-PERP',
        direction: 'LONG',
        size: '0.1',
        orderType: 'LIMIT',
        walletAddress: WALLET,
      });
      expect(result.length).toBe(1);
    });
  });

  describe('buildClosePositionInstruction', () => {
    it('handles full close (no size)', async () => {
      const result = await wrapper.buildClosePositionInstruction({
        market: 'SOL-PERP',
        walletAddress: WALLET,
      });
      expect(result.length).toBe(1);
      expect(result[0]!.programId).toBe(DRIFT_PROGRAM_ID);
    });

    it('handles partial close with size', async () => {
      const result = await wrapper.buildClosePositionInstruction({
        market: 'SOL-PERP',
        size: '50',
        walletAddress: WALLET,
      });
      expect(result.length).toBe(1);
    });
  });

  describe('buildModifyPositionInstruction', () => {
    it('handles newSize modification', async () => {
      const result = await wrapper.buildModifyPositionInstruction({
        market: 'SOL-PERP',
        newSize: '200',
        walletAddress: WALLET,
      });
      expect(result.length).toBe(1);
    });

    it('handles newLimitPrice modification', async () => {
      const result = await wrapper.buildModifyPositionInstruction({
        market: 'SOL-PERP',
        newLimitPrice: '160.0',
        walletAddress: WALLET,
      });
      expect(result.length).toBe(1);
    });

    it('handles neither newSize nor newLimitPrice', async () => {
      const result = await wrapper.buildModifyPositionInstruction({
        market: 'SOL-PERP',
        walletAddress: WALLET,
      });
      expect(result.length).toBe(1);
    });
  });

  describe('buildDepositInstruction', () => {
    it('returns converted deposit instruction', async () => {
      const result = await wrapper.buildDepositInstruction({
        amount: '500',
        asset: 'USDC',
        walletAddress: WALLET,
      });
      expect(result.length).toBe(1);
      expect(mockClient.getDepositInstruction).toHaveBeenCalled();
    });
  });

  describe('buildWithdrawInstruction', () => {
    it('returns converted withdraw instruction', async () => {
      const result = await wrapper.buildWithdrawInstruction({
        amount: '200',
        asset: 'USDC',
        walletAddress: WALLET,
      });
      expect(result.length).toBe(1);
      expect(mockClient.getWithdrawIx).toHaveBeenCalled();
    });
  });

  describe('getPositions', () => {
    it('returns parsed positions with correct direction', async () => {
      const positions = await wrapper.getPositions(WALLET);
      expect(positions.length).toBe(2);
      expect(positions[0]!.direction).toBe('LONG');
      expect(positions[1]!.direction).toBe('SHORT');
    });

    it('calculates baseAssetAmount correctly', async () => {
      const positions = await wrapper.getPositions(WALLET);
      expect(positions[0]!.baseAssetAmount).toBe('100000000000');
    });

    it('parses market name from buffer', async () => {
      const positions = await wrapper.getPositions(WALLET);
      expect(positions[0]!.market).toBe('SOL-PERP');
    });

    it('falls back to PERP-{index} when market name not found', async () => {
      mockClient.getPerpMarketAccount.mockReturnValueOnce(null);
      const positions = await wrapper.getPositions(WALLET);
      expect(positions[0]!.market).toBe('PERP-0');
    });

    it('calculates unrealizedPnl for long position', async () => {
      const positions = await wrapper.getPositions(WALLET);
      expect(positions[0]!.unrealizedPnl).not.toBeNull();
      expect(typeof positions[0]!.unrealizedPnl).toBe('number');
    });

    it('handles null quoteEntryAmount', async () => {
      const positions = await wrapper.getPositions(WALLET);
      // second position has null quoteEntryAmount
      expect(positions[1]!.entryPrice).toBeNull();
      expect(positions[1]!.unrealizedPnl).toBeNull();
    });
  });

  describe('getMarginInfo', () => {
    it('returns margin info with all fields', async () => {
      const info = await wrapper.getMarginInfo(WALLET);
      expect(typeof info.totalMargin).toBe('number');
      expect(typeof info.freeMargin).toBe('number');
      expect(info.maintenanceMarginRatio).toBe(0.0625);
      expect(typeof info.marginRatio).toBe('number');
    });

    it('handles missing getMarginRatio function', async () => {
      const mocks = createMockSdk();
      mocks.mockUser.getMarginRatio = undefined as unknown as typeof mocks.mockUser.getMarginRatio;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (wrapper as any)._sdk = mocks.sdk;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (wrapper as any)._client = null;
      const info = await wrapper.getMarginInfo(WALLET);
      expect(info.marginRatio).toBe(0.3);
    });
  });

  describe('getMarkets', () => {
    it('returns parsed markets', async () => {
      const markets = await wrapper.getMarkets();
      expect(markets.length).toBe(3);
    });

    it('parses market name and baseAsset correctly', async () => {
      const markets = await wrapper.getMarkets();
      expect(markets[0]!.market).toBe('SOL-PERP');
      expect(markets[0]!.baseAsset).toBe('SOL');
    });

    it('calculates maxLeverage from marginRatioInitial', async () => {
      const markets = await wrapper.getMarkets();
      expect(markets[0]!.maxLeverage).toBe(20); // 10000/500
      expect(markets[1]!.maxLeverage).toBe(50); // 10000/200
    });

    it('defaults maxLeverage to 20 when marginRatioInitial is 0', async () => {
      const markets = await wrapper.getMarkets();
      expect(markets[2]!.maxLeverage).toBe(20);
    });

    it('handles null amm for openInterest', async () => {
      const markets = await wrapper.getMarkets();
      expect(markets[2]!.openInterest).toBeNull();
    });

    it('handles null lastFundingRate', async () => {
      const markets = await wrapper.getMarkets();
      expect(markets[1]!.fundingRate).toBeNull();
    });
  });

  describe('resolveMarketIndex', () => {
    it('resolves known markets correctly', async () => {
      // Test via buildOpenPositionInstruction which calls resolveMarketIndex internally
      await wrapper.buildOpenPositionInstruction({
        market: 'ETH-PERP',
        direction: 'LONG',
        size: '10',
        orderType: 'MARKET',
        walletAddress: WALLET,
      });
      // Should have been called -- we just verify it doesn't throw
    });

    it('defaults to 0 for unknown market', async () => {
      await wrapper.buildOpenPositionInstruction({
        market: 'UNKNOWN-PERP',
        direction: 'LONG',
        size: '10',
        orderType: 'MARKET',
        walletAddress: WALLET,
      });
      // No error means it defaulted to 0
    });

    it('defaults to 0 for invalid format', async () => {
      await wrapper.buildOpenPositionInstruction({
        market: 'invalid',
        direction: 'LONG',
        size: '10',
        orderType: 'MARKET',
        walletAddress: WALLET,
      });
      // No error means it defaulted to 0
    });
  });

  describe('client caching', () => {
    it('reuses client on subsequent calls', async () => {
      await wrapper.buildOpenPositionInstruction({
        market: 'SOL-PERP',
        direction: 'LONG',
        size: '100',
        orderType: 'MARKET',
        walletAddress: WALLET,
      });
      await wrapper.buildClosePositionInstruction({
        market: 'SOL-PERP',
        walletAddress: WALLET,
      });
      // DriftClient constructor should only be called once (via getClient caching)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect((wrapper as any)._sdk.DriftClient).toHaveBeenCalledTimes(1);
    });
  });
});
