import { describe, it, expect, vi, afterEach } from 'vitest';
import type { SignRequest } from '@waiaas/core';
import { encodeSignRequest } from '@waiaas/core';
import { parseSignRequest } from '../parse-request.js';
import {
  InvalidSignRequestUrlError,
  SignRequestExpiredError,
  SignRequestValidationError,
} from '../errors.js';

function makeValidRequest(overrides?: Partial<SignRequest>): SignRequest {
  return {
    version: '1',
    requestId: '550e8400-e29b-41d4-a716-446655440000',
    chain: 'solana',
    network: 'devnet',
    message: 'SGVsbG8gV29ybGQ=',
    displayMessage: 'Transfer 1 SOL',
    metadata: {
      txId: '550e8400-e29b-41d4-a716-446655440001',
      type: 'TRANSFER',
      from: 'So1addr1',
      to: 'So1addr2',
      amount: '1.0',
      symbol: 'SOL',
      policyTier: 'APPROVAL',
    },
    responseChannel: {
      type: 'ntfy',
      responseTopic: 'waiaas-resp-abc123',
    },
    expiresAt: new Date(Date.now() + 600_000).toISOString(), // 10 min from now
    ...overrides,
  };
}

describe('parseSignRequest', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should parse a valid data parameter URL', () => {
    const request = makeValidRequest();
    const encoded = encodeSignRequest(request);
    const url = `https://wallet.example.com/sign?data=${encoded}`;

    const result = parseSignRequest(url);
    expect(result).toEqual(request);
  });

  it('should throw InvalidSignRequestUrlError for invalid base64url data', () => {
    // "!!!" is not valid base64url but the Buffer.from won't throw for arbitrary strings,
    // so we use a string that decodes to invalid JSON
    const url = 'https://wallet.example.com/sign?data=not-valid-json-at-all';

    expect(() => parseSignRequest(url)).toThrow(InvalidSignRequestUrlError);
  });

  it('should throw SignRequestExpiredError for expired request', () => {
    const request = makeValidRequest({
      expiresAt: new Date(Date.now() - 60_000).toISOString(), // 1 min ago
    });
    const encoded = encodeSignRequest(request);
    const url = `https://wallet.example.com/sign?data=${encoded}`;

    expect(() => parseSignRequest(url)).toThrow(SignRequestExpiredError);
  });

  it('should throw SignRequestValidationError for Zod validation failure', () => {
    // Encode invalid data (missing required fields)
    const invalidData = { version: '1', requestId: 'not-a-uuid' };
    const json = JSON.stringify(invalidData);
    const encoded = Buffer.from(json, 'utf-8').toString('base64url');
    const url = `https://wallet.example.com/sign?data=${encoded}`;

    expect(() => parseSignRequest(url)).toThrow(SignRequestValidationError);
  });

  it('should throw InvalidSignRequestUrlError when URL has no data or requestId', () => {
    const url = 'https://wallet.example.com/sign?foo=bar';
    expect(() => parseSignRequest(url)).toThrow(InvalidSignRequestUrlError);
  });

  it('should throw InvalidSignRequestUrlError for completely invalid URL', () => {
    expect(() => parseSignRequest('not-a-url')).toThrow(
      InvalidSignRequestUrlError,
    );
  });

  it('should parse deeplink URL with custom scheme', () => {
    const request = makeValidRequest();
    const encoded = encodeSignRequest(request);
    const url = `dcent://sign?data=${encoded}`;

    const result = parseSignRequest(url);
    expect(result).toEqual(request);
  });

  it('should return a Promise for requestId parameter (async mode)', async () => {
    const request = makeValidRequest();
    const encoded = encodeSignRequest(request);
    const ntfyMessage = JSON.stringify({ message: encoded });

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        text: () => Promise.resolve(ntfyMessage),
      }),
    );

    const url = `https://wallet.example.com/sign?requestId=${request.requestId}&topic=my-topic&serverUrl=https://ntfy.sh`;
    const result = await parseSignRequest(url);
    expect(result).toEqual(request);
  });

  it('should throw when requestId not found in ntfy topic', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        text: () => Promise.resolve(''),
      }),
    );

    const url =
      'https://wallet.example.com/sign?requestId=550e8400-e29b-41d4-a716-446655440000&topic=test';
    await expect(parseSignRequest(url)).rejects.toThrow(
      InvalidSignRequestUrlError,
    );
  });

  it('should throw when ntfy returns HTTP error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        text: () => Promise.resolve('Internal Server Error'),
      }),
    );

    const url =
      'https://wallet.example.com/sign?requestId=550e8400-e29b-41d4-a716-446655440000&topic=test';
    await expect(parseSignRequest(url)).rejects.toThrow(
      InvalidSignRequestUrlError,
    );
  });
});
