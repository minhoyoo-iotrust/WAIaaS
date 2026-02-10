/**
 * SolanaAdapter unit tests with mock RPC.
 *
 * Tests cover all 10 IChainAdapter methods:
 * - Connection management: connect, disconnect, isConnected, getHealth (4 tests)
 * - Balance query: getBalance (2 tests)
 * - Build transaction: buildTransaction (2 tests)
 * - Simulate: simulateTransaction (2 tests)
 * - Sign: signTransaction (1 test)
 * - Submit + confirm: submitTransaction, waitForConfirmation (3 tests)
 * - Error handling: not-connected guard, RPC error wrapping (3 tests)
 *
 * Mock strategy: vi.mock('@solana/kit') with vi.hoisted() for the mock RPC object.
 * No real network calls are made.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { WAIaaSError } from '@waiaas/core';
import type { TransferRequest, UnsignedTransaction } from '@waiaas/core';

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
  };
  return { mockRpc };
});

// Mock @solana/kit module -- createSolanaRpc returns the controllable mock
vi.mock('@solana/kit', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@solana/kit')>();
  return {
    ...actual,
    createSolanaRpc: vi.fn().mockReturnValue(mockRpc),
  };
});

// Import adapter after mock
import { SolanaAdapter } from '../adapter.js';

// ---- Helpers ----

/** Create a chainable RPC method mock: method().send() -> resolves(value) */
function mockSend<T>(value: T) {
  return vi.fn().mockReturnValue({ send: vi.fn().mockResolvedValue(value) });
}

/** Create a chainable RPC method mock that rejects */
function mockSendReject(error: Error) {
  return vi.fn().mockReturnValue({ send: vi.fn().mockRejectedValue(error) });
}

// ---- Test fixtures ----

const TEST_RPC_URL = 'https://api.devnet.solana.com';

let testFromAddress: string;
let testToAddress: string;
let testPrivateKey64: Uint8Array;
let testUnsignedTx: UnsignedTransaction;

/**
 * Generate real Ed25519 key pairs and a pre-built unsigned transaction.
 * Called once before all tests.
 */
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

  // Generate real Ed25519 extractable key pairs via Web Crypto
  // Note: Node.js does not support 'raw' export for Ed25519 private keys.
  // Use PKCS8 and extract the 32-byte seed from the last 32 bytes.
  const kp1 = (await webcrypto.subtle.generateKey('Ed25519', true, ['sign', 'verify'])) as {
    privateKey: CryptoKey;
    publicKey: CryptoKey;
  };
  const kp2 = (await webcrypto.subtle.generateKey('Ed25519', true, ['sign', 'verify'])) as {
    privateKey: CryptoKey;
    publicKey: CryptoKey;
  };

  const pkcs8_1 = new Uint8Array(await webcrypto.subtle.exportKey('pkcs8', kp1.privateKey));
  const rawPriv1 = pkcs8_1.slice(-32); // Ed25519 PKCS8: 16-byte header + 32-byte seed
  const rawPub1 = new Uint8Array(await webcrypto.subtle.exportKey('raw', kp1.publicKey));

  const pkcs8_2 = new Uint8Array(await webcrypto.subtle.exportKey('pkcs8', kp2.privateKey));
  const rawPriv2 = pkcs8_2.slice(-32);
  const rawPub2 = new Uint8Array(await webcrypto.subtle.exportKey('raw', kp2.publicKey));

  // 64-byte combined key (secret seed + public) -- matches keystore format
  testPrivateKey64 = new Uint8Array(64);
  testPrivateKey64.set(rawPriv1, 0);
  testPrivateKey64.set(rawPub1, 32);

  // Derive Solana addresses
  const solKp1 = await createKeyPairFromBytes(testPrivateKey64);
  testFromAddress = await getAddressFromPublicKey(solKp1.publicKey);

  const combined2 = new Uint8Array(64);
  combined2.set(rawPriv2, 0);
  combined2.set(rawPub2, 32);
  const solKp2 = await createKeyPairFromBytes(combined2);
  testToAddress = await getAddressFromPublicKey(solKp2.publicKey);

  // Build a valid unsigned transaction for simulate/sign/submit tests
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

