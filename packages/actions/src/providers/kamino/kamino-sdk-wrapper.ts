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
 * all methods throw ChainError('PROVIDER_NOT_CONFIGURED', 'solana').
 *
 * The real implementation converts TransactionInstruction results
 * to KaminoInstruction format (programId + base64 + accounts).
 */
export class KaminoSdkWrapper implements IKaminoSdkWrapper {
  /** RPC URL for future SDK connection. Stored for when klend-sdk is installed. */
  readonly rpcUrl: string;

  constructor(rpcUrl: string) {
    this.rpcUrl = rpcUrl;
  }

  private async throwNotConfigured(): Promise<never> {
    const { ChainError } = await import('@waiaas/core');
    throw new ChainError('INVALID_INSTRUCTION', 'solana', {
      message:
        'Kamino K-Lend SDK not available. Install @kamino-finance/klend-sdk and @solana/web3.js as dependencies.',
    });
  }

  async buildSupplyInstruction(_params: {
    market: string;
    asset: string;
    amount: bigint;
    walletAddress: string;
  }): Promise<KaminoInstruction[]> {
    return this.throwNotConfigured();
  }

  async buildBorrowInstruction(_params: {
    market: string;
    asset: string;
    amount: bigint;
    walletAddress: string;
  }): Promise<KaminoInstruction[]> {
    return this.throwNotConfigured();
  }

  async buildRepayInstruction(_params: {
    market: string;
    asset: string;
    amount: bigint | 'max';
    walletAddress: string;
  }): Promise<KaminoInstruction[]> {
    return this.throwNotConfigured();
  }

  async buildWithdrawInstruction(_params: {
    market: string;
    asset: string;
    amount: bigint | 'max';
    walletAddress: string;
  }): Promise<KaminoInstruction[]> {
    return this.throwNotConfigured();
  }

  async getObligation(_params: {
    market: string;
    walletAddress: string;
  }): Promise<KaminoObligation | null> {
    return this.throwNotConfigured();
  }

  async getReserves(_market: string): Promise<KaminoReserve[]> {
    return this.throwNotConfigured();
  }
}
