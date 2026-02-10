/**
 * Tests for agent creation and wallet query API routes.
 *
 * Uses in-memory SQLite + mock keyStore + mock adapter + Hono app.request().
 *
 * v1.2: POST /v1/agents requires X-Master-Password (masterAuth).
 *        GET /v1/wallet/* requires Authorization: Bearer wai_sess_<token> (sessionAuth).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import argon2 from 'argon2';
import { createApp } from '../api/server.js';
import { createDatabase, pushSchema, generateId } from '../infrastructure/database/index.js';
import { JwtSecretManager, type JwtPayload } from '../infrastructure/jwt/index.js';
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
let jwtSecretManager: JwtSecretManager;
let masterPasswordHash: string;

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

  app = createApp({
    db: conn.db,
    keyStore: mockKeyStore(),
    masterPassword: TEST_MASTER_PASSWORD,
    masterPasswordHash,
    config: mockConfig(),
    adapter: mockAdapter(),
    jwtSecretManager,
  });
});

afterEach(() => {
  conn.sqlite.close();
});

// ---------------------------------------------------------------------------
// Auth test helpers
// ---------------------------------------------------------------------------

/** Create an agent via POST with masterAuth header. Returns agent ID. */
async function createTestAgent(): Promise<string> {
  const res = await app.request('/v1/agents', {
    method: 'POST',
    headers: {
      Host: HOST,
      'Content-Type': 'application/json',
      'X-Master-Password': TEST_MASTER_PASSWORD,
    },
    body: JSON.stringify({ name: 'test-agent' }),
  });
  const body = await json(res);
  return body.id as string;
}

/** Create a session and sign a JWT for the given agent. Returns "Bearer wai_sess_<token>". */
async function createSessionToken(agentId: string): Promise<string> {
  const sessionId = generateId();
  const now = Math.floor(Date.now() / 1000);

  // Insert session into DB
  conn.sqlite.prepare(
    `INSERT INTO sessions (id, agent_id, token_hash, expires_at, absolute_expires_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(sessionId, agentId, `hash-${sessionId}`, now + 86400, now + 86400 * 30, now);

  // Sign JWT
  const payload: JwtPayload = {
    sub: sessionId,
    agt: agentId,
    iat: now,
    exp: now + 3600,
  };
  const token = await jwtSecretManager.signToken(payload);
  return `Bearer ${token}`;
}

// ---------------------------------------------------------------------------
// POST /v1/agents (7 tests)
// ---------------------------------------------------------------------------

describe('POST /v1/agents', () => {
  it('should return 201 with agent JSON on valid request', async () => {
    const res = await app.request('/v1/agents', {
      method: 'POST',
      headers: {
        Host: HOST,
        'Content-Type': 'application/json',
        'X-Master-Password': TEST_MASTER_PASSWORD,
      },
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
      headers: {
        Host: HOST,
        'Content-Type': 'application/json',
        'X-Master-Password': TEST_MASTER_PASSWORD,
      },
      body: JSON.stringify({ name: 'active-agent' }),
    });

    const body = await json(res);
    expect(body.status).toBe('ACTIVE');
  });

  it('should return 400 on missing name field (Zod validation)', async () => {
    const res = await app.request('/v1/agents', {
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

  it('should generate UUID-format agent ID', async () => {
    const res = await app.request('/v1/agents', {
      method: 'POST',
      headers: {
        Host: HOST,
        'Content-Type': 'application/json',
        'X-Master-Password': TEST_MASTER_PASSWORD,
      },
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
      headers: {
        Host: HOST,
        'Content-Type': 'application/json',
        'X-Master-Password': TEST_MASTER_PASSWORD,
      },
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

  it('should return 401 without X-Master-Password header', async () => {
    const res = await app.request('/v1/agents', {
      method: 'POST',
      headers: {
        Host: HOST,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ name: 'no-auth-agent' }),
    });

    expect(res.status).toBe(401);
    const body = await json(res);
    expect(body.code).toBe('INVALID_MASTER_PASSWORD');
  });

  it('should return 401 with wrong master password', async () => {
    const res = await app.request('/v1/agents', {
      method: 'POST',
      headers: {
        Host: HOST,
        'Content-Type': 'application/json',
        'X-Master-Password': 'wrong-password',
      },
      body: JSON.stringify({ name: 'bad-auth-agent' }),
    });

    expect(res.status).toBe(401);
    const body = await json(res);
    expect(body.code).toBe('INVALID_MASTER_PASSWORD');
  });
});

// ---------------------------------------------------------------------------
// GET /v1/wallet/address (4 tests)
// ---------------------------------------------------------------------------

describe('GET /v1/wallet/address', () => {
  let agentId: string;
  let authHeader: string;

  beforeEach(async () => {
    agentId = await createTestAgent();
    authHeader = await createSessionToken(agentId);
  });

  it('should return 200 with address JSON for valid agent', async () => {
    const res = await app.request('/v1/wallet/address', {
      headers: { Host: HOST, Authorization: authHeader },
    });

    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.agentId).toBe(agentId);
    expect(body.chain).toBe('solana');
    expect(body.network).toBe('devnet');
    expect(body.address).toBe(MOCK_PUBLIC_KEY);
  });

  it('should return 404 SESSION_NOT_FOUND when session does not exist in DB', async () => {
    // Sign a JWT with valid format but session not in DB
    const fakeSessionId = generateId();
    const fakeAgentId = '00000000-0000-7000-8000-000000000000';
    const now = Math.floor(Date.now() / 1000);

    const payload: JwtPayload = { sub: fakeSessionId, agt: fakeAgentId, iat: now, exp: now + 3600 };
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
  let agentId: string;
  let authHeader: string;

  beforeEach(async () => {
    agentId = await createTestAgent();
    authHeader = await createSessionToken(agentId);
  });

  it('should return 200 with balance as string for valid agent', async () => {
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
    expect(body.agentId).toBe(agentId);
    expect(body.chain).toBe('solana');
    expect(body.network).toBe('devnet');
    expect(body.address).toBe(MOCK_PUBLIC_KEY);
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
      `INSERT INTO sessions (id, agent_id, token_hash, expires_at, absolute_expires_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(sessionId, agentId, `hash-${sessionId}`, now + 86400, now + 86400 * 30, now);

    const payload: JwtPayload = {
      sub: sessionId,
      agt: agentId,
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
  it('should create agent then get matching address', async () => {
    // Create
    const createRes = await app.request('/v1/agents', {
      method: 'POST',
      headers: {
        Host: HOST,
        'Content-Type': 'application/json',
        'X-Master-Password': TEST_MASTER_PASSWORD,
      },
      body: JSON.stringify({ name: 'flow-agent' }),
    });
    const created = await json(createRes);
    const agentId = created.id as string;

    // Create session for wallet query
    const authHeader = await createSessionToken(agentId);

    // Get address
    const addrRes = await app.request('/v1/wallet/address', {
      headers: { Host: HOST, Authorization: authHeader },
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
      headers: {
        Host: HOST,
        'Content-Type': 'application/json',
        'X-Master-Password': TEST_MASTER_PASSWORD,
      },
      body: JSON.stringify({ name: 'balance-flow-agent' }),
    });
    const created = await json(createRes);
    const agentId = created.id as string;

    // Create session for wallet query
    const authHeader = await createSessionToken(agentId);

    // Get balance
    const balRes = await app.request('/v1/wallet/balance', {
      headers: { Host: HOST, Authorization: authHeader },
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
