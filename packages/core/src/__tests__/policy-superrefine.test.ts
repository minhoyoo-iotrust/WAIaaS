import { describe, it, expect } from 'vitest';
import { CreatePolicyRequestSchema } from '../schemas/policy.schema.js';

/**
 * Tests for 6 v1.4 PolicyType superRefine rules validation.
 *
 * Each new PolicyType has a type-specific rules schema validated via
 * superRefine on CreatePolicyRequestSchema. Existing 4 types retain
 * free-form rules for backward compatibility.
 */
describe('CreatePolicyRequestSchema superRefine validation', () => {
  // -------------------------------------------------------------------------
  // ALLOWED_TOKENS
  // -------------------------------------------------------------------------

  describe('ALLOWED_TOKENS', () => {
    it('accepts valid rules with tokens array', () => {
      const result = CreatePolicyRequestSchema.safeParse({
        type: 'ALLOWED_TOKENS',
        rules: {
          tokens: [
            { address: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', symbol: 'USDC', chain: 'solana' },
            { address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', symbol: 'USDC', chain: 'ethereum' },
          ],
        },
      });
      expect(result.success).toBe(true);
    });

    it('rejects empty tokens array', () => {
      const result = CreatePolicyRequestSchema.safeParse({
        type: 'ALLOWED_TOKENS',
        rules: { tokens: [] },
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        const paths = result.error.issues.map((i) => i.path.join('.'));
        expect(paths).toContain('rules.tokens');
      }
    });

    it('rejects missing tokens field', () => {
      const result = CreatePolicyRequestSchema.safeParse({
        type: 'ALLOWED_TOKENS',
        rules: {},
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        const paths = result.error.issues.map((i) => i.path.join('.'));
        expect(paths).toContain('rules.tokens');
      }
    });
  });

  // -------------------------------------------------------------------------
  // CONTRACT_WHITELIST
  // -------------------------------------------------------------------------

  describe('CONTRACT_WHITELIST', () => {
    it('accepts valid rules with contracts array', () => {
      const result = CreatePolicyRequestSchema.safeParse({
        type: 'CONTRACT_WHITELIST',
        rules: {
          contracts: [
            { address: 'JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4', name: 'Jupiter', chain: 'solana' },
          ],
        },
      });
      expect(result.success).toBe(true);
    });

    it('rejects empty contracts array', () => {
      const result = CreatePolicyRequestSchema.safeParse({
        type: 'CONTRACT_WHITELIST',
        rules: { contracts: [] },
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        const paths = result.error.issues.map((i) => i.path.join('.'));
        expect(paths).toContain('rules.contracts');
      }
    });
  });

  // -------------------------------------------------------------------------
  // METHOD_WHITELIST
  // -------------------------------------------------------------------------

  describe('METHOD_WHITELIST', () => {
    it('accepts valid rules with methods array', () => {
      const result = CreatePolicyRequestSchema.safeParse({
        type: 'METHOD_WHITELIST',
        rules: {
          methods: [
            { contractAddress: '0x1234abcd', selectors: ['0xa9059cbb', '0x23b872dd'] },
          ],
        },
      });
      expect(result.success).toBe(true);
    });

    it('rejects empty selectors array', () => {
      const result = CreatePolicyRequestSchema.safeParse({
        type: 'METHOD_WHITELIST',
        rules: {
          methods: [{ contractAddress: '0x1234', selectors: [] }],
        },
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        const paths = result.error.issues.map((i) => i.path.join('.'));
        expect(paths.some((p) => p.includes('selectors'))).toBe(true);
      }
    });
  });

  // -------------------------------------------------------------------------
  // APPROVED_SPENDERS
  // -------------------------------------------------------------------------

  describe('APPROVED_SPENDERS', () => {
    it('accepts valid rules with spenders array', () => {
      const result = CreatePolicyRequestSchema.safeParse({
        type: 'APPROVED_SPENDERS',
        rules: {
          spenders: [
            { address: '0xDEF1', name: 'Uniswap Router', maxAmount: '1000000000' },
          ],
        },
      });
      expect(result.success).toBe(true);
    });

    it('rejects missing spenders field', () => {
      const result = CreatePolicyRequestSchema.safeParse({
        type: 'APPROVED_SPENDERS',
        rules: {},
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        const paths = result.error.issues.map((i) => i.path.join('.'));
        expect(paths).toContain('rules.spenders');
      }
    });
  });

  // -------------------------------------------------------------------------
  // APPROVE_AMOUNT_LIMIT
  // -------------------------------------------------------------------------

  describe('APPROVE_AMOUNT_LIMIT', () => {
    it('accepts valid rules with maxAmount and blockUnlimited', () => {
      const result = CreatePolicyRequestSchema.safeParse({
        type: 'APPROVE_AMOUNT_LIMIT',
        rules: { maxAmount: '1000000', blockUnlimited: false },
      });
      expect(result.success).toBe(true);
    });

    it('defaults blockUnlimited to true when omitted', () => {
      const result = CreatePolicyRequestSchema.safeParse({
        type: 'APPROVE_AMOUNT_LIMIT',
        rules: {},
      });
      // Empty rules is valid since both fields are optional/have defaults
      expect(result.success).toBe(true);
    });

    it('rejects non-numeric maxAmount', () => {
      const result = CreatePolicyRequestSchema.safeParse({
        type: 'APPROVE_AMOUNT_LIMIT',
        rules: { maxAmount: 'not-a-number' },
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        const paths = result.error.issues.map((i) => i.path.join('.'));
        expect(paths.some((p) => p.includes('maxAmount'))).toBe(true);
      }
    });
  });

  // -------------------------------------------------------------------------
  // APPROVE_TIER_OVERRIDE
  // -------------------------------------------------------------------------

  describe('APPROVE_TIER_OVERRIDE', () => {
    it('accepts valid tier (APPROVAL)', () => {
      const result = CreatePolicyRequestSchema.safeParse({
        type: 'APPROVE_TIER_OVERRIDE',
        rules: { tier: 'APPROVAL' },
      });
      expect(result.success).toBe(true);
    });

    it('rejects invalid tier value', () => {
      const result = CreatePolicyRequestSchema.safeParse({
        type: 'APPROVE_TIER_OVERRIDE',
        rules: { tier: 'INVALID_TIER' },
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        const paths = result.error.issues.map((i) => i.path.join('.'));
        expect(paths.some((p) => p.includes('tier'))).toBe(true);
      }
    });

    it('rejects missing tier', () => {
      const result = CreatePolicyRequestSchema.safeParse({
        type: 'APPROVE_TIER_OVERRIDE',
        rules: {},
      });
      expect(result.success).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // Backward compatibility: existing 4 types retain free-form rules
  // -------------------------------------------------------------------------

  describe('backward compatibility', () => {
    it('SPENDING_LIMIT accepts free-form rules (no superRefine)', () => {
      const result = CreatePolicyRequestSchema.safeParse({
        type: 'SPENDING_LIMIT',
        rules: { maxDailyUsd: 100, windowMs: 86400000 },
      });
      expect(result.success).toBe(true);
    });

    it('WHITELIST accepts free-form rules (no superRefine)', () => {
      const result = CreatePolicyRequestSchema.safeParse({
        type: 'WHITELIST',
        rules: { addresses: ['addr1', 'addr2'], mode: 'allow' },
      });
      expect(result.success).toBe(true);
    });

    it('TIME_RESTRICTION accepts free-form rules', () => {
      const result = CreatePolicyRequestSchema.safeParse({
        type: 'TIME_RESTRICTION',
        rules: { allowedHours: { start: 9, end: 17 }, timezone: 'UTC' },
      });
      expect(result.success).toBe(true);
    });

    it('RATE_LIMIT accepts free-form rules', () => {
      const result = CreatePolicyRequestSchema.safeParse({
        type: 'RATE_LIMIT',
        rules: { maxPerHour: 10, maxPerDay: 50 },
      });
      expect(result.success).toBe(true);
    });
  });
});
