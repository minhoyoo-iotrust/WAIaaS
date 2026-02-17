/**
 * Tests for admin notification API endpoints.
 *
 * 10 tests covering:
 * 1. GET /admin/notifications/status returns channel status
 * 2. GET /admin/notifications/status returns all disabled when no service
 * 3. GET /admin/notifications/status never exposes credentials
 * 4. GET /admin/notifications/status requires masterAuth
 * 5. POST /admin/notifications/test sends test to active channels
 * 6. POST /admin/notifications/test returns failure for broken channel
 * 7. POST /admin/notifications/test requires masterAuth
 * 8. GET /admin/notifications/log returns paginated logs
 * 9. GET /admin/notifications/log filters by channel
 * 10. GET /admin/notifications/log returns empty when no logs
 *
 * Uses createApp() + app.request() integration pattern with mock NotificationService.
 *
 * @see packages/daemon/src/api/routes/admin.ts
 */

import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import type { Database as DatabaseType } from 'better-sqlite3';
import argon2 from 'argon2';
import { createDatabase, pushSchema, generateId } from '../infrastructure/database/index.js';
import { createApp } from '../api/server.js';
import { NotificationService } from '../notifications/notification-service.js';
import type { INotificationChannel } from '@waiaas/core';
import type { DaemonConfig } from '../infrastructure/config/loader.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TEST_PASSWORD = 'test-master-password-admin-notif';
const HOST = '127.0.0.1:3100';
let passwordHash: string;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fullConfig(overrides: Partial<DaemonConfig['notifications']> = {}): DaemonConfig {
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
      evm_base_mainnet: '', evm_base_sepolia: '', evm_default_network: 'ethereum-sepolia' as const,
    },
    notifications: {
      enabled: true, min_channels: 2, health_check_interval: 300, log_retention_days: 30,
      dedup_ttl: 300, telegram_bot_token: '123:ABC', telegram_chat_id: '-100123',
      discord_webhook_url: 'https://discord.com/api/webhooks/123/abc',
      ntfy_server: 'https://ntfy.sh', ntfy_topic: 'waiaas-test', slack_webhook_url: '',
      locale: 'en' as const, rate_limit_rpm: 20, ...overrides,
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

function mockChannel(name: string, shouldFail = false): INotificationChannel {
  return {
    name,
    initialize: vi.fn().mockResolvedValue(undefined),
    send: shouldFail
      ? vi.fn().mockRejectedValue(new Error(`${name} send failed`))
      : vi.fn().mockResolvedValue(undefined),
  };
}

function masterHeaders(): Record<string, string> {
  return {
    Host: HOST,
    'X-Master-Password': TEST_PASSWORD,
  };
}

function masterJsonHeaders(): Record<string, string> {
  return {
    ...masterHeaders(),
    'Content-Type': 'application/json',
  };
}

async function json(res: Response): Promise<Record<string, unknown>> {
  return (await res.json()) as Record<string, unknown>;
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
  try {
    sqlite.close();
  } catch {
    // already closed
  }
});

// ---------------------------------------------------------------------------
// GET /admin/notifications/status
// ---------------------------------------------------------------------------

