import { describe, it, expect } from 'vitest';
import { validateSendToken } from '../validation.js';
import { WAIaaSError } from '../error.js';

describe('validateSendToken', () => {
  // =========================================================================
  // Valid inputs
  // =========================================================================

  it('should pass with valid to and amount', () => {
    expect(() => validateSendToken({ to: 'RecipientAddr', amount: '1000000' })).not.toThrow();
  });

  it('should pass with valid to, amount, and optional memo', () => {
    expect(() =>
      validateSendToken({ to: 'RecipientAddr', amount: '500000', memo: 'test payment' }),
    ).not.toThrow();
  });

  it('should pass with amount "0" (zero)', () => {
    expect(() => validateSendToken({ to: 'addr', amount: '0' })).not.toThrow();
  });

  // =========================================================================
  // Invalid params object
  // =========================================================================

  it('should throw VALIDATION_ERROR when params is null', () => {
    const err = getValidationError(null);
    expect(err.code).toBe('VALIDATION_ERROR');
    expect(err.message).toContain('must be an object');
  });

  it('should throw VALIDATION_ERROR when params is undefined', () => {
    const err = getValidationError(undefined);
    expect(err.code).toBe('VALIDATION_ERROR');
    expect(err.message).toContain('must be an object');
  });

  it('should throw VALIDATION_ERROR when params is a string', () => {
    const err = getValidationError('not-an-object');
    expect(err.code).toBe('VALIDATION_ERROR');
  });

  // =========================================================================
  // Invalid "to" field
  // =========================================================================

  it('should throw VALIDATION_ERROR when "to" is missing', () => {
    const err = getValidationError({ amount: '100' });
    expect(err.code).toBe('VALIDATION_ERROR');
    expect(err.message).toContain('"to"');
  });

  it('should throw VALIDATION_ERROR when "to" is empty string', () => {
    const err = getValidationError({ to: '', amount: '100' });
    expect(err.code).toBe('VALIDATION_ERROR');
    expect(err.message).toContain('"to"');
  });

  it('should throw VALIDATION_ERROR when "to" is not a string', () => {
    const err = getValidationError({ to: 123, amount: '100' });
    expect(err.code).toBe('VALIDATION_ERROR');
    expect(err.message).toContain('"to"');
  });

  // =========================================================================
  // Invalid "amount" field
  // =========================================================================

  it('should throw VALIDATION_ERROR when amount is non-numeric string "abc"', () => {
    const err = getValidationError({ to: 'addr', amount: 'abc' });
    expect(err.code).toBe('VALIDATION_ERROR');
    expect(err.message).toContain('"amount"');
    expect(err.message).toContain('numeric string');
  });

  it('should throw VALIDATION_ERROR when amount has decimal "12.5"', () => {
    const err = getValidationError({ to: 'addr', amount: '12.5' });
    expect(err.code).toBe('VALIDATION_ERROR');
    expect(err.message).toContain('"amount"');
  });

  it('should throw VALIDATION_ERROR when amount is negative "-1"', () => {
    const err = getValidationError({ to: 'addr', amount: '-1' });
    expect(err.code).toBe('VALIDATION_ERROR');
    expect(err.message).toContain('"amount"');
  });

  it('should throw VALIDATION_ERROR when amount is a number (not string)', () => {
    const err = getValidationError({ to: 'addr', amount: 100 });
    expect(err.code).toBe('VALIDATION_ERROR');
    expect(err.message).toContain('"amount"');
  });

  it('should throw VALIDATION_ERROR when amount is missing', () => {
    const err = getValidationError({ to: 'addr' });
    expect(err.code).toBe('VALIDATION_ERROR');
    expect(err.message).toContain('"amount"');
  });

  // =========================================================================
  // Invalid "memo" field
  // =========================================================================

  it('should throw VALIDATION_ERROR when memo exceeds 256 chars', () => {
    const longMemo = 'x'.repeat(257);
    const err = getValidationError({ to: 'addr', amount: '100', memo: longMemo });
    expect(err.code).toBe('VALIDATION_ERROR');
    expect(err.message).toContain('"memo"');
    expect(err.message).toContain('256');
  });

  it('should throw VALIDATION_ERROR when memo is not a string', () => {
    const err = getValidationError({ to: 'addr', amount: '100', memo: 123 });
    expect(err.code).toBe('VALIDATION_ERROR');
    expect(err.message).toContain('"memo"');
  });

  // =========================================================================
  // 5-type validation: TOKEN_TRANSFER
  // =========================================================================

  it('should pass valid TOKEN_TRANSFER params', () => {
    expect(() =>
      validateSendToken({
        to: 'addr',
        amount: '1000',
        type: 'TOKEN_TRANSFER',
        token: { address: 'mint1', decimals: 6, symbol: 'USDC' },
      }),
    ).not.toThrow();
  });

  it('should throw VALIDATION_ERROR when TOKEN_TRANSFER is missing token', () => {
    const err = getValidationError({
      to: 'addr',
      amount: '1000',
      type: 'TOKEN_TRANSFER',
    });
    expect(err.code).toBe('VALIDATION_ERROR');
    expect(err.message).toContain('"token"');
  });

  // =========================================================================
  // 5-type validation: APPROVE
  // =========================================================================

  it('should throw VALIDATION_ERROR when APPROVE is missing spender', () => {
    const err = getValidationError({
      type: 'APPROVE',
      token: { address: 'mint1', decimals: 6, symbol: 'USDC' },
      amount: '1000',
    });
    expect(err.code).toBe('VALIDATION_ERROR');
    expect(err.message).toContain('"spender"');
  });

  it('should throw VALIDATION_ERROR when APPROVE is missing token', () => {
    const err = getValidationError({
      type: 'APPROVE',
      spender: '0xSpender',
      amount: '1000',
    });
    expect(err.code).toBe('VALIDATION_ERROR');
    expect(err.message).toContain('"token"');
  });

  it('should pass valid APPROVE params', () => {
    expect(() =>
      validateSendToken({
        type: 'APPROVE',
        spender: '0xSpender',
        token: { address: 'mint1', decimals: 6, symbol: 'USDC' },
        amount: '1000',
      }),
    ).not.toThrow();
  });

  // =========================================================================
  // 5-type validation: BATCH
  // =========================================================================

  it('should throw VALIDATION_ERROR when BATCH is missing instructions', () => {
    const err = getValidationError({ type: 'BATCH' });
    expect(err.code).toBe('VALIDATION_ERROR');
    expect(err.message).toContain('"instructions"');
  });

  it('should throw VALIDATION_ERROR when BATCH instructions has < 2 items', () => {
    const err = getValidationError({ type: 'BATCH', instructions: [{ op: 'a' }] });
    expect(err.code).toBe('VALIDATION_ERROR');
    expect(err.message).toContain('at least 2');
  });

  it('should pass valid BATCH params', () => {
    expect(() =>
      validateSendToken({
        type: 'BATCH',
        instructions: [{ op: 'a' }, { op: 'b' }],
      }),
    ).not.toThrow();
  });

  // =========================================================================
  // 5-type validation: CONTRACT_CALL
  // =========================================================================

  it('should pass valid CONTRACT_CALL params', () => {
    expect(() =>
      validateSendToken({
        type: 'CONTRACT_CALL',
        to: '0xContractAddress',
        calldata: '0xabcdef',
      }),
    ).not.toThrow();
  });

  it('should throw VALIDATION_ERROR when CONTRACT_CALL is missing to', () => {
    const err = getValidationError({ type: 'CONTRACT_CALL', calldata: '0xabcdef' });
    expect(err.code).toBe('VALIDATION_ERROR');
    expect(err.message).toContain('"to"');
  });

  // =========================================================================
  // Unknown type
  // =========================================================================

  it('should throw VALIDATION_ERROR for unknown type', () => {
    const err = getValidationError({ type: 'UNKNOWN', to: 'addr', amount: '100' });
    expect(err.code).toBe('VALIDATION_ERROR');
    expect(err.message).toContain('"type"');
  });

  // =========================================================================
  // Error properties
  // =========================================================================

  it('should set status=0 and retryable=false on validation errors', () => {
    const err = getValidationError(null);
    expect(err.status).toBe(0);
    expect(err.retryable).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

function getValidationError(params: unknown): WAIaaSError {
  try {
    validateSendToken(params);
    throw new Error('Expected validateSendToken to throw');
  } catch (err) {
    if (err instanceof WAIaaSError) return err;
    throw err;
  }
}
