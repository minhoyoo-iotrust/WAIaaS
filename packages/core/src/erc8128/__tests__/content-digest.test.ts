import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import { buildContentDigest } from '../content-digest.js';

describe('buildContentDigest', () => {
  it('returns sha-256=:<base64>: format for JSON body', () => {
    const body = '{"hello":"world"}';
    const result = buildContentDigest(body);
    expect(result).toMatch(/^sha-256=:[A-Za-z0-9+/]+=*:$/);
  });

  it('produces correct hash for known input', () => {
    const body = '{"hello":"world"}';
    const expectedHash = createHash('sha256').update(body, 'utf-8').digest('base64');
    const result = buildContentDigest(body);
    expect(result).toBe(`sha-256=:${expectedHash}:`);
  });

  it('returns digest for empty string', () => {
    const result = buildContentDigest('');
    const expectedHash = createHash('sha256').update('', 'utf-8').digest('base64');
    expect(result).toBe(`sha-256=:${expectedHash}:`);
  });

  it('handles UTF-8 body correctly', () => {
    const body = '{"name":"Cafe"}';
    const result = buildContentDigest(body);
    const expectedHash = createHash('sha256').update(body, 'utf-8').digest('base64');
    expect(result).toBe(`sha-256=:${expectedHash}:`);
  });

  it('format matches RFC 9530 (sha-256=:base64:) with colons wrapping base64', () => {
    const result = buildContentDigest('test');
    // Must start with sha-256=: and end with :
    expect(result.startsWith('sha-256=:')).toBe(true);
    expect(result.endsWith(':')).toBe(true);
    // Extract base64 part between colons
    const base64Part = result.slice('sha-256=:'.length, -1);
    // Valid base64
    expect(() => Buffer.from(base64Part, 'base64')).not.toThrow();
  });
});
