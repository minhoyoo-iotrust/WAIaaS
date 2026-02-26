/**
 * Lending Provider types and interfaces (Zod SSoT).
 *
 * Defines ILendingProvider extending IActionProvider with
 * domain-specific query methods for DeFi lending positions.
 *
 * Design source: m29-00 design doc section 13.1.
 */
import { z } from 'zod';
import type { IActionProvider, ActionContext } from './action-provider.types.js';

// ---------------------------------------------------------------------------
// Zod SSoT: LendingPositionSummary
// ---------------------------------------------------------------------------

export const LendingPositionSummarySchema = z.object({
  asset: z.string(),
  positionType: z.enum(['SUPPLY', 'BORROW']),
  amount: z.string(),
  amountUsd: z.number().nullable(),
  apy: z.number().nullable(),
});

export type LendingPositionSummary = z.infer<typeof LendingPositionSummarySchema>;

// ---------------------------------------------------------------------------
// Zod SSoT: HealthFactor
// ---------------------------------------------------------------------------

export const HealthFactorSchema = z.object({
  factor: z.number(),
  totalCollateralUsd: z.number(),
  totalDebtUsd: z.number(),
  currentLtv: z.number(),
  status: z.enum(['safe', 'warning', 'danger', 'critical']),
});

export type HealthFactor = z.infer<typeof HealthFactorSchema>;

// ---------------------------------------------------------------------------
// Zod SSoT: MarketInfo
// ---------------------------------------------------------------------------

export const MarketInfoSchema = z.object({
  asset: z.string(),
  symbol: z.string(),
  supplyApy: z.number(),
  borrowApy: z.number(),
  ltv: z.number(),
  availableLiquidity: z.string(),
});

export type MarketInfo = z.infer<typeof MarketInfoSchema>;

// ---------------------------------------------------------------------------
// ILendingProvider interface
// ---------------------------------------------------------------------------

/**
 * Lending Provider contract.
 *
 * Extends IActionProvider with lending-specific query methods.
 * Implementations (e.g., AaveV3LendingProvider) provide both
 * action resolution (supply/borrow/repay/withdraw) and
 * position/health-factor/market queries.
 */
export interface ILendingProvider extends IActionProvider {
  getPosition(walletId: string, context: ActionContext): Promise<LendingPositionSummary[]>;
  getHealthFactor(walletId: string, context: ActionContext): Promise<HealthFactor>;
  getMarkets(chain: string, network?: string): Promise<MarketInfo[]>;
}
