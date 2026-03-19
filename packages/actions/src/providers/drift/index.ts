/**
 * Drift Protocol V2 Perpetual Trading Action Provider.
 *
 * Implements IPerpProvider + IPositionProvider to resolve Drift perp trading
 * requests into ContractCallRequest arrays for the sequential pipeline.
 *
 * Actions:
 * - drift_open_position: open LONG/SHORT with market/limit orders (high, APPROVAL)
 * - drift_close_position: full or partial close (medium, DELAY)
 * - drift_modify_position: change size or limit price (high, APPROVAL)
 * - drift_add_margin: deposit collateral (low, INSTANT)
 * - drift_withdraw_margin: withdraw excess collateral (medium, DELAY)
 *
 * Uses IDriftSdkWrapper for instruction building and position/margin queries.
 * MockDriftSdkWrapper enables unit testing without real SDK/RPC.
 */
import { ChainError } from '@waiaas/core';
import type {
  IPerpProvider,
  ActionProviderMetadata,
  ActionDefinition,
  ActionContext,
  ContractCallRequest,
  PerpPositionSummary,
  MarginInfo,
  PerpMarketInfo,
} from '@waiaas/core';
import type {
  IPositionProvider,
  PositionUpdate,
  PositionCategory,
  PositionQueryContext,
} from '@waiaas/core';
import { DRIFT_DEFAULTS, DRIFT_PROGRAM_ID } from './config.js';
import type { DriftConfig } from './config.js';
import type { IDriftSdkWrapper, DriftInstruction } from './drift-sdk-wrapper.js';
import { MockDriftSdkWrapper } from './drift-sdk-wrapper.js';
import {
  OpenPositionInputSchema,
  ClosePositionInputSchema,
  ModifyPositionInputSchema,
  AddMarginInputSchema,
  WithdrawMarginInputSchema,
} from './schemas.js';
import { DriftMarketData } from './drift-market-data.js';

// ---------------------------------------------------------------------------
// Module-level helpers (not exported)
// ---------------------------------------------------------------------------

/**
 * Convert DriftInstruction[] to ContractCallRequest[].
 * Each instruction targets the Drift V2 program on Solana mainnet.
 */
function instructionsToRequests(
  instructions: DriftInstruction[],
): ContractCallRequest[] {
  return instructions.map((ix) => ({
    type: 'CONTRACT_CALL' as const,
    to: DRIFT_PROGRAM_ID,
    programId: ix.programId,
    instructionData: ix.instructionData,
    accounts: ix.accounts,
    network: 'solana-mainnet' as const,
  }));
}

/**
 * Compute margin status from marginRatio.
 * Thresholds match MarginMonitor from 297-02 (0.30/0.15/0.10).
 * Lower marginRatio = more dangerous.
 */
function marginRatioToStatus(
  marginRatio: number,
): 'safe' | 'warning' | 'danger' | 'critical' {
  if (marginRatio <= 0.10) return 'critical';
  if (marginRatio <= 0.15) return 'danger';
  if (marginRatio <= 0.30) return 'warning';
  return 'safe';
}

// ---------------------------------------------------------------------------
// Provider implementation
// ---------------------------------------------------------------------------

export class DriftPerpProvider implements IPerpProvider, IPositionProvider {
  readonly metadata: ActionProviderMetadata;
  readonly actions: readonly ActionDefinition[];

  /** Merged config (stored for real SDK wrapper construction). */
  readonly config: DriftConfig;
  private readonly sdkWrapper: IDriftSdkWrapper;
  private readonly marketData: DriftMarketData;

