/**
 * Kamino K-Lend SDK wrapper abstraction.
 *
 * IKaminoSdkWrapper provides a testable interface for @kamino-finance/klend-sdk
 * instruction building. MockKaminoSdkWrapper provides deterministic test data.
 * KaminoSdkWrapper wraps the real SDK with lazy imports and graceful fallback.
 *
 * Instruction results (KaminoInstruction) use the same format as Jito's
 * ContractCallRequest: programId + base64 instructionData + accounts array.
 */
import type { ILogger } from '@waiaas/core';
import { KAMINO_PROGRAM_ID } from './config.js';

// ---------------------------------------------------------------------------
// Instruction result type
// ---------------------------------------------------------------------------

/** Kamino instruction result (converted from TransactionInstruction). */
export interface KaminoInstruction {
  programId: string;
  /** Base64-encoded instruction data. */
  instructionData: string;
  accounts: Array<{ pubkey: string; isSigner: boolean; isWritable: boolean }>;
}

// ---------------------------------------------------------------------------
// Obligation / Reserve data types
// ---------------------------------------------------------------------------

export interface KaminoObligation {
  deposits: Array<{
    mintAddress: string;
    amount: bigint;
    marketValueUsd: number;
  }>;
  borrows: Array<{
    mintAddress: string;
    amount: bigint;
    marketValueUsd: number;
  }>;
  /** Pre-calculated by SDK from obligation account data. */
  loanToValue: number;
}

export interface KaminoReserve {
  mintAddress: string;
  symbol: string;
  supplyApy: number;
  borrowApy: number;
  ltvPct: number;
  availableLiquidity: string;
}

// ---------------------------------------------------------------------------
// SDK wrapper interface
// ---------------------------------------------------------------------------

/** Abstraction over @kamino-finance/klend-sdk for testability. */
export interface IKaminoSdkWrapper {
  buildSupplyInstruction(params: {
    market: string;
    asset: string;
    amount: bigint;
    walletAddress: string;
  }): Promise<KaminoInstruction[]>;

  buildBorrowInstruction(params: {
    market: string;
    asset: string;
    amount: bigint;
    walletAddress: string;
  }): Promise<KaminoInstruction[]>;

  buildRepayInstruction(params: {
    market: string;
    asset: string;
    amount: bigint | 'max';
    walletAddress: string;
  }): Promise<KaminoInstruction[]>;

  buildWithdrawInstruction(params: {
    market: string;
    asset: string;
    amount: bigint | 'max';
    walletAddress: string;
  }): Promise<KaminoInstruction[]>;

  /** Get obligation (position) data for a wallet. */
  getObligation(params: {
    market: string;
    walletAddress: string;
  }): Promise<KaminoObligation | null>;

  /** Get reserve data for market data queries. */
  getReserves(market: string): Promise<KaminoReserve[]>;
}

// ---------------------------------------------------------------------------
// Mock instruction data encoding
// ---------------------------------------------------------------------------

/**
 * Encode mock instruction data: 1-byte action index + 8-byte LE u64 amount.
 * NOT real Kamino CPI layout -- only for unit testing.
 */
function encodeMockInstructionData(actionIndex: number, amount: bigint): string {
  const buffer = new Uint8Array(9);
  buffer[0] = actionIndex;
  const view = new DataView(buffer.buffer);
  view.setBigUint64(1, amount, true);
  return Buffer.from(buffer).toString('base64');
}

/** u64 max value for 'max' amounts. */
const U64_MAX = BigInt('0xFFFFFFFFFFFFFFFF');

// ---------------------------------------------------------------------------
// Mock SDK wrapper (for unit testing)
// ---------------------------------------------------------------------------

/**
 * MockKaminoSdkWrapper: deterministic mock data for testing.
 *
 * Builds structurally valid KaminoInstruction arrays with recognizable
 * mock instruction data (action index prefix + amount as LE u64).
 */
export class MockKaminoSdkWrapper implements IKaminoSdkWrapper {
  async buildSupplyInstruction(params: {
    market: string;
    asset: string;
    amount: bigint;
    walletAddress: string;
  }): Promise<KaminoInstruction[]> {
    return [
      {
        programId: KAMINO_PROGRAM_ID,
        instructionData: encodeMockInstructionData(0, params.amount),
        accounts: [
          { pubkey: params.walletAddress, isSigner: true, isWritable: true },
          { pubkey: params.market, isSigner: false, isWritable: true },
          { pubkey: params.asset, isSigner: false, isWritable: true },
        ],
      },
    ];
  }

  async buildBorrowInstruction(params: {
    market: string;
    asset: string;
    amount: bigint;
    walletAddress: string;
  }): Promise<KaminoInstruction[]> {
    return [
      {
        programId: KAMINO_PROGRAM_ID,
        instructionData: encodeMockInstructionData(1, params.amount),
        accounts: [
          { pubkey: params.walletAddress, isSigner: true, isWritable: true },
          { pubkey: params.market, isSigner: false, isWritable: true },
          { pubkey: params.asset, isSigner: false, isWritable: false },
        ],
      },
    ];
  }

