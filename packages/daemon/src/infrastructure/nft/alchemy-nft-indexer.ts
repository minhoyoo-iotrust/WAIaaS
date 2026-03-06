/**
 * AlchemyNftIndexer -- INftIndexer implementation for EVM chains using Alchemy NFT API v3.
 *
 * Normalizes Alchemy API responses to the INftIndexer interface types,
 * generates CAIP-19 asset IDs for each NFT, and handles error mapping.
 *
 * @see https://docs.alchemy.com/reference/nft-api-quickstart
 * @since v31.0
 */

import type { ChainType, NetworkType, NftListOptions, NftListResult, NftMetadata, NftItem } from '@waiaas/core';
import type { INftIndexer } from '@waiaas/core';
import { WAIaaSError, nftAssetId } from '@waiaas/core';
import type { NftStandard } from '@waiaas/core';

// ---------------------------------------------------------------------------
// Network to Alchemy base URL mapping
// ---------------------------------------------------------------------------

const NETWORK_TO_ALCHEMY_PREFIX: Record<string, string> = {
  'ethereum-mainnet': 'eth-mainnet',
  'ethereum-sepolia': 'eth-sepolia',
  'polygon-mainnet': 'polygon-mainnet',
  'polygon-amoy': 'polygon-amoy',
  'arbitrum-mainnet': 'arb-mainnet',
  'arbitrum-sepolia': 'arb-sepolia',
  'optimism-mainnet': 'opt-mainnet',
  'optimism-sepolia': 'opt-sepolia',
  'base-mainnet': 'base-mainnet',
  'base-sepolia': 'base-sepolia',
};

// ---------------------------------------------------------------------------
// Alchemy tokenType -> NftStandard mapping
// ---------------------------------------------------------------------------

function mapTokenType(tokenType: string): NftStandard {
  if (tokenType === 'ERC721') return 'ERC-721';
  if (tokenType === 'ERC1155') return 'ERC-1155';
  throw new WAIaaSError('UNSUPPORTED_NFT_STANDARD', {
    message: `Unknown Alchemy tokenType: ${tokenType}`,
  });
}

function standardToNamespace(standard: NftStandard): 'erc721' | 'erc1155' {
  if (standard === 'ERC-721') return 'erc721';
  if (standard === 'ERC-1155') return 'erc1155';
  throw new WAIaaSError('UNSUPPORTED_NFT_STANDARD', {
    message: `Cannot generate CAIP-19 namespace for standard: ${standard}`,
  });
}

// ---------------------------------------------------------------------------
// AlchemyNftIndexer
// ---------------------------------------------------------------------------

export interface AlchemyNftIndexerConfig {
  apiKey: string;
  baseUrl?: string;
}

export class AlchemyNftIndexer implements INftIndexer {
  readonly provider = 'alchemy';
  readonly supportedChains: ChainType[] = ['ethereum'];

  private readonly apiKey: string;

  constructor(config: AlchemyNftIndexerConfig) {
    this.apiKey = config.apiKey;
  }

  // -- INftIndexer methods --

  async listNfts(options: NftListOptions): Promise<NftListResult> {
    const baseUrl = this.getBaseUrl(options.network as NetworkType);
    const params = new URLSearchParams({
      owner: options.owner,
      pageSize: String(options.pageSize ?? 50),
      withMetadata: 'true',
    });
    if (options.pageKey) params.set('pageKey', options.pageKey);
    if (options.collection) params.set('contractAddresses[]', options.collection);

    const url = `${baseUrl}/getNFTsForOwner?${params.toString()}`;
    const data = await this._fetch(url) as unknown as AlchemyListResponse;

    const items: NftItem[] = (data.ownedNfts ?? []).map((nft: AlchemyOwnedNft) =>
      this.normalizeNft(nft, options.network as NetworkType),
    );

    return {
      items,
      pageKey: data.pageKey ?? undefined,
      totalCount: data.totalCount,
    };
  }

