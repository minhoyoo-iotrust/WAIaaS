/**
 * DeFiMonitorService: Lifecycle orchestrator for DeFi monitors.
 *
 * Manages multiple IDeFiMonitor instances (HealthFactorMonitor, etc.)
 * with a single start/stop/updateConfig entry point for DaemonLifecycle.
 *
 * Features:
 *   - Per-monitor error isolation (fail-soft)
 *   - register() / start() / stop() lifecycle
 *   - updateConfig() propagation
 *
 * Design source: m29-00 design doc section 9.
 * @see LEND-04
 */

import type { IDeFiMonitor } from '@waiaas/core';

// ---------------------------------------------------------------------------
// DeFiMonitorService
// ---------------------------------------------------------------------------

export class DeFiMonitorService {
  private readonly monitors = new Map<string, IDeFiMonitor>();

  /** Register a monitor instance. */
  register(monitor: IDeFiMonitor): void {
    this.monitors.set(monitor.name, monitor);
  }

  /** Start all registered monitors (fail-soft per monitor). */
  start(): void {
    for (const monitor of this.monitors.values()) {
      try {
        monitor.start();
      } catch (err) {
        console.warn(`DeFiMonitorService: failed to start monitor '${monitor.name}':`, err);
      }
    }
  }

  /** Stop all registered monitors (fail-soft per monitor). */
  stop(): void {
    for (const monitor of this.monitors.values()) {
      try {
        monitor.stop();
      } catch (err) {
        console.warn(`DeFiMonitorService: failed to stop monitor '${monitor.name}':`, err);
      }
    }
  }

  /** Propagate configuration updates to all monitors (fail-soft per monitor). */
  updateConfig(config: Record<string, unknown>): void {
    for (const monitor of this.monitors.values()) {
      try {
        monitor.updateConfig?.(config);
      } catch (err) {
        console.warn(`DeFiMonitorService: failed to update config for '${monitor.name}':`, err);
      }
    }
  }

  /** Number of registered monitors. */
  get monitorCount(): number {
    return this.monitors.size;
  }
}
