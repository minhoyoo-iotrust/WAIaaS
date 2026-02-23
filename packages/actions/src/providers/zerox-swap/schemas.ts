/**
 * Zod schemas for 0x Swap API v2 responses.
 * Runtime validation to detect API drift early.
 *
 * Endpoints:
 * - /swap/allowance-holder/price  -> PriceResponseSchema
 * - /swap/allowance-holder/quote  -> QuoteResponseSchema
 */
import { z } from 'zod';

// ---------------------------------------------------------------------------
// Price Response (/swap/allowance-holder/price) (ZXSW-02)
// ---------------------------------------------------------------------------

export const PriceResponseSchema = z.object({
  blockNumber: z.string(),
  buyAmount: z.string(),
  buyToken: z.string(),
  fees: z.object({
    integratorFee: z.unknown().nullable(),
    zeroExFee: z.object({
      amount: z.string(),
      token: z.string(),
      type: z.string(),
    }).nullable(),
    gasFee: z.unknown().nullable(),
  }),
  gas: z.string(),
  gasPrice: z.string(),
  liquidityAvailable: z.boolean(),  // ZXSW-07: must validate this
  minBuyAmount: z.string(),
  route: z.object({
    fills: z.array(z.object({
      from: z.string(),
      to: z.string(),
      source: z.string(),
      proportionBps: z.string(),
    })),
    tokens: z.array(z.object({
      address: z.string(),
      symbol: z.string(),
    })),
  }),
  sellAmount: z.string(),
  sellToken: z.string(),
  totalNetworkFee: z.string(),
}).passthrough(); // Allow extra fields from API updates

export type PriceResponse = z.infer<typeof PriceResponseSchema>;

// ---------------------------------------------------------------------------
// Quote Response (/swap/allowance-holder/quote) (ZXSW-03)
// ---------------------------------------------------------------------------

export const QuoteResponseSchema = PriceResponseSchema.extend({
  transaction: z.object({
    to: z.string(),      // AllowanceHolder contract
    data: z.string(),    // calldata (hex)
    gas: z.string(),
    gasPrice: z.string(),
    value: z.string(),   // native token value (wei)
  }),
  permit2: z.unknown().nullable().optional(),  // null for AllowanceHolder flow
}).passthrough();

export type QuoteResponse = z.infer<typeof QuoteResponseSchema>;
