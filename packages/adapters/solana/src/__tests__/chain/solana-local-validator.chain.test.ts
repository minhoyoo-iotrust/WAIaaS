/**
 * Level 2: Solana Local Validator E2E — 5 flows on solana-test-validator
 *
 * Design doc 48 section 3.2 compliance.
 * Requires `solana-test-validator` running on localhost:8899.
 * If validator is not running, all tests are gracefully skipped.
 *
 * E2E-1: SOL transfer full pipeline (connect -> build -> simulate -> sign -> submit -> confirm)
 * E2E-2: Balance query + fee estimation
 * E2E-3: Address validation (via adapter methods + @solana/kit address())
 * E2E-4: Connection management (connect/disconnect/health)
 * E2E-5: Error recovery — insufficient balance simulation
 *
 * Run: solana-test-validator --reset --quiet &
 * Then: npx vitest run packages/adapters/solana/src/__tests__/chain/solana-local-validator.chain.test.ts
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { SolanaAdapter } from '../../adapter.js';
import { isValidatorRunning, airdropSol } from './helpers/validator-setup.js';
import type { TransferRequest } from '@waiaas/core';

const LOCAL_RPC_URL = 'http://127.0.0.1:8899';

// ---- Key pair generation helpers ----

async function generateKeyPair(): Promise<{
  address: string;
  privateKey64: Uint8Array;
}> {
  const { createKeyPairFromBytes, getAddressFromPublicKey } = await import('@solana/kit');
  const { webcrypto } = await import('node:crypto');

  const kp = (await webcrypto.subtle.generateKey('Ed25519', true, [
    'sign',
    'verify',
  ])) as { privateKey: CryptoKey; publicKey: CryptoKey };

  const pkcs8 = new Uint8Array(await webcrypto.subtle.exportKey('pkcs8', kp.privateKey));
  const rawPriv = pkcs8.slice(-32);
  const rawPub = new Uint8Array(await webcrypto.subtle.exportKey('raw', kp.publicKey));

  const combined = new Uint8Array(64);
  combined.set(rawPriv, 0);
  combined.set(rawPub, 32);

  const solKp = await createKeyPairFromBytes(combined);
  const addr = await getAddressFromPublicKey(solKp.publicKey);

  return { address: addr, privateKey64: combined };
}

// ---- E2E test suite ----

let validatorRunning = false;

// Check validator before entering the describe
beforeAll(async () => {
  validatorRunning = await isValidatorRunning(LOCAL_RPC_URL, 5000);
});

describe.skipIf(!validatorRunning)('Level 2: Solana Local Validator E2E', () => {
  let adapter: SolanaAdapter;
  let accountA: { address: string; privateKey64: Uint8Array };
  let accountB: { address: string; privateKey64: Uint8Array };
  let accountC: { address: string; privateKey64: Uint8Array }; // Zero balance account

  beforeAll(async () => {
    // Re-check since describe.skipIf uses the initial value
    validatorRunning = await isValidatorRunning(LOCAL_RPC_URL, 5000);
    if (!validatorRunning) return;

    // Generate test key pairs
    accountA = await generateKeyPair();
    accountB = await generateKeyPair();
    accountC = await generateKeyPair(); // No airdrop — stays at 0

    // Airdrop 10 SOL to account A for testing
    await airdropSol(accountA.address, 10_000_000_000n, LOCAL_RPC_URL);

    // Create adapter instance
    adapter = new SolanaAdapter('devnet');
  }, 30_000);

  afterAll(async () => {
    if (adapter?.isConnected()) {
      await adapter.disconnect();
    }
  });

  // ---- E2E-1: SOL Transfer Full Pipeline ----

  describe('E2E-1: SOL transfer full pipeline', () => {
    it('completes connect -> build -> simulate -> sign -> submit -> confirm', { timeout: 30_000 }, async () => {
      // Connect
      await adapter.connect(LOCAL_RPC_URL);
      expect(adapter.isConnected()).toBe(true);

      // Build transaction: send 0.001 SOL (1_000_000 lamports)
      const request: TransferRequest = {
        from: accountA.address,
        to: accountB.address,
        amount: 1_000_000n,
      };

      const tx = await adapter.buildTransaction(request);
      expect(tx.chain).toBe('solana');
      expect(tx.serialized).toBeInstanceOf(Uint8Array);
      expect(tx.serialized.length).toBeGreaterThan(0);
      expect(tx.estimatedFee).toBe(5000n);
      expect(tx.metadata.blockhash).toBeDefined();

      // Simulate
      const simResult = await adapter.simulateTransaction(tx);
      expect(simResult.success).toBe(true);
      expect(simResult.logs).toBeDefined();
      expect(simResult.logs!.length).toBeGreaterThan(0);

      // Sign
      const signedBytes = await adapter.signTransaction(tx, accountA.privateKey64);
      expect(signedBytes).toBeInstanceOf(Uint8Array);
      expect(signedBytes.length).toBeGreaterThan(0);

      // Submit
      const submitResult = await adapter.submitTransaction(signedBytes);
      expect(submitResult.txHash).toBeDefined();
      expect(typeof submitResult.txHash).toBe('string');
      expect(submitResult.txHash.length).toBeGreaterThan(0);
      expect(submitResult.status).toBe('submitted');

      // Wait for confirmation (local validator is fast)
      const confirmResult = await adapter.waitForConfirmation(submitResult.txHash, 15_000);
      expect(confirmResult.txHash).toBe(submitResult.txHash);
      expect(['confirmed', 'finalized']).toContain(confirmResult.status);
    });
  });

  // ---- E2E-2: Balance Query + Fee Estimation ----

  describe('E2E-2: balance query + fee estimation', () => {
    it('returns correct balance and fee for airdropped account', { timeout: 30_000 }, async () => {
      if (!adapter.isConnected()) {
        await adapter.connect(LOCAL_RPC_URL);
      }

      // Balance check — should be ~10 SOL minus small tx fee from E2E-1
      const balance = await adapter.getBalance(accountA.address);
      expect(balance.address).toBe(accountA.address);
      expect(balance.balance).toBeGreaterThan(9_000_000_000n); // at least 9 SOL remaining
      expect(balance.decimals).toBe(9);
      expect(balance.symbol).toBe('SOL');

      // Fee estimation for native SOL transfer
      const request: TransferRequest = {
        from: accountA.address,
        to: accountB.address,
        amount: 500_000n,
      };

      const fee = await adapter.estimateFee(request);
      expect(fee.fee).toBe(5000n);
      expect(typeof fee.fee).toBe('bigint');
    });
  });

  // ---- E2E-3: Address Validation ----

  describe('E2E-3: address validation', () => {
    it('validates real and invalid Solana addresses via adapter operations', { timeout: 30_000 }, async () => {
      if (!adapter.isConnected()) {
        await adapter.connect(LOCAL_RPC_URL);
      }

      const { address } = await import('@solana/kit');

      // Valid addresses — no throw
      expect(() => address(accountA.address)).not.toThrow();
      expect(() => address('11111111111111111111111111111111')).not.toThrow(); // System Program

      // Invalid addresses — throw
      expect(() => address('not-valid')).toThrow();
      expect(() => address('')).toThrow();
      expect(() => address('0x742d35Cc6634C0532925a3b844Bc9e7595f2BD3E')).toThrow();

      // getBalance with real address should work
      const balance = await adapter.getBalance(accountA.address);
      expect(balance.balance).toBeGreaterThanOrEqual(0n);
    });
  });

  // ---- E2E-4: Connection Management ----

  describe('E2E-4: connection management', () => {
    it('manages connect/disconnect/health lifecycle', { timeout: 30_000 }, async () => {
      // Create a fresh adapter for this test
      const freshAdapter = new SolanaAdapter('devnet');

      // Initially not connected
      expect(freshAdapter.isConnected()).toBe(false);

      // Connect
      await freshAdapter.connect(LOCAL_RPC_URL);
      expect(freshAdapter.isConnected()).toBe(true);

      // Health check
      const health = await freshAdapter.getHealth();
      expect(health.healthy).toBe(true);
      expect(health.latencyMs).toBeGreaterThanOrEqual(0);
      expect(health.latencyMs).toBeLessThan(5000);
      expect(health.blockHeight).toBeDefined();

      // Disconnect
      await freshAdapter.disconnect();
      expect(freshAdapter.isConnected()).toBe(false);
    });
  });

  // ---- E2E-5: Error Recovery — Insufficient Balance ----

  describe('E2E-5: error recovery — insufficient balance simulation', () => {
    it('simulation fails for zero-balance account attempting transfer', { timeout: 30_000 }, async () => {
      if (!adapter.isConnected()) {
        await adapter.connect(LOCAL_RPC_URL);
      }

      // Account C has zero balance (never airdropped)
      // buildTransaction succeeds (doesn't check balance)
      const request: TransferRequest = {
        from: accountC.address,
        to: accountB.address,
        amount: 1_000_000n,
      };

      const tx = await adapter.buildTransaction(request);
      expect(tx.chain).toBe('solana');
      expect(tx.serialized).toBeInstanceOf(Uint8Array);

      // simulateTransaction should reveal the insufficient balance error
      // The local validator will return err in the simulation result
      const simResult = await adapter.simulateTransaction(tx);
      expect(simResult.success).toBe(false);
      expect(simResult.error).toBeDefined();
    });
  });
});
