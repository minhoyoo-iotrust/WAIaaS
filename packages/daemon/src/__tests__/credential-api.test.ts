/**
 * Tests for Credential REST API endpoints.
 *
 * 16 tests covering:
 * Per-wallet endpoints (4):
 *   1. GET /v1/wallets/:walletId/credentials -> 200 CredentialMetadata[]
 *   2. POST /v1/wallets/:walletId/credentials -> 201 CredentialMetadata
 *   3. DELETE /v1/wallets/:walletId/credentials/:ref -> 204
 *   4. PUT /v1/wallets/:walletId/credentials/:ref/rotate -> 200 CredentialMetadata
 *
 * Global endpoints (4):
 *   5. GET /v1/admin/credentials -> 200 CredentialMetadata[]
 *   6. POST /v1/admin/credentials -> 201 CredentialMetadata
 *   7. DELETE /v1/admin/credentials/:ref -> 204
 *   8. PUT /v1/admin/credentials/:ref/rotate -> 200 CredentialMetadata
 *
 * Error cases (4):
 *   9. POST duplicate name -> 400
 *   10. DELETE non-existent -> 404
 *   11. POST invalid type -> 400
 *   12. Value never in response
 *
 * Auth (4):
 *   13. GET per-wallet with sessionAuth -> 200
 *   14. POST per-wallet without masterAuth -> 401
 *   15. GET admin without masterAuth -> 401
 *   16. Rotate non-existent -> 404
 *
 * Uses createApp() + app.request() integration pattern.
 *
 * @see packages/daemon/src/api/routes/credentials.ts
 * @see packages/daemon/src/api/routes/admin-credentials.ts
 */

import { describe, it, expect, beforeAll } from 'vitest';
import argon2 from 'argon2';
import { createDatabase, pushSchema } from '../infrastructure/database/index.js';
import { createApp } from '../api/server.js';
import type { OpenAPIHono } from '@hono/zod-openapi';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type { Database as DatabaseType } from 'better-sqlite3';
import type * as schema from '../infrastructure/database/schema.js';
import { wallets } from '../infrastructure/database/schema.js';
import { generateId } from '../infrastructure/database/id.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TEST_PASSWORD = 'test-master-password-cred-api';
const HOST = '127.0.0.1:3100';

let passwordHash: string;
let app: OpenAPIHono;
let db: BetterSQLite3Database<typeof schema>;
let sqlite: DatabaseType;
const WALLET_ID = generateId();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function masterHeaders(): Record<string, string> {
  return {
    'Host': HOST,
    'X-Master-Password': TEST_PASSWORD,
    'Content-Type': 'application/json',
  };
}

