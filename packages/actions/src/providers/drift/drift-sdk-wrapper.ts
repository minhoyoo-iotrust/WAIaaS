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
import type { ILogger } from '@waiaas/core';
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
 * Converts TransactionInstruction results from the SDK
 * to DriftInstruction format (programId + base64 + accounts).
 */
export class DriftSdkWrapper implements IDriftSdkWrapper {
  readonly rpcUrl: string;
  readonly subAccount: number;
  private readonly resolveUrl: () => string;
  private readonly onRpcFailure?: (url: string) => void;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private _sdk: { Connection: any; PublicKey: any; Keypair: any; Wallet: any; BN: any; DriftClient: any; PositionDirection: any; OrderType: any; MarketType: any; PRICE_PRECISION: any; BASE_PRECISION: any; QUOTE_PRECISION: any; convertToNumber: any; getMarketOrderParams: any; getLimitOrderParams: any } | null = null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private _client: any = null;

  private readonly logger?: ILogger;

  constructor(rpcUrl: string | (() => string), subAccount: number, logger?: ILogger, onRpcFailure?: (url: string) => void) {
    this.resolveUrl = typeof rpcUrl === 'function' ? rpcUrl : () => rpcUrl;
    this.rpcUrl = typeof rpcUrl === 'string' ? rpcUrl : rpcUrl();
    this.subAccount = subAccount;
    this.logger = logger;
    this.onRpcFailure = onRpcFailure;
  }

