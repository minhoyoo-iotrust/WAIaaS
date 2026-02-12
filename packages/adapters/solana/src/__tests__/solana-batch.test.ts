/**
 * SolanaAdapter buildBatch tests.
 *
 * Tests cover:
 * - Basic TRANSFER batch (2 SOL transfers)
 * - Mixed instruction batch (TRANSFER + TOKEN_TRANSFER)
 * - TOKEN_TRANSFER with ATA creation (auto-insert createAssociatedTokenIdempotent)
 * - CONTRACT_CALL instruction mapping
 * - APPROVE instruction in batch
 * - Instruction count validation (<2, >20)
 * - Fee estimation (base fee + ATA creation costs)
 * - Metadata includes batch details (instructionCount, instructionTypes, ataCreations)
 *
 * Mock strategy: vi.mock('@solana/kit') with vi.hoisted() for mock RPC.
 * Also mocks '@solana-program/token' for findAssociatedTokenPda and instruction builders.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ChainError } from '@waiaas/core';
import type { BatchParams, TransferRequest, TokenTransferParams, ContractCallParams, ApproveParams } from '@waiaas/core';

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
const DEFAULT_SOL_TRANSFER_FEE = 5000n;
const ATA_RENT_LAMPORTS = 2_039_280n;

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

/** Mock instruction object (just needs to be truthy for pipe pattern) */
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

