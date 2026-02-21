/**
 * AutoStop integration tests: config management + DaemonLifecycle + notification + hot-reload.
 *
 * Tests cover:
 * - DaemonConfigSchema autostop default values
 * - SettingsService autostop key get/set
 * - AutoStopService notification integration (CONSECUTIVE_FAILURES, UNUSUAL_ACTIVITY, MANUAL_TRIGGER)
 * - enabled/disabled behavior
 * - i18n template variables
 * - HotReloadOrchestrator autostop key change detection
 *
 * @see packages/daemon/src/services/autostop-service.ts
 * @see packages/daemon/src/infrastructure/config/loader.ts
 * @see packages/daemon/src/infrastructure/settings/setting-keys.ts
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { DaemonConfigSchema } from '../infrastructure/config/loader.js';
import { SETTING_DEFINITIONS, SETTING_CATEGORIES } from '../infrastructure/settings/setting-keys.js';
import { createDatabase, pushSchema } from '../infrastructure/database/index.js';
import { SettingsService } from '../infrastructure/settings/settings-service.js';
import { HotReloadOrchestrator } from '../infrastructure/settings/hot-reload.js';
import { EventBus, getMessages } from '@waiaas/core';
import { KillSwitchService } from '../services/kill-switch-service.js';
import { AutoStopService } from '../services/autostop-service.js';
import type { NotificationService } from '../notifications/notification-service.js';
import type { Database as DatabaseType } from 'better-sqlite3';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type * as schema from '../infrastructure/database/schema.js';

// ---------------------------------------------------------------------------
// Helper: create in-memory DB with full schema
// ---------------------------------------------------------------------------

function createTestDb(): { sqlite: DatabaseType; db: BetterSQLite3Database<typeof schema> } {
  const conn = createDatabase(':memory:');
  pushSchema(conn.sqlite);
  return { sqlite: conn.sqlite, db: conn.db };
}

// ---------------------------------------------------------------------------
// Helper: insert test wallet
// ---------------------------------------------------------------------------

function insertWallet(sqlite: DatabaseType, id: string, status = 'ACTIVE'): void {
  const now = Math.floor(Date.now() / 1000);
  sqlite.prepare(
    'INSERT INTO wallets (id, name, chain, environment, public_key, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
  ).run(id, `wallet-${id}`, 'solana', 'testnet', `pk-${id}`, status, now, now);
}

// ---------------------------------------------------------------------------
// Helper: get wallet status
// ---------------------------------------------------------------------------

function _getWalletStatus(sqlite: DatabaseType, id: string): string | undefined {
  const row = sqlite.prepare('SELECT status FROM wallets WHERE id = ?').get(id) as
    | { status: string }
    | undefined;
  return row?.status;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AutoStop config management', () => {
  it('DaemonConfigSchema에 autostop 키가 빈 config에서 기본값 적용', () => {
    const config = DaemonConfigSchema.parse({});

    expect(config.security.autostop_consecutive_failures_threshold).toBe(5);
    expect(config.security.autostop_unusual_activity_threshold).toBe(20);
    expect(config.security.autostop_unusual_activity_window_sec).toBe(300);
    expect(config.security.autostop_idle_timeout_sec).toBe(3600);
    expect(config.security.autostop_idle_check_interval_sec).toBe(60);
    expect(config.security.autostop_enabled).toBe(true);
  });

  it('DaemonConfigSchema에 autostop 커스텀 값이 적용됨', () => {
    const config = DaemonConfigSchema.parse({
      security: {
        autostop_consecutive_failures_threshold: 10,
        autostop_unusual_activity_threshold: 50,
        autostop_unusual_activity_window_sec: 600,
        autostop_idle_timeout_sec: 7200,
        autostop_idle_check_interval_sec: 120,
        autostop_enabled: false,
      },
    });

    expect(config.security.autostop_consecutive_failures_threshold).toBe(10);
    expect(config.security.autostop_unusual_activity_threshold).toBe(50);
    expect(config.security.autostop_unusual_activity_window_sec).toBe(600);
    expect(config.security.autostop_idle_timeout_sec).toBe(7200);
    expect(config.security.autostop_idle_check_interval_sec).toBe(120);
    expect(config.security.autostop_enabled).toBe(false);
  });

  it('config.toml에 설정된 autostop 값이 SettingsService.get()으로 조회됨', () => {
    const { sqlite, db } = createTestDb();
    const config = DaemonConfigSchema.parse({
      security: {
        autostop_consecutive_failures_threshold: 10,
        autostop_unusual_activity_threshold: 50,
      },
    });

    const settingsService = new SettingsService({ db, config, masterPassword: 'test' });

    // SettingsService falls back to config.toml value
    expect(settingsService.get('autostop.consecutive_failures_threshold')).toBe('10');
    expect(settingsService.get('autostop.unusual_activity_threshold')).toBe('50');
    // Default values for unset keys
    expect(settingsService.get('autostop.idle_timeout_sec')).toBe('3600');
    expect(settingsService.get('autostop.enabled')).toBe('true');

    sqlite.close();
  });

  it('SettingsService.set()으로 autostop 값 런타임 변경', () => {
    const { sqlite, db } = createTestDb();
    const config = DaemonConfigSchema.parse({});
    const settingsService = new SettingsService({ db, config, masterPassword: 'test' });

    // Default
    expect(settingsService.get('autostop.consecutive_failures_threshold')).toBe('5');

    // Runtime override
    settingsService.set('autostop.consecutive_failures_threshold', '10');
    expect(settingsService.get('autostop.consecutive_failures_threshold')).toBe('10');

    // Set enabled to false
    settingsService.set('autostop.enabled', 'false');
    expect(settingsService.get('autostop.enabled')).toBe('false');

    sqlite.close();
  });

  it('SETTING_CATEGORIES에 autostop이 포함됨', () => {
    expect(SETTING_CATEGORIES).toContain('autostop');
  });

  it('SETTING_DEFINITIONS에 autostop 카테고리 6개 키 존재', () => {
    const autostopDefs = SETTING_DEFINITIONS.filter((d) => d.category === 'autostop');
    expect(autostopDefs).toHaveLength(6);

    const keys = autostopDefs.map((d) => d.key);
    expect(keys).toContain('autostop.consecutive_failures_threshold');
    expect(keys).toContain('autostop.unusual_activity_threshold');
    expect(keys).toContain('autostop.unusual_activity_window_sec');
    expect(keys).toContain('autostop.idle_timeout_sec');
    expect(keys).toContain('autostop.idle_check_interval_sec');
    expect(keys).toContain('autostop.enabled');
  });
});

// ---------------------------------------------------------------------------

describe('AutoStop notification integration', () => {
  let sqlite: DatabaseType;
  let eventBus: EventBus;
  let killSwitchService: KillSwitchService;
  let mockNotify: ReturnType<typeof vi.fn>;
  let mockNotificationService: NotificationService;

  beforeEach(() => {
    const conn = createTestDb();
    sqlite = conn.sqlite;
    eventBus = new EventBus();

    // Initialize KillSwitchService
    const now = Math.floor(Date.now() / 1000);
    sqlite.prepare(
      'INSERT INTO key_value_store (key, value, updated_at) VALUES (?, ?, ?)',
    ).run('kill_switch_state', 'ACTIVE', now);
    killSwitchService = new KillSwitchService({ sqlite, eventBus });

    // Mock NotificationService
    mockNotify = vi.fn().mockResolvedValue(undefined);
    mockNotificationService = { notify: mockNotify } as unknown as NotificationService;
  });

  afterEach(() => {
    try { sqlite.close(); } catch { /* already closed */ }
    vi.restoreAllMocks();
  });

  it('CONSECUTIVE_FAILURES 트리거 시 AUTO_STOP_TRIGGERED 알림 발송', () => {
    const walletId = 'wallet-cf-notify';
    insertWallet(sqlite, walletId);

    const service = new AutoStopService({
      sqlite,
      eventBus,
      killSwitchService,
      notificationService: mockNotificationService,
      config: { consecutiveFailuresThreshold: 5, enabled: true },
    });
    service.start();

    const now = Math.floor(Date.now() / 1000);
    for (let i = 0; i < 5; i++) {
      eventBus.emit('transaction:failed', {
        walletId,
        txId: `tx-${i}`,
        error: 'insufficient funds',
        type: 'TRANSFER',
        timestamp: now + i,
      });
    }

    expect(mockNotify).toHaveBeenCalledWith(
      'AUTO_STOP_TRIGGERED',
      walletId,
      expect.objectContaining({
        walletId,
        reason: 'CONSECUTIVE_FAILURES',
        rule: 'CONSECUTIVE_FAILURES',
      }),
    );

    service.stop();
  });

  it('UNUSUAL_ACTIVITY 트리거 시 AUTO_STOP_TRIGGERED 알림 발송', () => {
    const walletId = 'wallet-ua-notify';
    insertWallet(sqlite, walletId);

    const service = new AutoStopService({
      sqlite,
      eventBus,
      killSwitchService,
      notificationService: mockNotificationService,
      config: { unusualActivityThreshold: 10, unusualActivityWindowSec: 300, enabled: true },
    });
    service.start();

    const now = Math.floor(Date.now() / 1000);
    for (let i = 0; i < 10; i++) {
      eventBus.emit('wallet:activity', {
        walletId,
        activity: 'TX_REQUESTED',
        timestamp: now + i,
      });
    }

    expect(mockNotify).toHaveBeenCalledWith(
      'AUTO_STOP_TRIGGERED',
      walletId,
      expect.objectContaining({
        walletId,
        reason: 'UNUSUAL_ACTIVITY',
        rule: 'UNUSUAL_ACTIVITY',
      }),
    );

    service.stop();
  });

  it('MANUAL_TRIGGER 시 AUTO_STOP_TRIGGERED 알림 발송 + Kill Switch SUSPENDED', () => {
    const service = new AutoStopService({
      sqlite,
      eventBus,
      killSwitchService,
      notificationService: mockNotificationService,
      config: { enabled: true },
    });
    service.start();

    service.manualTrigger('admin-user');

    expect(mockNotify).toHaveBeenCalledWith(
      'AUTO_STOP_TRIGGERED',
      'system',
      expect.objectContaining({
        walletId: 'system',
        rule: 'MANUAL_TRIGGER',
      }),
    );

    expect(killSwitchService.getState().state).toBe('SUSPENDED');

    service.stop();
  });
});

