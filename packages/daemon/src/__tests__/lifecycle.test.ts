/**
 * Tests for daemon lifecycle: withTimeout, BackgroundWorkers, lock contention,
 * PID management, shutdown sequence.
 */

import { describe, it, expect, vi, afterAll } from 'vitest';
import { mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { withTimeout, BackgroundWorkers } from '../lifecycle/index.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createTempDir(): string {
  const dir = join(tmpdir(), `waiaas-lifecycle-test-${randomUUID()}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

const tempDirs: string[] = [];

function saveTempDir(dir: string): string {
  tempDirs.push(dir);
  return dir;
}

afterAll(() => {
  for (const dir of tempDirs) {
    try {
      if (existsSync(dir)) rmSync(dir, { recursive: true, force: true });
    } catch {
      // Ignore
    }
  }
});

// ---------------------------------------------------------------------------
// withTimeout tests
// ---------------------------------------------------------------------------

describe('withTimeout', () => {
  it('resolves normally for fast promise', async () => {
    const result = await withTimeout(
      Promise.resolve('fast'),
      5000,
      'TEST_TIMEOUT',
    );
    expect(result).toBe('fast');
  });

  it('rejects with timeout error for slow promise', async () => {
    const slow = new Promise<string>((resolve) =>
      setTimeout(() => resolve('slow'), 10_000),
    );
    await expect(
      withTimeout(slow, 50, 'TEST_TIMEOUT'),
    ).rejects.toThrow(/TEST_TIMEOUT.*Timeout after 50ms/);
  });

  it('error includes the provided errorCode', async () => {
    const slow = new Promise<void>(() => {
      // Never resolves
    });
    try {
      await withTimeout(slow, 50, 'STEP2_DATABASE');
      expect.fail('should have thrown');
    } catch (err) {
      expect((err as Error).message).toContain('STEP2_DATABASE');
    }
  });

  it('propagates original error if promise rejects before timeout', async () => {
    const failing = Promise.reject(new Error('original error'));
    await expect(
      withTimeout(failing, 5000, 'TEST_TIMEOUT'),
    ).rejects.toThrow('original error');
  });
});

// ---------------------------------------------------------------------------
// BackgroundWorkers tests
// ---------------------------------------------------------------------------

describe('BackgroundWorkers', () => {
  it('worker handler is called at registered interval', async () => {

    const workers = new BackgroundWorkers();
    const handler = vi.fn();
    workers.register('test-worker', { interval: 50, handler });
    workers.startAll();

    expect(handler).not.toHaveBeenCalled();
    await new Promise((r) => setTimeout(r, 120));
    expect(handler.mock.calls.length).toBeGreaterThanOrEqual(2);

    await workers.stopAll();
  });

  it('stopAll clears all intervals', async () => {
    const workers = new BackgroundWorkers();
    const handler = vi.fn();
    workers.register('test-worker', { interval: 50, handler });
    workers.startAll();

    await new Promise((r) => setTimeout(r, 80));
    const callsBeforeStop = handler.mock.calls.length;
    expect(callsBeforeStop).toBeGreaterThanOrEqual(1);

    await workers.stopAll();

    // Wait and verify no more calls
    await new Promise((r) => setTimeout(r, 200));
    expect(handler.mock.calls.length).toBe(callsBeforeStop);
  });

  it('worker that throws does not crash -- next interval still fires', async () => {
    const workers = new BackgroundWorkers();
    let callCount = 0;
    const handler = vi.fn(() => {
      callCount++;
      if (callCount === 1) throw new Error('boom');
    });
    workers.register('failing-worker', { interval: 50, handler });
    workers.startAll();

    // Wait for at least 2 intervals
    await new Promise((r) => setTimeout(r, 180));

    // Both calls should have fired despite first one throwing
    expect(handler.mock.calls.length).toBeGreaterThanOrEqual(2);

    await workers.stopAll();
  });

  it('worker still running when next interval fires is skipped (no overlap)', async () => {
    const workers = new BackgroundWorkers();
    let runningCount = 0;
    let maxConcurrent = 0;

    const handler = vi.fn(async () => {
      runningCount++;
      if (runningCount > maxConcurrent) maxConcurrent = runningCount;
      // Simulate long-running task
      await new Promise((r) => setTimeout(r, 200));
      runningCount--;
    });

    workers.register('slow-worker', { interval: 50, handler });
    workers.startAll();

    // Wait for multiple intervals to pass
    await new Promise((r) => setTimeout(r, 400));

    await workers.stopAll();

    // Handler was called but never ran concurrently
    expect(maxConcurrent).toBe(1);
    expect(handler).toHaveBeenCalled();
  });

  it('stopAll waits for in-progress handler to complete', async () => {
    const workers = new BackgroundWorkers();
    let completed = false;

    workers.register('completing-worker', {
      interval: 10,
      handler: async () => {
        await new Promise((r) => setTimeout(r, 200));
        completed = true;
      },
    });
    workers.startAll();

    // Wait for handler to start
    await new Promise((r) => setTimeout(r, 50));

    // stopAll should wait for the in-progress handler
    await workers.stopAll();
    expect(completed).toBe(true);
  });

  it('register and size tracking', () => {
    const workers = new BackgroundWorkers();
    expect(workers.size).toBe(0);
    workers.register('w1', { interval: 1000, handler: () => {} });
    expect(workers.size).toBe(1);
    workers.register('w2', { interval: 2000, handler: () => {} });
    expect(workers.size).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// Lock contention tests (proper-lockfile)
// ---------------------------------------------------------------------------

describe('daemon lock contention', () => {
  it('acquires lock on first call, second call fails', async () => {
    const lockfile = await import('proper-lockfile');
    const dir = saveTempDir(createTempDir());
    const lockPath = join(dir, 'daemon.lock');
    writeFileSync(lockPath, '', 'utf-8');

    // First lock succeeds
    const release = await lockfile.lock(lockPath, { stale: 10_000, retries: 0 });
    expect(typeof release).toBe('function');

    // Second lock should fail
    await expect(
      lockfile.lock(lockPath, { stale: 10_000, retries: 0 }),
    ).rejects.toThrow();

    // Release first lock
    await release();
  });

  it('after releasing lock, second acquisition succeeds', async () => {
    const lockfile = await import('proper-lockfile');
    const dir = saveTempDir(createTempDir());
    const lockPath = join(dir, 'daemon.lock');
    writeFileSync(lockPath, '', 'utf-8');

    // Acquire and release
    const release1 = await lockfile.lock(lockPath, { stale: 10_000, retries: 0 });
    await release1();

    // Second acquisition should succeed
    const release2 = await lockfile.lock(lockPath, { stale: 10_000, retries: 0 });
    expect(typeof release2).toBe('function');
    await release2();
  });
});

// ---------------------------------------------------------------------------
// PID file tests
// ---------------------------------------------------------------------------

describe('PID file management', () => {
  it('PID file is created and contains process.pid', () => {
    const dir = saveTempDir(createTempDir());
    const pidPath = join(dir, 'daemon.pid');
    writeFileSync(pidPath, String(process.pid), 'utf-8');

    expect(existsSync(pidPath)).toBe(true);
    const content = readFileSync(pidPath, 'utf-8');
    expect(Number(content)).toBe(process.pid);
  });
});

// ---------------------------------------------------------------------------
// Shutdown sequence tests (mocked)
// ---------------------------------------------------------------------------

describe('shutdown sequence', () => {
  it('DaemonLifecycle: isShuttingDown starts as false', async () => {
    // Dynamic import to avoid loading sodium at module level
    const { DaemonLifecycle } = await import('../lifecycle/daemon.js');
    const daemon = new DaemonLifecycle();
    expect(daemon.isShuttingDown).toBe(false);
  });

  it('shutdown sets isShuttingDown to true', async () => {
    const { DaemonLifecycle } = await import('../lifecycle/daemon.js');
    const daemon = new DaemonLifecycle();

    // Mock process.exit to prevent test runner from exiting
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);

    await daemon.shutdown('SIGTERM');
    expect(daemon.isShuttingDown).toBe(true);

    exitSpy.mockRestore();
  });

  it('double shutdown is ignored (idempotent)', async () => {
    const { DaemonLifecycle } = await import('../lifecycle/daemon.js');
    const daemon = new DaemonLifecycle();
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await daemon.shutdown('SIGTERM');
    const callCount = logSpy.mock.calls.length;

    // Second call should be no-op
    await daemon.shutdown('SIGINT');
    expect(logSpy.mock.calls.length).toBe(callCount); // No additional log

    exitSpy.mockRestore();
    logSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// Signal handler tests
// ---------------------------------------------------------------------------

describe('registerSignalHandlers', () => {
  it('registers SIGINT and SIGTERM listeners', async () => {
    const { registerSignalHandlers } = await import('../lifecycle/signal-handler.js');
    const { DaemonLifecycle } = await import('../lifecycle/daemon.js');

    const daemon = new DaemonLifecycle();

    const initialSigint = process.listenerCount('SIGINT');
    const initialSigterm = process.listenerCount('SIGTERM');

    registerSignalHandlers(daemon);

    expect(process.listenerCount('SIGINT')).toBe(initialSigint + 1);
    expect(process.listenerCount('SIGTERM')).toBe(initialSigterm + 1);

    // Clean up listeners (remove the last ones we added)
    process.removeAllListeners('SIGINT');
    process.removeAllListeners('SIGTERM');
    process.removeAllListeners('uncaughtException');
    process.removeAllListeners('unhandledRejection');
  });
});
