import { describe, it, expect } from 'vitest';
import { buildSignResponse } from '../build-response.js';

describe('buildSignResponse', () => {
  it('should build a valid SignResponse for approve with signature', () => {
    const response = buildSignResponse(
      '550e8400-e29b-41d4-a716-446655440000',
      'approve',
      '0xdeadbeef1234567890abcdef',
      'So1addr1',
    );

    expect(response.version).toBe('1');
    expect(response.requestId).toBe('550e8400-e29b-41d4-a716-446655440000');
    expect(response.action).toBe('approve');
    expect(response.signature).toBe('0xdeadbeef1234567890abcdef');
    expect(response.signerAddress).toBe('So1addr1');
    expect(response.signedAt).toBeDefined();
  });

  it('should build a valid SignResponse for reject without signature', () => {
    const response = buildSignResponse(
      '550e8400-e29b-41d4-a716-446655440000',
      'reject',
      undefined,
      'So1addr1',
    );

    expect(response.version).toBe('1');
    expect(response.action).toBe('reject');
    expect(response.signature).toBeUndefined();
  });

  it('should throw Error when approve action lacks signature', () => {
    expect(() =>
      buildSignResponse(
        '550e8400-e29b-41d4-a716-446655440000',
        'approve',
        undefined,
        'So1addr1',
      ),
    ).toThrow('signature required for approve action');
  });

  it('should produce signedAt in ISO 8601 format', () => {
    const response = buildSignResponse(
      '550e8400-e29b-41d4-a716-446655440000',
      'approve',
      'sig123',
      'So1addr1',
    );

    // ISO 8601 format check
    const parsed = new Date(response.signedAt);
    expect(parsed.toISOString()).toBe(response.signedAt);
  });

  it('should allow reject action with optional signature', () => {
    const response = buildSignResponse(
      '550e8400-e29b-41d4-a716-446655440000',
      'reject',
      'optional-sig',
      'So1addr1',
    );

    expect(response.action).toBe('reject');
    expect(response.signature).toBe('optional-sig');
  });
});
