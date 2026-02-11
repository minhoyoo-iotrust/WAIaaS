/**
 * Tests for transaction API routes (POST /v1/transactions/send, GET /v1/transactions/:id).
 *
 * Uses in-memory SQLite + mock adapter + mock keyStore + Hono app.request().
 * Follows same pattern as api-agents.test.ts.
 *
 * v1.2: POST /v1/agents requires X-Master-Password (masterAuth).
 *        POST /v1/transactions/send and GET /v1/transactions/:id require sessionAuth.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
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
      locale: 'en' as const,
      rate_limit_rpm: 20,
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
  };
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
    adapter: mockAdapter(),
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

/** Create an agent (with masterAuth) and return its ID. */
async function createTestAgent(): Promise<string> {
  const res = await app.request('/v1/agents', {
    method: 'POST',
    headers: {
      Host: HOST,
      'Content-Type': 'application/json',
      'X-Master-Password': TEST_MASTER_PASSWORD,
    },
    body: JSON.stringify({ name: 'tx-test-agent' }),
  });
  const body = await json(res);
  return body.id as string;
}

/** Create a session token for the given agent. Returns "Bearer wai_sess_<token>". */
async function createSessionToken(agentId: string): Promise<string> {
  const sessionId = generateId();
  const now = Math.floor(Date.now() / 1000);

  conn.sqlite.prepare(
    `INSERT INTO sessions (id, agent_id, token_hash, expires_at, absolute_expires_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(sessionId, agentId, `hash-${sessionId}`, now + 86400, now + 86400 * 30, now);

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
// POST /v1/transactions/send (6 tests)
// ---------------------------------------------------------------------------

describe('POST /v1/transactions/send', () => {
  it('should return 201 with txId for valid request', async () => {
    const agentId = await createTestAgent();
    const authHeader = await createSessionToken(agentId);

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
    const agentId = await createTestAgent();
    const authHeader = await createSessionToken(agentId);

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
    const fakeAgentId = '00000000-0000-7000-8000-000000000000';
    const now = Math.floor(Date.now() / 1000);

    const payload: JwtPayload = { sub: fakeSessionId, agt: fakeAgentId, iat: now, exp: now + 3600 };
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

  it('should persist transaction with correct agentId from session', async () => {
    const agentId = await createTestAgent();
    const authHeader = await createSessionToken(agentId);

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
    expect(row.agent_id).toBe(agentId);
    expect(row.amount).toBe('500000');
    expect(row.to_address).toBe('Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr');
  });
});

// ---------------------------------------------------------------------------
// GET /v1/transactions/:id (5 tests)
// ---------------------------------------------------------------------------

describe('GET /v1/transactions/:id', () => {
  it('should return 200 with transaction JSON for existing transaction', async () => {
    const agentId = await createTestAgent();
    const authHeader = await createSessionToken(agentId);

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
    expect(body.agentId).toBe(agentId);
    expect(body.type).toBe('TRANSFER');
    expect(body.amount).toBe('500000000');
    expect(body.toAddress).toBe('Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr');
    expect(body.chain).toBe('solana');
  });

  it('should return 404 for non-existent transaction ID', async () => {
    const agentId = await createTestAgent();
    const authHeader = await createSessionToken(agentId);

    const res = await app.request('/v1/transactions/00000000-0000-7000-8000-000000000000', {
      headers: { Host: HOST, Authorization: authHeader },
    });

    expect(res.status).toBe(404);
    const body = await json(res);
    expect(body.code).toBe('TX_NOT_FOUND');
  });

  it('should include all expected fields in response', async () => {
    const agentId = await createTestAgent();
    const authHeader = await createSessionToken(agentId);

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
    expect(body).toHaveProperty('agentId');
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
