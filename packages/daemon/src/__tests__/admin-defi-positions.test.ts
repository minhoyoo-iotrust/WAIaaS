/**
 * Tests for GET /v1/admin/defi/positions endpoint.
 *
 * 5 tests covering:
 * 1. Returns empty positions when no DeFi data exists
 * 2. Returns positions with aggregated totalValueUsd
 * 3. Filters by wallet_id query parameter
 * 4. Extracts worstHealthFactor from LENDING metadata
 * 5. Returns 401 without masterAuth header
 *
 * Uses createApp() + app.request() integration pattern.
 *
 * @see packages/daemon/src/api/routes/admin.ts
 */

import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import type { Database as DatabaseType } from 'better-sqlite3';
import argon2 from 'argon2';
import { createDatabase, pushSchema } from '../infrastructure/database/index.js';
import { createApp } from '../api/server.js';
import { SettingsService } from '../infrastructure/settings/index.js';
import type { DaemonConfig } from '../infrastructure/config/loader.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TEST_PASSWORD = 'test-master-password-defi-positions';
const HOST = '127.0.0.1:3100';
let passwordHash: string;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fullConfig(overrides: Partial<DaemonConfig> = {}): DaemonConfig {
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
      jwt_secret: '', max_sessions_per_wallet: 5, max_pending_tx: 10,
      nonce_storage: 'memory' as const, nonce_cache_max: 1000, nonce_cache_ttl: 300,
      rate_limit_global_ip_rpm: 1000, rate_limit_session_rpm: 300, rate_limit_tx_rpm: 10,
      cors_origins: ['http://localhost:3100'], autostop_consecutive_failures_threshold: 5,
      policy_defaults_delay_seconds: 300, policy_defaults_approval_timeout: 3600,
      kill_switch_recovery_cooldown: 1800, kill_switch_max_recovery_attempts: 3,
    },
    walletconnect: { project_id: '' },
    ...overrides,
  };
}

