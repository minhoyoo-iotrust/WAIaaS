/**
 * Tests for GET /v1/admin/settings/schema endpoint.
 * Verifies setting definitions are exposed with metadata.
 */
import { describe, it, expect } from 'vitest';
import { SETTING_DEFINITIONS } from '../infrastructure/settings/setting-keys.js';

// We test the helper functions directly since they're pure functions
describe('GET /v1/admin/settings/schema', () => {
  it('SETTING_DEFINITIONS entries have label and description', () => {
    // After implementation, every entry should have label and description
    for (const def of SETTING_DEFINITIONS) {
      expect(def).toHaveProperty('label');
      expect(def).toHaveProperty('description');
      expect(typeof (def as any).label).toBe('string');
      expect(typeof (def as any).description).toBe('string');
      expect((def as any).label.length).toBeGreaterThan(0);
      expect((def as any).description.length).toBeGreaterThan(0);
    }
  });

  it('each entry has key, category, defaultValue, isCredential', () => {
    for (const def of SETTING_DEFINITIONS) {
      expect(def.key).toBeTruthy();
      expect(def.category).toBeTruthy();
      expect(typeof def.defaultValue).toBe('string');
      expect(typeof def.isCredential).toBe('boolean');
    }
  });

  it('label is derived from key last segment', () => {
    // Test a few known keys
    const enabledDef = SETTING_DEFINITIONS.find(d => d.key === 'notifications.enabled');
    expect(enabledDef).toBeDefined();
    expect((enabledDef as any).label).toBeTruthy();

    const botTokenDef = SETTING_DEFINITIONS.find(d => d.key === 'notifications.telegram_bot_token');
    expect(botTokenDef).toBeDefined();
    expect((botTokenDef as any).label).toContain('Telegram Bot Token');
  });

  it('credential settings have isCredential=true', () => {
    const credDefs = SETTING_DEFINITIONS.filter(d => d.isCredential);
    expect(credDefs.length).toBeGreaterThan(0);

    // Known credential keys
    const knownCredKeys = [
      'notifications.telegram_bot_token',
      'notifications.discord_webhook_url',
      'notifications.slack_webhook_url',
      'oracle.coingecko_api_key',
      'telegram.bot_token',
    ];
    for (const key of knownCredKeys) {
      const def = SETTING_DEFINITIONS.find(d => d.key === key);
      expect(def?.isCredential).toBe(true);
    }
  });

  it('response supports grouped mode by category', async () => {
    // Import the grouping helper once it exists
    const { groupSettingsByCategory } = await import('../infrastructure/settings/setting-keys.js');
    const grouped = groupSettingsByCategory();

    expect(Array.isArray(grouped)).toBe(true);
    expect(grouped.length).toBeGreaterThan(0);

    for (const group of grouped) {
      expect(group).toHaveProperty('name');
      expect(group).toHaveProperty('label');
      expect(group).toHaveProperty('settings');
      expect(Array.isArray(group.settings)).toBe(true);
      expect(group.settings.length).toBeGreaterThan(0);
    }

    // Check that every setting is in exactly one group
    const allSettingsInGroups = grouped.flatMap(g => g.settings);
    expect(allSettingsInGroups.length).toBe(SETTING_DEFINITIONS.length);
  });
});
