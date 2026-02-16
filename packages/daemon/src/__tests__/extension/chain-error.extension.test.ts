/**
 * EXT-07: ChainError 3-category system functional tests (12 scenarios).
 *
 * Tests ChainError from a "normal usage" perspective:
 * - CE-01~CE-03: 3-category classification accuracy (PERMANENT 21, TRANSIENT 4, STALE 4)
 * - CE-04~CE-06: Constructor defaults + retryable auto-derivation
 * - CE-07~CE-09: toJSON() serialization + cause chaining
 * - CE-10~CE-12: Cross-validation + real-world usage patterns
 *
 * Differs from chain-error-attacks.security.test.ts (security perspective):
 *   This file validates correct normal behavior -- all 29 codes classified correctly,
 *   retryable derived accurately, serialization complete, and cause chaining works.
 *
 * @see packages/core/src/errors/chain-error.ts
 * @see docs/64-extension-test-strategy.md
 */

import { describe, it, expect } from 'vitest';
import {
  ChainError,
  CHAIN_ERROR_CATEGORIES,
} from '@waiaas/core';
import type {
  ChainErrorCode,
  ChainErrorCategory,
} from '@waiaas/core';

// ---------------------------------------------------------------------------
// Expected category mappings (exhaustive reference)
// ---------------------------------------------------------------------------

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

const ALL_CODES: ChainErrorCode[] = [
  ...PERMANENT_CODES,
  ...TRANSIENT_CODES,
  ...STALE_CODES,
];

// ===========================================================================
// CE-01~CE-03: 3-category classification accuracy
// ===========================================================================

describe('CE-01~CE-03: 3-category classification accuracy', () => {
  // CE-01: All 21 PERMANENT codes -> category='PERMANENT', retryable=false
  it('CE-01: all 21 PERMANENT codes are classified correctly', () => {
    expect(PERMANENT_CODES).toHaveLength(21);

    for (const code of PERMANENT_CODES) {
      const err = new ChainError(code, 'ethereum');
      expect(err.category).toBe('PERMANENT');
      expect(err.retryable).toBe(false);
      expect(CHAIN_ERROR_CATEGORIES[code]).toBe('PERMANENT');
    }

    // Verify against source mapping
    const actualPermanent = Object.entries(CHAIN_ERROR_CATEGORIES)
      .filter(([, cat]) => cat === 'PERMANENT')
      .map(([code]) => code as ChainErrorCode);
    expect(actualPermanent.sort()).toEqual([...PERMANENT_CODES].sort());
  });

  // CE-02: All 4 TRANSIENT codes -> category='TRANSIENT', retryable=true
  it('CE-02: all 4 TRANSIENT codes are classified correctly', () => {
    expect(TRANSIENT_CODES).toHaveLength(4);

    for (const code of TRANSIENT_CODES) {
      const err = new ChainError(code, 'solana');
      expect(err.category).toBe('TRANSIENT');
      expect(err.retryable).toBe(true);
      expect(CHAIN_ERROR_CATEGORIES[code]).toBe('TRANSIENT');
    }

    const actualTransient = Object.entries(CHAIN_ERROR_CATEGORIES)
      .filter(([, cat]) => cat === 'TRANSIENT')
      .map(([code]) => code as ChainErrorCode);
    expect(actualTransient.sort()).toEqual([...TRANSIENT_CODES].sort());
  });

  // CE-03: All 4 STALE codes -> category='STALE', retryable=true
  it('CE-03: all 4 STALE codes are classified correctly', () => {
    expect(STALE_CODES).toHaveLength(4);

    for (const code of STALE_CODES) {
      const err = new ChainError(code, 'ethereum');
      expect(err.category).toBe('STALE');
      expect(err.retryable).toBe(true);
      expect(CHAIN_ERROR_CATEGORIES[code]).toBe('STALE');
    }

    const actualStale = Object.entries(CHAIN_ERROR_CATEGORIES)
      .filter(([, cat]) => cat === 'STALE')
      .map(([code]) => code as ChainErrorCode);
    expect(actualStale.sort()).toEqual([...STALE_CODES].sort());
  });
});

// ===========================================================================
// CE-04~CE-06: Constructor + retryable auto-derivation
// ===========================================================================

