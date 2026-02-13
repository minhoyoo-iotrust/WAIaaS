/**
 * Tests for transaction API routes (POST /v1/transactions/send, GET /v1/transactions/:id).
 *
 * Uses in-memory SQLite + mock adapter + mock keyStore + Hono app.request().
 * Follows same pattern as api-agents.test.ts.
 *
 * v1.2: POST /v1/wallets requires X-Master-Password (masterAuth).
 *        POST /v1/transactions/send and GET /v1/transactions/:id require sessionAuth.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import argon2 from 'argon2';
import { createApp } from '../api/server.js';
import { createDatabase, pushSchema, generateId } from '../infrastructure/database/index.js';
import { JwtSecretManager, type JwtPayload } from '../infrastructure/jwt/index.js';
import type { DatabaseConnection } from '../infrastructure/database/index.js';
import type { DaemonConfig } from '../infrastructure/config/loader.js';
import type { LocalKeyStore } from '../infrastructure/keystore/keystore.js';
import { DefaultPolicyEngine } from '../pipeline/default-policy-engine.js';
import type {
  IChainAdapter,
  BalanceInfo,
  HealthInfo,
  UnsignedTransaction,
  SimulationResult,
  SubmitResult,
} from '@waiaas/core';
import type { AdapterPool } from '../infrastructure/adapter-pool.js';
import type { OpenAPIHono } from '@hono/zod-openapi';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function json(res: Response): Promise<Record<string, unknown>> {
  return (await res.json()) as Record<string, unknown>;
}

const HOST = '127.0.0.1:3100';
const TEST_MASTER_PASSWORD = 'test-master-password';

function mockConfig(): DaemonConfig {
  return {
    daemon: {
      port: 3100,
      hostname: '127.0.0.1',
      log_level: 'info',
      log_file: 'logs/daemon.log',
      log_max_size: '50MB',
      log_max_files: 5,
      pid_file: 'daemon.pid',
      shutdown_timeout: 30,
      dev_mode: false,
      admin_ui: true,
      admin_timeout: 900,
    },
    keystore: {
      argon2_memory: 65536,
      argon2_time: 3,
      argon2_parallelism: 4,
      backup_on_rotate: true,
    },
    database: {
      path: ':memory:',
      wal_checkpoint_interval: 300,
      busy_timeout: 5000,
      cache_size: 64000,
      mmap_size: 268435456,
    },
    rpc: {
      solana_mainnet: 'https://api.mainnet-beta.solana.com',
      solana_devnet: 'https://api.devnet.solana.com',
      solana_testnet: 'https://api.testnet.solana.com',
      solana_ws_mainnet: 'wss://api.mainnet-beta.solana.com',
      solana_ws_devnet: 'wss://api.devnet.solana.com',
      evm_ethereum_mainnet: 'https://eth.drpc.org',
      evm_ethereum_sepolia: 'https://sepolia.drpc.org',
      evm_polygon_mainnet: 'https://polygon.drpc.org',
      evm_polygon_amoy: 'https://polygon-amoy.drpc.org',
      evm_arbitrum_mainnet: 'https://arbitrum.drpc.org',
      evm_arbitrum_sepolia: 'https://arbitrum-sepolia.drpc.org',
      evm_optimism_mainnet: 'https://optimism.drpc.org',
      evm_optimism_sepolia: 'https://optimism-sepolia.drpc.org',
      evm_base_mainnet: 'https://base.drpc.org',
      evm_base_sepolia: 'https://base-sepolia.drpc.org',
      evm_default_network: 'ethereum-sepolia' as const,
    },
    notifications: {
      enabled: false,
      min_channels: 2,
      health_check_interval: 300,
      log_retention_days: 30,
      dedup_ttl: 300,
      telegram_bot_token: '',
      telegram_chat_id: '',
      discord_webhook_url: '',
      ntfy_server: 'https://ntfy.sh',
      ntfy_topic: '',
      locale: 'en' as const,
      rate_limit_rpm: 20,
    },
    security: {
      session_ttl: 86400,
      jwt_secret: '',
      max_sessions_per_wallet: 5,
      max_pending_tx: 10,
      nonce_storage: 'memory',
      nonce_cache_max: 1000,
      nonce_cache_ttl: 300,
      rate_limit_global_ip_rpm: 1000,
      rate_limit_session_rpm: 300,
      rate_limit_tx_rpm: 10,
      cors_origins: ['http://localhost:3100'],
      auto_stop_consecutive_failures_threshold: 3,
      policy_defaults_delay_seconds: 300,
      policy_defaults_approval_timeout: 3600,
      kill_switch_recovery_cooldown: 1800,
      kill_switch_max_recovery_attempts: 3,
    },
    walletconnect: {
      project_id: '',
    },
  };
}

const MOCK_PUBLIC_KEY = '11111111111111111111111111111112';

function mockKeyStore(): LocalKeyStore {
  return {
    generateKeyPair: async () => ({
      publicKey: MOCK_PUBLIC_KEY,
      encryptedPrivateKey: new Uint8Array(64),
    }),
    decryptPrivateKey: async () => new Uint8Array(64),
    releaseKey: () => {},
    hasKey: async () => true,
    deleteKey: async () => {},
    lockAll: () => {},
    sodiumAvailable: true,
  } as unknown as LocalKeyStore;
}

function mockAdapter(): IChainAdapter {
  return {
    chain: 'solana' as const,
    network: 'devnet' as const,
    connect: async () => {},
    disconnect: async () => {},
    isConnected: () => true,
    getHealth: async (): Promise<HealthInfo> => ({ healthy: true, latencyMs: 1 }),
    getBalance: async (addr: string): Promise<BalanceInfo> => ({
      address: addr,
      balance: 1_000_000_000n,
      decimals: 9,
      symbol: 'SOL',
    }),
    buildTransaction: async (): Promise<UnsignedTransaction> => ({
      chain: 'solana',
      serialized: new Uint8Array(128),
      estimatedFee: 5000n,
      metadata: {},
    }),
    simulateTransaction: async (): Promise<SimulationResult> => ({
      success: true,
      logs: ['Program log: success'],
    }),
    signTransaction: async (): Promise<Uint8Array> => new Uint8Array(256),
    submitTransaction: async (): Promise<SubmitResult> => ({
      txHash: 'mock-tx-hash-' + Date.now(),
      status: 'submitted',
    }),
    waitForConfirmation: async (txHash: string): Promise<SubmitResult> => ({
      txHash,
      status: 'confirmed',
      confirmations: 1,
    }),
    getAssets: async () => [],
    // v1.4 stubs
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

/** Create a mock AdapterPool that resolves to mockAdapter. */
function mockAdapterPool(adapter?: IChainAdapter): AdapterPool {
  const a = adapter ?? mockAdapter();
  return {
    resolve: vi.fn().mockResolvedValue(a),
    disconnectAll: vi.fn().mockResolvedValue(undefined),
    get size() { return 0; },
  } as unknown as AdapterPool;
}

