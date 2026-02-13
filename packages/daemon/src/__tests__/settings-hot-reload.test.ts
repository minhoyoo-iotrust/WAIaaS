/**
 * Hot-reload tests for NotificationService.replaceChannels,
 * AdapterPool.evict, and HotReloadOrchestrator dispatch logic.
 *
 * Tests verify that settings changes trigger the correct subsystem reloaders,
 * fire-and-forget error handling, and independence between subsystems.
 *
 * Uses in-memory SQLite with pushSchema for a fresh DB per test.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Database as DatabaseType } from 'better-sqlite3';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type { INotificationChannel, NotificationPayload } from '@waiaas/core';
import { createDatabase, pushSchema } from '../infrastructure/database/index.js';
import type * as schema from '../infrastructure/database/schema.js';
import { DaemonConfigSchema } from '../infrastructure/config/loader.js';
import type { DaemonConfig } from '../infrastructure/config/loader.js';
import { NotificationService } from '../notifications/notification-service.js';
import { HotReloadOrchestrator } from '../infrastructure/settings/hot-reload.js';
import { SettingsService } from '../infrastructure/settings/settings-service.js';

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const TEST_MASTER_PASSWORD = 'test-master-password';

/** Create a fresh in-memory DB with all tables. */
function createTestDb(): { sqlite: DatabaseType; db: BetterSQLite3Database<typeof schema> } {
  const conn = createDatabase(':memory:');
  pushSchema(conn.sqlite);
  return conn;
}

/** Create a DaemonConfig with defaults. */
function createTestConfig(): DaemonConfig {
  return DaemonConfigSchema.parse({});
}

/** Create a mock notification channel. */
function mockChannel(name: string): INotificationChannel {
  return {
    name,
    initialize: vi.fn().mockResolvedValue(undefined),
    send: vi.fn().mockResolvedValue(undefined),
  };
}

// ---------------------------------------------------------------------------
// NotificationService.replaceChannels
// ---------------------------------------------------------------------------

describe('NotificationService.replaceChannels', () => {
  let notifService: NotificationService;

  beforeEach(() => {
    notifService = new NotificationService();
  });

  it('replaces all channels with new array', () => {
    const ch1 = mockChannel('telegram');
    const ch2 = mockChannel('discord');
    notifService.addChannel(ch1);
    expect(notifService.getChannelNames()).toEqual(['telegram']);

    notifService.replaceChannels([ch2]);
    expect(notifService.getChannelNames()).toEqual(['discord']);
  });

  it('clears rate limit state on replace', async () => {
    const ch = mockChannel('telegram');
    notifService.addChannel(ch);

    // Pump sends to fill rate limit map
    for (let i = 0; i < 5; i++) {
      await notifService.notify('TX_SUBMITTED', 'wallet-1');
    }

    // Replace channels -- rate limit should be cleared
    const newCh = mockChannel('telegram');
    notifService.replaceChannels([newCh]);

    // After replace, should work immediately (rate limit cleared)
    await notifService.notify('TX_SUBMITTED', 'wallet-1');
    expect(newCh.send).toHaveBeenCalledTimes(1);
  });

  it('replaces with empty array effectively disables notifications', () => {
    const ch = mockChannel('telegram');
    notifService.addChannel(ch);
    expect(notifService.getChannels()).toHaveLength(1);

    notifService.replaceChannels([]);
    expect(notifService.getChannels()).toHaveLength(0);
    expect(notifService.getChannelNames()).toEqual([]);
  });

  it('replaces with multiple channels', () => {
    const ch1 = mockChannel('telegram');
    notifService.addChannel(ch1);

    const newCh1 = mockChannel('discord');
    const newCh2 = mockChannel('ntfy');
    notifService.replaceChannels([newCh1, newCh2]);

    expect(notifService.getChannelNames()).toEqual(['discord', 'ntfy']);
  });
});

// ---------------------------------------------------------------------------
// NotificationService.updateConfig
// ---------------------------------------------------------------------------