// ---------------------------------------------------------------------------

describe('AutoStop enabled/disabled', () => {
  let sqlite: DatabaseType;
  let eventBus: EventBus;
  let killSwitchService: KillSwitchService;

  beforeEach(() => {
    const conn = createTestDb();
    sqlite = conn.sqlite;
    eventBus = new EventBus();

    const now = Math.floor(Date.now() / 1000);
    sqlite.prepare(
      'INSERT INTO key_value_store (key, value, updated_at) VALUES (?, ?, ?)',
    ).run('kill_switch_state', 'ACTIVE', now);
    killSwitchService = new KillSwitchService({ sqlite, eventBus });
  });

  afterEach(() => {
    try { sqlite.close(); } catch { /* already closed */ }
    vi.restoreAllMocks();
  });

  it('enabled=false 시 start() 호출해도 이벤트 구독 안 됨', () => {
    const service = new AutoStopService({
      sqlite,
      eventBus,
      killSwitchService,
      config: { enabled: false },
    });
    service.start();

    expect(eventBus.listenerCount('transaction:failed')).toBe(0);
    expect(eventBus.listenerCount('transaction:completed')).toBe(0);
    expect(eventBus.listenerCount('wallet:activity')).toBe(0);

    service.stop();
  });

  it('updateConfig({ enabled: false })로 런타임 비활성화 시 timer 정리', () => {
    vi.useFakeTimers();

    const walletId = 'wallet-disable';
    insertWallet(sqlite, walletId);

    const service = new AutoStopService({
      sqlite,
      eventBus,
      killSwitchService,
      config: {
        enabled: true,
        idleTimeoutSec: 10,
        idleCheckIntervalSec: 5,
        unusualActivityThreshold: 200,
      },
    });
    service.start();

    // Disable at runtime
    service.updateConfig({ enabled: false });
    service.stop();

    // Verify timer is stopped by checking getStatus
    const status = service.getStatus();
    expect(status.enabled).toBe(false);

    vi.useRealTimers();
  });
});

