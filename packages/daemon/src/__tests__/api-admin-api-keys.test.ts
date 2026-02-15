/**
 * Tests for Admin API Keys endpoints:
 *
 * GET    /v1/admin/api-keys              (masterAuth) - List provider API key status
 * PUT    /v1/admin/api-keys/:provider    (masterAuth) - Set or update API key
 * DELETE /v1/admin/api-keys/:provider    (masterAuth) - Delete API key
 *
 * Uses in-memory SQLite + mock IActionProvider + Hono app.request().
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import argon2 from 'argon2';
import { createApp } from '../api/server.js';
import { createDatabase, pushSchema } from '../infrastructure/database/index.js';
import { ApiKeyStore } from '../infrastructure/action/api-key-store.js';
import { ActionProviderRegistry } from '../infrastructure/action/action-provider-registry.js';
import type { DatabaseConnection } from '../infrastructure/database/index.js';
import type { DaemonConfig } from '../infrastructure/config/loader.js';
import type { IActionProvider, ActionDefinition, ContractCallRequest, ActionContext } from '@waiaas/core';
import type { OpenAPIHono } from '@hono/zod-openapi';
import { z } from 'zod';

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
      session_ttl: 86400, jwt_secret: '', max_sessions_per_wallet: 5, max_pending_tx: 10,
      nonce_storage: 'memory' as const, nonce_cache_max: 1000, nonce_cache_ttl: 300,
      rate_limit_global_ip_rpm: 1000, rate_limit_session_rpm: 300, rate_limit_tx_rpm: 10,
      cors_origins: ['http://localhost:3100'], auto_stop_consecutive_failures_threshold: 3,
      policy_defaults_delay_seconds: 300, policy_defaults_approval_timeout: 3600,
      kill_switch_recovery_cooldown: 1800, kill_switch_max_recovery_attempts: 3,
    },
    walletconnect: { project_id: '' },
  };
}

/** Create a mock IActionProvider for testing. */
function createMockProvider(opts: {
  name: string;
  requiresApiKey: boolean;
}): IActionProvider {
  const inputSchema = z.object({ amount: z.number() });
  const action: ActionDefinition = {
    name: `${opts.name}_action`,
    description: `Test action for ${opts.name} provider with mock`,
    chain: 'solana',
    inputSchema,
    riskLevel: 'low',
    defaultTier: 'INSTANT',
  };

  return {
    metadata: {
      name: opts.name,
      description: `Mock provider ${opts.name} for testing`,
      version: '1.0.0',
      chains: ['solana'],
      mcpExpose: false,
      requiresApiKey: opts.requiresApiKey,
      requiredApis: [],
    },
    actions: [action],
    resolve: async (
      _actionName: string,
      _params: Record<string, unknown>,
      _context: ActionContext,
    ): Promise<ContractCallRequest> => {
      return {
        type: 'CONTRACT_CALL',
        contractAddress: '0x0000000000000000000000000000000000000001',
        method: 'test()',
        args: [],
        value: '0',
      } as ContractCallRequest;
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
    type: argon2.argon2id, memoryCost: 4096, timeCost: 2, parallelism: 1,
  });

  const apiKeyStore = new ApiKeyStore(conn.db, TEST_MASTER_PASSWORD);
  const registry = new ActionProviderRegistry();

  // Register two mock providers: one requiring API key, one not
  registry.register(createMockProvider({ name: 'test_provider', requiresApiKey: true }));
  registry.register(createMockProvider({ name: 'free_provider', requiresApiKey: false }));

  app = createApp({
    db: conn.db, sqlite: conn.sqlite,
    masterPassword: TEST_MASTER_PASSWORD, masterPasswordHash,
    config: mockConfig(),
    apiKeyStore,
    actionProviderRegistry: registry,
  });
});

