/**
 * Balance Monitor integration tests: config management + settings pipeline + hot-reload + i18n.
 *
 * Tests cover:
 * - DaemonConfigSchema monitoring default values
 * - SETTING_DEFINITIONS monitoring category presence
 * - SettingsService -> BalanceMonitorConfig pipeline
 * - LOW_BALANCE NotificationEventType
 * - i18n LOW_BALANCE templates (en + ko)
 * - HotReloadOrchestrator monitoring key change detection
 * - Config validation boundaries (Zod range checks)
 *
 * @see packages/daemon/src/services/monitoring/balance-monitor-service.ts
 * @see packages/daemon/src/infrastructure/config/loader.ts
 * @see packages/daemon/src/infrastructure/settings/setting-keys.ts
 */

import { describe, it, expect, vi } from 'vitest';
import { DaemonConfigSchema } from '../infrastructure/config/loader.js';
import { SETTING_DEFINITIONS, SETTING_CATEGORIES } from '../infrastructure/settings/setting-keys.js';
import { createDatabase, pushSchema } from '../infrastructure/database/index.js';
import { SettingsService } from '../infrastructure/settings/settings-service.js';
import { HotReloadOrchestrator } from '../infrastructure/settings/hot-reload.js';
import { NOTIFICATION_EVENT_TYPES, getMessages } from '@waiaas/core';
import { getNotificationMessage } from '../notifications/templates/message-templates.js';
import type { BalanceMonitorService } from '../services/monitoring/balance-monitor-service.js';
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
// Tests: config.toml monitoring keys
// ---------------------------------------------------------------------------

describe('Balance Monitor config management', () => {
  it('DaemonConfigSchema에 monitoring 키가 빈 config에서 기본값 적용', () => {
    const config = DaemonConfigSchema.parse({});

    expect(config.security.monitoring_check_interval_sec).toBe(300);
    expect(config.security.monitoring_low_balance_threshold_sol).toBe(0.01);
    expect(config.security.monitoring_low_balance_threshold_eth).toBe(0.005);
    expect(config.security.monitoring_cooldown_hours).toBe(24);
    expect(config.security.monitoring_enabled).toBe(true);
  });

  it('SETTING_DEFINITIONS에 monitoring 카테고리 5개 키 존재', () => {
    const monitoringDefs = SETTING_DEFINITIONS.filter((d) => d.category === 'monitoring');
    expect(monitoringDefs).toHaveLength(5);

    const keys = monitoringDefs.map((d) => d.key);
    expect(keys).toContain('monitoring.check_interval_sec');
    expect(keys).toContain('monitoring.low_balance_threshold_sol');
    expect(keys).toContain('monitoring.low_balance_threshold_eth');
    expect(keys).toContain('monitoring.cooldown_hours');
    expect(keys).toContain('monitoring.enabled');
  });

  it('SETTING_CATEGORIES에 monitoring이 포함됨', () => {
    expect(SETTING_CATEGORIES).toContain('monitoring');
  });

  it('SettingsService -> BalanceMonitorConfig 파이프라인 검증', () => {
    const { sqlite, db } = createTestDb();
    const config = DaemonConfigSchema.parse({
      security: {
        monitoring_check_interval_sec: 600,
        monitoring_low_balance_threshold_sol: 0.05,
        monitoring_low_balance_threshold_eth: 0.01,
        monitoring_cooldown_hours: 12,
        monitoring_enabled: false,
      },
    });

    const settingsService = new SettingsService({ db, config, masterPassword: 'test' });

    // SettingsService falls back to config.toml value
    expect(settingsService.get('monitoring.check_interval_sec')).toBe('600');
    expect(settingsService.get('monitoring.low_balance_threshold_sol')).toBe('0.05');
    expect(settingsService.get('monitoring.low_balance_threshold_eth')).toBe('0.01');
    expect(settingsService.get('monitoring.cooldown_hours')).toBe('12');
    expect(settingsService.get('monitoring.enabled')).toBe('false');

    // Build BalanceMonitorConfig from settings
    const monitorConfig = {
      checkIntervalSec: parseInt(settingsService.get('monitoring.check_interval_sec'), 10),
      lowBalanceThresholdSol: parseFloat(settingsService.get('monitoring.low_balance_threshold_sol')),
      lowBalanceThresholdEth: parseFloat(settingsService.get('monitoring.low_balance_threshold_eth')),
      cooldownHours: parseInt(settingsService.get('monitoring.cooldown_hours'), 10),
      enabled: settingsService.get('monitoring.enabled') === 'true',
    };

    expect(monitorConfig.checkIntervalSec).toBe(600);
    expect(monitorConfig.lowBalanceThresholdSol).toBe(0.05);
    expect(monitorConfig.lowBalanceThresholdEth).toBe(0.01);
    expect(monitorConfig.cooldownHours).toBe(12);
    expect(monitorConfig.enabled).toBe(false);

    sqlite.close();
  });
});

// ---------------------------------------------------------------------------
// Tests: NOTIFICATION_EVENT_TYPES
// ---------------------------------------------------------------------------

describe('Balance Monitor notification types', () => {
  it('NOTIFICATION_EVENT_TYPES에 LOW_BALANCE 포함', () => {
    expect(NOTIFICATION_EVENT_TYPES).toContain('LOW_BALANCE');
  });
});

// ---------------------------------------------------------------------------
// Tests: i18n LOW_BALANCE templates
// ---------------------------------------------------------------------------

