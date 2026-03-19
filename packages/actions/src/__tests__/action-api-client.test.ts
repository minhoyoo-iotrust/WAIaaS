/**
 * ActionApiClient debug logging tests (#412).
 * Verifies request/response logging at debug level and schema failure logging at error level.
 */
import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { z } from 'zod';
import type { ILogger } from '@waiaas/core';
import { ActionApiClient } from '../common/action-api-client.js';

const BASE_URL = 'http://test-api.local';
const TestSchema = z.object({ id: z.number(), name: z.string() });

function createMockLogger(): ILogger & { calls: Record<string, Array<[string, Record<string, unknown>?]>> } {
  const calls: Record<string, Array<[string, Record<string, unknown>?]>> = {
    debug: [], info: [], warn: [], error: [],
  };
  return {
    calls,
    debug: vi.fn((msg, ctx) => calls.debug.push([msg, ctx])),
    info: vi.fn((msg, ctx) => calls.info.push([msg, ctx])),
    warn: vi.fn((msg, ctx) => calls.warn.push([msg, ctx])),
    error: vi.fn((msg, ctx) => calls.error.push([msg, ctx])),
  };
}

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe('ActionApiClient logging (#412)', () => {
  describe('GET', () => {
    it('logs request and response on success', async () => {
      server.use(
        http.get(`${BASE_URL}/items`, () =>
          HttpResponse.json({ id: 1, name: 'test' }),
        ),
      );
      const logger = createMockLogger();
      const client = new ActionApiClient(BASE_URL, 5000, {}, logger);
      await client.get('items', TestSchema, { foo: 'bar' });

      expect(logger.debug).toHaveBeenCalledTimes(2);
      expect(logger.calls.debug[0]![0]).toContain('GET items');
      expect(logger.calls.debug[0]![1]).toEqual({ params: { foo: 'bar' } });
      expect(logger.calls.debug[1]![0]).toContain('GET items');
      expect(logger.calls.debug[1]![1]).toHaveProperty('response');
    });

    it('logs error on schema validation failure with raw response', async () => {
      server.use(
        http.get(`${BASE_URL}/bad`, () =>
          HttpResponse.json({ unexpected: true }),
        ),
      );
      const logger = createMockLogger();
      const client = new ActionApiClient(BASE_URL, 5000, {}, logger);
      await expect(client.get('bad', TestSchema)).rejects.toThrow();

      expect(logger.error).toHaveBeenCalledTimes(1);
      expect(logger.calls.error[0]![0]).toContain('schema validation failed');
      expect(logger.calls.error[0]![1]).toHaveProperty('response', { unexpected: true });
    });

    it('logs on HTTP error', async () => {
      server.use(
        http.get(`${BASE_URL}/err`, () =>
          new HttpResponse('Server Error', { status: 500 }),
        ),
      );
      const logger = createMockLogger();
      const client = new ActionApiClient(BASE_URL, 5000, {}, logger);
      await expect(client.get('err', TestSchema)).rejects.toThrow(/API error 500/);

      expect(logger.debug).toHaveBeenCalledTimes(2); // request + error response
      expect(logger.calls.debug[1]![0]).toContain('500');
    });

    it('logs on rate limit (429)', async () => {
      server.use(
        http.get(`${BASE_URL}/limited`, () =>
          new HttpResponse('Too Many Requests', { status: 429 }),
        ),
      );
      const logger = createMockLogger();
      const client = new ActionApiClient(BASE_URL, 5000, {}, logger);
      await expect(client.get('limited', TestSchema)).rejects.toThrow(/Rate limited/);

      expect(logger.calls.debug[1]![0]).toContain('429');
    });
  });

  describe('POST', () => {
    it('logs request body and response on success', async () => {
      server.use(
        http.post(`${BASE_URL}/create`, () =>
          HttpResponse.json({ id: 2, name: 'created' }),
        ),
      );
      const logger = createMockLogger();
      const client = new ActionApiClient(BASE_URL, 5000, {}, logger);
      await client.post('create', { foo: 'bar' }, TestSchema);

      expect(logger.debug).toHaveBeenCalledTimes(2);
      expect(logger.calls.debug[0]![0]).toContain('POST create');
      expect(logger.calls.debug[0]![1]).toEqual({ request: { foo: 'bar' } });
      expect(logger.calls.debug[1]![1]).toHaveProperty('response');
    });

    it('logs error on schema validation failure with request and response', async () => {
      server.use(
        http.post(`${BASE_URL}/bad`, () =>
          HttpResponse.json({ wrong: 'shape' }),
        ),
      );
      const logger = createMockLogger();
      const client = new ActionApiClient(BASE_URL, 5000, {}, logger);
      await expect(client.post('bad', { input: 1 }, TestSchema)).rejects.toThrow();

      expect(logger.error).toHaveBeenCalledTimes(1);
      const errorCtx = logger.calls.error[0]![1];
      expect(errorCtx).toHaveProperty('request', { input: 1 });
      expect(errorCtx).toHaveProperty('response', { wrong: 'shape' });
    });

    it('logs on HTTP error with request body', async () => {
      server.use(
        http.post(`${BASE_URL}/fail`, () =>
          new HttpResponse('Bad Request', { status: 400 }),
        ),
      );
      const logger = createMockLogger();
      const client = new ActionApiClient(BASE_URL, 5000, {}, logger);
      await expect(client.post('fail', { data: 'x' }, TestSchema)).rejects.toThrow(/API error 400/);

      expect(logger.calls.debug[1]![1]).toHaveProperty('request', { data: 'x' });
    });
  });

  describe('without logger', () => {
    it('GET works without logger (backward compatible)', async () => {
      server.use(
        http.get(`${BASE_URL}/items`, () =>
          HttpResponse.json({ id: 1, name: 'test' }),
        ),
      );
      const client = new ActionApiClient(BASE_URL);
      const result = await client.get('items', TestSchema);
      expect(result).toEqual({ id: 1, name: 'test' });
    });

    it('POST works without logger (backward compatible)', async () => {
      server.use(
        http.post(`${BASE_URL}/create`, () =>
          HttpResponse.json({ id: 2, name: 'ok' }),
        ),
      );
      const client = new ActionApiClient(BASE_URL);
      const result = await client.post('create', {}, TestSchema);
      expect(result).toEqual({ id: 2, name: 'ok' });
    });
  });
});
