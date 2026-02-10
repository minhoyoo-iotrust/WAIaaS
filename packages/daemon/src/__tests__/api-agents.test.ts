/**
 * Tests for agent creation and wallet query API routes.
 *
 * Uses in-memory SQLite + mock keyStore + mock adapter + Hono app.request().
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createApp } from '../api/server.js';
import { createDatabase, pushSchema } from '../infrastructure/database/index.js';
import type { DatabaseConnection } from '../infrastructure/database/index.js';
import type { DaemonConfig } from '../infrastructure/config/loader.js';
import type { LocalKeyStore } from '../infrastructure/keystore/keystore.js';
import type { IChainAdapter, BalanceInfo, HealthInfo } from '@waiaas/core';
import type { Hono } from 'hono';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Type-safe JSON body extraction from Response. */
async function json(res: Response): Promise<Record<string, unknown>> {
  return (await res.json()) as Record<string, unknown>;
}

/** Default Host header for all requests (passes hostGuard). */
const HOST = '127.0.0.1:3100';

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
      ethereum_mainnet: '',
      ethereum_sepolia: '',
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
    },
    security: {
      session_ttl: 86400,
      jwt_secret: '',
      max_sessions_per_agent: 5,
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

// Consistent mock public key for all tests
const MOCK_PUBLIC_KEY = '11111111111111111111111111111112';

/** Create a mock keyStore with generateKeyPair. */
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
  };
}

// ---------------------------------------------------------------------------
// Test setup
// ---------------------------------------------------------------------------

let conn: DatabaseConnection;
let app: Hono;

beforeEach(() => {
  conn = createDatabase(':memory:');
  pushSchema(conn.sqlite);

  app = createApp({
    db: conn.db,
    keyStore: mockKeyStore(),
    masterPassword: 'test-master-password',
    config: mockConfig(),
    adapter: mockAdapter(),
  });
});

afterEach(() => {
  conn.sqlite.close();
});

// ---------------------------------------------------------------------------
// POST /v1/agents (5 tests)
// ---------------------------------------------------------------------------

describe('POST /v1/agents', () => {
  it('should return 201 with agent JSON on valid request', async () => {
    const res = await app.request('/v1/agents', {
      method: 'POST',
      headers: { Host: HOST, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'test-agent' }),
    });

    expect(res.status).toBe(201);
    const body = await json(res);
    expect(body.name).toBe('test-agent');
    expect(body.chain).toBe('solana');
    expect(body.network).toBe('devnet');
    expect(body.publicKey).toBe(MOCK_PUBLIC_KEY);
    expect(body.id).toBeTruthy();
  });

  it('should create agent with status ACTIVE', async () => {
    const res = await app.request('/v1/agents', {
      method: 'POST',
      headers: { Host: HOST, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'active-agent' }),
    });

    const body = await json(res);
    expect(body.status).toBe('ACTIVE');
  });

  it('should return 400 on missing name field (Zod validation)', async () => {
    const res = await app.request('/v1/agents', {
      method: 'POST',
      headers: { Host: HOST, 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(400);
    const body = await json(res);
    expect(body.code).toBe('ACTION_VALIDATION_FAILED');
  });

  it('should generate UUID-format agent ID', async () => {
    const res = await app.request('/v1/agents', {
      method: 'POST',
      headers: { Host: HOST, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'uuid-agent' }),
    });

    const body = await json(res);
    const id = body.id as string;
    // UUID v7 format: 8-4-4-4-12 hex chars
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it('should persist agent in database (SELECT after POST)', async () => {
    const res = await app.request('/v1/agents', {
      method: 'POST',
      headers: { Host: HOST, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'persisted-agent' }),
    });

    const body = await json(res);
    const agentId = body.id as string;

    // Verify in DB via raw SQL
    const row = conn.sqlite.prepare('SELECT * FROM agents WHERE id = ?').get(agentId) as Record<
      string,
      unknown
    >;
    expect(row).toBeTruthy();
    expect(row.name).toBe('persisted-agent');
    expect(row.chain).toBe('solana');
    expect(row.network).toBe('devnet');
    expect(row.status).toBe('ACTIVE');
    expect(row.public_key).toBe(MOCK_PUBLIC_KEY);
  });
});

// ---------------------------------------------------------------------------
// GET /v1/wallet/address (3 tests)
// ---------------------------------------------------------------------------

describe('GET /v1/wallet/address', () => {
  let agentId: string;

  beforeEach(async () => {
    // Create an agent first
    const res = await app.request('/v1/agents', {
      method: 'POST',
      headers: { Host: HOST, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'wallet-test-agent' }),
    });
    const body = await json(res);
    agentId = body.id as string;
  });

  it('should return 200 with address JSON for valid agent', async () => {
    const res = await app.request('/v1/wallet/address', {
      headers: { Host: HOST, 'X-Agent-Id': agentId },
    });

    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.agentId).toBe(agentId);
    expect(body.chain).toBe('solana');
    expect(body.network).toBe('devnet');
    expect(body.address).toBe(MOCK_PUBLIC_KEY);
  });

  it('should return 404 for non-existent agent ID', async () => {
    const res = await app.request('/v1/wallet/address', {
      headers: { Host: HOST, 'X-Agent-Id': '00000000-0000-7000-8000-000000000000' },
    });

    expect(res.status).toBe(404);
    const body = await json(res);
    expect(body.code).toBe('AGENT_NOT_FOUND');
  });

  it('should return 400 for missing X-Agent-Id header', async () => {
    const res = await app.request('/v1/wallet/address', {
      headers: { Host: HOST },
    });

    expect(res.status).toBe(400);
    const body = await json(res);
    expect(body.code).toBe('ACTION_VALIDATION_FAILED');
  });
});

