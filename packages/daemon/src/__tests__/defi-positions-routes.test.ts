/**
 * Tests for DeFi position routes:
 *   - GET /v1/wallet/positions (defi_positions DB cache)
 *   - GET /v1/wallet/health-factor (live ILendingProvider query)
 *
 * Uses in-memory SQLite + mock keyStore + Hono app.request().
 * sessionAuth required via /v1/wallet/* wildcard.
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
import type { ActionProviderRegistry } from '../infrastructure/action/action-provider-registry.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function json(res: Response): Promise<Record<string, unknown>> {
  return (await res.json()) as Record<string, unknown>;
}

const HOST = '127.0.0.1:3100';
const TEST_MASTER_PASSWORD = 'test-master-password';
const MOCK_EVM_PUBLIC_KEY = '0x1234567890AbCDef1234567890abcdef12345678';

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

function mockKeyStore() {
  return {
    generateKeyPair: vi.fn().mockImplementation(
      async () => {
        return { publicKey: MOCK_EVM_PUBLIC_KEY, encryptedPrivateKey: new Uint8Array(32) };
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

function mockAdapter(): IChainAdapter {
  return {
    chain: 'ethereum' as const,
    network: 'ethereum-sepolia' as const,
    connect: async () => {},
    disconnect: async () => {},
    isConnected: () => true,
    getHealth: async (): Promise<HealthInfo> => ({ healthy: true, latencyMs: 1 }),
    getBalance: async (addr: string): Promise<BalanceInfo> => ({
      address: addr,
      balance: 1_000_000_000n,
      decimals: 18,
      symbol: 'ETH',
    }),
    buildTransaction: async () => { throw new Error('not implemented'); },
    simulateTransaction: async () => { throw new Error('not implemented'); },
    signTransaction: async () => { throw new Error('not implemented'); },
    submitTransaction: async () => { throw new Error('not implemented'); },
    waitForConfirmation: async () => { throw new Error('not implemented'); },
    getAssets: async () => [],
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
  });
});

afterEach(() => {
  conn.sqlite.close();
});

// ---------------------------------------------------------------------------
// Auth helpers
// ---------------------------------------------------------------------------

async function createTestWallet(chain: 'ethereum' = 'ethereum'): Promise<string> {
  const res = await app.request('/v1/wallets', {
    method: 'POST',
    headers: {
      Host: HOST,
      'Content-Type': 'application/json',
      'X-Master-Password': TEST_MASTER_PASSWORD,
    },
    body: JSON.stringify({ name: `test-${chain}-wallet`, chain }),
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
    `INSERT INTO session_wallets (session_id, wallet_id, created_at)
       VALUES (?, ?, ?)`,
  ).run(sessionId, walletId, now);

  const payload: JwtPayload = {
    sub: sessionId,

    iat: now,
    exp: now + 3600,
  };
  const token = await jwtSecretManager.signToken(payload);
  return `Bearer ${token}`;
}

/** Insert a DeFi position into the defi_positions table. */
function insertDefiPosition(
  walletId: string,
  opts: {
    category?: string;
    provider?: string;
    chain?: string;
    amount?: string;
    amountUsd?: number | null;
    status?: string;
    metadata?: string | null;
    assetId?: string | null;
  } = {},
): string {
  const posId = generateId();
  const now = Math.floor(Date.now() / 1000);

  conn.sqlite.prepare(
    `INSERT INTO defi_positions (id, wallet_id, category, provider, chain, network, asset_id, amount, amount_usd, metadata, status, opened_at, last_synced_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    posId,
    walletId,
    opts.category ?? 'LENDING',
    opts.provider ?? 'aave_v3',
    opts.chain ?? 'ethereum',
    'ethereum-mainnet',
    opts.assetId ?? `0x${posId.replace(/-/g, '').slice(0, 40)}`,
    opts.amount ?? '1000000',
    opts.amountUsd === undefined ? 1000.0 : opts.amountUsd,
    opts.metadata ?? null,
    opts.status ?? 'ACTIVE',
    now - 3600,
    now,
    now,
    now,
  );
  return posId;
}

// ---------------------------------------------------------------------------
// GET /v1/wallet/positions
// ---------------------------------------------------------------------------

describe('GET /v1/wallet/positions', () => {
  it('returns empty positions when wallet has no DeFi positions', async () => {
    const walletId = await createTestWallet();
    const auth = await createSessionToken(walletId);

    const res = await app.request('/v1/wallet/positions', {
      headers: { Host: HOST, Authorization: auth },
    });

    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.walletId).toBe(walletId);
    expect(body.positions).toEqual([]);
    expect(body.totalValueUsd).toBeNull();
  });

  it('returns ACTIVE positions with USD amounts', async () => {
    const walletId = await createTestWallet();
    const auth = await createSessionToken(walletId);

    insertDefiPosition(walletId, {
      category: 'LENDING',
      provider: 'aave_v3',
      amount: '1000000000000000000',
      amountUsd: 2500.0,
    });
    insertDefiPosition(walletId, {
      category: 'LENDING',
      provider: 'aave_v3',
      amount: '500000000',
      amountUsd: 500.0,
    });

    const res = await app.request('/v1/wallet/positions', {
      headers: { Host: HOST, Authorization: auth },
    });

    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.walletId).toBe(walletId);

    const positions = body.positions as Array<Record<string, unknown>>;
    expect(positions).toHaveLength(2);
    expect(positions[0]!.category).toBe('LENDING');
    expect(positions[0]!.provider).toBe('aave_v3');
    expect(positions[0]!.amountUsd).toBe(2500.0);
    expect(positions[1]!.amountUsd).toBe(500.0);
  });

  it('calculates totalValueUsd as sum of non-null amountUsd', async () => {
    const walletId = await createTestWallet();
    const auth = await createSessionToken(walletId);

    insertDefiPosition(walletId, { amountUsd: 1000.0 });
    insertDefiPosition(walletId, { amountUsd: 500.0 });
    insertDefiPosition(walletId, { amountUsd: null }); // No USD value

    const res = await app.request('/v1/wallet/positions', {
      headers: { Host: HOST, Authorization: auth },
    });

    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.totalValueUsd).toBe(1500.0);
  });

  it('excludes CLOSED positions', async () => {
    const walletId = await createTestWallet();
    const auth = await createSessionToken(walletId);

    insertDefiPosition(walletId, { status: 'ACTIVE', amountUsd: 1000.0 });
    insertDefiPosition(walletId, { status: 'CLOSED', amountUsd: 500.0 });

    const res = await app.request('/v1/wallet/positions', {
      headers: { Host: HOST, Authorization: auth },
    });

    expect(res.status).toBe(200);
    const body = await json(res);
    const positions = body.positions as Array<Record<string, unknown>>;
    expect(positions).toHaveLength(1);
    expect(positions[0]!.status).toBe('ACTIVE');
  });

  it('returns 401 without session auth', async () => {
    const res = await app.request('/v1/wallet/positions', {
      headers: { Host: HOST },
    });
    expect(res.status).toBe(401);
  });

  it('parses metadata JSON from defi_positions', async () => {
    const walletId = await createTestWallet();
    const auth = await createSessionToken(walletId);

    const metaObj = { aToken: '0xabc', variableDebtToken: '0xdef' };
    insertDefiPosition(walletId, { metadata: JSON.stringify(metaObj) });

    const res = await app.request('/v1/wallet/positions', {
      headers: { Host: HOST, Authorization: auth },
    });

    expect(res.status).toBe(200);
    const body = await json(res);
    const positions = body.positions as Array<Record<string, unknown>>;
    expect(positions[0]!.metadata).toEqual(metaObj);
  });
});

// ---------------------------------------------------------------------------
// GET /v1/wallet/health-factor
// ---------------------------------------------------------------------------

describe('GET /v1/wallet/health-factor', () => {
  it('returns default safe when no provider registered', async () => {
    const walletId = await createTestWallet();
    const auth = await createSessionToken(walletId);

    const res = await app.request('/v1/wallet/health-factor', {
      headers: { Host: HOST, Authorization: auth },
    });

    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.walletId).toBe(walletId);
    expect(body.totalCollateralUsd).toBe(0);
    expect(body.totalDebtUsd).toBe(0);
    expect(body.currentLtv).toBe(0);
    expect(body.status).toBe('safe');
  });

  it('returns health factor from ILendingProvider when registered', async () => {
    // Create app with mock action provider registry
    const mockProvider = {
      getHealthFactor: vi.fn().mockResolvedValue({
        factor: 2.5,
        totalCollateralUsd: 10000,
        totalDebtUsd: 4000,
        currentLtv: 0.4,
        status: 'safe',
      }),
      metadata: { name: 'aave_v3' },
    };

    const mockRegistry = {
      getProvider: vi.fn().mockReturnValue(mockProvider),
    } as unknown as ActionProviderRegistry;

    const appWithRegistry = createApp({
      db: conn.db,
      sqlite: conn.sqlite,
      keyStore: mockKeyStore(),
      masterPassword: TEST_MASTER_PASSWORD,
      masterPasswordHash,
      config: mockConfig(),
      adapterPool: mockAdapterPool(),
      jwtSecretManager,
      actionProviderRegistry: mockRegistry,
    });

    const walletId = await createTestWallet();
    const auth = await createSessionToken(walletId);

    const res = await appWithRegistry.request('/v1/wallet/health-factor', {
      headers: { Host: HOST, Authorization: auth },
    });

    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.walletId).toBe(walletId);
    expect(body.factor).toBe(2.5);
    expect(body.totalCollateralUsd).toBe(10000);
    expect(body.totalDebtUsd).toBe(4000);
    expect(body.currentLtv).toBe(0.4);
    expect(body.status).toBe('safe');
  });

  it('returns 401 without session auth', async () => {
    const res = await app.request('/v1/wallet/health-factor', {
      headers: { Host: HOST },
    });
    expect(res.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// IRpcCaller integration in registerBuiltInProviders
// ---------------------------------------------------------------------------

describe('IRpcCaller integration', () => {
  it('registerBuiltInProviders accepts optional rpcCaller option', async () => {
    const { registerBuiltInProviders } = await import('@waiaas/actions');
    const { ActionProviderRegistry } = await import('../infrastructure/action/index.js');

    const registry = new ActionProviderRegistry();
    const mockSettingsReader = {
      get: vi.fn().mockReturnValue('true'),
    };

    const mockRpcCaller = {
      call: vi.fn().mockResolvedValue('0x'),
    };

    // Should not throw when rpcCaller is provided
    const result = registerBuiltInProviders(
      registry as never,
      mockSettingsReader as never,
      { rpcCaller: mockRpcCaller },
    );

    expect(result.loaded).toContain('aave_v3');
  });
});
