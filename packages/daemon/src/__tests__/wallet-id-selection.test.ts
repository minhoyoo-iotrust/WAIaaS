/**
 * Wallet ID selection integration tests: verify resolveWalletId integration
 * across actual API endpoints.
 *
 * Tests cover:
 * 1. GET /v1/wallet/address (default wallet -- no walletId specified)
 * 2. GET /v1/wallet/address?walletId={walletB} (query param selection)
 * 3. GET /v1/wallet/address?walletId={unlinked} (WALLET_ACCESS_DENIED)
 * 4. POST /v1/transactions/send { walletId: walletB.id } (body walletId)
 * 5. POST /v1/transactions/send (no walletId -- uses default wallet)
 * 6. GET /v1/transactions?walletId={walletB} (query param on list)
 * 7. POST /v1/transactions/sign { walletId: walletB.id } (body walletId)
 * 8. GET /v1/transactions/pending?walletId={walletB} (query param on pending)
 *
 * Uses createApp() with full deps for realistic HTTP simulation.
 *
 * @see Phase 211-02 -- endpoint walletId selection migration
 */

import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import type { Database as DatabaseType } from 'better-sqlite3';
import argon2 from 'argon2';
import { createDatabase, pushSchema, generateId } from '../infrastructure/database/index.js';
import { JwtSecretManager } from '../infrastructure/jwt/index.js';
import { DaemonConfigSchema } from '../infrastructure/config/loader.js';
import { createApp } from '../api/server.js';
import { DatabasePolicyEngine } from '../pipeline/database-policy-engine.js';
import type { IChainAdapter } from '@waiaas/core';
import type { AdapterPool } from '../infrastructure/adapter-pool.js';
import type { OpenAPIHono } from '@hono/zod-openapi';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TEST_PASSWORD = 'test-master-password-wallet-selection';
const HOST = '127.0.0.1:3100';
let passwordHash: string;

// ---------------------------------------------------------------------------
// Mock helpers
// ---------------------------------------------------------------------------

function createMockAdapter(overrides: Partial<IChainAdapter> = {}): IChainAdapter {
  return {
    chain: 'solana' as const,
    network: 'devnet' as const,
    connect: async () => {},
    disconnect: async () => {},
    isConnected: () => true,
    getHealth: async () => ({ healthy: true, latencyMs: 1 }),
    getBalance: async (addr: string) => ({
      address: addr,
      balance: 1_000_000_000n,
      decimals: 9,
      symbol: 'SOL',
    }),
    buildTransaction: async () => ({
      chain: 'solana',
      serialized: new Uint8Array(128),
      estimatedFee: 5000n,
      metadata: {},
    }),
    simulateTransaction: async () => ({ success: true, logs: [] }),
    signTransaction: async () => new Uint8Array(256),
    submitTransaction: async () => ({
      txHash: 'mock-hash-' + Date.now(),
      status: 'submitted' as const,
    }),
    waitForConfirmation: async (txHash: string) => ({
      txHash,
      status: 'confirmed' as const,
      confirmations: 1,
    }),
    getAssets: async () => [],
    estimateFee: async () => { throw new Error('not implemented'); },
    buildTokenTransfer: async () => { throw new Error('not implemented'); },
    getTokenInfo: async () => { throw new Error('not implemented'); },
    buildContractCall: async () => { throw new Error('not implemented'); },
    buildApprove: async () => { throw new Error('not implemented'); },
    buildBatch: async () => { throw new Error('not implemented'); },
    getTransactionFee: async () => { throw new Error('not implemented'); },
    getCurrentNonce: async () => 0,
    sweepAll: async () => { throw new Error('not implemented'); },
    ...overrides,
  };
}

function createMockAdapterPool(adapter?: IChainAdapter): AdapterPool {
  const a = adapter ?? createMockAdapter();
  return {
    resolve: vi.fn().mockResolvedValue(a),
    disconnectAll: vi.fn().mockResolvedValue(undefined),
    get size() { return 0; },
  } as unknown as AdapterPool;
}

