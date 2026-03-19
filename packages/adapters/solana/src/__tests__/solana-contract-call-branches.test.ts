/**
 * SolanaAdapter buildContractCall branch-coverage tests.
 *
 * Targets SPECIFIC uncovered branches in buildContractCall():
 * - preInstructions: non-empty array appended before main instruction (lines 748-755)
 * - postInstructions: non-empty array appended after main instruction (lines 764-772)
 * - addressLookupTableAddresses: ALT compression path (lines 811-820)
 *
 * Also covers module-level helper:
 * - isRetryableRpcError: ECONNREFUSED / ETIMEDOUT / fetch failed paths (lines 1639-1641)
 *   tested indirectly via withRpcRetry by triggering a retryable network error.
 *
 * Mock strategy: vi.hoisted + vi.mock for @solana/kit (same pattern as other branch tests).
 * fetchAddressesForLookupTables and compressTransactionMessageUsingAddressLookupTables are
 * mocked so no real RPC calls are made for ALT resolution.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { ContractCallParams } from '@waiaas/core';

// ---- Hoisted mock setup (vi.hoisted runs before vi.mock) ----

const { mockRpc, mockFetchAddressesForLookupTables, mockCompressTransactionMessage } = vi.hoisted(() => {
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

  // fetchAddressesForLookupTables returns a Map<Address, readonly Address[]>
  // Return an empty map so compressTransactionMessageUsingAddressLookupTables is called with no substitutions.
  const mockFetchAddressesForLookupTables = vi.fn().mockResolvedValue(new Map());

  // compressTransactionMessageUsingAddressLookupTables is synchronous and should return
  // a transaction message. We pass through the first argument unchanged.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mockCompressTransactionMessage = vi.fn().mockImplementation((txMsg: any) => txMsg);

  return { mockRpc, mockFetchAddressesForLookupTables, mockCompressTransactionMessage };
});

// Mock @solana/kit — spread actual so all real helpers work; only override the ALT functions.
vi.mock('@solana/kit', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@solana/kit')>();
  return {
    ...actual,
    createSolanaRpc: vi.fn().mockReturnValue(mockRpc),
    fetchAddressesForLookupTables: mockFetchAddressesForLookupTables,
    compressTransactionMessageUsingAddressLookupTables: mockCompressTransactionMessage,
  };
});

// Mock @solana-program/token (required by adapter imports)
vi.mock('@solana-program/token', () => ({
  TOKEN_PROGRAM_ADDRESS: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
  ASSOCIATED_TOKEN_PROGRAM_ADDRESS: 'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL',
  findAssociatedTokenPda: vi.fn(),
  getCreateAssociatedTokenIdempotentInstruction: vi.fn(),
  getTransferCheckedInstruction: vi.fn(),
}));

// Import adapter after mocks
import { SolanaAdapter } from '../adapter.js';

// ---- Constants ----

const TEST_RPC_URL = 'https://api.devnet.solana.com';
const TEST_FROM = '11111111111111111111111111111112';
const TEST_PROGRAM_ID = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
const TEST_ALT_ADDRESS = 'Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr';
const TEST_ACCOUNT_2 = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

// ---- Helpers ----

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

/** Minimal valid CONTRACT_CALL params */
function baseContractCallParams(overrides: Partial<ContractCallParams> = {}): ContractCallParams {
  return {
    from: TEST_FROM,
    to: TEST_PROGRAM_ID,
    programId: TEST_PROGRAM_ID,
    instructionData: new Uint8Array([1, 2, 3]),
    accounts: [
      { pubkey: TEST_FROM, isSigner: true, isWritable: true },
      { pubkey: TEST_ACCOUNT_2, isSigner: false, isWritable: false },
    ],
    ...overrides,
  };
}

// ---- Tests ----

