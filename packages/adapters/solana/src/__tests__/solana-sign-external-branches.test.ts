/**
 * SolanaAdapter signExternalTransaction branch-coverage tests.
 *
 * Targets SPECIFIC uncovered branches in signExternalTransaction():
 * - 32-byte private key path (createKeyPairFromPrivateKeyBytes)
 * - Transaction decode failure (valid base64, invalid transaction bytes)
 * - Outer catch wrapping non-ChainError as INVALID_RAW_TRANSACTION
 * - Base64 decode failure branch analysis (documented as unreachable)
 *
 * These complement the existing solana-sign-only.test.ts which covers
 * normal signing, WALLET_NOT_SIGNER, and basic INVALID_RAW_TRANSACTION.
 *
 * No RPC mocking needed: signExternalTransaction is offline.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import {
  address,
  createNoopSigner,
  createTransactionMessage,
  setTransactionMessageFeePayer,
  appendTransactionMessageInstruction,
  setTransactionMessageLifetimeUsingBlockhash,
  compileTransaction,
  getTransactionEncoder,
  pipe,
  createKeyPairFromBytes,
  getAddressFromPublicKey,
  blockhash,
} from '@solana/kit';
import { getTransferSolInstruction } from '@solana-program/system';
import { ChainError } from '@waiaas/core';

import { SolanaAdapter } from '../adapter.js';

// ---- Test fixtures ----

const TEST_BLOCKHASH = blockhash('4EPD2GJZkETChiMBc7G3yqga8TaczFNKSRJBuAGDNBRk');
const txEncoder = getTransactionEncoder();

// Fixture variables populated in beforeAll
let adapter: SolanaAdapter;
let fromAddress: string;
let toAddress: string;
let privateKey64: Uint8Array;
let privateKey32: Uint8Array;

// Pre-built base64 fixtures
let nativeTransferBase64: string;

/** Build a test keypair from crypto and return address + 64-byte key */
async function buildTestKeypair(): Promise<{ address: string; privateKey64: Uint8Array; privateKey32: Uint8Array }> {
  const { webcrypto } = await import('node:crypto');
  const kp = (await webcrypto.subtle.generateKey('Ed25519', true, ['sign', 'verify'])) as {
    privateKey: CryptoKey;
    publicKey: CryptoKey;
  };
  const pkcs8 = new Uint8Array(await webcrypto.subtle.exportKey('pkcs8', kp.privateKey));
  const rawPriv = pkcs8.slice(-32);
  const rawPub = new Uint8Array(await webcrypto.subtle.exportKey('raw', kp.publicKey));

  const combined = new Uint8Array(64);
  combined.set(rawPriv, 0);
  combined.set(rawPub, 32);

  const solKp = await createKeyPairFromBytes(combined);
  const addr = await getAddressFromPublicKey(solKp.publicKey);
  return { address: addr, privateKey64: combined, privateKey32: rawPriv };
}

/** Encode a compiled transaction to base64 string */
function toBase64(compiled: ReturnType<typeof compileTransaction>): string {
  const bytes = new Uint8Array(txEncoder.encode(compiled));
  return Buffer.from(bytes).toString('base64');
}

beforeAll(async () => {
  adapter = new SolanaAdapter('devnet');
  // No connect needed -- signExternalTransaction is offline

  // Generate test keypairs
  const kp1 = await buildTestKeypair();
  const kp2 = await buildTestKeypair();
  fromAddress = kp1.address;
  toAddress = kp2.address;
  privateKey64 = kp1.privateKey64;
  privateKey32 = kp1.privateKey32;

  const from = address(fromAddress);
  const to = address(toAddress);
  const fromSigner = createNoopSigner(from);

  // Build fixture: native SOL transfer unsigned tx
  {
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
          { blockhash: TEST_BLOCKHASH, lastValidBlockHeight: 200n },
          tx,
        ),
    );
    nativeTransferBase64 = toBase64(compileTransaction(txMessage));
  }
});

// ---- Tests ----

