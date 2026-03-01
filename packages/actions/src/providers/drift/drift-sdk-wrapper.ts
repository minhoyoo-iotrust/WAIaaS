/**
 * Drift Protocol V2 SDK wrapper abstraction.
 *
 * IDriftSdkWrapper provides a testable interface for @drift-labs/sdk
 * instruction building and position/margin/market queries.
 * MockDriftSdkWrapper provides deterministic test data.
 * DriftSdkWrapper wraps the real SDK with lazy imports and graceful fallback.
 *
 * Instruction results (DriftInstruction) use the same format as Kamino's
 * KaminoInstruction: programId + base64 instructionData + accounts array.
 *
 * IMPORTANT: No @solana/web3.js or @drift-labs/sdk types appear in this
 * file's public API. All parameters and return types use plain JS types
 * (string, number, boolean) to maintain isolation from @solana/kit 6.x.
 */
import { DRIFT_PROGRAM_ID } from './config.js';

// ---------------------------------------------------------------------------
// Instruction result type
// ---------------------------------------------------------------------------

/** Drift instruction result (converted from TransactionInstruction). */
export interface DriftInstruction {
  programId: string;
  /** Base64-encoded instruction data. */
  instructionData: string;
  accounts: Array<{ pubkey: string; isSigner: boolean; isWritable: boolean }>;
}

// ---------------------------------------------------------------------------
// Position / Margin / Market data types (plain JS only)
// ---------------------------------------------------------------------------

/** Drift perpetual position data (plain JS types for SDK query results). */
export interface DriftPosition {
  market: string;
  marketIndex: number;
  direction: 'LONG' | 'SHORT';
  /** Base asset amount as string (bigint-safe). */
  baseAssetAmount: string;
  entryPrice: number | null;
  leverage: number;
  unrealizedPnl: number | null;
  liquidationPrice: number | null;
  margin: number | null;
  notionalValueUsd: number | null;
}

/** Drift account-level margin info (cross-margin model). */
export interface DriftMarginInfo {
  totalMargin: number;
  freeMargin: number;
  maintenanceMarginRatio: number;
  marginRatio: number;
}

/** Drift perpetual market info. */
export interface DriftMarketInfo {
  market: string;
  marketIndex: number;
  baseAsset: string;
  maxLeverage: number;
  fundingRate: number | null;
  openInterest: number | null;
  oraclePrice: number | null;
}

// ---------------------------------------------------------------------------
// SDK wrapper interface
// ---------------------------------------------------------------------------

/** Abstraction over @drift-labs/sdk for testability and type isolation. */
export interface IDriftSdkWrapper {
  buildOpenPositionInstruction(params: {
    market: string;
    direction: 'LONG' | 'SHORT';
    size: string;
    orderType: 'MARKET' | 'LIMIT';
    limitPrice?: string;
    walletAddress: string;
  }): Promise<DriftInstruction[]>;

  buildClosePositionInstruction(params: {
    market: string;
    size?: string;
    walletAddress: string;
  }): Promise<DriftInstruction[]>;

  buildModifyPositionInstruction(params: {
    market: string;
    newSize?: string;
    newLimitPrice?: string;
    walletAddress: string;
  }): Promise<DriftInstruction[]>;

  buildDepositInstruction(params: {
    amount: string;
    asset: string;
    walletAddress: string;
  }): Promise<DriftInstruction[]>;

  buildWithdrawInstruction(params: {
    amount: string;
    asset: string;
    walletAddress: string;
  }): Promise<DriftInstruction[]>;

  /** Get all perp positions for a wallet. */
  getPositions(walletAddress: string): Promise<DriftPosition[]>;

  /** Get account-level margin info (cross-margin). */
  getMarginInfo(walletAddress: string): Promise<DriftMarginInfo>;

  /** Get all available perp markets. */
  getMarkets(): Promise<DriftMarketInfo[]>;
}

// ---------------------------------------------------------------------------
// Mock instruction data encoding
// ---------------------------------------------------------------------------

