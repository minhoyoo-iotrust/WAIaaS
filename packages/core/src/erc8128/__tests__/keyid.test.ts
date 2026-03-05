import { describe, it, expect } from 'vitest';
import { buildKeyId, parseKeyId } from '../keyid.js';

describe('keyid', () => {
  describe('buildKeyId', () => {
    it('returns erc8128:<chainId>:<checksumAddress> format', () => {
      const result = buildKeyId(1, '0xAbCdEf1234567890aBcDeF1234567890aBcDeF12');
      expect(result).toMatch(/^erc8128:1:0x[0-9a-fA-F]{40}$/);
      expect(result.startsWith('erc8128:1:')).toBe(true);
    });

    it('checksum-normalizes the address', () => {
      const lower = '0xabcdef1234567890abcdef1234567890abcdef12';
      const result = buildKeyId(1, lower);
      // viem getAddress returns checksummed address
      expect(result).not.toBe(`erc8128:1:${lower}`);
      expect(result).toMatch(/^erc8128:1:0x/);
    });

    it('works with Polygon chainId', () => {
      const result = buildKeyId(137, '0xAbCdEf1234567890aBcDeF1234567890aBcDeF12');
      expect(result).toMatch(/^erc8128:137:/);
    });
  });

  describe('parseKeyId', () => {
    it('parses valid keyid', () => {
      const result = parseKeyId('erc8128:1:0xAbCdEf1234567890aBcDeF1234567890aBcDeF12');
      expect(result.chainId).toBe(1);
      expect(result.address).toBe('0xAbCdEf1234567890aBcDeF1234567890aBcDeF12');
    });

    it('roundtrips with buildKeyId', () => {
      const addr = '0xAbCdEf1234567890aBcDeF1234567890aBcDeF12';
      const keyid = buildKeyId(1, addr);
      const parsed = parseKeyId(keyid);
      expect(parsed.chainId).toBe(1);
      // Address should be checksum-normalized
      expect(parsed.address).toMatch(/^0x[0-9a-fA-F]{40}$/);
    });

    it('works for Polygon chainId', () => {
      const result = parseKeyId('erc8128:137:0x1234567890AbCdEf1234567890AbCdEf12345678');
      expect(result.chainId).toBe(137);
    });

    it('throws on invalid prefix', () => {
      expect(() => parseKeyId('invalid:1:0xAbCdEf1234567890aBcDeF1234567890aBcDeF12')).toThrow();
    });

    it('throws on missing parts', () => {
      expect(() => parseKeyId('erc8128:1')).toThrow();
    });

    it('throws on invalid chainId', () => {
      expect(() => parseKeyId('erc8128:abc:0xAbCdEf1234567890aBcDeF1234567890aBcDeF12')).toThrow();
    });

    it('throws on empty string', () => {
      expect(() => parseKeyId('')).toThrow();
    });
  });
});
