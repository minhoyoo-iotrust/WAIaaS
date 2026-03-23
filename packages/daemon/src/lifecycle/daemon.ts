/**
 * DaemonLifecycle - orchestrates daemon startup (6 steps) and shutdown (10 steps).
 *
 * This file contains the class shell with field declarations, getters, and thin
 * method wrappers. The actual startup/shutdown/pipeline logic is in:
 *   - daemon-startup.ts (6-step startup sequence)
 *   - daemon-shutdown.ts (10-step shutdown cascade)
 *   - daemon-pipeline.ts (pipeline re-entry: stage4, stage5, approval handling)
 *
 * @see docs/28-daemon-lifecycle-cli.md
 */

import { writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import type { Database as DatabaseType } from 'better-sqlite3';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { WAIaaSError, EventBus, RpcPool, ConsoleLogger } from '@waiaas/core';
import type { IPriceOracle, IForexRateService, ContractNameRegistry } from '@waiaas/core';
import type { AdapterPool } from '../infrastructure/adapter-pool.js';
import type { LocalKeyStore } from '../infrastructure/keystore/index.js';
import type { DaemonConfig } from '../infrastructure/config/index.js';
import type { BackgroundWorkers } from './workers.js';
import type * as schema from '../infrastructure/database/schema.js';
import { DelayQueue } from '../workflow/delay-queue.js';
import { ApprovalWorkflow } from '../workflow/approval-workflow.js';
import { JwtSecretManager } from '../infrastructure/jwt/index.js';
import { KillSwitchService } from '../services/kill-switch-service.js';
import { AutoStopService } from '../services/autostop-service.js';
import { InMemoryCounter } from '../infrastructure/metrics/in-memory-counter.js';
import { AdminStatsService } from '../services/admin-stats-service.js';
import type { MasterPasswordRef } from '../api/middleware/master-auth.js';
import type { NotificationService } from '../notifications/notification-service.js';
import type { SettingsService } from '../infrastructure/settings/settings-service.js';
import type { ActionProviderRegistry } from '../infrastructure/action/action-provider-registry.js';
import type { TelegramBotService } from '../infrastructure/telegram/telegram-bot-service.js';
import type { WcSessionService, WcServiceRef } from '../services/wc-session-service.js';
import type { WcSigningBridgeRef } from '../services/wc-signing-bridge.js';
import type { ApprovalChannelRouter } from '../services/signing-sdk/approval-channel-router.js';
import type { VersionCheckService } from '../infrastructure/version/version-check-service.js';
import type { IncomingTxMonitorService } from '../services/incoming/incoming-tx-monitor-service.js';
import type { AsyncPollingService } from '../services/async-polling-service.js';
import type { PositionTracker } from '../services/defi/position-tracker.js';
import type { DeFiMonitorService } from '../services/monitoring/defi-monitor-service.js';
import type { EncryptedBackupService } from '../infrastructure/backup/encrypted-backup-service.js';
import type { WebhookService } from '../services/webhook-service.js';
import type { BalanceMonitorService } from '../services/monitoring/balance-monitor-service.js';
import type { HyperliquidMarketData } from '@waiaas/actions';
import type { PolymarketInfraDeps } from '../api/routes/polymarket.js';
import { startDaemon } from './daemon-startup.js';
import { shutdownDaemon } from './daemon-shutdown.js';
import {
  executeFromStage4 as pipelineExecuteFromStage4,
  executeFromStage5 as pipelineExecuteFromStage5,
  handleApprovalApproved as pipelineHandleApprovalApproved,
} from './daemon-pipeline.js';

// ---------------------------------------------------------------------------
// proper-lockfile import (CJS package, use dynamic import)
// ---------------------------------------------------------------------------

interface LockfileModule {
  lock(path: string, opts?: Record<string, unknown>): Promise<() => Promise<void>>;
  unlock(path: string, opts?: Record<string, unknown>): Promise<void>;
  check(path: string, opts?: Record<string, unknown>): Promise<boolean>;
}

let _lockfile: LockfileModule | null = null;

async function getLockfile(): Promise<LockfileModule> {
  if (_lockfile) return _lockfile;
  // proper-lockfile is CJS; use dynamic import
  _lockfile = (await import('proper-lockfile')) as unknown as LockfileModule;
  return _lockfile;
}

// ---------------------------------------------------------------------------
// Timeout utility
// ---------------------------------------------------------------------------

/**
 * Race a promise against a timeout. Rejects with WAIaaSError on timeout.
 */
export function withTimeout<T>(promise: Promise<T>, ms: number, errorCode: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(
        new WAIaaSError('SYSTEM_LOCKED', {
          message: `${errorCode}: Timeout after ${ms}ms`,
        }),
      );
    }, ms);

    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err: unknown) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

