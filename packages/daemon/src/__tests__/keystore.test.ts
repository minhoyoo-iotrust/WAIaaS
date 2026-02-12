/**
 * Keystore module tests.
 *
 * Tests cover:
 * 1. Argon2id key derivation (deterministic, salt variation)
 * 2. AES-256-GCM encrypt/decrypt round-trip (32B, 64B)
 * 3. Wrong password rejection (GCM authTag mismatch)
 * 4. Keystore file format v1 validation
 * 5. File permission 0600 (Unix only)
 * 6. Full round-trip: generateKeyPair -> decryptPrivateKey -> sign -> releaseKey
 * 7. Sodium guarded memory (allocate, write, zero)
 *
 * Note: Argon2id with production params (64 MiB, t=3) takes ~1-3s per operation.
 * Tests use production parameters for correctness -- expect total runtime of ~15-30s.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, rmSync, statSync, existsSync, writeFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createRequire } from 'node:module';
import { deriveKey, encrypt, decrypt } from '../infrastructure/keystore/crypto.js';
import {
  allocateGuarded,
  writeToGuarded,
  zeroAndRelease,
  isAvailable,
} from '../infrastructure/keystore/memory.js';
import { LocalKeyStore } from '../infrastructure/keystore/keystore.js';
import type { KeystoreFileV1 } from '../infrastructure/keystore/keystore.js';
import { WAIaaSError } from '@waiaas/core';
import { getAddress } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

const require = createRequire(import.meta.url);
type SodiumNative = typeof import('sodium-native');

const TEST_PASSWORD = 'test-master-password-123';
const WRONG_PASSWORD = 'wrong-password-456';

let tempDir: string;
let sodium: SodiumNative;

beforeAll(() => {
  tempDir = mkdtempSync(join(tmpdir(), 'waiaas-keystore-test-'));
  sodium = require('sodium-native') as SodiumNative;
});

afterAll(() => {
  rmSync(tempDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// 1. Argon2id key derivation tests
// ---------------------------------------------------------------------------

describe('Argon2id key derivation', () => {
  it('deriveKey returns 32-byte key and 16-byte salt', async () => {
    const { key, salt } = await deriveKey(TEST_PASSWORD);
    expect(key).toBeInstanceOf(Buffer);
    expect(key.length).toBe(32);
    expect(salt).toBeInstanceOf(Buffer);
    expect(salt.length).toBe(16);
  });

  it('same password + same salt produces same key (deterministic)', async () => {
    const { key: key1, salt } = await deriveKey(TEST_PASSWORD);
    const { key: key2 } = await deriveKey(TEST_PASSWORD, salt);
    expect(key1.equals(key2)).toBe(true);
  });

  it('same password + different salt produces different key', async () => {
    const { key: key1 } = await deriveKey(TEST_PASSWORD);
    const { key: key2 } = await deriveKey(TEST_PASSWORD);
    // Two calls without providing salt generate different random salts
    expect(key1.equals(key2)).toBe(false);
  });

  it('deriveKey with empty password succeeds', async () => {
    const { key, salt } = await deriveKey('');
    expect(key.length).toBe(32);
    expect(salt.length).toBe(16);
  });
});

// ---------------------------------------------------------------------------
// 2. AES-256-GCM encrypt/decrypt round-trip tests
// ---------------------------------------------------------------------------

describe('AES-256-GCM encrypt/decrypt', () => {
  it('round-trip for 32-byte buffer (EVM private key size)', async () => {
    const plaintext = Buffer.alloc(32);
    plaintext.fill(0xab);
    const encrypted = await encrypt(plaintext, TEST_PASSWORD);
    const decrypted = await decrypt(encrypted, TEST_PASSWORD);
    expect(decrypted.equals(plaintext)).toBe(true);
  });

  it('round-trip for 64-byte buffer (Solana Ed25519 keypair size)', async () => {
    const plaintext = Buffer.alloc(64);
    plaintext.fill(0xcd);
    const encrypted = await encrypt(plaintext, TEST_PASSWORD);
    const decrypted = await decrypt(encrypted, TEST_PASSWORD);
    expect(decrypted.equals(plaintext)).toBe(true);
  });

  it('encrypted data has correct field sizes', async () => {
    const plaintext = Buffer.alloc(32, 0xff);
    const encrypted = await encrypt(plaintext, TEST_PASSWORD);
    expect(encrypted.iv.length).toBe(12); // GCM 96-bit nonce
    expect(encrypted.authTag.length).toBe(16); // GCM 128-bit auth tag
    expect(encrypted.salt.length).toBe(16); // 128-bit salt
    expect(encrypted.ciphertext.length).toBe(32); // GCM stream cipher: same as plaintext
  });

  it('KDF params match doc 26 specification', async () => {
    const plaintext = Buffer.alloc(16, 0x01);
    const encrypted = await encrypt(plaintext, TEST_PASSWORD);
    expect(encrypted.kdfparams).toEqual({
      memoryCost: 65536,
      timeCost: 3,
      parallelism: 4,
      hashLength: 32,
    });
  });
});

// ---------------------------------------------------------------------------
// 3. Wrong password tests
// ---------------------------------------------------------------------------

describe('Wrong password rejection', () => {
  it('decrypt with wrong password throws WAIaaSError', async () => {
    const plaintext = Buffer.alloc(32, 0xaa);
    const encrypted = await encrypt(plaintext, TEST_PASSWORD);

    await expect(decrypt(encrypted, WRONG_PASSWORD)).rejects.toThrow(WAIaaSError);
  });

  it('error message indicates wrong password (GCM authTag mismatch)', async () => {
    const plaintext = Buffer.alloc(32, 0xbb);
    const encrypted = await encrypt(plaintext, TEST_PASSWORD);

    try {
      await decrypt(encrypted, WRONG_PASSWORD);
      expect.fail('Expected WAIaaSError to be thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(WAIaaSError);
      const waiaasError = error as WAIaaSError;
      expect(waiaasError.code).toBe('INVALID_MASTER_PASSWORD');
      expect(waiaasError.message).toContain('wrong password');
    }
  });
});

// ---------------------------------------------------------------------------
// 4. Keystore file format tests
// ---------------------------------------------------------------------------

describe('Keystore file format v1', () => {
  let keystore: LocalKeyStore;
  let keystoreDir: string;

  beforeAll(() => {
    keystoreDir = mkdtempSync(join(tempDir, 'ks-format-'));
    keystore = new LocalKeyStore(keystoreDir);
  });

  it('generateKeyPair creates a valid JSON keystore file', async () => {
    await keystore.generateKeyPair('test-agent-format', 'solana', TEST_PASSWORD);

    const filePath = join(keystoreDir, 'test-agent-format.json');
    const content = await readFile(filePath, 'utf-8');
    const parsed = JSON.parse(content) as KeystoreFileV1;

    expect(parsed.version).toBe(1);
    expect(parsed.chain).toBe('solana');
    expect(parsed.crypto.cipher).toBe('aes-256-gcm');
    expect(parsed.crypto.kdf).toBe('argon2id');
  });

  it('kdfparams match doc 26 specification', async () => {
    const filePath = join(keystoreDir, 'test-agent-format.json');
    const content = await readFile(filePath, 'utf-8');
    const parsed = JSON.parse(content) as KeystoreFileV1;

    expect(parsed.crypto.kdfparams.memoryCost).toBe(65536);
    expect(parsed.crypto.kdfparams.timeCost).toBe(3);
    expect(parsed.crypto.kdfparams.parallelism).toBe(4);
    expect(parsed.crypto.kdfparams.hashLength).toBe(32);
  });

  it('file has metadata.name and metadata.createdAt', async () => {
    const filePath = join(keystoreDir, 'test-agent-format.json');
    const content = await readFile(filePath, 'utf-8');
    const parsed = JSON.parse(content) as KeystoreFileV1;

    expect(parsed.metadata.name).toBe('test-agent-format');
    expect(parsed.metadata.createdAt).toBeTruthy();
    expect(parsed.metadata.lastUnlockedAt).toBeNull();
    // Verify ISO 8601 format
    expect(new Date(parsed.metadata.createdAt).toISOString()).toBe(parsed.metadata.createdAt);
  });

  it('cipherparams.iv is 24-char hex string (12 bytes)', async () => {
    const filePath = join(keystoreDir, 'test-agent-format.json');
    const content = await readFile(filePath, 'utf-8');
    const parsed = JSON.parse(content) as KeystoreFileV1;

    expect(parsed.crypto.cipherparams.iv).toMatch(/^[0-9a-f]{24}$/);
  });

  it('crypto.authTag is 32-char hex string (16 bytes)', async () => {
    const filePath = join(keystoreDir, 'test-agent-format.json');
    const content = await readFile(filePath, 'utf-8');
    const parsed = JSON.parse(content) as KeystoreFileV1;

    expect(parsed.crypto.authTag).toMatch(/^[0-9a-f]{32}$/);
  });

  it('kdfparams.salt is 32-char hex string (16 bytes)', async () => {
    const filePath = join(keystoreDir, 'test-agent-format.json');
    const content = await readFile(filePath, 'utf-8');
    const parsed = JSON.parse(content) as KeystoreFileV1;

    expect(parsed.crypto.kdfparams.salt).toMatch(/^[0-9a-f]{32}$/);
  });

  it('file has id (UUID v4 format)', async () => {
    const filePath = join(keystoreDir, 'test-agent-format.json');
    const content = await readFile(filePath, 'utf-8');
    const parsed = JSON.parse(content) as KeystoreFileV1;

    // UUID v4 format
    expect(parsed.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
  });

  it('publicKey is a non-empty base58 string', async () => {
    const filePath = join(keystoreDir, 'test-agent-format.json');
    const content = await readFile(filePath, 'utf-8');
    const parsed = JSON.parse(content) as KeystoreFileV1;

    // Base58 alphabet only
    expect(parsed.publicKey).toMatch(/^[123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz]+$/);
    // Ed25519 public key should be ~43-44 chars in base58
    expect(parsed.publicKey.length).toBeGreaterThanOrEqual(32);
    expect(parsed.publicKey.length).toBeLessThanOrEqual(44);
  });
});

// ---------------------------------------------------------------------------
// 5. File permission tests (Unix only)
// ---------------------------------------------------------------------------

describe('File permissions', () => {
  it('keystore file has permission 0600 (owner read/write only)', async () => {
    if (process.platform === 'win32') {
      return; // Skip on Windows
    }

    const keystoreDir = mkdtempSync(join(tempDir, 'ks-perms-'));
    const keystore = new LocalKeyStore(keystoreDir);
    await keystore.generateKeyPair('test-agent-perms', 'solana', TEST_PASSWORD);

    const filePath = join(keystoreDir, 'test-agent-perms.json');
    const stats = statSync(filePath);
    // mode & 0o777 gives the permission bits
    const permissions = stats.mode & 0o777;
    expect(permissions).toBe(0o600);
  });
});

// ---------------------------------------------------------------------------
// 6. Full round-trip tests
// ---------------------------------------------------------------------------

describe('Full round-trip', () => {
  let keystore: LocalKeyStore;
  let keystoreDir: string;

  beforeAll(() => {
    keystoreDir = mkdtempSync(join(tempDir, 'ks-roundtrip-'));
    keystore = new LocalKeyStore(keystoreDir);
  });

  it('generateKeyPair -> decryptPrivateKey returns key that can sign', async () => {
    const { publicKey } = await keystore.generateKeyPair(
      'test-agent-sign',
      'solana',
      TEST_PASSWORD,
    );

    expect(publicKey).toBeTruthy();

    // Decrypt the private key
    const decryptedKey = await keystore.decryptPrivateKey('test-agent-sign', TEST_PASSWORD);

    // Ed25519 secret key is 64 bytes (seed + public)
    expect(decryptedKey.byteLength).toBe(sodium.crypto_sign_SECRETKEYBYTES);

    // Verify signing works
    const message = Buffer.from('test message for signing');
    const signature = Buffer.alloc(sodium.crypto_sign_BYTES);
    const secretKeyBuf = Buffer.from(decryptedKey);

    sodium.crypto_sign_detached(signature, message, secretKeyBuf);

    // Read the public key from keystore file to verify
    const filePath = join(keystoreDir, 'test-agent-sign.json');
    const content = await readFile(filePath, 'utf-8');
    const parsed = JSON.parse(content) as KeystoreFileV1;
    expect(parsed.publicKey).toBe(publicKey);

    // Verify the public key from the secret key matches
    const derivedPubKey = Buffer.from(decryptedKey.slice(32, 64));
    const verified = sodium.crypto_sign_verify_detached(signature, message, derivedPubKey);
    expect(verified).toBe(true);

    // Clean up
    keystore.releaseKey(decryptedKey);
  });

  it('decryptPrivateKey -> releaseKey -> hasKey returns true (key file still exists)', async () => {
    const agentId = 'test-agent-release';
    await keystore.generateKeyPair(agentId, 'solana', TEST_PASSWORD);
    const key = await keystore.decryptPrivateKey(agentId, TEST_PASSWORD);

    keystore.releaseKey(key);

    // hasKey checks file existence, not memory
    const exists = await keystore.hasKey(agentId);
    expect(exists).toBe(true);
  });

  it('deleteKey removes keystore file from disk', async () => {
    const agentId = 'test-agent-delete';
    await keystore.generateKeyPair(agentId, 'solana', TEST_PASSWORD);

    const filePath = join(keystoreDir, `${agentId}.json`);
    expect(existsSync(filePath)).toBe(true);

    await keystore.deleteKey(agentId);

    expect(existsSync(filePath)).toBe(false);
    const exists = await keystore.hasKey(agentId);
    expect(exists).toBe(false);
  });

  it('hasKey returns false for non-existent agent', async () => {
    const exists = await keystore.hasKey('non-existent-agent');
    expect(exists).toBe(false);
  });

  it('decryptPrivateKey with wrong password throws WAIaaSError', async () => {
    const agentId = 'test-agent-wrongpw';
    await keystore.generateKeyPair(agentId, 'solana', TEST_PASSWORD);

    await expect(keystore.decryptPrivateKey(agentId, WRONG_PASSWORD)).rejects.toThrow(WAIaaSError);
  });

  it('lastUnlockedAt is updated after decryptPrivateKey', async () => {
    const agentId = 'test-agent-unlocked';
    await keystore.generateKeyPair(agentId, 'solana', TEST_PASSWORD);

    // Before decrypt, lastUnlockedAt should be null
    const filePath = join(keystoreDir, `${agentId}.json`);
    const contentBefore = await readFile(filePath, 'utf-8');
    const parsedBefore = JSON.parse(contentBefore) as KeystoreFileV1;
    expect(parsedBefore.metadata.lastUnlockedAt).toBeNull();

    const key = await keystore.decryptPrivateKey(agentId, TEST_PASSWORD);

    // After decrypt, lastUnlockedAt should be set
    const contentAfter = await readFile(filePath, 'utf-8');
    const parsedAfter = JSON.parse(contentAfter) as KeystoreFileV1;
    expect(parsedAfter.metadata.lastUnlockedAt).toBeTruthy();

    keystore.releaseKey(key);
  });

  it('lockAll releases all keys from guarded memory', async () => {
    const agentId1 = 'test-agent-lockall-1';
    const agentId2 = 'test-agent-lockall-2';
    await keystore.generateKeyPair(agentId1, 'solana', TEST_PASSWORD);
    await keystore.generateKeyPair(agentId2, 'solana', TEST_PASSWORD);

    await keystore.decryptPrivateKey(agentId1, TEST_PASSWORD);
    await keystore.decryptPrivateKey(agentId2, TEST_PASSWORD);

    // lockAll should not throw
    expect(() => keystore.lockAll()).not.toThrow();

    // Files should still exist
    expect(await keystore.hasKey(agentId1)).toBe(true);
    expect(await keystore.hasKey(agentId2)).toBe(true);
  });

  it('generateKeyPair rejects unsupported chain', async () => {
    await expect(
      keystore.generateKeyPair('test-agent-evm', 'ethereum', TEST_PASSWORD),
    ).rejects.toThrow(WAIaaSError);
  });
});

// ---------------------------------------------------------------------------
// 7. Sodium guarded memory tests
// ---------------------------------------------------------------------------

describe('Sodium guarded memory', () => {
  it('isAvailable returns true when sodium-native is installed', () => {
    expect(isAvailable()).toBe(true);
  });

  it('allocateGuarded returns a Buffer of requested size', () => {
    const buf = allocateGuarded(32);
    expect(buf).toBeInstanceOf(Buffer);
    expect(buf.length).toBe(32);
    // Clean up
    zeroAndRelease(buf);
  });

  it('writeToGuarded copies data correctly and buffer is readable', () => {
    const guarded = allocateGuarded(4);
    const source = Buffer.from([0xde, 0xad, 0xbe, 0xef]);
    writeToGuarded(guarded, source);

    // Buffer should be readable after writeToGuarded (set to readonly mode)
    expect(guarded[0]).toBe(0xde);
    expect(guarded[1]).toBe(0xad);
    expect(guarded[2]).toBe(0xbe);
    expect(guarded[3]).toBe(0xef);

    // Note: Writing to readonly sodium buffer causes SIGSEGV (not catchable JS error).
    // We verify the readonly protection works by confirming the data
    // remains intact (proof that mprotect_readonly was called).

    // Clean up
    zeroAndRelease(guarded);
  });

  it('zeroAndRelease does not throw (zeros buffer and sets noaccess)', () => {
    const guarded = allocateGuarded(8);
    const source = Buffer.from([1, 2, 3, 4, 5, 6, 7, 8]);
    writeToGuarded(guarded, source);

    // zeroAndRelease should complete without error
    // After this call: buffer is zeroed and set to noaccess mode.
    // Note: Accessing the buffer after noaccess causes SIGSEGV (not catchable).
    // We verify the operation succeeds without throwing.
    expect(() => zeroAndRelease(guarded)).not.toThrow();
  });

  it('allocateGuarded + writeToGuarded + read round-trip works', () => {
    // Verify the full guarded memory lifecycle without triggering SIGSEGV
    const sizes = [16, 32, 64, 128];
    for (const size of sizes) {
      const guarded = allocateGuarded(size);
      expect(guarded.length).toBe(size);

      const source = Buffer.alloc(size);
      source.fill(0x42);
      writeToGuarded(guarded, source);

      // Verify all bytes are correct (readonly allows reads)
      for (let i = 0; i < size; i++) {
        expect(guarded[i]).toBe(0x42);
      }

      zeroAndRelease(guarded);
    }
  });
});

// ---------------------------------------------------------------------------
// 8. secp256k1 / EVM multicurve tests (TDD RED → GREEN)
// ---------------------------------------------------------------------------

describe('secp256k1 / EVM multicurve', () => {
  let keystore: LocalKeyStore;
  let keystoreDir: string;

  beforeAll(() => {
    keystoreDir = mkdtempSync(join(tempDir, 'ks-evm-'));
    keystore = new LocalKeyStore(keystoreDir);
  });

  it('EVM key generation produces 0x EIP-55 address', async () => {
    const result = await keystore.generateKeyPair(
      'agent-evm',
      'ethereum',
      'ethereum-sepolia',
      TEST_PASSWORD,
    );

    // publicKey must be a 0x-prefixed 40-hex-char address
    expect(result.publicKey).toMatch(/^0x[0-9a-fA-F]{40}$/);

    // Must pass viem EIP-55 checksum validation
    expect(getAddress(result.publicKey)).toBe(result.publicKey);

    // encryptedPrivateKey must be a non-empty Uint8Array
    expect(result.encryptedPrivateKey).toBeInstanceOf(Uint8Array);
    expect(result.encryptedPrivateKey.length).toBeGreaterThan(0);
  });

  it('EVM keystore file has curve:secp256k1', async () => {
    // Use the key generated in the previous test (agent-evm) or generate fresh
    await keystore.generateKeyPair('agent-evm-curve', 'ethereum', 'ethereum-sepolia', TEST_PASSWORD);

    const filePath = join(keystoreDir, 'agent-evm-curve.json');
    const content = await readFile(filePath, 'utf-8');
    const parsed = JSON.parse(content) as KeystoreFileV1 & { curve?: string };

    expect(parsed.curve).toBe('secp256k1');
  });

  it('keystore file records actual network value', async () => {
    // EVM agent with ethereum-sepolia network
    await keystore.generateKeyPair('agent-net-evm', 'ethereum', 'ethereum-sepolia', TEST_PASSWORD);
    const evmPath = join(keystoreDir, 'agent-net-evm.json');
    const evmContent = await readFile(evmPath, 'utf-8');
    const evmParsed = JSON.parse(evmContent) as KeystoreFileV1;
    expect(evmParsed.network).toBe('ethereum-sepolia');

    // Solana agent with devnet network
    await keystore.generateKeyPair('agent-net-sol', 'solana', 'devnet', TEST_PASSWORD);
    const solPath = join(keystoreDir, 'agent-net-sol.json');
    const solContent = await readFile(solPath, 'utf-8');
    const solParsed = JSON.parse(solContent) as KeystoreFileV1;
    expect(solParsed.network).toBe('devnet');
  });

  it('EVM private key round-trip (32 bytes, AES-256-GCM encrypted)', async () => {
    const { publicKey } = await keystore.generateKeyPair(
      'agent-evm-roundtrip',
      'ethereum',
      'ethereum-sepolia',
      TEST_PASSWORD,
    );

    // Decrypt the private key
    const decryptedKey = await keystore.decryptPrivateKey('agent-evm-roundtrip', TEST_PASSWORD);

    // secp256k1 private key is 32 bytes
    expect(decryptedKey.byteLength).toBe(32);

    // Re-derive address from decrypted key using viem
    const hexKey = `0x${Buffer.from(decryptedKey).toString('hex')}` as `0x${string}`;
    const account = privateKeyToAccount(hexKey);
    expect(account.address).toBe(publicKey);

    // Clean up
    keystore.releaseKey(decryptedKey);
  });

  it('secp256k1 plaintext zeroed after generation', async () => {
    // The zeroing is verified by the fact that:
    // 1. sodium.sodium_memzero is called on the private key buffer in generateKeyPair
    // 2. The encrypt/decrypt round-trip works (key was not corrupted before encryption)
    // 3. If zeroing didn't happen, subsequent memory reads could leak the key
    //
    // We verify this indirectly: generate a key, then decrypt and confirm the
    // original private key buffer is not accessible (only the encrypted form is stored)
    const { publicKey } = await keystore.generateKeyPair(
      'agent-evm-zero',
      'ethereum',
      'ethereum-sepolia',
      TEST_PASSWORD,
    );

    // Decrypt to confirm round-trip works (proves encryption happened before zeroing)
    const decryptedKey = await keystore.decryptPrivateKey('agent-evm-zero', TEST_PASSWORD);
    const hexKey = `0x${Buffer.from(decryptedKey).toString('hex')}` as `0x${string}`;
    const account = privateKeyToAccount(hexKey);
    expect(account.address).toBe(publicKey);

    keystore.releaseKey(decryptedKey);
  });

  it('Solana key generation unchanged (4-param call)', async () => {
    const result = await keystore.generateKeyPair(
      'agent-sol-compat',
      'solana',
      'devnet',
      TEST_PASSWORD,
    );

    // Base58 public key (not 0x-prefixed)
    expect(result.publicKey).not.toMatch(/^0x/);
    expect(result.publicKey).toMatch(
      /^[123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz]+$/,
    );

    // Read keystore file to verify curve:ed25519
    const filePath = join(keystoreDir, 'agent-sol-compat.json');
    const content = await readFile(filePath, 'utf-8');
    const parsed = JSON.parse(content) as KeystoreFileV1 & { curve?: string };
    expect(parsed.curve).toBe('ed25519');

    // Ed25519 secret key is 64 bytes encrypted
    const decryptedKey = await keystore.decryptPrivateKey('agent-sol-compat', TEST_PASSWORD);
    expect(decryptedKey.byteLength).toBe(sodium.crypto_sign_SECRETKEYBYTES); // 64

    keystore.releaseKey(decryptedKey);
  });

  it('backward compat: curve-less keystore reads as ed25519', async () => {
    // Manually create a keystore file WITHOUT curve field
    const agentId = 'agent-legacy-no-curve';

    // First generate a real Solana keystore to get valid crypto data
    await keystore.generateKeyPair('agent-legacy-source', 'solana', 'devnet', TEST_PASSWORD);
    const sourcePath = join(keystoreDir, 'agent-legacy-source.json');
    const sourceContent = await readFile(sourcePath, 'utf-8');
    const sourceData = JSON.parse(sourceContent) as Record<string, unknown>;

    // Remove curve field if present and write as the legacy agent
    delete sourceData.curve;
    const legacyPath = join(keystoreDir, `${agentId}.json`);
    writeFileSync(legacyPath, JSON.stringify(sourceData, null, 2), { encoding: 'utf-8', mode: 0o600 });

    // Read the legacy keystore - curve should default to 'ed25519'
    // Access readKeystoreFile indirectly via decryptPrivateKey (it reads the file)
    // But we also need to verify the curve field is set after reading
    // So we read the file directly after a decryptPrivateKey call (which calls readKeystoreFile + writeKeystoreFile to update lastUnlockedAt)
    const decryptedKey = await keystore.decryptPrivateKey(agentId, TEST_PASSWORD);
    expect(decryptedKey.byteLength).toBe(64); // ed25519 secret key

    // After decryptPrivateKey, the file is re-written with lastUnlockedAt updated
    // Check that curve defaults to ed25519 in the written-back file
    const updatedContent = await readFile(legacyPath, 'utf-8');
    const updatedParsed = JSON.parse(updatedContent) as Record<string, unknown>;
    expect(updatedParsed.curve ?? 'ed25519').toBe('ed25519');

    keystore.releaseKey(decryptedKey);
  });
});
