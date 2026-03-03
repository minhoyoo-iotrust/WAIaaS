/**
 * Tests for AutoStop rules REST API endpoints.
 *
 * Covers:
 * - GET /v1/admin/autostop/rules returns 3 builtin rules
 * - PUT /v1/admin/autostop/rules/:id updates enabled/config
 * - PUT /v1/admin/autostop/rules/nonexistent returns 404
 * - masterAuth requirement on both endpoints
 * - Hot-reload per-rule enable/disable
 *
 * @see packages/daemon/src/api/routes/admin.ts
 * @see packages/daemon/src/services/autostop/rule-registry.ts
 */

import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import type { Database as DatabaseType } from 'better-sqlite3';
import argon2 from 'argon2';
import { createDatabase, pushSchema } from '../infrastructure/database/index.js';
import { createApp } from '../api/server.js';
import { SettingsService } from '../infrastructure/settings/index.js';
import type { DaemonConfig } from '../infrastructure/config/loader.js';
import { AutoStopService } from '../services/autostop/autostop-service.js';
import { EventBus } from '@waiaas/core';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TEST_PASSWORD = 'test-master-password-autostop-api';
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
  return {
    Host: HOST,
    'X-Master-Password': TEST_PASSWORD,
  };
}

async function json(res: Response): Promise<any> {
  return await res.json();
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
  try { sqlite.close(); } catch { /* ok */ }
});

// ---------------------------------------------------------------------------
// GET /admin/autostop/rules
// ---------------------------------------------------------------------------

