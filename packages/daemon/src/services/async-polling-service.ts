/**
 * AsyncPollingService - generic polling engine for async status tracking.
 *
 * Manages registered IAsyncStatusTracker instances, queries the DB for
 * tracking targets (bridge_status or GAS_WAITING), and executes per-tracker
 * polling with timing, maxAttempts, error isolation, and timeout transitions.
 *
 * Registered as 'async-status' BackgroundWorker at 30-second intervals.
 *
 * @see internal/objectives/m28-00-defi-basic-protocol-design.md (DEFI-04 ASNC-02)
 */

import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type * as schema from '../infrastructure/database/schema.js';
import type { IAsyncStatusTracker, AsyncTrackingResult, BridgeStatus } from '@waiaas/actions';
import { transactions } from '../infrastructure/database/schema.js';
import { eq, or, inArray } from 'drizzle-orm';

/** Poll result counters. */
export interface PollResult {
  polled: number;
  skipped: number;
  errors: number;
}

/** Callbacks invoked by AsyncPollingService after state transitions. */
export interface AsyncPollingCallbacks {
  /** Emit a notification event. */
  emitNotification?(eventType: string, walletId: string, data: Record<string, unknown>): void;
  /** Release SPENDING_LIMIT reservation for a transaction. */
  releaseReservation?(txId: string): void;
  /** Resume pipeline execution for a gas-condition-met transaction (stage 4 re-entry). */
  resumePipeline?(txId: string, walletId: string): void;
}

/**
 * AsyncPollingService manages registered IAsyncStatusTracker instances
 * and drives their polling lifecycle via pollAll().
 */
export class AsyncPollingService {
  private readonly trackers: Map<string, IAsyncStatusTracker> = new Map();

  constructor(
    private readonly db: BetterSQLite3Database<typeof schema>,
    private readonly callbacks?: AsyncPollingCallbacks,
  ) {}

  /**
   * Register a tracker by its name.
   * Each tracker name must be unique; re-registering replaces the previous one.
   */
  registerTracker(tracker: IAsyncStatusTracker): void {
    this.trackers.set(tracker.name, tracker);
  }

  /** Number of registered trackers (for testing). */
  get trackerCount(): number {
    return this.trackers.size;
  }

  /**
   * Poll all tracking targets: transactions with bridge_status IN ('PENDING', 'BRIDGE_MONITORING')
   * OR status = 'GAS_WAITING'.
   *
   * Sequential processing to avoid external API rate limit issues.
   * Error isolation: one transaction failure does not prevent others from processing.
   */
  async pollAll(): Promise<PollResult> {
    // Query DB for tracking targets
    const targets = this.db
      .select()
      .from(transactions)
      .where(
        or(
          inArray(transactions.bridgeStatus, ['PENDING', 'BRIDGE_MONITORING', 'PARTIALLY_FILLED']),
          eq(transactions.status, 'GAS_WAITING'),
        ),
      )
      .all();

    let polled = 0;
    let skipped = 0;
    let errors = 0;

    // Sequential processing (no Promise.all -- external API rate limit risk)
    for (const tx of targets) {
      try {
        // Resolve tracker name
        const trackerName = this.resolveTrackerName(tx);
        const tracker = this.trackers.get(trackerName);
        if (!tracker) {
          skipped++;
          continue;
        }

        // Parse bridge_metadata
        const metadata = JSON.parse(tx.bridgeMetadata ?? '{}') as Record<string, unknown>;

        // Per-tracker timing check
        const lastPolled = (metadata.lastPolledAt as number) ?? 0;
        const now = Date.now();
        if (now - lastPolled < tracker.pollIntervalMs) {
          skipped++;
          continue;
        }

        // MaxAttempts check
        const pollCount = ((metadata.pollCount as number) ?? 0) + 1;
        if (pollCount > tracker.maxAttempts) {
          await this.handleTimeout(
            { id: tx.id, bridgeMetadata: tx.bridgeMetadata, walletId: tx.walletId },
            tracker,
            metadata,
          );
          polled++;
          continue;
        }

        // Call tracker.checkStatus()
        const result = await tracker.checkStatus(tx.id, metadata);

        // Process result (pass walletId for notifications)
        await this.processResult(
          { id: tx.id, bridgeMetadata: tx.bridgeMetadata, walletId: tx.walletId },
          tracker,
          result,
          { ...metadata, pollCount, lastPolledAt: now },
        );
        polled++;
      } catch (err) {
        // Error isolation: log and continue
        console.error(`AsyncPolling error for tx ${tx.id}:`, err);
        errors++;
      }
    }

    return { polled, skipped, errors };
  }

  /**
   * Resolve which tracker handles a transaction.
   * GAS_WAITING -> 'gas-condition'
   * Otherwise -> metadata.tracker or 'bridge' (default)
   */
  private resolveTrackerName(
    tx: { status: string; bridgeMetadata: string | null },
  ): string {
    if (tx.status === 'GAS_WAITING') return 'gas-condition';

    try {
      const metadata = JSON.parse(tx.bridgeMetadata ?? '{}') as Record<string, unknown>;
      // Prefer trackerName (external action) over tracker (bridge/staking)
      return (metadata.trackerName as string) ?? (metadata.tracker as string) ?? 'bridge';
    } catch {
      return 'bridge';
    }
  }

