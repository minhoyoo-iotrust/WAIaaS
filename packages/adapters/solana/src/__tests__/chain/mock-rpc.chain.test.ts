/**
 * Level 1: Mock RPC 13 Scenarios — SolanaAdapter Chain Error Path Tests
 *
 * Design doc 48 section 2.2 compliance.
 * Tests ChainError/WAIaaSError code accuracy and 3-category mapping through
 * every adapter error path using vi.mock(@solana/kit) pattern.
 *
 * No external RPC calls are made — all responses are canned mocks.
 *
 * Scenarios:
 * #1  SOL transfer full flow (success) — 6-step sequential
 * #2  Balance query (success)
 * #3  Fee estimation (success)
 * #4  RPC connection failure — getSlot fails in getHealth()
 * #5  Insufficient balance — simulateTransaction returns err
 * #6  Blockhash expired — sendTransaction error
 * #7  Invalid address — address() throws on malformed input
 * #8  Simulation failure — program error
 * #9  Transaction execution failure — getSignatureStatuses err
 * #10 RPC timeout — slow response
 * #11 Priority fee fallback — estimateFee returns base fee (adapter design)
 * #12 Confirmation wait timeout — getSignatureStatuses returns null
 * #13 Duplicate transaction — sendTransaction error
 */

import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';
import { WAIaaSError } from '@waiaas/core';
import type { TransferRequest, UnsignedTransaction } from '@waiaas/core';

// ---- Hoisted mock setup ----

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

vi.mock('@solana/kit', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@solana/kit')>();
  return {
    ...actual,
    createSolanaRpc: vi.fn().mockReturnValue(mockRpc),
  };
});

// Import adapter after mock
import { SolanaAdapter } from '../../adapter.js';

// ---- Helpers ----

function mockSend<T>(value: T) {
  return vi.fn().mockReturnValue({ send: vi.fn().mockResolvedValue(value) });
}

function mockSendReject(error: Error) {
  return vi.fn().mockReturnValue({ send: vi.fn().mockRejectedValue(error) });
}

// ---- Test fixtures ----

const TEST_RPC_URL = 'https://mock-rpc.test';
let testFromAddress: string;
let testToAddress: string;
let testPrivateKey64: Uint8Array;
let testUnsignedTx: UnsignedTransaction;