// ---------------------------------------------------------------------------
// Test setup
// ---------------------------------------------------------------------------

let conn: DatabaseConnection;
let app: OpenAPIHono;
let jwtSecretManager: JwtSecretManager;

beforeEach(async () => {
  conn = createDatabase(':memory:');
  pushSchema(conn.sqlite);

  const masterPasswordHash = await argon2.hash(TEST_MASTER_PASSWORD, {
    type: argon2.argon2id,
    memoryCost: 4096,
    timeCost: 2,
    parallelism: 1,
  });

  jwtSecretManager = new JwtSecretManager(conn.db);
  await jwtSecretManager.initialize();

  app = createApp({
    db: conn.db,
    sqlite: conn.sqlite,
    keyStore: mockKeyStore(),
    masterPassword: TEST_MASTER_PASSWORD,
    masterPasswordHash,
    config: mockConfig(),
    adapterPool: mockAdapterPool(),
    policyEngine: new DefaultPolicyEngine(),
    jwtSecretManager,
  });
});

afterEach(() => {
  conn.sqlite.close();
});

// ---------------------------------------------------------------------------
// Auth helpers
// ---------------------------------------------------------------------------

/** Create a wallet (with masterAuth) and return its ID. */
async function createTestWallet(): Promise<string> {
  const res = await app.request('/v1/wallets', {
    method: 'POST',
    headers: {
      Host: HOST,
      'Content-Type': 'application/json',
      'X-Master-Password': TEST_MASTER_PASSWORD,
    },
    body: JSON.stringify({ name: 'tx-test-wallet' }),
  });
  const body = await json(res);
  return body.id as string;
}

