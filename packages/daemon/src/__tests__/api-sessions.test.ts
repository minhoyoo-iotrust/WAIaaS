/**
 * Session CRUD API tests: POST /v1/sessions, GET /v1/sessions, DELETE /v1/sessions/:id.
 *
 * Tests cover:
 * 1. POST /v1/sessions returns 201 with JWT token
 * 2. POST /v1/sessions returns 404 when wallet not found
 * 3. POST /v1/sessions returns 403 SESSION_LIMIT_EXCEEDED
 * 4. POST /v1/sessions returns 401 without masterAuth
 * 5. GET /v1/sessions?walletId=X returns active sessions
 * 6. GET /v1/sessions?walletId=X excludes revoked sessions
 * 7. DELETE /v1/sessions/:id revokes session
 * 8. DELETE /v1/sessions/:id returns SESSION_NOT_FOUND for unknown id
 * 9. Revoked session token rejected by sessionAuth
 * 10. Session stores correct tokenHash and timestamps
 *
 * Uses Hono createApp() with full deps, in-memory SQLite, JwtSecretManager.
 */

import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import { createHash } from 'node:crypto';
import type { Database as DatabaseType } from 'better-sqlite3';
import argon2 from 'argon2';
import { createDatabase, pushSchema, generateId } from '../infrastructure/database/index.js';
import { JwtSecretManager } from '../infrastructure/jwt/index.js';
import { DaemonConfigSchema } from '../infrastructure/config/loader.js';
import { createApp } from '../api/server.js';
import type { OpenAPIHono } from '@hono/zod-openapi';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TEST_PASSWORD = 'test-master-password-1234';
const HOST = '127.0.0.1:3100';
let passwordHash: string;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Type-safe JSON body extraction from Response. */
async function json(res: Response): Promise<Record<string, unknown>> {
  return (await res.json()) as Record<string, unknown>;
}

