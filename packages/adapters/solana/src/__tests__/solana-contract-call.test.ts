/**
 * SolanaAdapter contract call tests.
 *
 * Tests cover:
 * - buildContractCall: programId + accounts + instructionData, AccountRole mapping, error cases
 *
 * Mock strategy: vi.mock('@solana/kit') with vi.hoisted() for mock RPC.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ChainError } from '@waiaas/core';
import type { ContractCallParams } from '@waiaas/core';

// ---- Hoisted mock setup (vi.hoisted runs before vi.mock) ----

const { mockRpc } = vi.hoisted(() => {
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

  return { mockRpc };
});

// Mock @solana/kit module
vi.mock('@solana/kit', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@solana/kit')>();
  return {
    ...actual,
    createSolanaRpc: vi.fn().mockReturnValue(mockRpc),
  };
});

// Mock @solana-program/token module (required by adapter imports)
vi.mock('@solana-program/token', () => {
  return {
    TOKEN_PROGRAM_ADDRESS: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
    ASSOCIATED_TOKEN_PROGRAM_ADDRESS: 'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL',
    findAssociatedTokenPda: vi.fn(),
    getCreateAssociatedTokenIdempotentInstruction: vi.fn(),
    getTransferCheckedInstruction: vi.fn(),
  };
});

// Import adapter after mock
import { SolanaAdapter } from '../adapter.js';

// ---- Helpers ----

const TEST_RPC_URL = 'https://api.devnet.solana.com';
const TEST_FROM = '11111111111111111111111111111112';
const TEST_PROGRAM_ID = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';

/** Create a chainable RPC method mock: method().send() -> resolves(value) */
function mockSend<T>(value: T) {
  return vi.fn().mockReturnValue({ send: vi.fn().mockResolvedValue(value) });
}

function setupBlockhashMock() {
  mockRpc.getLatestBlockhash = mockSend({
    value: {
      blockhash: '4EPD2GJZkETChiMBc7G3yqga8TaczFNKSRJBuAGDNBRk',
      lastValidBlockHeight: 200n,
    },
  });
}

// ---- Tests ----

describe('SolanaAdapter - Contract Call', () => {
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

  describe('buildContractCall', () => {
    it('builds tx with programId + accounts + instructionData', async () => {
      setupBlockhashMock();

      const instructionData = new Uint8Array([1, 2, 3, 4, 5]);
      const request: ContractCallParams = {
        from: TEST_FROM,
        to: TEST_PROGRAM_ID, // contract address (same as programId for Solana)
        programId: TEST_PROGRAM_ID,
        instructionData,
        accounts: [
          { pubkey: TEST_FROM, isSigner: true, isWritable: true },
          { pubkey: 'Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr', isSigner: false, isWritable: true },
        ],
      };

      const tx = await adapter.buildContractCall(request);

      expect(tx.chain).toBe('solana');
      expect(tx.serialized).toBeInstanceOf(Uint8Array);
      expect(tx.serialized.length).toBeGreaterThan(0);
      expect(tx.estimatedFee).toBe(5000n); // DEFAULT_SOL_TRANSFER_FEE
      expect(tx.metadata.programId).toBe(TEST_PROGRAM_ID);
      expect(tx.metadata.blockhash).toBe('4EPD2GJZkETChiMBc7G3yqga8TaczFNKSRJBuAGDNBRk');
      expect(tx.metadata.lastValidBlockHeight).toBe(200);
      expect(tx.metadata.version).toBe(0);
      expect(tx.expiresAt).toBeInstanceOf(Date);
    });

    it('throws INVALID_INSTRUCTION when programId is missing', async () => {
      try {
        await adapter.buildContractCall({
          from: TEST_FROM,
          to: TEST_PROGRAM_ID,
          // no programId
          instructionData: new Uint8Array([1]),
          accounts: [{ pubkey: TEST_FROM, isSigner: true, isWritable: true }],
        });
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(ChainError);
        expect((error as ChainError).code).toBe('INVALID_INSTRUCTION');
        expect((error as ChainError).message).toContain('programId');
      }
    });

    it('throws INVALID_INSTRUCTION when instructionData is missing', async () => {
      try {
        await adapter.buildContractCall({
          from: TEST_FROM,
          to: TEST_PROGRAM_ID,
          programId: TEST_PROGRAM_ID,
          // no instructionData
          accounts: [{ pubkey: TEST_FROM, isSigner: true, isWritable: true }],
        });
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(ChainError);
        expect((error as ChainError).code).toBe('INVALID_INSTRUCTION');
        expect((error as ChainError).message).toContain('instructionData');
      }
    });

    it('throws INVALID_INSTRUCTION when accounts is empty', async () => {
      try {
        await adapter.buildContractCall({
          from: TEST_FROM,
          to: TEST_PROGRAM_ID,
          programId: TEST_PROGRAM_ID,
          instructionData: new Uint8Array([1]),
          accounts: [], // empty
        });
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(ChainError);
        expect((error as ChainError).code).toBe('INVALID_INSTRUCTION');
        expect((error as ChainError).message).toContain('accounts');
      }
    });

    it('handles base64 string instructionData from REST API', async () => {
      setupBlockhashMock();

      // base64 encoding of [1, 2, 3, 4, 5]
      const base64Data = Buffer.from([1, 2, 3, 4, 5]).toString('base64');
      const request: ContractCallParams = {
        from: TEST_FROM,
        to: TEST_PROGRAM_ID,
        programId: TEST_PROGRAM_ID,
        instructionData: base64Data as unknown as Uint8Array, // REST API sends string
        accounts: [
          { pubkey: TEST_FROM, isSigner: true, isWritable: true },
        ],
      };

      const tx = await adapter.buildContractCall(request);

      expect(tx.chain).toBe('solana');
      expect(tx.serialized).toBeInstanceOf(Uint8Array);
      expect(tx.serialized.length).toBeGreaterThan(0);
    });

    it('maps all four AccountRole combinations correctly', async () => {
      setupBlockhashMock();

      // Test all 4 role combinations
      const request: ContractCallParams = {
        from: TEST_FROM,
        to: TEST_PROGRAM_ID,
        programId: TEST_PROGRAM_ID,
        instructionData: new Uint8Array([1]),
        accounts: [
          { pubkey: TEST_FROM, isSigner: true, isWritable: true },                       // WRITABLE_SIGNER
          { pubkey: 'Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr', isSigner: true, isWritable: false },  // READONLY_SIGNER
          { pubkey: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', isSigner: false, isWritable: true },   // WRITABLE
          { pubkey: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB', isSigner: false, isWritable: false },   // READONLY
        ],
      };

      const tx = await adapter.buildContractCall(request);

      // If it compiled and serialized successfully, roles were mapped correctly
      // (incorrect role mapping would cause compileTransaction to fail)
      expect(tx.chain).toBe('solana');
      expect(tx.serialized.length).toBeGreaterThan(0);
    });
  });
});
