/**
 * LocalKeyStore - encrypted keystore with guarded memory.
 *
 * Implements ILocalKeyStore from @waiaas/core.
 * Design reference: 26-keystore-spec.md.
 *
 * - Generates Ed25519 key pairs (Solana) using sodium-native
 * - Generates secp256k1 key pairs (EVM) using crypto.randomBytes + viem
 * - Encrypts private keys with AES-256-GCM + Argon2id KDF
 * - Stores as per-wallet JSON keystore files (format v1)
 * - Protects decrypted keys in sodium guarded memory
 * - Atomic file writes (write-then-rename pattern)
 */

import { randomBytes, randomUUID } from 'node:crypto';
import { writeFile, readFile, unlink, stat, rename } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { join, dirname } from 'node:path';
import type { ILocalKeyStore, ChainType } from '@waiaas/core';
import { WAIaaSError } from '@waiaas/core';
import { privateKeyToAccount } from 'viem/accounts';
import { encrypt, decrypt, KDF_PARAMS, type EncryptedData } from './crypto.js';
import { allocateGuarded, writeToGuarded, zeroAndRelease, isAvailable } from './memory.js';

type SodiumNative = typeof import('sodium-native');

const require = createRequire(import.meta.url);

function loadSodium(): SodiumNative {
  return require('sodium-native') as SodiumNative;
}

/** Keystore file format v1 JSON structure. */
export interface KeystoreFileV1 {
  version: 1;
  id: string;
  chain: string;
  network: string;
  /** Cryptographic curve. Defaults to 'ed25519' for backward compat with pre-v1.4.1 files. */
  curve: 'ed25519' | 'secp256k1';
  publicKey: string;
  crypto: {
    cipher: 'aes-256-gcm';
    cipherparams: { iv: string };
    ciphertext: string;
    authTag: string;
    kdf: 'argon2id';
    kdfparams: {
      salt: string;
      memoryCost: number;
      timeCost: number;
      parallelism: number;
      hashLength: number;
    };
  };
  metadata: {
    name: string;
    createdAt: string;
    lastUnlockedAt: string | null;
  };
}

/**
 * Local keystore implementation with AES-256-GCM encryption,
 * Argon2id KDF, and sodium guarded memory protection.
 */
export class LocalKeyStore implements ILocalKeyStore {
  private readonly keystoreDir: string;
  /** Map from guarded buffer identity to walletId for tracking */
  private readonly guardedKeys: Map<Buffer, string> = new Map();

  constructor(keystoreDir: string) {
    this.keystoreDir = keystoreDir;
  }

  /**
   * Generate a key pair for the given chain and store encrypted with master password.
   *
   * For Solana: generates Ed25519 keypair via sodium crypto_sign_keypair.
   * The full 64-byte secret key (seed + public) is encrypted.
   *
   * For Ethereum (EVM): generates secp256k1 private key via crypto.randomBytes(32).
   * Derives EIP-55 checksum address using viem privateKeyToAccount.
   * The 32-byte private key is encrypted.
   *
   * @returns publicKey (base58 for Solana, 0x EIP-55 for EVM) and encrypted private key bytes
   */
  async generateKeyPair(
    walletId: string,
    chain: ChainType,
    network: string,
    masterPassword: string,
  ): Promise<{ publicKey: string; encryptedPrivateKey: Uint8Array }> {
    if (chain === 'ethereum') {
      return this.generateSecp256k1KeyPair(walletId, network, masterPassword);
    }

    if (chain === 'solana') {
      return this.generateEd25519KeyPair(walletId, network, masterPassword);
    }

    throw new WAIaaSError('CHAIN_NOT_SUPPORTED', {
      message: `Key generation for chain '${chain}' is not supported. Supported: 'solana', 'ethereum'.`,
    });
  }

