/**
 * Coverage tests for mcp api-client uncovered branches.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ApiClient } from '../api-client.js';
import type { SessionManager } from '../session-manager.js';

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

describe('ApiClient branch coverage', () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('handle401 returns expired when getToken returns null after wait', async () => {
    // SessionManager that initially has a token but returns null after 401 (simulating expiry)
    const getTokenFn = vi.fn()
      .mockReturnValueOnce('initial-token')  // first call for request headers
      .mockReturnValueOnce(null);             // second call in handle401
    const sm = {
      getToken: getTokenFn,
      getState: vi.fn(() => 'expired'),
      start: vi.fn(),
      dispose: vi.fn(),
    } as unknown as SessionManager;

    const client = new ApiClient(sm, 'http://localhost:3100');
    vi.stubGlobal('fetch', mockFetchResponse(401, { code: 'UNAUTHORIZED' }, false));

    const result = await client.get('/v1/wallet/balance');

    expect(result.ok).toBe(false);
    expect('expired' in result && result.expired).toBe(true);
  });

  it('503 with KILL_SWITCH_ACTIVE but no message falls back to default', async () => {
    const sm = {
      getToken: vi.fn(() => 'token'),
      getState: vi.fn(() => 'active'),
      start: vi.fn(),
      dispose: vi.fn(),
    } as unknown as SessionManager;

    const client = new ApiClient(sm, 'http://localhost:3100');
    vi.stubGlobal('fetch', mockFetchResponse(503, { code: 'KILL_SWITCH_ACTIVE' }, false));

    const result = await client.get('/test');

    expect(result.ok).toBe(false);
    if ('error' in result) {
      expect(result.error?.code).toBe('KILL_SWITCH_ACTIVE');
      expect(result.error?.message).toBe('Kill switch is active');
    }
  });

  it('503 without code falls back to HTTP_503', async () => {
    const sm = {
      getToken: vi.fn(() => 'token'),
      getState: vi.fn(() => 'active'),
      start: vi.fn(),
      dispose: vi.fn(),
    } as unknown as SessionManager;

    const client = new ApiClient(sm, 'http://localhost:3100');
    // 503 response without any JSON code/message
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({
      ok: false,
      status: 503,
      statusText: 'Service Unavailable',
      json: () => Promise.resolve(null),
    })));

    const result = await client.get('/test');

    expect(result.ok).toBe(false);
    if ('error' in result) {
      expect(result.error?.code).toBe('HTTP_503');
      expect(result.error?.message).toBe('Service unavailable');
    }
  });
});