describe('SolanaAdapter', () => {
  let adapter: SolanaAdapter;

  beforeEach(async () => {
    adapter = new SolanaAdapter('devnet');
    vi.clearAllMocks();

    // Generate test fixtures (key pairs + unsigned tx)
    await generateTestFixtures();
  });

  afterEach(async () => {
    if (adapter.isConnected()) {
      await adapter.disconnect();
    }
  });

  // -- Connection management (4 tests) --

  describe('connection management', () => {
    it('connect() stores RPC URL and isConnected returns true', async () => {
      expect(adapter.isConnected()).toBe(false);
      await adapter.connect(TEST_RPC_URL);
      expect(adapter.isConnected()).toBe(true);
      expect(adapter.chain).toBe('solana');
      expect(adapter.network).toBe('devnet');
    });

    it('disconnect() clears state and isConnected returns false', async () => {
      await adapter.connect(TEST_RPC_URL);
      expect(adapter.isConnected()).toBe(true);
      await adapter.disconnect();
      expect(adapter.isConnected()).toBe(false);
    });

    it('getHealth() returns healthy:true with latencyMs when RPC responds', async () => {
      await adapter.connect(TEST_RPC_URL);
      mockRpc.getSlot = mockSend(123456789n);

      const health = await adapter.getHealth();
      expect(health.healthy).toBe(true);
      expect(health.latencyMs).toBeGreaterThanOrEqual(0);
      expect(health.blockHeight).toBe(123456789n);
    });

    it('getHealth() returns healthy:false when RPC throws', async () => {
      await adapter.connect(TEST_RPC_URL);
      mockRpc.getSlot = mockSendReject(new Error('RPC down'));

      const health = await adapter.getHealth();
      expect(health.healthy).toBe(false);
      expect(health.latencyMs).toBe(0);
    });
  });

  // -- Balance query (2 tests) --

  describe('balance query', () => {
    it('getBalance() returns correct lamports value from mock RPC', async () => {
      await adapter.connect(TEST_RPC_URL);
      mockRpc.getBalance = mockSend({ value: 5_000_000_000n });

      const balance = await adapter.getBalance(testFromAddress);
      expect(balance.address).toBe(testFromAddress);
      expect(balance.balance).toBe(5_000_000_000n);
      expect(balance.decimals).toBe(9);
      expect(balance.symbol).toBe('SOL');
    });

    it('getBalance() wraps RPC error in WAIaaSError CHAIN_ERROR', async () => {
      await adapter.connect(TEST_RPC_URL);
      mockRpc.getBalance = mockSendReject(new Error('Invalid address'));

      await expect(adapter.getBalance(testFromAddress)).rejects.toThrow(WAIaaSError);
      try {
        await adapter.getBalance(testFromAddress);
      } catch (error) {
        expect(error).toBeInstanceOf(WAIaaSError);
        expect((error as WAIaaSError).code).toBe('CHAIN_ERROR');
      }
    });
  });

  // -- Build transaction (2 tests) --

  describe('build transaction', () => {
    it('buildTransaction() returns UnsignedTransaction with serialized bytes', async () => {
      await adapter.connect(TEST_RPC_URL);
      mockRpc.getLatestBlockhash = mockSend({
        value: {
          blockhash: '4EPD2GJZkETChiMBc7G3yqga8TaczFNKSRJBuAGDNBRk',
          lastValidBlockHeight: 200n,
        },
      });

      const request: TransferRequest = {
        from: testFromAddress,
        to: testToAddress,
        amount: 1_000_000n,
      };

      const tx = await adapter.buildTransaction(request);
      expect(tx.chain).toBe('solana');
      expect(tx.serialized).toBeInstanceOf(Uint8Array);
      expect(tx.serialized.length).toBeGreaterThan(0);
      expect(tx.estimatedFee).toBe(5000n);
      expect(tx.metadata).toBeDefined();
      expect(tx.metadata.blockhash).toBe('4EPD2GJZkETChiMBc7G3yqga8TaczFNKSRJBuAGDNBRk');
    });

    it('buildTransaction() includes expiresAt and lastValidBlockHeight', async () => {
      await adapter.connect(TEST_RPC_URL);
      mockRpc.getLatestBlockhash = mockSend({
        value: {
          blockhash: '4EPD2GJZkETChiMBc7G3yqga8TaczFNKSRJBuAGDNBRk',
          lastValidBlockHeight: 300n,
        },
      });

      const request: TransferRequest = {
        from: testFromAddress,
        to: testToAddress,
        amount: 500_000n,
      };

      const tx = await adapter.buildTransaction(request);
      expect(tx.expiresAt).toBeInstanceOf(Date);
      expect(tx.expiresAt!.getTime()).toBeGreaterThan(Date.now());
      expect(tx.metadata.lastValidBlockHeight).toBe(300);
      expect(tx.metadata.version).toBe(0);
    });
  });

  // -- Simulate (2 tests) --

  describe('simulate transaction', () => {
    it('simulateTransaction() returns success:true with logs', async () => {
      await adapter.connect(TEST_RPC_URL);
      mockRpc.simulateTransaction = mockSend({
        value: {
          err: null,
          logs: [
            'Program 11111111111111111111111111111111 invoke [1]',
            'Program 11111111111111111111111111111111 success',
          ],
          unitsConsumed: 150n,
        },
      });

      const result = await adapter.simulateTransaction(testUnsignedTx);
      expect(result.success).toBe(true);
      expect(result.logs).toHaveLength(2);
      expect(result.unitsConsumed).toBe(150n);
      expect(result.error).toBeUndefined();
    });

    it('simulateTransaction() returns success:false with error on sim failure', async () => {
      await adapter.connect(TEST_RPC_URL);
      mockRpc.simulateTransaction = mockSend({
        value: {
          err: { InstructionError: [0, { Custom: 1 }] },
          logs: ['Program failed'],
          unitsConsumed: 50n,
        },
      });

      const result = await adapter.simulateTransaction(testUnsignedTx);
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.logs).toHaveLength(1);
    });
  });

  // -- Sign (1 test) --

  describe('sign transaction', () => {
    it('signTransaction() returns signed bytes with 64-byte private key', async () => {
      await adapter.connect(TEST_RPC_URL);

      const signedBytes = await adapter.signTransaction(testUnsignedTx, testPrivateKey64);
      expect(signedBytes).toBeInstanceOf(Uint8Array);
      expect(signedBytes.length).toBeGreaterThan(0);

      // Signed tx should be same length as unsigned (signature replaces null slot)
      expect(signedBytes.length).toBe(testUnsignedTx.serialized.length);

      // The signed bytes should differ from unsigned (null signature replaced with real one)
      const unsigned = testUnsignedTx.serialized;
      let differs = false;
      for (let i = 0; i < signedBytes.length; i++) {
        if (signedBytes[i] !== unsigned[i]) {
          differs = true;
          break;
        }
      }
      expect(differs).toBe(true);
    });
  });

  // -- Submit + confirm (3 tests) --

  describe('submit and confirm', () => {
    it('submitTransaction() returns SubmitResult with txHash and status submitted', async () => {
      await adapter.connect(TEST_RPC_URL);

      // Sign the tx first to get valid signed bytes
      const signedBytes = await adapter.signTransaction(testUnsignedTx, testPrivateKey64);

      const fakeTxHash =
        '5VERv8NMvzbJMEkV8xnrLkEaWRtSz9CosKDYjCJjBRnbJLgp8uirBgmQpjKhoR4tjF3ZpRzrFmBV6UjKdiSZkQU';
      mockRpc.sendTransaction = mockSend(fakeTxHash);

      const result = await adapter.submitTransaction(signedBytes);
      expect(result.txHash).toBe(fakeTxHash);
      expect(result.status).toBe('submitted');
    });

    it('waitForConfirmation() resolves to confirmed when RPC returns confirmed status', async () => {
      await adapter.connect(TEST_RPC_URL);

      const txHash =
        '5VERv8NMvzbJMEkV8xnrLkEaWRtSz9CosKDYjCJjBRnbJLgp8uirBgmQpjKhoR4tjF3ZpRzrFmBV6UjKdiSZkQU';
      mockRpc.getSignatureStatuses = mockSend({
        value: [
          {
            confirmationStatus: 'confirmed',
            confirmations: 5,
            slot: 123456789n,
            err: null,
          },
        ],
      });

      const result = await adapter.waitForConfirmation(txHash);
      expect(result.txHash).toBe(txHash);
      expect(result.status).toBe('confirmed');
      expect(result.confirmations).toBe(5);
      expect(result.blockNumber).toBe(123456789n);
    });

    it('waitForConfirmation() handles timeout gracefully', async () => {
      await adapter.connect(TEST_RPC_URL);

      const txHash =
        '5VERv8NMvzbJMEkV8xnrLkEaWRtSz9CosKDYjCJjBRnbJLgp8uirBgmQpjKhoR4tjF3ZpRzrFmBV6UjKdiSZkQU';
      // Return null status (not confirmed yet)
      mockRpc.getSignatureStatuses = mockSend({ value: [null] });

      // Use very short timeout for test speed
      const result = await adapter.waitForConfirmation(txHash, 100);
      expect(result.txHash).toBe(txHash);
      expect(result.status).toBe('submitted');
    });
  });

  // -- getAssets (6 tests) --

  describe('getAssets', () => {
    it('returns native SOL only when no SPL token accounts exist', async () => {
      await adapter.connect(TEST_RPC_URL);
      mockRpc.getBalance = mockSend({ value: 1_000_000_000n });
      mockRpc.getTokenAccountsByOwner = mockSend({ value: [] });

      const assets = await adapter.getAssets(testFromAddress);
      expect(assets).toHaveLength(1);
      expect(assets[0]).toEqual({
        mint: 'native',
        symbol: 'SOL',
        name: 'Solana',
        balance: 1_000_000_000n,
        decimals: 9,
        isNative: true,
      });
    });

    it('returns native SOL + SPL tokens when token accounts exist', async () => {
      await adapter.connect(TEST_RPC_URL);
      mockRpc.getBalance = mockSend({ value: 1_000_000_000n });
      mockRpc.getTokenAccountsByOwner = mockSend({
        value: [
          {
            account: {
              data: {
                parsed: {
                  info: {
                    mint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
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
                    mint: 'So11111111111111111111111111111111111111112',
                    tokenAmount: { amount: '200000000', decimals: 9, uiAmountString: '0.2' },
                  },
                  type: 'account',
                },
              },
            },
          },
        ],
      });

      const assets = await adapter.getAssets(testFromAddress);
      expect(assets).toHaveLength(3);
      // First entry is always native SOL
      expect(assets[0].mint).toBe('native');
      expect(assets[0].isNative).toBe(true);
      expect(assets[0].balance).toBe(1_000_000_000n);
      // Second entry is USDC-like token
      expect(assets[1].mint).toBe('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
      expect(assets[1].balance).toBe(500000n);
      expect(assets[1].decimals).toBe(6);
      expect(assets[1].isNative).toBe(false);
      // Third entry
      expect(assets[2].mint).toBe('So11111111111111111111111111111111111111112');
      expect(assets[2].balance).toBe(200000000n);
      expect(assets[2].decimals).toBe(9);
    });

    it('returns native SOL with 0 balance when account is empty', async () => {
      await adapter.connect(TEST_RPC_URL);
      mockRpc.getBalance = mockSend({ value: 0n });
      mockRpc.getTokenAccountsByOwner = mockSend({ value: [] });

      const assets = await adapter.getAssets(testFromAddress);
      expect(assets).toHaveLength(1);
      expect(assets[0]).toEqual({
        mint: 'native',
        symbol: 'SOL',
        name: 'Solana',
        balance: 0n,
        decimals: 9,
        isNative: true,
      });
    });

    it('filters out zero-balance SPL token accounts', async () => {
      await adapter.connect(TEST_RPC_URL);
      mockRpc.getBalance = mockSend({ value: 1_000_000_000n });
      mockRpc.getTokenAccountsByOwner = mockSend({
        value: [
          {
            account: {
              data: {
                parsed: {
                  info: {
                    mint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
                    tokenAmount: { amount: '100000', decimals: 6, uiAmountString: '0.1' },
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
                    mint: 'ZeroTokenMintAddress11111111111111111111111',
                    tokenAmount: { amount: '0', decimals: 9, uiAmountString: '0' },
                  },
                  type: 'account',
                },
              },
            },
          },
        ],
      });

      const assets = await adapter.getAssets(testFromAddress);
      // Should be 2: native SOL + non-zero USDC, zero-balance token filtered out
      expect(assets).toHaveLength(2);
      expect(assets[0].mint).toBe('native');
      expect(assets[1].mint).toBe('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
    });

    it('throws WAIaaSError CHAIN_ERROR when RPC fails', async () => {
      await adapter.connect(TEST_RPC_URL);
      mockRpc.getBalance = mockSendReject(new Error('RPC timeout'));

      await expect(adapter.getAssets(testFromAddress)).rejects.toThrow(WAIaaSError);
      try {
        await adapter.getAssets(testFromAddress);
      } catch (error) {
        expect(error).toBeInstanceOf(WAIaaSError);
        expect((error as WAIaaSError).code).toBe('CHAIN_ERROR');
      }
    });

    it('throws WAIaaSError ADAPTER_NOT_AVAILABLE when not connected', async () => {
      // adapter not connected
      expect(adapter.isConnected()).toBe(false);

      await expect(adapter.getAssets(testFromAddress)).rejects.toThrow(WAIaaSError);
      try {
        await adapter.getAssets(testFromAddress);
      } catch (error) {
        expect(error).toBeInstanceOf(WAIaaSError);
        expect((error as WAIaaSError).code).toBe('ADAPTER_NOT_AVAILABLE');
      }
    });
  });

  // -- Error handling (3 tests) --

  describe('error handling', () => {
    it('all methods throw WAIaaSError ADAPTER_NOT_AVAILABLE when not connected', async () => {
      // Adapter not connected
      expect(adapter.isConnected()).toBe(false);

      await expect(adapter.getHealth()).rejects.toThrow(WAIaaSError);
      await expect(adapter.getBalance(testFromAddress)).rejects.toThrow(WAIaaSError);
      await expect(
        adapter.buildTransaction({ from: testFromAddress, to: testToAddress, amount: 1000n }),
      ).rejects.toThrow(WAIaaSError);
      await expect(adapter.simulateTransaction(testUnsignedTx)).rejects.toThrow(WAIaaSError);
      await expect(adapter.signTransaction(testUnsignedTx, testPrivateKey64)).rejects.toThrow(
        WAIaaSError,
      );
      await expect(adapter.submitTransaction(new Uint8Array(100))).rejects.toThrow(WAIaaSError);
      await expect(adapter.waitForConfirmation('test')).rejects.toThrow(WAIaaSError);

      // Verify error code
      try {
        await adapter.getBalance(testFromAddress);
      } catch (error) {
        expect(error).toBeInstanceOf(WAIaaSError);
        expect((error as WAIaaSError).code).toBe('ADAPTER_NOT_AVAILABLE');
      }
    });

    it('RPC network errors are wrapped in CHAIN_ERROR', async () => {
      await adapter.connect(TEST_RPC_URL);
      mockRpc.getBalance = mockSendReject(new Error('Network timeout'));

      try {
        await adapter.getBalance(testFromAddress);
      } catch (error) {
        expect(error).toBeInstanceOf(WAIaaSError);
        expect((error as WAIaaSError).code).toBe('CHAIN_ERROR');
        expect((error as WAIaaSError).message).toContain('Network timeout');
      }
    });

    it('waitForConfirmation() throws CHAIN_ERROR on RPC failure during polling', async () => {
      await adapter.connect(TEST_RPC_URL);
      mockRpc.getSignatureStatuses = mockSendReject(new Error('RPC connection lost'));

      const txHash = 'test-hash';
      await expect(adapter.waitForConfirmation(txHash, 5000)).rejects.toThrow(WAIaaSError);

      try {
        await adapter.waitForConfirmation(txHash, 5000);
      } catch (error) {
        expect(error).toBeInstanceOf(WAIaaSError);
        expect((error as WAIaaSError).code).toBe('CHAIN_ERROR');
        expect((error as WAIaaSError).message).toContain('RPC connection lost');
      }
    });
  });
});
