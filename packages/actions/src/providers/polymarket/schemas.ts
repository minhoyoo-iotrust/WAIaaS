/**
 * Zod SSoT schemas for Polymarket CLOB actions.
 *
 * @see design doc 80, Section 7.1
 */
import { z } from 'zod';

// ---------------------------------------------------------------------------
// Input Schemas
// ---------------------------------------------------------------------------

/** Buy outcome tokens on Polymarket CLOB */
export const PmBuySchema = z.object({
  /** CTF ERC-1155 token ID for the target outcome */
  tokenId: z.string().min(1).describe('CTF ERC-1155 token ID'),
  /** Limit price in 0-1 range (e.g., "0.65" means 65 cents per token) */
  price: z.string().min(1).describe('Limit price in 0-1 range (e.g., "0.65" = 65 cents per token). Exchange-native decimal.'),
  /** Number of outcome tokens to buy */
  size: z.string().min(1).describe('Number of outcome tokens to buy (exchange-native, e.g., "100"). NOT smallest units.'),
  /** Order type (default: GTC) */
  orderType: z.enum(['GTC', 'GTD', 'FOK', 'IOC']).default('GTC'),
  /** Unix timestamp for GTD order expiration */
  expiration: z.number().int().optional().describe('Unix timestamp for GTD orders'),
});

export type PmBuyInput = z.infer<typeof PmBuySchema>;

/** Sell outcome tokens on Polymarket CLOB */
export const PmSellSchema = z.object({
  tokenId: z.string().min(1).describe('CTF ERC-1155 token ID'),
  price: z.string().min(1).describe('Limit price in 0-1 range. Exchange-native decimal.'),
  size: z.string().min(1).describe('Number of outcome tokens to sell (exchange-native). NOT smallest units.'),
  orderType: z.enum(['GTC', 'GTD', 'FOK', 'IOC']).default('GTC'),
  expiration: z.number().int().optional().describe('Unix timestamp for GTD orders'),
});

export type PmSellInput = z.infer<typeof PmSellSchema>;

/** Cancel a specific Polymarket order by CLOB-assigned ID */
export const PmCancelOrderSchema = z.object({
  orderId: z.string().min(1).describe('CLOB-assigned order ID'),
});

export type PmCancelOrderInput = z.infer<typeof PmCancelOrderSchema>;

/** Cancel all active orders, optionally filtered by market */
export const PmCancelAllSchema = z.object({
  conditionId: z.string().optional().describe('Filter by market conditionId (optional)'),
});

export type PmCancelAllInput = z.infer<typeof PmCancelAllSchema>;

/** Update price/size of an active order (cancel + replace) */
export const PmUpdateOrderSchema = z.object({
  orderId: z.string().min(1).describe('CLOB-assigned order ID to update'),
  price: z.string().optional().describe('New limit price'),
  size: z.string().optional().describe('New size'),
});

export type PmUpdateOrderInput = z.infer<typeof PmUpdateOrderSchema>;

// ---------------------------------------------------------------------------
// Order Types (Polymarket CLOB)
// ---------------------------------------------------------------------------

export const PM_ORDER_TYPES = ['GTC', 'GTD', 'FOK', 'IOC'] as const;
export type PmOrderType = (typeof PM_ORDER_TYPES)[number];

export const PM_ORDER_SIDES = ['BUY', 'SELL'] as const;
export type PmOrderSide = (typeof PM_ORDER_SIDES)[number];

export const PM_ORDER_STATUSES = [
  'PENDING',
  'LIVE',
  'MATCHED',
  'PARTIALLY_FILLED',
  'CANCELLED',
  'EXPIRED',
] as const;
export type PmOrderStatus = (typeof PM_ORDER_STATUSES)[number];

// ---------------------------------------------------------------------------
// CLOB API Response Types
// ---------------------------------------------------------------------------

/** CLOB API order submission response */
export const ClobOrderResponseSchema = z.object({
  orderID: z.string().optional(),
  success: z.boolean().optional(),
  errorMsg: z.string().optional(),
  transactionsHashes: z.array(z.string()).optional(),
  status: z.string().optional(),
}).passthrough();

export type ClobOrderResponse = z.infer<typeof ClobOrderResponseSchema>;

/** Orderbook entry */
export const OrderbookEntrySchema = z.object({
  price: z.string(),
  size: z.string(),
});

/** CLOB orderbook response */
export const OrderbookResponseSchema = z.object({
  market: z.string().optional(),
  asset_id: z.string().optional(),
  bids: z.array(OrderbookEntrySchema).optional().default([]),
  asks: z.array(OrderbookEntrySchema).optional().default([]),
  hash: z.string().optional(),
  timestamp: z.string().optional(),
}).passthrough();

export type OrderbookResponse = z.infer<typeof OrderbookResponseSchema>;

/** CLOB price response */
export const PriceResponseSchema = z.object({
  price: z.string().optional(),
}).passthrough();

export type PriceResponse = z.infer<typeof PriceResponseSchema>;

/** CLOB midpoint response */
export const MidpointResponseSchema = z.object({
  mid: z.string().optional(),
}).passthrough();

export type MidpointResponse = z.infer<typeof MidpointResponseSchema>;

// ---------------------------------------------------------------------------
// Order Struct (EIP-712 typed)
// ---------------------------------------------------------------------------

/** Polymarket Order struct for EIP-712 signing (all fields as bigint/Hex) */
export interface PolymarketOrderStruct {
  salt: bigint;
  maker: `0x${string}`;
  signer: `0x${string}`;
  taker: `0x${string}`;
  tokenId: bigint;
  makerAmount: bigint;
  takerAmount: bigint;
  expiration: bigint;
  nonce: bigint;
  feeRateBps: bigint;
  side: number;
  signatureType: number;
}