describe('SolanaAdapter.signExternalTransaction - branch coverage', () => {
  describe('32-byte private key path', () => {
    it('signs with 32-byte private key via createKeyPairFromPrivateKeyBytes', async () => {
      // Use only the 32-byte seed (not the full 64-byte secret+public pair)
      const result = await adapter.signExternalTransaction(nativeTransferBase64, privateKey32);

      expect(result.signedTransaction).toBeDefined();
      expect(typeof result.signedTransaction).toBe('string');
      // Should be valid base64
      expect(() => Buffer.from(result.signedTransaction, 'base64')).not.toThrow();
      // Signed tx should be different from unsigned
      expect(result.signedTransaction).not.toBe(nativeTransferBase64);
    });

    it('produces same signed output from 32-byte and 64-byte keys of the same keypair', async () => {
      const result64 = await adapter.signExternalTransaction(nativeTransferBase64, privateKey64);
      const result32 = await adapter.signExternalTransaction(nativeTransferBase64, privateKey32);

      // Both should produce valid signed transactions
      expect(result64.signedTransaction).toBeDefined();
      expect(result32.signedTransaction).toBeDefined();

      // The signatures should be identical since they're the same key
      expect(result32.signedTransaction).toBe(result64.signedTransaction);
    });
  });

  describe('transaction decode failure (Step 2)', () => {
    it('throws INVALID_RAW_TRANSACTION for valid base64 but invalid transaction bytes', async () => {
      // Valid base64 that decodes to bytes but cannot be decoded as a Solana transaction.
      // Use 0xFF repeated -- the first byte is the signature count (compact-u16),
      // and 0xFF 0xFF would indicate >32000 signatures which is invalid.
      const corruptedBase64 = Buffer.from(new Uint8Array([0xff, 0xff, 0xff, 0xff, 0xff])).toString('base64');

      try {
        await adapter.signExternalTransaction(corruptedBase64, privateKey64);
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(ChainError);
        expect((error as ChainError).code).toBe('INVALID_RAW_TRANSACTION');
        expect((error as ChainError).chain).toBe('solana');
      }
    });

    it('throws INVALID_RAW_TRANSACTION for single-byte base64', async () => {
      // Just one byte -- too short to be a valid transaction
      const singleByteBase64 = Buffer.from([0xff]).toString('base64');

      try {
        await adapter.signExternalTransaction(singleByteBase64, privateKey64);
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(ChainError);
        expect((error as ChainError).code).toBe('INVALID_RAW_TRANSACTION');
      }
    });
  });

  describe('base64 decode failure (Step 1)', () => {
    it('Buffer.from with base64 encoding is lenient -- does not throw for malformed input', () => {
      // Document that Node.js Buffer.from(str, 'base64') never throws.
      // It silently ignores invalid characters. This means the Step 1 try/catch
      // at adapter.ts lines 1249-1255 is effectively unreachable dead code.
      //
      // The actual error handling happens at Step 2 when txDecoder.decode() fails
      // on the garbage bytes produced by lenient base64 decoding.

      // Verify Buffer.from doesn't throw even for completely invalid input
      expect(() => Buffer.from('!!!@@@###$$$', 'base64')).not.toThrow();
      expect(() => Buffer.from('', 'base64')).not.toThrow();
      expect(() => Buffer.from('\x00\x01\x02', 'base64')).not.toThrow();

      // Instead, the Step 2 decode catches these:
      // adapter.signExternalTransaction('!!!@@@###', key) -> Step 1 produces garbage bytes
      // -> Step 2 txDecoder.decode() fails -> INVALID_RAW_TRANSACTION thrown from Step 2
    });

    it('malformed base64 input falls through to Step 2 decode failure', async () => {
      // Even though '!!!@@@###' is not valid base64, Buffer.from will return garbage bytes,
      // and then txDecoder.decode() at Step 2 will catch it
      try {
        await adapter.signExternalTransaction('!!!@@@###$$$', privateKey64);
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(ChainError);
        expect((error as ChainError).code).toBe('INVALID_RAW_TRANSACTION');
        // Error comes from Step 2 decode, not Step 1 base64
        expect((error as ChainError).message).toContain('Failed to decode');
      }
    });
  });

  describe('outer catch wrapping non-ChainError', () => {
    it('wraps non-ChainError as INVALID_RAW_TRANSACTION', async () => {
      // To trigger the outer catch with a non-ChainError, we need an error AFTER
      // Steps 1-2 (decode) succeed but BEFORE a ChainError is thrown.
      // An all-zero 64-byte key may cause createKeyPairFromBytes to throw a
      // generic Error (not ChainError) due to invalid Ed25519 key.
      const invalidKey = new Uint8Array(64); // all zeros

      try {
        await adapter.signExternalTransaction(nativeTransferBase64, invalidKey);
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(ChainError);
        expect((error as ChainError).code).toBe('INVALID_RAW_TRANSACTION');
        expect((error as ChainError).chain).toBe('solana');
        // The outer catch wraps it: "Failed to sign external transaction: ..."
        expect((error as ChainError).message).toContain('Failed to sign external transaction');
      }
    });
  });
});
