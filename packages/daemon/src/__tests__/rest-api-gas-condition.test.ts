/**
 * REST API gasCondition integration tests.
 *
 * Tests that POST /v1/transactions/send correctly accepts and validates
 * the optional gasCondition field on transaction requests.
 *
 * Uses in-memory SQLite + mock adapter + Hono app.request() pattern.
 * Mock pipeline stages to avoid actual on-chain execution.
 */

import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
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
// Constants
// ---------------------------------------------------------------------------

const TEST_PASSWORD = 'test-master-password-gas';
const HOST = '127.0.0.1:3100';
let passwordHash: string;

// ---------------------------------------------------------------------------
// Config helper
// ---------------------------------------------------------------------------

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
      session_ttl: 86400, session_absolute_lifetime: 31536000, session_max_renewals: 12,
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
      autostop_consecutive_failures_threshold: 5,
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

// ---------------------------------------------------------------------------
// Mock helpers
// ---------------------------------------------------------------------------

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
    getTokenInfo: async () => ({
      symbol: 'USDC',
      decimals: 6,
      name: 'USD Coin',
    }),
    getTransactionFee: async () => { throw new Error('not implemented'); },
    getCurrentNonce: async () => 0,
    sweepAll: async () => { throw new Error('not implemented'); },
  };
}

function mockAdapterPool(adapter: IChainAdapter): AdapterPool {
  return {
    resolve: vi.fn().mockResolvedValue(adapter),
    disconnectAll: vi.fn().mockResolvedValue(undefined),
    get size() { return 0; },
  } as unknown as AdapterPool;
}

// ---------------------------------------------------------------------------
// JSON / Auth helpers
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
// Test setup
// ---------------------------------------------------------------------------

