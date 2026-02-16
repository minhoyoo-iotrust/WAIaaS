/**
 * SettingsService unit and integration tests.
 *
 * Tests the full fallback chain (DB > config.toml > default),
 * credential auto-encryption/decryption, importFromConfig() logic,
 * getAll/getAllMasked grouped output, and setMany batch operations.
 *
 * Uses in-memory SQLite with pushSchema for a fresh DB per test.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { Database as DatabaseType } from 'better-sqlite3';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { eq } from 'drizzle-orm';
import { createDatabase, pushSchema, settings } from '../infrastructure/database/index.js';
import type * as schema from '../infrastructure/database/schema.js';
import { DaemonConfigSchema } from '../infrastructure/config/loader.js';
import type { DaemonConfig } from '../infrastructure/config/loader.js';
import { SettingsService } from '../infrastructure/settings/settings-service.js';
import { SETTING_DEFINITIONS, getSettingDefinition } from '../infrastructure/settings/setting-keys.js';
import { decryptSettingValue } from '../infrastructure/settings/settings-crypto.js';

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const TEST_MASTER_PASSWORD = 'test-master-password';

/** Create a fresh in-memory DB with all tables. */
function createTestDb(): { sqlite: DatabaseType; db: BetterSQLite3Database<typeof schema> } {
  const conn = createDatabase(':memory:');
  pushSchema(conn.sqlite);
  return conn;
}

