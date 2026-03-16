/**
 * SettingsService -- operational settings CRUD with DB > config.toml > default fallback.
 *
 * Provides get/set/getAll/getAllMasked/importFromConfig/setMany for daemon settings.
 *
 * Fallback chain for get(key):
 *   1. DB settings table (encrypted values auto-decrypted)
 *   2. DaemonConfig object (already includes config.toml + env overrides + Zod defaults)
 *   3. SETTING_DEFINITIONS defaultValue (last resort)
 *
 * Credential values (isCredential=true) are AES-256-GCM encrypted before DB storage
 * and auto-decrypted on retrieval using HKDF-derived subkey from master password.
 *
 * @see setting-keys.ts for SETTING_DEFINITIONS (SSoT)
 * @see settings-crypto.ts for AES-GCM encrypt/decrypt
 */

import { eq } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { WAIaaSError } from '@waiaas/core';
import type * as schema from '../database/schema.js';
import { settings } from '../database/schema.js';
import type { DaemonConfig } from '../config/loader.js';
import { SETTING_DEFINITIONS, SETTING_CATEGORIES, getSettingDefinition } from './setting-keys.js';
import type { SettingDefinition } from './setting-keys.js';
import { encryptSettingValue, decryptSettingValue } from './settings-crypto.js';
import type { MasterPasswordRef } from '../../api/middleware/master-auth.js';

// ---------------------------------------------------------------------------
// SettingsService
// ---------------------------------------------------------------------------

export interface SettingsServiceOptions {
  db: BetterSQLite3Database<typeof schema>;
  config: DaemonConfig;
  masterPassword: string;
  /** Mutable ref for live password updates. Takes precedence over masterPassword. */
  passwordRef?: MasterPasswordRef;
}

export class SettingsService {
  private readonly db: BetterSQLite3Database<typeof schema>;
  private readonly config: DaemonConfig;
  private readonly masterPassword: string;
  private readonly passwordRef?: MasterPasswordRef;

  constructor(opts: SettingsServiceOptions) {
    this.db = opts.db;
    this.config = opts.config;
    this.masterPassword = opts.masterPassword;
    this.passwordRef = opts.passwordRef;
  }

  /** Resolve the current master password (passwordRef takes precedence). */
  private get currentPassword(): string {
    return this.passwordRef?.password ?? this.masterPassword;
  }

  // -------------------------------------------------------------------------
  // get(key) -- DB > config.toml > default fallback
  // -------------------------------------------------------------------------

  /**
   * Get a single setting value with fallback chain:
   * DB (auto-decrypt credentials) -> config.toml -> SETTING_DEFINITIONS default.
   *
   * @throws WAIaaSError if key is not defined in SETTING_DEFINITIONS
   */
  get(key: string): string {
    const def = getSettingDefinition(key);
    if (!def) {
      throw new WAIaaSError('ACTION_VALIDATION_FAILED', {
        message: `Unknown setting key: ${key}`,
      });
    }

    // 1. Check DB
    const row = this.db.select().from(settings).where(eq(settings.key, key)).get();
    if (row) {
      if (row.encrypted) {
        return decryptSettingValue(row.value, this.currentPassword);
      }
      return row.value;
    }

    // 2. Check config.toml (DaemonConfig already has env overrides + Zod defaults)
    const configValue = this.getConfigValue(def);
    if (configValue !== undefined) {
      return SettingsService.stringify(configValue);
    }

    // 3. Return definition default
    return def.defaultValue;
  }

  // -------------------------------------------------------------------------
  // set(key, value) -- UPSERT, auto-encrypt credentials
  // -------------------------------------------------------------------------

  /**
   * Set a single setting value. Credential keys are auto-encrypted with AES-GCM.
   *
   * @throws WAIaaSError if key is not defined in SETTING_DEFINITIONS
   */
  set(key: string, value: string): void {
    const def = getSettingDefinition(key);
    if (!def) {
      throw new WAIaaSError('ACTION_VALIDATION_FAILED', {
        message: `Unknown setting key: ${key}`,
      });
    }

    const isCredential = def.isCredential;
    const storedValue = isCredential
      ? encryptSettingValue(value, this.currentPassword)
      : value;

    this.db
      .insert(settings)
      .values({
        key,
        value: storedValue,
        encrypted: isCredential,
        category: def.category,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: settings.key,
        set: {
          value: storedValue,
          encrypted: isCredential,
          updatedAt: new Date(),
        },
      })
      .run();
  }

  // -------------------------------------------------------------------------
  // setMany(entries) -- batch set
  // -------------------------------------------------------------------------

  /**
   * Set multiple settings at once. Each entry is validated and auto-encrypted if credential.
   */
  setMany(entries: Array<{ key: string; value: string }>): void {
    for (const entry of entries) {
      this.set(entry.key, entry.value);
    }
  }

