/**
 * HyperliquidSpotProvider: Spot trading on Hyperliquid DEX.
 *
 * Implements IActionProvider with 3 actions using ApiDirectResult pattern:
 * - hl_spot_buy: Market/Limit spot buy order (medium, DELAY)
 * - hl_spot_sell: Market/Limit spot sell order (low, INSTANT)
 * - hl_spot_cancel: Single/batch spot order cancellation (low, INSTANT)
 *
 * @see HDESIGN-01: requiresSigningKey pipeline flow
 * @see HDESIGN-07: Policy evaluation table
 */
import { ChainError } from '@waiaas/core';
import { parseTokenAmount } from '../../common/amount-parser.js';
import type {
  IActionProvider,
  ActionProviderMetadata,
  ActionDefinition,
  ActionContext,
  ApiDirectResult,
  PositionUpdate,
  PositionCategory,
  PositionQueryContext,
} from '@waiaas/core';
import type { Hex } from 'viem';
import type { HyperliquidExchangeClient } from './exchange-client.js';
import type { HyperliquidMarketData } from './market-data.js';
import { HyperliquidSigner, orderToWire } from './signer.js';
import {
  HlSpotBuyInputSchema,
  HlSpotSellInputSchema,
  HlSpotCancelInputSchema,
} from './schemas.js';
import type { OrderTypeWire } from './schemas.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// HyperliquidSpotProvider
// ---------------------------------------------------------------------------

export class HyperliquidSpotProvider implements IActionProvider {
  readonly metadata: ActionProviderMetadata;
  readonly actions: readonly ActionDefinition[];

