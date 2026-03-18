/**
 * Tests for WAIaaSPluginClient and helper functions.
 * Covers: HTTP errors, network errors, toResult branches, createClient.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { WAIaaSPluginClient, createClient, toResult } from '../src/client.js';

describe('WAIaaSPluginClient', () => {
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockFetch = vi.fn();
    vi.stubGlobal('fetch', mockFetch);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('GET request returns data on success', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ id: '123' }),
    });
    const client = new WAIaaSPluginClient('http://localhost:3100/', 'tok');
    const result = await client.get<{ id: string }>('/v1/test');
    expect(result).toEqual({ ok: true, data: { id: '123' } });
    expect(mockFetch).toHaveBeenCalledWith('http://localhost:3100/v1/test', expect.objectContaining({ method: 'GET' }));
  });

  it('POST request sends JSON body', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ status: 'ok' }),
    });
    const client = new WAIaaSPluginClient('http://localhost:3100', 'tok');
    const result = await client.post('/v1/send', { amount: '100' });
    expect(result).toEqual({ ok: true, data: { status: 'ok' } });
    const [, opts] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(opts.body).toBe(JSON.stringify({ amount: '100' }));
  });

  it('strips trailing slashes from baseUrl', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({}),
    });
    const client = new WAIaaSPluginClient('http://localhost:3100///', 'tok');
    await client.get('/v1/test');
    const [url] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://localhost:3100/v1/test');
  });

  it('returns error with message from response body on HTTP error', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 403,
      json: () => Promise.resolve({ message: 'Forbidden' }),
    });
    const client = new WAIaaSPluginClient('http://localhost:3100', 'tok');
    const result = await client.get('/v1/test');
    expect(result).toEqual({ ok: false, error: 'Forbidden', status: 403 });
  });

  it('returns HTTP status as error when response body has no message', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      json: () => Promise.resolve({ code: 'INTERNAL' }),
    });
    const client = new WAIaaSPluginClient('http://localhost:3100', 'tok');
    const result = await client.get('/v1/test');
    expect(result).toEqual({ ok: false, error: 'HTTP 500', status: 500 });
  });

  it('returns HTTP status when response body json() rejects', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 502,
      json: () => Promise.reject(new Error('not json')),
    });
    const client = new WAIaaSPluginClient('http://localhost:3100', 'tok');
    const result = await client.get('/v1/test');
    expect(result).toEqual({ ok: false, error: 'HTTP 502', status: 502 });
  });

  it('returns error on network failure (Error instance)', async () => {
    mockFetch.mockRejectedValue(new Error('ECONNREFUSED'));
    const client = new WAIaaSPluginClient('http://localhost:3100', 'tok');
    const result = await client.get('/v1/test');
    expect(result).toEqual({ ok: false, error: 'ECONNREFUSED' });
  });

  it('returns "Network error" on non-Error throw', async () => {
    mockFetch.mockRejectedValue('string error');
    const client = new WAIaaSPluginClient('http://localhost:3100', 'tok');
    const result = await client.get('/v1/test');
    expect(result).toEqual({ ok: false, error: 'Network error' });
  });
});

describe('createClient()', () => {
  it('returns a WAIaaSPluginClient instance', () => {
    const client = createClient('http://localhost:3100', 'token');
    expect(client).toBeInstanceOf(WAIaaSPluginClient);
  });
});

describe('toResult()', () => {
  it('returns data when result is ok', () => {
    expect(toResult({ ok: true, data: { id: '1' } })).toEqual({ id: '1' });
  });

  it('returns error object when result is not ok', () => {
    expect(toResult({ ok: false, error: 'fail', status: 404 })).toEqual({ error: 'fail', status: 404 });
  });

  it('returns error without status when status is undefined', () => {
    expect(toResult({ ok: false, error: 'network' })).toEqual({ error: 'network', status: undefined });
  });
});
