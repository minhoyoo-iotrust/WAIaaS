/**
 * XRPL DEX Action Provider.
 *
 * Implements IActionProvider with 5 actions:
 * - swap: Immediate-or-Cancel swap (tfImmediateOrCancel)
 * - limit_order: Passive limit order on the orderbook
 * - cancel_order: Cancel an existing offer by OfferSequence
 * - get_orderbook: Query orderbook depth (ApiDirectResult)
 * - get_offers: Query account's active offers (ApiDirectResult)
 *
 * On-chain actions return ContractCallRequest with calldata JSON
 * containing xrplTxType for RippleAdapter.buildContractCall() routing.
 *
 * @see Phase 02-02 Task 1
 */
import { ChainError } from '@waiaas/core';
import type {
  IActionProvider,
  ActionProviderMetadata,
  ActionDefinition,
  ActionContext,
  ContractCallRequest,
  ApiDirectResult,
} from '@waiaas/core';

import {
  SwapInputSchema,
  LimitOrderInputSchema,
  CancelOrderInputSchema,
  GetOrderbookInputSchema,
  GetOffersInputSchema,
} from './schemas.js';
import {
  buildSwapParams,
  buildLimitOrderParams,
  buildCancelParams,
  validateReserve,
  parseTokenToBookOfferCurrency,
} from './offer-builder.js';
import type { XrplOrderbookClient } from './orderbook-client.js';

// ---------------------------------------------------------------------------
// Provider implementation
// ---------------------------------------------------------------------------

export class XrplDexProvider implements IActionProvider {
  readonly metadata: ActionProviderMetadata;
  readonly actions: readonly ActionDefinition[];

  constructor(private readonly orderbookClient: XrplOrderbookClient) {
    this.metadata = {
      name: 'xrpl_dex',
      displayName: 'XRPL DEX',
      description: 'XRPL native orderbook DEX for token swaps and limit orders',
      version: '1.0.0',
      chains: ['ripple'],
      mcpExpose: true,
      requiresApiKey: false,
      requiredApis: [],
      requiresSigningKey: false,
    };

    this.actions = [
      {
        name: 'swap',
        description: 'Immediate swap on XRPL DEX with slippage protection (tfImmediateOrCancel)',
        chain: 'ripple',
        inputSchema: SwapInputSchema,
        riskLevel: 'medium',
        defaultTier: 'INSTANT',
      },
      {
        name: 'limit_order',
        description: 'Place a limit order on the XRPL DEX orderbook with expiration',
        chain: 'ripple',
        inputSchema: LimitOrderInputSchema,
        riskLevel: 'medium',
        defaultTier: 'DELAY',
      },
      {
        name: 'cancel_order',
        description: 'Cancel an existing XRPL DEX offer by its sequence number',
        chain: 'ripple',
        inputSchema: CancelOrderInputSchema,
        riskLevel: 'low',
        defaultTier: 'INSTANT',
      },
      {
        name: 'get_orderbook',
        description: 'Query the XRPL DEX orderbook depth for a trading pair (bids and asks)',
        chain: 'ripple',
        inputSchema: GetOrderbookInputSchema,
        riskLevel: 'low',
        defaultTier: 'INSTANT',
      },
      {
        name: 'get_offers',
        description: 'List active XRPL DEX offers for the current wallet account',
        chain: 'ripple',
        inputSchema: GetOffersInputSchema,
        riskLevel: 'low',
        defaultTier: 'INSTANT',
      },
    ] as const;
  }

  async resolve(
    actionName: string,
    params: Record<string, unknown>,
    context: ActionContext,
  ): Promise<ContractCallRequest | ContractCallRequest[] | ApiDirectResult> {
    switch (actionName) {
      case 'swap':
        return this.resolveSwap(params, context);
      case 'limit_order':
        return this.resolveLimitOrder(params, context);
      case 'cancel_order':
        return this.resolveCancelOrder(params);
      case 'get_orderbook':
        return this.resolveGetOrderbook(params);
      case 'get_offers':
        return this.resolveGetOffers(context);
      default:
        throw new ChainError('INVALID_INSTRUCTION', 'ripple', {
          message: `Unknown XRPL DEX action: ${actionName}`,
        });
    }
  }

  // -------------------------------------------------------------------------
  // On-chain actions
  // -------------------------------------------------------------------------

  /**
   * Immediate swap with tfImmediateOrCancel.
   * If TakerPays is an IOU and no trust line exists, returns 2-step
   * [TrustSet, OfferCreate] array for automatic trust line setup (DEX-07).
   */
  private async resolveSwap(
    params: Record<string, unknown>,
    context: ActionContext,
  ): Promise<ContractCallRequest | ContractCallRequest[]> {
    const input = SwapInputSchema.parse(params);
    const calldataObj = buildSwapParams(input);

    // Check trust line for IOU TakerPays (what we receive)
    const trustSetRequest = await this.maybeBuildTrustSet(
      input.takerPays,
      context.walletAddress,
    );

    const swapRequest: ContractCallRequest = {
      type: 'CONTRACT_CALL',
      to: getIssuerAddress(input.takerPays),
      value: input.takerGets === 'XRP' ? input.takerGetsAmount : undefined,
      calldata: JSON.stringify(calldataObj),
      actionProvider: 'xrpl_dex',
      actionName: 'swap',
    };

    if (trustSetRequest) {
      return [trustSetRequest, swapRequest];
    }
    return swapRequest;
  }

