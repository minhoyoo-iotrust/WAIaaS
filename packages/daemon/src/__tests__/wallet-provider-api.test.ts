/**
 * PUT /v1/wallets/:id/provider API tests.
 *
 * Tests cover:
 * - Preset provider (pimlico/alchemy) with apiKey -> 200
 * - Custom provider with bundlerUrl -> 200
 * - EOA wallet -> 400
 * - Non-existent wallet -> 404
 * - Preset without apiKey -> 400
 * - Custom without bundlerUrl -> 400
 * - DB record updated with encrypted API key
 * - SessionAuth own wallet -> 200
 * - SessionAuth other wallet -> 403
 * - MasterAuth any wallet -> 200
 *
 * @see Phase 325-01 -- PUT /v1/wallets/:id/provider
 */

import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import type { Database as DatabaseType } from 'better-sqlite3';
import argon2 from 'argon2';
import { createDatabase, pushSchema, generateId } from '../infrastructure/database/index.js';
import { JwtSecretManager } from '../infrastructure/jwt/index.js';
import { createApp } from '../api/server.js';
import { decryptProviderApiKey } from '../infrastructure/smart-account/aa-provider-crypto.js';
import type { OpenAPIHono } from '@hono/zod-openapi';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TEST_PASSWORD = 'test-master-password-provider';
const HOST = '127.0.0.1:3100';
let passwordHash: string;

const VALID_EVM_ADDRESS = '0x1234567890abcdef1234567890abcdef12345678';
const VALID_EVM_ADDRESS_2 = '0xabcdef1234567890abcdef1234567890abcdef12';

// ---------------------------------------------------------------------------
// Mock helpers
// ---------------------------------------------------------------------------

