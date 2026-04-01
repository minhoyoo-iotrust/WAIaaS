import { describe, it, expect, vi, beforeEach } from 'vitest';

// We need to test the module in isolation, so we'll mock it per test
describe('native-loader', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
  });

  describe('isSea', () => {
    it('returns false in non-SEA environment', async () => {
      const { isSea } = await import('../infrastructure/native-loader.js');
      const result = await isSea();
      expect(result).toBe(false);
    });

    it('caches the SEA check result', async () => {
      const { isSea } = await import('../infrastructure/native-loader.js');
      const result1 = await isSea();
      const result2 = await isSea();
      expect(result1).toBe(false);
      expect(result2).toBe(false);
    });
  });

  describe('loadNativeAddon', () => {
    it('falls back to require in non-SEA mode', async () => {
      const { loadNativeAddon } = await import('../infrastructure/native-loader.js');
      // In normal test env, this should use require fallback
      // sodium-native is a real dep so it should load
      const mod = await loadNativeAddon('sodium-native.node', 'sodium-native');
      expect(mod).toBeDefined();
      expect(typeof mod).toBe('object');
    });

    it('falls back to require for better-sqlite3', async () => {
      const { loadBetterSqlite3 } = await import('../infrastructure/native-loader.js');
      const mod = await loadBetterSqlite3();
      expect(mod).toBeDefined();
    });

    it('falls back to require for argon2', async () => {
      const { loadArgon2 } = await import('../infrastructure/native-loader.js');
      const mod = await loadArgon2();
      expect(mod).toBeDefined();
    });
  });

  describe('pre-configured loaders', () => {
    it('loadSodiumNative returns sodium-native module', async () => {
      const { loadSodiumNative } = await import('../infrastructure/native-loader.js');
      const mod = await loadSodiumNative();
      expect(mod).toBeDefined();
      // sodium-native exports crypto_secretbox_KEYBYTES etc.
      expect(typeof (mod as Record<string, unknown>).crypto_secretbox_KEYBYTES).toBe('number');
    });

    it('loadBetterSqlite3 returns better-sqlite3 module', async () => {
      const { loadBetterSqlite3 } = await import('../infrastructure/native-loader.js');
      const mod = await loadBetterSqlite3();
      expect(mod).toBeDefined();
    });

    it('loadArgon2 returns argon2 module', async () => {
      const { loadArgon2 } = await import('../infrastructure/native-loader.js');
      const mod = await loadArgon2();
      expect(mod).toBeDefined();
      expect(typeof (mod as Record<string, unknown>).hash).toBe('function');
    });
  });
});