  async buildRepayInstruction(params: {
    market: string;
    asset: string;
    amount: bigint | 'max';
    walletAddress: string;
  }): Promise<KaminoInstruction[]> {
    const resolvedAmount = params.amount === 'max' ? U64_MAX : params.amount;
    return [
      {
        programId: KAMINO_PROGRAM_ID,
        instructionData: encodeMockInstructionData(2, resolvedAmount),
        accounts: [
          { pubkey: params.walletAddress, isSigner: true, isWritable: true },
          { pubkey: params.market, isSigner: false, isWritable: true },
          { pubkey: params.asset, isSigner: false, isWritable: true },
        ],
      },
    ];
  }

  async buildWithdrawInstruction(params: {
    market: string;
    asset: string;
    amount: bigint | 'max';
    walletAddress: string;
  }): Promise<KaminoInstruction[]> {
    const resolvedAmount = params.amount === 'max' ? U64_MAX : params.amount;
    return [
      {
        programId: KAMINO_PROGRAM_ID,
        instructionData: encodeMockInstructionData(3, resolvedAmount),
        accounts: [
          { pubkey: params.walletAddress, isSigner: true, isWritable: true },
          { pubkey: params.market, isSigner: false, isWritable: true },
          { pubkey: params.asset, isSigner: false, isWritable: true },
        ],
      },
    ];
  }

  async getObligation(_params: {
    market: string;
    walletAddress: string;
  }): Promise<KaminoObligation | null> {
    return {
      deposits: [
        {
          mintAddress: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
          amount: 10_000_000_000n, // 10,000 USDC (6 decimals)
          marketValueUsd: 10_000,
        },
      ],
      borrows: [
        {
          mintAddress: 'So11111111111111111111111111111111111111112',
          amount: 50_000_000_000n, // 50 SOL (9 decimals)
          marketValueUsd: 5_000,
        },
      ],
      loanToValue: 0.5,
    };
  }

  async getReserves(_market: string): Promise<KaminoReserve[]> {
    return [
      {
        mintAddress: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
        symbol: 'USDC',
        supplyApy: 0.045,
        borrowApy: 0.062,
        ltvPct: 85,
        availableLiquidity: '5000000000000',
      },
      {
        mintAddress: 'So11111111111111111111111111111111111111112',
        symbol: 'SOL',
        supplyApy: 0.032,
        borrowApy: 0.055,
        ltvPct: 75,
        availableLiquidity: '200000000000000',
      },
      {
        mintAddress: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',
        symbol: 'USDT',
        supplyApy: 0.042,
        borrowApy: 0.059,
        ltvPct: 80,
        availableLiquidity: '3000000000000',
      },
    ];
  }
}

// ---------------------------------------------------------------------------
// Real SDK wrapper (lazy import, graceful fallback)
// ---------------------------------------------------------------------------

/**
 * KaminoSdkWrapper: wraps @kamino-finance/klend-sdk.
 *
 * Lazily imports the SDK at first use. If the SDK is not installed,
 * all methods throw ChainError('INVALID_INSTRUCTION', 'solana').
 *
 * Converts TransactionInstruction results from the SDK
 * to KaminoInstruction format (programId + base64 + accounts).
 */
export class KaminoSdkWrapper implements IKaminoSdkWrapper {
  readonly rpcUrl: string;
  private readonly logger?: ILogger;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private _sdk: { Connection: any; PublicKey: any; KaminoMarket: any; KaminoAction: any; VanillaObligation: any } | null = null;

  constructor(rpcUrl: string, logger?: ILogger) {
    this.rpcUrl = rpcUrl;
    this.logger = logger;
  }

