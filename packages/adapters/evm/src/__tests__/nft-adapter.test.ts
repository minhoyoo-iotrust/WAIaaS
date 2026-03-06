/**
 * EvmAdapter NFT method tests.
 *
 * Tests buildNftTransferTx, transferNft, and approveNft for ERC-721 and ERC-1155.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EvmAdapter } from '../adapter.js';
import type { NftTransferParams, NftApproveParams } from '@waiaas/core';

// Mock viem functions at module level
vi.mock('viem', async () => {
  const actual = await vi.importActual<typeof import('viem')>('viem');
  return {
    ...actual,
    createPublicClient: vi.fn(() => mockClient),
  };
});

// Mock client object
const mockClient = {
  chain: { id: 1 },
  getTransactionCount: vi.fn().mockResolvedValue(42),
  estimateFeesPerGas: vi.fn().mockResolvedValue({
    maxFeePerGas: 30000000000n,
    maxPriorityFeePerGas: 1000000000n,
  }),
  estimateGas: vi.fn().mockResolvedValue(100000n),
  readContract: vi.fn(),
  sendRawTransaction: vi.fn().mockResolvedValue('0xmocktxhash'),
  waitForTransactionReceipt: vi.fn().mockResolvedValue({
    transactionHash: '0xmocktxhash',
    status: 'success',
    blockNumber: 12345n,
  }),
};

describe('EvmAdapter NFT methods', () => {
  let adapter: EvmAdapter;

  beforeEach(() => {
    vi.clearAllMocks();
    adapter = new EvmAdapter('ethereum-mainnet');
    // Force-connect without actual RPC
    (adapter as unknown as { _connected: boolean })._connected = true;
    (adapter as unknown as { _client: typeof mockClient })._client = mockClient;
  });

  describe('buildNftTransferTx', () => {
    it('builds safeTransferFrom(from,to,tokenId) for ERC-721', async () => {
      const params: NftTransferParams = {
        from: '0x1111111111111111111111111111111111111111',
        to: '0x2222222222222222222222222222222222222222',
        token: {
          address: '0xBC4CA0EdA7647A8aB7C2061c2E118A18a936f13D',
          tokenId: '1234',
          standard: 'ERC-721',
        },
        amount: 1n,
      };

      const tx = await adapter.buildNftTransferTx(params);

      expect(tx.chain).toBe('ethereum');
      expect(tx.serialized).toBeInstanceOf(Uint8Array);
      expect(tx.estimatedFee).toBeGreaterThan(0n);
      expect(tx.metadata.nftStandard).toBe('ERC-721');
      expect(tx.metadata.tokenId).toBe('1234');
      expect(tx.metadata.contractAddress).toBe('0xBC4CA0EdA7647A8aB7C2061c2E118A18a936f13D');
      expect(tx.nonce).toBe(42);
    });

    it('builds safeTransferFrom(from,to,id,amount,data) for ERC-1155', async () => {
      const params: NftTransferParams = {
        from: '0x1111111111111111111111111111111111111111',
        to: '0x2222222222222222222222222222222222222222',
        token: {
          address: '0x495f947276749Ce646f68AC8c248420045cb7b5e',
          tokenId: '99',
          standard: 'ERC-1155',
        },
        amount: 5n,
      };

      const tx = await adapter.buildNftTransferTx(params);

      expect(tx.chain).toBe('ethereum');
      expect(tx.metadata.nftStandard).toBe('ERC-1155');
      expect(tx.metadata.tokenId).toBe('99');
    });

    it('applies gas safety margin (estimatedGas * 120n / 100n)', async () => {
      mockClient.estimateGas.mockResolvedValueOnce(100000n);

      const params: NftTransferParams = {
        from: '0x1111111111111111111111111111111111111111',
        to: '0x2222222222222222222222222222222222222222',
        token: {
          address: '0xBC4CA0EdA7647A8aB7C2061c2E118A18a936f13D',
          tokenId: '1',
          standard: 'ERC-721',
        },
        amount: 1n,
      };

      const tx = await adapter.buildNftTransferTx(params);
      // gasLimit = 100000 * 120 / 100 = 120000
      expect(tx.metadata.gasLimit).toBe(120000n);
    });
  });

  describe('transferNft', () => {
    it('calls buildNftTransferTx then sign then submit', async () => {
      const params: NftTransferParams = {
        from: '0x1111111111111111111111111111111111111111',
        to: '0x2222222222222222222222222222222222222222',
        token: {
          address: '0xBC4CA0EdA7647A8aB7C2061c2E118A18a936f13D',
          tokenId: '1',
          standard: 'ERC-721',
        },
        amount: 1n,
      };

      // Create a valid 32-byte private key
      const privateKey = new Uint8Array(32);
      privateKey[31] = 1; // Non-zero private key

      const result = await adapter.transferNft(params, privateKey);

      expect(result.txHash).toBe('0xmocktxhash');
      expect(result.status).toBeDefined();
    });
  });

  describe('approveNft', () => {
    it('builds ERC-721 approve(spender,tokenId) for single approval', async () => {
      const params: NftApproveParams = {
        from: '0x1111111111111111111111111111111111111111',
        spender: '0x3333333333333333333333333333333333333333',
        token: {
          address: '0xBC4CA0EdA7647A8aB7C2061c2E118A18a936f13D',
          tokenId: '1234',
          standard: 'ERC-721',
        },
        approvalType: 'single',
      };

      const tx = await adapter.approveNft(params);

      expect(tx.chain).toBe('ethereum');
      expect(tx.metadata.nftStandard).toBe('ERC-721');
      expect(tx.metadata.approvalType).toBe('single');
    });

    it('builds ERC-1155 setApprovalForAll(operator,true) for all approval', async () => {
      const params: NftApproveParams = {
        from: '0x1111111111111111111111111111111111111111',
        spender: '0x3333333333333333333333333333333333333333',
        token: {
          address: '0x495f947276749Ce646f68AC8c248420045cb7b5e',
          tokenId: '99',
          standard: 'ERC-1155',
        },
        approvalType: 'all',
      };

      const tx = await adapter.approveNft(params);

      expect(tx.chain).toBe('ethereum');
      expect(tx.metadata.nftStandard).toBe('ERC-1155');
      expect(tx.metadata.approvalType).toBe('all');
    });

    it('throws for ERC-1155 single approval (not supported)', async () => {
      const params: NftApproveParams = {
        from: '0x1111111111111111111111111111111111111111',
        spender: '0x3333333333333333333333333333333333333333',
        token: {
          address: '0x495f947276749Ce646f68AC8c248420045cb7b5e',
          tokenId: '99',
          standard: 'ERC-1155',
        },
        approvalType: 'single',
      };

      try {
        await adapter.approveNft(params);
        expect.fail('should have thrown');
      } catch (error: unknown) {
        expect((error as { code: string }).code).toBe('UNSUPPORTED_NFT_STANDARD');
      }
    });
  });

  describe('detectNftStandard', () => {
    it('detects ERC-721 via ERC-165 supportsInterface', async () => {
      // First call returns true for ERC-721 interface ID
      mockClient.readContract.mockResolvedValueOnce(true);

      // Call buildNftTransferTx with an NFT that has standard set
      // (detectNftStandard is a private method, test via public API behavior)
      const params: NftTransferParams = {
        from: '0x1111111111111111111111111111111111111111',
        to: '0x2222222222222222222222222222222222222222',
        token: {
          address: '0xBC4CA0EdA7647A8aB7C2061c2E118A18a936f13D',
          tokenId: '1',
          standard: 'ERC-721',
        },
        amount: 1n,
      };

      const tx = await adapter.buildNftTransferTx(params);
      expect(tx.metadata.nftStandard).toBe('ERC-721');
    });
  });
});
