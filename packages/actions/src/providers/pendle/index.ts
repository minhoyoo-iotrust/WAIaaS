/**
 * Pendle Yield Trading Action Provider.
 *
 * Implements IYieldProvider to resolve Pendle yield actions
 * into ContractCallRequest arrays for the 6-stage pipeline.
 *
 * All actions use the unified Pendle Convert API v2:
 *   GET /v2/sdk/{chainId}/convert?tokensIn&amountsIn&tokensOut&slippage&receiver
 *
 * Actions: buy_pt, buy_yt, redeem_pt, add_liquidity, remove_liquidity
 */
import { ChainError } from '@waiaas/core';
import type {
  ActionProviderMetadata,
  ActionDefinition,
  ActionContext,
  ContractCallRequest,
  IYieldProvider,
  YieldMarketInfo,
  YieldPositionSummary,
  YieldForecast,
  IPositionProvider,
  PositionUpdate,
  PositionCategory,
} from '@waiaas/core';
import { PendleApiClient } from './pendle-api-client.js';
import { type PendleConfig, PENDLE_DEFAULTS, getPendleChainId } from './config.js';
import type { PendleMarket } from './schemas.js';
import {
  PendleBuyPTInputSchema,
  PendleBuyYTInputSchema,
  PendleRedeemPTInputSchema,
  PendleAddLiquidityInputSchema,
  PendleRemoveLiquidityInputSchema,
} from './input-schemas.js';
import { clampSlippageBps, asBps, bpsToPct } from '../../common/slippage.js';

export class PendleYieldProvider implements IYieldProvider, IPositionProvider {
  readonly metadata: ActionProviderMetadata;
  readonly actions: readonly ActionDefinition[];

  private readonly config: PendleConfig;

  constructor(config?: Partial<PendleConfig>) {
    this.config = { ...PENDLE_DEFAULTS, ...config };

    this.metadata = {
      name: 'pendle_yield',
      description: 'Pendle Protocol yield trading: buy/sell PT/YT, redeem at maturity, add/remove LP',
      version: '1.0.0',
      chains: ['ethereum'],
      mcpExpose: true,
      requiresApiKey: false,
      requiredApis: ['pendle'],
      requiresSigningKey: false,
    };

    this.actions = [
      {
        name: 'buy_pt',
        description: 'Buy PT (Principal Token) from a Pendle market for fixed yield at maturity',
        chain: 'ethereum',
        inputSchema: PendleBuyPTInputSchema,
        riskLevel: 'medium',
        defaultTier: 'DELAY',
      },
      {
        name: 'buy_yt',
        description: 'Buy YT (Yield Token) from a Pendle market for leveraged yield exposure',
        chain: 'ethereum',
        inputSchema: PendleBuyYTInputSchema,
        riskLevel: 'high',
        defaultTier: 'DELAY',
      },
      {
        name: 'redeem_pt',
        description: 'Redeem PT tokens: market sell before maturity or redeem underlying after maturity',
        chain: 'ethereum',
        inputSchema: PendleRedeemPTInputSchema,
        riskLevel: 'low',
        defaultTier: 'NOTIFY',
      },
      {
        name: 'add_liquidity',
        description: 'Add single-sided liquidity to a Pendle market and receive LP tokens',
        chain: 'ethereum',
        inputSchema: PendleAddLiquidityInputSchema,
        riskLevel: 'medium',
        defaultTier: 'DELAY',
      },
      {
        name: 'remove_liquidity',
        description: 'Remove liquidity from a Pendle market by burning LP tokens',
        chain: 'ethereum',
        inputSchema: PendleRemoveLiquidityInputSchema,
        riskLevel: 'low',
        defaultTier: 'NOTIFY',
      },
    ] as const;
  }

