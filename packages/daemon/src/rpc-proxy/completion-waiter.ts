/**
 * CompletionWaiter -- EventBus-based transaction completion waiting.
 *
 * Bridges the async DELAY/APPROVAL pipeline flow with the synchronous
 * JSON-RPC response model. When stage4Wait throws PIPELINE_HALTED,
 * SyncPipelineExecutor delegates to this waiter which listens for
 * transaction:completed / transaction:failed events.
 *
 * Architecture Pattern 1: Two global EventBus listeners registered
 * on construction, pending Map keyed by txId.
 *
 * @see .planning/research/m31-14-rpc-proxy-ARCHITECTURE.md (Pattern 1)
 */

import type { EventBus } from '@waiaas/core';

// ── Types ─────────────────────────────────────────────────────────

interface PendingEntry {
  resolve: (txHash: string) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

// ── CompletionWaiter ──────────────────────────────────────────────

export class CompletionWaiter {
  private pending = new Map<string, PendingEntry>();
  private completedListener: (ev: any) => void;
  private failedListener: (ev: any) => void;

  constructor(private eventBus: EventBus) {
    // Register two global listeners on construction
    this.completedListener = (ev: { txId: string; txHash: string }) => {
      const entry = this.pending.get(ev.txId);
      if (!entry) return; // Unknown txId -- silently ignore
      clearTimeout(entry.timer);
      this.pending.delete(ev.txId);
      entry.resolve(ev.txHash);
    };

    this.failedListener = (ev: { txId: string; error: string }) => {
      const entry = this.pending.get(ev.txId);
      if (!entry) return;
      clearTimeout(entry.timer);
      this.pending.delete(ev.txId);
      entry.reject(new Error(ev.error));
    };

    this.eventBus.on('transaction:completed', this.completedListener);
    this.eventBus.on('transaction:failed', this.failedListener);
  }

  /**
   * Wait for a transaction to complete or fail via EventBus events.
   *
   * @param txId - Transaction ID to wait for
   * @param timeoutMs - Maximum wait time in milliseconds
   * @returns Promise resolving to txHash on completion
   * @throws Error on failure or timeout
   */
  waitForCompletion(txId: string, timeoutMs: number): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(txId);
        reject(new Error(`Transaction ${txId} timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      this.pending.set(txId, { resolve, reject, timer });
    });
  }

  /**
   * Dispose: reject all pending waits and unregister listeners.
   */
  dispose(): void {
    for (const [, entry] of this.pending) {
      clearTimeout(entry.timer);
      entry.reject(new Error('CompletionWaiter disposed'));
    }
    this.pending.clear();
    this.eventBus.off('transaction:completed', this.completedListener);
    this.eventBus.off('transaction:failed', this.failedListener);
  }
}
