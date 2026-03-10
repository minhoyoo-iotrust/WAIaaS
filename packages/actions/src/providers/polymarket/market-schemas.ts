/**
 * Zod SSoT schemas for Polymarket Gamma API responses and market types.
 *
 * @see design doc 80, Section 6.5 + Section 2.1
 */
import { z } from 'zod';

// ---------------------------------------------------------------------------
// Gamma API Response Schemas
// ---------------------------------------------------------------------------

/** Schema for individual outcome token within a market. */
export const GammaTokenSchema = z.object({
  token_id: z.string(),
  outcome: z.string(),
  price: z.string().optional(),
  winner: z.boolean().optional(),
}).passthrough();

export type GammaToken = z.infer<typeof GammaTokenSchema>;

/** Schema for a single Gamma API market. */
export const GammaMarketSchema = z.object({
  condition_id: z.string(),
  question: z.string().optional().default(''),
  description: z.string().optional().default(''),
  market_slug: z.string().optional().default(''),
  active: z.boolean().optional().default(true),
  closed: z.boolean().optional().default(false),
  neg_risk: z.boolean().optional().default(false),
  tokens: z.array(GammaTokenSchema).optional().default([]),
  volume: z.string().optional().default('0'),
  liquidity: z.string().optional().default('0'),
  end_date_iso: z.string().optional().default(''),
  image: z.string().optional().default(''),
  icon: z.string().optional().default(''),
  category: z.string().optional().default(''),
  resolution_source: z.string().optional().default(''),
}).passthrough();

export type GammaMarket = z.infer<typeof GammaMarketSchema>;

/** Schema for a Gamma API event containing nested markets. */
export const GammaEventSchema = z.object({
  id: z.string().optional().default(''),
  title: z.string().optional().default(''),
  slug: z.string().optional().default(''),
  description: z.string().optional().default(''),
  category: z.string().optional().default(''),
  markets: z.array(GammaMarketSchema).optional().default([]),
  neg_risk: z.boolean().optional().default(false),
}).passthrough();

export type GammaEvent = z.infer<typeof GammaEventSchema>;

// ---------------------------------------------------------------------------
// Market Filter Schema
// ---------------------------------------------------------------------------

/** Query parameters for filtering markets in Gamma API. */
export const MarketFilterSchema = z.object({
  active: z.boolean().optional(),
  closed: z.boolean().optional(),
  category: z.string().optional(),
  limit: z.number().int().positive().optional(),
  offset: z.number().int().nonnegative().optional(),
  order: z.string().optional(),
  ascending: z.boolean().optional(),
}).strict();

export type MarketFilter = z.infer<typeof MarketFilterSchema>;