  // -------------------------------------------------------------------------
  // getAll() -- all settings grouped by category, credentials decrypted
  // -------------------------------------------------------------------------

  /**
   * Get all settings grouped by category. Credential values are decrypted.
   * For each defined key: DB value > config.toml value > default.
   */
  getAll(): Record<string, Record<string, string>> {
    const result: Record<string, Record<string, string>> = {};

    // Initialize categories
    for (const cat of SETTING_CATEGORIES) {
      result[cat] = {};
    }

    // Fetch all DB rows for O(1) lookup
    const dbRows = this.db.select().from(settings).all();
    const dbMap = new Map(dbRows.map((r) => [r.key, r]));

    for (const def of SETTING_DEFINITIONS) {
      const fieldName = def.key.split('.').slice(1).join('.');
      const row = dbMap.get(def.key);
      const catObj = result[def.category]!;

      if (row) {
        catObj[fieldName] = row.encrypted
          ? decryptSettingValue(row.value, this.currentPassword)
          : row.value;
      } else {
        // Fallback: config.toml -> default
        const configValue = this.getConfigValue(def);
        catObj[fieldName] = configValue !== undefined
          ? SettingsService.stringify(configValue)
          : def.defaultValue;
      }
    }

    // [Phase 331] Include dynamic tier override keys from DB
    // These are not in SETTING_DEFINITIONS but follow pattern actions.*_tier
    for (const [key, row] of dbMap) {
      if (key.startsWith('actions.') && key.endsWith('_tier')) {
        const fieldName = key.split('.').slice(1).join('.');
        if (!result['actions']![fieldName]) {
          result['actions']![fieldName] = row.encrypted
            ? decryptSettingValue(row.value, this.currentPassword)
            : row.value;
        }
      }
    }

    return result;
  }

  // -------------------------------------------------------------------------
  // getAllMasked() -- all settings grouped by category, credentials masked
  // -------------------------------------------------------------------------

  /**
   * Get all settings grouped by category. Credential values are masked:
   * - Non-empty credential -> true
   * - Empty credential -> false
   * - Non-credential -> actual value
   */
  getAllMasked(): Record<string, Record<string, string | boolean>> {
    const result: Record<string, Record<string, string | boolean>> = {};

    for (const cat of SETTING_CATEGORIES) {
      result[cat] = {};
    }

    const dbRows = this.db.select().from(settings).all();
    const dbMap = new Map(dbRows.map((r) => [r.key, r]));

    for (const def of SETTING_DEFINITIONS) {
      const fieldName = def.key.split('.').slice(1).join('.');
      const row = dbMap.get(def.key);
      const catObj = result[def.category]!;

      if (def.isCredential) {
        if (row) {
          // Credential in DB: mask as boolean (has value = true)
          try {
            const decrypted = decryptSettingValue(row.value, this.currentPassword);
            catObj[fieldName] = decrypted !== '';
          } catch {
            catObj[fieldName] = false;
          }
        } else {
          // Credential not in DB: check config fallback
          const configValue = this.getConfigValue(def);
          const val = configValue !== undefined ? SettingsService.stringify(configValue) : def.defaultValue;
          catObj[fieldName] = val !== '';
        }
      } else {
        // Non-credential: return actual value
        if (row) {
          catObj[fieldName] = row.value;
        } else {
          const configValue = this.getConfigValue(def);
          catObj[fieldName] = configValue !== undefined
            ? SettingsService.stringify(configValue)
            : def.defaultValue;
        }
      }
    }

    // [Phase 331] Include dynamic tier override keys from DB (non-credential)
    for (const [key, row] of dbMap) {
      if (key.startsWith('actions.') && key.endsWith('_tier')) {
        const fieldName = key.split('.').slice(1).join('.');
        if (!result['actions']![fieldName]) {
          result['actions']![fieldName] = row.value;
        }
      }
    }

    return result;
  }

  // -------------------------------------------------------------------------
  // setApiKey(providerName, value) -- set API key for any provider
  // -------------------------------------------------------------------------

  /**
   * Set an API key for a provider. Bypasses SETTING_DEFINITIONS validation
   * to support arbitrary provider names (e.g., custom/plugin providers).
   * Value is always encrypted as credential.
   */
  setApiKey(providerName: string, value: string): void {
    const key = `actions.${providerName}_api_key`;
    const storedValue = value
      ? encryptSettingValue(value, this.currentPassword)
      : '';

    this.db
      .insert(settings)
      .values({
        key,
        value: storedValue,
        encrypted: value.length > 0,
        category: 'actions',
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: settings.key,
        set: {
          value: storedValue,
          encrypted: value.length > 0,
          updatedAt: new Date(),
        },
      })
      .run();
  }

