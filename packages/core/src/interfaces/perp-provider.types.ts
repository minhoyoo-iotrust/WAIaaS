/**
 * Perp Provider types and interfaces (Zod SSoT).
 *
 * Defines IPerpProvider extending IActionProvider with
 * domain-specific query methods for DeFi perp positions.
 *
 * Design source: m29-00 design doc section 14.
 * @see PERP-01, PERP-02
 */
import { z } from 'zod';
import type { IActionProvider, ActionContext } from './action-provider.types.js';

// ---------------------------------------------------------------------------
// Zod SSoT: PerpPositionSummary
// ---------------------------------------------------------------------------

export const PerpPositionSummarySchema = z.object({
  market: z.string(),
  direction: z.enum(['LONG', 'SHORT']),
  size: z.string(),
  entryPrice: z.number().nullable(),
  leverage: z.number(),
  unrealizedPnl: z.number().nullable(),
  margin: z.number().nullable(),
  liquidationPrice: z.number().nullable(),
});

export type PerpPositionSummary = z.infer<typeof PerpPositionSummarySchema>;

// ---------------------------------------------------------------------------
// Zod SSoT: MarginInfo
// ---------------------------------------------------------------------------

export const MarginInfoSchema = z.object({
  totalMargin: z.number(),
  freeMargin: z.number(),
  maintenanceMarginRatio: z.number(),
  marginRatio: z.number(),
  status: z.enum(['safe', 'warning', 'danger', 'critical']),
});

export type MarginInfo = z.infer<typeof MarginInfoSchema>;

// ---------------------------------------------------------------------------
// Zod SSoT: PerpMarketInfo
// ---------------------------------------------------------------------------

export const PerpMarketInfoSchema = z.object({
  market: z.string(),
  baseAsset: z.string(),
  maxLeverage: z.number(),
  fundingRate: z.number().nullable(),
  openInterest: z.number().nullable(),
  oraclePrice: z.number().nullable(),
});

export type PerpMarketInfo = z.infer<typeof PerpMarketInfoSchema>;

// ---------------------------------------------------------------------------
// IPerpProvider interface
// ---------------------------------------------------------------------------

/**
 * Perp Provider contract.
 *
 * Extends IActionProvider with perp-specific query methods.
 * Implementations (e.g., DriftPerpProvider) provide both
 * action resolution (open_position/close_position/modify_position/
 * add_margin/withdraw_margin) and position/margin/market queries.
 *
 * Standard actions: open_position, close_position, modify_position,
 *   add_margin, withdraw_margin
 */
export interface IPerpProvider extends IActionProvider {
  getPosition(walletId: string, context: ActionContext): Promise<PerpPositionSummary[]>;
  getMarginInfo(walletId: string, context: ActionContext): Promise<MarginInfo>;
  getMarkets(chain: string, network?: string): Promise<PerpMarketInfo[]>;
}
