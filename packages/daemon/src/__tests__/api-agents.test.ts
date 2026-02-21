/**
 * Tests for wallet creation and wallet query API routes.
 *
 * Uses in-memory SQLite + mock keyStore + mock adapter + Hono app.request().
 *
 * v1.2: POST /v1/wallets requires X-Master-Password (masterAuth).
 *        GET /v1/wallet/* requires Authorization: Bearer wai_sess_<token> (sessionAuth).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import argon2 from 'argon2';
import { createApp } from '../api/server.js';
import { createDatabase, pushSchema, generateId } from '../infrastructure/database/index.js';
import { JwtSecretManager, type JwtPayload } from '../infrastructure/jwt/index.js';
import type { DatabaseConnection } from '../infrastructure/database/index.js';
import type { DaemonConfig } from '../infrastructure/config/loader.js';
import type { LocalKeyStore } from '../infrastructure/keystore/keystore.js';
import type { IChainAdapter, BalanceInfo, HealthInfo } from '@waiaas/core';
import type { AdapterPool } from '../infrastructure/adapter-pool.js';
import type { OpenAPIHono } from '@hono/zod-openapi';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Type-safe JSON body extraction from Response. */
async function json(res: Response): Promise<Record<string, unknown>> {
  return (await res.json()) as Record<string, unknown>;
}

/** Default Host header for all requests (passes hostGuard). */
const HOST = '127.0.0.1:3100';

const TEST_MASTER_PASSWORD = 'test-master-password';

/** Create a minimal DaemonConfig with defaults needed for tests. */
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

// Consistent mock public keys for all tests
const MOCK_SOLANA_PUBLIC_KEY = '11111111111111111111111111111112';
const MOCK_EVM_PUBLIC_KEY = '0x1234567890AbCDef1234567890abcdef12345678';

/** Create a mock keyStore with generateKeyPair that dispatches by chain. */
function mockKeyStore() {
  const ks = {
    generateKeyPair: vi.fn().mockImplementation(
      async (_walletId: string, chain: string, _network: string, _password: string) => {
        if (chain === 'ethereum') {
          return { publicKey: MOCK_EVM_PUBLIC_KEY, encryptedPrivateKey: new Uint8Array(32) };
        }
        return { publicKey: MOCK_SOLANA_PUBLIC_KEY, encryptedPrivateKey: new Uint8Array(64) };
      },
    ),
    decryptPrivateKey: async () => new Uint8Array(64),
    releaseKey: () => {},
    hasKey: async () => true,
    deleteKey: async () => {},
    lockAll: () => {},
    sodiumAvailable: true,
  } as unknown as LocalKeyStore;
  return ks;
}

/** Create a mock adapter with getBalance. */
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
    buildTransaction: async () => {
      throw new Error('not implemented');
    },
    simulateTransaction: async () => {
      throw new Error('not implemented');
    },
    signTransaction: async () => {
      throw new Error('not implemented');
    },
    submitTransaction: async () => {
      throw new Error('not implemented');
    },
    waitForConfirmation: async () => {
      throw new Error('not implemented');
    },
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
let masterPasswordHash: string;
let testKeyStore: LocalKeyStore;

beforeEach(async () => {
  conn = createDatabase(':memory:');
  pushSchema(conn.sqlite);

  // Hash master password for masterAuth
  masterPasswordHash = await argon2.hash(TEST_MASTER_PASSWORD, {
    type: argon2.argon2id,
    memoryCost: 4096,
    timeCost: 2,
    parallelism: 1,
  });

  // Initialize JWT secret manager for sessionAuth
  jwtSecretManager = new JwtSecretManager(conn.db);
  await jwtSecretManager.initialize();

  testKeyStore = mockKeyStore();

  app = createApp({
    db: conn.db,
    sqlite: conn.sqlite,
    keyStore: testKeyStore,
    masterPassword: TEST_MASTER_PASSWORD,
    masterPasswordHash,
    config: mockConfig(),
    adapterPool: mockAdapterPool(),
    jwtSecretManager,
  });
});

