/**
 * daemon-shutdown.ts - Extracted 10-step shutdown cascade from DaemonLifecycle.
 *
 * Contains the full shutdown() body that was previously ~180 lines in daemon.ts.
 * Receives a DaemonState context object to read/write daemon fields.
 *
 * @see docs/28-daemon-lifecycle-cli.md
 */

import { unlinkSync } from 'node:fs';
import type { DaemonState } from './daemon.js';

/**
 * 10-step graceful shutdown cascade.
 */
export async function shutdownDaemon(state: DaemonState, signal: string): Promise<void> {
  // Guard against double shutdown
  if (state._isShuttingDown) return;
  state._isShuttingDown = true;

  const log = state.logger;
  log.info(`Shutdown initiated by ${signal}`);

  // Start force-exit timer (configurable, default 30s)
  const timeout = state._config?.daemon.shutdown_timeout ?? 30;
  state.forceTimer = setTimeout(() => {
    console.error('Force exit: shutdown timeout exceeded');
    process.exit(1);
  }, timeout * 1000);
  state.forceTimer.unref(); // don't prevent exit

  try {
    // Steps 1: Set flag + log (done above)

    // Steps 2-4: HTTP server close
    if (state.httpServer) {
      state.httpServer.close();
      log.debug('Steps 2-4: HTTP server closed');
    }

    // Steps 5-6: In-flight signing + pending queue persistence -- not yet implemented

    // Disconnect all chain adapters
    if (state.adapterPool) {
      try {
        await state.adapterPool.disconnectAll();
        log.debug('Adapter pool disconnected');
      } catch (err) {
        console.warn('Adapter pool disconnect warning:', err);
      }
      state.adapterPool = null;
    }

    // Stop AutoStop engine (before EventBus cleanup)
    if (state.autoStopService) {
      state.autoStopService.stop();
      state.autoStopService = null;
    }

    // Stop PositionTracker (before BalanceMonitor for cleaner ordering)
    if (state.positionTracker) {
      state.positionTracker.stop();
      state.positionTracker = null;
    }

    // Stop DeFiMonitorService
    if (state.defiMonitorService) {
      state.defiMonitorService.stop();
      state.defiMonitorService = null;
    }

    // Stop BalanceMonitorService (before EventBus cleanup)
    if (state.balanceMonitorService) {
      state.balanceMonitorService.stop();
      state.balanceMonitorService = null;
    }

    // Stop TelegramBotService (before EventBus cleanup)
    if (state.telegramBotService) {
      state.telegramBotService.stop();
      state.telegramBotService = null;
      state.telegramBotRef.current = null;
    }

    // Stop ApprovalChannelRouter (shuts down signing channels)
    if (state.approvalChannelRouter) {
      state.approvalChannelRouter.shutdown();
      state.approvalChannelRouter = null;
    }

    // Stop WcSessionService (before EventBus cleanup)
    if (state.wcSessionService) {
      try {
        await state.wcSessionService.shutdown();
      } catch (err) {
        console.warn('WcSessionService shutdown warning:', err);
      }
      state.wcSessionService = null;
      state.wcServiceRef.current = null;
    }

    // Stop IncomingTxMonitorService (final flush + destroy subscribers)
    if (state.incomingTxMonitorService) {
      try {
        await state.incomingTxMonitorService.stop();
      } catch (err) {
        console.warn('IncomingTxMonitorService shutdown warning:', err);
      }
      state.incomingTxMonitorService = null;
    }

    // Clear AsyncPollingService reference (workers.stopAll() handles the timer)
    state._asyncPollingService = null;

    // WebhookService destroy (before removing EventBus listeners)
    state.webhookService?.destroy();
    state.webhookService = null;

    // Step 6b: Remove all EventBus listeners
    state.eventBus.removeAllListeners();

    // Step 7: Stop background workers
    if (state.workers) {
      await state.workers.stopAll();
      log.debug('Step 7: Workers stopped');
    }

    // Step 8: WAL checkpoint(TRUNCATE)
    if (state.sqlite) {
      try {
        state.sqlite.pragma('wal_checkpoint(TRUNCATE)');
        log.debug('Step 8: WAL checkpoint complete');
      } catch (err) {
        console.warn('Step 8: WAL checkpoint warning:', err);
      }
    }

    // Step 9: Keystore lock (sodium_memzero all guarded buffers)
    if (state.keyStore) {
      state.keyStore.lockAll();
      log.debug('Step 9: Keystore locked');
    }

    // Clear master password and hash from memory
    state.masterPassword = '';
    state.masterPasswordHash = '';
    if (state.passwordRef) {
      state.passwordRef.password = '';
      state.passwordRef.hash = '';
      state.passwordRef = null;
    }

    // Step 10: Close DB, unlink PID, release lock
    if (state.sqlite) {
      try {
        state.sqlite.close();
        log.debug('Step 10: Database closed');
      } catch (err) {
        console.warn('Step 10: DB close warning:', err);
      }
      state.sqlite = null;
      state._db = null;
    }

    // Delete PID file
    if (state.pidPath) {
      try {
        unlinkSync(state.pidPath);
      } catch {
        // Ignore if already deleted
      }
    }

    // Release daemon lock
    if (state.releaseLock) {
      try {
        await state.releaseLock();
      } catch {
        // Ignore lock release errors during shutdown
      }
      state.releaseLock = null;
    }

    // Cancel force timer
    if (state.forceTimer) {
      clearTimeout(state.forceTimer);
      state.forceTimer = null;
    }

    log.info('Shutdown complete');
    process.exit(0);
  } catch (err) {
    console.error('Shutdown error:', err);
    process.exit(1);
  }
}
