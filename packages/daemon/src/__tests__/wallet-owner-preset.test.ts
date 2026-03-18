/**
 * Wallet owner preset integration tests: verify wallet_type parameter
 * in PUT /v1/wallets/{id}/owner endpoint.
 *
 * Tests cover:
 * T-PRST-01: wallet_type='dcent' sets preset approval_method and wallet_type in DB
 * T-PRST-02: Invalid wallet_type returns 400 (Zod validation)
 * T-PRST-03: No wallet_type preserves backward compatibility
 * T-PRST-04: wallet_type + approval_method conflict: preset wins + warning
 * T-PRST-05: No wallet_type with approval_method uses existing logic
 *
 * @see Phase 265-02 -- API wallet_type extension
 */

import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import type { Database as DatabaseType } from 'better-sqlite3';
import argon2 from 'argon2';
import { createDatabase, pushSchema, generateId } from '../infrastructure/database/index.js';
import { JwtSecretManager } from '../infrastructure/jwt/index.js';
import { createApp } from '../api/server.js';
import type { OpenAPIHono } from '@hono/zod-openapi';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TEST_PASSWORD = 'test-master-password-preset';
const HOST = '127.0.0.1:3100';
let passwordHash: string;

// Valid Solana address (32-byte Ed25519 public key, Base58-encoded)
const VALID_SOLANA_ADDRESS = '11111111111111111111111111111112';

// ---------------------------------------------------------------------------
// Mock helpers
// ---------------------------------------------------------------------------

function createMockKeyStore() {
  return {
    generateKeyPair: async () => ({
      publicKey: VALID_SOLANA_ADDRESS,
      encryptedPrivateKey: new Uint8Array(64),
    }),
    decryptPrivateKey: async () => new Uint8Array(64).fill(42),
    releaseKey: () => {},
    hasKey: async () => true,
    deleteKey: async () => {},
    lockAll: () => {},
    sodiumAvailable: true,
  } as any;
}

// ---------------------------------------------------------------------------
// API helpers
// ---------------------------------------------------------------------------

async function json(res: Response): Promise<Record<string, unknown>> {
  return (await res.json()) as Record<string, unknown>;
}

function masterAuthJsonHeaders(): Record<string, string> {
  return {
    Host: HOST,
    'X-Master-Password': TEST_PASSWORD,
    'Content-Type': 'application/json',
  };
}

// ---------------------------------------------------------------------------
// Seed helpers
// ---------------------------------------------------------------------------

