/**
 * IMetricsCounter: interface for in-memory operational metrics collection.
 *
 * Supports labeled counters and latency tracking.
 * Labels are serialized as sorted key=value pairs for Map keys.
 *
 * @see STAT-02 requirement
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface MetricsSnapshot {
  counters: Record<string, number>;
  latencies: Record<string, { count: number; totalMs: number; avgMs: number }>;
}

// ---------------------------------------------------------------------------
// IMetricsCounter interface
// ---------------------------------------------------------------------------

export interface IMetricsCounter {
  /** Increment a named counter by 1, optionally with labels. */
  increment(key: string, labels?: Record<string, string>): void;

  /** Record a latency measurement, optionally with labels. */
  recordLatency(key: string, durationMs: number, labels?: Record<string, string>): void;

  /** Get the current count for a named counter, optionally filtered by labels. */
  getCount(key: string, labels?: Record<string, string>): number;

  /** Get the average latency for a named key, optionally filtered by labels. */
  getAvgLatency(key: string, labels?: Record<string, string>): number;

  /** Get a snapshot of all counters and latencies. */
  snapshot(): MetricsSnapshot;

  /** Reset all counters and latencies. */
  reset(): void;
}