/** Create a session token for the given wallet. Returns "Bearer wai_sess_<token>". */
async function createSessionToken(walletId: string): Promise<string> {
  const sessionId = generateId();
  const now = Math.floor(Date.now() / 1000);

  conn.sqlite.prepare(
    `INSERT INTO sessions (id, wallet_id, token_hash, expires_at, absolute_expires_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(sessionId, walletId, `hash-${sessionId}`, now + 86400, now + 86400 * 30, now);

  const payload: JwtPayload = {
    sub: sessionId,
    wlt: walletId,
    iat: now,
    exp: now + 3600,
  };
  const token = await jwtSecretManager.signToken(payload);
  return `Bearer ${token}`;
}

// ---------------------------------------------------------------------------
// POST /v1/transactions/send (6 tests)
// ---------------------------------------------------------------------------

describe('POST /v1/transactions/send', () => {
  it('should return 201 with txId for valid request', async () => {
    const walletId = await createTestWallet();
    const authHeader = await createSessionToken(walletId);

    const res = await app.request('/v1/transactions/send', {
      method: 'POST',
      headers: {
        Host: HOST,
        'Content-Type': 'application/json',
        Authorization: authHeader,
      },
      body: JSON.stringify({
        to: 'Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr',
        amount: '1000000000',
      }),
    });

    expect(res.status).toBe(201);
    const body = await json(res);
    expect(body.id).toBeTruthy();
    expect(body.status).toBe('PENDING');
  });

  it('should return 400 for invalid amount (non-numeric)', async () => {
    const walletId = await createTestWallet();
    const authHeader = await createSessionToken(walletId);

    const res = await app.request('/v1/transactions/send', {
      method: 'POST',
      headers: {
        Host: HOST,
        'Content-Type': 'application/json',
        Authorization: authHeader,
      },
      body: JSON.stringify({
        to: 'Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr',
        amount: 'not-a-number',
      }),
    });

    expect(res.status).toBe(400);
    const body = await json(res);
    expect(body.code).toBe('ACTION_VALIDATION_FAILED');
  });

  it('should return 401 without Authorization header', async () => {
    const res = await app.request('/v1/transactions/send', {
      method: 'POST',
      headers: {
        Host: HOST,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        to: 'Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr',
        amount: '1000000000',
      }),
    });

    expect(res.status).toBe(401);
    const body = await json(res);
    expect(body.code).toBe('INVALID_TOKEN');
  });

  it('should return 404 SESSION_NOT_FOUND when session does not exist in DB', async () => {
    // Sign a JWT with valid format but session not in DB
    const fakeSessionId = generateId();
    const fakeWalletId = '00000000-0000-7000-8000-000000000000';
    const now = Math.floor(Date.now() / 1000);

    const payload: JwtPayload = { sub: fakeSessionId, wlt: fakeWalletId, iat: now, exp: now + 3600 };
    const token = await jwtSecretManager.signToken(payload);

    const res = await app.request('/v1/transactions/send', {
      method: 'POST',
      headers: {
        Host: HOST,
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        to: 'Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr',
        amount: '1000000000',
      }),
    });

    expect(res.status).toBe(404);
    const body = await json(res);
    expect(body.code).toBe('SESSION_NOT_FOUND');
  });

  it('should return 401 with invalid token', async () => {
    const res = await app.request('/v1/transactions/send', {
      method: 'POST',
      headers: {
        Host: HOST,
        'Content-Type': 'application/json',
        Authorization: 'Bearer wai_sess_invalid.jwt.token',
      },
      body: JSON.stringify({
        to: 'Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr',
        amount: '1000000000',
      }),
    });

    expect(res.status).toBe(401);
    const body = await json(res);
    expect(body.code).toBe('INVALID_TOKEN');
  });

  it('should persist transaction with correct walletId from session', async () => {
    const walletId = await createTestWallet();
    const authHeader = await createSessionToken(walletId);

    const res = await app.request('/v1/transactions/send', {
      method: 'POST',
      headers: {
        Host: HOST,
        'Content-Type': 'application/json',
        Authorization: authHeader,
      },
      body: JSON.stringify({
        to: 'Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr',
        amount: '500000',
      }),
    });

    expect(res.status).toBe(201);
    const body = await json(res);
    const txId = body.id as string;

    // Verify in DB
    const row = conn.sqlite.prepare('SELECT * FROM transactions WHERE id = ?').get(txId) as Record<
      string,
      unknown
    >;
    expect(row).toBeTruthy();
    expect(row.wallet_id).toBe(walletId);
    expect(row.amount).toBe('500000');
    expect(row.to_address).toBe('Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr');
  });
});

// ---------------------------------------------------------------------------
// GET /v1/transactions/:id (5 tests)
// ---------------------------------------------------------------------------

describe('GET /v1/transactions/:id', () => {
  it('should return 200 with transaction JSON for existing transaction', async () => {
    const walletId = await createTestWallet();
    const authHeader = await createSessionToken(walletId);

    // Create a transaction via POST
    const sendRes = await app.request('/v1/transactions/send', {
      method: 'POST',
      headers: {
        Host: HOST,
        'Content-Type': 'application/json',
        Authorization: authHeader,
      },
      body: JSON.stringify({
        to: 'Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr',
        amount: '500000000',
      }),
    });
    const sendBody = await json(sendRes);
    const txId = sendBody.id as string;

    // Query the transaction
    const res = await app.request(`/v1/transactions/${txId}`, {
      headers: { Host: HOST, Authorization: authHeader },
    });

    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.id).toBe(txId);
    expect(body.walletId).toBe(walletId);
    expect(body.type).toBe('TRANSFER');
    expect(body.amount).toBe('500000000');
    expect(body.toAddress).toBe('Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr');
    expect(body.chain).toBe('solana');
  });

  it('should return 404 for non-existent transaction ID', async () => {
    const walletId = await createTestWallet();
    const authHeader = await createSessionToken(walletId);

    const res = await app.request('/v1/transactions/00000000-0000-7000-8000-000000000000', {
      headers: { Host: HOST, Authorization: authHeader },
    });

    expect(res.status).toBe(404);
    const body = await json(res);
    expect(body.code).toBe('TX_NOT_FOUND');
  });

  it('should include all expected fields in response', async () => {
    const walletId = await createTestWallet();
    const authHeader = await createSessionToken(walletId);

    // Create a transaction
    const sendRes = await app.request('/v1/transactions/send', {
      method: 'POST',
      headers: {
        Host: HOST,
        'Content-Type': 'application/json',
        Authorization: authHeader,
      },
      body: JSON.stringify({
        to: 'Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr',
        amount: '100000',
      }),
    });
    const sendBody = await json(sendRes);
    const txId = sendBody.id as string;

    // Query the transaction
    const res = await app.request(`/v1/transactions/${txId}`, {
      headers: { Host: HOST, Authorization: authHeader },
    });

    const body = await json(res);

    // Verify all expected fields exist
    expect(body).toHaveProperty('id');
    expect(body).toHaveProperty('walletId');
    expect(body).toHaveProperty('type');
    expect(body).toHaveProperty('status');
    expect(body).toHaveProperty('tier');
    expect(body).toHaveProperty('chain');
    expect(body).toHaveProperty('toAddress');
    expect(body).toHaveProperty('amount');
    expect(body).toHaveProperty('txHash');
    expect(body).toHaveProperty('error');
    expect(body).toHaveProperty('createdAt');
  });

  it('should return 401 without Authorization header', async () => {
    const res = await app.request('/v1/transactions/some-id', {
      headers: { Host: HOST },
    });

    expect(res.status).toBe(401);
    const body = await json(res);
    expect(body.code).toBe('INVALID_TOKEN');
  });

  it('should return 401 with malformed Bearer token', async () => {
    const res = await app.request('/v1/transactions/some-id', {
      headers: { Host: HOST, Authorization: 'Bearer bad-token' },
    });

    expect(res.status).toBe(401);
    const body = await json(res);
    expect(body.code).toBe('INVALID_TOKEN');
  });
});

// ---------------------------------------------------------------------------
// 5-type transaction request support (Phase 86-01)
// ---------------------------------------------------------------------------

describe('5-type transaction request support', () => {
  /** Helper: mock adapter with vi.fn() spies for all 5 build methods. */
  function mockAdapter5Type(): IChainAdapter {
    const unsignedTx: UnsignedTransaction = {
      chain: 'solana',
      serialized: new Uint8Array(128),
      estimatedFee: 5000n,
      metadata: {},
    };
    return {
      chain: 'solana' as const,
      network: 'devnet' as const,
      connect: async () => {},
      disconnect: async () => {},
      isConnected: () => true,
      getHealth: async (): Promise<HealthInfo> => ({ healthy: true, latencyMs: 1 }),
      getBalance: async (addr: string): Promise<BalanceInfo> => ({
        address: addr,
        balance: 1_000_000_000n,
        decimals: 9,
        symbol: 'SOL',
      }),
      buildTransaction: vi.fn().mockResolvedValue(unsignedTx),
      buildTokenTransfer: vi.fn().mockResolvedValue(unsignedTx),
      buildContractCall: vi.fn().mockResolvedValue(unsignedTx),
      buildApprove: vi.fn().mockResolvedValue(unsignedTx),
      buildBatch: vi.fn().mockResolvedValue(unsignedTx),
      simulateTransaction: async (): Promise<SimulationResult> => ({
        success: true,
        logs: ['Program log: success'],
      }),
      signTransaction: async (): Promise<Uint8Array> => new Uint8Array(256),
      submitTransaction: async (): Promise<SubmitResult> => ({
        txHash: 'mock-tx-hash-' + Date.now(),
        status: 'submitted',
      }),
      waitForConfirmation: async (txHash: string): Promise<SubmitResult> => ({
        txHash,
        status: 'confirmed',
        confirmations: 1,
      }),
      getAssets: async () => [],
      estimateFee: async () => { throw new Error('not implemented'); },
      getTokenInfo: async () => { throw new Error('not implemented'); },
      getTransactionFee: async () => { throw new Error('not implemented'); },
      getCurrentNonce: async () => 0,
      sweepAll: async () => { throw new Error('not implemented'); },
    };
  }

  it('legacy fallback: POST without type field returns 201, DB type=TRANSFER', async () => {
    const walletId = await createTestWallet();
    const authHeader = await createSessionToken(walletId);

    const res = await app.request('/v1/transactions/send', {
      method: 'POST',
      headers: {
        Host: HOST,
        'Content-Type': 'application/json',
        Authorization: authHeader,
      },
      body: JSON.stringify({
        to: 'Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr',
        amount: '1000000000',
      }),
    });

    expect(res.status).toBe(201);
    const body = await json(res);
    expect(body.id).toBeTruthy();

    // Verify DB has type=TRANSFER
    const row = conn.sqlite.prepare('SELECT type FROM transactions WHERE id = ?').get(body.id as string) as Record<string, unknown>;
    expect(row.type).toBe('TRANSFER');
  });

  it('explicit TRANSFER type returns 201', async () => {
    const adapter = mockAdapter5Type();
    // Re-create app with spy adapter
    const masterPasswordHash = await argon2.hash(TEST_MASTER_PASSWORD, {
      type: argon2.argon2id, memoryCost: 4096, timeCost: 2, parallelism: 1,
    });
    const localApp = createApp({
      db: conn.db,
      sqlite: conn.sqlite,
      keyStore: mockKeyStore(),
      masterPassword: TEST_MASTER_PASSWORD,
      masterPasswordHash,
      config: mockConfig(),
      adapterPool: mockAdapterPool(adapter),
      policyEngine: new DefaultPolicyEngine(),
      jwtSecretManager,
    });

    const walletId = await createTestWallet();
    const authHeader = await createSessionToken(walletId);

    const res = await localApp.request('/v1/transactions/send', {
      method: 'POST',
      headers: {
        Host: HOST,
        'Content-Type': 'application/json',
        Authorization: authHeader,
      },
      body: JSON.stringify({
        type: 'TRANSFER',
        to: 'Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr',
        amount: '1000000000',
        memo: 'test transfer',
      }),
    });

    expect(res.status).toBe(201);
    const body = await json(res);
    expect(body.id).toBeTruthy();

    // DB should have type=TRANSFER
    const row = conn.sqlite.prepare('SELECT type FROM transactions WHERE id = ?').get(body.id as string) as Record<string, unknown>;
    expect(row.type).toBe('TRANSFER');
  });

  it('TOKEN_TRANSFER type returns 201 and invokes buildTokenTransfer', async () => {
    const adapter = mockAdapter5Type();
    const masterPasswordHash = await argon2.hash(TEST_MASTER_PASSWORD, {
      type: argon2.argon2id, memoryCost: 4096, timeCost: 2, parallelism: 1,
    });
    const localApp = createApp({
      db: conn.db,
      sqlite: conn.sqlite,
      keyStore: mockKeyStore(),
      masterPassword: TEST_MASTER_PASSWORD,
      masterPasswordHash,
      config: mockConfig(),
      adapterPool: mockAdapterPool(adapter),
      policyEngine: new DefaultPolicyEngine(),
      jwtSecretManager,
    });

    const walletId = await createTestWallet();
    const authHeader = await createSessionToken(walletId);

    const res = await localApp.request('/v1/transactions/send', {
      method: 'POST',
      headers: {
        Host: HOST,
        'Content-Type': 'application/json',
        Authorization: authHeader,
      },
      body: JSON.stringify({
        type: 'TOKEN_TRANSFER',
        to: 'Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr',
        amount: '1000000',
        token: { address: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', decimals: 6, symbol: 'USDC' },
      }),
    });

    expect(res.status).toBe(201);
    const body = await json(res);
    expect(body.id).toBeTruthy();

    // DB should have type=TOKEN_TRANSFER
    const row = conn.sqlite.prepare('SELECT type FROM transactions WHERE id = ?').get(body.id as string) as Record<string, unknown>;
    expect(row.type).toBe('TOKEN_TRANSFER');

    // Wait a tick for fire-and-forget to start
    await new Promise((r) => setTimeout(r, 50));
    expect(adapter.buildTokenTransfer).toHaveBeenCalled();
  });

  it('CONTRACT_CALL type returns 201 and invokes buildContractCall', async () => {
    const adapter = mockAdapter5Type();
    const masterPasswordHash = await argon2.hash(TEST_MASTER_PASSWORD, {
      type: argon2.argon2id, memoryCost: 4096, timeCost: 2, parallelism: 1,
    });
    const localApp = createApp({
      db: conn.db,
      sqlite: conn.sqlite,
      keyStore: mockKeyStore(),
      masterPassword: TEST_MASTER_PASSWORD,
      masterPasswordHash,
      config: mockConfig(),
      adapterPool: mockAdapterPool(adapter),
      policyEngine: new DefaultPolicyEngine(),
      jwtSecretManager,
    });

    const walletId = await createTestWallet();
    const authHeader = await createSessionToken(walletId);

    const res = await localApp.request('/v1/transactions/send', {
      method: 'POST',
      headers: {
        Host: HOST,
        'Content-Type': 'application/json',
        Authorization: authHeader,
      },
      body: JSON.stringify({
        type: 'CONTRACT_CALL',
        to: '0x1234567890abcdef1234567890abcdef12345678',
        calldata: '0x12345678',
      }),
    });

    expect(res.status).toBe(201);
    const body = await json(res);
    expect(body.id).toBeTruthy();

    // DB should have type=CONTRACT_CALL
    const row = conn.sqlite.prepare('SELECT type FROM transactions WHERE id = ?').get(body.id as string) as Record<string, unknown>;
    expect(row.type).toBe('CONTRACT_CALL');

    await new Promise((r) => setTimeout(r, 50));
    expect(adapter.buildContractCall).toHaveBeenCalled();
  });

  it('APPROVE type returns 201 and invokes buildApprove', async () => {
    const adapter = mockAdapter5Type();
    const masterPasswordHash = await argon2.hash(TEST_MASTER_PASSWORD, {
      type: argon2.argon2id, memoryCost: 4096, timeCost: 2, parallelism: 1,
    });
    const localApp = createApp({
      db: conn.db,
      sqlite: conn.sqlite,
      keyStore: mockKeyStore(),
      masterPassword: TEST_MASTER_PASSWORD,
      masterPasswordHash,
      config: mockConfig(),
      adapterPool: mockAdapterPool(adapter),
      policyEngine: new DefaultPolicyEngine(),
      jwtSecretManager,
    });

    const walletId = await createTestWallet();
    const authHeader = await createSessionToken(walletId);

    const res = await localApp.request('/v1/transactions/send', {
      method: 'POST',
      headers: {
        Host: HOST,
        'Content-Type': 'application/json',
        Authorization: authHeader,
      },
      body: JSON.stringify({
        type: 'APPROVE',
        spender: '0xspender1234567890abcdef1234567890abcdef',
        token: { address: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', decimals: 6, symbol: 'USDC' },
        amount: '1000000',
      }),
    });

    expect(res.status).toBe(201);
    const body = await json(res);
    expect(body.id).toBeTruthy();

    // DB should have type=APPROVE
    const row = conn.sqlite.prepare('SELECT type FROM transactions WHERE id = ?').get(body.id as string) as Record<string, unknown>;
    expect(row.type).toBe('APPROVE');

    await new Promise((r) => setTimeout(r, 50));
    expect(adapter.buildApprove).toHaveBeenCalled();
  });

  it('BATCH type returns 201 and invokes buildBatch', async () => {
    const adapter = mockAdapter5Type();
    const masterPasswordHash = await argon2.hash(TEST_MASTER_PASSWORD, {
      type: argon2.argon2id, memoryCost: 4096, timeCost: 2, parallelism: 1,
    });
    const localApp = createApp({
      db: conn.db,
      sqlite: conn.sqlite,
      keyStore: mockKeyStore(),
      masterPassword: TEST_MASTER_PASSWORD,
      masterPasswordHash,
      config: mockConfig(),
      adapterPool: mockAdapterPool(adapter),
      policyEngine: new DefaultPolicyEngine(),
      jwtSecretManager,
    });

    const walletId = await createTestWallet();
    const authHeader = await createSessionToken(walletId);

    const res = await localApp.request('/v1/transactions/send', {
      method: 'POST',
      headers: {
        Host: HOST,
        'Content-Type': 'application/json',
        Authorization: authHeader,
      },
      body: JSON.stringify({
        type: 'BATCH',
        instructions: [
          { to: 'addr1', amount: '100' },
          { to: 'addr2', amount: '200' },
        ],
      }),
    });

    expect(res.status).toBe(201);
    const body = await json(res);
    expect(body.id).toBeTruthy();

    // DB should have type=BATCH
    const row = conn.sqlite.prepare('SELECT type FROM transactions WHERE id = ?').get(body.id as string) as Record<string, unknown>;
    expect(row.type).toBe('BATCH');

    await new Promise((r) => setTimeout(r, 50));
    expect(adapter.buildBatch).toHaveBeenCalled();
  });

  it('invalid type returns 400', async () => {
    const walletId = await createTestWallet();
    const authHeader = await createSessionToken(walletId);

    const res = await app.request('/v1/transactions/send', {
      method: 'POST',
      headers: {
        Host: HOST,
        'Content-Type': 'application/json',
        Authorization: authHeader,
      },
      body: JSON.stringify({
        type: 'INVALID',
        to: 'Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr',
        amount: '1000000000',
      }),
    });

    expect(res.status).toBe(400);
    const body = await json(res);
    expect(body.code).toBe('ACTION_VALIDATION_FAILED');
  });

  it('OpenAPI spec contains oneOf 6-variant for send transaction request', async () => {
    const res = await app.request('/doc', {
      headers: { Host: HOST },
    });

    expect(res.status).toBe(200);
    const doc = await json(res) as Record<string, unknown>;

    // Check components/schemas has all 5 type-specific schemas
    const schemas = (doc.components as Record<string, unknown>)?.schemas as Record<string, unknown>;
    expect(schemas).toBeTruthy();
    expect(schemas.TransferRequest).toBeTruthy();
    expect(schemas.TokenTransferRequest).toBeTruthy();
    expect(schemas.ContractCallRequest).toBeTruthy();
    expect(schemas.ApproveRequest).toBeTruthy();
    expect(schemas.BatchRequest).toBeTruthy();
    expect(schemas.SendTransactionRequest).toBeTruthy(); // legacy

    // Check that the send route request body has oneOf with 6 entries
    const paths = doc.paths as Record<string, Record<string, Record<string, unknown>>>;
    const sendRoute = paths['/v1/transactions/send']?.post;
    expect(sendRoute).toBeTruthy();

    const requestBody = sendRoute?.requestBody as Record<string, unknown>;
    const content = (requestBody?.content as Record<string, Record<string, unknown>>)?.['application/json'];
    const schema = content?.schema as Record<string, unknown>;
    expect(schema?.oneOf).toBeTruthy();
    expect((schema?.oneOf as unknown[]).length).toBe(6);
  });
});
