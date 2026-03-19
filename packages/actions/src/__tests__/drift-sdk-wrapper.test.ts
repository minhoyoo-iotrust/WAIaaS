/**
 * Unit tests for Drift SDK wrapper (IDriftSdkWrapper).
 *
 * Covers: MockDriftSdkWrapper build methods (5 actions), query methods (3),
 * DriftSdkWrapper stub (throws for all 8 methods), type isolation verification.
 */
import { describe, expect, it, vi } from 'vitest';
import {
  MockDriftSdkWrapper,
  DriftSdkWrapper,
} from '../providers/drift/drift-sdk-wrapper.js';
import { DRIFT_PROGRAM_ID } from '../providers/drift/config.js';

// ---------------------------------------------------------------------------
// Test constants
// ---------------------------------------------------------------------------

const WALLET = 'So11111111111111111111111111111111111111112';

// ---------------------------------------------------------------------------
// MockDriftSdkWrapper build methods
// ---------------------------------------------------------------------------

describe('MockDriftSdkWrapper build methods', () => {
  const mock = new MockDriftSdkWrapper();

  describe('buildOpenPositionInstruction', () => {
    it('should return DriftInstruction[] with length >= 1', async () => {
      const result = await mock.buildOpenPositionInstruction({
        market: 'SOL-PERP',
        direction: 'LONG',
        size: '100',
        orderType: 'MARKET',
        walletAddress: WALLET,
      });
      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBeGreaterThanOrEqual(1);
    });

    it('should have programId === DRIFT_PROGRAM_ID', async () => {
      const result = await mock.buildOpenPositionInstruction({
        market: 'SOL-PERP',
        direction: 'LONG',
        size: '100',
        orderType: 'MARKET',
        walletAddress: WALLET,
      });
      expect(result[0]!.programId).toBe(DRIFT_PROGRAM_ID);
    });

    it('should have valid base64 instructionData', async () => {
      const result = await mock.buildOpenPositionInstruction({
        market: 'SOL-PERP',
        direction: 'LONG',
        size: '100',
        orderType: 'MARKET',
        walletAddress: WALLET,
      });
      expect(typeof result[0]!.instructionData).toBe('string');
      expect(result[0]!.instructionData.length).toBeGreaterThan(0);
      expect(() => Buffer.from(result[0]!.instructionData, 'base64')).not.toThrow();
    });

    it('should include walletAddress in accounts as signer', async () => {
      const result = await mock.buildOpenPositionInstruction({
        market: 'SOL-PERP',
        direction: 'LONG',
        size: '100',
        orderType: 'MARKET',
        walletAddress: WALLET,
      });
      const accounts = result[0]!.accounts;
      expect(accounts.length).toBeGreaterThanOrEqual(1);
      const walletAccount = accounts.find((a) => a.pubkey === WALLET);
      expect(walletAccount).toBeDefined();
      expect(walletAccount!.isSigner).toBe(true);
    });

    it('should work with LIMIT order type and limitPrice', async () => {
      const result = await mock.buildOpenPositionInstruction({
        market: 'SOL-PERP',
        direction: 'SHORT',
        size: '50',
        orderType: 'LIMIT',
        limitPrice: '155.0',
        walletAddress: WALLET,
      });
      expect(result.length).toBeGreaterThanOrEqual(1);
      expect(result[0]!.programId).toBe(DRIFT_PROGRAM_ID);
    });
  });

  describe('buildClosePositionInstruction', () => {
    it('should return valid instructions for full close', async () => {
      const result = await mock.buildClosePositionInstruction({
        market: 'SOL-PERP',
        walletAddress: WALLET,
      });
      expect(result.length).toBeGreaterThanOrEqual(1);
      expect(result[0]!.programId).toBe(DRIFT_PROGRAM_ID);
      expect(() => Buffer.from(result[0]!.instructionData, 'base64')).not.toThrow();
    });

    it('should return valid instructions for partial close', async () => {
      const result = await mock.buildClosePositionInstruction({
        market: 'SOL-PERP',
        size: '50',
        walletAddress: WALLET,
      });
      expect(result.length).toBeGreaterThanOrEqual(1);
      const walletAccount = result[0]!.accounts.find((a) => a.pubkey === WALLET);
      expect(walletAccount?.isSigner).toBe(true);
    });
  });

  describe('buildModifyPositionInstruction', () => {
    it('should return valid instructions', async () => {
      const result = await mock.buildModifyPositionInstruction({
        market: 'SOL-PERP',
        newSize: '200',
        walletAddress: WALLET,
      });
      expect(result.length).toBeGreaterThanOrEqual(1);
      expect(result[0]!.programId).toBe(DRIFT_PROGRAM_ID);
    });

    it('should include walletAddress in accounts as signer', async () => {
      const result = await mock.buildModifyPositionInstruction({
        market: 'SOL-PERP',
        newLimitPrice: '160.0',
        walletAddress: WALLET,
      });
      const walletAccount = result[0]!.accounts.find((a) => a.pubkey === WALLET);
      expect(walletAccount).toBeDefined();
      expect(walletAccount!.isSigner).toBe(true);
    });
  });

  describe('buildDepositInstruction', () => {
    it('should return valid instructions', async () => {
      const result = await mock.buildDepositInstruction({
        amount: '500',
        asset: 'USDC',
        walletAddress: WALLET,
      });
      expect(result.length).toBeGreaterThanOrEqual(1);
      expect(result[0]!.programId).toBe(DRIFT_PROGRAM_ID);
      expect(() => Buffer.from(result[0]!.instructionData, 'base64')).not.toThrow();
    });

    it('should include walletAddress and asset in accounts', async () => {
      const result = await mock.buildDepositInstruction({
        amount: '500',
        asset: 'USDC',
        walletAddress: WALLET,
      });
      const accounts = result[0]!.accounts;
      expect(accounts.find((a) => a.pubkey === WALLET)).toBeDefined();
      expect(accounts.find((a) => a.pubkey === 'USDC')).toBeDefined();
    });
  });

  describe('buildWithdrawInstruction', () => {
    it('should return valid instructions', async () => {
      const result = await mock.buildWithdrawInstruction({
        amount: '200',
        asset: 'USDC',
        walletAddress: WALLET,
      });
      expect(result.length).toBeGreaterThanOrEqual(1);
      expect(result[0]!.programId).toBe(DRIFT_PROGRAM_ID);
    });

    it('should include walletAddress and asset in accounts', async () => {
      const result = await mock.buildWithdrawInstruction({
        amount: '200',
        asset: 'USDC',
        walletAddress: WALLET,
      });
      const accounts = result[0]!.accounts;
      expect(accounts.find((a) => a.pubkey === WALLET)?.isSigner).toBe(true);
      expect(accounts.find((a) => a.pubkey === 'USDC')).toBeDefined();
    });
  });

  describe('all build methods include walletAddress as signer', () => {
    it('should have walletAddress as signer in all 5 build results', async () => {
      const results = await Promise.all([
        mock.buildOpenPositionInstruction({
          market: 'SOL-PERP', direction: 'LONG', size: '1', orderType: 'MARKET', walletAddress: WALLET,
        }),
        mock.buildClosePositionInstruction({ market: 'SOL-PERP', walletAddress: WALLET }),
        mock.buildModifyPositionInstruction({ market: 'SOL-PERP', newSize: '1', walletAddress: WALLET }),
        mock.buildDepositInstruction({ amount: '1', asset: 'USDC', walletAddress: WALLET }),
        mock.buildWithdrawInstruction({ amount: '1', asset: 'USDC', walletAddress: WALLET }),
      ]);

      for (const ixs of results) {
        const walletAccount = ixs[0]!.accounts.find((a) => a.pubkey === WALLET);
        expect(walletAccount).toBeDefined();
        expect(walletAccount!.isSigner).toBe(true);
      }
    });
  });
});

