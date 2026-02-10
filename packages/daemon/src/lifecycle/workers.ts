/**
 * BackgroundWorkers - periodic task scheduler for daemon.
 *
 * Registers named worker tasks with intervals and handlers.
 * Prevents overlapping runs of the same worker.
 * Gracefully stops with timeout on in-progress handlers.
 *
 * Built-in workers (registered by DaemonLifecycle):
 * - wal-checkpoint: PASSIVE WAL checkpoint every 5 minutes
 * - session-cleanup: expired session cleanup every 1 minute
 */

interface WorkerRegistration {
  name: string;
  interval: number; // ms
  handler: () => void | Promise<void>;
}

export class BackgroundWorkers {
  private readonly registrations: Map<string, WorkerRegistration> = new Map();
  private readonly timers: Map<string, ReturnType<typeof setInterval>> = new Map();
  private readonly running: Map<string, boolean> = new Map();

  /**
   * Register a named worker with an interval and handler.
   * Must be called before startAll().
   */
  register(name: string, opts: { interval: number; handler: () => void | Promise<void> }): void {
    this.registrations.set(name, { name, interval: opts.interval, handler: opts.handler });
  }

  /**
   * Start all registered workers. Each worker runs at its registered interval.
   * If a previous invocation is still running, the next interval is skipped.
   * Timers are unref'd so they don't prevent process exit.
   */
  startAll(): void {
    for (const [name, registration] of this.registrations) {
      this.running.set(name, false);

      const timer = setInterval(() => {
        // Skip if previous run still active
        if (this.running.get(name)) return;
        this.running.set(name, true);

        void (async () => {
          try {
            await registration.handler();
          } catch (err) {
            console.error(`Worker ${name} error:`, err);
          } finally {
            this.running.set(name, false);
          }
        })();
      }, registration.interval);

      timer.unref(); // don't prevent process exit
      this.timers.set(name, timer);
    }
  }

  /**
   * Stop all workers. Clears intervals and waits up to 5 seconds
   * for any in-progress handlers to complete.
   */
  async stopAll(): Promise<void> {
    for (const [, timer] of this.timers) {
      clearInterval(timer);
    }
    this.timers.clear();

    // Wait for in-progress handlers (max 5s)
    const deadline = Date.now() + 5000;
    while ([...this.running.values()].some(Boolean) && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 100));
    }
  }

  /** Check if any workers are currently registered. */
  get size(): number {
    return this.registrations.size;
  }

  /** Check if a specific worker is currently running. */
  isRunning(name: string): boolean {
    return this.running.get(name) ?? false;
  }
}