function createMockKeyStore() {
  return {
    generateKeyPair: async () => ({
      publicKey: '11111111111111111111111111111112',
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

function bearerHeader(token: string): Record<string, string> {
  return { Host: HOST, Authorization: `Bearer ${token}` };
}

function bearerJsonHeader(token: string): Record<string, string> {
  return {
    Host: HOST,
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
}

// ---------------------------------------------------------------------------
// Seed helpers
// ---------------------------------------------------------------------------

function seedWallet(
  sqlite: DatabaseType,
  walletId: string,
  name: string,
  publicKey: string,
): void {
  const ts = Math.floor(Date.now() / 1000);
  sqlite
    .prepare(
      `INSERT INTO wallets (id, name, chain, environment, default_network, public_key, status, owner_verified, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(walletId, name, 'solana', 'testnet', 'devnet', publicKey, 'ACTIVE', 0, ts, ts);
}

// ---------------------------------------------------------------------------
// Test setup
// ---------------------------------------------------------------------------

let sqlite: DatabaseType;
let db: ReturnType<typeof createDatabase>['db'];
let jwtManager: JwtSecretManager;
let policyEngine: DatabasePolicyEngine;
let app: OpenAPIHono;

let walletA: string;
let walletB: string;
let walletUnlinked: string;
let sessionToken: string;

const PK_A = 'pk-wallet-a-selection';
const PK_B = 'pk-wallet-b-selection';
const PK_UNLINKED = 'pk-wallet-unlinked';

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
  vi.setSystemTime(new Date('2026-02-21T12:00:00Z'));

  const conn = createDatabase(':memory:');
  sqlite = conn.sqlite;
  db = conn.db;
  pushSchema(sqlite);

  jwtManager = new JwtSecretManager(db);
  await jwtManager.initialize();

  const config = DaemonConfigSchema.parse({});
  policyEngine = new DatabasePolicyEngine(db, sqlite);

  app = createApp({
    db,
    sqlite,
    jwtSecretManager: jwtManager,
    masterPasswordHash: passwordHash,
    masterPassword: TEST_PASSWORD,
    config,
    adapterPool: createMockAdapterPool(),
    keyStore: createMockKeyStore(),
    policyEngine,
  });

  // Create wallets
  walletA = generateId();
  walletB = generateId();
  walletUnlinked = generateId();

  seedWallet(sqlite, walletA, 'Wallet A', PK_A);
  seedWallet(sqlite, walletB, 'Wallet B', PK_B);
  seedWallet(sqlite, walletUnlinked, 'Wallet Unlinked', PK_UNLINKED);

  // Create session with walletA (default) + walletB linked via walletIds
  const createRes = await app.request('/v1/sessions', {
    method: 'POST',
    headers: masterAuthJsonHeaders(),
    body: JSON.stringify({
      walletIds: [walletA, walletB],
      ttl: 3600,
    }),
  });
  expect(createRes.status).toBe(201);
  const sessionBody = await json(createRes);
  sessionToken = sessionBody.token as string;
  expect(sessionToken.startsWith('wai_sess_')).toBe(true);
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

describe('Wallet ID Selection Integration', () => {
  // -------------------------------------------------------------------------
  // GET /v1/wallet/address
  // -------------------------------------------------------------------------

  it('GET /v1/wallet/address -- default wallet (walletA) when no walletId specified', async () => {
    const res = await app.request('/v1/wallet/address', {
      headers: bearerHeader(sessionToken),
    });
    expect(res.status).toBe(200);

    const body = await json(res);
    expect(body.walletId).toBe(walletA);
    expect(body.address).toBe(PK_A);
  });

  it('GET /v1/wallet/address?walletId={walletB} -- selects walletB via query param', async () => {
    const res = await app.request(`/v1/wallet/address?walletId=${walletB}`, {
      headers: bearerHeader(sessionToken),
    });
    expect(res.status).toBe(200);

    const body = await json(res);
    expect(body.walletId).toBe(walletB);
    expect(body.address).toBe(PK_B);
  });

  it('GET /v1/wallet/address?walletId={unlinked} -- WALLET_ACCESS_DENIED', async () => {
    const res = await app.request(`/v1/wallet/address?walletId=${walletUnlinked}`, {
      headers: bearerHeader(sessionToken),
    });
    // WALLET_ACCESS_DENIED -> 403
    expect(res.status).toBe(403);

    const body = await json(res);
    expect(body.code).toBe('WALLET_ACCESS_DENIED');
  });

  // -------------------------------------------------------------------------
  // POST /v1/transactions/send
  // -------------------------------------------------------------------------

  it('POST /v1/transactions/send { walletId: walletB } -- creates tx for walletB', async () => {
    const res = await app.request('/v1/transactions/send', {
      method: 'POST',
      headers: bearerJsonHeader(sessionToken),
      body: JSON.stringify({
        walletId: walletB,
        type: 'TRANSFER',
        to: 'SomeRecipientAddress',
        amount: '100000',
      }),
    });
    expect(res.status).toBe(201);

    const body = await json(res);
    expect(body.id).toBeTruthy();
    expect(body.status).toBe('PENDING');

    // Verify in DB that the transaction is associated with walletB
    const txRow = sqlite
      .prepare('SELECT wallet_id FROM transactions WHERE id = ?')
      .get(body.id as string) as { wallet_id: string } | undefined;
    expect(txRow).toBeDefined();
    expect(txRow!.wallet_id).toBe(walletB);
  });

  it('POST /v1/transactions/send (no walletId) -- uses default walletA', async () => {
    const res = await app.request('/v1/transactions/send', {
      method: 'POST',
      headers: bearerJsonHeader(sessionToken),
      body: JSON.stringify({
        type: 'TRANSFER',
        to: 'SomeRecipientAddress',
        amount: '200000',
      }),
    });
    expect(res.status).toBe(201);

    const body = await json(res);
    expect(body.id).toBeTruthy();

    // Verify in DB that the transaction is associated with walletA (default)
    const txRow = sqlite
      .prepare('SELECT wallet_id FROM transactions WHERE id = ?')
      .get(body.id as string) as { wallet_id: string } | undefined;
    expect(txRow).toBeDefined();
    expect(txRow!.wallet_id).toBe(walletA);
  });

  it('POST /v1/transactions/send { walletId: unlinked } -- WALLET_ACCESS_DENIED', async () => {
    const res = await app.request('/v1/transactions/send', {
      method: 'POST',
      headers: bearerJsonHeader(sessionToken),
      body: JSON.stringify({
        walletId: walletUnlinked,
        type: 'TRANSFER',
        to: 'SomeRecipientAddress',
        amount: '300000',
      }),
    });
    expect(res.status).toBe(403);

    const body = await json(res);
    expect(body.code).toBe('WALLET_ACCESS_DENIED');
  });

  // -------------------------------------------------------------------------
  // GET /v1/transactions (list with walletId query param)
  // -------------------------------------------------------------------------

  it('GET /v1/transactions?walletId={walletB} -- lists transactions for walletB', async () => {
    // First, create a transaction for walletB
    const sendRes = await app.request('/v1/transactions/send', {
      method: 'POST',
      headers: bearerJsonHeader(sessionToken),
      body: JSON.stringify({
        walletId: walletB,
        type: 'TRANSFER',
        to: 'SomeRecipientAddress',
        amount: '100000',
      }),
    });
    expect(sendRes.status).toBe(201);

    // Now list transactions for walletB
    const res = await app.request(`/v1/transactions?walletId=${walletB}`, {
      headers: bearerHeader(sessionToken),
    });
    expect(res.status).toBe(200);

    const body = await json(res);
    const items = body.items as Array<{ walletId: string }>;
    expect(items.length).toBeGreaterThanOrEqual(1);
    // All items should belong to walletB
    for (const item of items) {
      expect(item.walletId).toBe(walletB);
    }
  });

  // -------------------------------------------------------------------------
  // GET /v1/transactions/pending
  // -------------------------------------------------------------------------

  it('GET /v1/transactions/pending?walletId={walletB} -- lists pending for walletB', async () => {
    const res = await app.request(`/v1/transactions/pending?walletId=${walletB}`, {
      headers: bearerHeader(sessionToken),
    });
    expect(res.status).toBe(200);

    const body = await json(res);
    expect(body.items).toBeDefined();
    // Initially no pending transactions for walletB
    expect((body.items as unknown[]).length).toBe(0);
  });

  // -------------------------------------------------------------------------
  // POST /v1/transactions/sign (body walletId)
  // -------------------------------------------------------------------------

  it('POST /v1/transactions/sign { walletId: walletB } -- resolves walletB', async () => {
    // sign endpoint expects base64/hex unsigned tx -- we'll get a validation error
    // but the important thing is that walletId resolution succeeds (not WALLET_ACCESS_DENIED)
    const res = await app.request('/v1/transactions/sign', {
      method: 'POST',
      headers: bearerJsonHeader(sessionToken),
      body: JSON.stringify({
        walletId: walletB,
        transaction: 'dGVzdC11bnNpZ25lZC10eA==', // base64 test data
      }),
    });

    // We expect either 200 (if sign succeeds) or a chain/sign error (not 403)
    // The key assertion is that it does NOT return WALLET_ACCESS_DENIED
    const body = await json(res);
    if (res.status === 403) {
      // Should NOT be WALLET_ACCESS_DENIED since walletB is linked
      expect(body.code).not.toBe('WALLET_ACCESS_DENIED');
    }
    // If we get a different error (e.g., INVALID_TRANSACTION), that's fine
    // -- it means walletId resolution succeeded
  });

  it('POST /v1/transactions/sign { walletId: unlinked } -- WALLET_ACCESS_DENIED', async () => {
    const res = await app.request('/v1/transactions/sign', {
      method: 'POST',
      headers: bearerJsonHeader(sessionToken),
      body: JSON.stringify({
        walletId: walletUnlinked,
        transaction: 'dGVzdC11bnNpZ25lZC10eA==',
      }),
    });
    expect(res.status).toBe(403);

    const body = await json(res);
    expect(body.code).toBe('WALLET_ACCESS_DENIED');
  });
});
