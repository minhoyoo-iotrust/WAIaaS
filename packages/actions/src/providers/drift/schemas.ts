/**
 * Zod SSoT input schemas for Drift Protocol V2 perpetual futures actions.
 *
 * Five schemas for the 5 perp actions: open_position, close_position,
 * modify_position, add_margin, withdraw_margin.
 * Size and amounts are always string (bigint-safe).
 * LIMIT orders require limitPrice via refinement.
 */
import { z } from 'zod';

// ---------------------------------------------------------------------------
// Open position input schema
// ---------------------------------------------------------------------------

/** Open a leveraged perpetual position (LONG or SHORT) on Drift V2. */
export const OpenPositionInputSchema = z
  .object({
    /** Market symbol (e.g., "SOL-PERP"). */
    market: z.string().min(1, 'market symbol required (e.g., "SOL-PERP")'),
    /** Position direction. */
    direction: z.enum(['LONG', 'SHORT']),
    /** Base asset amount as string (e.g., "100"). */
    size: z.string().min(1, 'base asset amount as string (e.g., "100")'),
    /** Desired leverage multiplier (1-100). Optional -- derived from margin if omitted. */
    leverage: z.number().min(1).max(100).optional(),
    /** Order type. */
    orderType: z.enum(['MARKET', 'LIMIT']),
    /** Limit price as string. Required when orderType is 'LIMIT'. */
    limitPrice: z.string().optional(),
  })
  .refine((d) => d.orderType !== 'LIMIT' || d.limitPrice !== undefined, {
    message: 'limitPrice is required for LIMIT orders',
    path: ['limitPrice'],
  });

// ---------------------------------------------------------------------------
// Close position input schema
// ---------------------------------------------------------------------------

/** Close a perpetual position (full or partial) on Drift V2. */
export const ClosePositionInputSchema = z.object({
  /** Market symbol (e.g., "SOL-PERP"). */
  market: z.string().min(1, 'market symbol required'),
  /** Partial close amount. Omit for full close. */
  size: z.string().optional(),
});

// ---------------------------------------------------------------------------
// Modify position input schema
// ---------------------------------------------------------------------------

/** Modify position size or pending order limit price on Drift V2. */
export const ModifyPositionInputSchema = z
  .object({
    /** Market symbol (e.g., "SOL-PERP"). */
    market: z.string().min(1, 'market symbol required'),
    /** New position size. */
    newSize: z.string().optional(),
    /** New limit price for pending order. */
    newLimitPrice: z.string().optional(),
  })
  .refine((d) => d.newSize !== undefined || d.newLimitPrice !== undefined, {
    message: 'At least one of newSize or newLimitPrice is required',
  });

// ---------------------------------------------------------------------------
// Add margin input schema
// ---------------------------------------------------------------------------

/** Deposit collateral to increase available margin on Drift V2. */
export const AddMarginInputSchema = z.object({
  /** Collateral amount as string (e.g., "100"). */
  amount: z.string().min(1, 'collateral amount required (e.g., "100")'),
  /** CAIP-19 asset identifier for collateral token. */
  asset: z.string().min(1, 'CAIP-19 asset identifier required'),
});

// ---------------------------------------------------------------------------
// Withdraw margin input schema
// ---------------------------------------------------------------------------

/** Withdraw excess collateral from Drift V2 margin account. */
export const WithdrawMarginInputSchema = z.object({
  /** Withdrawal amount as string. */
  amount: z.string().min(1, 'withdrawal amount required'),
  /** CAIP-19 asset identifier for collateral token. */
  asset: z.string().min(1, 'CAIP-19 asset identifier required'),
});
