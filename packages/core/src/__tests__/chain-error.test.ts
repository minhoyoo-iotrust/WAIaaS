import { describe, it, expect } from 'vitest';
import {
  ChainError,
  type ChainErrorCode,
  CHAIN_ERROR_CATEGORIES,
} from '../errors/chain-error.js';

describe('ChainError', () => {
  describe('construction', () => {
    it('creates PERMANENT error with retryable=false', () => {
      const err = new ChainError('INSUFFICIENT_BALANCE', 'SOLANA');
      expect(err.code).toBe('INSUFFICIENT_BALANCE');
      expect(err.category).toBe('PERMANENT');
      expect(err.retryable).toBe(false);
      expect(err.chain).toBe('SOLANA');
    });

    it('creates TRANSIENT error with retryable=true', () => {
      const err = new ChainError('RPC_TIMEOUT', 'SOLANA');
      expect(err.code).toBe('RPC_TIMEOUT');
      expect(err.category).toBe('TRANSIENT');
      expect(err.retryable).toBe(true);
      expect(err.chain).toBe('SOLANA');
    });

    it('creates STALE error with retryable=true', () => {
      const err = new ChainError('BLOCKHASH_EXPIRED', 'SOLANA');
      expect(err.code).toBe('BLOCKHASH_EXPIRED');
      expect(err.category).toBe('STALE');
      expect(err.retryable).toBe(true);
      expect(err.chain).toBe('SOLANA');
    });

    it('is an instance of Error', () => {
      const err = new ChainError('INSUFFICIENT_BALANCE', 'SOLANA');
      expect(err instanceof Error).toBe(true);
    });

    it('chain field matches constructor argument', () => {
      const err = new ChainError('INVALID_ADDRESS', 'EVM');
      expect(err.chain).toBe('EVM');
    });

    it('uses default message based on code', () => {
      const err = new ChainError('RPC_TIMEOUT', 'SOLANA');
      expect(err.message).toBeTruthy();
      expect(err.message).toContain('RPC_TIMEOUT');
    });

    it('accepts custom message', () => {
      const err = new ChainError('RPC_TIMEOUT', 'SOLANA', {
        message: 'Custom timeout message',
      });
      expect(err.message).toBe('Custom timeout message');
    });

    it('has name ChainError', () => {
      const err = new ChainError('INSUFFICIENT_BALANCE', 'SOLANA');
      expect(err.name).toBe('ChainError');
    });
  });

  describe('29 error code category mapping', () => {
    const PERMANENT_CODES: ChainErrorCode[] = [
      'INSUFFICIENT_BALANCE',
      'INVALID_ADDRESS',
      'ACCOUNT_NOT_FOUND',
      'CONTRACT_EXECUTION_FAILED',
      'INVALID_INSTRUCTION',
      'PROGRAM_NOT_FOUND',
      'TOKEN_ACCOUNT_NOT_FOUND',
      'INSUFFICIENT_TOKEN_BALANCE',
      'SPENDER_NOT_APPROVED',
      'ATA_CREATION_FAILED',
      'INVALID_PROGRAM_DATA',
      'UNAUTHORIZED_SIGNER',
      'TRANSACTION_TOO_LARGE',
      'DUPLICATE_TRANSACTION',
      'ACCOUNT_ALREADY_EXISTS',
      'INVALID_TOKEN_PROGRAM',
      'INSUFFICIENT_FOR_FEE',
      'BATCH_NOT_SUPPORTED',
      'BATCH_SIZE_EXCEEDED',
      'INVALID_RAW_TRANSACTION',
      'WALLET_NOT_SIGNER',
    ];

    const TRANSIENT_CODES: ChainErrorCode[] = [
      'RPC_TIMEOUT',
      'RPC_CONNECTION_ERROR',
      'RATE_LIMITED',
      'NODE_BEHIND',
    ];

    const STALE_CODES: ChainErrorCode[] = [
      'BLOCKHASH_EXPIRED',
      'NONCE_TOO_LOW',
      'NONCE_ALREADY_USED',
      'SLOT_SKIPPED',
    ];

    it('has exactly 29 error codes', () => {
      expect(Object.keys(CHAIN_ERROR_CATEGORIES)).toHaveLength(29);
    });

    it('PERMANENT category has 21 codes', () => {
      expect(PERMANENT_CODES).toHaveLength(21);
      for (const code of PERMANENT_CODES) {
        expect(CHAIN_ERROR_CATEGORIES[code]).toBe('PERMANENT');
      }
    });

    it('TRANSIENT category has 4 codes', () => {
      expect(TRANSIENT_CODES).toHaveLength(4);
      for (const code of TRANSIENT_CODES) {
        expect(CHAIN_ERROR_CATEGORIES[code]).toBe('TRANSIENT');
      }
    });

    it('STALE category has 4 codes', () => {
      expect(STALE_CODES).toHaveLength(4);
      for (const code of STALE_CODES) {
        expect(CHAIN_ERROR_CATEGORIES[code]).toBe('STALE');
      }
    });

    it('all 29 codes accounted for (PERMANENT + TRANSIENT + STALE)', () => {
      const allCodes = [...PERMANENT_CODES, ...TRANSIENT_CODES, ...STALE_CODES];
      expect(allCodes).toHaveLength(29);

      const allKeys = Object.keys(CHAIN_ERROR_CATEGORIES);
      expect(allKeys.sort()).toEqual(allCodes.sort());
    });
  });

  describe('retryable auto-derivation', () => {
    it('PERMANENT codes are not retryable', () => {
      const err = new ChainError('INSUFFICIENT_BALANCE', 'SOLANA');
      expect(err.retryable).toBe(false);
    });

    it('TRANSIENT codes are retryable', () => {
      const err = new ChainError('RPC_TIMEOUT', 'SOLANA');
      expect(err.retryable).toBe(true);
    });

    it('STALE codes are retryable', () => {
      const err = new ChainError('BLOCKHASH_EXPIRED', 'SOLANA');
      expect(err.retryable).toBe(true);
    });

    it('retryable is derived from category, not manually set', () => {
      // Verify all codes follow the rule
      for (const [code, category] of Object.entries(CHAIN_ERROR_CATEGORIES)) {
        const err = new ChainError(code as ChainErrorCode, 'SOLANA');
        const expectedRetryable = category !== 'PERMANENT';
        expect(err.retryable).toBe(expectedRetryable);
      }
    });
  });

  describe('toJSON()', () => {
    it('returns serialized representation with code, message, category, chain, retryable', () => {
      const err = new ChainError('RPC_TIMEOUT', 'SOLANA', {
        message: 'Request timed out',
      });
      const json = err.toJSON();
      expect(json).toEqual({
        code: 'RPC_TIMEOUT',
        message: 'Request timed out',
        category: 'TRANSIENT',
        chain: 'SOLANA',
        retryable: true,
      });
    });

    it('does not include extra properties', () => {
      const err = new ChainError('INSUFFICIENT_BALANCE', 'EVM');
      const json = err.toJSON();
      const keys = Object.keys(json).sort();
      expect(keys).toEqual(['category', 'chain', 'code', 'message', 'retryable']);
    });
  });

  describe('cause chaining', () => {
    it('supports optional cause error', () => {
      const originalError = new Error('Connection refused');
      const err = new ChainError('RPC_TIMEOUT', 'SOLANA', {
        cause: originalError,
      });
      expect(err.cause).toBe(originalError);
    });

    it('cause is undefined when not provided', () => {
      const err = new ChainError('RPC_TIMEOUT', 'SOLANA');
      expect(err.cause).toBeUndefined();
    });
  });
});
