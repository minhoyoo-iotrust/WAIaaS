import { describe, it, expect } from 'vitest';
import { asBps, asPct, clampSlippageBps, bpsToPct, pctToBps } from '../common/slippage.js';

describe('slippage utilities', () => {
  describe('asBps', () => {
    it('accepts valid integer bps', () => {
      expect(asBps(50)).toBe(50);
      expect(asBps(1)).toBe(1);
      expect(asBps(10000)).toBe(10000);
    });

    it('rejects non-integer', () => {
      expect(() => asBps(50.5)).toThrow('Invalid bps');
    });

    it('rejects out of range', () => {
      expect(() => asBps(0)).toThrow();
      expect(() => asBps(10001)).toThrow();
      expect(() => asBps(-1)).toThrow();
    });
  });

  describe('asPct', () => {
    it('accepts valid pct', () => {
      expect(asPct(0.01)).toBe(0.01);
      expect(asPct(0.001)).toBe(0.001);
      expect(asPct(1.0)).toBe(1.0);
    });

    it('rejects out of range', () => {
      expect(() => asPct(0)).toThrow();
      expect(() => asPct(1.1)).toThrow();
    });
  });

  describe('clampSlippageBps', () => {
    it('uses default when input is 0', () => {
      expect(clampSlippageBps(0, asBps(50), asBps(500))).toBe(50);
    });

    it('uses default when input is negative', () => {
      expect(clampSlippageBps(-10, asBps(50), asBps(500))).toBe(50);
    });

    it('clamps to max', () => {
      expect(clampSlippageBps(1000, asBps(50), asBps(500))).toBe(500);
    });

    it('passes through valid value', () => {
      expect(clampSlippageBps(100, asBps(50), asBps(500))).toBe(100);
    });
  });

  describe('conversions', () => {
    it('bpsToPct', () => {
      expect(bpsToPct(asBps(50))).toBeCloseTo(0.005);
      expect(bpsToPct(asBps(100))).toBeCloseTo(0.01);
    });

    it('pctToBps', () => {
      expect(pctToBps(asPct(0.01))).toBe(100);
      expect(pctToBps(asPct(0.005))).toBe(50);
    });
  });
});
