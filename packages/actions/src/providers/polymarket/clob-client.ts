/**
 * PolymarketClobClient: REST client for CLOB API with L1/L2 auth and rate limiting.
 *
 * L1 endpoints (API Key lifecycle): Use EIP-712 ClobAuth signature headers.
 * L2 endpoints (trading): Use HMAC-SHA256 headers.
 * Public endpoints (orderbook/price): No auth required.
 *
 * @see design doc 80, Section 3.4
 */
import { ChainError } from '@waiaas/core';
import { PM_ERRORS, PM_DEFAULTS } from './config.js';
import type { PolymarketRateLimiter } from './rate-limiter.js';
import type {
  ClobOrderResponse,
  OrderbookResponse,
  PriceResponse,
  MidpointResponse,
} from './schemas.js';
import {
  ClobOrderResponseSchema,
  OrderbookResponseSchema,
  PriceResponseSchema,
  MidpointResponseSchema,
} from './schemas.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** L1 auth headers for API Key lifecycle endpoints */
export interface L1Headers {
  POLY_ADDRESS: string;
  POLY_SIGNATURE: string;
  POLY_TIMESTAMP: string;
  POLY_NONCE: string;
}

/** API credentials returned from createApiKey */
export interface ApiCredentials {
  apiKey: string;
  secret: string;
  passphrase: string;
}

/** CLOB order data from GET /data/orders */
export interface ClobOrder {
  id: string;
  status: string;
  asset_id: string;
  side: string;
  original_size: string;
  size_matched: string;
  price: string;
  order_type: string;
  created_at: string;
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

/**
 * REST client for Polymarket CLOB API.
 * All requests go through the rate limiter.
 */
export class PolymarketClobClient {
  constructor(
    private readonly baseUrl: string,
    private readonly rateLimiter: PolymarketRateLimiter,
    private readonly timeoutMs: number = PM_DEFAULTS.REQUEST_TIMEOUT_MS,
  ) {}

  // -----------------------------------------------------------------------
  // L1 endpoints (API Key lifecycle)
  // -----------------------------------------------------------------------

  /** Create API credentials (L1 auth). POST /auth/api-key */
  async createApiKey(
    walletAddress: string,
    signature: string,
    timestamp: string,
    nonce: string = '0',
  ): Promise<ApiCredentials> {
    const headers: L1Headers = {
      POLY_ADDRESS: walletAddress,
      POLY_SIGNATURE: signature,
      POLY_TIMESTAMP: timestamp,
      POLY_NONCE: nonce,
    };
    const res = await this._fetch('POST', '/auth/api-key', { l1Headers: headers });
    return res as ApiCredentials;
  }

  /** Delete API credentials (L1 auth). DELETE /auth/api-key */
  async deleteApiKey(
    walletAddress: string,
    signature: string,
    timestamp: string,
    nonce: string = '0',
  ): Promise<void> {
    const headers: L1Headers = {
      POLY_ADDRESS: walletAddress,
      POLY_SIGNATURE: signature,
      POLY_TIMESTAMP: timestamp,
      POLY_NONCE: nonce,
    };
    await this._fetch('DELETE', '/auth/api-key', { l1Headers: headers });
  }

  /** Get existing API keys (L1 auth). GET /auth/api-keys */
  async getApiKeys(
    walletAddress: string,
    signature: string,
    timestamp: string,
    nonce: string = '0',
  ): Promise<unknown[]> {
    const headers: L1Headers = {
      POLY_ADDRESS: walletAddress,
      POLY_SIGNATURE: signature,
      POLY_TIMESTAMP: timestamp,
      POLY_NONCE: nonce,
    };
    const res = await this._fetch('GET', '/auth/api-keys', { l1Headers: headers });
    return Array.isArray(res) ? res : [];
  }

  // -----------------------------------------------------------------------
  // L2 endpoints (trading)
  // -----------------------------------------------------------------------

  /** Submit a signed order. POST /order */
  async postOrder(
    hmacHeaders: Record<string, string>,
    orderPayload: Record<string, unknown>,
  ): Promise<ClobOrderResponse> {
    const res = await this._fetch('POST', '/order', {
      l2Headers: hmacHeaders,
      body: orderPayload,
    });
    return ClobOrderResponseSchema.parse(res);
  }

  /** Cancel a specific order. DELETE /order/{orderId} */
  async cancelOrder(
    hmacHeaders: Record<string, string>,
    orderId: string,
  ): Promise<void> {
    await this._fetch('DELETE', `/order/${orderId}`, { l2Headers: hmacHeaders });
  }

