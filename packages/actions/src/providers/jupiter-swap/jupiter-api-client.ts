/**
 * Jupiter REST API client (v1).
 * Wraps /swap/v1/quote and /swap/v1/swap-instructions endpoints.
 */
import type { ILogger } from '@waiaas/core';
import { ActionApiClient } from '../../common/action-api-client.js';
import { QuoteResponseSchema, SwapInstructionsResponseSchema } from './schemas.js';
import type { QuoteResponse, SwapInstructionsResponse } from './schemas.js';
import type { JupiterSwapConfig } from './config.js';

export class JupiterApiClient extends ActionApiClient {
  constructor(config: JupiterSwapConfig, logger?: ILogger) {
    const headers: Record<string, string> = {};
    if (config.apiKey) {
      headers['x-api-key'] = config.apiKey;
    }
    super(config.apiBaseUrl, config.requestTimeoutMs, headers, logger);
  }

  async getQuote(params: {
    inputMint: string;
    outputMint: string;
    amount: string;
    slippageBps: number;
    restrictIntermediateTokens?: boolean;
  }): Promise<QuoteResponse> {
    return this.get('quote', QuoteResponseSchema, {
      inputMint: params.inputMint,
      outputMint: params.outputMint,
      amount: params.amount,
      slippageBps: String(params.slippageBps),
      restrictIntermediateTokens: String(params.restrictIntermediateTokens ?? true),
    });
  }

  async getSwapInstructions(params: {
    quoteResponse: QuoteResponse;
    userPublicKey: string;
    jitoTipLamports?: number;
  }): Promise<SwapInstructionsResponse> {
    const body: Record<string, unknown> = {
      quoteResponse: params.quoteResponse,
      userPublicKey: params.userPublicKey,
    };
    if (params.jitoTipLamports && params.jitoTipLamports > 0) {
      body.prioritizationFeeLamports = {
        jitoTipLamports: params.jitoTipLamports,
      };
    }
    return this.post('swap-instructions', body, SwapInstructionsResponseSchema);
  }
}
