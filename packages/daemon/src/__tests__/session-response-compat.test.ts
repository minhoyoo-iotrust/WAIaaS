/**
 * Session response backward compatibility tests (v26.4).
 *
 * Verifies:
 * - Session creation response includes wallets array + walletId backward compat
 * - Session listing includes wallets array + walletId/walletName backward compat
 * - Session renewal issues JWT with wlt claim matching session_wallets default
 * - walletId/walletName fields have expected types for legacy clients
 * - Create and list return consistent wallet data
 *
 * @see .planning/phases/211-api-wallet-selection/211-03-PLAN.md
 */

import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import type { Database as DatabaseType } from 'better-sqlite3';
import argon2 from 'argon2';
import { createDatabase, pushSchema, generateId } from '../infrastructure/database/index.js';
import { JwtSecretManager } from '../infrastructure/jwt/index.js';
import { DaemonConfigSchema } from '../infrastructure/config/loader.js';
import { createApp } from '../api/server.js';
import { DatabasePolicyEngine } from '../pipeline/database-policy-engine.js';
import { DelayQueue } from '../workflow/delay-queue.js';
import { ApprovalWorkflow } from '../workflow/approval-workflow.js';
import { OwnerLifecycleService } from '../workflow/owner-state.js';
import type { IChainAdapter } from '@waiaas/core';
import type { AdapterPool } from '../infrastructure/adapter-pool.js';
import type { OpenAPIHono } from '@hono/zod-openapi';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TEST_PASSWORD = 'test-master-password-compat';
const HOST = '127.0.0.1:3100';
const SESSION_TTL = 3600; // 1 hour
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

function masterAuthHeader(): Record<string, string> {
  return { Host: HOST, 'X-Master-Password': TEST_PASSWORD };
}

function bearerHeader(token: string): Record<string, string> {
  return { Host: HOST, Authorization: `Bearer ${token}` };
}

// ---------------------------------------------------------------------------
// Seed helpers
// ---------------------------------------------------------------------------

