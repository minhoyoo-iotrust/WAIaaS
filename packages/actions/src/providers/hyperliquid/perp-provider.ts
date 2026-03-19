/**
 * HyperliquidPerpProvider: Perpetual futures trading on Hyperliquid DEX.
 *
 * Implements IPerpProvider with 7 actions using ApiDirectResult pattern:
 * - hl_open_position: Market/Limit orders (high, APPROVAL)
 * - hl_close_position: Position close (medium, DELAY)
 * - hl_place_order: Stop-Loss/Take-Profit conditional orders (high, APPROVAL)
 * - hl_cancel_order: Single/batch order cancellation (low, INSTANT)
 * - hl_set_leverage: Leverage update (medium, DELAY)
 * - hl_set_margin_mode: Cross/Isolated margin mode (medium, DELAY)
 * - hl_transfer_usdc: Spot-Perp USDC transfer (medium, DELAY)
 *
 * @see HDESIGN-01: requiresSigningKey pipeline flow
 * @see HDESIGN-07: Policy evaluation table
 */
import { ChainError } from '@waiaas/core';
import { parseTokenAmount } from '../../common/amount-parser.js';
import type {
  IPerpProvider,
  ActionProviderMetadata,
  ActionDefinition,
  ActionContext,
  ApiDirectResult,
  PerpPositionSummary,
  MarginInfo,
  PerpMarketInfo,
  PositionUpdate,
  PositionCategory,
  PositionQueryContext,
} from '@waiaas/core';
import type { Hex } from 'viem';
import type { HyperliquidExchangeClient } from './exchange-client.js';
import type { HyperliquidMarketData } from './market-data.js';
import { HyperliquidSigner, orderToWire } from './signer.js';
import {
  HlOpenPositionInputSchema,
  HlPlaceOrderInputSchema,
  HlClosePositionInputSchema,
  HlCancelOrderInputSchema,
  HlSetLeverageInputSchema,
  HlSetMarginModeInputSchema,
  HlTransferUsdcInputSchema,
} from './schemas.js';
import type { OrderTypeWire } from './schemas.js';
import { HL_DEFAULTS } from './config.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function marginRatioToStatus(ratio: number): 'safe' | 'warning' | 'danger' | 'critical' {
  if (ratio <= 0.10) return 'critical';
  if (ratio <= 0.15) return 'danger';
  if (ratio <= 0.30) return 'warning';
  return 'safe';
}

// ---------------------------------------------------------------------------
// HyperliquidPerpProvider
// ---------------------------------------------------------------------------

export class HyperliquidPerpProvider implements IPerpProvider {
  readonly metadata: ActionProviderMetadata;
  readonly actions: readonly ActionDefinition[];