describe('CE-04~CE-06: Constructor + retryable auto-derivation', () => {
  // CE-04: Constructor with code + chain only -> default message
  it('CE-04: constructor with code + chain produces default message', () => {
    const err = new ChainError('INSUFFICIENT_BALANCE', 'solana');

    expect(err.code).toBe('INSUFFICIENT_BALANCE');
    expect(err.chain).toBe('solana');
    expect(err.message).toBe('Chain error: INSUFFICIENT_BALANCE');
    expect(err.name).toBe('ChainError');
    expect(err.category).toBe('PERMANENT');
    expect(err.retryable).toBe(false);
  });

  // CE-05: Constructor with custom message -> overrides default
  it('CE-05: constructor with custom message overrides default', () => {
    const err = new ChainError('RPC_TIMEOUT', 'ethereum', {
      message: 'Connection to Infura timed out after 30s',
    });

    expect(err.code).toBe('RPC_TIMEOUT');
    expect(err.chain).toBe('ethereum');
    expect(err.message).toBe('Connection to Infura timed out after 30s');
    // Category and retryable are still auto-derived
    expect(err.category).toBe('TRANSIENT');
    expect(err.retryable).toBe(true);
  });

  // CE-06: retryable = (category !== 'PERMANENT') for all 29 codes
  it('CE-06: retryable auto-derivation is accurate for all 29 codes', () => {
    expect(ALL_CODES).toHaveLength(29);

    for (const code of ALL_CODES) {
      const err = new ChainError(code, 'ethereum');
      const expectedCategory = CHAIN_ERROR_CATEGORIES[code];
      const expectedRetryable = expectedCategory !== 'PERMANENT';

      expect(err.retryable).toBe(expectedRetryable);
      expect(err.category).toBe(expectedCategory);
    }

    // Specific count verification
    const retryableCodes = ALL_CODES.filter(
      (code) => CHAIN_ERROR_CATEGORIES[code] !== 'PERMANENT',
    );
    expect(retryableCodes).toHaveLength(8); // 4 TRANSIENT + 4 STALE

    const nonRetryableCodes = ALL_CODES.filter(
      (code) => CHAIN_ERROR_CATEGORIES[code] === 'PERMANENT',
    );
    expect(nonRetryableCodes).toHaveLength(21);
  });
});

// ===========================================================================
// CE-07~CE-09: toJSON + cause chaining
// ===========================================================================

describe('CE-07~CE-09: toJSON + cause chaining', () => {
  // CE-07: toJSON() returns exactly 5 fields
  it('CE-07: toJSON() returns code, message, category, chain, retryable', () => {
    const err = new ChainError('INVALID_ADDRESS', 'solana', {
      message: 'Invalid Solana public key format',
    });

    const json = err.toJSON();

    expect(json).toEqual({
      code: 'INVALID_ADDRESS',
      message: 'Invalid Solana public key format',
      category: 'PERMANENT',
      chain: 'solana',
      retryable: false,
    });

    // Verify exactly 5 keys (no extras)
    const keys = Object.keys(json).sort();
    expect(keys).toEqual(['category', 'chain', 'code', 'message', 'retryable']);
    expect(keys).toHaveLength(5);
  });

  // CE-08: Cause chaining (Error -> ChainError.cause)
  it('CE-08: cause chaining preserves original error', () => {
    const originalError = new Error('ECONNREFUSED: connection refused');
    const err = new ChainError('RPC_CONNECTION_ERROR', 'ethereum', {
      message: 'Failed to connect to RPC endpoint',
      cause: originalError,
    });

    expect(err.cause).toBeDefined();
    expect(err.cause).toBeInstanceOf(Error);
    expect(err.cause).toBe(originalError);
    expect((err.cause as Error).message).toBe(
      'ECONNREFUSED: connection refused',
    );

    // ChainError itself is also an Error
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe('ChainError');
  });

  // CE-09: toJSON() does not include cause (no leakage)
  it('CE-09: toJSON() excludes cause field (prevents internal leakage)', () => {
    const sensitiveError = new Error('Internal: key material exposed at 0xDEAD');
    const err = new ChainError('CONTRACT_EXECUTION_FAILED', 'ethereum', {
      message: 'Contract call reverted',
      cause: sensitiveError,
    });

    const json = err.toJSON();

    // Cause exists on the error object
    expect(err.cause).toBe(sensitiveError);

    // But it MUST NOT be in the serialized JSON
    expect('cause' in json).toBe(false);
    expect(Object.keys(json)).not.toContain('cause');
    expect(Object.keys(json)).toHaveLength(5);
  });
});

