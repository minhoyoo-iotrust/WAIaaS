/**
 * x402 Handler -- orchestrates SSRF guard + payment signing + 402 response handling.
 *
 * Independent pipeline (does NOT extend 6-stage pipeline):
 * 1. SSRF guard (validateUrlSafety)
 * 2. HTTP request (safeFetchWithRedirects)
 * 3. Non-402 passthrough
 * 4. 402 response parsing (PAYMENT-REQUIRED header -> PaymentRequired V2)
 * 5. (scheme, network) auto-selection from accepts array
 * 6. Payment signing (signPayment)
 * 7. Re-request with PAYMENT-SIGNATURE header
 * 8. Retry limit: 1 retry after payment, then X402_PAYMENT_REJECTED
 *
 * @module x402-handler
 */

import {
  WAIaaSError,
  PaymentRequiredV2Schema,
  resolveX402Network,
} from '@waiaas/core';
import type {
  X402FetchRequest,
  X402FetchResponse,
  X402PaymentInfo,
  PaymentRequirements,
} from '@waiaas/core';
import { validateUrlSafety, safeFetchWithRedirects } from './ssrf-guard.js';
import { signPayment } from './payment-signer.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Dependencies injected into the x402 handler. */
export interface X402HandlerDeps {
  keyStore: {
    decryptPrivateKey(walletId: string, masterPassword: string): Promise<Uint8Array>;
    releaseKey(key: Uint8Array): void;
  };
  walletId: string;
  walletAddress: string;
  masterPassword: string;
  supportedNetworks: Set<string>; // CAIP-2 identifiers
}

// ---------------------------------------------------------------------------
// Base64 JSON encode/decode (equivalent to @x402/core/http helpers)
// ---------------------------------------------------------------------------

/**
 * Encode a PaymentPayload as a base64 header value.
 * Equivalent to @x402/core/http encodePaymentSignatureHeader.
 */
function encodePaymentSignatureHeader(paymentPayload: Record<string, unknown>): string {
  const json = JSON.stringify(paymentPayload);
  return Buffer.from(json, 'utf-8').toString('base64');
}

/**
 * Decode a base64 PAYMENT-REQUIRED header into a PaymentRequired object.
 * Equivalent to @x402/core/http decodePaymentRequiredHeader.
 */
function decodePaymentRequiredHeader(headerValue: string): unknown {
  const decoded = Buffer.from(headerValue, 'base64').toString('utf-8');
  return JSON.parse(decoded) as unknown;
}

// ---------------------------------------------------------------------------
// handleX402Fetch -- main entry point
// ---------------------------------------------------------------------------

/**
 * Fetch a URL with x402 payment handling.
 *
 * Flow:
 * 1. Validate URL safety (SSRF guard)
 * 2. Make initial request
 * 3. If non-402: return passthrough response
 * 4. If 402: parse payment requirements, select best option, sign, re-request
 * 5. If re-request returns 402: throw X402_PAYMENT_REJECTED (1 retry max)
 * 6. If re-request returns non-ok: throw X402_SERVER_ERROR
 * 7. If re-request returns ok: return payment response
 */
export async function handleX402Fetch(
  request: X402FetchRequest,
  deps: X402HandlerDeps,
): Promise<X402FetchResponse> {
  // Step 1: SSRF guard
  const validatedUrl = await validateUrlSafety(request.url);

  // Step 2: Initial request
  const response = await safeFetchWithRedirects(
    validatedUrl,
    request.method ?? 'GET',
    request.headers,
    request.body,
  );

  // Step 3: Non-402 passthrough
  if (response.status !== 402) {
    return buildPassthroughResponse(response);
  }

  // Step 4: Parse 402 response
  const paymentRequired = await parse402Response(response);

  // Step 5: Select best (scheme, network) from accepts
  const selected = selectPaymentRequirement(
    paymentRequired.accepts,
    deps.supportedNetworks,
  );

  // Step 6: Sign payment
  const paymentPayload = await signPayment(
    selected,
    deps.keyStore,
    deps.walletId,
    deps.walletAddress,
    deps.masterPassword,
  );

  // Fill resource.url in the payment payload
  paymentPayload.resource = { url: request.url };

  // Step 7: Encode and re-request with PAYMENT-SIGNATURE header
  const encodedSignature = encodePaymentSignatureHeader(paymentPayload);
  const retryHeaders: Record<string, string> = {
    ...(request.headers ?? {}),
    'PAYMENT-SIGNATURE': encodedSignature,
  };

  const retryResponse = await safeFetchWithRedirects(
    validatedUrl,
    request.method ?? 'GET',
    retryHeaders,
    request.body,
  );

  // Step 8: Handle retry response
  if (retryResponse.status === 402) {
    throw new WAIaaSError('X402_PAYMENT_REJECTED', {
      message: 'Payment was rejected by the resource server after retry',
    });
  }

  if (!retryResponse.ok) {
    throw new WAIaaSError('X402_SERVER_ERROR', {
      message: `Resource server returned ${retryResponse.status} after payment`,
    });
  }

  // Step 9: Build success response with payment info
  return buildPaymentResponse(retryResponse, selected);
}

