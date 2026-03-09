/**
 * Across Protocol Bridge Status Trackers — two-phase polling implementation.
 *
 * Phase 1: AcrossBridgeStatusTracker (active) — 15s x 480 = 2 hours
 * Phase 2: AcrossBridgeMonitoringTracker (reduced) — 5min x 264 = 22 hours
 *
 * When active phase times out (480 attempts), timeoutTransition='BRIDGE_MONITORING'
 * causes AsyncPollingService to transition the TX to the reduced-frequency phase.
 *
 * When the reduced phase also times out (264 attempts), timeoutTransition='TIMEOUT'
 * marks the TX as terminal timeout — manual verification required.
 *
 * Total monitoring: 2h active + 22h reduced = 24 hours maximum.
 *
 * Across fills are typically 2-10 seconds, so 15s active polling (DS-08) is
 * faster than LI.FI's 30s to detect completion sooner.
 *
 * @see internal/design/79-across-protocol-bridge.md (section 6)
 */
import type { IAsyncStatusTracker, AsyncTrackingResult } from '../../common/async-status-tracker.js';
import type { AcrossConfig } from './config.js';
import { AcrossApiClient } from './across-api-client.js';
import type { AcrossDepositStatusResponse } from './schemas.js';

// ---------------------------------------------------------------------------
// Shared status mapping (design doc 79 section 6.4)
// ---------------------------------------------------------------------------

/**
 * Map Across deposit status response to AsyncTrackingResult.
 * Shared by both AcrossBridgeStatusTracker and AcrossBridgeMonitoringTracker.
 */
function mapAcrossStatus(response: AcrossDepositStatusResponse): AsyncTrackingResult {
  switch (response.status) {
    case 'filled':
      return {
        state: 'COMPLETED',
        details: {
          fillTxHash: response.fillTxHash ?? response.fillTx ?? null,
          destinationChainId: response.destinationChainId ?? null,
          depositId: response.depositId ?? null,
        },
      };

    case 'expired':
      return {
        state: 'FAILED',
        details: { reason: 'Deposit expired (fillDeadline passed). Refund in ~90 minutes.' },
      };

    case 'refunded':
      return {
        state: 'COMPLETED', // Terminal — not PENDING
        details: { refunded: true },
      };

    case 'pending':
    default:
      return { state: 'PENDING' };
  }
}

// ---------------------------------------------------------------------------
// Phase 1: Active tracker (15s x 480 = 2 hours) — DS-08
// ---------------------------------------------------------------------------

export class AcrossBridgeStatusTracker implements IAsyncStatusTracker {
  readonly name = 'across-bridge';
  readonly maxAttempts = 480;           // 480 x 15s = 2 hours
  readonly pollIntervalMs = 15_000;     // 15 seconds (faster than LI.FI 30s)
  readonly timeoutTransition = 'BRIDGE_MONITORING' as const;

  private readonly apiClient: AcrossApiClient;

  constructor(config: AcrossConfig) {
    this.apiClient = new AcrossApiClient(config);
  }

  async checkStatus(_txId: string, metadata: Record<string, unknown>): Promise<AsyncTrackingResult> {
    const txHash = metadata.txHash as string;
    if (!txHash) {
      return { state: 'PENDING', details: { error: 'No txHash in metadata' } };
    }

    const originChainId = typeof metadata.originChainId === 'number'
      ? metadata.originChainId
      : undefined;

    const response = await this.apiClient.getDepositStatus({
      depositTxnRef: txHash,
      originChainId,
    });

    return mapAcrossStatus(response);
  }
}

// ---------------------------------------------------------------------------
// Phase 2: Reduced-frequency tracker (5min x 264 = 22 hours)
// ---------------------------------------------------------------------------

export class AcrossBridgeMonitoringTracker implements IAsyncStatusTracker {
  readonly name = 'across-bridge-monitoring';
  readonly maxAttempts = 264;           // 264 x 5min = 22 hours
  readonly pollIntervalMs = 300_000;    // 5 minutes
  readonly timeoutTransition = 'TIMEOUT' as const;

  private readonly apiClient: AcrossApiClient;

  constructor(config: AcrossConfig) {
    this.apiClient = new AcrossApiClient(config);
  }

  async checkStatus(_txId: string, metadata: Record<string, unknown>): Promise<AsyncTrackingResult> {
    const txHash = metadata.txHash as string;
    if (!txHash) {
      return { state: 'PENDING', details: { error: 'No txHash in metadata' } };
    }

    const originChainId = typeof metadata.originChainId === 'number'
      ? metadata.originChainId
      : undefined;

    const response = await this.apiClient.getDepositStatus({
      depositTxnRef: txHash,
      originChainId,
    });

    return mapAcrossStatus(response);
  }
}
