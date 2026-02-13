/**
 * Tests for 6 new endpoints added in Phase 59-01:
 *
 * GET /v1/wallet/assets         (sessionAuth)
 * GET /v1/transactions          (sessionAuth, cursor pagination)
 * GET /v1/transactions/pending  (sessionAuth)
 * GET /v1/nonce                 (public)
 * GET /v1/wallets                (masterAuth)
 * GET /v1/wallets/:id            (masterAuth)
 *
 * Uses in-memory SQLite + mock adapter + mock keyStore + Hono app.request().
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import argon2 from 'argon2';
import { createApp } from '../api/server.js';
import { createDatabase, pushSchema, generateId } from '../infrastructure/database/index.js';
import { JwtSecretManager, type JwtPayload } from '../infrastructure/jwt/index.js';
import { DefaultPolicyEngine } from '../pipeline/default-policy-engine.js';
import type { DatabaseConnection } from '../infrastructure/database/index.js';
import type { DaemonConfig } from '../infrastructure/config/loader.js';
import type { LocalKeyStore } from '../infrastructure/keystore/keystore.js';
import type { IChainAdapter, BalanceInfo, HealthInfo, AssetInfo } from '@waiaas/core';
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

/** Mock assets returned by adapter.getAssets(). */
const MOCK_ASSETS: AssetInfo[] = [
  {
    mint: 'native',
    symbol: 'SOL',
    name: 'Solana',
    balance: 2_000_000_000n,
    decimals: 9,
    isNative: true,
  },
  {
    mint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
    symbol: 'USDC',
    name: 'USD Coin',
    balance: 100_000_000n,
    decimals: 6,
    isNative: false,
    usdValue: 100.0,
  },
];

/** Counter for generating unique mock public keys. */
let mockKeyCounter = 0;

function mockKeyStore(): LocalKeyStore {
  return {
    generateKeyPair: async () => {
      mockKeyCounter++;
      const key = `mock-public-key-${String(mockKeyCounter).padStart(20, '0')}`;
      return {
        publicKey: key,
        encryptedPrivateKey: new Uint8Array(64),
      };
    },
    decryptPrivateKey: async () => new Uint8Array(64),
    releaseKey: () => {},
    hasKey: async () => true,
    deleteKey: async () => {},
    lockAll: () => {},
    sodiumAvailable: true,
  } as unknown as LocalKeyStore;
}