describe('GET /admin/notifications/status', () => {
  it('should return channel status with telegram enabled', async () => {
    const svc = new NotificationService({ db });
    const tgChannel = mockChannel('telegram');
    const discordChannel = mockChannel('discord');
    svc.addChannel(tgChannel);
    svc.addChannel(discordChannel);

    const config = fullConfig();
    const app = createApp({
      db,
      masterPasswordHash: passwordHash,
      config,
      notificationService: svc,
    });

    const res = await app.request('/v1/admin/notifications/status', {
      headers: masterHeaders(),
    });

    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.enabled).toBe(true);

    const channels = body.channels as Array<{ name: string; enabled: boolean }>;
    expect(channels).toHaveLength(4);

    const tg = channels.find((c) => c.name === 'telegram');
    expect(tg?.enabled).toBe(true);

    const discord = channels.find((c) => c.name === 'discord');
    expect(discord?.enabled).toBe(true); // webhook_url + channel registered

    const ntfy = channels.find((c) => c.name === 'ntfy');
    expect(ntfy?.enabled).toBe(false); // ntfy channel not added to service

    const slack = channels.find((c) => c.name === 'slack');
    expect(slack?.enabled).toBe(false); // slack_webhook_url empty
  });

  it('should return all channels disabled when no service', async () => {
    const config = fullConfig({ enabled: false });
    const app = createApp({
      db,
      masterPasswordHash: passwordHash,
      config,
    });

    const res = await app.request('/v1/admin/notifications/status', {
      headers: masterHeaders(),
    });

    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.enabled).toBe(false);

    const channels = body.channels as Array<{ name: string; enabled: boolean }>;
    expect(channels.every((c) => c.enabled === false)).toBe(true);
  });

  it('should never expose credentials in response', async () => {
    const svc = new NotificationService({ db });
    svc.addChannel(mockChannel('telegram'));
    svc.addChannel(mockChannel('discord'));
    svc.addChannel(mockChannel('ntfy'));

    const config = fullConfig();
    const app = createApp({
      db,
      masterPasswordHash: passwordHash,
      config,
      notificationService: svc,
    });

    const res = await app.request('/v1/admin/notifications/status', {
      headers: masterHeaders(),
    });

    expect(res.status).toBe(200);
    const rawText = await res.clone().text();

    // Ensure no credential values leak
    expect(rawText).not.toContain('123:ABC'); // telegram_bot_token
    expect(rawText).not.toContain('-100123'); // telegram_chat_id
    expect(rawText).not.toContain('discord.com/api/webhooks'); // discord_webhook_url
    expect(rawText).not.toContain('waiaas-test'); // ntfy_topic
    expect(rawText).not.toContain('bot_token');
    expect(rawText).not.toContain('webhook_url');
    expect(rawText).not.toContain('ntfy_topic');
  });

  it('should require masterAuth (401 without credentials)', async () => {
    const config = fullConfig();
    const app = createApp({
      db,
      masterPasswordHash: passwordHash,
      config,
    });

    const res = await app.request('/v1/admin/notifications/status', {
      headers: { Host: HOST },
    });

    expect(res.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// POST /admin/notifications/test
// ---------------------------------------------------------------------------

describe('POST /admin/notifications/test', () => {
  it('should send test to active channels and return success results', async () => {
    const svc = new NotificationService({ db });
    const tgChannel = mockChannel('telegram');
    svc.addChannel(tgChannel);

    const config = fullConfig();
    const app = createApp({
      db,
      masterPasswordHash: passwordHash,
      config,
      notificationService: svc,
    });

    const res = await app.request('/v1/admin/notifications/test', {
      method: 'POST',
      headers: masterJsonHeaders(),
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(200);
    const body = await json(res);
    const results = body.results as Array<{ channel: string; success: boolean; error?: string }>;
    expect(results).toHaveLength(1);
    expect(results[0]!.channel).toBe('telegram');
    expect(results[0]!.success).toBe(true);
    expect(tgChannel.send).toHaveBeenCalledTimes(1);
  });

  it('should return failure for broken channel', async () => {
    const svc = new NotificationService({ db });
    const brokenChannel = mockChannel('discord', true); // shouldFail = true
    svc.addChannel(brokenChannel);

    const config = fullConfig();
    const app = createApp({
      db,
      masterPasswordHash: passwordHash,
      config,
      notificationService: svc,
    });

    const res = await app.request('/v1/admin/notifications/test', {
      method: 'POST',
      headers: masterJsonHeaders(),
      body: JSON.stringify({ channel: 'discord' }),
    });

    expect(res.status).toBe(200);
    const body = await json(res);
    const results = body.results as Array<{ channel: string; success: boolean; error?: string }>;
    expect(results).toHaveLength(1);
    expect(results[0]!.channel).toBe('discord');
    expect(results[0]!.success).toBe(false);
    expect(results[0]!.error).toContain('discord send failed');
  });

  it('should require masterAuth (401 without credentials)', async () => {
    const config = fullConfig();
    const app = createApp({
      db,
      masterPasswordHash: passwordHash,
      config,
    });

    const res = await app.request('/v1/admin/notifications/test', {
      method: 'POST',
      headers: { Host: HOST, 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// GET /admin/notifications/log
// ---------------------------------------------------------------------------

describe('GET /admin/notifications/log', () => {
  function insertLog(
    opts: {
      eventType?: string;
      walletId?: string;
      channel?: string;
      status?: string;
      error?: string | null;
      message?: string | null;
      createdAt?: number;
    } = {},
  ): void {
    const id = generateId();
    const ts = opts.createdAt ?? Math.floor(Date.now() / 1000);
    sqlite
      .prepare(
        `INSERT INTO notification_logs (id, event_type, wallet_id, channel, status, error, message, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        opts.eventType ?? 'TX_CONFIRMED',
        opts.walletId ?? 'wallet-1',
        opts.channel ?? 'telegram',
        opts.status ?? 'sent',
        opts.error ?? null,
        opts.message ?? null,
        ts,
      );
  }

  it('should return paginated logs', async () => {
    // Insert 25 log entries
    for (let i = 0; i < 25; i++) {
      insertLog({ createdAt: 1700000000 + i });
    }

    const config = fullConfig();
    const app = createApp({
      db,
      masterPasswordHash: passwordHash,
      config,
    });

    // Page 1, default 20 per page
    const res1 = await app.request('/v1/admin/notifications/log?page=1&pageSize=10', {
      headers: masterHeaders(),
    });

    expect(res1.status).toBe(200);
    const body1 = await json(res1);
    expect(body1.total).toBe(25);
    expect(body1.page).toBe(1);
    expect(body1.pageSize).toBe(10);
    expect((body1.logs as unknown[]).length).toBe(10);

    // Page 3 (should have 5 items)
    const res3 = await app.request('/v1/admin/notifications/log?page=3&pageSize=10', {
      headers: masterHeaders(),
    });

    expect(res3.status).toBe(200);
    const body3 = await json(res3);
    expect(body3.total).toBe(25);
    expect(body3.page).toBe(3);
    expect((body3.logs as unknown[]).length).toBe(5);
  });

  it('should filter by channel', async () => {
    insertLog({ channel: 'telegram' });
    insertLog({ channel: 'telegram' });
    insertLog({ channel: 'discord' });

    const config = fullConfig();
    const app = createApp({
      db,
      masterPasswordHash: passwordHash,
      config,
    });

    const res = await app.request('/v1/admin/notifications/log?channel=telegram', {
      headers: masterHeaders(),
    });

    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.total).toBe(2);
    const logs = body.logs as Array<{ channel: string }>;
    expect(logs.every((l) => l.channel === 'telegram')).toBe(true);
  });

  it('should include message field in log response', async () => {
    insertLog({ message: '[WAIaaS] Transaction confirmed\n0.01 ETH sent to 0x...' });
    insertLog({ message: null }); // pre-v10 record with no message

    const config = fullConfig();
    const app = createApp({
      db,
      masterPasswordHash: passwordHash,
      config,
    });

    const res = await app.request('/v1/admin/notifications/log', {
      headers: masterHeaders(),
    });

    expect(res.status).toBe(200);
    const body = await json(res);
    const logs = body.logs as Array<{ message: string | null }>;
    expect(logs).toHaveLength(2);

    // One log has message, the other is null
    const withMessage = logs.find((l) => l.message !== null);
    const withoutMessage = logs.find((l) => l.message === null);
    expect(withMessage).toBeDefined();
    expect(withMessage!.message).toContain('Transaction confirmed');
    expect(withoutMessage).toBeDefined();
    expect(withoutMessage!.message).toBeNull();
  });

  it('should return empty when no logs', async () => {
    const config = fullConfig();
    const app = createApp({
      db,
      masterPasswordHash: passwordHash,
      config,
    });

    const res = await app.request('/v1/admin/notifications/log', {
      headers: masterHeaders(),
    });

    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.total).toBe(0);
    expect(body.logs).toEqual([]);
    expect(body.page).toBe(1);
    expect(body.pageSize).toBe(20);
  });
});