// ---------------------------------------------------------------------------
// parse402Response
// ---------------------------------------------------------------------------

/** Parsed PaymentRequired V2 structure. */
interface ParsedPaymentRequired {
  x402Version: number;
  accepts: PaymentRequirements[];
  resource: { url: string };
}

/**
 * Parse a 402 response into PaymentRequired V2 structure.
 *
 * Attempts to parse from:
 * 1. PAYMENT-REQUIRED header (base64-encoded JSON)
 * 2. Response body (JSON)
 *
 * Validates against PaymentRequiredV2Schema (Zod).
 */
export async function parse402Response(
  response: Response,
): Promise<ParsedPaymentRequired> {
  let raw: unknown;

  // Try header first
  const headerValue = response.headers.get('payment-required');
  if (headerValue) {
    raw = decodePaymentRequiredHeader(headerValue);
  } else {
    // Fallback: JSON body
    raw = await response.json() as unknown;
  }

  // Validate with Zod
  const parsed = PaymentRequiredV2Schema.parse(raw);

  return {
    x402Version: parsed.x402Version,
    accepts: parsed.accepts as PaymentRequirements[],
    resource: parsed.resource,
  };
}

// ---------------------------------------------------------------------------
// selectPaymentRequirement
// ---------------------------------------------------------------------------

/**
 * Select the best PaymentRequirements from an accepts array.
 *
 * Criteria:
 * 1. scheme must be 'exact' (streaming/other schemes not supported)
 * 2. network must be in supportedNetworks AND resolvable via resolveX402Network
 * 3. Among matching items, select the one with lowest amount
 *
 * @throws WAIaaSError('X402_UNSUPPORTED_SCHEME') if no matching requirement found
 */
export function selectPaymentRequirement(
  accepts: PaymentRequirements[],
  supportedNetworks: Set<string>,
): PaymentRequirements {
  // Filter for exact scheme + supported network
  const candidates = accepts.filter((req) => {
    if (req.scheme !== 'exact') return false;
    if (!supportedNetworks.has(req.network)) return false;

    // Verify network is known to WAIaaS
    try {
      resolveX402Network(req.network);
      return true;
    } catch {
      return false;
    }
  });

  if (candidates.length === 0) {
    throw new WAIaaSError('X402_UNSUPPORTED_SCHEME', {
      message: 'No supported (scheme=exact, network) pair found in accepts',
      details: {
        available: accepts.map((a) => ({ scheme: a.scheme, network: a.network })),
        supported: [...supportedNetworks],
      },
    });
  }

  // Select lowest amount
  return candidates.reduce((min, req) =>
    BigInt(req.amount) < BigInt(min.amount) ? req : min,
  );
}

// ---------------------------------------------------------------------------
// Response builders
// ---------------------------------------------------------------------------

/**
 * Build a passthrough X402FetchResponse from a non-402 response.
 */
async function buildPassthroughResponse(
  response: Response,
): Promise<X402FetchResponse> {
  const body = await response.text();
  const headers: Record<string, string> = {};
  response.headers.forEach((value, key) => {
    headers[key] = value;
  });

  return {
    status: response.status,
    headers,
    body,
  };
}

/**
 * Build a payment X402FetchResponse from a successful retry response.
 */
async function buildPaymentResponse(
  response: Response,
  requirement: PaymentRequirements,
): Promise<X402FetchResponse> {
  const base = await buildPassthroughResponse(response);

  const payment: X402PaymentInfo = {
    amount: requirement.amount,
    asset: requirement.asset,
    network: requirement.network,
    payTo: requirement.payTo,
    txId: '', // Not yet available -- facilitator settles asynchronously
  };

  return {
    ...base,
    payment,
  };
}
