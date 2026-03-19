/**
 * Unit tests for Kamino SDK wrapper (IKaminoSdkWrapper).
 *
 * Covers: MockKaminoSdkWrapper build methods (4 actions), query methods (2),
 * KaminoSdkWrapper loadSdk failure, loadMarket failure, and all real methods
 * via mocked dynamic imports. Type isolation verification.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  MockKaminoSdkWrapper,
  KaminoSdkWrapper,
} from '../providers/kamino/kamino-sdk-wrapper.js';
import { KAMINO_PROGRAM_ID } from '../providers/kamino/config.js';

// ---------------------------------------------------------------------------
// Test constants
// ---------------------------------------------------------------------------

const WALLET = 'So11111111111111111111111111111111111111112';
const MARKET = '7u3HeHxYDLhnCoErrtycNokbQYbWGzLs6JSDqGAv5PfF';
const ASSET = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

// ---------------------------------------------------------------------------
// MockKaminoSdkWrapper build methods
// ---------------------------------------------------------------------------

describe('MockKaminoSdkWrapper build methods', () => {
  const mock = new MockKaminoSdkWrapper();

  describe('buildSupplyInstruction', () => {
    it('should return KaminoInstruction[] with length >= 1', async () => {
      const result = await mock.buildSupplyInstruction({
        market: MARKET,
        asset: ASSET,
        amount: 1000000n,
        walletAddress: WALLET,
      });
      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBeGreaterThanOrEqual(1);
    });

    it('should have programId === KAMINO_PROGRAM_ID', async () => {
      const result = await mock.buildSupplyInstruction({
        market: MARKET,
        asset: ASSET,
        amount: 1000000n,
        walletAddress: WALLET,
      });
      expect(result[0]!.programId).toBe(KAMINO_PROGRAM_ID);
    });

    it('should have valid base64 instructionData', async () => {
      const result = await mock.buildSupplyInstruction({
        market: MARKET,
        asset: ASSET,
        amount: 1000000n,
        walletAddress: WALLET,
      });
      expect(typeof result[0]!.instructionData).toBe('string');
      expect(result[0]!.instructionData.length).toBeGreaterThan(0);
      expect(() => Buffer.from(result[0]!.instructionData, 'base64')).not.toThrow();
    });

    it('should include walletAddress in accounts as signer', async () => {
      const result = await mock.buildSupplyInstruction({
        market: MARKET,
        asset: ASSET,
        amount: 1000000n,
        walletAddress: WALLET,
      });
      const walletAccount = result[0]!.accounts.find((a) => a.pubkey === WALLET);
      expect(walletAccount).toBeDefined();
      expect(walletAccount!.isSigner).toBe(true);
    });
  });

  describe('buildBorrowInstruction', () => {
    it('should return valid instructions', async () => {
      const result = await mock.buildBorrowInstruction({
        market: MARKET,
        asset: ASSET,
        amount: 500000n,
        walletAddress: WALLET,
      });
      expect(result.length).toBeGreaterThanOrEqual(1);
      expect(result[0]!.programId).toBe(KAMINO_PROGRAM_ID);
    });
  });

  describe('buildRepayInstruction', () => {
    it('should return valid instructions for numeric amount', async () => {
      const result = await mock.buildRepayInstruction({
        market: MARKET,
        asset: ASSET,
        amount: 250000n,
        walletAddress: WALLET,
      });
      expect(result.length).toBeGreaterThanOrEqual(1);
      expect(result[0]!.programId).toBe(KAMINO_PROGRAM_ID);
    });

    it('should return valid instructions for "max" amount', async () => {
      const result = await mock.buildRepayInstruction({
        market: MARKET,
        asset: ASSET,
        amount: 'max',
        walletAddress: WALLET,
      });
      expect(result.length).toBeGreaterThanOrEqual(1);
      // Decode and verify u64 max
      const decoded = Buffer.from(result[0]!.instructionData, 'base64');
      expect(decoded[0]).toBe(2); // action index for repay
      const view = new DataView(decoded.buffer, decoded.byteOffset);
      expect(view.getBigUint64(1, true)).toBe(BigInt('0xFFFFFFFFFFFFFFFF'));
    });
  });

  describe('buildWithdrawInstruction', () => {
    it('should return valid instructions for numeric amount', async () => {
      const result = await mock.buildWithdrawInstruction({
        market: MARKET,
        asset: ASSET,
        amount: 100000n,
        walletAddress: WALLET,
      });
      expect(result.length).toBeGreaterThanOrEqual(1);
      expect(result[0]!.programId).toBe(KAMINO_PROGRAM_ID);
    });

    it('should return valid instructions for "max" amount', async () => {
      const result = await mock.buildWithdrawInstruction({
        market: MARKET,
        asset: ASSET,
        amount: 'max',
        walletAddress: WALLET,
      });
      expect(result.length).toBeGreaterThanOrEqual(1);
      const decoded = Buffer.from(result[0]!.instructionData, 'base64');
      expect(decoded[0]).toBe(3); // action index for withdraw
    });
  });
});

// ---------------------------------------------------------------------------
// MockKaminoSdkWrapper query methods
// ---------------------------------------------------------------------------

describe('MockKaminoSdkWrapper query methods', () => {
  const mock = new MockKaminoSdkWrapper();

  describe('getObligation', () => {
    it('should return non-null obligation', async () => {
      const obligation = await mock.getObligation({
        market: MARKET,
        walletAddress: WALLET,
      });
      expect(obligation).not.toBeNull();
    });

    it('should have deposits and borrows arrays', async () => {
      const obligation = await mock.getObligation({
        market: MARKET,
        walletAddress: WALLET,
      });
      expect(obligation!.deposits.length).toBeGreaterThanOrEqual(1);
      expect(obligation!.borrows.length).toBeGreaterThanOrEqual(1);
    });

    it('should have correct structure for deposits', async () => {
      const obligation = await mock.getObligation({
        market: MARKET,
        walletAddress: WALLET,
      });
      const deposit = obligation!.deposits[0]!;
      expect(typeof deposit.mintAddress).toBe('string');
      expect(typeof deposit.amount).toBe('bigint');
      expect(typeof deposit.marketValueUsd).toBe('number');
    });

    it('should have loanToValue as number', async () => {
      const obligation = await mock.getObligation({
        market: MARKET,
        walletAddress: WALLET,
      });
      expect(typeof obligation!.loanToValue).toBe('number');
    });
  });

  describe('getReserves', () => {
    it('should return 3 reserves', async () => {
      const reserves = await mock.getReserves(MARKET);
      expect(reserves).toHaveLength(3);
    });

    it('should have correct structure for reserves', async () => {
      const reserves = await mock.getReserves(MARKET);
      const reserve = reserves[0]!;
      expect(typeof reserve.mintAddress).toBe('string');
      expect(typeof reserve.symbol).toBe('string');
      expect(typeof reserve.supplyApy).toBe('number');
      expect(typeof reserve.borrowApy).toBe('number');
      expect(typeof reserve.ltvPct).toBe('number');
      expect(typeof reserve.availableLiquidity).toBe('string');
    });
  });
});

// ---------------------------------------------------------------------------
// KaminoSdkWrapper (real stub - SDK installed, needs RPC)
// These tests verify the wrapper throws when RPC is unreachable.
// Skipped in CI because they attempt real network connections.
// ---------------------------------------------------------------------------

describe.skip('KaminoSdkWrapper (real stub)', () => {
  it('should accept rpcUrl in constructor', () => {
    const wrapper = new KaminoSdkWrapper('https://api.mainnet-beta.solana.com');
    expect(wrapper.rpcUrl).toBe('https://api.mainnet-beta.solana.com');
  });

  it('should throw for buildSupplyInstruction without valid RPC', async () => {
    const wrapper = new KaminoSdkWrapper('https://api.mainnet-beta.solana.com');
    await expect(
      wrapper.buildSupplyInstruction({
        market: MARKET,
        asset: ASSET,
        amount: 1000000n,
        walletAddress: WALLET,
      }),
    ).rejects.toThrow();
  });

  it('should throw for buildBorrowInstruction without valid RPC', async () => {
    const wrapper = new KaminoSdkWrapper('https://api.mainnet-beta.solana.com');
    await expect(
      wrapper.buildBorrowInstruction({
        market: MARKET,
        asset: ASSET,
        amount: 500000n,
        walletAddress: WALLET,
      }),
    ).rejects.toThrow();
  });

  it('should throw for buildRepayInstruction without valid RPC', async () => {
    const wrapper = new KaminoSdkWrapper('https://api.mainnet-beta.solana.com');
    await expect(
      wrapper.buildRepayInstruction({
        market: MARKET,
        asset: ASSET,
        amount: 250000n,
        walletAddress: WALLET,
      }),
    ).rejects.toThrow();
  });

  it('should throw for buildWithdrawInstruction without valid RPC', async () => {
    const wrapper = new KaminoSdkWrapper('https://api.mainnet-beta.solana.com');
    await expect(
      wrapper.buildWithdrawInstruction({
        market: MARKET,
        asset: ASSET,
        amount: 100000n,
        walletAddress: WALLET,
      }),
    ).rejects.toThrow();
  });

  it('should throw for getObligation without valid RPC', async () => {
    const wrapper = new KaminoSdkWrapper('https://api.mainnet-beta.solana.com');
    await expect(
      wrapper.getObligation({ market: MARKET, walletAddress: WALLET }),
    ).rejects.toThrow();
  });

  it('should throw for getReserves without valid RPC', async () => {
    const wrapper = new KaminoSdkWrapper('https://api.mainnet-beta.solana.com');
    await expect(wrapper.getReserves(MARKET)).rejects.toThrow();
  });
});

// ---------------------------------------------------------------------------
// KaminoSdkWrapper with mocked SDK (covers real code paths)
// ---------------------------------------------------------------------------

describe('KaminoSdkWrapper with mocked SDK', () => {
  // Mock SDK objects
  const mockPubkey = (addr: string) => ({
    toBase58: () => addr,
    toString: () => addr,
  });

  const mockIx = {
    programId: mockPubkey(KAMINO_PROGRAM_ID),
    data: Buffer.from('test-data'),
    keys: [
      { pubkey: mockPubkey(WALLET), isSigner: true, isWritable: true },
      { pubkey: mockPubkey(MARKET), isSigner: false, isWritable: true },
    ],
  };

  const mockAction = {
    setupIxs: [mockIx],
    lendingIxs: [mockIx],
    cleanupIxs: [null, mockIx], // includes null to test filter
  };

  const mockObligation = {
    deposits: [
      {
        mintAddress: mockPubkey(ASSET),
        amount: { toString: () => '10000000000', toBigInt: () => 10000000000n },
        marketValueSf: { toString: () => '10000000000000000' },
      },
    ],
    borrows: [
      {
        mintAddress: { toBase58: () => WALLET },
        amount: { toString: () => '50000000000', toBigInt: () => 50000000000n },
        marketValueSf: { toString: () => '5000000000000000' },
      },
    ],
    loanToValue: () => 0.5,
  };

  const mockReserve = {
    getLiquidityMint: () => mockPubkey(ASSET),
    stats: {
      symbol: 'USDC',
      supplyInterestAPY: 0.045,
      borrowInterestAPY: 0.062,
      loanToValuePct: 85,
      availableAmount: { toString: () => '5000000000000' },
    },
  };

  const mockMarket = {
    loadReserves: vi.fn().mockResolvedValue(undefined),
    getObligationByWallet: vi.fn().mockResolvedValue(mockObligation),
    reserves: new Map([['reserve1', mockReserve]]),
  };

  const mockConnection = {};

  let wrapper: KaminoSdkWrapper;

  beforeEach(() => {
    wrapper = new KaminoSdkWrapper('https://api.mainnet-beta.solana.com', {
      debug: () => {}, info: () => {}, warn: () => {}, error: () => {},
    });

    // Inject mocked SDK via private field access
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (wrapper as any)._sdk = {
      Connection: vi.fn().mockReturnValue(mockConnection),
      PublicKey: vi.fn().mockImplementation((addr: string) => mockPubkey(addr)),
      KaminoMarket: {
        load: vi.fn().mockResolvedValue(mockMarket),
      },
      KaminoAction: {
        buildDepositTxns: vi.fn().mockResolvedValue(mockAction),
        buildBorrowTxns: vi.fn().mockResolvedValue(mockAction),
        buildRepayTxns: vi.fn().mockResolvedValue(mockAction),
        buildWithdrawTxns: vi.fn().mockResolvedValue(mockAction),
      },
      VanillaObligation: vi.fn().mockImplementation(() => ({})),
    };
  });

  it('buildSupplyInstruction returns converted instructions', async () => {
    const result = await wrapper.buildSupplyInstruction({
      market: MARKET,
      asset: ASSET,
      amount: 1000000n,
      walletAddress: WALLET,
    });
    expect(result.length).toBeGreaterThanOrEqual(1);
    expect(result[0]!.programId).toBe(KAMINO_PROGRAM_ID);
    expect(typeof result[0]!.instructionData).toBe('string');
  });

  it('buildBorrowInstruction returns converted instructions', async () => {
    const result = await wrapper.buildBorrowInstruction({
      market: MARKET,
      asset: ASSET,
      amount: 500000n,
      walletAddress: WALLET,
    });
    expect(result.length).toBeGreaterThanOrEqual(1);
  });

  it('buildRepayInstruction handles max amount', async () => {
    const result = await wrapper.buildRepayInstruction({
      market: MARKET,
      asset: ASSET,
      amount: 'max',
      walletAddress: WALLET,
    });
    expect(result.length).toBeGreaterThanOrEqual(1);
  });

  it('buildRepayInstruction handles numeric amount', async () => {
    const result = await wrapper.buildRepayInstruction({
      market: MARKET,
      asset: ASSET,
      amount: 250000n,
      walletAddress: WALLET,
    });
    expect(result.length).toBeGreaterThanOrEqual(1);
  });

  it('buildWithdrawInstruction handles max amount', async () => {
    const result = await wrapper.buildWithdrawInstruction({
      market: MARKET,
      asset: ASSET,
      amount: 'max',
      walletAddress: WALLET,
    });
    expect(result.length).toBeGreaterThanOrEqual(1);
  });

  it('buildWithdrawInstruction handles numeric amount', async () => {
    const result = await wrapper.buildWithdrawInstruction({
      market: MARKET,
      asset: ASSET,
      amount: 100000n,
      walletAddress: WALLET,
    });
    expect(result.length).toBeGreaterThanOrEqual(1);
  });

  it('getObligation returns parsed obligation data', async () => {
    const result = await wrapper.getObligation({
      market: MARKET,
      walletAddress: WALLET,
    });
    expect(result).not.toBeNull();
    expect(result!.deposits.length).toBe(1);
    expect(result!.borrows.length).toBe(1);
    expect(result!.loanToValue).toBe(0.5);
    expect(typeof result!.deposits[0]!.amount).toBe('bigint');
    expect(typeof result!.deposits[0]!.marketValueUsd).toBe('number');
  });

  it('getObligation returns null when no obligations', async () => {
    mockMarket.getObligationByWallet.mockResolvedValueOnce(null);
    const result = await wrapper.getObligation({
      market: MARKET,
      walletAddress: WALLET,
    });
    expect(result).toBeNull();
  });

  it('getObligation handles deposits without toBase58', async () => {
    const obligationNoBase58 = {
      deposits: [
        {
          mintAddress: ASSET,  // plain string, no toBase58
          amount: { toString: () => '1000', toBigInt: () => 1000n },
          marketValueSf: null,
        },
      ],
      borrows: [],
      loanToValue: () => 0,
    };
    mockMarket.getObligationByWallet.mockResolvedValueOnce(obligationNoBase58);
    const result = await wrapper.getObligation({
      market: MARKET,
      walletAddress: WALLET,
    });
    expect(result).not.toBeNull();
    expect(result!.deposits[0]!.mintAddress).toBe(ASSET);
    expect(result!.deposits[0]!.marketValueUsd).toBe(0);
  });

  it('getObligation handles amounts without toBigInt', async () => {
    const obligationNoBigInt = {
      deposits: [
        {
          mintAddress: mockPubkey(ASSET),
          amount: { toString: () => '5000' },  // no toBigInt
          marketValueSf: { toString: () => '5000000000000000' },
        },
      ],
      borrows: [
        {
          mintAddress: mockPubkey(WALLET),
          amount: { toString: () => '0' },  // zero - should be filtered
          marketValueSf: null,
        },
      ],
      loanToValue: null,  // no loanToValue function
    };
    mockMarket.getObligationByWallet.mockResolvedValueOnce(obligationNoBigInt);
    const result = await wrapper.getObligation({
      market: MARKET,
      walletAddress: WALLET,
    });
    expect(result).not.toBeNull();
    expect(result!.deposits.length).toBe(1);
    expect(result!.deposits[0]!.amount).toBe(5000n);
    expect(result!.borrows.length).toBe(0);  // zero amount filtered
    expect(result!.loanToValue).toBe(0);
  });

  it('getReserves returns parsed reserve data', async () => {
    const result = await wrapper.getReserves(MARKET);
    expect(result).toHaveLength(1);
    expect(result[0]!.symbol).toBe('USDC');
    expect(result[0]!.supplyApy).toBe(0.045);
    expect(result[0]!.borrowApy).toBe(0.062);
    expect(result[0]!.ltvPct).toBe(85);
    expect(result[0]!.availableLiquidity).toBe('5000000000000');
  });

  it('getReserves skips reserves without stats', async () => {
    const reserveNoStats = {
      getLiquidityMint: () => mockPubkey(ASSET),
      stats: null,
    };
    const marketWithMixed = {
      ...mockMarket,
      reserves: new Map<string, typeof mockReserve | typeof reserveNoStats>([
        ['reserve1', mockReserve],
        ['reserve2', reserveNoStats],
      ]),
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (wrapper as any)._sdk.KaminoMarket.load.mockResolvedValueOnce(marketWithMixed);
    const result = await wrapper.getReserves(MARKET);
    expect(result).toHaveLength(1); // only the one with stats
  });

  it('getReserves uses mint address slice when symbol is null', async () => {
    const reserveNoSymbol = {
      getLiquidityMint: () => mockPubkey(ASSET),
      stats: {
        symbol: null,
        supplyInterestAPY: 0,
        borrowInterestAPY: 0,
        loanToValuePct: null,
        availableAmount: null,
      },
    };
    const marketNoSymbol = {
      ...mockMarket,
      reserves: new Map([['reserve1', reserveNoSymbol]]),
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (wrapper as any)._sdk.KaminoMarket.load.mockResolvedValueOnce(marketNoSymbol);
    const result = await wrapper.getReserves(MARKET);
    expect(result).toHaveLength(1);
    expect(result[0]!.symbol).toBe(ASSET.slice(0, 6));
    expect(result[0]!.ltvPct).toBe(0);
    expect(result[0]!.availableLiquidity).toBe('0');
  });

  it('filters out instructions with empty keys', async () => {
    const emptyKeysIx = {
      programId: mockPubkey(KAMINO_PROGRAM_ID),
      data: Buffer.from('empty'),
      keys: [],
    };
    const actionWithEmptyKeys = {
      setupIxs: [emptyKeysIx],
      lendingIxs: [mockIx],
      cleanupIxs: [emptyKeysIx],
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (wrapper as any)._sdk.KaminoAction.buildDepositTxns.mockResolvedValueOnce(actionWithEmptyKeys);
    const result = await wrapper.buildSupplyInstruction({
      market: MARKET,
      asset: ASSET,
      amount: 1000000n,
      walletAddress: WALLET,
    });
    expect(result).toHaveLength(1);
    expect(result[0]!.programId).toBe(KAMINO_PROGRAM_ID);
  });

  it('throws when all instructions have empty keys', async () => {
    const emptyKeysIx = {
      programId: mockPubkey(KAMINO_PROGRAM_ID),
      data: Buffer.from('empty'),
      keys: [],
    };
    const allEmptyAction = {
      setupIxs: [emptyKeysIx],
      lendingIxs: [emptyKeysIx],
      cleanupIxs: [],
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (wrapper as any)._sdk.KaminoAction.buildDepositTxns.mockResolvedValueOnce(allEmptyAction);
    await expect(
      wrapper.buildSupplyInstruction({
        market: MARKET,
        asset: ASSET,
        amount: 1000000n,
        walletAddress: WALLET,
      }),
    ).rejects.toThrow('no valid instructions with accounts');
  });

  it('loadMarket throws when market not found', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (wrapper as any)._sdk.KaminoMarket.load.mockResolvedValueOnce(null);
    await expect(
      wrapper.buildSupplyInstruction({
        market: 'nonexistent',
        asset: ASSET,
        amount: 1000000n,
        walletAddress: WALLET,
      }),
    ).rejects.toThrow('Kamino market not found');
  });
});

// ---------------------------------------------------------------------------
// Type isolation verification
// ---------------------------------------------------------------------------

describe('type isolation verification (Kamino)', () => {
  it('should use only string/boolean types in KaminoInstruction', async () => {
    const mock = new MockKaminoSdkWrapper();
    const ixs = await mock.buildSupplyInstruction({
      market: MARKET,
      asset: ASSET,
      amount: 1000000n,
      walletAddress: WALLET,
    });
    const ix = ixs[0]!;

    expect(typeof ix.programId).toBe('string');
    expect(typeof ix.instructionData).toBe('string');
    for (const acct of ix.accounts) {
      expect(typeof acct.pubkey).toBe('string');
      expect(typeof acct.isSigner).toBe('boolean');
      expect(typeof acct.isWritable).toBe('boolean');
    }
  });
});
