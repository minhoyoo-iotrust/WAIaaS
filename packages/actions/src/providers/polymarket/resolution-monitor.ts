/**
 * PolymarketResolutionMonitor: Polling-based market resolution detection.
 *
 * Checks open positions against MarketData for newly resolved markets.
 * When resolution detected, updates position via PositionTracker and
 * emits notification event with redeem suggestion.
 *
 * This is polling-based (called on position query or explicit check),
 * NOT a daemon background task.
 *
 * @see design doc 80
 */
import type { PolymarketPositionTracker, PolymarketPosition } from './position-tracker.js';
import type { PolymarketMarketData } from './market-data.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Notification event emitted when a tracked market resolves. */
export interface PolymarketNotificationEvent {
  type: 'polymarket_market_resolved';
  walletId: string;
  data: {
    conditionId: string;
    question: string;
    winningOutcome: string;
    redeemableSize: string;
    suggestedAction: 'pm_redeem_positions';
  };
}

/** Resolved market info returned from checkResolutions. */
export interface ResolvedMarket {
  conditionId: string;
  question: string;
  winningOutcome: string;
  positions: PolymarketPosition[];
}

// ---------------------------------------------------------------------------
// Monitor
// ---------------------------------------------------------------------------

export class PolymarketResolutionMonitor {
  constructor(
    private readonly positionTracker: PolymarketPositionTracker,
    private readonly marketData: PolymarketMarketData,
    private readonly emitNotification?: (event: PolymarketNotificationEvent) => void,
  ) {}

  /**
   * Check all open positions for a wallet for newly resolved markets.
   * Updates position state and emits notification for each new resolution.
   */
  async checkResolutions(walletId: string): Promise<ResolvedMarket[]> {
    const positions = await this.positionTracker.getPositions(walletId);

    // Filter to open (unresolved) positions with size > 0
    const openPositions = positions.filter(
      (p) => !p.marketResolved && p.size !== '0',
    );

    if (openPositions.length === 0) return [];

    // Group by conditionId to avoid duplicate checks
    const conditionIds = [...new Set(openPositions.map((p) => p.conditionId))];

    const resolved: ResolvedMarket[] = [];

    for (const conditionId of conditionIds) {
      const status = await this.marketData.getResolutionStatus(conditionId);

      if (!status.resolved || !status.winningOutcome) continue;

      // Mark resolved in DB
      this.positionTracker.markResolved(conditionId, status.winningOutcome);

      // Get positions for this market
      const marketPositions = openPositions.filter((p) => p.conditionId === conditionId);

      // Get market question for notification
      let question = '';
      try {
        const market = await this.marketData.getMarket(conditionId);
        question = market.question;
      } catch {
        // Non-critical, continue without question
      }

      // Calculate redeemable size (positions with winning outcome)
      const redeemablePositions = marketPositions.filter(
        (p) => p.outcome === status.winningOutcome,
      );
      const redeemableSize = redeemablePositions.reduce(
        (sum, p) => sum + parseFloat(p.size || '0'),
        0,
      ).toString();

      // Emit notification
      if (this.emitNotification) {
        this.emitNotification({
          type: 'polymarket_market_resolved',
          walletId,
          data: {
            conditionId,
            question,
            winningOutcome: status.winningOutcome,
            redeemableSize,
            suggestedAction: 'pm_redeem_positions',
          },
        });
      }

      resolved.push({
        conditionId,
        question,
        winningOutcome: status.winningOutcome,
        positions: marketPositions,
      });
    }

    return resolved;
  }
}
