/**
 * Signal handler registration for daemon graceful shutdown.
 *
 * Wires SIGINT, SIGTERM, and (on Windows) SIGBREAK to DaemonLifecycle.shutdown().
 * Also handles uncaughtException and unhandledRejection as last-resort shutdown triggers.
 */

import type { DaemonLifecycle } from './daemon.js';

/**
 * Register process signal handlers for graceful daemon shutdown.
 *
 * - SIGINT: Ctrl-C
 * - SIGTERM: kill / systemd stop
 * - SIGBREAK: Windows Ctrl-Break (only on win32)
 * - uncaughtException: last-resort shutdown + exit(1)
 * - unhandledRejection: last-resort shutdown + exit(1)
 */
export function registerSignalHandlers(daemon: DaemonLifecycle): void {
  process.on('SIGINT', () => {
    void daemon.shutdown('SIGINT');
  });

  process.on('SIGTERM', () => {
    void daemon.shutdown('SIGTERM');
  });

  if (process.platform === 'win32') {
    process.on('SIGBREAK', () => {
      void daemon.shutdown('SIGBREAK');
    });
  }

  process.on('uncaughtException', (err) => {
    console.error('Uncaught exception:', err);
    void daemon.shutdown('uncaughtException').finally(() => process.exit(1));
  });

  process.on('unhandledRejection', (reason) => {
    console.error('Unhandled rejection:', reason);
    void daemon.shutdown('unhandledRejection').finally(() => process.exit(1));
  });
}
