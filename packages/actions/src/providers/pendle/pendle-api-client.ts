/**
 * Pendle REST API client (v2).
 * Wraps /v1/markets/all, /v2/sdk/{chainId}/convert, and swapping-prices endpoints.
 *
 * Auth is via Authorization Bearer header (optional).
 */
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

  constructor(config: PendleConfig, chainId: number) {
    const headers: Record<string, string> = {};
    if (config.apiKey) {
      headers['Authorization'] = `Bearer ${config.apiKey}`;
    }
    super(config.apiBaseUrl, config.requestTimeoutMs, headers);
    this.chainId = chainId;
  }

  /**
   * Fetch all active markets for the configured chain.
   * GET /v1/markets/all?chainId={chainId}
   */
  async getMarkets(): Promise<PendleMarket[]> {
    const raw = await this.get('v1/markets/all', PendleMarketsResponseSchema, {
      chainId: String(this.chainId),
    });
    if (Array.isArray(raw)) return raw;
    if ('results' in raw) return raw.results as PendleMarket[];
    return (raw as { data: PendleMarket[] }).data;
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
    // Normalize: Pendle API alternates between object and array responses
    return Array.isArray(raw) ? raw[0]! : raw;
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
