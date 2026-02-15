/**
 * ApiKeyStore -- encrypted storage for Action Provider API keys.
 *
 * Uses the same HKDF + AES-256-GCM pattern as settings-crypto.ts to
 * encrypt API keys before DB storage and decrypt on retrieval.
 *
 * Each provider has a single API key row (provider_name = PK).
 * set() performs upsert (insert or update).
 *
 * @see settings-crypto.ts for encryption internals
 */

import { eq } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type * as schema from '../database/schema.js';
import { apiKeys } from '../database/schema.js';
import { encryptSettingValue, decryptSettingValue } from '../settings/settings-crypto.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ApiKeyListEntry {
  providerName: string;
  hasKey: boolean;
  maskedKey: string | null;
  updatedAt: Date;
}

// ---------------------------------------------------------------------------
// ApiKeyStore
// ---------------------------------------------------------------------------

export class ApiKeyStore {
  constructor(
    private readonly db: BetterSQLite3Database<typeof schema>,
    private readonly masterPassword: string,
  ) {}

  /**
   * Store or update an API key for a provider. The key is encrypted with
   * AES-256-GCM before storage. createdAt is set only on insert;
   * updatedAt is always refreshed.
   */
  set(providerName: string, apiKey: string): void {
    const encrypted = encryptSettingValue(apiKey, this.masterPassword);
    const now = new Date(Math.floor(Date.now() / 1000) * 1000);

    this.db
      .insert(apiKeys)
      .values({
        providerName,
        encryptedKey: encrypted,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: apiKeys.providerName,
        set: {
          encryptedKey: encrypted,
          updatedAt: now,
        },
      })
      .run();
  }

  /**
   * Retrieve and decrypt an API key for a provider.
   * Returns null if no key is stored for this provider.
   */
  get(providerName: string): string | null {
    const row = this.db
      .select()
      .from(apiKeys)
      .where(eq(apiKeys.providerName, providerName))
      .get();

    if (!row) return null;
    return decryptSettingValue(row.encryptedKey, this.masterPassword);
  }

  /**
   * Retrieve a masked version of the API key for display purposes.
   *
   * Masking rules:
   * - length > 6: first 4 chars + '...' + last 2 chars
   * - length 4-6: first 2 chars + '...'
   * - length < 4: '****'
   *
   * Returns null if no key is stored for this provider.
   */
  getMasked(providerName: string): string | null {
    const key = this.get(providerName);
    if (key === null) return null;
    return maskKey(key);
  }

  /**
   * Check whether a key exists for a provider (without decrypting).
   */
  has(providerName: string): boolean {
    const row = this.db
      .select({ providerName: apiKeys.providerName })
      .from(apiKeys)
      .where(eq(apiKeys.providerName, providerName))
      .get();

    return row !== undefined;
  }

  /**
   * Delete an API key for a provider.
   * Returns true if a row was deleted, false if no row existed.
   */
  delete(providerName: string): boolean {
    const result = this.db
      .delete(apiKeys)
      .where(eq(apiKeys.providerName, providerName))
      .run();

    return result.changes > 0;
  }

  /**
   * List all stored API keys with masked values.
   */
  listAll(): ApiKeyListEntry[] {
    const rows = this.db.select().from(apiKeys).all();

    return rows.map((row) => {
      const decrypted = decryptSettingValue(row.encryptedKey, this.masterPassword);
      return {
        providerName: row.providerName,
        hasKey: true,
        maskedKey: maskKey(decrypted),
        updatedAt: row.updatedAt,
      };
    });
  }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function maskKey(key: string): string {
  if (key.length > 6) {
    return key.slice(0, 4) + '...' + key.slice(-2);
  }
  if (key.length >= 4) {
    return key.slice(0, 2) + '...';
  }
  return '****';
}
