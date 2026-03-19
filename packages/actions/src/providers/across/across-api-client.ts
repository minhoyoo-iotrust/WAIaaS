/**
 * Across Protocol REST API client.
 * Wraps 5 endpoints for cross-chain bridge operations.
 *
 * Endpoints:
 * - /suggested-fees    (quote with fees, limits, fill time)
 * - /limits            (min/max transfer amounts)
 * - /available-routes  (supported chain/token combinations)
 * - /deposit/status    (bridge deposit status tracking)
 * - /swap/approval     (combined approval + bridge TX calldata)
 *
 * See: design doc 79 section 2
 */
import type { ILogger } from '@waiaas/core';
import { ActionApiClient } from '../../common/action-api-client.js';
import {
  AcrossSuggestedFeesResponseSchema,
  AcrossLimitsResponseSchema,
  AcrossAvailableRoutesResponseSchema,
  AcrossDepositStatusResponseSchema,
  AcrossSwapApprovalResponseSchema,
} from './schemas.js';
import type {
  AcrossSuggestedFeesResponse,
  AcrossLimitsResponse,
  AcrossAvailableRoutesResponse,
  AcrossDepositStatusResponse,
  AcrossSwapApprovalResponse,
} from './schemas.js';
import type { AcrossConfig } from './config.js';

export class AcrossApiClient extends ActionApiClient {
  constructor(config: AcrossConfig, logger?: ILogger) {
    // Append integratorId to base URL if provided (Across API recommendation)
    const baseUrl = config.integratorId
      ? `${config.apiBaseUrl}?integratorId=${encodeURIComponent(config.integratorId)}`
      : config.apiBaseUrl;
    super(baseUrl, config.requestTimeoutMs, {}, logger);
  }

  /**
   * GET /suggested-fees -- Bridge quote with fees, limits, and estimated fill time.
   * NEVER cache this response (DS-03: real-time fee data).
   */
  async getSuggestedFees(params: {
    inputToken: string;
    outputToken: string;
    originChainId: number;
    destinationChainId: number;
    amount: string;
    recipient?: string;
  }): Promise<AcrossSuggestedFeesResponse> {
    const queryParams: Record<string, string> = {
      inputToken: params.inputToken,
      outputToken: params.outputToken,
      originChainId: String(params.originChainId),
      destinationChainId: String(params.destinationChainId),
      amount: params.amount,
    };
    if (params.recipient) queryParams.recipient = params.recipient;

    return this.get('suggested-fees', AcrossSuggestedFeesResponseSchema, queryParams);
  }

  /**
   * GET /limits -- Min/max transfer amounts for a specific route.
   */
  async getLimits(params: {
    inputToken: string;
    outputToken: string;
    originChainId: number;
    destinationChainId: number;
  }): Promise<AcrossLimitsResponse> {
    return this.get('limits', AcrossLimitsResponseSchema, {
      inputToken: params.inputToken,
      outputToken: params.outputToken,
      originChainId: String(params.originChainId),
      destinationChainId: String(params.destinationChainId),
    });
  }

  /**
   * GET /available-routes -- Supported bridge routes (chain/token combinations).
   * This endpoint's response may be cached (5min TTL per DS-03).
   */
  async getAvailableRoutes(params?: {
    originChainId?: number;
    destinationChainId?: number;
    originToken?: string;
    destinationToken?: string;
  }): Promise<AcrossAvailableRoutesResponse> {
    const queryParams: Record<string, string> = {};
    if (params?.originChainId) queryParams.originChainId = String(params.originChainId);
    if (params?.destinationChainId) queryParams.destinationChainId = String(params.destinationChainId);
    if (params?.originToken) queryParams.originToken = params.originToken;
    if (params?.destinationToken) queryParams.destinationToken = params.destinationToken;

    return this.get('available-routes', AcrossAvailableRoutesResponseSchema, queryParams);
  }

  /**
   * GET /deposit/status -- Bridge deposit status tracking.
   */
  async getDepositStatus(params: {
    depositTxnRef: string;
    originChainId?: number;
  }): Promise<AcrossDepositStatusResponse> {
    const queryParams: Record<string, string> = {
      depositTxnRef: params.depositTxnRef,
    };
    if (params.originChainId) queryParams.originChainId = String(params.originChainId);

    return this.get('deposit/status', AcrossDepositStatusResponseSchema, queryParams);
  }

  /**
   * GET /swap/approval -- Combined approval + bridge TX calldata.
   * NEVER cache this response (DS-03: real-time data).
   */
  async getSwapApproval(params: {
    tokenAddr: string;
    originChainId: number;
    destinationChainId: number;
    amount: string;
    depositor: string;
    recipient?: string;
    inputToken?: string;
    outputToken?: string;
  }): Promise<AcrossSwapApprovalResponse> {
    const queryParams: Record<string, string> = {
      tokenAddr: params.tokenAddr,
      originChainId: String(params.originChainId),
      destinationChainId: String(params.destinationChainId),
      amount: params.amount,
      depositor: params.depositor,
    };
    if (params.recipient) queryParams.recipient = params.recipient;
    if (params.inputToken) queryParams.inputToken = params.inputToken;
    if (params.outputToken) queryParams.outputToken = params.outputToken;

    return this.get('swap/approval', AcrossSwapApprovalResponseSchema, queryParams);
  }
}
