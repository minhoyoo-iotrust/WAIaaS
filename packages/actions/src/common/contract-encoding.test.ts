/**
 * Unit tests for the common contract-encoding utility.
 */
import { describe, it, expect } from 'vitest';
import { padHex, addressToHex, uint256ToHex, encodeApproveCalldata } from './contract-encoding.js';

describe('padHex', () => {
  it('pads to 64 chars by default', () => {
    const result = padHex('ff');
    expect(result).toHaveLength(64);
    expect(result).toBe('00000000000000000000000000000000000000000000000000000000000000ff');
  });

  it('pads to custom length', () => {
    expect(padHex('abc', 8)).toBe('00000abc');
  });

  it('returns value as-is if already at target length', () => {
    expect(padHex('abcd', 4)).toBe('abcd');
  });
});

describe('addressToHex', () => {
  it('converts 0x-prefixed address to 64-char lowercase hex', () => {
    const result = addressToHex('0x1234567890abcdef1234567890abcdef12345678');
    expect(result).toHaveLength(64);
    expect(result).toBe('0000000000000000000000001234567890abcdef1234567890abcdef12345678');
  });

  it('lowercases uppercase addresses', () => {
    const result = addressToHex('0xABCDEF1234567890ABCDEF1234567890ABCDEF12');
    expect(result).toContain('abcdef');
    expect(result).not.toContain('ABCDEF');
  });
});

describe('uint256ToHex', () => {
  it('converts 0n to 64 zeros', () => {
    const result = uint256ToHex(0n);
    expect(result).toHaveLength(64);
    expect(result).toBe('0'.repeat(64));
  });

  it('converts 255n to padded ff', () => {
    const result = uint256ToHex(255n);
    expect(result).toHaveLength(64);
    expect(result.endsWith('ff')).toBe(true);
  });

  it('throws on negative value', () => {
    expect(() => uint256ToHex(-1n)).toThrow('uint256 cannot be negative');
  });

  it('handles MAX_UINT256', () => {
    const MAX = (1n << 256n) - 1n;
    const result = uint256ToHex(MAX);
    expect(result).toHaveLength(64);
    expect(result).toBe('f'.repeat(64));
  });
});

describe('encodeApproveCalldata', () => {
  it('encodes with correct selector 0x095ea7b3', () => {
    const result = encodeApproveCalldata(
      '0x1234567890abcdef1234567890abcdef12345678',
      1000n,
    );
    expect(result.startsWith('0x095ea7b3')).toBe(true);
  });

  it('produces correct output matching lido-contract.ts pattern', () => {
    const spender = '0x889edC2eDab5f40e902b864aD4d7AdE8E412F9B1';
    const amount = 1000000000000000000n; // 1 ETH in wei
    const result = encodeApproveCalldata(spender, amount);

    // Verify structure: selector (10 chars) + spender (64 chars) + amount (64 chars)
    expect(result).toHaveLength(10 + 64 + 64);
    expect(result.slice(0, 10)).toBe('0x095ea7b3');

    // Spender should be lowercase, zero-padded to 64 chars
    const spenderHex = result.slice(10, 74);
    expect(spenderHex).toBe('000000000000000000000000889edc2edab5f40e902b864ad4d7ade8e412f9b1');

    // Amount should be hex-encoded, zero-padded to 64 chars
    const amountHex = result.slice(74, 138);
    expect(amountHex).toBe('0000000000000000000000000000000000000000000000000de0b6b3a7640000');
  });

  it('handles zero amount', () => {
    const result = encodeApproveCalldata(
      '0x0000000000000000000000000000000000000001',
      0n,
    );
    expect(result).toHaveLength(10 + 64 + 64);
  });
});
