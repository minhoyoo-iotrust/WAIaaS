/**
 * 5-Type Transaction Pipeline E2E + MCP/SDK Integration Tests.
 *
 * Tests cover:
 * - Suite 1: 5-type transaction full pipeline E2E (TRANSFER/TOKEN_TRANSFER/CONTRACT_CALL/APPROVE/BATCH)
 *   - Each type flows through stage1-6 and reaches CONFIRMED in DB
 *   - Correct adapter method dispatched per type via vi.fn() spies
 * - Suite 2: MCP send_token type/token parameter passing
 * - Suite 3: SDK sendToken 5-type parameter support
 *
 * Uses Hono createApp() with full deps: db, jwtSecretManager, masterPasswordHash,
 * config, policyEngine, adapterPool, keyStore + mock IChainAdapter with vi.fn() build spies.
 */

import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import argon2 from 'argon2';
import { createDatabase, pushSchema, generateId } from '../infrastructure/database/index.js';
import { JwtSecretManager, type JwtPayload } from '../infrastructure/jwt/index.js';
import { DaemonConfigSchema } from '../infrastructure/config/loader.js';
import { createApp } from '../api/server.js';
import { DefaultPolicyEngine } from '../pipeline/default-policy-engine.js';
import type {
  IChainAdapter,
  BalanceInfo,
  HealthInfo,
  UnsignedTransaction,
  SimulationResult,
  SubmitResult,
} from '@waiaas/core';
import type { AdapterPool } from '../infrastructure/adapter-pool.js';
import type { DatabaseConnection } from '../infrastructure/database/index.js';
import type { DaemonConfig } from '../infrastructure/config/loader.js';
import type { LocalKeyStore } from '../infrastructure/keystore/keystore.js';
import type { OpenAPIHono } from '@hono/zod-openapi';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ApiClient, ApiResult } from '../../../mcp/src/api-client.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TEST_PASSWORD = 'test-master-password-e2e';
const HOST = '127.0.0.1:3100';
let passwordHash: string;

// ---------------------------------------------------------------------------
// Config helper
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Mock helpers
// ---------------------------------------------------------------------------

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

/** Create a mock adapter with vi.fn() spies for all 5 build methods. */
function mockAdapter5Type(): IChainAdapter {
  const unsignedTx: UnsignedTransaction = {
    chain: 'solana',
    serialized: new Uint8Array(128),
    estimatedFee: 5000n,
    metadata: {},
  };
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
    buildTransaction: vi.fn().mockResolvedValue(unsignedTx),
    buildTokenTransfer: vi.fn().mockResolvedValue(unsignedTx),
    buildContractCall: vi.fn().mockResolvedValue(unsignedTx),
    buildApprove: vi.fn().mockResolvedValue(unsignedTx),
    buildBatch: vi.fn().mockResolvedValue(unsignedTx),
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
    getTokenInfo: async () => ({
      symbol: 'USDC',
      decimals: 6,
      name: 'USD Coin',
    }),
    getTransactionFee: async () => { throw new Error('not implemented'); },
    getCurrentNonce: async () => 0,
    sweepAll: async () => { throw new Error('not implemented'); },
  };
}

/** Create a mock AdapterPool that resolves to the provided adapter. */
function mockAdapterPool(adapter: IChainAdapter): AdapterPool {
  return {
    resolve: vi.fn().mockResolvedValue(adapter),
    disconnectAll: vi.fn().mockResolvedValue(undefined),
    get size() { return 0; },
  } as unknown as AdapterPool;
}

// ---------------------------------------------------------------------------
// JSON / Auth helpers
// ---------------------------------------------------------------------------

async function json(res: Response): Promise<Record<string, unknown>> {
  return (await res.json()) as Record<string, unknown>;
}

function masterAuthJsonHeaders(): Record<string, string> {
  return {
    Host: HOST,
    'X-Master-Password': TEST_PASSWORD,
    'Content-Type': 'application/json',
  };
}

// ---------------------------------------------------------------------------
// Test setup
// ---------------------------------------------------------------------------

let conn: DatabaseConnection;
let jwtSecretManager: JwtSecretManager;
let adapter: IChainAdapter;
let app: OpenAPIHono;

beforeAll(async () => {
  passwordHash = await argon2.hash(TEST_PASSWORD, {
    type: argon2.argon2id,
    memoryCost: 4096,
    timeCost: 2,
    parallelism: 1,
  });
});

