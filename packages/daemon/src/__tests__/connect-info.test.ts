/**
 * Integration tests for GET /v1/connect-info and POST /v1/admin/agent-prompt.
 *
 * Tests cover:
 * 1. connect-info returns session info (id, expiresAt, source)
 * 2. connect-info returns linked wallets only (not unlinked)
 * 3. connect-info returns per-wallet policies
 * 4. connect-info capabilities includes base capabilities
 * 5. connect-info capabilities reflects x402 config
 * 6. connect-info prompt contains wallet info
 * 7. connect-info rejects without session token
 * 8. agent-prompt creates single session with N wallet links
 * 9. agent-prompt prompt uses buildConnectInfoPrompt format
 * 10. connect-info after agent-prompt returns matching data
 *
 * Uses createApp() with full deps for realistic HTTP simulation.
 *
 * @see Phase 212-02 -- connect-info + agent-prompt integration
 */

import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import type { Database as DatabaseType } from 'better-sqlite3';
import argon2 from 'argon2';
import { createDatabase, pushSchema, generateId } from '../infrastructure/database/index.js';
import { JwtSecretManager } from '../infrastructure/jwt/index.js';
import { DaemonConfigSchema } from '../infrastructure/config/loader.js';
import type { DaemonConfig } from '../infrastructure/config/loader.js';
import { createApp } from '../api/server.js';
import { DatabasePolicyEngine } from '../pipeline/database-policy-engine.js';
import type { IChainAdapter } from '@waiaas/core';
import type { AdapterPool } from '../infrastructure/adapter-pool.js';
import type { OpenAPIHono } from '@hono/zod-openapi';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TEST_PASSWORD = 'test-master-password-connect-info';
const HOST = '127.0.0.1:3100';
let passwordHash: string;

// ---------------------------------------------------------------------------
// Mock helpers
// ---------------------------------------------------------------------------

function createMockAdapter(): IChainAdapter {
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
  };
}

