/**
 * Tests for XRPL DEX OfferBuilder.
 * Covers: formatXrplAmount, buildSwapParams, buildLimitOrderParams,
 *         buildCancelParams, validateReserve, parseTokenToBookOfferCurrency.
 *
 * @see Phase 02-01 Task 2
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  formatXrplAmount,
  parseTokenToBookOfferCurrency,
  buildSwapParams,
  buildLimitOrderParams,
  buildCancelParams,
  validateReserve,
  RIPPLE_EPOCH,
  TF_IMMEDIATE_OR_CANCEL,
  OWNER_RESERVE_DROPS,
} from '../offer-builder.js';

// ---------------------------------------------------------------------------
// formatXrplAmount
// ---------------------------------------------------------------------------

describe('formatXrplAmount', () => {
  it('returns drops string for XRP', () => {
    expect(formatXrplAmount('XRP', '1000000')).toBe('1000000');
  });

  it('returns IssuedCurrencyAmount object for IOU', () => {
    const result = formatXrplAmount('USD.rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe', '100.5');
    expect(result).toEqual({
      currency: 'USD',
      issuer: 'rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe',
      value: '100.5',
    });
  });

  it('handles 40-char hex currency code IOU', () => {
    const hexCurrency = '0158415500000000C1F76FF6ECB0BAC600000000';
    const token = `${hexCurrency}.rIssuer123`;
    const result = formatXrplAmount(token, '50');
    expect(result).toEqual({
      currency: hexCurrency,
      issuer: 'rIssuer123',
      value: '50',
    });
  });

  it('throws on zero amount', () => {
    expect(() => formatXrplAmount('XRP', '0')).toThrow('Invalid amount');
  });

  it('throws on negative amount', () => {
    expect(() => formatXrplAmount('XRP', '-100')).toThrow('Invalid amount');
  });

  it('throws on invalid IOU format (no dot)', () => {
    expect(() => formatXrplAmount('USD', '100')).toThrow('Invalid IOU token format');
  });

  it('throws on invalid IOU format (dot at start)', () => {
    expect(() => formatXrplAmount('.rIssuer', '100')).toThrow('Invalid IOU token format');
  });

  it('throws on invalid IOU format (dot at end)', () => {
    expect(() => formatXrplAmount('USD.', '100')).toThrow('Invalid IOU token format');
  });
});

// ---------------------------------------------------------------------------
// parseTokenToBookOfferCurrency
// ---------------------------------------------------------------------------

describe('parseTokenToBookOfferCurrency', () => {
  it('parses XRP', () => {
    expect(parseTokenToBookOfferCurrency('XRP')).toEqual({ currency: 'XRP' });
  });

  it('parses IOU token', () => {
    expect(parseTokenToBookOfferCurrency('USD.rIssuer123')).toEqual({
      currency: 'USD',
      issuer: 'rIssuer123',
    });
  });

  it('throws on invalid format', () => {
    expect(() => parseTokenToBookOfferCurrency('INVALID')).toThrow('Invalid IOU token format');
  });
});

// ---------------------------------------------------------------------------
// buildSwapParams
// ---------------------------------------------------------------------------

describe('buildSwapParams', () => {
  it('builds XRP->IOU swap with tfImmediateOrCancel', () => {
    const result = buildSwapParams({
      takerGets: 'XRP',
      takerGetsAmount: '1000000',
      takerPays: 'USD.rIssuer',
      takerPaysAmount: '100',
      slippageBps: 50,
    });

    expect(result.xrplTxType).toBe('OfferCreate');
    expect(result.TakerGets).toBe('1000000');
    expect(result.Flags).toBe(TF_IMMEDIATE_OR_CANCEL);
    // TakerPays should have slippage applied (100 * 0.995 = 99.5)
    expect(typeof result.TakerPays).toBe('object');
    const pays = result.TakerPays as { currency: string; issuer: string; value: string };
    expect(pays.currency).toBe('USD');
    expect(pays.issuer).toBe('rIssuer');
    expect(parseFloat(pays.value)).toBeCloseTo(99.5, 5);
  });

  it('builds IOU->XRP swap with slippage on XRP drops', () => {
    const result = buildSwapParams({
      takerGets: 'USD.rIssuer',
      takerGetsAmount: '100',
      takerPays: 'XRP',
      takerPaysAmount: '10000000', // 10 XRP in drops
      slippageBps: 100, // 1%
    });

    expect(result.xrplTxType).toBe('OfferCreate');
    expect(result.TakerGets).toEqual({ currency: 'USD', issuer: 'rIssuer', value: '100' });
    // TakerPays: 10000000 * (1 - 0.01) = 9900000
    expect(result.TakerPays).toBe('9900000');
    expect(result.Flags).toBe(TF_IMMEDIATE_OR_CANCEL);
  });

  it('builds IOU->IOU swap', () => {
    const result = buildSwapParams({
      takerGets: 'EUR.rIssuerA',
      takerGetsAmount: '50',
      takerPays: 'USD.rIssuerB',
      takerPaysAmount: '55',
      slippageBps: 50,
    });

    expect(result.xrplTxType).toBe('OfferCreate');
    expect(result.TakerGets).toEqual({ currency: 'EUR', issuer: 'rIssuerA', value: '50' });
    const pays = result.TakerPays as { currency: string; issuer: string; value: string };
    expect(pays.currency).toBe('USD');
    expect(pays.issuer).toBe('rIssuerB');
    expect(parseFloat(pays.value)).toBeCloseTo(54.725, 3); // 55 * 0.995
  });

  it('applies zero-ish slippage (minimum 1 bps)', () => {
    const result = buildSwapParams({
      takerGets: 'XRP',
      takerGetsAmount: '1000000',
      takerPays: 'USD.rIssuer',
      takerPaysAmount: '100',
      slippageBps: 1, // 0.01%
    });

    const pays = result.TakerPays as { currency: string; issuer: string; value: string };
    expect(parseFloat(pays.value)).toBeCloseTo(99.99, 2);
  });
});

// ---------------------------------------------------------------------------
// buildLimitOrderParams
// ---------------------------------------------------------------------------

describe('buildLimitOrderParams', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-04T00:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('builds limit order without tfImmediateOrCancel', () => {
    const result = buildLimitOrderParams({
      takerGets: 'XRP',
      takerGetsAmount: '5000000',
      takerPays: 'USD.rIssuer',
      takerPaysAmount: '10',
      expirationSeconds: 3600,
    });

    expect(result.xrplTxType).toBe('OfferCreate');
    expect(result.Flags).toBeUndefined();
    expect(result.TakerGets).toBe('5000000');
    expect(result.TakerPays).toEqual({ currency: 'USD', issuer: 'rIssuer', value: '10' });
  });

  it('sets Expiration in Ripple epoch', () => {
    const result = buildLimitOrderParams({
      takerGets: 'XRP',
      takerGetsAmount: '1000000',
      takerPays: 'USD.rIssuer',
      takerPaysAmount: '1',
      expirationSeconds: 86400, // 24h
    });

    // Current time: 2026-04-04 00:00:00 UTC = 1775260800 Unix
    // Ripple epoch offset = 946684800
    // Expected = 1775260800 + 86400 - 946684800 = 828662400
    const expectedExpiration = Math.floor(new Date('2026-04-04T00:00:00Z').getTime() / 1000) + 86400 - RIPPLE_EPOCH;
    expect(result.Expiration).toBe(expectedExpiration);
  });

  it('does not apply slippage to limit orders', () => {
    const result = buildLimitOrderParams({
      takerGets: 'USD.rIssuerA',
      takerGetsAmount: '100',
      takerPays: 'EUR.rIssuerB',
      takerPaysAmount: '90',
      expirationSeconds: 3600,
    });

    // Amount should be exact, no slippage
    expect(result.TakerPays).toEqual({ currency: 'EUR', issuer: 'rIssuerB', value: '90' });
  });
});

// ---------------------------------------------------------------------------
// buildCancelParams
// ---------------------------------------------------------------------------

describe('buildCancelParams', () => {
  it('builds OfferCancel with OfferSequence', () => {
    const result = buildCancelParams(12345);
    expect(result).toEqual({
      xrplTxType: 'OfferCancel',
      OfferSequence: 12345,
    });
  });

  it('preserves large sequence numbers', () => {
    const result = buildCancelParams(999999999);
    expect(result.OfferSequence).toBe(999999999);
  });
});

// ---------------------------------------------------------------------------
// validateReserve
// ---------------------------------------------------------------------------

describe('validateReserve', () => {
  it('passes when available balance is sufficient', () => {
    expect(() => validateReserve('500000', 0)).not.toThrow(); // 0.5 XRP > 0.2 XRP
  });

  it('passes when balance equals reserve exactly', () => {
    expect(() => validateReserve(String(OWNER_RESERVE_DROPS), 0)).not.toThrow();
  });

  it('throws when balance is insufficient', () => {
    expect(() => validateReserve('100000', 3)).toThrow('Insufficient XRP');
  });

  it('throws when balance is zero', () => {
    expect(() => validateReserve('0', 0)).toThrow('Insufficient XRP');
  });

  it('includes helpful context in error message', () => {
    try {
      validateReserve('50000', 5);
      expect.unreachable('should have thrown');
    } catch (err: unknown) {
      const message = (err as Error).message;
      expect(message).toContain('current offers: 5');
      expect(message).toContain('0.2 XRP');
    }
  });
});
