/**
 * Tests for INftIndexer interface and related types.
 *
 * Verifies the interface shape, Zod schema parsing, and type exports.
 */

import { describe, it, expect } from 'vitest';
import {
  NftItemSchema,
  NftMetadataSchema,
  NftCollectionSchema,
  NftListOptionsSchema,
  NftListResultSchema,
} from '../interfaces/nft-indexer.types.js';
import type {
  INftIndexer,
  NftListOptions,
  NftListResult,
} from '../interfaces/nft-indexer.types.js';

describe('INftIndexer interface and types', () => {
  it('NftItemSchema parses valid input with all fields', () => {
    const input = {
      tokenId: '1234',
      contractAddress: '0xBC4CA0EdA7647A8aB7C2061c2E118A18a936f13D',
      standard: 'ERC-721',
      name: 'Bored Ape #1234',
      image: 'https://ipfs.io/ipfs/Qm...',
      description: 'A bored ape',
      amount: '1',
      collection: { name: 'BAYC', slug: 'bayc' },
      assetId: 'eip155:1/erc721:0xbc4ca0eda7647a8ab7c2061c2e118a18a936f13d-1234',
    };
    const result = NftItemSchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.tokenId).toBe('1234');
      expect(result.data.contractAddress).toBe('0xBC4CA0EdA7647A8aB7C2061c2E118A18a936f13D');
      expect(result.data.standard).toBe('ERC-721');
      expect(result.data.amount).toBe('1');
    }
  });

  it('NftItemSchema has correct required and optional fields', () => {
    // Minimal valid input (required fields only)
    const minimal = {
      tokenId: '1',
      contractAddress: '0xabc',
      standard: 'ERC-1155',
    };
    const result = NftItemSchema.safeParse(minimal);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.amount).toBe('1'); // default
      expect(result.data.name).toBeUndefined();
      expect(result.data.image).toBeUndefined();
      expect(result.data.description).toBeUndefined();
      expect(result.data.collection).toBeUndefined();
      expect(result.data.assetId).toBeUndefined();
    }
  });

  it('NftMetadataSchema extends NftItemSchema with attributes', () => {
    const input = {
      tokenId: '42',
      contractAddress: '0xabc',
      standard: 'ERC-721',
      attributes: [
        { trait_type: 'Background', value: 'Blue' },
        { trait_type: 'Level', value: 5 },
      ],
      tokenUri: 'https://api.example.com/token/42',
    };
    const result = NftMetadataSchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.attributes).toHaveLength(2);
      const attrs = result.data.attributes;
      expect(attrs[0]!.trait_type).toBe('Background');
      expect(result.data.tokenUri).toBe('https://api.example.com/token/42');
    }
  });

  it('NftListResultSchema has items array and optional pageKey', () => {
    const input = {
      items: [
        { tokenId: '1', contractAddress: '0x1', standard: 'ERC-721' },
        { tokenId: '2', contractAddress: '0x2', standard: 'ERC-1155', amount: '5' },
      ],
      pageKey: 'next-cursor-abc',
      totalCount: 100,
    };
    const result = NftListResultSchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.items).toHaveLength(2);
      expect(result.data.pageKey).toBe('next-cursor-abc');
      expect(result.data.totalCount).toBe(100);
    }
  });

  it('NftCollectionSchema parses valid collection', () => {
    const input = {
      name: 'CryptoPunks',
      slug: 'cryptopunks',
      contractAddress: '0xb47e3cd837dDF8e4c57F05d70Ab865de6e193BBB',
      totalCount: 10000,
    };
    const result = NftCollectionSchema.safeParse(input);
    expect(result.success).toBe(true);
  });

  it('NftListOptionsSchema parses with defaults', () => {
    const input = {
      owner: '0xabc',
      network: 'ethereum-mainnet',
    };
    const result = NftListOptionsSchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.pageSize).toBe(50);
      expect(result.data.pageKey).toBeUndefined();
    }
  });

  it('NftListOptionsSchema enforces max pageSize of 100', () => {
    const input = {
      owner: '0xabc',
      network: 'ethereum-mainnet',
      pageSize: 200,
    };
    const result = NftListOptionsSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  it('INftIndexer interface has required methods and properties', () => {
    // Type-level test: verify a mock object satisfies the interface
    const mockIndexer: INftIndexer = {
      provider: 'alchemy',
      supportedChains: ['ethereum'],
      listNfts: async (_options: NftListOptions): Promise<NftListResult> => ({ items: [] }),
      getNftMetadata: async () => ({
        tokenId: '1',
        contractAddress: '0x1',
        standard: 'ERC-721' as const,
        amount: '1',
        attributes: [],
      }),
      getNftsByCollection: async () => ({ items: [] }),
    };
    expect(mockIndexer.provider).toBe('alchemy');
    expect(mockIndexer.supportedChains).toContain('ethereum');
    expect(typeof mockIndexer.listNfts).toBe('function');
    expect(typeof mockIndexer.getNftMetadata).toBe('function');
    expect(typeof mockIndexer.getNftsByCollection).toBe('function');
  });
});