  constructor(config?: Partial<DriftConfig>, sdkWrapper?: IDriftSdkWrapper) {
    this.config = { ...DRIFT_DEFAULTS, ...config };
    this.sdkWrapper = sdkWrapper ?? new MockDriftSdkWrapper();
    this.marketData = new DriftMarketData(this.sdkWrapper);

    this.metadata = {
      name: 'drift_perp',
      displayName: 'Drift Perp',
      description:
        'Drift Protocol V2 perpetual futures on Solana: open, close, modify positions with leverage and margin management',
      version: '1.0.0',
      chains: ['solana'],
      mcpExpose: true,
      requiresApiKey: false,
      requiredApis: [],
      requiresSigningKey: false,
    };

    this.actions = [
      {
        name: 'drift_open_position',
        description:
          'Open a leveraged perpetual position (LONG or SHORT) on Drift V2 with market or limit order',
        chain: 'solana',
        inputSchema: OpenPositionInputSchema,
        riskLevel: 'high',
        defaultTier: 'APPROVAL',
      },
      {
        name: 'drift_close_position',
        description:
          'Close a perpetual position on Drift V2 (full close or partial close with size parameter)',
        chain: 'solana',
        inputSchema: ClosePositionInputSchema,
        riskLevel: 'medium',
        defaultTier: 'DELAY',
      },
      {
        name: 'drift_modify_position',
        description:
          'Modify an existing perpetual position on Drift V2 by changing size or limit price',
        chain: 'solana',
        inputSchema: ModifyPositionInputSchema,
        riskLevel: 'high',
        defaultTier: 'APPROVAL',
      },
      {
        name: 'drift_add_margin',
        description:
          'Deposit collateral to increase available margin on Drift V2 margin account',
        chain: 'solana',
        inputSchema: AddMarginInputSchema,
        riskLevel: 'low',
        defaultTier: 'INSTANT',
      },
      {
        name: 'drift_withdraw_margin',
        description:
          'Withdraw excess collateral from Drift V2 margin account to wallet',
        chain: 'solana',
        inputSchema: WithdrawMarginInputSchema,
        riskLevel: 'medium',
        defaultTier: 'DELAY',
      },
    ] as const;
  }

  // -------------------------------------------------------------------------
  // IActionProvider.resolve()
  // -------------------------------------------------------------------------

  async resolve(
    actionName: string,
    params: Record<string, unknown>,
    context: ActionContext,
  ): Promise<ContractCallRequest | ContractCallRequest[]> {
    switch (actionName) {
      case 'drift_open_position':
        return this.resolveOpenPosition(params, context);
      case 'drift_close_position':
        return this.resolveClosePosition(params, context);
      case 'drift_modify_position':
        return this.resolveModifyPosition(params, context);
      case 'drift_add_margin':
        return this.resolveAddMargin(params, context);
      case 'drift_withdraw_margin':
        return this.resolveWithdrawMargin(params, context);
      default:
        throw new ChainError('INVALID_INSTRUCTION', 'solana', {
          message: `Unknown action: ${actionName}`,
        });
    }
  }

  // -------------------------------------------------------------------------
  // Open position: MARKET or LIMIT order
  // -------------------------------------------------------------------------

  private async resolveOpenPosition(
    params: Record<string, unknown>,
    context: ActionContext,
  ): Promise<ContractCallRequest[]> {
    const input = OpenPositionInputSchema.parse(params);
    const instructions =
      await this.sdkWrapper.buildOpenPositionInstruction({
        market: input.market,
        direction: input.direction,
        size: input.size,
        orderType: input.orderType,
        limitPrice: input.limitPrice,
        walletAddress: context.walletAddress,
      });
    return instructionsToRequests(instructions);
  }

  // -------------------------------------------------------------------------
  // Close position: full (no size) or partial (with size)
  // -------------------------------------------------------------------------

  private async resolveClosePosition(
    params: Record<string, unknown>,
    context: ActionContext,
  ): Promise<ContractCallRequest[]> {
    const input = ClosePositionInputSchema.parse(params);
    const instructions =
      await this.sdkWrapper.buildClosePositionInstruction({
        market: input.market,
        size: input.size,
        walletAddress: context.walletAddress,
      });
    return instructionsToRequests(instructions);
  }

  // -------------------------------------------------------------------------
  // Modify position: newSize and/or newLimitPrice
  // -------------------------------------------------------------------------

  private async resolveModifyPosition(
    params: Record<string, unknown>,
    context: ActionContext,
  ): Promise<ContractCallRequest[]> {
    const input = ModifyPositionInputSchema.parse(params);
    const instructions =
      await this.sdkWrapper.buildModifyPositionInstruction({
        market: input.market,
        newSize: input.newSize,
        newLimitPrice: input.newLimitPrice,
        walletAddress: context.walletAddress,
      });
    return instructionsToRequests(instructions);
  }

