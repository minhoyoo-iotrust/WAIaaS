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
 * 8. Agent Identity CRUD lifecycle (E19)
 * 9. Provider-trust mechanism verification (E16)
 * 10. On-chain route handlers (agent info, reputation, validation)
 *
 * @see Phase 319-01
 */

import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';

// Mock viem's createPublicClient before any imports
const { mockReadContract } = vi.hoisted(() => ({
  mockReadContract: vi.fn(),
}));
vi.mock('viem', async (importOriginal) => {
  const actual = await importOriginal<typeof import('viem')>();
  return {
    ...actual,
    createPublicClient: vi.fn().mockReturnValue({
      readContract: mockReadContract,
    }),
  };
});
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
  mockReadContract.mockReset();
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

// ---------------------------------------------------------------------------
// Tests: Agent Identity CRUD lifecycle (E19)
// ---------------------------------------------------------------------------

describe('Agent Identity CRUD lifecycle (E19)', () => {
  it('seedAgentIdentity creates valid agent_identities row with all columns', () => {
    const identityId = seedAgentIdentity(sqlite, walletA, {
      chainAgentId: '100',
      registryAddress: '0xAbCdEf1234567890',
      chainId: 137,
      status: 'REGISTERED',
    });
    expect(identityId).toBeTruthy();

    const row = sqlite
      .prepare('SELECT * FROM agent_identities WHERE id = ?')
      .get(identityId) as Record<string, unknown>;
    expect(row).toBeDefined();
    expect(row.wallet_id).toBe(walletA);
    expect(row.chain_agent_id).toBe('100');
    expect(row.registry_address).toBe('0xAbCdEf1234567890');
    expect(row.chain_id).toBe(137);
    expect(row.status).toBe('REGISTERED');
    expect(row.created_at).toBeGreaterThan(0);
    expect(row.updated_at).toBeGreaterThan(0);
  });

  it('agent_identities status can be updated from REGISTERED to WALLET_LINKED', () => {
    const identityId = seedAgentIdentity(sqlite, walletA, {
      chainAgentId: '101',
      status: 'REGISTERED',
    });

    // Update status
    const ts = Math.floor(Date.now() / 1000);
    sqlite
      .prepare('UPDATE agent_identities SET status = ?, updated_at = ? WHERE id = ?')
      .run('WALLET_LINKED', ts, identityId);

    const row = sqlite
      .prepare('SELECT status, updated_at FROM agent_identities WHERE id = ?')
      .get(identityId) as { status: string; updated_at: number };
    expect(row.status).toBe('WALLET_LINKED');
    expect(row.updated_at).toBe(ts);
  });

  it('agent_identities can be deleted', () => {
    const identityId = seedAgentIdentity(sqlite, walletA, {
      chainAgentId: '102',
    });

    // Verify exists
    const before = sqlite
      .prepare('SELECT id FROM agent_identities WHERE id = ?')
      .get(identityId);
    expect(before).toBeDefined();

    // Delete
    sqlite.prepare('DELETE FROM agent_identities WHERE id = ?').run(identityId);

    // Verify gone
    const after = sqlite
      .prepare('SELECT id FROM agent_identities WHERE id = ?')
      .get(identityId);
    expect(after).toBeUndefined();
  });

  it('agent_identities respects wallets FK cascade on wallet delete', () => {
    // Create a separate wallet for FK cascade test
    const tempWalletId = generateId();
    seedWallet(sqlite, tempWalletId, 'Temp Wallet', '0xtemp', 'ethereum', 'mainnet');
    seedAgentIdentity(sqlite, tempWalletId, { chainAgentId: '103' });

    // Verify identity exists
    const before = sqlite
      .prepare('SELECT COUNT(*) as cnt FROM agent_identities WHERE wallet_id = ?')
      .get(tempWalletId) as { cnt: number };
    expect(before.cnt).toBe(1);

    // Delete wallet -- FK cascade should remove identities
    sqlite.prepare('DELETE FROM wallets WHERE id = ?').run(tempWalletId);

    const after = sqlite
      .prepare('SELECT COUNT(*) as cnt FROM agent_identities WHERE wallet_id = ?')
      .get(tempWalletId) as { cnt: number };
    expect(after.cnt).toBe(0);
  });

  it('agent_identities UNIQUE index prevents duplicate (registry_address, chain_agent_id)', () => {
    seedAgentIdentity(sqlite, walletA, {
      chainAgentId: '104',
      registryAddress: '0xUniqueTest',
    });

    // Second insert with same registry_address + chain_agent_id should fail
    expect(() => {
      seedAgentIdentity(sqlite, walletA, {
        chainAgentId: '104',
        registryAddress: '0xUniqueTest',
      });
    }).toThrow(/UNIQUE constraint failed/);
  });
});

