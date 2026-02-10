/**
 * Session renewal API tests: PUT /v1/sessions/:id/renew with 5 safety checks.
 *
 * Tests cover:
 * 1. Successful renewal returns new token
 * 2. Old token rejected after renewal
 * 3. Renewal rejected: maxRenewals exceeded
 * 4. Renewal rejected: absolute lifetime exceeded
 * 5. Renewal rejected: too early (< 50% TTL elapsed)
 * 6. Renewal rejected: revoked session
 * 7. Renewal rejected: token_hash CAS mismatch
 * 8. Renewal rejected: wrong session ID (not owner)
 * 9. renewalCount increments on each renewal
 * 10. New token expiresAt clamped by absoluteExpiresAt
 *
 * Uses Hono createApp() with full deps, in-memory SQLite, JwtSecretManager.
 * Uses vi.useFakeTimers() to control time for TTL and expiration tests.
 */

import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
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
const SESSION_TTL = 3600; // 1 hour
let passwordHash: string;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Type-safe JSON body extraction from Response. */
async function json(res: Response): Promise<Record<string, unknown>> {
  return (await res.json()) as Record<string, unknown>;
}

/** Helper: seed a test agent into the database */
function seedAgent(sqlite: DatabaseType, agentId: string): void {
  const ts = Math.floor(Date.now() / 1000);
  sqlite
    .prepare(
      `INSERT INTO agents (id, name, chain, network, public_key, status, owner_verified, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(agentId, 'Test Agent', 'solana', 'mainnet', `pk-${agentId}`, 'ACTIVE', 0, ts, ts);
}

/** Helper: build masterAuth + JSON content type headers (includes Host for hostGuard) */
function masterAuthJsonHeaders(): Record<string, string> {
  return {
    Host: HOST,
    'X-Master-Password': TEST_PASSWORD,
    'Content-Type': 'application/json',
  };
}

/** Helper: build masterAuth header (includes Host for hostGuard) */
function masterAuthHeader(): Record<string, string> {
  return { Host: HOST, 'X-Master-Password': TEST_PASSWORD };
}

/** Helper: create a session via API and return { id, token, expiresAt } */
async function createSessionViaApi(
  app: OpenAPIHono,
  agentId: string,
  ttl: number = SESSION_TTL,
): Promise<{ id: string; token: string; expiresAt: number }> {
  const res = await app.request('/v1/sessions', {
    method: 'POST',
    headers: masterAuthJsonHeaders(),
    body: JSON.stringify({ agentId, ttl }),
  });
  if (res.status !== 201) {
    const body = await json(res);
    throw new Error(`Failed to create session: ${res.status} ${JSON.stringify(body)}`);
  }
  const body = await json(res);
  return {
    id: body.id as string,
    token: body.token as string,
    expiresAt: body.expiresAt as number,
  };
}

/** Helper: renew a session via API */
async function renewSessionViaApi(
  app: OpenAPIHono,
  sessionId: string,
  token: string,
): Promise<Response> {
  return app.request(`/v1/sessions/${sessionId}/renew`, {
    method: 'PUT',
    headers: {
      Host: HOST,
      Authorization: `Bearer ${token}`,
    },
  });
}

// ---------------------------------------------------------------------------
// Test setup
// ---------------------------------------------------------------------------

let sqlite: DatabaseType;
let db: ReturnType<typeof createDatabase>['db'];
let jwtManager: JwtSecretManager;
let app: OpenAPIHono;
let testAgentId: string;

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
  vi.useFakeTimers();
  // Set a stable base time
  vi.setSystemTime(new Date('2026-02-10T12:00:00Z'));

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

  testAgentId = generateId();
  seedAgent(sqlite, testAgentId);
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

describe('Session Renewal API', () => {
  // -----------------------------------------------------------------------
  // 1. Successful renewal
  // -----------------------------------------------------------------------

  it('successful renewal returns new token after 50% TTL elapsed', async () => {
    const session = await createSessionViaApi(app, testAgentId, SESSION_TTL);

    // Advance past 50% of TTL (1801 seconds > 1800 = 50% of 3600)
    vi.advanceTimersByTime(1801 * 1000);

    const res = await renewSessionViaApi(app, session.id, session.token);
    expect(res.status).toBe(200);

    const body = await json(res);
    expect(body.id).toBe(session.id);
    expect(typeof body.token).toBe('string');
    expect((body.token as string).startsWith('wai_sess_')).toBe(true);
    expect(body.token).not.toBe(session.token); // New token is different
    expect(body.expiresAt).toBeDefined();
    expect(body.renewalCount).toBe(1);
  });

  // -----------------------------------------------------------------------
  // 2. Old token rejected after renewal
  // -----------------------------------------------------------------------

  it('old token rejected after renewal', async () => {
    const session = await createSessionViaApi(app, testAgentId, SESSION_TTL);

    // Advance past 50% TTL
    vi.advanceTimersByTime(1801 * 1000);

    const renewRes = await renewSessionViaApi(app, session.id, session.token);
    expect(renewRes.status).toBe(200);

    // Old token's JWT is still valid (not expired), but the session's tokenHash in DB has changed.
    // sessionAuth middleware does NOT check tokenHash -- it only checks existence + revocation.
    // However, for renewal, the CAS check catches the mismatch.
    // Verify old token fails on a SECOND renewal attempt (CAS mismatch)
    const secondRenewRes = await renewSessionViaApi(app, session.id, session.token);
    // The old token is still a valid JWT (not expired), sessionAuth passes,
    // but the CAS check in the renew handler catches the mismatch
    expect(secondRenewRes.status).toBe(403);

    const body = await json(secondRenewRes);
    expect(body.code).toBe('SESSION_RENEWAL_MISMATCH');
  });

  // -----------------------------------------------------------------------
  // 3. Renewal rejected: maxRenewals exceeded
  // -----------------------------------------------------------------------

  it('renewal rejected when maxRenewals exceeded', async () => {
    const session = await createSessionViaApi(app, testAgentId, SESSION_TTL);

    // Directly set renewalCount to maxRenewals (30) in DB
    sqlite
      .prepare('UPDATE sessions SET renewal_count = 30 WHERE id = ?')
      .run(session.id);

    // Advance past 50% TTL
    vi.advanceTimersByTime(1801 * 1000);

    const res = await renewSessionViaApi(app, session.id, session.token);
    expect(res.status).toBe(403);

    const body = await json(res);
    expect(body.code).toBe('RENEWAL_LIMIT_REACHED');
  });

  // -----------------------------------------------------------------------
  // 4. Renewal rejected: absolute lifetime exceeded
  // -----------------------------------------------------------------------

  it('renewal rejected when absolute lifetime exceeded', async () => {
    const session = await createSessionViaApi(app, testAgentId, SESSION_TTL);

    // Set absoluteExpiresAt to the past (1 second ago from "now + 1801s")
    const nowSec = Math.floor(Date.now() / 1000);
    sqlite
      .prepare('UPDATE sessions SET absolute_expires_at = ? WHERE id = ?')
      .run(nowSec + 1800, session.id); // Will be in the past after advancing 1801s

    // Advance past 50% TTL
    vi.advanceTimersByTime(1801 * 1000);

    const res = await renewSessionViaApi(app, session.id, session.token);
    expect(res.status).toBe(403);

    const body = await json(res);
    expect(body.code).toBe('SESSION_ABSOLUTE_LIFETIME_EXCEEDED');
  });

  // -----------------------------------------------------------------------
  // 5. Renewal rejected: too early (< 50% TTL elapsed)
  // -----------------------------------------------------------------------

  it('renewal rejected when less than 50% TTL elapsed', async () => {
    const session = await createSessionViaApi(app, testAgentId, SESSION_TTL);

    // Do NOT advance time -- 0 seconds elapsed is < 50% of 3600
    const res = await renewSessionViaApi(app, session.id, session.token);
    expect(res.status).toBe(403);

    const body = await json(res);
    expect(body.code).toBe('RENEWAL_TOO_EARLY');
  });

  // -----------------------------------------------------------------------
  // 6. Renewal rejected: revoked session
  // -----------------------------------------------------------------------

  it('renewal rejected for revoked session', async () => {
    const session = await createSessionViaApi(app, testAgentId, SESSION_TTL);

    // Revoke the session via DELETE (masterAuth)
    const deleteRes = await app.request(`/v1/sessions/${session.id}`, {
      method: 'DELETE',
      headers: masterAuthHeader(),
    });
    expect(deleteRes.status).toBe(200);

    // Advance past 50% TTL
    vi.advanceTimersByTime(1801 * 1000);

    // Attempt renewal -- sessionAuth middleware should catch revoked session
    const res = await renewSessionViaApi(app, session.id, session.token);
    expect(res.status).toBe(401);

    const body = await json(res);
    expect(body.code).toBe('SESSION_REVOKED');
  });

  // -----------------------------------------------------------------------
  // 7. Renewal rejected: token_hash CAS mismatch
  // -----------------------------------------------------------------------

  it('renewal rejected when token_hash CAS mismatch', async () => {
    const session = await createSessionViaApi(app, testAgentId, SESSION_TTL);

    // Manually change tokenHash in DB to simulate concurrent renewal
    const fakeHash = createHash('sha256').update('fake-token').digest('hex');
    sqlite
      .prepare('UPDATE sessions SET token_hash = ? WHERE id = ?')
      .run(fakeHash, session.id);

    // Advance past 50% TTL
    vi.advanceTimersByTime(1801 * 1000);

    const res = await renewSessionViaApi(app, session.id, session.token);
    expect(res.status).toBe(403);

    const body = await json(res);
    expect(body.code).toBe('SESSION_RENEWAL_MISMATCH');
  });

  // -----------------------------------------------------------------------
  // 8. Renewal rejected: wrong session ID (not owner)
  // -----------------------------------------------------------------------

  it('renewal rejected when param session ID does not match token session', async () => {
    const sessionA = await createSessionViaApi(app, testAgentId, SESSION_TTL);
    const sessionB = await createSessionViaApi(app, testAgentId, SESSION_TTL);

    // Advance past 50% TTL
    vi.advanceTimersByTime(1801 * 1000);

    // Try to renew session B using session A's token
    const res = await renewSessionViaApi(app, sessionB.id, sessionA.token);
    expect(res.status).toBe(404);

    const body = await json(res);
    expect(body.code).toBe('SESSION_NOT_FOUND');
  });

  // -----------------------------------------------------------------------
  // 9. renewalCount increments on each renewal
  // -----------------------------------------------------------------------

  it('renewalCount increments on each successive renewal', async () => {
    const session = await createSessionViaApi(app, testAgentId, SESSION_TTL);

    // First renewal: advance past 50% of original TTL (3600s)
    vi.advanceTimersByTime(1801 * 1000);

    const renewRes1 = await renewSessionViaApi(app, session.id, session.token);
    expect(renewRes1.status).toBe(200);
    const body1 = await json(renewRes1);
    expect(body1.renewalCount).toBe(1);
    const newToken1 = body1.token as string;

    // Second renewal: advance past 50% of new token's TTL
    vi.advanceTimersByTime(1801 * 1000);

    const renewRes2 = await renewSessionViaApi(app, session.id, newToken1);
    expect(renewRes2.status).toBe(200);
    const body2 = await json(renewRes2);
    expect(body2.renewalCount).toBe(2);

    // Verify lastRenewedAt is updated in DB
    const row = sqlite.prepare('SELECT last_renewed_at, renewal_count FROM sessions WHERE id = ?').get(session.id) as {
      last_renewed_at: number;
      renewal_count: number;
    };
    expect(row.renewal_count).toBe(2);
    expect(row.last_renewed_at).toBeDefined();
    expect(row.last_renewed_at).toBeGreaterThan(0);
  });

  // -----------------------------------------------------------------------
  // 10. New token expiresAt clamped by absoluteExpiresAt
  // -----------------------------------------------------------------------

  it('new token expiresAt clamped by absoluteExpiresAt', async () => {
    const session = await createSessionViaApi(app, testAgentId, SESSION_TTL);

    // Set absoluteExpiresAt to only 1800 seconds from now (less than full TTL renewal)
    const creationTime = Math.floor(Date.now() / 1000);
    const clampedAbsoluteExpiry = creationTime + 1801 + 900; // 900s remaining after 50% advance
    sqlite
      .prepare('UPDATE sessions SET absolute_expires_at = ? WHERE id = ?')
      .run(clampedAbsoluteExpiry, session.id);

    // Advance past 50% TTL
    vi.advanceTimersByTime(1801 * 1000);

    const res = await renewSessionViaApi(app, session.id, session.token);
    expect(res.status).toBe(200);

    const body = await json(res);
    const newExpiresAt = body.expiresAt as number;

    // newExpiresAt should be clamped to absoluteExpiresAt (not now + 3600)
    // absoluteExpiresAt is creationTime + 1801 + 900 = creationTime + 2701
    // nowSec after advance is creationTime + 1801
    // Without clamping: nowSec + 3600 = creationTime + 1801 + 3600 = creationTime + 5401
    // With clamping: min(creationTime + 5401, clampedAbsoluteExpiry) = clampedAbsoluteExpiry
    expect(newExpiresAt).toBe(clampedAbsoluteExpiry);
  });

  // -----------------------------------------------------------------------
  // 11. Renewal without masterAuth (sessionAuth only)
  // -----------------------------------------------------------------------

  it('renewal works without masterAuth header (sessionAuth only)', async () => {
    const session = await createSessionViaApi(app, testAgentId, SESSION_TTL);

    // Advance past 50% TTL
    vi.advanceTimersByTime(1801 * 1000);

    // Renew without X-Master-Password header -- only Bearer token
    const res = await renewSessionViaApi(app, session.id, session.token);
    expect(res.status).toBe(200);

    const body = await json(res);
    expect(body.id).toBe(session.id);
    expect(body.renewalCount).toBe(1);
  });
});
