import { describe, it, expect } from 'vitest';
import { validateSendToken } from '../validation.js';
import { WAIaaSError } from '../error.js';

function expectValidationError(params: unknown, expectedMsg?: string): WAIaaSError {
  try {
    validateSendToken(params);
    throw new Error('Expected WAIaaSError to be thrown');
  } catch (err) {
    expect(err).toBeInstanceOf(WAIaaSError);
    const waErr = err as WAIaaSError;
    expect(waErr.code).toBe('VALIDATION_ERROR');
    if (expectedMsg) expect(waErr.message).toContain(expectedMsg);
    return waErr;
  }
}

describe('validateSendToken coverage - token validation', () => {
  // =========================================================================
  // token.decimals missing (full mode)
  // =========================================================================

  it('throws when token.decimals is missing in full mode', () => {
    expectValidationError(
      {
        type: 'TOKEN_TRANSFER',
        to: 'addr',
        amount: '100',
        token: { address: '0x1', symbol: 'TKN' },
      },
      'token.decimals',
    );
  });

  // =========================================================================
  // token.symbol missing (full mode) -- lines 198-204
  // =========================================================================

  it('throws when token.symbol is missing in full mode', () => {
    expectValidationError(
      {
        type: 'TOKEN_TRANSFER',
        to: 'addr',
        amount: '100',
        token: { address: '0x1', decimals: 18 },
      },
      'token.symbol',
    );
  });

  it('throws when token.symbol is empty string', () => {
    expectValidationError(
      {
        type: 'TOKEN_TRANSFER',
        to: 'addr',
        amount: '100',
        token: { address: '0x1', decimals: 18, symbol: '' },
      },
      'token.symbol',
    );
  });

  // =========================================================================
  // APPROVE type with assetId-only token (valid path)
  // =========================================================================

  it('passes APPROVE with assetId-only token', () => {
    expect(() =>
      validateSendToken({
        type: 'APPROVE',
        spender: '0xspender',
        amount: '1000',
        token: { assetId: 'eip155:1/erc20:0x1' },
      }),
    ).not.toThrow();
  });

  // =========================================================================
  // APPROVE type with full token (valid path)
  // =========================================================================

  it('passes APPROVE with full token info', () => {
    expect(() =>
      validateSendToken({
        type: 'APPROVE',
        spender: '0xspender',
        amount: '1000',
        token: { address: '0x1', decimals: 18, symbol: 'TKN' },
      }),
    ).not.toThrow();
  });

  // =========================================================================
  // token.decimals is not a number
  // =========================================================================

  it('throws when token.decimals is a string', () => {
    expectValidationError(
      {
        type: 'TOKEN_TRANSFER',
        to: 'addr',
        amount: '100',
        token: { address: '0x1', decimals: '18', symbol: 'TKN' },
      },
      'token.decimals',
    );
  });
});