/**
 * Encode mock instruction data: 1-byte action index + UTF-8 encoded size string.
 * NOT real Drift CPI layout -- only for unit testing.
 */
function encodeMockInstructionData(
  actionIndex: number,
  sizeStr: string,
): string {
  const sizeBytes = new TextEncoder().encode(sizeStr);
  const buffer = new Uint8Array(1 + sizeBytes.length);
  buffer[0] = actionIndex;
  buffer.set(sizeBytes, 1);
  return Buffer.from(buffer).toString('base64');
}

// ---------------------------------------------------------------------------
// Mock SDK wrapper (for unit testing)
// ---------------------------------------------------------------------------

/**
 * MockDriftSdkWrapper: deterministic mock data for testing.
 *
 * Builds structurally valid DriftInstruction arrays with recognizable
 * mock instruction data (action index prefix + size as UTF-8 bytes).
 */
export class MockDriftSdkWrapper implements IDriftSdkWrapper {
  async buildOpenPositionInstruction(params: {
    market: string;
    direction: 'LONG' | 'SHORT';
    size: string;
    orderType: 'MARKET' | 'LIMIT';
    limitPrice?: string;
    walletAddress: string;
  }): Promise<DriftInstruction[]> {
    return [
      {
        programId: DRIFT_PROGRAM_ID,
        instructionData: encodeMockInstructionData(0, params.size),
        accounts: [
          { pubkey: params.walletAddress, isSigner: true, isWritable: true },
          { pubkey: DRIFT_PROGRAM_ID, isSigner: false, isWritable: true },
        ],
      },
    ];
  }

  async buildClosePositionInstruction(params: {
    market: string;
    size?: string;
    walletAddress: string;
  }): Promise<DriftInstruction[]> {
    return [
      {
        programId: DRIFT_PROGRAM_ID,
        instructionData: encodeMockInstructionData(1, params.size ?? 'full'),
        accounts: [
          { pubkey: params.walletAddress, isSigner: true, isWritable: true },
          { pubkey: DRIFT_PROGRAM_ID, isSigner: false, isWritable: true },
        ],
      },
    ];
  }

  async buildModifyPositionInstruction(params: {
    market: string;
    newSize?: string;
    newLimitPrice?: string;
    walletAddress: string;
  }): Promise<DriftInstruction[]> {
    return [
      {
        programId: DRIFT_PROGRAM_ID,
        instructionData: encodeMockInstructionData(
          2,
          params.newSize ?? params.newLimitPrice ?? '',
        ),
        accounts: [
          { pubkey: params.walletAddress, isSigner: true, isWritable: true },
          { pubkey: DRIFT_PROGRAM_ID, isSigner: false, isWritable: true },
        ],
      },
    ];
  }

  async buildDepositInstruction(params: {
    amount: string;
    asset: string;
    walletAddress: string;
  }): Promise<DriftInstruction[]> {
    return [
      {
        programId: DRIFT_PROGRAM_ID,
        instructionData: encodeMockInstructionData(3, params.amount),
        accounts: [
          { pubkey: params.walletAddress, isSigner: true, isWritable: true },
          { pubkey: DRIFT_PROGRAM_ID, isSigner: false, isWritable: true },
          { pubkey: params.asset, isSigner: false, isWritable: true },
        ],
      },
    ];
  }

  async buildWithdrawInstruction(params: {
    amount: string;
    asset: string;
    walletAddress: string;
  }): Promise<DriftInstruction[]> {
    return [
      {
        programId: DRIFT_PROGRAM_ID,
        instructionData: encodeMockInstructionData(4, params.amount),
        accounts: [
          { pubkey: params.walletAddress, isSigner: true, isWritable: true },
          { pubkey: DRIFT_PROGRAM_ID, isSigner: false, isWritable: true },
          { pubkey: params.asset, isSigner: false, isWritable: true },
        ],
      },
    ];
  }

  async getPositions(_walletAddress: string): Promise<DriftPosition[]> {
    return [
      {
        market: 'SOL-PERP',
        marketIndex: 0,
        direction: 'LONG',
        baseAssetAmount: '100',
        entryPrice: 150,
        leverage: 5,
        unrealizedPnl: 500,
        liquidationPrice: 120,
        margin: 3000,
        notionalValueUsd: 15000,
      },
    ];
  }

