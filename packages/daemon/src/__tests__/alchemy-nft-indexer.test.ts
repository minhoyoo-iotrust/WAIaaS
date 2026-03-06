/**
 * Unit tests for AlchemyNftIndexer.
 *
 * Tests Alchemy NFT API v3 response normalization, CAIP-19 generation,
 * error handling, and standard detection.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AlchemyNftIndexer } from '../infrastructure/nft/alchemy-nft-indexer.js';
import type { NftListOptions } from '@waiaas/core';

// Mock Alchemy API responses
const MOCK_ALCHEMY_LIST_RESPONSE = {
  ownedNfts: [
    {
      contract: { address: '0xBC4CA0EdA7647A8aB7C2061c2E118A18a936f13D' },
      tokenId: '1234',
      tokenType: 'ERC721',
      balance: '1',
      name: 'Bored Ape #1234',
      image: { cachedUrl: 'https://res.cloudinary.com/bayc/1234.png' },
      description: 'A bored ape',
      raw: {
        metadata: {
          name: 'Bored Ape #1234',
          image: 'ipfs://Qm.../1234.png',
          description: 'A bored ape',
        },
      },
      collection: { name: 'BAYC', slug: 'bayc' },
    },
    {
      contract: { address: '0x495f947276749Ce646f68AC8c248420045cb7b5e' },
      tokenId: '99',
      tokenType: 'ERC1155',
      balance: '5',
      name: 'OpenSea Shared #99',
      image: { cachedUrl: 'https://img.example.com/99.png' },
      description: null,
      raw: { metadata: { name: 'OpenSea Shared #99' } },
      collection: null,
    },
  ],
  pageKey: 'next-page-abc',
  totalCount: 42,
};

const MOCK_ALCHEMY_METADATA_RESPONSE = {
  contract: { address: '0xBC4CA0EdA7647A8aB7C2061c2E118A18a936f13D' },
  tokenId: '1234',
  tokenType: 'ERC721',
  name: 'Bored Ape #1234',
  image: { cachedUrl: 'https://res.cloudinary.com/bayc/1234.png' },
  description: 'A bored ape',
  raw: {
    metadata: {
      name: 'Bored Ape #1234',
      image: 'ipfs://Qm.../1234.png',
      description: 'A bored ape',
      attributes: [
        { trait_type: 'Background', value: 'Aquamarine' },
        { trait_type: 'Fur', value: 'Brown' },
      ],
    },
    tokenUri: 'ipfs://QmeSjSinHpPnmXmspMjwiXyN6zS4E9zccariGR3jxcaWtq/1234',
  },
  collection: { name: 'BAYC', slug: 'bayc' },
};

const MOCK_ALCHEMY_COLLECTION_RESPONSE = {
  nfts: [
    {
      contract: { address: '0xBC4CA0EdA7647A8aB7C2061c2E118A18a936f13D' },
      tokenId: '0',
      tokenType: 'ERC721',
      name: 'Bored Ape #0',
      image: { cachedUrl: 'https://res.cloudinary.com/bayc/0.png' },
      description: null,
      raw: { metadata: { name: 'Bored Ape #0' } },
      collection: { name: 'BAYC', slug: 'bayc' },
    },
  ],
  nextToken: 'next-token-xyz',
};

describe('AlchemyNftIndexer', () => {
  let indexer: AlchemyNftIndexer;
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockFetch = vi.fn();
    vi.stubGlobal('fetch', mockFetch);
    indexer = new AlchemyNftIndexer({ apiKey: 'test-api-key' });
  });

  it('has provider "alchemy" and supportedChains ["ethereum"]', () => {
    expect(indexer.provider).toBe('alchemy');
    expect(indexer.supportedChains).toEqual(['ethereum']);
  });

  describe('listNfts', () => {
    it('calls getNFTsForOwner and returns normalized NftItem array with pageKey', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => MOCK_ALCHEMY_LIST_RESPONSE,
      });

      const options: NftListOptions = {
        owner: '0xOwner',
        network: 'ethereum-mainnet',
        pageSize: 50,
      };
      const result = await indexer.listNfts(options);

      // Verify fetch was called with correct URL
      expect(mockFetch).toHaveBeenCalledOnce();
      const url = mockFetch.mock.calls[0][0] as string;
      expect(url).toContain('eth-mainnet.g.alchemy.com');
      expect(url).toContain('test-api-key');
      expect(url).toContain('getNFTsForOwner');
      expect(url).toContain('owner=0xOwner');
      expect(url).toContain('withMetadata=true');

      // Verify normalized response
      expect(result.items).toHaveLength(2);
      expect(result.pageKey).toBe('next-page-abc');
      expect(result.totalCount).toBe(42);

      // First item: ERC-721
      expect(result.items[0].tokenId).toBe('1234');
      expect(result.items[0].contractAddress).toBe('0xBC4CA0EdA7647A8aB7C2061c2E118A18a936f13D');
      expect(result.items[0].standard).toBe('ERC-721');
      expect(result.items[0].amount).toBe('1');
      expect(result.items[0].name).toBe('Bored Ape #1234');

      // Second item: ERC-1155 with amount
      expect(result.items[1].standard).toBe('ERC-1155');
      expect(result.items[1].amount).toBe('5');
    });

    it('generates CAIP-19 assetId for each NFT', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => MOCK_ALCHEMY_LIST_RESPONSE,
      });

      const result = await indexer.listNfts({
        owner: '0xOwner',
        network: 'ethereum-mainnet',
        pageSize: 50,
      });

      // ERC-721: eip155:1/erc721:lowercased-tokenId
      expect(result.items[0].assetId).toContain('eip155:1/erc721:');
      expect(result.items[0].assetId).toContain('-1234');

      // ERC-1155: eip155:1/erc1155:lowercased-tokenId
      expect(result.items[1].assetId).toContain('eip155:1/erc1155:');
      expect(result.items[1].assetId).toContain('-99');
    });
  });

  describe('getNftMetadata', () => {
    it('calls getNFTMetadata and returns NftMetadata with attributes', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => MOCK_ALCHEMY_METADATA_RESPONSE,
      });

      const result = await indexer.getNftMetadata(
        'ethereum-mainnet',
        '0xBC4CA0EdA7647A8aB7C2061c2E118A18a936f13D',
        '1234',
      );

      expect(result.tokenId).toBe('1234');
      expect(result.standard).toBe('ERC-721');
      expect(result.attributes).toHaveLength(2);
      expect(result.attributes[0]).toEqual({ trait_type: 'Background', value: 'Aquamarine' });
      expect(result.tokenUri).toBe('ipfs://QmeSjSinHpPnmXmspMjwiXyN6zS4E9zccariGR3jxcaWtq/1234');
    });
  });

  describe('getNftsByCollection', () => {
    it('calls getNFTsForCollection and returns NftListResult', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => MOCK_ALCHEMY_COLLECTION_RESPONSE,
      });

      const result = await indexer.getNftsByCollection(
        'ethereum-mainnet',
        '0xBC4CA0EdA7647A8aB7C2061c2E118A18a936f13D',
      );

      expect(result.items).toHaveLength(1);
      expect(result.items[0].tokenId).toBe('0');
      expect(result.pageKey).toBe('next-token-xyz');
    });
  });

  describe('error handling', () => {
    it('throws INDEXER_API_ERROR on non-200 response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 403,
        statusText: 'Forbidden',
        text: async () => 'Invalid API key',
      });

      try {
        await indexer.listNfts({ owner: '0x1', network: 'ethereum-mainnet', pageSize: 50 });
        expect.fail('should have thrown');
      } catch (error: unknown) {
        expect((error as { code: string }).code).toBe('INDEXER_API_ERROR');
      }
    });

    it('throws INDEXER_API_ERROR on network error', async () => {
      mockFetch.mockRejectedValueOnce(new Error('fetch failed'));

      try {
        await indexer.listNfts({ owner: '0x1', network: 'ethereum-mainnet', pageSize: 50 });
        expect.fail('should have thrown');
      } catch (error: unknown) {
        expect((error as { code: string }).code).toBe('INDEXER_API_ERROR');
      }
    });
  });

  describe('standard mapping', () => {
    it('maps ERC721 and ERC1155 token types correctly', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => MOCK_ALCHEMY_LIST_RESPONSE,
      });

      const result = await indexer.listNfts({
        owner: '0x1',
        network: 'ethereum-mainnet',
        pageSize: 50,
      });

      expect(result.items[0].standard).toBe('ERC-721');
      expect(result.items[1].standard).toBe('ERC-1155');
    });
  });
});