  constructor(
    private readonly client: HyperliquidExchangeClient,
    private readonly marketData: HyperliquidMarketData,
    private readonly isMainnet: boolean,
  ) {
    this.metadata = {
      name: 'hyperliquid_spot',
      displayName: 'Hyperliquid Spot',
      description:
        'Hyperliquid DEX spot trading: buy, sell, and cancel spot market and limit orders',
      version: '1.0.0',
      chains: ['ethereum'],
      mcpExpose: true,
      requiresApiKey: false,
      requiredApis: [],
      requiresSigningKey: true,
    };

    this.actions = [
      {
        name: 'hl_spot_buy',
        description: 'Place a spot buy order on Hyperliquid (market or limit)',
        chain: 'ethereum',
        inputSchema: HlSpotBuyInputSchema,
        riskLevel: 'medium',
        defaultTier: 'DELAY',
      },
      {
        name: 'hl_spot_sell',
        description: 'Place a spot sell order on Hyperliquid (market or limit)',
        chain: 'ethereum',
        inputSchema: HlSpotSellInputSchema,
        riskLevel: 'low',
        defaultTier: 'INSTANT',
      },
      {
        name: 'hl_spot_cancel',
        description: 'Cancel one or all spot orders for a market on Hyperliquid',
        chain: 'ethereum',
        inputSchema: HlSpotCancelInputSchema,
        riskLevel: 'low',
        defaultTier: 'INSTANT',
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
  ): Promise<ApiDirectResult> {
    if (!context.privateKey) {
      throw new ChainError('ACTION_API_ERROR', 'HYPERLIQUID', {
        message: 'Private key is required for Hyperliquid actions (requiresSigningKey=true)',
      });
    }

    const privateKey = context.privateKey as Hex;

    switch (actionName) {
      case 'hl_spot_buy':
        return this.resolveSpotOrder(params, privateKey, true, context);
      case 'hl_spot_sell':
        return this.resolveSpotOrder(params, privateKey, false, context);
      case 'hl_spot_cancel':
        return this.resolveSpotCancel(params, privateKey, context);
      default:
        throw new ChainError('ACTION_API_ERROR', 'HYPERLIQUID', {
          message: `Unknown action: ${actionName}`,
        });
    }
  }

  // -------------------------------------------------------------------------
  // Spot Order (Buy or Sell)
  // -------------------------------------------------------------------------

  private async resolveSpotOrder(
    params: Record<string, unknown>,
    privateKey: Hex,
    isBuy: boolean,
    _context: ActionContext,
  ): Promise<ApiDirectResult> {
    const schema = isBuy ? HlSpotBuyInputSchema : HlSpotSellInputSchema;
    const input = schema.parse(params);

    // Resolve spot asset index from market name
    const spotMeta = await this.marketData.getSpotMeta();
    const universeIndex = spotMeta.universe.findIndex((m) => m.name === input.market);
    if (universeIndex === -1) {
      throw new ChainError('ACTION_API_ERROR', 'HYPERLIQUID', {
        message: `Unknown spot market: ${input.market}`,
      });
    }

    // Spot asset index: 10000 + universe index
    const assetIndex = 10000 + universeIndex;

    // For market orders, get current mid price and apply slippage
    let price = input.price;
    if (input.orderType === 'MARKET' && !price) {
      const mids = await this.marketData.getAllMidPrices();
      const midPrice = mids[input.market];
      if (!midPrice) {
        throw new ChainError('ACTION_API_ERROR', 'HYPERLIQUID', {
          message: `No mid price available for ${input.market}`,
        });
      }
      const mid = parseFloat(midPrice);
      const slippage = isBuy ? 1.03 : 0.97;
      price = (mid * slippage).toFixed(8);
    }

    // Build order type wire
    const orderTypeWire: OrderTypeWire = input.orderType === 'LIMIT'
      ? { limit: { tif: input.tif ?? 'GTC' } }
      : { limit: { tif: 'IOC' } }; // Market orders use IOC

    // Build wire format
    const wire = orderToWire(
      assetIndex,
      isBuy,
      price!,
      input.size,
      false, // Spot orders are never reduceOnly
      orderTypeWire,
      input.cloid,
    );

    // Build L1 action
    const nonce = Date.now();
    const action = {
      type: 'order',
      orders: [wire],
      grouping: 'na',
    };

    // Sign
    const signature = await HyperliquidSigner.signL1Action(
      action as unknown as Record<string, unknown>,
      nonce,
      this.isMainnet,
      privateKey,
      input.subAccount as Hex | undefined,
    );

    // Submit
    const response = await this.client.exchange({
      action,
      nonce,
      signature,
      vaultAddress: input.subAccount as Hex | undefined,
    });

    // Extract order ID from response
    const responseData = response.response?.data as Record<string, unknown> | undefined;
    const statuses = (responseData?.statuses ?? []) as Array<Record<string, unknown>>;
    const oid = (statuses[0]?.resting as Record<string, unknown>)?.oid ??
                (statuses[0]?.filled as Record<string, unknown>)?.oid ??
                nonce;

    const actionName = isBuy ? 'hl_spot_buy' : 'hl_spot_sell';

    return {
      __apiDirect: true,
      externalId: String(oid),
      status: 'success',
      provider: 'hyperliquid_spot',
      action: actionName,
      data: { response, assetIndex },
      metadata: {
        market: input.market,
        side: isBuy ? 'BUY' : 'SELL',
        size: input.size,
        price: price ?? undefined,
      },
    };
  }

  // -------------------------------------------------------------------------
  // Spot Cancel
  // -------------------------------------------------------------------------

  private async resolveSpotCancel(
    params: Record<string, unknown>,
    privateKey: Hex,
    context: ActionContext,
  ): Promise<ApiDirectResult> {
    const input = HlSpotCancelInputSchema.parse(params);

    // Resolve spot asset index
    const spotMeta = await this.marketData.getSpotMeta();
    const universeIndex = spotMeta.universe.findIndex((m) => m.name === input.market);
    const assetIndex = universeIndex !== -1 ? 10000 + universeIndex : 10000;

    const nonce = Date.now();
    let action: Record<string, unknown>;

    if (input.oid !== undefined) {
      // Cancel single order by oid
      action = {
        type: 'cancel',
        cancels: [{ a: assetIndex, o: input.oid }],
      };
    } else if (input.cloid !== undefined) {
      // Cancel by client order ID
      action = {
        type: 'cancelByCloid',
        cancels: [{ asset: assetIndex, cloid: input.cloid }],
      };
    } else {
      // Cancel all spot orders for this market
      const orders = await this.marketData.getOpenOrders(
        context.walletAddress as Hex,
        input.subAccount as Hex | undefined,
      );
      const marketOrders = orders.filter((o) => o.coin === input.market);
      if (marketOrders.length === 0) {
        return {
          __apiDirect: true,
          externalId: String(nonce),
          status: 'success',
          provider: 'hyperliquid_spot',
          action: 'hl_spot_cancel',
          data: { cancelled: 0 },
          metadata: { market: input.market },
        };
      }
      action = {
        type: 'cancel',
        cancels: marketOrders.map((o) => ({ a: assetIndex, o: o.oid })),
      };
    }

    const signature = await HyperliquidSigner.signL1Action(
      action,
      nonce,
      this.isMainnet,
      privateKey,
      input.subAccount as Hex | undefined,
    );

    const response = await this.client.exchange({
      action,
      nonce,
      signature,
      vaultAddress: input.subAccount as Hex | undefined,
    });

    return {
      __apiDirect: true,
      externalId: String(nonce),
      status: 'success',
      provider: 'hyperliquid_spot',
      action: 'hl_spot_cancel',
      data: { response },
      metadata: { market: input.market },
    };
  }

  // -------------------------------------------------------------------------
  // getSpendingAmount() - Policy evaluation helper (HDESIGN-07)
  // -------------------------------------------------------------------------

  /**
   * Calculate spending amount for policy evaluation.
   * - hl_spot_buy: size * price in USDC (6 decimals)
   * - hl_spot_sell: $0 (selling existing asset, no spending)
   * - hl_spot_cancel: $0 (no financial impact)
   */
  async getSpendingAmount(
    actionName: string,
    params: Record<string, unknown>,
  ): Promise<{ amount: bigint; asset: string }> {
    switch (actionName) {
      case 'hl_spot_buy': {
        const input = HlSpotBuyInputSchema.parse(params);
        const size = parseFloat(input.size);

        let price: number;
        if (input.price) {
          price = parseFloat(input.price);
        } else {
          // Market order: use mid price
          const mids = await this.marketData.getAllMidPrices();
          price = parseFloat(mids[input.market] ?? '0');
        }

        const total = size * price;
        return { amount: parseTokenAmount(total.toFixed(6), 6), asset: 'USDC' };
      }

      case 'hl_spot_sell':
      case 'hl_spot_cancel':
        return { amount: 0n, asset: 'USDC' };

      default:
        return { amount: 0n, asset: 'USDC' };
    }
  }

  // -------------------------------------------------------------------------
  // IPositionProvider duck-type methods (for PositionTracker auto-registration)
  // -------------------------------------------------------------------------

  getProviderName(): string {
    return 'hyperliquid_spot';
  }

  getSupportedCategories(): PositionCategory[] {
    return ['PERP'];
  }

  async getPositions(ctx: PositionQueryContext): Promise<PositionUpdate[]> {
    if (ctx.chain !== 'ethereum') return [];
    const walletAddress = ctx.walletAddress;
    try {
      const [balances, mids] = await Promise.all([
        this.marketData.getSpotBalances(walletAddress as Hex),
        this.marketData.getAllMidPrices(),
      ]);

      const now = Math.floor(Date.now() / 1000);

      return balances
        .filter((b) => parseFloat(b.total) !== 0)
        .map((b) => {
          // USD conversion: USDC is 1:1, others look up mid price
          let amountUsd: number | null = null;
          const total = parseFloat(b.total);
          if (b.coin === 'USDC') {
            amountUsd = total;
          } else {
            const midStr = mids[`${b.coin}/USDC`] ?? mids[b.coin];
            if (midStr) {
              amountUsd = total * parseFloat(midStr);
            }
          }

          return {
            walletId: ctx.walletId,
            category: 'PERP' as PositionCategory,
            provider: 'hyperliquid_spot',
            chain: 'ethereum',
            network: 'ethereum-mainnet',
            assetId: null,
            amount: b.total,
            amountUsd,
            metadata: {
              coin: b.coin,
              total: b.total,
              hold: b.hold,
              tokenIndex: b.token,
            },
            status: 'ACTIVE' as const,
            openedAt: now,
            closedAt: null,
          };
        });
    } catch {
      return [];
    }
  }
}