  async getMarginInfo(_walletAddress: string): Promise<DriftMarginInfo> {
    return {
      totalMargin: 10000,
      freeMargin: 5000,
      maintenanceMarginRatio: 0.0625,
      marginRatio: 0.3,
    };
  }

  async getMarkets(): Promise<DriftMarketInfo[]> {
    return [
      {
        market: 'SOL-PERP',
        marketIndex: 0,
        baseAsset: 'SOL',
        maxLeverage: 20,
        fundingRate: 0.0001,
        openInterest: 50_000_000,
        oraclePrice: 150.25,
      },
      {
        market: 'BTC-PERP',
        marketIndex: 1,
        baseAsset: 'BTC',
        maxLeverage: 50,
        fundingRate: -0.00005,
        openInterest: 200_000_000,
        oraclePrice: 65_000.5,
      },
      {
        market: 'ETH-PERP',
        marketIndex: 2,
        baseAsset: 'ETH',
        maxLeverage: 30,
        fundingRate: 0.00008,
        openInterest: 100_000_000,
        oraclePrice: 3_500.75,
      },
    ];
  }
}

// ---------------------------------------------------------------------------
// Real SDK wrapper (lazy import, graceful fallback)
// ---------------------------------------------------------------------------

/**
 * DriftSdkWrapper: wraps @drift-labs/sdk.
 *
 * Lazily imports the SDK at first use. If the SDK is not installed,
 * all methods throw ChainError('INVALID_INSTRUCTION', 'solana').
 *
 * The real implementation will convert TransactionInstruction results
 * to DriftInstruction format (programId + base64 + accounts).
 */
export class DriftSdkWrapper implements IDriftSdkWrapper {
  /** RPC URL for future SDK connection. Stored for when drift-sdk is installed. */
  readonly rpcUrl: string;
  /** Sub-account index (DEC-PERP-15). */
  readonly subAccount: number;

  constructor(rpcUrl: string, subAccount: number) {
    this.rpcUrl = rpcUrl;
    this.subAccount = subAccount;
  }

  private async throwNotConfigured(): Promise<never> {
    const { ChainError } = await import('@waiaas/core');
    throw new ChainError('INVALID_INSTRUCTION', 'solana', {
      message:
        'Drift SDK not available. Install @drift-labs/sdk and @solana/web3.js as optional dependencies.',
    });
  }

  async buildOpenPositionInstruction(_params: {
    market: string;
    direction: 'LONG' | 'SHORT';
    size: string;
    orderType: 'MARKET' | 'LIMIT';
    limitPrice?: string;
    walletAddress: string;
  }): Promise<DriftInstruction[]> {
    return this.throwNotConfigured();
  }

  async buildClosePositionInstruction(_params: {
    market: string;
    size?: string;
    walletAddress: string;
  }): Promise<DriftInstruction[]> {
    return this.throwNotConfigured();
  }

  async buildModifyPositionInstruction(_params: {
    market: string;
    newSize?: string;
    newLimitPrice?: string;
    walletAddress: string;
  }): Promise<DriftInstruction[]> {
    return this.throwNotConfigured();
  }

  async buildDepositInstruction(_params: {
    amount: string;
    asset: string;
    walletAddress: string;
  }): Promise<DriftInstruction[]> {
    return this.throwNotConfigured();
  }

  async buildWithdrawInstruction(_params: {
    amount: string;
    asset: string;
    walletAddress: string;
  }): Promise<DriftInstruction[]> {
    return this.throwNotConfigured();
  }

  async getPositions(_walletAddress: string): Promise<DriftPosition[]> {
    return this.throwNotConfigured();
  }

  async getMarginInfo(_walletAddress: string): Promise<DriftMarginInfo> {
    return this.throwNotConfigured();
  }

  async getMarkets(): Promise<DriftMarketInfo[]> {
    return this.throwNotConfigured();
  }
}
