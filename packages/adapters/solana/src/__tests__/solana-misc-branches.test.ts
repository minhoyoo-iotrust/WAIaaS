/**
 * Miscellaneous branch-coverage tests for adapter.ts.
 *
 * Targets specific uncovered branches:
 * - getAssets sort comparator: equal-balance edge case (return 0)
 * - getAssets WAIaaSError re-throw path
 * - estimateFee ChainError token paths: mint not found, ChainError/WAIaaSError re-throw
 * - Error instanceof branches in catch blocks: non-Error throws
 * - signTransaction 32-byte key path
 * - getTokenInfo raw data handling: short array, short buffer
 *
 * Mock strategy: vi.hoisted + vi.mock for @solana/kit and @solana-program/token.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { WAIaaSError, ChainError } from '@waiaas/core';
import type { TransferRequest, TokenTransferParams, UnsignedTransaction } from '@waiaas/core';

// ---- Hoisted mock setup ----

const { mockRpc, mockFindAssociatedTokenPda } = vi.hoisted(() => {
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
  return { mockRpc, mockFindAssociatedTokenPda };
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
    getCreateAssociatedTokenIdempotentInstruction: vi.fn().mockReturnValue({
      programAddress: 'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL',
      accounts: [],
      data: new Uint8Array([1]),
    }),
    getTransferCheckedInstruction: vi.fn().mockReturnValue({
      programAddress: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
      accounts: [],
      data: new Uint8Array([12]),
    }),
    getApproveCheckedInstruction: vi.fn().mockReturnValue({
      programAddress: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
      accounts: [],
      data: new Uint8Array([13]),
    }),
  };
});

// Import after mocks
import { SolanaAdapter } from '../adapter.js';

// ---- Helpers ----

const TEST_RPC_URL = 'https://api.devnet.solana.com';
const SPL_TOKEN_PROGRAM_ID = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
const TEST_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const TEST_FROM = '11111111111111111111111111111112';
const TEST_TO = 'Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr';

/** Create a chainable RPC method mock: method().send() -> resolves(value) */
function mockSend<T>(value: T) {
  return vi.fn().mockReturnValue({ send: vi.fn().mockResolvedValue(value) });
}

// ---- Test fixtures ----

let adapter: SolanaAdapter;
let testFromAddress: string;
let testPrivateKey64: Uint8Array;
let testPrivateKey32: Uint8Array;
let testUnsignedTx: UnsignedTransaction;

async function generateTestFixtures() {
  const {
    createKeyPairFromBytes,
    getAddressFromPublicKey,
    getTransactionEncoder,
    compileTransaction,
    createTransactionMessage,
    setTransactionMessageFeePayer,
    appendTransactionMessageInstruction,
    setTransactionMessageLifetimeUsingBlockhash,
    pipe,
    createNoopSigner,
    blockhash,
    address,
  } = await import('@solana/kit');
  const { getTransferSolInstruction } = await import('@solana-program/system');
  const { webcrypto } = await import('node:crypto');

  // Generate real Ed25519 key pairs
  const kp1 = (await webcrypto.subtle.generateKey('Ed25519', true, ['sign', 'verify'])) as {
    privateKey: CryptoKey;
    publicKey: CryptoKey;
  };
  const kp2 = (await webcrypto.subtle.generateKey('Ed25519', true, ['sign', 'verify'])) as {
    privateKey: CryptoKey;
    publicKey: CryptoKey;
  };

  const pkcs8_1 = new Uint8Array(await webcrypto.subtle.exportKey('pkcs8', kp1.privateKey));
  const rawPriv1 = pkcs8_1.slice(-32);
  const rawPub1 = new Uint8Array(await webcrypto.subtle.exportKey('raw', kp1.publicKey));

  const pkcs8_2 = new Uint8Array(await webcrypto.subtle.exportKey('pkcs8', kp2.privateKey));
  const rawPriv2 = pkcs8_2.slice(-32);
  const rawPub2 = new Uint8Array(await webcrypto.subtle.exportKey('raw', kp2.publicKey));

  testPrivateKey64 = new Uint8Array(64);
  testPrivateKey64.set(rawPriv1, 0);
  testPrivateKey64.set(rawPub1, 32);

  // 32-byte key (seed only, no public key appended)
  testPrivateKey32 = rawPriv1.slice();

  const solKp1 = await createKeyPairFromBytes(testPrivateKey64);
  testFromAddress = await getAddressFromPublicKey(solKp1.publicKey);

  const combined2 = new Uint8Array(64);
  combined2.set(rawPriv2, 0);
  combined2.set(rawPub2, 32);
  const solKp2 = await createKeyPairFromBytes(combined2);
  const testToAddress = await getAddressFromPublicKey(solKp2.publicKey);

  // Build unsigned transaction
  const from = address(testFromAddress);
  const to = address(testToAddress);
  const fromSigner = createNoopSigner(from);

  const txMessage = pipe(
    createTransactionMessage({ version: 0 }),
    (tx) => setTransactionMessageFeePayer(from, tx),
    (tx) =>
      appendTransactionMessageInstruction(
        getTransferSolInstruction({ source: fromSigner, destination: to, amount: 1_000_000n }),
        tx,
      ),
    (tx) =>
      setTransactionMessageLifetimeUsingBlockhash(
        {
          blockhash: blockhash('4EPD2GJZkETChiMBc7G3yqga8TaczFNKSRJBuAGDNBRk'),
          lastValidBlockHeight: 200n,
        },
        tx,
      ),
  );

  const compiled = compileTransaction(txMessage);
  const encoder = getTransactionEncoder();
  const serialized = new Uint8Array(encoder.encode(compiled));

  testUnsignedTx = {
    chain: 'solana',
    serialized,
    estimatedFee: 5000n,
    expiresAt: new Date(Date.now() + 60_000),
    metadata: {
      blockhash: '4EPD2GJZkETChiMBc7G3yqga8TaczFNKSRJBuAGDNBRk',
      lastValidBlockHeight: 200,
      version: 0,
    },
  };
}

