/**
 * Tests for Actions REST API routes:
 *   - GET /v1/actions/providers
 *   - POST /v1/actions/:provider/:action
 *
 * Uses in-memory SQLite + mock ActionProviderRegistry + ApiKeyStore + Hono app.request().
 * Follows same pattern as api-transactions.test.ts.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import argon2 from 'argon2';
import { z } from 'zod';
import { createApp } from '../api/server.js';
import { createDatabase, pushSchema, generateId } from '../infrastructure/database/index.js';
import { JwtSecretManager, type JwtPayload } from '../infrastructure/jwt/index.js';
import type { DatabaseConnection } from '../infrastructure/database/index.js';
import type { DaemonConfig } from '../infrastructure/config/loader.js';
import type { LocalKeyStore } from '../infrastructure/keystore/keystore.js';
import { DefaultPolicyEngine } from '../pipeline/default-policy-engine.js';
import { ActionProviderRegistry } from '../infrastructure/action/action-provider-registry.js';
import { ApiKeyStore } from '../infrastructure/action/api-key-store.js';
import type {
  IActionProvider,
  IChainAdapter,
  ActionDefinition,
  BalanceInfo,
  HealthInfo,
  UnsignedTransaction,
  SimulationResult,
  SubmitResult,
  ContractCallRequest,
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
    buildContractCall: async (): Promise<UnsignedTransaction> => ({
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
    estimateFee: async () => { throw new Error('not implemented'); },
    buildTokenTransfer: async () => { throw new Error('not implemented'); },
    getTokenInfo: async () => { throw new Error('not implemented'); },
    buildApprove: async () => { throw new Error('not implemented'); },
    buildBatch: async () => { throw new Error('not implemented'); },
    getTransactionFee: async () => { throw new Error('not implemented'); },
    getCurrentNonce: async () => 0,
    sweepAll: async () => { throw new Error('not implemented'); },
  };
}

function mockAdapterPool(adapter?: IChainAdapter): AdapterPool {
  const a = adapter ?? mockAdapter();
  return {
    resolve: vi.fn().mockResolvedValue(a),
    disconnectAll: vi.fn().mockResolvedValue(undefined),
    get size() { return 0; },
  } as unknown as AdapterPool;
}

// ---------------------------------------------------------------------------
// Mock Action Providers
// ---------------------------------------------------------------------------

const TEST_CONTRACT_CALL: ContractCallRequest = {
  type: 'CONTRACT_CALL',
  to: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
  programId: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
  instructionData: Buffer.from([1, 2, 3]).toString('base64'),
  accounts: [
    { pubkey: MOCK_PUBLIC_KEY, isSigner: true, isWritable: true },
  ],
};

function createTestProvider(): IActionProvider {
  return {
    metadata: {
      name: 'test_provider',
      description: 'Test action provider for integration tests',
      version: '1.0.0',
      chains: ['solana'],
      mcpExpose: false,
      requiresApiKey: false,
      requiredApis: [],
    },
    actions: [
      {
        name: 'test_action',
        description: 'A test action that returns a contract call',
        chain: 'solana',
        inputSchema: z.object({ amount: z.string() }),
        riskLevel: 'low',
        defaultTier: 'INSTANT',
      },
    ] as readonly ActionDefinition[],
    resolve: vi.fn().mockResolvedValue(TEST_CONTRACT_CALL),
  };
}

function createPaidProvider(): IActionProvider {
  return {
    metadata: {
      name: 'paid_provider',
      description: 'Paid action provider that requires API key',
      version: '1.0.0',
      chains: ['solana'],
      mcpExpose: false,
      requiresApiKey: true,
      requiredApis: ['coingecko'],
    },
    actions: [
      {
        name: 'paid_action',
        description: 'A paid action that requires an API key',
        chain: 'solana',
        inputSchema: z.object({ token: z.string() }),
        riskLevel: 'medium',
        defaultTier: 'NOTIFY',
      },
    ] as readonly ActionDefinition[],
    resolve: vi.fn().mockResolvedValue(TEST_CONTRACT_CALL),
  };
}

// ---------------------------------------------------------------------------
// Test setup
// ---------------------------------------------------------------------------

let conn: DatabaseConnection;
let app: OpenAPIHono;
let jwtSecretManager: JwtSecretManager;
let registry: ActionProviderRegistry;
let apiKeyStore: ApiKeyStore;

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

  // Create ActionProviderRegistry and register test providers
  registry = new ActionProviderRegistry();
  registry.register(createTestProvider());
  registry.register(createPaidProvider());

  // Create ApiKeyStore
  apiKeyStore = new ApiKeyStore(conn.db, TEST_MASTER_PASSWORD);

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
    actionProviderRegistry: registry,
    apiKeyStore,
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
    headers: {
      Host: HOST,
      'Content-Type': 'application/json',
      'X-Master-Password': TEST_MASTER_PASSWORD,
    },
    body: JSON.stringify({ name: 'action-test-wallet' }),
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

// ---------------------------------------------------------------------------
// GET /v1/actions/providers (2 tests)
// ---------------------------------------------------------------------------

describe('GET /v1/actions/providers', () => {
  it('should return registered providers with actions and API key status (200)', async () => {
    const walletId = await createTestWallet();
    const authHeader = await createSessionToken(walletId);

    const res = await app.request('/v1/actions/providers', {
      method: 'GET',
      headers: {
        Host: HOST,
        Authorization: authHeader,
      },
    });

    expect(res.status).toBe(200);
    const body = await json(res);
    const providers = body.providers as Array<Record<string, unknown>>;
    expect(providers).toHaveLength(2);

    // Find test_provider
    const testProvider = providers.find((p) => p.name === 'test_provider');
    expect(testProvider).toBeDefined();
    expect(testProvider!.requiresApiKey).toBe(false);
    expect(testProvider!.hasApiKey).toBe(false);
    expect(testProvider!.version).toBe('1.0.0');
    const testActions = testProvider!.actions as Array<Record<string, unknown>>;
    expect(testActions).toHaveLength(1);
    expect(testActions[0].name).toBe('test_action');

    // Find paid_provider
    const paidProvider = providers.find((p) => p.name === 'paid_provider');
    expect(paidProvider).toBeDefined();
    expect(paidProvider!.requiresApiKey).toBe(true);
    expect(paidProvider!.hasApiKey).toBe(false);
  });

  it('should show hasApiKey=true when API key is configured', async () => {
    const walletId = await createTestWallet();
    const authHeader = await createSessionToken(walletId);

    // Set API key for paid_provider
    apiKeyStore.set('paid_provider', 'test-api-key-12345');

    const res = await app.request('/v1/actions/providers', {
      method: 'GET',
      headers: {
        Host: HOST,
        Authorization: authHeader,
      },
    });

    expect(res.status).toBe(200);
    const body = await json(res);
    const providers = body.providers as Array<Record<string, unknown>>;
    const paidProvider = providers.find((p) => p.name === 'paid_provider');
    expect(paidProvider!.hasApiKey).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// POST /v1/actions/:provider/:action (8 tests)
// ---------------------------------------------------------------------------

describe('POST /v1/actions/:provider/:action', () => {
  it('should execute action and return 201 with txId (a)', async () => {
    const walletId = await createTestWallet();
    const authHeader = await createSessionToken(walletId);

    const res = await app.request('/v1/actions/test_provider/test_action', {
      method: 'POST',
      headers: {
        Host: HOST,
        'Content-Type': 'application/json',
        Authorization: authHeader,
      },
      body: JSON.stringify({ params: { amount: '1000000' } }),
    });

    expect(res.status).toBe(201);
    const body = await json(res);
    expect(body.id).toBeTruthy();
    expect(body.status).toBe('PENDING');

    // Verify resolve was called
    const _testProvider = createTestProvider();
    expect((registry.getAction('test_provider/test_action')!.provider.resolve as ReturnType<typeof vi.fn>)).toHaveBeenCalled();
  });

  it('should return 404 ACTION_NOT_FOUND for nonexistent provider (b)', async () => {
    const walletId = await createTestWallet();
    const authHeader = await createSessionToken(walletId);

    const res = await app.request('/v1/actions/nonexistent/action', {
      method: 'POST',
      headers: {
        Host: HOST,
        'Content-Type': 'application/json',
        Authorization: authHeader,
      },
      body: JSON.stringify({ params: {} }),
    });

    expect(res.status).toBe(404);
    const body = await json(res);
    expect(body.code).toBe('ACTION_NOT_FOUND');
  });

  it('should return 404 ACTION_NOT_FOUND for nonexistent action (c)', async () => {
    const walletId = await createTestWallet();
    const authHeader = await createSessionToken(walletId);

    const res = await app.request('/v1/actions/test_provider/nonexistent_action', {
      method: 'POST',
      headers: {
        Host: HOST,
        'Content-Type': 'application/json',
        Authorization: authHeader,
      },
      body: JSON.stringify({ params: {} }),
    });

    expect(res.status).toBe(404);
    const body = await json(res);
    expect(body.code).toBe('ACTION_NOT_FOUND');
  });

  it('should return 403 API_KEY_REQUIRED when key not set for paid provider (d)', async () => {
    const walletId = await createTestWallet();
    const authHeader = await createSessionToken(walletId);

    const res = await app.request('/v1/actions/paid_provider/paid_action', {
      method: 'POST',
      headers: {
        Host: HOST,
        'Content-Type': 'application/json',
        Authorization: authHeader,
      },
      body: JSON.stringify({ params: { token: 'SOL' } }),
    });

    expect(res.status).toBe(403);
    const body = await json(res);
    expect(body.code).toBe('API_KEY_REQUIRED');
    expect((body.message as string)).toContain('paid_provider');
  });

  it('should execute paid action when API key is set (e)', async () => {
    const walletId = await createTestWallet();
    const authHeader = await createSessionToken(walletId);

    // Set API key
    apiKeyStore.set('paid_provider', 'my-secret-api-key-99');

    const res = await app.request('/v1/actions/paid_provider/paid_action', {
      method: 'POST',
      headers: {
        Host: HOST,
        'Content-Type': 'application/json',
        Authorization: authHeader,
      },
      body: JSON.stringify({ params: { token: 'SOL' } }),
    });

    expect(res.status).toBe(201);
    const body = await json(res);
    expect(body.id).toBeTruthy();
    expect(body.status).toBe('PENDING');

    // Verify resolve was called on paid_provider
    const paidEntry = registry.getAction('paid_provider/paid_action');
    expect((paidEntry!.provider.resolve as ReturnType<typeof vi.fn>)).toHaveBeenCalled();
  });

  it('should return 400 ACTION_VALIDATION_FAILED for invalid input (f)', async () => {
    const walletId = await createTestWallet();
    const authHeader = await createSessionToken(walletId);

    // test_action expects { amount: z.string() } -- send wrong type
    const res = await app.request('/v1/actions/test_provider/test_action', {
      method: 'POST',
      headers: {
        Host: HOST,
        'Content-Type': 'application/json',
        Authorization: authHeader,
      },
      body: JSON.stringify({ params: { amount: 12345 } }), // number instead of string
    });

    expect(res.status).toBe(400);
    const body = await json(res);
    expect(body.code).toBe('ACTION_VALIDATION_FAILED');
  });

  it('should return 401 without Authorization header (g)', async () => {
    const res = await app.request('/v1/actions/test_provider/test_action', {
      method: 'POST',
      headers: {
        Host: HOST,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ params: { amount: '1000' } }),
    });

    expect(res.status).toBe(401);
    const body = await json(res);
    expect(body.code).toBe('INVALID_TOKEN');
  });

  it('should handle resolve failure gracefully (h)', async () => {
    const walletId = await createTestWallet();
    const authHeader = await createSessionToken(walletId);

    // Make resolve throw an unexpected error
    const entry = registry.getAction('test_provider/test_action')!;
    (entry.provider.resolve as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error('External API timeout'),
    );

    const res = await app.request('/v1/actions/test_provider/test_action', {
      method: 'POST',
      headers: {
        Host: HOST,
        'Content-Type': 'application/json',
        Authorization: authHeader,
      },
      body: JSON.stringify({ params: { amount: '1000' } }),
    });

    expect(res.status).toBe(502);
    const body = await json(res);
    expect(body.code).toBe('ACTION_RESOLVE_FAILED');
    expect((body.message as string)).toContain('External API timeout');
  });
});

// ---------------------------------------------------------------------------
// GET /v1/actions/providers without auth (1 test)
// ---------------------------------------------------------------------------

describe('GET /v1/actions/providers (no auth)', () => {
  it('should return 401 without Authorization header', async () => {
    const res = await app.request('/v1/actions/providers', {
      method: 'GET',
      headers: { Host: HOST },
    });

    expect(res.status).toBe(401);
    const body = await json(res);
    expect(body.code).toBe('INVALID_TOKEN');
  });
});
