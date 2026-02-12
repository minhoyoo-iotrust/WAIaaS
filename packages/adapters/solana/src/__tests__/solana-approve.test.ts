/**
 * SolanaAdapter buildApprove tests.
 *
 * Tests cover:
 * - buildApprove: SPL ApproveChecked with delegate + amount + decimals
 * - Token-2022 detection via mint account owner
 * - Metadata includes tokenAddress, spender, approveAmount
 * - Error: TOKEN_ACCOUNT_NOT_FOUND for non-existent mint
 * - Revoke (amount=0n) builds valid transaction
 *
 * Mock strategy: vi.mock('@solana/kit') with vi.hoisted() for mock RPC.
 * Also mocks '@solana-program/token' for findAssociatedTokenPda and getApproveCheckedInstruction.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ChainError } from '@waiaas/core';
import type { ApproveParams } from '@waiaas/core';

// ---- Hoisted mock setup (vi.hoisted runs before vi.mock) ----

const { mockRpc, mockFindAssociatedTokenPda, mockGetApproveCheckedInstruction } = vi.hoisted(() => {
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
  const mockGetApproveCheckedInstruction = vi.fn();

  return {
    mockRpc,
    mockFindAssociatedTokenPda,
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
    getCreateAssociatedTokenIdempotentInstruction: vi.fn(),
    getTransferCheckedInstruction: vi.fn(),
    getApproveCheckedInstruction: mockGetApproveCheckedInstruction,
  };
});

// Import adapter after mock
import { SolanaAdapter } from '../adapter.js';

// ---- Helpers ----

const TEST_RPC_URL = 'https://api.devnet.solana.com';
const SPL_TOKEN_PROGRAM_ID = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
const TOKEN_2022_PROGRAM_ID = 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb';
const DEFAULT_SOL_TRANSFER_FEE = 5000n;

const TEST_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const TEST_FROM = '11111111111111111111111111111112';
const TEST_SPENDER = 'Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr';
const TEST_OWNER_ATA = 'OwnerATA111111111111111111111111111111111111';

/** Create a chainable RPC method mock: method().send() -> resolves(value) */
function mockSend<T>(value: T) {
  return vi.fn().mockReturnValue({ send: vi.fn().mockResolvedValue(value) });
}

/** Mock instruction object (just needs to be truthy for pipe pattern) */
const mockInstruction = {
  programAddress: SPL_TOKEN_PROGRAM_ID,
  accounts: [],
  data: new Uint8Array([13]), // ApproveChecked discriminator = 13
};

function setupApproveMocks(opts: {
  mintOwner?: string;
  mintNotFound?: boolean;
  token2022?: boolean;
}) {
  const mintOwner = opts.mintOwner ?? (opts.token2022 ? TOKEN_2022_PROGRAM_ID : SPL_TOKEN_PROGRAM_ID);

  // Mock getAccountInfo -- mint account query
  if (opts.mintNotFound) {
    mockRpc.getAccountInfo = mockSend({ value: null });
  } else {
    mockRpc.getAccountInfo = mockSend({
      value: {
        owner: mintOwner,
        data: ['AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABQ==', 'base64'],
        lamports: 1461600n,
      },
    });
  }

  // Mock findAssociatedTokenPda -- owner's ATA
  mockFindAssociatedTokenPda.mockResolvedValue([TEST_OWNER_ATA, 255]);

  // Mock getLatestBlockhash
  mockRpc.getLatestBlockhash = mockSend({
    value: {
      blockhash: '4EPD2GJZkETChiMBc7G3yqga8TaczFNKSRJBuAGDNBRk',
      lastValidBlockHeight: 200n,
    },
  });

  // Mock getApproveCheckedInstruction to return simple instruction object
  mockGetApproveCheckedInstruction.mockReturnValue(mockInstruction);
}

// ---- Tests ----

