/**
 * Integration tests for userop.ts route handlers.
 *
 * Tests the actual route handler logic (build + sign) with mocked external
 * dependencies (SmartAccountService, viem, keyStore).
 * Covers lines 116-308 (build handler) and 351-604 (sign handler).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { Database as DatabaseType } from 'better-sqlite3';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { createDatabase, pushSchema } from '../infrastructure/database/index.js';
import type * as schema from '../infrastructure/database/schema.js';

// ---------------------------------------------------------------------------
// Mock heavy external dependencies BEFORE importing the route module
// ---------------------------------------------------------------------------

// Constants used in mocks -- vi.mock is hoisted so we use inline literals below.
const MOCK_SENDER = '0x1234567890abcdef1234567890abcdef12345678';
const MOCK_CALL_DATA = '0xaabbccdd';
const MOCK_ENTRY_POINT = '0x0000000071727De22E5E9d8BAf0edAc6f37da032';

// Mock viem/accounts
vi.mock('viem/accounts', () => ({
  privateKeyToAccount: vi.fn(() => ({
    address: '0x1234567890abcdef1234567890abcdef12345678',
    signMessage: vi.fn(),
    signTransaction: vi.fn(),
    signTypedData: vi.fn(),
  })),
}));

// Mock viem
vi.mock('viem', async (importOriginal) => {
  const actual = await importOriginal<typeof import('viem')>();
  return {
    ...actual,
    createPublicClient: vi.fn(() => ({
      readContract: vi.fn(async () => 42n),
      getCode: vi.fn(async () => '0x'),
    })),
  };
});

// Mock viem/account-abstraction
vi.mock('viem/account-abstraction', () => ({
  entryPoint07Address: '0x0000000071727De22E5E9d8BAf0edAc6f37da032',
  entryPoint07Abi: [],
}));

// Mock SmartAccountService
vi.mock('../infrastructure/smart-account/smart-account-service.js', () => ({
  SmartAccountService: vi.fn().mockImplementation(() => ({
    createSmartAccount: vi.fn(async () => ({
      address: '0x1234567890abcdef1234567890abcdef12345678',
      entryPoint: '0x0000000071727De22E5E9d8BAf0edAc6f37da032',
      account: {
        encodeCalls: vi.fn(async () => '0xaabbccdd'),
        getFactoryArgs: vi.fn(async () => ({
          factory: '0xfactory0000000000000000000000000000000001',
          factoryData: '0xfactorydata1234',
        })),
        signUserOperation: vi.fn(async () => '0xsig1234'),
      },
    })),
  })),
}));

// Mock @waiaas/adapter-evm
vi.mock('@waiaas/adapter-evm', () => ({
  EVM_CHAIN_MAP: {
    'ethereum-sepolia': { viemChain: { id: 11155111, name: 'Sepolia' } },
    'ethereum-mainnet': { viemChain: { id: 1, name: 'Ethereum' } },
  },
}));

// Mock smart-account-clients to avoid transitive viem/account-abstraction import
vi.mock('../infrastructure/smart-account/smart-account-clients.js', () => ({
  createBundlerClientForWallet: vi.fn(),
  createPaymasterClientForWallet: vi.fn(),
}));

// Now import the route factory
import { userOpRoutes } from '../api/routes/userop.js';
import type { UserOpRouteDeps } from '../api/routes/userop.js';
import { OpenAPIHono } from '@hono/zod-openapi';
import { errorHandler } from '../api/middleware/error-handler.js';

// ---------------------------------------------------------------------------
// Test setup
// ---------------------------------------------------------------------------

let sqlite: DatabaseType;
let db: BetterSQLite3Database<typeof schema>;
let app: ReturnType<typeof userOpRoutes>;
let deps: UserOpRouteDeps;
const WALLET_ID = '019548e8-f7a0-7000-8000-000000000001';

function seedWallet(overrides: Record<string, unknown> = {}) {
  const ts = Math.floor(Date.now() / 1000);
  const defaults: Record<string, unknown> = {
    id: WALLET_ID,
    name: 'test-smart',
    chain: 'ethereum',
    environment: 'testnet',
    public_key: '0x1234567890abcdef1234567890abcdef12345678',
    status: 'ACTIVE',
    owner_verified: 0,
    account_type: 'smart',
    aa_provider: null,
    deployed: 0,
    created_at: ts,
    updated_at: ts,
    ...overrides,
  };

  const cols = Object.keys(defaults);
  const placeholders = cols.map(() => '?').join(', ');
  sqlite.prepare(
    `INSERT INTO wallets (${cols.join(', ')}) VALUES (${placeholders})`,
  ).run(...Object.values(defaults));
}

function seedBuildRecord(overrides: Record<string, unknown> = {}) {
  const now = Math.floor(Date.now() / 1000);
  const defaults: Record<string, unknown> = {
    id: '019548e8-f7a0-7000-8000-000000000099',
    wallet_id: WALLET_ID,
    sender: MOCK_SENDER,
    nonce: '0x2a',
    call_data: MOCK_CALL_DATA,
    entry_point: MOCK_ENTRY_POINT,
    created_at: now,
    expires_at: now + 600,
    used: 0,
    ...overrides,
  };

  sqlite.prepare(
    `INSERT INTO userop_builds (id, wallet_id, sender, nonce, call_data, entry_point, created_at, expires_at, used)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    defaults.id, defaults.wallet_id, defaults.sender, defaults.nonce,
    defaults.call_data, defaults.entry_point, defaults.created_at,
    defaults.expires_at, defaults.used,
  );
}

function makeRequest(path: string, body: unknown) {
  return new Request(`http://localhost${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  const conn = createDatabase(':memory:');
  sqlite = conn.sqlite;
  db = conn.db as BetterSQLite3Database<typeof schema>;
  pushSchema(sqlite);

  deps = {
    db,
    sqlite,
    keyStore: {
      decryptPrivateKey: vi.fn(async () => new Uint8Array(32)),
      releaseKey: vi.fn(),
      generateKeyPair: vi.fn(),
      hasKey: vi.fn(),
      deleteKey: vi.fn(),
      lockAll: vi.fn(),
      sodiumAvailable: true,
    } as any,
    masterPassword: 'test-password',
    rpcConfig: {
      evm_ethereum_sepolia: 'https://rpc.sepolia.example.com',
    },
    metricsCounter: { increment: vi.fn() } as any,
    notificationService: { notify: vi.fn() } as any,
    eventBus: { emit: vi.fn() } as any,
  };

  // Wrap in parent app with error handler to match route paths
  const parent = new OpenAPIHono();
  parent.onError(errorHandler);
  const routes = userOpRoutes(deps);
  parent.route('/v1', routes);
  app = parent as any;
});

afterEach(() => {
  try { sqlite.close(); } catch { /* already closed */ }
});

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

