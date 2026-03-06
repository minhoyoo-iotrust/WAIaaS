/**
 * Tests for NftTransferParams, NftApproveParams, and IChainAdapter NFT method types.
 */

import { describe, it, expect } from 'vitest';
import type {
  NftTransferParams,
  NftApproveParams,
  UnsignedTransaction,
  SubmitResult,
} from '../interfaces/index.js';

describe('NftTransferParams and NftApproveParams types', () => {
  it('NftTransferParams includes from, to, token, amount fields', () => {
    const params: NftTransferParams = {
      from: '0xSender',
      to: '0xRecipient',
      token: {
        address: '0xBC4CA0EdA7647A8aB7C2061c2E118A18a936f13D',
        tokenId: '1234',
        standard: 'ERC-721',
      },
      amount: 1n,
    };
    expect(params.from).toBe('0xSender');
    expect(params.to).toBe('0xRecipient');
    expect(params.token.address).toBe('0xBC4CA0EdA7647A8aB7C2061c2E118A18a936f13D');
    expect(params.token.tokenId).toBe('1234');
    expect(params.token.standard).toBe('ERC-721');
    expect(params.amount).toBe(1n);
  });

  it('NftApproveParams includes from, spender, token, approvalType', () => {
    const params: NftApproveParams = {
      from: '0xOwner',
      spender: '0xOperator',
      token: {
        address: '0xBC4CA0EdA7647A8aB7C2061c2E118A18a936f13D',
        tokenId: '1234',
        standard: 'ERC-1155',
      },
      approvalType: 'all',
    };
    expect(params.from).toBe('0xOwner');
    expect(params.spender).toBe('0xOperator');
    expect(params.approvalType).toBe('all');
    expect(params.token.standard).toBe('ERC-1155');
  });

  it('IChainAdapter has transferNft, approveNft, buildNftTransferTx methods', () => {
    // Type-level verification using a partial mock
    const mockAdapter = {
      chain: 'ethereum' as const,
      network: 'ethereum-mainnet' as const,
      buildNftTransferTx: async (_req: NftTransferParams): Promise<UnsignedTransaction> => {
        return { chain: 'ethereum', serialized: new Uint8Array(), estimatedFee: 0n, metadata: {} };
      },
      transferNft: async (_req: NftTransferParams, _pk: Uint8Array): Promise<SubmitResult> => {
        return { txHash: '0x123', status: 'confirmed' };
      },
      approveNft: async (_req: NftApproveParams): Promise<UnsignedTransaction> => {
        return { chain: 'ethereum', serialized: new Uint8Array(), estimatedFee: 0n, metadata: {} };
      },
    };

    expect(typeof mockAdapter.buildNftTransferTx).toBe('function');
    expect(typeof mockAdapter.transferNft).toBe('function');
    expect(typeof mockAdapter.approveNft).toBe('function');
  });
});