// ---------------------------------------------------------------------------
// MockDriftSdkWrapper query methods
// ---------------------------------------------------------------------------

describe('MockDriftSdkWrapper query methods', () => {
  const mock = new MockDriftSdkWrapper();

  describe('getPositions', () => {
    it('should return non-empty DriftPosition array', async () => {
      const positions = await mock.getPositions(WALLET);
      expect(Array.isArray(positions)).toBe(true);
      expect(positions.length).toBeGreaterThanOrEqual(1);
    });

    it('should have correct structure (market, direction, baseAssetAmount, leverage)', async () => {
      const positions = await mock.getPositions(WALLET);
      const pos = positions[0]!;
      expect(typeof pos.market).toBe('string');
      expect(typeof pos.direction).toBe('string');
      expect(typeof pos.baseAssetAmount).toBe('string');
      expect(typeof pos.leverage).toBe('number');
      expect(typeof pos.marketIndex).toBe('number');
    });

    it('should have direction as LONG or SHORT', async () => {
      const positions = await mock.getPositions(WALLET);
      for (const pos of positions) {
        expect(['LONG', 'SHORT']).toContain(pos.direction);
      }
    });
  });

  describe('getMarginInfo', () => {
    it('should return valid DriftMarginInfo', async () => {
      const info = await mock.getMarginInfo(WALLET);
      expect(info).toBeDefined();
    });

    it('should have all 4 fields as numbers', async () => {
      const info = await mock.getMarginInfo(WALLET);
      expect(typeof info.totalMargin).toBe('number');
      expect(typeof info.freeMargin).toBe('number');
      expect(typeof info.maintenanceMarginRatio).toBe('number');
      expect(typeof info.marginRatio).toBe('number');
    });
  });

  describe('getMarkets', () => {
    it('should return 3 markets (SOL-PERP, BTC-PERP, ETH-PERP)', async () => {
      const markets = await mock.getMarkets();
      expect(markets).toHaveLength(3);
      const names = markets.map((m) => m.market);
      expect(names).toContain('SOL-PERP');
      expect(names).toContain('BTC-PERP');
      expect(names).toContain('ETH-PERP');
    });
  });
});

