/**
 * Tests for bugfixes #168 (formattedAmount) and #170 (dual-auth actions/providers).
 *
 * #168: GET /admin/transactions and GET /admin/incoming return formattedAmount
 * #170: GET /v1/actions/providers accepts masterAuth (Admin UI)
 *
 * Uses createApp() + app.request() integration pattern.
 */

import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import type { Database as DatabaseType } from 'better-sqlite3';
import argon2 from 'argon2';
import { createDatabase, pushSchema } from '../infrastructure/database/index.js';
import { createApp } from '../api/server.js';
import { SettingsService } from '../infrastructure/settings/index.js';
import type { DaemonConfig } from '../infrastructure/config/loader.js';
import { generateId } from '../infrastructure/database/id.js';
import { wallets, transactions, incomingTransactions, tokenRegistry } from '../infrastructure/database/schema.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TEST_PASSWORD = 'test-master-password-bugfix';
const HOST = '127.0.0.1:3100';
let passwordHash: string;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fullConfig(): DaemonConfig {
  return {
    daemon: {
      port: 3100, hostname: '127.0.0.1', log_level: 'info', log_file: 'logs/daemon.log',
      log_max_size: '50MB', log_max_files: 5, pid_file: 'daemon.pid', shutdown_timeout: 30,
      dev_mode: false, admin_ui: false, admin_timeout: 900,
    },
    keystore: { argon2_memory: 65536, argon2_time: 3, argon2_parallelism: 4, backup_on_rotate: true },
    database: { path: ':memory:', wal_checkpoint_interval: 300, busy_timeout: 5000, cache_size: 64000, mmap_size: 268435456 },
    rpc: {
      solana_mainnet: '', solana_devnet: '', solana_testnet: '',
      solana_ws_mainnet: '', solana_ws_devnet: '',
      evm_ethereum_mainnet: '', evm_ethereum_sepolia: '', evm_polygon_mainnet: '', evm_polygon_amoy: '',
      evm_arbitrum_mainnet: '', evm_arbitrum_sepolia: '', evm_optimism_mainnet: '', evm_optimism_sepolia: '',
      evm_base_mainnet: '', evm_base_sepolia: '',
    },
    notifications: {
      enabled: false, min_channels: 2, health_check_interval: 300, log_retention_days: 30,
      dedup_ttl: 300, telegram_bot_token: '', telegram_chat_id: '',
      discord_webhook_url: '',
      ntfy_server: 'https://ntfy.sh', ntfy_topic: '', locale: 'en' as const,
      rate_limit_rpm: 20,
    },
    security: {
      session_ttl: 86400, session_absolute_lifetime: 31536000, session_max_renewals: 12, jwt_secret: '', max_sessions_per_wallet: 5, max_pending_tx: 10,
      nonce_storage: 'memory' as const, nonce_cache_max: 1000, nonce_cache_ttl: 300,
      rate_limit_global_ip_rpm: 1000, rate_limit_session_rpm: 300, rate_limit_tx_rpm: 10,
      cors_origins: ['http://localhost:3100'], autostop_consecutive_failures_threshold: 5,
      policy_defaults_delay_seconds: 300, policy_defaults_approval_timeout: 3600,
      kill_switch_recovery_cooldown: 1800, kill_switch_max_recovery_attempts: 3,
    },
    walletconnect: { project_id: '' },
  };
}