function masterHeaders(): Record<string, string> {
  return { Host: HOST, 'X-Master-Password': TEST_PASSWORD };
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

let sqlite: DatabaseType;
let db: ReturnType<typeof createDatabase>['db'];

beforeAll(async () => {
  passwordHash = await argon2.hash(TEST_PASSWORD, {
    type: argon2.argon2id,
    memoryCost: 4096,
    timeCost: 2,
    parallelism: 1,
  });
});

beforeEach(() => {
  const conn = createDatabase(':memory:');
  sqlite = conn.sqlite;
  db = conn.db;
  pushSchema(sqlite);
});

afterEach(() => {
  try { sqlite.close(); } catch { /* already closed */ }
});

function ensureWallet(walletId: string) {
  const exists = sqlite.prepare('SELECT id FROM wallets WHERE id = ?').get(walletId);
  if (!exists) {
    const now = Math.floor(Date.now() / 1000);
    sqlite.prepare(`
      INSERT INTO wallets (id, name, chain, environment, public_key, status, created_at, updated_at)
      VALUES (?, ?, 'ethereum', 'mainnet', 'pk_' || ?, 'ACTIVE', ?, ?)
    `).run(walletId, walletId, walletId, now, now);
  }
}

function insertPosition(opts: {
  id: string;
  walletId: string;
  category?: string;
  provider?: string;
  chain?: string;
  network?: string;
  amount?: string;
  amountUsd?: number | null;
  metadata?: string | null;
  status?: string;
}) {
  ensureWallet(opts.walletId);
  const now = Math.floor(Date.now() / 1000);
  sqlite.prepare(`
    INSERT INTO defi_positions (id, wallet_id, category, provider, chain, network, asset_id, amount, amount_usd, metadata, status, opened_at, last_synced_at, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    opts.id,
    opts.walletId,
    opts.category ?? 'LENDING',
    opts.provider ?? 'aave-v3',
    opts.chain ?? 'ethereum',
    opts.network ?? 'ethereum-mainnet',
    opts.amount ?? '1.0',
    opts.amountUsd ?? null,
    opts.metadata ?? null,
    opts.status ?? 'ACTIVE',
    now,
    now,
    now,
    now,
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('GET /admin/defi/positions', () => {
  it('should return empty positions when no DeFi data exists', async () => {
    const config = fullConfig();
    const settingsService = new SettingsService({ db, config, masterPassword: TEST_PASSWORD });
    const app = createApp({ db, sqlite, masterPasswordHash: passwordHash, config, settingsService });

    const res = await app.request('/v1/admin/defi/positions', { headers: masterHeaders() });
    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    expect(body.positions).toEqual([]);
    expect(body.totalValueUsd).toBeNull();
    expect(body.activeCount).toBe(0);
  });

  it('should return positions with aggregated totalValueUsd', async () => {
    insertPosition({ id: 'pos-1', walletId: 'w1', amountUsd: 100.5 });
    insertPosition({ id: 'pos-2', walletId: 'w2', amountUsd: 200.25 });

    const config = fullConfig();
    const settingsService = new SettingsService({ db, config, masterPassword: TEST_PASSWORD });
    const app = createApp({ db, sqlite, masterPasswordHash: passwordHash, config, settingsService });

    const res = await app.request('/v1/admin/defi/positions', { headers: masterHeaders() });
    expect(res.status).toBe(200);
    const body = await res.json() as { positions: unknown[]; totalValueUsd: number; activeCount: number };
    expect(body.positions).toHaveLength(2);
    expect(body.totalValueUsd).toBeCloseTo(300.75);
    expect(body.activeCount).toBe(2);
  });

  it('should filter by wallet_id query parameter', async () => {
    const wid1 = '00000000-0000-0000-0000-000000000001';
    const wid2 = '00000000-0000-0000-0000-000000000002';
    insertPosition({ id: 'pos-1', walletId: wid1, amountUsd: 50 });
    insertPosition({ id: 'pos-2', walletId: wid2, amountUsd: 100 });

    const config = fullConfig();
    const settingsService = new SettingsService({ db, config, masterPassword: TEST_PASSWORD });
    const app = createApp({ db, sqlite, masterPasswordHash: passwordHash, config, settingsService });

    const res = await app.request(`/v1/admin/defi/positions?wallet_id=${wid1}`, { headers: masterHeaders() });
    expect(res.status).toBe(200);
    const body = await res.json() as { positions: Array<{ walletId: string }>; activeCount: number };
    expect(body.positions).toHaveLength(1);
    expect(body.positions[0]!.walletId).toBe(wid1);
    expect(body.activeCount).toBe(1);
  });

  it('should extract worstHealthFactor from LENDING metadata', async () => {
    insertPosition({
      id: 'pos-1', walletId: 'w1', category: 'LENDING',
      metadata: JSON.stringify({ healthFactor: 1.8, protocol: 'aave-v3' }),
    });
    insertPosition({
      id: 'pos-2', walletId: 'w2', category: 'LENDING',
      metadata: JSON.stringify({ healthFactor: 1.2 }),
    });

    const config = fullConfig();
    const settingsService = new SettingsService({ db, config, masterPassword: TEST_PASSWORD });
    const app = createApp({ db, sqlite, masterPasswordHash: passwordHash, config, settingsService });

    const res = await app.request('/v1/admin/defi/positions', { headers: masterHeaders() });
    expect(res.status).toBe(200);
    const body = await res.json() as { worstHealthFactor: number };
    expect(body.worstHealthFactor).toBeCloseTo(1.2);
  });

  it('should return 401 without masterAuth header', async () => {
    const config = fullConfig();
    const settingsService = new SettingsService({ db, config, masterPassword: TEST_PASSWORD });
    const app = createApp({ db, sqlite, masterPasswordHash: passwordHash, config, settingsService });

    const res = await app.request('/v1/admin/defi/positions', { headers: { Host: HOST } });
    expect(res.status).toBe(401);
  });

  it('should filter by category query parameter', async () => {
    const wid = '00000000-0000-0000-0000-000000000010';
    insertPosition({ id: 'pos-cat-1', walletId: wid, category: 'STAKING', provider: 'lido', amountUsd: 100 });
    insertPosition({ id: 'pos-cat-2', walletId: wid, category: 'LENDING', provider: 'aave-v3', amountUsd: 200 });
    insertPosition({ id: 'pos-cat-3', walletId: wid, category: 'YIELD', provider: 'pendle', amountUsd: 50 });
    insertPosition({ id: 'pos-cat-4', walletId: wid, category: 'PERP', provider: 'hyperliquid-perp', amountUsd: 300 });

    const config = fullConfig();
    const settingsService = new SettingsService({ db, config, masterPassword: TEST_PASSWORD });
    const app = createApp({ db, sqlite, masterPasswordHash: passwordHash, config, settingsService });

    // Filter LENDING only
    const res1 = await app.request('/v1/admin/defi/positions?category=LENDING', { headers: masterHeaders() });
    expect(res1.status).toBe(200);
    const body1 = await res1.json() as { positions: Array<{ category: string }>; activeCount: number };
    expect(body1.positions).toHaveLength(1);
    expect(body1.positions[0]!.category).toBe('LENDING');
    expect(body1.activeCount).toBe(1);

    // Filter STAKING only
    const res2 = await app.request('/v1/admin/defi/positions?category=STAKING', { headers: masterHeaders() });
    expect(res2.status).toBe(200);
    const body2 = await res2.json() as { positions: Array<{ category: string }>; activeCount: number };
    expect(body2.positions).toHaveLength(1);
    expect(body2.positions[0]!.category).toBe('STAKING');
  });

  it('should return metadata in position response', async () => {
    const meta = { healthFactor: 1.5, positionType: 'SUPPLY' };
    insertPosition({
      id: 'pos-meta-1', walletId: 'w-meta', category: 'LENDING',
      metadata: JSON.stringify(meta), amountUsd: 500,
    });

    const config = fullConfig();
    const settingsService = new SettingsService({ db, config, masterPassword: TEST_PASSWORD });
    const app = createApp({ db, sqlite, masterPasswordHash: passwordHash, config, settingsService });

    const res = await app.request('/v1/admin/defi/positions', { headers: masterHeaders() });
    expect(res.status).toBe(200);
    const body = await res.json() as { positions: Array<{ metadata: Record<string, unknown> }> };
    expect(body.positions).toHaveLength(1);
    expect(body.positions[0]!.metadata).toBeDefined();
    expect(body.positions[0]!.metadata).not.toBeNull();
    expect((body.positions[0]!.metadata as Record<string, unknown>).healthFactor).toBe(1.5);
    expect((body.positions[0]!.metadata as Record<string, unknown>).positionType).toBe('SUPPLY');
  });

  it('should combine wallet_id and category filters', async () => {
    const wid1 = '00000000-0000-0000-0000-000000000011';
    const wid2 = '00000000-0000-0000-0000-000000000012';
    insertPosition({ id: 'pos-comb-1', walletId: wid1, category: 'LENDING', amountUsd: 100 });
    insertPosition({ id: 'pos-comb-2', walletId: wid1, category: 'STAKING', amountUsd: 200 });
    insertPosition({ id: 'pos-comb-3', walletId: wid2, category: 'LENDING', amountUsd: 300 });

    const config = fullConfig();
    const settingsService = new SettingsService({ db, config, masterPassword: TEST_PASSWORD });
    const app = createApp({ db, sqlite, masterPasswordHash: passwordHash, config, settingsService });

    const res = await app.request(`/v1/admin/defi/positions?wallet_id=${wid1}&category=LENDING`, { headers: masterHeaders() });
    expect(res.status).toBe(200);
    const body = await res.json() as { positions: Array<{ walletId: string; category: string }>; activeCount: number };
    expect(body.positions).toHaveLength(1);
    expect(body.positions[0]!.walletId).toBe(wid1);
    expect(body.positions[0]!.category).toBe('LENDING');
    expect(body.activeCount).toBe(1);
  });
});
