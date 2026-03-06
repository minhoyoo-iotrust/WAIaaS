/**
 * HeliusNftIndexer -- INftIndexer implementation for Solana using Helius DAS API.
 *
 * Uses JSON-RPC format: getAssetsByOwner, getAsset, getAssetsByGroup.
 * Normalizes Helius DAS responses to the INftIndexer interface types.
 *
 * @see https://docs.helius.dev/solana-compression/digital-asset-standard-das-api
 * @since v31.0
 */

import type { ChainType, NetworkType, NftListOptions, NftListResult, NftMetadata, NftItem } from '@waiaas/core';
import type { INftIndexer } from '@waiaas/core';
import { WAIaaSError, nftAssetId } from '@waiaas/core';

// ---------------------------------------------------------------------------
// HeliusNftIndexer
// ---------------------------------------------------------------------------

export interface HeliusNftIndexerConfig {
  apiKey: string;
  baseUrl?: string;
}

export class HeliusNftIndexer implements INftIndexer {
  readonly provider = 'helius';
  readonly supportedChains: ChainType[] = ['solana'];

  private readonly apiKey: string;
  private readonly baseUrl: string;

  constructor(config: HeliusNftIndexerConfig) {
    this.apiKey = config.apiKey;
    this.baseUrl = config.baseUrl ?? 'https://mainnet.helius-rpc.com';
  }

  // -- INftIndexer methods --

  async listNfts(options: NftListOptions): Promise<NftListResult> {
    const network = options.network as NetworkType;
    const page = options.pageKey ? parseInt(options.pageKey, 10) : 1;

    const raw = await this._rpc('getAssetsByOwner', {
      ownerAddress: options.owner,
      limit: options.pageSize ?? 50,
      page,
      sortBy: { sortBy: 'created', sortDirection: 'desc' },
    });
    const result = raw as { items?: HeliusDasAsset[]; total?: unknown };

    const items: NftItem[] = (result.items ?? []).map((asset: HeliusDasAsset) =>
      this.normalizeAsset(asset, network),
    );

    const nextPage = (result.items?.length ?? 0) >= (options.pageSize ?? 50) ? String(page + 1) : undefined;

    return {
      items,
      pageKey: nextPage,
      totalCount: typeof result.total === 'number' ? result.total : undefined,
    };
  }

  async getNftMetadata(
    network: NetworkType,
    contractAddress: string,
    _tokenId: string,
  ): Promise<NftMetadata> {
    // For Metaplex, contractAddress IS the mint address
    const result = await this._rpc('getAsset', { id: contractAddress }) as unknown as HeliusDasAsset;

    const metadata = result.content?.metadata ?? {};
    const attributes = Array.isArray(metadata.attributes)
      ? (metadata.attributes as Array<{ trait_type: string; value: string | number }>).map((a) => ({
          trait_type: a.trait_type,
          value: a.value,
        }))
      : [];

    const mintAddress = result.id ?? contractAddress;
    const assetIdStr = nftAssetId(network, mintAddress, mintAddress, 'metaplex');

    return {
      tokenId: mintAddress,
      contractAddress: mintAddress,
      standard: 'METAPLEX',
      name: typeof metadata.name === 'string' ? metadata.name : undefined,
      image: typeof result.content?.links?.image === 'string' ? result.content.links.image : undefined,
      description: typeof metadata.description === 'string' ? metadata.description : undefined,
      amount: '1',
      assetId: assetIdStr,
      attributes,
      tokenUri: typeof result.content?.json_uri === 'string' ? result.content.json_uri : undefined,
      rawMetadata: metadata,
    };
  }

  async getNftsByCollection(
    network: NetworkType,
    collectionAddress: string,
    pageKey?: string,
  ): Promise<NftListResult> {
    const page = pageKey ? parseInt(pageKey, 10) : 1;

    const raw = await this._rpc('getAssetsByGroup', {
      groupKey: 'collection',
      groupValue: collectionAddress,
      limit: 50,
      page,
    });
    const result = raw as { items?: HeliusDasAsset[]; total?: unknown };

    const items: NftItem[] = (result.items ?? []).map((asset: HeliusDasAsset) =>
      this.normalizeAsset(asset, network),
    );

    const nextPage = (result.items?.length ?? 0) >= 50 ? String(page + 1) : undefined;

    return {
      items,
      pageKey: nextPage,
      totalCount: typeof result.total === 'number' ? result.total : undefined,
    };
  }

  // -- Private helpers --

  private normalizeAsset(asset: HeliusDasAsset, network: NetworkType): NftItem {
    const mintAddress = asset.id;
    const metadata = asset.content?.metadata ?? {};
    const assetIdStr = nftAssetId(network, mintAddress, mintAddress, 'metaplex');

    // Extract collection from grouping
    const collectionGrouping = asset.grouping?.find(
      (g: { group_key: string; group_value: string }) => g.group_key === 'collection',
    );

    return {
      tokenId: mintAddress,
      contractAddress: mintAddress,
      standard: 'METAPLEX',
      name: typeof metadata.name === 'string' ? metadata.name : undefined,
      image: typeof asset.content?.links?.image === 'string' ? asset.content.links.image : undefined,
      description: typeof metadata.description === 'string' ? metadata.description : undefined,
      amount: '1',
      collection: collectionGrouping
        ? { name: collectionGrouping.group_value }
        : undefined,
      assetId: assetIdStr,
    };
  }

  private async _rpc(method: string, params: Record<string, unknown>): Promise<Record<string, unknown>> {
    const url = `${this.baseUrl}/?api-key=${this.apiKey}`;

    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: '1',
          method,
          params,
        }),
      });
    } catch (error) {
      throw new WAIaaSError('INDEXER_API_ERROR', {
        message: `Helius DAS API request failed: ${error instanceof Error ? error.message : String(error)}`,
      });
    }

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new WAIaaSError('INDEXER_API_ERROR', {
        message: `Helius DAS API returned ${response.status}: ${body}`,
        details: { statusCode: response.status, retryAfter: response.headers?.get?.('Retry-After') },
      });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const json = await response.json() as any;

    // Check for JSON-RPC error
    if (json.error) {
      throw new WAIaaSError('INDEXER_API_ERROR', {
        message: `Helius DAS API error: ${json.error.message ?? JSON.stringify(json.error)}`,
        details: { rpcErrorCode: json.error.code },
      });
    }

    return json.result ?? {};
  }
}

// ---------------------------------------------------------------------------
// Internal Helius DAS response types (not exported)
// ---------------------------------------------------------------------------

interface HeliusDasAsset {
  id: string;
  content?: {
    metadata?: Record<string, unknown>;
    links?: { image?: string };
    json_uri?: string;
  };
  grouping?: Array<{ group_key: string; group_value: string }>;
  compression?: { compressed: boolean };
}
