/**
 * Kamino K-Lend Lending Action Provider.
 *
 * Implements ILendingProvider + IPositionProvider to resolve Kamino
 * lending requests into ContractCallRequest arrays for the sequential pipeline.
 *
 * Actions:
 * - kamino_supply: supply token as collateral (medium risk, DELAY)
 * - kamino_borrow: borrow against collateral (high risk, APPROVAL)
 * - kamino_repay: repay borrowed debt (medium risk, DELAY, supports 'max')
 * - kamino_withdraw: withdraw collateral (high risk, APPROVAL, supports 'max')
 *
 * Uses IKaminoSdkWrapper for instruction building and obligation queries.
 * MockKaminoSdkWrapper enables unit testing without real SDK/RPC.
 */
import { ChainError } from '@waiaas/core';
import { migrateAmount } from '../../common/migrate-amount.js';
import { resolveProviderHumanAmount } from '../../common/resolve-human-amount.js';
import type {
  ILendingProvider,
  ActionProviderMetadata,
  ActionDefinition,
  ActionContext,
  ContractCallRequest,
  LendingPositionSummary,
  HealthFactor,
  MarketInfo,
} from '@waiaas/core';
import type { IPositionProvider, PositionUpdate, PositionCategory, PositionQueryContext } from '@waiaas/core';
import type { KaminoConfig } from './config.js';
import { KAMINO_DEFAULTS, resolveMarketAddress } from './config.js';
import type { IKaminoSdkWrapper, KaminoInstruction } from './kamino-sdk-wrapper.js';
import { MockKaminoSdkWrapper } from './kamino-sdk-wrapper.js';
import {
  KaminoSupplyInputSchema,
  KaminoBorrowInputSchema,
  KaminoRepayInputSchema,
  KaminoWithdrawInputSchema,
} from './schemas.js';
import {
  simulateKaminoHealthFactor,
  calculateHealthFactor,
  hfToStatus,
  KAMINO_LIQUIDATION_THRESHOLD,
} from './hf-simulation.js';

// ---------------------------------------------------------------------------
// Instruction-to-request conversion
// ---------------------------------------------------------------------------

/**
 * Convert KaminoInstruction[] to ContractCallRequest[].
 * Each instruction becomes a ContractCallRequest with Solana fields.
 */
function instructionsToRequests(
  instructions: KaminoInstruction[],
  marketAddress: string,
): ContractCallRequest[] {
  return instructions.map((ix) => ({
    type: 'CONTRACT_CALL' as const,
    to: marketAddress,
    programId: ix.programId,
    instructionData: ix.instructionData,
    accounts: ix.accounts,
    network: 'solana-mainnet' as const,
  }));
}

// ---------------------------------------------------------------------------
// Provider implementation
// ---------------------------------------------------------------------------

export class KaminoLendingProvider implements ILendingProvider, IPositionProvider {
  readonly metadata: ActionProviderMetadata;
  readonly actions: readonly ActionDefinition[];

  private readonly config: KaminoConfig;
  private readonly sdkWrapper: IKaminoSdkWrapper;

