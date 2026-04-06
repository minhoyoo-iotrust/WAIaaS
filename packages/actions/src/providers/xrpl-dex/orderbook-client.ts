/**
 * XrplOrderbookClient -- XRPL RPC wrapper for orderbook and account queries.
 *
 * Provides:
 * - getOrderbook: book_offers for asks + bids with normalized prices
 * - getAccountOffers: account_offers for active orders
 * - checkTrustLine: account_lines for trust line existence
 * - getAccountReserve: account_info for reserve calculation
 *
 * Uses lazy connection (ensureConnected) and explicit disconnect.
 *
 * @see Phase 02-01 Task 3
 */
import { Client } from 'xrpl';
import type { Amount } from 'xrpl';
import type { BookOfferCurrency } from './offer-builder.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface OrderbookEntry {
  /** Price in counter/base units. */
  price: number;
  /** Amount in base units. */
  amount: number;
  /** Total in counter units (price * amount). */
  total: number;
  /** Available balance of the offer owner. */
  ownerFunds: string;
  /** Offer sequence number. */
  sequence: number;
}

export interface OrderbookResult {
  /** Sell orders (ascending by price -- best ask first). */
  asks: OrderbookEntry[];
  /** Buy orders (descending by price -- best bid first). */
  bids: OrderbookEntry[];
  /** Spread between best ask and best bid (NaN if no orders). */
  spread: number;
}

export interface AccountOffer {
  /** Offer sequence number (use for cancel_order). */
  seq: number;
  /** What the offer gives away. */
  takerGets: string;
  /** What the offer wants. */
  takerPays: string;
  /** Offer flags. */
  flags: number;
  /** Expiration (Ripple epoch, optional). */
  expiration?: number;
}

export interface ReserveInfo {
  /** Total balance in drops. */
  balance: string;
  /** Number of owned ledger objects. */
  ownerCount: number;
  /** Base reserve in drops (10 XRP). */
  baseReserve: number;
  /** Per-object owner reserve in drops (0.2 XRP). */
  ownerReserve: number;
  /** Available balance for new objects (balance - baseReserve - ownerCount * ownerReserve) in drops. */
  availableBalance: string;
}

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

export class XrplOrderbookClient {
  private client: Client | null = null;
  private connectingPromise: Promise<void> | null = null;

  constructor(private readonly rpcUrl: string) {}

  /**
   * Ensure WebSocket connection is established (lazy connect).
   */
  async ensureConnected(): Promise<void> {
    if (this.client?.isConnected()) return;

    // Prevent concurrent connect attempts
    if (this.connectingPromise) {
      await this.connectingPromise;
      return;
    }

    this.connectingPromise = (async () => {
      try {
        this.client = new Client(this.rpcUrl, { connectionTimeout: 10000 });
        await this.client.connect();
      } finally {
        this.connectingPromise = null;
      }
    })();

    await this.connectingPromise;
  }

  /**
   * Close WebSocket connection.
   */
  async disconnect(): Promise<void> {
    if (this.client) {
      try {
        await this.client.disconnect();
      } catch {
        // ignore disconnect errors
      }
      this.client = null;
    }
  }

  /**
   * Get the underlying xrpl.Client (for testing/direct access).
   */
  getClient(): Client {
    if (!this.client) {
      throw new Error('XrplOrderbookClient: not connected. Call ensureConnected() first.');
    }
    return this.client;
  }

  // -------------------------------------------------------------------------
  // Orderbook queries
  // -------------------------------------------------------------------------

