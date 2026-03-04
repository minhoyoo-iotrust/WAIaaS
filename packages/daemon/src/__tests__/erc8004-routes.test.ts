/**
 * Integration tests for ERC-8004 read-only REST API routes.
 *
 * Tests cover:
 * 1. Registration file endpoint returns valid JSON with type, name, services
 * 2. Registration file for wallet with agent_identities includes registrations
 * 3. Registration file for wallet without agent_identities omits registrations
 * 4. Agent info endpoint returns 401 without session token
 * 5. Reputation endpoint returns 401 without session token
 * 6. Validation endpoint returns 401 without session token
 * 7. Registration file endpoint returns 401 without session token
 *
 * On-chain readContract calls are NOT tested here (mocked).
 * Full E2E tests with Anvil fork are in Phase 323.
 *
 * @see Phase 319-01
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

const TEST_PASSWORD = 'test-master-password-erc8004-routes';
const HOST = '127.0.0.1:3100';
let passwordHash: string;

// ---------------------------------------------------------------------------
// Mock helpers
// ---------------------------------------------------------------------------

function createMockAdapter(): IChainAdapter {
  return {
    chain: 'solana' as const,
    network: 'solana-devnet' as const,
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
  chain = 'ethereum',
  environment = 'mainnet',
): void {
  const ts = Math.floor(Date.now() / 1000);
  sqlite
    .prepare(
      `INSERT INTO wallets (id, name, chain, environment, public_key, status, owner_verified, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(walletId, name, chain, environment, publicKey, 'ACTIVE', 0, ts, ts);
}

function seedAgentIdentity(
  sqlite: DatabaseType,
  walletId: string,
  opts: { chainAgentId?: string; registryAddress?: string; chainId?: number; status?: string } = {},
): string {
  const id = generateId();
  const ts = Math.floor(Date.now() / 1000);
  sqlite
    .prepare(
      `INSERT INTO agent_identities (id, wallet_id, chain_agent_id, registry_address, chain_id, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      id,
      walletId,
      opts.chainAgentId ?? '42',
      opts.registryAddress ?? '0x8004A169FB4a3325136EB29fA0ceB6D2e539a432',
      opts.chainId ?? 1,
      opts.status ?? 'REGISTERED',
      ts,
      ts,
    );
  return id;
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
let sessionToken: string;

const PK_A = '0x0000000000000000000000000000000000000001';

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
  vi.setSystemTime(new Date('2026-03-04T12:00:00Z'));

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

  // Create a wallet
  walletA = generateId();
  seedWallet(sqlite, walletA, 'ERC-8004 Test Wallet', PK_A);

  // Create session linked to walletA
  const createRes = await app.request('/v1/sessions', {
    method: 'POST',
    headers: masterAuthJsonHeaders(),
    body: JSON.stringify({
      walletIds: [walletA],
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
// Tests: GET /v1/erc8004/registration-file/:walletId
// ---------------------------------------------------------------------------

describe('GET /v1/erc8004/registration-file/:walletId', () => {
  it('returns valid registration file JSON with type, name, services', async () => {
    const res = await app.request(`/v1/erc8004/registration-file/${walletA}`, {
      headers: bearerHeader(sessionToken),
    });
    expect(res.status).toBe(200);

    const body = await json(res);
    expect(body.type).toBe('https://eips.ethereum.org/EIPS/eip-8004#registration-v1');
    expect(body.name).toBe('ERC-8004 Test Wallet');
    expect(body.active).toBe(true);

    // Services array should include mcp and rest-api
    const services = body.services as Array<{ name: string; endpoint: string }>;
    expect(Array.isArray(services)).toBe(true);
    expect(services.length).toBeGreaterThanOrEqual(2);

    const mcpService = services.find((s) => s.name === 'mcp');
    expect(mcpService).toBeDefined();
    expect(mcpService!.endpoint).toContain('/mcp');

    const restService = services.find((s) => s.name === 'rest-api');
    expect(restService).toBeDefined();
    expect(restService!.endpoint).toContain('/v1');

    // supportedTrust
    expect(body.supportedTrust).toEqual(['reputation']);

    // No registrations field without agent_identities
    expect(body.registrations).toBeUndefined();
  });

  it('includes registrations array when agent_identities record exists', async () => {
    seedAgentIdentity(sqlite, walletA, {
      chainAgentId: '99',
      registryAddress: '0x8004A169FB4a3325136EB29fA0ceB6D2e539a432',
      chainId: 1,
      status: 'REGISTERED',
    });

    const res = await app.request(`/v1/erc8004/registration-file/${walletA}`, {
      headers: bearerHeader(sessionToken),
    });
    expect(res.status).toBe(200);

    const body = await json(res);
    expect(body.registrations).toBeDefined();

    const regs = body.registrations as Array<{ agentId: string; agentRegistry: string }>;
    expect(regs.length).toBe(1);
    expect(regs[0]!.agentId).toBe('99');
    expect(regs[0]!.agentRegistry).toContain('eip155:1:0x8004A169FB4a3325136EB29fA0ceB6D2e539a432');
  });

  it('omits registrations for wallet without agent_identities', async () => {
    const res = await app.request(`/v1/erc8004/registration-file/${walletA}`, {
      headers: bearerHeader(sessionToken),
    });
    expect(res.status).toBe(200);

    const body = await json(res);
    expect(body.registrations).toBeUndefined();
  });

  it('returns 404 for non-existent wallet', async () => {
    const fakeId = generateId();
    const res = await app.request(`/v1/erc8004/registration-file/${fakeId}`, {
      headers: bearerHeader(sessionToken),
    });
    expect(res.status).toBe(404);
  });

  it('returns 401 without session token', async () => {
    const res = await app.request(`/v1/erc8004/registration-file/${walletA}`, {
      headers: { Host: HOST },
    });
    expect(res.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// Tests: Auth enforcement on all 4 endpoints
// ---------------------------------------------------------------------------

describe('ERC-8004 auth enforcement', () => {
  it('GET /v1/erc8004/agent/:agentId returns 401 without session token', async () => {
    const res = await app.request('/v1/erc8004/agent/42', {
      headers: { Host: HOST },
    });
    expect(res.status).toBe(401);
  });

  it('GET /v1/erc8004/agent/:agentId/reputation returns 401 without session token', async () => {
    const res = await app.request('/v1/erc8004/agent/42/reputation', {
      headers: { Host: HOST },
    });
    expect(res.status).toBe(401);
  });

  it('GET /v1/erc8004/validation/:requestHash returns 401 without session token', async () => {
    const res = await app.request(
      '/v1/erc8004/validation/0x0000000000000000000000000000000000000000000000000000000000000001',
      { headers: { Host: HOST } },
    );
    expect(res.status).toBe(401);
  });

  it('GET /v1/erc8004/registration-file/:walletId returns 401 without session token', async () => {
    const res = await app.request(`/v1/erc8004/registration-file/${walletA}`, {
      headers: { Host: HOST },
    });
    expect(res.status).toBe(401);
  });
});
