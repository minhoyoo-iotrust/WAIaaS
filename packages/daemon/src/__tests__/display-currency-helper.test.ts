/**
 * Tests for display-currency-helper utilities.
 */
import { describe, it, expect, vi } from 'vitest';
import type { IForexRateService } from '@waiaas/core';
import {
  resolveDisplayCurrencyCode,
  fetchDisplayRate,
  toDisplayAmount,
} from '../api/routes/display-currency-helper.js';

describe('resolveDisplayCurrencyCode', () => {
  it('returns query param currency when provided', () => {
    expect(resolveDisplayCurrencyCode('EUR')).toBe('EUR');
  });

  it('falls back to settings when no query param', () => {
    const settings = { get: vi.fn().mockReturnValue('JPY') } as any;
    expect(resolveDisplayCurrencyCode(undefined, settings)).toBe('JPY');
  });

  it('defaults to USD when neither query nor settings', () => {
    expect(resolveDisplayCurrencyCode(undefined)).toBe('USD');
  });

  it('returns null for invalid currency code', () => {
    expect(resolveDisplayCurrencyCode('INVALID')).toBeNull();
  });
});

describe('fetchDisplayRate', () => {
  it('returns null for USD', async () => {
    const result = await fetchDisplayRate('USD');
    expect(result).toBeNull();
  });

  it('returns null when no forexRateService', async () => {
    const result = await fetchDisplayRate('EUR');
    expect(result).toBeNull();
  });

  it('returns null when currencyCode is null', async () => {
    const result = await fetchDisplayRate(null);
    expect(result).toBeNull();
  });

  it('returns rate from forexRateService', async () => {
    const service: IForexRateService = {
      getRate: vi.fn().mockResolvedValue({ rate: 1.08, timestamp: Date.now() }),
      getSupportedCurrencies: vi.fn(),
    };
    const result = await fetchDisplayRate('EUR', service);
    expect(result).toBe(1.08);
  });

  it('returns null when forexRateService.getRate returns null', async () => {
    const service: IForexRateService = {
      getRate: vi.fn().mockResolvedValue(null),
      getSupportedCurrencies: vi.fn(),
    };
    const result = await fetchDisplayRate('EUR', service);
    expect(result).toBeNull();
  });

  it('returns null when forexRateService throws', async () => {
    const service: IForexRateService = {
      getRate: vi.fn().mockRejectedValue(new Error('API error')),
      getSupportedCurrencies: vi.fn(),
    };
    const result = await fetchDisplayRate('EUR', service);
    expect(result).toBeNull();
  });
});

describe('toDisplayAmount', () => {
  it('returns null when amountUsd is null', () => {
    expect(toDisplayAmount(null, 'USD', null)).toBeNull();
  });

  it('returns null when amountUsd is undefined', () => {
    expect(toDisplayAmount(undefined, 'USD', null)).toBeNull();
  });

  it('returns null when currencyCode is null', () => {
    expect(toDisplayAmount(10.5, null, null)).toBeNull();
  });

  it('returns USD formatted string for USD currency', () => {
    expect(toDisplayAmount(10.5, 'USD', null)).toBe('$10.50');
  });

  it('returns null when non-USD currency but no rate', () => {
    expect(toDisplayAmount(10.5, 'EUR', null)).toBeNull();
  });

  it('formats non-USD currency with rate', () => {
    const result = toDisplayAmount(10.0, 'EUR', 0.92);
    expect(result).toBeTruthy();
    // formatDisplayCurrency multiplies USD amount by rate
    expect(typeof result).toBe('string');
  });
});
