/**
 * M8: MockOnchainOracle.
 *
 * Simulates Pyth on-chain price feed data structures in-memory.
 * Used for testing code that parses Solana program account data
 * (Level 1 Mock RPC chain tests).
 *
 * Feed data uses the same structure as Pyth Hermes API responses,
 * converted to PriceInfo via toPriceInfo().
 */
import type { PriceInfo } from '@waiaas/core';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Mock representation of a Pyth price feed. */
export interface MockPythFeed {
  /** Pyth feed ID (hex, no 0x prefix). */
  id: string;
  /** Scaled price (before expo). */
  price: bigint;
  /** Confidence interval (same scale as price). */
  conf: bigint;
  /** Price exponent (typically negative, e.g., -8). */
  expo: number;
  /** Publish time in Unix seconds. */
  publishTime: number;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Create a mock Pyth feed with sensible defaults (SOL/USD ~184.13).
 *
 * @param overrides - Partial overrides for feed fields.
 * @returns A complete MockPythFeed.
 */
export function createMockPythFeed(overrides?: Partial<MockPythFeed>): MockPythFeed {
  return {
    id: 'ef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d',
    price: 18413602312n,
    conf: 17716632n,
    expo: -8,
    publishTime: Math.floor(Date.now() / 1000),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// MockOnchainOracle
// ---------------------------------------------------------------------------

/**
 * In-memory oracle that manages mock Pyth price feeds.
 *
 * Allows setting, getting, and converting feeds to PriceInfo format
 * matching PythOracle output structure.
 */
export class MockOnchainOracle {
  private feeds = new Map<string, MockPythFeed>();

  /** Set a feed by ID. */
  setFeed(feedId: string, feed: MockPythFeed): void {
    this.feeds.set(feedId, feed);
  }

  /** Remove a feed by ID. */
  removeFeed(feedId: string): void {
    this.feeds.delete(feedId);
  }

  /** Get a feed by ID. */
  getFeed(feedId: string): MockPythFeed | undefined {
    return this.feeds.get(feedId);
  }

  /** Get all stored feeds. */
  getAllFeeds(): Map<string, MockPythFeed> {
    return new Map(this.feeds);
  }

  /**
   * Convert a MockPythFeed to PriceInfo format (matching PythOracle output).
   *
   * Price formula: usdPrice = Number(price) * 10^expo
   * Confidence: 1 - (conf / price), clamped to [0, 1].
   */
  toPriceInfo(feed: MockPythFeed): PriceInfo {
    const usdPrice = Number(feed.price) * Math.pow(10, feed.expo);
    const confidence =
      feed.price > 0n
        ? Math.max(0, Math.min(1, 1 - Number(feed.conf) / Number(feed.price)))
        : undefined;

    const now = Date.now();
    return {
      usdPrice,
      source: 'pyth' as const,
      confidence,
      isStale: false,
      fetchedAt: now,
      expiresAt: now + 5 * 60 * 1000,
    };
  }

  /** Reset all feeds. */
  reset(): void {
    this.feeds.clear();
  }
}
