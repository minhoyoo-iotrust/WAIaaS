/**
 * NOTE-01: BalanceInfo amount formatting/parsing tests (8 cases).
 *
 * Tests formatAmount (bigint -> human-readable) and parseAmount (human-readable -> bigint)
 * for correctness with SOL (9 decimals), ETH (18 decimals), USDC (6 decimals).
 *
 * @see docs/49-enum-config-consistency-verification.md NOTE-01
 */

import { describe, it, expect } from 'vitest';
import { formatAmount, parseAmount } from '../utils/format-amount.js';

describe('NOTE-01: formatAmount / parseAmount', () => {
  // N01-01: SOL basic conversion (1_000_000_000 lamports = 1 SOL)
  it('N01-01: SOL basic conversion (1_000_000_000n, 9) -> "1"', () => {
    expect(formatAmount(1_000_000_000n, 9)).toBe('1');
  });

  // N01-02: SOL decimal (1_500_000 lamports = 0.0015 SOL)
  it('N01-02: SOL decimal (1_500_000n, 9) -> "0.0015"', () => {
    expect(formatAmount(1_500_000n, 9)).toBe('0.0015');
  });

  // N01-03: Zero lamports
  it('N01-03: 0 lamport (0n, 9) -> "0"', () => {
    expect(formatAmount(0n, 9)).toBe('0');
  });

  // N01-04: 1 lamport (smallest unit)
  it('N01-04: 1 lamport (1n, 9) -> "0.000000001"', () => {
    expect(formatAmount(1n, 9)).toBe('0.000000001');
  });

  // N01-05: Reverse parseAmount
  it('N01-05: parseAmount("1.5", 9) -> 1_500_000_000n', () => {
    expect(parseAmount('1.5', 9)).toBe(1_500_000_000n);
    // Also verify round-trip
    expect(formatAmount(parseAmount('1.5', 9), 9)).toBe('1.5');
  });

  // N01-06: MAX_SAFE_INTEGER-range BigInt accuracy (below 2^53)
  it('N01-06: MAX_SAFE_INTEGER-range BigInt accuracy', () => {
    // 9007199254740991 = 2^53 - 1 (Number.MAX_SAFE_INTEGER)
    const maxSafe = 9007199254740991n; // ~9.007 SOL in lamport-scale with 18 decimals
    const result = formatAmount(maxSafe, 18);
    // 9007199254740991 / 10^18 = 0.009007199254740991
    expect(result).toBe('0.009007199254740991');
    // Round-trip
    expect(parseAmount(result, 18)).toBe(maxSafe);
  });

  // N01-07: Beyond MAX_SAFE_INTEGER BigInt precision (above 2^53)
  it('N01-07: beyond MAX_SAFE_INTEGER BigInt precision preserved', () => {
    // 10^18 ETH in wei = 10^36 (way beyond 2^53)
    const hugeAmount = 1_000_000_000_000_000_000_000_000_000_000_000_000n; // 10^36 wei
    const result = formatAmount(hugeAmount, 18);
    expect(result).toBe('1000000000000000000'); // 10^18 ETH
    // Round-trip
    expect(parseAmount(result, 18)).toBe(hugeAmount);
  });

  // N01-08: Negative amount rejection
  it('N01-08: negative amount (-1n) -> Error', () => {
    expect(() => formatAmount(-1n, 9)).toThrow('Amount must be non-negative');
  });
});