  /**
   * Handle maxAttempts exceeded by applying tracker.timeoutTransition.
   *
   * - 'BRIDGE_MONITORING': Transition bridge_status, reset pollCount for reduced-frequency monitoring
   * - 'TIMEOUT': Mark bridge_status as TIMEOUT (terminal)
   * - 'CANCELLED': Cancel the transaction
   */
  private async handleTimeout(
    tx: { id: string; bridgeMetadata: string | null; walletId?: string },
    tracker: IAsyncStatusTracker,
    metadata: Record<string, unknown>,
  ): Promise<void> {
    if (tracker.timeoutTransition === 'CANCELLED') {
      // Cancel the transaction itself
      const existingMeta = JSON.parse(tx.bridgeMetadata ?? '{}') as Record<string, unknown>;
      this.db
        .update(transactions)
        .set({
          status: 'CANCELLED',
          metadata: JSON.stringify({
            ...existingMeta,
            cancelReason: 'timeout',
          }),
        })
        .where(eq(transactions.id, tx.id))
        .run();

      // Emit TX_CANCELLED notification for gas-condition timeout
      if (tx.walletId) {
        this.callbacks?.emitNotification?.('TX_CANCELLED', tx.walletId, {
          txId: tx.id,
          reason: 'gas-condition-timeout',
          tracker: tracker.name,
        });
      }
    } else if (tracker.timeoutTransition === 'BRIDGE_MONITORING') {
      // Transition to reduced-frequency monitoring
      const newMeta = {
        ...metadata,
        pollCount: 0,
        lastPolledAt: Date.now(),
        transitionedAt: Date.now(),
        tracker: 'bridge-monitoring',  // Switch tracker for BridgeMonitoringTracker pickup
      };
      this.db
        .update(transactions)
        .set({
          bridgeStatus: 'BRIDGE_MONITORING' as BridgeStatus,
          bridgeMetadata: JSON.stringify(newMeta),
        })
        .where(eq(transactions.id, tx.id))
        .run();

      // Emit BRIDGE_MONITORING_STARTED — reservation NOT released (funds in limbo)
      if (tx.walletId) {
        this.callbacks?.emitNotification?.('BRIDGE_MONITORING_STARTED', tx.walletId, {
          txId: tx.id,
          ...newMeta,
        });
      }
    } else {
      // TIMEOUT transition (terminal)
      const newMeta = {
        ...metadata,
        pollCount: 0,
        lastPolledAt: Date.now(),
        transitionedAt: Date.now(),
      };
      this.db
        .update(transactions)
        .set({
          bridgeStatus: tracker.timeoutTransition as BridgeStatus,
          bridgeMetadata: JSON.stringify(newMeta),
        })
        .where(eq(transactions.id, tx.id))
        .run();

      // Emit timeout notification — staking trackers include notificationEvent in metadata
      const timeoutEventType = (metadata.notificationEvent as string) ?? 'BRIDGE_TIMEOUT';
      if (tx.walletId) {
        this.callbacks?.emitNotification?.(timeoutEventType, tx.walletId, {
          txId: tx.id,
          ...newMeta,
        });
      }
    }
  }