describe('SolanaAdapter - buildContractCall branches', () => {
  let adapter: SolanaAdapter;

  beforeEach(async () => {
    adapter = new SolanaAdapter('solana-devnet');
    vi.clearAllMocks();
    // Re-apply default mock implementations after clearAllMocks
    mockFetchAddressesForLookupTables.mockResolvedValue(new Map());
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockCompressTransactionMessage.mockImplementation((txMsg: any) => txMsg);
    await adapter.connect(TEST_RPC_URL);
  });

  afterEach(async () => {
    if (adapter.isConnected()) {
      await adapter.disconnect();
    }
  });

  describe('preInstructions branch', () => {
    it('appends preInstructions before main instruction when provided', async () => {
      setupBlockhashMock();

      const request = baseContractCallParams({
        preInstructions: [
          {
            programId: TEST_PROGRAM_ID,
            data: new Uint8Array([0xaa, 0xbb]),
            accounts: [{ pubkey: TEST_FROM, isSigner: false, isWritable: false }],
          },
        ],
      });

      const tx = await adapter.buildContractCall(request);

      // Transaction should serialize successfully with pre-instruction included
      expect(tx.chain).toBe('solana');
      expect(tx.serialized).toBeInstanceOf(Uint8Array);
      expect(tx.serialized.length).toBeGreaterThan(0);
    });

    it('handles preInstruction with base64 data string', async () => {
      setupBlockhashMock();

      const base64Data = Buffer.from([0xde, 0xad]).toString('base64');
      const request = baseContractCallParams({
        preInstructions: [
          {
            programId: TEST_PROGRAM_ID,
            data: base64Data as unknown as Uint8Array, // REST API sends string
            accounts: [{ pubkey: TEST_FROM, isSigner: true, isWritable: true }],
          },
        ],
      });

      const tx = await adapter.buildContractCall(request);
      expect(tx.chain).toBe('solana');
      expect(tx.serialized.length).toBeGreaterThan(0);
    });
  });

  describe('postInstructions branch', () => {
    it('appends postInstructions after main instruction when provided', async () => {
      setupBlockhashMock();

      const request = baseContractCallParams({
        postInstructions: [
          {
            programId: TEST_PROGRAM_ID,
            data: new Uint8Array([0xcc, 0xdd]),
            accounts: [
              { pubkey: TEST_FROM, isSigner: false, isWritable: true },
              { pubkey: TEST_ACCOUNT_2, isSigner: false, isWritable: false },
            ],
          },
        ],
      });

      const tx = await adapter.buildContractCall(request);

      expect(tx.chain).toBe('solana');
      expect(tx.serialized).toBeInstanceOf(Uint8Array);
      expect(tx.serialized.length).toBeGreaterThan(0);
    });

    it('handles postInstruction with all four AccountRole combinations', async () => {
      setupBlockhashMock();

      const request = baseContractCallParams({
        postInstructions: [
          {
            programId: TEST_PROGRAM_ID,
            data: new Uint8Array([0x01]),
            accounts: [
              { pubkey: TEST_FROM, isSigner: true, isWritable: true },     // WRITABLE_SIGNER
              { pubkey: TEST_ACCOUNT_2, isSigner: true, isWritable: false }, // READONLY_SIGNER
              { pubkey: TEST_ALT_ADDRESS, isSigner: false, isWritable: true }, // WRITABLE
              { pubkey: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB', isSigner: false, isWritable: false }, // READONLY
            ],
          },
        ],
      });

      const tx = await adapter.buildContractCall(request);
      expect(tx.chain).toBe('solana');
      expect(tx.serialized.length).toBeGreaterThan(0);
    });

    it('handles postInstruction with base64 data string', async () => {
      setupBlockhashMock();

      const base64Data = Buffer.from([0xfe, 0xed]).toString('base64');
      const request = baseContractCallParams({
        postInstructions: [
          {
            programId: TEST_PROGRAM_ID,
            data: base64Data as unknown as Uint8Array,
            accounts: [{ pubkey: TEST_FROM, isSigner: false, isWritable: false }],
          },
        ],
      });

      const tx = await adapter.buildContractCall(request);
      expect(tx.chain).toBe('solana');
      expect(tx.serialized.length).toBeGreaterThan(0);
    });
  });

  describe('addressLookupTableAddresses branch', () => {
    it('calls fetchAddressesForLookupTables and compressTransactionMessage when ALT addresses are provided', async () => {
      setupBlockhashMock();

      const request = baseContractCallParams({
        addressLookupTableAddresses: [TEST_ALT_ADDRESS],
      });

      const tx = await adapter.buildContractCall(request);

      // Verify ALT functions were called
      expect(mockFetchAddressesForLookupTables).toHaveBeenCalledOnce();
      expect(mockCompressTransactionMessage).toHaveBeenCalledOnce();

      // Transaction should still be built successfully
      expect(tx.chain).toBe('solana');
      expect(tx.serialized).toBeInstanceOf(Uint8Array);
      expect(tx.serialized.length).toBeGreaterThan(0);
      expect(tx.metadata.programId).toBe(TEST_PROGRAM_ID);
    });

    it('calls fetchAddressesForLookupTables with multiple ALT addresses', async () => {
      setupBlockhashMock();

      const altAddress2 = 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB';
      const request = baseContractCallParams({
        addressLookupTableAddresses: [TEST_ALT_ADDRESS, altAddress2],
      });

      const tx = await adapter.buildContractCall(request);

      expect(mockFetchAddressesForLookupTables).toHaveBeenCalledOnce();
      expect(mockCompressTransactionMessage).toHaveBeenCalledOnce();
      expect(tx.chain).toBe('solana');
    });

    it('skips ALT compression when addressLookupTableAddresses is empty array', async () => {
      setupBlockhashMock();

      const request = baseContractCallParams({
        addressLookupTableAddresses: [],
      });

      await adapter.buildContractCall(request);

      // Empty array should NOT trigger ALT compression
      expect(mockFetchAddressesForLookupTables).not.toHaveBeenCalled();
      expect(mockCompressTransactionMessage).not.toHaveBeenCalled();
    });

    it('skips ALT compression when addressLookupTableAddresses is not provided', async () => {
      setupBlockhashMock();

      const request = baseContractCallParams();
      // No addressLookupTableAddresses field at all

      await adapter.buildContractCall(request);

      expect(mockFetchAddressesForLookupTables).not.toHaveBeenCalled();
      expect(mockCompressTransactionMessage).not.toHaveBeenCalled();
    });
  });

  describe('combined pre + post + ALT', () => {
    it('handles all three extensions together', async () => {
      setupBlockhashMock();

      const request = baseContractCallParams({
        preInstructions: [
          {
            programId: TEST_PROGRAM_ID,
            data: new Uint8Array([0x01]),
            accounts: [{ pubkey: TEST_FROM, isSigner: false, isWritable: false }],
          },
        ],
        postInstructions: [
          {
            programId: TEST_PROGRAM_ID,
            data: new Uint8Array([0x02]),
            accounts: [{ pubkey: TEST_FROM, isSigner: false, isWritable: false }],
          },
        ],
        addressLookupTableAddresses: [TEST_ALT_ADDRESS],
      });

      const tx = await adapter.buildContractCall(request);

      expect(mockFetchAddressesForLookupTables).toHaveBeenCalledOnce();
      expect(mockCompressTransactionMessage).toHaveBeenCalledOnce();
      expect(tx.chain).toBe('solana');
      expect(tx.serialized.length).toBeGreaterThan(0);
    });
  });

  describe('isRetryableRpcError network error paths', () => {
    it('retries on ECONNREFUSED network error then throws', async () => {
      // withRpcRetry is used internally. We trigger it by making getLatestBlockhash
      // fail with an ECONNREFUSED error — which is retryable — but always fail so
      // the retry loop exhausts and rethrows, covering the retry/sleep branch.
      // RPC_RETRY_MAX = 2, so we need 3 failures total.
      const connRefusedError = new Error('connect ECONNREFUSED 127.0.0.1:8899');
      mockRpc.getLatestBlockhash = vi.fn().mockReturnValue({
        send: vi.fn().mockRejectedValue(connRefusedError),
      });

      await expect(
        adapter.buildContractCall(baseContractCallParams()),
      ).rejects.toThrow('ECONNREFUSED');
    });

    it('retries on ETIMEDOUT network error then throws', async () => {
      const timeoutError = new Error('ETIMEDOUT connecting to RPC');
      mockRpc.getLatestBlockhash = vi.fn().mockReturnValue({
        send: vi.fn().mockRejectedValue(timeoutError),
      });

      await expect(
        adapter.buildContractCall(baseContractCallParams()),
      ).rejects.toThrow('ETIMEDOUT');
    });

    it('retries on fetch failed network error then throws', async () => {
      const fetchError = new Error('fetch failed');
      mockRpc.getLatestBlockhash = vi.fn().mockReturnValue({
        send: vi.fn().mockRejectedValue(fetchError),
      });

      await expect(
        adapter.buildContractCall(baseContractCallParams()),
      ).rejects.toThrow('fetch failed');
    });
  });
});
