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
 *   5. HTTP server start (5s, fail-fast)
 *   6. Background workers + PID (no timeout, fail-soft)
 *
 * Shutdown sequence (doc 28 section 3):
 *   1. Set isShuttingDown, start force timer, log signal
 *   2-4. HTTP server close
 *   5. In-flight signing -- STUB (Phase 50-04)
 *   6. Pending queue persistence -- STUB (Phase 50-04)
 *   6a. Stop TelegramBot, WcSessionService, AutoStop, BalanceMonitor
 *   6b. Remove all EventBus listeners
 *   7. workers.stopAll()
 *   8. WAL checkpoint(TRUNCATE)
 *   9. keyStore.lockAll()
 *   10. sqlite.close(), unlink PID, close lockFd, process.exit(0)
 *
 * @see docs/28-daemon-lifecycle-cli.md
 */

import { writeFileSync, unlinkSync, existsSync, mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import type { Database as DatabaseType } from 'better-sqlite3';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { WAIaaSError, getDefaultNetwork, EventBus } from '@waiaas/core';
import { KillSwitchService } from '../services/kill-switch-service.js';
import { AutoStopService } from '../services/autostop-service.js';
import type { AutoStopConfig } from '../services/autostop-service.js';
import type { BalanceMonitorService, BalanceMonitorConfig } from '../services/monitoring/balance-monitor-service.js';
import type { ChainType, NetworkType, EnvironmentType } from '@waiaas/core';
import type { AdapterPool } from '../infrastructure/adapter-pool.js';
import { resolveRpcUrl } from '../infrastructure/adapter-pool.js';
import { createDatabase, pushSchema, checkSchemaCompatibility } from '../infrastructure/database/index.js';
import type { LocalKeyStore } from '../infrastructure/keystore/index.js';
import { loadConfig } from '../infrastructure/config/index.js';
import type { DaemonConfig } from '../infrastructure/config/index.js';
import { BackgroundWorkers } from './workers.js';
import { keyValueStore } from '../infrastructure/database/schema.js';
import type * as schema from '../infrastructure/database/schema.js';
import { eq } from 'drizzle-orm';
import { decrypt } from '../infrastructure/keystore/crypto.js';
import { DelayQueue } from '../workflow/delay-queue.js';
import { ApprovalWorkflow } from '../workflow/approval-workflow.js';
import { DatabasePolicyEngine } from '../pipeline/database-policy-engine.js';
import { JwtSecretManager } from '../infrastructure/jwt/index.js';
import argon2 from 'argon2';
import type { IPriceOracle, IForexRateService } from '@waiaas/core';

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
  private apiKeyStore: import('../infrastructure/action/api-key-store.js').ApiKeyStore | null = null;
  private forexRateService: IForexRateService | null = null;
  private eventBus: EventBus = new EventBus();
  private killSwitchService: KillSwitchService | null = null;
  private autoStopService: AutoStopService | null = null;
  private balanceMonitorService: BalanceMonitorService | null = null;
  private telegramBotService: import('../infrastructure/telegram/telegram-bot-service.js').TelegramBotService | null = null;
  private telegramBotRef: { current: import('../infrastructure/telegram/telegram-bot-service.js').TelegramBotService | null } = { current: null };
  private wcSessionService: import('../services/wc-session-service.js').WcSessionService | null = null;
  private wcServiceRef: import('../services/wc-session-service.js').WcServiceRef = { current: null };
  private wcSigningBridge: import('../services/wc-signing-bridge.js').WcSigningBridge | null = null;
  private approvalChannelRouter: import('../services/signing-sdk/approval-channel-router.js').ApprovalChannelRouter | null = null;
  private _versionCheckService: import('../infrastructure/version/version-check-service.js').VersionCheckService | null = null;

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
          const { AdapterPool } = await import('../infrastructure/adapter-pool.js');
          this.adapterPool = new AdapterPool();
          console.debug('Step 4: AdapterPool created (lazy init)');
        })(),
        10_000,
        'STEP4_ADAPTER',
      );
    } catch (err) {
      // fail-soft: log warning but continue (daemon runs without chain adapter)
      console.warn('Step 4 (fail-soft): AdapterPool init warning:', err);
      this.adapterPool = null;
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
      const { NotificationService, TelegramChannel, DiscordChannel, NtfyChannel, SlackChannel } =
        await import('../notifications/index.js');

      this.notificationService = new NotificationService({
        db: this._db ?? undefined,
        config: {
          locale: (this._config!.notifications.locale ?? 'en') as 'en' | 'ko',
          rateLimitRpm: this._config!.notifications.rate_limit_rpm ?? 20,
        },
      });

      // Initialize configured channels only when enabled
      if (this._config!.notifications.enabled) {
        const notifConfig = this._config!.notifications;

        if (notifConfig.telegram_bot_token && notifConfig.telegram_chat_id) {
          const telegram = new TelegramChannel();
          await telegram.initialize({
            telegram_bot_token: notifConfig.telegram_bot_token,
            telegram_chat_id: notifConfig.telegram_chat_id,
          });
          this.notificationService.addChannel(telegram);
        }

        if (notifConfig.discord_webhook_url) {
          const discord = new DiscordChannel();
          await discord.initialize({
            discord_webhook_url: notifConfig.discord_webhook_url,
          });
          this.notificationService.addChannel(discord);
        }

        if (notifConfig.ntfy_topic) {
          const ntfy = new NtfyChannel();
          await ntfy.initialize({
            ntfy_server: notifConfig.ntfy_server,
            ntfy_topic: notifConfig.ntfy_topic,
          });
          this.notificationService.addChannel(ntfy);
        }

        if (notifConfig.slack_webhook_url) {
          const slack = new SlackChannel();
          await slack.initialize({
            slack_webhook_url: notifConfig.slack_webhook_url,
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
      const botEnabled = ss ? ss.get('telegram.enabled') === 'true' : this._config!.telegram.enabled;
      // Token priority: telegram.bot_token > notifications.telegram_bot_token > config.toml
      const botToken = (ss ? (ss.get('telegram.bot_token') || ss.get('notifications.telegram_bot_token')) : null)
        || this._config!.telegram.bot_token;
      if (botEnabled && botToken) {
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
        this.wcSigningBridge = new WcSigningBridge({
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
      this.wcSigningBridge = null;
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
        });
        const signResponseHandler = new SignResponseHandler({ sqlite: this.sqlite! });
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
    // Step 4f: ActionProviderRegistry + ApiKeyStore (fail-soft)
    // ------------------------------------------------------------------
    try {
      const { ActionProviderRegistry, ApiKeyStore } =
        await import('../infrastructure/action/index.js');

      this.apiKeyStore = new ApiKeyStore(this._db!, masterPassword);
      this.actionProviderRegistry = new ActionProviderRegistry();

      // Load plugins from ~/.waiaas/actions/ (if exists)
      const actionsDir = join(dataDir, 'actions');
      if (existsSync(actionsDir)) {
        const result = await this.actionProviderRegistry.loadPlugins(actionsDir);
        console.debug(
          `Step 4f: ActionProviderRegistry initialized (${result.loaded.length} plugins loaded, ${result.failed.length} failed)`,
        );
      } else {
        console.debug('Step 4f: ActionProviderRegistry initialized (no plugins directory)');
      }
    } catch (err) {
      console.warn('Step 4f (fail-soft): ActionProviderRegistry init warning:', err);
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
          sqlite: this.sqlite,
          telegramBotRef: this.telegramBotRef,
          killSwitchService: this.killSwitchService,
        });

        const app = createApp({
          db: this._db!,
          sqlite: this.sqlite ?? undefined,
          keyStore: this.keyStore!,
          masterPassword: this.masterPassword,
          masterPasswordHash: this.masterPasswordHash || undefined,
          config: this._config!,
          adapterPool: this.adapterPool,
          policyEngine: new DatabasePolicyEngine(
            this._db!,
            this.sqlite ?? undefined,
            this._settingsService ?? undefined,
          ),
          jwtSecretManager: this.jwtSecretManager ?? undefined,
          delayQueue: this.delayQueue ?? undefined,
          approvalWorkflow: this.approvalWorkflow ?? undefined,
          notificationService: this.notificationService ?? undefined,
          settingsService: this._settingsService ?? undefined,
          priceOracle: this.priceOracle,
          actionProviderRegistry: this.actionProviderRegistry ?? undefined,
          apiKeyStore: this.apiKeyStore ?? undefined,
          onSettingsChanged: (changedKeys: string[]) => {
            void hotReloader.handleChangedKeys(changedKeys);
          },
          dataDir,
          forexRateService: this.forexRateService ?? undefined,
          eventBus: this.eventBus,
          killSwitchService: this.killSwitchService ?? undefined,
          wcServiceRef: this.wcServiceRef,
          wcSigningBridge: this.wcSigningBridge ?? undefined,
          approvalChannelRouter: this.approvalChannelRouter ?? undefined,
          versionCheckService: this._versionCheckService,
        });

        const hostname = this._config!.daemon.hostname;
        const port = this._config!.daemon.port;
        const server = serve({
          fetch: app.fetch,
          hostname,
          port,
        });
        this.httpServer = server;

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
      this.workers = new BackgroundWorkers();

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
                  "SELECT id, wallet_id FROM sessions WHERE expires_at < unixepoch() AND revoked_at IS NULL",
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
              "DELETE FROM sessions WHERE expires_at < unixepoch() AND revoked_at IS NULL",
            );
          }
        },
      });

      // Register delay-expired worker (every 5s: check for expired DELAY transactions)
      if (this.delayQueue) {
        this.workers.register('delay-expired', {
          interval: 5_000,
          handler: () => {
            if (this._isShuttingDown) return;
            const now = Math.floor(Date.now() / 1000);
            const expired = this.delayQueue!.processExpired(now);
            for (const tx of expired) {
              void this.executeFromStage5(tx.txId, tx.walletId);
            }
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
   * Re-enter the pipeline at stage5 for a delay-expired transaction.
   *
   * Called by the delay-expired BackgroundWorker when processExpired()
   * returns transactions whose cooldown has elapsed.
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

      // Use network recorded at Stage 1 (NOT re-resolve -- wallet.defaultNetwork may have changed)
      const resolvedNetwork: string =
        tx.network
        ?? getDefaultNetwork(wallet.chain as ChainType, wallet.environment as EnvironmentType);

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

      // Construct minimal PipelineContext for stages 5-6
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
          defaultNetwork: wallet.defaultNetwork ?? null,
        },
        resolvedNetwork,
        request: {
          to: tx.toAddress ?? '',
          amount: tx.amount ?? '0',
          memo: undefined,
        },
        txId,
        eventBus: this.eventBus,
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
