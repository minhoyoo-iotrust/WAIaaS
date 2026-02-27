/**
 * Re-encryption service for keystore files and DB-stored credentials.
 *
 * Used by the master password change API (PUT /v1/admin/master-password).
 *
 * Keystore files: decrypt with old password → re-encrypt with new password → atomic rename.
 * Settings/API keys: decrypt with old password → re-encrypt with new password → DB transaction.
 *
 * Rollback: on failure, temp files are cleaned up and originals are preserved.
 */

import { readFile, writeFile, rename, unlink, readdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { encrypt, decrypt, type EncryptedData, KDF_PARAMS } from './crypto.js';
import { encryptSettingValue, decryptSettingValue } from '../settings/settings-crypto.js';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type { Database as SQLiteDatabase } from 'better-sqlite3';
import { eq } from 'drizzle-orm';
import { settings, apiKeys } from '../database/schema.js';
import type * as schema from '../database/schema.js';

// ---------------------------------------------------------------------------
// Keystore file re-encryption
// ---------------------------------------------------------------------------

/**
 * Re-encrypt all keystore files in the given directory.
 * Uses atomic write (temp file → rename) to prevent corruption.
 *
 * @returns Number of keystore files re-encrypted
 */
export async function reEncryptKeystores(
  keystoreDir: string,
  oldPassword: string,
  newPassword: string,
): Promise<number> {
  const files = await readdir(keystoreDir);
  const jsonFiles = files.filter(f => f.endsWith('.json') && !f.startsWith('.'));

  const tempPaths: string[] = [];

  try {
    for (const file of jsonFiles) {
      const filePath = join(keystoreDir, file);
      const tempPath = join(dirname(filePath), `.${file}.reenc.tmp`);
      tempPaths.push(tempPath);

      // Read and parse keystore
      const content = await readFile(filePath, 'utf-8');
      const parsed = JSON.parse(content);

      // Reconstruct EncryptedData from keystore format
      const encrypted: EncryptedData = {
        iv: Buffer.from(parsed.crypto.cipherparams.iv, 'hex'),
        ciphertext: Buffer.from(parsed.crypto.ciphertext, 'hex'),
        authTag: Buffer.from(parsed.crypto.authTag, 'hex'),
        salt: Buffer.from(parsed.crypto.kdfparams.salt, 'hex'),
        kdfparams: parsed.crypto.kdfparams,
      };

      // Decrypt with old password
      const plaintext = await decrypt(encrypted, oldPassword);

      // Re-encrypt with new password
      const reEncrypted = await encrypt(plaintext, newPassword);

      // Zero plaintext
      plaintext.fill(0);

      // Update keystore file structure
      parsed.crypto.cipherparams.iv = reEncrypted.iv.toString('hex');
      parsed.crypto.ciphertext = reEncrypted.ciphertext.toString('hex');
      parsed.crypto.authTag = reEncrypted.authTag.toString('hex');
      parsed.crypto.kdfparams = {
        salt: reEncrypted.salt.toString('hex'),
        ...KDF_PARAMS,
      };

      // Write temp file atomically
      await writeFile(tempPath, JSON.stringify(parsed, null, 2), {
        encoding: 'utf-8',
        mode: 0o600,
      });
    }

    // All temp files written successfully → rename to final
    for (let i = 0; i < jsonFiles.length; i++) {
      const filePath = join(keystoreDir, jsonFiles[i]!);
      await rename(tempPaths[i]!, filePath);
    }

    return jsonFiles.length;
  } catch (error) {
    // Rollback: clean up temp files
    for (const tempPath of tempPaths) {
      try {
        await unlink(tempPath);
      } catch {
        // Ignore cleanup errors
      }
    }
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Settings + API keys re-encryption
// ---------------------------------------------------------------------------

/**
 * Re-encrypt all credential settings and API keys in the database.
 * Uses a SQLite transaction for atomicity.
 *
 * @returns Number of re-encrypted entries (settings + api keys)
 */
export function reEncryptSettings(
  db: BetterSQLite3Database<typeof schema>,
  sqlite: SQLiteDatabase | undefined,
  oldPassword: string,
  newPassword: string,
): number {
  let count = 0;

  // Use raw SQLite transaction for atomicity
  const run = () => {
    // Re-encrypt settings with encrypted=true
    const encryptedSettings = db
      .select()
      .from(settings)
      .where(eq(settings.encrypted, true))
      .all();

    for (const row of encryptedSettings) {
      const plaintext = decryptSettingValue(row.value, oldPassword);
      const reEncrypted = encryptSettingValue(plaintext, newPassword);
      db.update(settings)
        .set({ value: reEncrypted, updatedAt: new Date() })
        .where(eq(settings.key, row.key))
        .run();
      count++;
    }

    // Re-encrypt API keys
    const allApiKeys = db.select().from(apiKeys).all();
    for (const row of allApiKeys) {
      const plaintext = decryptSettingValue(row.encryptedKey, oldPassword);
      const reEncrypted = encryptSettingValue(plaintext, newPassword);
      db.update(apiKeys)
        .set({ encryptedKey: reEncrypted, updatedAt: new Date() })
        .where(eq(apiKeys.providerName, row.providerName))
        .run();
      count++;
    }
  };

  if (sqlite) {
    sqlite.transaction(run)();
  } else {
    run();
  }

  return count;
}
