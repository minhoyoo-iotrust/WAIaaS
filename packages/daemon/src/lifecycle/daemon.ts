/**
 * DaemonLifecycle - orchestrates daemon startup (6 steps) and shutdown (10 steps).
 *
 * Startup sequence (doc 28 section 2):
 *   1. Environment validation + config + flock (5s timeout, fail-fast)
 *   2. Database initialization (30s timeout, fail-fast)
 *   3. Keystore unlock (30s timeout, fail-fast)
 *   4. Adapter initialization (10s, fail-soft)
 *      4c-6. WalletConnect service (fail-soft)
 *      4c-8. Signing SDK lifecycle (fail-soft)
 *      4c-9. IncomingTxMonitorService (fail-soft)
 *      4c-10. AsyncPollingService (fail-soft)
 *      4c-10.5. PositionTracker (fail-soft)
 *      4c-11. DeFiMonitorService (fail-soft)
 *      4h. EncryptedBackupService (fail-soft)
 *      4i. WebhookService (fail-soft)
 *   5. HTTP server start (5s, fail-fast)
 *   6. Background workers + PID (no timeout, fail-soft)
 *
 * Shutdown sequence (doc 28 section 3):
 *   1. Set isShuttingDown, start force timer, log signal
 *   2-4. HTTP server close
 *   5. In-flight signing -- STUB (Phase 50-04)
 *   6. Pending queue persistence -- STUB (Phase 50-04)
 *   6a. Stop PositionTracker, DeFiMonitorService, TelegramBot, WcSessionService, AutoStop, BalanceMonitor, IncomingTxMonitor, WebhookService
 *   6b. Remove all EventBus listeners
 *   7. workers.stopAll()
 *   8. WAL checkpoint(TRUNCATE)
 *   9. keyStore.lockAll()
 *   10. sqlite.close(), unlink PID, close lockFd, process.exit(0)
 *
 * @see docs/28-daemon-lifecycle-cli.md
 */

import { writeFileSync, unlinkSync, existsSync, mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, dirname } from 'node:path';
import type { Database as DatabaseType } from 'better-sqlite3';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { WAIaaSError, getSingleNetwork, EventBus, RpcPool, BUILT_IN_RPC_DEFAULTS } from '@waiaas/core';
import { KillSwitchService } from '../services/kill-switch-service.js';
import { AutoStopService } from '../services/autostop-service.js';
import type { AutoStopConfig } from '../services/autostop-service.js';
import { InMemoryCounter } from '../infrastructure/metrics/in-memory-counter.js';
import { AdminStatsService } from '../services/admin-stats-service.js';
import type { BalanceMonitorService, BalanceMonitorConfig } from '../services/monitoring/balance-monitor-service.js';
import type { ChainType, NetworkType, EnvironmentType } from '@waiaas/core';
import type { AdapterPool } from '../infrastructure/adapter-pool.js';
import { resolveRpcUrl, resolveRpcUrlFromPool } from '../infrastructure/adapter-pool.js';
import { createDatabase, pushSchema, checkSchemaCompatibility } from '../infrastructure/database/index.js';
import type { LocalKeyStore } from '../infrastructure/keystore/index.js';
import { loadConfig } from '../infrastructure/config/index.js';
import type { DaemonConfig } from '../infrastructure/config/index.js';
import { BackgroundWorkers } from './workers.js';
import { keyValueStore, transactions as txTable } from '../infrastructure/database/schema.js';
import type * as schema from '../infrastructure/database/schema.js';
import { eq } from 'drizzle-orm';
import { decrypt } from '../infrastructure/keystore/crypto.js';
import { DelayQueue } from '../workflow/delay-queue.js';
import { ApprovalWorkflow } from '../workflow/approval-workflow.js';
import { DatabasePolicyEngine } from '../pipeline/database-policy-engine.js';
import { JwtSecretManager } from '../infrastructure/jwt/index.js';
import argon2 from 'argon2';
import type { IPriceOracle, IForexRateService } from '@waiaas/core';

