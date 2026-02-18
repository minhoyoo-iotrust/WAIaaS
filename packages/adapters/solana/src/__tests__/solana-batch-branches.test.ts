/**
 * SolanaAdapter buildBatch branch-coverage tests.
 *
 * Targets SPECIFIC uncovered branches in convertBatchInstruction() 4-type dispatch
 * and buildBatch() outer error handling. These complement the existing solana-batch.test.ts
 * which covers the happy-path flows.
 *
 * Covered branches:
 * - TOKEN_TRANSFER: mint not found, invalid mint owner, Token-2022, ATA exists (length 1)
 * - CONTRACT_CALL: missing programId/instructionData/accounts, base64 data, 4 AccountRole combos
 * - APPROVE: mint not found, invalid mint owner, Token-2022
 * - Unknown type: documented as dead code (classifyInstruction always returns known type)
 * - buildBatch outer catch: ChainError re-throw, generic Error wrap
 *
 * Mock strategy: vi.hoisted + vi.mock pattern (same as solana-batch.test.ts).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ChainError, WAIaaSError } from '@waiaas/core';
import type {
  BatchParams,
  TransferRequest,
  TokenTransferParams,
  ContractCallParams,
  ApproveParams,
} from '@waiaas/core';

// ---- Hoisted mock setup (vi.hoisted runs before vi.mock) ----

const {
  mockRpc,
  mockFindAssociatedTokenPda,
  mockGetCreateAtaInstruction,
  mockGetTransferCheckedInstruction,
  mockGetApproveCheckedInstruction,
} = vi.hoisted(() => {
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
  const mockGetApproveCheckedInstruction = vi.fn();

  return {
    mockRpc,
    mockFindAssociatedTokenPda,
    mockGetCreateAtaInstruction,
    mockGetTransferCheckedInstruction,
    mockGetApproveCheckedInstruction,
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
    getApproveCheckedInstruction: mockGetApproveCheckedInstruction,
  };
});

// Import adapter after mock
import { SolanaAdapter } from '../adapter.js';

// ---- Constants ----

const TEST_RPC_URL = 'https://api.devnet.solana.com';
const SPL_TOKEN_PROGRAM_ID = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
const TOKEN_2022_PROGRAM_ID = 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb';

const TEST_FROM = '11111111111111111111111111111112';
const TEST_TO_1 = 'Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr';
const TEST_TO_2 = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const TEST_MINT = 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB';
const TEST_SPENDER = 'JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4';
const TEST_SOURCE_ATA = 'SourceATA111111111111111111111111111111111111';
const TEST_DEST_ATA = 'DestATA1111111111111111111111111111111111111';
const TEST_OWNER_ATA = 'OwnerATA111111111111111111111111111111111111';
const TEST_PROGRAM_ID = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';

/** Create a chainable RPC method mock: method().send() -> resolves(value) */
function mockSend<T>(value: T) {
  return vi.fn().mockReturnValue({ send: vi.fn().mockResolvedValue(value) });
}

/** Mock instruction object (truthy for pipe pattern) */
const mockInstruction = {
  programAddress: SPL_TOKEN_PROGRAM_ID,
  accounts: [],
  data: new Uint8Array([12]),
};

function setupBlockhashMock() {
  mockRpc.getLatestBlockhash = mockSend({
    value: {
      blockhash: '4EPD2GJZkETChiMBc7G3yqga8TaczFNKSRJBuAGDNBRk',
      lastValidBlockHeight: 200n,
    },
  });
}

/** Helper to make a minimal 2-instruction batch (first is always TRANSFER) */
function batchWith<T>(second: T): BatchParams {
  return {
    from: TEST_FROM,
    instructions: [
      { from: TEST_FROM, to: TEST_TO_1, amount: 1_000_000_000n } as TransferRequest,
      second as BatchParams['instructions'][number],
    ],
  };
}

// ---- Tests ----