  async resolve(
    actionName: string,
    params: Record<string, unknown>,
    context: ActionContext,
  ): Promise<ContractCallRequest | ContractCallRequest[]> {
    switch (actionName) {
      case 'buy_pt':
        return this.resolveBuyPT(params, context);
      case 'buy_yt':
        return this.resolveBuyYT(params, context);
      case 'redeem_pt':
        return this.resolveRedeemPT(params, context);
      case 'add_liquidity':
        return this.resolveAddLiquidity(params, context);
      case 'remove_liquidity':
        return this.resolveRemoveLiquidity(params, context);
      default:
        throw new ChainError('INVALID_INSTRUCTION', context.chain, {
          message: `Unknown Pendle action: ${actionName}`,
        });
    }
  }

  // ---------------------------------------------------------------------------
  // Action resolvers
  // ---------------------------------------------------------------------------

  private async resolveBuyPT(
    params: Record<string, unknown>,
    context: ActionContext,
  ): Promise<ContractCallRequest[]> {
    const input = PendleBuyPTInputSchema.parse(params);
    const { client, market } = await this.prepareAction(input.market, context);
    const slippage = this.resolveSlippage(input.slippageBps);

    const result = await client.convert({
      tokensIn: input.tokenIn,
      amountsIn: input.amountIn,
      tokensOut: market.pt,
      slippage: String(slippage),
      receiver: context.walletAddress,
    });

    return [this.toContractCallRequest(result.tx)];
  }

  private async resolveBuyYT(
    params: Record<string, unknown>,
    context: ActionContext,
  ): Promise<ContractCallRequest[]> {
    const input = PendleBuyYTInputSchema.parse(params);
    const { client, market } = await this.prepareAction(input.market, context);
    const slippage = this.resolveSlippage(input.slippageBps);

    const result = await client.convert({
      tokensIn: input.tokenIn,
      amountsIn: input.amountIn,
      tokensOut: market.yt,
      slippage: String(slippage),
      receiver: context.walletAddress,
    });

    return [this.toContractCallRequest(result.tx)];
  }

  /**
   * Redeem PT: auto-detect pre/post maturity (DEC-YIELD-03).
   * - Post-maturity: Convert PT → underlying (direct redemption)
   * - Pre-maturity: Convert PT → underlying via market sell
   * Both use the same Convert API; Pendle handles the routing.
   */
  private async resolveRedeemPT(
    params: Record<string, unknown>,
    context: ActionContext,
  ): Promise<ContractCallRequest[]> {
    const input = PendleRedeemPTInputSchema.parse(params);
    const { client, market } = await this.prepareAction(input.market, context);
    const slippage = this.resolveSlippage(input.slippageBps);

    const result = await client.convert({
      tokensIn: market.pt,
      amountsIn: input.amount,
      tokensOut: market.underlyingAsset.address,
      slippage: String(slippage),
      receiver: context.walletAddress,
    });

    return [this.toContractCallRequest(result.tx)];
  }

  private async resolveAddLiquidity(
    params: Record<string, unknown>,
    context: ActionContext,
  ): Promise<ContractCallRequest[]> {
    const input = PendleAddLiquidityInputSchema.parse(params);
    const { client, market } = await this.prepareAction(input.market, context);
    const slippage = this.resolveSlippage(input.slippageBps);

    const result = await client.convert({
      tokensIn: input.tokenIn,
      amountsIn: input.amountIn,
      tokensOut: market.address,
      slippage: String(slippage),
      receiver: context.walletAddress,
    });

    return [this.toContractCallRequest(result.tx)];
  }

  private async resolveRemoveLiquidity(
    params: Record<string, unknown>,
    context: ActionContext,
  ): Promise<ContractCallRequest[]> {
    const input = PendleRemoveLiquidityInputSchema.parse(params);
    const { client, market } = await this.prepareAction(input.market, context);
    const slippage = this.resolveSlippage(input.slippageBps);

    const result = await client.convert({
      tokensIn: market.address,
      amountsIn: input.amount,
      tokensOut: market.underlyingAsset.address,
      slippage: String(slippage),
      receiver: context.walletAddress,
    });

    return [this.toContractCallRequest(result.tx)];
  }

