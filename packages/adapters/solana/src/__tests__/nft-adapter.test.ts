/**
 * SolanaAdapter NFT method tests.
 *
 * Tests buildNftTransferTx, transferNft, and approveNft for Metaplex NFTs.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SolanaAdapter } from '../adapter.js';
import type { NftTransferParams, NftApproveParams } from '@waiaas/core';

// Mock the Solana program modules
vi.mock('@solana-program/token', async () => {
  const actual = await vi.importActual<typeof import('@solana-program/token')>('@solana-program/token');
  return {
    ...actual,
    findAssociatedTokenPda: vi.fn().mockResolvedValue(['mockAta1234']),
    getCreateAssociatedTokenIdempotentInstruction: vi.fn().mockReturnValue({
      programAddress: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
      accounts: [],
      data: new Uint8Array(),
    }),
    getTransferCheckedInstruction: vi.fn().mockReturnValue({
      programAddress: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
      accounts: [],
      data: new Uint8Array(),
    }),
    getApproveCheckedInstruction: vi.fn().mockReturnValue({
      programAddress: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
      accounts: [],
      data: new Uint8Array(),
    }),
  };
});

// Mock the Solana kit modules
vi.mock('@solana/kit', async () => {
  const actual = await vi.importActual<typeof import('@solana/kit')>('@solana/kit');
  return {
    ...actual,
    createSolanaRpc: vi.fn(() => mockRpc),
    compileTransaction: vi.fn().mockReturnValue({
      messageBytes: new Uint8Array(64),
      signatures: {},
    }),
    getTransactionEncoder: vi.fn().mockReturnValue({
      encode: vi.fn().mockReturnValue(new Uint8Array(128)),
    }),
    getBase64EncodedWireTransaction: vi.fn().mockReturnValue('base64encodedtx'),
    getTransactionDecoder: vi.fn().mockReturnValue({
      decode: vi.fn(),
    }),
  };
});

const mockRpc = {
  getAccountInfo: vi.fn().mockReturnValue({
    send: vi.fn().mockResolvedValue({
      value: {
        owner: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
        data: ['AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=', 'base64'],
      },
    }),
  }),
  getLatestBlockhash: vi.fn().mockReturnValue({
    send: vi.fn().mockResolvedValue({
      value: {
        blockhash: 'mockhash123',
        lastValidBlockHeight: 100000n,
      },
    }),
  }),
  sendTransaction: vi.fn().mockReturnValue({
    send: vi.fn().mockResolvedValue('mocktxsig123'),
  }),
  getSignatureStatuses: vi.fn().mockReturnValue({
    send: vi.fn().mockResolvedValue({
      value: [{ confirmationStatus: 'confirmed', err: null }],
    }),
  }),
};

// Valid Solana base58 addresses for testing
const SENDER = '7EcDhSYGxXyscszYEp35KHN8vvw3svAuLKTzXwCFLtV';
const RECIPIENT = 'BPFLoaderUpgradeab1e11111111111111111111111';
const NFT_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const DELEGATE = 'SysvarC1ock11111111111111111111111111111111';

describe('SolanaAdapter NFT methods', () => {
  let adapter: SolanaAdapter;

  beforeEach(() => {
    vi.clearAllMocks();
    adapter = new SolanaAdapter('solana-mainnet');
    // Force-connect without actual RPC
    (adapter as unknown as { _connected: boolean })._connected = true;
    (adapter as unknown as { _rpc: typeof mockRpc })._rpc = mockRpc;
  });

  describe('buildNftTransferTx', () => {
    it('builds SPL token transfer for Metaplex NFT (amount=1, decimals=0)', async () => {
      const params: NftTransferParams = {
        from: SENDER,
        to: RECIPIENT,
        token: {
          address: NFT_MINT,
          tokenId: NFT_MINT,
          standard: 'METAPLEX',
        },
        amount: 1n,
      };

      const tx = await adapter.buildNftTransferTx(params);

      expect(tx.chain).toBe('solana');
      expect(tx.serialized).toBeInstanceOf(Uint8Array);
      expect(tx.metadata.nftStandard).toBe('METAPLEX');
      expect(tx.metadata.tokenMint).toBe(NFT_MINT);
    });
  });

  describe('transferNft', () => {
    it('calls buildNftTransferTx then sign then submit', async () => {
      // Spy on the methods to verify the call chain
      const buildSpy = vi.spyOn(adapter, 'buildNftTransferTx');
      const signSpy = vi.spyOn(adapter, 'signTransaction').mockResolvedValue(new Uint8Array(128));
      const submitSpy = vi.spyOn(adapter, 'submitTransaction').mockResolvedValue({
        txHash: 'mocktxsig123',
        status: 'confirmed',
      });

      const params: NftTransferParams = {
        from: SENDER,
        to: RECIPIENT,
        token: {
          address: NFT_MINT,
          tokenId: NFT_MINT,
          standard: 'METAPLEX',
        },
        amount: 1n,
      };

      const result = await adapter.transferNft(params, new Uint8Array(64));

      expect(buildSpy).toHaveBeenCalledOnce();
      expect(signSpy).toHaveBeenCalledOnce();
      expect(submitSpy).toHaveBeenCalledOnce();
      expect(result.txHash).toBe('mocktxsig123');
      expect(result.status).toBe('confirmed');
    });
  });

  describe('approveNft', () => {
    it('builds SPL delegate instruction for single Metaplex NFT approval', async () => {
      const params: NftApproveParams = {
        from: SENDER,
        spender: DELEGATE,
        token: {
          address: NFT_MINT,
          tokenId: NFT_MINT,
          standard: 'METAPLEX',
        },
        approvalType: 'single',
      };

      const tx = await adapter.approveNft(params);

      expect(tx.chain).toBe('solana');
      expect(tx.metadata.nftStandard).toBe('METAPLEX');
      expect(tx.metadata.approvalType).toBe('single');
    });

    it('throws for collection-wide approval on Solana', async () => {
      const params: NftApproveParams = {
        from: SENDER,
        spender: DELEGATE,
        token: {
          address: NFT_MINT,
          tokenId: NFT_MINT,
          standard: 'METAPLEX',
        },
        approvalType: 'all',
      };

      try {
        await adapter.approveNft(params);
        expect.fail('should have thrown');
      } catch (error: unknown) {
        expect((error as { code: string }).code).toBe('UNSUPPORTED_NFT_STANDARD');
      }
    });
  });
});