describe('GET /admin/autostop/rules', () => {
  it('returns 200 with 3 builtin rules when autoStopService is available', async () => {
    const config = fullConfig();
    const settingsService = new SettingsService({ db, config, masterPassword: TEST_PASSWORD });
    const eventBus = new EventBus();

    const autoStopService = new AutoStopService({
      sqlite,
      eventBus,
      killSwitchService: { activateKillSwitch: () => {} } as any,
      config: {
        enabled: true,
        consecutiveFailuresThreshold: 5,
        unusualActivityThreshold: 20,
        unusualActivityWindowSec: 300,
        idleTimeoutSec: 3600,
        idleCheckIntervalSec: 60,
      },
    });

    const app = createApp({
      db,
      masterPasswordHash: passwordHash,
      config,
      settingsService,
      autoStopService,
    });

    const res = await app.request('/v1/admin/autostop/rules', {
      headers: masterHeaders(),
    });

    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.globalEnabled).toBe(true);
    expect(body.rules).toHaveLength(3);

    // Verify rule shape
    const ruleIds = body.rules.map((r: any) => r.id).sort();
    expect(ruleIds).toEqual(['consecutive_failures', 'idle_timeout', 'unusual_activity']);

    for (const rule of body.rules) {
      expect(rule).toHaveProperty('id');
      expect(rule).toHaveProperty('displayName');
      expect(rule).toHaveProperty('description');
      expect(rule).toHaveProperty('enabled');
      expect(rule).toHaveProperty('subscribedEvents');
      expect(rule).toHaveProperty('config');
      expect(rule).toHaveProperty('state');
      expect(typeof rule.enabled).toBe('boolean');
    }
  });

  it('returns empty rules when autoStopService is not available', async () => {
    const config = fullConfig();
    const settingsService = new SettingsService({ db, config, masterPassword: TEST_PASSWORD });

    const app = createApp({
      db,
      masterPasswordHash: passwordHash,
      config,
      settingsService,
    });

    const res = await app.request('/v1/admin/autostop/rules', {
      headers: masterHeaders(),
    });

    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.globalEnabled).toBe(false);
    expect(body.rules).toEqual([]);
  });

  it('returns 401 without masterAuth', async () => {
    const config = fullConfig();
    const settingsService = new SettingsService({ db, config, masterPassword: TEST_PASSWORD });

    const app = createApp({
      db,
      masterPasswordHash: passwordHash,
      config,
      settingsService,
    });

    const res = await app.request('/v1/admin/autostop/rules', {
      headers: { Host: HOST },
    });

    expect(res.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// PUT /admin/autostop/rules/:id
// ---------------------------------------------------------------------------

describe('PUT /admin/autostop/rules/:id', () => {
  it('updates rule enabled state and returns updated rule info', async () => {
    const config = fullConfig();
    const settingsService = new SettingsService({ db, config, masterPassword: TEST_PASSWORD });
    const eventBus = new EventBus();

    const autoStopService = new AutoStopService({
      sqlite,
      eventBus,
      killSwitchService: { activateKillSwitch: () => {} } as any,
      config: {
        enabled: true,
        consecutiveFailuresThreshold: 5,
        unusualActivityThreshold: 20,
        unusualActivityWindowSec: 300,
        idleTimeoutSec: 3600,
        idleCheckIntervalSec: 60,
      },
    });

    const app = createApp({
      db,
      masterPasswordHash: passwordHash,
      config,
      settingsService,
      autoStopService,
    });

    // Disable the consecutive_failures rule
    const res = await app.request('/v1/admin/autostop/rules/consecutive_failures', {
      method: 'PUT',
      headers: { ...masterHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: false }),
    });

    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.id).toBe('consecutive_failures');
    expect(body.enabled).toBe(false);

    // Verify via GET
    const getRes = await app.request('/v1/admin/autostop/rules', {
      headers: masterHeaders(),
    });
    const getRules = await json(getRes);
    const rule = getRules.rules.find((r: any) => r.id === 'consecutive_failures');
    expect(rule.enabled).toBe(false);
  });

  it('updates rule config and returns updated rule info', async () => {
    const config = fullConfig();
    const settingsService = new SettingsService({ db, config, masterPassword: TEST_PASSWORD });
    const eventBus = new EventBus();

    const autoStopService = new AutoStopService({
      sqlite,
      eventBus,
      killSwitchService: { activateKillSwitch: () => {} } as any,
      config: {
        enabled: true,
        consecutiveFailuresThreshold: 5,
        unusualActivityThreshold: 20,
        unusualActivityWindowSec: 300,
        idleTimeoutSec: 3600,
        idleCheckIntervalSec: 60,
      },
    });

    const app = createApp({
      db,
      masterPasswordHash: passwordHash,
      config,
      settingsService,
      autoStopService,
    });

    // Update threshold config
    const res = await app.request('/v1/admin/autostop/rules/consecutive_failures', {
      method: 'PUT',
      headers: { ...masterHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ config: { threshold: 10 } }),
    });

    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.id).toBe('consecutive_failures');
    expect(body.config.threshold).toBe(10);
  });

  it('returns 404 for nonexistent rule ID', async () => {
    const config = fullConfig();
    const settingsService = new SettingsService({ db, config, masterPassword: TEST_PASSWORD });
    const eventBus = new EventBus();

    const autoStopService = new AutoStopService({
      sqlite,
      eventBus,
      killSwitchService: { activateKillSwitch: () => {} } as any,
      config: {
        enabled: true,
        consecutiveFailuresThreshold: 5,
        unusualActivityThreshold: 20,
        unusualActivityWindowSec: 300,
        idleTimeoutSec: 3600,
        idleCheckIntervalSec: 60,
      },
    });

    const app = createApp({
      db,
      masterPasswordHash: passwordHash,
      config,
      settingsService,
      autoStopService,
    });

    const res = await app.request('/v1/admin/autostop/rules/nonexistent_rule', {
      method: 'PUT',
      headers: { ...masterHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: false }),
    });

    expect(res.status).toBe(404);
    const body = await json(res);
    expect(body.code).toBe('RULE_NOT_FOUND');
  });

  it('returns 401 without masterAuth', async () => {
    const config = fullConfig();
    const settingsService = new SettingsService({ db, config, masterPassword: TEST_PASSWORD });

    const app = createApp({
      db,
      masterPasswordHash: passwordHash,
      config,
      settingsService,
    });

    const res = await app.request('/v1/admin/autostop/rules/consecutive_failures', {
      method: 'PUT',
      headers: { Host: HOST, 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: false }),
    });

    expect(res.status).toBe(401);
  });

  it('GET after PUT reflects updated enabled/config state', async () => {
    const config = fullConfig();
    const settingsService = new SettingsService({ db, config, masterPassword: TEST_PASSWORD });
    const eventBus = new EventBus();

    const autoStopService = new AutoStopService({
      sqlite,
      eventBus,
      killSwitchService: { activateKillSwitch: () => {} } as any,
      config: {
        enabled: true,
        consecutiveFailuresThreshold: 5,
        unusualActivityThreshold: 20,
        unusualActivityWindowSec: 300,
        idleTimeoutSec: 3600,
        idleCheckIntervalSec: 60,
      },
    });

    const app = createApp({
      db,
      masterPasswordHash: passwordHash,
      config,
      settingsService,
      autoStopService,
    });

    // Disable idle_timeout and update unusual_activity config
    await app.request('/v1/admin/autostop/rules/idle_timeout', {
      method: 'PUT',
      headers: { ...masterHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: false }),
    });

    await app.request('/v1/admin/autostop/rules/unusual_activity', {
      method: 'PUT',
      headers: { ...masterHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ config: { threshold: 50, windowSec: 600 } }),
    });

    // Verify via GET
    const getRes = await app.request('/v1/admin/autostop/rules', {
      headers: masterHeaders(),
    });

    const body = await json(getRes);
    const idleRule = body.rules.find((r: any) => r.id === 'idle_timeout');
    const unusualRule = body.rules.find((r: any) => r.id === 'unusual_activity');

    expect(idleRule.enabled).toBe(false);
    expect(unusualRule.config.threshold).toBe(50);
    expect(unusualRule.config.windowSec).toBe(600);
  });
});