  private async loadSdk(): Promise<NonNullable<typeof this._sdk>> {
    if (this._sdk) return this._sdk;
    try {
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore — optional dependency, may not be installed in CI
      const solana = await import('@solana/web3.js');
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore — optional dependency, may not be installed in CI
      const drift = await import('@drift-labs/sdk');
      this._sdk = {
        Connection: solana.Connection,
        PublicKey: solana.PublicKey,
        Keypair: solana.Keypair,
        Wallet: drift.Wallet,
        BN: drift.BN,
        DriftClient: drift.DriftClient,
        PositionDirection: drift.PositionDirection,
        OrderType: drift.OrderType,
        MarketType: drift.MarketType,
        PRICE_PRECISION: drift.PRICE_PRECISION,
        BASE_PRECISION: drift.BASE_PRECISION,
        QUOTE_PRECISION: drift.QUOTE_PRECISION,
        convertToNumber: drift.convertToNumber,
        getMarketOrderParams: drift.getMarketOrderParams,
        getLimitOrderParams: drift.getLimitOrderParams,
      };
      return this._sdk;
    } catch {
      const { ChainError } = await import('@waiaas/core');
      throw new ChainError('INVALID_INSTRUCTION', 'solana', {
        message:
          'Drift SDK not available. Install @drift-labs/sdk and @solana/web3.js as optional dependencies.',
      });
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async getClient(): Promise<any> {
    if (this._client) return this._client;
    this.logger?.debug('DriftSdkWrapper.getClient: initializing', { rpcUrl: this.resolveUrl(), subAccount: this.subAccount });
    const sdk = await this.loadSdk();

    const maxRetries = 3;
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      const currentUrl = this.resolveUrl();
      const connection = new sdk.Connection(currentUrl, 'confirmed');
      const client = new sdk.DriftClient({
        connection,
        wallet: new sdk.Wallet(sdk.Keypair.generate()),
        programID: new sdk.PublicKey(DRIFT_PROGRAM_ID),
        activeSubAccountId: this.subAccount,
      });
      try {
        await client.subscribe();
        this.logger?.debug('DriftSdkWrapper.getClient: subscribe succeeded');
        this._client = client;
        return client;
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        // #420: Report failure to RpcPool so next resolve returns a different URL
        this.onRpcFailure?.(currentUrl);
        this.logger?.warn(`DriftSdkWrapper.getClient: subscribe attempt ${attempt + 1}/${maxRetries} failed`, {
          error: lastError.message, rpcUrl: currentUrl,
        });
        if (attempt < maxRetries - 1) {
          const backoff = Math.min(1000 * Math.pow(2, attempt), 10_000);
          await new Promise((r) => setTimeout(r, backoff));
        }
      }
    }

    const { ChainError } = await import('@waiaas/core');
    throw new ChainError('RATE_LIMITED', 'solana', {
      message: `Drift SDK initialization failed after ${maxRetries} retries: ${lastError?.message}`,
    });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private convertInstruction(ix: any): DriftInstruction {
    return {
      programId: ix.programId.toBase58(),
      instructionData: Buffer.from(ix.data).toString('base64'),
      accounts: ix.keys.map((k: { pubkey: { toBase58(): string }; isSigner: boolean; isWritable: boolean }) => ({
        pubkey: k.pubkey.toBase58(),
        isSigner: k.isSigner,
        isWritable: k.isWritable,
      })),
    };
  }

  private resolveMarketIndex(market: string): number {
    const match = market.match(/^(\w+)-PERP$/);
    if (!match || !match[1]) return 0;
    const known: Record<string, number> = { SOL: 0, BTC: 1, ETH: 2, APT: 3, MATIC: 4, ARB: 5, DOGE: 6, BNB: 7, SUI: 8, PEPE: 9 };
    return known[match[1]] ?? 0;
  }

  async buildOpenPositionInstruction(params: {
    market: string;
    direction: 'LONG' | 'SHORT';
    size: string;
    orderType: 'MARKET' | 'LIMIT';
    limitPrice?: string;
    walletAddress: string;
  }): Promise<DriftInstruction[]> {
    const sdk = await this.loadSdk();
    const client = await this.getClient();
    const marketIndex = this.resolveMarketIndex(params.market);
    const direction = params.direction === 'LONG' ? sdk.PositionDirection.LONG : sdk.PositionDirection.SHORT;
    const baseAmount = new sdk.BN(parseFloat(params.size) * 1e9);

    let orderParams;
    if (params.orderType === 'LIMIT' && params.limitPrice) {
      const price = new sdk.BN(parseFloat(params.limitPrice) * 1e6);
      orderParams = sdk.getLimitOrderParams({ marketIndex, direction, baseAssetAmount: baseAmount, price, marketType: sdk.MarketType.PERP });
    } else {
      orderParams = sdk.getMarketOrderParams({ marketIndex, direction, baseAssetAmount: baseAmount, marketType: sdk.MarketType.PERP });
    }
    const ix = await client.getPlacePerpOrderIx(orderParams);
    return [this.convertInstruction(ix)];
  }

  async buildClosePositionInstruction(params: {
    market: string;
    size?: string;
    walletAddress: string;
  }): Promise<DriftInstruction[]> {
    const sdk = await this.loadSdk();
    const client = await this.getClient();
    const marketIndex = this.resolveMarketIndex(params.market);

    if (!params.size) {
      const ix = await client.getCloseSpotMarketOrderIx
        ? await client.getPlacePerpOrderIx(sdk.getMarketOrderParams({
            marketIndex,
            direction: sdk.PositionDirection.SHORT,
            baseAssetAmount: new sdk.BN(0),
            reduceOnly: true,
            marketType: sdk.MarketType.PERP,
          }))
        : await client.getPlacePerpOrderIx(sdk.getMarketOrderParams({
            marketIndex,
            direction: sdk.PositionDirection.SHORT,
            baseAssetAmount: new sdk.BN(0),
            reduceOnly: true,
            marketType: sdk.MarketType.PERP,
          }));
      return [this.convertInstruction(ix)];
    }

    const baseAmount = new sdk.BN(parseFloat(params.size) * 1e9);
    const ix = await client.getPlacePerpOrderIx(sdk.getMarketOrderParams({
      marketIndex,
      direction: sdk.PositionDirection.SHORT,
      baseAssetAmount: baseAmount,
      reduceOnly: true,
      marketType: sdk.MarketType.PERP,
    }));
    return [this.convertInstruction(ix)];
  }

  async buildModifyPositionInstruction(params: {
    market: string;
    newSize?: string;
    newLimitPrice?: string;
    walletAddress: string;
  }): Promise<DriftInstruction[]> {
    const sdk = await this.loadSdk();
    const client = await this.getClient();
    const marketIndex = this.resolveMarketIndex(params.market);

    const orderParams: Record<string, unknown> = {
      marketIndex,
      marketType: sdk.MarketType.PERP,
    };
    if (params.newSize) {
      orderParams.baseAssetAmount = new sdk.BN(parseFloat(params.newSize) * 1e9);
    }
    if (params.newLimitPrice) {
      orderParams.price = new sdk.BN(parseFloat(params.newLimitPrice) * 1e6);
    }
    const ix = await client.getPlacePerpOrderIx(orderParams);
    return [this.convertInstruction(ix)];
  }

  async buildDepositInstruction(params: {
    amount: string;
    asset: string;
    walletAddress: string;
  }): Promise<DriftInstruction[]> {
    const sdk = await this.loadSdk();
    const client = await this.getClient();
    const amount = new sdk.BN(parseFloat(params.amount) * 1e6);
    const ix = await client.getDepositIx(amount, 0, new sdk.PublicKey(params.walletAddress));
    return [this.convertInstruction(ix)];
  }

  async buildWithdrawInstruction(params: {
    amount: string;
    asset: string;
    walletAddress: string;
  }): Promise<DriftInstruction[]> {
    const sdk = await this.loadSdk();
    const client = await this.getClient();
    const amount = new sdk.BN(parseFloat(params.amount) * 1e6);
    const ix = await client.getWithdrawIx(amount, 0);
    return [this.convertInstruction(ix)];
  }

  async getPositions(_walletAddress: string): Promise<DriftPosition[]> {
    const sdk = await this.loadSdk();
    const client = await this.getClient();
    const user = client.getUser();
    const perpPositions = user.getActivePerpPositions();

    return perpPositions.map((pos: { marketIndex: number; baseAssetAmount: { toString(): string; toNumber(): number }; quoteEntryAmount: { toNumber(): number }; quoteBreakEvenAmount: { toNumber(): number } }) => {
      const isLong = pos.baseAssetAmount.toNumber() > 0;
      const baseAmount = Math.abs(pos.baseAssetAmount.toNumber()) / 1e9;
      const entryPrice = pos.quoteEntryAmount
        ? Math.abs(pos.quoteEntryAmount.toNumber() / 1e6) / baseAmount
        : null;
      const market = client.getPerpMarketAccount(pos.marketIndex);
      const oraclePrice = market?.amm?.lastOracleNormalisedPrice
        ? sdk.convertToNumber(market.amm.lastOracleNormalisedPrice, sdk.PRICE_PRECISION)
        : null;
      const notional = oraclePrice ? baseAmount * oraclePrice : null;
      const unrealizedPnl = oraclePrice && entryPrice
        ? (oraclePrice - entryPrice) * baseAmount * (isLong ? 1 : -1)
        : null;

      return {
        market: `${market?.name ? Buffer.from(market.name).toString('utf-8').replace(/\0/g, '').trim() : `PERP-${pos.marketIndex}`}`,
        marketIndex: pos.marketIndex,
        direction: isLong ? 'LONG' as const : 'SHORT' as const,
        baseAssetAmount: pos.baseAssetAmount.toString(),
        entryPrice,
        leverage: 1,
        unrealizedPnl,
        liquidationPrice: null,
        margin: null,
        notionalValueUsd: notional,
      };
    });
  }

  async getMarginInfo(_walletAddress: string): Promise<DriftMarginInfo> {
    const sdk = await this.loadSdk();
    const client = await this.getClient();
    const user = client.getUser();

    const totalCollateral = sdk.convertToNumber(user.getTotalCollateral(), sdk.QUOTE_PRECISION);
    const freeCollateral = sdk.convertToNumber(user.getFreeCollateral(), sdk.QUOTE_PRECISION);
    const marginRatio = user.getMarginRatio ? sdk.convertToNumber(user.getMarginRatio(), new sdk.BN(10000)) : 0.3;

    return {
      totalMargin: totalCollateral,
      freeMargin: freeCollateral,
      maintenanceMarginRatio: 0.0625,
      marginRatio,
    };
  }

  async getMarkets(): Promise<DriftMarketInfo[]> {
    const sdk = await this.loadSdk();
    const client = await this.getClient();
    const perpMarkets = client.getPerpMarketAccounts();

    return perpMarkets.map((market: { marketIndex: number; name: Uint8Array; amm: { lastOracleNormalisedPrice: unknown; baseAssetAmountLong: { toNumber(): number }; baseAssetAmountShort: { toNumber(): number } }; marginRatioInitial: number; lastFundingRate?: unknown }) => {
      const name = Buffer.from(market.name).toString('utf-8').replace(/\0/g, '').trim();
      const baseAsset = name.replace(/-PERP$/, '');
      const oraclePrice = market.amm?.lastOracleNormalisedPrice
        ? sdk.convertToNumber(market.amm.lastOracleNormalisedPrice, sdk.PRICE_PRECISION)
        : null;
      const oi = market.amm
        ? (Math.abs(market.amm.baseAssetAmountLong.toNumber()) + Math.abs(market.amm.baseAssetAmountShort.toNumber())) / 1e9 * (oraclePrice ?? 0)
        : null;
      const fundingRate = market.lastFundingRate
        ? sdk.convertToNumber(market.lastFundingRate, sdk.PRICE_PRECISION)
        : null;
      const maxLeverage = market.marginRatioInitial > 0
        ? Math.round(10000 / market.marginRatioInitial)
        : 20;

      return {
        market: name,
        marketIndex: market.marketIndex,
        baseAsset,
        maxLeverage,
        fundingRate,
        openInterest: oi,
        oraclePrice,
      };
    });
  }
}
