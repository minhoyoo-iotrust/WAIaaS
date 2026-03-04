/**
 * Tests for BackupWorker registration and handler logic.
 *
 * Tests the worker registration logic from daemon.ts Step 6
 * in isolation, without full DaemonLifecycle startup.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Types mirroring the worker registration logic
// ---------------------------------------------------------------------------

interface WorkerOpts {
  interval: number;
  handler: () => void | Promise<void>;
  runImmediately?: boolean;
}

interface MockBackupService {
  createBackup: ReturnType<typeof vi.fn>;
  pruneBackups: ReturnType<typeof vi.fn>;
}

interface MockWorkers {
  register: ReturnType<typeof vi.fn>;
}

// ---------------------------------------------------------------------------
// Helper: simulate the worker registration logic from daemon.ts
// ---------------------------------------------------------------------------

function registerBackupWorker(opts: {
  workers: MockWorkers;
  encryptedBackupService: MockBackupService | undefined;
  config: { backup: { interval: number; retention_count: number } };
  masterPassword: string;
  isShuttingDown: () => boolean;
}): void {
  if (opts.encryptedBackupService && opts.config.backup.interval > 0) {
    const backupInterval = opts.config.backup.interval * 1000;
    const retentionCount = opts.config.backup.retention_count;
    const backupService = opts.encryptedBackupService;
    const masterPwd = opts.masterPassword;

    opts.workers.register('backup-worker', {
      interval: backupInterval,
      handler: async () => {
        if (opts.isShuttingDown()) return;
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
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('BackupWorker', () => {
  let workers: MockWorkers;
  let backupService: MockBackupService;
  let logSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    workers = { register: vi.fn() };
    backupService = {
      createBackup: vi.fn().mockResolvedValue({
        filename: 'backup-20260303-120000000.waiaas-backup',
        size: 12345,
      }),
      pruneBackups: vi.fn().mockReturnValue(0),
    };
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('registers backup-worker when interval > 0 and service exists', () => {
    registerBackupWorker({
      workers,
      encryptedBackupService: backupService,
      config: { backup: { interval: 3600, retention_count: 7 } },
      masterPassword: 'test-pass',
      isShuttingDown: () => false,
    });

    expect(workers.register).toHaveBeenCalledWith('backup-worker', expect.objectContaining({
      interval: 3600 * 1000,
    }));
  });

  it('does NOT register when interval = 0', () => {
    registerBackupWorker({
      workers,
      encryptedBackupService: backupService,
      config: { backup: { interval: 0, retention_count: 7 } },
      masterPassword: 'test-pass',
      isShuttingDown: () => false,
    });

    expect(workers.register).not.toHaveBeenCalled();
  });

  it('does NOT register when service is undefined', () => {
    registerBackupWorker({
      workers,
      encryptedBackupService: undefined,
      config: { backup: { interval: 3600, retention_count: 7 } },
      masterPassword: 'test-pass',
      isShuttingDown: () => false,
    });

    expect(workers.register).not.toHaveBeenCalled();
  });

  it('handler calls createBackup with masterPassword', async () => {
    registerBackupWorker({
      workers,
      encryptedBackupService: backupService,
      config: { backup: { interval: 3600, retention_count: 7 } },
      masterPassword: 'my-secret',
      isShuttingDown: () => false,
    });

    const call = workers.register.mock.calls[0] as [string, WorkerOpts];
    const handler = call[1].handler;
    await handler();

    expect(backupService.createBackup).toHaveBeenCalledWith('my-secret');
  });

  it('handler calls pruneBackups with retentionCount after successful backup', async () => {
    registerBackupWorker({
      workers,
      encryptedBackupService: backupService,
      config: { backup: { interval: 3600, retention_count: 14 } },
      masterPassword: 'test-pass',
      isShuttingDown: () => false,
    });

    const call = workers.register.mock.calls[0] as [string, WorkerOpts];
    await call[1].handler();

    expect(backupService.pruneBackups).toHaveBeenCalledWith(14);
  });

  it('handler absorbs errors without throwing', async () => {
    backupService.createBackup.mockRejectedValue(new Error('disk full'));

    registerBackupWorker({
      workers,
      encryptedBackupService: backupService,
      config: { backup: { interval: 3600, retention_count: 7 } },
      masterPassword: 'test-pass',
      isShuttingDown: () => false,
    });

    const call = workers.register.mock.calls[0] as [string, WorkerOpts];
    // Should not throw
    await expect(call[1].handler()).resolves.toBeUndefined();
    expect(errorSpy).toHaveBeenCalledWith('Auto-backup failed:', expect.any(Error));
  });

  it('handler uses config.backup.interval * 1000 as interval in milliseconds', () => {
    registerBackupWorker({
      workers,
      encryptedBackupService: backupService,
      config: { backup: { interval: 7200, retention_count: 7 } },
      masterPassword: 'test-pass',
      isShuttingDown: () => false,
    });

    const call = workers.register.mock.calls[0] as [string, WorkerOpts];
    expect(call[1].interval).toBe(7200 * 1000);
  });

  it('handler checks isShuttingDown before executing', async () => {
    registerBackupWorker({
      workers,
      encryptedBackupService: backupService,
      config: { backup: { interval: 3600, retention_count: 7 } },
      masterPassword: 'test-pass',
      isShuttingDown: () => true,
    });

    const call = workers.register.mock.calls[0] as [string, WorkerOpts];
    await call[1].handler();

    // Should NOT call createBackup when shutting down
    expect(backupService.createBackup).not.toHaveBeenCalled();
  });

  it('handler logs prune count when > 0', async () => {
    backupService.pruneBackups.mockReturnValue(3);

    registerBackupWorker({
      workers,
      encryptedBackupService: backupService,
      config: { backup: { interval: 3600, retention_count: 7 } },
      masterPassword: 'test-pass',
      isShuttingDown: () => false,
    });

    const call = workers.register.mock.calls[0] as [string, WorkerOpts];
    await call[1].handler();

    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('pruned 3 old backup(s)'));
  });
});
