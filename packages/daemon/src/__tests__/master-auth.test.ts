/**
 * masterAuth middleware tests: X-Master-Password header validation via Argon2id.
 *
 * Tests cover:
 * 1. rejects with 401 INVALID_MASTER_PASSWORD when X-Master-Password header missing
 * 2. rejects with 401 INVALID_MASTER_PASSWORD when password is wrong
 * 3. passes through when correct master password provided
 *
 * Uses Hono app.request() testing pattern.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { Hono } from 'hono';
import argon2 from 'argon2';
import { createMasterAuth } from '../api/middleware/master-auth.js';
import { errorHandler } from '../api/middleware/error-handler.js';

// ---------------------------------------------------------------------------
// Test setup
// ---------------------------------------------------------------------------

const TEST_PASSWORD = 'test-master-password-1234';
let passwordHash: string;

/** Type-safe JSON body extraction from Response. */
async function json(res: Response): Promise<Record<string, unknown>> {
  return (await res.json()) as Record<string, unknown>;
}

beforeAll(async () => {
  // Hash the test password once (Argon2id)
  passwordHash = await argon2.hash(TEST_PASSWORD, {
    type: argon2.argon2id,
    memoryCost: 4096, // Lower for test speed
    timeCost: 2,
    parallelism: 1,
  });
});

/** Create a test app with masterAuth middleware and a protected route */
function createTestApp(hash: string) {
  const app = new Hono();
  app.onError(errorHandler);
  app.use('/protected/*', createMasterAuth({ masterPasswordHash: hash }));
  app.get('/protected/data', (c) => c.json({ ok: true }));
  return app;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('masterAuth middleware', () => {
  it('rejects with 401 INVALID_MASTER_PASSWORD when X-Master-Password header missing', async () => {
    const app = createTestApp(passwordHash);

    const res = await app.request('/protected/data');
    expect(res.status).toBe(401);

    const body = await json(res);
    expect(body.code).toBe('INVALID_MASTER_PASSWORD');
  });

  it('rejects with 401 INVALID_MASTER_PASSWORD when password is wrong', async () => {
    const app = createTestApp(passwordHash);

    const res = await app.request('/protected/data', {
      headers: { 'X-Master-Password': 'wrong-password' },
    });
    expect(res.status).toBe(401);

    const body = await json(res);
    expect(body.code).toBe('INVALID_MASTER_PASSWORD');
  });

  it('passes through when correct master password provided', async () => {
    const app = createTestApp(passwordHash);

    const res = await app.request('/protected/data', {
      headers: { 'X-Master-Password': TEST_PASSWORD },
    });
    expect(res.status).toBe(200);

    const body = await json(res);
    expect(body.ok).toBe(true);
  });
});