describe('Balance Monitor i18n templates', () => {
  it('LOW_BALANCE en 템플릿이 올바른 보간 결과 반환', () => {
    const msg = getNotificationMessage('LOW_BALANCE', 'en', {
      walletId: 'w1',
      balance: '0.005',
      currency: 'SOL',
      threshold: '0.01',
    });

    expect(msg.title).toBe('Low Balance Alert');
    expect(msg.body).toContain('w1');
    expect(msg.body).toContain('0.005');
    expect(msg.body).toContain('SOL');
    expect(msg.body).toContain('0.01');
  });

  it('LOW_BALANCE ko 템플릿이 한글로 반환', () => {
    const msg = getNotificationMessage('LOW_BALANCE', 'ko', {
      walletId: 'w1',
      balance: '0.005',
      currency: 'SOL',
      threshold: '0.01',
    });

    expect(msg.title).toBe('잔액 부족 알림');
    expect(msg.body).toContain('w1');
    expect(msg.body).toContain('0.005');
    expect(msg.body).toContain('SOL');
    expect(msg.body).toContain('0.01');
  });
});

// ---------------------------------------------------------------------------
// Tests: HotReloadOrchestrator monitoring
// ---------------------------------------------------------------------------

describe('HotReloadOrchestrator monitoring', () => {
  it('monitoring 키 변경 시 BalanceMonitorService.updateConfig() 호출', async () => {
    const { sqlite, db } = createTestDb();
    const config = DaemonConfigSchema.parse({});
    const settingsService = new SettingsService({ db, config, masterPassword: 'test' });

    const mockUpdateConfig = vi.fn();
    const mockBalanceMonitorService = { updateConfig: mockUpdateConfig } as unknown as BalanceMonitorService;

    const hotReloader = new HotReloadOrchestrator({
      settingsService,
      balanceMonitorService: mockBalanceMonitorService,
    });

    // Simulate monitoring key change
    await hotReloader.handleChangedKeys(['monitoring.check_interval_sec']);

    expect(mockUpdateConfig).toHaveBeenCalledTimes(1);
    expect(mockUpdateConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        checkIntervalSec: 300, // default value from settings
        lowBalanceThresholdSol: 0.01,
        lowBalanceThresholdEth: 0.005,
        cooldownHours: 24,
        enabled: true,
      }),
    );

    sqlite.close();
  });

  it('non-monitoring 키 변경 시 BalanceMonitorService.updateConfig() 호출 안 됨', async () => {
    const { sqlite, db } = createTestDb();
    const config = DaemonConfigSchema.parse({});
    const settingsService = new SettingsService({ db, config, masterPassword: 'test' });

    const mockUpdateConfig = vi.fn();
    const mockBalanceMonitorService = { updateConfig: mockUpdateConfig } as unknown as BalanceMonitorService;

    const hotReloader = new HotReloadOrchestrator({
      settingsService,
      balanceMonitorService: mockBalanceMonitorService,
    });

    // Simulate non-monitoring key change
    await hotReloader.handleChangedKeys(['display.currency']);

    expect(mockUpdateConfig).not.toHaveBeenCalled();

    sqlite.close();
  });

  it('SettingsService에서 변경된 monitoring 값이 updateConfig에 반영됨', async () => {
    const { sqlite, db } = createTestDb();
    const config = DaemonConfigSchema.parse({});
    const settingsService = new SettingsService({ db, config, masterPassword: 'test' });

    // Set custom values before hot-reload
    settingsService.set('monitoring.check_interval_sec', '600');
    settingsService.set('monitoring.low_balance_threshold_sol', '0.05');
    settingsService.set('monitoring.enabled', 'false');

    const mockUpdateConfig = vi.fn();
    const mockBalanceMonitorService = { updateConfig: mockUpdateConfig } as unknown as BalanceMonitorService;

    const hotReloader = new HotReloadOrchestrator({
      settingsService,
      balanceMonitorService: mockBalanceMonitorService,
    });

    await hotReloader.handleChangedKeys(['monitoring.check_interval_sec']);

    expect(mockUpdateConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        checkIntervalSec: 600,
        lowBalanceThresholdSol: 0.05,
        enabled: false,
      }),
    );

    sqlite.close();
  });
});

// ---------------------------------------------------------------------------
// Tests: config validation boundaries
// ---------------------------------------------------------------------------

describe('Balance Monitor config validation', () => {
  it('monitoring_check_interval_sec가 범위 밖(59)이면 Zod 에러 발생', () => {
    expect(() =>
      DaemonConfigSchema.parse({
        security: { monitoring_check_interval_sec: 59 },
      }),
    ).toThrow();
  });

  it('monitoring_check_interval_sec가 범위 밖(3601)이면 Zod 에러 발생', () => {
    expect(() =>
      DaemonConfigSchema.parse({
        security: { monitoring_check_interval_sec: 3601 },
      }),
    ).toThrow();
  });

  it('monitoring_low_balance_threshold_sol이 범위 밖(0)이면 Zod 에러 발생', () => {
    expect(() =>
      DaemonConfigSchema.parse({
        security: { monitoring_low_balance_threshold_sol: 0 },
      }),
    ).toThrow();
  });

  it('monitoring_cooldown_hours가 범위 밖(0)이면 Zod 에러 발생', () => {
    expect(() =>
      DaemonConfigSchema.parse({
        security: { monitoring_cooldown_hours: 0 },
      }),
    ).toThrow();
  });
});
