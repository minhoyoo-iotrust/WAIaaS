/**
 * Tests for ApiClient, toToolResult, and toResourceResult.
 *
 * Mocks fetch via vi.stubGlobal to test HTTP behavior.
 * Tests all ApiResult variants and their conversion to MCP formats.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ApiClient, toToolResult, toResourceResult } from '../api-client.js';
import type { ApiResult } from '../api-client.js';
import type { SessionManager } from '../session-manager.js';

// --- Mock SessionManager ---
function createMockSessionManager(token: string | null = 'mock-token'): SessionManager {
  return {
    getToken: vi.fn(() => token),
    getState: vi.fn(() => (token ? 'active' : 'expired')),
    start: vi.fn(),
    dispose: vi.fn(),
  } as unknown as SessionManager;
}

// --- Mock fetch helper ---
function mockFetchResponse(status: number, body: unknown, ok?: boolean): ReturnType<typeof vi.fn> {
  return vi.fn(() =>
    Promise.resolve({
      ok: ok ?? (status >= 200 && status < 300),
      status,
      statusText: status === 200 ? 'OK' : 'Error',
      json: () => Promise.resolve(body),
    }),
  );
}

describe('ApiClient', () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  describe('get()', () => {
    it('returns ok result on 200 response', async () => {
      const sm = createMockSessionManager('test-token');
      const client = new ApiClient(sm, 'http://localhost:3100');
      const mockData = { balance: '1000000', symbol: 'SOL' };
      vi.stubGlobal('fetch', mockFetchResponse(200, mockData));

      const result = await client.get<typeof mockData>('/v1/wallet/balance');

      expect(result).toEqual({ ok: true, data: mockData });
    });

    it('passes Authorization header with Bearer token', async () => {
      const sm = createMockSessionManager('my-secret-token');
      const client = new ApiClient(sm, 'http://localhost:3100');
      const mockFn = mockFetchResponse(200, {});
      vi.stubGlobal('fetch', mockFn);

      await client.get('/v1/wallet/balance');

      expect(mockFn).toHaveBeenCalledWith(
        'http://localhost:3100/v1/wallet/balance',
        expect.objectContaining({
          headers: expect.objectContaining({
            'Authorization': 'Bearer my-secret-token',
            'User-Agent': '@waiaas/mcp/0.0.0',
          }),
        }),
      );
    });

    it('passes method GET without body', async () => {
      const sm = createMockSessionManager('token');
      const client = new ApiClient(sm, 'http://localhost:3100');
      const mockFn = mockFetchResponse(200, {});
      vi.stubGlobal('fetch', mockFn);

      await client.get('/v1/wallet/address');

      expect(mockFn).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          method: 'GET',
          body: undefined,
        }),
      );
    });
  });

  describe('post()', () => {
    it('returns ok result on 200 response', async () => {
      const sm = createMockSessionManager('token');
      const client = new ApiClient(sm, 'http://localhost:3100');
      const mockData = { id: 'tx-123', status: 'PENDING' };
      vi.stubGlobal('fetch', mockFetchResponse(200, mockData));

      const result = await client.post('/v1/transactions/send', { to: 'addr', amount: '100' });

      expect(result).toEqual({ ok: true, data: mockData });
    });

    it('sends JSON body', async () => {
      const sm = createMockSessionManager('token');
      const client = new ApiClient(sm, 'http://localhost:3100');
      const mockFn = mockFetchResponse(200, {});
      vi.stubGlobal('fetch', mockFn);

      const body = { to: 'addr', amount: '100', memo: 'test' };
      await client.post('/v1/transactions/send', body);

      expect(mockFn).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify(body),
        }),
      );
    });
  });

  describe('error handling', () => {
    it('returns expired result when token is null', async () => {
      const sm = createMockSessionManager(null);
      const client = new ApiClient(sm, 'http://localhost:3100');
      const mockFn = mockFetchResponse(200, {});
      vi.stubGlobal('fetch', mockFn);

      const result = await client.get('/v1/wallet/balance');

      expect(result).toEqual({
        ok: false,
        expired: true,
        message: 'Session token not available',
      });
      // fetch should NOT be called
      expect(mockFn).not.toHaveBeenCalled();
    });

    it('returns expired result on 401 response', async () => {
      const sm = createMockSessionManager('token');
      const client = new ApiClient(sm, 'http://localhost:3100');
      vi.stubGlobal('fetch', mockFetchResponse(401, { code: 'UNAUTHORIZED' }, false));

      const result = await client.get('/v1/wallet/balance');

      expect(result).toEqual({
        ok: false,
        expired: true,
        message: expect.stringContaining('401'),
      });
    });

    it('returns error result on 500 response', async () => {
      const sm = createMockSessionManager('token');
      const client = new ApiClient(sm, 'http://localhost:3100');
      vi.stubGlobal('fetch', mockFetchResponse(500, {
        code: 'INTERNAL_ERROR',
        message: 'Something broke',
        retryable: true,
      }, false));

      const result = await client.get('/v1/wallet/balance');

      expect(result).toMatchObject({
        ok: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Something broke',
          retryable: true,
        },
      });
    });

    it('returns error result on 400 response with hint', async () => {
      const sm = createMockSessionManager('token');
      const client = new ApiClient(sm, 'http://localhost:3100');
      vi.stubGlobal('fetch', mockFetchResponse(400, {
        code: 'VALIDATION_ERROR',
        message: 'Invalid amount',
        hint: 'Amount must be a positive integer string',
      }, false));

      const result = await client.get('/v1/wallet/balance');

      expect(result).toMatchObject({
        ok: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid amount',
          retryable: false,
          hint: 'Amount must be a positive integer string',
        },
      });
    });

    it('returns kill switch error on 503 with KILL_SWITCH_ACTIVE', async () => {
      const sm = createMockSessionManager('token');
      const client = new ApiClient(sm, 'http://localhost:3100');
      vi.stubGlobal('fetch', mockFetchResponse(503, {
        code: 'KILL_SWITCH_ACTIVE',
        message: 'Kill switch activated',
        hint: 'Contact owner to recover',
      }, false));

      const result = await client.get('/v1/wallet/balance');

      expect(result).toMatchObject({
        ok: false,
        error: {
          code: 'KILL_SWITCH_ACTIVE',
          message: 'Kill switch activated',
          retryable: false,
          hint: 'Contact owner to recover',
        },
      });
    });

    it('returns generic 503 error when not kill switch', async () => {
      const sm = createMockSessionManager('token');
      const client = new ApiClient(sm, 'http://localhost:3100');
      vi.stubGlobal('fetch', mockFetchResponse(503, {
        code: 'SERVICE_UNAVAILABLE',
        message: 'Server overloaded',
      }, false));

      const result = await client.get('/v1/wallet/balance');

      expect(result).toMatchObject({
        ok: false,
        error: {
          code: 'SERVICE_UNAVAILABLE',
          message: 'Server overloaded',
          retryable: true,
        },
      });
    });

    it('returns networkError on TypeError (fetch network failure)', async () => {
      const sm = createMockSessionManager('token');
      const client = new ApiClient(sm, 'http://localhost:3100');
      vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new TypeError('Failed to connect'))));

      const result = await client.get('/v1/wallet/balance');

      expect(result).toEqual({
        ok: false,
        networkError: true,
        message: 'Failed to connect',
      });
    });

    it('returns networkError on non-TypeError exceptions', async () => {
      const sm = createMockSessionManager('token');
      const client = new ApiClient(sm, 'http://localhost:3100');
      vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('Random error'))));

      const result = await client.get('/v1/wallet/balance');

      expect(result).toEqual({
        ok: false,
        networkError: true,
        message: 'Random error',
      });
    });

    it('handles 500 with non-JSON body gracefully', async () => {
      const sm = createMockSessionManager('token');
      const client = new ApiClient(sm, 'http://localhost:3100');
      vi.stubGlobal('fetch', vi.fn(() =>
        Promise.resolve({
          ok: false,
          status: 500,
          statusText: 'Internal Server Error',
          json: () => Promise.reject(new Error('not json')),
        }),
      ));

      const result = await client.get('/v1/wallet/balance');

      expect(result).toMatchObject({
        ok: false,
        error: {
          code: 'HTTP_500',
          retryable: true,
        },
      });
    });
  });

  describe('URL handling', () => {
    it('strips trailing slashes from baseUrl', async () => {
      const sm = createMockSessionManager('token');
      const client = new ApiClient(sm, 'http://localhost:3100///');
      const mockFn = mockFetchResponse(200, {});
      vi.stubGlobal('fetch', mockFn);

      await client.get('/v1/wallet/balance');

      expect(mockFn).toHaveBeenCalledWith(
        'http://localhost:3100/v1/wallet/balance',
        expect.any(Object),
      );
    });
  });
});

describe('toToolResult', () => {
  it('converts ok result to text content', () => {
    const result: ApiResult<{ balance: string }> = {
      ok: true,
      data: { balance: '1000000' },
    };

    const toolResult = toToolResult(result);

    expect(toolResult.content).toEqual([
      { type: 'text', text: '{"balance":"1000000"}' },
    ]);
    expect(toolResult.isError).toBeUndefined();
  });

  it('converts expired result without isError (H-04)', () => {
    const result: ApiResult<unknown> = {
      ok: false,
      expired: true,
      message: 'Session expired',
    };

    const toolResult = toToolResult(result);

    const item = toolResult.content[0] as { type: 'text'; text: string };
    const parsed = JSON.parse(item.text) as Record<string, unknown>;
    expect(parsed['session_expired']).toBe(true);
    expect(parsed['action']).toContain('waiaas mcp setup');
    expect(toolResult.isError).toBeUndefined(); // H-04
  });

  it('converts networkError result without isError (H-04)', () => {
    const result: ApiResult<unknown> = {
      ok: false,
      networkError: true,
      message: 'Connection refused',
    };

    const toolResult = toToolResult(result);

    const item = toolResult.content[0] as { type: 'text'; text: string };
    const parsed = JSON.parse(item.text) as Record<string, unknown>;
    expect(parsed['network_error']).toBe(true);
    expect(toolResult.isError).toBeUndefined(); // H-04
  });

  it('converts API error result with isError: true', () => {
    const result: ApiResult<unknown> = {
      ok: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Bad input',
        retryable: false,
        hint: 'Check your params',
      },
    };

    const toolResult = toToolResult(result);

    const item = toolResult.content[0] as { type: 'text'; text: string };
    const parsed = JSON.parse(item.text) as Record<string, unknown>;
    expect(parsed['error']).toBe(true);
    expect(parsed['code']).toBe('VALIDATION_ERROR');
    expect(parsed['hint']).toBe('Check your params');
    expect(toolResult.isError).toBe(true);
  });
});

describe('toResourceResult', () => {
  const uri = 'waiaas://wallet/balance';

  it('converts ok result to resource contents', () => {
    const result: ApiResult<{ balance: string }> = {
      ok: true,
      data: { balance: '1000000' },
    };

    const resourceResult = toResourceResult(uri, result);

    expect(resourceResult.contents).toEqual([{
      uri,
      text: '{"balance":"1000000"}',
      mimeType: 'application/json',
    }]);
  });

  it('converts expired result to informational resource', () => {
    const result: ApiResult<unknown> = {
      ok: false,
      expired: true,
      message: 'Token expired',
    };

    const resourceResult = toResourceResult(uri, result);

    const item = resourceResult.contents[0] as { uri: string; text: string; mimeType: string };
    const parsed = JSON.parse(item.text) as Record<string, unknown>;
    expect(parsed['session_expired']).toBe(true);
    expect(item.uri).toBe(uri);
    expect(item.mimeType).toBe('application/json');
  });

  it('converts networkError result to informational resource', () => {
    const result: ApiResult<unknown> = {
      ok: false,
      networkError: true,
      message: 'Connection refused',
    };

    const resourceResult = toResourceResult(uri, result);

    const item = resourceResult.contents[0] as { uri: string; text: string; mimeType: string };
    const parsed = JSON.parse(item.text) as Record<string, unknown>;
    expect(parsed['network_error']).toBe(true);
  });

  it('converts API error result to error resource', () => {
    const result: ApiResult<unknown> = {
      ok: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Server error',
        retryable: true,
      },
    };

    const resourceResult = toResourceResult(uri, result);

    const item = resourceResult.contents[0] as { uri: string; text: string; mimeType: string };
    const parsed = JSON.parse(item.text) as Record<string, unknown>;
    expect(parsed['error']).toBe(true);
    expect(parsed['code']).toBe('INTERNAL_ERROR');
  });
});
