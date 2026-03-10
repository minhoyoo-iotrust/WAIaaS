/**
 * Tests for PolymarketClobClient: CLOB REST API client.
 *
 * Plan 371-01 Task 2: ClobClient tests with mocked fetch.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ChainError } from '@waiaas/core';
import { PolymarketClobClient } from '../clob-client.js';
import { PolymarketRateLimiter } from '../rate-limiter.js';

// ---------------------------------------------------------------------------
// Mock fetch
// ---------------------------------------------------------------------------

const mockFetch = vi.fn();

beforeEach(() => {
  vi.stubGlobal('fetch', mockFetch);
  mockFetch.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function mockJsonResponse(data: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(data),
    text: () => Promise.resolve(JSON.stringify(data)),
  };
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const BASE_URL = 'https://clob.polymarket.com';
const rateLimiter = new PolymarketRateLimiter(100, 1000); // generous limit for tests
const client = new PolymarketClobClient(BASE_URL, rateLimiter);

const L2_HEADERS = {
  POLY_ADDRESS: '0x1234',
  POLY_SIGNATURE: 'hmac-sig',
  POLY_TIMESTAMP: '1700000000',
  POLY_API_KEY: 'api-key-1',
  POLY_PASSPHRASE: 'pp',
};

// ---------------------------------------------------------------------------
// L1 endpoint tests
// ---------------------------------------------------------------------------

describe('PolymarketClobClient L1 endpoints', () => {
  it('createApiKey sends POST /auth/api-key with L1 headers', async () => {
    const apiCreds = { apiKey: 'ak', secret: 'sc', passphrase: 'pp' };
    mockFetch.mockResolvedValueOnce(mockJsonResponse(apiCreds));

    const result = await client.createApiKey('0x1234', '0xsig', '1700000000');

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, opts] = mockFetch.mock.calls[0]!;
    expect(url).toBe(`${BASE_URL}/auth/api-key`);
    expect(opts.method).toBe('POST');
    expect(opts.headers.POLY_ADDRESS).toBe('0x1234');
    expect(opts.headers.POLY_SIGNATURE).toBe('0xsig');
    expect(opts.headers.POLY_TIMESTAMP).toBe('1700000000');
    expect(opts.headers.POLY_NONCE).toBe('0');
    expect(result).toEqual(apiCreds);
  });

  it('deleteApiKey sends DELETE /auth/api-key with L1 headers', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, status: 204, json: () => Promise.resolve({}), text: () => Promise.resolve('') });

    await client.deleteApiKey('0x1234', '0xsig', '1700000000');

    const [url, opts] = mockFetch.mock.calls[0]!;
    expect(url).toBe(`${BASE_URL}/auth/api-key`);
    expect(opts.method).toBe('DELETE');
    expect(opts.headers.POLY_ADDRESS).toBe('0x1234');
  });

  it('getApiKeys sends GET /auth/api-keys with L1 headers', async () => {
    mockFetch.mockResolvedValueOnce(mockJsonResponse([{ apiKey: 'ak1' }]));

    const result = await client.getApiKeys('0x1234', '0xsig', '1700000000');

    const [url, opts] = mockFetch.mock.calls[0]!;
    expect(url).toBe(`${BASE_URL}/auth/api-keys`);
    expect(opts.method).toBe('GET');
    expect(result).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// L2 endpoint tests
// ---------------------------------------------------------------------------

describe('PolymarketClobClient L2 endpoints', () => {
  it('postOrder sends POST /order with L2 headers and body', async () => {
    const orderResponse = { orderID: 'ord-1', success: true };
    mockFetch.mockResolvedValueOnce(mockJsonResponse(orderResponse));

    const payload = { order: { salt: '123' }, orderType: 'GTC', signature: '0xsig' };
    const result = await client.postOrder(L2_HEADERS, payload);

    const [url, opts] = mockFetch.mock.calls[0]!;
    expect(url).toBe(`${BASE_URL}/order`);
    expect(opts.method).toBe('POST');
    expect(opts.headers.POLY_API_KEY).toBe('api-key-1');
    expect(opts.headers.POLY_PASSPHRASE).toBe('pp');
    expect(JSON.parse(opts.body)).toEqual(payload);
    expect(result.orderID).toBe('ord-1');
  });

  it('cancelOrder sends DELETE /order/{id} with L2 headers', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, status: 204, json: () => Promise.resolve({}), text: () => Promise.resolve('') });

    await client.cancelOrder(L2_HEADERS, 'ord-1');

    const [url, opts] = mockFetch.mock.calls[0]!;
    expect(url).toBe(`${BASE_URL}/order/ord-1`);
    expect(opts.method).toBe('DELETE');
    expect(opts.headers.POLY_API_KEY).toBe('api-key-1');
  });

  it('cancelAll sends POST /cancel-all with L2 headers', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, status: 204, json: () => Promise.resolve({}), text: () => Promise.resolve('') });

    await client.cancelAll(L2_HEADERS, 'cond-1');

    const [url, opts] = mockFetch.mock.calls[0]!;
    expect(url).toBe(`${BASE_URL}/cancel-all`);
    expect(opts.method).toBe('POST');
    expect(JSON.parse(opts.body)).toEqual({ market: 'cond-1' });
  });

  it('getOrders sends GET /data/orders with L2 headers', async () => {
    mockFetch.mockResolvedValueOnce(mockJsonResponse([{ id: 'ord-1', status: 'LIVE' }]));

    const result = await client.getOrders(L2_HEADERS);

    const [url, opts] = mockFetch.mock.calls[0]!;
    expect(url).toBe(`${BASE_URL}/data/orders`);
    expect(opts.method).toBe('GET');
    expect(result).toHaveLength(1);
    expect(result[0]!.id).toBe('ord-1');
  });

  it('getOrder sends GET /data/order/{hash} with L2 headers', async () => {
    mockFetch.mockResolvedValueOnce(mockJsonResponse({ id: 'ord-1', status: 'MATCHED' }));

    const result = await client.getOrder(L2_HEADERS, 'hash-1');

    const [url] = mockFetch.mock.calls[0]!;
    expect(url).toBe(`${BASE_URL}/data/order/hash-1`);
    expect(result.status).toBe('MATCHED');
  });

  it('getTrades sends GET /trades with L2 headers', async () => {
    mockFetch.mockResolvedValueOnce(mockJsonResponse([{ id: 'trade-1' }]));

    const result = await client.getTrades(L2_HEADERS);

    const [url] = mockFetch.mock.calls[0]!;
    expect(url).toBe(`${BASE_URL}/trades`);
    expect(result).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Public endpoint tests
// ---------------------------------------------------------------------------

describe('PolymarketClobClient public endpoints', () => {
  it('getOrderbook sends GET /book?token_id=X without auth', async () => {
    mockFetch.mockResolvedValueOnce(
      mockJsonResponse({ bids: [{ price: '0.60', size: '1000' }], asks: [{ price: '0.65', size: '500' }] }),
    );

    const result = await client.getOrderbook('token-123');

    const [url, opts] = mockFetch.mock.calls[0]!;
    expect(url).toBe(`${BASE_URL}/book?token_id=token-123`);
    expect(opts.method).toBe('GET');
    // No auth headers
    expect(opts.headers.POLY_API_KEY).toBeUndefined();
    expect(opts.headers.POLY_SIGNATURE).toBeUndefined();
    expect(result.bids).toHaveLength(1);
    expect(result.asks).toHaveLength(1);
  });

  it('getPrice sends GET /price?token_id=X without auth', async () => {
    mockFetch.mockResolvedValueOnce(mockJsonResponse({ price: '0.65' }));

    const result = await client.getPrice('token-123');

    const [url] = mockFetch.mock.calls[0]!;
    expect(url).toBe(`${BASE_URL}/price?token_id=token-123`);
    expect(result.price).toBe('0.65');
  });

  it('getMidpoint sends GET /midpoint?token_id=X without auth', async () => {
    mockFetch.mockResolvedValueOnce(mockJsonResponse({ mid: '0.625' }));

    const result = await client.getMidpoint('token-123');

    const [url] = mockFetch.mock.calls[0]!;
    expect(url).toBe(`${BASE_URL}/midpoint?token_id=token-123`);
    expect(result.mid).toBe('0.625');
  });
});

// ---------------------------------------------------------------------------
// Error handling tests
// ---------------------------------------------------------------------------

describe('PolymarketClobClient error handling', () => {
  it('throws ChainError on non-2xx response', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 400,
      text: () => Promise.resolve(JSON.stringify({ error: 'Invalid order' })),
    });

    await expect(client.getPrice('token-1')).rejects.toThrow(ChainError);
  });

  it('throws ChainError with RATE_LIMITED code on 429', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 429,
      text: () => Promise.resolve('Too many requests'),
    });

    try {
      await client.getPrice('token-1');
      expect.unreachable('Should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(ChainError);
      expect((err as ChainError).code).toBe('ACTION_RATE_LIMITED');
    }
  });

  it('respects rate limiter on all requests', async () => {
    const limiterSpy = vi.fn().mockResolvedValue(undefined);
    const mockLimiter = { acquire: limiterSpy } as unknown as PolymarketRateLimiter;
    const clientWithSpy = new PolymarketClobClient(BASE_URL, mockLimiter);

    mockFetch.mockResolvedValueOnce(mockJsonResponse({ price: '0.5' }));
    await clientWithSpy.getPrice('token-1');

    expect(limiterSpy).toHaveBeenCalledTimes(1);
  });
});
