/**
 * Tests for nftAssetId() CAIP-19 helper and isNftAsset() function.
 *
 * Plan 333-02 Task 1: NFT CAIP-19 namespace helpers (erc721/erc1155/metaplex)
 */

import { describe, it, expect } from 'vitest';
import {
  nftAssetId,
  isNftAsset,
  parseCaip19,
  Caip19Schema,
  isNativeAsset,
} from '../index.js';

describe('nftAssetId() CAIP-19 NFT Helper', () => {
  // Test 1: ERC-721 on Ethereum mainnet
  it('T1: generates correct CAIP-19 for ERC-721 on ethereum-mainnet', () => {
    const result = nftAssetId(
      'ethereum-mainnet',
      '0xBC4CA0EdA7647A8aB7C2061c2E118A18a936f13D',
      '1234',
      'erc721',
    );
    expect(result).toBe(
      'eip155:1/erc721:0xbc4ca0eda7647a8ab7c2061c2e118a18a936f13d-1234',
    );
  });

  // Test 2: ERC-1155 on Ethereum mainnet
  it('T2: generates correct CAIP-19 for ERC-1155', () => {
    const result = nftAssetId(
      'ethereum-mainnet',
      '0x495f947276749Ce646f68AC8c248420045cb7b5e',
      '5',
      'erc1155',
    );
    expect(result).toBe(
      'eip155:1/erc1155:0x495f947276749ce646f68ac8c248420045cb7b5e-5',
    );
  });

  // Test 3: Metaplex on Solana mainnet
  it('T3: generates correct CAIP-19 for Metaplex on solana-mainnet', () => {
    const result = nftAssetId(
      'solana-mainnet',
      'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263',
      '0',
      'metaplex',
    );
    // Metaplex NFTs use the mint address directly (not tokenId)
    expect(result).toBe(
      'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp/metaplex:DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263',
    );
  });

  // Test 4: EVM addresses are lowercased
  it('T4: EVM addresses are lowercased in CAIP-19 output', () => {
    const result = nftAssetId(
      'ethereum-mainnet',
      '0xBC4CA0EdA7647A8aB7C2061c2E118A18a936f13D',
      '42',
      'erc721',
    );
    // The address portion should be lowercased
    expect(result).toContain('0xbc4ca0eda7647a8ab7c2061c2e118a18a936f13d');
    expect(result).not.toContain('0xBC4CA0');
  });

  // Test 5: Solana addresses preserve original case
  it('T5: Solana addresses preserve original case (base58)', () => {
    const mintAddress = 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263';
    const result = nftAssetId('solana-mainnet', mintAddress, '0', 'metaplex');
    expect(result).toContain(mintAddress);
  });

  // Test 6: isNftAsset() identifies NFT namespaces
  it('T6: isNftAsset() returns true for erc721/erc1155/metaplex, false for erc20/slip44/token', () => {
    // NFT namespaces
    expect(isNftAsset('eip155:1/erc721:0xbc4ca0eda7647a8ab7c2061c2e118a18a936f13d-1')).toBe(true);
    expect(isNftAsset('eip155:1/erc1155:0x495f947276749ce646f68ac8c248420045cb7b5e-5')).toBe(true);
    expect(
      isNftAsset('solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp/metaplex:DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263'),
    ).toBe(true);

    // Non-NFT namespaces
    expect(isNftAsset('eip155:1/erc20:0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48')).toBe(false);
    expect(isNftAsset('eip155:1/slip44:60')).toBe(false);
    expect(
      isNftAsset('solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp/token:EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'),
    ).toBe(false);
  });

  // Test 7: parseCaip19 extracts namespace and reference from NFT URIs
  it('T7: parseCaip19 correctly extracts namespace and reference from NFT CAIP-19 URIs', () => {
    const erc721 = parseCaip19(
      'eip155:1/erc721:0xbc4ca0eda7647a8ab7c2061c2e118a18a936f13d-1234',
    );
    expect(erc721.chainId).toBe('eip155:1');
    expect(erc721.assetNamespace).toBe('erc721');
    expect(erc721.assetReference).toBe('0xbc4ca0eda7647a8ab7c2061c2e118a18a936f13d-1234');

    const metaplex = parseCaip19(
      'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp/metaplex:DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263',
    );
    expect(metaplex.assetNamespace).toBe('metaplex');
    expect(metaplex.assetReference).toBe('DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263');
  });

  // Test 8: CAIP-19 schema validates NFT asset IDs (for ALLOWED_TOKENS policy)
  it('T8: CAIP-19 schema validates NFT format (ALLOWED_TOKENS policy compatibility)', () => {
    // All NFT CAIP-19 formats should pass schema validation
    expect(() =>
      Caip19Schema.parse('eip155:1/erc721:0xbc4ca0eda7647a8ab7c2061c2e118a18a936f13d-1234'),
    ).not.toThrow();
    expect(() =>
      Caip19Schema.parse('eip155:1/erc1155:0x495f947276749ce646f68ac8c248420045cb7b5e-5'),
    ).not.toThrow();
    expect(() =>
      Caip19Schema.parse(
        'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp/metaplex:DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263',
      ),
    ).not.toThrow();
  });

  // Test: isNftAsset and isNativeAsset are disjoint
  it('isNftAsset and isNativeAsset are disjoint sets', () => {
    const native = 'eip155:1/slip44:60';
    const nft = 'eip155:1/erc721:0xbc4ca0eda7647a8ab7c2061c2e118a18a936f13d-1';
    expect(isNativeAsset(native)).toBe(true);
    expect(isNftAsset(native)).toBe(false);
    expect(isNativeAsset(nft)).toBe(false);
    expect(isNftAsset(nft)).toBe(true);
  });
});