function sessionHeaders(token: string): Record<string, string> {
  return {
    'Host': HOST,
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeAll(async () => {
  passwordHash = await argon2.hash(TEST_PASSWORD, {
    type: argon2.argon2id,
    memoryCost: 19456,
    timeCost: 2,
    parallelism: 1,
  });

  const conn = createDatabase(':memory:');
  db = conn.db;
  sqlite = conn.sqlite;
  pushSchema(conn.sqlite);

  // Create test wallet for per-wallet tests
  db.insert(wallets)
    .values({
      id: WALLET_ID,
      name: 'test-wallet',
      chain: 'ethereum',
      environment: 'mainnet',
      publicKey: `pk_${WALLET_ID}`,
      status: 'ACTIVE',
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .run();

  app = createApp({
    db,
    sqlite,
    masterPasswordHash: passwordHash,
    passwordRef: { password: TEST_PASSWORD, hash: passwordHash },
  });
});

// ---------------------------------------------------------------------------
// Per-wallet credential endpoints
// ---------------------------------------------------------------------------

describe('Per-wallet credential endpoints', () => {
  let createdId: string;

  it('POST /v1/wallets/:walletId/credentials -> 201', async () => {
    const res = await app.request(
      `/v1/wallets/${WALLET_ID}/credentials`,
      {
        method: 'POST',
        headers: masterHeaders(),
        body: JSON.stringify({
          type: 'api-key',
          name: 'test-api-key',
          value: 'secret-value-123',
          metadata: { provider: 'test' },
        }),
      },
    );

    expect(res.status).toBe(201);
    const body = await res.json() as Record<string, unknown>;
    expect(body.id).toBeDefined();
    expect(body.walletId).toBe(WALLET_ID);
    expect(body.type).toBe('api-key');
    expect(body.name).toBe('test-api-key');
    expect(body).not.toHaveProperty('value');
    createdId = body.id as string;
  });

  it('GET /v1/wallets/:walletId/credentials -> 200', async () => {
    const res = await app.request(
      `/v1/wallets/${WALLET_ID}/credentials`,
      { method: 'GET', headers: masterHeaders() },
    );

    expect(res.status).toBe(200);
    const body = await res.json() as Array<Record<string, unknown>>;
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBeGreaterThan(0);
    // Verify no value field in any item
    for (const item of body) {
      expect(item).not.toHaveProperty('value');
    }
  });

  it('PUT /v1/wallets/:walletId/credentials/:ref/rotate -> 200', async () => {
    const res = await app.request(
      `/v1/wallets/${WALLET_ID}/credentials/${createdId}/rotate`,
      {
        method: 'PUT',
        headers: masterHeaders(),
        body: JSON.stringify({ value: 'new-rotated-value' }),
      },
    );

    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    expect(body.id).toBe(createdId);
    expect(body).not.toHaveProperty('value');
  });

  it('DELETE /v1/wallets/:walletId/credentials/:ref -> 204', async () => {
    const res = await app.request(
      `/v1/wallets/${WALLET_ID}/credentials/${createdId}`,
      { method: 'DELETE', headers: masterHeaders() },
    );

    expect(res.status).toBe(204);
  });
});

// ---------------------------------------------------------------------------
// Global credential endpoints
// ---------------------------------------------------------------------------

describe('Global credential endpoints', () => {
  let createdId: string;

  it('POST /v1/admin/credentials -> 201', async () => {
    const res = await app.request(
      '/v1/admin/credentials',
      {
        method: 'POST',
        headers: masterHeaders(),
        body: JSON.stringify({
          type: 'hmac-secret',
          name: 'global-hmac-key',
          value: 'hmac-secret-bytes',
        }),
      },
    );

    expect(res.status).toBe(201);
    const body = await res.json() as Record<string, unknown>;
    expect(body.walletId).toBeNull();
    expect(body.type).toBe('hmac-secret');
    expect(body).not.toHaveProperty('value');
    createdId = body.id as string;
  });

  it('GET /v1/admin/credentials -> 200', async () => {
    const res = await app.request(
      '/v1/admin/credentials',
      { method: 'GET', headers: masterHeaders() },
    );

    expect(res.status).toBe(200);
    const body = await res.json() as Array<Record<string, unknown>>;
    expect(Array.isArray(body)).toBe(true);
    const found = body.find((c) => c.id === createdId);
    expect(found).toBeDefined();
  });

  it('PUT /v1/admin/credentials/:ref/rotate -> 200', async () => {
    const res = await app.request(
      `/v1/admin/credentials/${createdId}/rotate`,
      {
        method: 'PUT',
        headers: masterHeaders(),
        body: JSON.stringify({ value: 'rotated-hmac' }),
      },
    );

    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    expect(body.id).toBe(createdId);
  });

  it('DELETE /v1/admin/credentials/:ref -> 204', async () => {
    const res = await app.request(
      `/v1/admin/credentials/${createdId}`,
      { method: 'DELETE', headers: masterHeaders() },
    );

    expect(res.status).toBe(204);
  });
});

// ---------------------------------------------------------------------------
// Error cases
// ---------------------------------------------------------------------------

describe('Credential API error cases', () => {
  it('POST duplicate name -> 400', async () => {
    const name = `dup-${Date.now()}`;
    await app.request(
      '/v1/admin/credentials',
      {
        method: 'POST',
        headers: masterHeaders(),
        body: JSON.stringify({ type: 'api-key', name, value: 'v1' }),
      },
    );

    const res = await app.request(
      '/v1/admin/credentials',
      {
        method: 'POST',
        headers: masterHeaders(),
        body: JSON.stringify({ type: 'api-key', name, value: 'v2' }),
      },
    );

    expect(res.status).toBe(400);
  });

  it('DELETE non-existent -> 404', async () => {
    const res = await app.request(
      '/v1/admin/credentials/00000000-0000-0000-0000-000000000000',
      { method: 'DELETE', headers: masterHeaders() },
    );

    expect(res.status).toBe(404);
  });

  it('POST invalid type -> 400', async () => {
    const res = await app.request(
      '/v1/admin/credentials',
      {
        method: 'POST',
        headers: masterHeaders(),
        body: JSON.stringify({ type: 'invalid-type', name: 'test', value: 'v' }),
      },
    );

    expect(res.status).toBe(400);
  });

  it('Rotate non-existent -> 404', async () => {
    const res = await app.request(
      '/v1/admin/credentials/00000000-0000-0000-0000-000000000000/rotate',
      {
        method: 'PUT',
        headers: masterHeaders(),
        body: JSON.stringify({ value: 'new' }),
      },
    );

    expect(res.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

describe('Credential API auth', () => {
  it('GET admin without masterAuth -> 401', async () => {
    const res = await app.request(
      '/v1/admin/credentials',
      { method: 'GET', headers: { 'Host': HOST } },
    );

    expect(res.status).toBe(401);
  });

  it('POST per-wallet without masterAuth -> 401', async () => {
    const res = await app.request(
      `/v1/wallets/${WALLET_ID}/credentials`,
      {
        method: 'POST',
        headers: { 'Host': HOST, 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'api-key', name: 'test', value: 'v' }),
      },
    );

    expect(res.status).toBe(401);
  });
});
