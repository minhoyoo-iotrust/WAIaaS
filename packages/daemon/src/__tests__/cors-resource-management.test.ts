/**
 * Tests for CORS middleware, notification channel timeouts, and AutoStop
 * EventBus listener cleanup.
 *
 * Covers:
 *   CORS-01: Preflight OPTIONS from allowed origin returns 204 + headers
 *   CORS-02: Disallowed origin receives no CORS headers
 *   RSRC-01: Notification channels include AbortSignal on fetch
 *   RSRC-02: AutoStop start/stop cycle does not accumulate EventBus listeners
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createApp } from '../api/server.js';
import type { DaemonConfig } from '../infrastructure/config/loader.js';
import { DiscordChannel } from '../notifications/channels/discord.js';
import { SlackChannel } from '../notifications/channels/slack.js';
import { EventBus } from '@waiaas/core';
import { AutoStopService } from '../services/autostop/autostop-service.js';
import type { NotificationPayload } from '@waiaas/core';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mockConfig(overrides: Partial<DaemonConfig['security']> = {}): DaemonConfig {
  return {
    daemon: {
      port: 3100, hostname: '127.0.0.1', log_level: 'info', log_file: 'logs/daemon.log',
      log_max_size: '50MB', log_max_files: 5, pid_file: 'daemon.pid', shutdown_timeout: 30,
      dev_mode: false, admin_ui: true, admin_timeout: 900,
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
      dedup_ttl: 300, telegram_bot_token: '', telegram_chat_id: '', discord_webhook_url: '',
      locale: 'en' as const, rate_limit_rpm: 20,
      slack_webhook_url: '',
    },
    security: {
      jwt_secret: '', max_sessions_per_wallet: 5, max_pending_tx: 10,
      nonce_storage: 'memory' as const, nonce_cache_max: 1000, nonce_cache_ttl: 300,
      rate_limit_global_ip_rpm: 1000, rate_limit_session_rpm: 300, rate_limit_tx_rpm: 10,
      cors_origins: ['http://localhost:3100'], autostop_consecutive_failures_threshold: 5,
      policy_defaults_delay_seconds: 300, policy_defaults_approval_timeout: 3600,
      kill_switch_recovery_cooldown: 1800, kill_switch_max_recovery_attempts: 3,
      ...overrides,
    },
    walletconnect: { project_id: '' },
  } as DaemonConfig;
}

function minimalPayload(): NotificationPayload {
  return {
    title: 'Test',
    body: 'Test body',
    message: 'Test message',
    eventType: 'TX_CONFIRMED',
    priority: 'medium',
    timestamp: Math.floor(Date.now() / 1000),
  };
}

// ---------------------------------------------------------------------------
// Group 1: CORS middleware
// ---------------------------------------------------------------------------

describe('CORS middleware (CORS-01, CORS-02)', () => {
  it('preflight OPTIONS from allowed origin returns 204 + Access-Control-Allow-Origin', async () => {
    const settingsService = { get: (key: string) => key === 'cors_origins' ? ['http://localhost:3100'] : undefined };
    const app = createApp({ config: mockConfig(), settingsService: settingsService as never });

    const res = await app.request('/health', {
      method: 'OPTIONS',
      headers: {
        'Origin': 'http://localhost:3100',
        'Access-Control-Request-Method': 'GET',
        'Host': '127.0.0.1:3100',
      },
    });

    expect(res.status).toBe(204);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('http://localhost:3100');
  });

  it('GET from allowed origin includes Access-Control-Allow-Origin header', async () => {
    const settingsService = { get: (key: string) => key === 'cors_origins' ? ['http://localhost:3100'] : undefined };
    const app = createApp({ config: mockConfig(), settingsService: settingsService as never });

    const res = await app.request('/health', {
      method: 'GET',
      headers: {
        'Origin': 'http://localhost:3100',
        'Host': '127.0.0.1:3100',
      },
    });

    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('http://localhost:3100');
  });

  it('GET from disallowed origin does NOT include Access-Control-Allow-Origin header', async () => {
    const settingsService = { get: (key: string) => key === 'cors_origins' ? ['http://localhost:3100'] : undefined };
    const app = createApp({ config: mockConfig(), settingsService: settingsService as never });

    const res = await app.request('/health', {
      method: 'GET',
      headers: {
        'Origin': 'http://evil.com',
        'Host': '127.0.0.1:3100',
      },
    });

    expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Group 2: Notification channel timeouts (RSRC-01)
// ---------------------------------------------------------------------------

describe('Notification channel fetch timeout (RSRC-01)', () => {
  it('DiscordChannel passes AbortSignal to fetch', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('ok', { status: 200 }));
    try {
      const channel = new DiscordChannel();
      await channel.initialize({ discord_webhook_url: 'https://discord.com/api/webhooks/test' });
      await channel.send(minimalPayload());

      expect(fetchSpy).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          signal: expect.any(AbortSignal),
        }),
      );
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it('SlackChannel passes AbortSignal to fetch', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('ok', { status: 200 }));
    try {
      const channel = new SlackChannel();
      await channel.initialize({ slack_webhook_url: 'https://hooks.slack.com/services/test' });
      await channel.send(minimalPayload());

      expect(fetchSpy).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          signal: expect.any(AbortSignal),
        }),
      );
    } finally {
      fetchSpy.mockRestore();
    }
  });
});

// ---------------------------------------------------------------------------
// Group 3: AutoStop EventBus listener cleanup (RSRC-02)
// ---------------------------------------------------------------------------

describe('AutoStop EventBus listener cleanup (RSRC-02)', () => {
  let eventBus: EventBus;
  let service: AutoStopService;

  beforeEach(() => {
    eventBus = new EventBus();
    const sqlite = {
      prepare: () => ({ run: () => ({ changes: 0 }), all: () => [], get: () => undefined }),
    } as never;
    const killSwitchService = {
      activateWithCascade: vi.fn(),
      getState: () => ({ state: 'ACTIVE', activatedAt: null, activatedBy: null }),
    } as never;

    service = new AutoStopService({
      sqlite,
      eventBus,
      killSwitchService,
    });
  });

  it('start() registers 3 EventBus listeners', () => {
    service.start();

    expect(eventBus.listenerCount('transaction:failed')).toBe(1);
    expect(eventBus.listenerCount('transaction:completed')).toBe(1);
    expect(eventBus.listenerCount('wallet:activity')).toBe(1);
  });

  it('stop() removes all 3 EventBus listeners', () => {
    service.start();
    service.stop();

    expect(eventBus.listenerCount('transaction:failed')).toBe(0);
    expect(eventBus.listenerCount('transaction:completed')).toBe(0);
    expect(eventBus.listenerCount('wallet:activity')).toBe(0);
  });

  it('start/stop/start cycle does not accumulate duplicate listeners', () => {
    service.start();
    service.stop();
    service.start();

    expect(eventBus.listenerCount('transaction:failed')).toBe(1);
    expect(eventBus.listenerCount('transaction:completed')).toBe(1);
    expect(eventBus.listenerCount('wallet:activity')).toBe(1);
  });
});
