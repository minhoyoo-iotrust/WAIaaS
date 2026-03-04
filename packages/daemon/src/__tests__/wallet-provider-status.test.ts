/**
 * Provider status in wallet responses tests.
 *
 * Tests cover:
 * - buildProviderStatus unit tests
 * - GET /v1/wallets/:id includes provider field
 * - GET /v1/wallets list includes provider field
 * - EOA wallet has provider: null
 * - Smart account without provider has provider: null
 * - Smart account with pimlico has correct supportedChains
 *
 * @see Phase 325-02 -- Wallet detail/list response extension
 */

import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import type { Database as DatabaseType } from 'better-sqlite3';
import argon2 from 'argon2';
import { createDatabase, pushSchema, generateId } from '../infrastructure/database/index.js';
import { JwtSecretManager } from '../infrastructure/jwt/index.js';
import { createApp } from '../api/server.js';
import { buildProviderStatus } from '../api/routes/wallets.js';
import type { OpenAPIHono } from '@hono/zod-openapi';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TEST_PASSWORD = 'test-master-password-provider-status';
const HOST = '127.0.0.1:3100';
let passwordHash: string;

const VALID_EVM_ADDRESS = '0xaaaa567890abcdef1234567890abcdef12345678';

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

// ---------------------------------------------------------------------------
// buildProviderStatus unit tests
// ---------------------------------------------------------------------------

describe('buildProviderStatus', () => {
  it('pimlico provider returns 10 supported chains and paymasterEnabled=true', () => {
    const result = buildProviderStatus({
      aaProvider: 'pimlico',
      aaPaymasterUrl: null,
    });

    expect(result).not.toBeNull();
    expect(result!.name).toBe('pimlico');
    expect(result!.supportedChains).toHaveLength(10);
    expect(result!.supportedChains).toContain('ethereum-mainnet');
    expect(result!.supportedChains).toContain('base-sepolia');
    expect(result!.paymasterEnabled).toBe(true);
  });

  it('alchemy provider returns 10 supported chains and paymasterEnabled=true', () => {
    const result = buildProviderStatus({
      aaProvider: 'alchemy',
      aaPaymasterUrl: null,
    });

    expect(result).not.toBeNull();
    expect(result!.name).toBe('alchemy');
    expect(result!.supportedChains).toHaveLength(10);
    expect(result!.paymasterEnabled).toBe(true);
  });

  it('custom with paymasterUrl returns paymasterEnabled=true', () => {
    const result = buildProviderStatus({
      aaProvider: 'custom',
      aaPaymasterUrl: 'https://paymaster.example.com',
    });

    expect(result).not.toBeNull();
    expect(result!.name).toBe('custom');
    expect(result!.supportedChains).toHaveLength(0);
    expect(result!.paymasterEnabled).toBe(true);
  });

  it('custom without paymasterUrl returns paymasterEnabled=false', () => {
    const result = buildProviderStatus({
      aaProvider: 'custom',
      aaPaymasterUrl: null,
    });

    expect(result).not.toBeNull();
    expect(result!.paymasterEnabled).toBe(false);
  });

  it('null provider returns null', () => {
    const result = buildProviderStatus({
      aaProvider: null,
    });

    expect(result).toBeNull();
  });

  it('EOA wallet (no aaProvider) returns null', () => {
    const result = buildProviderStatus({
      aaProvider: null,
      aaPaymasterUrl: null,
    });

    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Integration tests: GET /v1/wallets/:id and GET /v1/wallets with provider
// ---------------------------------------------------------------------------

describe('Wallet response provider field', () => {
  let sqlite: DatabaseType;
  let db: ReturnType<typeof createDatabase>['db'];
  let jwtManager: JwtSecretManager;
  let app: OpenAPIHono;

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

  function seedWalletWithProvider(walletId: string, pubKey: string, accountType: string, provider: string | null): void {
    const ts = Math.floor(Date.now() / 1000);
    sqlite
      .prepare(
        `INSERT INTO wallets (id, name, chain, environment, public_key, status, owner_verified, account_type, aa_provider, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(walletId, 'test-wallet', 'ethereum', 'testnet', pubKey, 'ACTIVE', 0, accountType, provider, ts, ts);
  }

  it('GET /v1/wallets/:id for smart account with pimlico returns provider info', async () => {
    const walletId = generateId();
    seedWalletWithProvider(walletId, '0xbbbb111122223333444455556666777788889999', 'smart', 'pimlico');

    const res = await app.request(
      `http://${HOST}/v1/wallets/${walletId}`,
      { method: 'GET', headers: masterAuthJsonHeaders() },
    );

    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.provider).toBeDefined();
    const provider = body.provider as Record<string, unknown>;
    expect(provider.name).toBe('pimlico');
    expect(Array.isArray(provider.supportedChains)).toBe(true);
    expect((provider.supportedChains as string[]).length).toBe(10);
    expect(provider.paymasterEnabled).toBe(true);
  });

  it('GET /v1/wallets/:id for EOA wallet returns provider: null', async () => {
    const walletId = generateId();
    seedWalletWithProvider(walletId, '0xcccc111122223333444455556666777788889999', 'eoa', null);

    const res = await app.request(
      `http://${HOST}/v1/wallets/${walletId}`,
      { method: 'GET', headers: masterAuthJsonHeaders() },
    );

    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.provider).toBeNull();
  });

  it('GET /v1/wallets/:id for smart account without provider returns provider: null', async () => {
    const walletId = generateId();
    seedWalletWithProvider(walletId, '0xdddd111122223333444455556666777788889999', 'smart', null);

    const res = await app.request(
      `http://${HOST}/v1/wallets/${walletId}`,
      { method: 'GET', headers: masterAuthJsonHeaders() },
    );

    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.provider).toBeNull();
  });

  it('GET /v1/wallets list includes provider field for each wallet', async () => {
    const w1 = generateId();
    const w2 = generateId();
    seedWalletWithProvider(w1, '0xeeee111122223333444455556666777788889999', 'smart', 'pimlico');
    seedWalletWithProvider(w2, '0xffff111122223333444455556666777788889999', 'eoa', null);

    const res = await app.request(
      `http://${HOST}/v1/wallets`,
      { method: 'GET', headers: masterAuthJsonHeaders() },
    );

    expect(res.status).toBe(200);
    const body = await json(res);
    const items = body.items as any[];
    expect(items.length).toBe(2);

    const smartWallet = items.find((i: any) => i.id === w1);
    const eoaWallet = items.find((i: any) => i.id === w2);

    expect(smartWallet.provider).toBeDefined();
    expect(smartWallet.provider.name).toBe('pimlico');
    expect(eoaWallet.provider).toBeNull();
  });
});
