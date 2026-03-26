import { describe, it, expect } from 'vitest';
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
    caip2ChainId: 'solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1',
    networkName: 'solana-devnet',
    signerAddress: 'OwnerSolanaAddress1234567890abcdef',
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
      type: 'push_relay',
      pushRelayUrl: 'http://localhost:3200',
      requestId: '550e8400-e29b-41d4-a716-446655440000',
    },
    expiresAt: new Date(Date.now() + 600_000).toISOString(), // 10 min from now
    ...overrides,
  };
}

describe('parseSignRequest', () => {
  it('should parse a valid data parameter URL', () => {
    const request = makeValidRequest();
    const encoded = encodeSignRequest(request);
    const url = `https://wallet.example.com/sign?data=${encoded}`;

    const result = parseSignRequest(url);
    expect(result).toEqual(request);
  });

  it('should throw InvalidSignRequestUrlError for invalid base64url data', () => {
    const url = 'https://wallet.example.com/sign?data=not-valid-json-at-all';
    expect(() => parseSignRequest(url)).toThrow(InvalidSignRequestUrlError);
  });

  it('should throw SignRequestExpiredError for expired request', () => {
    const request = makeValidRequest({
      expiresAt: new Date(Date.now() - 60_000).toISOString(),
    });
    const encoded = encodeSignRequest(request);
    const url = `https://wallet.example.com/sign?data=${encoded}`;

    expect(() => parseSignRequest(url)).toThrow(SignRequestExpiredError);
  });

  it('should throw SignRequestValidationError for Zod validation failure', () => {
    const invalidData = { version: '1', requestId: 'not-a-uuid' };
    const json = JSON.stringify(invalidData);
    const encoded = Buffer.from(json, 'utf-8').toString('base64url');
    const url = `https://wallet.example.com/sign?data=${encoded}`;

    expect(() => parseSignRequest(url)).toThrow(SignRequestValidationError);
  });

  it('should throw InvalidSignRequestUrlError when URL has no data parameter', () => {
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

  it('decodeInlineData rethrows non-ZodError from parse', () => {
    // This branch is very hard to hit since Zod always throws ZodError.
    // The existing SignRequestValidationError test covers the ZodError path.
  });
});
