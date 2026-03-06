/**
 * INftIndexer interface and related types for NFT data querying.
 *
 * Zod SSoT: Zod schemas define the canonical shape, TypeScript types are derived.
 * This interface abstracts NFT indexer providers (Alchemy, Helius) behind a
 * common contract for listing, metadata, and collection queries.
 *
 * @since v31.0
 */

import { z } from 'zod';
import type { ChainType, NetworkType } from '../enums/chain.js';
import { NftStandardEnum } from '../schemas/transaction.schema.js';

// ---------------------------------------------------------------------------
// Zod schemas (SSoT)
// ---------------------------------------------------------------------------

/** A single NFT item in a list response. */
export const NftItemSchema = z.object({
  /** Token ID (EVM) or mint address (Solana). */
  tokenId: z.string().min(1),
  /** Contract address (EVM) or mint address (Solana). */
  contractAddress: z.string().min(1),
  /** NFT standard: ERC-721, ERC-1155, or METAPLEX. */
  standard: NftStandardEnum,
  /** NFT name (from metadata). */
  name: z.string().optional(),
  /** NFT image URL. */
  image: z.string().optional(),
  /** NFT description. */
  description: z.string().optional(),
  /** Owned amount. 1 for ERC-721/Metaplex, variable for ERC-1155. */
  amount: z.string().default('1'),
  /** Collection info. */
  collection: z.object({
    name: z.string(),
    slug: z.string().optional(),
  }).optional(),
  /** CAIP-19 asset identifier. */
  assetId: z.string().optional(),
});
export type NftItem = z.infer<typeof NftItemSchema>;

/** Extended NFT metadata including attributes/traits. */
export const NftMetadataSchema = NftItemSchema.extend({
  /** NFT attributes/traits array. */
  attributes: z.array(z.object({
    trait_type: z.string(),
    value: z.union([z.string(), z.number()]),
  })).default([]),
  /** Token URI (EVM: tokenURI, Solana: metadata URI). */
  tokenUri: z.string().optional(),
  /** Raw metadata JSON (unprocessed). */
  rawMetadata: z.unknown().optional(),
});
export type NftMetadata = z.infer<typeof NftMetadataSchema>;

/** NFT collection summary. */
export const NftCollectionSchema = z.object({
  name: z.string(),
  slug: z.string().optional(),
  contractAddress: z.string(),
  totalCount: z.number(),
});
export type NftCollection = z.infer<typeof NftCollectionSchema>;

/** Options for listing NFTs. */
export const NftListOptionsSchema = z.object({
  /** Owner address to query NFTs for. */
  owner: z.string().min(1),
  /** Network to query on. */
  network: z.string().min(1),
  /** Page size (max 100). */
  pageSize: z.number().int().min(1).max(100).default(50),
  /** Cursor for pagination. */
  pageKey: z.string().optional(),
  /** Filter by collection address. */
  collection: z.string().optional(),
});
export type NftListOptions = z.infer<typeof NftListOptionsSchema>;

/** Paginated NFT list result. */
export const NftListResultSchema = z.object({
  /** NFT items in this page. */
  items: z.array(NftItemSchema),
  /** Cursor for next page (undefined = last page). */
  pageKey: z.string().optional(),
  /** Total count of NFTs (if available from provider). */
  totalCount: z.number().optional(),
});
export type NftListResult = z.infer<typeof NftListResultSchema>;

// ---------------------------------------------------------------------------
// INftIndexer interface
// ---------------------------------------------------------------------------

/**
 * NFT indexer interface.
 *
 * Abstracts NFT data providers (Alchemy for EVM, Helius for Solana)
 * behind a common contract for listing, metadata, and collection queries.
 */
export interface INftIndexer {
  /** Provider name ('alchemy' | 'helius'). */
  readonly provider: string;
  /** Chain types supported by this indexer. */
  readonly supportedChains: ChainType[];

  /** List NFTs owned by an address. */
  listNfts(options: NftListOptions): Promise<NftListResult>;

  /** Get detailed metadata for a specific NFT. */
  getNftMetadata(network: NetworkType, contractAddress: string, tokenId: string): Promise<NftMetadata>;

  /** List NFTs in a collection. */
  getNftsByCollection(network: NetworkType, collectionAddress: string, pageKey?: string): Promise<NftListResult>;
}