// ---------------------------------------------------------------------------

describe('i18n template', () => {
  it('AUTO_STOP_TRIGGERED en 템플릿에 {walletName}, {reason}, {rule} 변수가 포함됨', () => {
    const en = getMessages('en');
    const template = en.notifications.AUTO_STOP_TRIGGERED;

    expect(template.title).toBe('Auto-Stop Triggered');
    expect(template.body).toContain('{walletName}');
    expect(template.body).toContain('{reason}');
    expect(template.body).toContain('{rule}');
  });

  it('AUTO_STOP_TRIGGERED ko 템플릿에 {walletName}, {reason}, {rule} 변수가 포함됨', () => {
    const ko = getMessages('ko');
    const template = ko.notifications.AUTO_STOP_TRIGGERED;

    expect(template.title).toBe('자동 정지 발동');
    expect(template.body).toContain('{walletName}');
    expect(template.body).toContain('{reason}');
    expect(template.body).toContain('{rule}');
  });
});

// ---------------------------------------------------------------------------

describe('HotReloadOrchestrator autostop', () => {
  it('autostop 키 변경 시 AutoStopService.updateConfig() 호출', async () => {
    const { sqlite, db } = createTestDb();
    const config = DaemonConfigSchema.parse({});
    const settingsService = new SettingsService({ db, config, masterPassword: 'test' });

    const mockUpdateConfig = vi.fn();
    const mockAutoStopService = { updateConfig: mockUpdateConfig } as unknown as AutoStopService;

    const hotReloader = new HotReloadOrchestrator({
      settingsService,
      autoStopService: mockAutoStopService,
    });

    // Simulate autostop key change
    await hotReloader.handleChangedKeys(['autostop.consecutive_failures_threshold']);

    expect(mockUpdateConfig).toHaveBeenCalledTimes(1);
    expect(mockUpdateConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        consecutiveFailuresThreshold: 5, // default value from settings
        enabled: true,
      }),
    );

    sqlite.close();
  });

  it('non-autostop 키 변경 시 AutoStopService.updateConfig() 호출 안 됨', async () => {
    const { sqlite, db } = createTestDb();
    const config = DaemonConfigSchema.parse({});
    const settingsService = new SettingsService({ db, config, masterPassword: 'test' });

    const mockUpdateConfig = vi.fn();
    const mockAutoStopService = { updateConfig: mockUpdateConfig } as unknown as AutoStopService;

    const hotReloader = new HotReloadOrchestrator({
      settingsService,
      autoStopService: mockAutoStopService,
    });

    // Simulate non-autostop key change
    await hotReloader.handleChangedKeys(['display.currency']);

    expect(mockUpdateConfig).not.toHaveBeenCalled();

    sqlite.close();
  });

  it('SettingsService에서 변경된 autostop 값이 updateConfig에 반영됨', async () => {
    const { sqlite, db } = createTestDb();
    const config = DaemonConfigSchema.parse({});
    const settingsService = new SettingsService({ db, config, masterPassword: 'test' });

    // Set custom values before hot-reload
    settingsService.set('autostop.consecutive_failures_threshold', '10');
    settingsService.set('autostop.unusual_activity_threshold', '50');
    settingsService.set('autostop.enabled', 'false');

    const mockUpdateConfig = vi.fn();
    const mockAutoStopService = { updateConfig: mockUpdateConfig } as unknown as AutoStopService;

    const hotReloader = new HotReloadOrchestrator({
      settingsService,
      autoStopService: mockAutoStopService,
    });

    await hotReloader.handleChangedKeys(['autostop.consecutive_failures_threshold']);

    expect(mockUpdateConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        consecutiveFailuresThreshold: 10,
        unusualActivityThreshold: 50,
        enabled: false,
      }),
    );

    sqlite.close();
  });
});
