import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { WAIaaSClient } from '../client.js';
import { WAIaaSError } from '../error.js';

/**
 * Helper to create a mock JWT with a sessionId in the payload.
 */
function createMockJwt(sessionId: string): string {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({ sessionId, walletId: 'wallet-1' })).toString('base64url');
  const signature = 'mock-signature';
  return `${header}.${payload}.${signature}`;
}

/**
 * Helper to create a mock Response.
 */
function mockResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/**
 * Helper to create a mock error Response with WAIaaS error body.
 */
function mockErrorResponse(
  code: string,
  message: string,
  status: number,
  extra?: { retryable?: boolean; hint?: string },
): Response {
  return new Response(
    JSON.stringify({
      code,
      message,
      retryable: extra?.retryable ?? false,
      ...(extra?.hint && { hint: extra.hint }),
    }),
    {
      status,
      headers: { 'Content-Type': 'application/json' },
    },
  );
}

describe('WAIaaSClient', () => {
  const mockToken = createMockJwt('sess-001');
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // =========================================================================
  // Initialization
  // =========================================================================

  describe('initialization', () => {
    it('should construct with baseUrl and sessionToken', () => {
      const client = new WAIaaSClient({
        baseUrl: 'http://localhost:3000',
        sessionToken: mockToken,
      });
      expect(client).toBeDefined();
    });

    it('should strip trailing slash from baseUrl', async () => {
      const client = new WAIaaSClient({
        baseUrl: 'http://localhost:3000/',
        sessionToken: mockToken,
      });

      fetchSpy.mockResolvedValue(
        mockResponse({ walletId: 'w1', chain: 'solana', network: 'devnet', address: 'abc' }),
      );

      await client.getAddress();

      const calledUrl = fetchSpy.mock.calls[0]![0] as string;
      expect(calledUrl).toBe('http://localhost:3000/v1/wallet/address');
      expect(calledUrl).not.toContain('//v1');
    });

    it('should throw WAIaaSError when calling method without token set', async () => {
      const client = new WAIaaSClient({
        baseUrl: 'http://localhost:3000',
      });

      await expect(client.getBalance()).rejects.toThrow(WAIaaSError);
      await expect(client.getBalance()).rejects.toMatchObject({
        code: 'NO_TOKEN',
      });
    });
  });

  // =========================================================================
  // getBalance
  // =========================================================================

  describe('getBalance', () => {
    it('should return BalanceResponse on 200', async () => {
      const client = new WAIaaSClient({
        baseUrl: 'http://localhost:3000',
        sessionToken: mockToken,
      });

      const expected = {
        walletId: 'wallet-1',
        chain: 'solana',
        network: 'devnet',
        address: 'ABC123',
        balance: '1000000000',
        decimals: 9,
        symbol: 'SOL',
      };

      fetchSpy.mockResolvedValue(mockResponse(expected));

      const result = await client.getBalance();
      expect(result).toEqual(expected);
    });

    it('should send Authorization Bearer header', async () => {
      const client = new WAIaaSClient({
        baseUrl: 'http://localhost:3000',
        sessionToken: mockToken,
      });

      fetchSpy.mockResolvedValue(
        mockResponse({
          walletId: 'a', chain: 'solana', network: 'devnet',
          address: 'x', balance: '0', decimals: 9, symbol: 'SOL',
        }),
      );

      await client.getBalance();

      const opts = fetchSpy.mock.calls[0]![1] as RequestInit;
      const headers = opts.headers as Record<string, string>;
      expect(headers['Authorization']).toBe(`Bearer ${mockToken}`);
    });

    it('should pass network query parameter when specified', async () => {
      const client = new WAIaaSClient({
        baseUrl: 'http://localhost:3000',
        sessionToken: mockToken,
      });

      fetchSpy.mockResolvedValueOnce(
        mockResponse({
          walletId: 'wallet-1', chain: 'evm', network: 'polygon-mainnet',
          address: '0xabc', balance: '100', decimals: 18, symbol: 'ETH',
        }),
      );

      await client.getBalance({ network: 'polygon-mainnet' });

      const calledUrl = fetchSpy.mock.calls[0]![0] as string;
      expect(calledUrl).toContain('/v1/wallet/balance?network=polygon-mainnet');
    });

    it('should work without network option (backward compat)', async () => {
      const client = new WAIaaSClient({
        baseUrl: 'http://localhost:3000',
        sessionToken: mockToken,
      });

      fetchSpy.mockResolvedValueOnce(
        mockResponse({
          walletId: 'wallet-1', chain: 'solana', network: 'devnet',
          address: 'ABC123', balance: '100', decimals: 9, symbol: 'SOL',
        }),
      );

      await client.getBalance();

      const calledUrl = fetchSpy.mock.calls[0]![0] as string;
      expect(calledUrl).toBe('http://localhost:3000/v1/wallet/balance');
    });

    it('should throw WAIaaSError on 401', async () => {
      const client = new WAIaaSClient({
        baseUrl: 'http://localhost:3000',
        sessionToken: mockToken,
      });

      fetchSpy.mockResolvedValue(
        mockErrorResponse('AUTH_FAILED', 'Unauthorized', 401),
      );

      const err = await client.getBalance().catch((e: unknown) => e) as WAIaaSError;
      expect(err).toBeInstanceOf(WAIaaSError);
      expect(err.code).toBe('AUTH_FAILED');
      expect(err.status).toBe(401);
    });
  });

  // =========================================================================
  // getAddress
  // =========================================================================

  describe('getAddress', () => {
    it('should return AddressResponse on 200', async () => {
      const client = new WAIaaSClient({
        baseUrl: 'http://localhost:3000',
        sessionToken: mockToken,
      });

      const expected = {
        walletId: 'wallet-1',
        chain: 'solana',
        network: 'devnet',
        address: 'PubKeyABC',
      };

      fetchSpy.mockResolvedValue(mockResponse(expected));

      const result = await client.getAddress();
      expect(result).toEqual(expected);
    });

    it('should call GET /v1/wallet/address', async () => {
      const client = new WAIaaSClient({
        baseUrl: 'http://localhost:3000',
        sessionToken: mockToken,
      });

      fetchSpy.mockResolvedValue(
        mockResponse({ walletId: 'a', chain: 'solana', network: 'devnet', address: 'x' }),
      );

      await client.getAddress();

      const calledUrl = fetchSpy.mock.calls[0]![0] as string;
      expect(calledUrl).toBe('http://localhost:3000/v1/wallet/address');
      const opts = fetchSpy.mock.calls[0]![1] as RequestInit;
      expect(opts.method).toBe('GET');
    });
  });

  // =========================================================================
  // getAssets
  // =========================================================================

  describe('getAssets', () => {
    it('should return AssetsResponse with assets array on 200', async () => {
      const client = new WAIaaSClient({
        baseUrl: 'http://localhost:3000',
        sessionToken: mockToken,
      });

      const expected = {
        walletId: 'wallet-1',
        chain: 'solana',
        network: 'devnet',
        assets: [
          {
            mint: 'So11111111111111111111111111111111111111112',
            symbol: 'SOL',
            name: 'Solana',
            balance: '1000000000',
            decimals: 9,
            isNative: true,
          },
          {
            mint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
            symbol: 'USDC',
            name: 'USD Coin',
            balance: '500000',
            decimals: 6,
            isNative: false,
            usdValue: 0.5,
          },
        ],
      };

      fetchSpy.mockResolvedValue(mockResponse(expected));

      const result = await client.getAssets();
      expect(result).toEqual(expected);
      expect(result.assets).toHaveLength(2);
    });

    it('should pass network query parameter when specified', async () => {
      const client = new WAIaaSClient({
        baseUrl: 'http://localhost:3000',
        sessionToken: mockToken,
      });

      fetchSpy.mockResolvedValueOnce(
        mockResponse({
          walletId: 'wallet-1', chain: 'evm', network: 'ethereum-sepolia', assets: [],
        }),
      );

      await client.getAssets({ network: 'ethereum-sepolia' });

      const calledUrl = fetchSpy.mock.calls[0]![0] as string;
      expect(calledUrl).toContain('/v1/wallet/assets?network=ethereum-sepolia');
    });

    it('should call GET /v1/wallet/assets', async () => {
      const client = new WAIaaSClient({
        baseUrl: 'http://localhost:3000',
        sessionToken: mockToken,
      });

      fetchSpy.mockResolvedValue(
        mockResponse({ walletId: 'a', chain: 'solana', network: 'devnet', assets: [] }),
      );

      await client.getAssets();

      const calledUrl = fetchSpy.mock.calls[0]![0] as string;
      expect(calledUrl).toBe('http://localhost:3000/v1/wallet/assets');
    });
  });

  // =========================================================================
  // sendToken
  // =========================================================================

  describe('sendToken', () => {
    it('should return SendTokenResponse on 201', async () => {
      const client = new WAIaaSClient({
        baseUrl: 'http://localhost:3000',
        sessionToken: mockToken,
      });

      const expected = { id: 'tx-001', status: 'PENDING' };
      fetchSpy.mockResolvedValue(mockResponse(expected, 201));

      const result = await client.sendToken({
        to: 'RecipientAddr',
        amount: '1000000',
      });
      expect(result).toEqual(expected);
    });

    it('should send POST body with to/amount/memo', async () => {
      const client = new WAIaaSClient({
        baseUrl: 'http://localhost:3000',
        sessionToken: mockToken,
      });

      fetchSpy.mockResolvedValue(
        mockResponse({ id: 'tx-002', status: 'PENDING' }, 201),
      );

      await client.sendToken({
        to: 'RecipientAddr',
        amount: '500000',
        memo: 'test payment',
      });

      const opts = fetchSpy.mock.calls[0]![1] as RequestInit;
      expect(opts.method).toBe('POST');
      expect(JSON.parse(opts.body as string)).toEqual({
        to: 'RecipientAddr',
        amount: '500000',
        memo: 'test payment',
      });
    });

    it('should throw VALIDATION_ERROR for invalid amount before HTTP call', async () => {
      const client = new WAIaaSClient({
        baseUrl: 'http://localhost:3000',
        sessionToken: mockToken,
      });

      // sendToken with invalid amount '-1' triggers pre-validation
      const err = await client
        .sendToken({ to: 'addr', amount: '-1' })
        .catch((e: unknown) => e) as WAIaaSError;

      expect(err).toBeInstanceOf(WAIaaSError);
      expect(err.code).toBe('VALIDATION_ERROR');
      expect(err.status).toBe(0);
      // fetch should NOT have been called
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('should send type and token in body when type=TOKEN_TRANSFER', async () => {
      const client = new WAIaaSClient({
        baseUrl: 'http://localhost:3000',
        sessionToken: mockToken,
      });

      fetchSpy.mockResolvedValue(
        mockResponse({ id: 'tx-005', status: 'PENDING' }, 201),
      );

      await client.sendToken({
        to: 'RecipientAddr',
        amount: '500000',
        type: 'TOKEN_TRANSFER',
        token: { address: 'mint123', decimals: 6, symbol: 'USDC' },
      });

      const opts = fetchSpy.mock.calls[0]![1] as RequestInit;
      expect(JSON.parse(opts.body as string)).toEqual({
        to: 'RecipientAddr',
        amount: '500000',
        type: 'TOKEN_TRANSFER',
        token: { address: 'mint123', decimals: 6, symbol: 'USDC' },
      });
    });

    it('should include network in body when specified', async () => {
      const client = new WAIaaSClient({
        baseUrl: 'http://localhost:3000',
        sessionToken: mockToken,
      });

      fetchSpy.mockResolvedValueOnce(
        mockResponse({ id: 'tx-net-1', status: 'PENDING' }, 201),
      );

      await client.sendToken({ to: 'addr', amount: '100', network: 'polygon-mainnet' });

      const opts = fetchSpy.mock.calls[0]![1] as RequestInit;
      const body = JSON.parse(opts.body as string) as Record<string, unknown>;
      expect(body['network']).toBe('polygon-mainnet');
    });

    it('should send legacy body without type/token when omitted (backward compat)', async () => {
      const client = new WAIaaSClient({
        baseUrl: 'http://localhost:3000',
        sessionToken: mockToken,
      });

      fetchSpy.mockResolvedValue(
        mockResponse({ id: 'tx-006', status: 'PENDING' }, 201),
      );

      await client.sendToken({
        to: 'RecipientAddr',
        amount: '1000000',
      });

      const opts = fetchSpy.mock.calls[0]![1] as RequestInit;
      const body = JSON.parse(opts.body as string) as Record<string, unknown>;
      expect(body).toEqual({
        to: 'RecipientAddr',
        amount: '1000000',
      });
      expect(body['type']).toBeUndefined();
      expect(body['token']).toBeUndefined();
    });

    it('should throw WAIaaSError with hint on 400 server response', async () => {
      const client = new WAIaaSClient({
        baseUrl: 'http://localhost:3000',
        sessionToken: mockToken,
      });

      fetchSpy.mockResolvedValue(
        mockErrorResponse('ACTION_VALIDATION_FAILED', 'Insufficient balance', 400, {
          hint: 'Balance too low for this transfer',
        }),
      );

      // Valid params that pass pre-validation, but server returns 400
      const err = await client
        .sendToken({ to: 'addr', amount: '999999999999' })
        .catch((e: unknown) => e) as WAIaaSError;

      expect(err).toBeInstanceOf(WAIaaSError);
      expect(err.code).toBe('ACTION_VALIDATION_FAILED');
      expect(err.status).toBe(400);
      expect(err.hint).toBe('Balance too low for this transfer');
    });
  });

  // =========================================================================
  // getTransaction
  // =========================================================================

  describe('getTransaction', () => {
    it('should return TransactionResponse on 200', async () => {
      const client = new WAIaaSClient({
        baseUrl: 'http://localhost:3000',
        sessionToken: mockToken,
      });

      const expected = {
        id: 'tx-001',
        walletId: 'wallet-1',
        type: 'TRANSFER',
        status: 'CONFIRMED',
        tier: 'LOW',
        chain: 'solana',
        toAddress: 'RecipientAddr',
        amount: '1000000',
        txHash: '5wH...abc',
        error: null,
        createdAt: 1707000000,
      };

      fetchSpy.mockResolvedValue(mockResponse(expected));

      const result = await client.getTransaction('tx-001');
      expect(result).toEqual(expected);
    });

    it('should include transaction ID in path', async () => {
      const client = new WAIaaSClient({
        baseUrl: 'http://localhost:3000',
        sessionToken: mockToken,
      });

      fetchSpy.mockResolvedValue(
        mockResponse({
          id: 'tx-xyz', walletId: 'a', type: 'TRANSFER', status: 'PENDING',
          tier: null, chain: 'solana', toAddress: null, amount: null,
          txHash: null, error: null, createdAt: null,
        }),
      );

      await client.getTransaction('tx-xyz');

      const calledUrl = fetchSpy.mock.calls[0]![0] as string;
      expect(calledUrl).toBe('http://localhost:3000/v1/transactions/tx-xyz');
    });
  });

  // =========================================================================
  // listTransactions
  // =========================================================================

  describe('listTransactions', () => {
    it('should return paginated list on 200', async () => {
      const client = new WAIaaSClient({
        baseUrl: 'http://localhost:3000',
        sessionToken: mockToken,
      });

      const expected = {
        items: [
          {
            id: 'tx-1', walletId: 'a', type: 'TRANSFER', status: 'CONFIRMED',
            tier: null, chain: 'solana', toAddress: 'addr', amount: '100',
            txHash: 'hash1', error: null, createdAt: 1707000000,
          },
        ],
        cursor: 'tx-0',
        hasMore: true,
      };

      fetchSpy.mockResolvedValue(mockResponse(expected));

      const result = await client.listTransactions();
      expect(result.items).toHaveLength(1);
      expect(result.cursor).toBe('tx-0');
      expect(result.hasMore).toBe(true);
    });

    it('should pass cursor and limit as query params', async () => {
      const client = new WAIaaSClient({
        baseUrl: 'http://localhost:3000',
        sessionToken: mockToken,
      });

      fetchSpy.mockResolvedValue(
        mockResponse({ items: [], cursor: null, hasMore: false }),
      );

      await client.listTransactions({ cursor: 'cur-123', limit: 10 });

      const calledUrl = fetchSpy.mock.calls[0]![0] as string;
      expect(calledUrl).toContain('cursor=cur-123');
      expect(calledUrl).toContain('limit=10');
    });

    it('should work with no params (empty query string)', async () => {
      const client = new WAIaaSClient({
        baseUrl: 'http://localhost:3000',
        sessionToken: mockToken,
      });

      fetchSpy.mockResolvedValue(
        mockResponse({ items: [], cursor: null, hasMore: false }),
      );

      await client.listTransactions();

      const calledUrl = fetchSpy.mock.calls[0]![0] as string;
      expect(calledUrl).toBe('http://localhost:3000/v1/transactions');
      expect(calledUrl).not.toContain('?');
    });
  });

  // =========================================================================
  // listPendingTransactions
  // =========================================================================

  describe('listPendingTransactions', () => {
    it('should return pending items array on 200', async () => {
      const client = new WAIaaSClient({
        baseUrl: 'http://localhost:3000',
        sessionToken: mockToken,
      });

      const expected = {
        items: [
          {
            id: 'tx-p1', walletId: 'a', type: 'TRANSFER', status: 'PENDING',
            tier: null, chain: 'solana', toAddress: 'addr', amount: '100',
            txHash: null, error: null, createdAt: 1707000000,
          },
        ],
      };

      fetchSpy.mockResolvedValue(mockResponse(expected));

      const result = await client.listPendingTransactions();
      expect(result.items).toHaveLength(1);
      expect(result.items[0]!.status).toBe('PENDING');
    });

    it('should call correct /v1/transactions/pending path', async () => {
      const client = new WAIaaSClient({
        baseUrl: 'http://localhost:3000',
        sessionToken: mockToken,
      });

      fetchSpy.mockResolvedValue(mockResponse({ items: [] }));

      await client.listPendingTransactions();

      const calledUrl = fetchSpy.mock.calls[0]![0] as string;
      expect(calledUrl).toBe('http://localhost:3000/v1/transactions/pending');
    });
  });

  // =========================================================================
  // renewSession
  // =========================================================================

  describe('renewSession', () => {
    it('should extract sessionId from JWT and call PUT /v1/sessions/:id/renew', async () => {
      const sessionId = 'sess-renew-001';
      const token = createMockJwt(sessionId);
      const client = new WAIaaSClient({
        baseUrl: 'http://localhost:3000',
        sessionToken: token,
      });

      const expected = {
        id: sessionId,
        token: 'new-token-value',
        expiresAt: 1707100000,
        renewalCount: 1,
      };

      fetchSpy.mockResolvedValue(mockResponse(expected));

      const result = await client.renewSession();

      expect(result).toEqual(expected);
      const calledUrl = fetchSpy.mock.calls[0]![0] as string;
      expect(calledUrl).toBe(`http://localhost:3000/v1/sessions/${sessionId}/renew`);
      const opts = fetchSpy.mock.calls[0]![1] as RequestInit;
      expect(opts.method).toBe('PUT');
    });

    it('should auto-update sessionToken after successful renewal', async () => {
      const token = createMockJwt('sess-auto-update');
      const client = new WAIaaSClient({
        baseUrl: 'http://localhost:3000',
        sessionToken: token,
      });

      const newToken = createMockJwt('sess-new');
      fetchSpy.mockResolvedValue(
        mockResponse({
          id: 'sess-auto-update',
          token: newToken,
          expiresAt: 1707100000,
          renewalCount: 1,
        }),
      );

      await client.renewSession();

      // Next call should use the new token
      fetchSpy.mockResolvedValue(
        mockResponse({
          walletId: 'a', chain: 'solana', network: 'devnet', address: 'x',
          balance: '0', decimals: 9, symbol: 'SOL',
        }),
      );

      await client.getBalance();

      const opts = fetchSpy.mock.calls[1]![1] as RequestInit;
      const headers = opts.headers as Record<string, string>;
      expect(headers['Authorization']).toBe(`Bearer ${newToken}`);
    });

    it('should throw on invalid token format', async () => {
      const client = new WAIaaSClient({
        baseUrl: 'http://localhost:3000',
        sessionToken: 'not-a-jwt',
      });

      await expect(client.renewSession()).rejects.toThrow(WAIaaSError);
      await expect(client.renewSession()).rejects.toMatchObject({
        code: 'INVALID_TOKEN',
      });
    });

    it('should re-use cached sessionId on subsequent calls', async () => {
      const sessionId = 'sess-cached';
      const token = createMockJwt(sessionId);
      const client = new WAIaaSClient({
        baseUrl: 'http://localhost:3000',
        sessionToken: token,
      });

      // First renewal
      const newToken1 = createMockJwt('sess-cached'); // different token, same sessionId concept
      fetchSpy.mockResolvedValue(
        mockResponse({
          id: sessionId,
          token: newToken1,
          expiresAt: 1707100000,
          renewalCount: 1,
        }),
      );
      await client.renewSession();

      // Second renewal - should still use cached sessionId
      fetchSpy.mockResolvedValue(
        mockResponse({
          id: sessionId,
          token: 'token3',
          expiresAt: 1707200000,
          renewalCount: 2,
        }),
      );
      await client.renewSession();

      // Both calls should use the same session ID path
      const url1 = fetchSpy.mock.calls[0]![0] as string;
      const url2 = fetchSpy.mock.calls[1]![0] as string;
      expect(url1).toContain(`/sessions/${sessionId}/renew`);
      expect(url2).toContain(`/sessions/${sessionId}/renew`);
    });
  });

  // =========================================================================
  // Token Management
  // =========================================================================

  describe('token management', () => {
    it('setSessionToken() should update internal token', async () => {
      const client = new WAIaaSClient({
        baseUrl: 'http://localhost:3000',
      });

      // Should fail without token
      await expect(client.getBalance()).rejects.toThrow(WAIaaSError);

      // Set token and try again
      client.setSessionToken(mockToken);

      fetchSpy.mockResolvedValue(
        mockResponse({
          walletId: 'a', chain: 'solana', network: 'devnet', address: 'x',
          balance: '0', decimals: 9, symbol: 'SOL',
        }),
      );

      await expect(client.getBalance()).resolves.toBeDefined();
    });

    it('clearSessionToken() should clear token and sessionId', async () => {
      const client = new WAIaaSClient({
        baseUrl: 'http://localhost:3000',
        sessionToken: mockToken,
      });

      client.clearSessionToken();

      await expect(client.getBalance()).rejects.toMatchObject({
        code: 'NO_TOKEN',
      });
    });

    it('after setSessionToken(), next call uses new token in headers', async () => {
      const client = new WAIaaSClient({
        baseUrl: 'http://localhost:3000',
        sessionToken: 'old-token',
      });

      const newToken = 'new-fresh-token';
      client.setSessionToken(newToken);

      fetchSpy.mockResolvedValue(
        mockResponse({
          walletId: 'a', chain: 'solana', network: 'devnet', address: 'x',
          balance: '0', decimals: 9, symbol: 'SOL',
        }),
      );

      await client.getBalance();

      const opts = fetchSpy.mock.calls[0]![1] as RequestInit;
      const headers = opts.headers as Record<string, string>;
      expect(headers['Authorization']).toBe(`Bearer ${newToken}`);
    });
  });

  // =========================================================================
  // Retry Integration
  // =========================================================================

  describe('retry integration', () => {
    it('should retry on 429 and succeed on second attempt', async () => {
      const client = new WAIaaSClient({
        baseUrl: 'http://localhost:3000',
        sessionToken: mockToken,
        retryOptions: { maxRetries: 2, baseDelayMs: 1, maxDelayMs: 10 },
      });

      // First call: 429, second call: 200
      fetchSpy
        .mockResolvedValueOnce(
          mockErrorResponse('RATE_LIMIT_EXCEEDED', 'Too many requests', 429, { retryable: true }),
        )
        .mockResolvedValueOnce(
          mockResponse({
            walletId: 'a', chain: 'solana', network: 'devnet', address: 'x',
            balance: '100', decimals: 9, symbol: 'SOL',
          }),
        );

      const result = await client.getBalance();
      expect(result.balance).toBe('100');
      expect(fetchSpy).toHaveBeenCalledTimes(2);
    });

    it('should NOT retry on 401 (non-retryable)', async () => {
      const client = new WAIaaSClient({
        baseUrl: 'http://localhost:3000',
        sessionToken: mockToken,
        retryOptions: { maxRetries: 3, baseDelayMs: 1 },
      });

      fetchSpy.mockResolvedValue(
        mockErrorResponse('AUTH_FAILED', 'Unauthorized', 401),
      );

      const err = await client.getBalance().catch((e: unknown) => e) as WAIaaSError;
      expect(err.code).toBe('AUTH_FAILED');
      // Should only call once -- no retry for 401
      expect(fetchSpy).toHaveBeenCalledTimes(1);
    });

    it('sendToken with invalid params throws VALIDATION_ERROR without calling fetch', async () => {
      const client = new WAIaaSClient({
        baseUrl: 'http://localhost:3000',
        sessionToken: mockToken,
        retryOptions: { maxRetries: 3, baseDelayMs: 1 },
      });

      await expect(
        client.sendToken({ to: '', amount: '100' }),
      ).rejects.toMatchObject({
        code: 'VALIDATION_ERROR',
      });

      // Validation happens BEFORE retry wrapper, so fetch is never called
      expect(fetchSpy).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // signTransaction
  // =========================================================================

  describe('signTransaction', () => {
    it('should call POST /v1/transactions/sign with correct body and return SignTransactionResponse', async () => {
      const client = new WAIaaSClient({
        baseUrl: 'http://localhost:3000',
        sessionToken: mockToken,
      });

      const expected = {
        id: 'tx-sign-001',
        signedTransaction: 'base64signedtx...',
        txHash: null,
        operations: [
          { type: 'NATIVE_TRANSFER', to: 'addr1', amount: '1000000', token: null, programId: null, method: null },
        ],
        policyResult: { tier: 'INSTANT' },
      };

      fetchSpy.mockResolvedValue(mockResponse(expected));

      const result = await client.signTransaction({ transaction: 'base64unsignedtx...' });

      expect(result).toEqual(expected);

      const calledUrl = fetchSpy.mock.calls[0]![0] as string;
      expect(calledUrl).toBe('http://localhost:3000/v1/transactions/sign');

      const opts = fetchSpy.mock.calls[0]![1] as RequestInit;
      expect(opts.method).toBe('POST');
      expect(JSON.parse(opts.body as string)).toEqual({ transaction: 'base64unsignedtx...' });

      const headers = opts.headers as Record<string, string>;
      expect(headers['Authorization']).toBe(`Bearer ${mockToken}`);
    });

    it('should include network in body when specified', async () => {
      const client = new WAIaaSClient({
        baseUrl: 'http://localhost:3000',
        sessionToken: mockToken,
      });

      fetchSpy.mockResolvedValue(
        mockResponse({
          id: 'tx-sign-002',
          signedTransaction: '0xsigned...',
          txHash: '0xhash...',
          operations: [{ type: 'CONTRACT_CALL', to: '0xcontract', amount: null, token: null, programId: null, method: 'transfer' }],
          policyResult: { tier: 'INSTANT' },
        }),
      );

      await client.signTransaction({ transaction: '0xunsigned...', network: 'polygon-mainnet' });

      const opts = fetchSpy.mock.calls[0]![1] as RequestInit;
      const body = JSON.parse(opts.body as string) as Record<string, unknown>;
      expect(body['transaction']).toBe('0xunsigned...');
      expect(body['network']).toBe('polygon-mainnet');
    });

    it('should throw WAIaaSError on 403', async () => {
      const client = new WAIaaSClient({
        baseUrl: 'http://localhost:3000',
        sessionToken: mockToken,
        retryOptions: { maxRetries: 0 },
      });

      fetchSpy.mockResolvedValue(
        mockErrorResponse('POLICY_DENIED', 'Transaction denied by policy', 403),
      );

      const err = await client.signTransaction({ transaction: 'tx...' }).catch((e: unknown) => e) as WAIaaSError;
      expect(err).toBeInstanceOf(WAIaaSError);
      expect(err.code).toBe('POLICY_DENIED');
      expect(err.status).toBe(403);
    });
  });

  // =========================================================================
  // HTTP Layer
  // =========================================================================

  describe('HTTP layer', () => {
    it('should throw WAIaaSError with TIMEOUT code when request times out', async () => {
      const client = new WAIaaSClient({
        baseUrl: 'http://localhost:3000',
        sessionToken: mockToken,
        timeout: 1, // 1ms timeout
        retryOptions: { maxRetries: 0 }, // disable retry for timeout test
      });

      fetchSpy.mockImplementation(
        (_url: string, opts: RequestInit) =>
          new Promise((_resolve, reject) => {
            // Simulate the abort firing
            opts.signal?.addEventListener('abort', () => {
              reject(new DOMException('The operation was aborted.', 'AbortError'));
            });
          }),
      );

      const err = await client.getBalance().catch((e: unknown) => e) as WAIaaSError;
      expect(err).toBeInstanceOf(WAIaaSError);
      expect(err.code).toBe('REQUEST_TIMEOUT');
      expect(err.retryable).toBe(true);
    });

    it('should create fallback WAIaaSError for non-JSON error response', async () => {
      const client = new WAIaaSClient({
        baseUrl: 'http://localhost:3000',
        sessionToken: mockToken,
        retryOptions: { maxRetries: 0 }, // disable retry to test single error response
      });

      // Response that fails JSON parsing
      fetchSpy.mockResolvedValue(
        new Response('Internal Server Error', {
          status: 500,
          headers: { 'Content-Type': 'text/plain' },
        }),
      );

      const err = await client.getBalance().catch((e: unknown) => e) as WAIaaSError;
      expect(err).toBeInstanceOf(WAIaaSError);
      expect(err.code).toBe('HTTP_500');
      expect(err.retryable).toBe(true);
    });

    it('should send User-Agent header with SDK version', async () => {
      const client = new WAIaaSClient({
        baseUrl: 'http://localhost:3000',
        sessionToken: mockToken,
      });

      fetchSpy.mockResolvedValue(
        mockResponse({
          walletId: 'a', chain: 'solana', network: 'devnet', address: 'x',
          balance: '0', decimals: 9, symbol: 'SOL',
        }),
      );

      await client.getBalance();

      const opts = fetchSpy.mock.calls[0]![1] as RequestInit;
      const headers = opts.headers as Record<string, string>;
      expect(headers['User-Agent']).toBe('waiaas-sdk/0.0.0');
    });
  });
});
