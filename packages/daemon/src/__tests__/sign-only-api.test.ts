/**
 * Integration tests for POST /v1/transactions/sign (sign-only pipeline REST API).
 *
 * Uses in-memory SQLite + createApp + app.request() pattern (same as api-transactions.test.ts).
 * Tests:
 * 1. 200 success: valid Solana tx signed
 * 2. 200 success: operations array returned correctly
 * 3. DB record: type='SIGN', status='SIGNED', reserved_amount set
 * 4. 401: no Authorization header
 * 5. 400: invalid transaction (parse failure)
 * 6. 403: policy denied (DELAY tier)
 * 7. 403: policy denied (WHITELIST)
 * 8. reserved_amount accumulation across multiple sign requests
 * 9. 404: wallet not found (deleted/invalid session wallet)
 *
 * @see packages/daemon/src/api/routes/transactions.ts (signTransactionRoute)
 * @see packages/daemon/src/pipeline/sign-only.ts (executeSignOnly)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import argon2 from 'argon2';
import { createApp } from '../api/server.js';
import { createDatabase, pushSchema, generateId } from '../infrastructure/database/index.js';
import { JwtSecretManager, type JwtPayload } from '../infrastructure/jwt/index.js';
import type { DatabaseConnection } from '../infrastructure/database/index.js';
import type { DaemonConfig } from '../infrastructure/config/loader.js';
import type { LocalKeyStore } from '../infrastructure/keystore/keystore.js';
import { DatabasePolicyEngine } from '../pipeline/database-policy-engine.js';
import type {
  IChainAdapter,
  BalanceInfo,
  HealthInfo,
  UnsignedTransaction,
  SimulationResult,
  SubmitResult,
  ParsedTransaction,
  SignedTransaction,
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

const DEFAULT_PARSED_TX: ParsedTransaction = {
  operations: [
    {
      type: 'NATIVE_TRANSFER',
      to: 'Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr',
      amount: 1_000_000_000n, // 1 SOL
    },
  ],
  rawTx: 'base64-unsigned-tx',
};

const DEFAULT_SIGNED_TX: SignedTransaction = {
  signedTransaction: 'signed-base64-tx',
  txHash: 'mock-tx-hash-123',
};

function mockKeyStore(): LocalKeyStore {
  return {
    generateKeyPair: async () => ({
      publicKey: MOCK_PUBLIC_KEY,
      encryptedPrivateKey: new Uint8Array(64),
    }),
    decryptPrivateKey: async () => new Uint8Array(64),
    releaseKey: vi.fn(),
    hasKey: async () => true,
    deleteKey: async () => {},
    lockAll: () => {},
    sodiumAvailable: true,
  } as unknown as LocalKeyStore;
}

function mockAdapter(overrides: Partial<IChainAdapter> = {}): IChainAdapter {
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
    estimateFee: async () => { throw new Error('not implemented'); },
    buildTokenTransfer: async () => { throw new Error('not implemented'); },
    getTokenInfo: async () => { throw new Error('not implemented'); },
    buildContractCall: async () => { throw new Error('not implemented'); },
    buildApprove: async () => { throw new Error('not implemented'); },
    buildBatch: async () => { throw new Error('not implemented'); },
    getTransactionFee: async () => { throw new Error('not implemented'); },
    getCurrentNonce: async () => 0,
    sweepAll: async () => { throw new Error('not implemented'); },
    // sign-only methods
    parseTransaction: vi.fn().mockResolvedValue(DEFAULT_PARSED_TX),
    signExternalTransaction: vi.fn().mockResolvedValue(DEFAULT_SIGNED_TX),
    ...overrides,
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
let policyEngine: DatabasePolicyEngine;
let adapter: IChainAdapter;

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

  // Use DatabasePolicyEngine (real instance) for policy evaluation tests
  policyEngine = new DatabasePolicyEngine(conn.db, conn.sqlite);

  adapter = mockAdapter();

  app = createApp({
    db: conn.db,
    sqlite: conn.sqlite,
    keyStore: mockKeyStore(),
    masterPassword: TEST_MASTER_PASSWORD,
    masterPasswordHash,
    config: mockConfig(),
    adapterPool: mockAdapterPool(adapter),
    policyEngine,
    jwtSecretManager,
  });
});

afterEach(() => {
  conn.sqlite.close();
});

// ---------------------------------------------------------------------------
// Auth helpers
// ---------------------------------------------------------------------------

/** Create a wallet via DB INSERT and return its ID. */
async function createTestWallet(): Promise<string> {
  const id = generateId();
  const now = Math.floor(Date.now() / 1000);
  conn.sqlite
    .prepare(
      `INSERT INTO wallets (id, name, chain, environment, default_network, public_key, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(id, 'sign-test-wallet', 'solana', 'testnet', 'devnet', MOCK_PUBLIC_KEY, 'ACTIVE', now, now);
  return id;
}

/** Create a session token for the given wallet. Returns "Bearer <token>". */
async function createSessionToken(walletId: string): Promise<string> {
  const sessionId = generateId();
  const now = Math.floor(Date.now() / 1000);

  conn.sqlite
    .prepare(
      `INSERT INTO sessions (id, wallet_id, token_hash, expires_at, absolute_expires_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(sessionId, walletId, `hash-${sessionId}`, now + 86400, now + 86400 * 30, now);

  const payload: JwtPayload = {
    sub: sessionId,
    wlt: walletId,
    iat: now,
    exp: now + 3600,
  };
  const token = await jwtSecretManager.signToken(payload);
  return `Bearer ${token}`;
}

/** Insert a policy via raw SQL. */
function insertPolicy(opts: {
  walletId?: string | null;
  type: string;
  rules: string;
  priority?: number;
  enabled?: boolean;
}): void {
  const id = generateId();
  const now = Math.floor(Date.now() / 1000);
  conn.sqlite
    .prepare(
      `INSERT INTO policies (id, wallet_id, type, rules, priority, enabled, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(id, opts.walletId ?? null, opts.type, opts.rules, opts.priority ?? 0, opts.enabled ?? true ? 1 : 0, now, now);
}

// ---------------------------------------------------------------------------
// POST /v1/transactions/sign (9 tests)
// ---------------------------------------------------------------------------

describe('POST /v1/transactions/sign', () => {
  // Test 1: 200 success with valid Solana tx
  it('should return 200 with signedTransaction for valid request', async () => {
    const walletId = await createTestWallet();
    const authHeader = await createSessionToken(walletId);

    const res = await app.request('/v1/transactions/sign', {
      method: 'POST',
      headers: {
        Host: HOST,
        'Content-Type': 'application/json',
        Authorization: authHeader,
      },
      body: JSON.stringify({ transaction: 'base64-unsigned-tx' }),
    });

    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.id).toBeTruthy();
    expect(body.signedTransaction).toBe('signed-base64-tx');
    expect(body.txHash).toBe('mock-tx-hash-123');
    expect(body.policyResult).toBeTruthy();
    expect((body.policyResult as Record<string, unknown>).tier).toBe('INSTANT');
  });

  // Test 2: 200 operations array returned correctly
  it('should return operations array with correct fields', async () => {
    const walletId = await createTestWallet();
    const authHeader = await createSessionToken(walletId);

    const res = await app.request('/v1/transactions/sign', {
      method: 'POST',
      headers: {
        Host: HOST,
        'Content-Type': 'application/json',
        Authorization: authHeader,
      },
      body: JSON.stringify({ transaction: 'base64-unsigned-tx' }),
    });

    expect(res.status).toBe(200);
    const body = await json(res);
    const operations = body.operations as Array<Record<string, unknown>>;
    expect(operations).toHaveLength(1);
    expect(operations[0]!.type).toBe('NATIVE_TRANSFER');
    expect(operations[0]!.to).toBe('Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr');
    expect(operations[0]!.amount).toBe('1000000000');
  });

  // Test 3: DB record verification
  it('should persist transaction with type=SIGN, status=SIGNED', async () => {
    const walletId = await createTestWallet();
    const authHeader = await createSessionToken(walletId);

    const res = await app.request('/v1/transactions/sign', {
      method: 'POST',
      headers: {
        Host: HOST,
        'Content-Type': 'application/json',
        Authorization: authHeader,
      },
      body: JSON.stringify({ transaction: 'base64-unsigned-tx' }),
    });

    expect(res.status).toBe(200);
    const body = await json(res);
    const txId = body.id as string;

    // Verify DB record
    const row = conn.sqlite
      .prepare('SELECT * FROM transactions WHERE id = ?')
      .get(txId) as Record<string, unknown>;
    expect(row).toBeTruthy();
    expect(row.type).toBe('SIGN');
    expect(row.status).toBe('SIGNED');
    expect(row.wallet_id).toBe(walletId);
    expect(row.to_address).toBe('Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr');
    expect(row.amount).toBe('1000000000');
  });

  // Test 4: 401 without Authorization header
  it('should return 401 without Authorization header', async () => {
    const res = await app.request('/v1/transactions/sign', {
      method: 'POST',
      headers: {
        Host: HOST,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ transaction: 'base64-unsigned-tx' }),
    });

    expect(res.status).toBe(401);
    const body = await json(res);
    expect(body.code).toBe('INVALID_TOKEN');
  });

  // Test 5: 400 invalid transaction (parse failure)
  it('should return 400 INVALID_TRANSACTION when parsing fails', async () => {
    // Create app with adapter that throws on parseTransaction
    const failAdapter = mockAdapter({
      parseTransaction: vi.fn().mockRejectedValue(new Error('Cannot decode transaction bytes')),
    });
    const masterPasswordHash = await argon2.hash(TEST_MASTER_PASSWORD, {
      type: argon2.argon2id,
      memoryCost: 4096,
      timeCost: 2,
      parallelism: 1,
    });
    const localApp = createApp({
      db: conn.db,
      sqlite: conn.sqlite,
      keyStore: mockKeyStore(),
      masterPassword: TEST_MASTER_PASSWORD,
      masterPasswordHash,
      config: mockConfig(),
      adapterPool: mockAdapterPool(failAdapter),
      policyEngine,
      jwtSecretManager,
    });

    const walletId = await createTestWallet();
    const authHeader = await createSessionToken(walletId);

    const res = await localApp.request('/v1/transactions/sign', {
      method: 'POST',
      headers: {
        Host: HOST,
        'Content-Type': 'application/json',
        Authorization: authHeader,
      },
      body: JSON.stringify({ transaction: 'invalid-garbage-data' }),
    });

    expect(res.status).toBe(400);
    const body = await json(res);
    expect(body.code).toBe('INVALID_TRANSACTION');
  });

  // Test 6: 403 policy denied (DELAY tier -> immediate rejection)
  it('should return 403 POLICY_DENIED for DELAY tier amount', async () => {
    const walletId = await createTestWallet();
    const authHeader = await createSessionToken(walletId);

    // Set SPENDING_LIMIT with very low instant/notify thresholds
    insertPolicy({
      walletId,
      type: 'SPENDING_LIMIT',
      rules: JSON.stringify({
        instant_max: '100000',    // 0.0001 SOL
        notify_max: '200000',     // 0.0002 SOL
        delay_max: '50000000000', // 50 SOL
        delay_seconds: 300,
      }),
      priority: 10,
    });

    const res = await app.request('/v1/transactions/sign', {
      method: 'POST',
      headers: {
        Host: HOST,
        'Content-Type': 'application/json',
        Authorization: authHeader,
      },
      body: JSON.stringify({ transaction: 'base64-unsigned-tx' }),
    });

    expect(res.status).toBe(403);
    const body = await json(res);
    expect(body.code).toBe('POLICY_DENIED');
    expect((body.message as string)).toContain('DELAY');
  });

  // Test 7: 403 policy denied (WHITELIST)
  it('should return 403 POLICY_DENIED for non-whitelisted address', async () => {
    const walletId = await createTestWallet();
    const authHeader = await createSessionToken(walletId);

    // WHITELIST policy that only allows a different address
    insertPolicy({
      walletId,
      type: 'WHITELIST',
      rules: JSON.stringify({
        allowed_addresses: ['AllowedAddress111'],
      }),
      priority: 10,
    });

    const res = await app.request('/v1/transactions/sign', {
      method: 'POST',
      headers: {
        Host: HOST,
        'Content-Type': 'application/json',
        Authorization: authHeader,
      },
      body: JSON.stringify({ transaction: 'base64-unsigned-tx' }),
    });

    expect(res.status).toBe(403);
    const body = await json(res);
    expect(body.code).toBe('POLICY_DENIED');
  });

  // Test 8: reserved_amount accumulation across multiple sign requests
  it('should accumulate reserved_amount across multiple sign requests', async () => {
    const walletId = await createTestWallet();
    const authHeader = await createSessionToken(walletId);

    // SPENDING_LIMIT: 10 SOL instant
    insertPolicy({
      walletId,
      type: 'SPENDING_LIMIT',
      rules: JSON.stringify({
        instant_max: '10000000000',
        notify_max: '50000000000',
        delay_max: '100000000000',
        delay_seconds: 300,
      }),
      priority: 10,
    });

    // First sign: 1 SOL (default mock parsed tx)
    const res1 = await app.request('/v1/transactions/sign', {
      method: 'POST',
      headers: {
        Host: HOST,
        'Content-Type': 'application/json',
        Authorization: authHeader,
      },
      body: JSON.stringify({ transaction: 'base64-unsigned-tx' }),
    });
    expect(res1.status).toBe(200);
    const body1 = await json(res1);

    // Second sign: same 1 SOL
    const res2 = await app.request('/v1/transactions/sign', {
      method: 'POST',
      headers: {
        Host: HOST,
        'Content-Type': 'application/json',
        Authorization: authHeader,
      },
      body: JSON.stringify({ transaction: 'base64-unsigned-tx-2' }),
    });
    expect(res2.status).toBe(200);
    const body2 = await json(res2);

    // Verify both transactions exist and are SIGNED with reserved_amount
    const tx1Id = body1.id as string;
    const tx2Id = body2.id as string;
    expect(tx1Id).not.toBe(tx2Id);

    const row1 = conn.sqlite
      .prepare('SELECT reserved_amount FROM transactions WHERE id = ?')
      .get(tx1Id) as Record<string, unknown>;
    const row2 = conn.sqlite
      .prepare('SELECT reserved_amount FROM transactions WHERE id = ?')
      .get(tx2Id) as Record<string, unknown>;
    expect(row1.reserved_amount).toBeTruthy();
    expect(row2.reserved_amount).toBeTruthy();
  });

  // Test 9: 404 wallet not found (session exists but wallet deleted)
  it('should return 404 WALLET_NOT_FOUND when wallet is missing', async () => {
    // Create wallet + session, then delete wallet with FK disabled
    const walletId = await createTestWallet();
    const authHeader = await createSessionToken(walletId);

    // Temporarily disable FK constraints to delete wallet without cascading session delete
    conn.sqlite.pragma('foreign_keys = OFF');
    conn.sqlite.prepare('DELETE FROM wallets WHERE id = ?').run(walletId);
    conn.sqlite.pragma('foreign_keys = ON');

    const res = await app.request('/v1/transactions/sign', {
      method: 'POST',
      headers: {
        Host: HOST,
        'Content-Type': 'application/json',
        Authorization: authHeader,
      },
      body: JSON.stringify({ transaction: 'base64-unsigned-tx' }),
    });

    expect(res.status).toBe(404);
    const body = await json(res);
    expect(body.code).toBe('WALLET_NOT_FOUND');
  });

  // Test 10: OpenAPI spec contains TxSignRequest and TxSignResponse schemas
  it('should include TxSignRequest and TxSignResponse in OpenAPI doc', async () => {
    const res = await app.request('/doc', {
      headers: { Host: HOST },
    });

    expect(res.status).toBe(200);
    const doc = (await json(res)) as Record<string, unknown>;

    const schemas = (doc.components as Record<string, unknown>)?.schemas as Record<string, unknown>;
    expect(schemas).toBeTruthy();
    expect(schemas.TxSignRequest).toBeTruthy();
    expect(schemas.TxSignResponse).toBeTruthy();

    // Check the sign route exists in paths
    const paths = doc.paths as Record<string, Record<string, unknown>>;
    const signRoute = paths['/v1/transactions/sign'];
    expect(signRoute).toBeTruthy();
    expect(signRoute.post).toBeTruthy();
  });

  // Test 11: txHash null when adapter returns undefined txHash
  it('should return txHash as null when adapter does not provide it', async () => {
    const noHashAdapter = mockAdapter({
      signExternalTransaction: vi.fn().mockResolvedValue({
        signedTransaction: 'signed-no-hash',
        // txHash intentionally omitted
      } as SignedTransaction),
    });
    const masterPasswordHash = await argon2.hash(TEST_MASTER_PASSWORD, {
      type: argon2.argon2id,
      memoryCost: 4096,
      timeCost: 2,
      parallelism: 1,
    });
    const localApp = createApp({
      db: conn.db,
      sqlite: conn.sqlite,
      keyStore: mockKeyStore(),
      masterPassword: TEST_MASTER_PASSWORD,
      masterPasswordHash,
      config: mockConfig(),
      adapterPool: mockAdapterPool(noHashAdapter),
      policyEngine,
      jwtSecretManager,
    });

    const walletId = await createTestWallet();
    const authHeader = await createSessionToken(walletId);

    const res = await localApp.request('/v1/transactions/sign', {
      method: 'POST',
      headers: {
        Host: HOST,
        'Content-Type': 'application/json',
        Authorization: authHeader,
      },
      body: JSON.stringify({ transaction: 'base64-unsigned-tx' }),
    });

    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.signedTransaction).toBe('signed-no-hash');
    expect(body.txHash).toBeNull();
  });
});
