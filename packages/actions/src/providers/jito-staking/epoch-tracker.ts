/**
 * JitoEpochTracker - IAsyncStatusTracker for Jito SOL unstake epoch boundary.
 *
 * Tracks Jito unstake requests via metadata-based polling (v1 implementation).
 * Active polling: 30s x 240 = 2 hours, then TIMEOUT (terminal).
 *
 * Solana epoch boundaries occur every ~2-3 days. Jito unstake deactivates
 * the stake account, and cooldown completes at the next epoch boundary.
 * This tracker monitors metadata state and emits STAKING_UNSTAKE_COMPLETED
 * or STAKING_UNSTAKE_TIMEOUT notifications.
 *
 * @see packages/actions/src/common/async-status-tracker.ts
 */

import type { IAsyncStatusTracker, AsyncTrackingResult } from '../../common/async-status-tracker.js';

/** Expected days for Solana epoch boundary (~2-3 days). */
const JITO_EXPECTED_DAYS = 3;

export class JitoEpochTracker implements IAsyncStatusTracker {
  readonly name = 'jito-epoch';
  readonly maxAttempts = 240;          // 240 x 30s = 2 hours active polling
  readonly pollIntervalMs = 30_000;    // 30 seconds
  readonly timeoutTransition = 'TIMEOUT' as const;

  async checkStatus(_txId: string, metadata: Record<string, unknown>): Promise<AsyncTrackingResult> {
    // If metadata.status is 'deactivated', unstake is complete
    if (metadata.status === 'deactivated') {
      return {
        state: 'COMPLETED',
        details: {
          completedAt: Date.now(),
          protocol: 'jito',
          notificationEvent: 'STAKING_UNSTAKE_COMPLETED',
        },
      };
    }

    // Calculate estimated days remaining based on unstake request time
    const requestedAt = metadata.unstakeRequestedAt as number | undefined;
    const estimatedDaysRemaining = requestedAt
      ? Math.max(0, JITO_EXPECTED_DAYS - (Date.now() - requestedAt) / (1000 * 60 * 60 * 24))
      : JITO_EXPECTED_DAYS;

    return {
      state: 'PENDING',
      details: {
        estimatedDaysRemaining: Math.round(estimatedDaysRemaining * 10) / 10,
        protocol: 'jito',
        targetEpoch: metadata.targetEpoch ?? null,
      },
    };
  }
}