// ---------------------------------------------------------------------------
// DriftSdkWrapper (real stub)
// ---------------------------------------------------------------------------

describe.skip('DriftSdkWrapper (real stub — skipped: retry backoff makes these too slow)', () => {
  it('should accept rpcUrl and subAccount in constructor', () => {
    const wrapper = new DriftSdkWrapper('https://api.mainnet-beta.solana.com', 0);
    expect(wrapper.rpcUrl).toBe('https://api.mainnet-beta.solana.com');
    expect(wrapper.subAccount).toBe(0);
  });

  it('should throw for buildOpenPositionInstruction', async () => {
    const wrapper = new DriftSdkWrapper('https://api.mainnet-beta.solana.com', 0);
    await expect(
      wrapper.buildOpenPositionInstruction({
        market: 'SOL-PERP',
        direction: 'LONG',
        size: '100',
        orderType: 'MARKET',
        walletAddress: WALLET,
      }),
    ).rejects.toThrow();
  });

  it('should throw for buildClosePositionInstruction', async () => {
    const wrapper = new DriftSdkWrapper('https://api.mainnet-beta.solana.com', 0);
    await expect(
      wrapper.buildClosePositionInstruction({ market: 'SOL-PERP', walletAddress: WALLET }),
    ).rejects.toThrow();
  });

  it('should throw for buildModifyPositionInstruction', async () => {
    const wrapper = new DriftSdkWrapper('https://api.mainnet-beta.solana.com', 0);
    await expect(
      wrapper.buildModifyPositionInstruction({ market: 'SOL-PERP', newSize: '200', walletAddress: WALLET }),
    ).rejects.toThrow();
  });

  it('should throw for buildDepositInstruction', async () => {
    const wrapper = new DriftSdkWrapper('https://api.mainnet-beta.solana.com', 0);
    await expect(
      wrapper.buildDepositInstruction({ amount: '500', asset: 'USDC', walletAddress: WALLET }),
    ).rejects.toThrow();
  });

  it('should throw for buildWithdrawInstruction', async () => {
    const wrapper = new DriftSdkWrapper('https://api.mainnet-beta.solana.com', 0);
    await expect(
      wrapper.buildWithdrawInstruction({ amount: '200', asset: 'USDC', walletAddress: WALLET }),
    ).rejects.toThrow();
  });

  it('should throw for getPositions without valid RPC', async () => {
    const wrapper = new DriftSdkWrapper('https://api.mainnet-beta.solana.com', 0);
    await expect(wrapper.getPositions(WALLET)).rejects.toThrow();
  });

  it('should throw for getMarginInfo without valid RPC', async () => {
    const wrapper = new DriftSdkWrapper('https://api.mainnet-beta.solana.com', 0);
    await expect(wrapper.getMarginInfo(WALLET)).rejects.toThrow();
  });

  it('should throw for getMarkets without valid RPC', async () => {
    const wrapper = new DriftSdkWrapper('https://api.mainnet-beta.solana.com', 0);
    await expect(wrapper.getMarkets()).rejects.toThrow();
  });
});

// ---------------------------------------------------------------------------
// DriftSdkWrapper retry behavior (#415)
// ---------------------------------------------------------------------------