// ---------------------------------------------------------------------------
// DaemonState interface - exposes internal fields for extracted modules
// ---------------------------------------------------------------------------

/**
 * Public interface for daemon state. Extracted modules (startup, shutdown, pipeline)
 * access fields through this interface instead of private class members.
 */
export interface DaemonState {
  _isShuttingDown: boolean;
  sqlite: DatabaseType | null;
  _db: BetterSQLite3Database<typeof schema> | null;
  keyStore: LocalKeyStore | null;
  masterPassword: string;
  passwordRef: MasterPasswordRef | null;
  rpcPool: RpcPool | null;
  rpcCaller: { call: (params: { to: string; data: string; chainId?: number }) => Promise<string> } | undefined;
  adapterPool: AdapterPool | null;
  httpServer: { close: () => void } | null;
  workers: BackgroundWorkers | null;
  releaseLock: (() => Promise<void>) | null;
  pidPath: string;
  _config: DaemonConfig | null;
  forceTimer: ReturnType<typeof setTimeout> | null;
  delayQueue: DelayQueue | null;
  approvalWorkflow: ApprovalWorkflow | null;
  jwtSecretManager: JwtSecretManager | null;
  masterPasswordHash: string;
  notificationService: NotificationService | null;
  _settingsService: SettingsService | null;
  priceOracle: IPriceOracle | undefined;
  actionProviderRegistry: ActionProviderRegistry | null;
  forexRateService: IForexRateService | null;
  eventBus: EventBus;
  killSwitchService: KillSwitchService | null;
  autoStopService: AutoStopService | null;
  balanceMonitorService: BalanceMonitorService | null;
  telegramBotService: TelegramBotService | null;
  telegramBotRef: { current: TelegramBotService | null };
  wcSessionService: WcSessionService | null;
  wcServiceRef: WcServiceRef;
  wcSigningBridgeRef: WcSigningBridgeRef;
  approvalChannelRouter: ApprovalChannelRouter | null;
  _versionCheckService: VersionCheckService | null;
  incomingTxMonitorService: IncomingTxMonitorService | null;
  _asyncPollingService: AsyncPollingService | null;
  positionTracker: PositionTracker | null;
  defiMonitorService: DeFiMonitorService | null;
  _encryptedBackupService: EncryptedBackupService | null;
  webhookService: WebhookService | null;
  metricsCounter: InMemoryCounter | null;
  adminStatsService: AdminStatsService | null;
  hyperliquidMarketData: HyperliquidMarketData | null;
  polymarketInfra: PolymarketInfraDeps | null;
  contractNameRegistry: ContractNameRegistry | null;
  daemonStartTime: number;
  logger: ConsoleLogger;

  // Methods needed by extracted modules
  acquireDaemonLock(dataDir: string): Promise<void>;
  handleApprovalApproved(txId: string): void;
  executeFromStage4(txId: string, walletId: string): Promise<void>;
  executeFromStage5(txId: string, walletId: string): Promise<void>;
}

// ---------------------------------------------------------------------------
// DaemonLifecycle
// ---------------------------------------------------------------------------

export class DaemonLifecycle implements DaemonState {
  _isShuttingDown = false;
  sqlite: DatabaseType | null = null;
  _db: BetterSQLite3Database<typeof schema> | null = null;
  keyStore: LocalKeyStore | null = null;
  masterPassword = '';
  passwordRef: MasterPasswordRef | null = null;
  rpcPool: RpcPool | null = null;
  rpcCaller: { call: (params: { to: string; data: string; chainId?: number }) => Promise<string> } | undefined;
  adapterPool: AdapterPool | null = null;
  httpServer: { close: () => void } | null = null;
  workers: BackgroundWorkers | null = null;
  releaseLock: (() => Promise<void>) | null = null;
  pidPath = '';
  _config: DaemonConfig | null = null;
  forceTimer: ReturnType<typeof setTimeout> | null = null;
  delayQueue: DelayQueue | null = null;
  approvalWorkflow: ApprovalWorkflow | null = null;
  jwtSecretManager: JwtSecretManager | null = null;
  masterPasswordHash = '';
  notificationService: NotificationService | null = null;
  _settingsService: SettingsService | null = null;
  priceOracle: IPriceOracle | undefined;
  actionProviderRegistry: ActionProviderRegistry | null = null;
  forexRateService: IForexRateService | null = null;
  eventBus: EventBus = new EventBus();
  killSwitchService: KillSwitchService | null = null;
  autoStopService: AutoStopService | null = null;
  balanceMonitorService: BalanceMonitorService | null = null;
  telegramBotService: TelegramBotService | null = null;
  telegramBotRef: { current: TelegramBotService | null } = { current: null };
  wcSessionService: WcSessionService | null = null;
  wcServiceRef: WcServiceRef = { current: null };
  wcSigningBridgeRef: WcSigningBridgeRef = { current: null };
  approvalChannelRouter: ApprovalChannelRouter | null = null;
  _versionCheckService: VersionCheckService | null = null;
  incomingTxMonitorService: IncomingTxMonitorService | null = null;
  _asyncPollingService: AsyncPollingService | null = null;
  positionTracker: PositionTracker | null = null;
  defiMonitorService: DeFiMonitorService | null = null;
  _encryptedBackupService: EncryptedBackupService | null = null;
  webhookService: WebhookService | null = null;
  metricsCounter: InMemoryCounter | null = null;
  adminStatsService: AdminStatsService | null = null;
  hyperliquidMarketData: HyperliquidMarketData | null = null;
  polymarketInfra: PolymarketInfraDeps | null = null;
  contractNameRegistry: ContractNameRegistry | null = null;
  daemonStartTime: number = Math.floor(Date.now() / 1000);
  logger: ConsoleLogger = new ConsoleLogger('daemon', 'info');