function createMockAdapterPool(): AdapterPool {
  const adapter = createMockAdapter();
  return {
    resolve: vi.fn().mockResolvedValue(adapter),
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

// ---------------------------------------------------------------------------
// Seed helpers
// ---------------------------------------------------------------------------

function seedWallet(
  sqlite: DatabaseType,
  walletId: string,
  name: string,
  publicKey: string,
  chain = 'solana',
  environment = 'testnet',
): void {
  const ts = Math.floor(Date.now() / 1000);
  sqlite
    .prepare(
      `INSERT INTO wallets (id, name, chain, environment, default_network, public_key, status, owner_verified, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(walletId, name, chain, environment, 'devnet', publicKey, 'ACTIVE', 0, ts, ts);
}

function seedPolicy(
  sqlite: DatabaseType,
  walletId: string,
  policyType: string,
  rules: Record<string, unknown> = {},
): string {
  const policyId = generateId();
  const ts = Math.floor(Date.now() / 1000);
  sqlite
    .prepare(
      `INSERT INTO policies (id, wallet_id, type, rules, priority, enabled, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(policyId, walletId, policyType, JSON.stringify(rules), 100, 1, ts, ts);
  return policyId;
}

// ---------------------------------------------------------------------------
// Test setup
// ---------------------------------------------------------------------------

let sqlite: DatabaseType;
let db: ReturnType<typeof createDatabase>['db'];
let jwtManager: JwtSecretManager;
let policyEngine: DatabasePolicyEngine;
let app: OpenAPIHono;
let config: DaemonConfig;

let walletA: string;
let walletB: string;
let walletC: string;
let sessionToken: string;

const PK_A = 'pk-wallet-a-connect-info';
const PK_B = 'pk-wallet-b-connect-info';
const PK_C = 'pk-wallet-c-connect-info';

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

  config = DaemonConfigSchema.parse({});
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

  // Create 3 wallets
  walletA = generateId();
  walletB = generateId();
  walletC = generateId();

  seedWallet(sqlite, walletA, 'Wallet Alpha', PK_A);
  seedWallet(sqlite, walletB, 'Wallet Beta', PK_B);
  seedWallet(sqlite, walletC, 'Wallet Charlie', PK_C);

  // Create multi-wallet session with walletA (default) + walletB
  // walletC is NOT linked to the session
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
// Tests: GET /v1/connect-info
// ---------------------------------------------------------------------------

describe('GET /v1/connect-info', () => {
  it('returns session info (id, expiresAt, source)', async () => {
    const res = await app.request('/v1/connect-info', {
      headers: bearerHeader(sessionToken),
    });
    expect(res.status).toBe(200);

    const body = await json(res);
    const session = body.session as { id: string; expiresAt: number; source: string };
    expect(session.id).toBeTruthy();
    expect(typeof session.expiresAt).toBe('number');
    expect(session.source).toBe('api');
  });

  it('returns linked wallets only -- 2 out of 3 wallets', async () => {
    const res = await app.request('/v1/connect-info', {
      headers: bearerHeader(sessionToken),
    });
    expect(res.status).toBe(200);

    const body = await json(res);
    const ws = body.wallets as Array<{ id: string; name: string; chain: string; environment: string; address: string; isDefault: boolean }>;

    expect(ws.length).toBe(2);

    const ids = ws.map((w) => w.id);
    expect(ids).toContain(walletA);
    expect(ids).toContain(walletB);
    expect(ids).not.toContain(walletC);

    // Verify fields
    const wA = ws.find((w) => w.id === walletA)!;
    expect(wA.name).toBe('Wallet Alpha');
    expect(wA.chain).toBe('solana');
    expect(wA.environment).toBe('testnet');
    expect(wA.address).toBe(PK_A);
    expect(wA.isDefault).toBe(true);

    const wB = ws.find((w) => w.id === walletB)!;
    expect(wB.isDefault).toBe(false);
  });

  it('returns per-wallet policies', async () => {
    // Add policies (using valid policy types from CHECK constraint)
    seedPolicy(sqlite, walletA, 'SPENDING_LIMIT', { maxAmount: '1000000' });
    seedPolicy(sqlite, walletB, 'ALLOWED_TOKENS', { tokens: ['SOL'] });

    const res = await app.request('/v1/connect-info', {
      headers: bearerHeader(sessionToken),
    });
    expect(res.status).toBe(200);

    const body = await json(res);
    const ps = body.policies as Record<string, Array<{ type: string; rules: Record<string, unknown> }>>;

    expect(ps[walletA]).toBeDefined();
    expect(ps[walletA]!.length).toBe(1);
    expect(ps[walletA]![0]!.type).toBe('SPENDING_LIMIT');

    expect(ps[walletB]).toBeDefined();
    expect(ps[walletB]!.length).toBe(1);
    expect(ps[walletB]![0]!.type).toBe('ALLOWED_TOKENS');
  });

  it('capabilities includes base capabilities (transfer, token_transfer, balance, assets)', async () => {
    const res = await app.request('/v1/connect-info', {
      headers: bearerHeader(sessionToken),
    });
    expect(res.status).toBe(200);

    const body = await json(res);
    const caps = body.capabilities as string[];

    expect(caps).toContain('transfer');
    expect(caps).toContain('token_transfer');
    expect(caps).toContain('balance');
    expect(caps).toContain('assets');
  });

  it('capabilities includes x402 when config enabled (default)', async () => {
    // Default DaemonConfig has x402.enabled = true
    const res = await app.request('/v1/connect-info', {
      headers: bearerHeader(sessionToken),
    });
    expect(res.status).toBe(200);

    const body = await json(res);
    const caps = body.capabilities as string[];
    expect(caps).toContain('x402');
  });

  it('capabilities excludes x402 when config disabled', async () => {
    // Create app with x402 disabled
    const disabledConfig = DaemonConfigSchema.parse({ x402: { enabled: false } });
    const appNoX402 = createApp({
      db,
      sqlite,
      jwtSecretManager: jwtManager,
      masterPasswordHash: passwordHash,
      masterPassword: TEST_PASSWORD,
      config: disabledConfig,
      adapterPool: createMockAdapterPool(),
      keyStore: createMockKeyStore(),
      policyEngine,
    });

    const res = await appNoX402.request('/v1/connect-info', {
      headers: bearerHeader(sessionToken),
    });
    expect(res.status).toBe(200);

    const body = await json(res);
    const caps = body.capabilities as string[];
    expect(caps).not.toContain('x402');
  });

  it('prompt contains wallet names, UUIDs, and addresses', async () => {
    const res = await app.request('/v1/connect-info', {
      headers: bearerHeader(sessionToken),
    });
    expect(res.status).toBe(200);

    const body = await json(res);
    const prompt = body.prompt as string;

    expect(prompt).toContain('Wallet Alpha');
    expect(prompt).toContain('Wallet Beta');
    expect(prompt).toContain(PK_A);
    expect(prompt).toContain(PK_B);
    expect(prompt).toContain('WAIaaS daemon');

    // UUID must appear in prompt (ID: line)
    expect(prompt).toContain(`ID: ${walletA}`);
    expect(prompt).toContain(`ID: ${walletB}`);

    // Network list must appear
    expect(prompt).toContain('Networks:');
    expect(prompt).toContain('devnet');
    expect(prompt).toContain('testnet');

    // walletId usage instructions reference UUID
    expect(prompt).toContain('UUID from the ID field above');
    expect(prompt).toContain('?network=');
  });

  it('wallets include availableNetworks array', async () => {
    const res = await app.request('/v1/connect-info', {
      headers: bearerHeader(sessionToken),
    });
    expect(res.status).toBe(200);

    const body = await json(res);
    const ws = body.wallets as Array<{ id: string; availableNetworks: string[] }>;

    const wA = ws.find((w) => w.id === walletA)!;
    expect(wA.availableNetworks).toBeDefined();
    expect(Array.isArray(wA.availableNetworks)).toBe(true);
    expect(wA.availableNetworks.length).toBeGreaterThan(0);
    expect(wA.availableNetworks).toContain('devnet');
    expect(wA.availableNetworks).toContain('testnet');
  });

  it('rejects without session token (401)', async () => {
    const res = await app.request('/v1/connect-info', {
      headers: { Host: HOST },
    });
    expect(res.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// Tests: POST /v1/admin/agent-prompt
// ---------------------------------------------------------------------------

describe('POST /v1/admin/agent-prompt', () => {
  it('creates single session with N wallet links', async () => {
    // Count sessions before
    const beforeCount = sqlite
      .prepare('SELECT count(*) AS cnt FROM sessions')
      .get() as { cnt: number };

    const res = await app.request('/v1/admin/agent-prompt', {
      method: 'POST',
      headers: masterAuthJsonHeaders(),
      body: JSON.stringify({
        walletIds: [walletA, walletB],
      }),
    });
    expect(res.status).toBe(201);

    const body = await json(res);
    expect(body.sessionsCreated).toBe(1);
    expect(body.sessionReused).toBe(false);
    expect(body.walletCount).toBe(2);

    // Count sessions after -- exactly 1 new session
    const afterCount = sqlite
      .prepare('SELECT count(*) AS cnt FROM sessions')
      .get() as { cnt: number };
    expect(afterCount.cnt - beforeCount.cnt).toBe(1);

    // Verify session_wallets rows were created for the new session
    // Find the newest session (highest rowid) to identify the agent-prompt session
    const newestSession = sqlite
      .prepare('SELECT id FROM sessions ORDER BY rowid DESC LIMIT 1')
      .get() as { id: string };
    const swCount = sqlite
      .prepare('SELECT count(*) AS cnt FROM session_wallets WHERE session_id = ?')
      .get(newestSession.id) as { cnt: number };
    expect(swCount.cnt).toBe(2);

    // Verify the response structure
    expect(body.expiresAt).toBeGreaterThan(0);
    expect(typeof body.prompt).toBe('string');
    expect((body.prompt as string).length).toBeGreaterThan(0);
  });

  it('prompt uses buildConnectInfoPrompt format (wallet names + capabilities)', async () => {
    const res = await app.request('/v1/admin/agent-prompt', {
      method: 'POST',
      headers: masterAuthJsonHeaders(),
      body: JSON.stringify({
        walletIds: [walletA, walletB],
      }),
    });
    expect(res.status).toBe(201);

    const body = await json(res);
    const prompt = body.prompt as string;

    // buildConnectInfoPrompt format includes wallet names, UUIDs, addresses, capabilities
    expect(prompt).toContain('Wallet Alpha');
    expect(prompt).toContain('Wallet Beta');
    expect(prompt).toContain(PK_A);
    expect(prompt).toContain(PK_B);
    expect(prompt).toContain('Available capabilities:');
    expect(prompt).toContain('transfer');
    expect(prompt).toContain('WAIaaS daemon');

    // UUID must be in prompt
    expect(prompt).toContain(`ID: ${walletA}`);
    expect(prompt).toContain(`ID: ${walletB}`);

    // Network list must be in prompt
    expect(prompt).toContain('Networks:');

    // Session token and ID appended
    expect(prompt).toContain('Session Token:');
    expect(prompt).toContain('Session ID:');
  });

  it('reuses existing valid session instead of creating new one', async () => {
    // First call creates a new session
    const res1 = await app.request('/v1/admin/agent-prompt', {
      method: 'POST',
      headers: masterAuthJsonHeaders(),
      body: JSON.stringify({ walletIds: [walletA, walletB] }),
    });
    expect(res1.status).toBe(201);

    const body1 = await json(res1);
    expect(body1.sessionsCreated).toBe(1);
    expect(body1.sessionReused).toBe(false);

    const sessionsBeforeReuse = sqlite
      .prepare('SELECT count(*) AS cnt FROM sessions')
      .get() as { cnt: number };

    // Second call should reuse the session
    const res2 = await app.request('/v1/admin/agent-prompt', {
      method: 'POST',
      headers: masterAuthJsonHeaders(),
      body: JSON.stringify({ walletIds: [walletA, walletB] }),
    });
    expect(res2.status).toBe(201);

    const body2 = await json(res2);
    expect(body2.sessionsCreated).toBe(0);
    expect(body2.sessionReused).toBe(true);

    // No new session created
    const sessionsAfterReuse = sqlite
      .prepare('SELECT count(*) AS cnt FROM sessions')
      .get() as { cnt: number };
    expect(sessionsAfterReuse.cnt).toBe(sessionsBeforeReuse.cnt);

    // Token from reused session should work
    const prompt = body2.prompt as string;
    const tokenMatch = prompt.match(/Session Token: (wai_sess_\S+)/);
    expect(tokenMatch).toBeTruthy();
    const reusedToken = tokenMatch![1]!;

    const balanceRes = await app.request('/v1/connect-info', {
      headers: bearerHeader(reusedToken),
    });
    expect(balanceRes.status).toBe(200);
  });

  it('creates new session when existing session covers only partial wallets', async () => {
    // Create session with walletA only
    await app.request('/v1/admin/agent-prompt', {
      method: 'POST',
      headers: masterAuthJsonHeaders(),
      body: JSON.stringify({ walletIds: [walletA] }),
    });

    // Request session for both walletA and walletB -- cannot reuse
    const res = await app.request('/v1/admin/agent-prompt', {
      method: 'POST',
      headers: masterAuthJsonHeaders(),
      body: JSON.stringify({ walletIds: [walletA, walletB] }),
    });
    expect(res.status).toBe(201);

    const body = await json(res);
    expect(body.sessionsCreated).toBe(1);
    expect(body.sessionReused).toBe(false);
  });

  it('end-to-end: agent-prompt -> connect-info returns matching data', async () => {
    // Step 1: Create via agent-prompt
    const promptRes = await app.request('/v1/admin/agent-prompt', {
      method: 'POST',
      headers: masterAuthJsonHeaders(),
      body: JSON.stringify({
        walletIds: [walletA, walletB],
      }),
    });
    expect(promptRes.status).toBe(201);

    const promptBody = await json(promptRes);
    const prompt = promptBody.prompt as string;

    // Extract session token from the prompt text
    const tokenMatch = prompt.match(/Session Token: (wai_sess_\S+)/);
    expect(tokenMatch).toBeTruthy();
    const agentToken = tokenMatch![1]!;

    // Step 2: Use the token to call connect-info
    const infoRes = await app.request('/v1/connect-info', {
      headers: bearerHeader(agentToken),
    });
    expect(infoRes.status).toBe(200);

    const infoBody = await json(infoRes);

    // Verify wallets match
    const ws = infoBody.wallets as Array<{ id: string; name: string; isDefault: boolean }>;
    expect(ws.length).toBe(2);
    const ids = ws.map((w) => w.id);
    expect(ids).toContain(walletA);
    expect(ids).toContain(walletB);

    // Default wallet is walletA
    const defaultW = ws.find((w) => w.isDefault);
    expect(defaultW?.id).toBe(walletA);

    // Prompt is non-empty
    expect((infoBody.prompt as string).length).toBeGreaterThan(0);

    // Capabilities present
    const caps = infoBody.capabilities as string[];
    expect(caps).toContain('transfer');
    expect(caps).toContain('balance');
  });
});
