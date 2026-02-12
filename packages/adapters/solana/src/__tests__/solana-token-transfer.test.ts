/**
 * SolanaAdapter token transfer tests.
 *
 * Tests cover:
 * - buildTokenTransfer: SPL Token Program, Token-2022, ATA creation, error cases
 * - getTokenInfo: decimals extraction, error cases
 * - estimateFee: native vs token transfer, ATA creation cost
 * - getTransactionFee: returns estimatedFee from built tx
 * - getAssets: Token-2022 accounts alongside Token Program accounts
 *
 * Mock strategy: vi.mock('@solana/kit') with vi.hoisted() for mock RPC.
 * Also mocks '@solana-program/token' for findAssociatedTokenPda and instruction builders.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { WAIaaSError, ChainError } from '@waiaas/core';
import type { TokenTransferParams, TransferRequest, UnsignedTransaction } from '@waiaas/core';

// ---- Hoisted mock setup (vi.hoisted runs before vi.mock) ----

const { mockRpc, mockFindAssociatedTokenPda, mockGetCreateAtaInstruction, mockGetTransferCheckedInstruction } = vi.hoisted(() => {
  const mockRpc = {
    getSlot: vi.fn(),
    getBalance: vi.fn(),
    getLatestBlockhash: vi.fn(),
    simulateTransaction: vi.fn(),
    sendTransaction: vi.fn(),
    getSignatureStatuses: vi.fn(),
    getTokenAccountsByOwner: vi.fn(),
    getAccountInfo: vi.fn(),
  };

  const mockFindAssociatedTokenPda = vi.fn();
  const mockGetCreateAtaInstruction = vi.fn();
  const mockGetTransferCheckedInstruction = vi.fn();

  return {
    mockRpc,
    mockFindAssociatedTokenPda,
    mockGetCreateAtaInstruction,
    mockGetTransferCheckedInstruction,
  };
});

// Mock @solana/kit module
vi.mock('@solana/kit', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@solana/kit')>();
  return {
    ...actual,
    createSolanaRpc: vi.fn().mockReturnValue(mockRpc),
  };
});

// Mock @solana-program/token module
vi.mock('@solana-program/token', () => {
  return {
    TOKEN_PROGRAM_ADDRESS: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
    ASSOCIATED_TOKEN_PROGRAM_ADDRESS: 'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL',
    findAssociatedTokenPda: mockFindAssociatedTokenPda,
    getCreateAssociatedTokenIdempotentInstruction: mockGetCreateAtaInstruction,
    getTransferCheckedInstruction: mockGetTransferCheckedInstruction,
  };
});

// Import adapter after mock
import { SolanaAdapter } from '../adapter.js';

// ---- Helpers ----

const TEST_RPC_URL = 'https://api.devnet.solana.com';
const SPL_TOKEN_PROGRAM_ID = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
const TOKEN_2022_PROGRAM_ID = 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb';
const ATA_RENT_LAMPORTS = 2_039_280n;
const DEFAULT_SOL_TRANSFER_FEE = 5000n;

const TEST_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const TEST_FROM = '11111111111111111111111111111112';
const TEST_TO = 'Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr';
const TEST_SOURCE_ATA = 'SourceATA111111111111111111111111111111111111';
const TEST_DEST_ATA = 'DestATA1111111111111111111111111111111111111';

/** Create a chainable RPC method mock: method().send() -> resolves(value) */
function mockSend<T>(value: T) {
  return vi.fn().mockReturnValue({ send: vi.fn().mockResolvedValue(value) });
}

/** Mock instruction object (just needs to be truthy for pipe pattern) */
const mockInstruction = {
  programAddress: SPL_TOKEN_PROGRAM_ID,
  accounts: [],
  data: new Uint8Array([12]),
};