beforeEach(async () => {
  conn = createDatabase(':memory:');
  pushSchema(conn.sqlite);

  jwtSecretManager = new JwtSecretManager(conn.db);
  await jwtSecretManager.initialize();

  adapter = mockAdapter5Type();

  app = createApp({
    db: conn.db,
    sqlite: conn.sqlite,
    keyStore: mockKeyStore(),
    masterPassword: TEST_PASSWORD,
    masterPasswordHash: passwordHash,
    config: mockConfig(),
    adapterPool: mockAdapterPool(adapter),
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

/** Create an agent via POST /v1/agents (masterAuth) and return its ID. */
async function createTestAgent(): Promise<string> {
  const res = await app.request('/v1/agents', {
    method: 'POST',
    headers: masterAuthJsonHeaders(),
    body: JSON.stringify({ name: 'pipeline-5type-test-agent' }),
  });
  const body = await json(res);
  return body.id as string;
}

/** Create a session for the given agent and return Bearer token string. */
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

/**
 * Helper: wait for the fire-and-forget pipeline to complete and check DB status.
 * The mock adapter resolves instantly so pipeline should finish within ~50ms.
 */
async function waitForPipeline(
  txId: string,
  expectedStatus: string,
  maxWaitMs = 2000,
): Promise<{ status: string; type: string }> {
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    const row = conn.sqlite
      .prepare('SELECT status, type FROM transactions WHERE id = ?')
      .get(txId) as { status: string; type: string } | undefined;
    if (row && row.status === expectedStatus) {
      return row;
    }
    await new Promise((r) => setTimeout(r, 50));
  }
  // Return whatever we got (test will assert)
  const finalRow = conn.sqlite
    .prepare('SELECT status, type FROM transactions WHERE id = ?')
    .get(txId) as { status: string; type: string };
  return finalRow;
}

// ===========================================================================
// Suite 1: 5-Type Transaction Pipeline E2E (6 tests)
// ===========================================================================

describe('5-Type Transaction Pipeline E2E', () => {
  it('Legacy TRANSFER (no type field) -> calls buildTransaction', async () => {
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
    const txId = body.id as string;
    expect(txId).toBeTruthy();
    expect(body.status).toBe('PENDING');

    // Wait for pipeline to reach CONFIRMED
    const row = await waitForPipeline(txId, 'CONFIRMED');
    expect(row.status).toBe('CONFIRMED');
    expect(row.type).toBe('TRANSFER');

    // Verify buildTransaction was called (not buildTokenTransfer etc.)
    expect(adapter.buildTransaction).toHaveBeenCalled();
  });

  it('TRANSFER type -> calls buildTransaction', async () => {
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
        type: 'TRANSFER',
        to: 'Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr',
        amount: '1000000000',
      }),
    });

    expect(res.status).toBe(201);
    const body = await json(res);
    const txId = body.id as string;

    const row = await waitForPipeline(txId, 'CONFIRMED');
    expect(row.status).toBe('CONFIRMED');
    expect(row.type).toBe('TRANSFER');
    expect(adapter.buildTransaction).toHaveBeenCalled();
  });

  it('TOKEN_TRANSFER type -> calls buildTokenTransfer', async () => {
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
        type: 'TOKEN_TRANSFER',
        to: 'Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr',
        amount: '1000000',
        token: {
          address: 'So11111111111111111111111111111111111111112',
          decimals: 6,
          symbol: 'USDC',
        },
      }),
    });

    expect(res.status).toBe(201);
    const body = await json(res);
    const txId = body.id as string;

    const row = await waitForPipeline(txId, 'CONFIRMED');
    expect(row.status).toBe('CONFIRMED');
    expect(row.type).toBe('TOKEN_TRANSFER');
    expect(adapter.buildTokenTransfer).toHaveBeenCalled();
  });

  it('CONTRACT_CALL type -> calls buildContractCall', async () => {
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
        type: 'CONTRACT_CALL',
        to: '0x1234567890abcdef1234567890abcdef12345678',
        calldata: '0xabcdef12',
      }),
    });

    expect(res.status).toBe(201);
    const body = await json(res);
    const txId = body.id as string;

    const row = await waitForPipeline(txId, 'CONFIRMED');
    expect(row.status).toBe('CONFIRMED');
    expect(row.type).toBe('CONTRACT_CALL');
    expect(adapter.buildContractCall).toHaveBeenCalled();
  });

  it('APPROVE type -> calls buildApprove', async () => {
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
        type: 'APPROVE',
        spender: '0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D',
        token: {
          address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
          decimals: 18,
          symbol: 'USDC',
        },
        amount: '1000000',
      }),
    });

    expect(res.status).toBe(201);
    const body = await json(res);
    const txId = body.id as string;

    const row = await waitForPipeline(txId, 'CONFIRMED');
    expect(row.status).toBe('CONFIRMED');
    expect(row.type).toBe('APPROVE');
    expect(adapter.buildApprove).toHaveBeenCalled();
  });

  it('BATCH type -> calls buildBatch', async () => {
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
        type: 'BATCH',
        instructions: [
          { to: 'Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr', amount: '100' },
          { to: 'Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr', amount: '200' },
        ],
      }),
    });

    expect(res.status).toBe(201);
    const body = await json(res);
    const txId = body.id as string;

    const row = await waitForPipeline(txId, 'CONFIRMED');
    expect(row.status).toBe('CONFIRMED');
    expect(row.type).toBe('BATCH');
    expect(adapter.buildBatch).toHaveBeenCalled();
  });
});

// ===========================================================================
// Suite 2: MCP send_token Type Support (2 tests)
// ===========================================================================

