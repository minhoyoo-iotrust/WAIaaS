/**
 * E2E tests verifying default wallet/default network removal (v29.3).
 *
 * Tests cover:
 * - E2E-01: single-wallet session + walletId omitted -> auto-resolve
 * - E2E-02: multi-wallet session + walletId omitted -> WALLET_ID_REQUIRED
 * - E2E-03: Solana + network omitted -> auto-resolve
 * - E2E-04: EVM + network omitted -> NETWORK_REQUIRED
 * - E2E-05: 3 deleted endpoints -> 404
 * - E2E-06: JWT has no wlt claim
 * - E2E-07: connect-info has no defaultNetwork/isDefault
 * - E2E-08: MCP multi-wallet + wallet_id omitted -> WALLET_ID_REQUIRED
 *
 * Uses createApp() with full deps for realistic HTTP simulation.
 *
 * @see Phase 282 -- E2E verification for default removal
 */

import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import type { Database as DatabaseType } from 'better-sqlite3';
import argon2 from 'argon2';
import { createDatabase, pushSchema } from '../infrastructure/database/index.js';
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

const TEST_PASSWORD = 'test-master-password-default-removal-e2e';
const HOST = '127.0.0.1:3100';
let passwordHash: string;

// ---------------------------------------------------------------------------
// Mock adapters
// ---------------------------------------------------------------------------

