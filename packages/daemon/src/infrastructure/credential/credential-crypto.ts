/**
 * AES-256-GCM encryption/decryption for credential vault values.
 *
 * Uses HKDF(SHA-256) with domain-separated salt/info to derive a 32-byte
 * subkey from the master password. Domain separation ensures credential keys
 * differ from settings-crypto keys even for the same master password.
 *
 * AAD (Additional Authenticated Data) binds each ciphertext to its credential
 * context ("{credentialId}:{walletId|global}:{type}"), preventing cross-credential
 * substitution attacks.
 *
 * @see docs/81-external-action-design.md D3.6
 */

import { randomBytes, createCipheriv, createDecipheriv, hkdfSync } from 'node:crypto';

// Domain-separated from settings-crypto (which uses 'waiaas-settings-v1' / 'settings-encryption')
const CREDENTIAL_HKDF_SALT = 'credential-vault';
const CREDENTIAL_HKDF_INFO = 'waiaas-credential-encryption';

// ---------------------------------------------------------------------------
// Key derivation
// ---------------------------------------------------------------------------

/**
 * Derive a 32-byte AES-256 key from master password using HKDF(SHA-256).
 * Domain-separated from settings key derivation.
 */
export function deriveCredentialKey(masterPassword: string): Buffer {
  return Buffer.from(
    hkdfSync('sha256', masterPassword, CREDENTIAL_HKDF_SALT, CREDENTIAL_HKDF_INFO, 32),
  );
}

// ---------------------------------------------------------------------------
// Encrypt / Decrypt
// ---------------------------------------------------------------------------

export interface EncryptedCredentialData {
  encryptedValue: Buffer;
  iv: Buffer;
  authTag: Buffer;
}

/**
 * Encrypt a plaintext credential value with AES-256-GCM.
 *
 * @param plaintext - The secret value to encrypt
 * @param masterPassword - Master password for HKDF key derivation
 * @param aad - Additional Authenticated Data ("{id}:{walletId|global}:{type}")
 * @returns Encrypted data with IV and auth tag
 */
export function encryptCredential(
  plaintext: string,
  masterPassword: string,
  aad: string,
): EncryptedCredentialData {
  const key = deriveCredentialKey(masterPassword);
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(Buffer.from(aad, 'utf8'));
  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  key.fill(0); // zero key from memory
  return { encryptedValue: ct, iv, authTag };
}

/**
 * Decrypt an AES-256-GCM encrypted credential value.
 *
 * @param data - Encrypted data from encryptCredential()
 * @param masterPassword - Master password for HKDF key derivation
 * @param aad - Same AAD used during encryption
 * @returns Decrypted plaintext string
 * @throws Error if password/AAD is wrong or data is corrupted (GCM authTag mismatch)
 */
export function decryptCredential(
  data: EncryptedCredentialData,
  masterPassword: string,
  aad: string,
): string {
  const key = deriveCredentialKey(masterPassword);
  const decipher = createDecipheriv('aes-256-gcm', key, data.iv);
  decipher.setAuthTag(data.authTag);
  decipher.setAAD(Buffer.from(aad, 'utf8'));
  const plain = Buffer.concat([decipher.update(data.encryptedValue), decipher.final()]);
  key.fill(0); // zero key from memory
  return plain.toString('utf8');
}
