/**
 * PolymarketPnlCalculator: Pure functions for PnL calculation.
 *
 * All arithmetic uses string-to-bigint conversion with 6 decimal scaling (USDC.e).
 * No side effects, no dependencies.
 *
 * @see design doc 80
 */
import type { PolymarketPosition } from './position-tracker.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PnlSummary {
  totalUnrealized: string;
  totalRealized: string;
  byPosition: {
    conditionId: string;
    outcome: string;
    unrealized: string;
    realized: string;
  }[];
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SCALE = 1_000_000n; // 6 decimal precision

// ---------------------------------------------------------------------------
// Calculator (static methods, stateless)
// ---------------------------------------------------------------------------

export class PolymarketPnlCalculator {
  /**
   * Calculate unrealized PnL for a position.
   * Formula: (currentPrice - avgPrice) * size
   * All values in 6 decimal precision.
   */
  static calculateUnrealized(size: string, avgPrice: string, currentPrice: string): string {
    const s = toBigInt(size);
    const avg = toBigInt(avgPrice);
    const cur = toBigInt(currentPrice);

    if (s === 0n) return '0';

    const unrealized = ((cur - avg) * s) / SCALE;
    return fromBigInt(unrealized);
  }

  /**
   * Calculate realized PnL (passthrough from DB value).
   */
  static calculateRealized(realizedPnl: string): string {
    return realizedPnl || '0';
  }

  /**
   * Summarize PnL across multiple positions.
   */
  static summarize(positions: PolymarketPosition[]): PnlSummary {
    let totalUnrealized = 0n;
    let totalRealized = 0n;

    const byPosition = positions.map((p) => {
      const unrealized = toBigInt(p.unrealizedPnl);
      const realized = toBigInt(p.realizedPnl);

      totalUnrealized += unrealized;
      totalRealized += realized;

      return {
        conditionId: p.conditionId,
        outcome: p.outcome,
        unrealized: p.unrealizedPnl,
        realized: p.realizedPnl,
      };
    });

    return {
      totalUnrealized: fromBigInt(totalUnrealized),
      totalRealized: fromBigInt(totalRealized),
      byPosition,
    };
  }
}

// ---------------------------------------------------------------------------
// Utility functions
// ---------------------------------------------------------------------------

/** Parse a decimal string (e.g., "0.65") to bigint scaled by 10^6. */
function toBigInt(value: string): bigint {
  if (!value || value === '0') return 0n;

  const isNeg = value.startsWith('-');
  const abs = isNeg ? value.slice(1) : value;

  const parts = abs.split('.');
  const intPart = parts[0] ?? '0';
  const decPart = (parts[1] ?? '').padEnd(6, '0').slice(0, 6);
  const result = BigInt(intPart + decPart);

  return isNeg ? -result : result;
}

/** Convert a bigint scaled by 10^6 back to decimal string. */
function fromBigInt(value: bigint): string {
  const isNeg = value < 0n;
  const abs = isNeg ? -value : value;
  const str = abs.toString().padStart(7, '0');
  const intPart = str.slice(0, -6) || '0';
  const decPart = str.slice(-6).replace(/0+$/, '') || '0';
  const result = decPart === '0' ? intPart : `${intPart}.${decPart}`;
  return isNeg ? `-${result}` : result;
}
