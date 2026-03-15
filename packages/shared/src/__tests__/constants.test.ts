/**
 * Tests for @waiaas/shared constants module.
 * Verifies all exported constants match expectations and have no native dependencies.
 */
import { describe, it, expect } from 'vitest';
import {
  POLICY_TYPES,
  POLICY_TYPE_LABELS,
  POLICY_DESCRIPTIONS,
  POLICY_TIERS,
  CREDENTIAL_TYPES,
  CREDENTIAL_TYPE_LABELS,
  ERROR_MESSAGE_MAP,
  SERVER_MESSAGE_PREFERRED_CODES,
} from '../constants.js';

describe('POLICY_TYPES', () => {
  it('contains all 21 policy types', () => {
    expect(POLICY_TYPES).toHaveLength(21);
  });

  it('matches core policy type values', () => {
    expect(POLICY_TYPES).toContain('SPENDING_LIMIT');
    expect(POLICY_TYPES).toContain('WHITELIST');
    expect(POLICY_TYPES).toContain('LENDING_LTV_LIMIT');
    expect(POLICY_TYPES).toContain('VENUE_WHITELIST');
    expect(POLICY_TYPES).toContain('ACTION_CATEGORY_LIMIT');
  });
});

describe('POLICY_TYPE_LABELS', () => {
  it('has a label for every policy type', () => {
    for (const type of POLICY_TYPES) {
      expect(POLICY_TYPE_LABELS[type]).toBeTruthy();
      expect(typeof POLICY_TYPE_LABELS[type]).toBe('string');
    }
  });
});

describe('POLICY_DESCRIPTIONS', () => {
  it('has a description for every policy type', () => {
    for (const type of POLICY_TYPES) {
      expect(POLICY_DESCRIPTIONS[type]).toBeTruthy();
      expect(typeof POLICY_DESCRIPTIONS[type]).toBe('string');
    }
  });
});

describe('POLICY_TIERS', () => {
  it('contains all 4 tiers', () => {
    expect(POLICY_TIERS).toEqual(['INSTANT', 'NOTIFY', 'DELAY', 'APPROVAL']);
  });
});

describe('CREDENTIAL_TYPES', () => {
  it('contains all 5 credential types', () => {
    expect(CREDENTIAL_TYPES).toHaveLength(5);
    expect(CREDENTIAL_TYPES).toContain('api-key');
    expect(CREDENTIAL_TYPES).toContain('hmac-secret');
    expect(CREDENTIAL_TYPES).toContain('rsa-private-key');
    expect(CREDENTIAL_TYPES).toContain('session-token');
    expect(CREDENTIAL_TYPES).toContain('custom');
  });
});

describe('CREDENTIAL_TYPE_LABELS', () => {
  it('has a label for every credential type', () => {
    for (const type of CREDENTIAL_TYPES) {
      expect(CREDENTIAL_TYPE_LABELS[type]).toBeTruthy();
    }
  });
});

describe('ERROR_MESSAGE_MAP', () => {
  it('has at least 68 entries', () => {
    expect(Object.keys(ERROR_MESSAGE_MAP).length).toBeGreaterThanOrEqual(68);
  });

  it('contains known error codes', () => {
    expect(ERROR_MESSAGE_MAP.INVALID_TOKEN).toBeTruthy();
    expect(ERROR_MESSAGE_MAP.WALLET_NOT_FOUND).toBeTruthy();
    expect(ERROR_MESSAGE_MAP.POLICY_DENIED).toBeTruthy();
    expect(ERROR_MESSAGE_MAP.NETWORK_ERROR).toBeTruthy();
  });
});

describe('SERVER_MESSAGE_PREFERRED_CODES', () => {
  it('is an array of strings', () => {
    expect(Array.isArray(SERVER_MESSAGE_PREFERRED_CODES)).toBe(true);
    expect(SERVER_MESSAGE_PREFERRED_CODES.length).toBeGreaterThan(0);
  });
});

describe('no Zod dependency', () => {
  it('constants.ts has no zod imports', async () => {
    const fs = await import('fs');
    const content = fs.readFileSync(new URL('../constants.ts', import.meta.url), 'utf-8');
    expect(content).not.toContain("from 'zod'");
    expect(content).not.toContain('require("zod")');
  });
});