// ---------------------------------------------------------------------------
// Tests: Provider-trust mechanism verification (E16)
// ---------------------------------------------------------------------------

describe('Provider-trust mechanism verification (E16)', () => {
  it('erc8004_agent provider metadata has mcpExpose: true for auto-registration', async () => {
    // Import the provider to verify metadata
    const { Erc8004ActionProvider } = await import('@waiaas/actions');
    const provider = new Erc8004ActionProvider({
      enabled: true,
      identityRegistryAddress: '0x1234',
      reputationRegistryAddress: '0x5678',
      validationRegistryAddress: '',
      registrationFileBaseUrl: '',
      autoPublishRegistration: true,
      reputationCacheTtlSec: 300,
    });
    const meta = provider.metadata;
    expect(meta.name).toBe('erc8004_agent');
    expect(meta.mcpExpose).toBe(true);
    // Provider-trust bypass relies on actionProvider field being auto-tagged
    // by ActionProviderRegistry after Zod validation (generic mechanism).
    // The erc8004_agent provider name matches the settings key pattern
    // actions.erc8004_agent_enabled that SettingsService checks.
    expect(meta.requiresApiKey).toBe(false);
  });

  it('erc8004_agent actions resolve to CONTRACT_CALL with contract addresses', async () => {
    const { Erc8004ActionProvider } = await import('@waiaas/actions');
    const provider = new Erc8004ActionProvider({
      enabled: true,
      identityRegistryAddress: '0x8004A169FB4a3325136EB29fA0ceB6D2e539a432',
      reputationRegistryAddress: '0x8004BAa17C55a88189AE136b182e5fdA19dE9b63',
      validationRegistryAddress: '',
      registrationFileBaseUrl: '',
      autoPublishRegistration: true,
      reputationCacheTtlSec: 300,
    });

    // register_agent resolves to CONTRACT_CALL targeting identity registry
    const result = await provider.resolve('register_agent', {
      name: 'Test Agent',
    }, { walletId: 'w1', publicKey: '0xABC', chain: 'ethereum' });

    expect(result).toBeDefined();
    const req = Array.isArray(result) ? result[0] : result;
    expect(req!.to).toBe('0x8004A169FB4a3325136EB29fA0ceB6D2e539a432');
    expect(req!.calldata).toBeTruthy();
    // When this CONTRACT_CALL goes through the pipeline, ActionProviderRegistry
    // auto-tags it with actionProvider='erc8004_agent'. The policy engine then
    // checks if actions.erc8004_agent_enabled=true via SettingsService.
    // If enabled, CONTRACT_WHITELIST check is bypassed (provider-trust).
  });
});

// ---------------------------------------------------------------------------
// Tests: GET /v1/erc8004/agent/:agentId (on-chain route)
// ---------------------------------------------------------------------------