  /** Whether shutdown has been initiated. */
  get isShuttingDown(): boolean {
    return this._isShuttingDown;
  }

  /** Current config (available after start). */
  get config(): DaemonConfig | null {
    return this._config;
  }

  /** Drizzle database instance (available after start, used by route handlers). */
  get db(): BetterSQLite3Database<typeof schema> | null {
    return this._db;
  }

  /** SettingsService instance (available after Step 2, used by route handlers). */
  get settingsService(): SettingsService | null {
    return this._settingsService;
  }

  /** VersionCheckService instance (available after Step 6, used by Health endpoint). */
  get versionCheckService(): VersionCheckService | null {
    return this._versionCheckService;
  }

  /** AsyncPollingService instance (available after Step 4c-10, used by action providers to register trackers). */
  get pollingService(): AsyncPollingService | null {
    return this._asyncPollingService;
  }

  /** PositionTracker instance (available after Step 4c-10.5). */
  get positionTrackerInstance(): PositionTracker | null {
    return this.positionTracker;
  }

  /** RpcPool instance (available after Step 4, used by IncomingTxMonitor for URL resolution). */
  get rpcPoolInstance(): RpcPool | null {
    return this.rpcPool;
  }

  /**
   * 6-step startup sequence with per-step timeouts and 90s overall cap.
   */
  async start(dataDir: string, masterPassword: string): Promise<void> {
    await withTimeout(startDaemon(this, dataDir, masterPassword), 90_000, 'STARTUP_TIMEOUT');
  }

  /**
   * 10-step graceful shutdown cascade.
   */
  async shutdown(signal: string): Promise<void> {
    await shutdownDaemon(this, signal);
  }

  /**
   * Re-enter the pipeline at stage4 for a gas-condition-met transaction.
   */
  async executeFromStage4(txId: string, walletId: string): Promise<void> {
    await pipelineExecuteFromStage4(this, txId, walletId);
  }

  /**
   * Resume pipeline after APPROVAL tier owner sign-off.
   */
  handleApprovalApproved(txId: string): void {
    pipelineHandleApprovalApproved(this, txId);
  }

  /**
   * Re-enter the pipeline at stage5 for a delay-expired transaction.
   */
  async executeFromStage5(txId: string, walletId: string): Promise<void> {
    await pipelineExecuteFromStage5(this, txId, walletId);
  }

  /**
   * Acquire an exclusive daemon lock to prevent multiple instances.
   * Uses proper-lockfile for cross-platform support.
   */
  async acquireDaemonLock(dataDir: string): Promise<void> {
    const lockPath = join(dataDir, 'daemon.lock');

    // Ensure the lock file exists (proper-lockfile requires it)
    if (!existsSync(lockPath)) {
      writeFileSync(lockPath, '', 'utf-8');
    }

    try {
      const lockfile = await getLockfile();
      this.releaseLock = await lockfile.lock(lockPath, {
        stale: 10_000, // Consider lock stale after 10s without update
        update: 5_000, // Update lock mtime every 5s
        retries: 0, // No retries -- fail immediately if locked
      });
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      if (errMsg.includes('already being held') || errMsg.includes('ELOCKED')) {
        throw new WAIaaSError('SYSTEM_LOCKED', {
          message: 'Another WAIaaS daemon is already running (daemon.lock is held)',
        });
      }
      throw err;
    }
  }
}
