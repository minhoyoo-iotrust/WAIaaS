/**
 * Integration tests for staking pipeline gap closure:
 * GAP-1: bridge_status=PENDING enrollment after unstake pipeline completion
 * GAP-2: metadata persistence with {provider, action} for staking position queries
 *
 * Tests verify that actions.ts correctly:
 * 1. Persists {provider, action} in metadata column after Stage 1 (GAP-2)
 * 2. Sets bridge_status=PENDING + bridge_metadata after Stage 6 for unstake (GAP-1)
 *
 * @see .planning/quick/1-phase-257-gap-closure-bridge-status-reco/1-PLAN.md
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import argon2 from 'argon2';
import { createApp } from '../api/server.js';
import { createDatabase, pushSchema, generateId } from '../infrastructure/database/index.js';
import { JwtSecretManager, type JwtPayload } from '../infrastructure/jwt/index.js';
import { ActionProviderRegistry } from '../infrastructure/action/action-provider-registry.js';
import { ApiKeyStore } from '../infrastructure/action/api-key-store.js';
import type { DatabaseConnection } from '../infrastructure/database/index.js';
import type { DaemonConfig } from '../infrastructure/config/loader.js';
import type { LocalKeyStore } from '../infrastructure/keystore/keystore.js';
import type { IChainAdapter, BalanceInfo, HealthInfo, IPolicyEngine } from '@waiaas/core';
import type { AdapterPool } from '../infrastructure/adapter-pool.js';
import type { OpenAPIHono } from '@hono/zod-openapi';
import { z } from 'zod';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const HOST = '127.0.0.1:3100';
const TEST_MASTER_PASSWORD = 'test-master-password';
const MOCK_EVM_PUBLIC_KEY = '0x1234567890AbCDef1234567890abcdef12345678';
const MOCK_SOLANA_PUBLIC_KEY = '11111111111111111111111111111112';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function json(res: Response): Promise<Record<string, unknown>> {
  return (await res.json()) as Record<string, unknown>;
}

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
      session_absolute_lifetime: 31536000,
      session_max_renewals: 12,
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

function mockKeyStore(): LocalKeyStore {
  return {
    generateKeyPair: vi.fn().mockImplementation(
      async (_walletId: string, chain: string) => {
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
}

/** Create a mock adapter where all pipeline stages succeed. */
function mockAdapter(chain: 'solana' | 'ethereum' = 'ethereum'): IChainAdapter {
  return {
    chain,
    network: chain === 'ethereum' ? 'ethereum-sepolia' : 'devnet',
    connect: async () => {},
    disconnect: async () => {},
    isConnected: () => true,
    getHealth: async (): Promise<HealthInfo> => ({ healthy: true, latencyMs: 1 }),
    getBalance: async (addr: string): Promise<BalanceInfo> => ({
      address: addr,
      balance: 1_000_000_000_000_000_000n,
      decimals: chain === 'ethereum' ? 18 : 9,
      symbol: chain === 'ethereum' ? 'ETH' : 'SOL',
    }),
    buildTransaction: async () => ({ rawTransaction: new Uint8Array([1, 2, 3]) }),
    simulateTransaction: async () => ({ success: true }),
    signTransaction: async () => new Uint8Array([4, 5, 6]),
    submitTransaction: async () => ({ txHash: '0xtesthash123', status: 'submitted' as const }),
    waitForConfirmation: async () => ({ status: 'confirmed' as const, blockNumber: 1 }),
    getAssets: async () => [],
    estimateFee: async () => ({ fee: 21000n }),
    buildTokenTransfer: async () => ({ rawTransaction: new Uint8Array([1, 2, 3]) }),
    getTokenInfo: async () => { throw new Error('not implemented'); },
    buildContractCall: async () => ({ rawTransaction: new Uint8Array([1, 2, 3]) }),
    buildApprove: async () => ({ rawTransaction: new Uint8Array([1, 2, 3]) }),
    buildBatch: async () => ({ rawTransaction: new Uint8Array([1, 2, 3]) }),
    getTransactionFee: async () => ({ fee: 21000n }),
    getCurrentNonce: async () => 0,
    sweepAll: async () => { throw new Error('not implemented'); },
  } as unknown as IChainAdapter;
}