// ---------------------------------------------------------------------------
// GET /v1/wallet/balance (3 tests)
// ---------------------------------------------------------------------------

describe('GET /v1/wallet/balance', () => {
  let agentId: string;

  beforeEach(async () => {
    const res = await app.request('/v1/agents', {
      method: 'POST',
      headers: { Host: HOST, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'balance-test-agent' }),
    });
    const body = await json(res);
    agentId = body.id as string;
  });

  it('should return 200 with balance as string for valid agent', async () => {
    const res = await app.request('/v1/wallet/balance', {
      headers: { Host: HOST, 'X-Agent-Id': agentId },
    });

    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.balance).toBe('1000000000');
  });

  it('should include correct decimals and symbol', async () => {
    const res = await app.request('/v1/wallet/balance', {
      headers: { Host: HOST, 'X-Agent-Id': agentId },
    });

    const body = await json(res);
    expect(body.decimals).toBe(9);
    expect(body.symbol).toBe('SOL');
    expect(body.agentId).toBe(agentId);
    expect(body.chain).toBe('solana');
    expect(body.network).toBe('devnet');
    expect(body.address).toBe(MOCK_PUBLIC_KEY);
  });

  it('should return 404 for non-existent agent', async () => {
    const res = await app.request('/v1/wallet/balance', {
      headers: { Host: HOST, 'X-Agent-Id': '00000000-0000-7000-8000-000000000000' },
    });

    expect(res.status).toBe(404);
    const body = await json(res);
    expect(body.code).toBe('AGENT_NOT_FOUND');
  });
});

// ---------------------------------------------------------------------------
// Integration flow (2 tests)
// ---------------------------------------------------------------------------

describe('Integration flow', () => {
  it('should create agent then get matching address', async () => {
    // Create
    const createRes = await app.request('/v1/agents', {
      method: 'POST',
      headers: { Host: HOST, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'flow-agent' }),
    });
    const created = await json(createRes);
    const agentId = created.id as string;

    // Get address
    const addrRes = await app.request('/v1/wallet/address', {
      headers: { Host: HOST, 'X-Agent-Id': agentId },
    });
    const addr = await json(addrRes);

    // Verify publicKey matches
    expect(addr.address).toBe(created.publicKey);
    expect(addr.agentId).toBe(agentId);
  });

  it('should create agent then get balance with correct shape', async () => {
    // Create
    const createRes = await app.request('/v1/agents', {
      method: 'POST',
      headers: { Host: HOST, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'balance-flow-agent' }),
    });
    const created = await json(createRes);
    const agentId = created.id as string;

    // Get balance
    const balRes = await app.request('/v1/wallet/balance', {
      headers: { Host: HOST, 'X-Agent-Id': agentId },
    });
    const bal = await json(balRes);

    expect(balRes.status).toBe(200);
    expect(bal.agentId).toBe(agentId);
    expect(bal.address).toBe(created.publicKey);
    expect(typeof bal.balance).toBe('string');
    expect(typeof bal.decimals).toBe('number');
    expect(typeof bal.symbol).toBe('string');
  });
});