function seedWallet(sqlite: DatabaseType, walletId: string): void {
  const ts = Math.floor(Date.now() / 1000);
  sqlite
    .prepare(
      `INSERT INTO wallets (id, name, chain, environment, public_key, status, owner_verified, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(walletId, 'test-wallet', 'solana', 'testnet', VALID_SOLANA_ADDRESS, 'ACTIVE', 0, ts, ts);
}

// ---------------------------------------------------------------------------
// Test setup
// ---------------------------------------------------------------------------

let sqlite: DatabaseType;
let db: ReturnType<typeof createDatabase>['db'];
let jwtManager: JwtSecretManager;
let app: OpenAPIHono;
let walletId: string;

beforeAll(async () => {
  passwordHash = await argon2.hash(TEST_PASSWORD, {
    type: argon2.argon2id,
    memoryCost: 4096,
    timeCost: 2,
    parallelism: 1,
  });
});

beforeEach(async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-02-25T12:00:00Z'));

  const conn = createDatabase(':memory:');
  sqlite = conn.sqlite;
  db = conn.db;
  pushSchema(sqlite);

  jwtManager = new JwtSecretManager(db);
  await jwtManager.initialize();

  walletId = generateId();
  seedWallet(sqlite, walletId);

  app = createApp({
    db,
    sqlite,
    keyStore: createMockKeyStore(),
    masterPassword: TEST_PASSWORD,
    masterPasswordHash: passwordHash,
    jwtSecretManager: jwtManager,
    config: {
      master_password_hash: passwordHash,
      host: '127.0.0.1',
      port: 3100,
      rpc: {},
      security: {
        idle_timeout: 0,
        time_delay_default: 0,
        time_delay_high: 0,
        admin_session_timeout: 3600,
      },
      notifications: {},
    } as any,
  });
});

afterEach(() => {
  vi.useRealTimers();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('PUT /v1/wallets/:id/owner wallet_type preset', () => {
  it('T-PRST-01: wallet_type=dcent sets preset approval_method and wallet_type in DB', async () => {
    const res = await app.request(
      `http://${HOST}/v1/wallets/${walletId}/owner`,
      {
        method: 'PUT',
        headers: masterAuthJsonHeaders(),
        body: JSON.stringify({
          owner_address: VALID_SOLANA_ADDRESS,
          wallet_type: 'dcent',
        }),
      },
    );

    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.walletType).toBe('dcent');
    expect(body.approvalMethod).toBe('sdk_push');
    expect(body.warning).toBeNull();

    // Verify DB state
    const row = sqlite.prepare('SELECT wallet_type, owner_approval_method FROM wallets WHERE id = ?').get(walletId) as any;
    expect(row.wallet_type).toBe('dcent');
    expect(row.owner_approval_method).toBe('sdk_push');
  });

  it('T-PRST-02: invalid wallet_type returns 400', async () => {
    const res = await app.request(
      `http://${HOST}/v1/wallets/${walletId}/owner`,
      {
        method: 'PUT',
        headers: masterAuthJsonHeaders(),
        body: JSON.stringify({
          owner_address: VALID_SOLANA_ADDRESS,
          wallet_type: 'unknown-wallet',
        }),
      },
    );

    expect(res.status).toBe(400);
    const body = await json(res);
    expect(body.code).toBeDefined();
  });

  it('T-PRST-03: no wallet_type preserves backward compatibility', async () => {
    const res = await app.request(
      `http://${HOST}/v1/wallets/${walletId}/owner`,
      {
        method: 'PUT',
        headers: masterAuthJsonHeaders(),
        body: JSON.stringify({
          owner_address: VALID_SOLANA_ADDRESS,
        }),
      },
    );

    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.walletType).toBeNull();
    expect(body.warning).toBeNull();
    expect(body.ownerAddress).toBe(VALID_SOLANA_ADDRESS);

    // Verify DB: wallet_type should be NULL
    const row = sqlite.prepare('SELECT wallet_type FROM wallets WHERE id = ?').get(walletId) as any;
    expect(row.wallet_type).toBeNull();
  });

  it('T-PRST-04: wallet_type + approval_method conflict: preset wins + warning', async () => {
    const res = await app.request(
      `http://${HOST}/v1/wallets/${walletId}/owner`,
      {
        method: 'PUT',
        headers: masterAuthJsonHeaders(),
        body: JSON.stringify({
          owner_address: VALID_SOLANA_ADDRESS,
          wallet_type: 'dcent',
          approval_method: 'rest',
        }),
      },
    );

    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.approvalMethod).toBe('sdk_push'); // preset value, not 'rest'
    expect(body.walletType).toBe('dcent');
    expect(body.warning).toBeTruthy();
    expect(typeof body.warning).toBe('string');
    expect((body.warning as string).toLowerCase()).toContain('overrides');

    // Verify DB: preset approval_method was saved
    const row = sqlite.prepare('SELECT wallet_type, owner_approval_method FROM wallets WHERE id = ?').get(walletId) as any;
    expect(row.wallet_type).toBe('dcent');
    expect(row.owner_approval_method).toBe('sdk_push');
  });

  it('T-PRST-05: no wallet_type with approval_method uses existing logic', async () => {
    const res = await app.request(
      `http://${HOST}/v1/wallets/${walletId}/owner`,
      {
        method: 'PUT',
        headers: masterAuthJsonHeaders(),
        body: JSON.stringify({
          owner_address: VALID_SOLANA_ADDRESS,
          approval_method: 'rest',
        }),
      },
    );

    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.approvalMethod).toBe('rest');
    expect(body.walletType).toBeNull();
    expect(body.warning).toBeNull();

    // Verify DB: approval_method saved directly, no wallet_type
    const row = sqlite.prepare('SELECT wallet_type, owner_approval_method FROM wallets WHERE id = ?').get(walletId) as any;
    expect(row.wallet_type).toBeNull();
    expect(row.owner_approval_method).toBe('rest');
  });
});
