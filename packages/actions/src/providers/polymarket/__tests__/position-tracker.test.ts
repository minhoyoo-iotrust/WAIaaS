/**
 * Tests for PolymarketPositionTracker.
 *
 * @see design doc 80, Section 8.2
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PolymarketPositionTracker, type PositionDb, type PositionRow } from '../position-tracker.js';
import type { PolymarketMarketData } from '../market-data.js';
import type { GammaMarket } from '../market-schemas.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const POSITION_ROW: PositionRow = {
  id: 'pos-1',
  wallet_id: 'wallet-1',
  condition_id: '0xabc123',
  token_id: '111',
  market_slug: 'rain',
  outcome: 'YES',
  size: '100',
  avg_price: '0.40',
  realized_pnl: '5',
  market_resolved: 0,
  winning_outcome: '',
  is_neg_risk: 0,
  created_at: 1000,
  updated_at: 1000,
};

const MARKET: GammaMarket = {
  condition_id: '0xabc123',
  question: 'Will it rain?',
  description: '',
  market_slug: 'rain',
  active: true,
  closed: false,
  neg_risk: false,
  tokens: [
    { token_id: '111', outcome: 'Yes', price: '0.65' },
    { token_id: '222', outcome: 'No', price: '0.35' },
  ],
  volume: '1000',
  liquidity: '500',
  end_date_iso: '',
  image: '',
  icon: '',
  category: '',
  resolution_source: '',
};

// ---------------------------------------------------------------------------
// Mock factories
// ---------------------------------------------------------------------------

function createMockDb(): PositionDb {
  const store = new Map<string, PositionRow>();

  return {
    getPositions: vi.fn((walletId: string) =>
      [...store.values()].filter((r) => r.wallet_id === walletId),
    ),
    getPosition: vi.fn((walletId: string, tokenId: string) =>
      [...store.values()].find((r) => r.wallet_id === walletId && r.token_id === tokenId) ?? null,
    ),
    upsert: vi.fn((row: PositionRow) => {
      store.set(`${row.wallet_id}:${row.token_id}`, row);
    }),
    updateResolution: vi.fn((conditionId: string, winningOutcome: string) => {
      for (const row of store.values()) {
        if (row.condition_id === conditionId) {
          row.market_resolved = 1;
          row.winning_outcome = winningOutcome;
        }
      }
    }),
  };
}

function createMockMarketData(): PolymarketMarketData {
  return {
    getMarket: vi.fn().mockResolvedValue(MARKET),
    getMarkets: vi.fn(),
    getEvents: vi.fn(),
    searchMarkets: vi.fn(),
    isNegRisk: vi.fn(),
    getResolutionStatus: vi.fn(),
    clearCache: vi.fn(),
  } as unknown as PolymarketMarketData;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('PolymarketPositionTracker', () => {
  let db: PositionDb;
  let marketData: ReturnType<typeof createMockMarketData>;
  let tracker: PolymarketPositionTracker;

  beforeEach(() => {
    db = createMockDb();
    marketData = createMockMarketData();
    tracker = new PolymarketPositionTracker(db, marketData as unknown as PolymarketMarketData);
  });

  describe('getPositions', () => {
    it('enriches positions with current price from MarketData', async () => {
      // Seed the DB with a position
      db.upsert(POSITION_ROW);

      const positions = await tracker.getPositions('wallet-1');

      expect(positions).toHaveLength(1);
      expect(positions[0]!.currentPrice).toBe('0.65');
      expect(positions[0]!.avgPrice).toBe('0.40');
      expect(positions[0]!.size).toBe('100');
    });

    it('calculates unrealized PnL correctly', async () => {
      db.upsert(POSITION_ROW);

      const positions = await tracker.getPositions('wallet-1');

      // (0.65 - 0.40) * 100 = 25.0
      expect(positions[0]!.unrealizedPnl).toBe('25');
    });

    it('returns empty array for wallet with no positions', async () => {
      const positions = await tracker.getPositions('wallet-empty');
      expect(positions).toHaveLength(0);
    });
  });

  describe('getPosition', () => {
    it('returns single position by tokenId', async () => {
      db.upsert(POSITION_ROW);

      const position = await tracker.getPosition('wallet-1', '111');

      expect(position).not.toBeNull();
      expect(position!.tokenId).toBe('111');
      expect(position!.outcome).toBe('YES');
    });

    it('returns null for non-existent position', async () => {
      const position = await tracker.getPosition('wallet-1', 'nonexistent');
      expect(position).toBeNull();
    });
  });

  describe('upsertPosition', () => {
    it('creates new position on first insert', () => {
      tracker.upsertPosition('wallet-1', {
        tokenId: '999',
        conditionId: '0xnew',
        outcome: 'YES',
        marketSlug: 'new-market',
        fillSize: '50',
        fillPrice: '0.60',
        isNegRisk: false,
      });

      expect(db.upsert).toHaveBeenCalled();
      const call = (db.upsert as ReturnType<typeof vi.fn>).mock.calls[0]![0] as PositionRow;
      expect(call.size).toBe('50');
      expect(call.avg_price).toBe('0.60');
    });

    it('calculates weighted avg price on subsequent fill', () => {
      // First: seed existing position in DB
      db.upsert(POSITION_ROW); // size=100, avg_price=0.40

      // Second: add new fill
      tracker.upsertPosition('wallet-1', {
        tokenId: '111',
        conditionId: '0xabc123',
        outcome: 'YES',
        marketSlug: 'rain',
        fillSize: '100',
        fillPrice: '0.60',
        isNegRisk: false,
      });

      // Weighted avg: (100 * 0.40 + 100 * 0.60) / 200 = 0.50
      const calls = (db.upsert as ReturnType<typeof vi.fn>).mock.calls;
      const lastCall = calls[calls.length - 1]![0] as PositionRow;
      expect(lastCall.size).toBe('200');
      expect(lastCall.avg_price).toBe('0.5');
    });
  });

  describe('markResolved', () => {
    it('calls db.updateResolution with correct args', () => {
      tracker.markResolved('0xabc123', 'YES');

      expect(db.updateResolution).toHaveBeenCalledWith('0xabc123', 'YES');
    });
  });
});