function setupMintAccountMock(opts: { destAtaExists?: boolean } = {}) {
  let callCount = 0;
  mockRpc.getAccountInfo = vi.fn().mockImplementation(() => {
    callCount++;
    if (callCount === 1) {
      // First call: mint account query
      return {
        send: vi.fn().mockResolvedValue({
          value: {
            owner: SPL_TOKEN_PROGRAM_ID,
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
          value: { owner: SPL_TOKEN_PROGRAM_ID, data: ['AA==', 'base64'], lamports: 2039280n },
        }),
      };
    }
    return { send: vi.fn().mockResolvedValue({ value: null }) };
  });
}

function setupTokenMocks(opts: { destAtaExists?: boolean } = {}) {
  setupMintAccountMock(opts);

  let pdaCallCount = 0;
  mockFindAssociatedTokenPda.mockImplementation(() => {
    pdaCallCount++;
    if (pdaCallCount % 2 === 1) return Promise.resolve([TEST_SOURCE_ATA, 255]);
    return Promise.resolve([TEST_DEST_ATA, 254]);
  });

  mockGetCreateAtaInstruction.mockReturnValue(mockInstruction);
  mockGetTransferCheckedInstruction.mockReturnValue(mockInstruction);
  mockGetApproveCheckedInstruction.mockReturnValue(mockInstruction);
}

// ---- Tests ----

describe('SolanaAdapter - buildBatch', () => {
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

  it('builds single Solana tx from 2 TRANSFER instructions', async () => {
    setupBlockhashMock();

    const request: BatchParams = {
      from: TEST_FROM,
      instructions: [
        { from: TEST_FROM, to: TEST_TO_1, amount: 1_000_000_000n } as TransferRequest,
        { from: TEST_FROM, to: TEST_TO_2, amount: 2_000_000_000n } as TransferRequest,
      ],
    };

    const tx = await adapter.buildBatch(request);

    expect(tx.chain).toBe('solana');
    expect(tx.serialized).toBeInstanceOf(Uint8Array);
    expect(tx.serialized.length).toBeGreaterThan(0);
    expect(tx.estimatedFee).toBe(DEFAULT_SOL_TRANSFER_FEE);
    expect(tx.metadata.instructionCount).toBe(2);
    expect(tx.metadata.instructionTypes).toEqual(['TRANSFER', 'TRANSFER']);
    expect(tx.metadata.ataCreations).toBe(0);
    expect(tx.metadata.blockhash).toBe('4EPD2GJZkETChiMBc7G3yqga8TaczFNKSRJBuAGDNBRk');
    expect(tx.expiresAt).toBeInstanceOf(Date);
  });

  it('builds single Solana tx from mixed TRANSFER + TOKEN_TRANSFER', async () => {
    setupBlockhashMock();
    setupTokenMocks({ destAtaExists: true });

    const request: BatchParams = {
      from: TEST_FROM,
      instructions: [
        { from: TEST_FROM, to: TEST_TO_1, amount: 1_000_000_000n } as TransferRequest,
        {
          from: TEST_FROM,
          to: TEST_TO_2,
          amount: 1_000_000n,
          token: { address: TEST_MINT, decimals: 6, symbol: 'USDC' },
        } as TokenTransferParams,
      ],
    };

    const tx = await adapter.buildBatch(request);

    expect(tx.chain).toBe('solana');
    expect(tx.serialized).toBeInstanceOf(Uint8Array);
    expect(tx.serialized.length).toBeGreaterThan(0);
    expect(tx.metadata.instructionCount).toBe(2);
    expect(tx.metadata.instructionTypes).toEqual(['TRANSFER', 'TOKEN_TRANSFER']);
  });

  it('auto-creates ATA instruction when TOKEN_TRANSFER destination ATA does not exist', async () => {
    setupBlockhashMock();
    setupTokenMocks({ destAtaExists: false });

    const request: BatchParams = {
      from: TEST_FROM,
      instructions: [
        { from: TEST_FROM, to: TEST_TO_1, amount: 1_000_000_000n } as TransferRequest,
        {
          from: TEST_FROM,
          to: TEST_TO_2,
          amount: 1_000_000n,
          token: { address: TEST_MINT, decimals: 6, symbol: 'USDC' },
        } as TokenTransferParams,
      ],
    };

    const tx = await adapter.buildBatch(request);

    expect(tx.metadata.ataCreations).toBe(1);
    expect(tx.estimatedFee).toBe(DEFAULT_SOL_TRANSFER_FEE + ATA_RENT_LAMPORTS);
    expect(mockGetCreateAtaInstruction).toHaveBeenCalled();
  });

  it('handles CONTRACT_CALL instruction in batch', async () => {
    setupBlockhashMock();

    const instructionData = new Uint8Array([1, 2, 3, 4, 5]);
    const request: BatchParams = {
      from: TEST_FROM,
      instructions: [
        { from: TEST_FROM, to: TEST_TO_1, amount: 1_000_000_000n } as TransferRequest,
        {
          from: TEST_FROM,
          to: TEST_PROGRAM_ID,
          programId: TEST_PROGRAM_ID,
          instructionData,
          accounts: [
            { pubkey: TEST_FROM, isSigner: true, isWritable: true },
            { pubkey: TEST_TO_1, isSigner: false, isWritable: true },
          ],
        } as ContractCallParams,
      ],
    };

    const tx = await adapter.buildBatch(request);

    expect(tx.chain).toBe('solana');
    expect(tx.serialized).toBeInstanceOf(Uint8Array);
    expect(tx.metadata.instructionCount).toBe(2);
    expect(tx.metadata.instructionTypes).toEqual(['TRANSFER', 'CONTRACT_CALL']);
  });

  it('handles APPROVE instruction in batch', async () => {
    setupBlockhashMock();
    // Need mint account and ATA mocks for approve
    mockRpc.getAccountInfo = mockSend({
      value: {
        owner: SPL_TOKEN_PROGRAM_ID,
        data: ['AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABQ==', 'base64'],
        lamports: 1461600n,
      },
    });
    mockFindAssociatedTokenPda.mockResolvedValue([TEST_OWNER_ATA, 255]);
    mockGetApproveCheckedInstruction.mockReturnValue(mockInstruction);

    const request: BatchParams = {
      from: TEST_FROM,
      instructions: [
        { from: TEST_FROM, to: TEST_TO_1, amount: 1_000_000_000n } as TransferRequest,
        {
          from: TEST_FROM,
          spender: TEST_SPENDER,
          token: { address: TEST_MINT, decimals: 6, symbol: 'USDC' },
          amount: 500_000n,
        } as ApproveParams,
      ],
    };

    const tx = await adapter.buildBatch(request);

    expect(tx.chain).toBe('solana');
    expect(tx.serialized).toBeInstanceOf(Uint8Array);
    expect(tx.metadata.instructionCount).toBe(2);
    expect(tx.metadata.instructionTypes).toEqual(['TRANSFER', 'APPROVE']);
    expect(mockGetApproveCheckedInstruction).toHaveBeenCalled();
  });

  it('rejects batch with fewer than 2 instructions', async () => {
    setupBlockhashMock();

    const request: BatchParams = {
      from: TEST_FROM,
      instructions: [
        { from: TEST_FROM, to: TEST_TO_1, amount: 1_000_000_000n } as TransferRequest,
      ],
    };

    try {
      await adapter.buildBatch(request);
      expect.fail('Should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(ChainError);
      expect((error as ChainError).code).toBe('BATCH_SIZE_EXCEEDED');
      expect((error as ChainError).message).toContain('at least 2');
    }
  });

  it('rejects batch with more than 20 instructions', async () => {
    setupBlockhashMock();

    // Create 21 transfer instructions
    const instructions: TransferRequest[] = Array.from({ length: 21 }, (_, i) => ({
      from: TEST_FROM,
      to: TEST_TO_1,
      amount: BigInt(i + 1) * 1_000_000n,
    }));

    const request: BatchParams = {
      from: TEST_FROM,
      instructions,
    };

    try {
      await adapter.buildBatch(request);
      expect.fail('Should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(ChainError);
      expect((error as ChainError).code).toBe('BATCH_SIZE_EXCEEDED');
      expect((error as ChainError).message).toContain('maximum 20');
    }
  });

  it('estimates fee accounting for ATA creation costs', async () => {
    setupBlockhashMock();
    // Setup so TOKEN_TRANSFER needs ATA creation
    setupTokenMocks({ destAtaExists: false });

    const request: BatchParams = {
      from: TEST_FROM,
      instructions: [
        { from: TEST_FROM, to: TEST_TO_1, amount: 1_000_000_000n } as TransferRequest,
        {
          from: TEST_FROM,
          to: TEST_TO_2,
          amount: 1_000_000n,
          token: { address: TEST_MINT, decimals: 6, symbol: 'USDC' },
        } as TokenTransferParams,
      ],
    };

    const tx = await adapter.buildBatch(request);

    // base fee + 1 ATA creation
    expect(tx.estimatedFee).toBe(DEFAULT_SOL_TRANSFER_FEE + ATA_RENT_LAMPORTS);
  });

  it('includes instructionCount, instructionTypes and ataCreations in metadata', async () => {
    setupBlockhashMock();
    setupTokenMocks({ destAtaExists: true });

    const request: BatchParams = {
      from: TEST_FROM,
      instructions: [
        { from: TEST_FROM, to: TEST_TO_1, amount: 500_000_000n } as TransferRequest,
        {
          from: TEST_FROM,
          to: TEST_TO_2,
          amount: 1_000_000n,
          token: { address: TEST_MINT, decimals: 6, symbol: 'USDC' },
        } as TokenTransferParams,
      ],
    };

    const tx = await adapter.buildBatch(request);

    expect(tx.metadata.instructionCount).toBe(2);
    expect(tx.metadata.instructionTypes).toEqual(['TRANSFER', 'TOKEN_TRANSFER']);
    expect(tx.metadata.ataCreations).toBe(0);
    expect(tx.metadata.version).toBe(0);
    expect(tx.metadata.lastValidBlockHeight).toBe(200);
  });
});
