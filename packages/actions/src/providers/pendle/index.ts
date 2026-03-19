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
  PositionQueryContext,
  ILogger,
} from '@waiaas/core';
import { PendleApiClient } from './pendle-api-client.js';
import { type PendleConfig, PENDLE_DEFAULTS, getPendleChainId, PENDLE_POSITION_NETWORKS } from './config.js';
import type { PendleMarket } from './schemas.js';
import { formatCaip19 } from '@waiaas/core';
import { addressToHex } from '../../common/contract-encoding.js';
import { resolveProviderHumanAmount } from '../../common/resolve-human-amount.js';
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
  private readonly logger?: ILogger;

  constructor(config?: Partial<PendleConfig>, logger?: ILogger) {
    this.config = { ...PENDLE_DEFAULTS, ...config };
    this.logger = logger;

    this.metadata = {
      name: 'pendle_yield',
      displayName: 'Pendle Yield',
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
    const rp = { ...params };
    resolveProviderHumanAmount(rp, 'amountIn', 'humanAmountIn');
    const input = PendleBuyPTInputSchema.parse(rp);
    if (!input.amountIn) throw new ChainError('INVALID_INSTRUCTION', context.chain, { message: 'Either amountIn or humanAmountIn (with decimals) is required' });
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
    const rp = { ...params };
    resolveProviderHumanAmount(rp, 'amountIn', 'humanAmountIn');
    const input = PendleBuyYTInputSchema.parse(rp);
    if (!input.amountIn) throw new ChainError('INVALID_INSTRUCTION', context.chain, { message: 'Either amountIn or humanAmountIn (with decimals) is required' });
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
    const rp = { ...params };
    resolveProviderHumanAmount(rp, 'amount', 'humanAmount');
    const input = PendleRedeemPTInputSchema.parse(rp);
    if (!input.amount) throw new ChainError('INVALID_INSTRUCTION', context.chain, { message: 'Either amount or humanAmount (with decimals) is required' });
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
    const rp = { ...params };
    resolveProviderHumanAmount(rp, 'amountIn', 'humanAmountIn');
    const input = PendleAddLiquidityInputSchema.parse(rp);
    if (!input.amountIn) throw new ChainError('INVALID_INSTRUCTION', context.chain, { message: 'Either amountIn or humanAmountIn (with decimals) is required' });
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
    const rp = { ...params };
    resolveProviderHumanAmount(rp, 'amount', 'humanAmount');
    const input = PendleRemoveLiquidityInputSchema.parse(rp);
    if (!input.amount) throw new ChainError('INVALID_INSTRUCTION', context.chain, { message: 'Either amount or humanAmount (with decimals) is required' });
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
    const client = new PendleApiClient(this.config, chainId, this.logger);
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
    const client = new PendleApiClient(this.config, chainId, this.logger);
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

  async getPositions(ctx: PositionQueryContext): Promise<PositionUpdate[]> {
    if (ctx.chain !== 'ethereum') return [];
    const walletAddress = ctx.walletAddress;

    // Filter ctx.networks to only Pendle position-supported networks (MCHN-03)
    const supportedNetworks = ctx.networks.filter(
      n => (PENDLE_POSITION_NETWORKS as readonly string[]).includes(n),
    );
    if (supportedNetworks.length === 0) return [];

    // Query each network in parallel via Promise.allSettled (MCHN-06)
    const results = await Promise.allSettled(
      supportedNetworks.map(network => {
        const rpcUrl = ctx.rpcUrls[network];
        if (!rpcUrl) return Promise.resolve([] as PositionUpdate[]);
        return this.queryNetworkPendlePositions(ctx.walletId, walletAddress, network, rpcUrl);
      }),
    );

    // Collect only fulfilled results (MCHN-07)
    return results.flatMap(r => r.status === 'fulfilled' ? r.value : []);
  }

  /**
   * Query Pendle PT/YT positions on a single network.
   */
  private async queryNetworkPendlePositions(
    walletId: string,
    walletAddress: string,
    network: string,
    rpcUrl: string,
  ): Promise<PositionUpdate[]> {
    const positions: PositionUpdate[] = [];
    const now = Math.floor(Date.now() / 1000);
    const chainId = getPendleChainId(network);
    const client = new PendleApiClient(this.config, chainId, this.logger);
    const markets = await client.getMarkets();

    for (const market of markets) {
      const maturity = Math.floor(new Date(market.expiry).getTime() / 1000);
      const status = maturity < now ? 'MATURED' : 'ACTIVE';
      const impliedApy = market.details?.impliedApy ?? 0;
      const underlyingAsset = market.underlyingAsset.symbol;

      // Check PT balance
      const ptBalance = await this.ethCallUint256WithRpc(rpcUrl, market.pt, this.encodeBalanceOfCalldata(walletAddress));
      if (ptBalance > 0n) {
        positions.push({
          walletId,
          category: 'YIELD',
          provider: 'pendle',
          chain: 'ethereum',
          network,
          assetId: formatCaip19(`eip155:${chainId}`, 'erc20', market.pt),
          amount: this.formatWei(ptBalance),
          amountUsd: null,
          metadata: {
            tokenType: 'PT',
            maturity,
            underlyingAsset,
            impliedApy,
            marketAddress: market.address,
          },
          status,
          openedAt: now,
        });
      }

      // Check YT balance
      const ytBalance = await this.ethCallUint256WithRpc(rpcUrl, market.yt, this.encodeBalanceOfCalldata(walletAddress));
      if (ytBalance > 0n) {
        positions.push({
          walletId,
          category: 'YIELD',
          provider: 'pendle',
          chain: 'ethereum',
          network,
          assetId: formatCaip19(`eip155:${chainId}`, 'erc20', market.yt),
          amount: this.formatWei(ytBalance),
          amountUsd: null,
          metadata: {
            tokenType: 'YT',
            maturity,
            underlyingAsset,
            impliedApy,
            marketAddress: market.address,
          },
          status,
          openedAt: now,
        });
      }
    }

    return positions;
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
    const client = new PendleApiClient(this.config, chainId, this.logger);

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

  // ---------------------------------------------------------------------------
  // Position tracking helpers (raw RPC, no viem dependency)
  // ---------------------------------------------------------------------------

  /**
   * Encode ERC-20 balanceOf(address) calldata.
   * Selector: 0x70a08231
   */
  private encodeBalanceOfCalldata(address: string): string {
    const selector = '0x70a08231';
    const paddedAddress = addressToHex(address);
    return `${selector}${paddedAddress}`;
  }

  /**
   * Execute a single eth_call with explicit rpcUrl and decode the result as uint256.
   */
  private async ethCallUint256WithRpc(rpcUrl: string, to: string, data: string): Promise<bigint> {
    const resp = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'eth_call',
        params: [{ to, data }, 'latest'],
      }),
    });
    const json = (await resp.json()) as { result: string };
    const stripped = json.result.startsWith('0x') ? json.result.slice(2) : json.result;
    return BigInt('0x' + stripped);
  }

  /**
   * Format a wei-denominated bigint to a human-readable decimal string (18 decimals).
   */
  private formatWei(value: bigint): string {
    const whole = value / (10n ** 18n);
    const frac = value % (10n ** 18n);
    if (frac === 0n) return `${whole}.0`;
    const fracStr = frac.toString().padStart(18, '0').replace(/0+$/, '');
    return `${whole}.${fracStr}`;
  }
}
