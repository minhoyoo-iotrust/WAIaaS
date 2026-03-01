/**
 * Zod input validation schemas for Pendle Yield Provider actions.
 */
import { z } from 'zod';

export const PendleBuyPTInputSchema = z.object({
  market: z.string().min(1, 'market address is required'),
  tokenIn: z.string().min(1, 'tokenIn address is required'),
  amountIn: z.string().min(1, 'amountIn is required (in smallest units)'),
  slippageBps: z.number().int().optional(),
});

export const PendleBuyYTInputSchema = z.object({
  market: z.string().min(1, 'market address is required'),
  tokenIn: z.string().min(1, 'tokenIn address is required'),
  amountIn: z.string().min(1, 'amountIn is required (in smallest units)'),
  slippageBps: z.number().int().optional(),
});

export const PendleRedeemPTInputSchema = z.object({
  market: z.string().min(1, 'market address is required'),
  amount: z.string().min(1, 'amount is required (in smallest units)'),
  slippageBps: z.number().int().optional(),
});

export const PendleAddLiquidityInputSchema = z.object({
  market: z.string().min(1, 'market address is required'),
  tokenIn: z.string().min(1, 'tokenIn address is required'),
  amountIn: z.string().min(1, 'amountIn is required (in smallest units)'),
  slippageBps: z.number().int().optional(),
});

export const PendleRemoveLiquidityInputSchema = z.object({
  market: z.string().min(1, 'market address is required'),
  amount: z.string().min(1, 'amount is required (in smallest units)'),
  slippageBps: z.number().int().optional(),
});
