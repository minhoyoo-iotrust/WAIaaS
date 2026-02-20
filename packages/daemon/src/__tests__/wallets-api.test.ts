/**
 * Tests for PUT /v1/wallets/:id/owner approval_method field.
 *
 * Verifies:
 * 1. Valid approval_method values are accepted and saved
 * 2. All 5 APPROVAL_METHODS enum values return 200
 * 3. Invalid approval_method returns 400 (Zod validation)
 * 4. Omitting approval_method preserves existing value
 * 5. Explicit null clears column to NULL (revert to Auto)
 * 6. approval_method persists and appears in GET /wallets/:id
 * 7. Null after set clears: set -> null -> verify cleared
 *
 * Uses createApp() + app.request() integration pattern with in-memory SQLite.
 */

import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import type { Database as DatabaseType } from 'better-sqlite3';
import argon2 from 'argon2';
import { APPROVAL_METHODS } from '@waiaas/core';
import { createDatabase, pushSchema, generateId } from '../infrastructure/database/index.js';
import { DaemonConfigSchema } from '../infrastructure/config/loader.js';
import { createApp } from '../api/server.js';
import type { LocalKeyStore } from '../infrastructure/keystore/keystore.js';
import type { OpenAPIHono } from '@hono/zod-openapi';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TEST_PASSWORD = 'test-master-password-approval-method';
const HOST = '127.0.0.1:3100';
let passwordHash: string;

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const MOCK_PUBLIC_KEY = '11111111111111111111111111111112';

