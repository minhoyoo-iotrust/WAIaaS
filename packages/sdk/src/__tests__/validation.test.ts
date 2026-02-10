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
