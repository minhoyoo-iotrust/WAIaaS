/**
 * DCent Exchange Status Tracker.
 *
 * Implements IAsyncStatusTracker for polling DCent exchange transaction status.
 * Registered with AsyncPollingService to monitor cross-chain exchange completion.
 *
 * Status mapping: DCent status -> AsyncTrackingResult
 * - finished -> COMPLETED (notificationEvent: EXCHANGE_COMPLETED)
 * - failed -> FAILED (notificationEvent: EXCHANGE_FAILED)
 * - refunded -> COMPLETED with refunded=true (notificationEvent: EXCHANGE_REFUNDED)
 * - waiting/confirming/exchanging/sending -> PENDING
 * - error -> FAILED
 *
 * Design source: doc 77 section 8.4 (polling strategy).
 */
import type { IAsyncStatusTracker, AsyncTrackingResult } from '../../common/async-status-tracker.js';
import { DcentSwapApiClient } from './dcent-api-client.js';
import type { DcentSwapConfig } from './config.js';
import type { DcentExchangeStatusType } from './schemas.js';

// ---------------------------------------------------------------------------
// Status mapping
// ---------------------------------------------------------------------------

/**
 * Map DCent exchange status to AsyncTrackingResult.
 * Includes notificationEvent in details for AsyncPollingService to emit correct events.
 */
function mapDcentExchangeStatus(status: DcentExchangeStatusType): AsyncTrackingResult {
  switch (status) {
    case 'finished':
      return {
        state: 'COMPLETED',
        details: {
          notificationEvent: 'EXCHANGE_COMPLETED',
        },
      };

    case 'failed':
      return {
        state: 'FAILED',
        details: {
          notificationEvent: 'EXCHANGE_FAILED',
        },
      };

    case 'refunded':
      return {
        state: 'COMPLETED',
        details: {
          refunded: true,
          notificationEvent: 'EXCHANGE_REFUNDED',
        },
      };

    case 'waiting':
    case 'confirming':
    case 'exchanging':
    case 'sending':
      return {
        state: 'PENDING',
        details: {
          dcentStatus: status,
        },
      };

    case 'error':
      return {
        state: 'FAILED',
        details: {
          error: true,
          notificationEvent: 'EXCHANGE_FAILED',
        },
      };
  }
}

// ---------------------------------------------------------------------------
// Tracker implementation
// ---------------------------------------------------------------------------

/**
 * Exchange status tracker for DCent cross-chain exchanges.
 *
 * Polls DCent get_transactions_status API at configurable intervals.
 * Default: 30s x 120 attempts = 1 hour max monitoring.
 */
export class ExchangeStatusTracker implements IAsyncStatusTracker {
  readonly name = 'dcent-exchange';
  readonly maxAttempts = 120; // 120 x 30s = 1 hour
  readonly pollIntervalMs: number;
  readonly timeoutTransition = 'TIMEOUT' as const;

  private readonly apiClient: DcentSwapApiClient;

  constructor(config: DcentSwapConfig) {
    this.pollIntervalMs = config.exchangePollIntervalMs ?? 30_000;
    this.apiClient = new DcentSwapApiClient(config);
  }

  /**
   * Check exchange transaction status.
   *
   * Reads dcentTransactionId and dcentProviderId from metadata,
   * calls DCent get_transactions_status, maps result.
   */
  async checkStatus(_txId: string, metadata: Record<string, unknown>): Promise<AsyncTrackingResult> {
    const dcentTransactionId = metadata.dcentTransactionId as string;
    const dcentProviderId = metadata.dcentProviderId as string;

    if (!dcentTransactionId || !dcentProviderId) {
      return {
        state: 'PENDING',
        details: { error: 'Missing dcentTransactionId or dcentProviderId in metadata' },
      };
    }

    const statusResponse = await this.apiClient.getTransactionsStatus([
      { txId: dcentTransactionId, providerId: dcentProviderId },
    ]);

    // Response is an array; find matching entry
    const statusItem = statusResponse.find(
      (item) => item.txId === dcentTransactionId,
    );

    if (!statusItem) {
      return {
        state: 'PENDING',
        details: { error: `No status found for transaction ${dcentTransactionId}` },
      };
    }

    return mapDcentExchangeStatus(statusItem.status);
  }
}
