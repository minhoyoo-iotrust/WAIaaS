/**
 * sessionAuth middleware tests: Authorization header validation, DB session lookup, context.
 *
 * Tests cover:
 * 1. returns 401 INVALID_TOKEN when no Authorization header
 * 2. returns 401 INVALID_TOKEN when Authorization header has wrong format
 * 3. returns 401 INVALID_TOKEN when token is malformed JWT
 * 4. returns 401 TOKEN_EXPIRED when token is expired
 * 5. returns 401 SESSION_REVOKED when session is revoked in DB
 * 6. returns 404 SESSION_NOT_FOUND when session ID not in DB
 * 7. passes through and sets sessionId/walletId when token is valid and session active
 * 8. succeeds with old secret during dual-key rotation window
 *
 * Uses Hono app.request() testing pattern + in-memory SQLite.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Hono } from 'hono';
import type { Database as DatabaseType } from 'better-sqlite3';
import { createDatabase, pushSchema, generateId } from '../infrastructure/database/index.js';
import { JwtSecretManager, type JwtPayload } from '../infrastructure/jwt/index.js';
import { createSessionAuth } from '../api/middleware/session-auth.js';
import { errorHandler } from '../api/middleware/error-handler.js';

// ---------------------------------------------------------------------------
// Test setup
// ---------------------------------------------------------------------------

let sqlite: DatabaseType;
let db: ReturnType<typeof createDatabase>['db'];
let manager: JwtSecretManager;
let app: Hono;

const TEST_WALLET_ID = generateId();
const TEST_SESSION_ID = generateId();

const nowSeconds = () => Math.floor(Date.now() / 1000);

/** Create a test app with sessionAuth middleware and a protected test route */
function createTestApp(jwtManager: JwtSecretManager, database: ReturnType<typeof createDatabase>['db']) {
  const testApp = new Hono();
  testApp.onError(errorHandler);
  testApp.use(
    '/protected/*',
    createSessionAuth({ jwtSecretManager: jwtManager, db: database }),
  );
  testApp.get('/protected/data', (c) => {
    const sessionId = c.get('sessionId' as never) as string | undefined;
    const walletId = c.get('walletId' as never) as string | undefined;
    return c.json({ sessionId, walletId, ok: true });
  });
  return testApp;
}

/** Helper: insert a test agent and session into the database */
function seedTestData(opts?: { revokedAt?: number }) {
  const ts = nowSeconds();
  sqlite.prepare(
    `INSERT INTO wallets (id, name, chain, network, public_key, status, owner_verified, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(TEST_WALLET_ID, 'Test Wallet', 'solana', 'mainnet', `pk-session-auth-${Math.random()}`, 'ACTIVE', 0, ts, ts);

  sqlite.prepare(
    `INSERT INTO sessions (id, wallet_id, token_hash, expires_at, absolute_expires_at, created_at, revoked_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    TEST_SESSION_ID,
    TEST_WALLET_ID,
    'test-token-hash',
    ts + 86400,
    ts + 86400 * 30,
    ts,
    opts?.revokedAt ?? null,
  );
}

/** Helper: sign a valid test token */
async function signTestToken(jwtManager: JwtSecretManager, overrides?: Partial<JwtPayload>) {
  const ts = nowSeconds();
  const payload: JwtPayload = {
    sub: TEST_SESSION_ID,
    wlt: TEST_WALLET_ID,
    iat: ts,
    exp: ts + 3600,
    ...overrides,
  };
  return jwtManager.signToken(payload);
}

/** Type-safe JSON body extraction from Response. */
async function json(res: Response): Promise<Record<string, unknown>> {
  return (await res.json()) as Record<string, unknown>;
}

beforeEach(async () => {
  const conn = createDatabase(':memory:');
  sqlite = conn.sqlite;
  db = conn.db;
  pushSchema(sqlite);

  manager = new JwtSecretManager(db);
  await manager.initialize();

  app = createTestApp(manager, db);
});

afterEach(() => {
  vi.useRealTimers();
  try {
    sqlite.close();
  } catch {
    // already closed
  }
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('sessionAuth middleware', () => {
  it('returns 401 INVALID_TOKEN when no Authorization header', async () => {
    seedTestData();

    const res = await app.request('/protected/data');
    expect(res.status).toBe(401);

    const body = await json(res);
    expect(body.code).toBe('INVALID_TOKEN');
  });

  it('returns 401 INVALID_TOKEN when Authorization header has wrong format (not Bearer wai_sess_)', async () => {
    seedTestData();

    const res = await app.request('/protected/data', {
      headers: { Authorization: 'Bearer some-random-token' },
    });
    expect(res.status).toBe(401);

    const body = await json(res);
    expect(body.code).toBe('INVALID_TOKEN');
  });

  it('returns 401 INVALID_TOKEN when token is malformed JWT', async () => {
    seedTestData();

    const res = await app.request('/protected/data', {
      headers: { Authorization: 'Bearer wai_sess_not.a.valid.jwt' },
    });
    expect(res.status).toBe(401);

    const body = await json(res);
    expect(body.code).toBe('INVALID_TOKEN');
  });

  it('returns 401 TOKEN_EXPIRED when token is expired', async () => {
    seedTestData();

    const past = nowSeconds() - 3600;
    const token = await signTestToken(manager, {
      iat: past - 7200,
      exp: past,
    });

    const res = await app.request('/protected/data', {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(401);

    const body = await json(res);
    expect(body.code).toBe('TOKEN_EXPIRED');
  });

  it('returns 401 SESSION_REVOKED when session is revoked in DB', async () => {
    const ts = nowSeconds();
    seedTestData({ revokedAt: ts - 100 });

    const token = await signTestToken(manager);

    const res = await app.request('/protected/data', {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(401);

    const body = await json(res);
    expect(body.code).toBe('SESSION_REVOKED');
  });

  it('returns 404 SESSION_NOT_FOUND when session ID not in DB', async () => {
    // Seed agent but NOT the session
    const ts = nowSeconds();
    sqlite.prepare(
      `INSERT INTO wallets (id, name, chain, network, public_key, status, owner_verified, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(TEST_WALLET_ID, 'Test Wallet', 'solana', 'mainnet', `pk-no-session-${Math.random()}`, 'ACTIVE', 0, ts, ts);

    const token = await signTestToken(manager);

    const res = await app.request('/protected/data', {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(404);

    const body = await json(res);
    expect(body.code).toBe('SESSION_NOT_FOUND');
  });

  it('passes through and sets sessionId/walletId when token is valid and session active', async () => {
    seedTestData();

    const token = await signTestToken(manager);

    const res = await app.request('/protected/data', {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(200);

    const body = await json(res);
    expect(body.ok).toBe(true);
    expect(body.sessionId).toBe(TEST_SESSION_ID);
    expect(body.walletId).toBe(TEST_WALLET_ID);
  });

  it('succeeds with old secret during dual-key rotation window', async () => {
    vi.useFakeTimers();
    const baseTime = Date.now();
    vi.setSystemTime(baseTime);

    seedTestData();

    const token = await signTestToken(manager);

    // Advance 6 minutes and rotate
    vi.setSystemTime(baseTime + 6 * 60 * 1000);
    await manager.rotateSecret();

    // Token signed with old secret should still work
    const res = await app.request('/protected/data', {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(200);

    const body = await json(res);
    expect(body.ok).toBe(true);
    expect(body.sessionId).toBe(TEST_SESSION_ID);
  });
});
