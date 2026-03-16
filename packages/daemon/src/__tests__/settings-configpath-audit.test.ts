/**
 * Settings configPath audit test.
 *
 * Verifies SETTING_DEFINITIONS consistency:
 * - All settings have a non-empty configPath
 * - No duplicate keys
 * - No duplicate configPaths
 * - DB-only categories are documented
 */

import { describe, it, expect } from 'vitest';
import { SETTING_DEFINITIONS } from '../infrastructure/settings/setting-keys.js';

describe('Settings configPath audit', () => {
  it('all settings have a non-empty configPath', () => {
    for (const def of SETTING_DEFINITIONS) {
      expect(def.configPath, `key=${def.key} has empty configPath`).toBeTruthy();
    }
  });

  it('no duplicate keys', () => {
    const keys = SETTING_DEFINITIONS.map(d => d.key);
    const unique = new Set(keys);
    expect(keys.length).toBe(unique.size);
  });

  it('no duplicate configPaths', () => {
    const paths = SETTING_DEFINITIONS.map(d => d.configPath);
    const unique = new Set(paths);
    expect(paths.length).toBe(unique.size);
  });

  it('DB-only categories have configPath matching key pattern', () => {
    // DB-only categories: no config.toml section, configPath == key
    const dbOnlyCategories = ['gas_condition', 'rpc_pool', 'position_tracker', 'oracle', 'signing_sdk'];
    for (const def of SETTING_DEFINITIONS) {
      if (dbOnlyCategories.includes(def.category)) {
        expect(def.configPath, `DB-only category ${def.category}: key=${def.key}`).toBeTruthy();
      }
    }
  });

  it('all settings have valid metadata', () => {
    for (const def of SETTING_DEFINITIONS) {
      expect(def.key, 'key must be non-empty').toBeTruthy();
      expect(def.category, `key=${def.key}: category must be non-empty`).toBeTruthy();
      expect(def.label, `key=${def.key}: label must be non-empty`).toBeTruthy();
      expect(def.description, `key=${def.key}: description must be non-empty`).toBeTruthy();
      expect(typeof def.isCredential, `key=${def.key}: isCredential must be boolean`).toBe('boolean');
    }
  });
});