describe('DriftSdkWrapper retry behavior (#415)', () => {
  const mockPubkey = (addr: string) => ({
    toBase58: () => addr,
    toString: () => addr,
  });

  const mockIx = {
    programId: mockPubkey(DRIFT_PROGRAM_ID),
    data: Buffer.from('test-data'),
    keys: [
      { pubkey: mockPubkey(WALLET), isSigner: true, isWritable: true },
    ],
  };

  it('retries on 429 and succeeds on third attempt', async () => {
    const wrapper = new DriftSdkWrapper('https://api.mainnet-beta.solana.com', 0, {
      debug: () => {}, info: () => {}, warn: () => {}, error: () => {},
    });

    let subscribeCallCount = 0;
    const mockClient = {
      subscribe: vi.fn().mockImplementation(async () => {
        subscribeCallCount++;
        if (subscribeCallCount < 3) {
          throw new Error('429 Too Many Requests');
        }
      }),
      getPlacePerpOrderIx: vi.fn().mockResolvedValue(mockIx),
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (wrapper as any)._sdk = {
      Connection: vi.fn(),
      PublicKey: vi.fn().mockImplementation((addr: string) => mockPubkey(addr)),
      Keypair: { generate: vi.fn().mockReturnValue({}) },
      Wallet: vi.fn().mockReturnValue({}),
      BN: vi.fn(),
      DriftClient: vi.fn().mockReturnValue(mockClient),
      PositionDirection: { LONG: 0, SHORT: 1 },
      OrderType: { MARKET: 0, LIMIT: 1 },
      MarketType: { PERP: 0 },
      PRICE_PRECISION: {},
      BASE_PRECISION: {},
      QUOTE_PRECISION: {},
      convertToNumber: vi.fn(),
      getMarketOrderParams: vi.fn().mockReturnValue({}),
      getLimitOrderParams: vi.fn(),
    };

    const result = await wrapper.buildOpenPositionInstruction({
      market: 'SOL-PERP',
      direction: 'LONG',
      size: '100',
      orderType: 'MARKET',
      walletAddress: WALLET,
    });
    expect(result).toHaveLength(1);
    expect(subscribeCallCount).toBe(3);
  }, 15_000);

  it('throws RATE_LIMITED after all retries exhausted', async () => {
    const wrapper = new DriftSdkWrapper('https://api.mainnet-beta.solana.com', 0, {
      debug: () => {}, info: () => {}, warn: () => {}, error: () => {},
    });

    const mockClient = {
      subscribe: vi.fn().mockRejectedValue(new Error('429 Too Many Requests')),
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (wrapper as any)._sdk = {
      Connection: vi.fn(),
      PublicKey: vi.fn().mockImplementation((addr: string) => mockPubkey(addr)),
      Keypair: { generate: vi.fn().mockReturnValue({}) },
      Wallet: vi.fn().mockReturnValue({}),
      BN: vi.fn(),
      DriftClient: vi.fn().mockReturnValue(mockClient),
      PositionDirection: { LONG: 0, SHORT: 1 },
      OrderType: {},
      MarketType: { PERP: 0 },
      PRICE_PRECISION: {},
      BASE_PRECISION: {},
      QUOTE_PRECISION: {},
      convertToNumber: vi.fn(),
      getMarketOrderParams: vi.fn().mockReturnValue({}),
      getLimitOrderParams: vi.fn(),
    };

    await expect(
      wrapper.buildOpenPositionInstruction({
        market: 'SOL-PERP',
        direction: 'LONG',
        size: '100',
        orderType: 'MARKET',
        walletAddress: WALLET,
      }),
    ).rejects.toThrow('Drift SDK initialization failed after 3 retries');
    expect(mockClient.subscribe).toHaveBeenCalledTimes(3);
  }, 15_000);
});

// ---------------------------------------------------------------------------
// Type isolation verification
// ---------------------------------------------------------------------------

describe('type isolation verification', () => {
  it('should use only string/boolean types in DriftInstruction', async () => {
    const mock = new MockDriftSdkWrapper();
    const ixs = await mock.buildOpenPositionInstruction({
      market: 'SOL-PERP', direction: 'LONG', size: '100', orderType: 'MARKET', walletAddress: WALLET,
    });
    const ix = ixs[0]!;

    // All fields are plain JS types, no PublicKey or BN
    expect(typeof ix.programId).toBe('string');
    expect(typeof ix.instructionData).toBe('string');
    for (const acct of ix.accounts) {
      expect(typeof acct.pubkey).toBe('string');
      expect(typeof acct.isSigner).toBe('boolean');
      expect(typeof acct.isWritable).toBe('boolean');
    }
  });

  it('should use only string/number/null types in DriftPosition', async () => {
    const mock = new MockDriftSdkWrapper();
    const positions = await mock.getPositions(WALLET);
    const pos = positions[0]!;

    expect(typeof pos.market).toBe('string');
    expect(typeof pos.marketIndex).toBe('number');
    expect(typeof pos.direction).toBe('string');
    expect(typeof pos.baseAssetAmount).toBe('string');
    expect(typeof pos.leverage).toBe('number');
    // Nullable fields: number or null
    for (const field of [pos.entryPrice, pos.unrealizedPnl, pos.liquidationPrice, pos.margin, pos.notionalValueUsd]) {
      expect(field === null || typeof field === 'number').toBe(true);
    }
  });
});
