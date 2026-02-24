/**
 * LidoWithdrawalTracker - IAsyncStatusTracker for Lido withdrawal queue.
 *
 * Tracks Lido unstake requests via metadata-based polling (v1 implementation).
 * Active polling: 30s x 480 = 4 hours, then TIMEOUT (terminal).
 *
 * Lido withdrawals typically take 1-5 days. This tracker monitors metadata
 * state (set by external claim detection or manual status update) and emits
 * STAKING_UNSTAKE_COMPLETED or STAKING_UNSTAKE_TIMEOUT notifications.
 *
 * @see packages/actions/src/common/async-status-tracker.ts
 */

import type { IAsyncStatusTracker, AsyncTrackingResult } from '../../common/async-status-tracker.js';

/** Days after which a Lido withdrawal is considered overdue for timeout hint. */
const LIDO_EXPECTED_DAYS = 5;

export class LidoWithdrawalTracker implements IAsyncStatusTracker {
  readonly name = 'lido-withdrawal';
  readonly maxAttempts = 480;          // 480 x 30s = 4 hours active polling
  readonly pollIntervalMs = 30_000;    // 30 seconds
  readonly timeoutTransition = 'TIMEOUT' as const;

  async checkStatus(_txId: string, metadata: Record<string, unknown>): Promise<AsyncTrackingResult> {
    // If metadata.status is already 'claimable', withdrawal is complete
    if (metadata.status === 'claimable') {
      return {
        state: 'COMPLETED',
        details: {
          completedAt: Date.now(),
          protocol: 'lido',
          notificationEvent: 'STAKING_UNSTAKE_COMPLETED',
        },
      };
    }

    // Calculate estimated days remaining based on withdrawal request time
    const requestedAt = metadata.withdrawalRequestedAt as number | undefined;
    const estimatedDaysRemaining = requestedAt
      ? Math.max(0, LIDO_EXPECTED_DAYS - (Date.now() - requestedAt) / (1000 * 60 * 60 * 24))
      : LIDO_EXPECTED_DAYS;

    return {
      state: 'PENDING',
      details: {
        estimatedDaysRemaining: Math.round(estimatedDaysRemaining * 10) / 10,
        protocol: 'lido',
      },
    };
  }
}
