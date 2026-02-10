import { describe, it, expect } from 'vitest';
import { WAIaaSError } from '../error.js';

describe('WAIaaSError', () => {
  describe('constructor', () => {
    it('should create an error with all properties', () => {
      const error = new WAIaaSError({
        code: 'AUTH_FAILED',
        message: 'Authentication failed',
        status: 401,
        retryable: false,
        details: { reason: 'expired' },
        requestId: 'req-123',
        hint: 'Renew your session token',
      });

      expect(error.code).toBe('AUTH_FAILED');
      expect(error.message).toBe('Authentication failed');
      expect(error.status).toBe(401);
      expect(error.retryable).toBe(false);
      expect(error.details).toEqual({ reason: 'expired' });
      expect(error.requestId).toBe('req-123');
      expect(error.hint).toBe('Renew your session token');
    });

    it('should set name to WAIaaSError', () => {
      const error = new WAIaaSError({
        code: 'TEST',
        message: 'test',
        status: 500,
        retryable: true,
      });
      expect(error.name).toBe('WAIaaSError');
    });

    it('should be an instance of Error', () => {
      const error = new WAIaaSError({
        code: 'TEST',
        message: 'test',
        status: 500,
        retryable: true,
      });
      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(WAIaaSError);
    });
  });

  describe('isRetryable', () => {
    it('should return true when retryable is true', () => {
      const error = new WAIaaSError({
        code: 'RATE_LIMIT',
        message: 'Rate limited',
        status: 429,
        retryable: true,
      });
      expect(error.isRetryable).toBe(true);
    });

    it('should return false when retryable is false', () => {
      const error = new WAIaaSError({
        code: 'NOT_FOUND',
        message: 'Not found',
        status: 404,
        retryable: false,
      });
      expect(error.isRetryable).toBe(false);
    });
  });

  describe('fromResponse', () => {
    it('should parse a valid JSON error body', () => {
      const body = {
        code: 'AGENT_NOT_FOUND',
        message: 'Agent not found',
        retryable: false,
        details: { agentId: 'abc' },
        requestId: 'req-456',
        hint: 'Check the agent ID',
      };

      const error = WAIaaSError.fromResponse(body, 404);

      expect(error.code).toBe('AGENT_NOT_FOUND');
      expect(error.message).toBe('Agent not found');
      expect(error.status).toBe(404);
      expect(error.retryable).toBe(false);
      expect(error.details).toEqual({ agentId: 'abc' });
      expect(error.requestId).toBe('req-456');
      expect(error.hint).toBe('Check the agent ID');
    });

    it('should create fallback error for non-JSON body (null)', () => {
      const error = WAIaaSError.fromResponse(null, 503);

      expect(error.code).toBe('HTTP_503');
      expect(error.message).toBe('Request failed with status 503');
      expect(error.status).toBe(503);
      expect(error.retryable).toBe(true); // 503 >= 500
    });

    it('should create fallback error for non-object body', () => {
      const error = WAIaaSError.fromResponse('not json', 400);

      expect(error.code).toBe('HTTP_400');
      expect(error.message).toBe('Request failed with status 400');
      expect(error.status).toBe(400);
      expect(error.retryable).toBe(false); // 400 < 500
    });

    it('should use defaults for partial body (missing code/message)', () => {
      const body = { retryable: true };

      const error = WAIaaSError.fromResponse(body, 500);

      expect(error.code).toBe('HTTP_500');
      expect(error.message).toBe('Request failed with status 500');
      expect(error.status).toBe(500);
      expect(error.retryable).toBe(true);
    });

    it('should default retryable based on status when not in body', () => {
      // 4xx -> false
      const error4xx = WAIaaSError.fromResponse({ code: 'BAD' }, 400);
      expect(error4xx.retryable).toBe(false);

      // 5xx -> true
      const error5xx = WAIaaSError.fromResponse({ code: 'ERR' }, 502);
      expect(error5xx.retryable).toBe(true);
    });

    it('should handle body with non-object details gracefully', () => {
      const body = {
        code: 'TEST',
        message: 'test',
        details: 'not-an-object',
      };

      const error = WAIaaSError.fromResponse(body, 400);
      expect(error.details).toBeUndefined();
    });
  });

  describe('toJSON', () => {
    it('should serialize all properties', () => {
      const error = new WAIaaSError({
        code: 'AUTH_FAILED',
        message: 'Auth failed',
        status: 401,
        retryable: false,
        details: { key: 'val' },
        requestId: 'req-1',
        hint: 'Try again',
      });

      const json = error.toJSON();
      expect(json).toEqual({
        code: 'AUTH_FAILED',
        message: 'Auth failed',
        status: 401,
        retryable: false,
        details: { key: 'val' },
        requestId: 'req-1',
        hint: 'Try again',
      });
    });

    it('should omit undefined optional properties', () => {
      const error = new WAIaaSError({
        code: 'TEST',
        message: 'test',
        status: 500,
        retryable: true,
      });

      const json = error.toJSON();
      expect(json).toEqual({
        code: 'TEST',
        message: 'test',
        status: 500,
        retryable: true,
      });
      expect('details' in json).toBe(false);
      expect('requestId' in json).toBe(false);
      expect('hint' in json).toBe(false);
    });
  });

  describe('readonly properties', () => {
    it('should have all properties as readonly', () => {
      const error = new WAIaaSError({
        code: 'TEST',
        message: 'test',
        status: 500,
        retryable: true,
        hint: 'a hint',
      });

      // TypeScript enforces readonly at compile time.
      // At runtime, we verify the properties exist and have correct values.
      expect(error.code).toBe('TEST');
      expect(error.status).toBe(500);
      expect(error.retryable).toBe(true);
      expect(error.hint).toBe('a hint');
    });
  });
});
