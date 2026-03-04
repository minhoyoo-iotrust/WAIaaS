/**
 * AES-256-GCM encryption/decryption for per-wallet AA provider API keys.
 *
 * Uses HKDF(SHA-256) with a different info string than settings-crypto.ts
 * to derive a separate subkey from the master password.
 *
 * Encrypted format: base64(JSON({ iv, ct, tag })) where iv/ct/tag are hex strings.
 * Same format as settings-crypto.ts for consistency.
 *
 * @see packages/daemon/src/infrastructure/settings/settings-crypto.ts
 */

import { randomBytes, createCipheriv, createDecipheriv, hkdfSync } from 'node:crypto';

const AA_PROVIDER_HKDF_SALT = 'waiaas-settings-v1';
const AA_PROVIDER_HKDF_INFO = 'aa-provider-key-encryption';

interface EncryptedValue {
  iv: string; // hex
  ct: string; // hex (ciphertext)
  tag: string; // hex (authTag)
}

/**
 * Derive a 32-byte AES-256 key from master password using HKDF(SHA-256).
 */
function deriveProviderKey(masterPassword: string): Buffer {
  return Buffer.from(
    hkdfSync('sha256', masterPassword, AA_PROVIDER_HKDF_SALT, AA_PROVIDER_HKDF_INFO, 32),
  );
}

/**
 * Encrypt an AA provider API key with AES-256-GCM.
 *
 * @param plaintext - The API key to encrypt
 * @param masterPassword - Master password for key derivation
 * @returns Base64-encoded JSON string containing { iv, ct, tag }
 */
export function encryptProviderApiKey(plaintext: string, masterPassword: string): string {
  const key = deriveProviderKey(masterPassword);
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  key.fill(0); // zero key from memory
  const obj: EncryptedValue = {
    iv: iv.toString('hex'),
    ct: ct.toString('hex'),
    tag: tag.toString('hex'),
  };
  return Buffer.from(JSON.stringify(obj)).toString('base64');
}

/**
 * Decrypt an AES-256-GCM encrypted AA provider API key.
 *
 * @param encrypted - Base64-encoded JSON string from encryptProviderApiKey()
 * @param masterPassword - Master password for key derivation
 * @returns Decrypted plaintext API key
 * @throws Error if password is wrong or data is corrupted (GCM authTag mismatch)
 */
export function decryptProviderApiKey(encrypted: string, masterPassword: string): string {
  const key = deriveProviderKey(masterPassword);
  const obj: EncryptedValue = JSON.parse(Buffer.from(encrypted, 'base64').toString('utf8'));
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(obj.iv, 'hex'));
  decipher.setAuthTag(Buffer.from(obj.tag, 'hex'));
  const plain = Buffer.concat([
    decipher.update(Buffer.from(obj.ct, 'hex')),
    decipher.final(),
  ]);
  key.fill(0); // zero key from memory
  return plain.toString('utf8');
}