describe('GET /v1/erc8004/agent/:agentId', () => {
  it('returns agent info when readContract succeeds', async () => {
    // Mock getAgentWallet + tokenURI
    mockReadContract
      .mockResolvedValueOnce('0x1234567890abcdef1234567890abcdef12345678') // getAgentWallet
      .mockResolvedValueOnce('https://example.com/agent/42.json'); // tokenURI

    // Seed local identity for metadata enrichment
    seedAgentIdentity(sqlite, walletA, {
      chainAgentId: '42',
      registryAddress: '0x8004A169FB4a3325136EB29fA0ceB6D2e539a432',
      chainId: 1,
      status: 'REGISTERED',
    });

    const res = await app.request('/v1/erc8004/agent/42', {
      headers: bearerHeader(sessionToken),
    });
    expect(res.status).toBe(200);

    const body = await json(res);
    expect(body.agentId).toBe('42');
    expect(body.wallet).toBe('0x1234567890abcdef1234567890abcdef12345678');
    expect(body.uri).toBe('https://example.com/agent/42.json');
    expect((body.metadata as Record<string, unknown>).status).toBe('REGISTERED');
    expect(body.chainId).toBe(1);
  });

  it('returns agent info without local identity (empty metadata)', async () => {
    mockReadContract
      .mockResolvedValueOnce('0xABCD')
      .mockResolvedValueOnce('ipfs://Qm...');

    const res = await app.request('/v1/erc8004/agent/99', {
      headers: bearerHeader(sessionToken),
    });
    expect(res.status).toBe(200);

    const body = await json(res);
    expect(body.agentId).toBe('99');
    expect(body.metadata).toEqual({});
    expect(body.chainId).toBe(1); // default
  });

  it('wraps readContract error as CHAIN_ERROR (502)', async () => {
    mockReadContract.mockRejectedValueOnce(new Error('execution reverted'));

    const res = await app.request('/v1/erc8004/agent/42', {
      headers: bearerHeader(sessionToken),
    });
    expect(res.status).toBe(502);

    const body = await json(res);
    // WAIaaSError serialized as { code, message, ... }
    expect(body.code ?? body.error).toBe('CHAIN_ERROR');
  });
});

// ---------------------------------------------------------------------------
// Tests: GET /v1/erc8004/agent/:agentId/reputation (on-chain route)
// ---------------------------------------------------------------------------

describe('GET /v1/erc8004/agent/:agentId/reputation', () => {
  it('returns reputation summary with getSummary mock', async () => {
    // getSummary returns [count, summaryValue, decimals]
    mockReadContract.mockResolvedValueOnce([10n, 850n, 2]);

    const res = await app.request('/v1/erc8004/agent/42/reputation', {
      headers: bearerHeader(sessionToken),
    });
    expect(res.status).toBe(200);

    const body = await json(res);
    expect(body.agentId).toBe('42');
    expect(body.count).toBe(10);
    expect(body.score).toBe('850');
    expect(body.decimals).toBe(2);
  });

  it('passes tag1/tag2 query params to response', async () => {
    mockReadContract.mockResolvedValueOnce([5n, 100n, 0]);

    const res = await app.request('/v1/erc8004/agent/42/reputation?tag1=defi&tag2=swap', {
      headers: bearerHeader(sessionToken),
    });
    expect(res.status).toBe(200);

    const body = await json(res);
    expect(body.tag1).toBe('defi');
    expect(body.tag2).toBe('swap');
  });

  it('wraps readContract error as CHAIN_ERROR (502)', async () => {
    mockReadContract.mockRejectedValueOnce(new Error('RPC timeout'));

    const res = await app.request('/v1/erc8004/agent/42/reputation', {
      headers: bearerHeader(sessionToken),
    });
    expect(res.status).toBe(502);

    const body = await json(res);
    expect(body.code ?? body.error).toBe('CHAIN_ERROR');
  });
});

// ---------------------------------------------------------------------------
// Tests: GET /v1/erc8004/validation/:requestHash (on-chain route)
// ---------------------------------------------------------------------------

describe('GET /v1/erc8004/validation/:requestHash', () => {
  const HASH = '0x0000000000000000000000000000000000000000000000000000000000000001';

  it('returns ADAPTER_NOT_AVAILABLE when validation registry not deployed (feature-gated)', async () => {
    // ERC8004_DEFAULTS.validation is '' (not deployed on mainnet)
    const res = await app.request(`/v1/erc8004/validation/${HASH}`, {
      headers: bearerHeader(sessionToken),
    });
    expect(res.status).toBe(503);

    const body = await json(res);
    expect(body.code ?? body.error).toBe('ADAPTER_NOT_AVAILABLE');
  });
});