  /**
   * Limit order -- passive order on the orderbook.
   * Validates reserve before placing (DEX-08).
   * Checks trust line for IOU TakerPays (DEX-07).
   */
  private async resolveLimitOrder(
    params: Record<string, unknown>,
    context: ActionContext,
  ): Promise<ContractCallRequest | ContractCallRequest[]> {
    const input = LimitOrderInputSchema.parse(params);

    // Validate reserve for new offer object
    const reserve = await this.orderbookClient.getAccountReserve(context.walletAddress);
    const offers = await this.orderbookClient.getAccountOffers(context.walletAddress, 400);
    validateReserve(reserve.availableBalance, offers.length);

    const calldataObj = buildLimitOrderParams(input);

    // Check trust line for IOU TakerPays
    const trustSetRequest = await this.maybeBuildTrustSet(
      input.takerPays,
      context.walletAddress,
    );

    const limitRequest: ContractCallRequest = {
      type: 'CONTRACT_CALL',
      to: getIssuerAddress(input.takerPays),
      value: input.takerGets === 'XRP' ? input.takerGetsAmount : undefined,
      calldata: JSON.stringify(calldataObj),
      actionProvider: 'xrpl_dex',
      actionName: 'limit_order',
    };

    if (trustSetRequest) {
      return [trustSetRequest, limitRequest];
    }
    return limitRequest;
  }

  /**
   * Cancel an existing offer by OfferSequence.
   */
  private resolveCancelOrder(
    params: Record<string, unknown>,
  ): ContractCallRequest {
    const input = CancelOrderInputSchema.parse(params);
    const calldataObj = buildCancelParams(input.offerSequence);

    return {
      type: 'CONTRACT_CALL',
      to: 'native',
      calldata: JSON.stringify(calldataObj),
      actionProvider: 'xrpl_dex',
      actionName: 'cancel_order',
    };
  }

  // -------------------------------------------------------------------------
  // Read-only queries (ApiDirectResult -- pipeline bypass)
  // -------------------------------------------------------------------------

  /**
   * Query orderbook depth for a trading pair.
   */
  private async resolveGetOrderbook(
    params: Record<string, unknown>,
  ): Promise<ApiDirectResult> {
    const input = GetOrderbookInputSchema.parse(params);
    const base = parseTokenToBookOfferCurrency(input.base);
    const counter = parseTokenToBookOfferCurrency(input.counter);

    const orderbook = await this.orderbookClient.getOrderbook(base, counter, input.limit);

    return {
      __apiDirect: true,
      externalId: `orderbook-${Date.now()}`,
      status: 'success',
      provider: 'xrpl_dex',
      action: 'get_orderbook',
      data: {
        base: input.base,
        counter: input.counter,
        bids: orderbook.bids,
        asks: orderbook.asks,
        spread: orderbook.spread,
      },
    };
  }

  /**
   * List active offers for the wallet account.
   */
  private async resolveGetOffers(
    context: ActionContext,
  ): Promise<ApiDirectResult> {
    const offers = await this.orderbookClient.getAccountOffers(
      context.walletAddress,
      50,
    );

    return {
      __apiDirect: true,
      externalId: `offers-${Date.now()}`,
      status: 'success',
      provider: 'xrpl_dex',
      action: 'get_offers',
      data: {
        account: context.walletAddress,
        offers,
        count: offers.length,
      },
    };
  }

  // -------------------------------------------------------------------------
  // Trust line auto-setup (DEX-07)
  // -------------------------------------------------------------------------

  /**
   * If token is IOU and trust line doesn't exist, build a TrustSet
   * ContractCallRequest to be prepended as the first step.
   */
  private async maybeBuildTrustSet(
    token: string,
    walletAddress: string,
  ): Promise<ContractCallRequest | null> {
    if (token === 'XRP') return null;

    const dotIndex = token.indexOf('.');
    if (dotIndex === -1) return null;

    const currency = token.slice(0, dotIndex);
    const issuer = token.slice(dotIndex + 1);

    const hasTrustLine = await this.orderbookClient.checkTrustLine(
      walletAddress,
      currency,
      issuer,
    );

    if (hasTrustLine) return null;

    // Build TrustSet calldata for buildContractCall routing
    const trustSetCalldata = {
      xrplTxType: 'TrustSet',
      LimitAmount: {
        currency,
        issuer,
        value: '1000000000000000', // max trust line limit
      },
      Flags: 0x00020000, // tfSetNoRipple
    };

    return {
      type: 'CONTRACT_CALL',
      to: issuer,
      calldata: JSON.stringify(trustSetCalldata),
      actionProvider: 'xrpl_dex',
      actionName: 'trust_set_auto',
    };
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Extract issuer address from token string for ContractCallRequest.to field.
 * "XRP" -> "native"
 * "USD.rIssuer" -> "rIssuer"
 */
function getIssuerAddress(token: string): string {
  if (token === 'XRP') return 'native';
  const dotIndex = token.indexOf('.');
  return dotIndex > 0 ? token.slice(dotIndex + 1) : 'native';
}
