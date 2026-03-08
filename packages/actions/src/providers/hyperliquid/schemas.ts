/**
 * Zod SSoT schemas for Hyperliquid API requests and responses.
 *
 * @see HDESIGN-02: EIP-712 signing
 * @see HDESIGN-03: ExchangeClient shared structure
 */
import { z } from 'zod';

// ---------------------------------------------------------------------------
// Input Schemas (Perp Actions)
// ---------------------------------------------------------------------------

/** Open a perpetual position (market or limit). */
export const HlOpenPositionInputSchema = z
  .object({
    /** Market symbol (e.g., "ETH", "BTC"). */
    market: z.string().min(1),
    /** Order side. */
    side: z.enum(['BUY', 'SELL']),
    /** Position size as decimal string (e.g., "1.0"). */
    size: z.string().min(1),
    /** Limit price as decimal string. Required for LIMIT orders. */
    price: z.string().optional(),
    /** Order type. */
    orderType: z.enum(['MARKET', 'LIMIT']),
    /** Leverage multiplier (1-100). Uses default if omitted. */
    leverage: z.number().min(1).max(100).optional(),
    /** Reduce-only flag. */
    reduceOnly: z.boolean().optional().default(false),
    /** Time-in-force. */
    tif: z.enum(['GTC', 'IOC', 'ALO']).optional(),
    /** Client order ID (128-bit hex). */
    cloid: z.string().optional(),
    /** Sub-account address (hex, 42 chars). */
    subAccount: z.string().optional(),
  })
  .refine((d) => d.orderType !== 'LIMIT' || d.price !== undefined, {
    message: 'price is required for LIMIT orders',
    path: ['price'],
  });

/** Place a conditional order (stop-loss, take-profit). */
export const HlPlaceOrderInputSchema = z
  .object({
    market: z.string().min(1),
    side: z.enum(['BUY', 'SELL']),
    size: z.string().min(1),
    /** Trigger price for stop/TP orders. */
    triggerPrice: z.string(),
    /** Limit price after trigger (optional for market execution). */
    price: z.string().optional(),
    orderType: z.enum(['STOP_MARKET', 'STOP_LIMIT', 'TAKE_PROFIT']),
    reduceOnly: z.boolean().optional().default(true),
    tif: z.enum(['GTC', 'IOC', 'ALO']).optional(),
    cloid: z.string().optional(),
    subAccount: z.string().optional(),
  });

/** Close a perpetual position. */
export const HlClosePositionInputSchema = z.object({
  /** Market to close. */
  market: z.string().min(1),
  /** Partial close size. Omit for full close. */
  size: z.string().optional(),
  /** Sub-account address. */
  subAccount: z.string().optional(),
});

/** Cancel orders. */
export const HlCancelOrderInputSchema = z.object({
  market: z.string().min(1),
  /** Hyperliquid order ID. Omit to cancel all for market. */
  oid: z.number().optional(),
  /** Client order ID. Alternative to oid. */
  cloid: z.string().optional(),
  subAccount: z.string().optional(),
});

/** Set leverage for a market. */
export const HlSetLeverageInputSchema = z.object({
  /** Asset index. */
  asset: z.number().int().min(0),
  /** Leverage multiplier. */
  leverage: z.number().min(1).max(100),
  /** Cross margin mode. */
  isCross: z.boolean(),
});

/** Set margin mode for a market. */
export const HlSetMarginModeInputSchema = z.object({
  asset: z.number().int().min(0),
  mode: z.enum(['CROSS', 'ISOLATED']),
});

/** Transfer USDC between Spot and Perp accounts. */
export const HlTransferUsdcInputSchema = z.object({
  /** Amount to transfer as decimal string. */
  amount: z.string().min(1),
  /** True = Spot -> Perp, False = Perp -> Spot. */
  toPerp: z.boolean(),
});

// ---------------------------------------------------------------------------
// API Response Schemas
// ---------------------------------------------------------------------------

/** Exchange API response (POST /exchange). */
export const ExchangeResponseSchema = z.object({
  status: z.string(),
  response: z.object({
    type: z.string(),
    data: z.unknown().optional(),
  }).optional(),
}).passthrough();

export type ExchangeResponse = z.infer<typeof ExchangeResponseSchema>;

/** Position in clearinghouse state. */
export const PositionSchema = z.object({
  coin: z.string(),
  szi: z.string(),
  entryPx: z.string().nullable().optional(),
  positionValue: z.string().optional(),
  unrealizedPnl: z.string().optional(),
  returnOnEquity: z.string().optional(),
  leverage: z.object({
    type: z.string(),
    value: z.number(),
    rawUsd: z.string().optional(),
  }).optional(),
  liquidationPx: z.string().nullable().optional(),
  marginUsed: z.string().optional(),
  maxLeverage: z.number().optional(),
}).passthrough();

export type Position = z.infer<typeof PositionSchema>;

