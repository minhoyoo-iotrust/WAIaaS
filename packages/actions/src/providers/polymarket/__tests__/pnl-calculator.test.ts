/**
 * Tests for PolymarketPnlCalculator.
 *
 * @see design doc 80
 */
import { describe, it, expect } from 'vitest';
import { PolymarketPnlCalculator } from '../pnl-calculator.js';
import type { PolymarketPosition } from '../position-tracker.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makePosition(overrides: Partial<PolymarketPosition> = {}): PolymarketPosition {
  return {
    id: 'pos-1',
    walletId: 'wallet-1',
    conditionId: '0xabc',
    tokenId: '111',
    marketSlug: 'test',
    outcome: 'YES',
    size: '100',
    avgPrice: '0.40',
    currentPrice: '0.65',
    unrealizedPnl: '25',
    realizedPnl: '5',
    marketResolved: false,
    winningOutcome: '',
    isNegRisk: false,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('PolymarketPnlCalculator', () => {
  describe('calculateUnrealized', () => {
    it('calculates positive unrealized PnL', () => {
      // Bought at 0.40, current 0.65, size 100
      // (0.65 - 0.40) * 100 = 25
      const result = PolymarketPnlCalculator.calculateUnrealized('100', '0.40', '0.65');
      expect(result).toBe('25');
    });

    it('calculates negative unrealized PnL', () => {
      // Bought at 0.70, current 0.30, size 50
      // (0.30 - 0.70) * 50 = -20
      const result = PolymarketPnlCalculator.calculateUnrealized('50', '0.70', '0.30');
      expect(result).toBe('-20');
    });

    it('returns 0 for zero-size position', () => {
      const result = PolymarketPnlCalculator.calculateUnrealized('0', '0.50', '0.80');
      expect(result).toBe('0');
    });

    it('returns 0 when price unchanged', () => {
      const result = PolymarketPnlCalculator.calculateUnrealized('100', '0.50', '0.50');
      expect(result).toBe('0');
    });

    it('handles fractional sizes', () => {
      // size=10.5, avg=0.40, cur=0.60
      // (0.60 - 0.40) * 10.5 = 2.1
      const result = PolymarketPnlCalculator.calculateUnrealized('10.5', '0.40', '0.60');
      expect(result).toBe('2.1');
    });
  });

  describe('calculateRealized', () => {
    it('returns the DB value as-is', () => {
      expect(PolymarketPnlCalculator.calculateRealized('15.5')).toBe('15.5');
    });

    it('returns 0 for empty string', () => {
      expect(PolymarketPnlCalculator.calculateRealized('')).toBe('0');
    });
  });

  describe('summarize', () => {
    it('aggregates multiple positions', () => {
      const positions: PolymarketPosition[] = [
        makePosition({
          conditionId: '0x1',
          outcome: 'YES',
          unrealizedPnl: '25',
          realizedPnl: '5',
        }),
        makePosition({
          conditionId: '0x2',
          outcome: 'NO',
          unrealizedPnl: '-10',
          realizedPnl: '3',
        }),
      ];

      const summary = PolymarketPnlCalculator.summarize(positions);

      // 25 + (-10) = 15
      expect(summary.totalUnrealized).toBe('15');
      // 5 + 3 = 8
      expect(summary.totalRealized).toBe('8');
      expect(summary.byPosition).toHaveLength(2);
    });

    it('handles empty positions', () => {
      const summary = PolymarketPnlCalculator.summarize([]);

      expect(summary.totalUnrealized).toBe('0');
      expect(summary.totalRealized).toBe('0');
      expect(summary.byPosition).toHaveLength(0);
    });

    it('handles all losses', () => {
      const positions: PolymarketPosition[] = [
        makePosition({ unrealizedPnl: '-10', realizedPnl: '-5' }),
        makePosition({ unrealizedPnl: '-20', realizedPnl: '-3' }),
      ];

      const summary = PolymarketPnlCalculator.summarize(positions);

      expect(summary.totalUnrealized).toBe('-30');
      expect(summary.totalRealized).toBe('-8');
    });
  });
});
