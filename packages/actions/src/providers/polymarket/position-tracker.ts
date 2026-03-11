/**
 * PolymarketPositionTracker: Position aggregation from DB + MarketData prices.
 *
 * Reads positions from polymarket_positions table, enriches with current prices
 * from MarketData, and handles position upserts with weighted avg price calc.
 *
 * @see design doc 80, Section 8.2
 */
import type { PolymarketMarketData } from './market-data.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Minimal DB interface for position persistence. */
export interface PositionDb {
  getPositions(walletId: string): PositionRow[];
  getPosition(walletId: string, tokenId: string): PositionRow | null;
  upsert(row: PositionRow): void;
  updateResolution(conditionId: string, winningOutcome: string): void;
}

/** Raw DB row for polymarket_positions table. */
export interface PositionRow {
  id: string;
  wallet_id: string;
  condition_id: string;
  token_id: string;
  market_slug: string;
  outcome: string;
  size: string;
  avg_price: string;
  realized_pnl: string;
  market_resolved: number;
  winning_outcome: string;
  is_neg_risk: number;
  created_at: number;
  updated_at: number;
}

/** Fill data for updating a position after an order executes. */
export interface PositionFill {
  tokenId: string;
  conditionId: string;
  outcome: string;
  marketSlug: string;
  fillSize: string;
  fillPrice: string;
  isNegRisk: boolean;
}

/** Enriched position with current market data. */
export interface PolymarketPosition {
  id: string;
  walletId: string;
  conditionId: string;
  tokenId: string;
  marketSlug: string;
  outcome: string;
  size: string;
  avgPrice: string;
  currentPrice: string;
  unrealizedPnl: string;
  realizedPnl: string;
  marketResolved: boolean;
  winningOutcome: string;
  isNegRisk: boolean;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SCALE = 1_000_000n; // 6 decimal precision

// ---------------------------------------------------------------------------
// Tracker
// ---------------------------------------------------------------------------

export class PolymarketPositionTracker {
  constructor(
    private readonly db: PositionDb,
    private readonly marketData: PolymarketMarketData,
  ) {}

  /**
   * Get all positions for a wallet, enriched with current prices.
   */
  async getPositions(walletId: string): Promise<PolymarketPosition[]> {
    const rows = this.db.getPositions(walletId);
    return Promise.all(rows.map((row) => this.enrichPosition(row)));
  }

  /**
   * Get a single position by tokenId.
   */
  async getPosition(walletId: string, tokenId: string): Promise<PolymarketPosition | null> {
    const row = this.db.getPosition(walletId, tokenId);
    if (!row) return null;
    return this.enrichPosition(row);
  }

  /**
   * Upsert a position after a fill.
   * Calculates weighted average price: ((existingSize * existingAvg) + (fillSize * fillPrice)) / (existingSize + fillSize)
   */
  upsertPosition(walletId: string, data: PositionFill): void {
    const existing = this.db.getPosition(walletId, data.tokenId);
    const now = Math.floor(Date.now() / 1000);

    if (existing) {
      const existSize = this.toBigInt(existing.size);
      const existAvg = this.toBigInt(existing.avg_price);
      const fillSize = this.toBigInt(data.fillSize);
      const fillPrice = this.toBigInt(data.fillPrice);

      const totalSize = existSize + fillSize;
      const newAvg = totalSize > 0n
        ? ((existSize * existAvg + fillSize * fillPrice) / totalSize)
        : 0n;

      this.db.upsert({
        ...existing,
        size: this.fromBigInt(totalSize),
        avg_price: this.fromBigInt(newAvg),
        updated_at: now,
      });
    } else {
      this.db.upsert({
        id: crypto.randomUUID(),
        wallet_id: walletId,
        condition_id: data.conditionId,
        token_id: data.tokenId,
        market_slug: data.marketSlug,
        outcome: data.outcome,
        size: data.fillSize,
        avg_price: data.fillPrice,
        realized_pnl: '0',
        market_resolved: 0,
        winning_outcome: '',
        is_neg_risk: data.isNegRisk ? 1 : 0,
        created_at: now,
        updated_at: now,
      });
    }
  }

  /**
   * Mark all positions for a conditionId as resolved.
   */
  markResolved(conditionId: string, winningOutcome: string): void {
    this.db.updateResolution(conditionId, winningOutcome);
  }

  // -------------------------------------------------------------------------
  // Private
  // -------------------------------------------------------------------------

  private async enrichPosition(row: PositionRow): Promise<PolymarketPosition> {
    let currentPrice = '0';

    try {
      const market = await this.marketData.getMarket(row.condition_id);
      const token = market.tokens.find((t) => t.token_id === row.token_id);
      if (token?.price) {
        currentPrice = token.price;
      }
    } catch {
      // If market data unavailable, use 0 as current price
    }

    const size = this.toBigInt(row.size);
    const avgPrice = this.toBigInt(row.avg_price);
    const curPrice = this.toBigInt(currentPrice);
    const unrealized = size > 0n ? ((curPrice - avgPrice) * size) / SCALE : 0n;

    return {
      id: row.id,
      walletId: row.wallet_id,
      conditionId: row.condition_id,
      tokenId: row.token_id,
      marketSlug: row.market_slug,
      outcome: row.outcome,
      size: row.size,
      avgPrice: row.avg_price,
      currentPrice,
      unrealizedPnl: this.fromBigInt(unrealized),
      realizedPnl: row.realized_pnl,
      marketResolved: row.market_resolved === 1,
      winningOutcome: row.winning_outcome,
      isNegRisk: row.is_neg_risk === 1,
    };
  }

  /** Parse a decimal string (e.g., "0.65") to bigint scaled by 10^6. */
  private toBigInt(value: string): bigint {
    if (!value || value === '0') return 0n;
    const parts = value.split('.');
    const intPart = parts[0] ?? '0';
    const decPart = (parts[1] ?? '').padEnd(6, '0').slice(0, 6);
    return BigInt(intPart + decPart);
  }

  /** Convert a bigint scaled by 10^6 back to decimal string. */
  private fromBigInt(value: bigint): string {
    const isNeg = value < 0n;
    const abs = isNeg ? -value : value;
    const str = abs.toString().padStart(7, '0');
    const intPart = str.slice(0, -6) || '0';
    const decPart = str.slice(-6).replace(/0+$/, '') || '0';
    const result = decPart === '0' ? intPart : `${intPart}.${decPart}`;
    return isNeg ? `-${result}` : result;
  }
}