const esmRequire = createRequire(import.meta.url);

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
function withTimeout<T>(promise: Promise<T>, ms: number, errorCode: string): Promise<T> {
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

// Export for testing
export { withTimeout };

// ---------------------------------------------------------------------------
// DaemonLifecycle
// ---------------------------------------------------------------------------

export class DaemonLifecycle {
  private _isShuttingDown = false;
  private sqlite: DatabaseType | null = null;
  private _db: BetterSQLite3Database<typeof schema> | null = null;
  private keyStore: LocalKeyStore | null = null;
  private masterPassword = '';
  private passwordRef: import('../api/middleware/master-auth.js').MasterPasswordRef | null = null;
  private rpcPool: RpcPool | null = null;
  /** IRpcCaller for Aave V3 on-chain reads, passed to HotReloadOrchestrator */
  private rpcCaller: { call: (params: { to: string; data: string; chainId?: number }) => Promise<string> } | undefined;
  private adapterPool: AdapterPool | null = null;
  private httpServer: { close: () => void } | null = null;
  private workers: BackgroundWorkers | null = null;
  private releaseLock: (() => Promise<void>) | null = null;
  private pidPath = '';
  private _config: DaemonConfig | null = null;
  private forceTimer: ReturnType<typeof setTimeout> | null = null;
  private delayQueue: DelayQueue | null = null;
  private approvalWorkflow: ApprovalWorkflow | null = null;
  private jwtSecretManager: JwtSecretManager | null = null;
  private masterPasswordHash = '';
  private notificationService: import('../notifications/notification-service.js').NotificationService | null = null;
  private _settingsService: import('../infrastructure/settings/settings-service.js').SettingsService | null = null;
  private priceOracle: IPriceOracle | undefined;
  private actionProviderRegistry: import('../infrastructure/action/action-provider-registry.js').ActionProviderRegistry | null = null;
  // apiKeyStore removed in v29.5 (#214) -- API keys now managed by SettingsService
  private forexRateService: IForexRateService | null = null;
  private eventBus: EventBus = new EventBus();
  private killSwitchService: KillSwitchService | null = null;
  private autoStopService: AutoStopService | null = null;
  private balanceMonitorService: BalanceMonitorService | null = null;
  private telegramBotService: import('../infrastructure/telegram/telegram-bot-service.js').TelegramBotService | null = null;
  private telegramBotRef: { current: import('../infrastructure/telegram/telegram-bot-service.js').TelegramBotService | null } = { current: null };
  private wcSessionService: import('../services/wc-session-service.js').WcSessionService | null = null;
  private wcServiceRef: import('../services/wc-session-service.js').WcServiceRef = { current: null };
  private wcSigningBridgeRef: import('../services/wc-signing-bridge.js').WcSigningBridgeRef = { current: null };
  private approvalChannelRouter: import('../services/signing-sdk/approval-channel-router.js').ApprovalChannelRouter | null = null;
  private _versionCheckService: import('../infrastructure/version/version-check-service.js').VersionCheckService | null = null;
  private incomingTxMonitorService: import('../services/incoming/incoming-tx-monitor-service.js').IncomingTxMonitorService | null = null;
  private _asyncPollingService: import('../services/async-polling-service.js').AsyncPollingService | null = null;
  private positionTracker: import('../services/defi/position-tracker.js').PositionTracker | null = null;
  private defiMonitorService: import('../services/monitoring/defi-monitor-service.js').DeFiMonitorService | null = null;
  private _encryptedBackupService: import('../infrastructure/backup/encrypted-backup-service.js').EncryptedBackupService | null = null;
  private webhookService: import('../services/webhook-service.js').WebhookService | null = null;
  private metricsCounter: InMemoryCounter | null = null;
  private adminStatsService: AdminStatsService | null = null;
  private hyperliquidMarketData: import('@waiaas/actions').HyperliquidMarketData | null = null;
  private polymarketInfra: import('../api/routes/polymarket.js').PolymarketInfraDeps | null = null;
  private contractNameRegistry: import('@waiaas/core').ContractNameRegistry | null = null;
  private daemonStartTime: number = Math.floor(Date.now() / 1000);

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
  get settingsService(): import('../infrastructure/settings/settings-service.js').SettingsService | null {
    return this._settingsService;
  }

  /** VersionCheckService instance (available after Step 6, used by Health endpoint). */
  get versionCheckService(): import('../infrastructure/version/version-check-service.js').VersionCheckService | null {
    return this._versionCheckService;
  }

  /** AsyncPollingService instance (available after Step 4c-10, used by action providers to register trackers). */
  get pollingService(): import('../services/async-polling-service.js').AsyncPollingService | null {
    return this._asyncPollingService;
  }

  /** PositionTracker instance (available after Step 4c-10.5). */
  get positionTrackerInstance(): import('../services/defi/position-tracker.js').PositionTracker | null {
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
    // Wrap everything in a 90-second overall timeout
    await withTimeout(this._startInternal(dataDir, masterPassword), 90_000, 'STARTUP_TIMEOUT');
  }

  private async _startInternal(dataDir: string, masterPassword: string): Promise<void> {
    // Store master password for route handlers
    this.masterPassword = masterPassword;

    // ------------------------------------------------------------------
    // Step 1: Environment validation + config + flock (5s, fail-fast)
    // ------------------------------------------------------------------
    await withTimeout(
      (async () => {
        // Ensure data directory exists
        if (!existsSync(dataDir)) {
          mkdirSync(dataDir, { recursive: true });
        }

        // Load config
        this._config = loadConfig(dataDir);

        // Acquire daemon lock (flock-like via proper-lockfile)
        await this.acquireDaemonLock(dataDir);

        console.debug('Step 1: Config loaded, daemon lock acquired');
      })(),
      5_000,
      'STEP1_CONFIG_LOCK',
    );

    // ------------------------------------------------------------------
    // Step 2: Database initialization (30s, fail-fast)
    // ------------------------------------------------------------------
    await withTimeout(
      (async () => {
        const dbPath = join(dataDir, this._config!.database.path);

        // Ensure DB directory exists
        const dbDir = dirname(dbPath);
        if (!existsSync(dbDir)) {
          mkdirSync(dbDir, { recursive: true });
        }

        const { sqlite, db } = createDatabase(dbPath);
        this.sqlite = sqlite;
        this._db = db;

        // Check schema compatibility before migration
        const compatibility = checkSchemaCompatibility(sqlite);
        if (compatibility.action === 'reject') {
          console.error(`Step 2: Schema incompatible -- ${compatibility.message}`);
          throw new WAIaaSError('SCHEMA_INCOMPATIBLE', {
            message: compatibility.message,
          });
        }
        if (compatibility.action === 'migrate') {
          console.debug('Step 2: Schema migration needed, applying...');
        }

        // Create all tables + run migrations (idempotent)
        pushSchema(sqlite);

        // Auto-import config.toml operational settings into DB (first boot only)
        const { SettingsService } = await import('../infrastructure/settings/index.js');
        this._settingsService = new SettingsService({
          db: this._db!,
          config: this._config!,
          masterPassword,
          passwordRef: this.passwordRef ?? undefined,
        });
        const importResult = this._settingsService.importFromConfig();
        if (importResult.imported > 0) {
          console.debug(`Step 2: Settings imported from config.toml (${importResult.imported} keys)`);
        }

        console.debug('Step 2: Database initialized');
      })(),
      30_000,
      'STEP2_DATABASE',
    );

    // ------------------------------------------------------------------
    // Step 2b: Master password validation (fail-fast)
    // ------------------------------------------------------------------
    await withTimeout(
      (async () => {
        const existingHash = this._db!
          .select()
          .from(keyValueStore)
          .where(eq(keyValueStore.key, 'master_password_hash'))
          .get();

        if (existingHash) {
          // Path A: DB hash exists -> verify against stored hash
          const isValid = await argon2.verify(existingHash.value, masterPassword);
          if (!isValid) {
            console.error('Invalid master password.');
            process.exit(1);
          }
          console.debug('Step 2b: Master password verified (DB hash)');
        } else {
          // Path B: No DB hash -> check for existing keystore files
          const keystoreDir = join(dataDir, 'keystore');
          const keystoreFiles = existsSync(keystoreDir)
            ? readdirSync(keystoreDir).filter(f => f.endsWith('.json'))
            : [];

          if (keystoreFiles.length > 0) {
            // Existing user migration: validate by decrypting first keystore
            const keystorePath = join(keystoreDir, keystoreFiles[0]!);
            const content = readFileSync(keystorePath, 'utf-8');
            const parsed = JSON.parse(content);
            const encrypted = {
              iv: Buffer.from(parsed.crypto.cipherparams.iv, 'hex'),
              ciphertext: Buffer.from(parsed.crypto.ciphertext, 'hex'),
              authTag: Buffer.from(parsed.crypto.authTag, 'hex'),
              salt: Buffer.from(parsed.crypto.kdfparams.salt, 'hex'),
              kdfparams: parsed.crypto.kdfparams,
            };
            try {
              const plain = await decrypt(encrypted, masterPassword);
              plain.fill(0); // zero immediately
            } catch {
              console.error('Invalid master password. Cannot decrypt existing wallets.');
              process.exit(1);
            }
            console.debug('Step 2b: Master password verified (keystore migration)');
          } else {
            console.debug('Step 2b: First install, no password validation needed');
          }

          // Store hash in DB for future startups
          const hash = await argon2.hash(masterPassword, {
            type: argon2.argon2id,
            memoryCost: 19456,
            timeCost: 2,
            parallelism: 1,
          });
          this._db!
            .insert(keyValueStore)
            .values({
              key: 'master_password_hash',
              value: hash,
              updatedAt: new Date(),
            })
            .onConflictDoNothing()
            .run();
        }
      })(),
      30_000,
      'STEP2B_PASSWORD_VALIDATION',
    );

    // ------------------------------------------------------------------
    // Step 3: Keystore unlock (30s, fail-fast)
    // ------------------------------------------------------------------
    await withTimeout(
      (async () => {
        // Dynamic import to avoid circular dependency issues
        const { LocalKeyStore: KeyStoreCls } = await import(
          '../infrastructure/keystore/index.js'
        );
        const keystoreDir = join(dataDir, 'keystore');
        if (!existsSync(keystoreDir)) {
          mkdirSync(keystoreDir, { recursive: true });
        }
        this.keyStore = new KeyStoreCls(keystoreDir);

        // v1.1: just verify keystore infrastructure is accessible
        // Full key decryption happens when agents are accessed
        if (masterPassword) {
          console.debug('Step 3: Keystore infrastructure verified (master password provided)');
        } else {
          console.debug('Step 3: Keystore infrastructure verified (no master password)');
        }
      })(),
      30_000,
      'STEP3_KEYSTORE',
    );

    // ------------------------------------------------------------------
    // Step 4: Adapter pool initialization (10s, fail-soft)
    // ------------------------------------------------------------------
    try {
      await withTimeout(
        (async () => {
          const { AdapterPool, configKeyToNetwork: configKeyToNet } = await import('../infrastructure/adapter-pool.js');

          // 1. Create empty RpcPool with onEvent callback for notifications
          this.rpcPool = new RpcPool({
            onEvent: (event) => {
              // RPC pool health notifications -- use 'system' as walletId
              // since these are infrastructure-level alerts, not wallet-specific.
              if (this.notificationService) {
                const vars: Record<string, string> = {
                  network: event.network,
                  url: event.url,
                  errorCount: String(event.failureCount),
                  totalEndpoints: String(event.totalEndpoints),
                };
                void this.notificationService.notify(
                  event.type as import('@waiaas/core').NotificationEventType,
                  'system',
                  vars,
                );
              }
            },
          });

          // 2. Seed config.toml URLs first (highest priority)
          //    WAIAAS_RPC_* env vars are already applied to config.rpc by applyEnvOverrides in loader.ts
          const rpcConfig = this._config!.rpc as unknown as Record<string, string>;
          for (const [configKey, url] of Object.entries(rpcConfig)) {
            if (typeof url !== 'string' || !url) continue;
            const network = configKeyToNet(configKey);
            if (network) {
              this.rpcPool.register(network, [url]);
            }
          }

          // 3. Register built-in defaults (lower priority, appended after config URLs)
          for (const [network, urls] of Object.entries(BUILT_IN_RPC_DEFAULTS)) {
            this.rpcPool.register(network, [...urls]);
          }

          // 4. Create AdapterPool with RpcPool
          this.adapterPool = new AdapterPool(this.rpcPool);
          console.debug(`Step 4: AdapterPool created with RpcPool (${this.rpcPool.getNetworks().length} networks seeded)`);
        })(),
        10_000,
        'STEP4_ADAPTER',
      );
    } catch (err) {
      // fail-soft: log warning but continue (daemon runs without chain adapter)
      console.warn('Step 4 (fail-soft): AdapterPool init warning:', err);
      this.adapterPool = null;
      this.rpcPool = null;
    }

    // ------------------------------------------------------------------
    // Step 4b: Create workflow instances (DelayQueue + ApprovalWorkflow)
    // ------------------------------------------------------------------
    if (this._db && this.sqlite && this._config) {
      this.delayQueue = new DelayQueue({ db: this._db, sqlite: this.sqlite });
      this.approvalWorkflow = new ApprovalWorkflow({
        db: this._db,
        sqlite: this.sqlite,
        config: {
          policy_defaults_approval_timeout: this._config.security.policy_defaults_approval_timeout,
        },
        onApproved: (txId) => this.handleApprovalApproved(txId),
      });
      console.debug('Step 4b: Workflow instances created (DelayQueue + ApprovalWorkflow)');
    }

    // ------------------------------------------------------------------
    // Step 4c: JWT Secret Manager + master password hash
    // ------------------------------------------------------------------
    if (this._db) {
      this.jwtSecretManager = new JwtSecretManager(this._db);
      await this.jwtSecretManager.initialize();
      this.masterPasswordHash = await argon2.hash(masterPassword, {
        type: argon2.argon2id,
        memoryCost: 19456,
        timeCost: 2,
        parallelism: 1,
      });
      // Create mutable ref for live password/hash updates (password change API)
      this.passwordRef = { password: masterPassword, hash: this.masterPasswordHash };
      console.debug('Step 4c: JWT secret manager initialized, master password hashed');
    }

    // ------------------------------------------------------------------
    // Step 4c-2: KillSwitchService initialization
    // ------------------------------------------------------------------
    if (this.sqlite) {
      this.killSwitchService = new KillSwitchService({
        sqlite: this.sqlite,
        // notificationService will be set after Step 4d
        eventBus: this.eventBus,
      });
      this.killSwitchService.ensureInitialized();
      console.debug('Step 4c-2: KillSwitchService initialized');
    }

    // ------------------------------------------------------------------
    // Step 4d: Notification Service initialization (fail-soft)
    // ------------------------------------------------------------------
    try {
      // Always create NotificationService regardless of config.toml enabled value.
      // When enabled=false, service starts with 0 channels (no notifications sent).
      // Admin UI can dynamically enable via hot-reload at runtime.
      const { NotificationService, TelegramChannel, DiscordChannel, SlackChannel } =
        await import('../notifications/index.js');

      // Read notification settings from SettingsService first, fall back to config.toml
      const ss = this._settingsService;
      const notifLocale = ((ss ? ss.get('notifications.locale') : null)
        || this._config!.notifications.locale || 'en') as 'en' | 'ko';
      const notifRateLimitRpm = Number(
        (ss ? ss.get('notifications.rate_limit_rpm') : null)
        || this._config!.notifications.rate_limit_rpm
        || 20,
      );

      this.notificationService = new NotificationService({
        db: this._db ?? undefined,
        config: {
          locale: notifLocale,
          rateLimitRpm: notifRateLimitRpm,
        },
      });

      // Inject SettingsService for category filtering
      if (ss) {
        this.notificationService.setSettingsService(ss);
      }

      // Initialize configured channels: SettingsService (DB) takes priority over config.toml
      const notifEnabled = ss
        ? ss.get('notifications.enabled') === 'true'
        : this._config!.notifications.enabled;

      if (notifEnabled) {
        const notifConfig = this._config!.notifications;

        const tgToken = (ss ? ss.get('notifications.telegram_bot_token') : null)
          || notifConfig.telegram_bot_token;
        const tgChatId = (ss ? ss.get('notifications.telegram_chat_id') : null)
          || notifConfig.telegram_chat_id;
        if (tgToken && tgChatId) {
          const telegram = new TelegramChannel();
          await telegram.initialize({
            telegram_bot_token: tgToken,
            telegram_chat_id: tgChatId,
          });
          this.notificationService.addChannel(telegram);
        }

        const discordUrl = (ss ? ss.get('notifications.discord_webhook_url') : null)
          || notifConfig.discord_webhook_url;
        if (discordUrl) {
          const discord = new DiscordChannel();
          await discord.initialize({
            discord_webhook_url: discordUrl,
          });
          this.notificationService.addChannel(discord);
        }

        // Global NtfyChannel removed in v29.10 -- per-wallet topics now in wallet_apps table.
        // Per-wallet ntfy channels are managed by the signing SDK / notification routing layer.

        const slackUrl = (ss ? ss.get('notifications.slack_webhook_url') : null)
          || notifConfig.slack_webhook_url;
        if (slackUrl) {
          const slack = new SlackChannel();
          await slack.initialize({
            slack_webhook_url: slackUrl,
          });
          this.notificationService.addChannel(slack);
        }
      }

      const channelNames = this.notificationService.getChannelNames();
      console.debug(
        `Step 4d: NotificationService initialized (${channelNames.length} channels: ${channelNames.join(', ') || 'none'})`,
      );
    } catch (err) {
      console.warn('Step 4d (fail-soft): NotificationService init warning:', err);
      this.notificationService = null;
    }

    // Wire NotificationService to KillSwitchService (created before Step 4d)
    if (this.killSwitchService && this.notificationService) {
      // Re-create with notification service attached
      this.killSwitchService = new KillSwitchService({
        sqlite: this.sqlite!,
        notificationService: this.notificationService,
        eventBus: this.eventBus,
      });
      this.killSwitchService.ensureInitialized();
    }

    // ------------------------------------------------------------------
    // Step 4c-3: AutoStop Engine (fail-soft)
    // ------------------------------------------------------------------
    try {
      if (this.sqlite && this.killSwitchService && this._settingsService) {
        const autoStopConfig: AutoStopConfig = {
          consecutiveFailuresThreshold: parseInt(this._settingsService.get('autostop.consecutive_failures_threshold'), 10),
          unusualActivityThreshold: parseInt(this._settingsService.get('autostop.unusual_activity_threshold'), 10),
          unusualActivityWindowSec: parseInt(this._settingsService.get('autostop.unusual_activity_window_sec'), 10),
          idleTimeoutSec: parseInt(this._settingsService.get('autostop.idle_timeout_sec'), 10),
          idleCheckIntervalSec: parseInt(this._settingsService.get('autostop.idle_check_interval_sec'), 10),
          enabled: this._settingsService.get('autostop.enabled') === 'true',
        };

        this.autoStopService = new AutoStopService({
          sqlite: this.sqlite,
          eventBus: this.eventBus,
          killSwitchService: this.killSwitchService,
          notificationService: this.notificationService ?? undefined,
          config: autoStopConfig,
        });

        if (autoStopConfig.enabled) {
          this.autoStopService.start();
          console.debug('Step 4c-3: AutoStop engine started');
        } else {
          console.debug('Step 4c-3: AutoStop engine disabled');
        }
      }
    } catch (err) {
      console.warn('Step 4c-3 (fail-soft): AutoStop engine init warning:', err);
      this.autoStopService = null;
    }

    // ------------------------------------------------------------------
    // Step 4c-3b: InMemoryCounter + AdminStatsService (fail-soft)
    // ------------------------------------------------------------------
    try {
      if (this.sqlite) {
        this.metricsCounter = new InMemoryCounter();

        // v30.2: inject metricsCounter into AutoStopService (STAT-02)
        if (this.autoStopService) {
          this.autoStopService.setMetricsCounter(this.metricsCounter);
        }

        const { version: daemonVersion } = esmRequire('../../package.json') as { version: string };
        this.adminStatsService = new AdminStatsService({
          sqlite: this.sqlite,
          metricsCounter: this.metricsCounter,
          autoStopService: this.autoStopService ?? undefined,
          startTime: this.daemonStartTime,
          version: daemonVersion,
          dataDir,
        });
        console.debug('Step 4c-3b: AdminStatsService created');
      }
    } catch (err) {
      console.warn('Step 4c-3b (fail-soft): AdminStatsService init warning:', err);
      this.adminStatsService = null;
    }

    // ------------------------------------------------------------------
    // Step 4c-4: BalanceMonitorService initialization (fail-soft)
    // ------------------------------------------------------------------
    try {
      if (this.sqlite && this.adapterPool && this._config && this._settingsService) {
        const { BalanceMonitorService: BalanceMonitorCls } = await import(
          '../services/monitoring/balance-monitor-service.js'
        );

        const monitorConfig: BalanceMonitorConfig = {
          checkIntervalSec: parseInt(this._settingsService.get('monitoring.check_interval_sec'), 10),
          lowBalanceThresholdSol: parseFloat(this._settingsService.get('monitoring.low_balance_threshold_sol')),
          lowBalanceThresholdEth: parseFloat(this._settingsService.get('monitoring.low_balance_threshold_eth')),
          cooldownHours: parseInt(this._settingsService.get('monitoring.cooldown_hours'), 10),
          enabled: this._settingsService.get('monitoring.enabled') === 'true',
        };

        this.balanceMonitorService = new BalanceMonitorCls({
          sqlite: this.sqlite,
          adapterPool: this.adapterPool,
          config: this._config,
          notificationService: this.notificationService ?? undefined,
          monitorConfig,
        });

        if (monitorConfig.enabled) {
          this.balanceMonitorService.start();
          console.debug('Step 4c-4: Balance monitor started');
        } else {
          console.debug('Step 4c-4: Balance monitor disabled');
        }
      }
    } catch (err) {
      console.warn('Step 4c-4 (fail-soft): Balance monitor init warning:', err);
      this.balanceMonitorService = null;
    }

    // ------------------------------------------------------------------
    // Step 4c-5: TelegramBotService initialization (fail-soft)
    // ------------------------------------------------------------------
    try {
      // Read telegram settings from SettingsService (falls back to config.toml)
      const ss = this._settingsService;
      // Token priority: telegram.bot_token > notifications.telegram_bot_token > config.toml
      const botToken = (ss ? (ss.get('telegram.bot_token') || ss.get('notifications.telegram_bot_token')) : null)
        || this._config!.telegram.bot_token;
      if (botToken) {
        const { TelegramBotService, TelegramApi } = await import(
          '../infrastructure/telegram/index.js'
        );
        const telegramApi = new TelegramApi(botToken);
        const telegramLocale = ((ss ? ss.get('telegram.locale') : null)
          || this._config!.telegram.locale
          || this._config!.notifications.locale
          || 'en') as 'en' | 'ko';
        this.telegramBotService = new TelegramBotService({
          sqlite: this.sqlite!,
          api: telegramApi,
          locale: telegramLocale,
          killSwitchService: this.killSwitchService ?? undefined,
          notificationService: this.notificationService ?? undefined,
          settingsService: this._settingsService ?? undefined,
          onApproved: (txId) => this.handleApprovalApproved(txId),
        });
        this.telegramBotService.start();
        this.telegramBotRef.current = this.telegramBotService;
        console.debug('Step 4c-5: Telegram Bot started');
      } else {
        console.debug('Step 4c-5: Telegram Bot disabled');
      }
    } catch (err) {
      console.warn('Step 4c-5 (fail-soft): Telegram Bot init warning:', err);
      this.telegramBotService = null;
      this.telegramBotRef.current = null;
    }

    // ------------------------------------------------------------------
    // Step 4c-6: WalletConnect service initialization (fail-soft)
    // ------------------------------------------------------------------
    try {
      const wcProjectId = this._settingsService?.get('walletconnect.project_id');
      if (wcProjectId) {
        const { WcSessionService } = await import('../services/wc-session-service.js');
        this.wcSessionService = new WcSessionService({
          sqlite: this.sqlite!,
          settingsService: this._settingsService!,
        });
        await this.wcSessionService.initialize();
        this.wcServiceRef.current = this.wcSessionService;
        console.debug('Step 4c-6: WalletConnect service initialized');
      } else {
        console.debug('Step 4c-6: WalletConnect disabled (no project_id)');
      }
    } catch (err) {
      console.warn('Step 4c-6 (fail-soft): WalletConnect init warning:', err);
      this.wcSessionService = null;
      this.wcServiceRef.current = null;
    }

    // ------------------------------------------------------------------
    // Step 4c-7: WcSigningBridge (fail-soft, requires WcSessionService + ApprovalWorkflow)
    // ------------------------------------------------------------------
    try {
      if (this.wcSessionService && this.approvalWorkflow && this.sqlite) {
        const { WcSigningBridge } = await import('../services/wc-signing-bridge.js');
        this.wcSigningBridgeRef.current = new WcSigningBridge({
          wcServiceRef: this.wcServiceRef,
          approvalWorkflow: this.approvalWorkflow,
          sqlite: this.sqlite,
          notificationService: this.notificationService ?? undefined,
          eventBus: this.eventBus,
        });
        console.debug('Step 4c-7: WcSigningBridge initialized');
      }
    } catch (err) {
      console.warn('Step 4c-7 (fail-soft): WcSigningBridge init warning:', err);
      this.wcSigningBridgeRef.current = null;
    }

    // ------------------------------------------------------------------
    // Step 4c-8: Signing SDK lifecycle (fail-soft)
    // ------------------------------------------------------------------
    try {
      if (this._settingsService?.get('signing_sdk.enabled') === 'true') {
        const {
          SignRequestBuilder,
          SignResponseHandler,
          WalletLinkRegistry,
          NtfySigningChannel,
          TelegramSigningChannel,
          ApprovalChannelRouter,
          WalletNotificationChannel,
        } = await import('../services/signing-sdk/index.js');

        const walletLinkRegistry = new WalletLinkRegistry(this._settingsService!);
        const signRequestBuilder = new SignRequestBuilder({
          settingsService: this._settingsService!,
          walletLinkRegistry,
          sqlite: this.sqlite!,  // per-wallet topic lookup from wallet_apps table
        });
        const signResponseHandler = new SignResponseHandler(
          { sqlite: this.sqlite! },
          { onApproved: (txId) => this.handleApprovalApproved(txId) },
        );
        const ntfyChannel = new NtfySigningChannel({
          signRequestBuilder,
          signResponseHandler,
          settingsService: this._settingsService!,
        });

        // Conditionally create TelegramSigningChannel (only if Telegram bot is running)
        let telegramChannel: InstanceType<typeof TelegramSigningChannel> | undefined;
        if (this.telegramBotService) {
          const { TelegramApi } = await import('../infrastructure/telegram/index.js');
          const botToken =
            (this._settingsService
              ? this._settingsService.get('telegram.bot_token') ||
                this._settingsService.get('notifications.telegram_bot_token')
              : null) || this._config!.telegram.bot_token;
          if (botToken) {
            const signingTelegramApi = new TelegramApi(botToken);
            telegramChannel = new TelegramSigningChannel({
              signRequestBuilder,
              signResponseHandler,
              settingsService: this._settingsService!,
              telegramApi: signingTelegramApi,
            });
          }
        }

        this.approvalChannelRouter = new ApprovalChannelRouter({
          sqlite: this.sqlite!,
          settingsService: this._settingsService!,
          ntfyChannel,
          telegramChannel,
        });

        // Inject signResponseHandler into TelegramBotService for /sign_response command (GAP-2: CHAN-04)
        if (this.telegramBotService) {
          this.telegramBotService.setSignResponseHandler(signResponseHandler);
          console.debug('Step 4c-8: signResponseHandler injected into TelegramBotService');
        }

        // Wallet Notification Side Channel (v2.7)
        const walletNotifChannel = new WalletNotificationChannel({
          sqlite: this.sqlite!,
          settingsService: this._settingsService!,
        });
        this.notificationService?.setWalletNotificationChannel(walletNotifChannel);
        console.debug('Step 4c-8: WalletNotificationChannel injected into NotificationService');

        console.debug('Step 4c-8: Signing SDK initialized (ApprovalChannelRouter + channels)');
      } else {
        console.debug('Step 4c-8: Signing SDK disabled');
      }
    } catch (err) {
      console.warn('Step 4c-8 (fail-soft): Signing SDK init warning:', err);
    }

    // ------------------------------------------------------------------
    // Step 4c-9: IncomingTxMonitorService initialization (fail-soft)
    // ------------------------------------------------------------------
    // Pre-create BackgroundWorkers so Step 4c-9 (incoming monitor) can register its workers.
    // startAll() is still called in Step 6 after all workers are registered.
    if (!this.workers) {
      this.workers = new BackgroundWorkers();
    }

    try {
      if (this.sqlite && this._settingsService) {
        const incoming_enabled = this._settingsService.get('incoming.enabled');
        if (incoming_enabled === 'true') {
          const { IncomingTxMonitorService: IncomingTxMonitorCls } = await import(
            '../services/incoming/incoming-tx-monitor-service.js'
          );
          // Build config from SettingsService
          const ss = this._settingsService;
          const monitorConfig = {
            enabled: true,
            pollIntervalSec: parseInt(ss.get('incoming.poll_interval') || '30', 10),
            retentionDays: parseInt(ss.get('incoming.retention_days') || '90', 10),
            dustThresholdUsd: parseFloat(ss.get('incoming.suspicious_dust_usd') || '0.01'),
            amountMultiplier: parseFloat(ss.get('incoming.suspicious_amount_multiplier') || '10'),
            cooldownMinutes: parseInt(ss.get('incoming.cooldown_minutes') || '5', 10),
          };
          // subscriberFactory creates chain-specific subscribers via dynamic import
          // URL resolution: prefer RpcPool (multi-endpoint rotation), fallback to SettingsService
          const subscriberFactory = async (chain: string, network: string) => {
            const sSvc = this._settingsService!;
            // Per-network WSS URL resolution (#193):
            // Priority: per-network key → global incoming.wss_url → auto-derive from RPC URL
            const resolveWssUrl = (net: string, rpcUrl: string): string => {
              const perNetwork = sSvc.get(`incoming.wss_url.${net}`);
              if (perNetwork) return perNetwork;
              const global = sSvc.get('incoming.wss_url');
              if (global) return global;
              return rpcUrl.replace(/^https:\/\//, 'wss://');
            };

            if (chain === 'solana') {
              const rpcUrl = resolveRpcUrlFromPool(this.rpcPool, sSvc.get.bind(sSvc), chain, network);
              const wssUrl = resolveWssUrl(network, rpcUrl);
              const { SolanaIncomingSubscriber } = await import('@waiaas/adapter-solana');
              return new SolanaIncomingSubscriber({ rpcUrl, wsUrl: wssUrl });
            }
            // EVM chains — dynamic URL resolution via RPC Pool (#199)
            const rpcPool = this.rpcPool;
            const resolveRpcUrl = () => resolveRpcUrlFromPool(rpcPool, sSvc.get.bind(sSvc), chain, network);
            const initialRpcUrl = resolveRpcUrl();
            const wssUrl = resolveWssUrl(network, initialRpcUrl);
            const { EvmIncomingSubscriber } = await import('@waiaas/adapter-evm');
            const ns = this.notificationService;
            // Token address resolver for getLogs address filter (#203)
            const { TokenRegistryService } = await import('../infrastructure/token-registry/index.js');
            const tokenRegistry = this._db ? new TokenRegistryService(this._db) : null;
            let cachedTokenAddresses: import('viem').Address[] = [];
            let cacheExpiry = 0;
            const resolveTokenAddresses = (): import('viem').Address[] => {
              const now = Date.now();
              if (now < cacheExpiry) return cachedTokenAddresses;
              // Refresh every 60s to pick up runtime token additions
              try {
                if (tokenRegistry) {
                  // Synchronous access: getTokensForNetwork is async but uses sync DB
                  // Use a cached snapshot refreshed periodically
                  void tokenRegistry.getTokensForNetwork(network).then((tokens) => {
                    cachedTokenAddresses = tokens
                      .map((t) => t.address as import('viem').Address);
                    cacheExpiry = Date.now() + 60_000;
                  });
                }
              } catch { /* keep previous cache */ }
              return cachedTokenAddresses;
            };
            // Prime the cache immediately
            if (tokenRegistry) {
              try {
                const tokens = await tokenRegistry.getTokensForNetwork(network);
                cachedTokenAddresses = tokens.map((t) => t.address as import('viem').Address);
                cacheExpiry = Date.now() + 60_000;
              } catch { /* empty cache is fine — ERC-20 polling will be skipped */ }
            }
            return new EvmIncomingSubscriber({
              resolveRpcUrl,
              reportRpcFailure: (url) => rpcPool?.reportFailure(network, url),
              reportRpcSuccess: (url) => rpcPool?.reportSuccess(network, url),
              wsUrl: wssUrl !== initialRpcUrl.replace(/^https:\/\//, 'wss://') ? wssUrl : undefined,
              resolveTokenAddresses,
              onRpcAlert: ns ? (alert) => {
                ns.notify(alert.type, alert.walletId, {
                  network: alert.network,
                  errorCount: String(alert.errorCount),
                  lastError: alert.lastError,
                  ...(alert.fromBlock ? { fromBlock: alert.fromBlock } : {}),
                  ...(alert.toBlock ? { toBlock: alert.toBlock } : {}),
                });
              } : undefined,
            });
          };
          this.incomingTxMonitorService = new IncomingTxMonitorCls({
            sqlite: this.sqlite,
            db: this._db!,
            workers: this.workers ?? new BackgroundWorkers(),
            eventBus: this.eventBus,
            killSwitchService: this.killSwitchService,
            notificationService: this.notificationService,
            subscriberFactory,
            config: monitorConfig,
          });
          await this.incomingTxMonitorService.start();
          console.debug('Step 4c-9: Incoming TX monitor started');
        } else {
          console.debug('Step 4c-9: Incoming TX monitor disabled');
        }
      }
    } catch (err) {
      console.warn('Step 4c-9 (fail-soft): Incoming TX monitor init warning:', err);
      this.incomingTxMonitorService = null;
    }

    // ------------------------------------------------------------------
    // Step 4c-10: AsyncPollingService initialization (fail-soft)
    // ------------------------------------------------------------------
    try {
      if (this._db) {
        const { AsyncPollingService } = await import('../services/async-polling-service.js');
        this._asyncPollingService = new AsyncPollingService(this._db, {
          emitNotification: (eventType, walletId, data) => {
            if (this.notificationService) {
              void this.notificationService.notify(
                eventType as import('@waiaas/core').NotificationEventType,
                walletId,
                undefined, // vars (template interpolation — not needed for bridge events)
                data,      // details (metadata passed through to notification)
              );
            }
          },
          releaseReservation: (txId) => {
            // Reset reserved_amount and reserved_amount_usd to 0 for the transaction
            this._db!
              .update(txTable)
              .set({ reservedAmount: '0', reservedAmountUsd: null })
              .where(eq(txTable.id, txId))
              .run();
          },
          resumePipeline: (txId, walletId) => {
            // Gas condition met: re-enter pipeline at stage 4 (execute from stage 4 onward)
            void this.executeFromStage4(txId, walletId);
          },
        });
        console.debug('Step 4c-10: AsyncPollingService initialized (with callbacks)');
      }
    } catch (err) {
      console.warn('Step 4c-10 (fail-soft): AsyncPollingService init warning:', err);
      this._asyncPollingService = null;
    }

    // ------------------------------------------------------------------
    // Step 4c-10.5: PositionTracker initialization (fail-soft)
    // ------------------------------------------------------------------
    try {
      if (this.sqlite && this._settingsService) {
        const trackerEnabled = this._settingsService.get('position_tracker.enabled');
        if (trackerEnabled !== 'false') {
          const { PositionTracker } = await import('../services/defi/position-tracker.js');
          this.positionTracker = new PositionTracker({
            sqlite: this.sqlite,
            settingsService: this._settingsService,
          });
          this.positionTracker.start();
          console.debug('Step 4c-10.5: Position tracker started');
        } else {
          console.debug('Step 4c-10.5: Position tracker disabled');
        }
      }
    } catch (err) {
      console.warn('Step 4c-10.5 (fail-soft): Position tracker init warning:', err);
      this.positionTracker = null;
    }

    // ------------------------------------------------------------------
    // Step 4c-11: DeFiMonitorService initialization (fail-soft)
    // ------------------------------------------------------------------
    try {
      const { DeFiMonitorService } = await import('../services/monitoring/defi-monitor-service.js');
      this.defiMonitorService = new DeFiMonitorService();

      // Register HealthFactorMonitor
      if (this.sqlite) {
        const { HealthFactorMonitor } = await import('../services/monitoring/health-factor-monitor.js');
        const healthMonitor = new HealthFactorMonitor({
          sqlite: this.sqlite,
          notificationService: this.notificationService ?? undefined,
          positionTracker: this.positionTracker ?? undefined,
        });
        this.defiMonitorService.register(healthMonitor);
      }

      // Register MaturityMonitor
      if (this.sqlite) {
        const { MaturityMonitor } = await import('../services/monitoring/maturity-monitor.js');
        const maturityMonitor = new MaturityMonitor({
          sqlite: this.sqlite,
          eventBus: this.eventBus,
          notificationService: this.notificationService ?? undefined,
        });
        if (this._settingsService) {
          maturityMonitor.loadFromSettings(this._settingsService);
        }
        this.defiMonitorService.register(maturityMonitor);
      }

      // Register MarginMonitor
      if (this.sqlite) {
        const { MarginMonitor } = await import('../services/monitoring/margin-monitor.js');
        const marginMonitor = new MarginMonitor({
          sqlite: this.sqlite,
          eventBus: this.eventBus,
          notificationService: this.notificationService ?? undefined,
          positionTracker: this.positionTracker ?? undefined,
        });
        if (this._settingsService) {
          marginMonitor.loadFromSettings(this._settingsService);
        }
        this.defiMonitorService.register(marginMonitor);
      }

      this.defiMonitorService.start();
      console.debug('Step 4c-11: DeFi monitor service started with', this.defiMonitorService.monitorCount, 'monitors');
    } catch (err) {
      console.warn('Step 4c-11 (fail-soft): DeFi monitor service init warning:', err);
      this.defiMonitorService = null;
    }

    // ------------------------------------------------------------------
    // Step 4e: Price Oracle (fail-soft)
    // ------------------------------------------------------------------
    try {
      const { InMemoryPriceCache, PythOracle, CoinGeckoOracle, OracleChain } =
        await import('../infrastructure/oracle/index.js');

      const priceCache = new InMemoryPriceCache();
      const pythOracle = new PythOracle();

      const coingeckoApiKey = this._settingsService?.get('oracle.coingecko_api_key');
      const coingeckoOracle = coingeckoApiKey
        ? new CoinGeckoOracle(coingeckoApiKey)
        : undefined;

      const thresholdStr = this._settingsService?.get('oracle.cross_validation_threshold');
      const crossValidationThreshold = thresholdStr ? Number(thresholdStr) : 5;

      this.priceOracle = new OracleChain({
        primary: pythOracle,
        fallback: coingeckoOracle,
        cache: priceCache,
        crossValidationThreshold,
      });

      console.debug(
        `Step 4e: PriceOracle initialized (Pyth primary${coingeckoOracle ? ' + CoinGecko fallback' : ''})`,
      );
    } catch (err) {
      console.warn('Step 4e (fail-soft): PriceOracle init warning:', err);
      this.priceOracle = undefined;
    }

    // ------------------------------------------------------------------
    // Step 4e-2: ForexRateService (fail-soft)
    // ------------------------------------------------------------------
    try {
      const { CoinGeckoForexProvider, ForexRateService, InMemoryPriceCache } =
        await import('../infrastructure/oracle/index.js');

      const forexCache = new InMemoryPriceCache(
        30 * 60 * 1000,      // TTL: 30 minutes
        2 * 60 * 60 * 1000,  // staleMax: 2 hours
        64,                   // maxEntries: 64 (43 currencies + headroom)
      );
      const coingeckoApiKey = this._settingsService?.get('oracle.coingecko_api_key') ?? '';
      const forexProvider = new CoinGeckoForexProvider(coingeckoApiKey);
      this.forexRateService = new ForexRateService({ forexProvider, cache: forexCache });

      console.debug('Step 4e-2: ForexRateService initialized (30min cache)');
    } catch (err) {
      console.warn('Step 4e-2 (fail-soft): ForexRateService init warning:', err);
      this.forexRateService = null;
    }

    // ------------------------------------------------------------------
    // Step 4f: ActionProviderRegistry (fail-soft)
    // API keys are managed by SettingsService since v29.5 (#214)
    // ------------------------------------------------------------------
    try {
      const { ActionProviderRegistry } =
        await import('../infrastructure/action/index.js');

      this.actionProviderRegistry = new ActionProviderRegistry();

      // Create IRpcCaller for Aave V3 using RpcPool eth_call.
      // RpcPool.getUrl(network) provides priority-based URL rotation with cooldown.
      const rpcCaller = this.rpcPool ? (() => {
        const pool = this.rpcPool!;
        const networkMap: Record<number, string> = {
          1: 'ethereum-mainnet',
          42161: 'arbitrum-mainnet',
          10: 'optimism-mainnet',
          137: 'polygon-mainnet',
          8453: 'base-mainnet',
        };
        return {
          call: async (params: { to: string; data: string; chainId?: number }): Promise<string> => {
            const network = params.chainId ? (networkMap[params.chainId] ?? 'ethereum-mainnet') : 'ethereum-mainnet';
            const rpcUrl = pool.getUrl(network);
            const resp = await fetch(rpcUrl, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                jsonrpc: '2.0',
                id: 1,
                method: 'eth_call',
                params: [{ to: params.to, data: params.data }, 'latest'],
              }),
            });
            const json = await resp.json() as { result?: string; error?: { message: string } };
            if (json.error) throw new Error(json.error.message);
            return json.result ?? '0x';
          },
        };
      })() : undefined;

      // Store rpcCaller for HotReloadOrchestrator use
      this.rpcCaller = rpcCaller;

      // Register built-in action providers from @waiaas/actions (reads from SettingsService)
      const { registerBuiltInProviders } = await import('@waiaas/actions');
      const builtIn = registerBuiltInProviders(this.actionProviderRegistry, this._settingsService!, { rpcCaller });
      // Capture HyperliquidMarketData for HTTP routes (Phase 349)
      if (builtIn.hyperliquidMarketData) {
        this.hyperliquidMarketData = builtIn.hyperliquidMarketData;
      }

      // Register Polymarket providers when enabled (Phase 373)
      if (this._settingsService!.get('actions.polymarket_enabled') === 'true') {
        try {
          const { createPolymarketInfrastructure } = await import('@waiaas/actions');
          const { encryptSettingValue, decryptSettingValue } = await import('../infrastructure/settings/settings-crypto.js');
          const {
            polymarketOrders: pmOrdersTable,
            polymarketPositions: pmPositionsTable,
            polymarketApiKeys: pmApiKeysTable,
          } = await import('../infrastructure/database/schema.js');
          const { eq: drizzleEq } = await import('drizzle-orm');
          const { uuidv7 } = await import('uuidv7');

          const mpHash = this.masterPassword || '';
          const db = this.db!;
          const now = () => Math.floor(Date.now() / 1000);

          // Thin DB adapters wrapping Drizzle ORM for Polymarket interfaces (snake_case mapping)
          const apiKeyDbAdapter = {
            getApiKeyByWalletId: (walletId: string) => {
              const row = db.select().from(pmApiKeysTable).where(drizzleEq(pmApiKeysTable.walletId, walletId)).get();
              if (!row) return null;
              return { id: row.id, wallet_id: row.walletId, api_key: row.apiKey, api_secret_encrypted: row.apiSecretEncrypted, api_passphrase_encrypted: row.apiPassphraseEncrypted, signature_type: row.signatureType, proxy_address: row.proxyAddress, created_at: row.createdAt };
            },
            insertApiKey: (row: Record<string, unknown>) =>
              db.insert(pmApiKeysTable).values({ id: uuidv7(), walletId: row.wallet_id as string, apiKey: row.api_key as string, apiSecretEncrypted: row.api_secret_encrypted as string, apiPassphraseEncrypted: row.api_passphrase_encrypted as string, signatureType: (row.signature_type as number) ?? 0, proxyAddress: (row.proxy_address as string) ?? null, createdAt: now() }).run(),
            deleteApiKeyByWalletId: (walletId: string) =>
              db.delete(pmApiKeysTable).where(drizzleEq(pmApiKeysTable.walletId, walletId)).run(),
          };
          const orderDbAdapter = {
            insertOrder: (row: Record<string, unknown>) =>
              db.insert(pmOrdersTable).values(row as never).run(),
            updateOrderStatus: (id: string, status: string, updatedAt: number) =>
              db.update(pmOrdersTable).set({ status, updatedAt } as never).where(drizzleEq(pmOrdersTable.id, id)).run(),
            updateOrderStatusByOrderId: (orderId: string, status: string, updatedAt: number) =>
              db.update(pmOrdersTable).set({ status, updatedAt } as never).where(drizzleEq(pmOrdersTable.orderId, orderId)).run(),
          };

          // PositionDb adapter matching the PositionDb interface
          const positionDbAdapter = {
            getPositions: (walletId: string) => {
              const rows = db.select().from(pmPositionsTable).where(drizzleEq(pmPositionsTable.walletId, walletId)).all();
              return rows.map(r => ({ id: r.id, wallet_id: r.walletId, condition_id: r.conditionId, token_id: r.tokenId, market_slug: r.marketSlug, outcome: r.outcome, size: r.size, avg_price: r.avgPrice, realized_pnl: r.realizedPnl, market_resolved: r.marketResolved, winning_outcome: r.winningOutcome, is_neg_risk: r.isNegRisk, created_at: r.createdAt, updated_at: r.updatedAt }));
            },
            getPosition: (walletId: string, tokenId: string) => {
              const rows = db.select().from(pmPositionsTable).where(drizzleEq(pmPositionsTable.walletId, walletId)).all();
              const row = rows.find(r => r.tokenId === tokenId);
              if (!row) return null;
              return { id: row.id, wallet_id: row.walletId, condition_id: row.conditionId, token_id: row.tokenId, market_slug: row.marketSlug, outcome: row.outcome, size: row.size, avg_price: row.avgPrice, realized_pnl: row.realizedPnl, market_resolved: row.marketResolved, winning_outcome: row.winningOutcome, is_neg_risk: row.isNegRisk, created_at: row.createdAt, updated_at: row.updatedAt };
            },
            upsert: (row: Record<string, unknown>) =>
              db.insert(pmPositionsTable).values(row as never)
                .onConflictDoUpdate({ target: [pmPositionsTable.walletId, pmPositionsTable.tokenId], set: row as never }).run(),
            updateResolution: (conditionId: string, winningOutcome: string) =>
              db.update(pmPositionsTable).set({ marketResolved: 1, winningOutcome, updatedAt: now() } as never).where(drizzleEq(pmPositionsTable.conditionId, conditionId)).run(),
          };

          const encryptFn = (plaintext: string) => encryptSettingValue(plaintext, mpHash);
          const decryptFn = (ciphertext: string) => decryptSettingValue(ciphertext, mpHash);
          const pmInfra = createPolymarketInfrastructure(
            {},
            { apiKeys: apiKeyDbAdapter as never, orders: orderDbAdapter, positions: positionDbAdapter as never },
            encryptFn,
            decryptFn,
          );
          this.actionProviderRegistry.register(pmInfra.orderProvider);
          this.actionProviderRegistry.register(pmInfra.ctfProvider);
          this.polymarketInfra = pmInfra as unknown as import('../api/routes/polymarket.js').PolymarketInfraDeps;
          console.debug('Step 4f-pm: Polymarket providers registered (order + ctf)');
        } catch (err) {
          console.warn('Step 4f-pm (fail-soft): Polymarket registration failed:', err);
        }
      }

      // Load plugins from ~/.waiaas/actions/ (if exists)
      const actionsDir = join(dataDir, 'actions');
      if (existsSync(actionsDir)) {
        const result = await this.actionProviderRegistry.loadPlugins(actionsDir);
        console.debug(
          `Step 4f: ActionProviderRegistry initialized (${builtIn.loaded.length} built-in, ${result.loaded.length} plugins loaded, ${result.failed.length} failed)`,
        );
      } else {
        console.debug(`Step 4f: ActionProviderRegistry initialized (${builtIn.loaded.length} built-in, no plugins directory)`);
      }
    } catch (err) {
      console.warn('Step 4f (fail-soft): ActionProviderRegistry init warning:', err);
    }

    // ------------------------------------------------------------------
    // Step 4f-2: Register bridge status trackers when lifi is enabled
    // ------------------------------------------------------------------
    if (this._asyncPollingService && this._settingsService?.get('actions.lifi_enabled') === 'true') {
      try {
        const { BridgeStatusTracker, BridgeMonitoringTracker } = await import('@waiaas/actions');
        const lifiConfig = {
          enabled: true,
          apiBaseUrl: this._settingsService!.get('actions.lifi_api_base_url'),
          apiKey: this._settingsService!.get('actions.lifi_api_key'),
          defaultSlippagePct: Number(this._settingsService!.get('actions.lifi_default_slippage_pct')),
          maxSlippagePct: Number(this._settingsService!.get('actions.lifi_max_slippage_pct')),
          requestTimeoutMs: 15_000,
        };
        this._asyncPollingService.registerTracker(new BridgeStatusTracker(lifiConfig));
        this._asyncPollingService.registerTracker(new BridgeMonitoringTracker(lifiConfig));
        console.debug('Step 4f-2: Bridge status trackers registered (bridge + bridge-monitoring)');
      } catch (err) {
        console.warn('Step 4f-2 (fail-soft): Bridge tracker registration failed:', err);
      }
    }

    // ------------------------------------------------------------------
    // Step 4f-2a: Register Across bridge status trackers when across_bridge is enabled
    // ------------------------------------------------------------------
    if (this._asyncPollingService && this._settingsService?.get('actions.across_bridge_enabled') === 'true') {
      try {
        const { AcrossBridgeStatusTracker, AcrossBridgeMonitoringTracker } = await import('@waiaas/actions');
        const acrossConfig = {
          enabled: true,
          apiBaseUrl: this._settingsService!.get('actions.across_bridge_api_base_url') || 'https://app.across.to/api',
          integratorId: this._settingsService!.get('actions.across_bridge_integrator_id') || '',
          fillDeadlineBufferSec: Number(this._settingsService!.get('actions.across_bridge_fill_deadline_buffer_sec')) || 21600,
          defaultSlippagePct: Number(this._settingsService!.get('actions.across_bridge_default_slippage_pct')) || 0.01,
          maxSlippagePct: Number(this._settingsService!.get('actions.across_bridge_max_slippage_pct')) || 0.03,
          requestTimeoutMs: 10_000,
        };
        this._asyncPollingService.registerTracker(new AcrossBridgeStatusTracker(acrossConfig));
        this._asyncPollingService.registerTracker(new AcrossBridgeMonitoringTracker(acrossConfig));
        console.debug('Step 4f-2a: Across bridge status trackers registered (across-bridge + across-bridge-monitoring)');
      } catch (err) {
        console.warn('Step 4f-2a (fail-soft): Across bridge tracker registration failed:', err);
      }
    }

    // ------------------------------------------------------------------
    // Step 4f-3: Register staking status trackers when lido/jito is enabled
    // ------------------------------------------------------------------
    if (this._asyncPollingService) {
      try {
        if (this._settingsService?.get('actions.lido_staking_enabled') === 'true') {
          const { LidoWithdrawalTracker } = await import('@waiaas/actions');
          this._asyncPollingService.registerTracker(new LidoWithdrawalTracker());
          console.debug('Step 4f-3: Lido withdrawal tracker registered');
        }
        if (this._settingsService?.get('actions.jito_staking_enabled') === 'true') {
          const { JitoEpochTracker } = await import('@waiaas/actions');
          this._asyncPollingService.registerTracker(new JitoEpochTracker());
          console.debug('Step 4f-3: Jito epoch tracker registered');
        }
      } catch (err) {
        console.warn('Step 4f-3 (fail-soft): Staking tracker registration failed:', err);
      }
    }

    // ------------------------------------------------------------------
    // Step 4f-4: Register GasConditionTracker (gas price condition monitoring)
    // ------------------------------------------------------------------
    if (this._asyncPollingService) {
      try {
        const gasConditionEnabled = this._settingsService?.get('gas_condition.enabled') !== 'false';
        if (gasConditionEnabled) {
          const { GasConditionTracker } = await import('../pipeline/gas-condition-tracker.js');
          this._asyncPollingService.registerTracker(new GasConditionTracker());
          console.debug('Step 4f-4: GasConditionTracker registered');
        } else {
          console.debug('Step 4f-4: GasConditionTracker disabled');
        }
      } catch (err) {
        console.warn('Step 4f-4 (fail-soft): GasConditionTracker registration failed:', err);
      }
    }


    // ------------------------------------------------------------------
    // Step 4f-6: Register IPositionProvider implementations with PositionTracker
    // ------------------------------------------------------------------
    if (this.positionTracker && this.actionProviderRegistry) {
      try {
        // Check each registered provider for IPositionProvider interface (duck-typing)
        for (const meta of this.actionProviderRegistry.listProviders()) {
          const provider = this.actionProviderRegistry.getProvider(meta.name);
          if (provider && 'getPositions' in provider && 'getSupportedCategories' in provider && 'getProviderName' in provider) {
            this.positionTracker.registerProvider(provider as unknown as import('@waiaas/core').IPositionProvider);
            console.debug(`Step 4f-5: Registered ${meta.name} with PositionTracker`);
          }
        }
        console.debug(`Step 4f-5: PositionTracker has ${this.positionTracker.providerCount} providers`);
        // Trigger immediate LENDING sync now that providers are registered
        if (this.positionTracker.providerCount > 0) {
          void this.positionTracker.syncCategory('LENDING');
        }
      } catch (err) {
        console.warn('Step 4f-5 (fail-soft): PositionTracker provider registration warning:', err);
      }
    }

    // ------------------------------------------------------------------
    // Step 4g: VersionCheckService (create before Step 5 for Health endpoint)
    // ------------------------------------------------------------------
    if (this.sqlite && this._config!.daemon.update_check) {
      const { VersionCheckService } = await import('../infrastructure/version/index.js');
      this._versionCheckService = new VersionCheckService(this.sqlite);
      if (this.notificationService) {
        this._versionCheckService.setNotificationService(this.notificationService);
      }
      console.debug('Step 4g: VersionCheckService created');
    }

    // ------------------------------------------------------------------
    // Step 4h: EncryptedBackupService (fail-soft)
    // ------------------------------------------------------------------
    try {
      if (this.sqlite) {
        const { isAbsolute } = await import('node:path');
        const { EncryptedBackupService } = await import('../infrastructure/backup/encrypted-backup-service.js');
        const backupDir = this._config!.backup?.dir ?? 'backups';
        const backupsDir = isAbsolute(backupDir) ? backupDir : join(dataDir, backupDir);
        this._encryptedBackupService = new EncryptedBackupService(dataDir, backupsDir, this.sqlite);
        console.debug('Step 4h: EncryptedBackupService created');
      }
    } catch (err) {
      console.warn('Step 4h (fail-soft): EncryptedBackupService init warning:', err);
    }

    // ------------------------------------------------------------------
    // Step 4i: WebhookService (fail-soft)
    // ------------------------------------------------------------------
    try {
      if (this.sqlite && this.eventBus) {
        const { WebhookService } = await import('../services/webhook-service.js');
        this.webhookService = new WebhookService(this.sqlite, this.eventBus, () => this.masterPassword);
        console.debug('Step 4i: WebhookService created');
      }
    } catch (err) {
      console.warn('Step 4i (fail-soft): WebhookService init warning:', err);
    }

    // ------------------------------------------------------------------
    // Step 5: HTTP server start (5s, fail-fast)
    // ------------------------------------------------------------------
    await withTimeout(
      (async () => {
        const { createApp } = await import('../api/index.js');
        const { serve } = await import('@hono/node-server');
        const { HotReloadOrchestrator } = await import('../infrastructure/settings/index.js');

        const hotReloader = new HotReloadOrchestrator({
          settingsService: this._settingsService!,
          notificationService: this.notificationService,
          adapterPool: this.adapterPool,
          autoStopService: this.autoStopService,
          balanceMonitorService: this.balanceMonitorService,
          wcServiceRef: this.wcServiceRef,
          wcSigningBridgeRef: this.wcSigningBridgeRef,
          approvalWorkflow: this.approvalWorkflow,
          sqlite: this.sqlite,
          telegramBotRef: this.telegramBotRef,
          killSwitchService: this.killSwitchService,
          incomingTxMonitorService: this.incomingTxMonitorService,
          actionProviderRegistryRef: { current: this.actionProviderRegistry },
          rpcCaller: this.rpcCaller ?? undefined,
        });

        // [Phase 320] Create ReputationCacheService for REPUTATION_THRESHOLD policy evaluation
        const { ReputationCacheService } = await import('../services/erc8004/index.js');
        const reputationCacheService = new ReputationCacheService(this._db!, this._settingsService ?? undefined);

        // [#272] Create SmartAccountService for ERC-4337 CREATE2 address prediction
        const { SmartAccountService } = await import('../infrastructure/smart-account/smart-account-service.js');
        const smartAccountService = new SmartAccountService();

        // [Phase 390] Bootstrap signer capabilities for external action signing
        const { SignerCapabilityRegistry } = await import('../signing/registry.js');
        const { bootstrapSignerCapabilities } = await import('../signing/bootstrap.js');
        const signerRegistry = new SignerCapabilityRegistry();
        bootstrapSignerCapabilities(signerRegistry);

        // [Phase 422] v32.0: ContractNameRegistry for notification enrichment
        const { ContractNameRegistry } = await import('@waiaas/core');
        this.contractNameRegistry = new ContractNameRegistry();

        const app = createApp({
          db: this._db!,
          sqlite: this.sqlite ?? undefined,
          keyStore: this.keyStore!,
          masterPassword: this.masterPassword,
          masterPasswordHash: this.masterPasswordHash || undefined,
          passwordRef: this.passwordRef ?? undefined,
          config: this._config!,
          adapterPool: this.adapterPool,
          policyEngine: new DatabasePolicyEngine(
            this._db!,
            this.sqlite ?? undefined,
            this._settingsService ?? undefined,
            reputationCacheService,
          ),
          reputationCache: reputationCacheService,
          jwtSecretManager: this.jwtSecretManager ?? undefined,
          delayQueue: this.delayQueue ?? undefined,
          approvalWorkflow: this.approvalWorkflow ?? undefined,
          notificationService: this.notificationService ?? undefined,
          settingsService: this._settingsService ?? undefined,
          priceOracle: this.priceOracle,
          actionProviderRegistry: this.actionProviderRegistry ?? undefined,
          smartAccountService,
          // apiKeyStore removed in v29.5 -- API keys via SettingsService
          onSettingsChanged: (changedKeys: string[]) => {
            void hotReloader.handleChangedKeys(changedKeys);
          },
          dataDir,
          forexRateService: this.forexRateService ?? undefined,
          eventBus: this.eventBus,
          killSwitchService: this.killSwitchService ?? undefined,
          wcServiceRef: this.wcServiceRef,
          wcSigningBridgeRef: this.wcSigningBridgeRef,
          approvalChannelRouter: this.approvalChannelRouter ?? undefined,
          versionCheckService: this._versionCheckService,
          encryptedBackupService: this._encryptedBackupService ?? undefined,
          adminStatsService: this.adminStatsService ?? undefined,
          autoStopService: this.autoStopService ?? undefined,
          metricsCounter: this.metricsCounter ?? undefined,
          hyperliquidMarketData: this.hyperliquidMarketData ?? undefined,
          polymarketInfra: this.polymarketInfra ?? undefined,
          signerRegistry,
          contractNameRegistry: this.contractNameRegistry ?? undefined,
        });

        const hostname = this._config!.daemon.hostname;
        const port = this._config!.daemon.port;
        const server = serve({
          fetch: app.fetch,
          hostname,
          port,
        });
        this.httpServer = server;

        // v31.14: Long-poll RPC proxy support -- keep connections alive for 10 minutes
        // Default Node.js keepAliveTimeout is 5s, which is too short for DELAY/APPROVAL tier
        // long-poll responses that can take up to 600s.
        (server as any).keepAliveTimeout = 600_000; // 600 seconds in milliseconds
        (server as any).headersTimeout = 605_000;   // Must be > keepAliveTimeout (Node.js docs)

        // Wait for server to actually start listening (catches EADDRINUSE)
        await new Promise<void>((resolve, reject) => {
          const onListening = () => {
            server.removeListener('error', onError);
            resolve();
          };
          const onError = (err: NodeJS.ErrnoException) => {
            server.removeListener('listening', onListening);
            if (err.code === 'EADDRINUSE') {
              reject(new Error(`Port ${port} is already in use. Try a different port or stop the other process.`));
            } else {
              reject(err);
            }
          };
          // @hono/node-server serve() returns a Node.js http.Server
          server.once('listening', onListening);
          server.once('error', onError);
        });

        console.debug(
          `Step 5: HTTP server listening on ${hostname}:${port}`,
        );
      })(),
      5_000,
      'STEP5_HTTP_SERVER',
    );

    // ------------------------------------------------------------------
    // Step 6: Background workers + PID (no timeout, fail-soft)
    // ------------------------------------------------------------------
    try {
      // Ensure workers instance exists (should already be created before Step 4c-9)
      if (!this.workers) {
        this.workers = new BackgroundWorkers();
      }

      // Register WAL checkpoint worker (default: 5 min = 300s)
      const walInterval = this._config!.database.wal_checkpoint_interval * 1000;
      this.workers.register('wal-checkpoint', {
        interval: walInterval,
        handler: () => {
          if (this.sqlite && !this._isShuttingDown) {
            this.sqlite.pragma('wal_checkpoint(PASSIVE)');
          }
        },
      });

      // Register session cleanup worker (1 min = 60s)
      this.workers.register('session-cleanup', {
        interval: 60_000,
        handler: () => {
          if (this.sqlite && !this._isShuttingDown) {
            // Notify expired sessions before deletion (fire-and-forget)
            if (this.notificationService) {
              try {
                const expired = this.sqlite.prepare(
                  "SELECT id, wallet_id FROM sessions WHERE expires_at > 0 AND expires_at < unixepoch() AND revoked_at IS NULL",
                ).all() as Array<{ id: string; wallet_id: string }>;
                for (const session of expired) {
                  void this.notificationService.notify('SESSION_EXPIRED', session.wallet_id, {
                    sessionId: session.id,
                  });
                }
              } catch {
                // Fire-and-forget: never block cleanup
              }
            }
            this.sqlite.exec(
              "DELETE FROM sessions WHERE expires_at > 0 AND expires_at < unixepoch() AND revoked_at IS NULL",
            );
          }
        },
      });

      // Register delay-expired worker (every 5s: check for expired DELAY transactions)
      // #327: Process expired items sequentially with concurrency limit to prevent
      // resource exhaustion from concurrent RPC calls when many items expire at once.
      if (this.delayQueue) {
        this.workers.register('delay-expired', {
          interval: 5_000,
          handler: () => {
            if (this._isShuttingDown) return;
            const now = Math.floor(Date.now() / 1000);
            const expired = this.delayQueue!.processExpired(now);
            if (expired.length === 0) return;
            // Process sequentially (one at a time) to avoid concurrent RPC/memory pressure
            void (async () => {
              for (const tx of expired) {
                if (this._isShuttingDown) break;
                try {
                  await this.executeFromStage5(tx.txId, tx.walletId);
                } catch (err) {
                  console.error(`[delay-expired] executeFromStage5(${tx.txId}) error:`, err);
                }
              }
            })();
          },
        });
      }

      // Register approval-expired worker (every 30s: expire timed-out approvals)
      if (this.approvalWorkflow) {
        this.workers.register('approval-expired', {
          interval: 30_000,
          handler: () => {
            if (this._isShuttingDown) return;
            const now = Math.floor(Date.now() / 1000);
            this.approvalWorkflow!.processExpiredApprovals(now);
          },
        });
      }

      // #329: Register submitted-tx-confirm worker (every 60s)
      // Retries confirmation for transactions stuck in SUBMITTED state after Stage 6 timeout.
      // Prevents STO-03 regression where on-chain success is not reflected in DB status.
      this.workers.register('submitted-tx-confirm', {
        interval: 60_000,
        handler: async () => {
          if (this._isShuttingDown || !this._db || !this.adapterPool || !this.sqlite) return;
          try {
            const { transactions } = await import('../infrastructure/database/schema.js');
            const { eq, and, isNotNull } = await import('drizzle-orm');
            const { insertAuditLog } = await import('../infrastructure/database/audit-helper.js');

            // Find SUBMITTED transactions with txHash that are older than 60s
            const cutoff = Math.floor(Date.now() / 1000) - 60;
            const stuckTxs = this._db
              .select({
                id: transactions.id,
                txHash: transactions.txHash,
                walletId: transactions.walletId,
                chain: transactions.chain,
                network: transactions.network,
                amount: transactions.amount,
                toAddress: transactions.toAddress,
                type: transactions.type,
              })
              .from(transactions)
              .where(
                and(
                  eq(transactions.status, 'SUBMITTED'),
                  isNotNull(transactions.txHash),
                ),
              )
              .all()
              .filter((tx) => {
                // Only retry if created before cutoff (avoid racing with Stage 6)
                const meta = this.sqlite!.prepare('SELECT created_at FROM transactions WHERE id = ?').get(tx.id) as { created_at?: number } | undefined;
                return !meta?.created_at || meta.created_at < cutoff;
              });

            for (const tx of stuckTxs) {
              if (this._isShuttingDown || !tx.txHash || !tx.network) continue;
              try {
                const rpcUrl = resolveRpcUrl(
                  this._config!.rpc as unknown as Record<string, string>,
                  tx.chain,
                  tx.network,
                );
                const adapter = await this.adapterPool!.resolve(
                  tx.chain as ChainType,
                  tx.network as NetworkType,
                  rpcUrl,
                );
                const result = await adapter.waitForConfirmation(tx.txHash, 10_000);
                if (result.status === 'confirmed' || result.status === 'finalized') {
                  const executedAt = new Date(Math.floor(Date.now() / 1000) * 1000);
                  this._db!
                    .update(transactions)
                    .set({ status: 'CONFIRMED', executedAt })
                    .where(eq(transactions.id, tx.id))
                    .run();
                  insertAuditLog(this.sqlite!, {
                    eventType: 'TX_CONFIRMED',
                    actor: 'system',
                    walletId: tx.walletId,
                    txId: tx.id,
                    details: { txHash: tx.txHash, source: 'submitted-tx-confirm-worker', network: tx.network },
                    severity: 'info',
                  });
                  void this.notificationService?.notify('TX_CONFIRMED', tx.walletId, {
                    txId: tx.id,
                    txHash: tx.txHash,
                    network: tx.network,
                    amount: tx.amount ?? '',
                    to: tx.toAddress ?? '',
                    type: tx.type ?? '',
                  }, { txId: tx.id });
                  console.info(`[submitted-tx-confirm] ${tx.id} confirmed via background retry`);
                } else if (result.status === 'failed') {
                  this._db!
                    .update(transactions)
                    .set({ status: 'FAILED', error: 'Transaction reverted on-chain (background check)' })
                    .where(eq(transactions.id, tx.id))
                    .run();
                  console.warn(`[submitted-tx-confirm] ${tx.id} failed on-chain`);
                }
                // status === 'submitted': still pending, retry on next interval
              } catch (_err) {
                // Swallow individual tx errors (RPC timeout, rate limit) — will retry next interval
              }
            }
          } catch (err) {
            console.error('[submitted-tx-confirm] worker error:', err);
          }
        },
      });

      // Register userop-build-cleanup worker (5 min = 300s)
      // Deletes expired build records from userop_builds table (10-min TTL)
      this.workers.register('userop-build-cleanup', {
        interval: 300_000,
        handler: () => {
          if (this.sqlite && !this._isShuttingDown) {
            const now = Math.floor(Date.now() / 1000);
            this.sqlite.prepare('DELETE FROM userop_builds WHERE expires_at < ?').run(now);
          }
        },
      });

      // Register credential-cleanup worker (5 min = 300s)
      // Deletes expired credentials from wallet_credentials table
      this.workers.register('credential-cleanup', {
        interval: 300_000,
        handler: () => {
          if (this.sqlite && !this._isShuttingDown) {
            const now = Math.floor(Date.now() / 1000);
            const result = this.sqlite.prepare(
              'DELETE FROM wallet_credentials WHERE expires_at IS NOT NULL AND expires_at < ?',
            ).run(now);
            if (result.changes > 0) {
              console.log(`[credential-cleanup] Deleted ${result.changes} expired credential(s)`);
            }
          }
        },
      });

      // Register async-status polling worker (30s)
      if (this._asyncPollingService) {
        const pollingService = this._asyncPollingService;
        this.workers.register('async-status', {
          interval: 30_000,
          handler: async () => {
            if (this._isShuttingDown) return;
            await pollingService.pollAll();
          },
        });
      }

      // Register version-check worker (uses instance created in Step 4g)
      if (this._versionCheckService) {
        const versionCheckInterval = this._config!.daemon.update_check_interval * 1000;
        this.workers.register('version-check', {
          interval: versionCheckInterval,
          runImmediately: true,
          handler: async () => { await this._versionCheckService!.check(); },
        });
        console.debug('Step 6: Version check worker registered');
      } else {
        console.debug('Step 6: Version check disabled');
      }

      // Register backup worker (auto-backup scheduler)
      if (this._encryptedBackupService && this._config!.backup.interval > 0) {
        const backupInterval = this._config!.backup.interval * 1000; // seconds -> ms
        const retentionCount = this._config!.backup.retention_count;
        const backupService = this._encryptedBackupService;
        const masterPwd = this.masterPassword;

        this.workers.register('backup-worker', {
          interval: backupInterval,
          handler: async () => {
            if (this._isShuttingDown) return;
            try {
              const info = await backupService.createBackup(masterPwd);
              console.log(`Auto-backup created: ${info.filename} (${info.size} bytes)`);
              const pruned = backupService.pruneBackups(retentionCount);
              if (pruned > 0) {
                console.log(`Auto-backup: pruned ${pruned} old backup(s), keeping ${retentionCount}`);
              }
            } catch (err) {
              console.error('Auto-backup failed:', err);
            }
          },
        });
        console.debug(`Step 6: Backup worker registered (interval=${this._config!.backup.interval}s, retention=${retentionCount})`);
      } else {
        console.debug('Step 6: Backup worker disabled (interval=0 or no backup service)');
      }

      this.workers.startAll();

      // Write PID file
      this.pidPath = join(dataDir, this._config!.daemon.pid_file);
      writeFileSync(this.pidPath, String(process.pid), 'utf-8');

      console.debug(`Step 6: Workers started, PID file written`);
      console.log(
        `WAIaaS daemon ready on http://${this._config!.daemon.hostname}:${this._config!.daemon.port} (PID: ${process.pid})\n` +
        `  Admin UI: http://${this._config!.daemon.hostname}:${this._config!.daemon.port}/admin`,
      );
    } catch (err) {
      console.warn('Step 6 (fail-soft): Worker/PID warning:', err);
    }
  }

  /**
   * 10-step graceful shutdown cascade.
   */
  async shutdown(signal: string): Promise<void> {
    // Guard against double shutdown
    if (this._isShuttingDown) return;
    this._isShuttingDown = true;

    console.log(`Shutdown initiated by ${signal}`);

    // Start force-exit timer (configurable, default 30s)
    const timeout = this._config?.daemon.shutdown_timeout ?? 30;
    this.forceTimer = setTimeout(() => {
      console.error('Force exit: shutdown timeout exceeded');
      process.exit(1);
    }, timeout * 1000);
    this.forceTimer.unref(); // don't prevent exit

    try {
      // Steps 1: Set flag + log (done above)

      // Steps 2-4: HTTP server close
      if (this.httpServer) {
        this.httpServer.close();
        console.log('Steps 2-4: HTTP server closed');
      }

      // Steps 5: In-flight signing -- STUB (Phase 50-04)
      // Steps 6: Pending queue persistence -- STUB (Phase 50-04)

      // Disconnect all chain adapters
      if (this.adapterPool) {
        try {
          await this.adapterPool.disconnectAll();
          console.log('Adapter pool disconnected');
        } catch (err) {
          console.warn('Adapter pool disconnect warning:', err);
        }
        this.adapterPool = null;
      }

      // Stop AutoStop engine (before EventBus cleanup)
      if (this.autoStopService) {
        this.autoStopService.stop();
        this.autoStopService = null;
      }

      // Stop PositionTracker (before BalanceMonitor for cleaner ordering)
      if (this.positionTracker) {
        this.positionTracker.stop();
        this.positionTracker = null;
      }

      // Stop DeFiMonitorService
      if (this.defiMonitorService) {
        this.defiMonitorService.stop();
        this.defiMonitorService = null;
      }

      // Stop BalanceMonitorService (before EventBus cleanup)
      if (this.balanceMonitorService) {
        this.balanceMonitorService.stop();
        this.balanceMonitorService = null;
      }

      // Stop TelegramBotService (before EventBus cleanup)
      if (this.telegramBotService) {
        this.telegramBotService.stop();
        this.telegramBotService = null;
        this.telegramBotRef.current = null;
      }

      // Stop ApprovalChannelRouter (shuts down signing channels)
      if (this.approvalChannelRouter) {
        this.approvalChannelRouter.shutdown();
        this.approvalChannelRouter = null;
      }

      // Stop WcSessionService (before EventBus cleanup)
      if (this.wcSessionService) {
        try {
          await this.wcSessionService.shutdown();
        } catch (err) {
          console.warn('WcSessionService shutdown warning:', err);
        }
        this.wcSessionService = null;
        this.wcServiceRef.current = null;
      }

      // Stop IncomingTxMonitorService (final flush + destroy subscribers)
      if (this.incomingTxMonitorService) {
        try {
          await this.incomingTxMonitorService.stop();
        } catch (err) {
          console.warn('IncomingTxMonitorService shutdown warning:', err);
        }
        this.incomingTxMonitorService = null;
      }

      // Clear AsyncPollingService reference (workers.stopAll() handles the timer)
      this._asyncPollingService = null;

      // WebhookService destroy (before removing EventBus listeners)
      this.webhookService?.destroy();
      this.webhookService = null;

      // Step 6b: Remove all EventBus listeners
      this.eventBus.removeAllListeners();

      // Step 7: Stop background workers
      if (this.workers) {
        await this.workers.stopAll();
        console.log('Step 7: Workers stopped');
      }

      // Step 8: WAL checkpoint(TRUNCATE)
      if (this.sqlite) {
        try {
          this.sqlite.pragma('wal_checkpoint(TRUNCATE)');
          console.log('Step 8: WAL checkpoint complete');
        } catch (err) {
          console.warn('Step 8: WAL checkpoint warning:', err);
        }
      }

      // Step 9: Keystore lock (sodium_memzero all guarded buffers)
      if (this.keyStore) {
        this.keyStore.lockAll();
        console.log('Step 9: Keystore locked');
      }

      // Clear master password and hash from memory
      this.masterPassword = '';
      this.masterPasswordHash = '';
      if (this.passwordRef) {
        this.passwordRef.password = '';
        this.passwordRef.hash = '';
        this.passwordRef = null;
      }

      // Step 10: Close DB, unlink PID, release lock
      if (this.sqlite) {
        try {
          this.sqlite.close();
          console.log('Step 10: Database closed');
        } catch (err) {
          console.warn('Step 10: DB close warning:', err);
        }
        this.sqlite = null;
        this._db = null;
      }

      // Delete PID file
      if (this.pidPath) {
        try {
          unlinkSync(this.pidPath);
        } catch {
          // Ignore if already deleted
        }
      }

      // Release daemon lock
      if (this.releaseLock) {
        try {
          await this.releaseLock();
        } catch {
          // Ignore lock release errors during shutdown
        }
        this.releaseLock = null;
      }

      // Cancel force timer
      if (this.forceTimer) {
        clearTimeout(this.forceTimer);
        this.forceTimer = null;
      }

      console.log('Shutdown complete');
      process.exit(0);
    } catch (err) {
      console.error('Shutdown error:', err);
      process.exit(1);
    }
  }

  /**
   * Re-enter the pipeline at stage4 for a gas-condition-met transaction.
   *
   * Called by the resumePipeline callback in AsyncPollingService when
   * GasConditionTracker returns COMPLETED. Skips stages 1-3 and 3.5
   * (already evaluated). Runs stage5Execute + stage6Confirm.
   *
   * Gas-condition transactions bypass stage4Wait (policy was already evaluated
   * at Stage 3, and the transaction was only waiting for gas price -- no further
   * delay/approval needed).
   *
   * @param txId - Transaction ID to execute
   * @param walletId - Wallet that owns the transaction
   */
  private async executeFromStage4(txId: string, walletId: string): Promise<void> {
    try {
      if (!this._db || !this.adapterPool || !this.keyStore || !this._config) {
        console.warn(`executeFromStage4(${txId}): missing deps, skipping`);
        return;
      }

      // Import stages and schema
      const { stage5Execute, stage6Confirm } = await import('../pipeline/stages.js');
      const { wallets, transactions } = await import('../infrastructure/database/schema.js');
      const { eq } = await import('drizzle-orm');

      // Look up wallet from DB
      const wallet = this._db.select().from(wallets).where(eq(wallets.id, walletId)).get();
      if (!wallet) {
        console.warn(`executeFromStage4(${txId}): wallet ${walletId} not found`);
        return;
      }

      // Look up transaction to get request data
      const tx = this._db.select().from(transactions).where(eq(transactions.id, txId)).get();
      if (!tx) {
        console.warn(`executeFromStage4(${txId}): transaction not found`);
        return;
      }

      // Use network recorded at Stage 1 (NOT re-resolve)
      const resolvedNetwork: string =
        tx.network
        ?? getSingleNetwork(wallet.chain as ChainType, wallet.environment as EnvironmentType)
        ?? (() => { throw new WAIaaSError('NETWORK_REQUIRED'); })();

      // Resolve adapter from pool using recorded network
      const rpcUrl = resolveRpcUrl(
        this._config.rpc as unknown as Record<string, string>,
        wallet.chain,
        resolvedNetwork,
      );
      const adapter = await this.adapterPool.resolve(
        wallet.chain as ChainType,
        resolvedNetwork as NetworkType,
        rpcUrl,
      );

      // Restore original request from metadata (#208)
      // DELAY/GAS_WAITING re-entry needs full request to rebuild correct tx type
      const meta = tx.metadata ? JSON.parse(tx.metadata) : {};
      const request = meta.originalRequest ?? {
        to: tx.toAddress ?? '',
        amount: tx.amount ?? '0',
        memo: undefined,
      };

      // Construct PipelineContext for stages 5-6
      // Policy already evaluated at Stage 3 before GAS_WAITING entry
      const ctx: import('../pipeline/stages.js').PipelineContext = {
        db: this._db,
        adapter,
        keyStore: this.keyStore,
        policyEngine: null as any, // Not needed for stages 5-6
        masterPassword: this.masterPassword,
        walletId,
        wallet: {
          publicKey: wallet.publicKey,
          chain: wallet.chain,
          environment: wallet.environment,
          // #251: pass AA fields for Smart Account re-entry
          accountType: wallet.accountType,
          aaProvider: wallet.aaProvider,
          aaProviderApiKeyEncrypted: wallet.aaProviderApiKeyEncrypted,
          aaBundlerUrl: wallet.aaBundlerUrl,
          aaPaymasterUrl: wallet.aaPaymasterUrl,
          aaPaymasterPolicyId: wallet.aaPaymasterPolicyId,
        },
        resolvedNetwork,
        resolvedRpcUrl: rpcUrl,
        request,
        txId,
        eventBus: this.eventBus,
        notificationService: this.notificationService ?? undefined,
      };

      // Skip stage4Wait -- gas condition met, proceed directly to execution
      await stage5Execute(ctx);
      await stage6Confirm(ctx);
    } catch (error) {
      // Mark as FAILED if stages 5-6 throw
      try {
        if (this._db) {
          const { transactions } = await import('../infrastructure/database/schema.js');
          const { eq } = await import('drizzle-orm');
          const errorMessage = error instanceof Error ? error.message : 'Gas condition pipeline re-entry failed';
          this._db
            .update(transactions)
            .set({ status: 'FAILED', error: errorMessage })
            .where(eq(transactions.id, txId))
            .run();
        }
      } catch {
        // Swallow DB update errors in background
      }
    }
  }

  /**
   * Resume pipeline after APPROVAL tier owner sign-off (fix #246).
   *
   * Shared handler for all 4 approval paths:
   * 1. REST API (ApprovalWorkflow.approve)
   * 2. WalletConnect (WcSigningBridge -> ApprovalWorkflow.approve)
   * 3. Signing SDK (SignResponseHandler.handleApprove)
   * 4. Telegram Bot (TelegramBotService.handleApprove)
   *
   * Looks up the transaction's walletId, then delegates to executeFromStage5.
   */
  private handleApprovalApproved(txId: string): void {
    try {
      if (!this._db) return;

      const tx = this._db.select().from(txTable).where(eq(txTable.id, txId)).get();
      if (tx) {
        void this.executeFromStage5(txId, tx.walletId);
      }
    } catch (error) {
      console.warn(`[handleApprovalApproved] Failed for ${txId}:`, error);
    }
  }

  /**
   * Re-enter the pipeline at stage5 for a delay-expired transaction.
   *
   * Called by the delay-expired BackgroundWorker when processExpired()
   * returns transactions whose cooldown has elapsed.
   * Also called by handleApprovalApproved for APPROVAL tier transactions.
   *
   * @param txId - Transaction ID to execute
   * @param walletId - Wallet that owns the transaction
   */
  private async executeFromStage5(txId: string, walletId: string): Promise<void> {
    try {
      if (!this._db || !this.adapterPool || !this.keyStore || !this._config) {
        console.warn(`executeFromStage5(${txId}): missing deps, skipping`);
        return;
      }

      // Import stages and schema
      const { stage5Execute, stage6Confirm } = await import('../pipeline/stages.js');
      const { wallets, transactions } = await import('../infrastructure/database/schema.js');
      const { eq } = await import('drizzle-orm');

      // Look up wallet from DB
      const wallet = this._db.select().from(wallets).where(eq(wallets.id, walletId)).get();
      if (!wallet) {
        console.warn(`executeFromStage5(${txId}): wallet ${walletId} not found`);
        return;
      }

      // Look up transaction to get request data
      const tx = this._db.select().from(transactions).where(eq(transactions.id, txId)).get();
      if (!tx) {
        console.warn(`executeFromStage5(${txId}): transaction not found`);
        return;
      }

      // Use network recorded at Stage 1 (NOT re-resolve)
      const resolvedNetwork: string =
        tx.network
        ?? getSingleNetwork(wallet.chain as ChainType, wallet.environment as EnvironmentType)
        ?? (() => { throw new WAIaaSError('NETWORK_REQUIRED'); })();

      // Resolve adapter from pool using recorded network
      const rpcUrl = resolveRpcUrl(
        this._config.rpc as unknown as Record<string, string>,
        wallet.chain,
        resolvedNetwork,
      );
      const adapter = await this.adapterPool.resolve(
        wallet.chain as ChainType,
        resolvedNetwork as NetworkType,
        rpcUrl,
      );

      // Restore original request from metadata (#208)
      const meta = tx.metadata ? JSON.parse(tx.metadata) : {};
      let request = meta.originalRequest ?? {
        to: tx.toAddress ?? '',
        amount: tx.amount ?? '0',
        memo: undefined,
      };

      // Phase 321: Re-encode calldata for EIP-712 approvals (setAgentWallet)
      // The original calldata has a placeholder '0x' signature. On approval,
      // the Owner's real EIP-712 signature is stored in pending_approvals.
      // Re-encode the calldata with the real signature before stage5Execute.
      if (this.sqlite) {
        const approvalRow = this.sqlite.prepare(
          'SELECT approval_type, typed_data_json, owner_signature FROM pending_approvals WHERE tx_id = ?',
        ).get(txId) as { approval_type: string; typed_data_json: string | null; owner_signature: string | null } | undefined;

        if (approvalRow?.approval_type === 'EIP712' && approvalRow.typed_data_json && approvalRow.owner_signature) {
          try {
            const typedData = JSON.parse(approvalRow.typed_data_json);
            const { encodeFunctionData } = await import('viem');
            const { IDENTITY_REGISTRY_ABI } = await import('@waiaas/actions');
            const reEncodedCalldata = encodeFunctionData({
              abi: IDENTITY_REGISTRY_ABI,
              functionName: 'setAgentWallet',
              args: [
                BigInt(typedData.message.agentId),
                typedData.message.newWallet as `0x${string}`,
                BigInt(typedData.message.deadline),
                approvalRow.owner_signature as `0x${string}`,
              ],
            });
            // Replace calldata in the request object
            request = { ...request, calldata: reEncodedCalldata };
          } catch (err) {
            console.warn(`[executeFromStage5] EIP-712 calldata re-encoding failed for ${txId}:`, err);
          }
        }
      }

      // Construct PipelineContext for stages 5-6
      const ctx: import('../pipeline/stages.js').PipelineContext = {
        db: this._db,
        adapter,
        keyStore: this.keyStore,
        policyEngine: null as any, // Not needed for stages 5-6
        masterPassword: this.masterPassword,
        walletId,
        wallet: {
          publicKey: wallet.publicKey,
          chain: wallet.chain,
          environment: wallet.environment,
          // #251: pass AA fields for Smart Account re-entry
          accountType: wallet.accountType,
          aaProvider: wallet.aaProvider,
          aaProviderApiKeyEncrypted: wallet.aaProviderApiKeyEncrypted,
          aaBundlerUrl: wallet.aaBundlerUrl,
          aaPaymasterUrl: wallet.aaPaymasterUrl,
          aaPaymasterPolicyId: wallet.aaPaymasterPolicyId,
        },
        resolvedNetwork,
        resolvedRpcUrl: rpcUrl,
        request,
        txId,
        eventBus: this.eventBus,
        notificationService: this.notificationService ?? undefined,
      };

      await stage5Execute(ctx);
      await stage6Confirm(ctx);
    } catch (error) {
      // Mark as FAILED if stages 5-6 throw
      try {
        if (this._db) {
          const { transactions } = await import('../infrastructure/database/schema.js');
          const { eq } = await import('drizzle-orm');
          const errorMessage = error instanceof Error ? error.message : 'Pipeline re-entry failed';
          this._db
            .update(transactions)
            .set({ status: 'FAILED', error: errorMessage })
            .where(eq(transactions.id, txId))
            .run();
        }
      } catch {
        // Swallow DB update errors in background
      }
    }
  }

  /**
   * Acquire an exclusive daemon lock to prevent multiple instances.
   * Uses proper-lockfile for cross-platform support.
   */
  private async acquireDaemonLock(dataDir: string): Promise<void> {
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
