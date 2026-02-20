/**
 * Tests for admin settings API endpoints.
 *
 * 18 tests covering:
 * GET /v1/admin/settings:
 *   1. Returns 200 with all 11 categories (including signing_sdk, telegram)
 *   2. Returns default values when no DB entries exist
 *   3. Returns masked boolean for credential keys
 *   4. Returns actual values for non-credential keys
 *   5. Returns 401 without masterAuth header
 *   6. Returns all 11 categories including signing_sdk and telegram with defaults
 *
 * PUT /v1/admin/settings:
 *   7. Returns 200 and updates a single setting
 *   8. Returns 200 and updates multiple settings
 *   9. Returns 400 for unknown setting key
 *   10. Persists credential values encrypted in DB
 *   11. Returns updated masked settings in response body
 *   12. Returns 401 without masterAuth header
 *   13. Calls onSettingsChanged callback with changed keys
 *   14. Can update signing_sdk.enabled
 *   15. Can update signing_sdk.request_expiry_min
 *
 * POST /v1/admin/settings/test-rpc:
 *   16. Returns 200 with success:false for unreachable URL
 *   17. Returns 200 with success:false for invalid URL format
 *   18. Returns 401 without masterAuth header
 *
 * Uses createApp() + app.request() integration pattern with real SettingsService.
 *
 * @see packages/daemon/src/api/routes/admin.ts
 */

import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import type { Database as DatabaseType } from 'better-sqlite3';
import argon2 from 'argon2';
import { createDatabase, pushSchema } from '../infrastructure/database/index.js';
import { createApp } from '../api/server.js';
import { SettingsService } from '../infrastructure/settings/index.js';
import type { DaemonConfig } from '../infrastructure/config/loader.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TEST_PASSWORD = 'test-master-password-settings';
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
      evm_base_mainnet: '', evm_base_sepolia: '', evm_default_network: 'ethereum-sepolia' as const,
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
    ...overrides,
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
// GET /admin/settings
// ---------------------------------------------------------------------------