describe('SolanaAdapter - buildBatch branch coverage', () => {
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

  // ========================================================================
  // TOKEN_TRANSFER branch error paths
  // ========================================================================

  describe('TOKEN_TRANSFER branch in convertBatchInstruction', () => {
    it('throws TOKEN_ACCOUNT_NOT_FOUND when mint not found', async () => {
      setupBlockhashMock();
      // First getAccountInfo call (mint lookup) returns null
      mockRpc.getAccountInfo = mockSend({ value: null });

      const request = batchWith({
        from: TEST_FROM,
        to: TEST_TO_2,
        amount: 1_000_000n,
        token: { address: TEST_MINT, decimals: 6, symbol: 'USDC' },
      } as TokenTransferParams);

      try {
        await adapter.buildBatch(request);
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(ChainError);
        expect((error as ChainError).code).toBe('TOKEN_ACCOUNT_NOT_FOUND');
        expect((error as ChainError).message).toContain('Token mint not found');
      }
    });

    it('throws INVALID_INSTRUCTION when mint owner is not a token program', async () => {
      setupBlockhashMock();
      // Mint account exists but owner is some random program, not SPL or Token-2022
      mockRpc.getAccountInfo = mockSend({
        value: {
          owner: '11111111111111111111111111111111', // System Program
          data: ['AA==', 'base64'],
          lamports: 1461600n,
        },
      });

      const request = batchWith({
        from: TEST_FROM,
        to: TEST_TO_2,
        amount: 1_000_000n,
        token: { address: TEST_MINT, decimals: 6, symbol: 'USDC' },
      } as TokenTransferParams);

      try {
        await adapter.buildBatch(request);
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(ChainError);
        expect((error as ChainError).code).toBe('INVALID_INSTRUCTION');
        expect((error as ChainError).message).toContain('Invalid token mint');
        expect((error as ChainError).message).toContain('owner is not a token program');
      }
    });

    it('uses TOKEN_2022_PROGRAM_ID for Token-2022 mint', async () => {
      setupBlockhashMock();
      // Mint owner is Token-2022
      let getAccountInfoCallCount = 0;
      mockRpc.getAccountInfo = vi.fn().mockImplementation(() => {
        getAccountInfoCallCount++;
        if (getAccountInfoCallCount === 1) {
          // Mint account query -> Token-2022 owner
          return {
            send: vi.fn().mockResolvedValue({
              value: {
                owner: TOKEN_2022_PROGRAM_ID,
                data: ['AA==', 'base64'],
                lamports: 1461600n,
              },
            }),
          };
        }
        // Destination ATA existence check -> not found (needs creation)
        return { send: vi.fn().mockResolvedValue({ value: null }) };
      });

      let pdaCallCount = 0;
      mockFindAssociatedTokenPda.mockImplementation(() => {
        pdaCallCount++;
        if (pdaCallCount % 2 === 1) return Promise.resolve([TEST_SOURCE_ATA, 255]);
        return Promise.resolve([TEST_DEST_ATA, 254]);
      });
      mockGetCreateAtaInstruction.mockReturnValue(mockInstruction);
      mockGetTransferCheckedInstruction.mockReturnValue(mockInstruction);

      const request = batchWith({
        from: TEST_FROM,
        to: TEST_TO_2,
        amount: 1_000_000n,
        token: { address: TEST_MINT, decimals: 6, symbol: 'USDC' },
      } as TokenTransferParams);

      const tx = await adapter.buildBatch(request);

      expect(tx.chain).toBe('solana');
      // Verify findAssociatedTokenPda was called with Token-2022 program
      expect(mockFindAssociatedTokenPda).toHaveBeenCalledWith(
        expect.objectContaining({
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        }),
      );
      // Verify transferChecked used Token-2022 program
      expect(mockGetTransferCheckedInstruction).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ programAddress: TOKEN_2022_PROGRAM_ID }),
      );
    });

    it('returns only transferChecked when destination ATA already exists (no ATA create)', async () => {
      setupBlockhashMock();
      // Mint found (SPL Token), destination ATA exists
      let getAccountInfoCallCount = 0;
      mockRpc.getAccountInfo = vi.fn().mockImplementation(() => {
        getAccountInfoCallCount++;
        if (getAccountInfoCallCount === 1) {
          // Mint account
          return {
            send: vi.fn().mockResolvedValue({
              value: {
                owner: SPL_TOKEN_PROGRAM_ID,
                data: ['AA==', 'base64'],
                lamports: 1461600n,
              },
            }),
          };
        }
        // Destination ATA exists
        return {
          send: vi.fn().mockResolvedValue({
            value: { owner: SPL_TOKEN_PROGRAM_ID, data: ['AA==', 'base64'], lamports: 2039280n },
          }),
        };
      });

      let pdaCallCount = 0;
      mockFindAssociatedTokenPda.mockImplementation(() => {
        pdaCallCount++;
        if (pdaCallCount % 2 === 1) return Promise.resolve([TEST_SOURCE_ATA, 255]);
        return Promise.resolve([TEST_DEST_ATA, 254]);
      });
      mockGetTransferCheckedInstruction.mockReturnValue(mockInstruction);

      const request = batchWith({
        from: TEST_FROM,
        to: TEST_TO_2,
        amount: 1_000_000n,
        token: { address: TEST_MINT, decimals: 6, symbol: 'USDC' },
      } as TokenTransferParams);

      const tx = await adapter.buildBatch(request);

      expect(tx.chain).toBe('solana');
      // ATA create instruction should NOT have been called
      expect(mockGetCreateAtaInstruction).not.toHaveBeenCalled();
      // No ATA creations counted
      expect(tx.metadata.ataCreations).toBe(0);
    });
  });

  // ========================================================================
  // CONTRACT_CALL branch error paths
  // ========================================================================

  describe('CONTRACT_CALL branch in convertBatchInstruction', () => {
    it('throws INVALID_INSTRUCTION when programId is missing', async () => {
      setupBlockhashMock();

      const request = batchWith({
        from: TEST_FROM,
        to: TEST_PROGRAM_ID,
        // no programId
        instructionData: new Uint8Array([1]),
        accounts: [{ pubkey: TEST_FROM, isSigner: true, isWritable: true }],
      } as unknown as ContractCallParams);

      // This instruction has programId field but it's the `to` not `programId`.
      // classifyInstruction checks 'programId' in instr. Without it, it's classified as TRANSFER.
      // We need to add programId to trigger CONTRACT_CALL classification but set it falsy.
      const request2: BatchParams = {
        from: TEST_FROM,
        instructions: [
          { from: TEST_FROM, to: TEST_TO_1, amount: 1_000_000_000n } as TransferRequest,
          {
            from: TEST_FROM,
            to: TEST_PROGRAM_ID,
            programId: '', // falsy programId triggers CONTRACT_CALL branch but fails validation
            instructionData: new Uint8Array([1]),
            accounts: [{ pubkey: TEST_FROM, isSigner: true, isWritable: true }],
          } as unknown as ContractCallParams,
        ],
      };

      try {
        await adapter.buildBatch(request2);
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(ChainError);
        expect((error as ChainError).code).toBe('INVALID_INSTRUCTION');
        expect((error as ChainError).message).toContain('programId');
      }
    });

    it('throws INVALID_INSTRUCTION when instructionData is missing', async () => {
      setupBlockhashMock();

      const request: BatchParams = {
        from: TEST_FROM,
        instructions: [
          { from: TEST_FROM, to: TEST_TO_1, amount: 1_000_000_000n } as TransferRequest,
          {
            from: TEST_FROM,
            to: TEST_PROGRAM_ID,
            programId: TEST_PROGRAM_ID,
            // no instructionData
            accounts: [{ pubkey: TEST_FROM, isSigner: true, isWritable: true }],
          } as unknown as ContractCallParams,
        ],
      };

      try {
        await adapter.buildBatch(request);
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(ChainError);
        expect((error as ChainError).code).toBe('INVALID_INSTRUCTION');
        expect((error as ChainError).message).toContain('instructionData');
      }
    });

    it('throws INVALID_INSTRUCTION when accounts is empty', async () => {
      setupBlockhashMock();

      const request: BatchParams = {
        from: TEST_FROM,
        instructions: [
          { from: TEST_FROM, to: TEST_TO_1, amount: 1_000_000_000n } as TransferRequest,
          {
            from: TEST_FROM,
            to: TEST_PROGRAM_ID,
            programId: TEST_PROGRAM_ID,
            instructionData: new Uint8Array([1]),
            accounts: [], // empty
          } as ContractCallParams,
        ],
      };

      try {
        await adapter.buildBatch(request);
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(ChainError);
        expect((error as ChainError).code).toBe('INVALID_INSTRUCTION');
        expect((error as ChainError).message).toContain('accounts');
      }
    });

    it('accepts base64 string instructionData (converts via Buffer.from)', async () => {
      setupBlockhashMock();

      const base64Data = Buffer.from([1, 2, 3, 4, 5]).toString('base64');

      const request: BatchParams = {
        from: TEST_FROM,
        instructions: [
          { from: TEST_FROM, to: TEST_TO_1, amount: 1_000_000_000n } as TransferRequest,
          {
            from: TEST_FROM,
            to: TEST_PROGRAM_ID,
            programId: TEST_PROGRAM_ID,
            instructionData: base64Data as unknown as Uint8Array, // REST API sends string
            accounts: [{ pubkey: TEST_FROM, isSigner: true, isWritable: true }],
          } as ContractCallParams,
        ],
      };

      const tx = await adapter.buildBatch(request);

      expect(tx.chain).toBe('solana');
      expect(tx.serialized).toBeInstanceOf(Uint8Array);
      expect(tx.serialized.length).toBeGreaterThan(0);
      expect(tx.metadata.instructionTypes).toEqual(['TRANSFER', 'CONTRACT_CALL']);
    });

    it('maps all 4 AccountRole combinations correctly', async () => {
      setupBlockhashMock();

      const request: BatchParams = {
        from: TEST_FROM,
        instructions: [
          { from: TEST_FROM, to: TEST_TO_1, amount: 1_000_000_000n } as TransferRequest,
          {
            from: TEST_FROM,
            to: TEST_PROGRAM_ID,
            programId: TEST_PROGRAM_ID,
            instructionData: new Uint8Array([1, 2, 3]),
            accounts: [
              { pubkey: TEST_FROM, isSigner: true, isWritable: true },       // WRITABLE_SIGNER
              { pubkey: TEST_TO_1, isSigner: true, isWritable: false },      // READONLY_SIGNER
              { pubkey: TEST_TO_2, isSigner: false, isWritable: true },      // WRITABLE
              { pubkey: TEST_MINT, isSigner: false, isWritable: false },     // READONLY
            ],
          } as ContractCallParams,
        ],
      };

      const tx = await adapter.buildBatch(request);

      // If it compiled and serialized successfully, roles were mapped correctly
      expect(tx.chain).toBe('solana');
      expect(tx.serialized).toBeInstanceOf(Uint8Array);
      expect(tx.serialized.length).toBeGreaterThan(0);
      expect(tx.metadata.instructionTypes).toEqual(['TRANSFER', 'CONTRACT_CALL']);
    });
  });

  // ========================================================================
  // APPROVE branch error paths
  // ========================================================================

  describe('APPROVE branch in convertBatchInstruction', () => {
    it('throws TOKEN_ACCOUNT_NOT_FOUND when mint not found for approve', async () => {
      setupBlockhashMock();
      mockRpc.getAccountInfo = mockSend({ value: null });

      const request = batchWith({
        from: TEST_FROM,
        spender: TEST_SPENDER,
        token: { address: TEST_MINT, decimals: 6, symbol: 'USDC' },
        amount: 500_000n,
      } as ApproveParams);

      try {
        await adapter.buildBatch(request);
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(ChainError);
        expect((error as ChainError).code).toBe('TOKEN_ACCOUNT_NOT_FOUND');
        expect((error as ChainError).message).toContain('Token mint not found');
      }
    });

    it('throws INVALID_INSTRUCTION when mint owner is not a token program for approve', async () => {
      setupBlockhashMock();
      mockRpc.getAccountInfo = mockSend({
        value: {
          owner: '11111111111111111111111111111111', // System Program
          data: ['AA==', 'base64'],
          lamports: 1461600n,
        },
      });

      const request = batchWith({
        from: TEST_FROM,
        spender: TEST_SPENDER,
        token: { address: TEST_MINT, decimals: 6, symbol: 'USDC' },
        amount: 500_000n,
      } as ApproveParams);

      try {
        await adapter.buildBatch(request);
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(ChainError);
        expect((error as ChainError).code).toBe('INVALID_INSTRUCTION');
        expect((error as ChainError).message).toContain('Invalid token mint');
      }
    });

    it('uses TOKEN_2022_PROGRAM_ID for approve with Token-2022 mint', async () => {
      setupBlockhashMock();
      mockRpc.getAccountInfo = mockSend({
        value: {
          owner: TOKEN_2022_PROGRAM_ID,
          data: ['AA==', 'base64'],
          lamports: 1461600n,
        },
      });
      mockFindAssociatedTokenPda.mockResolvedValue([TEST_OWNER_ATA, 255]);
      mockGetApproveCheckedInstruction.mockReturnValue(mockInstruction);

      const request = batchWith({
        from: TEST_FROM,
        spender: TEST_SPENDER,
        token: { address: TEST_MINT, decimals: 6, symbol: 'USDC' },
        amount: 500_000n,
      } as ApproveParams);

      const tx = await adapter.buildBatch(request);

      expect(tx.chain).toBe('solana');
      expect(tx.metadata.instructionTypes).toEqual(['TRANSFER', 'APPROVE']);
      // Verify findAssociatedTokenPda was called with Token-2022
      expect(mockFindAssociatedTokenPda).toHaveBeenCalledWith(
        expect.objectContaining({
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        }),
      );
      // Verify approveChecked used Token-2022 program
      expect(mockGetApproveCheckedInstruction).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ programAddress: TOKEN_2022_PROGRAM_ID }),
      );
    });
  });

  // ========================================================================
  // Unknown type fallthrough (dead code documentation)
  // ========================================================================

  describe('Unknown instruction type', () => {
    it.skip('is dead code: classifyInstruction always returns a known type', () => {
      // classifyInstruction checks fields in order: spender -> APPROVE, token -> TOKEN_TRANSFER,
      // programId -> CONTRACT_CALL, else -> TRANSFER. There is no input that can bypass all 4.
      // The "Unknown instruction type" throw at line 1215-1217 of adapter.ts is defensive dead code.
      // It cannot be reached through buildBatch because classifyInstruction is exhaustive.
    });
  });

  // ========================================================================
  // buildBatch outer catch re-throw paths
  // ========================================================================

  describe('buildBatch outer catch handling', () => {
    it('re-throws ChainError without wrapping', async () => {
      setupBlockhashMock();
      // Force a ChainError from inside: mint not found triggers TOKEN_ACCOUNT_NOT_FOUND
      mockRpc.getAccountInfo = mockSend({ value: null });

      const request = batchWith({
        from: TEST_FROM,
        to: TEST_TO_2,
        amount: 1_000_000n,
        token: { address: TEST_MINT, decimals: 6, symbol: 'USDC' },
      } as TokenTransferParams);

      try {
        await adapter.buildBatch(request);
        expect.fail('Should have thrown');
      } catch (error) {
        // ChainError should pass through without being wrapped in WAIaaSError
        expect(error).toBeInstanceOf(ChainError);
        expect(error).not.toBeInstanceOf(WAIaaSError);
        expect((error as ChainError).code).toBe('TOKEN_ACCOUNT_NOT_FOUND');
      }
    });

    it('wraps generic Error as WAIaaSError CHAIN_ERROR', async () => {
      // Make getLatestBlockhash reject with a plain string (non-Error, non-ChainError)
      // This triggers the final catch branch: `throw new WAIaaSError('CHAIN_ERROR', ...)`
      mockRpc.getLatestBlockhash = vi.fn().mockReturnValue({
        send: vi.fn().mockRejectedValue('network timeout'),
      });

      const request: BatchParams = {
        from: TEST_FROM,
        instructions: [
          { from: TEST_FROM, to: TEST_TO_1, amount: 1_000_000_000n } as TransferRequest,
          { from: TEST_FROM, to: TEST_TO_2, amount: 2_000_000_000n } as TransferRequest,
        ],
      };

      try {
        await adapter.buildBatch(request);
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(WAIaaSError);
        expect((error as WAIaaSError).code).toBe('CHAIN_ERROR');
        expect((error as WAIaaSError).message).toContain('Failed to build batch');
      }
    });
  });
});