  /**
   * Query orderbook for a trading pair (both ask and bid sides).
   */
  async getOrderbook(
    base: BookOfferCurrency,
    counter: BookOfferCurrency,
    limit: number,
  ): Promise<OrderbookResult> {
    await this.ensureConnected();
    const client = this.getClient();

    // Asks: offers selling base for counter (taker perspective: taker_gets=base, taker_pays=counter)
    const asksResponse = await client.request({
      command: 'book_offers',
      taker_gets: base,
      taker_pays: counter,
      limit,
    });

    // Bids: offers buying base with counter (taker perspective: taker_gets=counter, taker_pays=base)
    const bidsResponse = await client.request({
      command: 'book_offers',
      taker_gets: counter,
      taker_pays: base,
      limit,
    });

    const asks = (asksResponse.result.offers || []).map((offer) => {
      const getsValue = parseAmountValue(offer.TakerGets);
      const paysValue = parseAmountValue(offer.TakerPays);
      const price = paysValue / getsValue; // counter per base
      return {
        price,
        amount: getsValue,
        total: paysValue,
        ownerFunds: String(offer.owner_funds ?? '0'),
        sequence: offer.Sequence ?? 0,
      };
    });

    const bids = (bidsResponse.result.offers || []).map((offer) => {
      const getsValue = parseAmountValue(offer.TakerGets); // counter
      const paysValue = parseAmountValue(offer.TakerPays); // base
      const price = getsValue / paysValue; // counter per base
      return {
        price,
        amount: paysValue,
        total: getsValue,
        ownerFunds: String(offer.owner_funds ?? '0'),
        sequence: offer.Sequence ?? 0,
      };
    });

    // Calculate spread
    const bestAsk = asks.length > 0 ? asks[0]!.price : NaN;
    const bestBid = bids.length > 0 ? bids[0]!.price : NaN;
    const spread = !isNaN(bestAsk) && !isNaN(bestBid) ? bestAsk - bestBid : NaN;

    return { asks, bids, spread };
  }

  /**
   * Query account's active offers.
   */
  async getAccountOffers(account: string, limit: number): Promise<AccountOffer[]> {
    await this.ensureConnected();
    const client = this.getClient();

    const response = await client.request({
      command: 'account_offers',
      account,
      limit,
    });

    return (response.result.offers || []).map((offer) => ({
      seq: offer.seq,
      takerGets: formatAmountDisplay(offer.taker_gets),
      takerPays: formatAmountDisplay(offer.taker_pays),
      flags: offer.flags ?? 0,
      expiration: offer.expiration,
    }));
  }

  // -------------------------------------------------------------------------
  // Trust line and reserve queries
  // -------------------------------------------------------------------------

  /**
   * Check if a trust line exists for a specific currency/issuer pair.
   */
  async checkTrustLine(account: string, currency: string, issuer: string): Promise<boolean> {
    await this.ensureConnected();
    const client = this.getClient();

    try {
      const response = await client.request({
        command: 'account_lines',
        account,
        peer: issuer,
      });

      const lines = response.result.lines || [];
      return lines.some(
        (line) => line.currency?.toUpperCase() === currency.toUpperCase(),
      );
    } catch {
      // If account doesn't exist yet, no trust lines
      return false;
    }
  }

  /**
   * Get account reserve information.
   */
  async getAccountReserve(account: string): Promise<ReserveInfo> {
    await this.ensureConnected();
    const client = this.getClient();

    const accountInfo = await client.request({
      command: 'account_info',
      account,
      ledger_index: 'validated',
    });

    const accountData = accountInfo.result.account_data;
    const balance = accountData.Balance as string;
    const ownerCount = (accountData.OwnerCount ?? 0) as number;

    // Default reserves (per amendment status as of 2024)
    const baseReserve = 1_000_000; // 1 XRP (previously 10, reduced by amendment)
    const ownerReserve = 200_000; // 0.2 XRP

    const totalReserve = BigInt(baseReserve) + BigInt(ownerCount) * BigInt(ownerReserve);
    const available = BigInt(balance) - totalReserve;
    const availableBalance = available > 0n ? available.toString() : '0';

    return {
      balance,
      ownerCount,
      baseReserve,
      ownerReserve,
      availableBalance,
    };
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Parse XRPL Amount to numeric value.
 * XRP: drops string -> drops / 1000000
 * IOU: { value: "100.5" } -> 100.5
 */
function parseAmountValue(amount: Amount): number {
  if (typeof amount === 'string') {
    // XRP drops
    return Number(amount) / 1_000_000;
  }
  return parseFloat(amount.value);
}

/**
 * Format XRPL Amount for display.
 * XRP: drops string -> "1000000 drops"
 * IOU: { currency, issuer, value } -> "100.5 USD"
 */
function formatAmountDisplay(amount: Amount): string {
  if (typeof amount === 'string') {
    return `${amount} drops`;
  }
  return `${amount.value} ${amount.currency}`;
}
