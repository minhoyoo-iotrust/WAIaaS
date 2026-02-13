/**
 * AES-256-GCM encryption/decryption for daemon settings credential values.
 *
 * Uses HKDF(SHA-256) to derive a settings-specific 32-byte subkey from the
 * master password. Unlike the keystore's Argon2id KDF (300ms+), this uses
 * a lightweight derivation suitable for frequent read operations.
 *
 * The fixed HKDF salt ensures the same master password always derives the
 * same key, enabling decrypt without storing an extra per-entry salt.
 *
 * Encrypted format: base64(JSON({ iv, ct, tag })) where iv/ct/tag are hex strings.
 */

import { randomBytes, createCipheriv, createDecipheriv, hkdfSync } from 'node:crypto';

const SETTINGS_HKDF_SALT = 'waiaas-settings-v1';
const SETTINGS_HKDF_INFO = 'settings-encryption';

/**
 * Derive a 32-byte AES-256 key from master password using HKDF(SHA-256).
 */
export function deriveSettingsKey(masterPassword: string): Buffer {
  return Buffer.from(
    hkdfSync('sha256', masterPassword, SETTINGS_HKDF_SALT, SETTINGS_HKDF_INFO, 32),
  );
}

interface EncryptedValue {
  iv: string; // hex
  ct: string; // hex (ciphertext)
  tag: string; // hex (authTag)
}

/**
 * Encrypt a plaintext setting value with AES-256-GCM.
 *
 * @param plaintext - The value to encrypt (e.g., bot token, webhook URL)
 * @param masterPassword - Master password for key derivation
 * @returns Base64-encoded JSON string containing { iv, ct, tag }
 */
export function encryptSettingValue(plaintext: string, masterPassword: string): string {
  const key = deriveSettingsKey(masterPassword);
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
 * Decrypt an AES-256-GCM encrypted setting value.
 *
 * @param encrypted - Base64-encoded JSON string from encryptSettingValue()
 * @param masterPassword - Master password for key derivation
 * @returns Decrypted plaintext string
 * @throws Error if password is wrong or data is corrupted (GCM authTag mismatch)
 */
export function decryptSettingValue(encrypted: string, masterPassword: string): string {
  const key = deriveSettingsKey(masterPassword);
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

/**
 * Settings keys whose values must be encrypted before DB storage.
 * SettingsService checks this set to determine encrypt/decrypt behavior.
 */
export const CREDENTIAL_KEYS = new Set([
  'notifications.telegram_bot_token',
  'notifications.discord_webhook_url',
  'security.jwt_secret',
]);
