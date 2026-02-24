import { describe, it, expect } from 'vitest';
import { CURRENCY_META, getCurrencyMeta } from '../infrastructure/oracle/forex-currencies';

describe('forex-currencies', () => {
  it('exports 43 currencies', () => {
    expect(CURRENCY_META).toHaveLength(43);
  });

  it('every entry has required fields', () => {
    for (const c of CURRENCY_META) {
      expect(c.code).toBeTruthy();
      expect(c.name).toBeTruthy();
      expect(c.symbol).toBeTruthy();
      expect(typeof c.decimals).toBe('number');
      expect(c.locale).toBeTruthy();
    }
  });

  it('codes are unique', () => {
    const codes = CURRENCY_META.map((c) => c.code);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it('getCurrencyMeta returns correct entry for USD', () => {
    const usd = getCurrencyMeta('USD');
    expect(usd).toBeDefined();
    expect(usd!.code).toBe('USD');
    expect(usd!.symbol).toBe('$');
    expect(usd!.decimals).toBe(2);
  });

  it('getCurrencyMeta returns correct entry for KRW', () => {
    const krw = getCurrencyMeta('KRW');
    expect(krw).toBeDefined();
    expect(krw!.decimals).toBe(0);
  });

  it('getCurrencyMeta returns undefined for unknown code', () => {
    expect(getCurrencyMeta('XYZ')).toBeUndefined();
  });

  it('ISO 4217 decimals: 0 for KRW/JPY/VND, 3 for KWD/BHD', () => {
    for (const code of ['KRW', 'JPY', 'VND', 'CLP', 'HUF', 'PKR']) {
      expect(getCurrencyMeta(code)!.decimals).toBe(0);
    }
    for (const code of ['KWD', 'BHD']) {
      expect(getCurrencyMeta(code)!.decimals).toBe(3);
    }
  });
});
