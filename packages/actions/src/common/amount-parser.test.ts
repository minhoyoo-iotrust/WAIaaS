/**
 * Unit tests for the common parseTokenAmount utility.
 */
import { describe, it, expect } from 'vitest';
import { parseTokenAmount } from './amount-parser.js';

describe('parseTokenAmount', () => {
  it('parses ETH amount with 18 decimals', () => {
    expect(parseTokenAmount('100.5', 18)).toBe(100_500000000000000000n);
  });

  it('parses USDC amount with 6 decimals', () => {
    expect(parseTokenAmount('100.5', 6)).toBe(100_500000n);
  });

  it('parses SOL amount with 9 decimals', () => {
    expect(parseTokenAmount('1.5', 9)).toBe(1_500000000n);
  });

  it('throws on zero amount', () => {
    expect(() => parseTokenAmount('0', 18)).toThrow('Amount must be greater than 0');
  });

  it('throws on negative amount', () => {
    expect(() => parseTokenAmount('-1', 18)).toThrow();
  });

  it('parses integer-only amount', () => {
    expect(parseTokenAmount('1000', 18)).toBe(1000_000000000000000000n);
  });

  it('parses minimum unit (0.000001 with 6 decimals)', () => {
    expect(parseTokenAmount('0.000001', 6)).toBe(1n);
  });

  it('truncates excess decimals', () => {
    // 1.123456789 with 6 decimals -> 1123456 (truncates 789)
    expect(parseTokenAmount('1.123456789', 6)).toBe(1_123456n);
  });

  it('handles decimal-only input (.5)', () => {
    expect(parseTokenAmount('.5', 18)).toBe(500000000000000000n);
  });

  it('handles long fractional with 18 decimals', () => {
    expect(parseTokenAmount('1.123456789012345678', 18)).toBe(1_123456789012345678n);
  });

  it('pads short fractional correctly', () => {
    // "1.1" with 6 decimals -> 1_100000n
    expect(parseTokenAmount('1.1', 6)).toBe(1_100000n);
  });
});
