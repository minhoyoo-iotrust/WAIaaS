/**
 * DCent Swap API HTTP client with currency caching.
 *
 * Extends ActionApiClient for standardized HTTP error handling
 * and Zod runtime validation. Implements 24h TTL currency cache
 * with stale-while-revalidate for the get_supported_currencies endpoint.
 *
 * Design source: doc 77 sections 1, 6.2 (caching strategy), 7.5 (error mapping).
 */
import { ChainError } from '@waiaas/core';
import type { ILogger } from '@waiaas/core';
import { ActionApiClient } from '../../common/action-api-client.js';
import {
  DcentCurrenciesResponseSchema,
  DcentQuotesResponseSchema,
  DcentTxDataResponseSchema,
  type DcentCurrency,
  type DcentQuotesResponse,
  type DcentTxDataResponse,
} from './schemas.js';
import { type DcentSwapConfig, DCENT_SWAP_DEFAULTS } from './config.js';
import { DcentDebugDumper } from './debug-dumper.js';

// ---------------------------------------------------------------------------
// Request parameter types
// ---------------------------------------------------------------------------

export interface GetQuotesParams {
  fromId: string;
  toId: string;
  amount: string;
  fromDecimals: number;
  toDecimals: number;
  fromWalletAddress?: string;
}

export interface DexSwapTxParams {
  fromId: string;
  toId: string;
  fromAmount: string;
  fromDecimals: number;
  toDecimals: number;
  fromWalletAddress: string;
  toWalletAddress: string;
  providerId: string;
  isAutoSlippage: boolean;
  slippage: number;
}


// ---------------------------------------------------------------------------
// Client implementation
// ---------------------------------------------------------------------------

export class DcentSwapApiClient extends ActionApiClient {
  private readonly config: DcentSwapConfig;
  private currencyCache: Map<string, DcentCurrency> | null = null;
  private cacheExpiry = 0;
  private readonly dumper?: DcentDebugDumper;

  constructor(config?: Partial<DcentSwapConfig>, logger?: ILogger) {
    const merged = { ...DCENT_SWAP_DEFAULTS, ...config };
    super(merged.apiBaseUrl, merged.requestTimeoutMs, {}, logger);
    this.config = merged;
    if (merged.debugDumpDir) {
      this.dumper = new DcentDebugDumper(merged.debugDumpDir, merged.apiBaseUrl);
    }
  }

  // -----------------------------------------------------------------------
  // Init (preload currencies)
  // -----------------------------------------------------------------------

  /** Preload currencies into cache. Call on startup. */
  async init(): Promise<void> {
    await this.getSupportedCurrencies();
  }

  // -----------------------------------------------------------------------
  // API methods
  // -----------------------------------------------------------------------

  /**
   * GET /api/swap/v3/get_supported_currencies
   * Returns cached data if within TTL. Stale-while-revalidate: if expired,
   * returns stale data immediately and triggers async refresh.
   */
  async getSupportedCurrencies(): Promise<DcentCurrency[]> {
    const now = Date.now();

    // Cache hit: return cached data
    if (this.currencyCache && now < this.cacheExpiry) {
      return Array.from(this.currencyCache.values());
    }

    // Cache stale: return stale + trigger async refresh
    if (this.currencyCache && now >= this.cacheExpiry) {
      void this.refreshCache().catch(() => {
        // Silently ignore refresh failures; stale data is served
      });
      return Array.from(this.currencyCache.values());
    }

    // Cache miss: blocking load
    return this.refreshCache();
  }

  /**
   * POST /api/swap/v3/get_quotes
   * Get swap quotes from all available providers.
   */
  async getQuotes(params: GetQuotesParams): Promise<DcentQuotesResponse> {
    const start = Date.now();
    try {
      const result = await this.post(
        'api/swap/v3/get_quotes',
        params,
        DcentQuotesResponseSchema,
      );
      this.dumper?.record({ method: 'POST', url: 'api/swap/v3/get_quotes', request: params, response: result, status: 200, duration_ms: Date.now() - start });
      return result;
    } catch (err) {
      this.dumper?.record({ method: 'POST', url: 'api/swap/v3/get_quotes', request: params, error: err instanceof Error ? err.message : String(err), duration_ms: Date.now() - start });
      throw this.mapError(err);
    }
  }

  /**
   * POST /api/swap/v3/get_dex_swap_transaction_data
   * Get transaction data for DEX swap execution.
   */
  async getDexSwapTransactionData(params: DexSwapTxParams): Promise<DcentTxDataResponse> {
    const start = Date.now();
    try {
      const result = await this.post(
        'api/swap/v3/get_dex_swap_transaction_data',
        params,
        DcentTxDataResponseSchema,
      );
      this.dumper?.record({ method: 'POST', url: 'api/swap/v3/get_dex_swap_transaction_data', request: params, response: result, status: 200, duration_ms: Date.now() - start });
      return result;
    } catch (err) {
      this.dumper?.record({ method: 'POST', url: 'api/swap/v3/get_dex_swap_transaction_data', request: params, error: err instanceof Error ? err.message : String(err), duration_ms: Date.now() - start });
      throw this.mapError(err);
    }
  }


  // -----------------------------------------------------------------------
  // Cache helpers
  // -----------------------------------------------------------------------

  /** Check if a DCent Currency ID is in the supported currencies cache. */
  isCurrencySupported(dcentId: string): boolean {
    return this.currencyCache?.has(dcentId) ?? false;
  }

  /** Get all cached currencies as a map (for external inspection). */
  getCurrencyMap(): ReadonlyMap<string, DcentCurrency> {
    return this.currencyCache ?? new Map();
  }

  // -----------------------------------------------------------------------
  // Internal helpers
  // -----------------------------------------------------------------------

  private async refreshCache(): Promise<DcentCurrency[]> {
    const start = Date.now();
    let currencies: DcentCurrency[];
    try {
      currencies = await this.get(
        'api/swap/v3/get_supported_currencies',
        DcentCurrenciesResponseSchema,
      );
      this.dumper?.record({ method: 'GET', url: 'api/swap/v3/get_supported_currencies', request: null, response: { count: currencies.length }, status: 200, duration_ms: Date.now() - start });
    } catch (err) {
      this.dumper?.record({ method: 'GET', url: 'api/swap/v3/get_supported_currencies', request: null, error: err instanceof Error ? err.message : String(err), duration_ms: Date.now() - start });
      throw err;
    }

    // Build cache map indexed by currencyId
    const cache = new Map<string, DcentCurrency>();
    for (const c of currencies) {
      cache.set(c.currencyId, c);
    }

    this.currencyCache = cache;
    this.cacheExpiry = Date.now() + this.config.currencyCacheTtlMs;

    return currencies;
  }

  /**
   * Map HTTP and API errors to ChainError codes per doc 77 section 7.5.
   */
  private mapError(err: unknown): ChainError {
    if (err instanceof ChainError) return err;
    if (err instanceof Error) {
      return new ChainError('ACTION_API_ERROR', 'api', {
        message: `DCent API error: ${err.message}`,
        cause: err,
      });
    }
    return new ChainError('ACTION_API_ERROR', 'api', {
      message: `DCent API unknown error: ${String(err)}`,
    });
  }
}