function setupTokenTransferMocks(opts: {
  mintOwner?: string;
  mintNotFound?: boolean;
  destAtaExists?: boolean;
  token2022?: boolean;
}) {
  const mintOwner = opts.mintOwner ?? (opts.token2022 ? TOKEN_2022_PROGRAM_ID : SPL_TOKEN_PROGRAM_ID);

  // Mock getAccountInfo -- returns different values depending on the address queried
  let callCount = 0;
  mockRpc.getAccountInfo = vi.fn().mockImplementation(() => {
    callCount++;
    if (callCount === 1) {
      // First call: mint account query
      if (opts.mintNotFound) {
        return { send: vi.fn().mockResolvedValue({ value: null }) };
      }
      return {
        send: vi.fn().mockResolvedValue({
          value: {
            owner: mintOwner,
            data: ['AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABQ==', 'base64'],
            lamports: 1461600n,
          },
        }),
      };
    }
    // Subsequent calls: ATA existence check
    if (opts.destAtaExists) {
      return {
        send: vi.fn().mockResolvedValue({
          value: { owner: mintOwner, data: ['AA==', 'base64'], lamports: 2039280n },
        }),
      };
    }
    return { send: vi.fn().mockResolvedValue({ value: null }) };
  });

  // Mock findAssociatedTokenPda
  let pdaCallCount = 0;
  mockFindAssociatedTokenPda.mockImplementation(() => {
    pdaCallCount++;
    if (pdaCallCount === 1) return Promise.resolve([TEST_SOURCE_ATA, 255]);
    return Promise.resolve([TEST_DEST_ATA, 254]);
  });

  // Mock getLatestBlockhash
  mockRpc.getLatestBlockhash = mockSend({
    value: {
      blockhash: '4EPD2GJZkETChiMBc7G3yqga8TaczFNKSRJBuAGDNBRk',
      lastValidBlockHeight: 200n,
    },
  });

  // Mock instruction builders to return simple instruction objects
  mockGetCreateAtaInstruction.mockReturnValue(mockInstruction);
  mockGetTransferCheckedInstruction.mockReturnValue(mockInstruction);
}

// ---- Tests ----