  /** Cancel all orders (optionally for a specific market). POST /cancel-all */
  async cancelAll(
    hmacHeaders: Record<string, string>,
    conditionId?: string,
  ): Promise<void> {
    const body = conditionId ? { market: conditionId } : {};
    await this._fetch('POST', '/cancel-all', { l2Headers: hmacHeaders, body });
  }

  /** Get active orders. GET /data/orders */
  async getOrders(
    hmacHeaders: Record<string, string>,
  ): Promise<ClobOrder[]> {
    const res = await this._fetch('GET', '/data/orders', { l2Headers: hmacHeaders });
    return Array.isArray(res) ? res as ClobOrder[] : [];
  }

  /** Get a specific order by hash. GET /data/order/{hash} */
  async getOrder(
    hmacHeaders: Record<string, string>,
    orderHash: string,
  ): Promise<ClobOrder> {
    const res = await this._fetch('GET', `/data/order/${orderHash}`, { l2Headers: hmacHeaders });
    return res as ClobOrder;
  }

  /** Get trade history. GET /trades */
  async getTrades(
    hmacHeaders: Record<string, string>,
  ): Promise<unknown[]> {
    const res = await this._fetch('GET', '/trades', { l2Headers: hmacHeaders });
    return Array.isArray(res) ? res : [];
  }

  // -----------------------------------------------------------------------
  // Public endpoints (no auth)
  // -----------------------------------------------------------------------

  /** Get orderbook. GET /book?token_id={tokenId} */
  async getOrderbook(tokenId: string): Promise<OrderbookResponse> {
    const res = await this._fetch('GET', `/book?token_id=${tokenId}`);
    return OrderbookResponseSchema.parse(res);
  }

  /** Get current price. GET /price?token_id={tokenId} */
  async getPrice(tokenId: string): Promise<PriceResponse> {
    const res = await this._fetch('GET', `/price?token_id=${tokenId}`);
    return PriceResponseSchema.parse(res);
  }

  /** Get midpoint price. GET /midpoint?token_id={tokenId} */
  async getMidpoint(tokenId: string): Promise<MidpointResponse> {
    const res = await this._fetch('GET', `/midpoint?token_id=${tokenId}`);
    return MidpointResponseSchema.parse(res);
  }

  /** Check if a token ID belongs to a neg_risk market. GET /neg-risk?token_id={tokenId} */
  async getNegRisk(tokenId: string): Promise<boolean> {
    const res = await this._fetch('GET', `/neg-risk?token_id=${tokenId}`) as { neg_risk?: boolean };
    return res.neg_risk === true;
  }

  // -----------------------------------------------------------------------
  // Internal
  // -----------------------------------------------------------------------

  private async _fetch(
    method: string,
    path: string,
    options?: {
      l1Headers?: L1Headers;
      l2Headers?: Record<string, string>;
      body?: unknown;
    },
  ): Promise<unknown> {
    await this.rateLimiter.acquire();

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    // Add L1 or L2 auth headers
    if (options?.l1Headers) {
      Object.assign(headers, options.l1Headers);
    }
    if (options?.l2Headers) {
      Object.assign(headers, options.l2Headers);
    }

    const fetchOptions: RequestInit = {
      method: method.toUpperCase(),
      headers,
      signal: controller.signal,
    };

    // Add body for POST/PUT/PATCH
    if (options?.body && ['POST', 'PUT', 'PATCH'].includes(method.toUpperCase())) {
      fetchOptions.body = JSON.stringify(options.body);
    }

    try {
      const response = await fetch(`${this.baseUrl}${path}`, fetchOptions);

      if (!response.ok) {
        const text = await response.text().catch(() => '');
        let errorMessage = `Polymarket CLOB API error: ${response.status}`;
        try {
          const errorJson = JSON.parse(text);
          if (errorJson.error) errorMessage = `Polymarket: ${errorJson.error}`;
          else if (errorJson.message) errorMessage = `Polymarket: ${errorJson.message}`;
        } catch {
          if (text) errorMessage += ` ${text}`;
        }

        const code = response.status === 429 ? PM_ERRORS.RATE_LIMITED : PM_ERRORS.API_ERROR;
        throw new ChainError(code, 'POLYMARKET', { message: errorMessage });
      }

      // Handle 204 No Content
      if (response.status === 204) return {};

      return await response.json();
    } catch (err) {
      if (err instanceof ChainError) throw err;
      if ((err as Error).name === 'AbortError') {
        throw new ChainError('ACTION_API_TIMEOUT', 'POLYMARKET', {
          message: 'Polymarket CLOB API request timeout',
        });
      }
      throw new ChainError(PM_ERRORS.API_ERROR, 'POLYMARKET', {
        message: `Polymarket CLOB API error: ${(err as Error).message}`,
      });
    } finally {
      clearTimeout(timeout);
    }
  }
}
