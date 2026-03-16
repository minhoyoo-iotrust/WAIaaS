/**
 * Integration tests for POST /v1/transactions/sign-message (sign message pipeline REST API).
 *
 * Tests:
 * 1. 200: signType 'personal' with message string -> signature returned
 * 2. 200: signType omitted defaults to 'personal'
 * 3. 200: signType 'typedData' with valid EIP-712 data -> signature returned (EVM)
 * 4. 400: signType 'typedData' without typedData field
 * 5. 400: signType 'typedData' on Solana wallet (EVM only)
 * 6. 200: signType 'personal' with hex message (0x-prefixed)
 * 7. 400: signType 'personal' without message field
 * 8. DB record: type='SIGN', status='SIGNED'
 * 9. 401: Authorization header missing -> INVALID_TOKEN
 * 10. 401: invalid JWT token -> INVALID_TOKEN
 * 11. 403: wallet not in session -> WALLET_ACCESS_DENIED
 * 12. 404: nonexistent wallet ID -> WALLET_NOT_FOUND
 * 13. 400: terminated wallet -> WALLET_TERMINATED
 * 14. Multi-wallet session walletId resolution (explicit walletId)
 * 15. Multi-wallet session without walletId -> WALLET_ID_REQUIRED
 * 16. EventBus.emit('wallet:activity') called on successful sign
 * 17. Key decryption failure -> CHAIN_ERROR with FAILED DB record
 * 18. Empty message string handling
 * 19. Complex nested EIP-712 typed data (struct within struct)
 * 20. GET /v1/transactions shows SIGN type record after signing
 * 21. Session ID recorded in transaction DB record
 *
 * @see packages/daemon/src/api/routes/transactions.ts (signMessageRoute)
 * @see packages/daemon/src/pipeline/sign-message.ts (executeSignMessage)
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
import { EventBus } from '@waiaas/core';
import type { AdapterPool } from '../infrastructure/adapter-pool.js';
import type { OpenAPIHono } from '@hono/zod-openapi';
import { privateKeyToAccount, generatePrivateKey } from 'viem/accounts';

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

// Use a real private key so viem signing actually works
const REAL_PRIVATE_KEY = generatePrivateKey();
const REAL_ACCOUNT = privateKeyToAccount(REAL_PRIVATE_KEY);
const EVM_PUBLIC_KEY = REAL_ACCOUNT.address;
const SOLANA_PUBLIC_KEY = '11111111111111111111111111111112';

function mockKeyStore(): LocalKeyStore {
  const keyBytes = Buffer.from(REAL_PRIVATE_KEY.slice(2), 'hex');
  return {
    generateKeyPair: async () => ({
      publicKey: EVM_PUBLIC_KEY,
      encryptedPrivateKey: new Uint8Array(64),
    }),
    decryptPrivateKey: async () => new Uint8Array(keyBytes),
    releaseKey: vi.fn(),
    hasKey: async () => true,
    deleteKey: async () => {},
    lockAll: () => {},
    sodiumAvailable: true,
  } as unknown as LocalKeyStore;
}

const DEFAULT_PARSED_TX: ParsedTransaction = {
  operations: [{ type: 'NATIVE_TRANSFER', to: '0x1234', amount: 1_000_000_000n }],
  rawTx: 'base64-unsigned-tx',
};
const DEFAULT_SIGNED_TX: SignedTransaction = {
  signedTransaction: 'signed-base64-tx',
  txHash: 'mock-tx-hash-123',
};

function mockAdapter(): IChainAdapter {
  return {
    chain: 'evm' as const,
    network: 'ethereum-mainnet',
    connect: async () => {},
    disconnect: async () => {},
    isConnected: () => true,
    getHealth: async (): Promise<HealthInfo> => ({ healthy: true, latencyMs: 1 }),
    getBalance: async (addr: string): Promise<BalanceInfo> => ({
      address: addr,
      balance: 1_000_000_000_000_000_000n,
      decimals: 18,
      symbol: 'ETH',
    }),
    buildTransaction: async (): Promise<UnsignedTransaction> => ({
      chain: 'evm',
      serialized: new Uint8Array(128),
      estimatedFee: 5000n,
      metadata: {},
    }),
    simulateTransaction: async (): Promise<SimulationResult> => ({
      success: true,
      logs: ['success'],
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
    parseTransaction: vi.fn().mockResolvedValue(DEFAULT_PARSED_TX),
    signExternalTransaction: vi.fn().mockResolvedValue(DEFAULT_SIGNED_TX),
  } as unknown as IChainAdapter;
}

function mockAdapterPool(): AdapterPool {
  const a = mockAdapter();
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

  policyEngine = new DatabasePolicyEngine(conn.db, conn.sqlite);

  app = createApp({
    db: conn.db,
    sqlite: conn.sqlite,
    keyStore: mockKeyStore(),
    masterPassword: TEST_MASTER_PASSWORD,
    masterPasswordHash,
    config: mockConfig(),
    adapterPool: mockAdapterPool(),
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

/** Counter to generate unique public keys for each test wallet. */
let walletCounter = 0;