  async getNftMetadata(
    network: NetworkType,
    contractAddress: string,
    tokenId: string,
  ): Promise<NftMetadata> {
    const baseUrl = this.getBaseUrl(network);
    const params = new URLSearchParams({
      contractAddress,
      tokenId,
    });
    const url = `${baseUrl}/getNFTMetadata?${params.toString()}`;
    const data = await this._fetch(url) as unknown as AlchemyMetadataResponse;

    const standard = mapTokenType(data.tokenType);
    const ns = standardToNamespace(standard);
    const assetIdStr = nftAssetId(network, contractAddress, tokenId, ns);

    const rawMetadata = data.raw?.metadata ?? {};
    const attributes = Array.isArray(rawMetadata.attributes)
      ? (rawMetadata.attributes as Array<{ trait_type: string; value: string | number }>).map((a) => ({
          trait_type: a.trait_type,
          value: a.value,
        }))
      : [];

    return {
      tokenId: data.tokenId ?? tokenId,
      contractAddress: data.contract?.address ?? contractAddress,
      standard,
      name: data.name ?? (typeof rawMetadata.name === 'string' ? rawMetadata.name : undefined),
      image: data.image?.cachedUrl ?? (typeof rawMetadata.image === 'string' ? rawMetadata.image : undefined),
      description: data.description ?? (typeof rawMetadata.description === 'string' ? rawMetadata.description : undefined),
      amount: data.balance ?? '1',
      collection: data.collection ? { name: data.collection.name, slug: data.collection.slug } : undefined,
      assetId: assetIdStr,
      attributes,
      tokenUri: data.raw?.tokenUri ?? undefined,
      rawMetadata,
    };
  }

  async getNftsByCollection(
    network: NetworkType,
    collectionAddress: string,
    pageKey?: string,
  ): Promise<NftListResult> {
    const baseUrl = this.getBaseUrl(network);
    const params = new URLSearchParams({
      contractAddress: collectionAddress,
      withMetadata: 'true',
    });
    if (pageKey) params.set('startToken', pageKey);

    const url = `${baseUrl}/getNFTsForCollection?${params.toString()}`;
    const data = await this._fetch(url) as unknown as AlchemyCollectionResponse;

    const items: NftItem[] = (data.nfts ?? []).map((nft: AlchemyOwnedNft) =>
      this.normalizeNft(nft, network),
    );

    return {
      items,
      pageKey: data.nextToken ?? undefined,
    };
  }

  // -- Private helpers --

  private getBaseUrl(network: NetworkType): string {
    const prefix = NETWORK_TO_ALCHEMY_PREFIX[network];
    if (!prefix) {
      throw new WAIaaSError('INDEXER_API_ERROR', {
        message: `Unsupported network for Alchemy NFT API: ${network}`,
      });
    }
    return `https://${prefix}.g.alchemy.com/nft/v3/${this.apiKey}`;
  }

  private normalizeNft(nft: AlchemyOwnedNft, network: NetworkType): NftItem {
    const standard = mapTokenType(nft.tokenType);
    const ns = standardToNamespace(standard);
    const assetIdStr = nftAssetId(network, nft.contract.address, nft.tokenId, ns);

    const rawMetadata = nft.raw?.metadata ?? {};

    return {
      tokenId: nft.tokenId,
      contractAddress: nft.contract.address,
      standard,
      name: nft.name ?? (typeof rawMetadata.name === 'string' ? rawMetadata.name : undefined),
      image: nft.image?.cachedUrl ?? (typeof rawMetadata.image === 'string' ? rawMetadata.image : undefined),
      description: nft.description ?? (typeof rawMetadata.description === 'string' ? rawMetadata.description : undefined),
      amount: standard === 'ERC-1155' ? (nft.balance ?? '1') : '1',
      collection: nft.collection ? { name: nft.collection.name, slug: nft.collection.slug } : undefined,
      assetId: assetIdStr,
    };
  }

  private async _fetch(url: string): Promise<Record<string, unknown>> {
    let response: Response;
    try {
      response = await fetch(url);
    } catch (error) {
      throw new WAIaaSError('INDEXER_API_ERROR', {
        message: `Alchemy API request failed: ${error instanceof Error ? error.message : String(error)}`,
      });
    }

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new WAIaaSError('INDEXER_API_ERROR', {
        message: `Alchemy API returned ${response.status}: ${body}`,
        details: { statusCode: response.status, retryAfter: response.headers?.get('Retry-After') },
      });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return response.json() as any;
  }
}

// ---------------------------------------------------------------------------
// Internal Alchemy response types (not exported)
// ---------------------------------------------------------------------------

interface AlchemyOwnedNft {
  contract: { address: string };
  tokenId: string;
  tokenType: string;
  balance?: string;
  name?: string;
  image?: { cachedUrl?: string };
  description?: string | null;
  raw?: {
    metadata?: Record<string, unknown>;
    tokenUri?: string;
  };
  collection?: { name: string; slug?: string } | null;
}

/** Alchemy getNFTsForOwner response shape. */
interface AlchemyListResponse {
  ownedNfts?: AlchemyOwnedNft[];
  pageKey?: string;
  totalCount?: number;
}

/** Alchemy getNFTMetadata response shape (same as AlchemyOwnedNft). */
type AlchemyMetadataResponse = AlchemyOwnedNft;

/** Alchemy getNFTsForCollection response shape. */
interface AlchemyCollectionResponse {
  nfts?: AlchemyOwnedNft[];
  nextToken?: string;
}
