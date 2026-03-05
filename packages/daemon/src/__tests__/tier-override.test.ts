/**
 * Tests for Phase 331: Action tier override resolution.
 *
 * - resolveActionTier: Settings override > provider default
 * - stage3Policy: action tier as floor (escalation only, never downgrade)
 * - Dynamic tier setting key recognition in getSettingDefinition
 */

import { describe, it, expect, vi } from 'vitest';
import { resolveActionTier } from '../pipeline/stages.js';
import { getSettingDefinition, ActionTierOverrideSchema } from '../infrastructure/settings/setting-keys.js';
import type { SettingsService } from '../infrastructure/settings/settings-service.js';

// ---------------------------------------------------------------------------
// resolveActionTier tests
// ---------------------------------------------------------------------------

describe('resolveActionTier', () => {
  function mockSettingsService(overrides: Record<string, string>): SettingsService {
    return {
      get: vi.fn((key: string) => {
        if (key in overrides) return overrides[key];
        throw new Error(`Unknown setting key: ${key}`);
      }),
    } as unknown as SettingsService;
  }

  it('returns APPROVAL when settings has override set to APPROVAL', () => {
    const svc = mockSettingsService({ 'actions.jupiter_swap_swap_tier': 'APPROVAL' });
    const result = resolveActionTier('jupiter_swap', 'swap', 'DELAY', svc);
    expect(result).toBe('APPROVAL');
  });

  it('returns provider defaultTier when no settings override exists (empty string)', () => {
    const svc = mockSettingsService({ 'actions.jupiter_swap_swap_tier': '' });
    const result = resolveActionTier('jupiter_swap', 'swap', 'DELAY', svc);
    expect(result).toBe('DELAY');
  });

  it('returns provider defaultTier when settingsService throws (key not found)', () => {
    const svc = mockSettingsService({});
    const result = resolveActionTier('jupiter_swap', 'swap', 'DELAY', svc);
    expect(result).toBe('DELAY');
  });

  it('returns provider defaultTier when settingsService is undefined', () => {
    const result = resolveActionTier('jupiter_swap', 'swap', 'DELAY', undefined);
    expect(result).toBe('DELAY');
  });

  it('returns NOTIFY when override is NOTIFY', () => {
    const svc = mockSettingsService({ 'actions.lido_staking_stake_tier': 'NOTIFY' });
    const result = resolveActionTier('lido_staking', 'stake', 'INSTANT', svc);
    expect(result).toBe('NOTIFY');
  });

  it('returns INSTANT when override is INSTANT', () => {
    const svc = mockSettingsService({ 'actions.aave_v3_supply_tier': 'INSTANT' });
    const result = resolveActionTier('aave_v3', 'supply', 'NOTIFY', svc);
    expect(result).toBe('INSTANT');
  });
});

// ---------------------------------------------------------------------------
// Dynamic tier setting key recognition
// ---------------------------------------------------------------------------

describe('getSettingDefinition for tier keys', () => {
  it('recognizes dynamic tier key for jupiter_swap_swap', () => {
    const def = getSettingDefinition('actions.jupiter_swap_swap_tier');
    expect(def).toBeDefined();
    expect(def!.category).toBe('actions');
    expect(def!.defaultValue).toBe('');
    expect(def!.isCredential).toBe(false);
  });

  it('recognizes dynamic tier key for erc8004_agent_register_agent', () => {
    const def = getSettingDefinition('actions.erc8004_agent_register_agent_tier');
    expect(def).toBeDefined();
    expect(def!.category).toBe('actions');
  });

  it('recognizes dynamic tier key for aave_v3_supply', () => {
    const def = getSettingDefinition('actions.aave_v3_supply_tier');
    expect(def).toBeDefined();
  });

  it('returns undefined for unknown non-tier keys', () => {
    const def = getSettingDefinition('actions.unknown_foo_bar');
    expect(def).toBeUndefined();
  });

  it('still returns existing static definitions', () => {
    const def = getSettingDefinition('actions.jupiter_swap_enabled');
    expect(def).toBeDefined();
    expect(def!.defaultValue).toBe('true');
  });
});

// ---------------------------------------------------------------------------
// ActionTierOverrideSchema validation
// ---------------------------------------------------------------------------

describe('ActionTierOverrideSchema', () => {
  it('accepts valid tier values', () => {
    expect(ActionTierOverrideSchema.parse('INSTANT')).toBe('INSTANT');
    expect(ActionTierOverrideSchema.parse('NOTIFY')).toBe('NOTIFY');
    expect(ActionTierOverrideSchema.parse('DELAY')).toBe('DELAY');
    expect(ActionTierOverrideSchema.parse('APPROVAL')).toBe('APPROVAL');
    expect(ActionTierOverrideSchema.parse('')).toBe('');
  });

  it('rejects invalid tier values', () => {
    expect(() => ActionTierOverrideSchema.parse('INVALID')).toThrow();
    expect(() => ActionTierOverrideSchema.parse('instant')).toThrow();
    expect(() => ActionTierOverrideSchema.parse('foo')).toThrow();
  });
});
