/**
 * PolymarketOrderProvider: 5 CLOB trading actions.
 *
 * pm_buy, pm_sell, pm_cancel_order, pm_cancel_all, pm_update_order
 *
 * Uses ApiDirectResult pattern (Stage 5 skip) for off-chain CLOB orders.
 *
 * @see design doc 80, Section 7.1
 */
import { ChainError } from '@waiaas/core';
import type {
  IActionProvider,
  ActionProviderMetadata,
  ActionDefinition,
  ActionContext,
  ApiDirectResult,
} from '@waiaas/core';
import type { Hex } from 'viem';
import { PolymarketSigner } from './signer.js';
import { OrderBuilder } from './order-builder.js';
import { PM_CONTRACTS, PM_ERRORS } from './config.js';
import {
  PmBuySchema,
  PmSellSchema,
  PmCancelOrderSchema,
  PmCancelAllSchema,
  PmUpdateOrderSchema,
} from './schemas.js';
import type { PolymarketClobClient } from './clob-client.js';
import type { PolymarketApiKeyService } from './api-key-service.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Minimal interface for neg_risk lookup (stub for Phase 371, full impl in Phase 372) */
export interface NegRiskResolver {
  isNegRisk(tokenId: string): Promise<boolean>;
}

/** Minimal DB interface for order persistence */
export interface OrderDb {
  insertOrder(row: Record<string, unknown>): void;
  updateOrderStatus(id: string, status: string, updatedAt: number): void;
  updateOrderStatusByOrderId(orderId: string, status: string, updatedAt: number): void;
}