async function json(res: Response) {
  return (await res.json()) as Record<string, unknown>;
}

// ===========================================================================
// POST /v1/wallets/:id/userop/build
// ===========================================================================

describe('POST /v1/wallets/:id/userop/build (route handler)', () => {
  it('returns 200 with unsigned UserOp for valid EVM smart wallet', async () => {
    seedWallet();
    const res = await app.request(
      makeRequest(`/v1/wallets/${WALLET_ID}/userop/build`, {
        request: {
          type: 'TRANSFER',
          to: '0x0000000000000000000000000000000000000001',
          amount: '1000000000000000000',
        },
        network: 'ethereum-sepolia',
      }),
    );

    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.sender).toBe(MOCK_SENDER);
    expect(body.callData).toBe(MOCK_CALL_DATA);
    expect(body.entryPoint).toBe(MOCK_ENTRY_POINT);
    expect(body.buildId).toBeDefined();
    expect(body.nonce).toBeDefined();
    // factory/factoryData should be present for undeployed wallet
    expect(body.factory).toBeDefined();
    expect(body.factoryData).toBeDefined();
  });

  it('returns WALLET_NOT_FOUND for non-existent wallet', async () => {
    const res = await app.request(
      makeRequest(`/v1/wallets/${WALLET_ID}/userop/build`, {
        request: {
          type: 'TRANSFER',
          to: '0x0000000000000000000000000000000000000001',
          amount: '1000',
        },
        network: 'ethereum-sepolia',
      }),
    );

    expect(res.status).toBe(404);
    const body = await json(res);
    expect(body.code).toBe('WALLET_NOT_FOUND');
  });

  it('rejects EOA wallet with ACTION_VALIDATION_FAILED', async () => {
    seedWallet({ account_type: 'eoa' });
    const res = await app.request(
      makeRequest(`/v1/wallets/${WALLET_ID}/userop/build`, {
        request: {
          type: 'TRANSFER',
          to: '0x0000000000000000000000000000000000000001',
          amount: '1000',
        },
        network: 'ethereum-sepolia',
      }),
    );

    expect(res.status).toBe(400);
    const body = await json(res);
    expect(body.code).toBe('ACTION_VALIDATION_FAILED');
  });

  it('rejects Solana wallet with ACTION_VALIDATION_FAILED', async () => {
    seedWallet({ chain: 'solana' });
    const res = await app.request(
      makeRequest(`/v1/wallets/${WALLET_ID}/userop/build`, {
        request: {
          type: 'TRANSFER',
          to: '0x0000000000000000000000000000000000000001',
          amount: '1000',
        },
        network: 'ethereum-sepolia',
      }),
    );

    expect(res.status).toBe(400);
    const body = await json(res);
    expect(body.code).toBe('ACTION_VALIDATION_FAILED');
  });

  it('persists build record in userop_builds table', async () => {
    seedWallet();
    const res = await app.request(
      makeRequest(`/v1/wallets/${WALLET_ID}/userop/build`, {
        request: {
          type: 'TRANSFER',
          to: '0x0000000000000000000000000000000000000001',
          amount: '1000000000000000000',
        },
        network: 'ethereum-sepolia',
      }),
    );

    expect(res.status).toBe(200);
    const body = await json(res);
    const buildId = body.buildId as string;

    // Verify build record in DB
    const row = sqlite.prepare('SELECT * FROM userop_builds WHERE id = ?').get(buildId) as Record<string, unknown>;
    expect(row).toBeDefined();
    expect(row.wallet_id).toBe(WALLET_ID);
    expect(row.sender).toBe(MOCK_SENDER);
    expect(row.call_data).toBe(MOCK_CALL_DATA);
    expect(row.used).toBe(0);
  });

  it('emits audit log and notifications', async () => {
    seedWallet();
    await app.request(
      makeRequest(`/v1/wallets/${WALLET_ID}/userop/build`, {
        request: {
          type: 'TRANSFER',
          to: '0x0000000000000000000000000000000000000001',
          amount: '1000',
        },
        network: 'ethereum-sepolia',
      }),
    );

    // Verify audit log
    const auditRow = sqlite.prepare(
      "SELECT * FROM audit_log WHERE event_type = 'USEROP_BUILD'",
    ).get() as Record<string, unknown> | undefined;
    expect(auditRow).toBeDefined();

    // Verify notification called
    expect(deps.notificationService!.notify).toHaveBeenCalled();
    expect(deps.eventBus!.emit).toHaveBeenCalledWith('wallet:activity', expect.objectContaining({
      walletId: WALLET_ID,
      activity: 'TX_REQUESTED',
    }));
  });

  it('deployed wallet returns factory=null, factoryData=null', async () => {
    seedWallet({ deployed: 1 });
    const res = await app.request(
      makeRequest(`/v1/wallets/${WALLET_ID}/userop/build`, {
        request: {
          type: 'TRANSFER',
          to: '0x0000000000000000000000000000000000000001',
          amount: '1000',
        },
        network: 'ethereum-sepolia',
      }),
    );

    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.factory).toBeNull();
    expect(body.factoryData).toBeNull();
  });

  it('releases key even on success', async () => {
    seedWallet();
    await app.request(
      makeRequest(`/v1/wallets/${WALLET_ID}/userop/build`, {
        request: {
          type: 'TRANSFER',
          to: '0x0000000000000000000000000000000000000001',
          amount: '1000',
        },
        network: 'ethereum-sepolia',
      }),
    );

    expect(deps.keyStore.releaseKey).toHaveBeenCalled();
  });
});