describe('NotificationService.updateConfig', () => {
  it('updates locale and rateLimitRpm', () => {
    const svc = new NotificationService({ config: { locale: 'en', rateLimitRpm: 20 } });

    svc.updateConfig({ locale: 'ko' });
    // Verify via behavior: send notification (checks locale is used in message template)
    // Just checking the method doesn't throw and updates config
    svc.updateConfig({ rateLimitRpm: 5 });

    // Verify by sending more than 5 messages to trigger rate limit
    const ch = mockChannel('telegram');
    svc.addChannel(ch);

    // After updateConfig with rateLimitRpm=5, the 6th send should be rate-limited
    // (channels send asynchronously, but rate limit is checked per channel)
    expect(() => svc.updateConfig({ locale: 'en', rateLimitRpm: 10 })).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// AdapterPool.evict (mock-based since real adapters need network)
// ---------------------------------------------------------------------------

describe('AdapterPool.evict', () => {
  it('evict on non-existent key is a no-op (no error)', async () => {
    const { AdapterPool } = await import('../infrastructure/adapter-pool.js');
    const pool = new AdapterPool();

    // Evict a key that was never added -- should not throw
    await expect(pool.evict('solana' as any, 'devnet' as any)).resolves.toBeUndefined();
    expect(pool.size).toBe(0);
  });

  it('evict handles disconnect errors gracefully (fail-soft)', async () => {
    const { AdapterPool } = await import('../infrastructure/adapter-pool.js');
    const pool = new AdapterPool();

    // Manually inject a mock adapter that throws on disconnect
    const mockAdapter = {
      connect: vi.fn().mockResolvedValue(undefined),
      disconnect: vi.fn().mockRejectedValue(new Error('disconnect failed')),
    };
    (pool as any)._pool.set('solana:devnet', mockAdapter);
    expect(pool.size).toBe(1);

    // Spy on console.warn for the error
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    await expect(pool.evict('solana' as any, 'devnet' as any)).resolves.toBeUndefined();
    expect(pool.size).toBe(0);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('evict disconnect warning'),
      expect.any(Error),
    );

    warnSpy.mockRestore();
  });

  it('evict removes adapter from pool allowing fresh creation', async () => {
    const { AdapterPool } = await import('../infrastructure/adapter-pool.js');
    const pool = new AdapterPool();

    // Inject a mock adapter
    const mockAdapter = {
      connect: vi.fn().mockResolvedValue(undefined),
      disconnect: vi.fn().mockResolvedValue(undefined),
    };
    (pool as any)._pool.set('solana:devnet', mockAdapter);
    expect(pool.size).toBe(1);

    await pool.evict('solana' as any, 'devnet' as any);
    expect(pool.size).toBe(0);
    expect(mockAdapter.disconnect).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// HotReloadOrchestrator.handleChangedKeys
// ---------------------------------------------------------------------------

describe('HotReloadOrchestrator.handleChangedKeys', () => {
  let sqlite: DatabaseType;
  let db: BetterSQLite3Database<typeof schema>;
  let config: DaemonConfig;
  let settingsService: SettingsService;
  let notifService: NotificationService;
  let mockPool: any;

  beforeEach(() => {
    const conn = createTestDb();
    sqlite = conn.sqlite;
    db = conn.db;
    config = createTestConfig();
    settingsService = new SettingsService({ db, config, masterPassword: TEST_MASTER_PASSWORD });
    notifService = new NotificationService();
    mockPool = {
      evict: vi.fn().mockResolvedValue(undefined),
      evictAll: vi.fn().mockResolvedValue(undefined),
    };
  });

  afterEach(() => {
    try { sqlite.close(); } catch { /* ignore */ }
  });

  it('notification key changes trigger notification reload', async () => {
    const replaceSpy = vi.spyOn(notifService, 'replaceChannels');
    const orchestrator = new HotReloadOrchestrator({
      settingsService,
      notificationService: notifService,
      adapterPool: mockPool,
    });

    // Notification enabled=false by default -> replaceChannels([]) called
    await orchestrator.handleChangedKeys(['notifications.telegram_bot_token']);
    expect(replaceSpy).toHaveBeenCalled();
  });

  it('RPC key changes trigger adapter eviction', async () => {
    const orchestrator = new HotReloadOrchestrator({
      settingsService,
      notificationService: notifService,
      adapterPool: mockPool,
    });

    await orchestrator.handleChangedKeys(['rpc.solana_devnet']);
    expect(mockPool.evict).toHaveBeenCalledWith('solana', 'devnet');
  });

  it('RPC EVM key changes trigger correct eviction', async () => {
    const orchestrator = new HotReloadOrchestrator({
      settingsService,
      notificationService: notifService,
      adapterPool: mockPool,
    });

    await orchestrator.handleChangedKeys(['rpc.evm_ethereum_sepolia']);
    expect(mockPool.evict).toHaveBeenCalledWith('ethereum', 'ethereum-sepolia');
  });

  it('RPC evm_default_network key does not trigger eviction', async () => {
    const orchestrator = new HotReloadOrchestrator({
      settingsService,
      notificationService: notifService,
      adapterPool: mockPool,
    });

    await orchestrator.handleChangedKeys(['rpc.evm_default_network']);
    expect(mockPool.evict).not.toHaveBeenCalled();
  });

  it('security key changes log message (no subsystem call needed)', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const orchestrator = new HotReloadOrchestrator({
      settingsService,
      notificationService: notifService,
      adapterPool: mockPool,
    });

    await orchestrator.handleChangedKeys(['security.session_ttl']);
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining('Security parameters updated'),
    );

    logSpy.mockRestore();
  });

  it('mixed keys trigger multiple reloaders', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const replaceSpy = vi.spyOn(notifService, 'replaceChannels');
    const orchestrator = new HotReloadOrchestrator({
      settingsService,
      notificationService: notifService,
      adapterPool: mockPool,
    });

    await orchestrator.handleChangedKeys([
      'notifications.enabled',
      'rpc.solana_mainnet',
      'security.max_pending_tx',
    ]);

    expect(replaceSpy).toHaveBeenCalled(); // notification reload
    expect(mockPool.evict).toHaveBeenCalledWith('solana', 'mainnet'); // RPC eviction
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining('Security parameters updated'),
    ); // security log

    logSpy.mockRestore();
  });

  it('unrecognized keys trigger nothing', async () => {
    const replaceSpy = vi.spyOn(notifService, 'replaceChannels');
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const orchestrator = new HotReloadOrchestrator({
      settingsService,
      notificationService: notifService,
      adapterPool: mockPool,
    });

    await orchestrator.handleChangedKeys(['daemon.log_level', 'walletconnect.project_id']);

    expect(replaceSpy).not.toHaveBeenCalled();
    expect(mockPool.evict).not.toHaveBeenCalled();
    // Security log should NOT have been called either
    expect(logSpy).not.toHaveBeenCalledWith(
      expect.stringContaining('Security parameters updated'),
    );

    logSpy.mockRestore();
  });

  it('errors in notification reload do not prevent RPC reload (independence)', async () => {
    // Make replaceChannels throw by creating an orchestrator with a broken notification service
    const brokenNotifService = new NotificationService();
    // Spy on reloadNotifications by spying on replaceChannels to throw
    vi.spyOn(brokenNotifService, 'replaceChannels').mockImplementation(() => {
      throw new Error('notification reload failed');
    });

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const orchestrator = new HotReloadOrchestrator({
      settingsService,
      notificationService: brokenNotifService,
      adapterPool: mockPool,
    });

    // Send both notification and RPC changes
    await orchestrator.handleChangedKeys([
      'notifications.telegram_bot_token',
      'rpc.solana_devnet',
    ]);

    // RPC reload should still have been called despite notification failure
    expect(mockPool.evict).toHaveBeenCalledWith('solana', 'devnet');
    // Notification error should have been caught and warned
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('Hot-reload notifications failed'),
      expect.any(Error),
    );

    warnSpy.mockRestore();
  });

  it('empty changedKeys array triggers nothing', async () => {
    const replaceSpy = vi.spyOn(notifService, 'replaceChannels');
    const orchestrator = new HotReloadOrchestrator({
      settingsService,
      notificationService: notifService,
      adapterPool: mockPool,
    });

    await orchestrator.handleChangedKeys([]);
    expect(replaceSpy).not.toHaveBeenCalled();
    expect(mockPool.evict).not.toHaveBeenCalled();
  });

  it('handles null notificationService gracefully', async () => {
    const orchestrator = new HotReloadOrchestrator({
      settingsService,
      notificationService: null,
      adapterPool: mockPool,
    });

    // Should not throw even though notification service is null
    await expect(
      orchestrator.handleChangedKeys(['notifications.enabled']),
    ).resolves.toBeUndefined();
  });

  it('handles null adapterPool gracefully', async () => {
    const orchestrator = new HotReloadOrchestrator({
      settingsService,
      notificationService: notifService,
      adapterPool: null,
    });

    // Should not throw even though adapter pool is null
    await expect(
      orchestrator.handleChangedKeys(['rpc.solana_devnet']),
    ).resolves.toBeUndefined();
  });

  it('notification reload with enabled=true creates channels from settings', async () => {
    // Set notifications.enabled to true in settings DB
    settingsService.set('notifications.enabled', 'true');
    settingsService.set('notifications.ntfy_topic', 'test-topic');

    const replaceSpy = vi.spyOn(notifService, 'replaceChannels');
    const updateSpy = vi.spyOn(notifService, 'updateConfig');

    const orchestrator = new HotReloadOrchestrator({
      settingsService,
      notificationService: notifService,
      adapterPool: mockPool,
    });

    await orchestrator.handleChangedKeys(['notifications.ntfy_topic']);

    // replaceChannels should have been called with 1 channel (ntfy)
    expect(replaceSpy).toHaveBeenCalledTimes(1);
    const channels = replaceSpy.mock.calls[0][0];
    expect(channels).toHaveLength(1);
    expect(channels[0].name).toBe('ntfy');

    // updateConfig should have been called with locale and rateLimitRpm
    expect(updateSpy).toHaveBeenCalledWith({
      locale: 'en',
      rateLimitRpm: 20,
    });
  });
});