function mockKeyStore(): LocalKeyStore {
  return {
    generateKeyPair: async () => ({
      publicKey: MOCK_PUBLIC_KEY,
      encryptedPrivateKey: new Uint8Array(64),
    }),
    decryptPrivateKey: async () => new Uint8Array(64),
    releaseKey: () => {},
    hasKey: async () => true,
    deleteKey: async () => {},
    lockAll: () => {},
    sodiumAvailable: true,
  } as unknown as LocalKeyStore;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function json(res: Response): Promise<Record<string, unknown>> {
  return (await res.json()) as Record<string, unknown>;
}

function seedWallet(sqlite: DatabaseType, walletId: string): void {
  const ts = Math.floor(Date.now() / 1000);
  sqlite
    .prepare(
      `INSERT INTO wallets (id, name, chain, environment, default_network, public_key, status, owner_verified, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(walletId, 'Test Wallet', 'solana', 'mainnet', 'mainnet', `pk-${walletId}`, 'ACTIVE', 0, ts, ts);
}

function masterAuthJsonHeaders(): Record<string, string> {
  return {
    Host: HOST,
    'X-Master-Password': TEST_PASSWORD,
    'Content-Type': 'application/json',
  };
}

// Solana System Program address (valid base58 32-byte)
const VALID_SOLANA_ADDRESS = 'Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr';

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

let sqlite: DatabaseType;
let db: ReturnType<typeof createDatabase>['db'];
let app: OpenAPIHono;

beforeAll(async () => {
  passwordHash = await argon2.hash(TEST_PASSWORD, {
    type: argon2.argon2id,
    memoryCost: 4096,
    timeCost: 2,
    parallelism: 1,
  });
});

beforeEach(() => {
  const conn = createDatabase(':memory:');
  sqlite = conn.sqlite;
  db = conn.db;
  pushSchema(sqlite);

  app = createApp({
    db,
    sqlite,
    keyStore: mockKeyStore(),
    masterPassword: TEST_PASSWORD,
    masterPasswordHash: passwordHash,
    config: DaemonConfigSchema.parse({}),
  });
});

afterEach(() => {
  sqlite.close();
});

// ---------------------------------------------------------------------------
// PUT /wallets/:id/owner approval_method
// ---------------------------------------------------------------------------

describe('PUT /wallets/:id/owner approval_method', () => {
  it('should accept valid approval_method and return it in response', async () => {
    const walletId = generateId();
    seedWallet(sqlite, walletId);

    const res = await app.request(`/v1/wallets/${walletId}/owner`, {
      method: 'PUT',
      headers: masterAuthJsonHeaders(),
      body: JSON.stringify({
        owner_address: VALID_SOLANA_ADDRESS,
        approval_method: 'sdk_ntfy',
      }),
    });

    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.approvalMethod).toBe('sdk_ntfy');
  });

  it('should accept all 5 valid APPROVAL_METHODS values', async () => {
    for (const method of APPROVAL_METHODS) {
      const walletId = generateId();
      seedWallet(sqlite, walletId);

      const res = await app.request(`/v1/wallets/${walletId}/owner`, {
        method: 'PUT',
        headers: masterAuthJsonHeaders(),
        body: JSON.stringify({
          owner_address: VALID_SOLANA_ADDRESS,
          approval_method: method,
        }),
      });

      expect(res.status).toBe(200);
      const body = await json(res);
      expect(body.approvalMethod).toBe(method);
    }
  });

  it('should return 400 for invalid approval_method', async () => {
    const walletId = generateId();
    seedWallet(sqlite, walletId);

    const res = await app.request(`/v1/wallets/${walletId}/owner`, {
      method: 'PUT',
      headers: masterAuthJsonHeaders(),
      body: JSON.stringify({
        owner_address: VALID_SOLANA_ADDRESS,
        approval_method: 'invalid_method',
      }),
    });

    expect(res.status).toBe(400);
    const body = await json(res);
    expect(body.code).toBe('ACTION_VALIDATION_FAILED');
  });

  it('should preserve existing approval_method when field is omitted', async () => {
    const walletId = generateId();
    seedWallet(sqlite, walletId);

    // First set approval_method
    const res1 = await app.request(`/v1/wallets/${walletId}/owner`, {
      method: 'PUT',
      headers: masterAuthJsonHeaders(),
      body: JSON.stringify({
        owner_address: VALID_SOLANA_ADDRESS,
        approval_method: 'telegram_bot',
      }),
    });
    expect(res1.status).toBe(200);

    // Second PUT without approval_method -- should preserve existing
    const res2 = await app.request(`/v1/wallets/${walletId}/owner`, {
      method: 'PUT',
      headers: masterAuthJsonHeaders(),
      body: JSON.stringify({
        owner_address: VALID_SOLANA_ADDRESS,
      }),
    });
    expect(res2.status).toBe(200);
    const body2 = await json(res2);
    expect(body2.approvalMethod).toBe('telegram_bot');
  });

  it('should clear approval_method to null when explicitly set to null', async () => {
    const walletId = generateId();
    seedWallet(sqlite, walletId);

    // First set approval_method to a value
    const res1 = await app.request(`/v1/wallets/${walletId}/owner`, {
      method: 'PUT',
      headers: masterAuthJsonHeaders(),
      body: JSON.stringify({
        owner_address: VALID_SOLANA_ADDRESS,
        approval_method: 'sdk_ntfy',
      }),
    });
    expect(res1.status).toBe(200);
    expect((await json(res1)).approvalMethod).toBe('sdk_ntfy');

    // Clear with explicit null
    const res2 = await app.request(`/v1/wallets/${walletId}/owner`, {
      method: 'PUT',
      headers: masterAuthJsonHeaders(),
      body: JSON.stringify({
        owner_address: VALID_SOLANA_ADDRESS,
        approval_method: null,
      }),
    });
    expect(res2.status).toBe(200);
    const body2 = await json(res2);
    expect(body2.approvalMethod).toBeNull();
  });

  it('should persist approval_method and return it in GET /wallets/:id', async () => {
    const walletId = generateId();
    seedWallet(sqlite, walletId);

    // Set approval_method via PUT
    const putRes = await app.request(`/v1/wallets/${walletId}/owner`, {
      method: 'PUT',
      headers: masterAuthJsonHeaders(),
      body: JSON.stringify({
        owner_address: VALID_SOLANA_ADDRESS,
        approval_method: 'walletconnect',
      }),
    });
    expect(putRes.status).toBe(200);

    // Read via GET /wallets/:id
    const getRes = await app.request(`/v1/wallets/${walletId}`, {
      method: 'GET',
      headers: {
        Host: HOST,
        'X-Master-Password': TEST_PASSWORD,
      },
    });
    expect(getRes.status).toBe(200);
    const body = await json(getRes);
    expect(body.approvalMethod).toBe('walletconnect');
  });

  it('should clear approval_method after it was set (set -> null -> verify cleared)', async () => {
    const walletId = generateId();
    seedWallet(sqlite, walletId);

    // Step 1: Set to sdk_ntfy
    const res1 = await app.request(`/v1/wallets/${walletId}/owner`, {
      method: 'PUT',
      headers: masterAuthJsonHeaders(),
      body: JSON.stringify({
        owner_address: VALID_SOLANA_ADDRESS,
        approval_method: 'sdk_ntfy',
      }),
    });
    expect(res1.status).toBe(200);

    // Step 2: Clear with null
    const res2 = await app.request(`/v1/wallets/${walletId}/owner`, {
      method: 'PUT',
      headers: masterAuthJsonHeaders(),
      body: JSON.stringify({
        owner_address: VALID_SOLANA_ADDRESS,
        approval_method: null,
      }),
    });
    expect(res2.status).toBe(200);

    // Step 3: Verify via GET that approvalMethod is null
    const getRes = await app.request(`/v1/wallets/${walletId}`, {
      method: 'GET',
      headers: {
        Host: HOST,
        'X-Master-Password': TEST_PASSWORD,
      },
    });
    expect(getRes.status).toBe(200);
    const body = await json(getRes);
    expect(body.approvalMethod).toBeNull();
  });
});