function mockAdapter(assets: AssetInfo[] = MOCK_ASSETS): IChainAdapter {
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
    getAssets: async () => assets,
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

/** Create a mock AdapterPool that resolves to the given adapter. */
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

beforeEach(async () => {
  mockKeyCounter = 0;
  conn = createDatabase(':memory:');
  pushSchema(conn.sqlite);

  masterPasswordHash = await argon2.hash(TEST_MASTER_PASSWORD, {
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
    jwtSecretManager,
    policyEngine: new DefaultPolicyEngine(),
  });
});

afterEach(() => {
  conn.sqlite.close();
});

// ---------------------------------------------------------------------------
// Auth test helpers
// ---------------------------------------------------------------------------

async function createTestWallet(name = 'test-wallet'): Promise<string> {
  const res = await app.request('/v1/wallets', {
    method: 'POST',
    headers: {
      Host: HOST,
      'Content-Type': 'application/json',
      'X-Master-Password': TEST_MASTER_PASSWORD,
    },
    body: JSON.stringify({ name }),
  });
  const body = await json(res);
  return body.id as string;
}

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

/** Insert a transaction directly into DB for testing list endpoints. */
function insertTransaction(
  walletId: string,
  overrides: { id?: string; status?: string; type?: string; amount?: string; toAddress?: string } = {},
): string {
  const id = overrides.id ?? generateId();
  const now = Math.floor(Date.now() / 1000);

  conn.sqlite.prepare(
    `INSERT INTO transactions (id, wallet_id, chain, type, status, amount, to_address, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    walletId,
    'solana',
    overrides.type ?? 'TRANSFER',
    overrides.status ?? 'CONFIRMED',
    overrides.amount ?? '1000000000',
    overrides.toAddress ?? 'recipient-address',
    now,
  );

  return id;
}

// ---------------------------------------------------------------------------
// GET /v1/wallet/assets (3 tests)
// ---------------------------------------------------------------------------

describe('GET /v1/wallet/assets', () => {
  let walletId: string;
  let authHeader: string;

  beforeEach(async () => {
    walletId = await createTestWallet();
    authHeader = await createSessionToken(walletId);
  });

  it('should return 200 with native SOL + SPL token assets', async () => {
    const res = await app.request('/v1/wallet/assets', {
      headers: { Host: HOST, Authorization: authHeader },
    });

    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.walletId).toBe(walletId);
    expect(body.chain).toBe('solana');
    expect(body.network).toBe('devnet');

    const assets = body.assets as Array<Record<string, unknown>>;
    expect(assets).toHaveLength(2);

    // Native SOL
    expect(assets[0]!.mint).toBe('native');
    expect(assets[0]!.symbol).toBe('SOL');
    expect(assets[0]!.balance).toBe('2000000000');
    expect(assets[0]!.isNative).toBe(true);

    // USDC token
    expect(assets[1]!.mint).toBe('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
    expect(assets[1]!.symbol).toBe('USDC');
    expect(assets[1]!.balance).toBe('100000000');
    expect(assets[1]!.isNative).toBe(false);
    expect(assets[1]!.usdValue).toBe(100.0);
  });

  it('should return 200 with empty assets array when adapter returns []', async () => {
    // Rebuild app with empty-assets adapter
    const emptyApp = createApp({
      db: conn.db,
      sqlite: conn.sqlite,
      keyStore: mockKeyStore(),
      masterPassword: TEST_MASTER_PASSWORD,
      masterPasswordHash,
      config: mockConfig(),
      adapterPool: mockAdapterPool(mockAdapter([])),
      jwtSecretManager,
      policyEngine: new DefaultPolicyEngine(),
    });

    const res = await emptyApp.request('/v1/wallet/assets', {
      headers: { Host: HOST, Authorization: authHeader },
    });

    expect(res.status).toBe(200);
    const body = await json(res);
    const assets = body.assets as Array<unknown>;
    expect(assets).toHaveLength(0);
  });

  it('should return 401 without sessionAuth token', async () => {
    const res = await app.request('/v1/wallet/assets', {
      headers: { Host: HOST },
    });

    expect(res.status).toBe(401);
    const body = await json(res);
    expect(body.code).toBe('INVALID_TOKEN');
  });
});

// ---------------------------------------------------------------------------
// GET /v1/transactions (4 tests)
// ---------------------------------------------------------------------------

describe('GET /v1/transactions', () => {
  let walletId: string;
  let authHeader: string;

  beforeEach(async () => {
    walletId = await createTestWallet();
    authHeader = await createSessionToken(walletId);
  });

  it('should return 200 with paginated list (hasMore=true when more exist)', async () => {
    // Insert 3 transactions
    insertTransaction(walletId);
    insertTransaction(walletId);
    insertTransaction(walletId);

    const res = await app.request('/v1/transactions?limit=2', {
      headers: { Host: HOST, Authorization: authHeader },
    });

    expect(res.status).toBe(200);
    const body = await json(res);
    const items = body.items as Array<Record<string, unknown>>;
    expect(items).toHaveLength(2);
    expect(body.hasMore).toBe(true);
    expect(body.cursor).toBeTruthy();
  });

  it('should return cursor-based pagination (second page)', async () => {
    // Insert 3 transactions with distinct IDs (UUID v7 ordering)
    insertTransaction(walletId);
    insertTransaction(walletId);
    insertTransaction(walletId);

    // Get first page
    const res1 = await app.request('/v1/transactions?limit=2', {
      headers: { Host: HOST, Authorization: authHeader },
    });
    const body1 = await json(res1);
    const cursor = body1.cursor as string;

    // Get second page with cursor
    const res2 = await app.request(`/v1/transactions?limit=2&cursor=${cursor}`, {
      headers: { Host: HOST, Authorization: authHeader },
    });

    expect(res2.status).toBe(200);
    const body2 = await json(res2);
    const items2 = body2.items as Array<Record<string, unknown>>;
    expect(items2).toHaveLength(1); // Only 1 remaining
    expect(body2.hasMore).toBe(false);
  });

  it('should return 200 with empty list for wallet with no transactions', async () => {
    const res = await app.request('/v1/transactions', {
      headers: { Host: HOST, Authorization: authHeader },
    });

    expect(res.status).toBe(200);
    const body = await json(res);
    const items = body.items as Array<unknown>;
    expect(items).toHaveLength(0);
    expect(body.hasMore).toBe(false);
    expect(body.cursor).toBeNull();
  });

  it('should return 401 without sessionAuth token', async () => {
    const res = await app.request('/v1/transactions', {
      headers: { Host: HOST },
    });

    expect(res.status).toBe(401);
    const body = await json(res);
    expect(body.code).toBe('INVALID_TOKEN');
  });
});

// ---------------------------------------------------------------------------
// GET /v1/transactions/pending (3 tests)
// ---------------------------------------------------------------------------

describe('GET /v1/transactions/pending', () => {
  let walletId: string;
  let authHeader: string;

  beforeEach(async () => {
    walletId = await createTestWallet();
    authHeader = await createSessionToken(walletId);
  });

  it('should return 200 with only PENDING/QUEUED transactions', async () => {
    insertTransaction(walletId, { status: 'PENDING' });
    insertTransaction(walletId, { status: 'QUEUED' });
    insertTransaction(walletId, { status: 'CONFIRMED' });
    insertTransaction(walletId, { status: 'FAILED' });

    const res = await app.request('/v1/transactions/pending', {
      headers: { Host: HOST, Authorization: authHeader },
    });

    expect(res.status).toBe(200);
    const body = await json(res);
    const items = body.items as Array<Record<string, unknown>>;
    expect(items).toHaveLength(2);

    const statuses = items.map((i) => i.status);
    expect(statuses).toContain('PENDING');
    expect(statuses).toContain('QUEUED');
  });

  it('should exclude CONFIRMED and FAILED transactions', async () => {
    insertTransaction(walletId, { status: 'CONFIRMED' });
    insertTransaction(walletId, { status: 'FAILED' });

    const res = await app.request('/v1/transactions/pending', {
      headers: { Host: HOST, Authorization: authHeader },
    });

    expect(res.status).toBe(200);
    const body = await json(res);
    const items = body.items as Array<unknown>;
    expect(items).toHaveLength(0);
  });

  it('should return 401 without sessionAuth token', async () => {
    const res = await app.request('/v1/transactions/pending', {
      headers: { Host: HOST },
    });

    expect(res.status).toBe(401);
    const body = await json(res);
    expect(body.code).toBe('INVALID_TOKEN');
  });
});

// ---------------------------------------------------------------------------
// GET /v1/nonce (2 tests)
// ---------------------------------------------------------------------------

describe('GET /v1/nonce', () => {
  it('should return 200 with nonce (64 hex chars) and expiresAt (future timestamp)', async () => {
    const res = await app.request('/v1/nonce', {
      headers: { Host: HOST },
    });

    expect(res.status).toBe(200);
    const body = await json(res);
    const nonce = body.nonce as string;
    expect(nonce).toMatch(/^[0-9a-f]{64}$/);

    const expiresAt = body.expiresAt as number;
    const now = Math.floor(Date.now() / 1000);
    expect(expiresAt).toBeGreaterThan(now);
    expect(expiresAt).toBeLessThanOrEqual(now + 300 + 5); // 5s tolerance
  });

  it('should return different nonce on each call', async () => {
    const res1 = await app.request('/v1/nonce', { headers: { Host: HOST } });
    const res2 = await app.request('/v1/nonce', { headers: { Host: HOST } });

    const body1 = await json(res1);
    const body2 = await json(res2);

    expect(body1.nonce).not.toBe(body2.nonce);
  });
});

// ---------------------------------------------------------------------------
// GET /v1/wallets (2 tests)
// ---------------------------------------------------------------------------

describe('GET /v1/wallets (list)', () => {
  it('should return 200 with wallet list (masterAuth required)', async () => {
    // Create two wallets (mockKeyStore returns unique keys per call)
    await createTestWallet('wallet-1');
    await createTestWallet('wallet-2');

    const res = await app.request('/v1/wallets', {
      headers: {
        Host: HOST,
        'X-Master-Password': TEST_MASTER_PASSWORD,
      },
    });

    expect(res.status).toBe(200);
    const body = await json(res);
    const items = body.items as Array<Record<string, unknown>>;
    expect(items).toHaveLength(2);

    // Check shape
    expect(items[0]!.id).toBeTruthy();
    expect(items[0]!.chain).toBe('solana');
    expect(items[0]!.network).toBe('devnet');
    expect(items[0]!.publicKey).toBeTruthy();
    expect(items[0]!.status).toBe('ACTIVE');
    expect(typeof items[0]!.createdAt).toBe('number');
  });

  it('should return 401 without masterAuth header', async () => {
    const res = await app.request('/v1/wallets', {
      headers: { Host: HOST },
    });

    expect(res.status).toBe(401);
    const body = await json(res);
    expect(body.code).toBe('INVALID_MASTER_PASSWORD');
  });
});

// ---------------------------------------------------------------------------
// GET /v1/wallets/:id (3 tests)
// ---------------------------------------------------------------------------

describe('GET /v1/wallets/:id (detail)', () => {
  it('should return 200 with wallet detail including ownerState=NONE', async () => {
    const walletId = await createTestWallet();

    const res = await app.request(`/v1/wallets/${walletId}`, {
      headers: {
        Host: HOST,
        'X-Master-Password': TEST_MASTER_PASSWORD,
      },
    });

    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.id).toBe(walletId);
    expect(body.name).toBe('test-wallet');
    expect(body.chain).toBe('solana');
    expect(body.network).toBe('devnet');
    expect(body.publicKey).toBeTruthy();
    expect(body.status).toBe('ACTIVE');
    expect(body.ownerState).toBe('NONE');
    expect(body.ownerAddress).toBeNull();
    expect(typeof body.createdAt).toBe('number');
    expect(body.updatedAt).toBeTruthy(); // set on creation
  });

  it('should return ownerState=GRACE when owner set but unverified', async () => {
    const walletId = await createTestWallet();

    // Valid Solana base58 32-byte address (Solana System Program)
    const validSolanaAddress = 'Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr';

    // Set owner address via PUT
    await app.request(`/v1/wallets/${walletId}/owner`, {
      method: 'PUT',
      headers: {
        Host: HOST,
        'Content-Type': 'application/json',
        'X-Master-Password': TEST_MASTER_PASSWORD,
      },
      body: JSON.stringify({ owner_address: validSolanaAddress }),
    });

    const res = await app.request(`/v1/wallets/${walletId}`, {
      headers: {
        Host: HOST,
        'X-Master-Password': TEST_MASTER_PASSWORD,
      },
    });

    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.ownerState).toBe('GRACE');
    expect(body.ownerAddress).toBe(validSolanaAddress);
    expect(body.ownerVerified).toBe(false);
  });

  it('should return 404 for non-existent wallet ID', async () => {
    const fakeId = '00000000-0000-7000-8000-000000000099';
    const res = await app.request(`/v1/wallets/${fakeId}`, {
      headers: {
        Host: HOST,
        'X-Master-Password': TEST_MASTER_PASSWORD,
      },
    });

    expect(res.status).toBe(404);
    const body = await json(res);
    expect(body.code).toBe('WALLET_NOT_FOUND');
  });
});