describe('GET /admin/settings', () => {
  it('should return 200 with all 11 categories', async () => {
    const config = fullConfig();
    const settingsService = new SettingsService({ db, config, masterPassword: TEST_PASSWORD });
    const app = createApp({
      db,
      masterPasswordHash: passwordHash,
      config,
      settingsService,
    });

    const res = await app.request('/v1/admin/settings', {
      headers: masterHeaders(),
    });

    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body).toHaveProperty('notifications');
    expect(body).toHaveProperty('rpc');
    expect(body).toHaveProperty('security');
    expect(body).toHaveProperty('daemon');
    expect(body).toHaveProperty('walletconnect');
    expect(body).toHaveProperty('oracle');
    expect(body).toHaveProperty('display');
    expect(body).toHaveProperty('autostop');
    expect(body).toHaveProperty('monitoring');
    expect(body).toHaveProperty('telegram');
    expect(body).toHaveProperty('signing_sdk');
  });

  it('should return default values when no DB entries exist', async () => {
    const config = fullConfig();
    const settingsService = new SettingsService({ db, config, masterPassword: TEST_PASSWORD });
    const app = createApp({
      db,
      masterPasswordHash: passwordHash,
      config,
      settingsService,
    });

    const res = await app.request('/v1/admin/settings', {
      headers: masterHeaders(),
    });

    expect(res.status).toBe(200);
    const body = await json(res);
    const daemon = body.daemon as Record<string, unknown>;
    expect(daemon.log_level).toBe('info'); // Default from SETTING_DEFINITIONS
  });

  it('should return masked boolean for credential keys', async () => {
    const config = fullConfig();
    const settingsService = new SettingsService({ db, config, masterPassword: TEST_PASSWORD });
    // Set a credential value
    settingsService.set('notifications.telegram_bot_token', '123:ABC-secret');

    const app = createApp({
      db,
      masterPasswordHash: passwordHash,
      config,
      settingsService,
    });

    const res = await app.request('/v1/admin/settings', {
      headers: masterHeaders(),
    });

    expect(res.status).toBe(200);
    const body = await json(res);
    const notifications = body.notifications as Record<string, unknown>;
    // Credential should be masked as boolean true (non-empty value)
    expect(notifications.telegram_bot_token).toBe(true);
    // Discord webhook not set -> masked as false
    expect(notifications.discord_webhook_url).toBe(false);
  });

  it('should return actual values for non-credential keys', async () => {
    const config = fullConfig();
    const settingsService = new SettingsService({ db, config, masterPassword: TEST_PASSWORD });
    settingsService.set('daemon.log_level', 'debug');

    const app = createApp({
      db,
      masterPasswordHash: passwordHash,
      config,
      settingsService,
    });

    const res = await app.request('/v1/admin/settings', {
      headers: masterHeaders(),
    });

    expect(res.status).toBe(200);
    const body = await json(res);
    const daemon = body.daemon as Record<string, unknown>;
    expect(daemon.log_level).toBe('debug');
  });

  it('should return 401 without masterAuth header', async () => {
    const config = fullConfig();
    const settingsService = new SettingsService({ db, config, masterPassword: TEST_PASSWORD });
    const app = createApp({
      db,
      masterPasswordHash: passwordHash,
      config,
      settingsService,
    });

    const res = await app.request('/v1/admin/settings', {
      headers: { Host: HOST },
    });

    expect(res.status).toBe(401);
  });

  it('should return all 11 categories including signing_sdk and telegram with defaults', async () => {
    const config = fullConfig();
    const settingsService = new SettingsService({ db, config, masterPassword: TEST_PASSWORD });
    const app = createApp({
      db,
      masterPasswordHash: passwordHash,
      config,
      settingsService,
    });

    const res = await app.request('/v1/admin/settings', {
      headers: masterHeaders(),
    });

    expect(res.status).toBe(200);
    const body = await json(res);

    // Verify all 11 category keys are present
    const expectedCategories = [
      'notifications', 'rpc', 'security', 'daemon', 'walletconnect',
      'oracle', 'display', 'autostop', 'monitoring', 'telegram', 'signing_sdk',
    ];
    for (const cat of expectedCategories) {
      expect(body).toHaveProperty(cat);
    }

    // Verify signing_sdk defaults
    const signingSDK = body.signing_sdk as Record<string, unknown>;
    expect(signingSDK.enabled).toBe('false');
    expect(signingSDK).toHaveProperty('request_expiry_min');

    // Verify telegram defaults
    const telegram = body.telegram as Record<string, unknown>;
    expect(telegram).toHaveProperty('enabled');
  });
});

// ---------------------------------------------------------------------------
// PUT /admin/settings
// ---------------------------------------------------------------------------