  constructor(
    private readonly client: HyperliquidExchangeClient,
    private readonly marketData: HyperliquidMarketData,
    private readonly isMainnet: boolean,
  ) {
    this.metadata = {
      name: 'hyperliquid_perp',
      displayName: 'Hyperliquid Perp',
      description:
        'Hyperliquid DEX perpetual futures: open, close, and manage leveraged positions with market, limit, stop-loss, and take-profit orders',
      version: '1.0.0',
      chains: ['ethereum'],
      mcpExpose: true,
      requiresApiKey: false,
      requiredApis: [],
      requiresSigningKey: true,
    };

    this.actions = [
      {
        name: 'hl_open_position',
        description: 'Open a leveraged perpetual position on Hyperliquid with market or limit order',
        chain: 'ethereum',
        inputSchema: HlOpenPositionInputSchema,
        riskLevel: 'high',
        defaultTier: 'APPROVAL',
      },
      {
        name: 'hl_close_position',
        description: 'Close a perpetual position on Hyperliquid (full or partial close)',
        chain: 'ethereum',
        inputSchema: HlClosePositionInputSchema,
        riskLevel: 'medium',
        defaultTier: 'DELAY',
      },
      {
        name: 'hl_place_order',
        description: 'Place a conditional order (stop-loss or take-profit) on Hyperliquid',
        chain: 'ethereum',
        inputSchema: HlPlaceOrderInputSchema,
        riskLevel: 'high',
        defaultTier: 'APPROVAL',
      },
      {
        name: 'hl_cancel_order',
        description: 'Cancel one or all orders for a market on Hyperliquid',
        chain: 'ethereum',
        inputSchema: HlCancelOrderInputSchema,
        riskLevel: 'low',
        defaultTier: 'INSTANT',
      },
      {
        name: 'hl_set_leverage',
        description: 'Set leverage multiplier for a market on Hyperliquid',
        chain: 'ethereum',
        inputSchema: HlSetLeverageInputSchema,
        riskLevel: 'medium',
        defaultTier: 'DELAY',
      },
      {
        name: 'hl_set_margin_mode',
        description: 'Switch between Cross and Isolated margin mode on Hyperliquid',
        chain: 'ethereum',
        inputSchema: HlSetMarginModeInputSchema,
        riskLevel: 'medium',
        defaultTier: 'DELAY',
      },
      {
        name: 'hl_transfer_usdc',
        description: 'Transfer USDC between Spot and Perp accounts on Hyperliquid',
        chain: 'ethereum',
        inputSchema: HlTransferUsdcInputSchema,
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
  ): Promise<ApiDirectResult> {
    if (!context.privateKey) {
      throw new ChainError('ACTION_API_ERROR', 'HYPERLIQUID', {
        message: 'Private key is required for Hyperliquid actions (requiresSigningKey=true)',
      });
    }

    const privateKey = context.privateKey as Hex;

    switch (actionName) {
      case 'hl_open_position':
        return this.resolveOpenPosition(params, privateKey, context);
      case 'hl_close_position':
        return this.resolveClosePosition(params, privateKey, context);
      case 'hl_place_order':
        return this.resolvePlaceOrder(params, privateKey, context);
      case 'hl_cancel_order':
        return this.resolveCancelOrder(params, privateKey, context);
      case 'hl_set_leverage':
        return this.resolveSetLeverage(params, privateKey);
      case 'hl_set_margin_mode':
        return this.resolveSetMarginMode(params, privateKey);
      case 'hl_transfer_usdc':
        return this.resolveTransferUsdc(params, privateKey);
      default:
        throw new ChainError('ACTION_API_ERROR', 'HYPERLIQUID', {
          message: `Unknown action: ${actionName}`,
        });
    }
  }

  // -------------------------------------------------------------------------
  // Open Position: MARKET or LIMIT order
  // -------------------------------------------------------------------------

  private async resolveOpenPosition(
    params: Record<string, unknown>,
    privateKey: Hex,
    _context: ActionContext,
  ): Promise<ApiDirectResult> {
    const input = HlOpenPositionInputSchema.parse(params);

    // Resolve asset index from market name
    const markets = await this.marketData.getMarkets();
    const marketInfo = markets.find((m) => m.name === input.market);
    if (!marketInfo) {
      throw new ChainError('ACTION_API_ERROR', 'HYPERLIQUID', {
        message: `Unknown market: ${input.market}`,
      });
    }
    const assetIndex = markets.indexOf(marketInfo);

    // For market orders, get current mid price and use slippage
    let price = input.price;
    if (input.orderType === 'MARKET' && !price) {
      const mids = await this.marketData.getAllMidPrices();
      const midPrice = mids[input.market];
      if (!midPrice) {
        throw new ChainError('ACTION_API_ERROR', 'HYPERLIQUID', {
          message: `No mid price available for ${input.market}`,
        });
      }
      // Market orders: 3% slippage in the execution direction
      const mid = parseFloat(midPrice);
      const slippage = input.side === 'BUY' ? 1.03 : 0.97;
      price = (mid * slippage).toFixed(8);
    }

    // Build order type wire
    const orderTypeWire: OrderTypeWire = input.orderType === 'LIMIT'
      ? { limit: { tif: input.tif ?? 'GTC' } }
      : { limit: { tif: 'IOC' } }; // Market orders use IOC

    // Build wire format
    const wire = orderToWire(
      assetIndex,
      input.side === 'BUY',
      price!,
      input.size,
      input.reduceOnly ?? false,
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

    return {
      __apiDirect: true,
      externalId: String(oid),
      status: 'success',
      provider: 'hyperliquid_perp',
      action: 'hl_open_position',
      data: { response, assetIndex },
      metadata: {
        market: input.market,
        side: input.side,
        size: input.size,
        price: price ?? undefined,
      },
    };
  }

  // -------------------------------------------------------------------------
  // Close Position
  // -------------------------------------------------------------------------

  private async resolveClosePosition(
    params: Record<string, unknown>,
    privateKey: Hex,
    context: ActionContext,
  ): Promise<ApiDirectResult> {
    const input = HlClosePositionInputSchema.parse(params);

    // Get current position to determine size and direction
    const positions = await this.marketData.getPositions(
      context.walletAddress as Hex,
      input.subAccount as Hex | undefined,
    );
    const position = positions.find((p) => p.coin === input.market);
    if (!position) {
      throw new ChainError('ACTION_API_ERROR', 'HYPERLIQUID', {
        message: `No open position for ${input.market}`,
      });
    }

    const posSize = parseFloat(position.szi);
    const closeSize = input.size ? input.size : String(Math.abs(posSize));
    const closeSide = posSize > 0; // If long, sell to close (isBuy=false for close)

    // Get asset index
    const markets = await this.marketData.getMarkets();
    const marketInfo = markets.find((m) => m.name === input.market);
    const assetIndex = marketInfo ? markets.indexOf(marketInfo) : 0;

    // Market close with 3% slippage
    const mids = await this.marketData.getAllMidPrices();
    const midPrice = mids[input.market] ?? '0';
    const mid = parseFloat(midPrice);
    const slippage = !closeSide ? 1.03 : 0.97; // Opposite direction
    const price = (mid * slippage).toFixed(8);

    const wire = orderToWire(
      assetIndex,
      !closeSide, // Reverse direction to close
      price,
      closeSize,
      true, // reduceOnly
      { limit: { tif: 'IOC' } }, // Market close uses IOC
    );

    const nonce = Date.now();
    const action = {
      type: 'order',
      orders: [wire],
      grouping: 'na',
    };

    const signature = await HyperliquidSigner.signL1Action(
      action as unknown as Record<string, unknown>,
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
      provider: 'hyperliquid_perp',
      action: 'hl_close_position',
      data: { response },
      metadata: {
        market: input.market,
        side: posSize > 0 ? 'SELL' : 'BUY',
        size: closeSize,
      },
    };
  }

  // -------------------------------------------------------------------------
  // Place Order: Stop-Loss / Take-Profit
  // -------------------------------------------------------------------------

  private async resolvePlaceOrder(
    params: Record<string, unknown>,
    privateKey: Hex,
    _context: ActionContext,
  ): Promise<ApiDirectResult> {
    const input = HlPlaceOrderInputSchema.parse(params);

    const markets = await this.marketData.getMarkets();
    const marketInfo = markets.find((m) => m.name === input.market);
    if (!marketInfo) {
      throw new ChainError('ACTION_API_ERROR', 'HYPERLIQUID', {
        message: `Unknown market: ${input.market}`,
      });
    }
    const assetIndex = markets.indexOf(marketInfo);

    // Build trigger order type wire
    const tpsl = input.orderType === 'TAKE_PROFIT' ? 'tp' : 'sl';
    const isMarket = input.orderType !== 'STOP_LIMIT';
    const price = input.price ?? input.triggerPrice;

    const orderTypeWire: OrderTypeWire = {
      trigger: {
        isMarket,
        triggerPx: input.triggerPrice,
        tpsl,
      },
    };

    const wire = orderToWire(
      assetIndex,
      input.side === 'BUY',
      price,
      input.size,
      input.reduceOnly ?? true,
      orderTypeWire,
      input.cloid,
    );

    const nonce = Date.now();
    const action = {
      type: 'order',
      orders: [wire],
      grouping: 'na',
    };

    const signature = await HyperliquidSigner.signL1Action(
      action as unknown as Record<string, unknown>,
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
      provider: 'hyperliquid_perp',
      action: 'hl_place_order',
      data: { response, assetIndex },
      metadata: {
        market: input.market,
        side: input.side,
        size: input.size,
        price: input.triggerPrice,
      },
    };
  }

  // -------------------------------------------------------------------------
  // Cancel Order
  // -------------------------------------------------------------------------

  private async resolveCancelOrder(
    params: Record<string, unknown>,
    privateKey: Hex,
    context: ActionContext,
  ): Promise<ApiDirectResult> {
    const input = HlCancelOrderInputSchema.parse(params);

    const markets = await this.marketData.getMarkets();
    const marketInfo = markets.find((m) => m.name === input.market);
    const assetIndex = marketInfo ? markets.indexOf(marketInfo) : 0;

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
      // Cancel all orders for market
      // Get open orders and cancel all
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
          provider: 'hyperliquid_perp',
          action: 'hl_cancel_order',
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
      provider: 'hyperliquid_perp',
      action: 'hl_cancel_order',
      data: { response },
      metadata: { market: input.market },
    };
  }

  // -------------------------------------------------------------------------
  // Set Leverage
  // -------------------------------------------------------------------------

  private async resolveSetLeverage(
    params: Record<string, unknown>,
    privateKey: Hex,
  ): Promise<ApiDirectResult> {
    const input = HlSetLeverageInputSchema.parse(params);

    const nonce = Date.now();
    const action = {
      type: 'updateLeverage',
      asset: input.asset,
      isCross: input.isCross,
      leverage: input.leverage,
    };

    const signature = await HyperliquidSigner.signL1Action(
      action as unknown as Record<string, unknown>,
      nonce,
      this.isMainnet,
      privateKey,
    );

    const response = await this.client.exchange({
      action,
      nonce,
      signature,
    });

    return {
      __apiDirect: true,
      externalId: String(nonce),
      status: 'success',
      provider: 'hyperliquid_perp',
      action: 'hl_set_leverage',
      data: { response },
      metadata: {
        market: `asset:${input.asset}`,
        side: input.isCross ? 'CROSS' : 'ISOLATED',
      },
    };
  }

  // -------------------------------------------------------------------------
  // Set Margin Mode
  // -------------------------------------------------------------------------

  private async resolveSetMarginMode(
    params: Record<string, unknown>,
    privateKey: Hex,
  ): Promise<ApiDirectResult> {
    const input = HlSetMarginModeInputSchema.parse(params);

    const nonce = Date.now();
    const action = {
      type: 'updateLeverage',
      asset: input.asset,
      isCross: input.mode === 'CROSS',
      leverage: HL_DEFAULTS.LEVERAGE,
    };

    const signature = await HyperliquidSigner.signL1Action(
      action as unknown as Record<string, unknown>,
      nonce,
      this.isMainnet,
      privateKey,
    );

    const response = await this.client.exchange({
      action,
      nonce,
      signature,
    });

    return {
      __apiDirect: true,
      externalId: String(nonce),
      status: 'success',
      provider: 'hyperliquid_perp',
      action: 'hl_set_margin_mode',
      data: { response },
    };
  }

  // -------------------------------------------------------------------------
  // Transfer USDC (Spot <-> Perp)
  // -------------------------------------------------------------------------

  private async resolveTransferUsdc(
    params: Record<string, unknown>,
    privateKey: Hex,
  ): Promise<ApiDirectResult> {
    const input = HlTransferUsdcInputSchema.parse(params);

    const nonce = Date.now();
    const chainLabel = this.isMainnet ? 'Mainnet' : 'Testnet';

    // User-signed action (not L1 action)
    const signature = await HyperliquidSigner.signUserSignedAction(
      'UsdClassTransfer',
      {
        hyperliquidChain: chainLabel,
        amount: input.amount,
        toPerp: input.toPerp,
        nonce: BigInt(nonce),
      },
      this.isMainnet,
      privateKey,
    );

    const response = await this.client.exchange({
      action: {
        type: 'usdClassTransfer',
        hyperliquidChain: chainLabel,
        signatureChainId: this.isMainnet ? '0xa4b1' : '0x66eee',
        amount: input.amount,
        toPerp: input.toPerp,
        nonce,
      },
      nonce,
      signature,
    });

    return {
      __apiDirect: true,
      externalId: String(nonce),
      status: 'success',
      provider: 'hyperliquid_perp',
      action: 'hl_transfer_usdc',
      data: { response },
      metadata: {
        size: input.amount,
        side: input.toPerp ? 'SPOT_TO_PERP' : 'PERP_TO_SPOT',
      },
    };
  }

  // -------------------------------------------------------------------------
  // getSpendingAmount() - Policy evaluation helper (HDESIGN-07)
  // -------------------------------------------------------------------------

  /**
   * Calculate spending amount for policy evaluation.
   * - hl_open_position: margin = size * price / leverage (USDC 6 decimals)
   * - hl_place_order: same as open (margin-based)
   * - hl_close_position: $0 (closing, not opening exposure)
   * - hl_cancel_order: $0 (no financial impact)
   * - hl_set_leverage: $0 (settings change)
   * - hl_set_margin_mode: $0 (settings change)
   * - hl_transfer_usdc: amount in USDC
   */
  async getSpendingAmount(
    actionName: string,
    params: Record<string, unknown>,
  ): Promise<{ amount: bigint; asset: string }> {
    switch (actionName) {
      case 'hl_open_position': {
        const input = HlOpenPositionInputSchema.parse(params);
        const size = parseFloat(input.size);
        const leverage = input.leverage ?? HL_DEFAULTS.LEVERAGE;

        let price: number;
        if (input.price) {
          price = parseFloat(input.price);
        } else {
          // Market order: use mid price
          const mids = await this.marketData.getAllMidPrices();
          price = parseFloat(mids[input.market] ?? '0');
        }

        const margin = (size * price) / leverage;
        return { amount: parseTokenAmount(margin.toFixed(6), 6), asset: 'USDC' };
      }

      case 'hl_place_order': {
        const input = HlPlaceOrderInputSchema.parse(params);
        const size = parseFloat(input.size);
        const price = parseFloat(input.triggerPrice);
        // Use default leverage for conditional orders
        const margin = (size * price) / HL_DEFAULTS.LEVERAGE;
        return { amount: parseTokenAmount(margin.toFixed(6), 6), asset: 'USDC' };
      }

      case 'hl_transfer_usdc': {
        const input = HlTransferUsdcInputSchema.parse(params);
        return { amount: parseTokenAmount(input.amount, 6), asset: 'USDC' };
      }

      case 'hl_close_position':
      case 'hl_cancel_order':
      case 'hl_set_leverage':
      case 'hl_set_margin_mode':
        return { amount: 0n, asset: 'USDC' };

      default:
        return { amount: 0n, asset: 'USDC' };
    }
  }

  // -------------------------------------------------------------------------
  // IPerpProvider query methods
  // -------------------------------------------------------------------------

  async getPosition(
    _walletId: string,
    context: ActionContext,
  ): Promise<PerpPositionSummary[]> {
    try {
      const positions = await this.marketData.getPositions(context.walletAddress as Hex);
      return positions.map((p) => ({
        market: p.coin,
        direction: parseFloat(p.szi) > 0 ? ('LONG' as const) : ('SHORT' as const),
        size: String(Math.abs(parseFloat(p.szi))),
        entryPrice: p.entryPx ? parseFloat(p.entryPx) : null,
        leverage: p.leverage?.value ?? HL_DEFAULTS.LEVERAGE,
        unrealizedPnl: p.unrealizedPnl ? parseFloat(p.unrealizedPnl) : null,
        margin: p.marginUsed ? parseFloat(p.marginUsed) : null,
        liquidationPrice: p.liquidationPx ? parseFloat(p.liquidationPx) : null,
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
      const state = await this.marketData.getAccountState(context.walletAddress as Hex);
      const accountValue = parseFloat(state.marginSummary.accountValue);
      const totalMarginUsed = parseFloat(state.marginSummary.totalMarginUsed ?? '0');
      const freeMargin = accountValue - totalMarginUsed;
      const marginRatio = accountValue > 0 ? totalMarginUsed / accountValue : 0;
      const maintenanceMarginRatio = marginRatio * 0.5; // Approximate

      return {
        totalMargin: accountValue,
        freeMargin,
        maintenanceMarginRatio,
        marginRatio,
        status: marginRatioToStatus(marginRatio),
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
    if (chain !== 'ethereum') return [];
    try {
      const markets = await this.marketData.getMarkets();
      const mids = await this.marketData.getAllMidPrices();

      return markets.map((m) => ({
        market: m.name,
        baseAsset: m.name,
        maxLeverage: m.maxLeverage ?? 50,
        fundingRate: null, // Would need separate fundingHistory call
        openInterest: null,
        oraclePrice: mids[m.name] ? parseFloat(mids[m.name]!) : null,
      }));
    } catch {
      return [];
    }
  }

  // -------------------------------------------------------------------------
  // IPositionProvider duck-type methods (for PositionTracker auto-registration)
  // -------------------------------------------------------------------------

  getProviderName(): string {
    return 'hyperliquid_perp';
  }

  getSupportedCategories(): PositionCategory[] {
    return ['PERP'];
  }

  async getPositions(ctx: PositionQueryContext): Promise<PositionUpdate[]> {
    if (ctx.chain !== 'ethereum') return [];
    const walletAddress = ctx.walletAddress;
    try {
      const [positions, mids] = await Promise.all([
        this.marketData.getPositions(walletAddress as Hex),
        this.marketData.getAllMidPrices(),
      ]);

      const now = Math.floor(Date.now() / 1000);

      return positions.map((p) => {
        const szi = parseFloat(p.szi);
        const midStr = mids[p.coin];
        const markPrice = midStr ? parseFloat(midStr) : null;
        const absSize = Math.abs(szi);

        return {
          walletId: ctx.walletId,
          category: 'PERP' as PositionCategory,
          provider: 'hyperliquid_perp',
          chain: 'ethereum',
          network: 'ethereum-mainnet',
          assetId: null,
          amount: String(absSize),
          amountUsd: markPrice != null ? absSize * markPrice : null,
          metadata: {
            market: p.coin,
            side: szi > 0 ? 'LONG' : 'SHORT',
            entryPrice: p.entryPx ? parseFloat(p.entryPx) : null,
            markPrice,
            leverage: p.leverage?.value ?? null,
            unrealizedPnl: p.unrealizedPnl ? parseFloat(p.unrealizedPnl) : null,
            liquidationPrice: p.liquidationPx ? parseFloat(p.liquidationPx) : null,
            marginUsed: p.marginUsed ? parseFloat(p.marginUsed) : null,
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