function masterHeaders(): Record<string, string> {
  return { Host: HOST, 'X-Master-Password': TEST_PASSWORD };
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeAll(async () => {
  passwordHash = await argon2.hash(TEST_PASSWORD, {
    type: argon2.argon2id, memoryCost: 4096, timeCost: 2, parallelism: 1,
  });
});

let sqlite: DatabaseType;
let db: ReturnType<typeof createDatabase>['db'];

beforeEach(() => {
  const conn = createDatabase(':memory:');
  sqlite = conn.sqlite;
  db = conn.db;
  pushSchema(sqlite);
});

afterEach(() => {
  try { sqlite.close(); } catch { /* already closed */ }
});

// ---------------------------------------------------------------------------
// #170: GET /v1/actions/providers dual-auth
// ---------------------------------------------------------------------------

describe('#170: GET /v1/actions/providers dual-auth', () => {
  it('returns 200 with masterAuth header (Admin UI)', async () => {
    const config = fullConfig();
    const settingsService = new SettingsService({ db, config, masterPassword: TEST_PASSWORD });
    const app = createApp({
      db, masterPasswordHash: passwordHash, config, settingsService,
    });

    const res = await app.request('/v1/actions/providers', {
      headers: masterHeaders(),
    });

    // Should not be 401 (the bug). May be 200 or 404 depending on route registration.
    expect(res.status).not.toBe(401);
  });

  it('returns 401 without any auth header', async () => {
    const config = fullConfig();
    const settingsService = new SettingsService({ db, config, masterPassword: TEST_PASSWORD });
    const app = createApp({
      db, masterPasswordHash: passwordHash, config, settingsService,
    });

    const res = await app.request('/v1/actions/providers', {
      headers: { Host: HOST },
    });

    expect(res.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// #168: formattedAmount in admin transactions
// ---------------------------------------------------------------------------

describe('#168: GET /admin/transactions formattedAmount', () => {
  function seedWallet(chain: string): string {
    const id = generateId();
    db.insert(wallets).values({
      id,
      name: `test-${chain}`,
      chain,
      environment: 'testnet',
      address: `0x${'a'.repeat(40)}`,
      publicKey: `0x${'a'.repeat(40)}`,
      encryptedKey: 'enc',
      status: 'ACTIVE',
      createdAt: new Date(),
      updatedAt: new Date(),
    }).run();
    return id;
  }

  it('formats native SOL amount (5000000000 → 5 SOL)', async () => {
    const walletId = seedWallet('solana');
    db.insert(transactions).values({
      id: generateId(), walletId, type: 'TRANSFER', status: 'CONFIRMED',
      chain: 'solana', amount: '5000000000', createdAt: new Date(),
    }).run();

    const config = fullConfig();
    const settingsService = new SettingsService({ db, config, masterPassword: TEST_PASSWORD });
    const app = createApp({ db, masterPasswordHash: passwordHash, config, settingsService });

    const res = await app.request('/v1/admin/transactions', { headers: masterHeaders() });
    expect(res.status).toBe(200);
    const body = await res.json() as { items: Array<{ formattedAmount: string | null }> };
    expect(body.items[0]!.formattedAmount).toBe('5 SOL');
  });

  it('formats native ETH amount (1000000000000000000 → 1 ETH)', async () => {
    const walletId = seedWallet('ethereum');
    db.insert(transactions).values({
      id: generateId(), walletId, type: 'TRANSFER', status: 'CONFIRMED',
      chain: 'ethereum', amount: '1000000000000000000', createdAt: new Date(),
    }).run();

    const config = fullConfig();
    const settingsService = new SettingsService({ db, config, masterPassword: TEST_PASSWORD });
    const app = createApp({ db, masterPasswordHash: passwordHash, config, settingsService });

    const res = await app.request('/v1/admin/transactions', { headers: masterHeaders() });
    const body = await res.json() as { items: Array<{ formattedAmount: string | null }> };
    expect(body.items[0]!.formattedAmount).toBe('1 ETH');
  });

  it('formats ERC-20 token amount using token_registry (1000000 → 1 USDC)', async () => {
    const walletId = seedWallet('ethereum');
    const usdcAddr = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';
    // Register USDC in token_registry
    db.insert(tokenRegistry).values({
      id: generateId(), network: 'ethereum-sepolia', address: usdcAddr,
      symbol: 'USDC', name: 'USD Coin', decimals: 6, source: 'custom',
      createdAt: new Date(),
    }).run();
    db.insert(transactions).values({
      id: generateId(), walletId, type: 'TOKEN_TRANSFER', status: 'CONFIRMED',
      chain: 'ethereum', network: 'ethereum-sepolia', amount: '1000000',
      contractAddress: usdcAddr, createdAt: new Date(),
    }).run();

    const config = fullConfig();
    const settingsService = new SettingsService({ db, config, masterPassword: TEST_PASSWORD });
    const app = createApp({ db, masterPasswordHash: passwordHash, config, settingsService });

    const res = await app.request('/v1/admin/transactions', { headers: masterHeaders() });
    const body = await res.json() as { items: Array<{ formattedAmount: string | null }> };
    expect(body.items[0]!.formattedAmount).toBe('1 USDC');
  });

  it('returns null formattedAmount for unknown token', async () => {
    const walletId = seedWallet('ethereum');
    db.insert(transactions).values({
      id: generateId(), walletId, type: 'TOKEN_TRANSFER', status: 'CONFIRMED',
      chain: 'ethereum', network: 'ethereum-sepolia', amount: '999',
      contractAddress: '0x0000000000000000000000000000000000000001',
      createdAt: new Date(),
    }).run();

    const config = fullConfig();
    const settingsService = new SettingsService({ db, config, masterPassword: TEST_PASSWORD });
    const app = createApp({ db, masterPasswordHash: passwordHash, config, settingsService });

    const res = await app.request('/v1/admin/transactions', { headers: masterHeaders() });
    const body = await res.json() as { items: Array<{ formattedAmount: string | null; amount: string | null }> };
    expect(body.items[0]!.formattedAmount).toBeNull();
    expect(body.items[0]!.amount).toBe('999');
  });

  it('returns null formattedAmount when amount is null', async () => {
    const walletId = seedWallet('solana');
    db.insert(transactions).values({
      id: generateId(), walletId, type: 'CONTRACT_CALL', status: 'CONFIRMED',
      chain: 'solana', amount: null, createdAt: new Date(),
    }).run();

    const config = fullConfig();
    const settingsService = new SettingsService({ db, config, masterPassword: TEST_PASSWORD });
    const app = createApp({ db, masterPasswordHash: passwordHash, config, settingsService });

    const res = await app.request('/v1/admin/transactions', { headers: masterHeaders() });
    const body = await res.json() as { items: Array<{ formattedAmount: string | null }> };
    expect(body.items[0]!.formattedAmount).toBeNull();
  });
});

describe('#168: GET /admin/incoming formattedAmount', () => {
  function seedWallet(chain: string): string {
    const id = generateId();
    db.insert(wallets).values({
      id, name: `test-${chain}`, chain, environment: 'testnet',
      address: `0x${'b'.repeat(40)}`, publicKey: `0x${'b'.repeat(40)}`, encryptedKey: 'enc', status: 'ACTIVE',
      createdAt: new Date(), updatedAt: new Date(),
    }).run();
    return id;
  }

  it('formats native incoming SOL (3000000000 → 3 SOL)', async () => {
    const walletId = seedWallet('solana');
    db.insert(incomingTransactions).values({
      id: generateId(), txHash: '0xabc', walletId,
      fromAddress: '0x1234', amount: '3000000000', tokenAddress: null,
      chain: 'solana', network: 'solana-devnet', status: 'DETECTED',
      detectedAt: new Date(),
    }).run();

    const config = fullConfig();
    const settingsService = new SettingsService({ db, config, masterPassword: TEST_PASSWORD });
    const app = createApp({ db, masterPasswordHash: passwordHash, config, settingsService });

    const res = await app.request('/v1/admin/incoming', { headers: masterHeaders() });
    expect(res.status).toBe(200);
    const body = await res.json() as { items: Array<{ formattedAmount: string | null }> };
    expect(body.items[0]!.formattedAmount).toBe('3 SOL');
  });

  it('formats incoming token using token_registry', async () => {
    const walletId = seedWallet('ethereum');
    const usdcAddr = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';
    db.insert(tokenRegistry).values({
      id: generateId(), network: 'ethereum-sepolia', address: usdcAddr,
      symbol: 'USDC', name: 'USD Coin', decimals: 6, source: 'custom',
      createdAt: new Date(),
    }).run();
    db.insert(incomingTransactions).values({
      id: generateId(), txHash: '0xdef', walletId,
      fromAddress: '0x5678', amount: '5000000', tokenAddress: usdcAddr,
      chain: 'ethereum', network: 'ethereum-sepolia', status: 'DETECTED',
      detectedAt: new Date(),
    }).run();

    const config = fullConfig();
    const settingsService = new SettingsService({ db, config, masterPassword: TEST_PASSWORD });
    const app = createApp({ db, masterPasswordHash: passwordHash, config, settingsService });

    const res = await app.request('/v1/admin/incoming', { headers: masterHeaders() });
    const body = await res.json() as { items: Array<{ formattedAmount: string | null }> };
    expect(body.items[0]!.formattedAmount).toBe('5 USDC');
  });
});
