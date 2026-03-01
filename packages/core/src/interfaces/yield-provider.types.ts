/**
 * Yield Provider types and interfaces (Zod SSoT).
 *
 * Defines IYieldProvider extending IActionProvider with
 * domain-specific query methods for DeFi yield positions
 * (PT/YT/LP token trading, maturity tracking).
 *
 * Design source: m29-00 design doc section 18, m29-06 objective.
 */
import { z } from 'zod';
import type { IActionProvider, ActionContext } from './action-provider.types.js';

// ---------------------------------------------------------------------------
// Zod SSoT: YieldMarketInfo
// ---------------------------------------------------------------------------

export const YieldMarketInfoSchema = z.object({
  marketAddress: z.string(),
  asset: z.string(),
  symbol: z.string(),
  impliedApy: z.number(),
  underlyingApy: z.number(),
  maturity: z.number().describe('Unix timestamp (seconds)'),
  tvl: z.number().nullable(),
  chain: z.string(),
});

export type YieldMarketInfo = z.infer<typeof YieldMarketInfoSchema>;

// ---------------------------------------------------------------------------
// Zod SSoT: YieldPositionSummary
// ---------------------------------------------------------------------------

export const YieldPositionSummarySchema = z.object({
  asset: z.string(),
  tokenType: z.enum(['PT', 'YT', 'LP']),
  amount: z.string(),
  amountUsd: z.number().nullable(),
  apy: z.number().nullable(),
  maturity: z.number().describe('Unix timestamp (seconds)'),
  marketId: z.string(),
});

export type YieldPositionSummary = z.infer<typeof YieldPositionSummarySchema>;

// ---------------------------------------------------------------------------
// Zod SSoT: YieldForecast
// ---------------------------------------------------------------------------

export const YieldForecastSchema = z.object({
  marketId: z.string(),
  impliedApy: z.number(),
  underlyingApy: z.number(),
  ptPrice: z.number(),
  ytPrice: z.number(),
  maturityDate: z.number().describe('Unix timestamp (seconds)'),
});

export type YieldForecast = z.infer<typeof YieldForecastSchema>;

// ---------------------------------------------------------------------------
// IYieldProvider interface
// ---------------------------------------------------------------------------

/**
 * Yield Provider contract.
 *
 * Extends IActionProvider with yield-specific query methods.
 * Implementations (e.g., PendleYieldProvider) provide both
 * action resolution (buyPT/buyYT/redeemPT/addLiquidity/removeLiquidity)
 * and market/position/forecast queries.
 *
 * Standard actions: buy_pt, buy_yt, redeem_pt, add_liquidity, remove_liquidity
 */
export interface IYieldProvider extends IActionProvider {
  getMarkets(chain: string, network?: string): Promise<YieldMarketInfo[]>;
  getPosition(walletId: string, context: ActionContext): Promise<YieldPositionSummary[]>;
  getYieldForecast(marketId: string, context: ActionContext): Promise<YieldForecast>;
}
