/**
 * Tests for wallet network management API routes.
 *
 * PUT /v1/wallets/:id/default-network - Update wallet default network
 * GET /v1/wallets/:id/networks - List available networks for wallet
 * POST/GET/DELETE /v1/policies - ALLOWED_NETWORKS policy CRUD
 *
 * Uses in-memory SQLite + Hono app.request() (same harness as api-agents.test.ts).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import argon2 from 'argon2';
import { createApp } from '../api/server.js';
import { createDatabase, pushSchema } from '../infrastructure/database/index.js';
import { JwtSecretManager } from '../infrastructure/jwt/index.js';
import type { DatabaseConnection } from '../infrastructure/database/index.js';
import type { DaemonConfig } from '../infrastructure/config/loader.js';
import type { LocalKeyStore } from '../infrastructure/keystore/keystore.js';
import type { OpenAPIHono } from '@hono/zod-openapi';
import type { IChainAdapter, BalanceInfo, HealthInfo, AssetInfo } from '@waiaas/core';
import type { AdapterPool } from '../infrastructure/adapter-pool.js';

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

const MOCK_EVM_PUBLIC_KEY = '0x1234567890AbCDef1234567890abcdef12345678';

function mockKeyStore(): LocalKeyStore {
  return {
    generateKeyPair: vi.fn().mockImplementation(
      async (_walletId: string, _chain: string, _network: string, _password: string) => {
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
    sqlite: conn.sqlite,
    keyStore: mockKeyStore(),
    masterPassword: TEST_MASTER_PASSWORD,
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
// Helper: create an ethereum testnet wallet via direct DB insert
// ---------------------------------------------------------------------------

async function createEthTestnetWallet(): Promise<string> {
  const res = await app.request('/v1/wallets', {
    method: 'POST',
    headers: masterHeaders(),
    body: JSON.stringify({
      name: 'eth-testnet-wallet',
      chain: 'ethereum',
      environment: 'testnet',
    }),
  });
  const body = await json(res);
  return body.id as string;
}

// ---------------------------------------------------------------------------
// PUT /v1/wallets/:id/default-network (3 tests)
// ---------------------------------------------------------------------------

describe('PUT /v1/wallets/:id/default-network', () => {
  it('should change default network for ethereum testnet wallet', async () => {
    const walletId = await createEthTestnetWallet();

    const res = await app.request(`/v1/wallets/${walletId}/default-network`, {
      method: 'PUT',
      headers: masterHeaders(),
      body: JSON.stringify({ network: 'polygon-amoy' }),
    });

    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.id).toBe(walletId);
    expect(body.defaultNetwork).toBe('polygon-amoy');
    expect(body.previousNetwork).toBe('ethereum-sepolia');
  });

  it('should return ENVIRONMENT_NETWORK_MISMATCH for testnet wallet with mainnet network', async () => {
    const walletId = await createEthTestnetWallet();

    const res = await app.request(`/v1/wallets/${walletId}/default-network`, {
      method: 'PUT',
      headers: masterHeaders(),
      body: JSON.stringify({ network: 'ethereum-mainnet' }),
    });

    expect(res.status).toBe(400);
    const body = await json(res);
    expect(body.code).toBe('ENVIRONMENT_NETWORK_MISMATCH');
  });

  it('should return 404 for non-existent wallet', async () => {
    const fakeId = '00000000-0000-7000-8000-000000000000';

    const res = await app.request(`/v1/wallets/${fakeId}/default-network`, {
      method: 'PUT',
      headers: masterHeaders(),
      body: JSON.stringify({ network: 'ethereum-sepolia' }),
    });

    expect(res.status).toBe(404);
    const body = await json(res);
    expect(body.code).toBe('WALLET_NOT_FOUND');
  });
});

// ---------------------------------------------------------------------------
// GET /v1/wallets/:id/networks (2 tests)
// ---------------------------------------------------------------------------

describe('GET /v1/wallets/:id/networks', () => {
  it('should return available networks for ethereum testnet wallet', async () => {
    const walletId = await createEthTestnetWallet();

    const res = await app.request(`/v1/wallets/${walletId}/networks`, {
      headers: { Host: HOST, 'X-Master-Password': TEST_MASTER_PASSWORD },
    });

    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.id).toBe(walletId);
    expect(body.chain).toBe('ethereum');
    expect(body.environment).toBe('testnet');
    expect(body.defaultNetwork).toBe('ethereum-sepolia');

    const networks = body.availableNetworks as Array<{ network: string; isDefault: boolean }>;
    expect(networks).toHaveLength(5);

    // Check all 5 EVM testnets are present
    const networkNames = networks.map((n) => n.network).sort();
    expect(networkNames).toEqual([
      'arbitrum-sepolia',
      'base-sepolia',
      'ethereum-sepolia',
      'optimism-sepolia',
      'polygon-amoy',
    ]);

    // Check isDefault flag
    const defaultEntry = networks.find((n) => n.network === 'ethereum-sepolia');
    expect(defaultEntry?.isDefault).toBe(true);

    const nonDefaultEntry = networks.find((n) => n.network === 'polygon-amoy');
    expect(nonDefaultEntry?.isDefault).toBe(false);
  });

  it('should return 404 for non-existent wallet', async () => {
    const fakeId = '00000000-0000-7000-8000-000000000000';

    const res = await app.request(`/v1/wallets/${fakeId}/networks`, {
      headers: { Host: HOST, 'X-Master-Password': TEST_MASTER_PASSWORD },
    });

    expect(res.status).toBe(404);
    const body = await json(res);
    expect(body.code).toBe('WALLET_NOT_FOUND');
  });
});

// ---------------------------------------------------------------------------
// ALLOWED_NETWORKS Policy CRUD (3 tests)
// ---------------------------------------------------------------------------

describe('ALLOWED_NETWORKS Policy CRUD', () => {
  it('POST /v1/policies should create ALLOWED_NETWORKS policy', async () => {
    const res = await app.request('/v1/policies', {
      method: 'POST',
      headers: masterHeaders(),
      body: JSON.stringify({
        type: 'ALLOWED_NETWORKS',
        rules: {
          networks: [
            { network: 'ethereum-sepolia' },
            { network: 'polygon-amoy' },
          ],
        },
      }),
    });

    expect(res.status).toBe(201);
    const body = await json(res);
    expect(body.type).toBe('ALLOWED_NETWORKS');
    expect(body.id).toBeTruthy();
    expect(body.enabled).toBe(true);
    const rules = body.rules as Record<string, unknown>;
    const networks = rules.networks as Array<{ network: string }>;
    expect(networks).toHaveLength(2);
    expect(networks[0]!.network).toBe('ethereum-sepolia');
    expect(networks[1]!.network).toBe('polygon-amoy');
  });

  it('GET /v1/policies should include created ALLOWED_NETWORKS policy', async () => {
    // Create the policy first
    const createRes = await app.request('/v1/policies', {
      method: 'POST',
      headers: masterHeaders(),
      body: JSON.stringify({
        type: 'ALLOWED_NETWORKS',
        rules: {
          networks: [
            { network: 'ethereum-sepolia' },
            { network: 'polygon-amoy' },
          ],
        },
      }),
    });
    const created = await json(createRes);
    const policyId = created.id as string;

    // List policies
    const res = await app.request('/v1/policies', {
      headers: masterHeaders(),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as Array<Record<string, unknown>>;
    expect(body.length).toBeGreaterThanOrEqual(1);

    const found = body.find((p) => p.id === policyId);
    expect(found).toBeTruthy();
    expect(found!.type).toBe('ALLOWED_NETWORKS');
    const rules = found!.rules as Record<string, unknown>;
    const networks = rules.networks as Array<{ network: string }>;
    expect(networks[0]!.network).toBe('ethereum-sepolia');
  });

  it('DELETE /v1/policies/:id should delete ALLOWED_NETWORKS policy', async () => {
    // Create the policy first
    const createRes = await app.request('/v1/policies', {
      method: 'POST',
      headers: masterHeaders(),
      body: JSON.stringify({
        type: 'ALLOWED_NETWORKS',
        rules: {
          networks: [
            { network: 'ethereum-sepolia' },
          ],
        },
      }),
    });
    const created = await json(createRes);
    const policyId = created.id as string;

    // Delete the policy
    const res = await app.request(`/v1/policies/${policyId}`, {
      method: 'DELETE',
      headers: masterHeaders(),
    });

    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.id).toBe(policyId);
    expect(body.deleted).toBe(true);

    // Verify it's gone
    const listRes = await app.request('/v1/policies', {
      headers: masterHeaders(),
    });
    const list = (await listRes.json()) as Array<Record<string, unknown>>;
    const found = list.find((p) => p.id === policyId);
    expect(found).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// network=all aggregate balance/assets tests (session-scoped routes)
// ---------------------------------------------------------------------------

describe('GET /v1/wallet/balance?network=all', () => {
  function makeAdapterForNetwork(network: string): IChainAdapter {
    const networkBalances: Record<string, bigint> = {
      'ethereum-sepolia': 500_000_000_000_000_000n,
      'polygon-amoy': 1_200_000_000_000_000_000n,
      'arbitrum-sepolia': 300_000_000_000_000_000n,
      'optimism-sepolia': 0n,
      'base-sepolia': 100_000_000_000_000_000n,
    };
    const networkSymbols: Record<string, string> = {
      'ethereum-sepolia': 'ETH',
      'polygon-amoy': 'POL',
      'arbitrum-sepolia': 'ETH',
      'optimism-sepolia': 'ETH',
      'base-sepolia': 'ETH',
    };
    return {
      chain: 'ethereum' as const,
      network: network as never,
      connect: async () => {},
      disconnect: async () => {},
      isConnected: () => true,
      getHealth: async (): Promise<HealthInfo> => ({ healthy: true, latencyMs: 1 }),
      getBalance: async (_addr: string): Promise<BalanceInfo> => ({
        address: _addr,
        balance: networkBalances[network] ?? 0n,
        decimals: 18,
        symbol: networkSymbols[network] ?? 'ETH',
      }),
      getAssets: async (): Promise<AssetInfo[]> => [
        { mint: '0x0', symbol: networkSymbols[network] ?? 'ETH', name: 'Native', balance: networkBalances[network] ?? 0n, decimals: 18, isNative: true },
      ],
      buildTransaction: async () => { throw new Error('not implemented'); },
      simulateTransaction: async () => { throw new Error('not implemented'); },
      signTransaction: async () => { throw new Error('not implemented'); },
      submitTransaction: async () => { throw new Error('not implemented'); },
      waitForConfirmation: async () => { throw new Error('not implemented'); },
      estimateFee: async () => { throw new Error('not implemented'); },
      buildTokenTransfer: async () => { throw new Error('not implemented'); },
      getTokenInfo: async () => { throw new Error('not implemented'); },
      buildContractCall: async () => { throw new Error('not implemented'); },
      buildApprove: async () => { throw new Error('not implemented'); },
      buildBatch: async () => { throw new Error('not implemented'); },
      getTransactionFee: async () => { throw new Error('not implemented'); },
      getCurrentNonce: async () => 0,
      sweepAll: async () => { throw new Error('not implemented'); },
    } as unknown as IChainAdapter;
  }

  function makeFailingAdapter(network: string, errorMsg: string): IChainAdapter {
    return {
      chain: 'ethereum' as const,
      network: network as never,
      connect: async () => {},
      disconnect: async () => {},
      isConnected: () => true,
      getHealth: async (): Promise<HealthInfo> => ({ healthy: true, latencyMs: 1 }),
      getBalance: async (): Promise<BalanceInfo> => { throw new Error(errorMsg); },
      getAssets: async (): Promise<AssetInfo[]> => { throw new Error(errorMsg); },
      buildTransaction: async () => { throw new Error('not implemented'); },
      simulateTransaction: async () => { throw new Error('not implemented'); },
      signTransaction: async () => { throw new Error('not implemented'); },
      submitTransaction: async () => { throw new Error('not implemented'); },
      waitForConfirmation: async () => { throw new Error('not implemented'); },
      estimateFee: async () => { throw new Error('not implemented'); },
      buildTokenTransfer: async () => { throw new Error('not implemented'); },
      getTokenInfo: async () => { throw new Error('not implemented'); },
      buildContractCall: async () => { throw new Error('not implemented'); },
      buildApprove: async () => { throw new Error('not implemented'); },
      buildBatch: async () => { throw new Error('not implemented'); },
      getTransactionFee: async () => { throw new Error('not implemented'); },
      getCurrentNonce: async () => 0,
      sweepAll: async () => { throw new Error('not implemented'); },
    } as unknown as IChainAdapter;
  }

  let conn2: DatabaseConnection;
  let app2: OpenAPIHono;
  let sessionToken: string;

  async function setupWithAdapterPool(adapterPool: AdapterPool) {
    conn2 = createDatabase(':memory:');
    pushSchema(conn2.sqlite);

    const hash = await argon2.hash(TEST_MASTER_PASSWORD, {
      type: argon2.argon2id, memoryCost: 4096, timeCost: 2, parallelism: 1,
    });

    const jwtSecretManager = new JwtSecretManager(conn2.db);
    await jwtSecretManager.initialize();

    app2 = createApp({
      db: conn2.db,
      sqlite: conn2.sqlite,
      keyStore: mockKeyStore(),
      masterPassword: TEST_MASTER_PASSWORD,
      masterPasswordHash: hash,
      config: mockConfig(),
      adapterPool,
      jwtSecretManager,
    });

    // Create wallet
    const walletRes = await app2.request('/v1/wallets', {
      method: 'POST',
      headers: {
        Host: HOST, 'Content-Type': 'application/json',
        'X-Master-Password': TEST_MASTER_PASSWORD,
      },
      body: JSON.stringify({ name: 'test-eth', chain: 'ethereum', environment: 'testnet' }),
    });
    const wallet = await walletRes.json() as Record<string, unknown>;
    const walletId = wallet.id as string;

    // Create session
    const sessRes = await app2.request('/v1/sessions', {
      method: 'POST',
      headers: {
        Host: HOST, 'Content-Type': 'application/json',
        'X-Master-Password': TEST_MASTER_PASSWORD,
      },
      body: JSON.stringify({ walletId }),
    });
    const sess = await sessRes.json() as Record<string, unknown>;
    sessionToken = sess.token as string;
  }

  afterEach(() => {
    if (conn2) conn2.sqlite.close();
  });

  it('returns balances array for all environment networks', async () => {
    const adapterPool: AdapterPool = {
      resolve: vi.fn().mockImplementation(
        async (_chain: string, network: string) => makeAdapterForNetwork(network),
      ),
      disconnectAll: vi.fn().mockResolvedValue(undefined),
      get size() { return 0; },
    } as unknown as AdapterPool;

    await setupWithAdapterPool(adapterPool);

    const res = await app2.request('/v1/wallet/balance?network=all', {
      headers: { Host: HOST, Authorization: `Bearer ${sessionToken}` },
    });

    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.chain).toBe('ethereum');
    expect(body.environment).toBe('testnet');
    const balances = body.balances as Array<Record<string, unknown>>;
    expect(balances).toHaveLength(5); // 5 EVM testnets
    const networks = balances.map((b) => b.network).sort();
    expect(networks).toEqual([
      'arbitrum-sepolia', 'base-sepolia', 'ethereum-sepolia', 'optimism-sepolia', 'polygon-amoy',
    ]);
    // Check one entry
    const ethSepolia = balances.find((b) => b.network === 'ethereum-sepolia');
    expect(ethSepolia).toBeDefined();
    expect(ethSepolia!.balance).toBe('500000000000000000');
    expect(ethSepolia!.decimals).toBe(18);
    expect(ethSepolia!.symbol).toBe('ETH');
  });

  it('returns error for networks with RPC failure', async () => {
    const adapterPool: AdapterPool = {
      resolve: vi.fn().mockImplementation(
        async (_chain: string, network: string) => {
          if (network === 'polygon-amoy') return makeFailingAdapter(network, 'RPC timeout');
          return makeAdapterForNetwork(network);
        },
      ),
      disconnectAll: vi.fn().mockResolvedValue(undefined),
      get size() { return 0; },
    } as unknown as AdapterPool;

    await setupWithAdapterPool(adapterPool);

    const res = await app2.request('/v1/wallet/balance?network=all', {
      headers: { Host: HOST, Authorization: `Bearer ${sessionToken}` },
    });

    expect(res.status).toBe(200);
    const body = await json(res);
    const balances = body.balances as Array<Record<string, unknown>>;
    expect(balances).toHaveLength(5);

    // polygon-amoy should have error
    const failed = balances.find((b) => b.network === 'polygon-amoy');
    expect(failed).toBeDefined();
    expect(failed!.error).toBe('RPC timeout');
    expect(failed!.balance).toBeUndefined();

    // ethereum-sepolia should succeed
    const success = balances.find((b) => b.network === 'ethereum-sepolia');
    expect(success).toBeDefined();
    expect(success!.balance).toBe('500000000000000000');
    expect(success!.error).toBeUndefined();
  });

  it('maintains backward compatibility for specific network', async () => {
    const adapterPool: AdapterPool = {
      resolve: vi.fn().mockImplementation(
        async (_chain: string, network: string) => makeAdapterForNetwork(network),
      ),
      disconnectAll: vi.fn().mockResolvedValue(undefined),
      get size() { return 0; },
    } as unknown as AdapterPool;

    await setupWithAdapterPool(adapterPool);

    const res = await app2.request('/v1/wallet/balance?network=ethereum-sepolia', {
      headers: { Host: HOST, Authorization: `Bearer ${sessionToken}` },
    });

    expect(res.status).toBe(200);
    const body = await json(res);
    // Single network response should have the old shape (walletId, chain, network, address, balance, ...)
    expect(body.walletId).toBeDefined();
    expect(body.chain).toBe('ethereum');
    expect(body.network).toBe('ethereum-sepolia');
    expect(body.address).toBeDefined();
    expect(body.balance).toBe('500000000000000000');
    expect(body.decimals).toBe(18);
    expect(body.symbol).toBe('ETH');
    // Should NOT have balances array
    expect(body.balances).toBeUndefined();
  });
});

describe('GET /v1/wallet/assets?network=all', () => {
  function makeAdapterForAssets(network: string): IChainAdapter {
    return {
      chain: 'ethereum' as const,
      network: network as never,
      connect: async () => {},
      disconnect: async () => {},
      isConnected: () => true,
      getHealth: async (): Promise<HealthInfo> => ({ healthy: true, latencyMs: 1 }),
      getBalance: async (_addr: string): Promise<BalanceInfo> => ({
        address: _addr, balance: 0n, decimals: 18, symbol: 'ETH',
      }),
      getAssets: async (): Promise<AssetInfo[]> => [
        { mint: '0x0', symbol: 'ETH', name: 'Ether', balance: 100n, decimals: 18, isNative: true },
      ],
      buildTransaction: async () => { throw new Error('not implemented'); },
      simulateTransaction: async () => { throw new Error('not implemented'); },
      signTransaction: async () => { throw new Error('not implemented'); },
      submitTransaction: async () => { throw new Error('not implemented'); },
      waitForConfirmation: async () => { throw new Error('not implemented'); },
      estimateFee: async () => { throw new Error('not implemented'); },
      buildTokenTransfer: async () => { throw new Error('not implemented'); },
      getTokenInfo: async () => { throw new Error('not implemented'); },
      buildContractCall: async () => { throw new Error('not implemented'); },
      buildApprove: async () => { throw new Error('not implemented'); },
      buildBatch: async () => { throw new Error('not implemented'); },
      getTransactionFee: async () => { throw new Error('not implemented'); },
      getCurrentNonce: async () => 0,
      sweepAll: async () => { throw new Error('not implemented'); },
    } as unknown as IChainAdapter;
  }

  let conn3: DatabaseConnection;
  let app3: OpenAPIHono;
  let sessionToken: string;

  afterEach(() => {
    if (conn3) conn3.sqlite.close();
  });

  it('returns assets array for all environment networks', async () => {
    const adapterPool: AdapterPool = {
      resolve: vi.fn().mockImplementation(
        async (_chain: string, network: string) => makeAdapterForAssets(network),
      ),
      disconnectAll: vi.fn().mockResolvedValue(undefined),
      get size() { return 0; },
    } as unknown as AdapterPool;

    conn3 = createDatabase(':memory:');
    pushSchema(conn3.sqlite);

    const hash = await argon2.hash(TEST_MASTER_PASSWORD, {
      type: argon2.argon2id, memoryCost: 4096, timeCost: 2, parallelism: 1,
    });

    const jwtSecretManager = new JwtSecretManager(conn3.db);
    await jwtSecretManager.initialize();

    app3 = createApp({
      db: conn3.db, sqlite: conn3.sqlite, keyStore: mockKeyStore(),
      masterPassword: TEST_MASTER_PASSWORD, masterPasswordHash: hash,
      config: mockConfig(), adapterPool, jwtSecretManager,
    });

    // Create wallet
    const walletRes = await app3.request('/v1/wallets', {
      method: 'POST',
      headers: { Host: HOST, 'Content-Type': 'application/json', 'X-Master-Password': TEST_MASTER_PASSWORD },
      body: JSON.stringify({ name: 'test-eth-assets', chain: 'ethereum', environment: 'testnet' }),
    });
    const wallet = await walletRes.json() as Record<string, unknown>;
    const walletId = wallet.id as string;

    // Create session
    const sessRes = await app3.request('/v1/sessions', {
      method: 'POST',
      headers: { Host: HOST, 'Content-Type': 'application/json', 'X-Master-Password': TEST_MASTER_PASSWORD },
      body: JSON.stringify({ walletId }),
    });
    const sess = await sessRes.json() as Record<string, unknown>;
    sessionToken = sess.token as string;

    const res = await app3.request('/v1/wallet/assets?network=all', {
      headers: { Host: HOST, Authorization: `Bearer ${sessionToken}` },
    });

    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.chain).toBe('ethereum');
    expect(body.environment).toBe('testnet');
    const networkAssets = body.networkAssets as Array<Record<string, unknown>>;
    expect(networkAssets).toHaveLength(5);

    const networks = networkAssets.map((n) => n.network).sort();
    expect(networks).toEqual([
      'arbitrum-sepolia', 'base-sepolia', 'ethereum-sepolia', 'optimism-sepolia', 'polygon-amoy',
    ]);

    // Each network should have assets array
    for (const entry of networkAssets) {
      const assets = entry.assets as Array<Record<string, unknown>>;
      expect(assets).toBeDefined();
      expect(assets).toHaveLength(1);
      expect(assets[0]!.symbol).toBe('ETH');
    }
  });
});
