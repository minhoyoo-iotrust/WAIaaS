/**
 * LI.FI Bridge Status Trackers — two-phase polling implementation.
 *
 * Phase 1: BridgeStatusTracker (active) — 30s x 240 = 2 hours
 * Phase 2: BridgeMonitoringTracker (reduced) — 5min x 264 = 22 hours
 *
 * When active phase times out (240 attempts), timeoutTransition='BRIDGE_MONITORING'
 * causes AsyncPollingService to transition the TX to the reduced-frequency phase.
 *
 * When the reduced phase also times out (264 attempts), timeoutTransition='TIMEOUT'
 * marks the TX as terminal timeout — manual verification required.
 *
 * Total monitoring: 2h active + 22h reduced = 24 hours maximum.
 *
 * @see internal/objectives/m28-03-lifi-crosschain-bridge.md (DEFI-04)
 */
import type { IAsyncStatusTracker, AsyncTrackingResult } from '../../common/async-status-tracker.js';
import type { LiFiConfig } from './config.js';
import { LiFiApiClient } from './lifi-api-client.js';
import type { LiFiStatusResponse } from './schemas.js';

// ---------------------------------------------------------------------------
// Shared status mapping
// ---------------------------------------------------------------------------

/**
 * Map LI.FI status response to AsyncTrackingResult.
 * Shared by both BridgeStatusTracker and BridgeMonitoringTracker.
 */
function mapLiFiStatus(response: LiFiStatusResponse): AsyncTrackingResult {
  switch (response.status) {
    case 'DONE':
      return {
        state: 'COMPLETED',
        details: {
          destTxHash: response.receiving?.txHash ?? null,
          destChainId: response.receiving?.chainId ?? null,
          lifiExplorerLink: response.lifiExplorerLink ?? null,
          tool: response.tool ?? null,
        },
      };

    case 'FAILED': {
      // Check for refund via substatus
      const isRefunded =
        response.substatus === 'REFUNDED' ||
        response.substatusMessage?.toLowerCase().includes('refund');

      if (isRefunded) {
        return {
          state: 'COMPLETED', // Treated as terminal (not PENDING)
          details: {
            refunded: true,
            substatusMessage: response.substatusMessage ?? 'Refunded',
            lifiExplorerLink: response.lifiExplorerLink ?? null,
          },
        };
      }
      return {
        state: 'FAILED',
        details: {
          substatusMessage: response.substatusMessage ?? 'Bridge transfer failed',
          substatus: response.substatus ?? null,
          lifiExplorerLink: response.lifiExplorerLink ?? null,
        },
      };
    }

    case 'NOT_FOUND':
    case 'INVALID':
      // Not yet tracked by LI.FI — keep polling
      return { state: 'PENDING' };

    case 'PENDING':
    default:
      return {
        state: 'PENDING',
        details: {
          substatus: response.substatus ?? null,
          substatusMessage: response.substatusMessage ?? null,
        },
      };
  }
}

// ---------------------------------------------------------------------------
// Phase 1: Active tracker (30s x 240 = 2 hours)
// ---------------------------------------------------------------------------

export class BridgeStatusTracker implements IAsyncStatusTracker {
  readonly name = 'bridge';
  readonly maxAttempts = 240;            // 240 x 30s = 2 hours
  readonly pollIntervalMs = 30_000;      // 30 seconds
  readonly timeoutTransition = 'BRIDGE_MONITORING' as const;

  private readonly apiClient: LiFiApiClient;

  constructor(config: LiFiConfig) {
    this.apiClient = new LiFiApiClient(config);
  }

  async checkStatus(_txId: string, metadata: Record<string, unknown>): Promise<AsyncTrackingResult> {
    const txHash = metadata.txHash as string;
    if (!txHash) {
      return { state: 'PENDING', details: { error: 'No txHash in metadata' } };
    }

    const response = await this.apiClient.getStatus({
      txHash,
      bridge: metadata.bridge as string | undefined,
      fromChain: metadata.fromChainId as number | undefined,
      toChain: metadata.toChainId as number | undefined,
    });

    return mapLiFiStatus(response);
  }
}

// ---------------------------------------------------------------------------
// Phase 2: Reduced-frequency tracker (5min x 264 = 22 hours)
// ---------------------------------------------------------------------------

export class BridgeMonitoringTracker implements IAsyncStatusTracker {
  readonly name = 'bridge-monitoring';
  readonly maxAttempts = 264;            // 264 x 5min = 22 hours
  readonly pollIntervalMs = 300_000;     // 5 minutes
  readonly timeoutTransition = 'TIMEOUT' as const;

  private readonly apiClient: LiFiApiClient;

  constructor(config: LiFiConfig) {
    this.apiClient = new LiFiApiClient(config);
  }

  async checkStatus(_txId: string, metadata: Record<string, unknown>): Promise<AsyncTrackingResult> {
    const txHash = metadata.txHash as string;
    if (!txHash) {
      return { state: 'PENDING', details: { error: 'No txHash in metadata' } };
    }

    const response = await this.apiClient.getStatus({
      txHash,
      bridge: metadata.bridge as string | undefined,
      fromChain: metadata.fromChainId as number | undefined,
      toChain: metadata.toChainId as number | undefined,
    });

    return mapLiFiStatus(response);
  }
}
