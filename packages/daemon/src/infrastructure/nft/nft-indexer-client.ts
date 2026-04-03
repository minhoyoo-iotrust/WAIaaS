/**
 * NftIndexerClient -- unified wrapper over INftIndexer with retry, caching, and settings integration.
 *
 * Resolves the correct indexer (Alchemy for EVM, Helius for Solana) based on chain type,
 * reads API keys from SettingsService, applies exponential backoff retry on transient errors,
 * and provides in-memory caching for list queries.
 *
 * @since v31.0
 */

import type { ChainType, NetworkType, NftListOptions, NftListResult, NftMetadata } from '@waiaas/core';
import type { INftIndexer } from '@waiaas/core';
import { WAIaaSError } from '@waiaas/core';
import { AlchemyNftIndexer } from './alchemy-nft-indexer.js';
import { HeliusNftIndexer } from './helius-nft-indexer.js';
import { DEFAULT_MAX_RETRIES } from '../../constants.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SettingsServiceLike {
  get(key: string): string;
}

export interface NftIndexerClientConfig {
  settingsService: SettingsServiceLike;
}

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

// ---------------------------------------------------------------------------
// Retry constants
// ---------------------------------------------------------------------------

const RETRY_BASE_MS = 1000;
const RETRY_MULTIPLIER = 2;

/** HTTP status codes that trigger retry. */
const RETRYABLE_STATUSES = new Set([429, 500, 502, 503]);

// ---------------------------------------------------------------------------
// NftIndexerClient
// ---------------------------------------------------------------------------

export class NftIndexerClient {
  private readonly settings: SettingsServiceLike;
  private readonly indexerCache = new Map<string, INftIndexer>();
  private readonly responseCache = new Map<string, CacheEntry<unknown>>();

  constructor(config: NftIndexerClientConfig) {
    this.settings = config.settingsService;
  }

  /**
   * Get or create the INftIndexer for a given chain type.
   * Throws INDEXER_NOT_CONFIGURED if the API key is not set.
   */
  getIndexer(chain: ChainType): INftIndexer {
    // XRPL NFTs are queried directly via adapter's account_nfts RPC, not external indexers
    if (chain === 'ripple') {
      throw new WAIaaSError('INDEXER_NOT_CONFIGURED', {
        message: 'XRPL NFT indexing uses native RPC via adapter. Use GET /v1/wallet/assets instead.',
      });
    }

    // Check if we have a cached indexer (and API key hasn't changed)
    const apiKey = this.getApiKey(chain);

    const cacheKey = `${chain}:${apiKey}`;
    const cached = this.indexerCache.get(cacheKey);
    if (cached) return cached;

    let indexer: INftIndexer;
    if (chain === 'solana') {
      indexer = new HeliusNftIndexer({ apiKey });
    } else {
      // All EVM chains use Alchemy
      indexer = new AlchemyNftIndexer({ apiKey });
    }

    this.indexerCache.set(cacheKey, indexer);
    return indexer;
  }

  /**
   * List NFTs with retry and caching.
   */
  async listNfts(chain: ChainType, options: NftListOptions): Promise<NftListResult> {
    const cacheKey = `listNfts:${chain}:${JSON.stringify(options)}`;
    const cached = this.getCached<NftListResult>(cacheKey);
    if (cached) return cached;

    const result = await this.withRetry(() => {
      const indexer = this.getIndexer(chain);
      return indexer.listNfts(options);
    });

    this.setCache(cacheKey, result);
    return result;
  }

  /**
   * Get NFT metadata with retry (no cache -- DB cache in Phase 335).
   */
  async getNftMetadata(
    chain: ChainType,
    network: string,
    contractAddress: string,
    tokenId: string,
  ): Promise<NftMetadata> {
    return this.withRetry(() => {
      const indexer = this.getIndexer(chain);
      return indexer.getNftMetadata(network as NetworkType, contractAddress, tokenId);
    });
  }

  /**
   * List NFTs in a collection with retry and caching.
   */
  async getNftsByCollection(
    chain: ChainType,
    network: string,
    collectionAddress: string,
    pageKey?: string,
  ): Promise<NftListResult> {
    const cacheKey = `getNftsByCollection:${chain}:${network}:${collectionAddress}:${pageKey ?? ''}`;
    const cached = this.getCached<NftListResult>(cacheKey);
    if (cached) return cached;

    const result = await this.withRetry(() => {
      const indexer = this.getIndexer(chain);
      return indexer.getNftsByCollection(network as NetworkType, collectionAddress, pageKey);
    });

    this.setCache(cacheKey, result);
    return result;
  }

  /**
   * Clear all cached responses.
   */
  clearCache(): void {
    this.responseCache.clear();
  }

  // -- Private helpers --

  private getApiKey(chain: ChainType): string {
    const settingKey = chain === 'solana'
      ? 'actions.helius_das_api_key'
      : 'actions.alchemy_nft_api_key';

    const apiKey = this.settings.get(settingKey);
    if (!apiKey) {
      throw new WAIaaSError('INDEXER_NOT_CONFIGURED', {
        message: `NFT indexer API key not configured for chain: ${chain}. Set ${settingKey} in Admin Settings.`,
      });
    }
    return apiKey;
  }

  private getCacheTtlMs(): number {
    const ttlSec = parseInt(this.settings.get('actions.nft_indexer_cache_ttl_sec') || '300', 10);
    return ttlSec * 1000;
  }

  private getCached<T>(key: string): T | undefined {
    const entry = this.responseCache.get(key) as CacheEntry<T> | undefined;
    if (!entry) return undefined;
    if (Date.now() > entry.expiresAt) {
      this.responseCache.delete(key);
      return undefined;
    }
    return entry.data;
  }

  private setCache<T>(key: string, data: T): void {
    const ttlMs = this.getCacheTtlMs();
    this.responseCache.set(key, {
      data,
      expiresAt: Date.now() + ttlMs,
    });
  }

  /**
   * Retry wrapper with exponential backoff.
   * Retries on HTTP 429/500/502/503. Respects Retry-After header.
   */
  private async withRetry<T>(fn: () => Promise<T>): Promise<T> {
    let lastError: unknown;

    for (let attempt = 0; attempt <= DEFAULT_MAX_RETRIES; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error;

        // Only retry on retryable errors
        if (!this.isRetryable(error) || attempt >= DEFAULT_MAX_RETRIES) {
          throw error;
        }

        // Calculate delay
        let delayMs = RETRY_BASE_MS * Math.pow(RETRY_MULTIPLIER, attempt);

        // Respect Retry-After header if present
        const retryAfter = this.getRetryAfter(error);
        if (retryAfter !== undefined) {
          delayMs = retryAfter * 1000;
        }

        await this.sleep(delayMs);
      }
    }

    throw lastError;
  }

  private isRetryable(error: unknown): boolean {
    if (!(error instanceof WAIaaSError)) return false;
    if (error.code !== 'INDEXER_API_ERROR') return false;

    const statusCode = error.details?.statusCode as number | undefined;
    if (statusCode && RETRYABLE_STATUSES.has(statusCode)) return true;

    // Network errors (no status code) are retryable
    if (!statusCode && error.message.includes('request failed')) return true;

    return false;
  }

  private getRetryAfter(error: unknown): number | undefined {
    if (!(error instanceof WAIaaSError)) return undefined;
    const retryAfter = error.details?.retryAfter;
    if (typeof retryAfter === 'string') {
      const parsed = parseInt(retryAfter, 10);
      if (!isNaN(parsed)) return parsed;
    }
    if (typeof retryAfter === 'number') return retryAfter;
    return undefined;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
