/**
 * InMemoryCounter: IMetricsCounter implementation with label-aware Map-based storage.
 *
 * Keys are composed as: `<name>` or `<name>|<label1>=<value1>|<label2>=<value2>`
 * Labels are sorted by key for deterministic key generation.
 *
 * @see STAT-02 requirement
 */

import type { IMetricsCounter, MetricsSnapshot } from '@waiaas/core';

export class InMemoryCounter implements IMetricsCounter {
  private counters = new Map<string, number>();
  private latencies = new Map<string, { count: number; totalMs: number }>();

  /** Build a composite key from name and optional labels. */
  private makeKey(key: string, labels?: Record<string, string>): string {
    if (!labels || Object.keys(labels).length === 0) return key;
    const parts = Object.entries(labels)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}=${v}`);
    return `${key}|${parts.join('|')}`;
  }

  increment(key: string, labels?: Record<string, string>): void {
    const k = this.makeKey(key, labels);
    this.counters.set(k, (this.counters.get(k) ?? 0) + 1);
  }

  recordLatency(key: string, durationMs: number, labels?: Record<string, string>): void {
    const k = this.makeKey(key, labels);
    const existing = this.latencies.get(k) ?? { count: 0, totalMs: 0 };
    existing.count += 1;
    existing.totalMs += durationMs;
    this.latencies.set(k, existing);
  }

  getCount(key: string, labels?: Record<string, string>): number {
    const k = this.makeKey(key, labels);
    return this.counters.get(k) ?? 0;
  }

  getAvgLatency(key: string, labels?: Record<string, string>): number {
    const k = this.makeKey(key, labels);
    const entry = this.latencies.get(k);
    if (!entry || entry.count === 0) return 0;
    return entry.totalMs / entry.count;
  }

  snapshot(): MetricsSnapshot {
    const counters: Record<string, number> = {};
    for (const [k, v] of this.counters) {
      counters[k] = v;
    }

    const latencies: Record<string, { count: number; totalMs: number; avgMs: number }> = {};
    for (const [k, v] of this.latencies) {
      latencies[k] = {
        count: v.count,
        totalMs: v.totalMs,
        avgMs: v.count > 0 ? v.totalMs / v.count : 0,
      };
    }

    return { counters, latencies };
  }

  reset(): void {
    this.counters.clear();
    this.latencies.clear();
  }

  /**
   * Get all counter entries whose key starts with the given prefix.
   * Useful for aggregating per-network RPC stats.
   */
  getCountsByPrefix(prefix: string): Map<string, number> {
    const result = new Map<string, number>();
    for (const [k, v] of this.counters) {
      if (k.startsWith(prefix)) {
        result.set(k, v);
      }
    }
    return result;
  }

  /**
   * Get all latency entries whose key starts with the given prefix.
   */
  getLatenciesByPrefix(prefix: string): Map<string, { count: number; totalMs: number }> {
    const result = new Map<string, { count: number; totalMs: number }>();
    for (const [k, v] of this.latencies) {
      if (k.startsWith(prefix)) {
        result.set(k, v);
      }
    }
    return result;
  }
}