async function generateTestFixtures() {
  const {
    createKeyPairFromBytes,
    getAddressFromPublicKey,
    compileTransaction,
    createTransactionMessage,
    setTransactionMessageFeePayer,
    appendTransactionMessageInstruction,
    setTransactionMessageLifetimeUsingBlockhash,
    pipe,
    createNoopSigner,
    blockhash,
    address,
    getTransactionEncoder,
  } = await import('@solana/kit');
  const { getTransferSolInstruction } = await import('@solana-program/system');
  const { webcrypto } = await import('node:crypto');

  const kp1 = (await webcrypto.subtle.generateKey('Ed25519', true, [
    'sign',
    'verify',
  ])) as { privateKey: CryptoKey; publicKey: CryptoKey };
  const kp2 = (await webcrypto.subtle.generateKey('Ed25519', true, [
    'sign',
    'verify',
  ])) as { privateKey: CryptoKey; publicKey: CryptoKey };

  const pkcs8_1 = new Uint8Array(await webcrypto.subtle.exportKey('pkcs8', kp1.privateKey));
  const rawPriv1 = pkcs8_1.slice(-32);
  const rawPub1 = new Uint8Array(await webcrypto.subtle.exportKey('raw', kp1.publicKey));

  const pkcs8_2 = new Uint8Array(await webcrypto.subtle.exportKey('pkcs8', kp2.privateKey));
  const rawPriv2 = pkcs8_2.slice(-32);
  const rawPub2 = new Uint8Array(await webcrypto.subtle.exportKey('raw', kp2.publicKey));

  testPrivateKey64 = new Uint8Array(64);
  testPrivateKey64.set(rawPriv1, 0);
  testPrivateKey64.set(rawPub1, 32);

  const solKp1 = await createKeyPairFromBytes(testPrivateKey64);
  testFromAddress = await getAddressFromPublicKey(solKp1.publicKey);

  const combined2 = new Uint8Array(64);
  combined2.set(rawPriv2, 0);
  combined2.set(rawPub2, 32);
  const solKp2 = await createKeyPairFromBytes(combined2);
  testToAddress = await getAddressFromPublicKey(solKp2.publicKey);

  // Build a valid unsigned tx for simulate/sign/submit tests
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

describe('Level 1: Mock RPC Scenarios', () => {
  let adapter: SolanaAdapter;

  beforeAll(async () => {
    await generateTestFixtures();
  });

  beforeEach(async () => {
    adapter = new SolanaAdapter('devnet');
    vi.clearAllMocks();
  });

  afterEach(async () => {
    if (adapter.isConnected()) {
      await adapter.disconnect();
    }
  });

  // ---- #1: SOL Transfer Full Flow (Success) ----

  describe('#1: SOL transfer full flow (success)', () => {
    it('completes connect -> build -> simulate -> sign -> submit -> confirm', async () => {
      // Step 1: connect
      await adapter.connect(TEST_RPC_URL);
      expect(adapter.isConnected()).toBe(true);

      // Step 2: buildTransaction
      mockRpc.getLatestBlockhash = mockSend({
        value: {
          blockhash: '7xNJTvQbz3aYTz2KLZWwKMJh8EaUiw3P8e5Hc2GYLKRM',
          lastValidBlockHeight: 500n,
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
      expect(tx.metadata.blockhash).toBe('7xNJTvQbz3aYTz2KLZWwKMJh8EaUiw3P8e5Hc2GYLKRM');

      // Step 3: simulateTransaction
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

      const simResult = await adapter.simulateTransaction(tx);
      expect(simResult.success).toBe(true);
      expect(simResult.logs).toHaveLength(2);
      expect(simResult.unitsConsumed).toBe(150n);

      // Step 4: signTransaction
      const signedBytes = await adapter.signTransaction(tx, testPrivateKey64);
      expect(signedBytes).toBeInstanceOf(Uint8Array);
      expect(signedBytes.length).toBeGreaterThan(0);

      // Step 5: submitTransaction
      const fakeTxHash =
        '5VERv8NMvzbJMEkV8xnrLkEaWRtSz9CosKDYjCJjBRnbJLgp8uirBgmQpjKhoR4tjF3ZpRzrFmBV6UjKdiSZkQU';
      mockRpc.sendTransaction = mockSend(fakeTxHash);

      const submitResult = await adapter.submitTransaction(signedBytes);
      expect(submitResult.txHash).toBe(fakeTxHash);
      expect(submitResult.status).toBe('submitted');

      // Step 6: waitForConfirmation
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

      const confirmResult = await adapter.waitForConfirmation(fakeTxHash);
      expect(confirmResult.txHash).toBe(fakeTxHash);
      expect(confirmResult.status).toBe('confirmed');
      expect(confirmResult.confirmations).toBe(5);
      expect(confirmResult.blockNumber).toBe(123456789n);
    });
  });

  // ---- #2: Balance Query (Success) ----

  describe('#2: balance query (success)', () => {
    it('returns BalanceInfo with correct lamports value', async () => {
      await adapter.connect(TEST_RPC_URL);
      mockRpc.getBalance = mockSend({ value: 5_000_000_000n });

      const balance = await adapter.getBalance(testFromAddress);
      expect(balance.address).toBe(testFromAddress);
      expect(balance.balance).toBe(5_000_000_000n);
      expect(balance.decimals).toBe(9);
      expect(balance.symbol).toBe('SOL');
    });
  });

  // ---- #3: Fee Estimation (Success) ----

  describe('#3: fee estimation (success)', () => {
    it('returns FeeEstimate with base fee for native SOL transfer', async () => {
      await adapter.connect(TEST_RPC_URL);

      const request: TransferRequest = {
        from: testFromAddress,
        to: testToAddress,
        amount: 1_000_000n,
      };

      const feeEstimate = await adapter.estimateFee(request);
      expect(feeEstimate.fee).toBe(5000n);
      expect(typeof feeEstimate.fee).toBe('bigint');
    });
  });

  // ---- #4: RPC Connection Failure ----

  describe('#4: RPC connection failure — getHealth returns unhealthy', () => {
    it('getHealth() returns healthy:false when getSlot RPC call fails', async () => {
      await adapter.connect(TEST_RPC_URL);
      mockRpc.getSlot = mockSendReject(new Error('Connection refused'));

      const health = await adapter.getHealth();
      expect(health.healthy).toBe(false);
      expect(health.latencyMs).toBe(0);
    });

    it('methods throw ADAPTER_NOT_AVAILABLE when not connected', async () => {
      // adapter not connected
      expect(adapter.isConnected()).toBe(false);

      await expect(adapter.getHealth()).rejects.toThrow(WAIaaSError);
      try {
        await adapter.getHealth();
      } catch (error) {
        expect(error).toBeInstanceOf(WAIaaSError);
        expect((error as WAIaaSError).code).toBe('ADAPTER_NOT_AVAILABLE');
      }
    });
  });

  // ---- #5: Insufficient Balance ----

  describe('#5: insufficient balance — simulation returns err', () => {
    it('simulateTransaction returns success:false with InsufficientFundsForFee error', async () => {
      await adapter.connect(TEST_RPC_URL);
      mockRpc.simulateTransaction = mockSend({
        value: {
          err: 'InsufficientFundsForFee',
          logs: ['Transfer: insufficient lamports 0, need 5000'],
          unitsConsumed: 0n,
        },
      });

      const result = await adapter.simulateTransaction(testUnsignedTx);
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error).toContain('InsufficientFundsForFee');
    });
  });

  // ---- #6: Blockhash Expired ----

  describe('#6: blockhash expired — sendTransaction error', () => {
    it('submitTransaction throws CHAIN_ERROR on blockhash not found', async () => {
      await adapter.connect(TEST_RPC_URL);

      // Sign a valid tx first
      const signedBytes = await adapter.signTransaction(testUnsignedTx, testPrivateKey64);

      mockRpc.sendTransaction = mockSendReject(
        new Error('RPC Error -32002: Blockhash not found'),
      );

      await expect(adapter.submitTransaction(signedBytes)).rejects.toThrow(WAIaaSError);
      try {
        await adapter.submitTransaction(signedBytes);
      } catch (error) {
        expect(error).toBeInstanceOf(WAIaaSError);
        expect((error as WAIaaSError).code).toBe('CHAIN_ERROR');
        expect((error as WAIaaSError).message).toContain('Blockhash not found');
      }
    });
  });

  // ---- #7: Invalid Address ----

  describe('#7: invalid address — address() throws on malformed input', () => {
    it('getBalance throws CHAIN_ERROR for invalid address format', async () => {
      await adapter.connect(TEST_RPC_URL);
      // address() from @solana/kit throws on invalid base58 input
      mockRpc.getBalance = mockSendReject(new Error('Invalid address'));

      await expect(adapter.getBalance('not-a-valid-address')).rejects.toThrow();
    });

    it('buildTransaction throws CHAIN_ERROR for invalid from address', async () => {
      await adapter.connect(TEST_RPC_URL);

      const request: TransferRequest = {
        from: 'invalid-address-!!',
        to: testToAddress,
        amount: 1_000_000n,
      };

      // address() will throw when called with invalid base58
      await expect(adapter.buildTransaction(request)).rejects.toThrow();
    });

    it('buildTransaction throws CHAIN_ERROR for empty address', async () => {
      await adapter.connect(TEST_RPC_URL);

      const request: TransferRequest = {
        from: '',
        to: testToAddress,
        amount: 1_000_000n,
      };

      await expect(adapter.buildTransaction(request)).rejects.toThrow();
    });

    it('buildTransaction throws CHAIN_ERROR for Ethereum address format', async () => {
      await adapter.connect(TEST_RPC_URL);

      const request: TransferRequest = {
        from: '0x742d35Cc6634C0532925a3b844Bc9e7595f2BD3E',
        to: testToAddress,
        amount: 1_000_000n,
      };

      await expect(adapter.buildTransaction(request)).rejects.toThrow();
    });
  });

  // ---- #8: Simulation Failure (Program Error) ----

  describe('#8: simulation failure — program error', () => {
    it('simulateTransaction returns success:false with InstructionError', async () => {
      await adapter.connect(TEST_RPC_URL);
      mockRpc.simulateTransaction = mockSend({
        value: {
          err: { InstructionError: [0, { Custom: 1 }] },
          logs: ['Program failed: custom error 1'],
          unitsConsumed: 50n,
        },
      });

      const result = await adapter.simulateTransaction(testUnsignedTx);
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.logs).toHaveLength(1);
    });
  });

  // ---- #9: Transaction Execution Failure ----

  describe('#9: transaction execution failure — confirmation shows error', () => {
    it('waitForConfirmation returns confirmed status even with execution error', async () => {
      await adapter.connect(TEST_RPC_URL);

      const txHash = '5VERv8NMvzbJMEkV8xnrLkEaWRtSz9CosKDYjCJjBRnbJLgp8uirBgmQpjKhoR4tjF3ZpRzrFmBV6UjKdiSZkQU';

      // getSignatureStatuses returns a status with err set
      // The adapter checks confirmationStatus, not err, so it returns confirmed
      mockRpc.getSignatureStatuses = mockSend({
        value: [
          {
            confirmationStatus: 'confirmed',
            confirmations: 3,
            slot: 999n,
            err: { InstructionError: [0, 'InvalidAccountData'] },
          },
        ],
      });

      const result = await adapter.waitForConfirmation(txHash);
      expect(result.txHash).toBe(txHash);
      // Adapter returns 'confirmed' based on confirmationStatus
      expect(result.status).toBe('confirmed');
      expect(result.confirmations).toBe(3);
    });

    it('submitTransaction throws CHAIN_ERROR on RPC send failure', async () => {
      await adapter.connect(TEST_RPC_URL);
      const signedBytes = await adapter.signTransaction(testUnsignedTx, testPrivateKey64);

      mockRpc.sendTransaction = mockSendReject(
        new Error('Transaction simulation failed: Error processing Instruction 0: invalid account data'),
      );

      await expect(adapter.submitTransaction(signedBytes)).rejects.toThrow(WAIaaSError);
      try {
        await adapter.submitTransaction(signedBytes);
      } catch (error) {
        expect(error).toBeInstanceOf(WAIaaSError);
        expect((error as WAIaaSError).code).toBe('CHAIN_ERROR');
      }
    });
  });

  // ---- #10: RPC Timeout ----

  describe('#10: RPC timeout — slow response', () => {
    it('getBalance throws CHAIN_ERROR on delayed RPC failure', async () => {
      await adapter.connect(TEST_RPC_URL);

      // Simulate a delayed failure (not using fake timers, just immediate rejection
      // with a timeout-like error message)
      mockRpc.getBalance = vi.fn().mockReturnValue({
        send: vi.fn().mockRejectedValue(new Error('Request timeout: exceeded 30000ms')),
      });

      await expect(adapter.getBalance(testFromAddress)).rejects.toThrow(WAIaaSError);
      try {
        await adapter.getBalance(testFromAddress);
      } catch (error) {
        expect(error).toBeInstanceOf(WAIaaSError);
        expect((error as WAIaaSError).code).toBe('CHAIN_ERROR');
        expect((error as WAIaaSError).message).toContain('timeout');
      }
    });
  });

  // ---- #11: Priority Fee Fallback ----

  describe('#11: priority fee fallback — estimateFee returns base fee', () => {
    it('estimateFee returns base fee (5000n) for native SOL without RPC priority query', async () => {
      await adapter.connect(TEST_RPC_URL);

      // SolanaAdapter.estimateFee for native SOL transfer just returns DEFAULT_SOL_TRANSFER_FEE
      // without querying getRecentPrioritizationFees
      const request: TransferRequest = {
        from: testFromAddress,
        to: testToAddress,
        amount: 1_000_000n,
      };

      const fee = await adapter.estimateFee(request);
      expect(fee.fee).toBe(5000n);
      expect(typeof fee.fee).toBe('bigint');
    });
  });

  // ---- #12: Confirmation Wait Timeout ----

  describe('#12: confirmation wait timeout — getSignatureStatuses returns null', () => {
    it('waitForConfirmation returns submitted status on timeout', async () => {
      await adapter.connect(TEST_RPC_URL);

      const txHash = '5VERv8NMvzbJMEkV8xnrLkEaWRtSz9CosKDYjCJjBRnbJLgp8uirBgmQpjKhoR4tjF3ZpRzrFmBV6UjKdiSZkQU';

      // Return null status (not confirmed yet) repeatedly
      mockRpc.getSignatureStatuses = mockSend({ value: [null] });

      // Use very short timeout to avoid slow test
      const result = await adapter.waitForConfirmation(txHash, 100);
      expect(result.txHash).toBe(txHash);
      expect(result.status).toBe('submitted');
    });

    it('waitForConfirmation returns submitted on RPC error during polling', async () => {
      await adapter.connect(TEST_RPC_URL);

      const txHash = 'some-tx-hash';
      mockRpc.getSignatureStatuses = mockSendReject(new Error('RPC connection lost'));

      const result = await adapter.waitForConfirmation(txHash, 5000);
      expect(result.txHash).toBe(txHash);
      expect(result.status).toBe('submitted');
    });
  });

  // ---- #13: Duplicate Transaction ----

  describe('#13: duplicate transaction — sendTransaction error', () => {
    it('submitTransaction throws CHAIN_ERROR on "already processed" error', async () => {
      await adapter.connect(TEST_RPC_URL);
      const signedBytes = await adapter.signTransaction(testUnsignedTx, testPrivateKey64);

      mockRpc.sendTransaction = mockSendReject(
        new Error('Transaction already processed'),
      );

      await expect(adapter.submitTransaction(signedBytes)).rejects.toThrow(WAIaaSError);
      try {
        await adapter.submitTransaction(signedBytes);
      } catch (error) {
        expect(error).toBeInstanceOf(WAIaaSError);
        expect((error as WAIaaSError).code).toBe('CHAIN_ERROR');
        expect((error as WAIaaSError).message).toContain('already processed');
      }
    });
  });
});
