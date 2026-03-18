/**
 * Coverage sweep tests for API route helpers and uncovered paths.
 *
 * Targets:
 * - core error classes and utilities
 * - safeJsonParse patterns
 * - NATIVE_DECIMALS / NATIVE_SYMBOLS constants
 */

import { describe, it, expect } from 'vitest';

// ---------------------------------------------------------------------------
// Core error classes
// ---------------------------------------------------------------------------

describe('WAIaaSError patterns', () => {
  it('WAIaaSError has code and message', async () => {
    const { WAIaaSError } = await import('@waiaas/core');
    const error = new WAIaaSError('WALLET_NOT_FOUND', { message: 'test' });
    expect(error.code).toBe('WALLET_NOT_FOUND');
    expect(error.message).toBe('test');
    expect(error instanceof Error).toBe(true);
  });

  it('WAIaaSError with details', async () => {
    const { WAIaaSError } = await import('@waiaas/core');
    const error = new WAIaaSError('POLICY_DENIED', {
      message: 'denied',
      details: { reason: 'spending limit' },
    });
    expect(error.code).toBe('POLICY_DENIED');
    expect(error.details).toEqual({ reason: 'spending limit' });
  });

  it('WAIaaSError with retryable flag', async () => {
    const { WAIaaSError } = await import('@waiaas/core');
    const error = new WAIaaSError('CHAIN_ERROR', {
      message: 'timeout',
      retryable: true,
    });
    expect(error.retryable).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Core utilities
// ---------------------------------------------------------------------------

describe('generateId', () => {
  it('generates unique UUID v7 IDs', async () => {
    const { generateId } = await import('../infrastructure/database/id.js');
    const id1 = generateId();
    const id2 = generateId();
    expect(id1).not.toBe(id2);
    expect(id1.length).toBeGreaterThan(20);
  });
});

describe('formatAmount', () => {
  it('formats with correct decimals', async () => {
    const { formatAmount } = await import('@waiaas/core');
    expect(formatAmount(1000000000n, 9)).toBe('1');
    expect(formatAmount(0n, 18)).toBe('0');
    expect(formatAmount(1500000n, 6)).toBe('1.5');
  });

  it('handles very large amounts', async () => {
    const { formatAmount } = await import('@waiaas/core');
    const result = formatAmount(1000000000000000000000n, 18);
    expect(result).toBe('1000');
  });
});

describe('nativeSymbol', () => {
  it('returns correct native symbol', async () => {
    const { nativeSymbol } = await import('@waiaas/core');
    expect(nativeSymbol('solana')).toBe('SOL');
    expect(nativeSymbol('ethereum')).toBe('ETH');
  });
});

describe('safeJsonParse', () => {
  it('parses valid JSON with schema', async () => {
    const { safeJsonParse } = await import('@waiaas/core');
    const { z } = await import('zod');
    const result = safeJsonParse('["hello"]', z.array(z.string()));
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toEqual(['hello']);
  });

  it('returns failure for invalid JSON', async () => {
    const { safeJsonParse } = await import('@waiaas/core');
    const { z } = await import('zod');
    const result = safeJsonParse('not-json{', z.array(z.string()));
    expect(result.success).toBe(false);
  });

  it('returns failure for schema mismatch', async () => {
    const { safeJsonParse } = await import('@waiaas/core');
    const { z } = await import('zod');
    const result = safeJsonParse('"hello"', z.array(z.string()));
    expect(result.success).toBe(false);
  });
});

describe('NATIVE_DECIMALS', () => {
  it('has correct values for known chains', async () => {
    const { NATIVE_DECIMALS } = await import('@waiaas/core');
    expect(NATIVE_DECIMALS.ethereum).toBe(18);
    expect(NATIVE_DECIMALS.solana).toBe(9);
  });
});

describe('EVENT_CATEGORY_MAP', () => {
  it('maps notification events to categories', async () => {
    const { EVENT_CATEGORY_MAP } = await import('@waiaas/core');
    expect(EVENT_CATEGORY_MAP.TX_CONFIRMED).toBeDefined();
    expect(EVENT_CATEGORY_MAP.KILL_SWITCH_ACTIVATED).toBeDefined();
  });
});