describe('SolanaAdapter - Token Operations', () => {
  let adapter: SolanaAdapter;

  beforeEach(async () => {
    adapter = new SolanaAdapter('devnet');
    vi.clearAllMocks();
    await adapter.connect(TEST_RPC_URL);
  });

  afterEach(async () => {
    if (adapter.isConnected()) {
      await adapter.disconnect();
    }
  });

  // -- buildTokenTransfer tests --

  describe('buildTokenTransfer', () => {
    it('builds SPL Token Program transfer (mint owner = TOKEN_PROGRAM_ID)', async () => {
      setupTokenTransferMocks({ destAtaExists: true });

      const request: TokenTransferParams = {
        from: TEST_FROM,
        to: TEST_TO,
        amount: 1_000_000n,
        token: { address: TEST_MINT, decimals: 6, symbol: 'USDC' },
      };

      const tx = await adapter.buildTokenTransfer(request);

      expect(tx.chain).toBe('solana');
      expect(tx.serialized).toBeInstanceOf(Uint8Array);
      expect(tx.serialized.length).toBeGreaterThan(0);
      expect(tx.estimatedFee).toBe(DEFAULT_SOL_TRANSFER_FEE);
      expect(tx.metadata.tokenProgram).toBe(SPL_TOKEN_PROGRAM_ID);
      expect(tx.metadata.needCreateAta).toBe(false);
      expect(tx.metadata.token).toEqual({ address: TEST_MINT, decimals: 6, symbol: 'USDC' });

      // transferChecked should be called with programAddress = SPL_TOKEN_PROGRAM_ID
      expect(mockGetTransferCheckedInstruction).toHaveBeenCalledWith(
        expect.objectContaining({ amount: 1_000_000n, decimals: 6 }),
        expect.objectContaining({ programAddress: SPL_TOKEN_PROGRAM_ID }),
      );
    });

    it('builds Token-2022 transfer (mint owner = TOKEN_2022_PROGRAM_ID)', async () => {
      setupTokenTransferMocks({ token2022: true, destAtaExists: true });

      const request: TokenTransferParams = {
        from: TEST_FROM,
        to: TEST_TO,
        amount: 500_000n,
        token: { address: TEST_MINT, decimals: 6, symbol: 'USDC-2022' },
      };

      const tx = await adapter.buildTokenTransfer(request);

      expect(tx.metadata.tokenProgram).toBe(TOKEN_2022_PROGRAM_ID);
      expect(mockGetTransferCheckedInstruction).toHaveBeenCalledWith(
        expect.objectContaining({ amount: 500_000n, decimals: 6 }),
        expect.objectContaining({ programAddress: TOKEN_2022_PROGRAM_ID }),
      );
    });

    it('creates ATA when destination ATA does not exist', async () => {
      setupTokenTransferMocks({ destAtaExists: false });

      const request: TokenTransferParams = {
        from: TEST_FROM,
        to: TEST_TO,
        amount: 1_000_000n,
        token: { address: TEST_MINT, decimals: 6, symbol: 'USDC' },
      };

      const tx = await adapter.buildTokenTransfer(request);

      expect(tx.metadata.needCreateAta).toBe(true);
      expect(tx.estimatedFee).toBe(DEFAULT_SOL_TRANSFER_FEE + ATA_RENT_LAMPORTS);
      expect(mockGetCreateAtaInstruction).toHaveBeenCalled();
    });

    it('skips ATA creation when destination ATA exists', async () => {
      setupTokenTransferMocks({ destAtaExists: true });

      const request: TokenTransferParams = {
        from: TEST_FROM,
        to: TEST_TO,
        amount: 1_000_000n,
        token: { address: TEST_MINT, decimals: 6, symbol: 'USDC' },
      };

      const tx = await adapter.buildTokenTransfer(request);

      expect(tx.metadata.needCreateAta).toBe(false);
      expect(tx.estimatedFee).toBe(DEFAULT_SOL_TRANSFER_FEE);
      expect(mockGetCreateAtaInstruction).not.toHaveBeenCalled();
    });

    it('throws ChainError TOKEN_ACCOUNT_NOT_FOUND when mint not found', async () => {
      setupTokenTransferMocks({ mintNotFound: true });

      const request: TokenTransferParams = {
        from: TEST_FROM,
        to: TEST_TO,
        amount: 1_000_000n,
        token: { address: TEST_MINT, decimals: 6, symbol: 'USDC' },
      };

      await expect(adapter.buildTokenTransfer(request)).rejects.toThrow(ChainError);
      try {
        await adapter.buildTokenTransfer(request);
      } catch (error) {
        expect(error).toBeInstanceOf(ChainError);
        expect((error as ChainError).code).toBe('TOKEN_ACCOUNT_NOT_FOUND');
      }
    });

    it('throws ChainError INVALID_INSTRUCTION when mint owner is not a token program', async () => {
      // Use a direct mock that always returns system program as owner
      mockRpc.getAccountInfo = mockSend({
        value: {
          owner: '11111111111111111111111111111111',
          data: ['AA==', 'base64'],
          lamports: 1461600n,
        },
      });

      const request: TokenTransferParams = {
        from: TEST_FROM,
        to: TEST_TO,
        amount: 1_000_000n,
        token: { address: TEST_MINT, decimals: 6, symbol: 'USDC' },
      };

      try {
        await adapter.buildTokenTransfer(request);
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(ChainError);
        expect((error as ChainError).code).toBe('INVALID_INSTRUCTION');
      }
    });

    it('includes expiresAt and blockhash metadata', async () => {
      setupTokenTransferMocks({ destAtaExists: true });

      const request: TokenTransferParams = {
        from: TEST_FROM,
        to: TEST_TO,
        amount: 1_000_000n,
        token: { address: TEST_MINT, decimals: 6, symbol: 'USDC' },
      };

      const tx = await adapter.buildTokenTransfer(request);

      expect(tx.expiresAt).toBeInstanceOf(Date);
      expect(tx.expiresAt!.getTime()).toBeGreaterThan(Date.now());
      expect(tx.metadata.blockhash).toBe('4EPD2GJZkETChiMBc7G3yqga8TaczFNKSRJBuAGDNBRk');
      expect(tx.metadata.lastValidBlockHeight).toBe(200);
    });
  });

  // -- getTokenInfo tests --

  describe('getTokenInfo', () => {
    it('returns correct decimals and programId for a valid mint', async () => {
      // Create a mock mint account with decimals = 6 at offset 44
      const mintData = Buffer.alloc(82, 0);
      mintData[44] = 6; // decimals = 6
      const base64Data = mintData.toString('base64');

      mockRpc.getAccountInfo = mockSend({
        value: {
          owner: SPL_TOKEN_PROGRAM_ID,
          data: [base64Data, 'base64'],
          lamports: 1461600n,
        },
      });

      const info = await adapter.getTokenInfo(TEST_MINT);

      expect(info.address).toBe(TEST_MINT);
      expect(info.decimals).toBe(6);
      expect(info.programId).toBe(SPL_TOKEN_PROGRAM_ID);
      expect(info.symbol).toBe('');
      expect(info.name).toBe('');
    });

    it('returns decimals = 9 for a 9-decimal token', async () => {
      const mintData = Buffer.alloc(82, 0);
      mintData[44] = 9;
      const base64Data = mintData.toString('base64');

      mockRpc.getAccountInfo = mockSend({
        value: {
          owner: TOKEN_2022_PROGRAM_ID,
          data: [base64Data, 'base64'],
          lamports: 1461600n,
        },
      });

      const info = await adapter.getTokenInfo(TEST_MINT);

      expect(info.decimals).toBe(9);
      expect(info.programId).toBe(TOKEN_2022_PROGRAM_ID);
    });

    it('throws ChainError TOKEN_ACCOUNT_NOT_FOUND when mint not found', async () => {
      mockRpc.getAccountInfo = mockSend({ value: null });

      await expect(adapter.getTokenInfo(TEST_MINT)).rejects.toThrow(ChainError);
      try {
        await adapter.getTokenInfo(TEST_MINT);
      } catch (error) {
        expect(error).toBeInstanceOf(ChainError);
        expect((error as ChainError).code).toBe('TOKEN_ACCOUNT_NOT_FOUND');
      }
    });
  });

  // -- estimateFee tests --

  describe('estimateFee', () => {
    it('returns DEFAULT_SOL_TRANSFER_FEE for native transfer', async () => {
      const request: TransferRequest = {
        from: TEST_FROM,
        to: TEST_TO,
        amount: 1_000_000_000n,
      };

      const estimate = await adapter.estimateFee(request);

      expect(estimate.fee).toBe(DEFAULT_SOL_TRANSFER_FEE);
      expect(estimate.needsAtaCreation).toBeUndefined();
    });

    it('returns fee + ATA_RENT_LAMPORTS for token transfer when ATA needs creation', async () => {
      // Mock mint account query
      mockRpc.getAccountInfo = vi.fn()
        .mockReturnValueOnce({
          send: vi.fn().mockResolvedValue({
            value: {
              owner: SPL_TOKEN_PROGRAM_ID,
              data: ['AA==', 'base64'],
              lamports: 1461600n,
            },
          }),
        })
        .mockReturnValueOnce({
          send: vi.fn().mockResolvedValue({ value: null }), // ATA doesn't exist
        });

      mockFindAssociatedTokenPda.mockResolvedValue([TEST_DEST_ATA, 254]);

      const request: TokenTransferParams = {
        from: TEST_FROM,
        to: TEST_TO,
        amount: 1_000_000n,
        token: { address: TEST_MINT, decimals: 6, symbol: 'USDC' },
      };

      const estimate = await adapter.estimateFee(request);

      expect(estimate.fee).toBe(DEFAULT_SOL_TRANSFER_FEE + ATA_RENT_LAMPORTS);
      expect(estimate.needsAtaCreation).toBe(true);
      expect(estimate.ataRentCost).toBe(ATA_RENT_LAMPORTS);
    });

    it('returns fee only for token transfer when ATA already exists', async () => {
      mockRpc.getAccountInfo = vi.fn()
        .mockReturnValueOnce({
          send: vi.fn().mockResolvedValue({
            value: {
              owner: SPL_TOKEN_PROGRAM_ID,
              data: ['AA==', 'base64'],
              lamports: 1461600n,
            },
          }),
        })
        .mockReturnValueOnce({
          send: vi.fn().mockResolvedValue({
            value: { owner: SPL_TOKEN_PROGRAM_ID, data: ['AA==', 'base64'], lamports: 2039280n },
          }),
        });

      mockFindAssociatedTokenPda.mockResolvedValue([TEST_DEST_ATA, 254]);

      const request: TokenTransferParams = {
        from: TEST_FROM,
        to: TEST_TO,
        amount: 1_000_000n,
        token: { address: TEST_MINT, decimals: 6, symbol: 'USDC' },
      };

      const estimate = await adapter.estimateFee(request);

      expect(estimate.fee).toBe(DEFAULT_SOL_TRANSFER_FEE);
      expect(estimate.needsAtaCreation).toBe(false);
      expect(estimate.ataRentCost).toBeUndefined();
    });
  });

  // -- getTransactionFee tests --

  describe('getTransactionFee', () => {
    it('returns tx.estimatedFee for any built transaction', async () => {
      const tx: UnsignedTransaction = {
        chain: 'solana',
        serialized: new Uint8Array([1, 2, 3]),
        estimatedFee: 2_044_280n,
        metadata: {},
      };

      const fee = await adapter.getTransactionFee(tx);
      expect(fee).toBe(2_044_280n);
    });

    it('returns DEFAULT_SOL_TRANSFER_FEE for a native transfer tx', async () => {
      const tx: UnsignedTransaction = {
        chain: 'solana',
        serialized: new Uint8Array([1, 2, 3]),
        estimatedFee: 5000n,
        metadata: {},
      };

      const fee = await adapter.getTransactionFee(tx);
      expect(fee).toBe(5000n);
    });
  });

  // -- getAssets with Token-2022 tests --

  describe('getAssets - Token-2022 support', () => {
    it('includes Token-2022 accounts alongside Token Program accounts', async () => {
      mockRpc.getBalance = mockSend({ value: 1_000_000_000n });

      // First getTokenAccountsByOwner call: SPL Token Program
      // Second getTokenAccountsByOwner call: Token-2022
      let tokenCallCount = 0;
      mockRpc.getTokenAccountsByOwner = vi.fn().mockImplementation(() => {
        tokenCallCount++;
        if (tokenCallCount === 1) {
          // SPL Token Program accounts
          return {
            send: vi.fn().mockResolvedValue({
              value: [
                {
                  account: {
                    data: {
                      parsed: {
                        info: {
                          mint: 'SPLToken11111111111111111111111111111111111',
                          tokenAmount: { amount: '500000', decimals: 6 },
                        },
                        type: 'account',
                      },
                    },
                  },
                },
              ],
            }),
          };
        }
        // Token-2022 accounts
        return {
          send: vi.fn().mockResolvedValue({
            value: [
              {
                account: {
                  data: {
                    parsed: {
                      info: {
                        mint: 'Token2022Mint1111111111111111111111111111111',
                        tokenAmount: { amount: '1000000', decimals: 9 },
                      },
                      type: 'account',
                    },
                  },
                },
              },
            ],
          }),
        };
      });

      const assets = await adapter.getAssets(TEST_FROM);

      expect(assets).toHaveLength(3);
      // Native SOL first
      expect(assets[0]!.mint).toBe('native');
      expect(assets[0]!.isNative).toBe(true);
      // Token accounts sorted by balance descending
      const tokenMints = assets.slice(1).map((a) => a.mint);
      expect(tokenMints).toContain('SPLToken11111111111111111111111111111111111');
      expect(tokenMints).toContain('Token2022Mint1111111111111111111111111111111');
    });

    it('filters out zero-balance Token-2022 accounts', async () => {
      mockRpc.getBalance = mockSend({ value: 1_000_000_000n });

      let tokenCallCount = 0;
      mockRpc.getTokenAccountsByOwner = vi.fn().mockImplementation(() => {
        tokenCallCount++;
        if (tokenCallCount === 1) {
          return { send: vi.fn().mockResolvedValue({ value: [] }) }; // no SPL tokens
        }
        return {
          send: vi.fn().mockResolvedValue({
            value: [
              {
                account: {
                  data: {
                    parsed: {
                      info: {
                        mint: 'Token2022NonZero11111111111111111111111111111',
                        tokenAmount: { amount: '100000', decimals: 6 },
                      },
                      type: 'account',
                    },
                  },
                },
              },
              {
                account: {
                  data: {
                    parsed: {
                      info: {
                        mint: 'Token2022Zero11111111111111111111111111111111',
                        tokenAmount: { amount: '0', decimals: 6 },
                      },
                      type: 'account',
                    },
                  },
                },
              },
            ],
          }),
        };
      });

      const assets = await adapter.getAssets(TEST_FROM);

      expect(assets).toHaveLength(2); // native + 1 non-zero Token-2022
      expect(assets[0]!.mint).toBe('native');
      expect(assets[1]!.mint).toBe('Token2022NonZero11111111111111111111111111111');
    });

    it('sorts assets: native first, then by balance descending', async () => {
      mockRpc.getBalance = mockSend({ value: 100n }); // small SOL balance

      let tokenCallCount = 0;
      mockRpc.getTokenAccountsByOwner = vi.fn().mockImplementation(() => {
        tokenCallCount++;
        if (tokenCallCount === 1) {
          return {
            send: vi.fn().mockResolvedValue({
              value: [
                {
                  account: {
                    data: {
                      parsed: {
                        info: {
                          mint: 'SmallBalanceMint111111111111111111111111111',
                          tokenAmount: { amount: '100', decimals: 6 },
                        },
                        type: 'account',
                      },
                    },
                  },
                },
              ],
            }),
          };
        }
        return {
          send: vi.fn().mockResolvedValue({
            value: [
              {
                account: {
                  data: {
                    parsed: {
                      info: {
                        mint: 'LargeBalanceMint111111111111111111111111111',
                        tokenAmount: { amount: '999999999', decimals: 9 },
                      },
                      type: 'account',
                    },
                  },
                },
              },
            ],
          }),
        };
      });

      const assets = await adapter.getAssets(TEST_FROM);

      expect(assets).toHaveLength(3);
      expect(assets[0]!.mint).toBe('native'); // native first
      expect(assets[1]!.mint).toBe('LargeBalanceMint111111111111111111111111111'); // larger balance
      expect(assets[2]!.mint).toBe('SmallBalanceMint111111111111111111111111111'); // smaller balance
    });
  });

  // -- Error handling --

  describe('error handling', () => {
    it('buildTokenTransfer throws ADAPTER_NOT_AVAILABLE when not connected', async () => {
      await adapter.disconnect();

      const request: TokenTransferParams = {
        from: TEST_FROM,
        to: TEST_TO,
        amount: 1_000_000n,
        token: { address: TEST_MINT, decimals: 6, symbol: 'USDC' },
      };

      await expect(adapter.buildTokenTransfer(request)).rejects.toThrow(WAIaaSError);
    });

    it('getTokenInfo throws ADAPTER_NOT_AVAILABLE when not connected', async () => {
      await adapter.disconnect();

      await expect(adapter.getTokenInfo(TEST_MINT)).rejects.toThrow(WAIaaSError);
    });

    it('estimateFee throws ADAPTER_NOT_AVAILABLE when not connected', async () => {
      await adapter.disconnect();

      const request: TokenTransferParams = {
        from: TEST_FROM,
        to: TEST_TO,
        amount: 1_000_000n,
        token: { address: TEST_MINT, decimals: 6, symbol: 'USDC' },
      };

      await expect(adapter.estimateFee(request)).rejects.toThrow(WAIaaSError);
    });
  });
});