/** Clearinghouse state response. */
export const ClearinghouseStateSchema = z.object({
  marginSummary: z.object({
    accountValue: z.string(),
    totalNtlPos: z.string(),
    totalRawUsd: z.string(),
    totalMarginUsed: z.string().optional(),
  }).passthrough(),
  crossMarginSummary: z.object({
    accountValue: z.string(),
    totalNtlPos: z.string(),
    totalRawUsd: z.string(),
    totalMarginUsed: z.string().optional(),
  }).passthrough().optional(),
  assetPositions: z.array(z.object({
    type: z.string(),
    position: PositionSchema,
  })),
  crossMaintenanceMarginUsed: z.string().optional(),
}).passthrough();

export type ClearinghouseState = z.infer<typeof ClearinghouseStateSchema>;

/** Open order response. */
export const OpenOrderSchema = z.object({
  coin: z.string(),
  side: z.string(),
  limitPx: z.string(),
  sz: z.string(),
  oid: z.number(),
  timestamp: z.number().optional(),
  origSz: z.string().optional(),
  cloid: z.string().nullable().optional(),
  orderType: z.string().optional(),
  tif: z.string().optional(),
  reduceOnly: z.boolean().optional(),
  triggerPx: z.string().nullable().optional(),
  triggerCondition: z.string().optional(),
}).passthrough();

export type OpenOrder = z.infer<typeof OpenOrderSchema>;

/** Trade fill response. */
export const FillSchema = z.object({
  coin: z.string(),
  px: z.string(),
  sz: z.string(),
  side: z.string(),
  time: z.number(),
  startPosition: z.string().optional(),
  dir: z.string().optional(),
  closedPnl: z.string().optional(),
  hash: z.string().optional(),
  oid: z.number().optional(),
  crossed: z.boolean().optional(),
  fee: z.string().optional(),
  tid: z.number().optional(),
  feeToken: z.string().optional(),
}).passthrough();

export type Fill = z.infer<typeof FillSchema>;

/** Perp market metadata. */
export const MarketMetaSchema = z.object({
  universe: z.array(z.object({
    name: z.string(),
    szDecimals: z.number(),
    maxLeverage: z.number().optional(),
    onlyIsolated: z.boolean().optional(),
  }).passthrough()),
}).passthrough();

export type MarketMeta = z.infer<typeof MarketMetaSchema>;

/** Funding rate history entry. */
export const FundingRateSchema = z.object({
  coin: z.string(),
  fundingRate: z.string(),
  premium: z.string().optional(),
  time: z.number(),
}).passthrough();

export type FundingRate = z.infer<typeof FundingRateSchema>;

/** All mid prices response (Record<coin, midPx>). */
export const AllMidsSchema = z.record(z.string(), z.string());
export type AllMids = z.infer<typeof AllMidsSchema>;

// ---------------------------------------------------------------------------
// Wire format types (internal, for signer)
// ---------------------------------------------------------------------------

/** Order wire format for msgpack encoding (canonical field order). */
export interface OrderWire {
  a: number;   // asset index
  b: boolean;  // isBuy
  p: string;   // limitPx
  s: string;   // sz
  r: boolean;  // reduceOnly
  t: OrderTypeWire;  // order type
  c?: string;  // cloid (optional)
}

/** Order type wire format. */
export interface OrderTypeWire {
  limit?: { tif: string };
  trigger?: {
    isMarket: boolean;
    triggerPx: string;
    tpsl: string;
  };
}

// ---------------------------------------------------------------------------
// User-Signed Action EIP-712 Types
// ---------------------------------------------------------------------------

export const USER_ACTION_TYPES: Record<string, Array<{ name: string; type: string }>> = {
  UsdClassTransfer: [
    { name: 'hyperliquidChain', type: 'string' },
    { name: 'amount', type: 'string' },
    { name: 'toPerp', type: 'bool' },
    { name: 'nonce', type: 'uint64' },
  ],
  UsdSend: [
    { name: 'hyperliquidChain', type: 'string' },
    { name: 'destination', type: 'string' },
    { name: 'amount', type: 'string' },
    { name: 'time', type: 'uint64' },
  ],
  Withdraw: [
    { name: 'hyperliquidChain', type: 'string' },
    { name: 'destination', type: 'string' },
    { name: 'amount', type: 'string' },
    { name: 'time', type: 'uint64' },
  ],
  CreateSubAccount: [
    { name: 'hyperliquidChain', type: 'string' },
    { name: 'name', type: 'string' },
    { name: 'time', type: 'uint64' },
  ],
  SubAccountTransfer: [
    { name: 'hyperliquidChain', type: 'string' },
    { name: 'subAccountUser', type: 'string' },
    { name: 'isDeposit', type: 'bool' },
    { name: 'usd', type: 'uint64' },
    { name: 'time', type: 'uint64' },
  ],
  ApproveAgent: [
    { name: 'hyperliquidChain', type: 'string' },
    { name: 'agentAddress', type: 'address' },
    { name: 'agentName', type: 'string' },
    { name: 'nonce', type: 'uint64' },
  ],
};
