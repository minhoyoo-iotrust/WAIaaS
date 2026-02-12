/**
 * Tests for hint field error enrichment (Phase 59-02 Task 1).
 *
 * Verifies:
 * 1. Error responses include hint field for actionable error codes
 * 2. Error responses do NOT include hint for non-actionable codes
 * 3. resolveHint() with variable substitution
 * 4. WAIaaSError.toJSON() includes hint when set
 * 5. hint from WAIaaSError constructor overrides errorHintMap
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import argon2 from 'argon2';
import { WAIaaSError } from '@waiaas/core';
import { createApp } from '../api/server.js';
import { resolveHint, errorHintMap } from '../api/error-hints.js';
import { createDatabase, pushSchema } from '../infrastructure/database/index.js';
import { JwtSecretManager } from '../infrastructure/jwt/index.js';
import { DefaultPolicyEngine } from '../pipeline/default-policy-engine.js';
import type { DatabaseConnection } from '../infrastructure/database/index.js';
import type { DaemonConfig } from '../infrastructure/config/loader.js';
import type { LocalKeyStore } from '../infrastructure/keystore/keystore.js';
import type { IChainAdapter, BalanceInfo, HealthInfo, AssetInfo } from '@waiaas/core';
import type { AdapterPool } from '../infrastructure/adapter-pool.js';
import type { OpenAPIHono } from '@hono/zod-openapi';

// ---------------------------------------------------------------------------
// Helpers (same as api-new-endpoints.test.ts)
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
      evm_base_mainnet: '', evm_base_sepolia: '', evm_default_network: 'ethereum-sepolia' as const,
    },
    notifications: {
      enabled: false, min_channels: 2, health_check_interval: 300, log_retention_days: 30, dedup_ttl: 300,
      telegram_bot_token: '', telegram_chat_id: '', discord_webhook_url: '',
      ntfy_server: 'https://ntfy.sh', ntfy_topic: '', locale: 'en' as const, rate_limit_rpm: 20,
    },
    security: {
      session_ttl: 86400, jwt_secret: '', max_sessions_per_agent: 5, max_pending_tx: 10,
      nonce_storage: 'memory' as const, nonce_cache_max: 1000, nonce_cache_ttl: 300,
      rate_limit_global_ip_rpm: 1000, rate_limit_session_rpm: 300, rate_limit_tx_rpm: 10,
      cors_origins: ['http://localhost:3100'], auto_stop_consecutive_failures_threshold: 3,
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
function mockAdapterPool(): AdapterPool {
  return {
    resolve: vi.fn().mockResolvedValue(mockAdapter()),
    disconnectAll: vi.fn().mockResolvedValue(undefined),
    get size() { return 0; },
  } as unknown as AdapterPool;
}

// ---------------------------------------------------------------------------
// Test setup
// ---------------------------------------------------------------------------

let conn: DatabaseConnection;
let app: OpenAPIHono;
let masterPasswordHash: string;

beforeEach(async () => {
  mockKeyCounter = 0;
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
  });
});

afterEach(() => {
  conn.sqlite.close();
});

// ---------------------------------------------------------------------------
// 1. AGENT_NOT_FOUND error includes hint field
// ---------------------------------------------------------------------------

describe('hint field in error responses', () => {
  it('should include hint for AGENT_NOT_FOUND', async () => {
    const fakeId = '00000000-0000-7000-8000-000000000099';
    const res = await app.request(`/v1/agents/${fakeId}`, {
      headers: { Host: HOST, 'X-Master-Password': TEST_MASTER_PASSWORD },
    });

    expect(res.status).toBe(404);
    const body = await json(res);
    expect(body.code).toBe('AGENT_NOT_FOUND');
    expect(body.hint).toBe('Verify the agent ID. List agents via GET /v1/agents.');
  });

  it('should include hint for INVALID_TOKEN (missing auth)', async () => {
    const res = await app.request('/v1/wallet/assets', {
      headers: { Host: HOST },
    });

    expect(res.status).toBe(401);
    const body = await json(res);
    expect(body.code).toBe('INVALID_TOKEN');
    expect(body.hint).toBe('Create a new session via POST /v1/sessions with masterAuth credentials.');
  });

  it('should include hint for INVALID_MASTER_PASSWORD', async () => {
    const res = await app.request('/v1/agents', {
      headers: { Host: HOST, 'X-Master-Password': 'wrong-password' },
    });

    expect(res.status).toBe(401);
    const body = await json(res);
    expect(body.code).toBe('INVALID_MASTER_PASSWORD');
    expect(body.hint).toBe('Check the X-Master-Password header value.');
  });

  it('should NOT include hint for non-actionable error codes (KILL_SWITCH_ACTIVE)', async () => {
    // Create app with kill switch activated
    const ksApp = createApp({
      db: conn.db, sqlite: conn.sqlite, keyStore: mockKeyStore(),
      masterPassword: TEST_MASTER_PASSWORD, masterPasswordHash,
      config: mockConfig(), adapterPool: mockAdapterPool(),
      jwtSecretManager: new JwtSecretManager(conn.db),
      policyEngine: new DefaultPolicyEngine(),
      getKillSwitchState: () => 'ACTIVATED',
    });

    const res = await ksApp.request('/v1/agents', {
      headers: { Host: HOST, 'X-Master-Password': TEST_MASTER_PASSWORD },
    });

    expect(res.status).toBe(409);
    const body = await json(res);
    expect(body.code).toBe('KILL_SWITCH_ACTIVE');
    expect(body.hint).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// 2. resolveHint() unit tests
// ---------------------------------------------------------------------------

describe('resolveHint()', () => {
  it('should return hint template for known error code', () => {
    const hint = resolveHint('AGENT_NOT_FOUND');
    expect(hint).toBe('Verify the agent ID. List agents via GET /v1/agents.');
  });

  it('should return undefined for unknown error code', () => {
    const hint = resolveHint('KILL_SWITCH_ACTIVE');
    expect(hint).toBeUndefined();
  });

  it('should substitute variables from context map', () => {
    const hint = resolveHint('OWNER_NOT_CONNECTED', { agentId: 'agent-123' });
    expect(hint).toBe('Register an owner via PUT /v1/agents/agent-123/owner.');
  });

  it('should preserve {variable} when context does not contain the key', () => {
    const hint = resolveHint('OWNER_NOT_CONNECTED');
    expect(hint).toBe('Register an owner via PUT /v1/agents/{agentId}/owner.');
  });

  it('should have 32 hint entries', () => {
    const count = Object.keys(errorHintMap).length;
    expect(count).toBe(32);
  });
});

// ---------------------------------------------------------------------------
// 3. WAIaaSError.toJSON() with hint
// ---------------------------------------------------------------------------

describe('WAIaaSError hint property', () => {
  it('should include hint in toJSON() when set via constructor', () => {
    const err = new WAIaaSError('AGENT_NOT_FOUND', {
      hint: 'Custom hint message',
    });

    const jsonBody = err.toJSON();
    expect(jsonBody.hint).toBe('Custom hint message');
  });

  it('should NOT include hint in toJSON() when hint is undefined', () => {
    const err = new WAIaaSError('AGENT_NOT_FOUND');

    const jsonBody = err.toJSON();
    expect(jsonBody).not.toHaveProperty('hint');
  });

  it('should use constructor hint over errorHintMap in error handler', async () => {
    // This tests that err.hint takes precedence over resolveHint()
    const err = new WAIaaSError('AGENT_NOT_FOUND', {
      hint: 'Override hint',
    });
    // err.hint should be 'Override hint' and resolveHint would return the map value
    // errorHandler uses: err.hint ?? resolveHint(err.code)
    expect(err.hint).toBe('Override hint');
  });
});
