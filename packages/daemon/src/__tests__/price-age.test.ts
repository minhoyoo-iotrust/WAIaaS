import { describe, it, expect } from 'vitest';
import { classifyPriceAge, PriceAgeEnum, PRICE_AGE_THRESHOLDS } from '../infrastructure/oracle/price-age.js';

const MS = 1000;
const MIN = 60 * MS;

describe('classifyPriceAge', () => {
  const now = 1_700_000_000_000; // fixed reference point

  it('should return FRESH for age = 0 (fetched right now)', () => {
    expect(classifyPriceAge(now, now)).toBe('FRESH');
  });

  it('should return FRESH for age = 1 minute', () => {
    expect(classifyPriceAge(now - 1 * MIN, now)).toBe('FRESH');
  });

  it('should return FRESH for age = 4min 59s (just under 5min boundary)', () => {
    expect(classifyPriceAge(now - (4 * MIN + 59 * MS), now)).toBe('FRESH');
  });

  it('should return AGING for age = exactly 5 minutes (boundary)', () => {
    expect(classifyPriceAge(now - 5 * MIN, now)).toBe('AGING');
  });

  it('should return AGING for age = 15 minutes', () => {
    expect(classifyPriceAge(now - 15 * MIN, now)).toBe('AGING');
  });

  it('should return AGING for age = 29min 59s (just under 30min boundary)', () => {
    expect(classifyPriceAge(now - (29 * MIN + 59 * MS), now)).toBe('AGING');
  });

  it('should return STALE for age = exactly 30 minutes (boundary)', () => {
    expect(classifyPriceAge(now - 30 * MIN, now)).toBe('STALE');
  });

  it('should return STALE for age = 60 minutes', () => {
    expect(classifyPriceAge(now - 60 * MIN, now)).toBe('STALE');
  });
});

describe('PriceAgeEnum', () => {
  it('should parse valid PriceAge values', () => {
    expect(PriceAgeEnum.parse('FRESH')).toBe('FRESH');
    expect(PriceAgeEnum.parse('AGING')).toBe('AGING');
    expect(PriceAgeEnum.parse('STALE')).toBe('STALE');
  });

  it('should reject invalid PriceAge values', () => {
    expect(() => PriceAgeEnum.parse('INVALID')).toThrow();
  });
});

describe('PRICE_AGE_THRESHOLDS', () => {
  it('should have correct threshold values', () => {
    expect(PRICE_AGE_THRESHOLDS.FRESH_MAX_MS).toBe(5 * 60 * 1000);
    expect(PRICE_AGE_THRESHOLDS.AGING_MAX_MS).toBe(30 * 60 * 1000);
  });
});