// ===========================================================================
// CE-10~CE-12: Cross-validation + real-world patterns
// ===========================================================================

describe('CE-10~CE-12: Cross-validation + real-world patterns', () => {
  // CE-10: 29 codes = PERMANENT(21) + TRANSIENT(4) + STALE(4) disjoint partition
  it('CE-10: 29 codes form an exhaustive, disjoint 3-partition', () => {
    // Total count
    const allMappingKeys = Object.keys(CHAIN_ERROR_CATEGORIES);
    expect(allMappingKeys).toHaveLength(29);

    // Partition sizes
    expect(PERMANENT_CODES).toHaveLength(21);
    expect(TRANSIENT_CODES).toHaveLength(4);
    expect(STALE_CODES).toHaveLength(4);
    expect(21 + 4 + 4).toBe(29);

    // Disjoint check: no code appears in multiple categories
    const allExpected = new Set<string>();
    for (const code of PERMANENT_CODES) {
      expect(allExpected.has(code)).toBe(false);
      allExpected.add(code);
    }
    for (const code of TRANSIENT_CODES) {
      expect(allExpected.has(code)).toBe(false);
      allExpected.add(code);
    }
    for (const code of STALE_CODES) {
      expect(allExpected.has(code)).toBe(false);
      allExpected.add(code);
    }
    expect(allExpected.size).toBe(29);

    // Exhaustive check: every actual key is accounted for
    const actualSet = new Set(allMappingKeys);
    expect(actualSet.size).toBe(allExpected.size);
    for (const code of actualSet) {
      expect(allExpected.has(code)).toBe(true);
    }
  });

  // CE-11: TRANSIENT errors are safe to retry (same TX resubmit)
  it('CE-11: TRANSIENT errors permit same-transaction retry', () => {
    for (const code of TRANSIENT_CODES) {
      const err = new ChainError(code, 'ethereum');

      // TRANSIENT: infrastructure-level issue, same TX can be resubmitted
      expect(err.retryable).toBe(true);
      expect(err.category).toBe('TRANSIENT');

      // Simulating retry logic: retryable=true allows retry
      let attempts = 0;
      const MAX_RETRIES = 3;
      while (err.retryable && attempts < MAX_RETRIES) {
        attempts++;
        // In real code, we would resubmit the same TX here
        break; // Exit after first retry attempt to avoid infinite loop in test
      }
      expect(attempts).toBe(1); // At least 1 retry attempt is allowed
    }
  });

  // CE-12: STALE errors require TX rebuild (different from TRANSIENT)
  it('CE-12: STALE errors require transaction rebuild before retry', () => {
    const staleReasons: Record<string, string> = {
      BLOCKHASH_EXPIRED: 'must fetch new recent blockhash',
      NONCE_TOO_LOW: 'must use higher nonce from current state',
      NONCE_ALREADY_USED: 'must query current nonce and increment',
      SLOT_SKIPPED: 'must rebuild with current slot context',
    };

    for (const code of STALE_CODES) {
      const err = new ChainError(code, 'solana');

      // STALE: retryable but requires TX rebuild
      expect(err.retryable).toBe(true);
      expect(err.category).toBe('STALE');

      // Critical distinction: STALE !== TRANSIENT
      expect(err.category).not.toBe('TRANSIENT');
      expect(err.category).not.toBe('PERMANENT');

      // Each STALE code has a documented rebuild reason
      expect(staleReasons[code]).toBeDefined();
    }

    // Verify STALE codes are distinct from TRANSIENT codes
    const staleSet = new Set(STALE_CODES);
    const transientSet = new Set(TRANSIENT_CODES);
    for (const code of staleSet) {
      expect(transientSet.has(code)).toBe(false);
    }
  });
});