describe('PUT /admin/settings', () => {
  it('should update a single non-credential setting', async () => {
    const config = fullConfig();
    const settingsService = new SettingsService({ db, config, masterPassword: TEST_PASSWORD });
    const app = createApp({
      db,
      masterPasswordHash: passwordHash,
      config,
      settingsService,
    });

    const res = await app.request('/v1/admin/settings', {
      method: 'PUT',
      headers: masterJsonHeaders(),
      body: JSON.stringify({
        settings: [{ key: 'daemon.log_level', value: 'debug' }],
      }),
    });

    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.updated).toBe(1);
    // Verify persisted
    expect(settingsService.get('daemon.log_level')).toBe('debug');
  });

  it('should update multiple settings in one request', async () => {
    const config = fullConfig();
    const settingsService = new SettingsService({ db, config, masterPassword: TEST_PASSWORD });
    const app = createApp({
      db,
      masterPasswordHash: passwordHash,
      config,
      settingsService,
    });

    const res = await app.request('/v1/admin/settings', {
      method: 'PUT',
      headers: masterJsonHeaders(),
      body: JSON.stringify({
        settings: [
          { key: 'daemon.log_level', value: 'debug' },
          { key: 'security.session_ttl', value: '3600' },
          { key: 'notifications.locale', value: 'ko' },
        ],
      }),
    });

    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.updated).toBe(3);
    expect(settingsService.get('daemon.log_level')).toBe('debug');
    expect(settingsService.get('security.session_ttl')).toBe('3600');
    expect(settingsService.get('notifications.locale')).toBe('ko');
  });

  it('should return 400 for unknown setting key', async () => {
    const config = fullConfig();
    const settingsService = new SettingsService({ db, config, masterPassword: TEST_PASSWORD });
    const app = createApp({
      db,
      masterPasswordHash: passwordHash,
      config,
      settingsService,
    });

    const res = await app.request('/v1/admin/settings', {
      method: 'PUT',
      headers: masterJsonHeaders(),
      body: JSON.stringify({
        settings: [{ key: 'nonexistent.fake_key', value: 'hello' }],
      }),
    });

    expect(res.status).toBe(400);
    const body = await json(res);
    expect(body.code).toBe('ACTION_VALIDATION_FAILED');
  });

  it('should persist credential values encrypted in DB', async () => {
    const config = fullConfig();
    const settingsService = new SettingsService({ db, config, masterPassword: TEST_PASSWORD });
    const app = createApp({
      db,
      masterPasswordHash: passwordHash,
      config,
      settingsService,
    });

    const secret = 'super-secret-bot-token-12345';
    const res = await app.request('/v1/admin/settings', {
      method: 'PUT',
      headers: masterJsonHeaders(),
      body: JSON.stringify({
        settings: [{ key: 'notifications.telegram_bot_token', value: secret }],
      }),
    });

    expect(res.status).toBe(200);

    // Verify raw DB value is NOT the plaintext
    const row = sqlite.prepare('SELECT value, encrypted FROM settings WHERE key = ?').get('notifications.telegram_bot_token') as { value: string; encrypted: number } | undefined;
    expect(row).toBeDefined();
    expect(row!.encrypted).toBe(1);
    expect(row!.value).not.toBe(secret);

    // But SettingsService.get() decrypts it correctly
    expect(settingsService.get('notifications.telegram_bot_token')).toBe(secret);
  });

  it('should return updated masked settings in response body', async () => {
    const config = fullConfig();
    const settingsService = new SettingsService({ db, config, masterPassword: TEST_PASSWORD });
    const app = createApp({
      db,
      masterPasswordHash: passwordHash,
      config,
      settingsService,
    });

    const res = await app.request('/v1/admin/settings', {
      method: 'PUT',
      headers: masterJsonHeaders(),
      body: JSON.stringify({
        settings: [
          { key: 'daemon.log_level', value: 'warn' },
          { key: 'notifications.telegram_bot_token', value: 'secret-token' },
        ],
      }),
    });

    expect(res.status).toBe(200);
    const body = await json(res);
    const settings = body.settings as Record<string, Record<string, unknown>>;
    expect(settings.daemon.log_level).toBe('warn');
    // Credential should be masked as boolean in the response
    expect(settings.notifications.telegram_bot_token).toBe(true);
  });

  it('should return 401 without masterAuth header', async () => {
    const config = fullConfig();
    const settingsService = new SettingsService({ db, config, masterPassword: TEST_PASSWORD });
    const app = createApp({
      db,
      masterPasswordHash: passwordHash,
      config,
      settingsService,
    });

    const res = await app.request('/v1/admin/settings', {
      method: 'PUT',
      headers: { Host: HOST, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        settings: [{ key: 'daemon.log_level', value: 'debug' }],
      }),
    });

    expect(res.status).toBe(401);
  });

  it('should call onSettingsChanged callback with changed keys', async () => {
    const config = fullConfig();
    const settingsService = new SettingsService({ db, config, masterPassword: TEST_PASSWORD });
    const changedCallback = vi.fn();
    const app = createApp({
      db,
      masterPasswordHash: passwordHash,
      config,
      settingsService,
      onSettingsChanged: changedCallback,
    });

    const res = await app.request('/v1/admin/settings', {
      method: 'PUT',
      headers: masterJsonHeaders(),
      body: JSON.stringify({
        settings: [
          { key: 'daemon.log_level', value: 'debug' },
          { key: 'security.session_ttl', value: '7200' },
        ],
      }),
    });

    expect(res.status).toBe(200);
    expect(changedCallback).toHaveBeenCalledTimes(1);
    expect(changedCallback).toHaveBeenCalledWith([
      'daemon.log_level',
      'security.session_ttl',
    ]);
  });

  it('should update signing_sdk.enabled via PUT and persist', async () => {
    const config = fullConfig();
    const settingsService = new SettingsService({ db, config, masterPassword: TEST_PASSWORD });
    const app = createApp({
      db,
      masterPasswordHash: passwordHash,
      config,
      settingsService,
    });

    // Update signing_sdk.enabled to true
    const putRes = await app.request('/v1/admin/settings', {
      method: 'PUT',
      headers: masterJsonHeaders(),
      body: JSON.stringify({
        settings: [{ key: 'signing_sdk.enabled', value: 'true' }],
      }),
    });

    expect(putRes.status).toBe(200);
    const putBody = await json(putRes);
    const putSettings = putBody.settings as Record<string, Record<string, unknown>>;
    expect(putSettings.signing_sdk.enabled).toBe('true');

    // Verify persistence via GET
    const getRes = await app.request('/v1/admin/settings', {
      headers: masterHeaders(),
    });

    expect(getRes.status).toBe(200);
    const getBody = await json(getRes);
    const signingSDK = getBody.signing_sdk as Record<string, unknown>;
    expect(signingSDK.enabled).toBe('true');
  });

  it('should update signing_sdk.request_expiry_min via PUT', async () => {
    const config = fullConfig();
    const settingsService = new SettingsService({ db, config, masterPassword: TEST_PASSWORD });
    const app = createApp({
      db,
      masterPasswordHash: passwordHash,
      config,
      settingsService,
    });

    const res = await app.request('/v1/admin/settings', {
      method: 'PUT',
      headers: masterJsonHeaders(),
      body: JSON.stringify({
        settings: [{ key: 'signing_sdk.request_expiry_min', value: '15' }],
      }),
    });

    expect(res.status).toBe(200);
    const body = await json(res);
    const settings = body.settings as Record<string, Record<string, unknown>>;
    expect(settings.signing_sdk.request_expiry_min).toBe('15');
  });
});

