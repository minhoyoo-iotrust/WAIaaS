import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { HttpClient } from '../internal/http.js';
import { WAIaaSError } from '../error.js';

describe('HttpClient coverage tests', () => {
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // =========================================================================
  // setBaseUrl (line 25-26)
  // =========================================================================

  describe('setBaseUrl', () => {
    it('updates the base URL for subsequent requests', async () => {
      const client = new HttpClient('http://old.example.com', 5000);
      client.setBaseUrl('http://new.example.com');
      fetchSpy.mockResolvedValue(
        new Response(JSON.stringify({ ok: true }), { status: 200 }),
      );
      await client.get('/test');
      expect(fetchSpy.mock.calls[0]![0]).toBe('http://new.example.com/test');
    });
  });

  // =========================================================================
  // TypeError from fetch (network error) -- lines 73-82
  // =========================================================================

  describe('network error (TypeError)', () => {
    it('wraps TypeError as NETWORK_ERROR', async () => {
      fetchSpy.mockRejectedValue(new TypeError('Failed to fetch'));
      const client = new HttpClient('http://localhost:3100', 5000);
      try {
        await client.get('/test');
        expect.fail('Should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(WAIaaSError);
        const waErr = err as WAIaaSError;
        expect(waErr.code).toBe('NETWORK_ERROR');
        expect(waErr.message).toBe('Failed to fetch');
        expect(waErr.retryable).toBe(true);
      }
    });
  });

  // =========================================================================
  // AbortError timeout
  // =========================================================================

  describe('timeout (AbortError)', () => {
    it('wraps AbortError as REQUEST_TIMEOUT', async () => {
      fetchSpy.mockRejectedValue(
        new DOMException('The operation was aborted', 'AbortError'),
      );
      const client = new HttpClient('http://localhost:3100', 100);
      try {
        await client.get('/test');
        expect.fail('Should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(WAIaaSError);
        expect((err as WAIaaSError).code).toBe('REQUEST_TIMEOUT');
      }
    });
  });

  // =========================================================================
  // Non-OK response with non-JSON body (json catch path)
  // =========================================================================

  describe('non-JSON error response', () => {
    it('handles non-JSON error body gracefully', async () => {
      fetchSpy.mockResolvedValue(
        new Response('Internal Server Error', {
          status: 500,
          headers: { 'Content-Type': 'text/plain' },
        }),
      );
      const client = new HttpClient('http://localhost:3100', 5000);
      try {
        await client.get('/test');
        expect.fail('Should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(WAIaaSError);
        const waErr = err as WAIaaSError;
        expect(waErr.status).toBe(500);
      }
    });
  });

  // =========================================================================
  // Unknown error type re-thrown
  // =========================================================================

  describe('unknown error', () => {
    it('re-throws non-TypeError non-DOMException errors', async () => {
      fetchSpy.mockRejectedValue(new Error('something weird'));
      const client = new HttpClient('http://localhost:3100', 5000);
      await expect(client.get('/test')).rejects.toThrow('something weird');
    });
  });

  // =========================================================================
  // PUT method
  // =========================================================================

  describe('put method', () => {
    it('sends PUT request', async () => {
      fetchSpy.mockResolvedValue(
        new Response(JSON.stringify({ updated: true }), { status: 200 }),
      );
      const client = new HttpClient('http://localhost:3100', 5000);
      const result = await client.put<{ updated: boolean }>('/update', { key: 'value' });
      expect(result.updated).toBe(true);
      expect(fetchSpy.mock.calls[0]![1].method).toBe('PUT');
    });
  });

  // =========================================================================
  // DELETE method
  // =========================================================================

  describe('delete method', () => {
    it('sends DELETE request', async () => {
      fetchSpy.mockResolvedValue(
        new Response(JSON.stringify({ deleted: true }), { status: 200 }),
      );
      const client = new HttpClient('http://localhost:3100', 5000);
      const result = await client.delete<{ deleted: boolean }>('/resource');
      expect(result.deleted).toBe(true);
      expect(fetchSpy.mock.calls[0]![1].method).toBe('DELETE');
    });
  });

  // =========================================================================
  // Request with custom headers
  // =========================================================================

  describe('custom headers', () => {
    it('merges custom headers with defaults', async () => {
      fetchSpy.mockResolvedValue(
        new Response(JSON.stringify({}), { status: 200 }),
      );
      const client = new HttpClient('http://localhost:3100', 5000);
      await client.get('/test', { 'X-Custom': 'value' });
      const headers = fetchSpy.mock.calls[0]![1].headers;
      expect(headers['X-Custom']).toBe('value');
      expect(headers['User-Agent']).toBeDefined();
    });
  });

  // =========================================================================
  // Request with external signal
  // =========================================================================

  describe('external signal', () => {
    it('uses provided signal over internal AbortController', async () => {
      const controller = new AbortController();
      fetchSpy.mockResolvedValue(
        new Response(JSON.stringify({}), { status: 200 }),
      );
      const client = new HttpClient('http://localhost:3100', 5000);
      await client.request('GET', '/test', { signal: controller.signal });
      expect(fetchSpy.mock.calls[0]![1].signal).toBe(controller.signal);
    });
  });
});
