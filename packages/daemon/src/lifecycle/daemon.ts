/**
 * DaemonLifecycle - orchestrates daemon startup (6 steps) and shutdown (10 steps).
 *
 * Startup sequence (doc 28 section 2):
 *   1. Environment validation + config + flock (5s timeout, fail-fast)
 *   2. Database initialization (30s timeout, fail-fast)
 *   3. Keystore unlock (30s timeout, fail-fast)
 *   4. Adapter initialization (10s, fail-soft)
 *   5. HTTP server start (5s, fail-fast)
 *   6. Background workers + PID (no timeout, fail-soft)
 *
 * Shutdown sequence (doc 28 section 3):
 *   1. Set isShuttingDown, start force timer, log signal
 *   2-4. HTTP server close
 *   5. In-flight signing -- STUB (Phase 50-04)
 *   6. Pending queue persistence -- STUB (Phase 50-04)
 *   7. workers.stopAll()
 *   8. WAL checkpoint(TRUNCATE)
 *   9. keyStore.lockAll()
 *   10. sqlite.close(), unlink PID, close lockFd, process.exit(0)
 *
 * @see docs/28-daemon-lifecycle-cli.md
 */

import { writeFileSync, unlinkSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import type { Database as DatabaseType } from 'better-sqlite3';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { WAIaaSError } from '@waiaas/core';
import type { IChainAdapter } from '@waiaas/core';
import { createDatabase, pushSchema } from '../infrastructure/database/index.js';
import type { LocalKeyStore } from '../infrastructure/keystore/index.js';
import { loadConfig } from '../infrastructure/config/index.js';
import type { DaemonConfig } from '../infrastructure/config/index.js';
import { BackgroundWorkers } from './workers.js';
import type * as schema from '../infrastructure/database/schema.js';
import { DelayQueue } from '../workflow/delay-queue.js';
import { ApprovalWorkflow } from '../workflow/approval-workflow.js';
import { DatabasePolicyEngine } from '../pipeline/database-policy-engine.js';
import { JwtSecretManager } from '../infrastructure/jwt/index.js';
import argon2 from 'argon2';

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
  private adapter: IChainAdapter | null = null;
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

        console.log('Step 1: Config loaded, daemon lock acquired');
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

        // Create all tables (idempotent)
        pushSchema(sqlite);

        console.log('Step 2: Database initialized');
      })(),
      30_000,
      'STEP2_DATABASE',
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
          console.log('Step 3: Keystore infrastructure verified (master password provided)');
        } else {
          console.log('Step 3: Keystore infrastructure verified (no master password)');
        }
      })(),
      30_000,
      'STEP3_KEYSTORE',
    );

    // ------------------------------------------------------------------
    // Step 4: Adapter initialization (10s, fail-soft)
    // ------------------------------------------------------------------
    try {
      await withTimeout(
        (async () => {
          // Dynamic import for @waiaas/adapter-solana
          const { SolanaAdapter } = await import('@waiaas/adapter-solana');
          this.adapter = new SolanaAdapter('devnet');

          // Determine RPC URL from config (v1.1: devnet only)
          const rpcUrl = this._config!.rpc.solana_devnet;
          await this.adapter.connect(rpcUrl);

          console.log('Step 4: SolanaAdapter connected to', rpcUrl);
        })(),
        10_000,
        'STEP4_ADAPTER',
      );
    } catch (err) {
      // fail-soft: log warning but continue (daemon runs without chain adapter)
      console.warn('Step 4 (fail-soft): Adapter init warning:', err);
      this.adapter = null;
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
      console.log('Step 4b: Workflow instances created (DelayQueue + ApprovalWorkflow)');
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
      console.log('Step 4c: JWT secret manager initialized, master password hashed');
    }

    // ------------------------------------------------------------------
    // Step 4d: Notification Service initialization (fail-soft)
    // ------------------------------------------------------------------
    try {
      if (this._config!.notifications.enabled) {
        const { NotificationService, TelegramChannel, DiscordChannel, NtfyChannel } =
          await import('../notifications/index.js');

        this.notificationService = new NotificationService({
          db: this._db ?? undefined,
          config: {
            locale: (this._config!.notifications.locale ?? 'en') as 'en' | 'ko',
            rateLimitRpm: this._config!.notifications.rate_limit_rpm ?? 20,
          },
        });

        // Initialize configured channels from config
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

        const channelNames = this.notificationService.getChannelNames();
        console.log(
          `Step 4d: NotificationService initialized (${channelNames.length} channels: ${channelNames.join(', ') || 'none'})`,
        );
      } else {
        console.log('Step 4d: Notifications disabled');
      }
    } catch (err) {
      console.warn('Step 4d (fail-soft): NotificationService init warning:', err);
      this.notificationService = null;
    }

    // ------------------------------------------------------------------
    // Step 5: HTTP server start (5s, fail-fast)
    // ------------------------------------------------------------------
    await withTimeout(
      (async () => {
        const { createApp } = await import('../api/index.js');
        const { serve } = await import('@hono/node-server');

        const app = createApp({
          db: this._db!,
          sqlite: this.sqlite ?? undefined,
          keyStore: this.keyStore!,
          masterPassword: this.masterPassword,
          masterPasswordHash: this.masterPasswordHash || undefined,
          config: this._config!,
          adapter: this.adapter,
          policyEngine: new DatabasePolicyEngine(this._db!, this.sqlite ?? undefined),
          jwtSecretManager: this.jwtSecretManager ?? undefined,
          delayQueue: this.delayQueue ?? undefined,
          approvalWorkflow: this.approvalWorkflow ?? undefined,
          notificationService: this.notificationService ?? undefined,
        });

        this.httpServer = serve({
          fetch: app.fetch,
          hostname: this._config!.daemon.hostname,
          port: this._config!.daemon.port,
        });

        console.log(
          `Step 5: HTTP server listening on ${this._config!.daemon.hostname}:${this._config!.daemon.port}`,
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
              void this.executeFromStage5(tx.txId, tx.agentId);
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

      this.workers.startAll();

      // Write PID file
      this.pidPath = join(dataDir, this._config!.daemon.pid_file);
      writeFileSync(this.pidPath, String(process.pid), 'utf-8');

      console.log(`Step 6: Workers started, PID file written`);
      console.log(`WAIaaS daemon ready (PID: ${process.pid})`);
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

      // Disconnect chain adapter
      if (this.adapter) {
        try {
          await this.adapter.disconnect();
          console.log('Adapter disconnected');
        } catch (err) {
          console.warn('Adapter disconnect warning:', err);
        }
        this.adapter = null;
      }

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
    } catch (err) {
      console.error('Shutdown error:', err);
    }
  }

  /**
   * Re-enter the pipeline at stage5 for a delay-expired transaction.
   *
   * Called by the delay-expired BackgroundWorker when processExpired()
   * returns transactions whose cooldown has elapsed.
   *
   * @param txId - Transaction ID to execute
   * @param agentId - Agent that owns the transaction
   */
  private async executeFromStage5(txId: string, agentId: string): Promise<void> {
    try {
      if (!this._db || !this.adapter || !this.keyStore) {
        console.warn(`executeFromStage5(${txId}): missing deps, skipping`);
        return;
      }

      // Import stages and schema
      const { stage5Execute, stage6Confirm } = await import('../pipeline/stages.js');
      const { agents, transactions } = await import('../infrastructure/database/schema.js');
      const { eq } = await import('drizzle-orm');

      // Look up agent from DB
      const agent = this._db.select().from(agents).where(eq(agents.id, agentId)).get();
      if (!agent) {
        console.warn(`executeFromStage5(${txId}): agent ${agentId} not found`);
        return;
      }

      // Look up transaction to get request data
      const tx = this._db.select().from(transactions).where(eq(transactions.id, txId)).get();
      if (!tx) {
        console.warn(`executeFromStage5(${txId}): transaction not found`);
        return;
      }

      // Construct minimal PipelineContext for stages 5-6
      const ctx: import('../pipeline/stages.js').PipelineContext = {
        db: this._db,
        adapter: this.adapter,
        keyStore: this.keyStore,
        policyEngine: null as any, // Not needed for stages 5-6
        masterPassword: this.masterPassword,
        agentId,
        agent: {
          publicKey: agent.publicKey,
          chain: agent.chain,
          network: agent.network,
        },
        request: {
          to: tx.toAddress ?? '',
          amount: tx.amount ?? '0',
          memo: undefined,
        },
        txId,
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