function seedWallet(
  sqlite: DatabaseType,
  walletId: string,
  name: string = 'Test Wallet',
): void {
  const ts = Math.floor(Date.now() / 1000);
  sqlite
    .prepare(
      `INSERT INTO wallets (id, name, chain, environment, default_network, public_key, status, owner_verified, owner_address, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(walletId, name, 'solana', 'testnet', 'devnet', `pk-${walletId}`, 'ACTIVE', 0, null, ts, ts);
}

// ---------------------------------------------------------------------------
// Test setup
// ---------------------------------------------------------------------------

let sqlite: DatabaseType;
let db: ReturnType<typeof createDatabase>['db'];
let jwtManager: JwtSecretManager;
let app: OpenAPIHono;
let walletA: string;
let walletB: string;

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

  const policyEngine = new DatabasePolicyEngine(db, sqlite);
  const delayQueue = new DelayQueue({ db, sqlite });
  const approvalWorkflow = new ApprovalWorkflow({
    db,
    sqlite,
    config: {
      policy_defaults_approval_timeout: config.security.policy_defaults_approval_timeout,
    },
  });
  const ownerLifecycle = new OwnerLifecycleService({ db, sqlite });

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
    delayQueue,
    approvalWorkflow,
    ownerLifecycle,
  });

  walletA = generateId();
  walletB = generateId();
  seedWallet(sqlite, walletA, 'Wallet Alpha');
  seedWallet(sqlite, walletB, 'Wallet Beta');
});

afterEach(() => {
  vi.useRealTimers();
  try {
    sqlite.close();
  } catch {
    // already closed
  }
});

// ===========================================================================
// Session Response Backward Compatibility
// ===========================================================================

describe('Session Response Backward Compatibility (v26.4)', () => {
  it('POST /sessions response includes wallets array and walletId backward compat', async () => {
    const res = await app.request('/v1/sessions', {
      method: 'POST',
      headers: masterAuthJsonHeaders(),
      body: JSON.stringify({ walletIds: [walletA, walletB] }),
    });
    expect(res.status).toBe(201);
    const body = await json(res);

    // walletId backward compat field = default wallet (first in array)
    expect(body.walletId).toBe(walletA);

    // wallets array present with 2 entries
    const walletsList = body.wallets as Array<{ id: string; name: string; isDefault: boolean }>;
    expect(walletsList).toHaveLength(2);

    // Default wallet (walletA) has isDefault=true
    const defaultWallet = walletsList.find((w) => w.id === walletA)!;
    expect(defaultWallet).toBeDefined();
    expect(defaultWallet.isDefault).toBe(true);
    expect(defaultWallet.name).toBe('Wallet Alpha');

    // Non-default wallet (walletB) has isDefault=false
    const otherWallet = walletsList.find((w) => w.id === walletB)!;
    expect(otherWallet).toBeDefined();
    expect(otherWallet.isDefault).toBe(false);
    expect(otherWallet.name).toBe('Wallet Beta');
  });

  it('GET /sessions listing includes wallets array + walletId/walletName backward compat', async () => {
    // Create a multi-wallet session
    const createRes = await app.request('/v1/sessions', {
      method: 'POST',
      headers: masterAuthJsonHeaders(),
      body: JSON.stringify({ walletIds: [walletA, walletB] }),
    });
    expect(createRes.status).toBe(201);

    // List sessions
    const listRes = await app.request('/v1/sessions', {
      headers: masterAuthHeader(),
    });
    expect(listRes.status).toBe(200);
    const sessions = (await listRes.json()) as Array<Record<string, unknown>>;
    expect(sessions.length).toBeGreaterThanOrEqual(1);

    const session = sessions[0]!;

    // walletId backward compat = default wallet
    expect(session.walletId).toBe(walletA);

    // walletName backward compat = default wallet name
    expect(session.walletName).toBe('Wallet Alpha');

    // wallets array present with 2 entries
    const walletsList = session.wallets as Array<{ id: string; name: string; isDefault: boolean }>;
    expect(walletsList).toHaveLength(2);
    expect(walletsList.find((w) => w.id === walletA)!.isDefault).toBe(true);
    expect(walletsList.find((w) => w.id === walletB)!.isDefault).toBe(false);
  });

  it('PUT /sessions/:id/renew issues JWT with wlt claim for new default wallet', async () => {
    // Create session with 2 wallets (walletA is default)
    const createRes = await app.request('/v1/sessions', {
      method: 'POST',
      headers: masterAuthJsonHeaders(),
      body: JSON.stringify({ walletIds: [walletA, walletB], ttl: SESSION_TTL }),
    });
    expect(createRes.status).toBe(201);
    const created = await json(createRes);
    const sessionId = created.id as string;
    const token = created.token as string;

    // Change default wallet to walletB
    const patchRes = await app.request(`/v1/sessions/${sessionId}/wallets/${walletB}/default`, {
      method: 'PATCH',
      headers: masterAuthHeader(),
    });
    expect(patchRes.status).toBe(200);

    // Advance time past 50% TTL (> 1800 seconds)
    vi.advanceTimersByTime(1801 * 1000);

    // Renew session
    const renewRes = await app.request(`/v1/sessions/${sessionId}/renew`, {
      method: 'PUT',
      headers: bearerHeader(token),
    });
    expect(renewRes.status).toBe(200);
    const renewed = await json(renewRes);
    const newToken = renewed.token as string;

    // Decode JWT to verify wlt claim points to walletB (new default)
    const payload = await jwtManager.verifyToken(newToken);
    expect(payload.wlt).toBe(walletB);
  });

  it('backward compat: walletId is UUID string, walletName is string or null', async () => {
    // Create session with single wallet
    const createRes = await app.request('/v1/sessions', {
      method: 'POST',
      headers: masterAuthJsonHeaders(),
      body: JSON.stringify({ walletId: walletA }),
    });
    expect(createRes.status).toBe(201);

    // List sessions
    const listRes = await app.request('/v1/sessions', {
      headers: masterAuthHeader(),
    });
    expect(listRes.status).toBe(200);
    const sessions = (await listRes.json()) as Array<Record<string, unknown>>;
    const session = sessions[0]!;

    // walletId is a valid UUID string
    expect(typeof session.walletId).toBe('string');
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    expect(uuidRegex.test(session.walletId as string)).toBe(true);

    // walletName is string or null
    expect(
      typeof session.walletName === 'string' || session.walletName === null,
    ).toBe(true);

    // When wallet exists, walletName should be a non-empty string
    expect(session.walletName).toBe('Wallet Alpha');

    // wallets array also available for clients that support it
    const walletsList = session.wallets as Array<{ id: string }>;
    expect(walletsList).toBeDefined();
    expect(walletsList).toHaveLength(1);
    expect(walletsList[0]!.id).toBe(session.walletId);
  });

  it('POST /sessions and GET /sessions return consistent wallet data', async () => {
    // Create session with 2 wallets
    const createRes = await app.request('/v1/sessions', {
      method: 'POST',
      headers: masterAuthJsonHeaders(),
      body: JSON.stringify({ walletIds: [walletA, walletB] }),
    });
    expect(createRes.status).toBe(201);
    const created = await json(createRes);
    const createdWallets = created.wallets as Array<{ id: string; name: string; isDefault: boolean }>;

    // List sessions
    const listRes = await app.request('/v1/sessions', {
      headers: masterAuthHeader(),
    });
    expect(listRes.status).toBe(200);
    const sessions = (await listRes.json()) as Array<Record<string, unknown>>;
    const session = sessions[0]!;
    const listedWallets = session.wallets as Array<{ id: string; name: string; isDefault: boolean }>;

    // Both should have the same number of wallets
    expect(listedWallets).toHaveLength(createdWallets.length);

    // Both should have the same wallet IDs
    const createdIds = createdWallets.map((w) => w.id).sort();
    const listedIds = listedWallets.map((w) => w.id).sort();
    expect(listedIds).toEqual(createdIds);

    // Both should have the same default wallet
    const createdDefault = createdWallets.find((w) => w.isDefault)!;
    const listedDefault = listedWallets.find((w) => w.isDefault)!;
    expect(listedDefault.id).toBe(createdDefault.id);
    expect(listedDefault.name).toBe(createdDefault.name);

    // walletId backward compat should match in both responses
    expect(session.walletId).toBe(created.walletId);
  });

  it('single-wallet session: walletId backward compat works without wallets array parsing', async () => {
    // Simulate a legacy client that only reads walletId from create response
    const createRes = await app.request('/v1/sessions', {
      method: 'POST',
      headers: masterAuthJsonHeaders(),
      body: JSON.stringify({ walletId: walletA }),
    });
    expect(createRes.status).toBe(201);
    const created = await json(createRes);

    // Legacy client uses walletId only
    const legacyWalletId = created.walletId as string;
    expect(legacyWalletId).toBe(walletA);

    // wallets array still present for new clients
    const walletsList = created.wallets as Array<{ id: string; isDefault: boolean }>;
    expect(walletsList).toHaveLength(1);
    expect(walletsList[0]!.id).toBe(legacyWalletId);
    expect(walletsList[0]!.isDefault).toBe(true);
  });
});