afterEach(() => {
  conn.sqlite.close();
});

// ---------------------------------------------------------------------------
// Auth test helpers
// ---------------------------------------------------------------------------

/** Create a wallet via POST with masterAuth header. Returns wallet ID. */
async function createTestWallet(): Promise<string> {
  const res = await app.request('/v1/wallets', {
    method: 'POST',
    headers: {
      Host: HOST,
      'Content-Type': 'application/json',
      'X-Master-Password': TEST_MASTER_PASSWORD,
    },
    body: JSON.stringify({ name: 'test-wallet' }),
  });
  const body = await json(res);
  return body.id as string;
}

/** Create a session and sign a JWT for the given wallet. Returns "Bearer wai_sess_<token>". */
async function createSessionToken(walletId: string): Promise<string> {
  const sessionId = generateId();
  const now = Math.floor(Date.now() / 1000);

  // Insert session into DB
  conn.sqlite.prepare(
    `INSERT INTO sessions (id, token_hash, expires_at, absolute_expires_at, created_at)
     VALUES (?, ?, ?, ?, ?)`,
  ).run(sessionId, `hash-${sessionId}`, now + 86400, now + 86400 * 30, now);
  conn.sqlite.prepare(
    `INSERT INTO session_wallets (session_id, wallet_id, is_default, created_at)
     VALUES (?, ?, 1, ?)`,
  ).run(sessionId, walletId, now);

  // Sign JWT
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
// POST /v1/wallets (7 tests)
// ---------------------------------------------------------------------------

describe('POST /v1/wallets (wallet CRUD)', () => {
  it('should return 201 with wallet JSON on valid request', async () => {
    const res = await app.request('/v1/wallets', {
      method: 'POST',
      headers: {
        Host: HOST,
        'Content-Type': 'application/json',
        'X-Master-Password': TEST_MASTER_PASSWORD,
      },
      body: JSON.stringify({ name: 'test-wallet' }),
    });

    expect(res.status).toBe(201);
    const body = await json(res);
    expect(body.name).toBe('test-wallet');
    expect(body.chain).toBe('solana');
    expect(body.network).toBe('devnet');
    expect(body.publicKey).toBe(MOCK_SOLANA_PUBLIC_KEY);
    expect(body.id).toBeTruthy();
  });

  it('should create wallet with status ACTIVE', async () => {
    const res = await app.request('/v1/wallets', {
      method: 'POST',
      headers: {
        Host: HOST,
        'Content-Type': 'application/json',
        'X-Master-Password': TEST_MASTER_PASSWORD,
      },
      body: JSON.stringify({ name: 'active-wallet' }),
    });

    const body = await json(res);
    expect(body.status).toBe('ACTIVE');
  });

  it('should return 400 on missing name field (Zod validation)', async () => {
    const res = await app.request('/v1/wallets', {
      method: 'POST',
      headers: {
        Host: HOST,
        'Content-Type': 'application/json',
        'X-Master-Password': TEST_MASTER_PASSWORD,
      },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(400);
    const body = await json(res);
    expect(body.code).toBe('ACTION_VALIDATION_FAILED');
  });

  it('should generate UUID-format wallet ID', async () => {
    const res = await app.request('/v1/wallets', {
      method: 'POST',
      headers: {
        Host: HOST,
        'Content-Type': 'application/json',
        'X-Master-Password': TEST_MASTER_PASSWORD,
      },
      body: JSON.stringify({ name: 'uuid-wallet' }),
    });

    const body = await json(res);
    const id = body.id as string;
    // UUID v7 format: 8-4-4-4-12 hex chars
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it('should persist wallet in database (SELECT after POST)', async () => {
    const res = await app.request('/v1/wallets', {
      method: 'POST',
      headers: {
        Host: HOST,
        'Content-Type': 'application/json',
        'X-Master-Password': TEST_MASTER_PASSWORD,
      },
      body: JSON.stringify({ name: 'persisted-wallet' }),
    });

    const body = await json(res);
    const walletId = body.id as string;

    // Verify in DB via raw SQL
    const row = conn.sqlite.prepare('SELECT * FROM wallets WHERE id = ?').get(walletId) as Record<
      string,
      unknown
    >;
    expect(row).toBeTruthy();
    expect(row.name).toBe('persisted-wallet');
    expect(row.chain).toBe('solana');
    expect(row.default_network).toBe('devnet');
    expect(row.environment).toBe('testnet');
    expect(row.status).toBe('ACTIVE');
    expect(row.public_key).toBe(MOCK_SOLANA_PUBLIC_KEY);
  });

  it('should return 401 without X-Master-Password header', async () => {
    const res = await app.request('/v1/wallets', {
      method: 'POST',
      headers: {
        Host: HOST,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ name: 'no-auth-wallet' }),
    });

    expect(res.status).toBe(401);
    const body = await json(res);
    expect(body.code).toBe('INVALID_MASTER_PASSWORD');
  });

  it('should return 401 with wrong master password', async () => {
    const res = await app.request('/v1/wallets', {
      method: 'POST',
      headers: {
        Host: HOST,
        'Content-Type': 'application/json',
        'X-Master-Password': 'wrong-password',
      },
      body: JSON.stringify({ name: 'bad-auth-wallet' }),
    });

    expect(res.status).toBe(401);
    const body = await json(res);
    expect(body.code).toBe('INVALID_MASTER_PASSWORD');
  });
});

// ---------------------------------------------------------------------------
// Chain-network validation (7 tests)
// ---------------------------------------------------------------------------

describe('chain-network validation', () => {
  it('POST /wallets with chain=solana, no network -> defaults to devnet', async () => {
    const res = await app.request('/v1/wallets', {
      method: 'POST',
      headers: {
        Host: HOST,
        'Content-Type': 'application/json',
        'X-Master-Password': TEST_MASTER_PASSWORD,
      },
      body: JSON.stringify({ name: 'sol-wallet', chain: 'solana' }),
    });

    expect(res.status).toBe(201);
    const body = await json(res);
    expect(body.network).toBe('devnet');
    expect(body.chain).toBe('solana');
  });

  it('POST /wallets with chain=ethereum, no network -> defaults to evm_default_network', async () => {
    const res = await app.request('/v1/wallets', {
      method: 'POST',
      headers: {
        Host: HOST,
        'Content-Type': 'application/json',
        'X-Master-Password': TEST_MASTER_PASSWORD,
      },
      body: JSON.stringify({ name: 'eth-wallet', chain: 'ethereum' }),
    });

    expect(res.status).toBe(201);
    const body = await json(res);
    expect(body.network).toBe('ethereum-sepolia'); // config default
    expect(body.chain).toBe('ethereum');
  });

  it('POST /wallets with chain=ethereum + network=ethereum-sepolia -> success', async () => {
    const res = await app.request('/v1/wallets', {
      method: 'POST',
      headers: {
        Host: HOST,
        'Content-Type': 'application/json',
        'X-Master-Password': TEST_MASTER_PASSWORD,
      },
      body: JSON.stringify({ name: 'eth-sepolia-wallet', chain: 'ethereum', network: 'ethereum-sepolia' }),
    });

    expect(res.status).toBe(201);
    const body = await json(res);
    expect(body.network).toBe('ethereum-sepolia');
  });

  it('POST /wallets with chain=ethereum + environment=mainnet -> defaults to ethereum-mainnet', async () => {
    const res = await app.request('/v1/wallets', {
      method: 'POST',
      headers: {
        Host: HOST,
        'Content-Type': 'application/json',
        'X-Master-Password': TEST_MASTER_PASSWORD,
      },
      body: JSON.stringify({ name: 'eth-main-wallet', chain: 'ethereum', environment: 'mainnet' }),
    });

    expect(res.status).toBe(201);
    const body = await json(res);
    expect(body.network).toBe('ethereum-mainnet');
    expect(body.environment).toBe('mainnet');
  });

  it('POST /wallets with invalid environment -> 400 validation error', async () => {
    const res = await app.request('/v1/wallets', {
      method: 'POST',
      headers: {
        Host: HOST,
        'Content-Type': 'application/json',
        'X-Master-Password': TEST_MASTER_PASSWORD,
      },
      body: JSON.stringify({ name: 'bad-wallet', chain: 'ethereum', environment: 'invalid-env' }),
    });

    expect(res.status).toBe(400);
    const body = await json(res);
    expect(body.code).toBe('ACTION_VALIDATION_FAILED');
  });

  it('POST /wallets response includes environment field', async () => {
    const res = await app.request('/v1/wallets', {
      method: 'POST',
      headers: {
        Host: HOST,
        'Content-Type': 'application/json',
        'X-Master-Password': TEST_MASTER_PASSWORD,
      },
      body: JSON.stringify({ name: 'env-wallet', chain: 'solana' }),
    });

    expect(res.status).toBe(201);
    const body = await json(res);
    expect(body.environment).toBe('testnet');
    expect(body.network).toBe('devnet');
  });

  it('POST /wallets with chain=solana + environment=mainnet -> success', async () => {
    const res = await app.request('/v1/wallets', {
      method: 'POST',
      headers: {
        Host: HOST,
        'Content-Type': 'application/json',
        'X-Master-Password': TEST_MASTER_PASSWORD,
      },
      body: JSON.stringify({ name: 'sol-main', chain: 'solana', environment: 'mainnet' }),
    });

    expect(res.status).toBe(201);
    const body = await json(res);
    expect(body.network).toBe('mainnet');
    expect(body.environment).toBe('mainnet');
    expect(body.chain).toBe('solana');
  });
});

// ---------------------------------------------------------------------------
// EVM wallet creation integration (5 tests)
// ---------------------------------------------------------------------------

describe('EVM wallet creation', () => {
  it('POST /wallets with chain=ethereum returns 201 with 0x-prefixed publicKey', async () => {
    const res = await app.request('/v1/wallets', {
      method: 'POST',
      headers: {
        Host: HOST,
        'Content-Type': 'application/json',
        'X-Master-Password': TEST_MASTER_PASSWORD,
      },
      body: JSON.stringify({ name: 'evm-test', chain: 'ethereum', network: 'ethereum-sepolia' }),
    });

    expect(res.status).toBe(201);
    const body = await json(res);
    expect(body.publicKey).toBe(MOCK_EVM_PUBLIC_KEY);
    expect((body.publicKey as string).startsWith('0x')).toBe(true);
    expect(body.chain).toBe('ethereum');
    expect(body.network).toBe('ethereum-sepolia');
  });

  it('POST /wallets with chain=ethereum and no network defaults to evm_default_network', async () => {
    const res = await app.request('/v1/wallets', {
      method: 'POST',
      headers: {
        Host: HOST,
        'Content-Type': 'application/json',
        'X-Master-Password': TEST_MASTER_PASSWORD,
      },
      body: JSON.stringify({ name: 'evm-default', chain: 'ethereum' }),
    });

    expect(res.status).toBe(201);
    const body = await json(res);
    expect(body.network).toBe('ethereum-sepolia'); // config evm_default_network
    expect(body.publicKey).toBe(MOCK_EVM_PUBLIC_KEY);
  });

  it('generateKeyPair receives defaultNetwork derived from environment for EVM wallet', async () => {
    await app.request('/v1/wallets', {
      method: 'POST',
      headers: {
        Host: HOST,
        'Content-Type': 'application/json',
        'X-Master-Password': TEST_MASTER_PASSWORD,
      },
      body: JSON.stringify({ name: 'evm-param-check', chain: 'ethereum', environment: 'mainnet' }),
    });

    const mockFn = testKeyStore.generateKeyPair as ReturnType<typeof vi.fn>;
    const calls = mockFn.mock.calls;
    const lastCall = calls[calls.length - 1]!;
    // generateKeyPair(walletId, chain, defaultNetwork, masterPassword)
    expect(lastCall[1]).toBe('ethereum');
    expect(lastCall[2]).toBe('ethereum-mainnet');
    expect(lastCall[3]).toBe(TEST_MASTER_PASSWORD);
  });

  it('generateKeyPair receives defaultNetwork derived from environment for Solana wallet', async () => {
    await app.request('/v1/wallets', {
      method: 'POST',
      headers: {
        Host: HOST,
        'Content-Type': 'application/json',
        'X-Master-Password': TEST_MASTER_PASSWORD,
      },
      body: JSON.stringify({ name: 'sol-param-check', chain: 'solana', environment: 'mainnet' }),
    });

    const mockFn = testKeyStore.generateKeyPair as ReturnType<typeof vi.fn>;
    const calls = mockFn.mock.calls;
    const lastCall = calls[calls.length - 1]!;
    // generateKeyPair(walletId, chain, defaultNetwork, masterPassword)
    expect(lastCall[1]).toBe('solana');
    expect(lastCall[2]).toBe('mainnet');
    expect(lastCall[3]).toBe(TEST_MASTER_PASSWORD);
  });

  it('EVM wallet is persisted with 0x address in database', async () => {
    const res = await app.request('/v1/wallets', {
      method: 'POST',
      headers: {
        Host: HOST,
        'Content-Type': 'application/json',
        'X-Master-Password': TEST_MASTER_PASSWORD,
      },
      body: JSON.stringify({ name: 'evm-persist', chain: 'ethereum', network: 'ethereum-sepolia' }),
    });

    const body = await json(res);
    const walletId = body.id as string;

    // Verify in DB
    const row = conn.sqlite.prepare('SELECT * FROM wallets WHERE id = ?').get(walletId) as Record<
      string,
      unknown
    >;
    expect(row).toBeTruthy();
    expect(row.chain).toBe('ethereum');
    expect(row.default_network).toBe('ethereum-sepolia');
    expect(row.environment).toBe('testnet');
    expect(row.public_key).toBe(MOCK_EVM_PUBLIC_KEY);
    expect((row.public_key as string).startsWith('0x')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// GET /v1/wallet/address (4 tests)
// ---------------------------------------------------------------------------

describe('GET /v1/wallet/address', () => {
  let walletId: string;
  let authHeader: string;

  beforeEach(async () => {
    walletId = await createTestWallet();
    authHeader = await createSessionToken(walletId);
  });

  it('should return 200 with address JSON for valid wallet', async () => {
    const res = await app.request('/v1/wallet/address', {
      headers: { Host: HOST, Authorization: authHeader },
    });

    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.walletId).toBe(walletId);
    expect(body.chain).toBe('solana');
    expect(body.network).toBe('devnet');
    expect(body.address).toBe(MOCK_SOLANA_PUBLIC_KEY);
  });

  it('should return 404 SESSION_NOT_FOUND when session does not exist in DB', async () => {
    // Sign a JWT with valid format but session not in DB
    const fakeSessionId = generateId();
    const fakeWalletId = '00000000-0000-7000-8000-000000000000';
    const now = Math.floor(Date.now() / 1000);

    const payload: JwtPayload = { sub: fakeSessionId, wlt: fakeWalletId, iat: now, exp: now + 3600 };
    const token = await jwtSecretManager.signToken(payload);

    const res = await app.request('/v1/wallet/address', {
      headers: { Host: HOST, Authorization: `Bearer ${token}` },
    });

    expect(res.status).toBe(404);
    const body = await json(res);
    expect(body.code).toBe('SESSION_NOT_FOUND');
  });

  it('should return 401 without Authorization header', async () => {
    const res = await app.request('/v1/wallet/address', {
      headers: { Host: HOST },
    });

    expect(res.status).toBe(401);
    const body = await json(res);
    expect(body.code).toBe('INVALID_TOKEN');
  });

  it('should return 401 with invalid token format', async () => {
    const res = await app.request('/v1/wallet/address', {
      headers: { Host: HOST, Authorization: 'Bearer not-a-valid-token' },
    });

    expect(res.status).toBe(401);
    const body = await json(res);
    expect(body.code).toBe('INVALID_TOKEN');
  });
});

// ---------------------------------------------------------------------------
// GET /v1/wallet/balance (4 tests)
// ---------------------------------------------------------------------------

describe('GET /v1/wallet/balance', () => {
  let walletId: string;
  let authHeader: string;

  beforeEach(async () => {
    walletId = await createTestWallet();
    authHeader = await createSessionToken(walletId);
  });

  it('should return 200 with balance as string for valid wallet', async () => {
    const res = await app.request('/v1/wallet/balance', {
      headers: { Host: HOST, Authorization: authHeader },
    });

    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.balance).toBe('1000000000');
  });

  it('should include correct decimals and symbol', async () => {
    const res = await app.request('/v1/wallet/balance', {
      headers: { Host: HOST, Authorization: authHeader },
    });

    const body = await json(res);
    expect(body.decimals).toBe(9);
    expect(body.symbol).toBe('SOL');
    expect(body.walletId).toBe(walletId);
    expect(body.chain).toBe('solana');
    expect(body.network).toBe('devnet');
    expect(body.address).toBe(MOCK_SOLANA_PUBLIC_KEY);
  });

  it('should return 401 without Authorization header', async () => {
    const res = await app.request('/v1/wallet/balance', {
      headers: { Host: HOST },
    });

    expect(res.status).toBe(401);
    const body = await json(res);
    expect(body.code).toBe('INVALID_TOKEN');
  });

  it('should return 401 with expired token', async () => {
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
      wlt: walletId,
      iat: now - 7200,
      exp: now - 3600, // expired
    };
    const token = await jwtSecretManager.signToken(payload);

    const res = await app.request('/v1/wallet/balance', {
      headers: { Host: HOST, Authorization: `Bearer ${token}` },
    });

    expect(res.status).toBe(401);
    const body = await json(res);
    expect(body.code).toBe('TOKEN_EXPIRED');
  });
});

// ---------------------------------------------------------------------------
// Integration flow (2 tests)
// ---------------------------------------------------------------------------

describe('Integration flow', () => {
  it('should create wallet then get matching address', async () => {
    // Create
    const createRes = await app.request('/v1/wallets', {
      method: 'POST',
      headers: {
        Host: HOST,
        'Content-Type': 'application/json',
        'X-Master-Password': TEST_MASTER_PASSWORD,
      },
      body: JSON.stringify({ name: 'flow-wallet' }),
    });
    const created = await json(createRes);
    const walletId = created.id as string;

    // Create session for wallet query
    const authHeader = await createSessionToken(walletId);

    // Get address
    const addrRes = await app.request('/v1/wallet/address', {
      headers: { Host: HOST, Authorization: authHeader },
    });
    const addr = await json(addrRes);

    // Verify publicKey matches
    expect(addr.address).toBe(created.publicKey);
    expect(addr.walletId).toBe(walletId);
  });

  it('should create wallet then get balance with correct shape', async () => {
    // Create
    const createRes = await app.request('/v1/wallets', {
      method: 'POST',
      headers: {
        Host: HOST,
        'Content-Type': 'application/json',
        'X-Master-Password': TEST_MASTER_PASSWORD,
      },
      body: JSON.stringify({ name: 'balance-flow-wallet' }),
    });
    const created = await json(createRes);
    const walletId = created.id as string;

    // Create session for wallet query
    const authHeader = await createSessionToken(walletId);

    // Get balance
    const balRes = await app.request('/v1/wallet/balance', {
      headers: { Host: HOST, Authorization: authHeader },
    });
    const bal = await json(balRes);

    expect(balRes.status).toBe(200);
    expect(bal.walletId).toBe(walletId);
    expect(bal.address).toBe(created.publicKey);
    expect(typeof bal.balance).toBe('string');
    expect(typeof bal.decimals).toBe('number');
    expect(typeof bal.symbol).toBe('string');
  });
});
