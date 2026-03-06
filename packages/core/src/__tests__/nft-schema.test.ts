/**
 * Tests for NFT_TRANSFER schema (6th discriminatedUnion type), APPROVE nft extension, and NFT error codes.
 *
 * Plan 333-01: NFT_TRANSFER Zod schema + APPROVE nft extension + NFT response schema + error codes
 */

import { describe, it, expect } from 'vitest';
import {
  TransactionRequestSchema,
  ApproveRequestSchema,
  TRANSACTION_TYPES,
  ERROR_CODES,
  NftTransferRequestSchema,
  NftStandardEnum,
} from '../index.js';

describe('NFT_TRANSFER Schema (6th discriminatedUnion type)', () => {
  // Test 1: NFT_TRANSFER parses with required fields
  it('T1: TransactionRequestSchema.parse succeeds with valid NFT_TRANSFER', () => {
    const result = TransactionRequestSchema.parse({
      type: 'NFT_TRANSFER',
      to: '0x1234567890abcdef1234567890abcdef12345678',
      token: {
        address: '0xBC4CA0EdA7647A8aB7C2061c2E118A18a936f13D',
        tokenId: '1',
        standard: 'ERC-721',
      },
      network: 'ethereum-mainnet',
    });
    expect(result.type).toBe('NFT_TRANSFER');
  });

  // Test 2: NFT_TRANSFER requires token.address, token.tokenId, token.standard
  it('T2: NFT_TRANSFER rejects missing required token fields', () => {
    // Missing tokenId
    expect(() =>
      TransactionRequestSchema.parse({
        type: 'NFT_TRANSFER',
        to: '0x1234',
        token: { address: '0xBC4C', standard: 'ERC-721' },
        network: 'ethereum-mainnet',
      }),
    ).toThrow();

    // Missing standard
    expect(() =>
      TransactionRequestSchema.parse({
        type: 'NFT_TRANSFER',
        to: '0x1234',
        token: { address: '0xBC4C', tokenId: '1' },
        network: 'ethereum-mainnet',
      }),
    ).toThrow();

    // Missing address
    expect(() =>
      TransactionRequestSchema.parse({
        type: 'NFT_TRANSFER',
        to: '0x1234',
        token: { tokenId: '1', standard: 'ERC-721' },
        network: 'ethereum-mainnet',
      }),
    ).toThrow();
  });

  // Test 3: token.standard accepts ERC-721, ERC-1155, METAPLEX; rejects ERC-20
  it('T3: token.standard accepts valid NFT standards and rejects ERC-20', () => {
    const base = {
      type: 'NFT_TRANSFER' as const,
      to: '0x1234',
      network: 'ethereum-mainnet' as const,
    };

    // Valid standards
    for (const standard of ['ERC-721', 'ERC-1155', 'METAPLEX'] as const) {
      const result = NftTransferRequestSchema.parse({
        ...base,
        token: { address: '0xBC4C', tokenId: '1', standard },
      });
      expect(result.token.standard).toBe(standard);
    }

    // Invalid: ERC-20
    expect(() =>
      NftTransferRequestSchema.parse({
        ...base,
        token: { address: '0xBC4C', tokenId: '1', standard: 'ERC-20' },
      }),
    ).toThrow();
  });

  // Test 4: amount is optional (defaults to '1'), required-numeric for ERC-1155
  it('T4: NFT_TRANSFER amount defaults to 1 and accepts custom numeric amounts', () => {
    // Default amount = '1' when omitted
    const result1 = NftTransferRequestSchema.parse({
      type: 'NFT_TRANSFER',
      to: '0x1234',
      token: { address: '0xBC4C', tokenId: '1', standard: 'ERC-721' },
      network: 'ethereum-mainnet',
    });
    expect(result1.amount).toBe('1');

    // Custom amount for ERC-1155
    const result2 = NftTransferRequestSchema.parse({
      type: 'NFT_TRANSFER',
      to: '0x1234',
      token: { address: '0xBC4C', tokenId: '5', standard: 'ERC-1155' },
      amount: '10',
      network: 'ethereum-mainnet',
    });
    expect(result2.amount).toBe('10');

    // Non-numeric amount should fail
    expect(() =>
      NftTransferRequestSchema.parse({
        type: 'NFT_TRANSFER',
        to: '0x1234',
        token: { address: '0xBC4C', tokenId: '5', standard: 'ERC-1155' },
        amount: 'abc',
        network: 'ethereum-mainnet',
      }),
    ).toThrow();
  });

  // Test 5: APPROVE with nft field parses successfully
  it('T5: APPROVE with nft field { tokenId, standard } parses successfully', () => {
    const result = ApproveRequestSchema.parse({
      type: 'APPROVE',
      spender: '0xspender',
      token: {
        address: '0xBC4C',
        decimals: 0,
        symbol: 'NFT',
        assetId: undefined,
      },
      amount: '1',
      network: 'ethereum-mainnet',
      nft: { tokenId: '1', standard: 'ERC-721' },
    });
    expect(result.nft).toBeDefined();
    expect(result.nft!.tokenId).toBe('1');
    expect(result.nft!.standard).toBe('ERC-721');
  });

  // Test 6: APPROVE without nft field (backward compatible ERC-20 approval)
  it('T6: APPROVE without nft field parses as before (backward compatible)', () => {
    const result = ApproveRequestSchema.parse({
      type: 'APPROVE',
      spender: '0xspender',
      token: {
        address: '0xUSDC',
        decimals: 6,
        symbol: 'USDC',
      },
      amount: '1000000',
      network: 'ethereum-mainnet',
    });
    expect(result.nft).toBeUndefined();
    expect(result.type).toBe('APPROVE');
  });

  // Test 7: ERROR_CODES contains all 5 NFT error codes
  it('T7: ERROR_CODES contains 5 NFT error codes with correct HTTP statuses', () => {
    expect(ERROR_CODES.NFT_NOT_FOUND.httpStatus).toBe(404);
    expect(ERROR_CODES.NFT_NOT_FOUND.domain).toBe('NFT');

    expect(ERROR_CODES.INDEXER_NOT_CONFIGURED.httpStatus).toBe(400);
    expect(ERROR_CODES.INDEXER_NOT_CONFIGURED.domain).toBe('NFT');

    expect(ERROR_CODES.UNSUPPORTED_NFT_STANDARD.httpStatus).toBe(400);
    expect(ERROR_CODES.UNSUPPORTED_NFT_STANDARD.domain).toBe('NFT');

    expect(ERROR_CODES.INDEXER_API_ERROR.httpStatus).toBe(502);
    expect(ERROR_CODES.INDEXER_API_ERROR.retryable).toBe(true);

    expect(ERROR_CODES.NFT_METADATA_FETCH_FAILED.httpStatus).toBe(502);
    expect(ERROR_CODES.NFT_METADATA_FETCH_FAILED.retryable).toBe(true);
  });

  // Test 8: NFT_TRANSFER is in TRANSACTION_TYPES enum
  it('T8: NFT_TRANSFER is included in TRANSACTION_TYPES enum array', () => {
    expect(TRANSACTION_TYPES).toContain('NFT_TRANSFER');
  });

  // Test 9: NFT_TRANSFER with CAIP-19 assetId in token field
  it('T9: NFT_TRANSFER with assetId (CAIP-19) in token field parses correctly', () => {
    const result = NftTransferRequestSchema.parse({
      type: 'NFT_TRANSFER',
      to: '0x1234',
      token: {
        address: '0xbc4ca0eda7647a8ab7c2061c2e118a18a936f13d',
        tokenId: '1234',
        standard: 'ERC-721',
        assetId: 'eip155:1/erc721:0xbc4ca0eda7647a8ab7c2061c2e118a18a936f13d-1234',
      },
      network: 'ethereum-mainnet',
    });
    expect(result.token.assetId).toBe(
      'eip155:1/erc721:0xbc4ca0eda7647a8ab7c2061c2e118a18a936f13d-1234',
    );
  });

  // Test: NftStandardEnum
  it('NftStandardEnum validates correctly', () => {
    expect(NftStandardEnum.parse('ERC-721')).toBe('ERC-721');
    expect(NftStandardEnum.parse('ERC-1155')).toBe('ERC-1155');
    expect(NftStandardEnum.parse('METAPLEX')).toBe('METAPLEX');
    expect(() => NftStandardEnum.parse('ERC-20')).toThrow();
  });
});
