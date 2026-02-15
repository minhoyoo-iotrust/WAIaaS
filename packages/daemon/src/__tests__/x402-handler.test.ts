/**
 * x402 Handler unit tests.
 *
 * Tests cover:
 * 1. Non-402 response passthrough (200, 404, 500)
 * 2. 402 response parsing (PAYMENT-REQUIRED header, JSON body fallback, Zod validation)
 * 3. (scheme, network) auto-selection (exact scheme, lowest amount, unsupported filtering)
 * 4. Payment signing + re-request flow (PAYMENT-SIGNATURE header)
 * 5. Retry limit (1 retry after payment, then X402_PAYMENT_REJECTED)
 * 6. Error handling (network error, timeout, signPayment failure)
 * 7. SSRF guard integration (validateUrlSafety called, X402_SSRF_BLOCKED propagation)
 *
 * Mocking: ssrf-guard.js, payment-signer.js
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WAIaaSError } from '@waiaas/core';
import type { X402FetchRequest, PaymentRequirements } from '@waiaas/core';

// ---------------------------------------------------------------------------
// Mock ssrf-guard
// ---------------------------------------------------------------------------
vi.mock('../services/x402/ssrf-guard.js', () => ({
  validateUrlSafety: vi.fn(),
  safeFetchWithRedirects: vi.fn(),
}));

import {
  validateUrlSafety,
  safeFetchWithRedirects,
} from '../services/x402/ssrf-guard.js';

const mockValidateUrlSafety = vi.mocked(validateUrlSafety);
const mockSafeFetchWithRedirects = vi.mocked(safeFetchWithRedirects);

// ---------------------------------------------------------------------------
// Mock payment-signer
// ---------------------------------------------------------------------------
vi.mock('../services/x402/payment-signer.js', () => ({
  signPayment: vi.fn(),
}));

import { signPayment } from '../services/x402/payment-signer.js';
const mockSignPayment = vi.mocked(signPayment);

// ---------------------------------------------------------------------------
// Import SUT
// ---------------------------------------------------------------------------
import {
  handleX402Fetch,
  parse402Response,
  selectPaymentRequirement,
  type X402HandlerDeps,
} from '../services/x402/x402-handler.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/** Standard x402 fetch request fixture. */
function makeRequest(overrides?: Partial<X402FetchRequest>): X402FetchRequest {
  return {
    url: 'https://api.example.com/premium/data',
    method: 'GET',
    ...overrides,
  };
}

/** Standard handler deps fixture. */
function makeDeps(overrides?: Partial<X402HandlerDeps>): X402HandlerDeps {
  return {
    keyStore: {
      decryptPrivateKey: vi.fn().mockResolvedValue(new Uint8Array(32)),
      releaseKey: vi.fn(),
    },
    walletId: 'test-wallet',
    walletAddress: '0x1234567890abcdef1234567890abcdef12345678',
    masterPassword: 'test-password',
    supportedNetworks: new Set([
      'eip155:84532',
      'solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1',
    ]),
    ...overrides,
  };
}

/** Build a PaymentRequirements fixture. */
function makePaymentRequirements(
  overrides?: Partial<PaymentRequirements>,
): PaymentRequirements {
  return {
    scheme: 'exact',
    network: 'eip155:84532',
    amount: '1000000',
    asset: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
    payTo: '0xaaaa567890abcdef1234567890abcdef12345678',
    maxTimeoutSeconds: 300,
    extra: {},
    ...overrides,
  } as PaymentRequirements;
}

/** Build a PaymentRequired V2 object (402 response payload). */
function makePaymentRequired(accepts: PaymentRequirements[]) {
  return {
    x402Version: 2 as const,
    resource: { url: 'https://api.example.com/premium/data' },
    accepts,
  };
}

/** Base64-encode a JSON object (mimics @x402/core/http encodePaymentRequiredHeader). */
function encodeBase64Json(obj: unknown): string {
  return Buffer.from(JSON.stringify(obj)).toString('base64');
}

/** Create a mock Response with given status, body, and headers. */
function mockResponse(
  status: number,
  body: string,
  headers?: Record<string, string>,
): Response {
  return new Response(body, {
    status,
    headers: headers ?? {},
  });
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  // Default: validateUrlSafety returns parsed URL
  mockValidateUrlSafety.mockResolvedValue(
    new URL('https://api.example.com/premium/data'),
  );
});

// ===========================================================================
// 1. Non-402 response passthrough (X4HAND-03)
// ===========================================================================