  private async loadSdk() {
    if (this._sdk) return this._sdk;
    try {
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore — optional dependency, may not be installed in CI
      const solana = await import('@solana/web3.js');
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore — optional dependency, may not be installed in CI
      const klend = await import('@kamino-finance/klend-sdk');
      this._sdk = {
        Connection: solana.Connection,
        PublicKey: solana.PublicKey,
        KaminoMarket: klend.KaminoMarket,
        KaminoAction: klend.KaminoAction,
        VanillaObligation: klend.VanillaObligation,
      };
      return this._sdk;
    } catch {
      const { ChainError } = await import('@waiaas/core');
      throw new ChainError('INVALID_INSTRUCTION', 'solana', {
        message:
          'Kamino K-Lend SDK not available. Install @kamino-finance/klend-sdk and @solana/web3.js as dependencies.',
      });
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async loadMarket(marketAddress: string): Promise<{ market: any; connection: any }> {
    const sdk = await this.loadSdk();
    const maxRetries = 3;
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const connection = new sdk.Connection(this.rpcUrl, 'confirmed');
        const marketPubkey = new sdk.PublicKey(marketAddress);
        const market = await sdk.KaminoMarket.load(connection, marketPubkey);
        if (!market) {
          const { ChainError } = await import('@waiaas/core');
          throw new ChainError('INVALID_INSTRUCTION', 'solana', {
            message: `Kamino market not found: ${marketAddress}`,
          });
        }
        return { market, connection };
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        const msg = lastError.message;
        // Only retry on rate limit / network errors, not on market-not-found
        if (msg.includes('market not found')) throw lastError;
        this.logger?.warn(`KaminoSdkWrapper.loadMarket: attempt ${attempt + 1}/${maxRetries} failed`, {
          error: msg,
        });
        if (attempt < maxRetries - 1) {
          const backoff = Math.min(1000 * Math.pow(2, attempt), 10_000);
          await new Promise((r) => setTimeout(r, backoff));
        }
      }
    }

    const { ChainError } = await import('@waiaas/core');
    throw new ChainError('RATE_LIMITED', 'solana', {
      message: `Kamino market load failed after ${maxRetries} retries: ${lastError?.message}`,
    });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private convertInstructions(ixs: any[]): KaminoInstruction[] {
    const validIxs = ixs.filter((ix) => ix.keys && ix.keys.length > 0);
    const skipped = ixs.length - validIxs.length;
    if (skipped > 0) {
      this.logger?.warn('Kamino SDK returned instructions with empty keys — filtered out', {
        skipped,
        total: ixs.length,
      });
    }
    return validIxs.map((ix) => ({
      programId: ix.programId.toBase58(),
      instructionData: Buffer.from(ix.data).toString('base64'),
      accounts: ix.keys.map((k: { pubkey: { toBase58(): string }; isSigner: boolean; isWritable: boolean }) => ({
        pubkey: k.pubkey.toBase58(),
        isSigner: k.isSigner,
        isWritable: k.isWritable,
      })),
    }));
  }

  async buildSupplyInstruction(params: {
    market: string;
    asset: string;
    amount: bigint;
    walletAddress: string;
  }): Promise<KaminoInstruction[]> {
    this.logger?.debug('KaminoSdkWrapper.buildSupplyInstruction', {
      asset: params.asset, amount: params.amount.toString(), market: params.market,
    });
    const sdk = await this.loadSdk();
    const { market } = await this.loadMarket(params.market);
    const wallet = new sdk.PublicKey(params.walletAddress);
    const mint = new sdk.PublicKey(params.asset);
    const action = await sdk.KaminoAction.buildDepositTxns(
      market, params.amount.toString(), mint, wallet, new sdk.VanillaObligation(new sdk.PublicKey(KAMINO_PROGRAM_ID)),
    );
    const allIxs = [...(action.setupIxs || []), ...action.lendingIxs, ...(action.cleanupIxs || [])];
    const filtered = allIxs.filter((ix: unknown) => ix != null);
    const result = this.convertInstructions(filtered);
    if (result.length === 0) {
      const { ChainError } = await import('@waiaas/core');
      throw new ChainError('INVALID_INSTRUCTION', 'solana', {
        message: 'Kamino SDK returned no valid instructions with accounts for supply',
      });
    }
    this.logger?.debug('KaminoSdkWrapper.buildSupplyInstruction result', {
      setupIxs: action.setupIxs?.length ?? 0, lendingIxs: action.lendingIxs?.length ?? 0,
      cleanupIxs: action.cleanupIxs?.length ?? 0, totalFiltered: filtered.length,
      resultAccounts: result.map((ix: KaminoInstruction) => ix.accounts.length),
    });
    return result;
  }

  async buildBorrowInstruction(params: {
    market: string;
    asset: string;
    amount: bigint;
    walletAddress: string;
  }): Promise<KaminoInstruction[]> {
    const sdk = await this.loadSdk();
    const { market } = await this.loadMarket(params.market);
    const wallet = new sdk.PublicKey(params.walletAddress);
    const mint = new sdk.PublicKey(params.asset);
    const action = await sdk.KaminoAction.buildBorrowTxns(
      market, params.amount.toString(), mint, wallet, new sdk.VanillaObligation(new sdk.PublicKey(KAMINO_PROGRAM_ID)),
    );
    const allIxs = [...(action.setupIxs || []), ...action.lendingIxs, ...(action.cleanupIxs || [])];
    const result = this.convertInstructions(allIxs.filter((ix: unknown) => ix != null));
    if (result.length === 0) {
      const { ChainError } = await import('@waiaas/core');
      throw new ChainError('INVALID_INSTRUCTION', 'solana', {
        message: 'Kamino SDK returned no valid instructions with accounts for borrow',
      });
    }
    return result;
  }

  async buildRepayInstruction(params: {
    market: string;
    asset: string;
    amount: bigint | 'max';
    walletAddress: string;
  }): Promise<KaminoInstruction[]> {
    const sdk = await this.loadSdk();
    const { market } = await this.loadMarket(params.market);
    const wallet = new sdk.PublicKey(params.walletAddress);
    const mint = new sdk.PublicKey(params.asset);
    const amountStr = params.amount === 'max' ? 'max' : params.amount.toString();
    const action = await sdk.KaminoAction.buildRepayTxns(
      market, amountStr, mint, wallet, new sdk.VanillaObligation(new sdk.PublicKey(KAMINO_PROGRAM_ID)),
    );
    const allIxs = [...(action.setupIxs || []), ...action.lendingIxs, ...(action.cleanupIxs || [])];
    const result = this.convertInstructions(allIxs.filter((ix: unknown) => ix != null));
    if (result.length === 0) {
      const { ChainError } = await import('@waiaas/core');
      throw new ChainError('INVALID_INSTRUCTION', 'solana', {
        message: 'Kamino SDK returned no valid instructions with accounts for repay',
      });
    }
    return result;
  }

  async buildWithdrawInstruction(params: {
    market: string;
    asset: string;
    amount: bigint | 'max';
    walletAddress: string;
  }): Promise<KaminoInstruction[]> {
    const sdk = await this.loadSdk();
    const { market } = await this.loadMarket(params.market);
    const wallet = new sdk.PublicKey(params.walletAddress);
    const mint = new sdk.PublicKey(params.asset);
    const amountStr = params.amount === 'max' ? 'max' : params.amount.toString();
    const action = await sdk.KaminoAction.buildWithdrawTxns(
      market, amountStr, mint, wallet, new sdk.VanillaObligation(new sdk.PublicKey(KAMINO_PROGRAM_ID)),
    );
    const allIxs = [...(action.setupIxs || []), ...action.lendingIxs, ...(action.cleanupIxs || [])];
    const result = this.convertInstructions(allIxs.filter((ix: unknown) => ix != null));
    if (result.length === 0) {
      const { ChainError } = await import('@waiaas/core');
      throw new ChainError('INVALID_INSTRUCTION', 'solana', {
        message: 'Kamino SDK returned no valid instructions with accounts for withdraw',
      });
    }
    return result;
  }

  async getObligation(params: {
    market: string;
    walletAddress: string;
  }): Promise<KaminoObligation | null> {
    const sdk = await this.loadSdk();
    const { market } = await this.loadMarket(params.market);
    const wallet = new sdk.PublicKey(params.walletAddress);
    await market.loadReserves();
    const obligations = await market.getObligationByWallet(wallet, new sdk.VanillaObligation(new sdk.PublicKey(KAMINO_PROGRAM_ID)));
    if (!obligations) return null;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const deposits = (obligations.deposits as any[])
      .filter((d) => Number(d.amount.toString()) > 0)
      .map((d) => ({
        mintAddress: String(d.mintAddress.toBase58?.() ?? d.mintAddress),
        amount: d.amount.toBigInt ? d.amount.toBigInt() : BigInt(d.amount.toString()),
        marketValueUsd: d.marketValueSf ? Number(d.marketValueSf.toString()) / 1e12 : 0,
      }));

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const borrows = (obligations.borrows as any[])
      .filter((b) => Number(b.amount.toString()) > 0)
      .map((b) => ({
        mintAddress: String(b.mintAddress.toBase58?.() ?? b.mintAddress),
        amount: b.amount.toBigInt ? b.amount.toBigInt() : BigInt(b.amount.toString()),
        marketValueUsd: b.marketValueSf ? Number(b.marketValueSf.toString()) / 1e12 : 0,
      }));

    const loanToValue = obligations.loanToValue?.() ?? 0;

    return { deposits, borrows, loanToValue };
  }

  async getReserves(market: string): Promise<KaminoReserve[]> {
    const { market: kaminoMarket } = await this.loadMarket(market);
    await kaminoMarket.loadReserves();
    const reserves = kaminoMarket.reserves;

    const result: KaminoReserve[] = [];
    for (const [, reserve] of reserves) {
      const stats = reserve.stats;
      if (!stats) continue;
      result.push({
        mintAddress: reserve.getLiquidityMint().toBase58(),
        symbol: stats.symbol ?? reserve.getLiquidityMint().toBase58().slice(0, 6),
        supplyApy: stats.supplyInterestAPY ?? 0,
        borrowApy: stats.borrowInterestAPY ?? 0,
        ltvPct: (stats.loanToValuePct ?? 0),
        availableLiquidity: stats.availableAmount?.toString() ?? '0',
      });
    }
    return result;
  }
}
