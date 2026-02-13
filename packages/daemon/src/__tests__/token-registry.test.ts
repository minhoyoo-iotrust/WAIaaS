/**
 * Tests for token registry: service unit tests + API integration tests.
 *
 * Suite 1: TokenRegistryService unit tests (in-memory SQLite).
 * Suite 2: Token registry API integration tests (Hono app.request()).
 *
 * @see packages/daemon/src/infrastructure/token-registry/token-registry-service.ts
 * @see packages/daemon/src/api/routes/tokens.ts
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import argon2 from 'argon2';
import { createApp } from '../api/server.js';
import { createDatabase, pushSchema } from '../infrastructure/database/index.js';
import { TokenRegistryService } from '../infrastructure/token-registry/index.js';
import { JwtSecretManager } from '../infrastructure/jwt/index.js';
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

function masterHeaders(extra?: Record<string, string>) {
  return {
    Host: HOST,
    'Content-Type': 'application/json',
    'X-Master-Password': TEST_MASTER_PASSWORD,
    ...extra,
  };
}

// Realistic ERC-20 token addresses for test data
const CUSTOM_TOKEN_AAVE = {
  address: '0x7Fc66500c84A76Ad7e9c93437bFc5Ac33E2DDaE9',
  symbol: 'AAVE',
  name: 'Aave Token',
  decimals: 18,
};

const CUSTOM_TOKEN_COMP = {
  address: '0xc00e94Cb662C3520282E6f5717214004A7f26888',
  symbol: 'COMP',
  name: 'Compound',
  decimals: 18,
};

const CUSTOM_TOKEN_MKR = {
  address: '0x9f8F72aA9304c8B593d555F12eF6589cC3A579A2',
  symbol: 'MKR',
  name: 'Maker',
  decimals: 18,
};

// USDC address on ethereum-mainnet (same as built-in)
const BUILTIN_USDC_ADDRESS = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';

// ===========================================================================
// Suite 1: TokenRegistryService unit tests
// ===========================================================================

describe('TokenRegistryService', () => {
  let conn: DatabaseConnection;
  let service: TokenRegistryService;

  beforeEach(() => {
    conn = createDatabase(':memory:');
    pushSchema(conn.sqlite);
    service = new TokenRegistryService(conn.db);
  });

  afterEach(() => {
    conn.sqlite.close();
  });

  // -------------------------------------------------------------------------
  // 1. getTokensForNetwork returns built-in tokens for ethereum-mainnet
  // -------------------------------------------------------------------------
  it('getTokensForNetwork returns built-in tokens for ethereum-mainnet', async () => {
    const tokens = await service.getTokensForNetwork('ethereum-mainnet');

    expect(tokens.length).toBeGreaterThanOrEqual(4);

    const symbols = tokens.map((t) => t.symbol);
    expect(symbols).toContain('USDC');
    expect(symbols).toContain('USDT');
    expect(symbols).toContain('WETH');
    expect(symbols).toContain('DAI');

    // All should have source='builtin'
    for (const t of tokens) {
      expect(t.source).toBe('builtin');
    }
  });

  // -------------------------------------------------------------------------
  // 2. getTokensForNetwork returns empty for unknown network
  // -------------------------------------------------------------------------
  it('getTokensForNetwork returns empty for unknown network', async () => {
    const tokens = await service.getTokensForNetwork('unknown-network-xyz');
    expect(tokens).toEqual([]);
  });

  // -------------------------------------------------------------------------
  // 3. addCustomToken inserts to DB
  // -------------------------------------------------------------------------
  it('addCustomToken inserts to DB', async () => {
    const result = await service.addCustomToken('ethereum-mainnet', CUSTOM_TOKEN_AAVE);
    expect(result.id).toBeTruthy();

    const tokens = await service.getTokensForNetwork('ethereum-mainnet');
    const aave = tokens.find((t) => t.symbol === 'AAVE');
    expect(aave).toBeDefined();
    expect(aave!.source).toBe('custom');
    expect(aave!.address).toBe(CUSTOM_TOKEN_AAVE.address);
    expect(aave!.decimals).toBe(18);
  });

  // -------------------------------------------------------------------------
  // 4. addCustomToken duplicate network+address throws
  // -------------------------------------------------------------------------
  it('addCustomToken duplicate network+address throws', async () => {
    await service.addCustomToken('ethereum-mainnet', CUSTOM_TOKEN_AAVE);

    await expect(
      service.addCustomToken('ethereum-mainnet', CUSTOM_TOKEN_AAVE),
    ).rejects.toThrow(/UNIQUE constraint failed/);
  });

  // -------------------------------------------------------------------------
  // 5. removeCustomToken removes custom token
  // -------------------------------------------------------------------------
  it('removeCustomToken removes custom token', async () => {
    await service.addCustomToken('ethereum-mainnet', CUSTOM_TOKEN_COMP);

    const removed = await service.removeCustomToken('ethereum-mainnet', CUSTOM_TOKEN_COMP.address);
    expect(removed).toBe(true);

    const tokens = await service.getTokensForNetwork('ethereum-mainnet');
    const comp = tokens.find((t) => t.symbol === 'COMP');
    expect(comp).toBeUndefined();
  });

  // -------------------------------------------------------------------------
  // 6. removeCustomToken returns false for non-existent token
  // -------------------------------------------------------------------------
  it('removeCustomToken returns false for non-existent token', async () => {
    const removed = await service.removeCustomToken('ethereum-mainnet', '0x0000000000000000000000000000000000000000');
    expect(removed).toBe(false);
  });

  // -------------------------------------------------------------------------
  // 7. removeCustomToken cannot remove built-in tokens
  // -------------------------------------------------------------------------
  it('removeCustomToken cannot remove built-in tokens', async () => {
    const removed = await service.removeCustomToken('ethereum-mainnet', BUILTIN_USDC_ADDRESS);
    expect(removed).toBe(false);

    // Verify USDC still exists
    const tokens = await service.getTokensForNetwork('ethereum-mainnet');
    const usdc = tokens.find((t) => t.symbol === 'USDC');
    expect(usdc).toBeDefined();
    expect(usdc!.source).toBe('builtin');
  });

  // -------------------------------------------------------------------------
  // 8. custom token overrides built-in with same address
  // -------------------------------------------------------------------------
  it('custom token overrides built-in with same address', async () => {
    // Add custom token with same address as built-in USDC
    await service.addCustomToken('ethereum-mainnet', {
      address: BUILTIN_USDC_ADDRESS,
      symbol: 'USDC-CUSTOM',
      name: 'Custom USDC Override',
      decimals: 6,
    });

    const tokens = await service.getTokensForNetwork('ethereum-mainnet');
    // Find the token with USDC address
    const usdc = tokens.find((t) => t.address.toLowerCase() === BUILTIN_USDC_ADDRESS.toLowerCase());
    expect(usdc).toBeDefined();
    expect(usdc!.source).toBe('custom');
    expect(usdc!.symbol).toBe('USDC-CUSTOM');
  });

  // -------------------------------------------------------------------------
  // 9. getAdapterTokenList returns correct format
  // -------------------------------------------------------------------------
  it('getAdapterTokenList returns correct format', async () => {
    const list = await service.getAdapterTokenList('ethereum-mainnet');

    expect(list.length).toBeGreaterThanOrEqual(4);

    for (const item of list) {
      expect(item.address).toBeTruthy();
      expect(item.symbol).toBeTruthy();
      expect(item.name).toBeTruthy();
      expect(typeof item.decimals).toBe('number');
    }

    // Verify shape matches setAllowedTokens format
    const first = list[0];
    expect(Object.keys(first).sort()).toEqual(['address', 'decimals', 'name', 'symbol']);
  });

  // -------------------------------------------------------------------------
  // 10. tokens sorted alphabetically by symbol
  // -------------------------------------------------------------------------
  it('tokens sorted alphabetically by symbol', async () => {
    // Add tokens with various symbols
    await service.addCustomToken('ethereum-sepolia', { address: '0xZZZ0000000000000000000000000000000000003', symbol: 'ZZZ', name: 'ZZZ Token', decimals: 18 });
    await service.addCustomToken('ethereum-sepolia', { address: '0xAAA0000000000000000000000000000000000001', symbol: 'AAA', name: 'AAA Token', decimals: 18 });
    await service.addCustomToken('ethereum-sepolia', { address: '0xMMM0000000000000000000000000000000000002', symbol: 'MMM', name: 'MMM Token', decimals: 18 });

    const tokens = await service.getTokensForNetwork('ethereum-sepolia');
    const symbols = tokens.map((t) => t.symbol);

    expect(symbols).toEqual(['AAA', 'MMM', 'ZZZ']);
  });
});

// ===========================================================================
// Suite 2: Token registry API integration tests
// ===========================================================================

describe('Token Registry API', () => {
  let conn: DatabaseConnection;
  let app: OpenAPIHono;

  beforeEach(async () => {
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
      config: mockConfig(),
      jwtSecretManager,
    });
  });

  afterEach(() => {
    conn.sqlite.close();
  });

  // -------------------------------------------------------------------------
  // 1. GET /v1/tokens?network=ethereum-mainnet returns built-in tokens
  // -------------------------------------------------------------------------
  it('GET /v1/tokens?network=ethereum-mainnet returns built-in tokens', async () => {
    const res = await app.request('/v1/tokens?network=ethereum-mainnet', {
      headers: masterHeaders(),
    });

    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.network).toBe('ethereum-mainnet');

    const tokens = body.tokens as Array<Record<string, unknown>>;
    expect(tokens.length).toBeGreaterThanOrEqual(4);

    const symbols = tokens.map((t) => t.symbol);
    expect(symbols).toContain('USDC');
    expect(symbols).toContain('USDT');
    expect(symbols).toContain('WETH');
    expect(symbols).toContain('DAI');

    // All should have source='builtin'
    for (const t of tokens) {
      expect(t.source).toBe('builtin');
    }
  });

  // -------------------------------------------------------------------------
  // 2. GET /v1/tokens without network returns 400
  // -------------------------------------------------------------------------
  it('GET /v1/tokens without network returns 400', async () => {
    const res = await app.request('/v1/tokens', {
      headers: masterHeaders(),
    });

    expect(res.status).toBe(400);
    const body = await json(res);
    expect(body.code).toBe('ACTION_VALIDATION_FAILED');
  });

  // -------------------------------------------------------------------------
  // 3. POST /v1/tokens adds custom token
  // -------------------------------------------------------------------------
  it('POST /v1/tokens adds custom token', async () => {
    const res = await app.request('/v1/tokens', {
      method: 'POST',
      headers: masterHeaders(),
      body: JSON.stringify({
        network: 'ethereum-mainnet',
        ...CUSTOM_TOKEN_AAVE,
      }),
    });

    expect(res.status).toBe(201);
    const body = await json(res);
    expect(body.id).toBeTruthy();
    expect(body.network).toBe('ethereum-mainnet');
    expect(body.address).toBe(CUSTOM_TOKEN_AAVE.address);
    expect(body.symbol).toBe('AAVE');

    // Verify it appears in GET
    const listRes = await app.request('/v1/tokens?network=ethereum-mainnet', {
      headers: masterHeaders(),
    });
    const listBody = await json(listRes);
    const tokens = listBody.tokens as Array<Record<string, unknown>>;
    const aave = tokens.find((t) => t.symbol === 'AAVE');
    expect(aave).toBeDefined();
    expect(aave!.source).toBe('custom');
  });

  // -------------------------------------------------------------------------
  // 4. POST /v1/tokens with duplicate returns 400 (conflict)
  // -------------------------------------------------------------------------
  it('POST /v1/tokens with duplicate returns 400 conflict', async () => {
    // First add
    await app.request('/v1/tokens', {
      method: 'POST',
      headers: masterHeaders(),
      body: JSON.stringify({
        network: 'ethereum-mainnet',
        ...CUSTOM_TOKEN_AAVE,
      }),
    });

    // Second add (duplicate)
    const res = await app.request('/v1/tokens', {
      method: 'POST',
      headers: masterHeaders(),
      body: JSON.stringify({
        network: 'ethereum-mainnet',
        ...CUSTOM_TOKEN_AAVE,
      }),
    });

    expect(res.status).toBe(400);
    const body = await json(res);
    expect(body.code).toBe('ACTION_VALIDATION_FAILED');
    expect(body.message).toContain('already exists');
  });

  // -------------------------------------------------------------------------
  // 5. DELETE /v1/tokens removes custom token
  // -------------------------------------------------------------------------
  it('DELETE /v1/tokens removes custom token', async () => {
    // Add first
    await app.request('/v1/tokens', {
      method: 'POST',
      headers: masterHeaders(),
      body: JSON.stringify({
        network: 'ethereum-mainnet',
        ...CUSTOM_TOKEN_MKR,
      }),
    });

    // Delete
    const res = await app.request('/v1/tokens', {
      method: 'DELETE',
      headers: masterHeaders(),
      body: JSON.stringify({
        network: 'ethereum-mainnet',
        address: CUSTOM_TOKEN_MKR.address,
      }),
    });

    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.removed).toBe(true);
    expect(body.network).toBe('ethereum-mainnet');
    expect(body.address).toBe(CUSTOM_TOKEN_MKR.address);

    // Verify it's gone from GET
    const listRes = await app.request('/v1/tokens?network=ethereum-mainnet', {
      headers: masterHeaders(),
    });
    const listBody = await json(listRes);
    const tokens = listBody.tokens as Array<Record<string, unknown>>;
    const mkr = tokens.find((t) => t.symbol === 'MKR');
    expect(mkr).toBeUndefined();
  });

  // -------------------------------------------------------------------------
  // 6. DELETE /v1/tokens for built-in returns removed:false
  // -------------------------------------------------------------------------
  it('DELETE /v1/tokens for built-in returns removed:false', async () => {
    const res = await app.request('/v1/tokens', {
      method: 'DELETE',
      headers: masterHeaders(),
      body: JSON.stringify({
        network: 'ethereum-mainnet',
        address: BUILTIN_USDC_ADDRESS,
      }),
    });

    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.removed).toBe(false);

    // USDC should still be in the list
    const listRes = await app.request('/v1/tokens?network=ethereum-mainnet', {
      headers: masterHeaders(),
    });
    const listBody = await json(listRes);
    const tokens = listBody.tokens as Array<Record<string, unknown>>;
    const usdc = tokens.find((t) => t.symbol === 'USDC');
    expect(usdc).toBeDefined();
  });

  // -------------------------------------------------------------------------
  // 7. POST /v1/tokens with invalid network returns validation error
  // -------------------------------------------------------------------------
  it('POST /v1/tokens with invalid network returns validation error', async () => {
    const res = await app.request('/v1/tokens', {
      method: 'POST',
      headers: masterHeaders(),
      body: JSON.stringify({
        network: 'invalid-network',
        address: '0x1234567890abcdef1234567890abcdef12345678',
        symbol: 'TEST',
        name: 'Test Token',
        decimals: 18,
      }),
    });

    expect(res.status).toBe(400);
    const body = await json(res);
    expect(body.code).toBe('ACTION_VALIDATION_FAILED');
    expect(String(body.message)).toContain('Invalid EVM network');
  });
});
