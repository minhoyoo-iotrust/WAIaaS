/**
 * Tests for response enrichment: amountFormatted/decimals/symbol in transaction
 * detail responses, and balanceFormatted in balance/assets responses.
 *
 * Phase 404: RESP-01 ~ RESP-05 requirements.
 * Tests pure formatting logic + response schema fields.
 */

import { describe, it, expect } from 'vitest';
import { formatAmount } from '@waiaas/core';

// ---------------------------------------------------------------------------
// getNativeTokenInfo helper tests (will be exported from transactions.ts)
// ---------------------------------------------------------------------------

// Import the helpers after they're created
import { getNativeTokenInfo, resolveAmountMetadata } from '../api/routes/transactions.js';

describe('getNativeTokenInfo', () => {
  it('should return SOL info for solana chain', () => {
    const info = getNativeTokenInfo('solana');
    expect(info).toEqual({ decimals: 9, symbol: 'SOL' });
  });

  it('should return ETH info for evm chain with ethereum network', () => {
    const info = getNativeTokenInfo('evm', 'ethereum-mainnet');
    expect(info).toEqual({ decimals: 18, symbol: 'ETH' });
  });

  it('should return POL for polygon-mainnet', () => {
    const info = getNativeTokenInfo('evm', 'polygon-mainnet');
    expect(info).toEqual({ decimals: 18, symbol: 'POL' });
  });

  it('should return BNB for bsc-mainnet', () => {
    const info = getNativeTokenInfo('evm', 'bsc-mainnet');
    expect(info).toEqual({ decimals: 18, symbol: 'BNB' });
  });

  it('should return AVAX for avalanche-mainnet', () => {
    const info = getNativeTokenInfo('evm', 'avalanche-mainnet');
    expect(info).toEqual({ decimals: 18, symbol: 'AVAX' });
  });

  it('should default to ETH for unknown evm network', () => {
    const info = getNativeTokenInfo('evm', 'unknown-network');
    expect(info).toEqual({ decimals: 18, symbol: 'ETH' });
  });

  it('should return null for unknown chain', () => {
    const info = getNativeTokenInfo('bitcoin');
    expect(info).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// resolveAmountMetadata tests
// ---------------------------------------------------------------------------

describe('resolveAmountMetadata', () => {
  it('should return null fields when amount is null', () => {
    const result = resolveAmountMetadata('evm', 'ethereum-mainnet', 'TRANSFER', null);
    expect(result).toEqual({
      amountFormatted: null,
      decimals: null,
      symbol: null,
    });
  });

  it('should format TRANSFER with native token info (ETH 18 decimals)', () => {
    const result = resolveAmountMetadata('evm', 'ethereum-mainnet', 'TRANSFER', '1000000000000000000');
    expect(result).toEqual({
      amountFormatted: '1',
      decimals: 18,
      symbol: 'ETH',
    });
  });

  it('should format TRANSFER with SOL 9 decimals', () => {
    const result = resolveAmountMetadata('solana', 'solana-mainnet', 'TRANSFER', '1500000000');
    expect(result).toEqual({
      amountFormatted: '1.5',
      decimals: 9,
      symbol: 'SOL',
    });
  });

  it('should return null fields for CONTRACT_CALL type', () => {
    const result = resolveAmountMetadata('evm', 'ethereum-mainnet', 'CONTRACT_CALL', '1000');
    expect(result).toEqual({
      amountFormatted: null,
      decimals: null,
      symbol: null,
    });
  });

  it('should format correctly for different decimal values (6 decimals)', () => {
    // Simulate a known-decimals call directly with formatAmount
    const formatted = formatAmount(1500000n, 6);
    expect(formatted).toBe('1.5');
  });

  it('should format correctly for 8 decimals', () => {
    const formatted = formatAmount(100000000n, 8);
    expect(formatted).toBe('1');
  });

  it('should handle zero amount', () => {
    const result = resolveAmountMetadata('evm', 'ethereum-mainnet', 'TRANSFER', '0');
    expect(result).toEqual({
      amountFormatted: '0',
      decimals: 18,
      symbol: 'ETH',
    });
  });

  it('should handle very large amounts', () => {
    const result = resolveAmountMetadata('evm', 'ethereum-mainnet', 'TRANSFER', '100000000000000000000');
    expect(result).toEqual({
      amountFormatted: '100',
      decimals: 18,
      symbol: 'ETH',
    });
  });

  it('should return null fields on conversion error (invalid amount string)', () => {
    const result = resolveAmountMetadata('evm', 'ethereum-mainnet', 'TRANSFER', 'not-a-number');
    expect(result).toEqual({
      amountFormatted: null,
      decimals: null,
      symbol: null,
    });
  });
});

// ---------------------------------------------------------------------------
// balanceFormatted tests (formatAmount utility)
// ---------------------------------------------------------------------------

describe('balanceFormatted computation', () => {
  it('should format SOL balance (9 decimals)', () => {
    const formatted = formatAmount(2_500_000_000n, 9);
    expect(formatted).toBe('2.5');
  });

  it('should format ETH balance (18 decimals)', () => {
    const formatted = formatAmount(1_000_000_000_000_000_000n, 18);
    expect(formatted).toBe('1');
  });

  it('should format zero balance', () => {
    const formatted = formatAmount(0n, 9);
    expect(formatted).toBe('0');
  });

  it('should format fractional balance', () => {
    const formatted = formatAmount(123456789n, 9);
    expect(formatted).toBe('0.123456789');
  });

  it('should format USDC balance (6 decimals)', () => {
    const formatted = formatAmount(1_000_000n, 6);
    expect(formatted).toBe('1');
  });
});
