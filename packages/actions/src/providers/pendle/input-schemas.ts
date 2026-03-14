/**
 * Zod input validation schemas for Pendle Yield Provider actions.
 *
 * Phase 405: humanAmountIn/humanAmount alternatives for human-readable amounts.
 */
import { z } from 'zod';

/** Shared humanAmountIn + decimals fields for Pendle actions using amountIn. */
const humanAmountInFields = {
  humanAmountIn: z.string().min(1).optional()
    .describe('Human-readable amountIn (e.g., "1.5" for 1.5 tokens). Requires decimals field. Mutually exclusive with amountIn.'),
  decimals: z.number().int().min(0).max(24).optional()
    .describe('Token decimals for humanAmountIn conversion. Required when using humanAmountIn.'),
} as const;

/** Shared humanAmount + decimals fields for Pendle actions using amount. */
const humanAmountFields = {
  humanAmount: z.string().min(1).optional()
    .describe('Human-readable amount (e.g., "1.5" for 1.5 tokens). Requires decimals field. Mutually exclusive with amount.'),
  decimals: z.number().int().min(0).max(24).optional()
    .describe('Token decimals for humanAmount conversion. Required when using humanAmount.'),
} as const;

export const PendleBuyPTInputSchema = z.object({
  market: z.string().min(1, 'market address is required'),
  tokenIn: z.string().min(1, 'tokenIn address is required'),
  amountIn: z.string().min(1, 'amountIn is required (in smallest units)').describe('Amount in smallest units (wei). Example: "1000000000000000000" = 1 token with 18 decimals').optional(),
  ...humanAmountInFields,
  slippageBps: z.number().int().optional(),
});

export const PendleBuyYTInputSchema = z.object({
  market: z.string().min(1, 'market address is required'),
  tokenIn: z.string().min(1, 'tokenIn address is required'),
  amountIn: z.string().min(1, 'amountIn is required (in smallest units)').describe('Amount in smallest units (wei). Example: "1000000000000000000" = 1 token with 18 decimals').optional(),
  ...humanAmountInFields,
  slippageBps: z.number().int().optional(),
});

export const PendleRedeemPTInputSchema = z.object({
  market: z.string().min(1, 'market address is required'),
  amount: z.string().min(1, 'amount is required (in smallest units)').describe('Amount in smallest units (wei). Example: "1000000000000000000" = 1 token with 18 decimals').optional(),
  ...humanAmountFields,
  slippageBps: z.number().int().optional(),
});

export const PendleAddLiquidityInputSchema = z.object({
  market: z.string().min(1, 'market address is required'),
  tokenIn: z.string().min(1, 'tokenIn address is required'),
  amountIn: z.string().min(1, 'amountIn is required (in smallest units)').describe('Amount in smallest units (wei). Example: "1000000000000000000" = 1 token with 18 decimals').optional(),
  ...humanAmountInFields,
  slippageBps: z.number().int().optional(),
});

export const PendleRemoveLiquidityInputSchema = z.object({
  market: z.string().min(1, 'market address is required'),
  amount: z.string().min(1, 'amount is required (in smallest units)').describe('Amount in smallest units (wei). Example: "1000000000000000000" = 1 token with 18 decimals').optional(),
  ...humanAmountFields,
  slippageBps: z.number().int().optional(),
});