/** Create a DaemonConfig with defaults + optional overrides. */
function createTestConfig(overrides?: Partial<Record<string, unknown>>): DaemonConfig {
  return DaemonConfigSchema.parse(overrides ?? {});
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('SettingsService', () => {
  let sqlite: DatabaseType;
  let db: BetterSQLite3Database<typeof schema>;
  let config: DaemonConfig;
  let service: SettingsService;

  beforeEach(() => {
    const conn = createTestDb();
    sqlite = conn.sqlite;
    db = conn.db;
    config = createTestConfig();
    service = new SettingsService({
      db,
      config,
      masterPassword: TEST_MASTER_PASSWORD,
    });
  });

  afterEach(() => {
    try { sqlite.close(); } catch { /* ignore */ }
  });

  // -------------------------------------------------------------------------
  // get()
  // -------------------------------------------------------------------------

  describe('get()', () => {
    it('returns DB value when exists', () => {
      // Directly insert a non-credential value into DB
      db.insert(settings).values({
        key: 'daemon.log_level',
        value: 'debug',
        encrypted: false,
        category: 'daemon',
        updatedAt: new Date(),
      }).run();

      expect(service.get('daemon.log_level')).toBe('debug');
    });

    it('returns config.toml value when DB empty', () => {
      // Default config has log_level = 'info'
      expect(service.get('daemon.log_level')).toBe('info');
    });

    it('returns default when DB empty and config is default', () => {
      // notifications.locale defaults to 'en' in both config and SETTING_DEFINITIONS
      expect(service.get('notifications.locale')).toBe('en');
    });

    it('decrypts credential value from DB', () => {
      // Use set() to store an encrypted credential
      service.set('notifications.telegram_bot_token', 'my-secret-token-123');

      // Verify it comes back decrypted
      const result = service.get('notifications.telegram_bot_token');
      expect(result).toBe('my-secret-token-123');
    });

    it('throws for unknown key', () => {
      expect(() => service.get('nonexistent.key')).toThrow('Unknown setting key');
    });
  });

  // -------------------------------------------------------------------------
  // set()
  // -------------------------------------------------------------------------

  describe('set()', () => {
    it('stores plain value for non-credential', () => {
      service.set('daemon.log_level', 'warn');

      // Read raw DB row to confirm it's stored as plaintext
      const row = db.select().from(settings).where(eq(settings.key, 'daemon.log_level')).get();
      expect(row).toBeDefined();
      expect(row!.value).toBe('warn');
      expect(row!.encrypted).toBe(false);
      expect(row!.category).toBe('daemon');
    });

    it('encrypts credential value', () => {
      service.set('notifications.telegram_bot_token', 'bot123:secret');

      // Read raw DB row - value should be encrypted (not plaintext)
      const row = db.select().from(settings).where(eq(settings.key, 'notifications.telegram_bot_token')).get();
      expect(row).toBeDefined();
      expect(row!.value).not.toBe('bot123:secret');
      expect(row!.encrypted).toBe(true);
      expect(row!.category).toBe('notifications');

      // Decrypt to verify round-trip
      const decrypted = decryptSettingValue(row!.value, TEST_MASTER_PASSWORD);
      expect(decrypted).toBe('bot123:secret');
    });

    it('updates existing value (upsert)', () => {
      service.set('daemon.log_level', 'debug');
      expect(service.get('daemon.log_level')).toBe('debug');

      service.set('daemon.log_level', 'error');
      expect(service.get('daemon.log_level')).toBe('error');

      // Only one row should exist
      const rows = db.select().from(settings).where(eq(settings.key, 'daemon.log_level')).all();
      expect(rows).toHaveLength(1);
    });

    it('throws for unknown key', () => {
      expect(() => service.set('nonexistent.key', 'value')).toThrow('Unknown setting key');
    });
  });

  // -------------------------------------------------------------------------
  // setMany()
  // -------------------------------------------------------------------------

  describe('setMany()', () => {
    it('stores multiple values', () => {
      service.setMany([
        { key: 'daemon.log_level', value: 'trace' },
        { key: 'notifications.locale', value: 'ko' },
        { key: 'security.max_pending_tx', value: '50' },
      ]);

      expect(service.get('daemon.log_level')).toBe('trace');
      expect(service.get('notifications.locale')).toBe('ko');
      expect(service.get('security.max_pending_tx')).toBe('50');
    });
  });

  // -------------------------------------------------------------------------
  // importFromConfig()
  // -------------------------------------------------------------------------

  describe('importFromConfig()', () => {
    it('imports non-default config.toml values into DB', () => {
      // Create config with non-default values
      const customConfig = createTestConfig({
        notifications: { telegram_chat_id: '12345' },
      });
      const svc = new SettingsService({
        db,
        config: customConfig,
        masterPassword: TEST_MASTER_PASSWORD,
      });

      const result = svc.importFromConfig();
      expect(result.imported).toBeGreaterThan(0);

      // Check imported value
      expect(svc.get('notifications.telegram_chat_id')).toBe('12345');
    });

    it('skips keys already in DB', () => {
      // Pre-set a value in DB
      service.set('daemon.log_level', 'trace');

      // Create config with a different value for the same key
      const customConfig = createTestConfig({
        daemon: { log_level: 'error' },
      });
      const svc = new SettingsService({
        db,
        config: customConfig,
        masterPassword: TEST_MASTER_PASSWORD,
      });

      svc.importFromConfig();

      // DB value should be preserved (not overwritten by config)
      expect(svc.get('daemon.log_level')).toBe('trace');
    });

    it('skips keys with default values', () => {
      // Default config -- everything at defaults
      const result = service.importFromConfig();

      // No non-default values to import
      expect(result.imported).toBe(0);
      expect(result.skipped).toBe(SETTING_DEFINITIONS.length);
    });

    it('encrypts credential values during import', () => {
      const customConfig = createTestConfig({
        notifications: { telegram_bot_token: 'imported-secret-token' },
      });
      const svc = new SettingsService({
        db,
        config: customConfig,
        masterPassword: TEST_MASTER_PASSWORD,
      });

      svc.importFromConfig();

      // Check raw DB row is encrypted
      const row = db.select().from(settings)
        .where(eq(settings.key, 'notifications.telegram_bot_token')).get();
      expect(row).toBeDefined();
      expect(row!.encrypted).toBe(true);
      expect(row!.value).not.toBe('imported-secret-token');

      // But get() returns decrypted value
      expect(svc.get('notifications.telegram_bot_token')).toBe('imported-secret-token');
    });

    it('returns count of imported and skipped', () => {
      const customConfig = createTestConfig({
        daemon: { log_level: 'debug' },
        notifications: { locale: 'ko', telegram_chat_id: '999' },
      });
      const svc = new SettingsService({
        db,
        config: customConfig,
        masterPassword: TEST_MASTER_PASSWORD,
      });

      const result = svc.importFromConfig();
      // 3 non-default values: log_level=debug, locale=ko, telegram_chat_id=999
      expect(result.imported).toBe(3);
      expect(result.imported + result.skipped).toBe(SETTING_DEFINITIONS.length);
    });
  });

  // -------------------------------------------------------------------------
  // getAll()
  // -------------------------------------------------------------------------

  describe('getAll()', () => {
    it('returns all settings grouped by category', () => {
      const all = service.getAll();

      // All 5 categories present
      expect(Object.keys(all)).toEqual(
        expect.arrayContaining(['notifications', 'rpc', 'security', 'daemon', 'walletconnect']),
      );

      // daemon category has log_level
      expect(all.daemon).toHaveProperty('log_level');
      expect(all.daemon!.log_level).toBe('info');

      // notifications category has multiple keys
      expect(all.notifications).toHaveProperty('enabled');
      expect(all.notifications).toHaveProperty('telegram_bot_token');
      expect(all.notifications).toHaveProperty('locale');
    });

    it('decrypts credential values', () => {
      service.set('notifications.telegram_bot_token', 'decrypted-secret');

      const all = service.getAll();
      expect(all.notifications!.telegram_bot_token).toBe('decrypted-secret');
    });
  });

  // -------------------------------------------------------------------------
  // getAllMasked()
  // -------------------------------------------------------------------------

  describe('getAllMasked()', () => {
    it('masks credential values as boolean', () => {
      service.set('notifications.telegram_bot_token', 'secret-token');

      const masked = service.getAllMasked();

      // Credential with value -> true
      expect(masked.notifications!.telegram_bot_token).toBe(true);

      // Non-credential -> string value
      expect(typeof masked.daemon!.log_level).toBe('string');
    });

    it('masks empty credential as false', () => {
      // Default telegram_bot_token is '' -- no DB entry
      const masked = service.getAllMasked();
      expect(masked.notifications!.telegram_bot_token).toBe(false);
    });

    it('returns non-credential values as strings', () => {
      service.set('daemon.log_level', 'debug');
      const masked = service.getAllMasked();
      expect(masked.daemon!.log_level).toBe('debug');
    });
  });

  // -------------------------------------------------------------------------
  // Fallback chain integration
  // -------------------------------------------------------------------------

  describe('fallback chain', () => {
    it('DB value overrides config.toml value', () => {
      // Config has default log_level = 'info'
      expect(service.get('daemon.log_level')).toBe('info');

      // Set in DB
      service.set('daemon.log_level', 'trace');
      expect(service.get('daemon.log_level')).toBe('trace');
    });

    it('config.toml value overrides default', () => {
      // Create config with non-default value
      const customConfig = createTestConfig({
        daemon: { log_level: 'error' },
      });
      const svc = new SettingsService({
        db,
        config: customConfig,
        masterPassword: TEST_MASTER_PASSWORD,
      });

      // No DB value -> falls back to config.toml
      expect(svc.get('daemon.log_level')).toBe('error');
    });

    it('full chain: set DB -> get DB -> delete from DB -> get config', () => {
      const customConfig = createTestConfig({
        daemon: { log_level: 'warn' },
      });
      const svc = new SettingsService({
        db,
        config: customConfig,
        masterPassword: TEST_MASTER_PASSWORD,
      });

      // 1. Set in DB
      svc.set('daemon.log_level', 'trace');
      expect(svc.get('daemon.log_level')).toBe('trace');

      // 2. Delete from DB (simulate removal)
      db.delete(settings).where(eq(settings.key, 'daemon.log_level')).run();

      // 3. Now falls back to config.toml value
      expect(svc.get('daemon.log_level')).toBe('warn');
    });
  });

  // -------------------------------------------------------------------------
  // setting-keys consistency
  // -------------------------------------------------------------------------

  describe('setting-keys', () => {
    it('all definitions have valid categories', () => {
      const validCategories = new Set(['notifications', 'rpc', 'security', 'daemon', 'walletconnect', 'oracle', 'display', 'autostop', 'monitoring']);
      for (const def of SETTING_DEFINITIONS) {
        expect(validCategories.has(def.category)).toBe(true);
      }
    });

    it('all keys are unique', () => {
      const keys = SETTING_DEFINITIONS.map((d) => d.key);
      expect(new Set(keys).size).toBe(keys.length);
    });

    it('getSettingDefinition returns correct definition', () => {
      const def = getSettingDefinition('daemon.log_level');
      expect(def).toBeDefined();
      expect(def!.category).toBe('daemon');
      expect(def!.defaultValue).toBe('info');
      expect(def!.isCredential).toBe(false);
    });

    it('getSettingDefinition returns undefined for unknown key', () => {
      expect(getSettingDefinition('nonexistent.key')).toBeUndefined();
    });

    it('credential keys are marked correctly', () => {
      const credentialDefs = SETTING_DEFINITIONS.filter((d) => d.isCredential);
      expect(credentialDefs.length).toBeGreaterThan(0);

      for (const def of credentialDefs) {
        expect(
          ['notifications.telegram_bot_token', 'notifications.discord_webhook_url', 'notifications.slack_webhook_url', 'oracle.coingecko_api_key'].includes(def.key),
        ).toBe(true);
      }
    });

    it('has expected number of definitions', () => {
      // 9 notifications + 14 rpc + 11 security + 1 daemon + 1 walletconnect + 2 oracle + 1 display + 6 autostop + 5 monitoring = 50
      expect(SETTING_DEFINITIONS.length).toBe(50);
    });
  });
});
