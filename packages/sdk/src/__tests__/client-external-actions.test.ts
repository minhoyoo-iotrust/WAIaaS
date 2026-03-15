/**
 * Tests for SDK external action methods:
 *   - listOffchainActions (sessionAuth)
 *   - getActionResult (sessionAuth)
 *   - listCredentials (sessionAuth)
 *   - createCredential (masterAuth)
 *   - deleteCredential (masterAuth)
 *   - rotateCredential (masterAuth)
 *
 * Note: SDK executeAction() already calls POST /v1/actions/:provider/:action.
 * Off-chain actions are auto-routed by the daemon via kind-based routing
 * (INTEG-06 satisfied). No SDK code changes needed for execution.
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

describe('SDK External Actions', () => {
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
  // listOffchainActions
  // =========================================================================

  describe('listOffchainActions', () => {
    it('calls GET /v1/wallets/:id/actions with query params', async () => {
      const client = new WAIaaSClient({ baseUrl: 'http://localhost:3100', sessionToken: mockToken });
      const expected = { actions: [], total: 0, limit: 20, offset: 0 };
      fetchSpy.mockResolvedValue(mockResponse(expected));

      const result = await client.listOffchainActions({ walletId: 'w1' });

      expect(result).toEqual(expected);
      const calledUrl = fetchSpy.mock.calls[0]![0] as string;
      expect(calledUrl).toBe('http://localhost:3100/v1/wallets/w1/actions');
    });

    it('includes venue/status filter in query string', async () => {
      const client = new WAIaaSClient({ baseUrl: 'http://localhost:3100', sessionToken: mockToken });
      fetchSpy.mockResolvedValue(mockResponse({ actions: [], total: 0, limit: 10, offset: 5 }));

      await client.listOffchainActions({ walletId: 'w1', venue: 'polymarket', status: 'FILLED', limit: 10, offset: 5 });

      const calledUrl = fetchSpy.mock.calls[0]![0] as string;
      expect(calledUrl).toContain('/v1/wallets/w1/actions?');
      expect(calledUrl).toContain('venue=polymarket');
      expect(calledUrl).toContain('status=FILLED');
      expect(calledUrl).toContain('limit=10');
      expect(calledUrl).toContain('offset=5');
    });
  });

  // =========================================================================
  // getActionResult
  // =========================================================================

  describe('getActionResult', () => {
    it('calls GET /v1/wallets/:id/actions/:actionId', async () => {
      const client = new WAIaaSClient({ baseUrl: 'http://localhost:3100', sessionToken: mockToken });
      const detail = { id: 'act-1', actionKind: 'signedData', venue: 'polymarket', status: 'FILLED' };
      fetchSpy.mockResolvedValue(mockResponse(detail));

      const result = await client.getActionResult('w1', 'act-1');

      expect(result).toEqual(detail);
      const calledUrl = fetchSpy.mock.calls[0]![0] as string;
      expect(calledUrl).toBe('http://localhost:3100/v1/wallets/w1/actions/act-1');
    });
  });

  // =========================================================================
  // listCredentials
  // =========================================================================

  describe('listCredentials', () => {
    it('calls GET /v1/wallets/:id/credentials with sessionAuth', async () => {
      const client = new WAIaaSClient({ baseUrl: 'http://localhost:3100', sessionToken: mockToken });
      const creds = [{ id: 'c1', name: 'api-key', type: 'api_key', walletId: 'w1', expiresAt: null, createdAt: 1000, updatedAt: 1000 }];
      fetchSpy.mockResolvedValue(mockResponse({ credentials: creds }));

      const result = await client.listCredentials('w1');

      expect(result).toEqual(creds);
      const calledUrl = fetchSpy.mock.calls[0]![0] as string;
      expect(calledUrl).toBe('http://localhost:3100/v1/wallets/w1/credentials');
      const opts = fetchSpy.mock.calls[0]![1] as RequestInit;
      expect((opts.headers as Record<string, string>)['Authorization']).toContain('Bearer');
    });
  });

  // =========================================================================
  // createCredential (masterAuth)
  // =========================================================================

  describe('createCredential', () => {
    it('calls POST /v1/wallets/:id/credentials with masterAuth', async () => {
      const client = new WAIaaSClient({ baseUrl: 'http://localhost:3100', masterPassword: 'test-pw' });
      const created = { id: 'c2', name: 'hmac-secret', type: 'hmac', walletId: 'w1', expiresAt: null, createdAt: 2000, updatedAt: 2000 };
      fetchSpy.mockResolvedValue(mockResponse(created));

      const result = await client.createCredential('w1', { name: 'hmac-secret', type: 'hmac', value: 'secret-val' });

      expect(result).toEqual(created);
      const calledUrl = fetchSpy.mock.calls[0]![0] as string;
      expect(calledUrl).toBe('http://localhost:3100/v1/wallets/w1/credentials');
      const opts = fetchSpy.mock.calls[0]![1] as RequestInit;
      expect(opts.method).toBe('POST');
      expect((opts.headers as Record<string, string>)['X-Master-Password']).toBe('test-pw');
      const body = JSON.parse(opts.body as string) as Record<string, unknown>;
      expect(body['name']).toBe('hmac-secret');
      expect(body['value']).toBe('secret-val');
    });

    it('throws MASTER_PASSWORD_REQUIRED without masterPassword', async () => {
      const client = new WAIaaSClient({ baseUrl: 'http://localhost:3100', sessionToken: mockToken });
      const err = await client.createCredential('w1', { name: 'x', type: 'y', value: 'z' }).catch((e: unknown) => e) as WAIaaSError;
      expect(err).toBeInstanceOf(WAIaaSError);
      expect(err.code).toBe('MASTER_PASSWORD_REQUIRED');
    });
  });

  // =========================================================================
  // deleteCredential (masterAuth)
  // =========================================================================

  describe('deleteCredential', () => {
    it('calls DELETE /v1/wallets/:id/credentials/:ref with masterAuth', async () => {
      const client = new WAIaaSClient({ baseUrl: 'http://localhost:3100', masterPassword: 'test-pw' });
      fetchSpy.mockResolvedValue(mockResponse({ deleted: true }));

      const result = await client.deleteCredential('w1', 'api-key');

      expect(result).toEqual({ deleted: true });
      const calledUrl = fetchSpy.mock.calls[0]![0] as string;
      expect(calledUrl).toBe('http://localhost:3100/v1/wallets/w1/credentials/api-key');
      const opts = fetchSpy.mock.calls[0]![1] as RequestInit;
      expect(opts.method).toBe('DELETE');
      expect((opts.headers as Record<string, string>)['X-Master-Password']).toBe('test-pw');
    });
  });

  // =========================================================================
  // rotateCredential (masterAuth)
  // =========================================================================

  describe('rotateCredential', () => {
    it('calls PUT /v1/wallets/:id/credentials/:ref/rotate with masterAuth and new value', async () => {
      const client = new WAIaaSClient({ baseUrl: 'http://localhost:3100', masterPassword: 'test-pw' });
      const rotated = { id: 'c2', name: 'hmac-secret', type: 'hmac', walletId: 'w1', expiresAt: null, createdAt: 2000, updatedAt: 3000 };
      fetchSpy.mockResolvedValue(mockResponse(rotated));

      const result = await client.rotateCredential('w1', 'hmac-secret', 'new-secret-val');

      expect(result).toEqual(rotated);
      const calledUrl = fetchSpy.mock.calls[0]![0] as string;
      expect(calledUrl).toBe('http://localhost:3100/v1/wallets/w1/credentials/hmac-secret/rotate');
      const opts = fetchSpy.mock.calls[0]![1] as RequestInit;
      expect(opts.method).toBe('PUT');
      expect((opts.headers as Record<string, string>)['X-Master-Password']).toBe('test-pw');
      const body = JSON.parse(opts.body as string) as Record<string, unknown>;
      expect(body['value']).toBe('new-secret-val');
    });
  });
});