let conn: DatabaseConnection;
let jwtSecretManager: JwtSecretManager;
let adapter: IChainAdapter;
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
  conn = createDatabase(':memory:');
  pushSchema(conn.sqlite);

  jwtSecretManager = new JwtSecretManager(conn.db);
  await jwtSecretManager.initialize();

  adapter = mockAdapter();

  app = createApp({
    db: conn.db,
    sqlite: conn.sqlite,
    keyStore: mockKeyStore(),
    masterPassword: TEST_PASSWORD,
    masterPasswordHash: passwordHash,
    config: mockConfig(),
    adapterPool: mockAdapterPool(adapter),
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

async function createTestWallet(): Promise<string> {
  const res = await app.request('/v1/wallets', {
    method: 'POST',
    headers: masterAuthJsonHeaders(),
    body: JSON.stringify({ name: 'gas-condition-test-wallet' }),
  });
  const body = await json(res);
  return body.id as string;
}

async function createSessionToken(walletId: string): Promise<string> {
  const sessionId = generateId();
  const now = Math.floor(Date.now() / 1000);

  conn.sqlite.prepare(
    `INSERT INTO sessions (id, token_hash, expires_at, absolute_expires_at, created_at)
     VALUES (?, ?, ?, ?, ?)`,
  ).run(sessionId, `hash-${sessionId}`, now + 86400, now + 86400 * 30, now);
  conn.sqlite.prepare(
    `INSERT INTO session_wallets (session_id, wallet_id, is_default, created_at)
     VALUES (?, ?, 1, ?)`,
  ).run(sessionId, walletId, now);

  const payload: JwtPayload = {
    sub: sessionId,

    iat: now,
    exp: now + 3600,
  };
  const token = await jwtSecretManager.signToken(payload);
  return `Bearer ${token}`;
}

// ---------------------------------------------------------------------------
// Helper: send a TRANSFER request with optional gasCondition
// ---------------------------------------------------------------------------

async function sendTransfer(
  auth: string,
  gasCondition?: Record<string, unknown>,
): Promise<Response> {
  const body: Record<string, unknown> = {
    type: 'TRANSFER',
    to: '11111111111111111111111111111111',
    amount: '1000000',
  };
  if (gasCondition !== undefined) {
    body.gasCondition = gasCondition;
  }
  return app.request('/v1/transactions/send', {
    method: 'POST',
    headers: {
      Host: HOST,
      'Content-Type': 'application/json',
      Authorization: auth,
    },
    body: JSON.stringify(body),
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('REST API gasCondition integration', () => {
  it('TRANSFER with gasCondition returns 201 and status=PENDING', async () => {
    const walletId = await createTestWallet();
    const auth = await createSessionToken(walletId);

    const res = await sendTransfer(auth, {
      maxGasPrice: '30000000000',
      maxPriorityFee: '2000000000',
      timeout: 3600,
    });

    expect(res.status).toBe(201);
    const body = await json(res);
    expect(body.id).toBeTruthy();
    expect(body.status).toBe('PENDING');
  });

  it('TOKEN_TRANSFER with gasCondition returns 201', async () => {
    const walletId = await createTestWallet();
    const auth = await createSessionToken(walletId);

    const res = await app.request('/v1/transactions/send', {
      method: 'POST',
      headers: {
        Host: HOST,
        'Content-Type': 'application/json',
        Authorization: auth,
      },
      body: JSON.stringify({
        type: 'TOKEN_TRANSFER',
        to: '11111111111111111111111111111111',
        amount: '1000000',
        token: { address: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', symbol: 'USDC', decimals: 6 },
        gasCondition: {
          maxPriorityFee: '1000000',
          timeout: 120,
        },
      }),
    });

    expect(res.status).toBe(201);
    const body = await json(res);
    expect(body.id).toBeTruthy();
  });

  it('request without gasCondition works as before (backward compat)', async () => {
    const walletId = await createTestWallet();
    const auth = await createSessionToken(walletId);

    const res = await sendTransfer(auth);

    expect(res.status).toBe(201);
    const body = await json(res);
    expect(body.id).toBeTruthy();
    expect(body.status).toBe('PENDING');
  });

  it('gasCondition with only maxGasPrice (no maxPriorityFee) is valid', async () => {
    const walletId = await createTestWallet();
    const auth = await createSessionToken(walletId);

    const res = await sendTransfer(auth, {
      maxGasPrice: '50000000000',
    });

    expect(res.status).toBe(201);
  });

  it('gasCondition with only maxPriorityFee (no maxGasPrice) is valid', async () => {
    const walletId = await createTestWallet();
    const auth = await createSessionToken(walletId);

    const res = await sendTransfer(auth, {
      maxPriorityFee: '3000000000',
    });

    expect(res.status).toBe(201);
  });

  it('gasCondition with neither maxGasPrice nor maxPriorityFee fails validation (400)', async () => {
    const walletId = await createTestWallet();
    const auth = await createSessionToken(walletId);

    const res = await sendTransfer(auth, {
      timeout: 3600,
    });

    expect(res.status).toBe(400);
    const body = await json(res);
    expect(body.code).toBe('ACTION_VALIDATION_FAILED');
  });

  it('gasCondition.timeout outside range fails validation (400)', async () => {
    const walletId = await createTestWallet();
    const auth = await createSessionToken(walletId);

    // timeout too small (< 60)
    const resTooSmall = await sendTransfer(auth, {
      maxGasPrice: '30000000000',
      timeout: 10,
    });
    expect(resTooSmall.status).toBe(400);
    const bodySmall = await json(resTooSmall);
    expect(bodySmall.code).toBe('ACTION_VALIDATION_FAILED');

    // timeout too large (> 86400)
    const resTooLarge = await sendTransfer(auth, {
      maxGasPrice: '30000000000',
      timeout: 100000,
    });
    expect(resTooLarge.status).toBe(400);
    const bodyLarge = await json(resTooLarge);
    expect(bodyLarge.code).toBe('ACTION_VALIDATION_FAILED');
  });
});
