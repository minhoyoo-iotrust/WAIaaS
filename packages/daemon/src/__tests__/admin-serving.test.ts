/**
 * Tests for Admin UI serving, CSP headers, and kill switch bypass.
 *
 * 4 tests covering:
 * 1. admin_ui=true registers /admin/* routes (CSP header present)
 * 2. admin_ui=false returns 404 without CSP headers
 * 3. CSP header includes strict directives on /admin/* responses
 * 4. Kill switch bypasses /admin/* paths
 *
 * Uses in-memory SQLite + Hono app.request() (same pattern as api-admin-endpoints.test.ts).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createApp } from '../api/server.js';
import { createDatabase, pushSchema } from '../infrastructure/database/index.js';
import type { DatabaseConnection } from '../infrastructure/database/index.js';
import type { DaemonConfig } from '../infrastructure/config/loader.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mockConfig(overrides: Partial<DaemonConfig['daemon']> = {}): DaemonConfig {
  return {
    daemon: {
      port: 3100, hostname: '127.0.0.1', log_level: 'info', log_file: 'logs/daemon.log',
      log_max_size: '50MB', log_max_files: 5, pid_file: 'daemon.pid', shutdown_timeout: 30,
      dev_mode: false, admin_ui: true, admin_timeout: 900, ...overrides,
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
      dedup_ttl: 300, telegram_bot_token: '', telegram_chat_id: '', discord_webhook_url: '',
      ntfy_server: 'https://ntfy.sh', ntfy_topic: '', locale: 'en' as const, rate_limit_rpm: 20,
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

const HOST = '127.0.0.1:3100';

// ---------------------------------------------------------------------------
// Admin UI serving
// ---------------------------------------------------------------------------

describe('Admin UI serving', () => {
  let conn: DatabaseConnection;

  beforeEach(() => {
    conn = createDatabase(':memory:');
    pushSchema(conn.sqlite);
  });

  afterEach(() => {
    conn.sqlite.close();
  });

  it('should register /admin/* routes when admin_ui=true (CSP header present)', async () => {
    const app = createApp({ db: conn.db, sqlite: conn.sqlite, config: mockConfig({ admin_ui: true }) });
    const res = await app.request('/admin/test.js', { headers: { Host: HOST } });
    // Static file won't exist, but CSP middleware runs because /admin/* route is registered
    const csp = res.headers.get('Content-Security-Policy');
    expect(csp).toContain("script-src 'self'");
  });

  it('should return 404 without CSP when admin_ui=false', async () => {
    const app = createApp({ db: conn.db, sqlite: conn.sqlite, config: mockConfig({ admin_ui: false }) });
    const res = await app.request('/admin/index.html', { headers: { Host: HOST } });
    expect(res.status).toBe(404);
    const csp = res.headers.get('Content-Security-Policy');
    expect(csp).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// CSP header
// ---------------------------------------------------------------------------

describe('CSP header', () => {
  let conn: DatabaseConnection;

  beforeEach(() => {
    conn = createDatabase(':memory:');
    pushSchema(conn.sqlite);
  });

  afterEach(() => {
    conn.sqlite.close();
  });

  it('should include strict CSP directives on /admin/* responses', async () => {
    const app = createApp({ db: conn.db, sqlite: conn.sqlite, config: mockConfig() });
    const res = await app.request('/admin/test.css', { headers: { Host: HOST } });
    const csp = res.headers.get('Content-Security-Policy');
    expect(csp).toBeTruthy();
    expect(csp).toContain("default-src 'none'");
    expect(csp).toContain("script-src 'self'");
    expect(csp).toContain("style-src 'self' 'unsafe-inline'");
    expect(csp).toContain("connect-src 'self'");
  });
});

// ---------------------------------------------------------------------------
// Kill switch bypass
// ---------------------------------------------------------------------------

describe('Kill switch bypass', () => {
  let conn: DatabaseConnection;

  beforeEach(() => {
    conn = createDatabase(':memory:');
    pushSchema(conn.sqlite);
  });

  afterEach(() => {
    conn.sqlite.close();
  });

  it('should bypass kill switch for /admin/* paths', async () => {
    const app = createApp({
      db: conn.db,
      sqlite: conn.sqlite,
      config: mockConfig(),
      getKillSwitchState: () => 'SUSPENDED',
    });

    // /admin/ should NOT be blocked by kill switch (CSP header proves /admin/* middleware runs)
    const adminRes = await app.request('/admin/test.js', { headers: { Host: HOST } });
    // Should not be 503 (kill switch error)
    expect(adminRes.status).not.toBe(503);

    // /health should bypass kill switch too
    const healthRes = await app.request('/health', { headers: { Host: HOST } });
    expect(healthRes.status).toBe(200);

    // But regular API routes SHOULD be blocked with 503 SYSTEM_LOCKED
    const walletRes = await app.request('/v1/wallets', { headers: { Host: HOST } });
    expect(walletRes.status).toBe(503);
  });
});