// ---------------------------------------------------------------------------
// POST /admin/settings/test-rpc
// ---------------------------------------------------------------------------

describe('POST /admin/settings/test-rpc', () => {
  it('should return 200 with success:false for unreachable URL', async () => {
    const config = fullConfig();
    const settingsService = new SettingsService({ db, config, masterPassword: TEST_PASSWORD });
    const app = createApp({
      db,
      masterPasswordHash: passwordHash,
      config,
      settingsService,
    });

    const res = await app.request('/v1/admin/settings/test-rpc', {
      method: 'POST',
      headers: masterJsonHeaders(),
      body: JSON.stringify({
        url: 'http://127.0.0.1:1',
        chain: 'ethereum',
      }),
    });

    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.success).toBe(false);
    expect(body.error).toBeDefined();
    expect(typeof body.latencyMs).toBe('number');
  }, 10_000);

  it('should return 200 with success:false for invalid URL', async () => {
    const config = fullConfig();
    const settingsService = new SettingsService({ db, config, masterPassword: TEST_PASSWORD });
    const app = createApp({
      db,
      masterPasswordHash: passwordHash,
      config,
      settingsService,
    });

    // OpenAPI validation will reject non-URL strings with 400 since schema has z.string().url()
    const res = await app.request('/v1/admin/settings/test-rpc', {
      method: 'POST',
      headers: masterJsonHeaders(),
      body: JSON.stringify({
        url: 'not-a-valid-url',
        chain: 'ethereum',
      }),
    });

    // z.string().url() validation will reject this with 400
    expect(res.status).toBe(400);
  });

  it('should return 401 without masterAuth header', async () => {
    const config = fullConfig();
    const settingsService = new SettingsService({ db, config, masterPassword: TEST_PASSWORD });
    const app = createApp({
      db,
      masterPasswordHash: passwordHash,
      config,
      settingsService,
    });

    const res = await app.request('/v1/admin/settings/test-rpc', {
      method: 'POST',
      headers: { Host: HOST, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: 'http://localhost:8899',
        chain: 'solana',
      }),
    });

    expect(res.status).toBe(401);
  });
});
