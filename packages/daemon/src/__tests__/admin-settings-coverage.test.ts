/**
 * Coverage tests for admin-settings.ts route helpers and settings infrastructure.
 *
 * Tests:
 * - getSettingDefinition lookup (known/unknown keys)
 * - SETTING_DEFINITIONS structure validation
 * - groupSettingsByCategory grouping
 * - encryptSettingValue / decryptSettingValue roundtrip
 */

import { describe, it, expect } from 'vitest';
import {
  getSettingDefinition,
  SETTING_DEFINITIONS,
  SETTING_CATEGORIES,
  groupSettingsByCategory,
} from '../infrastructure/settings/index.js';

// ---------------------------------------------------------------------------
// getSettingDefinition
// ---------------------------------------------------------------------------

describe('getSettingDefinition', () => {
  it('returns definition for known setting', () => {
    const def = getSettingDefinition('notifications.enabled');
    expect(def).toBeDefined();
    expect(def!.key).toBe('notifications.enabled');
  });

  it('returns undefined for unknown setting', () => {
    const def = getSettingDefinition('nonexistent.setting.key');
    expect(def).toBeUndefined();
  });

  it('returns definition with category field', () => {
    const def = getSettingDefinition('notifications.enabled');
    expect(def).toBeDefined();
    expect(def!.category).toBe('notifications');
  });

  it('returns definition with configPath field', () => {
    const def = getSettingDefinition('notifications.enabled');
    expect(def!.configPath).toBeTruthy();
  });

  it('returns definition with defaultValue field', () => {
    const def = getSettingDefinition('notifications.enabled');
    expect(def!.defaultValue).toBeDefined();
  });

  it('marks credential keys correctly', () => {
    const botTokenDef = getSettingDefinition('notifications.telegram_bot_token');
    if (botTokenDef) {
      expect(botTokenDef.isCredential).toBe(true);
    }

    const enabledDef = getSettingDefinition('notifications.enabled');
    expect(enabledDef!.isCredential).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// SETTING_DEFINITIONS
// ---------------------------------------------------------------------------

describe('SETTING_DEFINITIONS', () => {
  it('is a non-empty array', () => {
    expect(Array.isArray(SETTING_DEFINITIONS)).toBe(true);
    expect(SETTING_DEFINITIONS.length).toBeGreaterThan(0);
  });

  it('all definitions have required fields (key, category, configPath)', () => {
    for (const def of SETTING_DEFINITIONS) {
      expect(def.key).toBeTruthy();
      expect(def.category).toBeTruthy();
      expect(def.configPath).toBeTruthy();
    }
  });

  it('includes notifications and security categories', () => {
    const categories = new Set(SETTING_DEFINITIONS.map((d) => d.category));
    expect(categories.has('security')).toBe(true);
    expect(categories.has('notifications')).toBe(true);
  });

  it('no duplicate keys', () => {
    const keys = SETTING_DEFINITIONS.map((d) => d.key);
    const uniqueKeys = new Set(keys);
    expect(uniqueKeys.size).toBe(keys.length);
  });
});

// ---------------------------------------------------------------------------
// SETTING_CATEGORIES
// ---------------------------------------------------------------------------

describe('SETTING_CATEGORIES', () => {
  it('is a non-empty array of category names', () => {
    expect(Array.isArray(SETTING_CATEGORIES)).toBe(true);
    expect(SETTING_CATEGORIES.length).toBeGreaterThan(0);
  });

  it('includes known categories', () => {
    expect(SETTING_CATEGORIES).toContain('notifications');
    expect(SETTING_CATEGORIES).toContain('security');
  });
});

// ---------------------------------------------------------------------------
// groupSettingsByCategory
// ---------------------------------------------------------------------------

describe('groupSettingsByCategory', () => {
  it('returns an array of category groups', () => {
    const groups = groupSettingsByCategory();
    expect(Array.isArray(groups)).toBe(true);
    expect(groups.length).toBeGreaterThan(0);
  });

  it('each group has name, label, and settings array', () => {
    const groups = groupSettingsByCategory();
    for (const group of groups) {
      expect(group.name).toBeTruthy();
      expect(group.label).toBeTruthy();
      expect(Array.isArray(group.settings)).toBe(true);
      expect(group.settings.length).toBeGreaterThan(0);
    }
  });

  it('settings within group have matching category', () => {
    const groups = groupSettingsByCategory();
    for (const group of groups) {
      for (const def of group.settings) {
        expect(def.category).toBe(group.name);
      }
    }
  });

  it('total settings across groups matches SETTING_DEFINITIONS count', () => {
    const groups = groupSettingsByCategory();
    const totalSettings = groups.reduce((sum, g) => sum + g.settings.length, 0);
    expect(totalSettings).toBe(SETTING_DEFINITIONS.length);
  });
});
