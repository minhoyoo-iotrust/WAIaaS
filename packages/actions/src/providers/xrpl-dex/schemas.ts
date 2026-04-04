/**
 * Zod input schemas for XRPL DEX Provider actions.
 *
 * Token format: "XRP" for native, "{CURRENCY}.{ISSUER}" for IOU
 * (matches parseTrustLineToken convention from @waiaas/adapter-ripple).
 *
 * @see Phase 02-01 Task 1
 */
import { z } from 'zod';

// ---------------------------------------------------------------------------
// Shared token string pattern
// ---------------------------------------------------------------------------

/**
 * Token identifier: "XRP" for native, or "CURRENCY.rISSUER" (dot-separated) for IOU.
 * Examples: "XRP", "USD.rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe"
 */
const tokenString = z.string().min(1, 'Token identifier is required');

// ---------------------------------------------------------------------------
// SwapInputSchema -- Immediate or Cancel swap
// ---------------------------------------------------------------------------

export const SwapInputSchema = z.object({
  /** Token the agent offers (gives away). "XRP" or "CURRENCY.ISSUER". */
  takerGets: tokenString.describe('Token to sell (e.g., "XRP" or "USD.rIssuer...")'),
  /** Amount of takerGets in display units. XRP in drops, IOU in decimal string. */
  takerGetsAmount: z.string().min(1, 'takerGetsAmount is required'),
  /** Token the agent wants to receive. "XRP" or "CURRENCY.ISSUER". */
  takerPays: tokenString.describe('Token to buy (e.g., "USD.rIssuer..." or "XRP")'),
  /** Amount of takerPays in display units. */
  takerPaysAmount: z.string().min(1, 'takerPaysAmount is required'),
  /** Slippage tolerance in basis points (default 50 = 0.5%). */
  slippageBps: z.number().int().min(1).max(500).default(50),
});

export type SwapInput = z.infer<typeof SwapInputSchema>;

// ---------------------------------------------------------------------------
// LimitOrderInputSchema -- Passive order on the orderbook
// ---------------------------------------------------------------------------

export const LimitOrderInputSchema = z.object({
  /** Token the agent offers (gives away). */
  takerGets: tokenString.describe('Token to sell'),
  /** Amount of takerGets in display units. */
  takerGetsAmount: z.string().min(1, 'takerGetsAmount is required'),
  /** Token the agent wants to receive. */
  takerPays: tokenString.describe('Token to buy'),
  /** Amount of takerPays in display units. */
  takerPaysAmount: z.string().min(1, 'takerPaysAmount is required'),
  /** Order expiration in seconds from now (default 86400 = 24h). */
  expirationSeconds: z.number().int().min(60).max(2592000).default(86400),
});

export type LimitOrderInput = z.infer<typeof LimitOrderInputSchema>;

// ---------------------------------------------------------------------------
// CancelOrderInputSchema -- Cancel an existing offer
// ---------------------------------------------------------------------------

export const CancelOrderInputSchema = z.object({
  /** The Sequence number of the offer to cancel (from get_offers result). */
  offerSequence: z.number().int().positive(),
});

export type CancelOrderInput = z.infer<typeof CancelOrderInputSchema>;

// ---------------------------------------------------------------------------
// GetOrderbookInputSchema -- Query orderbook depth
// ---------------------------------------------------------------------------

export const GetOrderbookInputSchema = z.object({
  /** Base token (e.g., "XRP"). */
  base: tokenString.describe('Base token for the trading pair'),
  /** Counter token (e.g., "USD.rIssuer..."). */
  counter: tokenString.describe('Counter/quote token for the trading pair'),
  /** Max offers per side (default 20). */
  limit: z.number().int().min(1).max(400).default(20),
});

export type GetOrderbookInput = z.infer<typeof GetOrderbookInputSchema>;

// ---------------------------------------------------------------------------
// GetOffersInputSchema -- Query account's active offers
// ---------------------------------------------------------------------------

export const GetOffersInputSchema = z.object({
  /** Max offers to return (default 50). */
  limit: z.number().int().min(1).max(400).default(50),
});

export type GetOffersInput = z.infer<typeof GetOffersInputSchema>;
