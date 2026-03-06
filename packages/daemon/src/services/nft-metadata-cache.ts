/**
 * NftMetadataCacheService -- DB-level metadata caching with IPFS/Arweave gateway conversion.
 *
 * Caches NFT metadata in nft_metadata_cache table with 24h TTL.
 * Converts ipfs:// and ar:// URLs to HTTPS gateway URLs.
 *
 * @since v31.0 Phase 335
 */

import { eq, and, lt } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type { ChainType, NftMetadata } from '@waiaas/core';
import type { NftIndexerClient } from '../infrastructure/nft/nft-indexer-client.js';
import { nftMetadataCache } from '../infrastructure/database/schema.js';
import type * as schema from '../infrastructure/database/schema.js';
import { generateId } from '../infrastructure/database/id.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Default cache TTL: 24 hours in seconds. */
const CACHE_TTL_SECONDS = 86400;

// ---------------------------------------------------------------------------
// NftMetadataCacheService
// ---------------------------------------------------------------------------

export interface NftMetadataCacheServiceDeps {
  db: BetterSQLite3Database<typeof schema>;
  nftIndexerClient: NftIndexerClient;
}

export class NftMetadataCacheService {
  private readonly db: BetterSQLite3Database<typeof schema>;
  private readonly indexerClient: NftIndexerClient;

  constructor(deps: NftMetadataCacheServiceDeps) {
    this.db = deps.db;
    this.indexerClient = deps.nftIndexerClient;
  }

  /**
   * Get NFT metadata with DB caching.
   *
   * 1. Check nft_metadata_cache for valid (non-expired) entry.
   * 2. If cache hit: parse and return (with IPFS conversion).
   * 3. If cache miss or expired: fetch from indexer, convert URLs, upsert cache, return.
   */
  async getMetadata(
    chain: ChainType,
    network: string,
    contractAddress: string,
    tokenId: string,
  ): Promise<NftMetadata> {
    // Step 1: Check cache
    const cached = this.db
      .select()
      .from(nftMetadataCache)
      .where(
        and(
          eq(nftMetadataCache.contractAddress, contractAddress),
          eq(nftMetadataCache.tokenId, tokenId),
          eq(nftMetadataCache.chain, chain),
          eq(nftMetadataCache.network, network),
        ),
      )
      .get();

    const now = new Date();

    if (cached && cached.expiresAt > now) {
      // Cache hit -- return parsed metadata with IPFS conversion
      const metadata = JSON.parse(cached.metadataJson) as NftMetadata;
      return this.convertIpfsUrls(metadata);
    }

    // Step 2: Cache miss or expired -- fetch from indexer
    const metadata = await this.indexerClient.getNftMetadata(chain, network, contractAddress, tokenId);
    const converted = this.convertIpfsUrls(metadata);

    // Step 3: Upsert into cache
    const expiresAt = new Date(now.getTime() + CACHE_TTL_SECONDS * 1000);

    this.db
      .insert(nftMetadataCache)
      .values({
        id: generateId(),
        contractAddress,
        tokenId,
        chain,
        network,
        metadataJson: JSON.stringify(converted),
        cachedAt: now,
        expiresAt,
      })
      .onConflictDoUpdate({
        target: [nftMetadataCache.contractAddress, nftMetadataCache.tokenId, nftMetadataCache.chain, nftMetadataCache.network],
        set: {
          metadataJson: JSON.stringify(converted),
          cachedAt: now,
          expiresAt,
        },
      })
      .run();

    return converted;
  }

  /**
   * Delete all expired cache entries.
   * Returns the number of deleted rows (if available).
   */
  async clearExpired(): Promise<void> {
    const now = new Date();
    this.db
      .delete(nftMetadataCache)
      .where(lt(nftMetadataCache.expiresAt, now))
      .run();
  }

  // -- Private helpers --

  /**
   * Convert IPFS and Arweave URLs to HTTPS gateway URLs.
   *
   * - ipfs://QmXxx  -> https://ipfs.io/ipfs/QmXxx
   * - ipfs://ipfs/QmXxx -> https://ipfs.io/ipfs/QmXxx (double-prefix edge case)
   * - ar://txid     -> https://arweave.net/txid
   * - https://...   -> unchanged
   */
  private convertIpfsUrls(metadata: NftMetadata): NftMetadata {
    return {
      ...metadata,
      image: this.convertUrl(metadata.image),
      tokenUri: this.convertUrl(metadata.tokenUri),
    };
  }

  private convertUrl(url: string | undefined): string | undefined {
    if (!url) return url;

    // Handle ipfs:// prefix
    if (url.startsWith('ipfs://')) {
      const path = url.slice('ipfs://'.length);
      // Handle double-prefix: ipfs://ipfs/QmXxx
      if (path.startsWith('ipfs/')) {
        return `https://ipfs.io/${path}`;
      }
      return `https://ipfs.io/ipfs/${path}`;
    }

    // Handle ar:// prefix
    if (url.startsWith('ar://')) {
      const id = url.slice('ar://'.length);
      return `https://arweave.net/${id}`;
    }

    return url;
  }
}
