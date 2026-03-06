/**
 * Unit tests for HeliusNftIndexer.
 *
 * Tests Helius DAS API response normalization, CAIP-19 generation,
 * and error handling.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HeliusNftIndexer } from '../infrastructure/nft/helius-nft-indexer.js';

const MOCK_HELIUS_LIST_RESPONSE = {
  jsonrpc: '2.0',
  id: '1',
  result: {
    items: [
      {
        id: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
        content: {
          metadata: {
            name: 'Cool NFT #1',
            description: 'A very cool NFT',
            attributes: [{ trait_type: 'Color', value: 'Blue' }],
          },
          links: { image: 'https://arweave.net/abc123' },
        },
        compression: { compressed: false },
        grouping: [{ group_key: 'collection', group_value: 'CollectionMint1234' }],
      },
    ],
    total: 1,
    page: 1,
  },
};

const MOCK_HELIUS_METADATA_RESPONSE = {
  jsonrpc: '2.0',
  id: '1',
  result: {
    id: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
    content: {
      metadata: {
        name: 'Cool NFT #1',
        description: 'A very cool NFT',
        attributes: [
          { trait_type: 'Color', value: 'Blue' },
          { trait_type: 'Rarity', value: 'Rare' },
        ],
      },
      links: { image: 'https://arweave.net/abc123' },
      json_uri: 'https://arweave.net/metadata.json',
    },
  },
};

const MOCK_HELIUS_COLLECTION_RESPONSE = {
  jsonrpc: '2.0',
  id: '1',
  result: {
    items: [
      {
        id: 'MintAddr1111111111111111111111111111111111',
        content: {
          metadata: { name: 'Collection Item #1' },
          links: { image: 'https://arweave.net/item1.png' },
        },
        grouping: [{ group_key: 'collection', group_value: 'CollectionAddr' }],
      },
    ],
    total: 50,
    page: 1,
  },
};

describe('HeliusNftIndexer', () => {
  let indexer: HeliusNftIndexer;
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockFetch = vi.fn();
    vi.stubGlobal('fetch', mockFetch);
    indexer = new HeliusNftIndexer({ apiKey: 'test-helius-key' });
  });

  it('has provider "helius" and supportedChains ["solana"]', () => {
    expect(indexer.provider).toBe('helius');
    expect(indexer.supportedChains).toEqual(['solana']);
  });

  describe('listNfts', () => {
    it('calls getAssetsByOwner and returns normalized NftItem array', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => MOCK_HELIUS_LIST_RESPONSE,
      });

      const result = await indexer.listNfts({
        owner: 'OwnerPubkey123',
        network: 'solana-mainnet',
        pageSize: 50,
      });

      expect(mockFetch).toHaveBeenCalledOnce();
      const [url, fetchOpts] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(url).toContain('mainnet.helius-rpc.com');
      expect(url).toContain('api-key=test-helius-key');
      const body = JSON.parse(fetchOpts.body as string);
      expect(body.method).toBe('getAssetsByOwner');

      expect(result.items).toHaveLength(1);
      expect(result.items[0].tokenId).toBe('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
      expect(result.items[0].contractAddress).toBe('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
      expect(result.items[0].standard).toBe('METAPLEX');
      expect(result.items[0].name).toBe('Cool NFT #1');
    });

    it('generates CAIP-19 assetId for Metaplex NFTs', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => MOCK_HELIUS_LIST_RESPONSE,
      });

      const result = await indexer.listNfts({
        owner: 'OwnerPubkey123',
        network: 'solana-mainnet',
        pageSize: 50,
      });

      // METAPLEX CAIP-19: solana:<genesis>/metaplex:<mintAddress>
      expect(result.items[0].assetId).toContain('solana:');
      expect(result.items[0].assetId).toContain('/metaplex:');
      expect(result.items[0].assetId).toContain('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
    });
  });

  describe('getNftMetadata', () => {
    it('calls getAsset and returns NftMetadata with attributes', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => MOCK_HELIUS_METADATA_RESPONSE,
      });

      const result = await indexer.getNftMetadata(
        'solana-mainnet',
        'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
        'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
      );

      expect(result.tokenId).toBe('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
      expect(result.standard).toBe('METAPLEX');
      expect(result.attributes).toHaveLength(2);
      expect(result.attributes[0]).toEqual({ trait_type: 'Color', value: 'Blue' });
      expect(result.tokenUri).toBe('https://arweave.net/metadata.json');
    });
  });

  describe('getNftsByCollection', () => {
    it('calls getAssetsByGroup and returns NftListResult', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => MOCK_HELIUS_COLLECTION_RESPONSE,
      });

      const result = await indexer.getNftsByCollection('solana-mainnet', 'CollectionAddr');

      expect(result.items).toHaveLength(1);
      expect(result.totalCount).toBe(50);
    });
  });

  describe('error handling', () => {
    it('throws INDEXER_API_ERROR on non-200 HTTP response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: async () => 'Internal Server Error',
      });

      try {
        await indexer.listNfts({ owner: 'abc', network: 'solana-mainnet', pageSize: 50 });
        expect.fail('should have thrown');
      } catch (error: unknown) {
        expect((error as { code: string }).code).toBe('INDEXER_API_ERROR');
      }
    });

    it('throws INDEXER_API_ERROR on JSON-RPC error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          jsonrpc: '2.0',
          id: '1',
          error: { code: -32600, message: 'Invalid request' },
        }),
      });

      try {
        await indexer.listNfts({ owner: 'abc', network: 'solana-mainnet', pageSize: 50 });
        expect.fail('should have thrown');
      } catch (error: unknown) {
        expect((error as { code: string }).code).toBe('INDEXER_API_ERROR');
      }
    });
  });
});
