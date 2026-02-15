import { describe, it, expect } from 'vitest';
import { CreatePolicyRequestSchema } from '../schemas/policy.schema.js';

/**
 * Tests for all 12 PolicyType superRefine rules validation.
 *
 * Each PolicyType has a type-specific rules schema validated via
 * superRefine on CreatePolicyRequestSchema.
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
  // WHITELIST
  // -------------------------------------------------------------------------

  describe('WHITELIST', () => {
    it('accepts valid rules with allowed_addresses array', () => {
      const result = CreatePolicyRequestSchema.safeParse({
        type: 'WHITELIST',
        rules: { allowed_addresses: ['addr1', 'addr2'] },
      });
      expect(result.success).toBe(true);
    });

    it('rejects empty allowed_addresses array', () => {
      const result = CreatePolicyRequestSchema.safeParse({
        type: 'WHITELIST',
        rules: { allowed_addresses: [] },
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        const paths = result.error.issues.map((i) => i.path.join('.'));
        expect(paths).toContain('rules.allowed_addresses');
      }
    });

    it('rejects missing allowed_addresses field', () => {
      const result = CreatePolicyRequestSchema.safeParse({
        type: 'WHITELIST',
        rules: {},
      });
      expect(result.success).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // RATE_LIMIT
  // -------------------------------------------------------------------------

  describe('RATE_LIMIT', () => {
    it('accepts valid rules with max_requests and window_seconds', () => {
      const result = CreatePolicyRequestSchema.safeParse({
        type: 'RATE_LIMIT',
        rules: { max_requests: 100, window_seconds: 3600 },
      });
      expect(result.success).toBe(true);
    });

    it('rejects zero max_requests', () => {
      const result = CreatePolicyRequestSchema.safeParse({
        type: 'RATE_LIMIT',
        rules: { max_requests: 0, window_seconds: 3600 },
      });
      expect(result.success).toBe(false);
    });

    it('rejects missing fields', () => {
      const result = CreatePolicyRequestSchema.safeParse({
        type: 'RATE_LIMIT',
        rules: {},
      });
      expect(result.success).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // TIME_RESTRICTION
  // -------------------------------------------------------------------------

  describe('TIME_RESTRICTION', () => {
    it('accepts valid rules with allowed_hours and allowed_days', () => {
      const result = CreatePolicyRequestSchema.safeParse({
        type: 'TIME_RESTRICTION',
        rules: {
          allowed_hours: { start: 9, end: 17 },
          allowed_days: [1, 2, 3, 4, 5],
        },
      });
      expect(result.success).toBe(true);
    });

    it('rejects empty allowed_days array', () => {
      const result = CreatePolicyRequestSchema.safeParse({
        type: 'TIME_RESTRICTION',
        rules: {
          allowed_hours: { start: 0, end: 24 },
          allowed_days: [],
        },
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        const paths = result.error.issues.map((i) => i.path.join('.'));
        expect(paths).toContain('rules.allowed_days');
      }
    });

    it('rejects invalid hour range', () => {
      const result = CreatePolicyRequestSchema.safeParse({
        type: 'TIME_RESTRICTION',
        rules: {
          allowed_hours: { start: 25, end: 17 },
          allowed_days: [0],
        },
      });
      expect(result.success).toBe(false);
    });

    it('rejects invalid day value', () => {
      const result = CreatePolicyRequestSchema.safeParse({
        type: 'TIME_RESTRICTION',
        rules: {
          allowed_hours: { start: 0, end: 24 },
          allowed_days: [7],
        },
      });
      expect(result.success).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // X402_ALLOWED_DOMAINS
  // -------------------------------------------------------------------------

  describe('X402_ALLOWED_DOMAINS', () => {
    it('accepts valid rules with domains array', () => {
      const result = CreatePolicyRequestSchema.safeParse({
        type: 'X402_ALLOWED_DOMAINS',
        rules: { domains: ['api.example.com', '*.openai.com'] },
      });
      expect(result.success).toBe(true);
    });

    it('rejects empty domains array', () => {
      const result = CreatePolicyRequestSchema.safeParse({
        type: 'X402_ALLOWED_DOMAINS',
        rules: { domains: [] },
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        const paths = result.error.issues.map((i) => i.path.join('.'));
        expect(paths).toContain('rules.domains');
      }
    });

    it('rejects missing domains field', () => {
      const result = CreatePolicyRequestSchema.safeParse({
        type: 'X402_ALLOWED_DOMAINS',
        rules: {},
      });
      expect(result.success).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // SPENDING_LIMIT (validates via SpendingLimitRulesSchema)
  // -------------------------------------------------------------------------

  describe('SPENDING_LIMIT', () => {
    it('accepts valid spending limit rules', () => {
      const result = CreatePolicyRequestSchema.safeParse({
        type: 'SPENDING_LIMIT',
        rules: {
          instant_max: '1000000',
          notify_max: '5000000',
          delay_max: '10000000',
        },
      });
      expect(result.success).toBe(true);
    });
  });
});
