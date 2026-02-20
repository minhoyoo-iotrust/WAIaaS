/**
 * parseSignRequest - Extract SignRequest from a universal link URL.
 *
 * Supports two modes:
 *   1. Inline data: URL contains ?data={base64url-encoded-SignRequest}
 *   2. Remote fetch: URL contains ?requestId={uuid}&topic={topic}&serverUrl={url}
 *      (fetches from ntfy topic)
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
 * Fetch a SignRequest from an ntfy topic by requestId.
 */
async function fetchSignRequestFromNtfy(
  requestId: string,
  topic: string,
  serverUrl: string,
): Promise<SignRequest> {
  const url = `${serverUrl}/${topic}/json?poll=1&since=all`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new InvalidSignRequestUrlError(
      `Failed to fetch from ntfy: HTTP ${String(res.status)}`,
    );
  }

  const text = await res.text();
  // ntfy returns newline-delimited JSON messages
  const lines = text.trim().split('\n');

  for (const line of lines) {
    if (!line.trim()) continue;

    let msg: { message?: string };
    try {
      msg = JSON.parse(line) as { message?: string };
    } catch {
      continue;
    }

    if (!msg.message) continue;

    let json: string;
    try {
      json = Buffer.from(msg.message, 'base64url').toString('utf-8');
    } catch {
      continue;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(json);
    } catch {
      continue;
    }

    let request: SignRequest;
    try {
      request = SignRequestSchema.parse(parsed);
    } catch {
      continue;
    }

    if (request.requestId === requestId) {
      assertNotExpired(request);
      return request;
    }
  }

  throw new InvalidSignRequestUrlError(
    `Sign request ${requestId} not found in ntfy topic ${topic}`,
  );
}

/**
 * Parse a SignRequest from a universal link URL.
 *
 * @param url - Universal link URL with ?data= or ?requestId= parameters
 * @returns SignRequest (sync for inline data, async for ntfy fetch)
 * @throws InvalidSignRequestUrlError - URL is invalid or missing parameters
 * @throws SignRequestExpiredError - Request has expired
 * @throws SignRequestValidationError - Decoded data fails Zod validation
 */
export function parseSignRequest(
  url: string,
): SignRequest | Promise<SignRequest> {
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

  const requestId = parsed.searchParams.get('requestId');
  if (requestId) {
    const topic =
      parsed.searchParams.get('topic') ?? 'waiaas-sign-requests';
    const serverUrl =
      parsed.searchParams.get('serverUrl') ?? 'https://ntfy.sh';
    return fetchSignRequestFromNtfy(requestId, topic, serverUrl);
  }

  throw new InvalidSignRequestUrlError(
    'URL must contain either "data" or "requestId" parameter',
  );
}
