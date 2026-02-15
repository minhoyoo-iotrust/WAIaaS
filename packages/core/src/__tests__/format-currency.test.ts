/**
 * formatDisplayCurrency / formatRatePreview unit tests.
 *
 * Verifies Intl.NumberFormat-based currency formatting:
 * - USD: no prefix, standard $X.XX format
 * - Non-USD: "\u2248" (approximately) prefix
 * - Zero-decimal currencies: KRW, JPY, VND (no decimal places)
 * - Three-decimal currencies: KWD, BHD (3 decimal places)
 * - Standard currencies: EUR, GBP, etc. (2 decimal places)
 */
import { describe, it, expect } from 'vitest';
import { formatDisplayCurrency, formatRatePreview } from '../utils/format-currency.js';

describe('formatDisplayCurrency', () => {
  // -------------------------------------------------------------------------
  // USD (no prefix)
  // -------------------------------------------------------------------------

  it('USD -- $500.00 (no prefix)', () => {
    const result = formatDisplayCurrency(500, 'USD', 1);
    expect(result).toBe('$500.00');
  });

  it('USD -- $0.00 for zero amount', () => {
    const result = formatDisplayCurrency(0, 'USD', 1);
    expect(result).toBe('$0.00');
  });

  // -------------------------------------------------------------------------
  // Zero-decimal currencies (KRW, JPY, VND)
  // -------------------------------------------------------------------------

  it('KRW -- \u2248\u20A9725,000 (0 decimal)', () => {
    const result = formatDisplayCurrency(500, 'KRW', 1450);
    expect(result).toBe('\u2248\u20A9725,000');
  });

  it('JPY -- \u2248\u00A575,000 (0 decimal)', () => {
    const result = formatDisplayCurrency(500, 'JPY', 150);
    expect(result).toBe('\u2248\u00A575,000');
  });

  it('VND -- 0 decimal', () => {
    const result = formatDisplayCurrency(100, 'VND', 25000);
    // Intl.NumberFormat with en-US locale formats VND
    expect(result).toMatch(/^\u2248/); // starts with approx
    expect(result).not.toMatch(/\./); // no decimal point
  });

  // -------------------------------------------------------------------------
  // Standard 2-decimal currencies
  // -------------------------------------------------------------------------

  it('EUR -- \u2248\u20AC465.00 (2 decimal)', () => {
    const result = formatDisplayCurrency(500, 'EUR', 0.93);
    expect(result).toBe('\u2248\u20AC465.00');
  });

  it('GBP -- \u2248\u00A3395.00 (2 decimal)', () => {
    const result = formatDisplayCurrency(500, 'GBP', 0.79);
    expect(result).toBe('\u2248\u00A3395.00');
  });

  it('CAD -- 2 decimal', () => {
    const result = formatDisplayCurrency(100, 'CAD', 1.36);
    expect(result).toMatch(/^\u2248CA\$/);
    expect(result).toMatch(/136\.00$/);
  });

  // -------------------------------------------------------------------------
  // Three-decimal currencies (KWD, BHD)
  // -------------------------------------------------------------------------

  it('KWD -- 3 decimal places', () => {
    const result = formatDisplayCurrency(100, 'KWD', 0.307);
    expect(result).toMatch(/^\u2248/);
    // Should contain 3 decimal places (30.700)
    expect(result).toContain('30.700');
  });

  it('BHD -- 3 decimal places', () => {
    const result = formatDisplayCurrency(100, 'BHD', 0.376);
    expect(result).toMatch(/^\u2248/);
    expect(result).toContain('37.600');
  });

  // -------------------------------------------------------------------------
  // HUF, CLP, PKR (zero-decimal)
  // -------------------------------------------------------------------------

  it('HUF -- 0 decimal', () => {
    const result = formatDisplayCurrency(100, 'HUF', 370);
    expect(result).toMatch(/^\u2248/);
    expect(result).not.toMatch(/\./);
  });

  it('CLP -- 0 decimal', () => {
    const result = formatDisplayCurrency(10, 'CLP', 950);
    expect(result).toMatch(/^\u2248/);
    expect(result).not.toMatch(/\./);
  });

  it('PKR -- 0 decimal', () => {
    const result = formatDisplayCurrency(10, 'PKR', 280);
    expect(result).toMatch(/^\u2248/);
    expect(result).not.toMatch(/\./);
  });

  // -------------------------------------------------------------------------
  // Edge cases
  // -------------------------------------------------------------------------

  it('non-USD with rate=1 still gets prefix', () => {
    const result = formatDisplayCurrency(100, 'EUR', 1);
    expect(result).toMatch(/^\u2248/);
  });

  it('large amount with grouping separator', () => {
    const result = formatDisplayCurrency(1_000_000, 'KRW', 1450);
    expect(result).toMatch(/^\u2248/);
    expect(result).toMatch(/1,450,000,000/);
  });
});

describe('formatRatePreview', () => {
  it('USD -- 1 USD = $1.00', () => {
    expect(formatRatePreview(1, 'USD')).toBe('1 USD = $1.00');
  });

  it('KRW -- 1 USD = \u20A91,450', () => {
    expect(formatRatePreview(1450, 'KRW')).toBe('1 USD = \u20A91,450');
  });

  it('JPY -- 1 USD = \u00A5150', () => {
    expect(formatRatePreview(150, 'JPY')).toBe('1 USD = \u00A5150');
  });

  it('EUR -- 1 USD = \u20AC0.93', () => {
    expect(formatRatePreview(0.93, 'EUR')).toBe('1 USD = \u20AC0.93');
  });

  it('GBP -- 1 USD = \u00A30.79', () => {
    expect(formatRatePreview(0.79, 'GBP')).toBe('1 USD = \u00A30.79');
  });

  it('KWD -- 3 decimal places', () => {
    const result = formatRatePreview(0.307, 'KWD');
    // Intl.NumberFormat en-US uses "KWD" as symbol, not "KD"
    expect(result).toMatch(/^1 USD = /);
    expect(result).toMatch(/0\.307$/);
  });
});
