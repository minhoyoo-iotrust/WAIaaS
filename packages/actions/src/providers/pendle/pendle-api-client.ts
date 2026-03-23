/**
 * Pendle REST API client (v2).
 * Wraps /v1/markets/all, /v2/sdk/{chainId}/convert, and swapping-prices endpoints.
 *
 * Auth is via Authorization Bearer header (optional).
 */
import type { ILogger } from '@waiaas/core';
import { ActionApiClient } from '../../common/action-api-client.js';
import {
  PendleMarketsResponseSchema,
  PendleConvertResponseSchema,
  PendleSwappingPricesSchema,
} from './schemas.js';
import type {
  PendleMarket,
  PendleConvertResponse,
  PendleSwappingPrices,
} from './schemas.js';
import type { PendleConfig } from './config.js';

export class PendleApiClient extends ActionApiClient {
  private readonly chainId: number;

  constructor(config: PendleConfig, chainId: number, logger?: ILogger) {
    const headers: Record<string, string> = {};
    if (config.apiKey) {
      headers['Authorization'] = `Bearer ${config.apiKey}`;
    }
    super(config.apiBaseUrl, config.requestTimeoutMs, headers, logger);
    this.chainId = chainId;
  }

  /**
   * Fetch all active markets for the configured chain.
   * GET /v1/markets/all?chainId={chainId}
   */
  async getMarkets(): Promise<PendleMarket[]> {
    const raw: unknown = await this.get('v1/markets/all', PendleMarketsResponseSchema, {
      chainId: String(this.chainId),
    });
    if (Array.isArray(raw)) return raw as PendleMarket[];
    const obj = raw as Record<string, unknown>;
    if ('markets' in obj) return obj.markets as PendleMarket[];
    if ('results' in obj) return obj.results as PendleMarket[];
    return (obj as { data: PendleMarket[] }).data;
  }

  /**
   * Call the unified Convert endpoint for buy/sell/redeem/LP actions.
   * GET /v2/sdk/{chainId}/convert?tokensIn=...&amountsIn=...&tokensOut=...&slippage=...&receiver=...
   *
   * @param params.tokensIn - Input token address
   * @param params.amountsIn - Input amount in smallest units
   * @param params.tokensOut - Output token address (PT, YT, LP, or underlying)
   * @param params.slippage - Slippage tolerance as decimal (e.g. 0.01 = 1%)
   * @param params.receiver - Wallet address to receive output
   */
  async convert(params: {
    tokensIn: string;
    amountsIn: string;
    tokensOut: string;
    slippage: string;
    receiver: string;
  }): Promise<PendleConvertResponse> {
    const raw = await this.get(`v2/sdk/${this.chainId}/convert`, PendleConvertResponseSchema, {
      tokensIn: params.tokensIn,
      amountsIn: params.amountsIn,
      tokensOut: params.tokensOut,
      slippage: params.slippage,
      receiver: params.receiver,
    });
    // Normalize: extract convert result from any wrapper format
    return this.normalizeConvertResponse(raw);
  }

  /** Extract PendleConvertResponse from any wrapper format. */
  private normalizeConvertResponse(data: unknown): PendleConvertResponse {
    if (Array.isArray(data)) return data[0]!;
    if (typeof data === 'object' && data !== null) {
      const obj = data as Record<string, unknown>;
      if ('data' in obj) return this.normalizeConvertResponse(obj.data);
      if ('results' in obj && Array.isArray(obj.results)) return obj.results[0]!;
      if ('result' in obj && typeof obj.result === 'object') return this.normalizeConvertResponse(obj.result);
      // Routes-based format is already transformed by Zod schema to have tx + amountOut
      if ('tx' in obj) return obj as unknown as PendleConvertResponse;
    }
    return data as PendleConvertResponse;
  }

  /**
   * Get swapping prices (PT/YT) for a specific market.
   * GET /v1/sdk/{chainId}/markets/{market}/swapping-prices
   */
  async getSwappingPrices(market: string): Promise<PendleSwappingPrices> {
    return this.get(
      `v1/sdk/${this.chainId}/markets/${market}/swapping-prices`,
      PendleSwappingPricesSchema,
    );
  }
}