// ---- Tests ----

describe('SolanaAdapter misc branch coverage', () => {
  beforeEach(async () => {
    adapter = new SolanaAdapter('devnet');
    vi.clearAllMocks();
    await generateTestFixtures();
  });

  afterEach(async () => {
    if (adapter.isConnected()) {
      await adapter.disconnect();
    }
  });

  // -- getAssets sort comparator: equal balance returns 0 --

  describe('getAssets sort comparator', () => {
    it('two non-native tokens with equal balance both appear in result', async () => {
      await adapter.connect(TEST_RPC_URL);
      mockRpc.getBalance = mockSend({ value: 1_000_000_000n });

      // Two SPL tokens with exactly the same balance
      mockRpc.getTokenAccountsByOwner = vi.fn()
        .mockReturnValueOnce({
          send: vi.fn().mockResolvedValue({
            value: [
              {
                account: {
                  data: {
                    parsed: {
                      info: {
                        mint: 'TokenA111111111111111111111111111111111111111',
                        tokenAmount: { amount: '500000', decimals: 6, uiAmountString: '0.5' },
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
                        mint: 'TokenB111111111111111111111111111111111111111',
                        tokenAmount: { amount: '500000', decimals: 6, uiAmountString: '0.5' },
                      },
                      type: 'account',
                    },
                  },
                },
              },
            ],
          }),
        })
        .mockReturnValueOnce({ send: vi.fn().mockResolvedValue({ value: [] }) }); // Token-2022: empty

      const assets = await adapter.getAssets(testFromAddress);
      expect(assets).toHaveLength(3); // native + 2 tokens
      expect(assets[0]!.isNative).toBe(true);

      // Both tokens must be present (order may vary for equal balances)
      const tokenMints = assets.slice(1).map((a) => a.mint).sort();
      expect(tokenMints).toContain('TokenA111111111111111111111111111111111111111');
      expect(tokenMints).toContain('TokenB111111111111111111111111111111111111111');

      // Both have equal balance
      expect(assets[1]!.balance).toBe(500000n);
      expect(assets[2]!.balance).toBe(500000n);
    });
  });

  // -- getAssets WAIaaSError re-throw --

  describe('getAssets WAIaaSError re-throw', () => {
    it('re-throws WAIaaSError without wrapping', async () => {
      await adapter.connect(TEST_RPC_URL);

      const originalError = new WAIaaSError('ADAPTER_NOT_AVAILABLE', {
        message: 'test error',
      });
      mockRpc.getBalance = vi.fn().mockReturnValue({
        send: vi.fn().mockRejectedValue(originalError),
      });

      try {
        await adapter.getAssets(testFromAddress);
        expect.fail('should have thrown');
      } catch (error) {
        expect(error).toBe(originalError); // exact same instance
        expect(error).toBeInstanceOf(WAIaaSError);
        expect((error as WAIaaSError).code).toBe('ADAPTER_NOT_AVAILABLE');
      }
    });
  });

  // -- estimateFee token error paths --

  describe('estimateFee error paths', () => {
    it('throws ChainError TOKEN_ACCOUNT_NOT_FOUND for missing mint', async () => {
      await adapter.connect(TEST_RPC_URL);

      // Mint account not found
      mockRpc.getAccountInfo = vi.fn().mockReturnValue({
        send: vi.fn().mockResolvedValue({ value: null }),
      });

      const tokenRequest: TokenTransferParams = {
        from: TEST_FROM,
        to: TEST_TO,
        amount: 100_000n,
        token: { address: TEST_MINT, decimals: 6, symbol: 'USDC' },
      };

      try {
        await adapter.estimateFee(tokenRequest);
        expect.fail('should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(ChainError);
        expect((error as ChainError).code).toBe('TOKEN_ACCOUNT_NOT_FOUND');
      }
    });

    it('re-throws WAIaaSError without wrapping in estimateFee', async () => {
      await adapter.connect(TEST_RPC_URL);

      // Make getAccountInfo throw WAIaaSError
      const originalError = new WAIaaSError('CHAIN_ERROR', {
        message: 'upstream WAIaaSError',
      });
      mockRpc.getAccountInfo = vi.fn().mockReturnValue({
        send: vi.fn().mockRejectedValue(originalError),
      });

      const tokenRequest: TokenTransferParams = {
        from: TEST_FROM,
        to: TEST_TO,
        amount: 100_000n,
        token: { address: TEST_MINT, decimals: 6, symbol: 'USDC' },
      };

      try {
        await adapter.estimateFee(tokenRequest);
        expect.fail('should have thrown');
      } catch (error) {
        expect(error).toBe(originalError); // exact same instance, not wrapped
        expect(error).toBeInstanceOf(WAIaaSError);
      }
    });

    it('re-throws ChainError without wrapping in estimateFee', async () => {
      await adapter.connect(TEST_RPC_URL);

      // The TOKEN_ACCOUNT_NOT_FOUND ChainError thrown when mint not found
      // is caught by the outer catch and re-thrown via `if (error instanceof ChainError) throw error`
      // The mint-not-found test above already exercises this, but let's verify with explicit ChainError
      const chainErr = new ChainError('INVALID_INSTRUCTION', 'solana', {
        message: 'deliberate chain error',
      });
      mockRpc.getAccountInfo = vi.fn().mockReturnValue({
        send: vi.fn().mockRejectedValue(chainErr),
      });

      const tokenRequest: TokenTransferParams = {
        from: TEST_FROM,
        to: TEST_TO,
        amount: 100_000n,
        token: { address: TEST_MINT, decimals: 6, symbol: 'USDC' },
      };

      try {
        await adapter.estimateFee(tokenRequest);
        expect.fail('should have thrown');
      } catch (error) {
        expect(error).toBe(chainErr); // exact same instance
        expect(error).toBeInstanceOf(ChainError);
      }
    });
  });

  // -- Error instanceof branches: non-Error throws --

  describe('Error instanceof branches (non-Error throws)', () => {
    it('getBalance with string thrown wraps in WAIaaSError', async () => {
      await adapter.connect(TEST_RPC_URL);
      mockRpc.getBalance = vi.fn().mockReturnValue({
        send: vi.fn().mockRejectedValue('rpc-down'),
      });

      try {
        await adapter.getBalance(testFromAddress);
        expect.fail('should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(WAIaaSError);
        expect((error as WAIaaSError).code).toBe('CHAIN_ERROR');
        expect((error as WAIaaSError).message).toContain('rpc-down');
        // cause should be undefined since the thrown value is not an Error
        expect((error as WAIaaSError).cause).toBeUndefined();
      }
    });

    it('buildTransaction with non-Error thrown wraps in WAIaaSError', async () => {
      await adapter.connect(TEST_RPC_URL);
      mockRpc.getLatestBlockhash = vi.fn().mockReturnValue({
        send: vi.fn().mockRejectedValue(42),
      });

      const request: TransferRequest = {
        from: testFromAddress,
        to: TEST_TO,
        amount: 1_000_000n,
      };

      try {
        await adapter.buildTransaction(request);
        expect.fail('should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(WAIaaSError);
        expect((error as WAIaaSError).code).toBe('CHAIN_ERROR');
        expect((error as WAIaaSError).message).toContain('42');
      }
    });

    it('simulateTransaction with non-Error thrown wraps in WAIaaSError', async () => {
      await adapter.connect(TEST_RPC_URL);
      mockRpc.simulateTransaction = vi.fn().mockReturnValue({
        send: vi.fn().mockRejectedValue(null),
      });

      try {
        await adapter.simulateTransaction(testUnsignedTx);
        expect.fail('should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(WAIaaSError);
        expect((error as WAIaaSError).code).toBe('CHAIN_ERROR');
        expect((error as WAIaaSError).message).toContain('null');
      }
    });

    it('submitTransaction with non-Error thrown wraps in WAIaaSError', async () => {
      await adapter.connect(TEST_RPC_URL);

      // Sign the tx first to get valid signed bytes
      const signedBytes = await adapter.signTransaction(testUnsignedTx, testPrivateKey64);

      mockRpc.sendTransaction = vi.fn().mockReturnValue({
        send: vi.fn().mockRejectedValue(undefined),
      });

      try {
        await adapter.submitTransaction(signedBytes);
        expect.fail('should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(WAIaaSError);
        expect((error as WAIaaSError).code).toBe('CHAIN_ERROR');
        expect((error as WAIaaSError).message).toContain('undefined');
      }
    });
  });

  // -- signTransaction 32-byte key --

  describe('signTransaction 32-byte key', () => {
    it('signs successfully with 32-byte private key (seed only)', async () => {
      await adapter.connect(TEST_RPC_URL);

      const signedBytes = await adapter.signTransaction(testUnsignedTx, testPrivateKey32);
      expect(signedBytes).toBeInstanceOf(Uint8Array);
      expect(signedBytes.length).toBeGreaterThan(0);
      // Should be same length as original (signature replaces null slot)
      expect(signedBytes.length).toBe(testUnsignedTx.serialized.length);

      // Signed should differ from unsigned
      let differs = false;
      for (let i = 0; i < signedBytes.length; i++) {
        if (signedBytes[i] !== testUnsignedTx.serialized[i]) {
          differs = true;
          break;
        }
      }
      expect(differs).toBe(true);
    });
  });

  // -- getTokenInfo raw data handling --

  describe('getTokenInfo raw data handling', () => {
    it('returns decimals=0 when raw data is not an array', async () => {
      await adapter.connect(TEST_RPC_URL);

      mockRpc.getAccountInfo = vi.fn().mockReturnValue({
        send: vi.fn().mockResolvedValue({
          value: {
            owner: SPL_TOKEN_PROGRAM_ID,
            data: 'not-an-array', // not Array.isArray
          },
        }),
      });

      const tokenInfo = await adapter.getTokenInfo(TEST_MINT);
      expect(tokenInfo.decimals).toBe(0);
      expect(tokenInfo.address).toBe(TEST_MINT);
      expect(tokenInfo.programId).toBe(SPL_TOKEN_PROGRAM_ID);
    });

    it('returns decimals=0 when raw data array has length < 2', async () => {
      await adapter.connect(TEST_RPC_URL);

      mockRpc.getAccountInfo = vi.fn().mockReturnValue({
        send: vi.fn().mockResolvedValue({
          value: {
            owner: SPL_TOKEN_PROGRAM_ID,
            data: ['only-one-element'], // length 1, < 2
          },
        }),
      });

      const tokenInfo = await adapter.getTokenInfo(TEST_MINT);
      expect(tokenInfo.decimals).toBe(0);
    });

    it('returns decimals=0 when decoded buffer is shorter than 45 bytes', async () => {
      await adapter.connect(TEST_RPC_URL);

      // Create a base64-encoded buffer shorter than 45 bytes
      const shortBuffer = Buffer.from(new Uint8Array(30));
      const shortBase64 = shortBuffer.toString('base64');

      mockRpc.getAccountInfo = vi.fn().mockReturnValue({
        send: vi.fn().mockResolvedValue({
          value: {
            owner: SPL_TOKEN_PROGRAM_ID,
            data: [shortBase64, 'base64'],
          },
        }),
      });

      const tokenInfo = await adapter.getTokenInfo(TEST_MINT);
      expect(tokenInfo.decimals).toBe(0);
    });

    it('returns correct decimals when decoded buffer has >= 45 bytes', async () => {
      await adapter.connect(TEST_RPC_URL);

      // Create a proper mint buffer with decimals=6 at offset 44
      const mintBuffer = Buffer.alloc(82, 0); // standard SPL Mint layout size
      mintBuffer[44] = 6; // decimals at offset 44
      const mintBase64 = mintBuffer.toString('base64');

      mockRpc.getAccountInfo = vi.fn().mockReturnValue({
        send: vi.fn().mockResolvedValue({
          value: {
            owner: SPL_TOKEN_PROGRAM_ID,
            data: [mintBase64, 'base64'],
          },
        }),
      });

      const tokenInfo = await adapter.getTokenInfo(TEST_MINT);
      expect(tokenInfo.decimals).toBe(6);
    });
  });
});