describe('MCP send_token Type Support', () => {
  /** Mock ApiClient factory (same pattern as mcp/tools.test.ts). */
  function createMockApiClient(): ApiClient {
    const defaultOk: ApiResult<unknown> = { ok: true, data: { id: 'tx-1', status: 'PENDING' } };
    return {
      get: vi.fn(async () => defaultOk),
      post: vi.fn(async () => defaultOk),
      put: vi.fn(async () => defaultOk),
    } as unknown as ApiClient;
  }

  /** Extract tool handler by intercepting server.tool() call. */
  function getToolHandler(
    registerFn: (server: McpServer, apiClient: ApiClient) => void,
    apiClient: ApiClient,
  ): (args: Record<string, unknown>) => Promise<unknown> {
    let capturedHandler: ((args: Record<string, unknown>, extra: unknown) => Promise<unknown>) | undefined;
    const server = {
      tool: (...fnArgs: unknown[]) => {
        capturedHandler = fnArgs[fnArgs.length - 1] as typeof capturedHandler;
      },
    } as unknown as McpServer;

    registerFn(server, apiClient);

    if (!capturedHandler) throw new Error('Handler not captured');
    const handler = capturedHandler;
    return (args) => handler(args, {}) as Promise<unknown>;
  }

  it('MCP send_token with type=TRANSFER passes to API (legacy, no type field)', async () => {
    // Dynamic import to avoid circular deps
    const { registerSendToken } = await import('../../../mcp/src/tools/send-token.js');
    const apiClient = createMockApiClient();
    const handler = getToolHandler(registerSendToken, apiClient);

    await handler({ to: 'addr123', amount: '100' });

    // Without type field, body should be { to, amount } only (TRANSFER fallback)
    expect(apiClient.post).toHaveBeenCalledWith('/v1/transactions/send', {
      to: 'addr123',
      amount: '100',
    });
  });

  it('MCP send_token with type=TOKEN_TRANSFER and token', async () => {
    const { registerSendToken } = await import('../../../mcp/src/tools/send-token.js');
    const apiClient = createMockApiClient();
    const handler = getToolHandler(registerSendToken, apiClient);

    await handler({
      to: 'addr456',
      amount: '1000',
      type: 'TOKEN_TRANSFER',
      token: { address: 'mint1', decimals: 6, symbol: 'USDC' },
    });

    // Should pass type + token to API
    expect(apiClient.post).toHaveBeenCalledWith('/v1/transactions/send', {
      to: 'addr456',
      amount: '1000',
      type: 'TOKEN_TRANSFER',
      token: { address: 'mint1', decimals: 6, symbol: 'USDC' },
    });
  });
});

// ===========================================================================
// Suite 3: SDK 5-Type Support (2 tests)
// ===========================================================================

describe('SDK 5-Type Support', () => {
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  /** Create a mock JWT for SDK client initialization. */
  function createMockJwt(sessionId: string): string {
    const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
    const payload = Buffer.from(JSON.stringify({ sessionId, agentId: 'agent-1' })).toString('base64url');
    const signature = 'mock-signature';
    return `${header}.${payload}.${signature}`;
  }

  it('TS SDK sendToken with type=TOKEN_TRANSFER + token', async () => {
    const { WAIaaSClient } = await import('../../../sdk/src/client.js');
    const mockToken = createMockJwt('sess-001');
    const client = new WAIaaSClient({
      baseUrl: 'http://localhost:3000',
      sessionToken: mockToken,
    });

    fetchSpy.mockResolvedValue(
      new Response(JSON.stringify({ id: 'tx-sdk-1', status: 'PENDING' }), {
        status: 201,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    await client.sendToken({
      to: 'RecipientAddr',
      amount: '500000',
      type: 'TOKEN_TRANSFER',
      token: { address: 'mint123', decimals: 6, symbol: 'USDC' },
    });

    const opts = fetchSpy.mock.calls[0]![1] as RequestInit;
    const body = JSON.parse(opts.body as string) as Record<string, unknown>;
    expect(body.type).toBe('TOKEN_TRANSFER');
    expect(body.token).toEqual({ address: 'mint123', decimals: 6, symbol: 'USDC' });
    expect(body.to).toBe('RecipientAddr');
    expect(body.amount).toBe('500000');
  });

  it('TS SDK sendToken with legacy (no type) backward compat', async () => {
    const { WAIaaSClient } = await import('../../../sdk/src/client.js');
    const mockToken = createMockJwt('sess-002');
    const client = new WAIaaSClient({
      baseUrl: 'http://localhost:3000',
      sessionToken: mockToken,
    });

    fetchSpy.mockResolvedValue(
      new Response(JSON.stringify({ id: 'tx-sdk-2', status: 'PENDING' }), {
        status: 201,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    await client.sendToken({
      to: 'RecipientAddr',
      amount: '1000000',
    });

    const opts = fetchSpy.mock.calls[0]![1] as RequestInit;
    const body = JSON.parse(opts.body as string) as Record<string, unknown>;
    expect(body.to).toBe('RecipientAddr');
    expect(body.amount).toBe('1000000');
    // No type key should be present for backward compat
    expect(body.type).toBeUndefined();
    expect(body.token).toBeUndefined();
  });
});
