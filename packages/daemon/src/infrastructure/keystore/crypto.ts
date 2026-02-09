/**
 * AES-256-GCM encryption/decryption with Argon2id key derivation.
 *
 * Design reference: 26-keystore-spec.md sections 2-3.
 * - Argon2id: m=65536 (64 MiB), t=3, p=4, hashLength=32
 * - AES-256-GCM: 12-byte IV, 16-byte authTag
 * - Salt: 16-byte CSPRNG
 */

import { randomBytes, createCipheriv, createDecipheriv } from 'node:crypto';
import argon2 from 'argon2';
import { WAIaaSError } from '@waiaas/core';

/** KDF parameters matching doc 26 specification. */
export const KDF_PARAMS = {
  memoryCost: 65536, // 64 MiB
  timeCost: 3,
  parallelism: 4,
  hashLength: 32,
} as const;

/** Encrypted data structure for keystore JSON serialization. */
export interface EncryptedData {
  /** 12-byte AES-GCM nonce */
  iv: Buffer;
  /** Encrypted ciphertext (same length as plaintext for GCM stream cipher) */
  ciphertext: Buffer;
  /** 16-byte GCM authentication tag */
  authTag: Buffer;
  /** 16-byte CSPRNG salt for Argon2id */
  salt: Buffer;
  /** KDF parameters for self-describing keystore files */
  kdfparams: {
    memoryCost: number;
    timeCost: number;
    parallelism: number;
    hashLength: number;
  };
}

/**
 * Derive a 32-byte AES-256 key from a password using Argon2id.
 *
 * @param password - Master password
 * @param salt - Optional 16-byte salt. If not provided, generates a new CSPRNG salt.
 * @returns 32-byte derived key and the salt used
 */
export async function deriveKey(
  password: string,
  salt?: Buffer,
): Promise<{ key: Buffer; salt: Buffer }> {
  const actualSalt = salt ?? randomBytes(16);

  const rawHash = await argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: KDF_PARAMS.memoryCost,
    timeCost: KDF_PARAMS.timeCost,
    parallelism: KDF_PARAMS.parallelism,
    hashLength: KDF_PARAMS.hashLength,
    salt: actualSalt,
    raw: true,
  });

  return { key: Buffer.from(rawHash), salt: actualSalt };
}

/**
 * Encrypt plaintext with AES-256-GCM using an Argon2id-derived key.
 *
 * @param plaintext - Data to encrypt (e.g., private key bytes)
 * @param password - Master password for key derivation
 * @returns Encrypted data with all parameters needed for decryption
 */
export async function encrypt(plaintext: Buffer, password: string): Promise<EncryptedData> {
  const iv = randomBytes(12); // GCM 96-bit nonce
  const { key, salt } = await deriveKey(password);

  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const authTag = cipher.getAuthTag();

  // Zero the derived key from memory
  key.fill(0);

  return {
    iv,
    ciphertext,
    authTag,
    salt,
    kdfparams: { ...KDF_PARAMS },
  };
}

/**
 * Decrypt AES-256-GCM ciphertext using an Argon2id-derived key.
 *
 * @param encrypted - Encrypted data with IV, authTag, salt, and KDF params
 * @param password - Master password for key derivation
 * @returns Decrypted plaintext buffer
 * @throws WAIaaSError with INVALID_MASTER_PASSWORD if authTag verification fails
 */
export async function decrypt(encrypted: EncryptedData, password: string): Promise<Buffer> {
  const { key } = await deriveKey(password, encrypted.salt);

  try {
    const decipher = createDecipheriv('aes-256-gcm', key, encrypted.iv);
    decipher.setAuthTag(encrypted.authTag);
    const plaintext = Buffer.concat([decipher.update(encrypted.ciphertext), decipher.final()]);
    return plaintext;
  } catch (error) {
    throw new WAIaaSError('INVALID_MASTER_PASSWORD', {
      message: 'Decryption failed: wrong password or corrupted data (GCM authTag mismatch)',
      cause: error instanceof Error ? error : undefined,
    });
  } finally {
    // Zero the derived key from memory
    key.fill(0);
  }
}