// ===========================================================================
// POST /v1/wallets/:id/userop/sign
// ===========================================================================

describe('POST /v1/wallets/:id/userop/sign (route handler)', () => {
  const validUserOp = {
    sender: MOCK_SENDER,
    nonce: '0x2a',
    callData: MOCK_CALL_DATA,
    callGasLimit: '0x10000',
    verificationGasLimit: '0x20000',
    preVerificationGas: '0x5000',
    maxFeePerGas: '0x3b9aca00',
    maxPriorityFeePerGas: '0x77359400',
    signature: '0x',
  };

  it('returns WALLET_NOT_FOUND for missing wallet', async () => {
    seedBuildRecord();
    const res = await app.request(
      makeRequest(`/v1/wallets/${WALLET_ID}/userop/sign`, {
        buildId: '019548e8-f7a0-7000-8000-000000000099',
        userOperation: validUserOp,
      }),
    );

    expect(res.status).toBe(404);
    const body = await json(res);
    expect(body.code).toBe('WALLET_NOT_FOUND');
  });

  it('rejects EOA wallet', async () => {
    seedWallet({ account_type: 'eoa' });
    seedBuildRecord();
    const res = await app.request(
      makeRequest(`/v1/wallets/${WALLET_ID}/userop/sign`, {
        buildId: '019548e8-f7a0-7000-8000-000000000099',
        userOperation: validUserOp,
      }),
    );

    expect(res.status).toBe(400);
    const body = await json(res);
    expect(body.code).toBe('ACTION_VALIDATION_FAILED');
  });

  it('rejects Solana wallet', async () => {
    seedWallet({ chain: 'solana' });
    seedBuildRecord();
    const res = await app.request(
      makeRequest(`/v1/wallets/${WALLET_ID}/userop/sign`, {
        buildId: '019548e8-f7a0-7000-8000-000000000099',
        userOperation: validUserOp,
      }),
    );

    expect(res.status).toBe(400);
    const body = await json(res);
    expect(body.code).toBe('ACTION_VALIDATION_FAILED');
  });

  it('returns BUILD_NOT_FOUND for non-existent build', async () => {
    seedWallet();
    const res = await app.request(
      makeRequest(`/v1/wallets/${WALLET_ID}/userop/sign`, {
        buildId: '019548e8-f7a0-7000-8000-ffffffffffff',
        userOperation: validUserOp,
      }),
    );

    expect(res.status).toBe(404);
    const body = await json(res);
    expect(body.code).toBe('BUILD_NOT_FOUND');
  });

  it('returns BUILD_ALREADY_USED for used build', async () => {
    seedWallet();
    seedBuildRecord({ used: 1 });
    const res = await app.request(
      makeRequest(`/v1/wallets/${WALLET_ID}/userop/sign`, {
        buildId: '019548e8-f7a0-7000-8000-000000000099',
        userOperation: validUserOp,
      }),
    );

    expect(res.status).toBe(409);
    const body = await json(res);
    expect(body.code).toBe('BUILD_ALREADY_USED');
  });

  it('returns CALLDATA_MISMATCH for wrong callData', async () => {
    seedWallet();
    seedBuildRecord();
    const res = await app.request(
      makeRequest(`/v1/wallets/${WALLET_ID}/userop/sign`, {
        buildId: '019548e8-f7a0-7000-8000-000000000099',
        userOperation: { ...validUserOp, callData: '0xdeadbeef' },
      }),
    );

    expect(res.status).toBe(400);
    const body = await json(res);
    expect(body.code).toBe('CALLDATA_MISMATCH');
  });
});
