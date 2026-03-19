/**
 * LI.FI REST API client (v1).
 * Wraps /quote and /status endpoints for cross-chain bridge operations.
 *
 * Auth is via x-lifi-api-key header (optional, relaxes rate limits).
 */
import type { ILogger } from '@waiaas/core';
import { ActionApiClient } from '../../common/action-api-client.js';
import { LiFiQuoteResponseSchema, LiFiStatusResponseSchema } from './schemas.js';
import type { LiFiQuoteResponse, LiFiStatusResponse } from './schemas.js';
import type { LiFiConfig } from './config.js';

export class LiFiApiClient extends ActionApiClient {
  constructor(config: LiFiConfig, logger?: ILogger) {
    const headers: Record<string, string> = {};
    if (config.apiKey) {
      headers['x-lifi-api-key'] = config.apiKey;
    }
    super(config.apiBaseUrl, config.requestTimeoutMs, headers, logger);
  }

  async getQuote(params: {
    fromChain: number;
    toChain: number;
    fromToken: string;
    toToken: string;
    fromAmount: string;
    fromAddress: string;
    slippage: number;        // decimal, e.g. 0.03 = 3%
    toAddress?: string;
  }): Promise<LiFiQuoteResponse> {
    return this.get('quote', LiFiQuoteResponseSchema, {
      fromChain: String(params.fromChain),
      toChain: String(params.toChain),
      fromToken: params.fromToken,
      toToken: params.toToken,
      fromAmount: params.fromAmount,
      fromAddress: params.fromAddress,
      slippage: String(params.slippage),
      ...(params.toAddress ? { toAddress: params.toAddress } : {}),
    });
  }

  async getStatus(params: {
    txHash: string;
    bridge?: string;
    fromChain?: number;
    toChain?: number;
  }): Promise<LiFiStatusResponse> {
    const queryParams: Record<string, string> = {
      txHash: params.txHash,
    };
    if (params.bridge) queryParams.bridge = params.bridge;
    if (params.fromChain) queryParams.fromChain = String(params.fromChain);
    if (params.toChain) queryParams.toChain = String(params.toChain);

    return this.get('status', LiFiStatusResponseSchema, queryParams);
  }
}
