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
      mockClient.readContract.mockResolvedValueOnce(true);

      const result = await adapter.detectNftStandard('0xBC4CA0EdA7647A8aB7C2061c2E118A18a936f13D');
      expect(result).toBe('ERC-721');
    });

    it('detects ERC-1155 when ERC-721 returns false', async () => {
      mockClient.readContract.mockResolvedValueOnce(false); // ERC-721 = false
      mockClient.readContract.mockResolvedValueOnce(true);  // ERC-1155 = true

      const result = await adapter.detectNftStandard('0x495f947276749Ce646f68AC8c248420045cb7b5e');
      expect(result).toBe('ERC-1155');
    });

    it('throws UNSUPPORTED_NFT_STANDARD when neither ERC-721 nor ERC-1155', async () => {
      mockClient.readContract.mockResolvedValueOnce(false); // ERC-721 = false
      mockClient.readContract.mockResolvedValueOnce(false); // ERC-1155 = false

      try {
        await adapter.detectNftStandard('0xdeadbeef');
        expect.fail('should have thrown');
      } catch (error: unknown) {
        expect((error as { code: string }).code).toBe('UNSUPPORTED_NFT_STANDARD');
      }
    });

    it('wraps RPC errors as UNSUPPORTED_NFT_STANDARD', async () => {
      mockClient.readContract.mockRejectedValueOnce(new Error('RPC call failed'));

      try {
        await adapter.detectNftStandard('0xdeadbeef');
        expect.fail('should have thrown');
      } catch (error: unknown) {
        expect((error as { code: string }).code).toBe('UNSUPPORTED_NFT_STANDARD');
      }
    });
  });

  describe('error paths', () => {
    it('buildNftTransferTx wraps unknown errors via mapError', async () => {
      mockClient.getTransactionCount.mockRejectedValueOnce(new Error('connection refused'));

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

      await expect(adapter.buildNftTransferTx(params)).rejects.toThrow();
    });

    it('approveNft wraps unknown errors via mapError', async () => {
      mockClient.getTransactionCount.mockRejectedValueOnce(new Error('timeout exceeded'));

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

      await expect(adapter.approveNft(params)).rejects.toThrow();
    });
  });
});