  // -------------------------------------------------------------------------
  // Add margin: deposit collateral
  // -------------------------------------------------------------------------

  private async resolveAddMargin(
    params: Record<string, unknown>,
    context: ActionContext,
  ): Promise<ContractCallRequest[]> {
    const input = AddMarginInputSchema.parse(params);
    const instructions = await this.sdkWrapper.buildDepositInstruction({
      amount: input.amount,
      asset: input.asset,
      walletAddress: context.walletAddress,
    });
    return instructionsToRequests(instructions);
  }

  // -------------------------------------------------------------------------
  // Withdraw margin: withdraw excess collateral
  // -------------------------------------------------------------------------

  private async resolveWithdrawMargin(
    params: Record<string, unknown>,
    context: ActionContext,
  ): Promise<ContractCallRequest[]> {
    const input = WithdrawMarginInputSchema.parse(params);
    const instructions = await this.sdkWrapper.buildWithdrawInstruction({
      amount: input.amount,
      asset: input.asset,
      walletAddress: context.walletAddress,
    });
    return instructionsToRequests(instructions);
  }

  // -------------------------------------------------------------------------
  // IPerpProvider query methods
  // -------------------------------------------------------------------------

  async getPosition(
    _walletId: string,
    context: ActionContext,
  ): Promise<PerpPositionSummary[]> {
    try {
      const positions = await this.sdkWrapper.getPositions(
        context.walletAddress,
      );
      return positions.map((p) => ({
        market: p.market,
        direction: p.direction,
        size: p.baseAssetAmount,
        entryPrice: p.entryPrice,
        leverage: p.leverage,
        unrealizedPnl: p.unrealizedPnl,
        margin: p.margin,
        liquidationPrice: p.liquidationPrice,
      }));
    } catch {
      return [];
    }
  }

  async getMarginInfo(
    _walletId: string,
    context: ActionContext,
  ): Promise<MarginInfo> {
    try {
      const info = await this.sdkWrapper.getMarginInfo(context.walletAddress);
      return {
        totalMargin: info.totalMargin,
        freeMargin: info.freeMargin,
        maintenanceMarginRatio: info.maintenanceMarginRatio,
        marginRatio: info.marginRatio,
        status: marginRatioToStatus(info.marginRatio),
      };
    } catch {
      return {
        totalMargin: 0,
        freeMargin: 0,
        maintenanceMarginRatio: 0,
        marginRatio: Infinity,
        status: 'safe',
      };
    }
  }

  async getMarkets(
    chain: string,
    _network?: string,
  ): Promise<PerpMarketInfo[]> {
    if (chain !== 'solana') return [];
    try {
      return await this.marketData.getMarkets();
    } catch {
      return [];
    }
  }

  // -------------------------------------------------------------------------
  // IPositionProvider methods
  // -------------------------------------------------------------------------

  async getPositions(ctx: PositionQueryContext): Promise<PositionUpdate[]> {
    if (ctx.chain !== 'solana') return [];
    const walletAddress = ctx.walletAddress;
    const network = ctx.networks[0] ?? 'solana-mainnet';
    try {
      const positions = await this.sdkWrapper.getPositions(walletAddress);
      const now = Math.floor(Date.now() / 1000);
      return positions.map((pos) => ({
        walletId: ctx.walletId,
        category: 'PERP' as PositionCategory,
        provider: 'drift_perp',
        chain: 'solana',
        network,
        assetId: null,
        amount: pos.baseAssetAmount,
        amountUsd: pos.notionalValueUsd,
        metadata: {
          direction: pos.direction,
          leverage: pos.leverage,
          unrealizedPnl: pos.unrealizedPnl,
          liquidationPrice: pos.liquidationPrice,
          margin: pos.margin,
          entryPrice: pos.entryPrice,
          market: pos.market,
        },
        status: 'ACTIVE' as const,
        openedAt: now,
      }));
    } catch {
      return [];
    }
  }

  getProviderName(): string {
    return 'drift_perp';
  }

  getSupportedCategories(): PositionCategory[] {
    return ['PERP'];
  }
}
