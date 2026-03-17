/**
 * Tests for SolanaAdapter.mapError() centralized error mapping.
 *
 * Verifies that:
 * - WAIaaSError instances pass through unchanged
 * - ChainError instances pass through unchanged
 * - Generic Error instances are wrapped in WAIaaSError('CHAIN_ERROR')
 * - Non-Error values (strings, numbers) are wrapped with String() conversion
 * - Error cause chain is preserved
 */
import { describe, it, expect } from 'vitest';
import { WAIaaSError, ChainError } from '@waiaas/core';
import { SolanaAdapter } from '../adapter.js';

// Access private method via prototype for testing
function callMapError(operation: string, error: unknown): never {
  const adapter = new SolanaAdapter('solana-devnet');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (adapter as any).mapError(operation, error);
  // mapError always throws, so this line is unreachable
  throw new Error('mapError did not throw');
}

describe('SolanaAdapter.mapError()', () => {
  it('re-throws WAIaaSError as-is', () => {
    const original = new WAIaaSError('WALLET_NOT_FOUND', { message: 'test' });
    expect(() => callMapError('get balance', original)).toThrow(original);
  });

  it('re-throws ChainError as-is', () => {
    const original = new ChainError('INSUFFICIENT_BALANCE', 'solana', {
      message: 'not enough SOL',
    });
    expect(() => callMapError('get balance', original)).toThrow(original);
  });

  it('wraps generic Error in WAIaaSError(CHAIN_ERROR) with operation context', () => {
    const original = new Error('network timeout');
    try {
      callMapError('get balance', original);
      expect.fail('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(WAIaaSError);
      const wErr = err as WAIaaSError;
      expect(wErr.code).toBe('CHAIN_ERROR');
      expect(wErr.message).toContain('Failed to get balance');
      expect(wErr.message).toContain('network timeout');
    }
  });

  it('wraps non-Error value (string) in WAIaaSError(CHAIN_ERROR)', () => {
    try {
      callMapError('submit transaction', 'something went wrong');
      expect.fail('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(WAIaaSError);
      const wErr = err as WAIaaSError;
      expect(wErr.code).toBe('CHAIN_ERROR');
      expect(wErr.message).toContain('Failed to submit transaction');
      expect(wErr.message).toContain('something went wrong');
    }
  });

  it('preserves error cause chain for Error instances', () => {
    const cause = new Error('underlying network failure');
    try {
      callMapError('estimate fee', cause);
      expect.fail('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(WAIaaSError);
      const wErr = err as WAIaaSError;
      expect(wErr.cause).toBe(cause);
    }
  });

  it('does not set cause for non-Error values', () => {
    try {
      callMapError('get balance', 42);
      expect.fail('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(WAIaaSError);
      const wErr = err as WAIaaSError;
      expect(wErr.cause).toBeUndefined();
    }
  });
});
