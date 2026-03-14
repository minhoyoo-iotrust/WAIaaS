/**
 * Unit tests for the migrateAmount() shared helper.
 *
 * migrateAmount() provides backward compatibility for providers migrating
 * from human-readable to smallest-unit inputs. It detects decimal points
 * to auto-convert legacy inputs while passing through smallest-unit integers.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { migrateAmount } from './migrate-amount.js';

describe('migrateAmount', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  it('passes through pure integer string as BigInt (smallest-unit)', () => {
    const result = migrateAmount('1000000000000000000', 18);
    expect(result).toBe(1000000000000000000n);
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('converts decimal input via parseTokenAmount and warns', () => {
    const result = migrateAmount('100.5', 18);
    expect(result).toBe(100_500000000000000000n);
    expect(warnSpy).toHaveBeenCalledOnce();
    expect(warnSpy.mock.calls[0]![0]).toContain('DEPRECATION');
    expect(warnSpy.mock.calls[0]![0]).toContain('100.5');
  });

  it('converts SOL decimal input with 9 decimals', () => {
    const result = migrateAmount('1.5', 9);
    expect(result).toBe(1_500000000n);
    expect(warnSpy).toHaveBeenCalledOnce();
  });

  it('passes through zero value as 0n', () => {
    const result = migrateAmount('0', 18);
    expect(result).toBe(0n);
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('does not warn for integer input', () => {
    migrateAmount('1000000', 6);
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('passes through integer string as BigInt for 6 decimals', () => {
    const result = migrateAmount('1000000', 6);
    expect(result).toBe(1000000n);
  });

  it('converts fractional-only input (.5)', () => {
    const result = migrateAmount('.5', 18);
    expect(result).toBe(500000000000000000n);
    expect(warnSpy).toHaveBeenCalledOnce();
  });
});