function createMockKeyStore() {
  return {
    generateKeyPair: async () => ({
      publicKey: VALID_EVM_ADDRESS,
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

function sessionAuthJsonHeaders(token: string): Record<string, string> {
  return {
    Host: HOST,
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
}

// ---------------------------------------------------------------------------
// Seed helpers
// ---------------------------------------------------------------------------

function seedSmartWallet(sqlite: DatabaseType, walletId: string, pubKey?: string): void {
  const ts = Math.floor(Date.now() / 1000);
  sqlite
    .prepare(
      `INSERT INTO wallets (id, name, chain, environment, public_key, status, owner_verified, account_type, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(walletId, 'test-smart-wallet', 'ethereum', 'testnet', pubKey ?? VALID_EVM_ADDRESS, 'ACTIVE', 0, 'smart', ts, ts);
}

function seedEoaWallet(sqlite: DatabaseType, walletId: string): void {
  const ts = Math.floor(Date.now() / 1000);
  sqlite
    .prepare(
      `INSERT INTO wallets (id, name, chain, environment, public_key, status, owner_verified, account_type, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(walletId, 'test-eoa-wallet', 'ethereum', 'testnet', VALID_EVM_ADDRESS_2, 'ACTIVE', 0, 'eoa', ts, ts);
}

function seedSessionWithWallet(sqlite: DatabaseType, sessionId: string, walletId: string, tokenHash: string): void {
  const ts = Math.floor(Date.now() / 1000);
  sqlite
    .prepare(
      `INSERT INTO sessions (id, token_hash, expires_at, created_at, renewal_count, max_renewals, absolute_expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(sessionId, tokenHash, 0, ts, 0, 0, 0);
  sqlite
    .prepare(
      `INSERT INTO session_wallets (session_id, wallet_id, created_at)
       VALUES (?, ?, ?)`,
    )
    .run(sessionId, walletId, ts);
}

// ---------------------------------------------------------------------------
// Test setup
// ---------------------------------------------------------------------------

let sqlite: DatabaseType;
let db: ReturnType<typeof createDatabase>['db'];
let jwtManager: JwtSecretManager;
let app: OpenAPIHono;
let smartWalletId: string;
let eoaWalletId: string;

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
  vi.setSystemTime(new Date('2026-03-05T12:00:00Z'));

  const conn = createDatabase(':memory:');
  sqlite = conn.sqlite;
  db = conn.db;
  pushSchema(sqlite);

  jwtManager = new JwtSecretManager(db);
  await jwtManager.initialize();

  smartWalletId = generateId();
  eoaWalletId = generateId();
  seedSmartWallet(sqlite, smartWalletId);
  seedEoaWallet(sqlite, eoaWalletId);

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
// Tests: PUT /v1/wallets/:id/provider (masterAuth)
// ---------------------------------------------------------------------------

describe('PUT /v1/wallets/:id/provider', () => {
  it('preset pimlico provider with apiKey returns 200', async () => {
    const res = await app.request(
      `http://${HOST}/v1/wallets/${smartWalletId}/provider`,
      {
        method: 'PUT',
        headers: masterAuthJsonHeaders(),
        body: JSON.stringify({
          provider: 'pimlico',
          apiKey: 'pm_test_key_12345',
        }),
      },
    );

    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.id).toBe(smartWalletId);
    expect(body.provider).toBeDefined();
    const provider = body.provider as Record<string, unknown>;
    expect(provider.name).toBe('pimlico');
    expect(Array.isArray(provider.supportedChains)).toBe(true);
    expect((provider.supportedChains as string[]).length).toBe(10);
    expect(provider.paymasterEnabled).toBe(true);
  });

  it('custom provider with bundlerUrl returns 200', async () => {
    const res = await app.request(
      `http://${HOST}/v1/wallets/${smartWalletId}/provider`,
      {
        method: 'PUT',
        headers: masterAuthJsonHeaders(),
        body: JSON.stringify({
          provider: 'custom',
          bundlerUrl: 'https://my-bundler.example.com/rpc',
          paymasterUrl: 'https://my-paymaster.example.com/rpc',
        }),
      },
    );

    expect(res.status).toBe(200);
    const body = await json(res);
    const provider = body.provider as Record<string, unknown>;
    expect(provider.name).toBe('custom');
    expect((provider.supportedChains as string[]).length).toBe(0);
    expect(provider.paymasterEnabled).toBe(true);
  });

  it('custom provider without paymasterUrl returns paymasterEnabled=false', async () => {
    const res = await app.request(
      `http://${HOST}/v1/wallets/${smartWalletId}/provider`,
      {
        method: 'PUT',
        headers: masterAuthJsonHeaders(),
        body: JSON.stringify({
          provider: 'custom',
          bundlerUrl: 'https://my-bundler.example.com/rpc',
        }),
      },
    );

    expect(res.status).toBe(200);
    const body = await json(res);
    const provider = body.provider as Record<string, unknown>;
    expect(provider.paymasterEnabled).toBe(false);
  });

  it('EOA wallet returns 400', async () => {
    const res = await app.request(
      `http://${HOST}/v1/wallets/${eoaWalletId}/provider`,
      {
        method: 'PUT',
        headers: masterAuthJsonHeaders(),
        body: JSON.stringify({
          provider: 'pimlico',
          apiKey: 'pm_test_key_12345',
        }),
      },
    );

    expect(res.status).toBe(400);
  });

  it('non-existent wallet returns 404', async () => {
    const fakeId = generateId();
    const res = await app.request(
      `http://${HOST}/v1/wallets/${fakeId}/provider`,
      {
        method: 'PUT',
        headers: masterAuthJsonHeaders(),
        body: JSON.stringify({
          provider: 'pimlico',
          apiKey: 'pm_test_key_12345',
        }),
      },
    );

    expect(res.status).toBe(404);
  });

  it('preset pimlico without apiKey returns 400', async () => {
    const res = await app.request(
      `http://${HOST}/v1/wallets/${smartWalletId}/provider`,
      {
        method: 'PUT',
        headers: masterAuthJsonHeaders(),
        body: JSON.stringify({
          provider: 'pimlico',
        }),
      },
    );

    expect(res.status).toBe(400);
  });

  it('custom without bundlerUrl returns 400', async () => {
    const res = await app.request(
      `http://${HOST}/v1/wallets/${smartWalletId}/provider`,
      {
        method: 'PUT',
        headers: masterAuthJsonHeaders(),
        body: JSON.stringify({
          provider: 'custom',
        }),
      },
    );

    expect(res.status).toBe(400);
  });

  it('DB record has encrypted API key after PUT', async () => {
    await app.request(
      `http://${HOST}/v1/wallets/${smartWalletId}/provider`,
      {
        method: 'PUT',
        headers: masterAuthJsonHeaders(),
        body: JSON.stringify({
          provider: 'pimlico',
          apiKey: 'pm_test_key_secret',
        }),
      },
    );

    const row = sqlite.prepare('SELECT aa_provider, aa_provider_api_key_encrypted FROM wallets WHERE id = ?').get(smartWalletId) as any;
    expect(row.aa_provider).toBe('pimlico');
    expect(row.aa_provider_api_key_encrypted).toBeTruthy();
    // Verify decryption roundtrip
    const decrypted = decryptProviderApiKey(row.aa_provider_api_key_encrypted, TEST_PASSWORD);
    expect(decrypted).toBe('pm_test_key_secret');
  });

  // ---------------------------------------------------------------------------
  // Dual-auth tests (Task 2)
  // ---------------------------------------------------------------------------

  it('sessionAuth with own wallet returns 200', async () => {
    const sessionId = generateId();
    const jwtPayload = { sub: sessionId, iat: Math.floor(Date.now() / 1000) };
    const token = await jwtManager.signToken(jwtPayload);
    const { createHash } = await import('node:crypto');
    const tokenHash = createHash('sha256').update(token).digest('hex');
    seedSessionWithWallet(sqlite, sessionId, smartWalletId, tokenHash);

    const res = await app.request(
      `http://${HOST}/v1/wallets/${smartWalletId}/provider`,
      {
        method: 'PUT',
        headers: sessionAuthJsonHeaders(token),
        body: JSON.stringify({
          provider: 'alchemy',
          apiKey: 'alch_test_key_123',
        }),
      },
    );

    expect(res.status).toBe(200);
    const body = await json(res);
    const provider = body.provider as Record<string, unknown>;
    expect(provider.name).toBe('alchemy');
  });

  it('sessionAuth with other wallet returns 403', async () => {
    const sessionId = generateId();
    const otherWalletId = generateId();
    seedSmartWallet(sqlite, otherWalletId, '0x9999999999999999999999999999999999999999');

    const jwtPayload = { sub: sessionId, iat: Math.floor(Date.now() / 1000) };
    const token = await jwtManager.signToken(jwtPayload);
    const { createHash } = await import('node:crypto');
    const tokenHash = createHash('sha256').update(token).digest('hex');
    // Session linked to smartWalletId, NOT otherWalletId
    seedSessionWithWallet(sqlite, sessionId, smartWalletId, tokenHash);

    const res = await app.request(
      `http://${HOST}/v1/wallets/${otherWalletId}/provider`,
      {
        method: 'PUT',
        headers: sessionAuthJsonHeaders(token),
        body: JSON.stringify({
          provider: 'pimlico',
          apiKey: 'pm_test_key_12345',
        }),
      },
    );

    expect(res.status).toBe(403);
  });

  it('masterAuth can update any wallet provider', async () => {
    const res = await app.request(
      `http://${HOST}/v1/wallets/${smartWalletId}/provider`,
      {
        method: 'PUT',
        headers: masterAuthJsonHeaders(),
        body: JSON.stringify({
          provider: 'pimlico',
          apiKey: 'pm_test_key_admin',
        }),
      },
    );

    expect(res.status).toBe(200);
  });
});
