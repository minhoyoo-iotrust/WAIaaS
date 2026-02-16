/**
 * Tests for policy CRUD API routes.
 *
 * Uses in-memory SQLite + Hono app.request() (same harness as api-agents.test.ts).
 * All policy routes are masterAuth-protected.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import argon2 from 'argon2';
import { createApp } from '../api/server.js';
import { createDatabase, pushSchema, generateId } from '../infrastructure/database/index.js';
import { JwtSecretManager } from '../infrastructure/jwt/index.js';
import type { DatabaseConnection } from '../infrastructure/database/index.js';
import type { DaemonConfig } from '../infrastructure/config/loader.js';
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
// Test setup
// ---------------------------------------------------------------------------

let conn: DatabaseConnection;
let app: OpenAPIHono;
let masterPasswordHash: string;

beforeEach(async () => {
  conn = createDatabase(':memory:');
  pushSchema(conn.sqlite);

  masterPasswordHash = await argon2.hash(TEST_MASTER_PASSWORD, {
    type: argon2.argon2id,
    memoryCost: 4096,
    timeCost: 2,
    parallelism: 1,
  });

  const jwtSecretManager = new JwtSecretManager(conn.db);
  await jwtSecretManager.initialize();

  app = createApp({
    db: conn.db,
    masterPasswordHash,
    config: mockConfig(),
    jwtSecretManager,
  });
});

afterEach(() => {
  conn.sqlite.close();
});

// ---------------------------------------------------------------------------
// Auth headers
// ---------------------------------------------------------------------------

function masterHeaders(extra?: Record<string, string>) {
  return {
    Host: HOST,
    'Content-Type': 'application/json',
    'X-Master-Password': TEST_MASTER_PASSWORD,
    ...extra,
  };
}

// ---------------------------------------------------------------------------
// Helper: create an agent for walletId-linked policies
// ---------------------------------------------------------------------------

async function createTestWallet(): Promise<string> {
  const id = generateId();
  const now = Math.floor(Date.now() / 1000);
  conn.sqlite
    .prepare(
      `INSERT INTO wallets (id, name, chain, environment, default_network, public_key, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(id, 'test-agent', 'solana', 'testnet', 'devnet', '11111111111111111111111111111112', 'ACTIVE', now, now);
  return id;
}

// ---------------------------------------------------------------------------
// POST /v1/policies (5 tests)
// ---------------------------------------------------------------------------

describe('POST /v1/policies', () => {
  it('should return 201 with created SPENDING_LIMIT policy', async () => {
    const res = await app.request('/v1/policies', {
      method: 'POST',
      headers: masterHeaders(),
      body: JSON.stringify({
        type: 'SPENDING_LIMIT',
        rules: {
          instant_max: '1000000000',
          notify_max: '10000000000',
          delay_max: '50000000000',
          delay_seconds: 300,
        },
        priority: 10,
      }),
    });

    expect(res.status).toBe(201);
    const body = await json(res);
    expect(body.type).toBe('SPENDING_LIMIT');
    expect(body.priority).toBe(10);
    expect(body.enabled).toBe(true);
    expect(body.walletId).toBeNull();
    expect(body.id).toBeTruthy();
    const rules = body.rules as Record<string, unknown>;
    expect(rules.instant_max).toBe('1000000000');
  });

  it('should return 201 with created WHITELIST policy', async () => {
    const res = await app.request('/v1/policies', {
      method: 'POST',
      headers: masterHeaders(),
      body: JSON.stringify({
        type: 'WHITELIST',
        rules: {
          allowed_addresses: ['Addr1', 'Addr2'],
        },
      }),
    });

    expect(res.status).toBe(201);
    const body = await json(res);
    expect(body.type).toBe('WHITELIST');
    const rules = body.rules as Record<string, unknown>;
    expect(rules.allowed_addresses).toEqual(['Addr1', 'Addr2']);
  });

  it('should return 400 on invalid policy type', async () => {
    const res = await app.request('/v1/policies', {
      method: 'POST',
      headers: masterHeaders(),
      body: JSON.stringify({
        type: 'INVALID_TYPE',
        rules: {},
      }),
    });

    expect(res.status).toBe(400);
    const body = await json(res);
    expect(body.code).toBe('ACTION_VALIDATION_FAILED');
  });

  it('should return 404 for non-existent walletId', async () => {
    const res = await app.request('/v1/policies', {
      method: 'POST',
      headers: masterHeaders(),
      body: JSON.stringify({
        walletId: '00000000-0000-7000-8000-000000000000',
        type: 'WHITELIST',
        rules: { allowed_addresses: [] },
      }),
    });

    expect(res.status).toBe(404);
    const body = await json(res);
    expect(body.code).toBe('WALLET_NOT_FOUND');
  });

  it('should return 401 without masterAuth header', async () => {
    const res = await app.request('/v1/policies', {
      method: 'POST',
      headers: { Host: HOST, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'WHITELIST',
        rules: { allowed_addresses: [] },
      }),
    });

    expect(res.status).toBe(401);
    const body = await json(res);
    expect(body.code).toBe('INVALID_MASTER_PASSWORD');
  });
});

// ---------------------------------------------------------------------------
// GET /v1/policies (2 tests)
// ---------------------------------------------------------------------------

describe('GET /v1/policies', () => {
  it('should return all policies when no walletId filter', async () => {
    // Create two policies
    await app.request('/v1/policies', {
      method: 'POST',
      headers: masterHeaders(),
      body: JSON.stringify({
        type: 'SPENDING_LIMIT',
        rules: { instant_max: '100', notify_max: '200', delay_max: '300' },
        priority: 5,
      }),
    });
    await app.request('/v1/policies', {
      method: 'POST',
      headers: masterHeaders(),
      body: JSON.stringify({
        type: 'WHITELIST',
        rules: { allowed_addresses: ['Addr1'] },
        priority: 10,
      }),
    });

    const res = await app.request('/v1/policies', {
      headers: masterHeaders(),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as unknown[];
    expect(body).toHaveLength(2);
    // Ordered by priority DESC: WHITELIST (10) first, SPENDING_LIMIT (5) second
    expect((body[0] as Record<string, unknown>).type).toBe('WHITELIST');
    expect((body[1] as Record<string, unknown>).type).toBe('SPENDING_LIMIT');
  });

  it('should filter by walletId and include global policies', async () => {
    const walletId = await createTestWallet();

    // Global policy
    await app.request('/v1/policies', {
      method: 'POST',
      headers: masterHeaders(),
      body: JSON.stringify({
        type: 'SPENDING_LIMIT',
        rules: { instant_max: '100', notify_max: '200', delay_max: '300' },
      }),
    });
    // Wallet-specific policy
    await app.request('/v1/policies', {
      method: 'POST',
      headers: masterHeaders(),
      body: JSON.stringify({
        walletId,
        type: 'WHITELIST',
        rules: { allowed_addresses: ['Addr1'] },
      }),
    });

    const res = await app.request(`/v1/policies?walletId=${walletId}`, {
      headers: masterHeaders(),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as unknown[];
    expect(body).toHaveLength(2); // both global and wallet-specific
  });
});

// ---------------------------------------------------------------------------
// PUT /v1/policies/:id (2 tests)
// ---------------------------------------------------------------------------

describe('PUT /v1/policies/:id', () => {
  it('should update rules and priority', async () => {
    // Create a policy
    const createRes = await app.request('/v1/policies', {
      method: 'POST',
      headers: masterHeaders(),
      body: JSON.stringify({
        type: 'SPENDING_LIMIT',
        rules: { instant_max: '100', notify_max: '200', delay_max: '300' },
        priority: 5,
      }),
    });
    const created = await json(createRes);
    const id = created.id as string;

    // Update
    const res = await app.request(`/v1/policies/${id}`, {
      method: 'PUT',
      headers: masterHeaders(),
      body: JSON.stringify({
        rules: { instant_max: '999', notify_max: '9999', delay_max: '99999' },
        priority: 20,
      }),
    });

    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.priority).toBe(20);
    const rules = body.rules as Record<string, unknown>;
    expect(rules.instant_max).toBe('999');
  });

  it('should return 404 for non-existent policy ID', async () => {
    const res = await app.request(`/v1/policies/${generateId()}`, {
      method: 'PUT',
      headers: masterHeaders(),
      body: JSON.stringify({ priority: 99 }),
    });

    expect(res.status).toBe(404);
    const body = await json(res);
    expect(body.code).toBe('POLICY_NOT_FOUND');
  });
});

// ---------------------------------------------------------------------------
// DELETE /v1/policies/:id (2 tests)
// ---------------------------------------------------------------------------

describe('DELETE /v1/policies/:id', () => {
  it('should delete an existing policy', async () => {
    // Create a policy
    const createRes = await app.request('/v1/policies', {
      method: 'POST',
      headers: masterHeaders(),
      body: JSON.stringify({
        type: 'WHITELIST',
        rules: { allowed_addresses: ['Addr1'] },
      }),
    });
    const created = await json(createRes);
    const id = created.id as string;

    // Delete
    const res = await app.request(`/v1/policies/${id}`, {
      method: 'DELETE',
      headers: masterHeaders(),
    });

    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.id).toBe(id);
    expect(body.deleted).toBe(true);

    // Verify it's gone
    const listRes = await app.request('/v1/policies', {
      headers: masterHeaders(),
    });
    const list = (await listRes.json()) as unknown[];
    expect(list).toHaveLength(0);
  });

  it('should return 404 for non-existent policy ID', async () => {
    const res = await app.request(`/v1/policies/${generateId()}`, {
      method: 'DELETE',
      headers: masterHeaders(),
    });

    expect(res.status).toBe(404);
    const body = await json(res);
    expect(body.code).toBe('POLICY_NOT_FOUND');
  });
});
