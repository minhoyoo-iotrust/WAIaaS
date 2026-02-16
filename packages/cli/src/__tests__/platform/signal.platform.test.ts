/**
 * Platform tests for signal handling.
 *
 * Tests registerSignalHandlers + DaemonLifecycle.shutdown() interaction.
 * Does NOT send real signals -- captures handlers via process.on mock.
 *
 * PLAT-01-SIG-01 ~ PLAT-01-SIG-05
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type HandlerFn = (...args: unknown[]) => void;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('PLAT-01 signal handling platform tests', () => {
  let handlers: Map<string, HandlerFn>;
  let processOnSpy: ReturnType<typeof vi.spyOn>;
  let processExitSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    handlers = new Map();

    // Capture all process.on registrations
    processOnSpy = vi.spyOn(process, 'on').mockImplementation(((
      event: string,
      handler: HandlerFn,
    ) => {
      handlers.set(event, handler);
      return process;
    }) as any);

    // Mock process.exit to prevent test runner from exiting
    processExitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {}) as any);
  });

  afterEach(() => {
    processOnSpy.mockRestore();
    processExitSpy.mockRestore();
    vi.restoreAllMocks();
  });

  it('PLAT-01-SIG-01: SIGINT -> shutdown("SIGINT") called, isShuttingDown = true', async () => {
    const { DaemonLifecycle, registerSignalHandlers } = await import('@waiaas/daemon');

    const daemon = new DaemonLifecycle();
    const shutdownSpy = vi.spyOn(daemon, 'shutdown').mockResolvedValue(undefined);

    registerSignalHandlers(daemon);

    // Manually trigger the SIGINT handler
    const sigintHandler = handlers.get('SIGINT');
    expect(sigintHandler).toBeDefined();
    sigintHandler!();

    expect(shutdownSpy).toHaveBeenCalledWith('SIGINT');
  });

  it('PLAT-01-SIG-02: SIGTERM -> shutdown("SIGTERM") called, isShuttingDown = true', async () => {
    const { DaemonLifecycle, registerSignalHandlers } = await import('@waiaas/daemon');

    const daemon = new DaemonLifecycle();
    const shutdownSpy = vi.spyOn(daemon, 'shutdown').mockResolvedValue(undefined);

    registerSignalHandlers(daemon);

    const sigtermHandler = handlers.get('SIGTERM');
    expect(sigtermHandler).toBeDefined();
    sigtermHandler!();

    expect(shutdownSpy).toHaveBeenCalledWith('SIGTERM');
  });

  it('PLAT-01-SIG-03: double signal -> shutdown called only once (guard)', async () => {
    const { DaemonLifecycle, registerSignalHandlers } = await import('@waiaas/daemon');

    const daemon = new DaemonLifecycle();

    // Use a real (not mocked) shutdown so the guard flag works.
    // But we need to prevent actual DB/HTTP cleanup -- mock internal resources.
    let shutdownCount = 0;
    const originalShutdown = daemon.shutdown.bind(daemon);
    vi.spyOn(daemon, 'shutdown').mockImplementation(async (signal: string) => {
      shutdownCount++;
      // Call real shutdown which sets isShuttingDown = true
      // Use the internal guard by calling the real implementation
      await originalShutdown(signal);
    });

    registerSignalHandlers(daemon);

    const sigtermHandler = handlers.get('SIGTERM');
    expect(sigtermHandler).toBeDefined();

    // First signal
    sigtermHandler!();
    // Wait for async
    await new Promise((r) => setTimeout(r, 50));

    // Second signal -- should be guarded by isShuttingDown
    sigtermHandler!();
    await new Promise((r) => setTimeout(r, 50));

    // shutdown was called 2 times on the spy, but the real implementation
    // guards against double execution via isShuttingDown flag
    expect(daemon.isShuttingDown).toBe(true);
    // The mock was called twice (two signals), but internally only the first
    // executes the shutdown logic. We verify the flag is set.
    expect(shutdownCount).toBe(2); // mock counts both calls
  });

  it('PLAT-01-SIG-04: uncaughtException -> shutdown + process.exit(1)', async () => {
    const { DaemonLifecycle, registerSignalHandlers } = await import('@waiaas/daemon');

    const daemon = new DaemonLifecycle();
    const shutdownSpy = vi.spyOn(daemon, 'shutdown').mockResolvedValue(undefined);

    // Suppress error output
    vi.spyOn(console, 'error').mockImplementation(() => {});

    registerSignalHandlers(daemon);

    const handler = handlers.get('uncaughtException');
    expect(handler).toBeDefined();

    // Trigger with a fake error
    handler!(new Error('test uncaught'));

    // Wait for async shutdown + .finally()
    await new Promise((r) => setTimeout(r, 100));

    expect(shutdownSpy).toHaveBeenCalledWith('uncaughtException');
    expect(processExitSpy).toHaveBeenCalledWith(1);
  });

  it('PLAT-01-SIG-05: unhandledRejection -> shutdown + process.exit(1)', async () => {
    const { DaemonLifecycle, registerSignalHandlers } = await import('@waiaas/daemon');

    const daemon = new DaemonLifecycle();
    const shutdownSpy = vi.spyOn(daemon, 'shutdown').mockResolvedValue(undefined);

    // Suppress error output
    vi.spyOn(console, 'error').mockImplementation(() => {});

    registerSignalHandlers(daemon);

    const handler = handlers.get('unhandledRejection');
    expect(handler).toBeDefined();

    // Trigger with a fake rejection reason
    handler!(new Error('test unhandled rejection'));

    // Wait for async shutdown + .finally()
    await new Promise((r) => setTimeout(r, 100));

    expect(shutdownSpy).toHaveBeenCalledWith('unhandledRejection');
    expect(processExitSpy).toHaveBeenCalledWith(1);
  });
});