  // ---------------------------------------------------------------------------
  // IYieldProvider query methods
  // ---------------------------------------------------------------------------

  async getMarkets(chain: string, network?: string): Promise<YieldMarketInfo[]> {
    const net = network ?? `${chain}-mainnet`;
    const chainId = getPendleChainId(net);
    const client = new PendleApiClient(this.config, chainId);
    const markets = await client.getMarkets();

    return markets.map((m) => ({
      marketAddress: m.address,
      asset: m.underlyingAsset.symbol,
      symbol: m.name,
      impliedApy: m.details?.impliedApy ?? 0,
      underlyingApy: m.details?.underlyingApy ?? 0,
      maturity: Math.floor(new Date(m.expiry).getTime() / 1000),
      tvl: m.details?.liquidity ?? null,
      chain,
    }));
  }

  async getPosition(_walletId: string, _context: ActionContext): Promise<YieldPositionSummary[]> {
    // Position tracking is done via PositionTracker (Phase 290)
    return [];
  }

  async getYieldForecast(marketId: string, context: ActionContext): Promise<YieldForecast> {
    const chainId = getPendleChainId(`${context.chain}-mainnet`);
    const client = new PendleApiClient(this.config, chainId);
    const markets = await client.getMarkets();
    const market = markets.find((m) => m.address.toLowerCase() === marketId.toLowerCase());

    if (!market) {
      throw new ChainError('INVALID_INSTRUCTION', context.chain, {
        message: `Pendle market not found: ${marketId}`,
      });
    }

    const prices = await client.getSwappingPrices(marketId);

    return {
      marketId,
      impliedApy: market.details?.impliedApy ?? 0,
      underlyingApy: market.details?.underlyingApy ?? 0,
      ptPrice: prices.ptPrice,
      ytPrice: prices.ytPrice,
      maturityDate: Math.floor(new Date(market.expiry).getTime() / 1000),
    };
  }

  // ---------------------------------------------------------------------------
  // IPositionProvider methods
  // ---------------------------------------------------------------------------

  async getPositions(_walletId: string): Promise<PositionUpdate[]> {
    // Position tracking will be implemented in Phase 290
    return [];
  }

  getProviderName(): string {
    return 'pendle';
  }

  getSupportedCategories(): PositionCategory[] {
    return ['YIELD'];
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Prepare action context: resolve chain ID, create API client, find market.
   */
  private async prepareAction(
    marketAddress: string,
    context: ActionContext,
  ): Promise<{ client: PendleApiClient; market: PendleMarket; chainId: number }> {
    const network = `${context.chain}-mainnet`;
    const chainId = getPendleChainId(network);
    const client = new PendleApiClient(this.config, chainId);

    const markets = await client.getMarkets();
    const market = markets.find(
      (m) => m.address.toLowerCase() === marketAddress.toLowerCase(),
    );

    if (!market) {
      throw new ChainError('INVALID_INSTRUCTION', context.chain, {
        message: `Pendle market not found: ${marketAddress}`,
      });
    }

    return { client, market, chainId };
  }

  /**
   * Resolve slippage: clamp user input BPS, then convert to Pendle's decimal format.
   */
  private resolveSlippage(inputBps?: number): number {
    const bps = clampSlippageBps(
      inputBps ?? 0,
      asBps(this.config.defaultSlippageBps),
      asBps(this.config.maxSlippageBps),
    );
    return bpsToPct(bps);
  }

  /**
   * Convert Pendle API tx response to ContractCallRequest.
   */
  private toContractCallRequest(tx: { to: string; data: string; value: string }): ContractCallRequest {
    return {
      type: 'CONTRACT_CALL',
      to: tx.to,
      calldata: tx.data,
      value: tx.value ? BigInt(tx.value).toString() : undefined,
    };
  }
}