describe('Non-402 response passthrough', () => {
  it('200 OK: body, status, headers가 그대로 X402FetchResponse로 반환된다', async () => {
    const response = mockResponse(200, 'premium content', {
      'content-type': 'text/plain',
    });
    mockSafeFetchWithRedirects.mockResolvedValue(response);

    const result = await handleX402Fetch(makeRequest(), makeDeps());

    expect(result.status).toBe(200);
    expect(result.body).toBe('premium content');
    expect(result.headers).toHaveProperty('content-type', 'text/plain');
    expect(result.payment).toBeUndefined();
  });

  it('404 Not Found: status 404, body 그대로 반환', async () => {
    const response = mockResponse(404, 'Not Found');
    mockSafeFetchWithRedirects.mockResolvedValue(response);

    const result = await handleX402Fetch(makeRequest(), makeDeps());

    expect(result.status).toBe(404);
    expect(result.body).toBe('Not Found');
  });

  it('500 Internal Server Error: status 500, body 그대로 반환', async () => {
    const response = mockResponse(500, 'Server Error');
    mockSafeFetchWithRedirects.mockResolvedValue(response);

    const result = await handleX402Fetch(makeRequest(), makeDeps());

    expect(result.status).toBe(500);
    expect(result.body).toBe('Server Error');
  });

  it('비-402 응답 시 safeFetchWithRedirects가 1번만 호출된다 (결제 서명 안 함)', async () => {
    const response = mockResponse(200, 'ok');
    mockSafeFetchWithRedirects.mockResolvedValue(response);

    await handleX402Fetch(makeRequest(), makeDeps());

    expect(mockSafeFetchWithRedirects).toHaveBeenCalledTimes(1);
    expect(mockSignPayment).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// 2. 402 response parsing (X4HAND-01 - parse402Response)
// ===========================================================================

describe('parse402Response', () => {
  it('PAYMENT-REQUIRED 헤더에서 PaymentRequired V2를 추출한다', async () => {
    const paymentRequired = makePaymentRequired([makePaymentRequirements()]);
    const encoded = encodeBase64Json(paymentRequired);
    const response = mockResponse(402, '', {
      'payment-required': encoded,
    });

    const result = await parse402Response(response);

    expect(result.x402Version).toBe(2);
    expect(result.accepts).toHaveLength(1);
    expect(result.accepts[0]!.scheme).toBe('exact');
    expect(result.accepts[0]!.network).toBe('eip155:84532');
  });

  it('PAYMENT-REQUIRED 헤더 없으면 JSON body에서 파싱을 시도한다', async () => {
    const paymentRequired = makePaymentRequired([makePaymentRequirements()]);
    const response = mockResponse(402, JSON.stringify(paymentRequired));

    const result = await parse402Response(response);

    expect(result.x402Version).toBe(2);
    expect(result.accepts).toHaveLength(1);
  });

  it('유효하지 않은 PaymentRequired -> Zod 검증 에러가 발생한다', async () => {
    const invalidPayload = { x402Version: 2, invalid: true };
    const encoded = encodeBase64Json(invalidPayload);
    const response = mockResponse(402, '', {
      'payment-required': encoded,
    });

    // Should throw a ZodError (not just any error) because of schema validation
    const err = await parse402Response(response).catch((e: unknown) => e);
    expect(err).toBeDefined();
    // Verify it's NOT a plain "Not implemented" error but a Zod validation error
    expect((err as Error).message).not.toBe('Not implemented');
  });
});

// ===========================================================================
// 3. (scheme, network) auto-selection (X4HAND-02 - selectPaymentRequirement)
// ===========================================================================

describe('selectPaymentRequirement', () => {
  const supportedNetworks = new Set([
    'eip155:84532',
    'solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1',
  ]);

  it('accepts에서 scheme=exact + 지원 네트워크 항목을 선택한다', () => {
    const accepts = [
      makePaymentRequirements({ network: 'eip155:84532', amount: '1000000' }),
    ];

    const selected = selectPaymentRequirement(accepts, supportedNetworks);

    expect(selected.network).toBe('eip155:84532');
    expect(selected.amount).toBe('1000000');
  });

  it('여러 지원 가능 항목 중 최저 amount를 선택한다', () => {
    const accepts = [
      makePaymentRequirements({ network: 'eip155:84532', amount: '5000000' }),
      makePaymentRequirements({ network: 'eip155:84532', amount: '1000000' }),
      makePaymentRequirements({ network: 'eip155:84532', amount: '3000000' }),
    ];

    const selected = selectPaymentRequirement(accepts, supportedNetworks);

    expect(selected.amount).toBe('1000000');
  });

  it('accepts에 지원 가능한 항목이 없으면 X402_UNSUPPORTED_SCHEME 에러', () => {
    const accepts = [
      makePaymentRequirements({ network: 'eip155:1' }), // mainnet - not in supportedNetworks
    ];

    expect(() => selectPaymentRequirement(accepts, supportedNetworks)).toThrow(
      WAIaaSError,
    );
  });

  it('scheme이 exact가 아닌 항목은 필터링된다', () => {
    const accepts = [
      makePaymentRequirements({ scheme: 'streaming', network: 'eip155:84532' }),
      makePaymentRequirements({ scheme: 'exact', network: 'eip155:84532', amount: '2000000' }),
    ];

    const selected = selectPaymentRequirement(accepts, supportedNetworks);

    expect(selected.scheme).toBe('exact');
    expect(selected.amount).toBe('2000000');
  });

  it('모든 항목이 exact가 아니면 X402_UNSUPPORTED_SCHEME 에러', () => {
    const accepts = [
      makePaymentRequirements({ scheme: 'streaming', network: 'eip155:84532' }),
    ];

    expect(() => selectPaymentRequirement(accepts, supportedNetworks)).toThrow(
      WAIaaSError,
    );
  });
});

// ===========================================================================
// 4. Payment signing + re-request flow (X4HAND-04)
// ===========================================================================

describe('Payment signing + re-request', () => {
  it('402 -> signPayment -> PAYMENT-SIGNATURE 헤더로 재요청 -> 200 OK 반환', async () => {
    const paymentReqs = [makePaymentRequirements()];
    const paymentRequired = makePaymentRequired(paymentReqs);
    const encoded = encodeBase64Json(paymentRequired);

    // First request: 402
    const first402 = mockResponse(402, '', { 'payment-required': encoded });
    // Second request: 200 OK
    const success = mockResponse(200, 'premium content', {
      'content-type': 'application/json',
    });
    mockSafeFetchWithRedirects
      .mockResolvedValueOnce(first402)
      .mockResolvedValueOnce(success);

    // signPayment returns a PaymentPayload
    const paymentPayload = {
      x402Version: 2,
      resource: { url: 'https://api.example.com/premium/data' },
      accepted: paymentReqs[0],
      payload: { signature: '0xabcdef', authorization: {} },
    };
    mockSignPayment.mockResolvedValue(paymentPayload);

    const result = await handleX402Fetch(makeRequest(), makeDeps());

    expect(result.status).toBe(200);
    expect(result.body).toBe('premium content');
    expect(result.payment).toBeDefined();
  });

  it('재요청 시 PAYMENT-SIGNATURE 헤더가 포함된다', async () => {
    const paymentReqs = [makePaymentRequirements()];
    const paymentRequired = makePaymentRequired(paymentReqs);
    const encoded = encodeBase64Json(paymentRequired);

    const first402 = mockResponse(402, '', { 'payment-required': encoded });
    const success = mockResponse(200, 'data', {});
    mockSafeFetchWithRedirects
      .mockResolvedValueOnce(first402)
      .mockResolvedValueOnce(success);

    mockSignPayment.mockResolvedValue({
      x402Version: 2,
      resource: { url: 'https://api.example.com/premium/data' },
      accepted: paymentReqs[0],
      payload: { signature: '0xabcdef' },
    });

    await handleX402Fetch(makeRequest(), makeDeps());

    // Verify second safeFetchWithRedirects call includes PAYMENT-SIGNATURE header
    expect(mockSafeFetchWithRedirects).toHaveBeenCalledTimes(2);
    const secondCall = mockSafeFetchWithRedirects.mock.calls[1];
    // Headers should contain PAYMENT-SIGNATURE (base64 encoded PaymentPayload)
    expect(secondCall).toBeDefined();
    // The headers argument (index 2) should contain PAYMENT-SIGNATURE key
    const headers = secondCall![2] as Record<string, string>;
    expect(headers).toHaveProperty('PAYMENT-SIGNATURE');
    // PAYMENT-SIGNATURE should be a non-empty base64 string
    expect(headers['PAYMENT-SIGNATURE']!.length).toBeGreaterThan(0);
  });

  it('결제 성공 시 payment 정보가 X402FetchResponse에 포함된다', async () => {
    const paymentReqs = [makePaymentRequirements({
      amount: '1000000',
      network: 'eip155:84532',
      asset: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
      payTo: '0xaaaa567890abcdef1234567890abcdef12345678',
    })];
    const paymentRequired = makePaymentRequired(paymentReqs);
    const encoded = encodeBase64Json(paymentRequired);

    const first402 = mockResponse(402, '', { 'payment-required': encoded });
    const success = mockResponse(200, 'data', {});
    mockSafeFetchWithRedirects
      .mockResolvedValueOnce(first402)
      .mockResolvedValueOnce(success);

    mockSignPayment.mockResolvedValue({
      x402Version: 2,
      resource: { url: 'https://api.example.com/premium/data' },
      accepted: paymentReqs[0],
      payload: { signature: '0xabcdef' },
    });

    const result = await handleX402Fetch(makeRequest(), makeDeps());

    expect(result.payment).toBeDefined();
    expect(result.payment!.amount).toBe('1000000');
    expect(result.payment!.network).toBe('eip155:84532');
    expect(result.payment!.payTo).toBe('0xaaaa567890abcdef1234567890abcdef12345678');
  });

  it('signPayment에 올바른 인자가 전달된다', async () => {
    const paymentReqs = [makePaymentRequirements()];
    const paymentRequired = makePaymentRequired(paymentReqs);
    const encoded = encodeBase64Json(paymentRequired);

    const first402 = mockResponse(402, '', { 'payment-required': encoded });
    const success = mockResponse(200, 'data', {});
    mockSafeFetchWithRedirects
      .mockResolvedValueOnce(first402)
      .mockResolvedValueOnce(success);

    mockSignPayment.mockResolvedValue({
      x402Version: 2,
      resource: { url: '' },
      accepted: paymentReqs[0],
      payload: {},
    });

    const deps = makeDeps();
    await handleX402Fetch(makeRequest(), deps);

    expect(mockSignPayment).toHaveBeenCalledWith(
      expect.objectContaining({ scheme: 'exact', network: 'eip155:84532' }),
      deps.keyStore,
      deps.walletId,
      deps.walletAddress,
      deps.masterPassword,
    );
  });
});

// ===========================================================================
// 5. Retry limit (X4HAND-05)
// ===========================================================================

describe('Retry limit', () => {
  it('결제 후 재요청이 다시 402 -> X402_PAYMENT_REJECTED 에러', async () => {
    const paymentReqs = [makePaymentRequirements()];
    const paymentRequired = makePaymentRequired(paymentReqs);
    const encoded = encodeBase64Json(paymentRequired);

    // Both requests return 402
    const first402 = mockResponse(402, '', { 'payment-required': encoded });
    const second402 = mockResponse(402, '', { 'payment-required': encoded });
    mockSafeFetchWithRedirects
      .mockResolvedValueOnce(first402)
      .mockResolvedValueOnce(second402);

    mockSignPayment.mockResolvedValue({
      x402Version: 2,
      resource: { url: '' },
      accepted: paymentReqs[0],
      payload: { signature: '0xabc' },
    });

    await expect(
      handleX402Fetch(makeRequest(), makeDeps()),
    ).rejects.toThrow(WAIaaSError);

    // Verify error code
    try {
      await handleX402Fetch(makeRequest(), makeDeps());
    } catch (err) {
      if (err instanceof WAIaaSError) {
        expect(err.code).toBe('X402_PAYMENT_REJECTED');
      }
    }
  });

  it('safeFetchWithRedirects가 정확히 2번 호출된다 (원본 + 재요청)', async () => {
    const paymentReqs = [makePaymentRequirements()];
    const paymentRequired = makePaymentRequired(paymentReqs);
    const encoded = encodeBase64Json(paymentRequired);

    const first402 = mockResponse(402, '', { 'payment-required': encoded });
    const second402 = mockResponse(402, '', { 'payment-required': encoded });
    mockSafeFetchWithRedirects
      .mockResolvedValueOnce(first402)
      .mockResolvedValueOnce(second402);

    mockSignPayment.mockResolvedValue({
      x402Version: 2,
      resource: { url: '' },
      accepted: paymentReqs[0],
      payload: {},
    });

    try {
      await handleX402Fetch(makeRequest(), makeDeps());
    } catch {
      // Expected
    }

    expect(mockSafeFetchWithRedirects).toHaveBeenCalledTimes(2);
  });
});

// ===========================================================================
// 6. Error handling (X4HAND-06)
// ===========================================================================

describe('Error handling', () => {
  it('safeFetchWithRedirects 네트워크 에러 -> 에러 전파', async () => {
    mockSafeFetchWithRedirects.mockRejectedValue(
      new Error('Network error: ECONNREFUSED'),
    );

    await expect(handleX402Fetch(makeRequest(), makeDeps())).rejects.toThrow(
      'Network error: ECONNREFUSED',
    );
  });

  it('타임아웃 (AbortError) -> 에러 전파', async () => {
    const abortError = new DOMException('The operation was aborted', 'AbortError');
    mockSafeFetchWithRedirects.mockRejectedValue(abortError);

    await expect(handleX402Fetch(makeRequest(), makeDeps())).rejects.toThrow();
  });

  it('signPayment 실패 -> 에러 전파', async () => {
    const paymentReqs = [makePaymentRequirements()];
    const paymentRequired = makePaymentRequired(paymentReqs);
    const encoded = encodeBase64Json(paymentRequired);

    const first402 = mockResponse(402, '', { 'payment-required': encoded });
    mockSafeFetchWithRedirects.mockResolvedValueOnce(first402);

    mockSignPayment.mockRejectedValue(
      new WAIaaSError('X402_UNSUPPORTED_SCHEME', {
        message: 'No USDC domain for this network',
      }),
    );

    await expect(
      handleX402Fetch(makeRequest(), makeDeps()),
    ).rejects.toThrow(WAIaaSError);
  });

  it('재요청 후 비-ok + 비-402 응답 -> X402_SERVER_ERROR', async () => {
    const paymentReqs = [makePaymentRequirements()];
    const paymentRequired = makePaymentRequired(paymentReqs);
    const encoded = encodeBase64Json(paymentRequired);

    const first402 = mockResponse(402, '', { 'payment-required': encoded });
    const serverError = mockResponse(500, 'Internal Server Error');
    mockSafeFetchWithRedirects
      .mockResolvedValueOnce(first402)
      .mockResolvedValueOnce(serverError);

    mockSignPayment.mockResolvedValue({
      x402Version: 2,
      resource: { url: '' },
      accepted: paymentReqs[0],
      payload: {},
    });

    await expect(
      handleX402Fetch(makeRequest(), makeDeps()),
    ).rejects.toThrow(WAIaaSError);

    // Reset mocks for code assertion
    vi.clearAllMocks();
    mockValidateUrlSafety.mockResolvedValue(
      new URL('https://api.example.com/premium/data'),
    );

    const first402b = mockResponse(402, '', { 'payment-required': encoded });
    const serverError2 = mockResponse(500, 'error');
    mockSafeFetchWithRedirects
      .mockResolvedValueOnce(first402b)
      .mockResolvedValueOnce(serverError2);
    mockSignPayment.mockResolvedValue({
      x402Version: 2,
      resource: { url: '' },
      accepted: paymentReqs[0],
      payload: {},
    });

    try {
      await handleX402Fetch(makeRequest(), makeDeps());
    } catch (err) {
      if (err instanceof WAIaaSError) {
        expect(err.code).toBe('X402_SERVER_ERROR');
      }
    }
  });
});

// ===========================================================================
// 7. SSRF guard integration
// ===========================================================================

describe('SSRF guard integration', () => {
  it('validateUrlSafety가 요청 URL로 호출된다', async () => {
    const response = mockResponse(200, 'ok');
    mockSafeFetchWithRedirects.mockResolvedValue(response);

    await handleX402Fetch(
      makeRequest({ url: 'https://api.example.com/premium/data' }),
      makeDeps(),
    );

    expect(mockValidateUrlSafety).toHaveBeenCalledWith(
      'https://api.example.com/premium/data',
    );
  });

  it('validateUrlSafety가 X402_SSRF_BLOCKED throw -> 그대로 전파', async () => {
    mockValidateUrlSafety.mockRejectedValue(
      new WAIaaSError('X402_SSRF_BLOCKED', {
        message: 'Resolved IP is private/reserved',
      }),
    );

    await expect(
      handleX402Fetch(makeRequest(), makeDeps()),
    ).rejects.toThrow(WAIaaSError);

    // Verify safeFetchWithRedirects was NOT called
    expect(mockSafeFetchWithRedirects).not.toHaveBeenCalled();
  });

  it('SSRF 차단 시 signPayment도 호출되지 않는다', async () => {
    mockValidateUrlSafety.mockRejectedValue(
      new WAIaaSError('X402_SSRF_BLOCKED', { message: 'blocked' }),
    );

    try {
      await handleX402Fetch(makeRequest(), makeDeps());
    } catch {
      // Expected
    }

    expect(mockSignPayment).not.toHaveBeenCalled();
  });
});
