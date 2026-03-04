/**
 * Unit tests for SignMessageRequestSchema.
 *
 * Tests Zod validation for the sign-message request schema including:
 * - signType defaults to 'personal'
 * - personal requires message field
 * - typedData requires typedData field
 * - valid EIP-712 typed data structure
 * - invalid signType rejected
 */

import { describe, it, expect } from 'vitest';
import { SignMessageRequestSchema, Eip712TypedDataSchema } from '../schemas/transaction.schema.js';

describe('SignMessageRequestSchema', () => {
  it('defaults signType to personal', () => {
    const result = SignMessageRequestSchema.safeParse({
      message: 'Hello',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.signType).toBe('personal');
    }
  });

  it('accepts personal signType with message', () => {
    const result = SignMessageRequestSchema.safeParse({
      signType: 'personal',
      message: 'Hello, World!',
    });
    expect(result.success).toBe(true);
  });

  it('accepts hex message with 0x prefix', () => {
    const result = SignMessageRequestSchema.safeParse({
      signType: 'personal',
      message: '0xdeadbeef',
    });
    expect(result.success).toBe(true);
  });

  it('rejects personal signType without message', () => {
    const result = SignMessageRequestSchema.safeParse({
      signType: 'personal',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some(i => i.message.includes('message is required'))).toBe(true);
    }
  });

  it('accepts typedData signType with valid EIP-712 data', () => {
    const result = SignMessageRequestSchema.safeParse({
      signType: 'typedData',
      typedData: {
        domain: {
          name: 'TestDApp',
          version: '1',
          chainId: 1,
          verifyingContract: '0x1234567890abcdef1234567890abcdef12345678',
        },
        types: {
          Order: [
            { name: 'maker', type: 'address' },
            { name: 'amount', type: 'uint256' },
          ],
        },
        primaryType: 'Order',
        message: {
          maker: '0xabcdef1234567890abcdef1234567890abcdef12',
          amount: '1000000',
        },
      },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.signType).toBe('typedData');
    }
  });

  it('rejects typedData signType without typedData field', () => {
    const result = SignMessageRequestSchema.safeParse({
      signType: 'typedData',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some(i => i.message.includes('typedData is required'))).toBe(true);
    }
  });

  it('rejects invalid signType', () => {
    const result = SignMessageRequestSchema.safeParse({
      signType: 'invalid',
      message: 'Hello',
    });
    expect(result.success).toBe(false);
  });

  it('accepts typedData with optional domain fields', () => {
    const result = SignMessageRequestSchema.safeParse({
      signType: 'typedData',
      typedData: {
        domain: {
          name: 'MinimalDApp',
        },
        types: {
          Simple: [
            { name: 'value', type: 'uint256' },
          ],
        },
        primaryType: 'Simple',
        message: {
          value: '42',
        },
      },
    });
    expect(result.success).toBe(true);
  });

  it('accepts optional walletId field', () => {
    const result = SignMessageRequestSchema.safeParse({
      message: 'Hello',
      walletId: '01958f3a-1234-7000-8000-abcdef123456',
    });
    expect(result.success).toBe(true);
  });

  it('accepts chainId as string', () => {
    const result = SignMessageRequestSchema.safeParse({
      signType: 'typedData',
      typedData: {
        domain: {
          name: 'Test',
          chainId: '137',
        },
        types: {
          Simple: [{ name: 'v', type: 'uint256' }],
        },
        primaryType: 'Simple',
        message: { v: '1' },
      },
    });
    expect(result.success).toBe(true);
  });
});

describe('Eip712TypedDataSchema', () => {
  it('validates a complete EIP-712 structure', () => {
    const result = Eip712TypedDataSchema.safeParse({
      domain: {
        name: 'Uniswap',
        version: '2',
        chainId: 1,
        verifyingContract: '0x000000000022D473030F116dDEE9F6B43aC78BA3',
      },
      types: {
        PermitSingle: [
          { name: 'details', type: 'PermitDetails' },
          { name: 'spender', type: 'address' },
          { name: 'sigDeadline', type: 'uint256' },
        ],
        PermitDetails: [
          { name: 'token', type: 'address' },
          { name: 'amount', type: 'uint160' },
          { name: 'expiration', type: 'uint48' },
          { name: 'nonce', type: 'uint48' },
        ],
      },
      primaryType: 'PermitSingle',
      message: {
        details: {
          token: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
          amount: '1000000',
          expiration: '1707000000',
          nonce: '0',
        },
        spender: '0xE592427A0AEce92De3Edee1F18E0157C05861564',
        sigDeadline: '1707000000',
      },
    });
    expect(result.success).toBe(true);
  });

  it('requires primaryType', () => {
    const result = Eip712TypedDataSchema.safeParse({
      domain: {},
      types: {},
      primaryType: '',
      message: {},
    });
    expect(result.success).toBe(false);
  });
});