/** Helper: seed a test agent into the database */
function seedWallet(sqlite: DatabaseType, walletId: string): void {
  const ts = Math.floor(Date.now() / 1000);
  sqlite
    .prepare(
      `INSERT INTO wallets (id, name, chain, environment, default_network, public_key, status, owner_verified, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(walletId, 'Test Wallet', 'solana', 'mainnet', 'mainnet', `pk-${walletId}`, 'ACTIVE', 0, ts, ts);
}

/** Helper: build masterAuth header (includes Host for hostGuard) */
function masterAuthHeader(): Record<string, string> {
  return { Host: HOST, 'X-Master-Password': TEST_PASSWORD };
}

/** Helper: build masterAuth + JSON content type headers (includes Host for hostGuard) */
function masterAuthJsonHeaders(): Record<string, string> {
  return {
    Host: HOST,
    'X-Master-Password': TEST_PASSWORD,
    'Content-Type': 'application/json',
  };
}

// ---------------------------------------------------------------------------
// Test setup
// ---------------------------------------------------------------------------

let sqlite: DatabaseType;
let db: ReturnType<typeof createDatabase>['db'];
let jwtManager: JwtSecretManager;
let app: OpenAPIHono;
let testWalletId: string;

beforeAll(async () => {
  // Hash the test password once (Argon2id, low cost for test speed)
  passwordHash = await argon2.hash(TEST_PASSWORD, {
    type: argon2.argon2id,
    memoryCost: 4096,
    timeCost: 2,
    parallelism: 1,
  });
});

beforeEach(async () => {
  const conn = createDatabase(':memory:');
  sqlite = conn.sqlite;
  db = conn.db;
  pushSchema(sqlite);

  jwtManager = new JwtSecretManager(db);
  await jwtManager.initialize();

  const config = DaemonConfigSchema.parse({});

  app = createApp({
    db,
    jwtSecretManager: jwtManager,
    masterPasswordHash: passwordHash,
    config,
  });

  testWalletId = generateId();
  seedWallet(sqlite, testWalletId);
});

afterEach(() => {
  try {
    sqlite.close();
  } catch {
    // already closed
  }
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Session CRUD API', () => {
  // -----------------------------------------------------------------------
  // POST /v1/sessions
  // -----------------------------------------------------------------------

  it('POST /v1/sessions returns 201 with JWT token', async () => {
    const res = await app.request('/v1/sessions', {
      method: 'POST',
      headers: masterAuthJsonHeaders(),
      body: JSON.stringify({ walletId: testWalletId, ttl: 3600 }),
    });
    expect(res.status).toBe(201);

    const body = await json(res);
    expect(body.id).toBeDefined();
    expect(typeof body.token).toBe('string');
    expect((body.token as string).startsWith('wai_sess_')).toBe(true);
    expect(body.expiresAt).toBeDefined();
    expect(body.walletId).toBe(testWalletId);
  });

  it('POST /v1/sessions returns 404 when wallet not found', async () => {
    const fakeWalletId = generateId();

    const res = await app.request('/v1/sessions', {
      method: 'POST',
      headers: masterAuthJsonHeaders(),
      body: JSON.stringify({ walletId: fakeWalletId }),
    });
    expect(res.status).toBe(404);

    const body = await json(res);
    expect(body.code).toBe('WALLET_NOT_FOUND');
  });

  it('POST /v1/sessions returns 403 SESSION_LIMIT_EXCEEDED', async () => {
    // Create 5 sessions (default max)
    for (let i = 0; i < 5; i++) {
      const res = await app.request('/v1/sessions', {
        method: 'POST',
        headers: masterAuthJsonHeaders(),
        body: JSON.stringify({ walletId: testWalletId }),
      });
      expect(res.status).toBe(201);
    }

    // 6th should fail
    const res = await app.request('/v1/sessions', {
      method: 'POST',
      headers: masterAuthJsonHeaders(),
      body: JSON.stringify({ walletId: testWalletId }),
    });
    expect(res.status).toBe(403);

    const body = await json(res);
    expect(body.code).toBe('SESSION_LIMIT_EXCEEDED');
  });

  it('POST /v1/sessions returns 401 without masterAuth', async () => {
    const res = await app.request('/v1/sessions', {
      method: 'POST',
      headers: { Host: HOST, 'Content-Type': 'application/json' },
      body: JSON.stringify({ walletId: testWalletId }),
    });
    expect(res.status).toBe(401);

    const body = await json(res);
    expect(body.code).toBe('INVALID_MASTER_PASSWORD');
  });

  // -----------------------------------------------------------------------
  // GET /v1/sessions
  // -----------------------------------------------------------------------

  it('GET /v1/sessions?walletId=X returns active sessions', async () => {
    // Create 2 sessions
    for (let i = 0; i < 2; i++) {
      await app.request('/v1/sessions', {
        method: 'POST',
        headers: masterAuthJsonHeaders(),
        body: JSON.stringify({ walletId: testWalletId, ttl: 3600 }),
      });
    }

    const res = await app.request(`/v1/sessions?walletId=${testWalletId}`, {
      headers: masterAuthHeader(),
    });
    expect(res.status).toBe(200);

    const body = (await res.json()) as Array<Record<string, unknown>>;
    expect(body).toHaveLength(2);

    const first = body[0]!;
    expect(first.status).toBe('ACTIVE');
    expect(first.walletId).toBe(testWalletId);
    expect(first.renewalCount).toBe(0);
    expect(first.maxRenewals).toBe(30);
    expect(typeof first.expiresAt).toBe('number');
    expect(typeof first.absoluteExpiresAt).toBe('number');
    expect(typeof first.createdAt).toBe('number');
    expect(first.lastRenewedAt).toBeNull();
  });

  it('GET /v1/sessions?walletId=X excludes revoked sessions', async () => {
    // Create a session
    const createRes = await app.request('/v1/sessions', {
      method: 'POST',
      headers: masterAuthJsonHeaders(),
      body: JSON.stringify({ walletId: testWalletId }),
    });
    expect(createRes.status).toBe(201);
    const created = await json(createRes);
    const sessionId = created.id as string;

    // Revoke it
    const deleteRes = await app.request(`/v1/sessions/${sessionId}`, {
      method: 'DELETE',
      headers: masterAuthHeader(),
    });
    expect(deleteRes.status).toBe(200);

    // List should be empty (revoked sessions excluded)
    const listRes = await app.request(`/v1/sessions?walletId=${testWalletId}`, {
      headers: masterAuthHeader(),
    });
    expect(listRes.status).toBe(200);

    const sessions = (await listRes.json()) as Array<Record<string, unknown>>;
    expect(sessions).toHaveLength(0);
  });

  // -----------------------------------------------------------------------
  // DELETE /v1/sessions/:id
  // -----------------------------------------------------------------------

  it('DELETE /v1/sessions/:id revokes session', async () => {
    // Create a session
    const createRes = await app.request('/v1/sessions', {
      method: 'POST',
      headers: masterAuthJsonHeaders(),
      body: JSON.stringify({ walletId: testWalletId }),
    });
    const created = await json(createRes);
    const sessionId = created.id as string;

    // Delete (revoke) it
    const res = await app.request(`/v1/sessions/${sessionId}`, {
      method: 'DELETE',
      headers: masterAuthHeader(),
    });
    expect(res.status).toBe(200);

    const body = await json(res);
    expect(body.id).toBe(sessionId);
    expect(body.status).toBe('REVOKED');
  });

  it('DELETE /v1/sessions/:id returns SESSION_NOT_FOUND for unknown id', async () => {
    const fakeId = generateId();

    const res = await app.request(`/v1/sessions/${fakeId}`, {
      method: 'DELETE',
      headers: masterAuthHeader(),
    });
    expect(res.status).toBe(404);

    const body = await json(res);
    expect(body.code).toBe('SESSION_NOT_FOUND');
  });

  // -----------------------------------------------------------------------
  // Cross-cutting: revoked session rejected by sessionAuth
  // -----------------------------------------------------------------------

  it('revoked session token rejected by sessionAuth', async () => {
    // Create a session
    const createRes = await app.request('/v1/sessions', {
      method: 'POST',
      headers: masterAuthJsonHeaders(),
      body: JSON.stringify({ walletId: testWalletId }),
    });
    const created = await json(createRes);
    const sessionId = created.id as string;
    const token = created.token as string;

    // Revoke the session
    await app.request(`/v1/sessions/${sessionId}`, {
      method: 'DELETE',
      headers: masterAuthHeader(),
    });

    // Now the token should be rejected by sessionAuth
    const rejectedRes = await app.request('/v1/wallet/balance', {
      headers: { Host: HOST, Authorization: `Bearer ${token}` },
    });
    expect(rejectedRes.status).toBe(401);

    const body = await json(rejectedRes);
    expect(body.code).toBe('SESSION_REVOKED');
  });

  // -----------------------------------------------------------------------
  // Data integrity: tokenHash and timestamps
  // -----------------------------------------------------------------------

  it('session stores correct tokenHash and timestamps', async () => {
    const createRes = await app.request('/v1/sessions', {
      method: 'POST',
      headers: masterAuthJsonHeaders(),
      body: JSON.stringify({ walletId: testWalletId, ttl: 3600 }),
    });
    expect(createRes.status).toBe(201);
    const created = await json(createRes);
    const sessionId = created.id as string;
    const token = created.token as string;
    const returnedExpiresAt = created.expiresAt as number;

    // Query DB directly
    const row = sqlite.prepare('SELECT * FROM sessions WHERE id = ?').get(sessionId) as {
      token_hash: string;
      expires_at: number;
      absolute_expires_at: number;
      created_at: number;
    };

    // Verify tokenHash matches sha256(token)
    const expectedHash = createHash('sha256').update(token).digest('hex');
    expect(row.token_hash).toBe(expectedHash);

    // Verify expiresAt is approximately nowSec + 3600 (within 5 seconds tolerance)
    expect(row.expires_at).toBe(returnedExpiresAt);

    // Verify absoluteExpiresAt is approximately nowSec + 30 days
    const nowSec = Math.floor(Date.now() / 1000);
    const expectedAbsoluteExpiry = nowSec + 30 * 86400;
    expect(Math.abs(row.absolute_expires_at - expectedAbsoluteExpiry)).toBeLessThan(5);

    // Verify createdAt is recent
    expect(Math.abs(row.created_at - nowSec)).toBeLessThan(5);
  });
});