function mockAdapterPool(adapter?: IChainAdapter): AdapterPool {
  const a = adapter ?? mockAdapter();
  return {
    resolve: vi.fn().mockResolvedValue(a),
    disconnectAll: vi.fn().mockResolvedValue(undefined),
    get size() { return 0; },
  } as unknown as AdapterPool;
}

/** Create a mock policy engine that always allows. */
function mockPolicyEngine(): IPolicyEngine {
  return {
    evaluate: async () => ({ allowed: true, tier: 'INSTANT' as const }),
    evaluateAndReserve: () => ({ allowed: true, tier: 'INSTANT' as const }),
    evaluateBatch: async () => ({ allowed: true, tier: 'INSTANT' as const }),
  } as unknown as IPolicyEngine;
}

/**
 * Build an ActionProviderRegistry with mock staking providers.
 * Registers: lido_staking (stake, unstake), jito_staking (stake, unstake), zerox_swap (swap)
 */
function buildMockRegistry(): ActionProviderRegistry {
  const registry = new ActionProviderRegistry();

  // Lido staking provider
  registry.register({
    metadata: {
      name: 'lido_staking',
      description: 'Lido staking',
      version: '1.0.0',
      chains: ['ethereum'],
      mcpExpose: false,
      requiresApiKey: false,
    },
    actions: [
      {
        name: 'stake',
        description: 'Stake ETH via Lido liquid staking protocol',
        chain: 'ethereum',
        riskLevel: 'medium',
        defaultTier: 'NOTIFY',
        inputSchema: z.object({ amount: z.string() }),
      },
      {
        name: 'unstake',
        description: 'Request withdrawal of stETH via Lido protocol',
        chain: 'ethereum',
        riskLevel: 'medium',
        defaultTier: 'NOTIFY',
        inputSchema: z.object({ amount: z.string() }),
      },
    ],
    resolve: async () => ({
      type: 'CONTRACT_CALL' as const,
      to: '0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84',
      calldata: '0xa1903eab0000000000000000000000000000000000000000000000000000000000000000',
      value: '1000000000000000000',
    }),
  });

  // Jito staking provider
  registry.register({
    metadata: {
      name: 'jito_staking',
      description: 'Jito staking',
      version: '1.0.0',
      chains: ['solana'],
      mcpExpose: false,
      requiresApiKey: false,
    },
    actions: [
      {
        name: 'stake',
        description: 'Stake SOL via Jito liquid staking protocol',
        chain: 'solana',
        riskLevel: 'medium',
        defaultTier: 'NOTIFY',
        inputSchema: z.object({ amount: z.string() }),
      },
      {
        name: 'unstake',
        description: 'Request unstake of JitoSOL tokens from Jito',
        chain: 'solana',
        riskLevel: 'medium',
        defaultTier: 'NOTIFY',
        inputSchema: z.object({ amount: z.string() }),
      },
    ],
    resolve: async () => ({
      type: 'CONTRACT_CALL' as const,
      to: '11111111111111111111111111111112',
      calldata: '0x00',
      value: '0',
    }),
  });

  // Non-staking provider (zerox_swap)
  registry.register({
    metadata: {
      name: 'zerox_swap',
      description: '0x DEX swap',
      version: '1.0.0',
      chains: ['ethereum'],
      mcpExpose: false,
      requiresApiKey: false,
    },
    actions: [
      {
        name: 'swap',
        description: 'Swap tokens via 0x DEX aggregation protocol',
        chain: 'ethereum',
        riskLevel: 'medium',
        defaultTier: 'NOTIFY',
        inputSchema: z.object({ amount: z.string() }),
      },
    ],
    resolve: async () => ({
      type: 'CONTRACT_CALL' as const,
      to: '0xDef1C0ded9bec7F1a1670819833240f027b25EfF',
      calldata: '0x00',
      value: '0',
    }),
  });

  return registry;
}

// ---------------------------------------------------------------------------
// Test setup
// ---------------------------------------------------------------------------

