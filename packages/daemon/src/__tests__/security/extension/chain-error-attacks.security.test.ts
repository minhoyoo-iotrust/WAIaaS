/**
 * SEC-13: ChainError 3-category mapping security -- 12 attack scenarios.
 *
 * Verifies that all 29 ChainErrorCode values are correctly mapped to
 * PERMANENT/TRANSIENT/STALE categories and that retryable is auto-derived.
 *
 * Misclassifying PERMANENT as TRANSIENT causes infinite retry loops.
 * Misclassifying TRANSIENT as PERMANENT causes unnecessary permanent failure.
 * Both are security-critical for wallet operations.
 *
 * @see packages/core/src/errors/chain-error.ts
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
// Expected mappings (hardcoded to detect silent changes)
// ---------------------------------------------------------------------------

const EXPECTED_PERMANENT: ChainErrorCode[] = [
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

const EXPECTED_TRANSIENT: ChainErrorCode[] = [
  'RPC_TIMEOUT',
  'RPC_CONNECTION_ERROR',
  'RATE_LIMITED',
  'NODE_BEHIND',
];

const EXPECTED_STALE: ChainErrorCode[] = [
  'BLOCKHASH_EXPIRED',
  'NONCE_TOO_LOW',
  'NONCE_ALREADY_USED',
  'SLOT_SKIPPED',
];

const ALL_EXPECTED_CODES: ChainErrorCode[] = [
  ...EXPECTED_PERMANENT,
  ...EXPECTED_TRANSIENT,
  ...EXPECTED_STALE,
];

// ---------------------------------------------------------------------------
// SEC-13-01: PERMANENT codes retryable === false (exhaustive)
// ---------------------------------------------------------------------------

describe('SEC-13-01: All 21 PERMANENT codes have retryable=false', () => {
  it.each(EXPECTED_PERMANENT)(
    '%s -> retryable=false',
    (code) => {
      const err = new ChainError(code, 'solana');
      expect(err.category).toBe('PERMANENT');
      expect(err.retryable).toBe(false);
    },
  );

  it('exactly 21 PERMANENT codes exist', () => {
    expect(EXPECTED_PERMANENT).toHaveLength(21);
    const actualPermanent = Object.entries(CHAIN_ERROR_CATEGORIES)
      .filter(([, cat]) => cat === 'PERMANENT')
      .map(([code]) => code);
    expect(actualPermanent.sort()).toEqual([...EXPECTED_PERMANENT].sort());
  });
});

// ---------------------------------------------------------------------------
// SEC-13-02: TRANSIENT codes retryable === true (exhaustive)
// ---------------------------------------------------------------------------

describe('SEC-13-02: All 4 TRANSIENT codes have retryable=true', () => {
  it.each(EXPECTED_TRANSIENT)(
    '%s -> retryable=true',
    (code) => {
      const err = new ChainError(code, 'ethereum');
      expect(err.category).toBe('TRANSIENT');
      expect(err.retryable).toBe(true);
    },
  );

  it('exactly 4 TRANSIENT codes exist', () => {
    expect(EXPECTED_TRANSIENT).toHaveLength(4);
    const actualTransient = Object.entries(CHAIN_ERROR_CATEGORIES)
      .filter(([, cat]) => cat === 'TRANSIENT')
      .map(([code]) => code);
    expect(actualTransient.sort()).toEqual([...EXPECTED_TRANSIENT].sort());
  });
});

// ---------------------------------------------------------------------------
// SEC-13-03: STALE codes retryable === true (exhaustive)
// ---------------------------------------------------------------------------

describe('SEC-13-03: All 4 STALE codes have retryable=true', () => {
  it.each(EXPECTED_STALE)(
    '%s -> retryable=true',
    (code) => {
      const err = new ChainError(code, 'solana');
      expect(err.category).toBe('STALE');
      expect(err.retryable).toBe(true);
    },
  );

  it('exactly 4 STALE codes exist', () => {
    expect(EXPECTED_STALE).toHaveLength(4);
    const actualStale = Object.entries(CHAIN_ERROR_CATEGORIES)
      .filter(([, cat]) => cat === 'STALE')
      .map(([code]) => code);
    expect(actualStale.sort()).toEqual([...EXPECTED_STALE].sort());
  });
});

// ---------------------------------------------------------------------------
// SEC-13-04: Total code count === 29 (detect additions/removals)
// ---------------------------------------------------------------------------

describe('SEC-13-04: CHAIN_ERROR_CATEGORIES has exactly 29 entries', () => {
  it('total keys === 29', () => {
    const keys = Object.keys(CHAIN_ERROR_CATEGORIES);
    expect(keys).toHaveLength(29);
  });

  it('21 + 4 + 4 = 29 partitions are exhaustive and disjoint', () => {
    const allExpected = new Set(ALL_EXPECTED_CODES);
    expect(allExpected.size).toBe(29);

    const allActual = new Set(Object.keys(CHAIN_ERROR_CATEGORIES));
    expect(allActual.size).toBe(29);

    // Every expected code is in actual
    for (const code of allExpected) {
      expect(allActual.has(code)).toBe(true);
    }

    // Every actual code is in expected
    for (const code of allActual) {
      expect(allExpected.has(code as ChainErrorCode)).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// SEC-13-05: Constructor category matches CHAIN_ERROR_CATEGORIES[code]
// ---------------------------------------------------------------------------

describe('SEC-13-05: ChainError.category === CHAIN_ERROR_CATEGORIES[code]', () => {
  it.each(ALL_EXPECTED_CODES)(
    '%s constructor category matches mapping',
    (code) => {
      const err = new ChainError(code, 'solana');
      expect(err.category).toBe(CHAIN_ERROR_CATEGORIES[code]);
    },
  );
});

// ---------------------------------------------------------------------------
// SEC-13-06: retryable === (category !== 'PERMANENT') derivation
// ---------------------------------------------------------------------------

describe('SEC-13-06: retryable auto-derivation is correct for all 29 codes', () => {
  it.each(ALL_EXPECTED_CODES)(
    '%s: retryable === (category !== PERMANENT)',
    (code) => {
      const err = new ChainError(code, 'ethereum');
      const expectedRetryable = CHAIN_ERROR_CATEGORIES[code] !== 'PERMANENT';
      expect(err.retryable).toBe(expectedRetryable);
    },
  );
});

// ---------------------------------------------------------------------------
// SEC-13-07: PERMANENT error retry prevention scenario
// ---------------------------------------------------------------------------

describe('SEC-13-07: PERMANENT errors must NOT be retried (security scenario)', () => {
  const dangerousRetryScenarios: Array<{
    code: ChainErrorCode;
    scenario: string;
  }> = [
    { code: 'INSUFFICIENT_BALANCE', scenario: 'retrying tx with insufficient funds wastes gas' },
    { code: 'INVALID_ADDRESS', scenario: 'retrying with invalid recipient is pointless' },
    { code: 'DUPLICATE_TRANSACTION', scenario: 'retrying duplicate risks double-spend detection' },
    { code: 'UNAUTHORIZED_SIGNER', scenario: 'retrying with wrong signer is an attack vector' },
    { code: 'WALLET_NOT_SIGNER', scenario: 'retrying without wallet signer is permanently invalid' },
  ];

  it.each(dangerousRetryScenarios)(
    '$code: $scenario',
    ({ code }) => {
      const err = new ChainError(code, 'solana');
      // Simulating a retry loop guard
      let retryCount = 0;
      const MAX_RETRIES = 3;

      // A correctly implemented retry loop should check retryable
      while (err.retryable && retryCount < MAX_RETRIES) {
        retryCount++;
      }

      // With PERMANENT -> retryable=false, the loop never executes
      expect(retryCount).toBe(0);
      expect(err.retryable).toBe(false);
    },
  );
});

// ---------------------------------------------------------------------------
// SEC-13-08: TRANSIENT error retry safety
// ---------------------------------------------------------------------------

describe('SEC-13-08: TRANSIENT errors are safe to retry (same TX)', () => {
  it.each(EXPECTED_TRANSIENT)(
    '%s: retryable=true, same transaction is safe to resubmit',
    (code) => {
      const err = new ChainError(code, 'ethereum');
      expect(err.retryable).toBe(true);
      expect(err.category).toBe('TRANSIENT');
      // TRANSIENT errors are infrastructure-level -- same TX can be resubmitted as-is
      // No need to rebuild transaction, just retry the same request
    },
  );
});

// ---------------------------------------------------------------------------
// SEC-13-09: STALE error requires TX rebuild before retry
// ---------------------------------------------------------------------------

describe('SEC-13-09: STALE errors require transaction rebuild before retry', () => {
  const staleRebuildReasons: Array<{
    code: ChainErrorCode;
    reason: string;
  }> = [
    { code: 'BLOCKHASH_EXPIRED', reason: 'must fetch new recent blockhash' },
    { code: 'NONCE_TOO_LOW', reason: 'must use higher nonce from pending pool' },
    { code: 'NONCE_ALREADY_USED', reason: 'must query current nonce and increment' },
    { code: 'SLOT_SKIPPED', reason: 'must rebuild with current slot context' },
  ];

  it.each(staleRebuildReasons)(
    '$code: retryable=true but $reason',
    ({ code }) => {
      const err = new ChainError(code, 'solana');
      expect(err.retryable).toBe(true);
      expect(err.category).toBe('STALE');
      // Critical: STALE errors are retryable but REQUIRE transaction rebuild.
      // Resubmitting the same TX without rebuild will fail again.
      // Distinguishing STALE from TRANSIENT is security-critical.
      expect(err.category).not.toBe('TRANSIENT');
    },
  );
});

// ---------------------------------------------------------------------------
// SEC-13-10: toJSON() serialization integrity
// ---------------------------------------------------------------------------

describe('SEC-13-10: ChainError.toJSON() includes all security-relevant fields', () => {
  it('serialized output contains code, message, category, chain, retryable', () => {
    const err = new ChainError('INSUFFICIENT_BALANCE', 'solana', {
      message: 'Not enough SOL for transfer',
    });
    const json = err.toJSON();

    expect(json).toEqual({
      code: 'INSUFFICIENT_BALANCE',
      message: 'Not enough SOL for transfer',
      category: 'PERMANENT',
      chain: 'solana',
      retryable: false,
    });
  });

  it('toJSON keys are exactly 5 (no extra info leakage)', () => {
    const err = new ChainError('RPC_TIMEOUT', 'ethereum');
    const json = err.toJSON();
    expect(Object.keys(json).sort()).toEqual(
      ['category', 'chain', 'code', 'message', 'retryable'].sort(),
    );
  });

  it('default message format is "Chain error: {code}"', () => {
    const err = new ChainError('RATE_LIMITED', 'solana');
    expect(err.message).toBe('Chain error: RATE_LIMITED');
    expect(err.toJSON().message).toBe('Chain error: RATE_LIMITED');
  });
});

// ---------------------------------------------------------------------------
// SEC-13-11: Cause chaining (error context preservation)
// ---------------------------------------------------------------------------

describe('SEC-13-11: ChainError cause chaining preserves error context', () => {
  it('cause is set when provided in options', () => {
    const rootCause = new Error('connection refused');
    const err = new ChainError('RPC_CONNECTION_ERROR', 'ethereum', {
      message: 'Failed to connect to RPC',
      cause: rootCause,
    });

    expect(err.cause).toBe(rootCause);
    expect((err.cause as Error).message).toBe('connection refused');
  });

  it('cause is undefined when not provided', () => {
    const err = new ChainError('INVALID_ADDRESS', 'solana');
    expect(err.cause).toBeUndefined();
  });

  it('ChainError is an instance of Error', () => {
    const err = new ChainError('NODE_BEHIND', 'ethereum');
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe('ChainError');
  });
});

// ---------------------------------------------------------------------------
// SEC-13-12: Type safety (compile-time protection)
// ---------------------------------------------------------------------------

describe('SEC-13-12: Type safety prevents invalid error codes at compile time', () => {
  it('all valid ChainErrorCode values create valid ChainError instances', () => {
    // Verify all 29 codes can be instantiated without runtime errors
    for (const code of ALL_EXPECTED_CODES) {
      const err = new ChainError(code, 'solana');
      expect(err.code).toBe(code);
      expect(err.category).toBeDefined();
      expect(typeof err.retryable).toBe('boolean');
    }
  });

  it('ChainErrorCode type and CHAIN_ERROR_CATEGORIES keys are in sync', () => {
    // The TypeScript type system ensures Record<ChainErrorCode, ChainErrorCategory>
    // has an entry for every ChainErrorCode. This runtime check verifies
    // no undefined categories exist (which would indicate a type mismatch).
    const allCategories: ChainErrorCategory[] = ['PERMANENT', 'TRANSIENT', 'STALE'];
    for (const [code, category] of Object.entries(CHAIN_ERROR_CATEGORIES)) {
      expect(allCategories).toContain(category);
      // Verify we can construct with every key in the mapping
      const err = new ChainError(code as ChainErrorCode, 'ethereum');
      expect(err.category).toBe(category);
    }
  });

  it('chain parameter is preserved for any valid chain string', () => {
    const chains = ['solana', 'ethereum', 'polygon', 'base', 'arbitrum'];
    for (const chain of chains) {
      const err = new ChainError('INSUFFICIENT_BALANCE', chain);
      expect(err.chain).toBe(chain);
    }
  });
});
