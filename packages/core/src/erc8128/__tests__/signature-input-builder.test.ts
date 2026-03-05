import { describe, it, expect } from 'vitest';
import { buildSignatureInput, buildSignatureBase } from '../signature-input-builder.js';

describe('buildSignatureInput', () => {
  const baseParams = {
    coveredComponents: ['@method', '@target-uri', 'content-digest', 'content-type'],
    keyid: 'erc8128:1:0xAbCdEf1234567890aBcDeF1234567890aBcDeF12',
    algorithm: 'eip191-secp256k1',
    created: 1700000000,
    expires: 1700000300,
    nonce: '550e8400-e29b-41d4-a716-446655440000',
  };

  it('produces standard preset format with all parameters', () => {
    const result = buildSignatureInput(baseParams);
    expect(result).toContain('sig1=');
    expect(result).toContain('"@method"');
    expect(result).toContain('"@target-uri"');
    expect(result).toContain('"content-digest"');
    expect(result).toContain('"content-type"');
    expect(result).toContain(';created=1700000000');
    expect(result).toContain(';keyid="erc8128:1:0xAbCdEf1234567890aBcDeF1234567890aBcDeF12"');
    expect(result).toContain(';alg="eip191-secp256k1"');
    expect(result).toContain(';nonce="550e8400-e29b-41d4-a716-446655440000"');
    expect(result).toContain(';expires=1700000300');
  });

  it('produces minimal preset format', () => {
    const result = buildSignatureInput({
      ...baseParams,
      coveredComponents: ['@method', '@target-uri'],
    });
    expect(result).toContain('"@method" "@target-uri"');
    expect(result).not.toContain('"content-digest"');
    expect(result).not.toContain('"content-type"');
  });

  it('produces strict preset format with @authority and @request-target', () => {
    const result = buildSignatureInput({
      ...baseParams,
      coveredComponents: [
        '@method', '@target-uri', '@authority', '@request-target',
        'content-digest', 'content-type',
      ],
    });
    expect(result).toContain('"@authority"');
    expect(result).toContain('"@request-target"');
  });

  it('uses custom coveredComponents exactly', () => {
    const result = buildSignatureInput({
      ...baseParams,
      coveredComponents: ['@method', 'x-custom-header'],
    });
    expect(result).toContain('"@method" "x-custom-header"');
    expect(result).not.toContain('"@target-uri"');
  });

  it('omits nonce when nonce is undefined', () => {
    const result = buildSignatureInput({
      ...baseParams,
      nonce: undefined,
    });
    expect(result).not.toContain(';nonce=');
  });

  it('sets correct expires with ttl', () => {
    const result = buildSignatureInput({
      ...baseParams,
      created: 1700000000,
      expires: 1700000600,
    });
    expect(result).toContain(';expires=1700000600');
  });

  it('starts with sig1= followed by parenthesized component list', () => {
    const result = buildSignatureInput(baseParams);
    expect(result).toMatch(/^sig1=\("/);
  });
});

describe('buildSignatureBase', () => {
  it('constructs multi-line Signature Base per RFC 9421 section 2.5', () => {
    const signatureInput = buildSignatureInput({
      coveredComponents: ['@method', '@target-uri', 'content-type'],
      keyid: 'erc8128:1:0xAddr',
      algorithm: 'eip191-secp256k1',
      created: 1700000000,
      expires: 1700000300,
      nonce: 'test-nonce',
    });

    const result = buildSignatureBase({
      method: 'POST',
      url: 'https://api.example.com/data',
      headers: { 'Content-Type': 'application/json' },
      coveredComponents: ['@method', '@target-uri', 'content-type'],
      signatureInput,
    });

    const lines = result.split('\n');
    expect(lines[0]).toBe('"@method": POST');
    expect(lines[1]).toBe('"@target-uri": https://api.example.com/data');
    expect(lines[2]).toBe('"content-type": application/json');
    // Last line is @signature-params
    expect(lines[lines.length - 1]).toMatch(/^"@signature-params": /);
  });

  it('resolves @method to uppercase HTTP method', () => {
    const signatureInput = buildSignatureInput({
      coveredComponents: ['@method'],
      keyid: 'erc8128:1:0xAddr',
      algorithm: 'eip191-secp256k1',
      created: 1700000000,
      expires: 1700000300,
    });

    const result = buildSignatureBase({
      method: 'POST',
      url: 'https://example.com/',
      headers: {},
      coveredComponents: ['@method'],
      signatureInput,
    });

    expect(result).toContain('"@method": POST');
  });

  it('resolves @target-uri to full URL', () => {
    const signatureInput = buildSignatureInput({
      coveredComponents: ['@target-uri'],
      keyid: 'erc8128:1:0xAddr',
      algorithm: 'eip191-secp256k1',
      created: 1700000000,
      expires: 1700000300,
    });

    const result = buildSignatureBase({
      method: 'GET',
      url: 'https://api.example.com/data?q=test',
      headers: {},
      coveredComponents: ['@target-uri'],
      signatureInput,
    });

    expect(result).toContain('"@target-uri": https://api.example.com/data?q=test');
  });

  it('resolves @authority to hostname (lowercase)', () => {
    const signatureInput = buildSignatureInput({
      coveredComponents: ['@authority'],
      keyid: 'erc8128:1:0xAddr',
      algorithm: 'eip191-secp256k1',
      created: 1700000000,
      expires: 1700000300,
    });

    const result = buildSignatureBase({
      method: 'GET',
      url: 'https://API.Example.COM/data',
      headers: {},
      coveredComponents: ['@authority'],
      signatureInput,
    });

    expect(result).toContain('"@authority": api.example.com');
  });

  it('resolves @authority with non-default port', () => {
    const signatureInput = buildSignatureInput({
      coveredComponents: ['@authority'],
      keyid: 'erc8128:1:0xAddr',
      algorithm: 'eip191-secp256k1',
      created: 1700000000,
      expires: 1700000300,
    });

    const result = buildSignatureBase({
      method: 'GET',
      url: 'https://api.example.com:8443/data',
      headers: {},
      coveredComponents: ['@authority'],
      signatureInput,
    });

    expect(result).toContain('"@authority": api.example.com:8443');
  });

  it('resolves @request-target to path + query', () => {
    const signatureInput = buildSignatureInput({
      coveredComponents: ['@request-target'],
      keyid: 'erc8128:1:0xAddr',
      algorithm: 'eip191-secp256k1',
      created: 1700000000,
      expires: 1700000300,
    });

    const result = buildSignatureBase({
      method: 'GET',
      url: 'https://api.example.com/data?q=test&page=1',
      headers: {},
      coveredComponents: ['@request-target'],
      signatureInput,
    });

    expect(result).toContain('"@request-target": /data?q=test&page=1');
  });

  it('resolves regular headers case-insensitively', () => {
    const signatureInput = buildSignatureInput({
      coveredComponents: ['content-type'],
      keyid: 'erc8128:1:0xAddr',
      algorithm: 'eip191-secp256k1',
      created: 1700000000,
      expires: 1700000300,
    });

    const result = buildSignatureBase({
      method: 'POST',
      url: 'https://api.example.com/data',
      headers: { 'Content-Type': 'application/json' },
      coveredComponents: ['content-type'],
      signatureInput,
    });

    expect(result).toContain('"content-type": application/json');
  });

  it('has @signature-params as final line with inner list from Signature-Input', () => {
    const signatureInput = buildSignatureInput({
      coveredComponents: ['@method'],
      keyid: 'erc8128:1:0xAddr',
      algorithm: 'eip191-secp256k1',
      created: 1700000000,
      expires: 1700000300,
    });

    const result = buildSignatureBase({
      method: 'GET',
      url: 'https://example.com/',
      headers: {},
      coveredComponents: ['@method'],
      signatureInput,
    });

    const lines = result.split('\n');
    const lastLine = lines[lines.length - 1];
    expect(lastLine).toMatch(/^"@signature-params": /);
    // Should contain the inner list (everything after sig1=)
    const innerList = signatureInput.replace('sig1=', '');
    expect(lastLine).toBe(`"@signature-params": ${innerList}`);
  });

  it('has no trailing newline after last line', () => {
    const signatureInput = buildSignatureInput({
      coveredComponents: ['@method'],
      keyid: 'erc8128:1:0xAddr',
      algorithm: 'eip191-secp256k1',
      created: 1700000000,
      expires: 1700000300,
    });

    const result = buildSignatureBase({
      method: 'GET',
      url: 'https://example.com/',
      headers: {},
      coveredComponents: ['@method'],
      signatureInput,
    });

    expect(result.endsWith('\n')).toBe(false);
  });
});
