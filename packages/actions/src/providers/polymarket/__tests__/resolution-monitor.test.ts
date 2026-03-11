/**
 * Tests for PolymarketResolutionMonitor.
 *
 * @see design doc 80
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PolymarketResolutionMonitor, type PolymarketNotificationEvent } from '../resolution-monitor.js';
import type { PolymarketPositionTracker, PolymarketPosition } from '../position-tracker.js';
import type { PolymarketMarketData } from '../market-data.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makePosition(overrides: Partial<PolymarketPosition> = {}): PolymarketPosition {
  return {
    id: 'pos-1',
    walletId: 'wallet-1',
    conditionId: '0xabc123',
    tokenId: '111',
    marketSlug: 'rain',
    outcome: 'YES',
    size: '100',
    avgPrice: '0.40',
    currentPrice: '0.65',
    unrealizedPnl: '25',
    realizedPnl: '0',
    marketResolved: false,
    winningOutcome: '',
    isNegRisk: false,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Mock factories
// ---------------------------------------------------------------------------

function createMockTracker(positions: PolymarketPosition[]) {
  return {
    getPositions: vi.fn().mockResolvedValue(positions),
    getPosition: vi.fn(),
    upsertPosition: vi.fn(),
    markResolved: vi.fn(),
  } as unknown as PolymarketPositionTracker;
}

function createMockMarketData(resolved: Record<string, { resolved: boolean; winningOutcome?: string }>) {
  return {
    getResolutionStatus: vi.fn().mockImplementation((conditionId: string) =>
      Promise.resolve(resolved[conditionId] ?? { resolved: false }),
    ),
    getMarket: vi.fn().mockResolvedValue({
      condition_id: '0xabc123',
      question: 'Will it rain?',
      tokens: [],
    }),
  } as unknown as PolymarketMarketData;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('PolymarketResolutionMonitor', () => {
  let tracker: ReturnType<typeof createMockTracker>;
  let marketData: ReturnType<typeof createMockMarketData>;
  let emitNotification: ReturnType<typeof vi.fn>;
  let monitor: PolymarketResolutionMonitor;

  beforeEach(() => {
    emitNotification = vi.fn();
  });

  describe('checkResolutions', () => {
    it('detects resolved market and calls markResolved + emits notification', async () => {
      const positions = [makePosition()];
      tracker = createMockTracker(positions);
      marketData = createMockMarketData({
        '0xabc123': { resolved: true, winningOutcome: 'YES' },
      });
      monitor = new PolymarketResolutionMonitor(tracker, marketData, emitNotification);

      const resolved = await monitor.checkResolutions('wallet-1');

      expect(resolved).toHaveLength(1);
      expect(resolved[0]!.conditionId).toBe('0xabc123');
      expect(resolved[0]!.winningOutcome).toBe('YES');

      // markResolved called
      expect(tracker.markResolved).toHaveBeenCalledWith('0xabc123', 'YES');

      // Notification emitted
      expect(emitNotification).toHaveBeenCalledTimes(1);
      const event = emitNotification.mock.calls[0]![0] as PolymarketNotificationEvent;
      expect(event.type).toBe('polymarket_market_resolved');
      expect(event.walletId).toBe('wallet-1');
      expect(event.data.suggestedAction).toBe('pm_redeem_positions');
      expect(event.data.winningOutcome).toBe('YES');
    });

    it('skips when market is NOT resolved', async () => {
      const positions = [makePosition()];
      tracker = createMockTracker(positions);
      marketData = createMockMarketData({
        '0xabc123': { resolved: false },
      });
      monitor = new PolymarketResolutionMonitor(tracker, marketData, emitNotification);

      const resolved = await monitor.checkResolutions('wallet-1');

      expect(resolved).toHaveLength(0);
      expect(tracker.markResolved).not.toHaveBeenCalled();
      expect(emitNotification).not.toHaveBeenCalled();
    });

    it('skips already resolved positions (marketResolved=true)', async () => {
      const positions = [makePosition({ marketResolved: true })];
      tracker = createMockTracker(positions);
      marketData = createMockMarketData({});
      monitor = new PolymarketResolutionMonitor(tracker, marketData, emitNotification);

      const resolved = await monitor.checkResolutions('wallet-1');

      expect(resolved).toHaveLength(0);
      expect(marketData.getResolutionStatus).not.toHaveBeenCalled();
    });

    it('makes single markResolved call for multiple positions with same conditionId', async () => {
      const positions = [
        makePosition({ tokenId: '111', outcome: 'YES' }),
        makePosition({ tokenId: '222', outcome: 'NO' }),
      ];
      tracker = createMockTracker(positions);
      marketData = createMockMarketData({
        '0xabc123': { resolved: true, winningOutcome: 'YES' },
      });
      monitor = new PolymarketResolutionMonitor(tracker, marketData, emitNotification);

      await monitor.checkResolutions('wallet-1');

      // Only 1 markResolved call (deduplicated by conditionId)
      expect(tracker.markResolved).toHaveBeenCalledTimes(1);
      // Only 1 notification
      expect(emitNotification).toHaveBeenCalledTimes(1);
    });

    it('includes correct redeemable size in notification', async () => {
      const positions = [
        makePosition({ tokenId: '111', outcome: 'YES', size: '50' }),
        makePosition({ tokenId: '222', outcome: 'NO', size: '30' }),
      ];
      tracker = createMockTracker(positions);
      marketData = createMockMarketData({
        '0xabc123': { resolved: true, winningOutcome: 'YES' },
      });
      monitor = new PolymarketResolutionMonitor(tracker, marketData, emitNotification);

      await monitor.checkResolutions('wallet-1');

      const event = emitNotification.mock.calls[0]![0] as PolymarketNotificationEvent;
      // Only YES position is redeemable
      expect(event.data.redeemableSize).toBe('50');
    });

    it('returns empty for wallet with no open positions', async () => {
      tracker = createMockTracker([]);
      marketData = createMockMarketData({});
      monitor = new PolymarketResolutionMonitor(tracker, marketData, emitNotification);

      const resolved = await monitor.checkResolutions('wallet-1');

      expect(resolved).toHaveLength(0);
    });

    it('works without emitNotification callback', async () => {
      const positions = [makePosition()];
      tracker = createMockTracker(positions);
      marketData = createMockMarketData({
        '0xabc123': { resolved: true, winningOutcome: 'YES' },
      });
      monitor = new PolymarketResolutionMonitor(tracker, marketData);

      // Should not throw
      const resolved = await monitor.checkResolutions('wallet-1');
      expect(resolved).toHaveLength(1);
    });
  });
});