  /**
   * Generate an Ed25519 keypair for Solana using sodium-native.
   */
  private async generateEd25519KeyPair(
    walletId: string,
    network: string,
    masterPassword: string,
  ): Promise<{ publicKey: string; encryptedPrivateKey: Uint8Array }> {
    const sodium = loadSodium();

    // Generate Ed25519 keypair using sodium
    const publicKeyBuf = Buffer.alloc(sodium.crypto_sign_PUBLICKEYBYTES);
    const secretKeyBuf = Buffer.alloc(sodium.crypto_sign_SECRETKEYBYTES);
    sodium.crypto_sign_keypair(publicKeyBuf, secretKeyBuf);

    // Encode public key as base58
    const publicKey = encodeBase58(publicKeyBuf);

    // Encrypt the 64-byte secret key
    const encrypted = await encrypt(secretKeyBuf, masterPassword);

    // Zero the plaintext secret key immediately
    sodium.sodium_memzero(secretKeyBuf);

    // Build keystore file v1
    const keystoreFile: KeystoreFileV1 = {
      version: 1,
      id: randomUUID(),
      chain: 'solana',
      network,
      curve: 'ed25519',
      publicKey,
      crypto: {
        cipher: 'aes-256-gcm',
        cipherparams: { iv: encrypted.iv.toString('hex') },
        ciphertext: encrypted.ciphertext.toString('hex'),
        authTag: encrypted.authTag.toString('hex'),
        kdf: 'argon2id',
        kdfparams: {
          salt: encrypted.salt.toString('hex'),
          ...KDF_PARAMS,
        },
      },
      metadata: {
        name: walletId,
        createdAt: new Date().toISOString(),
        lastUnlockedAt: null,
      },
    };

    // Write keystore file atomically (write-then-rename)
    await this.writeKeystoreFile(walletId, keystoreFile);

    return {
      publicKey,
      encryptedPrivateKey: new Uint8Array(encrypted.ciphertext),
    };
  }

  /**
   * Generate a secp256k1 keypair for EVM chains.
   * Uses crypto.randomBytes(32) for CSPRNG entropy and viem for EIP-55 address derivation.
   */
  private async generateSecp256k1KeyPair(
    walletId: string,
    network: string,
    masterPassword: string,
  ): Promise<{ publicKey: string; encryptedPrivateKey: Uint8Array }> {
    const sodium = loadSodium();

    // Generate 32-byte random private key via CSPRNG
    const privateKeyBuf = randomBytes(32);

    // Derive EIP-55 checksum address using viem
    const hexKey = `0x${privateKeyBuf.toString('hex')}` as `0x${string}`;
    const account = privateKeyToAccount(hexKey);
    const publicKey = account.address; // EIP-55 checksum address

    // Encrypt the 32-byte private key
    const encrypted = await encrypt(privateKeyBuf, masterPassword);

    // Zero the plaintext private key immediately
    sodium.sodium_memzero(privateKeyBuf);

    // Build keystore file v1
    const keystoreFile: KeystoreFileV1 = {
      version: 1,
      id: randomUUID(),
      chain: 'ethereum',
      network,
      curve: 'secp256k1',
      publicKey,
      crypto: {
        cipher: 'aes-256-gcm',
        cipherparams: { iv: encrypted.iv.toString('hex') },
        ciphertext: encrypted.ciphertext.toString('hex'),
        authTag: encrypted.authTag.toString('hex'),
        kdf: 'argon2id',
        kdfparams: {
          salt: encrypted.salt.toString('hex'),
          ...KDF_PARAMS,
        },
      },
      metadata: {
        name: walletId,
        createdAt: new Date().toISOString(),
        lastUnlockedAt: null,
      },
    };

    // Write keystore file atomically (write-then-rename)
    await this.writeKeystoreFile(walletId, keystoreFile);

    return {
      publicKey,
      encryptedPrivateKey: new Uint8Array(encrypted.ciphertext),
    };
  }

  /**
   * Decrypt private key from keystore file and store in guarded memory.
   *
   * @returns Guarded buffer containing the decrypted private key (readonly)
   */
  async decryptPrivateKey(walletId: string, masterPassword: string): Promise<Uint8Array> {
    const keystoreFile = await this.readKeystoreFile(walletId);

    const encrypted: EncryptedData = {
      iv: Buffer.from(keystoreFile.crypto.cipherparams.iv, 'hex'),
      ciphertext: Buffer.from(keystoreFile.crypto.ciphertext, 'hex'),
      authTag: Buffer.from(keystoreFile.crypto.authTag, 'hex'),
      salt: Buffer.from(keystoreFile.crypto.kdfparams.salt, 'hex'),
      kdfparams: keystoreFile.crypto.kdfparams,
    };

    const plaintext = await decrypt(encrypted, masterPassword);

    // Store in guarded memory
    const guarded = allocateGuarded(plaintext.length);
    writeToGuarded(guarded, plaintext);

    // Zero the plaintext Buffer
    plaintext.fill(0);

    // Track the guarded buffer
    this.guardedKeys.set(guarded, walletId);

    // Update lastUnlockedAt
    keystoreFile.metadata.lastUnlockedAt = new Date().toISOString();
    await this.writeKeystoreFile(walletId, keystoreFile);

    return new Uint8Array(guarded.buffer, guarded.byteOffset, guarded.byteLength);
  }

