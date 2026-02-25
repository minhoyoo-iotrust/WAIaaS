/**
 * Integration tests for RpcPool notification event wiring.
 *
 * 4 tests verifying MNTR-01 through MNTR-04:
 * 1. RPC_HEALTH_DEGRADED notification on cooldown entry (MNTR-02)
 * 2. RPC_ALL_FAILED notification when all endpoints fail (MNTR-03)
 * 3. RPC_RECOVERED notification on recovery (MNTR-04)
 * 4. GET /admin/rpc-status returns per-network status (MNTR-01)
 *
 * Tests the end-to-end wiring from RpcPool event emission to notification dispatch,
 * matching the onEvent callback pattern used in daemon.ts Step 4.
 *
 * @see packages/daemon/src/lifecycle/daemon.ts (Step 4)
 * @see packages/core/src/rpc/rpc-pool.ts (RpcPoolEvent)
 */

import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';
import type { Database as DatabaseType } from 'better-sqlite3';
import argon2 from 'argon2';
import { RpcPool } from '@waiaas/core';
import type { RpcPoolEvent } from '@waiaas/core';
import { createDatabase, pushSchema } from '../infrastructure/database/index.js';
import { createApp } from '../api/server.js';
import { SettingsService } from '../infrastructure/settings/index.js';
import { AdapterPool } from '../infrastructure/adapter-pool.js';
import type { DaemonConfig } from '../infrastructure/config/loader.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TEST_PASSWORD = 'test-master-password-rpc-notif';
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
  };
}

/**
 * Creates the same onEvent -> notify wiring as daemon.ts Step 4,
 * using a mock notify function instead of real NotificationService.
 */
function createNotifyingPool(
  notifyFn: (eventType: string, walletId: string, vars: Record<string, string>) => void,
): RpcPool {
  return new RpcPool({
    onEvent: (event: RpcPoolEvent) => {
      const vars: Record<string, string> = {
        network: event.network,
        url: event.url,
        errorCount: String(event.failureCount),
        totalEndpoints: String(event.totalEndpoints),
      };
      notifyFn(event.type, 'system', vars);
    },
  });
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
// RPC Pool Notification Integration
// ---------------------------------------------------------------------------

describe('RPC Pool Notification Integration', () => {
  it('RPC_HEALTH_DEGRADED notification on cooldown entry (MNTR-02)', () => {
    const notifySpy = vi.fn();
    const pool = createNotifyingPool(notifySpy);

    pool.register('mainnet', ['https://rpc1.example.com', 'https://rpc2.example.com']);
    pool.reportFailure('mainnet', 'https://rpc1.example.com');

    expect(notifySpy).toHaveBeenCalledTimes(1);
    expect(notifySpy).toHaveBeenCalledWith(
      'RPC_HEALTH_DEGRADED',
      'system',
      expect.objectContaining({
        network: 'mainnet',
        url: 'https://rpc1.example.com',
        errorCount: '1',
        totalEndpoints: '2',
      }),
    );
  });

  it('RPC_ALL_FAILED notification when all endpoints fail (MNTR-03)', () => {
    const notifySpy = vi.fn();
    const pool = createNotifyingPool(notifySpy);

    pool.register('mainnet', ['https://rpc1.example.com', 'https://rpc2.example.com']);
    pool.reportFailure('mainnet', 'https://rpc1.example.com');
    pool.reportFailure('mainnet', 'https://rpc2.example.com');

    // Should have: 2x RPC_HEALTH_DEGRADED + 1x RPC_ALL_FAILED = 3 calls
    expect(notifySpy).toHaveBeenCalledTimes(3);

    // Verify RPC_ALL_FAILED was emitted
    const allFailedCall = notifySpy.mock.calls.find(
      (call: [string, string, Record<string, string>]) => call[0] === 'RPC_ALL_FAILED',
    );
    expect(allFailedCall).toBeDefined();
    expect(allFailedCall![1]).toBe('system');
    expect(allFailedCall![2]).toMatchObject({
      network: 'mainnet',
      url: 'https://rpc2.example.com',
      totalEndpoints: '2',
    });
  });

  it('RPC_RECOVERED notification on recovery (MNTR-04)', () => {
    const notifySpy = vi.fn();
    const pool = createNotifyingPool(notifySpy);

    pool.register('mainnet', ['https://rpc1.example.com']);
    pool.reportFailure('mainnet', 'https://rpc1.example.com');

    // Clear spy to isolate recovery event
    notifySpy.mockClear();

    pool.reportSuccess('mainnet', 'https://rpc1.example.com');

    expect(notifySpy).toHaveBeenCalledTimes(1);
    expect(notifySpy).toHaveBeenCalledWith(
      'RPC_RECOVERED',
      'system',
      expect.objectContaining({
        network: 'mainnet',
        url: 'https://rpc1.example.com',
        errorCount: '0',
        totalEndpoints: '1',
      }),
    );
  });

  it('GET /admin/rpc-status returns per-network status (MNTR-01 verification)', async () => {
    const config = fullConfig();
    const settingsService = new SettingsService({ db, config, masterPassword: TEST_PASSWORD });

    const rpcPool = new RpcPool();
    rpcPool.register('mainnet', ['https://api.mainnet-beta.solana.com']);
    rpcPool.register('ethereum-sepolia', ['https://sepolia.drpc.org']);

    const adapterPool = new AdapterPool(rpcPool);

    const app = createApp({
      db,
      masterPasswordHash: passwordHash,
      config,
      settingsService,
      adapterPool,
    });

    const res = await app.request('/v1/admin/rpc-status', {
      headers: {
        Host: HOST,
        'X-Master-Password': TEST_PASSWORD,
      },
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { networks: Record<string, { url: string; status: string; failureCount: number; cooldownRemainingMs: number }[]> };
    expect(body).toHaveProperty('networks');
    expect(body.networks).toHaveProperty('mainnet');
    expect(body.networks).toHaveProperty('ethereum-sepolia');
    expect(body.networks['mainnet']).toHaveLength(1);
    expect(body.networks['mainnet']![0]).toMatchObject({
      url: 'https://api.mainnet-beta.solana.com',
      status: 'available',
      failureCount: 0,
    });
  });
});