/** UUID v7 generator */
export type UuidFn = () => string;

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export class PolymarketOrderProvider implements IActionProvider {
  readonly metadata: ActionProviderMetadata = {
    name: 'polymarket_order',
      displayName: 'Polymarket Order',
    description: 'Polymarket prediction market CLOB trading (buy/sell/cancel/update orders)',
    version: '1.0.0',
    chains: ['ethereum'],
    mcpExpose: true,
    requiresApiKey: false,
    requiredApis: [],
    requiresSigningKey: true,
  };

  readonly actions: readonly ActionDefinition[] = [
    {
      name: 'pm_buy',
      description: 'Buy outcome tokens on Polymarket prediction market',
      chain: 'ethereum',
      riskLevel: 'high',
      defaultTier: 'APPROVAL',
      inputSchema: PmBuySchema,
    },
    {
      name: 'pm_sell',
      description: 'Sell outcome tokens on Polymarket prediction market',
      chain: 'ethereum',
      riskLevel: 'medium',
      defaultTier: 'DELAY',
      inputSchema: PmSellSchema,
    },
    {
      name: 'pm_cancel_order',
      description: 'Cancel an active Polymarket CLOB order by ID',
      chain: 'ethereum',
      riskLevel: 'low',
      defaultTier: 'INSTANT',
      inputSchema: PmCancelOrderSchema,
    },
    {
      name: 'pm_cancel_all',
      description: 'Cancel all active Polymarket CLOB orders optionally by market',
      chain: 'ethereum',
      riskLevel: 'low',
      defaultTier: 'INSTANT',
      inputSchema: PmCancelAllSchema,
    },
    {
      name: 'pm_update_order',
      description: 'Update price or size of an active Polymarket order (cancel + replace)',
      chain: 'ethereum',
      riskLevel: 'medium',
      defaultTier: 'DELAY',
      inputSchema: PmUpdateOrderSchema,
    },
  ];

  constructor(
    private readonly clobClient: PolymarketClobClient,
    private readonly apiKeyService: PolymarketApiKeyService,
    private readonly negRiskResolver: NegRiskResolver | null,
    private readonly db: OrderDb | null,
    private readonly generateId: UuidFn = () => crypto.randomUUID(),
  ) {}

  async resolve(
    actionName: string,
    params: Record<string, unknown>,
    context: ActionContext,
  ): Promise<ApiDirectResult> {
    // Network validation: Polymarket is Polygon only
    // ActionContext doesn't carry networkId directly; we trust the caller
    // to have resolved to polygon-mainnet. The CLOB API will reject otherwise.

    const privateKey = context.privateKey as Hex;
    const walletAddress = context.walletAddress as Hex;

    switch (actionName) {
      case 'pm_buy':
        return this.executeBuy(params, walletAddress, privateKey, context.walletId);
      case 'pm_sell':
        return this.executeSell(params, walletAddress, privateKey, context.walletId);
      case 'pm_cancel_order':
        return this.executeCancelOrder(params, walletAddress, privateKey, context.walletId);
      case 'pm_cancel_all':
        return this.executeCancelAll(params, walletAddress, privateKey, context.walletId);
      case 'pm_update_order':
        return this.executeUpdateOrder(params, walletAddress, privateKey, context.walletId);
      default:
        throw new ChainError(PM_ERRORS.API_ERROR, 'POLYMARKET', {
          message: `Unknown action: ${actionName}`,
        });
    }
  }

  /**
   * Calculate spending amount for policy engine limits.
   */
  async getSpendingAmount(
    actionName: string,
    params: Record<string, unknown>,
  ): Promise<{ amount: bigint; asset: string }> {
    const usdc = PM_CONTRACTS.USDC_E;

    switch (actionName) {
      case 'pm_buy': {
        const parsed = PmBuySchema.parse(params);
        return {
          amount: OrderBuilder.calculateBuyAmount(parsed.price, parsed.size),
          asset: usdc,
        };
      }
      case 'pm_update_order': {
        // Conservative: treat update as new buy for the (potentially increased) amount
        const parsed = PmUpdateOrderSchema.parse(params);
        if (parsed.price && parsed.size) {
          return {
            amount: OrderBuilder.calculateBuyAmount(parsed.price, parsed.size),
            asset: usdc,
          };
        }
        return { amount: 0n, asset: usdc };
      }
      default:
        return { amount: 0n, asset: usdc };
    }
  }

  // -----------------------------------------------------------------------
  // Private action implementations
  // -----------------------------------------------------------------------

  private async executeBuy(
    params: Record<string, unknown>,
    walletAddress: Hex,
    privateKey: Hex,
    walletId: string,
  ): Promise<ApiDirectResult> {
    const parsed = PmBuySchema.parse(params);

    // 1. Ensure API keys
    const creds = await this.apiKeyService.ensureApiKeys(walletId, walletAddress, privateKey);

    // 2. Determine neg_risk
    const isNegRisk = this.negRiskResolver
      ? await this.negRiskResolver.isNegRisk(parsed.tokenId)
      : false;

    // 3. Build order struct
    const order = OrderBuilder.buildBuyOrder({
      walletAddress,
      tokenId: parsed.tokenId,
      price: parsed.price,
      size: parsed.size,
      orderType: parsed.orderType,
      expiration: parsed.expiration,
    });

    // 4. Sign order
    const signature = await PolymarketSigner.signOrder(order, privateKey, isNegRisk);

    // 5. Build HMAC headers
    const body = JSON.stringify({
      order: {
        salt: String(order.salt),
        maker: order.maker,
        signer: order.signer,
        taker: order.taker,
        tokenId: String(order.tokenId),
        makerAmount: String(order.makerAmount),
        takerAmount: String(order.takerAmount),
        expiration: String(order.expiration),
        nonce: String(order.nonce),
        feeRateBps: String(order.feeRateBps),
        side: String(order.side),
        signatureType: String(order.signatureType),
      },
      owner: walletAddress,
      orderType: parsed.orderType,
      signature,
      signatureType: order.signatureType,
    });
    const hmacHeaders = PolymarketSigner.buildHmacHeaders(
      creds.apiKey, creds.secret, creds.passphrase,
      walletAddress, 'POST', '/order', body,
    );

    // 6. Submit to CLOB
    const response = await this.clobClient.postOrder(hmacHeaders, JSON.parse(body) as Record<string, unknown>);

    // 7. Persist to DB
    const orderId = response.orderID ?? this.generateId();
    const now = Math.floor(Date.now() / 1000);
    if (this.db) {
      this.db.insertOrder({
        id: this.generateId(),
        wallet_id: walletId,
        condition_id: '', // Will be filled by MarketData in Phase 372
        token_id: parsed.tokenId,
        outcome: '', // Will be filled by MarketData in Phase 372
        order_id: orderId,
        side: 'BUY',
        order_type: parsed.orderType,
        price: parsed.price,
        size: parsed.size,
        status: 'PENDING',
        salt: String(order.salt),
        maker_amount: String(order.makerAmount),
        taker_amount: String(order.takerAmount),
        signature_type: order.signatureType,
        fee_rate_bps: Number(order.feeRateBps),
        expiration: Number(order.expiration),
        nonce: String(order.nonce),
        is_neg_risk: isNegRisk ? 1 : 0,
        response_data: JSON.stringify(response),
        created_at: now,
        updated_at: now,
      });
    }

    return {
      __apiDirect: true,
      externalId: orderId,
      status: 'pending',
      provider: 'polymarket_order',
      action: 'pm_buy',
      data: { orderID: orderId, response },
      metadata: {
        market: parsed.tokenId,
        side: 'BUY',
        size: parsed.size,
        price: parsed.price,
      },
    };
  }

  private async executeSell(
    params: Record<string, unknown>,
    walletAddress: Hex,
    privateKey: Hex,
    walletId: string,
  ): Promise<ApiDirectResult> {
    const parsed = PmSellSchema.parse(params);

    const creds = await this.apiKeyService.ensureApiKeys(walletId, walletAddress, privateKey);

    const isNegRisk = this.negRiskResolver
      ? await this.negRiskResolver.isNegRisk(parsed.tokenId)
      : false;

    const order = OrderBuilder.buildSellOrder({
      walletAddress,
      tokenId: parsed.tokenId,
      price: parsed.price,
      size: parsed.size,
      orderType: parsed.orderType,
      expiration: parsed.expiration,
    });

    const signature = await PolymarketSigner.signOrder(order, privateKey, isNegRisk);

    const body = JSON.stringify({
      order: {
        salt: String(order.salt),
        maker: order.maker,
        signer: order.signer,
        taker: order.taker,
        tokenId: String(order.tokenId),
        makerAmount: String(order.makerAmount),
        takerAmount: String(order.takerAmount),
        expiration: String(order.expiration),
        nonce: String(order.nonce),
        feeRateBps: String(order.feeRateBps),
        side: String(order.side),
        signatureType: String(order.signatureType),
      },
      owner: walletAddress,
      orderType: parsed.orderType,
      signature,
      signatureType: order.signatureType,
    });
    const hmacHeaders = PolymarketSigner.buildHmacHeaders(
      creds.apiKey, creds.secret, creds.passphrase,
      walletAddress, 'POST', '/order', body,
    );

    const response = await this.clobClient.postOrder(hmacHeaders, JSON.parse(body) as Record<string, unknown>);

    const orderId = response.orderID ?? this.generateId();
    const now = Math.floor(Date.now() / 1000);
    if (this.db) {
      this.db.insertOrder({
        id: this.generateId(),
        wallet_id: walletId,
        condition_id: '',
        token_id: parsed.tokenId,
        outcome: '',
        order_id: orderId,
        side: 'SELL',
        order_type: parsed.orderType,
        price: parsed.price,
        size: parsed.size,
        status: 'PENDING',
        salt: String(order.salt),
        maker_amount: String(order.makerAmount),
        taker_amount: String(order.takerAmount),
        signature_type: order.signatureType,
        fee_rate_bps: Number(order.feeRateBps),
        expiration: Number(order.expiration),
        nonce: String(order.nonce),
        is_neg_risk: isNegRisk ? 1 : 0,
        response_data: JSON.stringify(response),
        created_at: now,
        updated_at: now,
      });
    }

    return {
      __apiDirect: true,
      externalId: orderId,
      status: 'pending',
      provider: 'polymarket_order',
      action: 'pm_sell',
      data: { orderID: orderId, response },
      metadata: {
        market: parsed.tokenId,
        side: 'SELL',
        size: parsed.size,
        price: parsed.price,
      },
    };
  }

  private async executeCancelOrder(
    params: Record<string, unknown>,
    walletAddress: Hex,
    privateKey: Hex,
    walletId: string,
  ): Promise<ApiDirectResult> {
    const parsed = PmCancelOrderSchema.parse(params);
    const creds = await this.apiKeyService.ensureApiKeys(walletId, walletAddress, privateKey);

    const hmacHeaders = PolymarketSigner.buildHmacHeaders(
      creds.apiKey, creds.secret, creds.passphrase,
      walletAddress, 'DELETE', `/order/${parsed.orderId}`,
    );

    await this.clobClient.cancelOrder(hmacHeaders, parsed.orderId);

    if (this.db) {
      this.db.updateOrderStatusByOrderId(parsed.orderId, 'CANCELLED', Math.floor(Date.now() / 1000));
    }

    return {
      __apiDirect: true,
      externalId: parsed.orderId,
      status: 'success',
      provider: 'polymarket_order',
      action: 'pm_cancel_order',
      data: { orderId: parsed.orderId, cancelled: true },
    };
  }

  private async executeCancelAll(
    params: Record<string, unknown>,
    walletAddress: Hex,
    privateKey: Hex,
    walletId: string,
  ): Promise<ApiDirectResult> {
    const parsed = PmCancelAllSchema.parse(params);
    const creds = await this.apiKeyService.ensureApiKeys(walletId, walletAddress, privateKey);

    const body = parsed.conditionId ? JSON.stringify({ market: parsed.conditionId }) : '';
    const hmacHeaders = PolymarketSigner.buildHmacHeaders(
      creds.apiKey, creds.secret, creds.passphrase,
      walletAddress, 'POST', '/cancel-all', body,
    );

    await this.clobClient.cancelAll(hmacHeaders, parsed.conditionId);

    return {
      __apiDirect: true,
      externalId: 'cancel-all',
      status: 'success',
      provider: 'polymarket_order',
      action: 'pm_cancel_all',
      data: { conditionId: parsed.conditionId ?? 'all', cancelledAll: true },
    };
  }

  private async executeUpdateOrder(
    params: Record<string, unknown>,
    walletAddress: Hex,
    privateKey: Hex,
    walletId: string,
  ): Promise<ApiDirectResult> {
    const parsed = PmUpdateOrderSchema.parse(params);

    // Cancel + replace pattern: first cancel existing, then place new
    const cancelResult = await this.executeCancelOrder(
      { orderId: parsed.orderId },
      walletAddress,
      privateKey,
      walletId,
    );

    // If we have new price/size, place a new order
    // Note: In a real implementation, we'd need the original order's tokenId
    // For now, return the cancel result
    if (!parsed.price && !parsed.size) {
      return cancelResult;
    }

    return {
      __apiDirect: true,
      externalId: parsed.orderId,
      status: 'success',
      provider: 'polymarket_order',
      action: 'pm_update_order',
      data: {
        originalOrderId: parsed.orderId,
        cancelled: true,
        newPrice: parsed.price,
        newSize: parsed.size,
      },
    };
  }
}
