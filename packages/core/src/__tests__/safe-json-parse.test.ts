import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { safeJsonParse, type SafeJsonParseResult, type SafeJsonParseError } from '../utils/safe-json-parse.js';
import { POLICY_RULES_SCHEMAS } from '../schemas/policy.schema.js';
import { SpendingLimitRulesSchema } from '../schemas/policy.schema.js';
import { ERROR_CODES } from '../errors/error-codes.js';

// ---------------------------------------------------------------------------
// safeJsonParse tests
// ---------------------------------------------------------------------------

describe('safeJsonParse', () => {
  const TestSchema = z.object({
    name: z.string(),
    age: z.number().int().positive(),
  });

  it('returns success for valid JSON + matching schema', () => {
    const result = safeJsonParse('{"name":"Alice","age":30}', TestSchema);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual({ name: 'Alice', age: 30 });
    }
  });

  it('returns json_parse error for invalid JSON string', () => {
    const result = safeJsonParse('{bad json}', TestSchema);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.type).toBe('json_parse');
      expect(result.error.message).toBeTruthy();
    }
  });

  it('returns validation error for valid JSON + wrong schema', () => {
    const result = safeJsonParse('{"name":123,"age":"not-a-number"}', TestSchema);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.type).toBe('validation');
      expect(result.error.issues).toBeDefined();
      expect(result.error.issues!.length).toBeGreaterThan(0);
    }
  });

  it('returns json_parse error for null input (no throw)', () => {
    const result = safeJsonParse(null as unknown as string, TestSchema);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.type).toBe('json_parse');
    }
  });

  it('returns json_parse error for undefined input (no throw)', () => {
    const result = safeJsonParse(undefined as unknown as string, TestSchema);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.type).toBe('json_parse');
    }
  });

  it('works with SpendingLimitRulesSchema from POLICY_RULES_SCHEMAS', () => {
    const validRules = JSON.stringify({
      instant_max_usd: 100,
      notify_max_usd: 500,
      delay_max_usd: 1000,
      delay_seconds: 900,
    });
    const result = safeJsonParse(validRules, SpendingLimitRulesSchema);
    expect(result.success).toBe(true);
  });

  it('returns validation error for SpendingLimitRulesSchema with no limits', () => {
    const noLimits = JSON.stringify({ delay_seconds: 900 });
    const result = safeJsonParse(noLimits, SpendingLimitRulesSchema);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.type).toBe('validation');
    }
  });
});

// ---------------------------------------------------------------------------
// POLICY_RULES_SCHEMAS tests
// ---------------------------------------------------------------------------

describe('POLICY_RULES_SCHEMAS', () => {
  it('has 13 entries covering all policy types', () => {
    expect(Object.keys(POLICY_RULES_SCHEMAS)).toHaveLength(13);
  });

  it('SPENDING_LIMIT maps to SpendingLimitRulesSchema', () => {
    expect(POLICY_RULES_SCHEMAS['SPENDING_LIMIT']).toBe(SpendingLimitRulesSchema);
  });

  it.each([
    'ALLOWED_TOKENS',
    'CONTRACT_WHITELIST',
    'METHOD_WHITELIST',
    'APPROVED_SPENDERS',
    'APPROVE_AMOUNT_LIMIT',
    'APPROVE_TIER_OVERRIDE',
    'ALLOWED_NETWORKS',
    'SPENDING_LIMIT',
    'WHITELIST',
    'RATE_LIMIT',
    'TIME_RESTRICTION',
    'X402_ALLOWED_DOMAINS',
    'REPUTATION_THRESHOLD',
  ])('includes %s', (policyType) => {
    expect(POLICY_RULES_SCHEMAS[policyType]).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// ERROR_CODES additions tests
// ---------------------------------------------------------------------------

describe('ERROR_CODES', () => {
  it('has INTERNAL_ERROR with domain SYSTEM and httpStatus 500', () => {
    expect(ERROR_CODES.INTERNAL_ERROR).toBeDefined();
    expect(ERROR_CODES.INTERNAL_ERROR.domain).toBe('SYSTEM');
    expect(ERROR_CODES.INTERNAL_ERROR.httpStatus).toBe(500);
    expect(ERROR_CODES.INTERNAL_ERROR.retryable).toBe(false);
  });

  it('has VALIDATION_FAILED with domain SYSTEM and httpStatus 400', () => {
    expect(ERROR_CODES.VALIDATION_FAILED).toBeDefined();
    expect(ERROR_CODES.VALIDATION_FAILED.domain).toBe('SYSTEM');
    expect(ERROR_CODES.VALIDATION_FAILED.httpStatus).toBe(400);
    expect(ERROR_CODES.VALIDATION_FAILED.retryable).toBe(false);
  });
});
