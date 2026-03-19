/**
 * 0x Swap REST API client (v2).
 * Wraps /swap/allowance-holder/price and /swap/allowance-holder/quote endpoints.
 *
 * All requests include chainId as query parameter and 0x-version: v2 header.
 * Auth is via 0x-api-key header (optional for price, required for quote).
 */
import type { ILogger } from '@waiaas/core';
import { ActionApiClient } from '../../common/action-api-client.js';
import { PriceResponseSchema, QuoteResponseSchema } from './schemas.js';
import type { PriceResponse, QuoteResponse } from './schemas.js';
import type { ZeroExSwapConfig } from './config.js';

export class ZeroExApiClient extends ActionApiClient {
  private readonly chainId: number;

  constructor(config: ZeroExSwapConfig, chainId: number, logger?: ILogger) {
    const headers: Record<string, string> = {
      '0x-version': 'v2',          // ZXSW-01
    };
    if (config.apiKey) {
      headers['0x-api-key'] = config.apiKey;  // ZXSW-01
    }
    super(config.apiBaseUrl, config.requestTimeoutMs, headers, logger);  // ZXSW-10
    this.chainId = chainId;
  }

  async getPrice(params: {
    sellToken: string;
    buyToken: string;
    sellAmount: string;
    taker: string;
    slippageBps: number;
  }): Promise<PriceResponse> {
    return this.get('swap/allowance-holder/price', PriceResponseSchema, {
      chainId: String(this.chainId),  // ZXSW-01
      sellToken: params.sellToken,
      buyToken: params.buyToken,
      sellAmount: params.sellAmount,
      taker: params.taker,
      slippageBps: String(params.slippageBps),
    });
  }

  async getQuote(params: {
    sellToken: string;
    buyToken: string;
    sellAmount: string;
    taker: string;
    slippageBps: number;
  }): Promise<QuoteResponse> {
    return this.get('swap/allowance-holder/quote', QuoteResponseSchema, {
      chainId: String(this.chainId),  // ZXSW-01
      sellToken: params.sellToken,
      buyToken: params.buyToken,
      sellAmount: params.sellAmount,
      taker: params.taker,
      slippageBps: String(params.slippageBps),
    });
  }
}