afterEach(() => {
  conn.sqlite.close();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Admin API Keys endpoints', () => {
  it('GET /v1/admin/api-keys -- returns provider list with hasKey status (200)', async () => {
    const res = await app.request('/v1/admin/api-keys', {
      method: 'GET',
      headers: { Host: HOST, 'X-Master-Password': TEST_MASTER_PASSWORD },
    });

    expect(res.status).toBe(200);
    const body = await json(res);
    const keys = body.keys as Array<{
      providerName: string;
      hasKey: boolean;
      maskedKey: string | null;
      requiresApiKey: boolean;
      updatedAt: string | null;
    }>;

    expect(keys).toHaveLength(2);
    const testProvider = keys.find((k) => k.providerName === 'test_provider');
    const freeProvider = keys.find((k) => k.providerName === 'free_provider');

    expect(testProvider).toBeDefined();
    expect(testProvider!.hasKey).toBe(false);
    expect(testProvider!.maskedKey).toBeNull();
    expect(testProvider!.requiresApiKey).toBe(true);
    expect(testProvider!.updatedAt).toBeNull();

    expect(freeProvider).toBeDefined();
    expect(freeProvider!.hasKey).toBe(false);
    expect(freeProvider!.requiresApiKey).toBe(false);
  });

  it('PUT /v1/admin/api-keys/test_provider -- sets API key (200)', async () => {
    const res = await app.request('/v1/admin/api-keys/test_provider', {
      method: 'PUT',
      headers: {
        Host: HOST,
        'Content-Type': 'application/json',
        'X-Master-Password': TEST_MASTER_PASSWORD,
      },
      body: JSON.stringify({ apiKey: 'sk-test-key-12345678' }),
    });

    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.success).toBe(true);
    expect(body.providerName).toBe('test_provider');
  });

  it('GET /v1/admin/api-keys -- after set, hasKey=true and maskedKey present', async () => {
    // Set key first
    await app.request('/v1/admin/api-keys/test_provider', {
      method: 'PUT',
      headers: {
        Host: HOST,
        'Content-Type': 'application/json',
        'X-Master-Password': TEST_MASTER_PASSWORD,
      },
      body: JSON.stringify({ apiKey: 'sk-test-key-12345678' }),
    });

    // List
    const res = await app.request('/v1/admin/api-keys', {
      method: 'GET',
      headers: { Host: HOST, 'X-Master-Password': TEST_MASTER_PASSWORD },
    });

    expect(res.status).toBe(200);
    const body = await json(res);
    const keys = body.keys as Array<{
      providerName: string;
      hasKey: boolean;
      maskedKey: string | null;
      updatedAt: string | null;
    }>;
    const testProvider = keys.find((k) => k.providerName === 'test_provider');

    expect(testProvider!.hasKey).toBe(true);
    expect(testProvider!.maskedKey).toBeTruthy();
    expect(testProvider!.maskedKey).toContain('...');
    expect(testProvider!.updatedAt).toBeTruthy();
  });

  it('PUT /v1/admin/api-keys/test_provider -- updates existing key (200)', async () => {
    // Set initial key
    await app.request('/v1/admin/api-keys/test_provider', {
      method: 'PUT',
      headers: {
        Host: HOST,
        'Content-Type': 'application/json',
        'X-Master-Password': TEST_MASTER_PASSWORD,
      },
      body: JSON.stringify({ apiKey: 'sk-old-key-111111' }),
    });

    // Update
    const res = await app.request('/v1/admin/api-keys/test_provider', {
      method: 'PUT',
      headers: {
        Host: HOST,
        'Content-Type': 'application/json',
        'X-Master-Password': TEST_MASTER_PASSWORD,
      },
      body: JSON.stringify({ apiKey: 'sk-new-key-222222' }),
    });

    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.success).toBe(true);
  });

  it('DELETE /v1/admin/api-keys/test_provider -- deletes key (200)', async () => {
    // Set key first
    await app.request('/v1/admin/api-keys/test_provider', {
      method: 'PUT',
      headers: {
        Host: HOST,
        'Content-Type': 'application/json',
        'X-Master-Password': TEST_MASTER_PASSWORD,
      },
      body: JSON.stringify({ apiKey: 'sk-to-delete' }),
    });

    // Delete
    const res = await app.request('/v1/admin/api-keys/test_provider', {
      method: 'DELETE',
      headers: { Host: HOST, 'X-Master-Password': TEST_MASTER_PASSWORD },
    });

    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.success).toBe(true);
  });

  it('DELETE /v1/admin/api-keys/nonexistent -- returns 404', async () => {
    const res = await app.request('/v1/admin/api-keys/nonexistent', {
      method: 'DELETE',
      headers: { Host: HOST, 'X-Master-Password': TEST_MASTER_PASSWORD },
    });

    expect(res.status).toBe(404);
    const body = await json(res);
    expect(body.code).toBe('ACTION_NOT_FOUND');
  });

  it('GET /v1/admin/api-keys -- after delete, hasKey=false', async () => {
    // Set key, then delete
    await app.request('/v1/admin/api-keys/test_provider', {
      method: 'PUT',
      headers: {
        Host: HOST,
        'Content-Type': 'application/json',
        'X-Master-Password': TEST_MASTER_PASSWORD,
      },
      body: JSON.stringify({ apiKey: 'sk-temp-key' }),
    });
    await app.request('/v1/admin/api-keys/test_provider', {
      method: 'DELETE',
      headers: { Host: HOST, 'X-Master-Password': TEST_MASTER_PASSWORD },
    });

    // Verify
    const res = await app.request('/v1/admin/api-keys', {
      method: 'GET',
      headers: { Host: HOST, 'X-Master-Password': TEST_MASTER_PASSWORD },
    });

    expect(res.status).toBe(200);
    const body = await json(res);
    const keys = body.keys as Array<{
      providerName: string;
      hasKey: boolean;
      maskedKey: string | null;
    }>;
    const testProvider = keys.find((k) => k.providerName === 'test_provider');
    expect(testProvider!.hasKey).toBe(false);
    expect(testProvider!.maskedKey).toBeNull();
  });

  it('GET /v1/admin/api-keys -- returns 401 without masterAuth', async () => {
    const res = await app.request('/v1/admin/api-keys', {
      method: 'GET',
      headers: { Host: HOST },
    });

    expect(res.status).toBe(401);
  });

  it('PUT /v1/admin/api-keys/test -- returns 401 without masterAuth', async () => {
    const res = await app.request('/v1/admin/api-keys/test', {
      method: 'PUT',
      headers: {
        Host: HOST,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ apiKey: 'sk-test' }),
    });

    expect(res.status).toBe(401);
  });

  it('DELETE /v1/admin/api-keys/test -- returns 401 without masterAuth', async () => {
    const res = await app.request('/v1/admin/api-keys/test', {
      method: 'DELETE',
      headers: { Host: HOST },
    });

    expect(res.status).toBe(401);
  });
});
