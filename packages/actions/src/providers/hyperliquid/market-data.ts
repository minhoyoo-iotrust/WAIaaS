/**
 * HyperliquidMarketData: Read-only Info API wrapper.
 * Used by MCP query tools, Admin UI, and PerpProvider for price lookups.
 *
 * @see HDESIGN-03: MarketData design
 */
import type { HyperliquidExchangeClient } from './exchange-client.js';
import {
  ClearinghouseStateSchema,
  AllMidsSchema,
  MarketMetaSchema,
  FundingRateSchema,
  FillSchema,
  OpenOrderSchema,
  type ClearinghouseState,
  type Position,
  type OpenOrder,
  type Fill,
  type FundingRate,
} from './schemas.js';
import { z } from 'zod';
import type { Hex } from 'viem';

// ---------------------------------------------------------------------------
// Market metadata type
// ---------------------------------------------------------------------------

export interface MarketInfo {
  name: string;
  szDecimals: number;
  maxLeverage?: number;
  onlyIsolated?: boolean;
}

// ---------------------------------------------------------------------------
// HyperliquidMarketData
// ---------------------------------------------------------------------------

export class HyperliquidMarketData {
  constructor(private readonly client: HyperliquidExchangeClient) {}

  /**
   * Get perp positions for a wallet.
   */
  async getPositions(walletAddress: Hex, subAccount?: Hex): Promise<Position[]> {
    const user = subAccount ?? walletAddress;
    const state = await this.client.info(
      { type: 'clearinghouseState', user },
      ClearinghouseStateSchema,
    );
    return state.assetPositions
      .map((ap) => ap.position)
      .filter((p) => parseFloat(p.szi) !== 0);
  }

  /**
   * Get open orders for a wallet.
   */
  async getOpenOrders(walletAddress: Hex, subAccount?: Hex): Promise<OpenOrder[]> {
    const user = subAccount ?? walletAddress;
    return this.client.info(
      { type: 'openOrders', user },
      z.array(OpenOrderSchema),
    );
  }

  /**
   * Get perp market metadata.
   */
  async getMarkets(): Promise<MarketInfo[]> {
    const meta = await this.client.info(
      { type: 'meta' },
      MarketMetaSchema,
    );
    return meta.universe;
  }

  /**
   * Get funding rate history for a market.
   */
  async getFundingHistory(market: string, startTime: number): Promise<FundingRate[]> {
    return this.client.info(
      { type: 'fundingHistory', coin: market, startTime },
      z.array(FundingRateSchema),
    );
  }

  /**
   * Get all mid prices.
   */
  async getAllMidPrices(): Promise<Record<string, string>> {
    return this.client.info(
      { type: 'allMids' },
      AllMidsSchema,
    );
  }

  /**
   * Get full clearinghouse state (positions + margin summary).
   */
  async getAccountState(walletAddress: Hex): Promise<ClearinghouseState> {
    return this.client.info(
      { type: 'clearinghouseState', user: walletAddress },
      ClearinghouseStateSchema,
    );
  }

  /**
   * Get spot clearinghouse state.
   */
  async getSpotState(walletAddress: Hex): Promise<unknown> {
    return this.client.info(
      { type: 'spotClearinghouseState', user: walletAddress },
      z.unknown(),
    );
  }

  /**
   * Get user trade fills (history).
   */
  async getUserFills(walletAddress: Hex, limit?: number): Promise<Fill[]> {
    const fills = await this.client.info(
      { type: 'userFills', user: walletAddress },
      z.array(FillSchema),
    );
    return limit ? fills.slice(0, limit) : fills;
  }

  /**
   * Get sub-accounts for a wallet.
   */
  async getSubAccounts(walletAddress: Hex): Promise<unknown[]> {
    return this.client.info(
      { type: 'subAccounts', user: walletAddress },
      z.array(z.unknown()),
    );
  }
}
