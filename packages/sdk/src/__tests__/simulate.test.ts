/**
 * Tests for WAIaaSClient.simulate() method.
 *
 * Verifies:
 * - Correct API endpoint called (POST /v1/transactions/simulate)
 * - Parameters passed correctly
 * - SimulateResponse returned on success
 * - Pre-validation triggers VALIDATION_ERROR
 * - Server errors mapped to WAIaaSError
 *
 * @see Phase 309 Plan 02 Task 2
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { WAIaaSClient } from '../client.js';
import { WAIaaSError } from '../error.js';

function createMockJwt(sessionId: string): string {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({ sessionId, walletId: 'wallet-1' })).toString('base64url');
  const signature = 'mock-signature';
  return `${header}.${payload}.${signature}`;
}

function mockResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function mockErrorResponse(code: string, message: string, status: number): Response {
  return new Response(
    JSON.stringify({ code, message, retryable: false }),
    { status, headers: { 'Content-Type': 'application/json' } },
  );
}

describe('WAIaaSClient.simulate', () => {
  const mockToken = createMockJwt('sess-sim-001');
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should call POST /v1/transactions/simulate with correct body', async () => {
    const client = new WAIaaSClient({
      baseUrl: 'http://localhost:3000',
      sessionToken: mockToken,
    });

    const simulateResult = {
      success: true,
      policy: { tier: 'INSTANT', allowed: true },
      fee: { estimatedFee: '6000', feeSymbol: 'SOL', feeDecimals: 9, feeUsd: 0.001 },
      balanceChanges: [{ asset: 'SOL', before: '1000000000', after: '899994000', delta: '-100006000' }],
      warnings: [],
      simulation: { simulated: true, gasUsed: '5000' },
      meta: { chain: 'solana', network: 'solana-devnet', fromAddress: 'abc', toAddress: 'def', simulatedAt: '2026-03-03T00:00:00Z' },
    };

    fetchSpy.mockResolvedValue(mockResponse(simulateResult));

    const result = await client.simulate({
      to: 'RecipientAddr',
      amount: '100000000',
    });

    expect(result).toEqual(simulateResult);

    const calledUrl = fetchSpy.mock.calls[0]![0] as string;
    expect(calledUrl).toBe('http://localhost:3000/v1/transactions/simulate');

    const opts = fetchSpy.mock.calls[0]![1] as RequestInit;
    expect(opts.method).toBe('POST');
    expect(JSON.parse(opts.body as string)).toEqual({
      to: 'RecipientAddr',
      amount: '100000000',
    });
  });

  it('should return policy denied result (success=false)', async () => {
    const client = new WAIaaSClient({
      baseUrl: 'http://localhost:3000',
      sessionToken: mockToken,
    });

    const deniedResult = {
      success: false,
      policy: { tier: 'INSTANT', allowed: false, reason: 'Token not in ALLOWED_TOKENS list' },
      fee: null,
      balanceChanges: [],
      warnings: [],
      simulation: null,
      meta: { chain: 'solana', network: 'solana-devnet', fromAddress: 'abc', toAddress: 'def', simulatedAt: '2026-03-03T00:00:00Z' },
    };

    fetchSpy.mockResolvedValue(mockResponse(deniedResult));

    const result = await client.simulate({
      to: 'addr',
      amount: '1000',
    });

    expect(result.success).toBe(false);
    expect(result.policy.allowed).toBe(false);
    expect(result.policy.reason).toBe('Token not in ALLOWED_TOKENS list');
  });

  it('should send Authorization Bearer header', async () => {
    const client = new WAIaaSClient({
      baseUrl: 'http://localhost:3000',
      sessionToken: mockToken,
    });

    fetchSpy.mockResolvedValue(mockResponse({
      success: true,
      policy: { tier: 'INSTANT', allowed: true },
      fee: null,
      balanceChanges: [],
      warnings: [],
      simulation: null,
      meta: {},
    }));

    await client.simulate({ to: 'addr', amount: '100' });

    const opts = fetchSpy.mock.calls[0]![1] as RequestInit;
    const headers = opts.headers as Record<string, string>;
    expect(headers['Authorization']).toBe(`Bearer ${mockToken}`);
  });

  it('should throw VALIDATION_ERROR for invalid amount before HTTP call', async () => {
    const client = new WAIaaSClient({
      baseUrl: 'http://localhost:3000',
      sessionToken: mockToken,
    });

    const err = await client
      .simulate({ to: 'addr', amount: '-1' })
      .catch((e: unknown) => e) as WAIaaSError;

    expect(err).toBeInstanceOf(WAIaaSError);
    expect(err.code).toBe('VALIDATION_ERROR');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('should throw VALIDATION_ERROR for empty to address', async () => {
    const client = new WAIaaSClient({
      baseUrl: 'http://localhost:3000',
      sessionToken: mockToken,
    });

    await expect(
      client.simulate({ to: '', amount: '100' }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('should throw WAIaaSError on server error', async () => {
    const client = new WAIaaSClient({
      baseUrl: 'http://localhost:3000',
      sessionToken: mockToken,
    });

    fetchSpy.mockResolvedValue(
      mockErrorResponse('WALLET_NOT_FOUND', 'Wallet not found', 404),
    );

    const err = await client
      .simulate({ to: 'addr', amount: '100' })
      .catch((e: unknown) => e) as WAIaaSError;

    expect(err).toBeInstanceOf(WAIaaSError);
    expect(err.code).toBe('WALLET_NOT_FOUND');
    expect(err.status).toBe(404);
  });

  it('should include type and token fields for TOKEN_TRANSFER simulation', async () => {
    const client = new WAIaaSClient({
      baseUrl: 'http://localhost:3000',
      sessionToken: mockToken,
    });

    fetchSpy.mockResolvedValue(mockResponse({
      success: true,
      policy: { tier: 'INSTANT', allowed: true },
      fee: { estimatedFee: '5000', feeSymbol: 'SOL', feeDecimals: 9, feeUsd: null },
      balanceChanges: [],
      warnings: [],
      simulation: { simulated: true },
      meta: {},
    }));

    await client.simulate({
      to: 'addr',
      amount: '1000000',
      type: 'TOKEN_TRANSFER',
      token: { address: 'mint123', decimals: 6, symbol: 'USDC' },
    });

    const opts = fetchSpy.mock.calls[0]![1] as RequestInit;
    const body = JSON.parse(opts.body as string) as Record<string, unknown>;
    expect(body['type']).toBe('TOKEN_TRANSFER');
    expect(body['token']).toEqual({ address: 'mint123', decimals: 6, symbol: 'USDC' });
  });

  it('should include network in request body', async () => {
    const client = new WAIaaSClient({
      baseUrl: 'http://localhost:3000',
      sessionToken: mockToken,
    });

    fetchSpy.mockResolvedValue(mockResponse({
      success: true,
      policy: { tier: 'INSTANT', allowed: true },
      fee: null,
      balanceChanges: [],
      warnings: [],
      simulation: null,
      meta: {},
    }));

    await client.simulate({
      to: 'addr',
      amount: '100',
      network: 'polygon-mainnet',
    });

    const opts = fetchSpy.mock.calls[0]![1] as RequestInit;
    const body = JSON.parse(opts.body as string) as Record<string, unknown>;
    expect(body['network']).toBe('polygon-mainnet');
  });
});