/** Create a wallet via raw SQL INSERT and return its ID. */
function createTestWallet(chain: 'evm' | 'solana' = 'evm'): string {
  const id = generateId();
  const now = Math.floor(Date.now() / 1000);
  // Generate unique public key per wallet to avoid UNIQUE constraint violations
  walletCounter++;
  const publicKey = chain === 'evm'
    ? `0x${walletCounter.toString(16).padStart(40, '0')}`
    : `${walletCounter.toString().padStart(32, '1')}`;
  conn.sqlite
    .prepare(
      `INSERT INTO wallets (id, name, chain, environment, public_key, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(id, `test-${chain}-wallet`, chain === 'evm' ? 'ethereum' : 'solana', chain === 'evm' ? 'mainnet' : 'testnet', publicKey, 'ACTIVE', now, now);
  return id;
}

/** Create a wallet with the REAL_PRIVATE_KEY so viem signing works. Only one per test! */
function createSignableWallet(): string {
  const id = generateId();
  const now = Math.floor(Date.now() / 1000);
  conn.sqlite
    .prepare(
      `INSERT INTO wallets (id, name, chain, environment, public_key, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(id, 'test-evm-signable', 'ethereum', 'mainnet', EVM_PUBLIC_KEY, 'ACTIVE', now, now);
  return id;
}

/** Create a session token for the given wallet. Returns "Bearer <token>". */
async function createSessionToken(walletId: string): Promise<string> {
  const sessionId = generateId();
  const now = Math.floor(Date.now() / 1000);

  conn.sqlite
    .prepare(
      `INSERT INTO sessions (id, token_hash, expires_at, absolute_expires_at, created_at)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .run(sessionId, `hash-${sessionId}`, now + 86400, now + 86400 * 30, now);
  conn.sqlite
    .prepare(
      `INSERT INTO session_wallets (session_id, wallet_id, created_at)
       VALUES (?, ?, ?)`,
    )
    .run(sessionId, walletId, now);

  const payload: JwtPayload = {
    sub: sessionId,
    iat: now,
    exp: now + 3600,
  };
  const token = await jwtSecretManager.signToken(payload);
  return `Bearer ${token}`;
}

// ---------------------------------------------------------------------------
// POST /v1/transactions/sign-message (8 tests)
// ---------------------------------------------------------------------------

describe('POST /v1/transactions/sign-message', () => {
  // Test 1: personal sign with message string
  it('should return 200 with signature for personal sign', async () => {
    const walletId = createSignableWallet();
    const authHeader = await createSessionToken(walletId);

    const res = await app.request('/v1/transactions/sign-message', {
      method: 'POST',
      headers: {
        Host: HOST,
        'Content-Type': 'application/json',
        Authorization: authHeader,
      },
      body: JSON.stringify({
        message: 'Hello, World!',
        signType: 'personal',
      }),
    });

    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.signature).toBeDefined();
    expect(typeof body.signature).toBe('string');
    expect((body.signature as string).startsWith('0x')).toBe(true);
    expect(body.signType).toBe('personal');
    expect(body.id).toBeDefined();
  });

  // Test 2: signType omitted defaults to personal
  it('should default signType to personal when omitted', async () => {
    const walletId = createSignableWallet();
    const authHeader = await createSessionToken(walletId);

    const res = await app.request('/v1/transactions/sign-message', {
      method: 'POST',
      headers: {
        Host: HOST,
        'Content-Type': 'application/json',
        Authorization: authHeader,
      },
      body: JSON.stringify({
        message: 'Default sign type test',
      }),
    });

    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.signType).toBe('personal');
    expect(body.signature).toBeDefined();
  });

  // Test 3: EIP-712 typedData signing (EVM)
  it('should return 200 with signature for EIP-712 typedData', async () => {
    const walletId = createSignableWallet();
    const authHeader = await createSessionToken(walletId);

    const res = await app.request('/v1/transactions/sign-message', {
      method: 'POST',
      headers: {
        Host: HOST,
        'Content-Type': 'application/json',
        Authorization: authHeader,
      },
      body: JSON.stringify({
        signType: 'typedData',
        typedData: {
          domain: {
            name: 'TestDApp',
            version: '1',
            chainId: 1,
            verifyingContract: '0x1234567890abcdef1234567890abcdef12345678',
          },
          types: {
            Order: [
              { name: 'maker', type: 'address' },
              { name: 'amount', type: 'uint256' },
            ],
          },
          primaryType: 'Order',
          message: {
            maker: '0xabcdef1234567890abcdef1234567890abcdef12',
            amount: '1000000',
          },
        },
      }),
    });

    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.signature).toBeDefined();
    expect(typeof body.signature).toBe('string');
    expect((body.signature as string).startsWith('0x')).toBe(true);
    expect(body.signType).toBe('typedData');
    expect(body.id).toBeDefined();
  });

  // Test 4: signType 'typedData' without typedData field -> 400
  it('should return 400 when signType is typedData but typedData field is missing', async () => {
    const walletId = createSignableWallet();
    const authHeader = await createSessionToken(walletId);

    const res = await app.request('/v1/transactions/sign-message', {
      method: 'POST',
      headers: {
        Host: HOST,
        'Content-Type': 'application/json',
        Authorization: authHeader,
      },
      body: JSON.stringify({
        signType: 'typedData',
      }),
    });

    expect(res.status).toBe(400);
  });

  // Test 5: Solana wallet with signType 'typedData' -> 400 (EVM only)
  it('should return 400 when signType is typedData on Solana wallet', async () => {
    const walletId = createTestWallet('solana');
    const authHeader = await createSessionToken(walletId);

    const res = await app.request('/v1/transactions/sign-message', {
      method: 'POST',
      headers: {
        Host: HOST,
        'Content-Type': 'application/json',
        Authorization: authHeader,
      },
      body: JSON.stringify({
        signType: 'typedData',
        typedData: {
          domain: {
            name: 'TestDApp',
            version: '1',
            chainId: 1,
            verifyingContract: '0x1234567890abcdef1234567890abcdef12345678',
          },
          types: {
            Order: [
              { name: 'maker', type: 'address' },
              { name: 'amount', type: 'uint256' },
            ],
          },
          primaryType: 'Order',
          message: {
            maker: '0xabcdef1234567890abcdef1234567890abcdef12',
            amount: '1000000',
          },
        },
      }),
    });

    expect(res.status).toBe(400);
    const body = await json(res);
    expect(body.code).toBe('ACTION_VALIDATION_FAILED');
  });

  // Test 6: personal sign with hex message
  it('should return 200 with signature for hex message (0x-prefixed)', async () => {
    const walletId = createSignableWallet();
    const authHeader = await createSessionToken(walletId);

    const res = await app.request('/v1/transactions/sign-message', {
      method: 'POST',
      headers: {
        Host: HOST,
        'Content-Type': 'application/json',
        Authorization: authHeader,
      },
      body: JSON.stringify({
        message: '0xdeadbeef',
        signType: 'personal',
      }),
    });

    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.signature).toBeDefined();
    expect(body.signType).toBe('personal');
  });

  // Test 7: personal sign without message -> 400
  it('should return 400 when signType is personal but message is missing', async () => {
    const walletId = createSignableWallet();
    const authHeader = await createSessionToken(walletId);

    const res = await app.request('/v1/transactions/sign-message', {
      method: 'POST',
      headers: {
        Host: HOST,
        'Content-Type': 'application/json',
        Authorization: authHeader,
      },
      body: JSON.stringify({
        signType: 'personal',
      }),
    });

    expect(res.status).toBe(400);
  });

  // Test 8: DB record created with type='SIGN', status='SIGNED'
  it('should create DB record with type=SIGN and status=SIGNED', async () => {
    const walletId = createSignableWallet();
    const authHeader = await createSessionToken(walletId);

    const res = await app.request('/v1/transactions/sign-message', {
      method: 'POST',
      headers: {
        Host: HOST,
        'Content-Type': 'application/json',
        Authorization: authHeader,
      },
      body: JSON.stringify({
        message: 'DB record test',
      }),
    });

    expect(res.status).toBe(200);
    const body = await json(res);
    const txId = body.id as string;

    // Query DB directly via raw SQL
    const row = conn.sqlite
      .prepare('SELECT type, status, wallet_id FROM transactions WHERE id = ?')
      .get(txId) as { type: string; status: string; wallet_id: string } | undefined;
    expect(row).toBeDefined();
    expect(row!.type).toBe('SIGN');
    expect(row!.status).toBe('SIGNED');
    expect(row!.wallet_id).toBe(walletId);
  });

  // -------------------------------------------------------------------------
  // Tests 9-21: Auth / validation / event / key management coverage (#364)
  // -------------------------------------------------------------------------

  // Test 9: missing Authorization header -> INVALID_TOKEN
  it('should return 401 when Authorization header is missing', async () => {
    const res = await app.request('/v1/transactions/sign-message', {
      method: 'POST',
      headers: {
        Host: HOST,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ message: 'no auth' }),
    });

    expect(res.status).toBe(401);
    const body = await json(res);
    expect(body.code).toBe('INVALID_TOKEN');
  });

  // Test 10: invalid JWT token -> INVALID_TOKEN
  it('should return 401 when JWT token is invalid', async () => {
    const res = await app.request('/v1/transactions/sign-message', {
      method: 'POST',
      headers: {
        Host: HOST,
        'Content-Type': 'application/json',
        Authorization: 'Bearer wai_sess_invalid.jwt.token',
      },
      body: JSON.stringify({ message: 'bad token' }),
    });

    expect(res.status).toBe(401);
    const body = await json(res);
    expect(body.code).toBe('INVALID_TOKEN');
  });

  // Test 11: wallet not in session -> WALLET_ACCESS_DENIED
  it('should return 403 when wallet is not linked to session', async () => {
    const walletA = createSignableWallet();
    const walletB = createTestWallet('evm');
    // Create session only for walletA
    const authHeader = await createSessionToken(walletA);

    // Try to sign with walletB (not in session)
    const res = await app.request('/v1/transactions/sign-message', {
      method: 'POST',
      headers: {
        Host: HOST,
        'Content-Type': 'application/json',
        Authorization: authHeader,
      },
      body: JSON.stringify({ message: 'wrong wallet', walletId: walletB }),
    });

    expect(res.status).toBe(403);
    const body = await json(res);
    expect(body.code).toBe('WALLET_ACCESS_DENIED');
  });

  // Test 12: nonexistent wallet ID -> WALLET_NOT_FOUND
  it('should return 404 when wallet does not exist', async () => {
    const sessionId = generateId();
    const now = Math.floor(Date.now() / 1000);
    const fakeWalletId = generateId();

    conn.sqlite
      .prepare(
        `INSERT INTO sessions (id, token_hash, expires_at, absolute_expires_at, created_at)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .run(sessionId, `hash-${sessionId}`, now + 86400, now + 86400 * 30, now);

    // Temporarily disable FK to insert a session_wallet with non-existent wallet
    conn.sqlite.pragma('foreign_keys = OFF');
    conn.sqlite
      .prepare(`INSERT INTO session_wallets (session_id, wallet_id, created_at) VALUES (?, ?, ?)`)
      .run(sessionId, fakeWalletId, now);
    conn.sqlite.pragma('foreign_keys = ON');

    const payload: JwtPayload = { sub: sessionId, iat: now, exp: now + 3600 };
    const token = await jwtSecretManager.signToken(payload);

    const res = await app.request('/v1/transactions/sign-message', {
      method: 'POST',
      headers: {
        Host: HOST,
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ message: 'ghost wallet', walletId: fakeWalletId }),
    });

    expect(res.status).toBe(404);
    const body = await json(res);
    expect(body.code).toBe('WALLET_NOT_FOUND');
  });

  // Test 13: terminated wallet -> WALLET_TERMINATED (410 Gone)
  it('should return 410 when wallet is terminated', async () => {
    const walletId = createTestWallet('evm');
    // Terminate the wallet
    conn.sqlite
      .prepare(`UPDATE wallets SET status = 'TERMINATED' WHERE id = ?`)
      .run(walletId);
    const authHeader = await createSessionToken(walletId);

    const res = await app.request('/v1/transactions/sign-message', {
      method: 'POST',
      headers: {
        Host: HOST,
        'Content-Type': 'application/json',
        Authorization: authHeader,
      },
      body: JSON.stringify({ message: 'terminated wallet' }),
    });

    expect(res.status).toBe(410);
    const body = await json(res);
    expect(body.code).toBe('WALLET_TERMINATED');
  });

  // Test 14: multi-wallet session with explicit walletId
  it('should resolve correct wallet when multi-wallet session specifies walletId', async () => {
    const walletA = createSignableWallet();
    const walletB = createTestWallet('evm');

    // Create a session linked to both wallets
    const sessionId = generateId();
    const now = Math.floor(Date.now() / 1000);
    conn.sqlite
      .prepare(
        `INSERT INTO sessions (id, token_hash, expires_at, absolute_expires_at, created_at)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .run(sessionId, `hash-${sessionId}`, now + 86400, now + 86400 * 30, now);
    conn.sqlite
      .prepare(`INSERT INTO session_wallets (session_id, wallet_id, created_at) VALUES (?, ?, ?)`)
      .run(sessionId, walletA, now);
    conn.sqlite
      .prepare(`INSERT INTO session_wallets (session_id, wallet_id, created_at) VALUES (?, ?, ?)`)
      .run(sessionId, walletB, now);

    const payload: JwtPayload = { sub: sessionId, iat: now, exp: now + 3600 };
    const token = await jwtSecretManager.signToken(payload);

    const res = await app.request('/v1/transactions/sign-message', {
      method: 'POST',
      headers: {
        Host: HOST,
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ message: 'multi-wallet test', walletId: walletA }),
    });

    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.signature).toBeDefined();

    // Verify the DB record is for walletA
    const row = conn.sqlite
      .prepare('SELECT wallet_id FROM transactions WHERE id = ?')
      .get(body.id as string) as { wallet_id: string } | undefined;
    expect(row).toBeDefined();
    expect(row!.wallet_id).toBe(walletA);
  });

  // Test 15: multi-wallet session without walletId -> WALLET_ID_REQUIRED
  it('should return 400 when multi-wallet session omits walletId', async () => {
    const walletA = createSignableWallet();
    const walletB = createTestWallet('evm');

    const sessionId = generateId();
    const now = Math.floor(Date.now() / 1000);
    conn.sqlite
      .prepare(
        `INSERT INTO sessions (id, token_hash, expires_at, absolute_expires_at, created_at)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .run(sessionId, `hash-${sessionId}`, now + 86400, now + 86400 * 30, now);
    conn.sqlite
      .prepare(`INSERT INTO session_wallets (session_id, wallet_id, created_at) VALUES (?, ?, ?)`)
      .run(sessionId, walletA, now);
    conn.sqlite
      .prepare(`INSERT INTO session_wallets (session_id, wallet_id, created_at) VALUES (?, ?, ?)`)
      .run(sessionId, walletB, now);

    const payload: JwtPayload = { sub: sessionId, iat: now, exp: now + 3600 };
    const token = await jwtSecretManager.signToken(payload);

    const res = await app.request('/v1/transactions/sign-message', {
      method: 'POST',
      headers: {
        Host: HOST,
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ message: 'no walletId' }),
    });

    expect(res.status).toBe(400);
    const body = await json(res);
    expect(body.code).toBe('WALLET_ID_REQUIRED');
  });

  // Test 16: EventBus.emit('wallet:activity') called on successful sign
  it('should emit wallet:activity event on successful sign', async () => {
    const eventBus = new EventBus();
    const activityEvents: unknown[] = [];
    eventBus.on('wallet:activity', (data) => activityEvents.push(data));

    // Re-create app with eventBus injected
    const masterPasswordHash = await argon2.hash(TEST_MASTER_PASSWORD, {
      type: argon2.argon2id, memoryCost: 4096, timeCost: 2, parallelism: 1,
    });
    const appWithEvents = createApp({
      db: conn.db,
      sqlite: conn.sqlite,
      keyStore: mockKeyStore(),
      masterPassword: TEST_MASTER_PASSWORD,
      masterPasswordHash,
      config: mockConfig(),
      adapterPool: mockAdapterPool(),
      policyEngine,
      jwtSecretManager,
      eventBus,
    });

    const walletId = createSignableWallet();
    const authHeader = await createSessionToken(walletId);

    const res = await appWithEvents.request('/v1/transactions/sign-message', {
      method: 'POST',
      headers: {
        Host: HOST,
        'Content-Type': 'application/json',
        Authorization: authHeader,
      },
      body: JSON.stringify({ message: 'event test' }),
    });

    expect(res.status).toBe(200);
    expect(activityEvents.length).toBe(1);
    const evt = activityEvents[0] as Record<string, unknown>;
    expect(evt.walletId).toBe(walletId);
    expect(evt.activity).toBe('TX_SUBMITTED');
    expect((evt.details as Record<string, unknown>).signMessage).toBe(true);
  });

  // Test 17: key decryption failure -> CHAIN_ERROR with FAILED DB record
  it('should return 502 CHAIN_ERROR when key decryption fails', async () => {
    const failingKeyStore = {
      generateKeyPair: async () => ({
        publicKey: EVM_PUBLIC_KEY,
        encryptedPrivateKey: new Uint8Array(64),
      }),
      decryptPrivateKey: async () => { throw new Error('Decryption failed: corrupted key'); },
      releaseKey: vi.fn(),
      hasKey: async () => true,
      deleteKey: async () => {},
      lockAll: () => {},
      sodiumAvailable: true,
    } as unknown as LocalKeyStore;

    const masterPasswordHash = await argon2.hash(TEST_MASTER_PASSWORD, {
      type: argon2.argon2id, memoryCost: 4096, timeCost: 2, parallelism: 1,
    });
    const appWithFailingKey = createApp({
      db: conn.db,
      sqlite: conn.sqlite,
      keyStore: failingKeyStore,
      masterPassword: TEST_MASTER_PASSWORD,
      masterPasswordHash,
      config: mockConfig(),
      adapterPool: mockAdapterPool(),
      policyEngine,
      jwtSecretManager,
    });

    const walletId = createSignableWallet();
    const authHeader = await createSessionToken(walletId);

    const res = await appWithFailingKey.request('/v1/transactions/sign-message', {
      method: 'POST',
      headers: {
        Host: HOST,
        'Content-Type': 'application/json',
        Authorization: authHeader,
      },
      body: JSON.stringify({ message: 'key failure test' }),
    });

    expect(res.status).toBe(502);
    const body = await json(res);
    expect(body.code).toBe('CHAIN_ERROR');

    // Verify DB record is FAILED
    const rows = conn.sqlite
      .prepare("SELECT status, error FROM transactions WHERE wallet_id = ? AND type = 'SIGN'")
      .all(walletId) as Array<{ status: string; error: string | null }>;
    expect(rows.length).toBeGreaterThanOrEqual(1);
    const failedRow = rows.find((r) => r.status === 'FAILED');
    expect(failedRow).toBeDefined();
    expect(failedRow!.error).toContain('Decryption failed');
  });

  // Test 18: empty message string -> 400 (Zod validation rejects empty string)
  it('should return 400 for empty message string', async () => {
    const walletId = createSignableWallet();
    const authHeader = await createSessionToken(walletId);

    const res = await app.request('/v1/transactions/sign-message', {
      method: 'POST',
      headers: {
        Host: HOST,
        'Content-Type': 'application/json',
        Authorization: authHeader,
      },
      body: JSON.stringify({ message: '', signType: 'personal' }),
    });

    expect(res.status).toBe(400);
  });

  // Test 19: complex nested EIP-712 typed data (struct within struct)
  it('should sign complex nested EIP-712 typed data with struct references', async () => {
    const walletId = createSignableWallet();
    const authHeader = await createSessionToken(walletId);

    const res = await app.request('/v1/transactions/sign-message', {
      method: 'POST',
      headers: {
        Host: HOST,
        'Content-Type': 'application/json',
        Authorization: authHeader,
      },
      body: JSON.stringify({
        signType: 'typedData',
        typedData: {
          domain: {
            name: 'Permit2',
            version: '1',
            chainId: 1,
            verifyingContract: '0x000000000022d473030f116ddee9f6b43ac78ba3',
          },
          types: {
            TokenPermissions: [
              { name: 'token', type: 'address' },
              { name: 'amount', type: 'uint256' },
            ],
            PermitTransferFrom: [
              { name: 'permitted', type: 'TokenPermissions' },
              { name: 'spender', type: 'address' },
              { name: 'nonce', type: 'uint256' },
              { name: 'deadline', type: 'uint256' },
            ],
          },
          primaryType: 'PermitTransferFrom',
          message: {
            permitted: {
              token: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
              amount: '1000000',
            },
            spender: '0xabcdef1234567890abcdef1234567890abcdef12',
            nonce: '0',
            deadline: '1893456000',
          },
        },
      }),
    });

    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.signature).toBeDefined();
    expect(typeof body.signature).toBe('string');
    expect((body.signature as string).startsWith('0x')).toBe(true);
    expect(body.signType).toBe('typedData');
  });

  // Test 20: GET /v1/transactions shows SIGN type record after signing
  it('should list SIGN record in GET /v1/transactions after signing', async () => {
    const walletId = createSignableWallet();
    const authHeader = await createSessionToken(walletId);

    // Sign a message first
    const signRes = await app.request('/v1/transactions/sign-message', {
      method: 'POST',
      headers: {
        Host: HOST,
        'Content-Type': 'application/json',
        Authorization: authHeader,
      },
      body: JSON.stringify({ message: 'list test' }),
    });
    expect(signRes.status).toBe(200);
    const signBody = await json(signRes);
    const txId = signBody.id as string;

    // List transactions
    const listRes = await app.request('/v1/transactions', {
      method: 'GET',
      headers: {
        Host: HOST,
        Authorization: authHeader,
      },
    });
    expect(listRes.status).toBe(200);
    const listBody = await json(listRes);
    const items = listBody.items as Array<Record<string, unknown>>;
    expect(items).toBeDefined();
    const signRecord = items.find((tx) => tx.id === txId);
    expect(signRecord).toBeDefined();
    expect(signRecord!.type).toBe('SIGN');
    expect(signRecord!.status).toBe('SIGNED');
  });

  // Test 21: session_id recorded in transaction DB record
  it('should record session_id in transaction DB record', async () => {
    const walletId = createSignableWallet();
    const authHeader = await createSessionToken(walletId);

    const res = await app.request('/v1/transactions/sign-message', {
      method: 'POST',
      headers: {
        Host: HOST,
        'Content-Type': 'application/json',
        Authorization: authHeader,
      },
      body: JSON.stringify({ message: 'session id test' }),
    });

    expect(res.status).toBe(200);
    const body = await json(res);
    const txId = body.id as string;

    const row = conn.sqlite
      .prepare('SELECT session_id FROM transactions WHERE id = ?')
      .get(txId) as { session_id: string | null } | undefined;
    expect(row).toBeDefined();
    expect(row!.session_id).toBeTruthy();
    expect(typeof row!.session_id).toBe('string');
  });

  // Test 22: Bearer token without wai_sess_ prefix -> INVALID_TOKEN
  it('should return 401 when token lacks wai_sess_ prefix', async () => {
    const res = await app.request('/v1/transactions/sign-message', {
      method: 'POST',
      headers: {
        Host: HOST,
        'Content-Type': 'application/json',
        Authorization: 'Bearer some-random-jwt-token',
      },
      body: JSON.stringify({ message: 'no prefix' }),
    });

    expect(res.status).toBe(401);
    const body = await json(res);
    expect(body.code).toBe('INVALID_TOKEN');
  });

  // Test 23: invalid signType value -> 400
  it('should return 400 for invalid signType value', async () => {
    const walletId = createSignableWallet();
    const authHeader = await createSessionToken(walletId);

    const res = await app.request('/v1/transactions/sign-message', {
      method: 'POST',
      headers: {
        Host: HOST,
        'Content-Type': 'application/json',
        Authorization: authHeader,
      },
      body: JSON.stringify({ message: 'bad type', signType: 'unsupported' }),
    });

    expect(res.status).toBe(400);
  });
});