  // -------------------------------------------------------------------------
  // hasApiKey(providerName) -- check if API key exists for a provider
  // -------------------------------------------------------------------------

  /**
   * Check if an API key exists for a provider in settings.
   * Looks up 'actions.{providerName}_api_key' and returns true if non-empty value exists in DB.
   */
  hasApiKey(providerName: string): boolean {
    const key = `actions.${providerName}_api_key`;
    const row = this.db.select().from(settings).where(eq(settings.key, key)).get();
    if (!row) return false;
    try {
      const val = row.encrypted ? decryptSettingValue(row.value, this.currentPassword) : row.value;
      return val.length > 0;
    } catch {
      return false;
    }
  }

  // -------------------------------------------------------------------------
  // getApiKeyMasked(providerName) -- masked API key for display
  // -------------------------------------------------------------------------

  /**
   * Get masked API key for a provider (for display in admin UI).
   * Returns null if no key exists.
   */
  getApiKeyMasked(providerName: string): string | null {
    const key = `actions.${providerName}_api_key`;
    const row = this.db.select().from(settings).where(eq(settings.key, key)).get();
    if (!row) return null;
    try {
      const val = row.encrypted ? decryptSettingValue(row.value, this.currentPassword) : row.value;
      if (val.length === 0) return null;
      return maskApiKey(val);
    } catch {
      return null;
    }
  }

  // -------------------------------------------------------------------------
  // getApiKeyUpdatedAt(providerName) -- updatedAt for admin list display
  // -------------------------------------------------------------------------

  /**
   * Get the updatedAt timestamp for a provider's API key.
   * Returns null if no key exists or value is empty.
   */
  getApiKeyUpdatedAt(providerName: string): Date | null {
    const key = `actions.${providerName}_api_key`;
    const row = this.db.select().from(settings).where(eq(settings.key, key)).get();
    if (!row) return null;
    try {
      const val = row.encrypted ? decryptSettingValue(row.value, this.currentPassword) : row.value;
      if (val.length === 0) return null;
      return row.updatedAt;
    } catch {
      return null;
    }
  }

  // -------------------------------------------------------------------------
  // importFromConfig() -- first-boot config.toml -> DB import
  // -------------------------------------------------------------------------

  /**
   * Import config.toml operational settings into DB.
   * Only imports keys that:
   * - Are NOT already in DB (preserves existing values)
   * - Have a config.toml value different from the default
   *
   * Credential values are auto-encrypted during import.
   *
   * @returns Count of imported and skipped keys
   */
  importFromConfig(): { imported: number; skipped: number } {
    let imported = 0;
    let skipped = 0;

    for (const def of SETTING_DEFINITIONS) {
      // Check if already in DB
      const existing = this.db.select().from(settings).where(eq(settings.key, def.key)).get();
      if (existing) {
        skipped++;
        continue;
      }

      // Get config.toml value
      const configValue = this.getConfigValue(def);
      if (configValue === undefined) {
        skipped++;
        continue;
      }

      const strValue = SettingsService.stringify(configValue);

      // Skip if value equals default (don't fill DB with defaults)
      if (strValue === def.defaultValue) {
        skipped++;
        continue;
      }

      // Skip empty strings (no value to import)
      if (strValue === '') {
        skipped++;
        continue;
      }

      // Import: use set() which handles encryption
      this.set(def.key, strValue);
      imported++;
    }

    return { imported, skipped };
  }

  // -------------------------------------------------------------------------
  // Private: config.toml value lookup
  // -------------------------------------------------------------------------

  /**
   * Look up a value from the DaemonConfig object by configPath.
   * configPath format: "section.field" (e.g., "notifications.telegram_bot_token")
   */
  private getConfigValue(def: SettingDefinition): unknown {
    const parts = def.configPath.split('.');
    if (parts.length < 2) return undefined;

    const section = parts[0] as keyof DaemonConfig;
    const field = parts.slice(1).join('_'); // rejoin in case of multi-part field names

    const sectionObj = this.config[section];
    if (sectionObj === undefined || sectionObj === null || typeof sectionObj !== 'object') {
      return undefined;
    }

    const value = (sectionObj as Record<string, unknown>)[field];
    return value;
  }

  /**
   * Convert a config value to string for DB storage.
   * Arrays and objects are JSON-serialized; primitives use String().
   */
  private static stringify(value: unknown): string {
    if (Array.isArray(value) || (typeof value === 'object' && value !== null)) {
      return JSON.stringify(value);
    }
    return String(value);
  }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Mask an API key for display purposes.
 * Same logic as the old ApiKeyStore maskKey.
 */
function maskApiKey(key: string): string {
  if (key.length > 6) {
    return key.slice(0, 4) + '...' + key.slice(-2);
  }
  if (key.length >= 4) {
    return key.slice(0, 2) + '...';
  }
  return '****';
}