  /**
   * Release a decrypted key from guarded memory (zero-fill).
   */
  releaseKey(key: Uint8Array): void {
    // Find the guarded buffer that backs this Uint8Array
    for (const [guarded] of this.guardedKeys) {
      if (
        guarded.buffer === key.buffer &&
        guarded.byteOffset === key.byteOffset &&
        guarded.byteLength === key.byteLength
      ) {
        zeroAndRelease(guarded);
        this.guardedKeys.delete(guarded);
        return;
      }
    }
    // If not found in guardedKeys (e.g., fallback buffer), zero it manually
    key.fill(0);
  }

  /**
   * Check if a keystore file exists for the given wallet.
   */
  async hasKey(walletId: string): Promise<boolean> {
    try {
      await stat(this.keystorePath(walletId));
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Delete keystore file and release any loaded key from memory.
   */
  async deleteKey(walletId: string): Promise<void> {
    // Release from memory if loaded
    for (const [guarded, id] of this.guardedKeys) {
      if (id === walletId) {
        zeroAndRelease(guarded);
        this.guardedKeys.delete(guarded);
      }
    }

    // Delete file
    try {
      await unlink(this.keystorePath(walletId));
    } catch (error) {
      // Ignore if file doesn't exist
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
    }
  }

  /**
   * Lock all keys -- zero and release all guarded buffers.
   * Called during daemon shutdown.
   */
  lockAll(): void {
    for (const [guarded] of this.guardedKeys) {
      zeroAndRelease(guarded);
    }
    this.guardedKeys.clear();
  }

  /**
   * Check if sodium-native guarded memory is available.
   */
  get sodiumAvailable(): boolean {
    return isAvailable();
  }

  // --- Private helpers ---

  private keystorePath(walletId: string): string {
    return join(this.keystoreDir, `${walletId}.json`);
  }

  /**
   * Write keystore file atomically using write-then-rename pattern.
   * Sets file permission to 0600 (owner read/write only).
   */
  private async writeKeystoreFile(walletId: string, data: KeystoreFileV1): Promise<void> {
    const targetPath = this.keystorePath(walletId);
    const tempPath = join(dirname(targetPath), `.${walletId}.json.tmp`);

    const json = JSON.stringify(data, null, 2);
    await writeFile(tempPath, json, { encoding: 'utf-8', mode: 0o600 });
    await rename(tempPath, targetPath);
  }

  private async readKeystoreFile(walletId: string): Promise<KeystoreFileV1> {
    const filePath = this.keystorePath(walletId);
    let content: string;
    try {
      content = await readFile(filePath, 'utf-8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new WAIaaSError('WALLET_NOT_FOUND', {
          message: `Keystore file not found for wallet '${walletId}'`,
        });
      }
      throw error;
    }

    const parsed = JSON.parse(content) as KeystoreFileV1;
    if (parsed.version !== 1) {
      throw new WAIaaSError('KEYSTORE_LOCKED', {
        message: `Unsupported keystore version: ${String(parsed.version)}`,
      });
    }

    // Backward compat: files created before v1.4.1 lack the curve field
    if (!parsed.curve) {
      parsed.curve = 'ed25519';
    }

    return parsed;
  }
}

// --- Base58 encoding (Bitcoin alphabet) ---

const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

/**
 * Encode a Buffer as Base58 string (Solana public key format).
 */
function encodeBase58(buf: Buffer): string {
  // Count leading zeros
  let zeroes = 0;
  for (let i = 0; i < buf.length && buf[i] === 0; i++) {
    zeroes++;
  }

  // Convert to base58
  const size = Math.ceil((buf.length * 138) / 100) + 1;
  const b58 = new Uint8Array(size);
  let length = 0;

  for (let i = zeroes; i < buf.length; i++) {
    let carry = buf[i]!;
    let j = 0;
    for (let k = size - 1; k >= 0 && (carry !== 0 || j < length); k--, j++) {
      carry += 256 * (b58[k] ?? 0);
      b58[k] = carry % 58;
      carry = Math.floor(carry / 58);
    }
    length = j;
  }

  // Build string
  let str = '1'.repeat(zeroes);
  let leadingZeros = true;
  for (let i = 0; i < size; i++) {
    if (leadingZeros && b58[i] === 0) continue;
    leadingZeros = false;
    str += BASE58_ALPHABET[b58[i]!];
  }

  return str || '1';
}
