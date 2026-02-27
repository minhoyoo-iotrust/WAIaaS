/**
 * Tests for cross-wallet admin API endpoints (Phase 239-02):
 *
 * GET /v1/admin/transactions - Cross-wallet transaction list with filters and pagination
 * GET /v1/admin/incoming     - Cross-wallet incoming transaction list with filters and pagination
 *
 * Uses in-memory SQLite + mock adapter + mock keyStore + Hono app.request().
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import argon2 from 'argon2';
import { createApp } from '../api/server.js';
import { createDatabase, pushSchema } from '../infrastructure/database/index.js';
import { JwtSecretManager } from '../infrastructure/jwt/index.js';
import { DefaultPolicyEngine } from '../pipeline/default-policy-engine.js';
import { generateId } from '../infrastructure/database/id.js';
import { wallets, transactions, incomingTransactions } from '../infrastructure/database/schema.js';
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
      port: 3100, hostname: '127.0.0.1', log_level: 'info', log_file: 'logs/daemon.log',
      log_max_size: '50MB', log_max_files: 5, pid_file: 'daemon.pid', shutdown_timeout: 30, dev_mode: false,
      admin_ui: true, admin_timeout: 900,
    },
    keystore: { argon2_memory: 65536, argon2_time: 3, argon2_parallelism: 4, backup_on_rotate: true },
    database: { path: ':memory:', wal_checkpoint_interval: 300, busy_timeout: 5000, cache_size: 64000, mmap_size: 268435456 },
    rpc: {
      solana_mainnet: 'https://api.mainnet-beta.solana.com', solana_devnet: 'https://api.devnet.solana.com',
      solana_testnet: 'https://api.testnet.solana.com', solana_ws_mainnet: 'wss://api.mainnet-beta.solana.com',
      solana_ws_devnet: 'wss://api.devnet.solana.com',
      evm_ethereum_mainnet: '', evm_ethereum_sepolia: '', evm_polygon_mainnet: '', evm_polygon_amoy: '',
      evm_arbitrum_mainnet: '', evm_arbitrum_sepolia: '', evm_optimism_mainnet: '', evm_optimism_sepolia: '',
      evm_base_mainnet: '', evm_base_sepolia: '',
    },
    notifications: {
      enabled: false, min_channels: 2, health_check_interval: 300, log_retention_days: 30, dedup_ttl: 300,
      telegram_bot_token: '', telegram_chat_id: '', discord_webhook_url: '',
      ntfy_server: 'https://ntfy.sh', ntfy_topic: '', locale: 'en' as const, rate_limit_rpm: 20,
    },
    security: {
      session_ttl: 86400, session_absolute_lifetime: 31536000, session_max_renewals: 12, jwt_secret: '', max_sessions_per_wallet: 5, max_pending_tx: 10,
      nonce_storage: 'memory' as const, nonce_cache_max: 1000, nonce_cache_ttl: 300,
      rate_limit_global_ip_rpm: 1000, rate_limit_session_rpm: 300, rate_limit_tx_rpm: 10,
      cors_origins: ['http://localhost:3100'], autostop_consecutive_failures_threshold: 5,
      policy_defaults_delay_seconds: 300, policy_defaults_approval_timeout: 3600,
      kill_switch_recovery_cooldown: 1800, kill_switch_max_recovery_attempts: 3,
    },
    walletconnect: { project_id: '' },
  };
}

let mockKeyCounter = 0;
function mockKeyStore(): LocalKeyStore {
  return {
    generateKeyPair: async () => {
      mockKeyCounter++;
      return { publicKey: `mock-public-key-${String(mockKeyCounter).padStart(20, '0')}`, encryptedPrivateKey: new Uint8Array(64) };
    },
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
    chain: 'solana' as const, network: 'devnet' as const,
    connect: async () => {}, disconnect: async () => {}, isConnected: () => true,
    getHealth: async (): Promise<HealthInfo> => ({ healthy: true, latencyMs: 1 }),
    getBalance: async (addr: string): Promise<BalanceInfo> => ({ address: addr, balance: 1_000_000_000n, decimals: 9, symbol: 'SOL' }),
    buildTransaction: async () => { throw new Error('not implemented'); },
    simulateTransaction: async () => { throw new Error('not implemented'); },
    signTransaction: async () => { throw new Error('not implemented'); },
    submitTransaction: async () => { throw new Error('not implemented'); },
    waitForConfirmation: async () => { throw new Error('not implemented'); },
    getAssets: async (): Promise<AssetInfo[]> => [],
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

function mockAdapterPool(): AdapterPool {
  return {
    resolve: vi.fn().mockResolvedValue(mockAdapter()),
    disconnectAll: vi.fn().mockResolvedValue(undefined),
    get size() { return 0; },
  } as unknown as AdapterPool;
}

// ---------------------------------------------------------------------------
// Shared test state
// ---------------------------------------------------------------------------

let conn: DatabaseConnection;
let app: OpenAPIHono;
let masterPasswordHash: string;
let wallet1Id: string;
let wallet2Id: string;

// Seeded transaction IDs for assertions
const txIds: string[] = [];
const incomingIds: string[] = [];

const nowSec = Math.floor(Date.now() / 1000);

beforeEach(async () => {
  mockKeyCounter = 0;
  txIds.length = 0;
  incomingIds.length = 0;

  conn = createDatabase(':memory:');
  pushSchema(conn.sqlite);

  masterPasswordHash = await argon2.hash(TEST_MASTER_PASSWORD, {
    type: argon2.argon2id, memoryCost: 4096, timeCost: 2, parallelism: 1,
  });

  const jwtSecretManager = new JwtSecretManager(conn.db);
  await jwtSecretManager.initialize();

  app = createApp({
    db: conn.db, sqlite: conn.sqlite, keyStore: mockKeyStore(),
    masterPassword: TEST_MASTER_PASSWORD, masterPasswordHash,
    config: mockConfig(), adapterPool: mockAdapterPool(), jwtSecretManager,
    policyEngine: new DefaultPolicyEngine(),
    startTime: nowSec - 60,
  });

  // Create 2 wallets directly in DB
  wallet1Id = generateId();
  wallet2Id = generateId();

  conn.db.insert(wallets).values({
    id: wallet1Id,
    name: 'Wallet Alpha',
    chain: 'solana',
    environment: 'testnet',
    defaultNetwork: 'devnet',
    publicKey: `pk-alpha-${wallet1Id.slice(0, 8)}`,
    status: 'ACTIVE',
    createdAt: new Date(nowSec * 1000),
    updatedAt: new Date(nowSec * 1000),
  }).run();

  conn.db.insert(wallets).values({
    id: wallet2Id,
    name: 'Wallet Beta',
    chain: 'ethereum',
    environment: 'testnet',
    defaultNetwork: 'ethereum-sepolia',
    publicKey: `pk-beta-${wallet2Id.slice(0, 8)}`,
    status: 'ACTIVE',
    createdAt: new Date(nowSec * 1000),
    updatedAt: new Date(nowSec * 1000),
  }).run();

  // Seed 5 transactions with varied types/statuses/networks
  const txData = [
    { walletId: wallet1Id, chain: 'solana', type: 'TRANSFER', status: 'CONFIRMED', network: 'devnet', toAddress: 'addr1', amount: '1000000000', txHash: 'hash1', createdAt: new Date((nowSec - 3600) * 1000) },
    { walletId: wallet1Id, chain: 'solana', type: 'TOKEN_TRANSFER', status: 'PENDING', network: 'devnet', toAddress: 'addr2', amount: '500000', txHash: 'hash2', createdAt: new Date((nowSec - 1800) * 1000) },
    { walletId: wallet2Id, chain: 'ethereum', type: 'TRANSFER', status: 'CONFIRMED', network: 'ethereum-sepolia', toAddress: 'addr3', amount: '2000000000000000000', txHash: 'hash3', createdAt: new Date((nowSec - 900) * 1000) },
    { walletId: wallet2Id, chain: 'ethereum', type: 'CONTRACT_CALL', status: 'FAILED', network: 'ethereum-sepolia', toAddress: 'addr4', amount: '0', txHash: 'hash4', createdAt: new Date((nowSec - 600) * 1000) },
    { walletId: wallet1Id, chain: 'solana', type: 'TRANSFER', status: 'CONFIRMED', network: 'devnet', toAddress: 'addr5', amount: '3000000000', txHash: 'hash5', createdAt: new Date((nowSec - 300) * 1000) },
  ];

  for (const tx of txData) {
    const id = generateId();
    txIds.push(id);
    conn.db.insert(transactions).values({ id, ...tx }).run();
  }

  // Seed 3 incoming transactions with varied chains/statuses/suspicious
  const incomingData = [
    { walletId: wallet1Id, txHash: 'in-hash1', fromAddress: 'sender1', amount: '100000000', chain: 'solana', network: 'devnet', status: 'CONFIRMED', blockNumber: 12345, detectedAt: new Date((nowSec - 2000) * 1000), confirmedAt: new Date((nowSec - 1900) * 1000), isSuspicious: false },
    { walletId: wallet2Id, txHash: 'in-hash2', fromAddress: 'sender2', amount: '5000000000000000000', chain: 'ethereum', network: 'ethereum-sepolia', status: 'DETECTED', blockNumber: 67890, detectedAt: new Date((nowSec - 1000) * 1000), isSuspicious: true },
    { walletId: wallet1Id, txHash: 'in-hash3', fromAddress: 'sender3', amount: '200000000', chain: 'solana', network: 'devnet', status: 'CONFIRMED', blockNumber: 12400, detectedAt: new Date((nowSec - 500) * 1000), confirmedAt: new Date((nowSec - 400) * 1000), isSuspicious: false },
  ];

  for (const inc of incomingData) {
    const id = generateId();
    incomingIds.push(id);
    conn.db.insert(incomingTransactions).values({ id, ...inc }).run();
  }
});

afterEach(() => {
  conn.sqlite.close();
});

// ---------------------------------------------------------------------------
// GET /v1/admin/transactions tests (8 tests)
// ---------------------------------------------------------------------------

describe('GET /v1/admin/transactions', () => {
  it('returns all transactions across wallets with walletName (no filters)', async () => {
    const res = await app.request('/v1/admin/transactions', {
      headers: { Host: HOST, 'X-Master-Password': TEST_MASTER_PASSWORD },
    });

    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.total).toBe(5);
    expect(body.offset).toBe(0);
    expect(body.limit).toBe(20);

    const items = body.items as Array<Record<string, unknown>>;
    expect(items).toHaveLength(5);

    // Verify walletName is populated
    const walletNames = items.map((i) => i.walletName);
    expect(walletNames).toContain('Wallet Alpha');
    expect(walletNames).toContain('Wallet Beta');

    // Verify ordering: most recent first (by createdAt desc)
    const firstItem = items[0]!;
    expect(firstItem.txHash).toBe('hash5'); // most recent (nowSec - 300)
  });

  it('returns 401 without masterAuth header', async () => {
    const res = await app.request('/v1/admin/transactions', {
      headers: { Host: HOST },
    });

    expect(res.status).toBe(401);
    const body = await json(res);
    expect(body.code).toBe('INVALID_MASTER_PASSWORD');
  });

  it('filters by wallet_id', async () => {
    const res = await app.request(`/v1/admin/transactions?wallet_id=${wallet1Id}`, {
      headers: { Host: HOST, 'X-Master-Password': TEST_MASTER_PASSWORD },
    });

    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.total).toBe(3); // wallet1 has 3 transactions
    const items = body.items as Array<Record<string, unknown>>;
    for (const item of items) {
      expect(item.walletId).toBe(wallet1Id);
    }
  });

  it('filters by type (TRANSFER)', async () => {
    const res = await app.request('/v1/admin/transactions?type=TRANSFER', {
      headers: { Host: HOST, 'X-Master-Password': TEST_MASTER_PASSWORD },
    });

    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.total).toBe(3); // 3 TRANSFER transactions
    const items = body.items as Array<Record<string, unknown>>;
    for (const item of items) {
      expect(item.type).toBe('TRANSFER');
    }
  });

  it('filters by status (CONFIRMED)', async () => {
    const res = await app.request('/v1/admin/transactions?status=CONFIRMED', {
      headers: { Host: HOST, 'X-Master-Password': TEST_MASTER_PASSWORD },
    });

    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.total).toBe(3); // 3 CONFIRMED transactions
    const items = body.items as Array<Record<string, unknown>>;
    for (const item of items) {
      expect(item.status).toBe('CONFIRMED');
    }
  });

  it('filters by network', async () => {
    const res = await app.request('/v1/admin/transactions?network=ethereum-sepolia', {
      headers: { Host: HOST, 'X-Master-Password': TEST_MASTER_PASSWORD },
    });

    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.total).toBe(2); // 2 ethereum-sepolia transactions
    const items = body.items as Array<Record<string, unknown>>;
    for (const item of items) {
      expect(item.network).toBe('ethereum-sepolia');
    }
  });

  it('filters by date range (since + until)', async () => {
    // since = nowSec - 1000 (covers txs at -900 and -300)
    // until = nowSec - 200 (covers tx at -300 but not future)
    const since = nowSec - 1000;
    const until = nowSec - 200;
    const res = await app.request(`/v1/admin/transactions?since=${since}&until=${until}`, {
      headers: { Host: HOST, 'X-Master-Password': TEST_MASTER_PASSWORD },
    });

    expect(res.status).toBe(200);
    const body = await json(res);
    // txs at: -3600, -1800, -900, -600, -300
    // since=-1000: includes -900, -600, -300
    // until=-200: includes -900, -600, -300
    expect(body.total).toBe(3);
  });

  it('supports pagination with offset=2&limit=2', async () => {
    const res = await app.request('/v1/admin/transactions?offset=2&limit=2', {
      headers: { Host: HOST, 'X-Master-Password': TEST_MASTER_PASSWORD },
    });

    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.total).toBe(5); // total count is still 5
    expect(body.offset).toBe(2);
    expect(body.limit).toBe(2);
    const items = body.items as Array<Record<string, unknown>>;
    expect(items).toHaveLength(2); // only 2 items in slice
  });
});

// ---------------------------------------------------------------------------
// GET /v1/admin/incoming tests (7 tests)
// ---------------------------------------------------------------------------

describe('GET /v1/admin/incoming', () => {
  it('returns all incoming transactions across wallets with walletName (no filters)', async () => {
    const res = await app.request('/v1/admin/incoming', {
      headers: { Host: HOST, 'X-Master-Password': TEST_MASTER_PASSWORD },
    });

    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.total).toBe(3);
    expect(body.offset).toBe(0);
    expect(body.limit).toBe(20);

    const items = body.items as Array<Record<string, unknown>>;
    expect(items).toHaveLength(3);

    // Verify walletName is populated
    const walletNames = items.map((i) => i.walletName);
    expect(walletNames).toContain('Wallet Alpha');
    expect(walletNames).toContain('Wallet Beta');

    // Admin sees ALL statuses (no default CONFIRMED filter)
    const statuses = items.map((i) => i.status);
    expect(statuses).toContain('DETECTED');
    expect(statuses).toContain('CONFIRMED');
  });

  it('returns 401 without masterAuth header', async () => {
    const res = await app.request('/v1/admin/incoming', {
      headers: { Host: HOST },
    });

    expect(res.status).toBe(401);
    const body = await json(res);
    expect(body.code).toBe('INVALID_MASTER_PASSWORD');
  });

  it('filters by wallet_id', async () => {
    const res = await app.request(`/v1/admin/incoming?wallet_id=${wallet1Id}`, {
      headers: { Host: HOST, 'X-Master-Password': TEST_MASTER_PASSWORD },
    });

    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.total).toBe(2); // wallet1 has 2 incoming transactions
    const items = body.items as Array<Record<string, unknown>>;
    for (const item of items) {
      expect(item.walletId).toBe(wallet1Id);
    }
  });

  it('filters by chain', async () => {
    const res = await app.request('/v1/admin/incoming?chain=ethereum', {
      headers: { Host: HOST, 'X-Master-Password': TEST_MASTER_PASSWORD },
    });

    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.total).toBe(1); // 1 ethereum incoming
    const items = body.items as Array<Record<string, unknown>>;
    expect(items[0]!.chain).toBe('ethereum');
  });

  it('filters by status', async () => {
    const res = await app.request('/v1/admin/incoming?status=DETECTED', {
      headers: { Host: HOST, 'X-Master-Password': TEST_MASTER_PASSWORD },
    });

    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.total).toBe(1); // 1 DETECTED
    const items = body.items as Array<Record<string, unknown>>;
    expect(items[0]!.status).toBe('DETECTED');
  });

  it('filters by suspicious=true', async () => {
    const res = await app.request('/v1/admin/incoming?suspicious=true', {
      headers: { Host: HOST, 'X-Master-Password': TEST_MASTER_PASSWORD },
    });

    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.total).toBe(1); // 1 suspicious
    const items = body.items as Array<Record<string, unknown>>;
    expect(items[0]!.suspicious).toBe(true);
    expect(items[0]!.txHash).toBe('in-hash2');
  });

  it('supports pagination with offset=1&limit=1', async () => {
    const res = await app.request('/v1/admin/incoming?offset=1&limit=1', {
      headers: { Host: HOST, 'X-Master-Password': TEST_MASTER_PASSWORD },
    });

    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.total).toBe(3); // total count is still 3
    expect(body.offset).toBe(1);
    expect(body.limit).toBe(1);
    const items = body.items as Array<Record<string, unknown>>;
    expect(items).toHaveLength(1); // only 1 item in slice
  });
});
