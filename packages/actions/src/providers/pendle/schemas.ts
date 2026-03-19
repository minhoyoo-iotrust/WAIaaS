/**
 * Zod schemas for Pendle REST API v2 responses.
 * Runtime validation to detect API drift early.
 *
 * Endpoints:
 * - /v1/markets/all?chainId={chainId}          -> PendleMarketsResponseSchema
 * - /v2/sdk/{chainId}/convert                  -> PendleConvertResponseSchema
 * - /v1/sdk/{chainId}/markets/{market}/swapping-prices -> PendleSwappingPricesSchema
 */
import { z } from 'zod';

// ---------------------------------------------------------------------------
// Market details (nested in market response)
// ---------------------------------------------------------------------------

const PendleMarketDetailsSchema = z.object({
  impliedApy: z.number(),
  underlyingApy: z.number(),
  liquidity: z.number().nullable(),
}).passthrough();

// ---------------------------------------------------------------------------
// Market (/v1/markets/all) — single market entry
// ---------------------------------------------------------------------------

export const PendleMarketSchema = z.object({
  address: z.string(),
  name: z.string(),
  expiry: z.string().describe('ISO 8601 date string'),
  pt: z.string().describe('PT token address'),
  yt: z.string().describe('YT token address'),
  sy: z.string().describe('SY token address'),
  underlyingAsset: z.object({
    address: z.string(),
    symbol: z.string(),
    decimals: z.number().optional(),
  }).passthrough(),
  chainId: z.number(),
  details: PendleMarketDetailsSchema.optional(),
}).passthrough();

export type PendleMarket = z.infer<typeof PendleMarketSchema>;

/** Full response from /v1/markets/all — accepts both array and paginated object. */
const PendleMarketsArraySchema = z.array(PendleMarketSchema);
const PendleMarketsPaginatedSchema = z.union([
  z.object({ results: z.array(PendleMarketSchema) }).passthrough(),
  z.object({ data: z.array(PendleMarketSchema) }).passthrough(),
]);
export const PendleMarketsResponseSchema = z.union([
  PendleMarketsArraySchema,
  PendleMarketsPaginatedSchema,
]);
export type PendleMarketsResponse = z.infer<typeof PendleMarketsResponseSchema>;

// ---------------------------------------------------------------------------
// Convert Response (/v2/sdk/{chainId}/convert) — unified for all actions
// ---------------------------------------------------------------------------

const PendleConvertObjectSchema = z.object({
  tx: z.object({
    to: z.string(),
    data: z.string().describe('hex-encoded calldata'),
    value: z.string().describe('native token value (wei)'),
  }).passthrough(),
  amountOut: z.string(),
}).passthrough();

/** Accept both object and single-element array — Pendle API alternates formats across versions. */
export const PendleConvertResponseSchema = z.union([
  PendleConvertObjectSchema,
  z.array(PendleConvertObjectSchema).min(1),
]);

export type PendleConvertResponse = z.infer<typeof PendleConvertObjectSchema>;

// ---------------------------------------------------------------------------
// Swapping Prices (/v1/sdk/{chainId}/markets/{market}/swapping-prices)
// ---------------------------------------------------------------------------

export const PendleSwappingPricesSchema = z.object({
  ptPrice: z.number(),
  ytPrice: z.number(),
}).passthrough();

export type PendleSwappingPrices = z.infer<typeof PendleSwappingPricesSchema>;
