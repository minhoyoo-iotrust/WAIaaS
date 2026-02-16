import { describe, it, expect } from 'vitest';
import { WAIaaSError, ERROR_CODES } from '../index.js';

describe('Error code matrix', () => {
  it('has exactly 90 error codes', () => {
    expect(Object.keys(ERROR_CODES)).toHaveLength(90);
  });

  it('every error code entry has required fields', () => {
    for (const [key, entry] of Object.entries(ERROR_CODES)) {
      expect(entry.code).toBe(key);
      expect(entry.domain).toBeDefined();
      expect(entry.httpStatus).toBeGreaterThanOrEqual(400);
      expect(entry.httpStatus).toBeLessThan(600);
      expect(typeof entry.retryable).toBe('boolean');
      expect(entry.message).toBeTruthy();
    }
  });

  it('covers all 11 domains', () => {
    const domains = new Set(Object.values(ERROR_CODES).map((e) => e.domain));
    expect(domains).toContain('AUTH');
    expect(domains).toContain('SESSION');
    expect(domains).toContain('TX');
    expect(domains).toContain('POLICY');
    expect(domains).toContain('OWNER');
    expect(domains).toContain('SYSTEM');
    expect(domains).toContain('WALLET');
    expect(domains).toContain('WITHDRAW');
    expect(domains).toContain('ACTION');
    expect(domains).toContain('ADMIN');
    expect(domains).toContain('X402');
    expect(domains.size).toBe(11);
  });

  it('AUTH domain has 8 codes', () => {
    const authCodes = Object.values(ERROR_CODES).filter((e) => e.domain === 'AUTH');
    expect(authCodes).toHaveLength(8);
  });

  it('TX domain has 28 codes', () => {
    const txCodes = Object.values(ERROR_CODES).filter((e) => e.domain === 'TX');
    expect(txCodes).toHaveLength(28);
  });

  it('ACTION domain has 8 codes', () => {
    const actionCodes = Object.values(ERROR_CODES).filter((e) => e.domain === 'ACTION');
    expect(actionCodes).toHaveLength(8);
  });

  it('X402 domain has 8 codes', () => {
    const x402Codes = Object.values(ERROR_CODES).filter((e) => e.domain === 'X402');
    expect(x402Codes).toHaveLength(8);
  });
});

describe('WAIaaSError', () => {
  it('creates error from code with auto-resolved httpStatus', () => {
    const err = new WAIaaSError('WALLET_NOT_FOUND');
    expect(err.code).toBe('WALLET_NOT_FOUND');
    expect(err.httpStatus).toBe(404);
    expect(err.retryable).toBe(false);
    expect(err.name).toBe('WAIaaSError');
    expect(err instanceof Error).toBe(true);
  });

  it('supports custom message', () => {
    const err = new WAIaaSError('INSUFFICIENT_BALANCE', {
      message: 'Balance too low: 100 lamports',
      details: { currentBalance: '100' },
    });
    expect(err.message).toBe('Balance too low: 100 lamports');
    expect(err.details).toEqual({ currentBalance: '100' });
  });

  it('toJSON() returns error response format without httpStatus', () => {
    const err = new WAIaaSError('CHAIN_ERROR', {
      requestId: 'req_abc123',
    });
    const json = err.toJSON();
    expect(json.code).toBe('CHAIN_ERROR');
    expect(json.retryable).toBe(true);
    expect(json.requestId).toBe('req_abc123');
    expect(json).not.toHaveProperty('httpStatus');
  });

  it('CHAIN_ERROR is retryable', () => {
    const err = new WAIaaSError('CHAIN_ERROR');
    expect(err.retryable).toBe(true);
  });

  it('supports cause chain', () => {
    const cause = new Error('RPC timeout');
    const err = new WAIaaSError('CHAIN_ERROR', { cause });
    expect(err.cause).toBe(cause);
  });

  it('uses default message when custom message not provided', () => {
    const err = new WAIaaSError('WALLET_NOT_FOUND');
    expect(err.message).toBe('Wallet not found');
  });

  it('MASTER_PASSWORD_LOCKED is 429 but not retryable', () => {
    const err = new WAIaaSError('MASTER_PASSWORD_LOCKED');
    expect(err.httpStatus).toBe(429);
    expect(err.retryable).toBe(false);
  });

  it('RATE_LIMIT_EXCEEDED is 429 and retryable', () => {
    const err = new WAIaaSError('RATE_LIMIT_EXCEEDED');
    expect(err.httpStatus).toBe(429);
    expect(err.retryable).toBe(true);
  });
});