  constructor(config?: Partial<KaminoConfig>, sdkWrapper?: IKaminoSdkWrapper) {
    this.config = { ...KAMINO_DEFAULTS, ...config };
    this.sdkWrapper = sdkWrapper ?? new MockKaminoSdkWrapper();

    this.metadata = {
      name: 'kamino',
      displayName: 'Kamino',
      description: 'Kamino K-Lend DeFi lending protocol for Solana: supply, borrow, repay, withdraw',
      version: '1.0.0',
      chains: ['solana'],
      mcpExpose: true,
      requiresApiKey: false,
      requiredApis: [],
      requiresSigningKey: false,
    };

    this.actions = [
      {
        name: 'kamino_supply',
        description: 'Supply (deposit) an SPL token as collateral to Kamino K-Lend lending market',
        chain: 'solana',
        inputSchema: KaminoSupplyInputSchema,
        riskLevel: 'medium',
        defaultTier: 'DELAY',
      },
      {
        name: 'kamino_borrow',
        description: 'Borrow an asset from Kamino K-Lend against deposited collateral on Solana',
        chain: 'solana',
        inputSchema: KaminoBorrowInputSchema,
        riskLevel: 'high',
        defaultTier: 'APPROVAL',
      },
      {
        name: 'kamino_repay',
        description: 'Repay borrowed debt on Kamino K-Lend. Use amount="max" for full repayment.',
        chain: 'solana',
        inputSchema: KaminoRepayInputSchema,
        riskLevel: 'medium',
        defaultTier: 'DELAY',
      },
      {
        name: 'kamino_withdraw',
        description: 'Withdraw supplied collateral from Kamino K-Lend. Use amount="max" for full withdrawal.',
        chain: 'solana',
        inputSchema: KaminoWithdrawInputSchema,
        riskLevel: 'high',
        defaultTier: 'APPROVAL',
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
      case 'kamino_supply':
        return this.resolveSupply(params, context);
      case 'kamino_borrow':
        return this.resolveBorrow(params, context);
      case 'kamino_repay':
        return this.resolveRepay(params, context);
      case 'kamino_withdraw':
        return this.resolveWithdraw(params, context);
      default:
        throw new ChainError('INVALID_INSTRUCTION', 'solana', {
          message: `Unknown action: ${actionName}`,
        });
    }
  }

  // -------------------------------------------------------------------------
  // Supply: build supply instruction via SDK wrapper
  // -------------------------------------------------------------------------

  private async resolveSupply(
    params: Record<string, unknown>,
    context: ActionContext,
  ): Promise<ContractCallRequest[]> {
    const rp = { ...params };
    resolveProviderHumanAmount(rp, 'amount', 'humanAmount');
    const input = KaminoSupplyInputSchema.parse(rp);
    if (!input.amount) throw new ChainError('INVALID_INSTRUCTION', 'solana', { message: 'Either amount or humanAmount (with decimals) is required' });
    const marketAddress = resolveMarketAddress(input.market ?? this.config.market);
    const amount = migrateAmount(input.amount, 6);
    if (amount === 0n) throw new ChainError('INVALID_INSTRUCTION', 'solana', { message: 'Amount must be greater than 0' });

    const instructions = await this.sdkWrapper.buildSupplyInstruction({
      market: marketAddress,
      asset: input.asset,
      amount,
      walletAddress: context.walletAddress,
    });

    return instructionsToRequests(instructions, marketAddress);
  }

  // -------------------------------------------------------------------------
  // Borrow: HF check + build borrow instruction
  // -------------------------------------------------------------------------

  private async resolveBorrow(
    params: Record<string, unknown>,
    context: ActionContext,
  ): Promise<ContractCallRequest[]> {
    const rp = { ...params };
    resolveProviderHumanAmount(rp, 'amount', 'humanAmount');
    const input = KaminoBorrowInputSchema.parse(rp);
    if (!input.amount) throw new ChainError('INVALID_INSTRUCTION', 'solana', { message: 'Either amount or humanAmount (with decimals) is required' });
    const marketAddress = resolveMarketAddress(input.market ?? this.config.market);
    const amount = migrateAmount(input.amount, 6);
    if (amount === 0n) throw new ChainError('INVALID_INSTRUCTION', 'solana', { message: 'Amount must be greater than 0' });

    // HF simulation: approximate USD value using raw amount
    // (conservative estimate -- proper conversion requires price oracle)
    const approximateUsdValue = Number(amount) / 1e6;
    await this.checkBorrowSafety(context.walletAddress, approximateUsdValue, marketAddress);

    const instructions = await this.sdkWrapper.buildBorrowInstruction({
      market: marketAddress,
      asset: input.asset,
      amount,
      walletAddress: context.walletAddress,
    });

    return instructionsToRequests(instructions, marketAddress);
  }

  // -------------------------------------------------------------------------
  // Repay: supports 'max' for full repayment
  // -------------------------------------------------------------------------

  private async resolveRepay(
    params: Record<string, unknown>,
    context: ActionContext,
  ): Promise<ContractCallRequest[]> {
    const rp = { ...params };
    resolveProviderHumanAmount(rp, 'amount', 'humanAmount');
    const input = KaminoRepayInputSchema.parse(rp);
    if (!input.amount) throw new ChainError('INVALID_INSTRUCTION', 'solana', { message: 'Either amount or humanAmount (with decimals) is required' });
    const marketAddress = resolveMarketAddress(input.market ?? this.config.market);
    const amount: bigint | 'max' = input.amount === 'max' ? 'max' : migrateAmount(input.amount, 6);

    const instructions = await this.sdkWrapper.buildRepayInstruction({
      market: marketAddress,
      asset: input.asset,
      amount,
      walletAddress: context.walletAddress,
    });

    return instructionsToRequests(instructions, marketAddress);
  }

  // -------------------------------------------------------------------------
  // Withdraw: supports 'max', HF check for non-max
  // -------------------------------------------------------------------------

  private async resolveWithdraw(
    params: Record<string, unknown>,
    context: ActionContext,
  ): Promise<ContractCallRequest[]> {
    const rp = { ...params };
    resolveProviderHumanAmount(rp, 'amount', 'humanAmount');
    const input = KaminoWithdrawInputSchema.parse(rp);
    if (!input.amount) throw new ChainError('INVALID_INSTRUCTION', 'solana', { message: 'Either amount or humanAmount (with decimals) is required' });
    const marketAddress = resolveMarketAddress(input.market ?? this.config.market);
    const amount: bigint | 'max' = input.amount === 'max' ? 'max' : migrateAmount(input.amount, 6);

    // Skip HF simulation for 'max' withdrawals (closing position entirely)
    if (amount !== 'max') {
      const approximateUsdValue = Number(amount) / 1e6;
      await this.checkWithdrawSafety(context.walletAddress, approximateUsdValue, marketAddress);
    }

    const instructions = await this.sdkWrapper.buildWithdrawInstruction({
      market: marketAddress,
      asset: input.asset,
      amount,
      walletAddress: context.walletAddress,
    });

    return instructionsToRequests(instructions, marketAddress);
  }

  // -------------------------------------------------------------------------
  // HF Safety checks (KPROV-08)
  // -------------------------------------------------------------------------

  private async checkBorrowSafety(
    walletAddress: string,
    amountUsd: number,
    market: string,
  ): Promise<void> {
    try {
      const obligation = await this.sdkWrapper.getObligation({ market, walletAddress });
      if (!obligation) return; // No existing position, skip check

      const totalCollateralUsd = obligation.deposits.reduce((sum, d) => sum + d.marketValueUsd, 0);
      const totalDebtUsd = obligation.borrows.reduce((sum, b) => sum + b.marketValueUsd, 0);

      const result = simulateKaminoHealthFactor(
        { totalCollateralUsd, totalDebtUsd },
        'borrow',
        amountUsd,
        KAMINO_LIQUIDATION_THRESHOLD,
      );

      if (!result.safe) {
        throw new ChainError('CONTRACT_EXECUTION_FAILED', 'solana', {
          message: `Borrow would cause health factor to drop below liquidation threshold (simulated HF: ${result.simulatedHf.toFixed(4)})`,
        });
      }
    } catch (err) {
      // Re-throw ChainError, swallow SDK failures (graceful degradation)
      if (err instanceof ChainError) throw err;
      // SDK not available or RPC failed -- skip simulation
    }
  }

  private async checkWithdrawSafety(
    walletAddress: string,
    amountUsd: number,
    market: string,
  ): Promise<void> {
    try {
      const obligation = await this.sdkWrapper.getObligation({ market, walletAddress });
      if (!obligation) return;

      const totalCollateralUsd = obligation.deposits.reduce((sum, d) => sum + d.marketValueUsd, 0);
      const totalDebtUsd = obligation.borrows.reduce((sum, b) => sum + b.marketValueUsd, 0);

      const result = simulateKaminoHealthFactor(
        { totalCollateralUsd, totalDebtUsd },
        'withdraw',
        amountUsd,
        KAMINO_LIQUIDATION_THRESHOLD,
      );

      if (!result.safe) {
        throw new ChainError('CONTRACT_EXECUTION_FAILED', 'solana', {
          message: `Withdrawal would cause health factor to drop below liquidation threshold (simulated HF: ${result.simulatedHf.toFixed(4)})`,
        });
      }
    } catch (err) {
      if (err instanceof ChainError) throw err;
    }
  }

  // -------------------------------------------------------------------------
  // ILendingProvider query methods
  // -------------------------------------------------------------------------

  async getPosition(_walletId: string, context: ActionContext): Promise<LendingPositionSummary[]> {
    try {
      const marketAddress = resolveMarketAddress(this.config.market);
      const obligation = await this.sdkWrapper.getObligation({
        market: marketAddress,
        walletAddress: context.walletAddress,
      });
      if (!obligation) return [];

      const positions: LendingPositionSummary[] = [];

      for (const deposit of obligation.deposits) {
        positions.push({
          asset: deposit.mintAddress,
          positionType: 'SUPPLY',
          amount: deposit.amount.toString(),
          amountUsd: deposit.marketValueUsd,
          apy: null,
        });
      }

      for (const borrow of obligation.borrows) {
        positions.push({
          asset: borrow.mintAddress,
          positionType: 'BORROW',
          amount: borrow.amount.toString(),
          amountUsd: borrow.marketValueUsd,
          apy: null,
        });
      }

      return positions;
    } catch {
      return [];
    }
  }

  async getHealthFactor(_walletId: string, context: ActionContext): Promise<HealthFactor> {
    try {
      const marketAddress = resolveMarketAddress(this.config.market);
      const obligation = await this.sdkWrapper.getObligation({
        market: marketAddress,
        walletAddress: context.walletAddress,
      });
      if (!obligation) {
        return { factor: Infinity, totalCollateralUsd: 0, totalDebtUsd: 0, currentLtv: 0, status: 'safe' };
      }

      const totalCollateralUsd = obligation.deposits.reduce((sum, d) => sum + d.marketValueUsd, 0);
      const totalDebtUsd = obligation.borrows.reduce((sum, b) => sum + b.marketValueUsd, 0);
      const factor = calculateHealthFactor(totalCollateralUsd, totalDebtUsd);
      const currentLtv = obligation.loanToValue;
      const status = hfToStatus(factor);

      return { factor, totalCollateralUsd, totalDebtUsd, currentLtv, status };
    } catch {
      return { factor: Infinity, totalCollateralUsd: 0, totalDebtUsd: 0, currentLtv: 0, status: 'safe' };
    }
  }

  async getMarkets(chain: string, _network?: string): Promise<MarketInfo[]> {
    if (chain !== 'solana') return [];

    try {
      const marketAddress = resolveMarketAddress(this.config.market);
      const reserves = await this.sdkWrapper.getReserves(marketAddress);

      return reserves.map((r) => ({
        asset: r.mintAddress,
        symbol: r.symbol,
        supplyApy: r.supplyApy,
        borrowApy: r.borrowApy,
        ltv: r.ltvPct / 100,
        availableLiquidity: r.availableLiquidity,
      }));
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
      const marketAddress = resolveMarketAddress(this.config.market);
      const obligation = await this.sdkWrapper.getObligation({
        market: marketAddress,
        walletAddress,
      });
      if (!obligation) return [];

      const now = Math.floor(Date.now() / 1000);
      const updates: PositionUpdate[] = [];

      for (const deposit of obligation.deposits) {
        updates.push({
          walletId: ctx.walletId,
          category: 'LENDING' as const,
          provider: 'kamino',
          chain: 'solana',
          network,
          assetId: deposit.mintAddress,
          amount: deposit.amount.toString(),
          amountUsd: deposit.marketValueUsd,
          metadata: { positionType: 'SUPPLY', market: marketAddress },
          status: 'ACTIVE' as const,
          openedAt: now,
        });
      }

      for (const borrow of obligation.borrows) {
        updates.push({
          walletId: ctx.walletId,
          category: 'LENDING' as const,
          provider: 'kamino',
          chain: 'solana',
          network,
          assetId: borrow.mintAddress,
          amount: borrow.amount.toString(),
          amountUsd: borrow.marketValueUsd,
          metadata: { positionType: 'BORROW', market: marketAddress },
          status: 'ACTIVE' as const,
          openedAt: now,
        });
      }

      return updates;
    } catch {
      return [];
    }
  }

  getProviderName(): string {
    return 'kamino';
  }

  getSupportedCategories(): PositionCategory[] {
    return ['LENDING'];
  }
}
