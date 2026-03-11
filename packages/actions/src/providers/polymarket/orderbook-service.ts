/**
 * PolymarketOrderbookService: Orderbook, price, and midpoint queries via CLOB public endpoints.
 *
 * Wraps ClobClient public endpoints with structured result formatting,
 * spread/depth calculation, and empty orderbook handling.
 *
 * @see design doc 80, Section 7.1
 */
import type { PolymarketClobClient } from './clob-client.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface OrderbookEntry {
  price: string;
  size: string;
}

export interface OrderbookResult {
  bids: OrderbookEntry[];
  asks: OrderbookEntry[];
  spread: string;
  midpoint: string;
  depth: {
    bidDepth: string;
    askDepth: string;
  };
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class PolymarketOrderbookService {
  constructor(private readonly clobClient: PolymarketClobClient) {}

  /**
   * Get structured orderbook for a token with spread and depth calculations.
   */
  async getOrderbook(tokenId: string): Promise<OrderbookResult> {
    const raw = await this.clobClient.getOrderbook(tokenId);

    const bids: OrderbookEntry[] = (raw.bids ?? []).map((b: { price: string; size: string }) => ({
      price: b.price,
      size: b.size,
    }));

    const asks: OrderbookEntry[] = (raw.asks ?? []).map((a: { price: string; size: string }) => ({
      price: a.price,
      size: a.size,
    }));

    // Calculate spread and midpoint (need both sides)
    const bestBid = bids[0]?.price ? parseFloat(bids[0].price) : 0;
    const bestAsk = asks[0]?.price ? parseFloat(asks[0].price) : 0;

    const hasSpread = bids.length > 0 && asks.length > 0;
    const spread = hasSpread ? String(bestAsk - bestBid) : '0';
    const midpoint = hasSpread ? String((bestBid + bestAsk) / 2) : '0';

    // Calculate depth (sum of sizes)
    const bidDepth = bids.reduce((sum, b) => sum + parseFloat(b.size), 0);
    const askDepth = asks.reduce((sum, a) => sum + parseFloat(a.size), 0);

    return {
      bids,
      asks,
      spread,
      midpoint,
      depth: {
        bidDepth: String(bidDepth),
        askDepth: String(askDepth),
      },
    };
  }

  /**
   * Get current price for a token.
   */
  async getPrice(tokenId: string): Promise<string> {
    const result = await this.clobClient.getPrice(tokenId);
    return result.price ?? '0';
  }

  /**
   * Get midpoint price for a token.
   */
  async getMidpoint(tokenId: string): Promise<string> {
    const result = await this.clobClient.getMidpoint(tokenId);
    return result.mid ?? '0';
  }
}
