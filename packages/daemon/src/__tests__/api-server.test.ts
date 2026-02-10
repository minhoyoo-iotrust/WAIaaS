/**
 * Tests for Hono API server: middleware + routes.
 *
 * Uses Hono's app.request() for testing (no real HTTP server needed).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Hono } from 'hono';
import { createApp } from '../api/server.js';
import { requestId } from '../api/middleware/request-id.js';
import { errorHandler } from '../api/middleware/error-handler.js';
import { WAIaaSError } from '@waiaas/core';
import { z } from 'zod';

// ---------------------------------------------------------------------------
// Helper: create a minimal app with specific middleware for isolated testing
// ---------------------------------------------------------------------------

function createTestApp() {
  return createApp();
}

/** Type-safe JSON body extraction from Response. */
async function json(res: Response): Promise<Record<string, unknown>> {
  return (await res.json()) as Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// requestId middleware (3 tests)
// ---------------------------------------------------------------------------

describe('requestId middleware', () => {
  it('should include X-Request-Id header in response', async () => {
    const app = createTestApp();
    const res = await app.request('/health', {
      headers: { Host: '127.0.0.1:3100' },
    });

    expect(res.status).toBe(200);
    const rid = res.headers.get('X-Request-Id');
    expect(rid).toBeTruthy();
    expect(typeof rid).toBe('string');
  });

  it('should echo client-provided X-Request-Id', async () => {
    const app = createTestApp();
    const clientId = 'my-custom-request-id-123';
    const res = await app.request('/health', {
      headers: {
        Host: '127.0.0.1:3100',
        'X-Request-Id': clientId,
      },
    });

    expect(res.status).toBe(200);
    expect(res.headers.get('X-Request-Id')).toBe(clientId);
  });

  it('should generate UUID-format ID when no client ID provided', async () => {
    const app = createTestApp();
    const res = await app.request('/health', {
      headers: { Host: '127.0.0.1:3100' },
    });

    const rid = res.headers.get('X-Request-Id');
    expect(rid).toBeTruthy();
    // UUID v7 format: 8-4-4-4-12 hex chars
    expect(rid).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });
});

// ---------------------------------------------------------------------------
// hostGuard middleware (3 tests)
// ---------------------------------------------------------------------------

describe('hostGuard middleware', () => {
  it('should allow requests with Host: 127.0.0.1:3100', async () => {
    const app = createTestApp();
    const res = await app.request('/health', {
      headers: { Host: '127.0.0.1:3100' },
    });

    expect(res.status).toBe(200);
  });

  it('should allow requests with Host: localhost:3100', async () => {
    const app = createTestApp();
    const res = await app.request('/health', {
      headers: { Host: 'localhost:3100' },
    });

    expect(res.status).toBe(200);
  });

  it('should reject requests with Host: evil.com with 503', async () => {
    const app = createTestApp();
    const res = await app.request('/health', {
      headers: { Host: 'evil.com' },
    });

    expect(res.status).toBe(503); // SYSTEM_LOCKED httpStatus
    const body = await json(res);
    expect(body.code).toBe('SYSTEM_LOCKED');
    expect(body.message).toBe('Only localhost access allowed');
  });
});

// ---------------------------------------------------------------------------
// killSwitchGuard middleware (3 tests)
// ---------------------------------------------------------------------------

describe('killSwitchGuard middleware', () => {
  it('should pass through when state is NORMAL', async () => {
    const app = createApp({ getKillSwitchState: () => 'NORMAL' });
    const res = await app.request('/health', {
      headers: { Host: '127.0.0.1:3100' },
    });

    expect(res.status).toBe(200);
  });

  it('should reject non-health routes when state is ACTIVATED with 409', async () => {
    const app = createApp({ getKillSwitchState: () => 'ACTIVATED' });

    // Add a test route beyond /health
    app.get('/test', (c) => c.json({ ok: true }));

    const res = await app.request('/test', {
      headers: { Host: '127.0.0.1:3100' },
    });

    expect(res.status).toBe(409);
    const body = await json(res);
    expect(body.code).toBe('KILL_SWITCH_ACTIVE');
  });

  it('should bypass kill switch for /health even when ACTIVATED', async () => {
    const app = createApp({ getKillSwitchState: () => 'ACTIVATED' });
    const res = await app.request('/health', {
      headers: { Host: '127.0.0.1:3100' },
    });

    expect(res.status).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// errorHandler (4 tests)
// ---------------------------------------------------------------------------

describe('errorHandler', () => {
  it('should respond with WAIaaSError httpStatus and toJSON()', async () => {
    const app = new Hono();
    app.use('*', requestId);
    app.onError(errorHandler);
    app.get('/err', () => {
      throw new WAIaaSError('AGENT_NOT_FOUND', {
        message: 'Agent xyz not found',
      });
    });

    const res = await app.request('/err');

    expect(res.status).toBe(404);
    const body = await json(res);
    expect(body.code).toBe('AGENT_NOT_FOUND');
    expect(body.message).toBe('Agent xyz not found');
    expect(body.retryable).toBe(false);
  });

  it('should respond with 500 for generic Error', async () => {
    const app = new Hono();
    app.use('*', requestId);
    app.onError(errorHandler);
    app.get('/err', () => {
      throw new Error('Something unexpected happened');
    });

    const res = await app.request('/err');

    expect(res.status).toBe(500);
    const body = await json(res);
    expect(body.code).toBe('SYSTEM_LOCKED');
    expect(body.message).toBe('Something unexpected happened');
    expect(body.retryable).toBe(false);
  });

  it('should include requestId in error response', async () => {
    const app = new Hono();
    app.use('*', requestId);
    app.onError(errorHandler);
    app.get('/err', () => {
      throw new Error('test');
    });

    const clientId = 'test-req-id-456';
    const res = await app.request('/err', {
      headers: { 'X-Request-Id': clientId },
    });

    const body = await json(res);
    expect(body.requestId).toBe(clientId);
  });

  it('should respond with 400 for ZodError', async () => {
    const app = new Hono();
    app.use('*', requestId);
    app.onError(errorHandler);
    app.get('/err', () => {
      const schema = z.object({ name: z.string(), age: z.number() });
      schema.parse({ name: 123, age: 'not-a-number' });
      // unreachable
      return new Response('ok');
    });

    const res = await app.request('/err');

    expect(res.status).toBe(400);
    const body = await json(res);
    expect(body.code).toBe('ACTION_VALIDATION_FAILED');
    expect(body.message).toBe('Validation error');
    const details = body.details as Record<string, unknown>;
    const issues = details.issues as unknown[];
    expect(issues).toBeInstanceOf(Array);
    expect(issues.length).toBe(2);
    expect(body.retryable).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// health route (3 tests)
// ---------------------------------------------------------------------------

describe('health route', () => {
  it('should return 200 for GET /health', async () => {
    const app = createTestApp();
    const res = await app.request('/health', {
      headers: { Host: '127.0.0.1:3100' },
    });

    expect(res.status).toBe(200);
  });

  it('should return body with status, version, uptime, timestamp', async () => {
    const app = createTestApp();
    const res = await app.request('/health', {
      headers: { Host: '127.0.0.1:3100' },
    });

    const body = await json(res);
    expect(body.status).toBe('ok');
    expect(body.version).toBe('0.0.0');
    expect(typeof body.uptime).toBe('number');
    expect(typeof body.timestamp).toBe('number');
  });

  it('should return timestamp in Unix seconds (not milliseconds)', async () => {
    const app = createTestApp();
    const res = await app.request('/health', {
      headers: { Host: '127.0.0.1:3100' },
    });

    const body = await json(res);
    const timestamp = body.timestamp as number;
    // Unix seconds should be approximately current time / 1000
    // Milliseconds would be ~1.7e12, seconds should be ~1.7e9
    expect(timestamp).toBeLessThan(1e11); // Less than 100 billion = seconds
    expect(timestamp).toBeGreaterThan(1e9); // Greater than 1 billion = after year 2001
  });
});

// ---------------------------------------------------------------------------
// requestLogger middleware (1 test)
// ---------------------------------------------------------------------------

describe('requestLogger middleware', () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  it('should log method, path, and status', async () => {
    const app = createTestApp();
    await app.request('/health', {
      headers: { Host: '127.0.0.1:3100' },
    });

    // requestLogger calls console.log with [REQ] format
    const logCalls = consoleSpy.mock.calls.map((args) => args[0] as string);
    const reqLog = logCalls.find((msg) => typeof msg === 'string' && msg.startsWith('[REQ]'));

    expect(reqLog).toBeTruthy();
    expect(reqLog).toContain('GET');
    expect(reqLog).toContain('/health');
    expect(reqLog).toContain('200');
    expect(reqLog).toMatch(/\d+ms$/);
  });
});

// ---------------------------------------------------------------------------
// createApp integration (2 tests)
// ---------------------------------------------------------------------------

describe('createApp integration', () => {
  it('should return a Hono instance', () => {
    const app = createApp();
    expect(app).toBeDefined();
    expect(typeof app.fetch).toBe('function');
    expect(typeof app.request).toBe('function');
  });

  it('should return 404 for unknown routes', async () => {
    const app = createTestApp();
    const res = await app.request('/nonexistent', {
      headers: { Host: '127.0.0.1:3100' },
    });

    expect(res.status).toBe(404);
  });
});