  /**
   * Process checkStatus result and update DB accordingly.
   *
   * - COMPLETED: Update bridge_status, release reservation, emit notification
   * - FAILED: Update bridge_status, release reservation, emit notification
   * - TIMEOUT: Delegate to handleTimeout (which emits its own notifications)
   * - PENDING: Update bridge_metadata only (pollCount, lastPolledAt)
   */
  private async processResult(
    tx: { id: string; bridgeMetadata: string | null; walletId?: string },
    tracker: IAsyncStatusTracker,
    result: AsyncTrackingResult,
    metadata: Record<string, unknown>,
  ): Promise<void> {
    const updatedMetadata = {
      ...metadata,
      ...(result.details ?? {}),
    };

    switch (result.state) {
      case 'COMPLETED': {
        // Special case: gas-condition COMPLETED -> resume pipeline (stage 4 re-entry)
        if (tracker.name === 'gas-condition') {
          // Transition GAS_WAITING -> PENDING for pipeline re-entry
          this.db
            .update(transactions)
            .set({
              status: 'PENDING',
              bridgeMetadata: JSON.stringify(updatedMetadata),
            })
            .where(eq(transactions.id, tx.id))
            .run();

          // Emit TX_GAS_CONDITION_MET notification
          const gasEventType = (updatedMetadata.notificationEvent as string) ?? 'TX_GAS_CONDITION_MET';
          if (tx.walletId) {
            this.callbacks?.emitNotification?.(gasEventType, tx.walletId, {
              txId: tx.id,
              ...updatedMetadata,
            });
          }

          // Resume pipeline -- do NOT release reservation (funds still needed for execution)
          if (tx.walletId) {
            this.callbacks?.resumePipeline?.(tx.id, tx.walletId);
          }
          break;
        }

        // Determine if refunded
        const isRefunded = updatedMetadata.refunded === true;

        this.db
          .update(transactions)
          .set({
            bridgeStatus: isRefunded ? 'REFUNDED' as BridgeStatus : 'COMPLETED',
            bridgeMetadata: JSON.stringify(updatedMetadata),
          })
          .where(eq(transactions.id, tx.id))
          .run();

        // Release SPENDING_LIMIT reservation (COMPLETED/REFUNDED both release)
        this.callbacks?.releaseReservation?.(tx.id);

        // Emit notification — staking trackers set notificationEvent in details
        const eventType = (updatedMetadata.notificationEvent as string) ?? (isRefunded ? 'BRIDGE_REFUNDED' : 'BRIDGE_COMPLETED');
        if (tx.walletId) {
          this.callbacks?.emitNotification?.(eventType, tx.walletId, {
            txId: tx.id,
            ...updatedMetadata,
          });
        }
        break;
      }

      case 'FAILED':
        this.db
          .update(transactions)
          .set({
            bridgeStatus: 'FAILED',
            bridgeMetadata: JSON.stringify(updatedMetadata),
          })
          .where(eq(transactions.id, tx.id))
          .run();

        // Release SPENDING_LIMIT reservation (FAILED = funds not deducted)
        this.callbacks?.releaseReservation?.(tx.id);

        // Emit notification — staking trackers may set notificationEvent in details
        if (tx.walletId) {
          const failEventType = (updatedMetadata.notificationEvent as string) ?? 'BRIDGE_FAILED';
          this.callbacks?.emitNotification?.(failEventType, tx.walletId, {
            txId: tx.id,
            ...updatedMetadata,
          });
        }
        break;

      case 'TIMEOUT':
        await this.handleTimeout(tx, tracker, metadata);
        break;

      // ---------------------------------------------------------------------------
      // External action states (Phase 389)
      // ---------------------------------------------------------------------------

      case 'PARTIALLY_FILLED':
        // Non-terminal: update status + metadata, continue polling
        this.db
          .update(transactions)
          .set({
            bridgeStatus: 'PARTIALLY_FILLED' as BridgeStatus,
            bridgeMetadata: JSON.stringify(updatedMetadata),
          })
          .where(eq(transactions.id, tx.id))
          .run();

        if (tx.walletId) {
          this.callbacks?.emitNotification?.('EXTERNAL_ACTION_PARTIALLY_FILLED', tx.walletId, {
            txId: tx.id,
            ...updatedMetadata,
          });
        }
        break;

      case 'FILLED': {
        this.db
          .update(transactions)
          .set({
            bridgeStatus: 'FILLED' as BridgeStatus,
            bridgeMetadata: JSON.stringify(updatedMetadata),
          })
          .where(eq(transactions.id, tx.id))
          .run();

        this.callbacks?.releaseReservation?.(tx.id);

        if (tx.walletId) {
          this.callbacks?.emitNotification?.('EXTERNAL_ACTION_FILLED', tx.walletId, {
            txId: tx.id,
            ...updatedMetadata,
          });
        }
        break;
      }

      case 'SETTLED': {
        this.db
          .update(transactions)
          .set({
            bridgeStatus: 'SETTLED' as BridgeStatus,
            bridgeMetadata: JSON.stringify(updatedMetadata),
          })
          .where(eq(transactions.id, tx.id))
          .run();

        this.callbacks?.releaseReservation?.(tx.id);

        if (tx.walletId) {
          this.callbacks?.emitNotification?.('EXTERNAL_ACTION_SETTLED', tx.walletId, {
            txId: tx.id,
            ...updatedMetadata,
          });
        }
        break;
      }

      case 'CANCELED': {
        this.db
          .update(transactions)
          .set({
            bridgeStatus: 'CANCELED' as BridgeStatus,
            bridgeMetadata: JSON.stringify(updatedMetadata),
          })
          .where(eq(transactions.id, tx.id))
          .run();

        this.callbacks?.releaseReservation?.(tx.id);

        if (tx.walletId) {
          this.callbacks?.emitNotification?.('EXTERNAL_ACTION_CANCELED', tx.walletId, {
            txId: tx.id,
            ...updatedMetadata,
          });
        }
        break;
      }

      case 'EXPIRED': {
        this.db
          .update(transactions)
          .set({
            bridgeStatus: 'EXPIRED' as BridgeStatus,
            bridgeMetadata: JSON.stringify(updatedMetadata),
          })
          .where(eq(transactions.id, tx.id))
          .run();

        this.callbacks?.releaseReservation?.(tx.id);

        if (tx.walletId) {
          this.callbacks?.emitNotification?.('EXTERNAL_ACTION_EXPIRED', tx.walletId, {
            txId: tx.id,
            ...updatedMetadata,
          });
        }
        break;
      }

      case 'PENDING':
      default:
        this.db
          .update(transactions)
          .set({
            bridgeMetadata: JSON.stringify(updatedMetadata),
          })
          .where(eq(transactions.id, tx.id))
          .run();
        break;
    }
  }
}
