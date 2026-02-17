/**
 * Integration tests for POST /v1/mcp/tokens -- MCP token provisioning endpoint.
 *
 * Tests:
 * 1. Happy path: valid walletId returns 201 with all expected fields
 * 2. Token file is written at expected path with valid JWT content
 * 3. Without masterAuth returns 401
 * 4. Invalid walletId returns 404
 * 5. Session is created in DB
 * 6. Custom expiresIn is respected
 *
 * @see packages/daemon/src/api/routes/mcp.ts
 * @see objectives/bug-reports/v1.4.1-BUG-013-admin-mcp-token-provisioning.md
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFileSync, existsSync, rmSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import argon2 from 'argon2';
import { createApp } from '../api/server.js';
import { createDatabase, pushSchema } from '../infrastructure/database/index.js';
import { JwtSecretManager } from '../infrastructure/jwt/index.js';
import { sessions } from '../infrastructure/database/schema.js';
import { eq } from 'drizzle-orm';
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

function masterHeaders(extra?: Record<string, string>) {
  return {
    Host: HOST,
    'Content-Type': 'application/json',
    'X-Master-Password': TEST_MASTER_PASSWORD,
    ...extra,
  };
}

function createMockKeyStore() {
  return {
    generateKeyPair: async () => ({
      publicKey: '0x71C7656EC7ab88b098defB751B7401B5f6d8976F',
      encryptedPrivateKey: new Uint8Array(64),
    }),
    decryptPrivateKey: async () => new Uint8Array(64).fill(42),
    releaseKey: () => {},
    hasKey: async () => true,
    deleteKey: async () => {},
    lockAll: () => {},
    sodiumAvailable: true,
  } as any;
}

// ===========================================================================
// MCP Token Provisioning Integration Tests
// ===========================================================================

describe('POST /v1/mcp/tokens', () => {
  let conn: DatabaseConnection;
  let app: OpenAPIHono;
  let tmpDir: string;

  beforeEach(async () => {
    // Create unique temp directory for each test
    tmpDir = join(tmpdir(), `waiaas-test-${randomUUID().slice(0, 8)}`);
    mkdirSync(tmpDir, { recursive: true });

    conn = createDatabase(':memory:');
    pushSchema(conn.sqlite);

    const masterPasswordHash = await argon2.hash(TEST_MASTER_PASSWORD, {
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
      masterPasswordHash,
      masterPassword: TEST_MASTER_PASSWORD,
      config: mockConfig(),
      jwtSecretManager,
      keyStore: createMockKeyStore(),
      dataDir: tmpDir,
    });
  });

  afterEach(() => {
    conn.sqlite.close();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  /**
   * Helper: create a wallet and return its ID.
   */
  async function createWallet(name = 'test-wallet'): Promise<string> {
    const res = await app.request('/v1/wallets', {
      method: 'POST',
      headers: masterHeaders(),
      body: JSON.stringify({
        name,
        chain: 'ethereum',
        network: 'ethereum-sepolia',
        createSession: false,
      }),
    });
    expect(res.status).toBe(201);
    const body = await json(res);
    return body.id as string;
  }

  // -------------------------------------------------------------------------
  // 1. Happy path: valid walletId returns 201 with all expected fields
  // -------------------------------------------------------------------------
  it('POST /v1/mcp/tokens with valid walletId returns 201 with all expected fields', async () => {
    const walletId = await createWallet('my-trading-bot');

    const res = await app.request('/v1/mcp/tokens', {
      method: 'POST',
      headers: masterHeaders(),
      body: JSON.stringify({ walletId }),
    });

    expect(res.status).toBe(201);
    const body = await json(res);

    // Verify all expected response fields
    expect(body.walletId).toBe(walletId);
    expect(body.walletName).toBe('my-trading-bot');
    expect(typeof body.tokenPath).toBe('string');
    expect(typeof body.expiresAt).toBe('number');
    expect(body.claudeDesktopConfig).toBeDefined();

    // Verify claudeDesktopConfig structure
    const config = body.claudeDesktopConfig as Record<string, Record<string, unknown>>;
    const key = Object.keys(config)[0];
    expect(key).toBe('waiaas-my-trading-bot');

    const entry = config[key!]!;
    expect(entry.command).toBe('npx');
    expect(entry.args).toEqual(['@waiaas/mcp']);

    const env = entry.env as Record<string, string>;
    expect(env.WAIAAS_DATA_DIR).toBe(tmpDir);
    expect(env.WAIAAS_BASE_URL).toBe('http://127.0.0.1:3100');
    expect(env.WAIAAS_WALLET_ID).toBe(walletId);
    expect(env.WAIAAS_WALLET_NAME).toBe('my-trading-bot');
  });

  // -------------------------------------------------------------------------
  // 2. Token file is written at expected path with valid JWT
  // -------------------------------------------------------------------------
  it('POST /v1/mcp/tokens writes token file at expected path', async () => {
    const walletId = await createWallet();

    const res = await app.request('/v1/mcp/tokens', {
      method: 'POST',
      headers: masterHeaders(),
      body: JSON.stringify({ walletId }),
    });

    expect(res.status).toBe(201);

    // Verify token file exists
    const tokenPath = join(tmpDir, 'mcp-tokens', walletId);
    expect(existsSync(tokenPath)).toBe(true);

    // Verify content is a valid JWT (3 dot-separated parts)
    const fileContent = readFileSync(tokenPath, 'utf-8');
    const parts = fileContent.split('.');
    expect(parts.length).toBe(3);

    // Verify tmp file is cleaned up
    expect(existsSync(`${tokenPath}.tmp`)).toBe(false);
  });

  // -------------------------------------------------------------------------
  // 3. Without masterAuth returns 401
  // -------------------------------------------------------------------------
  it('POST /v1/mcp/tokens without masterAuth returns 401', async () => {
    const res = await app.request('/v1/mcp/tokens', {
      method: 'POST',
      headers: {
        Host: HOST,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ walletId: randomUUID() }),
    });

    expect(res.status).toBe(401);
  });

  // -------------------------------------------------------------------------
  // 4. Invalid walletId returns 404 WALLET_NOT_FOUND
  // -------------------------------------------------------------------------
  it('POST /v1/mcp/tokens with invalid walletId returns 404', async () => {
    const res = await app.request('/v1/mcp/tokens', {
      method: 'POST',
      headers: masterHeaders(),
      body: JSON.stringify({ walletId: randomUUID() }),
    });

    expect(res.status).toBe(404);
    const body = await json(res);
    expect(body.code).toBe('WALLET_NOT_FOUND');
  });

  // -------------------------------------------------------------------------
  // 5. Creates a session in DB
  // -------------------------------------------------------------------------
  it('POST /v1/mcp/tokens creates a session in DB', async () => {
    const walletId = await createWallet();

    const res = await app.request('/v1/mcp/tokens', {
      method: 'POST',
      headers: masterHeaders(),
      body: JSON.stringify({ walletId }),
    });

    expect(res.status).toBe(201);

    // Query sessions table for this wallet
    const walletSessions = conn.db
      .select()
      .from(sessions)
      .where(eq(sessions.walletId, walletId))
      .all();

    expect(walletSessions.length).toBe(1);
    expect(walletSessions[0]!.walletId).toBe(walletId);
    expect(walletSessions[0]!.tokenHash).toBeTruthy();
    expect(walletSessions[0]!.renewalCount).toBe(0);
  });

  // -------------------------------------------------------------------------
  // 6. Custom expiresIn is respected
  // -------------------------------------------------------------------------
  it('POST /v1/mcp/tokens respects custom expiresIn', async () => {
    const walletId = await createWallet();

    const customTtl = 3600; // 1 hour
    const res = await app.request('/v1/mcp/tokens', {
      method: 'POST',
      headers: masterHeaders(),
      body: JSON.stringify({ walletId, expiresIn: customTtl }),
    });

    expect(res.status).toBe(201);
    const body = await json(res);

    // expiresAt should be approximately now + customTtl (within 5 seconds tolerance)
    const nowSec = Math.floor(Date.now() / 1000);
    const expectedExpiresAt = nowSec + customTtl;
    expect(Math.abs((body.expiresAt as number) - expectedExpiresAt)).toBeLessThan(5);
  });
});
