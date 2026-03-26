/**
 * parseSignRequest - Extract SignRequest from a universal link URL.
 *
 * Supports inline data mode: URL contains ?data={base64url-encoded-SignRequest}
 *
 * @see internal/design/74-wallet-sdk-daemon-components.md Section 2.1
 */

import type { SignRequest } from '@waiaas/core';
import { SignRequestSchema } from '@waiaas/core';
import { ZodError } from 'zod';

import {
  InvalidSignRequestUrlError,
  SignRequestExpiredError,
  SignRequestValidationError,
} from './errors.js';

/**
 * Check if a SignRequest has expired.
 */
function assertNotExpired(request: SignRequest): void {
  const expiresAt = new Date(request.expiresAt).getTime();
  if (expiresAt < Date.now()) {
    throw new SignRequestExpiredError(request.expiresAt);
  }
}

/**
 * Decode inline data parameter (base64url -> JSON -> Zod validated SignRequest).
 */
function decodeInlineData(data: string): SignRequest {
  let json: string;
  try {
    json = Buffer.from(data, 'base64url').toString('utf-8');
  } catch {
    throw new InvalidSignRequestUrlError('Invalid base64url data parameter');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new InvalidSignRequestUrlError('Invalid JSON in data parameter');
  }

  let request: SignRequest;
  try {
    request = SignRequestSchema.parse(parsed);
  } catch (err) {
    if (err instanceof ZodError) {
      throw new SignRequestValidationError(err.message);
    }
    throw err;
  }

  assertNotExpired(request);
  return request;
}

/**
 * Parse a SignRequest from a universal link URL.
 *
 * @param url - Universal link URL with ?data= parameter
 * @returns Validated SignRequest
 * @throws InvalidSignRequestUrlError - URL is invalid or missing parameters
 * @throws SignRequestExpiredError - Request has expired
 * @throws SignRequestValidationError - Decoded data fails Zod validation
 */
export function parseSignRequest(url: string): SignRequest {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new InvalidSignRequestUrlError(`Invalid URL: ${url}`);
  }

  const data = parsed.searchParams.get('data');
  if (data) {
    return decodeInlineData(data);
  }

  throw new InvalidSignRequestUrlError(
    'URL must contain a "data" parameter',
  );
}