describe('SolanaAdapter - buildApprove', () => {
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

  it('builds tx with delegate + amount + decimals (SPL Token Program)', async () => {
    setupApproveMocks({});

    const request: ApproveParams = {
      from: TEST_FROM,
      spender: TEST_SPENDER,
      token: { address: TEST_MINT, decimals: 6, symbol: 'USDC' },
      amount: 1_000_000n,
    };

    const tx = await adapter.buildApprove(request);

    expect(tx.chain).toBe('solana');
    expect(tx.serialized).toBeInstanceOf(Uint8Array);
    expect(tx.serialized.length).toBeGreaterThan(0);
    expect(tx.estimatedFee).toBe(DEFAULT_SOL_TRANSFER_FEE);
    expect(tx.metadata.tokenProgram).toBe(SPL_TOKEN_PROGRAM_ID);

    // Verify getApproveCheckedInstruction was called with correct params
    expect(mockGetApproveCheckedInstruction).toHaveBeenCalledWith(
      expect.objectContaining({
        source: TEST_OWNER_ATA,
        amount: 1_000_000n,
        decimals: 6,
      }),
      expect.objectContaining({ programAddress: SPL_TOKEN_PROGRAM_ID }),
    );
  });

  it('detects Token-2022 program from mint owner', async () => {
    setupApproveMocks({ token2022: true });

    const request: ApproveParams = {
      from: TEST_FROM,
      spender: TEST_SPENDER,
      token: { address: TEST_MINT, decimals: 9, symbol: 'T22' },
      amount: 500_000n,
    };

    const tx = await adapter.buildApprove(request);

    expect(tx.metadata.tokenProgram).toBe(TOKEN_2022_PROGRAM_ID);
    expect(mockGetApproveCheckedInstruction).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 500_000n, decimals: 9 }),
      expect.objectContaining({ programAddress: TOKEN_2022_PROGRAM_ID }),
    );
  });

  it('includes correct metadata (tokenAddress, spender, approveAmount)', async () => {
    setupApproveMocks({});

    const request: ApproveParams = {
      from: TEST_FROM,
      spender: TEST_SPENDER,
      token: { address: TEST_MINT, decimals: 6, symbol: 'USDC' },
      amount: 2_000_000n,
    };

    const tx = await adapter.buildApprove(request);

    expect(tx.metadata.tokenAddress).toBe(TEST_MINT);
    expect(tx.metadata.spender).toBe(TEST_SPENDER);
    expect(tx.metadata.approveAmount).toBe(2_000_000n);
    expect(tx.metadata.blockhash).toBe('4EPD2GJZkETChiMBc7G3yqga8TaczFNKSRJBuAGDNBRk');
    expect(tx.metadata.lastValidBlockHeight).toBe(200);
    expect(tx.metadata.version).toBe(0);
    expect(tx.expiresAt).toBeInstanceOf(Date);
    expect(tx.expiresAt!.getTime()).toBeGreaterThan(Date.now());
  });

  it('throws TOKEN_ACCOUNT_NOT_FOUND for non-existent mint', async () => {
    setupApproveMocks({ mintNotFound: true });

    const request: ApproveParams = {
      from: TEST_FROM,
      spender: TEST_SPENDER,
      token: { address: TEST_MINT, decimals: 6, symbol: 'USDC' },
      amount: 1_000_000n,
    };

    try {
      await adapter.buildApprove(request);
      expect.fail('Should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(ChainError);
      expect((error as ChainError).code).toBe('TOKEN_ACCOUNT_NOT_FOUND');
    }
  });

  it('builds valid transaction with amount=0n (revoke)', async () => {
    setupApproveMocks({});

    const request: ApproveParams = {
      from: TEST_FROM,
      spender: TEST_SPENDER,
      token: { address: TEST_MINT, decimals: 6, symbol: 'USDC' },
      amount: 0n,
    };

    const tx = await adapter.buildApprove(request);

    expect(tx.chain).toBe('solana');
    expect(tx.serialized).toBeInstanceOf(Uint8Array);
    expect(tx.serialized.length).toBeGreaterThan(0);
    expect(tx.metadata.approveAmount).toBe(0n);

    expect(mockGetApproveCheckedInstruction).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 0n }),
      expect.anything(),
    );
  });
});