function createMockSolanaAdapter(overrides: Partial<IChainAdapter> = {}): IChainAdapter {
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
      txHash: 'mock-solana-hash-' + Date.now(),
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

function createMockEvmAdapter(overrides: Partial<IChainAdapter> = {}): IChainAdapter {
  return {
    chain: 'ethereum' as const,
    network: 'ethereum-sepolia' as const,
    connect: async () => {},
    disconnect: async () => {},
    isConnected: () => true,
    getHealth: async () => ({ healthy: true, latencyMs: 1 }),
    getBalance: async (addr: string) => ({
      address: addr,
      balance: 1_000_000_000_000_000_000n,
      decimals: 18,
      symbol: 'ETH',
    }),
    buildTransaction: async () => ({
      chain: 'ethereum',
      serialized: new Uint8Array(128),
      estimatedFee: 21000n,
      metadata: {},
    }),
    simulateTransaction: async () => ({ success: true, logs: [] }),
    signTransaction: async () => new Uint8Array(65),
    submitTransaction: async () => ({
      txHash: 'mock-evm-hash-' + Date.now(),
      status: 'submitted' as const,
    }),
    waitForConfirmation: async (txHash: string) => ({
      txHash,
      status: 'confirmed' as const,
      confirmations: 1,
    }),
    getAssets: async () => [],
    estimateFee: async () => ({ fee: 21000n, decimals: 18, symbol: 'ETH' }),
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

function createMockAdapterPoolDual(adapters: Map<string, IChainAdapter>): AdapterPool {
  return {
    resolve: vi.fn().mockImplementation(async (chain: string, network: string) => {
      const key = `${chain}:${network}`;
      const adapter = adapters.get(key);
      if (!adapter) {
        throw new Error(`No mock adapter for ${key}`);
      }
      return adapter;
    }),
    disconnectAll: vi.fn().mockResolvedValue(undefined),
    get size() { return adapters.size; },
  } as unknown as AdapterPool;
}

function createMockKeyStore() {
  let counter = 0;
  return {
    generateKeyPair: vi.fn().mockImplementation(async (id: string, chain?: string) => {
      counter++;
      if (chain === 'ethereum') {
        // Generate unique EVM addresses using counter
        const hex = counter.toString(16).padStart(40, '0');
        return {
          publicKey: `0x${hex}`,
          encryptedPrivateKey: new Uint8Array(64),
        };
      }
      // Generate unique Solana-style addresses using counter + walletId
      return {
        publicKey: `pk-${id.slice(0, 8)}-${counter}`,
        encryptedPrivateKey: new Uint8Array(64),
      };
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

function bearerJsonHeader(token: string): Record<string, string> {
  return {
    Host: HOST,
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
}

// ---------------------------------------------------------------------------
// Wallet/Session creation helpers
// ---------------------------------------------------------------------------

async function createWallet(
  app: OpenAPIHono,
  chain: string,
  network: string,
  name: string,
): Promise<Record<string, unknown>> {
  const res = await app.request('/v1/wallets', {
    method: 'POST',
    headers: masterAuthJsonHeaders(),
    body: JSON.stringify({ name, chain, network }),
  });
  expect(res.status).toBe(201);
  return json(res);
}

async function createSession(
  app: OpenAPIHono,
  walletId: string,
): Promise<{ token: string; sessionId: string }> {
  const res = await app.request('/v1/sessions', {
    method: 'POST',
    headers: masterAuthJsonHeaders(),
    body: JSON.stringify({ walletId }),
  });
  expect(res.status).toBe(201);
  const body = await json(res);
  return {
    token: body.token as string,
    sessionId: body.id as string,
  };
}

async function createMultiWalletSession(
  app: OpenAPIHono,
  walletIds: string[],
): Promise<{ token: string; sessionId: string }> {
  const res = await app.request('/v1/sessions', {
    method: 'POST',
    headers: masterAuthJsonHeaders(),
    body: JSON.stringify({ walletIds }),
  });
  expect(res.status).toBe(201);
  const body = await json(res);
  return {
    token: body.token as string,
    sessionId: body.id as string,
  };
}

// ---------------------------------------------------------------------------
// Test setup
// ---------------------------------------------------------------------------

let sqlite: DatabaseType;
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
  const conn = createDatabase(':memory:');
  sqlite = conn.sqlite;
  const db = conn.db;
  pushSchema(sqlite);

  const jwtManager = new JwtSecretManager(db);
  await jwtManager.initialize();

  const config = DaemonConfigSchema.parse({});

  const policyEngine = new DatabasePolicyEngine(db, sqlite);
  const delayQueue = new DelayQueue({ db, sqlite });
  const approvalWorkflow = new ApprovalWorkflow({
    db,
    sqlite,
    config: {
      policy_defaults_approval_timeout:
        config.security.policy_defaults_approval_timeout,
    },
  });
  const ownerLifecycle = new OwnerLifecycleService({ db, sqlite });

  const solanaAdapter = createMockSolanaAdapter();
  const evmAdapter = createMockEvmAdapter();

  const adapters = new Map<string, IChainAdapter>([
    ['solana:solana-devnet', solanaAdapter],
    ['ethereum:ethereum-sepolia', evmAdapter],
  ]);
  const mockAdapterPool = createMockAdapterPoolDual(adapters);
  const mockKeyStore = createMockKeyStore();

  app = createApp({
    db,
    sqlite,
    jwtSecretManager: jwtManager,
    masterPasswordHash: passwordHash,
    masterPassword: TEST_PASSWORD,
    config,
    adapterPool: mockAdapterPool,
    keyStore: mockKeyStore,
    policyEngine,
    delayQueue,
    approvalWorkflow,
    ownerLifecycle,
  });
});

afterEach(() => {
  try {
    sqlite.close();
  } catch {
    // already closed
  }
});

// ===========================================================================
// E2E-01, E2E-02: Wallet ID resolution
// ===========================================================================

describe('Wallet ID resolution (E2E-01, E2E-02)', () => {
  it('E2E-01: single-wallet session + walletId omitted -> auto-resolves', async () => {
    const wallet = await createWallet(app, 'solana', 'solana-devnet', 'sol-auto');
    const { token } = await createSession(app, wallet.id as string);

    // GET /v1/wallet/balance without walletId -> should auto-resolve (single wallet in session)
    const res = await app.request('/v1/wallet/balance', {
      headers: bearerHeader(token),
    });
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.address || body.walletId).toBeDefined();
  });

  it('E2E-02: multi-wallet session + walletId omitted -> WALLET_ID_REQUIRED', async () => {
    const wallet1 = await createWallet(app, 'solana', 'solana-devnet', 'sol-1');
    const wallet2 = await createWallet(app, 'solana', 'solana-devnet', 'sol-2');
    const { token } = await createMultiWalletSession(app, [wallet1.id as string, wallet2.id as string]);

    // GET /v1/wallet/balance without walletId -> WALLET_ID_REQUIRED (2 wallets in session)
    const res = await app.request('/v1/wallet/balance', {
      headers: bearerHeader(token),
    });
    expect(res.status).toBe(400);
    const body = await json(res);
    expect(body.code).toBe('WALLET_ID_REQUIRED');
  });
});

// ===========================================================================
// E2E-03, E2E-04: Network resolution
// ===========================================================================

describe('Network resolution (E2E-03, E2E-04)', () => {
  it('E2E-03: Solana + network omitted -> auto-resolves (single network per env)', async () => {
    const wallet = await createWallet(app, 'solana', 'solana-devnet', 'sol-net');
    const { token } = await createSession(app, wallet.id as string);

    // GET /v1/wallet/balance with walletId but no network -> Solana auto-resolves
    const res = await app.request(`/v1/wallet/balance?walletId=${wallet.id}`, {
      headers: bearerHeader(token),
    });
    expect(res.status).toBe(200);
  });

  it('E2E-04: EVM + network omitted -> NETWORK_REQUIRED', async () => {
    const wallet = await createWallet(app, 'ethereum', 'ethereum-sepolia', 'eth-net');
    const { token } = await createSession(app, wallet.id as string);

    // GET /v1/wallet/balance with walletId but no network -> EVM requires explicit network
    const res = await app.request(`/v1/wallet/balance?walletId=${wallet.id}`, {
      headers: bearerHeader(token),
    });
    expect(res.status).toBe(400);
    const body = await json(res);
    expect(body.code).toBe('NETWORK_REQUIRED');
  });
});

// ===========================================================================
// E2E-05: Deleted endpoints return 404
// ===========================================================================

describe('Deleted endpoints return 404 (E2E-05)', () => {
  it('PATCH /v1/sessions/:id/wallets/:walletId/default -> 404', async () => {
    const res = await app.request('/v1/sessions/fake-id/wallets/fake-wid/default', {
      method: 'PATCH',
      headers: masterAuthHeader(),
    });
    expect(res.status).toBe(404);
  });

  it('PUT /v1/wallets/:id/default-network -> 404', async () => {
    const res = await app.request('/v1/wallets/fake-id/default-network', {
      method: 'PUT',
      headers: {
        ...masterAuthJsonHeaders(),
      },
      body: JSON.stringify({ network: 'ethereum-sepolia' }),
    });
    expect(res.status).toBe(404);
  });

  it('PUT /v1/wallet/default-network -> 404', async () => {
    const wallet = await createWallet(app, 'solana', 'solana-devnet', 'sol-del');
    const { token } = await createSession(app, wallet.id as string);

    const res = await app.request('/v1/wallet/default-network', {
      method: 'PUT',
      headers: {
        ...bearerJsonHeader(token),
      },
      body: JSON.stringify({ network: 'solana-devnet' }),
    });
    expect(res.status).toBe(404);
  });
});

// ===========================================================================
// E2E-06: JWT payload
// ===========================================================================

describe('JWT payload (E2E-06)', () => {
  it('newly issued JWT has no wlt claim', async () => {
    const wallet = await createWallet(app, 'solana', 'solana-devnet', 'sol-jwt');
    const { token } = await createSession(app, wallet.id as string);

    // Decode the JWT payload (wai_sess_ prefix + base64url JWT)
    const jwtPart = token.replace('wai_sess_', '');
    const parts = jwtPart.split('.');
    expect(parts.length).toBe(3);
    const payloadJson = JSON.parse(
      Buffer.from(parts[1]!, 'base64url').toString('utf-8'),
    );

    // Should have sub, iat, exp but NOT wlt
    expect(payloadJson).toHaveProperty('sub');
    expect(payloadJson).toHaveProperty('iat');
    expect(payloadJson).toHaveProperty('exp');
    expect(payloadJson).not.toHaveProperty('wlt');
  });
});

// ===========================================================================
// E2E-07: connect-info response
// ===========================================================================

describe('connect-info response (E2E-07)', () => {
  it('connect-info wallets have no defaultNetwork or isDefault', async () => {
    const wallet = await createWallet(app, 'solana', 'solana-devnet', 'sol-ci');
    const { token } = await createSession(app, wallet.id as string);

    const res = await app.request('/v1/connect-info', {
      headers: bearerHeader(token),
    });
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.wallets).toBeDefined();
    expect(Array.isArray(body.wallets)).toBe(true);
    for (const w of body.wallets as Record<string, unknown>[]) {
      expect(w).not.toHaveProperty('defaultNetwork');
      expect(w).not.toHaveProperty('isDefault');
    }
  });

  it('connect-info with EVM wallet also has no defaultNetwork', async () => {
    const wallet = await createWallet(app, 'ethereum', 'ethereum-sepolia', 'eth-ci');
    const { token } = await createSession(app, wallet.id as string);

    const res = await app.request('/v1/connect-info', {
      headers: bearerHeader(token),
    });
    expect(res.status).toBe(200);
    const body = await json(res);
    for (const w of body.wallets as Record<string, unknown>[]) {
      expect(w).not.toHaveProperty('defaultNetwork');
      expect(w).not.toHaveProperty('isDefault');
    }
  });
});

// ===========================================================================
// E2E-08: MCP multi-wallet wallet_id requirement
// ===========================================================================

describe('MCP multi-wallet wallet_id requirement (E2E-08)', () => {
  it('multi-wallet session transaction without walletId -> WALLET_ID_REQUIRED', async () => {
    const wallet1 = await createWallet(app, 'solana', 'solana-devnet', 'mcp-sol-1');
    const wallet2 = await createWallet(app, 'solana', 'solana-devnet', 'mcp-sol-2');
    const { token } = await createMultiWalletSession(app, [wallet1.id as string, wallet2.id as string]);

    // POST /v1/wallet/send (the API endpoint MCP uses for transfers) without walletId
    const res = await app.request('/v1/transactions/send', {
      method: 'POST',
      headers: bearerJsonHeader(token),
      body: JSON.stringify({
        to: '11111111111111111111111111111112',
        amount: '0.001',
        // walletId intentionally omitted
      }),
    });
    expect(res.status).toBe(400);
    const body = await json(res);
    expect(body.code).toBe('WALLET_ID_REQUIRED');
  });

  it('multi-wallet session with explicit walletId does not return WALLET_ID_REQUIRED', async () => {
    const wallet1 = await createWallet(app, 'solana', 'solana-devnet', 'mcp-sol-3');
    const wallet2 = await createWallet(app, 'solana', 'solana-devnet', 'mcp-sol-4');
    const { token } = await createMultiWalletSession(app, [wallet1.id as string, wallet2.id as string]);

    // POST /v1/wallet/send with explicit walletId
    const res = await app.request('/v1/transactions/send', {
      method: 'POST',
      headers: bearerJsonHeader(token),
      body: JSON.stringify({
        to: '11111111111111111111111111111112',
        amount: '0.001',
        walletId: wallet1.id,
      }),
    });
    // Should NOT be WALLET_ID_REQUIRED -- may be 200 or another error from pipeline
    if (res.status === 400) {
      const body = await json(res);
      expect(body.code).not.toBe('WALLET_ID_REQUIRED');
    }
    // Any non-WALLET_ID_REQUIRED status is acceptable
  });
});