let conn: DatabaseConnection;
let app: OpenAPIHono;
let jwtSecretManager: JwtSecretManager;
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

  jwtSecretManager = new JwtSecretManager(conn.db);
  await jwtSecretManager.initialize();

  const registry = buildMockRegistry();

  app = createApp({
    db: conn.db,
    sqlite: conn.sqlite,
    keyStore: mockKeyStore(),
    masterPassword: TEST_MASTER_PASSWORD,
    masterPasswordHash,
    config: mockConfig(),
    adapterPool: mockAdapterPool(),
    jwtSecretManager,
    policyEngine: mockPolicyEngine(),
    actionProviderRegistry: registry,
    apiKeyStore: new ApiKeyStore(conn.db, TEST_MASTER_PASSWORD),
  });
});

afterEach(() => {
  conn.sqlite.close();
});

// ---------------------------------------------------------------------------
// Auth helpers
// ---------------------------------------------------------------------------

async function createTestWallet(
  chain: 'solana' | 'ethereum' = 'ethereum',
  environment?: string,
): Promise<string> {
  const body: Record<string, string> = { name: `test-${chain}-wallet`, chain };
  if (environment) body.environment = environment;
  const res = await app.request('/v1/wallets', {
    method: 'POST',
    headers: {
      Host: HOST,
      'Content-Type': 'application/json',
      'X-Master-Password': TEST_MASTER_PASSWORD,
    },
    body: JSON.stringify(body),
  });
  const data = await json(res);
  return data.id as string;
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
// Tests
// ---------------------------------------------------------------------------

describe('Action staking pipeline integration (GAP-1 + GAP-2)', () => {
  it('POST /v1/actions/lido_staking/stake persists metadata with provider and action', async () => {
    const walletId = await createTestWallet('ethereum');
    const token = await createSessionToken(walletId);

    const res = await app.request('/v1/actions/lido_staking/stake', {
      method: 'POST',
      headers: {
        Host: HOST,
        'Content-Type': 'application/json',
        Authorization: token,
      },
      body: JSON.stringify({ params: { amount: '1.0' } }),
    });

    expect(res.status).toBe(201);
    const body = await json(res);
    const txId = body.id as string;
    expect(txId).toBeDefined();

    // Wait for async pipeline to complete
    await vi.waitFor(
      () => {
        const tx = conn.sqlite
          .prepare('SELECT * FROM transactions WHERE id = ?')
          .get(txId) as Record<string, unknown> | undefined;
        expect(tx).toBeDefined();
        expect(tx!.status).toBe('CONFIRMED');
      },
      { timeout: 5000, interval: 100 },
    );

    // Verify GAP-2: metadata column has {provider, action}
    const tx = conn.sqlite
      .prepare('SELECT * FROM transactions WHERE id = ?')
      .get(txId) as Record<string, unknown>;

    const metadata = JSON.parse(tx.metadata as string) as Record<string, unknown>;
    expect(metadata.provider).toBe('lido_staking');
    expect(metadata.action).toBe('stake');

    // Verify GAP-1: stake action should NOT set bridge_status (only unstake does)
    expect(tx.bridge_status).toBeNull();
  });

  it('POST /v1/actions/lido_staking/unstake sets bridge_status=PENDING after pipeline', async () => {
    const walletId = await createTestWallet('ethereum');
    const token = await createSessionToken(walletId);

    const res = await app.request('/v1/actions/lido_staking/unstake', {
      method: 'POST',
      headers: {
        Host: HOST,
        'Content-Type': 'application/json',
        Authorization: token,
      },
      body: JSON.stringify({ params: { amount: '1.0' } }),
    });

    expect(res.status).toBe(201);
    const body = await json(res);
    const txId = body.id as string;

    // Wait for async pipeline to complete (bridge_status is set after stage6Confirm)
    await vi.waitFor(
      () => {
        const tx = conn.sqlite
          .prepare('SELECT * FROM transactions WHERE id = ?')
          .get(txId) as Record<string, unknown> | undefined;
        expect(tx).toBeDefined();
        expect(tx!.bridge_status).toBe('PENDING');
      },
      { timeout: 5000, interval: 100 },
    );

    // Verify GAP-1: bridge_status and bridge_metadata
    const tx = conn.sqlite
      .prepare('SELECT * FROM transactions WHERE id = ?')
      .get(txId) as Record<string, unknown>;

    expect(tx.bridge_status).toBe('PENDING');
    const bridgeMeta = JSON.parse(tx.bridge_metadata as string) as Record<string, unknown>;
    expect(bridgeMeta.tracker).toBe('lido-withdrawal');
    expect(bridgeMeta.notificationEvent).toBe('STAKING_UNSTAKE_TIMEOUT');
    expect(bridgeMeta.enrolledAt).toBeTypeOf('number');

    // Verify GAP-2: metadata also has {provider, action}
    const metadata = JSON.parse(tx.metadata as string) as Record<string, unknown>;
    expect(metadata.provider).toBe('lido_staking');
    expect(metadata.action).toBe('unstake');
  });

  it('POST /v1/actions/jito_staking/unstake sets bridge_status=PENDING with jito-epoch tracker', async () => {
    const walletId = await createTestWallet('solana');
    const token = await createSessionToken(walletId);

    // Need a Solana adapter for this test
    const solanaAdapter = mockAdapter('solana');
    const solanaPool = mockAdapterPool(solanaAdapter);

    // Recreate app with Solana adapter pool
    app = createApp({
      db: conn.db,
      sqlite: conn.sqlite,
      keyStore: mockKeyStore(),
      masterPassword: TEST_MASTER_PASSWORD,
      masterPasswordHash,
      config: mockConfig(),
      adapterPool: solanaPool,
      jwtSecretManager,
      policyEngine: mockPolicyEngine(),
      actionProviderRegistry: buildMockRegistry(),
      apiKeyStore: new ApiKeyStore(conn.db, TEST_MASTER_PASSWORD),
    });

    const res = await app.request('/v1/actions/jito_staking/unstake', {
      method: 'POST',
      headers: {
        Host: HOST,
        'Content-Type': 'application/json',
        Authorization: token,
      },
      body: JSON.stringify({ params: { amount: '1.0' } }),
    });

    expect(res.status).toBe(201);
    const body = await json(res);
    const txId = body.id as string;

    // Wait for async pipeline to complete
    await vi.waitFor(
      () => {
        const tx = conn.sqlite
          .prepare('SELECT * FROM transactions WHERE id = ?')
          .get(txId) as Record<string, unknown> | undefined;
        expect(tx).toBeDefined();
        expect(tx!.bridge_status).toBe('PENDING');
      },
      { timeout: 5000, interval: 100 },
    );

    // Verify Jito-specific tracker
    const tx = conn.sqlite
      .prepare('SELECT * FROM transactions WHERE id = ?')
      .get(txId) as Record<string, unknown>;

    const bridgeMeta = JSON.parse(tx.bridge_metadata as string) as Record<string, unknown>;
    expect(bridgeMeta.tracker).toBe('jito-epoch');
    expect(bridgeMeta.notificationEvent).toBe('STAKING_UNSTAKE_TIMEOUT');

    // Verify metadata
    const metadata = JSON.parse(tx.metadata as string) as Record<string, unknown>;
    expect(metadata.provider).toBe('jito_staking');
    expect(metadata.action).toBe('unstake');
  });

  it('POST /v1/actions/zerox_swap/swap does NOT set bridge_status but persists metadata', async () => {
    const walletId = await createTestWallet('ethereum');
    const token = await createSessionToken(walletId);

    const res = await app.request('/v1/actions/zerox_swap/swap', {
      method: 'POST',
      headers: {
        Host: HOST,
        'Content-Type': 'application/json',
        Authorization: token,
      },
      body: JSON.stringify({ params: { amount: '1.0' } }),
    });

    expect(res.status).toBe(201);
    const body = await json(res);
    const txId = body.id as string;

    // Wait for async pipeline to complete
    await vi.waitFor(
      () => {
        const tx = conn.sqlite
          .prepare('SELECT * FROM transactions WHERE id = ?')
          .get(txId) as Record<string, unknown> | undefined;
        expect(tx).toBeDefined();
        expect(tx!.status).toBe('CONFIRMED');
      },
      { timeout: 5000, interval: 100 },
    );

    const tx = conn.sqlite
      .prepare('SELECT * FROM transactions WHERE id = ?')
      .get(txId) as Record<string, unknown>;

    // Non-staking action should NOT have bridge_status
    expect(tx.bridge_status).toBeNull();

    // But metadata should still have {provider, action}
    const metadata = JSON.parse(tx.metadata as string) as Record<string, unknown>;
    expect(metadata.provider).toBe('zerox_swap');
    expect(metadata.action).toBe('swap');
  });
});
